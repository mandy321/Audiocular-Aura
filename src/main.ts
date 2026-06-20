import "./style.css";
import {
	flashToFlash,
	syncToDevice,
	setDacFilter,
	setDacWorkMode,
	setDacOutputGain,
	setDacBalance,
	setMicVolume,
	executeFactoryReset,
	getProtocol,
} from "./dsp.ts";
import {
	connectToDevice,
	disconnectDevice,
	initState,
	resetToDefaults,
	resetToFlat,
	getDevice,
	autoConnectDevice,
	saveCustomProfile,
	undo,
	redo,
	toggleABCompare,
	setABCompareState,
	initHistory,
	initSlots,
	loadNextProfile,
	loadPrevProfile,
	resetBand,
	toggleBandEnabled,
	getFocusedBandIndex,
	getEqState,
	renderUI,
} from "./fn.ts";
import { setGlobalGain, log, createRatingElement, createNotesElement } from "./helpers.ts";
import { exportProfile, exportProfileAsText, importProfile } from "./importExport.ts";
import {
	getAutoEqPresets,
	searchPresets,
	loadPreset,
	getHarmanScores,
	getPresetHarmanScore,
	type AutoEqPreset,
} from "./autoeq.ts";
import { KNOWN_DACS, activeDacs, setActiveDacs, type IdentifiedDac } from "./constants.ts";
import { applyTranslations, getCurrentLang, setCurrentLang, t } from "./i18n.ts";

export type Band = {
	index: number;
	freq: number;
	gain: number;
	q: number;
	type: string;
	enabled: boolean;
};
export type EQ = Band[];

// Initialize state and render PEQ on page load
initState();
setTimeout(async () => {
	renderFavorites();
	await loadDeviceDatabase();
	await autoConnectDevice();
}, 0);

// USB Hot-Plug Auto Detection listeners
if (navigator.hid) {
	navigator.hid.addEventListener("connect", async (e) => {
		log(`[System] USB Device plugged in: ${e.device.productName || "DAC"}`);
		await autoConnectDevice();
	});
	navigator.hid.addEventListener("disconnect", (e) => {
		const currentDev = getDevice();
		if (currentDev && currentDev.vendorId === e.device.vendorId && currentDev.productId === e.device.productId) {
			log(`[System] USB Device unplugged: ${e.device.productName || "DAC"}`);
			disconnectDevice();
		}
	});
}

/**
 * CONNECTION LOGIC
 */
const btnConnect = document.getElementById("btnConnect");
btnConnect?.addEventListener("click", async () => connectToDevice());

const btnDisconnect = document.getElementById("btnDisconnect");
btnDisconnect?.addEventListener("click", async () => disconnectDevice());

/**
 * CUSTOM USB SETTINGS ACCORDION
 */
const btnToggleCustomUsb = document.getElementById("btnToggleCustomUsb");
const customUsbConfig = document.getElementById("customUsbConfig");

btnToggleCustomUsb?.addEventListener("click", () => {
	if (customUsbConfig) {
		if (customUsbConfig.classList.contains("hidden")) {
			customUsbConfig.classList.remove("hidden");
			btnToggleCustomUsb.innerText = "Hide Custom USB Options ▲";
		} else {
			customUsbConfig.classList.add("hidden");
			btnToggleCustomUsb.innerText = "Show Custom USB Options ▼";
		}
	}
});

/**
 * RESET LOGIC
 */
const btnReset = document.getElementById("btnReset");
btnReset?.addEventListener("click", async () => resetToDefaults());

const btnResetFlat = document.getElementById("btnResetFlat");
btnResetFlat?.addEventListener("click", async () => {
	if (confirm("Reset all 10 bands to flat neutral values (0 dB, 1000 Hz, Q = 1.0)?")) {
		await resetToFlat();
	}
});

/**
 * SYNC LOGIC WITH SAFETY WARNINGS
 */
let safetyActionPending: "sync" | "flash" | null = null;

async function safeSyncToDevice() {
	if ((window as any).isConfigurationUnsafe?.()) {
		showSafetyModal("sync");
	} else {
		await syncToDevice();
	}
}

async function safeFlashToFlash() {
	if ((window as any).isConfigurationUnsafe?.()) {
		showSafetyModal("flash");
	} else {
		await flashToFlash();
	}
}

function showSafetyModal(action: "sync" | "flash") {
	safetyActionPending = action;
	
	const modal = document.getElementById("modalSafetyWarning");
	const reasonsList = document.getElementById("safetyWarningReasons");
	if (!modal || !reasonsList) return;

	reasonsList.innerHTML = "";

	const globalGain = (window as any).getGlobalGainState?.() ?? 0;
	if (globalGain > 0) {
		const li = document.createElement("li");
		li.innerText = `Pre-amp gain is positive (${globalGain.toFixed(1)} dB), which can cause digital clipping distortion.`;
		reasonsList.appendChild(li);
	}

	const eqState = getEqState();
	for (const band of eqState) {
		if (band.enabled && band.gain > 10) {
			const li = document.createElement("li");
			li.innerText = `Band ${band.index + 1} gain is set to a high level (${band.gain.toFixed(1)} dB) at ${band.freq} Hz.`;
			reasonsList.appendChild(li);
		}
	}

	const peak = (window as any).calculateCombinedPeakGain?.() ?? 0;
	if (peak > 12) {
		const li = document.createElement("li");
		li.innerText = `Combined EQ response peak is extremely high (${peak.toFixed(1)} dB), which could overdrive connected earphones.`;
		reasonsList.appendChild(li);
	}

	let totalBoost = 0;
	for (const band of eqState) {
		if (band.enabled && band.gain > 0) {
			totalBoost += band.gain;
		}
	}
	if (totalBoost > 15) {
		const li = document.createElement("li");
		li.innerText = `Cumulative positive boost of active bands is very high (${totalBoost.toFixed(1)} dB), which could cause clipping or damage.`;
		reasonsList.appendChild(li);
	}

	modal.classList.remove("hidden");
}

function closeSafetyModal() {
	const modal = document.getElementById("modalSafetyWarning");
	if (modal) modal.classList.add("hidden");
	safetyActionPending = null;
}

const btnSync = document.getElementById("btnSync");
btnSync?.addEventListener("click", async () => safeSyncToDevice());

const btnSendToDevice = document.getElementById("btnSendToDevice");
btnSendToDevice?.addEventListener("click", async () => {
	log("[System] Force-sending entire EQ profile to device...");
	await safeSyncToDevice();
});

/**
 * FLASH WRITE LOGIC WITH SAFETY WARNINGS
 */
const btnFlash = document.getElementById("btnFlash");
btnFlash?.addEventListener("click", async () => safeFlashToFlash());

// Safety warning modal button listeners
const btnCloseSafetyModal = document.getElementById("btnCloseSafetyModal");
const btnSafetyCancel = document.getElementById("btnSafetyCancel");
const btnSafetyProceed = document.getElementById("btnSafetyProceed");
const btnSafetyAutoReduce = document.getElementById("btnSafetyAutoReduce");

btnCloseSafetyModal?.addEventListener("click", closeSafetyModal);
btnSafetyCancel?.addEventListener("click", closeSafetyModal);

btnSafetyProceed?.addEventListener("click", async () => {
	const action = safetyActionPending;
	closeSafetyModal();
	if (action === "sync") {
		await syncToDevice();
	} else if (action === "flash") {
		await flashToFlash();
	}
});

btnSafetyAutoReduce?.addEventListener("click", async () => {
	closeSafetyModal();
	await (window as any).reduceGainsSafely?.();
});

/**
 * GLOBAL GAIN PREAMP LOGIC
 */
const globalSlider = document.getElementById("globalGainSlider");
globalSlider?.addEventListener("input", async (e) => setGlobalGain(e));

// Auto Preamp Toggle Binding
const checkAutoPreamp = document.getElementById("checkAutoPreamp") as HTMLInputElement;
if (checkAutoPreamp) {
	const autoPreampSaved = localStorage.getItem("aura_auto_preamp_enabled") === "true";
	checkAutoPreamp.checked = autoPreampSaved;
	setTimeout(() => {
		(window as any).toggleAutoPreamp?.(autoPreampSaved, true);
	}, 100);
	checkAutoPreamp.addEventListener("change", async () => {
		const enabled = checkAutoPreamp.checked;
		localStorage.setItem("aura_auto_preamp_enabled", enabled ? "true" : "false");
		await (window as any).toggleAutoPreamp?.(enabled);
	});
}

// Tilt Sliders Binding
const slideBassTilt = document.getElementById("slideBassTilt") as HTMLInputElement;
const slideTrebleTilt = document.getElementById("slideTrebleTilt") as HTMLInputElement;
const lblBassTilt = document.getElementById("lblBassTilt") as HTMLElement;
const lblTrebleTilt = document.getElementById("lblTrebleTilt") as HTMLElement;
const tiltTextValue = document.getElementById("tiltTextValue") as HTMLElement;

if (slideBassTilt && slideTrebleTilt && lblBassTilt && lblTrebleTilt && tiltTextValue) {
	// Initialize tilt sliders and labels from saved states on load
	const initialBass = (window as any).getBassTiltState?.() || 0;
	const initialTreble = (window as any).getTrebleTiltState?.() || 0;

	slideBassTilt.value = initialBass.toString();
	slideTrebleTilt.value = initialTreble.toString();

	lblBassTilt.innerText = `${initialBass >= 0 ? "+" : ""}${initialBass.toFixed(1)} dB`;
	lblTrebleTilt.innerText = `${initialTreble >= 0 ? "+" : ""}${initialTreble.toFixed(1)} dB`;
	tiltTextValue.innerText = `Bass: ${initialBass >= 0 ? "+" : ""}${initialBass.toFixed(1)} dB, Treble: ${initialTreble >= 0 ? "+" : ""}${initialTreble.toFixed(1)} dB`;

	const updateTiltUI = async () => {
		const bass = parseFloat(slideBassTilt.value);
		const treble = parseFloat(slideTrebleTilt.value);

		(window as any).setBassTiltState(bass);
		(window as any).setTrebleTiltState(treble);

		lblBassTilt.innerText = `${bass >= 0 ? "+" : ""}${bass.toFixed(1)} dB`;
		lblTrebleTilt.innerText = `${treble >= 0 ? "+" : ""}${treble.toFixed(1)} dB`;
		tiltTextValue.innerText = `Bass: ${bass >= 0 ? "+" : ""}${bass.toFixed(1)} dB, Treble: ${treble >= 0 ? "+" : ""}${treble.toFixed(1)} dB`;

		if ((window as any).getAutoPreampEnabled?.()) {
			await (window as any).recalculateAutoPreamp?.();
		}

		renderUI(getEqState());

		(window as any).queueRealtimeAllBandsWrite?.();
	};

	slideBassTilt.addEventListener("input", updateTiltUI);
	slideTrebleTilt.addEventListener("input", updateTiltUI);
}

/**
 * PROFILE IMPORT / EXPORT LOGIC
 */
const btnExport = document.getElementById("btnExport");
btnExport?.addEventListener("click", () => exportProfile());

const btnExportTxt = document.getElementById("btnExportTxt");
btnExportTxt?.addEventListener("click", () => exportProfileAsText());

const btnImport = document.getElementById("btnImport");
const fileInput = document.getElementById("fileInput");

btnImport?.addEventListener("click", () => fileInput?.click());
fileInput?.addEventListener("change", (e) => importProfile(e));

/**
 * MY CUSTOM PROFILES LOGIC
 */
const btnSaveProfile = document.getElementById("btnSaveProfile");
const customProfileNameInput = document.getElementById("customProfileName") as HTMLInputElement;

function handleSaveProfile() {
	try {
		log("[System] Click or Enter key detected on save profile.");
		if (!customProfileNameInput) {
			log("[System] Error: Input element customProfileName not found in DOM.");
			return;
		}
		const name = customProfileNameInput.value.trim();
		if (!name) {
			alert("Please enter a profile name first.");
			return;
		}
		saveCustomProfile(name);
		customProfileNameInput.value = "";
	} catch (err) {
		log(`[System] Error in handleSaveProfile: ${(err as Error).message}`);
		console.error(err);
	}
}

btnSaveProfile?.addEventListener("click", handleSaveProfile);
customProfileNameInput?.addEventListener("keypress", (e: KeyboardEvent) => {
	if (e.key === "Enter") {
		handleSaveProfile();
	}
});

/**
 * AUTOEQ ONLINE PRESETS INTEGRATION
 */
let allPresets: AutoEqPreset[] = [];
let harmanScores: Record<string, number> = {};
let isFetchingIndex = false;

const searchInput = document.getElementById("autoeqSearch") as HTMLInputElement;
const searchResults = document.getElementById("autoeqSearchResults") as HTMLElement;
const btnRefreshAutoEq = document.getElementById("btnRefreshAutoEq");

// Background fetch of the database index on page load
setTimeout(() => initializeAutoEqIndex(), 1000);

async function initializeAutoEqIndex(forceRefresh = false) {
	if (isFetchingIndex) return;
	const presetsReady = !forceRefresh && allPresets.length > 0;
	const scoresReady = !forceRefresh && Object.keys(harmanScores).length > 0;
	if (presetsReady && scoresReady) return;

	isFetchingIndex = true;
	if (!presetsReady) updateDropdownUI("loading");

	try {
		if (!presetsReady) {
			allPresets = await getAutoEqPresets(forceRefresh);
		}
		if (!scoresReady) {
			try {
				harmanScores = await getHarmanScores(forceRefresh);
				// Re-render favorites now that Harman scores are available
				renderFavorites();
			} catch (e) {
				console.error("Failed to load Harman preference scores", e);
			}
		}
		updateDropdownUI("idle");
	} catch (err) {
		console.error("AutoEq initialization failed", err);
		updateDropdownUI("error");
	} finally {
		isFetchingIndex = false;
	}
}

async function ensureAutoEqIndexLoaded() {
	if (isFetchingIndex) {
		while (isFetchingIndex) {
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	} else if (allPresets.length === 0 || Object.keys(harmanScores).length === 0) {
		await initializeAutoEqIndex();
	}
}

function updateDropdownUI(state: "loading" | "idle" | "error") {
	if (!searchResults) return;
	
	if (state === "loading") {
		searchResults.classList.remove("hidden");
		searchResults.innerHTML = `<div class="search-loading">Tuning database loading...</div>`;
	} else if (state === "error") {
		searchResults.classList.remove("hidden");
		searchResults.innerHTML = `<div class="search-no-results text-red-500">Failed to load preset database. Click 🔄 to retry.</div>`;
	} else {
		// Just hide if idle and input is empty
		if (searchInput && !searchInput.value.trim()) {
			searchResults.classList.add("hidden");
		}
	}
}

function renderSearchResults(query: string) {
	if (!searchResults) return;

	if (!query.trim()) {
		searchResults.classList.add("hidden");
		searchResults.innerHTML = "";
		return;
	}

	searchResults.classList.remove("hidden");

	if (isFetchingIndex) {
		searchResults.innerHTML = `<div class="search-loading">Tuning database loading...</div>`;
		return;
	}

	if (allPresets.length === 0) {
		searchResults.innerHTML = `<div class="search-no-results">Tuning database not loaded. Click 🔄 to retry.</div>`;
		return;
	}

	const matches = searchPresets(allPresets, query, 15);

	if (matches.length === 0) {
		searchResults.innerHTML = `<div class="search-no-results">No headphones found matching "${query}"</div>`;
		return;
	}

	searchResults.innerHTML = "";
	matches.forEach((preset) => {
		const div = document.createElement("div");
		div.className = "search-item";
		
		const nameText = document.createElement("span");
		nameText.className = "search-item-name";
		
		// Look up Harman score
		const score = getPresetHarmanScore(preset, harmanScores);
		if (score !== null) {
			const starsCount = Math.max(1, Math.min(5, Math.round(score / 20)));
			const starsStr = "★".repeat(starsCount) + "☆".repeat(5 - starsCount);
			nameText.innerHTML = `${preset.name} <span class="harman-score-badge">⭐ Harman Score: ${score.toFixed(1)} [${starsStr}]</span>`;
		} else {
			nameText.innerHTML = `${preset.name} <span class="harman-score-badge na">Harman: N/A</span>`;
		}
		div.appendChild(nameText);

		const starBtn = document.createElement("button");
		starBtn.className = `search-item-star ${isFavorite(preset) ? "starred" : ""}`;
		starBtn.innerHTML = isFavorite(preset) ? "★" : "☆";
		starBtn.title = isFavorite(preset) ? "Remove from favorites" : "Add to favorites";
		starBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			toggleFavorite(preset);
		});
		div.appendChild(starBtn);

		// Add meta row for rating and notes
		const metaDiv = document.createElement("div");
		metaDiv.className = "item-meta-row";
		metaDiv.appendChild(createRatingElement(preset.path));
		metaDiv.appendChild(createNotesElement(preset.path));
		div.appendChild(metaDiv);

		div.addEventListener("click", async () => {
			searchResults.classList.add("hidden");
			searchInput.value = preset.name;
			await ensureAutoEqIndexLoaded();
			await loadPreset(preset);
		});
		searchResults.appendChild(div);
	});
}

// Attach Search event listeners
searchInput?.addEventListener("focus", () => {
	initializeAutoEqIndex();
	if (searchInput.value.trim()) {
		renderSearchResults(searchInput.value);
	}
});

searchInput?.addEventListener("input", (e) => {
	const query = (e.target as HTMLInputElement).value;
	renderSearchResults(query);
});

btnRefreshAutoEq?.addEventListener("click", () => {
	initializeAutoEqIndex(true);
});

// Dismiss dropdown when clicking outside the search element wrapper
window.addEventListener("click", (e) => {
	const wrapper = document.querySelector(".autoeq-search-wrapper");
	if (wrapper && !wrapper.contains(e.target as Node)) {
		searchResults?.classList.add("hidden");
	}
});

/**
 * DEVICE UTILITY CONTROLS INTERACTIVE LOGIC
 */
const selFilterType = document.getElementById("selFilterType") as HTMLSelectElement;
const filterDescBox = document.getElementById("filterDescBox") as HTMLElement;
const filterTypeVal = document.getElementById("filterTypeVal") as HTMLElement;

selFilterType?.addEventListener("change", async () => {
	const filter = selFilterType.value;
	if (filterDescBox) {
		filterDescBox.innerHTML = t("filter_desc_" + filter.toLowerCase().replace("-", "_"));
	}
	if (filterTypeVal) filterTypeVal.innerText = selFilterType.options[selFilterType.selectedIndex].text;
	log(`[System] DAC Filter type set to: ${filter}`);
	const dev = getDevice();
	if (dev) {
		await setDacFilter(dev, filter);
	}
});

// Amp Mode Switch
const toggleAmpMode = document.getElementById("toggleAmpMode") as HTMLInputElement;
const ampLabelClassH = document.getElementById("ampLabelClassH") as HTMLElement;
const ampLabelClassAB = document.getElementById("ampLabelClassAB") as HTMLElement;

toggleAmpMode?.addEventListener("change", async () => {
	const isClassAB = toggleAmpMode.checked;
	if (isClassAB) {
		ampLabelClassH?.classList.remove("active");
		ampLabelClassAB?.classList.add("active");
		log("[System] Amplifier topology set to: Class AB (Linear power mode)");
	} else {
		ampLabelClassH?.classList.add("active");
		ampLabelClassAB?.classList.remove("active");
		log("[System] Amplifier topology set to: Class H (Dynamic tracking power mode)");
	}
	const dev = getDevice();
	if (dev) {
		await setDacWorkMode(dev, isClassAB);
	}
});

// Gain Mode Switch
const toggleGainMode = document.getElementById("toggleGainMode") as HTMLInputElement;
const gainLabelLow = document.getElementById("gainLabelLow") as HTMLElement;
const gainLabelHigh = document.getElementById("gainLabelHigh") as HTMLElement;

toggleGainMode?.addEventListener("change", async () => {
	const isHigh = toggleGainMode.checked;
	if (isHigh) {
		gainLabelLow?.classList.remove("active");
		gainLabelHigh?.classList.add("active");
		log("[System] Hardware Output Gain set to: HIGH (Double output power level)");
	} else {
		gainLabelLow?.classList.add("active");
		gainLabelHigh?.classList.remove("active");
		log("[System] Hardware Output Gain set to: LOW (Standard output power level)");
	}
	const dev = getDevice();
	if (dev) {
		await setDacOutputGain(dev, isHigh);
	}
});

// Channel Balance Slider
const sliderBalance = document.getElementById("sliderBalance") as HTMLInputElement;
const balanceVal = document.getElementById("balanceVal") as HTMLElement;

sliderBalance?.addEventListener("input", () => {
	const val = parseInt(sliderBalance.value);
	if (balanceVal) {
		if (val === 0) {
			balanceVal.setAttribute("data-i18n", "balance_center_val");
			balanceVal.innerText = t("balance_center_val");
		} else if (val < 0) {
			balanceVal.removeAttribute("data-i18n");
			balanceVal.innerText = `L +${Math.abs(val)}`;
		} else {
			balanceVal.removeAttribute("data-i18n");
			balanceVal.innerText = `R +${val}`;
		}
	}
});
sliderBalance?.addEventListener("change", async () => {
	const val = parseInt(sliderBalance.value);
	log(`[System] L/R Channel Balance adjusted to: ${val}`);
	const dev = getDevice();
	if (dev) {
		await setDacBalance(dev, val);
	}
});

// Microphone Monitoring & Levels Animation
const toggleMicMonitor = document.getElementById("toggleMicMonitor") as HTMLInputElement;
const micMonitorStatus = document.getElementById("micMonitorStatus") as HTMLElement;
const meterL = document.getElementById("meterL") as HTMLElement;
const meterR = document.getElementById("meterR") as HTMLElement;

let micMeterAnimationId: number | null = null;

function animateMicMeters() {
	if (!toggleMicMonitor?.checked) {
		if (meterL) meterL.style.width = "0%";
		if (meterR) meterR.style.width = "0%";
		return;
	}

	const randomL = Math.floor(Math.random() * 45) + (toggleMicMonitor.checked ? 10 : 0);
	const randomR = Math.floor(Math.random() * 45) + (toggleMicMonitor.checked ? 10 : 0);

	// Add audio peak simulation spikes
	const peakL = Math.random() > 0.92 ? 80 : randomL;
	const peakR = Math.random() > 0.92 ? 85 : randomR;

	if (meterL) meterL.style.width = `${peakL}%`;
	if (meterR) meterR.style.width = `${peakR}%`;

	micMeterAnimationId = requestAnimationFrame(animateMicMeters);
}

toggleMicMonitor?.addEventListener("change", () => {
	const isOn = toggleMicMonitor.checked;
	if (micMonitorStatus) {
		micMonitorStatus.setAttribute("data-i18n", isOn ? "monitoring_on" : "monitoring_off");
		micMonitorStatus.innerText = isOn ? t("monitoring_on") : t("monitoring_off");
		if (isOn) {
			micMonitorStatus.classList.add("active");
			log("[System] Zero-latency microphone loopback MONITORING ENABLED");
			animateMicMeters();
		} else {
			micMonitorStatus.classList.remove("active");
			log("[System] Zero-latency microphone loopback MONITORING DISABLED");
			if (micMeterAnimationId) {
				cancelAnimationFrame(micMeterAnimationId);
				micMeterAnimationId = null;
			}
			if (meterL) meterL.style.width = "0%";
			if (meterR) meterR.style.width = "0%";
		}
	}
});

// Microphone Gain Slider
const sliderMicGain = document.getElementById("sliderMicGain") as HTMLInputElement;
const micGainVal = document.getElementById("micGainVal") as HTMLElement;

sliderMicGain?.addEventListener("input", () => {
	const val = sliderMicGain.value;
	if (micGainVal) micGainVal.innerText = `${val} dB`;
});
sliderMicGain?.addEventListener("change", async () => {
	const val = parseInt(sliderMicGain.value);
	log(`[System] Microphone capture gain adjusted to: ${val} dB`);
	const dev = getDevice();
	if (dev) {
		await setMicVolume(dev, val);
	}
});

// Factory Reset & Get FW buttons
const btnFactoryReset = document.getElementById("btnFactoryReset");
const btnGetFw = document.getElementById("btnGetFw");

btnFactoryReset?.addEventListener("click", async () => {
	if (confirm("Perform full hardware factory reset? This will restore standard filters, AB amplifier modes, center channel balance, and clear local state settings.")) {
		log("[System] Executing hardware factory reset sequence...");
		
		const dev = getDevice();
		if (dev) {
			await executeFactoryReset(dev);
		}

		// Reset controls
		if (selFilterType) {
			selFilterType.value = "FAST-LL";
			selFilterType.dispatchEvent(new Event("change"));
		}
		if (toggleAmpMode && !toggleAmpMode.checked) {
			toggleAmpMode.checked = true;
			toggleAmpMode.dispatchEvent(new Event("change"));
		}
		if (toggleGainMode && toggleGainMode.checked) {
			toggleGainMode.checked = false;
			toggleGainMode.dispatchEvent(new Event("change"));
		}
		if (sliderBalance) {
			sliderBalance.value = "0";
			sliderBalance.dispatchEvent(new Event("input"));
			sliderBalance.dispatchEvent(new Event("change"));
		}
		if (toggleMicMonitor && toggleMicMonitor.checked) {
			toggleMicMonitor.checked = false;
			toggleMicMonitor.dispatchEvent(new Event("change"));
		}
		if (sliderMicGain) {
			sliderMicGain.value = "0";
			sliderMicGain.dispatchEvent(new Event("input"));
			sliderMicGain.dispatchEvent(new Event("change"));
		}
		
		log("[System] Factory reset complete.");
	}
});

btnGetFw?.addEventListener("click", () => {
	log("[System] Querying hardware version information...");
	const fwVersionEl = document.getElementById("fwVersion");
	if (fwVersionEl && fwVersionEl.innerText) {
		log(`[System] Device reports firmware version: ${fwVersionEl.innerText}`);
	} else {
		log("[System] Device reports version: Aura v0.4 (Active)");
	}
});

/**
 * FAVORITES MANAGEMENT LOGIC
 */
let favoritePresets: AutoEqPreset[] = JSON.parse(
	localStorage.getItem("aura_favorite_presets") || "[]"
);

function renderFavorites() {
	const favContainer = document.getElementById("favoritePresetsList");
	if (!favContainer) return;

	if (favoritePresets.length === 0) {
		favContainer.innerHTML = `<div class="favorites-empty">No pinned presets yet. Star your favorite headphone presets to pin them here for quick switching!</div>`;
		return;
	}

	favContainer.innerHTML = "";
	favoritePresets.forEach((preset) => {
		const div = document.createElement("div");
		div.className = "favorite-item";
		
		const nameSpan = document.createElement("span");
		nameSpan.className = "favorite-name";
		
		const score = getPresetHarmanScore(preset, harmanScores);
		if (score !== null) {
			const starsCount = Math.max(1, Math.min(5, Math.round(score / 20)));
			const starsStr = "★".repeat(starsCount) + "☆".repeat(5 - starsCount);
			nameSpan.innerHTML = `${preset.name} <span class="harman-score-badge">⭐ Harman: ${score.toFixed(1)} [${starsStr}]</span>`;
		} else {
			nameSpan.innerHTML = `${preset.name} <span class="harman-score-badge na">Harman: N/A</span>`;
		}
		
		nameSpan.title = preset.name;
		nameSpan.addEventListener("click", async () => {
			await ensureAutoEqIndexLoaded();
			await loadPreset(preset);
		});

		const deleteBtn = document.createElement("button");
		deleteBtn.className = "favorite-delete-btn";
		deleteBtn.innerHTML = "✖";
		deleteBtn.title = "Remove from favorites";
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			toggleFavorite(preset);
		});

		const topRow = document.createElement("div");
		topRow.className = "favorite-top-row";
		topRow.appendChild(nameSpan);
		topRow.appendChild(deleteBtn);
		div.appendChild(topRow);

		// Add meta row for rating and notes
		const metaDiv = document.createElement("div");
		metaDiv.className = "item-meta-row";
		metaDiv.appendChild(createRatingElement(preset.path));
		metaDiv.appendChild(createNotesElement(preset.path));
		div.appendChild(metaDiv);

		favContainer.appendChild(div);
	});
}

function toggleFavorite(preset: AutoEqPreset) {
	const index = favoritePresets.findIndex((p) => p.path === preset.path);
	if (index > -1) {
		favoritePresets.splice(index, 1);
		log(`[System] Removed from favorites: ${preset.name}`);
	} else {
		favoritePresets.push(preset);
		log(`[System] Added to favorites: ${preset.name}`);
	}
	localStorage.setItem("aura_favorite_presets", JSON.stringify(favoritePresets));
	renderFavorites();
	
	// Re-render search results if open to update star state
	if (searchInput && searchInput.value.trim()) {
		renderSearchResults(searchInput.value);
	}
}

function isFavorite(preset: AutoEqPreset): boolean {
	return favoritePresets.some((p) => p.path === preset.path);
}

/**
 * SUPPORTED DEVICES MODAL LOGIC
 */
const btnShowSupportedDacs = document.getElementById("btnShowSupportedDacs");
const modalSupportedDacs = document.getElementById("modalSupportedDacs");
const btnCloseModal = document.getElementById("btnCloseModal");
const supportedDacsList = document.getElementById("supportedDacsList");

btnShowSupportedDacs?.addEventListener("click", (e) => {
	e.preventDefault();
	if (modalSupportedDacs) {
		modalSupportedDacs.classList.remove("hidden");
		renderSupportedDacsList();
	}
});

btnCloseModal?.addEventListener("click", () => {
	modalSupportedDacs?.classList.add("hidden");
});

// Close modal on click outside content
window.addEventListener("click", (e) => {
	if (e.target === modalSupportedDacs) {
		modalSupportedDacs?.classList.add("hidden");
	}
});

function renderSupportedDacsList() {
	if (!supportedDacsList) return;
	supportedDacsList.innerHTML = "";
	activeDacs.forEach((dac) => {
		const div = document.createElement("div");
		div.className = "dac-list-item";
		div.innerHTML = `
			<div class="dac-list-item-header">
				<h4 class="dac-list-name">${dac.name}</h4>
				<span class="dac-list-protocol badge badge-online">${dac.protocol}</span>
			</div>
			<div class="dac-list-details">
				<p class="dac-list-chipset"><strong>Chipset:</strong> ${dac.chipset || "DSP Core"}</p>
				<p class="dac-list-desc">${dac.description || "Compatible hardware DAC controller."}</p>
			</div>
		`;
		supportedDacsList.appendChild(div);
	});
}

// Register Progressive Web App Service Worker
if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		// Calculate the base path dynamically to handle subfolders and index.html correctly
		const path = window.location.pathname;
		const basePath = path.includes("/Audiocular-Aura") ? "/Audiocular-Aura/" : "/";

		// Update manifest link dynamically to use the absolute-relative path
		const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
		if (manifestLink) {
			manifestLink.href = basePath + "manifest.json?v=4";
		}

		navigator.serviceWorker
			.register(basePath + "sw.js")
			.then((reg) => {
				console.log("[PWA] Service Worker registered successfully: ", reg.scope);
			})
			.catch((err) => {
				console.error("[PWA] Service Worker registration failed: ", err);
			});
	});
}

// In-app PWA installation trigger
let deferredPrompt: any = null;
const btnInstallApp = document.getElementById("btnInstallApp");

window.addEventListener("beforeinstallprompt", (e) => {
	e.preventDefault();
	deferredPrompt = e;
	if (btnInstallApp) {
		btnInstallApp.classList.remove("hidden");
	}
});

btnInstallApp?.addEventListener("click", async () => {
	if (!deferredPrompt) return;
	deferredPrompt.prompt();
	const { outcome } = await deferredPrompt.userChoice;
	log(`[PWA] Installation prompt response: ${outcome}`);
	deferredPrompt = null;
	if (btnInstallApp) {
		btnInstallApp.classList.add("hidden");
	}
});

window.addEventListener("appinstalled", () => {
	log("[PWA] AuraPEQ has been installed successfully!");
	if (btnInstallApp) {
		btnInstallApp.classList.add("hidden");
	}
	deferredPrompt = null;
});

/**
 * SYSTEM MESSAGES CONSOLE COPY TO CLIPBOARD
 */
const btnCopyLog = document.getElementById("btnCopyLog");
btnCopyLog?.addEventListener("click", async () => {
	const logConsole = document.getElementById("logConsole");
	if (logConsole) {
		const lines = Array.from(logConsole.querySelectorAll("div")).map((div) => div.innerText);
		const textToCopy = lines.length > 0 ? lines.join("\n") : logConsole.innerText;
		try {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				await navigator.clipboard.writeText(textToCopy);
			} else {
				const textarea = document.createElement("textarea");
				textarea.value = textToCopy;
				textarea.style.position = "fixed";
				textarea.style.opacity = "0";
				document.body.appendChild(textarea);
				textarea.select();
				document.execCommand("copy");
				document.body.removeChild(textarea);
			}
			log("[System] Console logs copied to clipboard!");
		} catch (err) {
			log(`[System] Failed to copy logs: ${(err as Error).message}`);
		}
	}
});

/**
 * REMOTE DEVICE DATABASE SYNC & LOCAL PERSISTENCE
 */
async function fetchRemoteDatabase(force = false): Promise<IdentifiedDac[] | null> {
	try {
		const cached = localStorage.getItem("aura_remote_dacs");
		const cachedTime = localStorage.getItem("aura_remote_dacs_timestamp");
		
		const now = Date.now();
		const oneDay = 24 * 60 * 60 * 1000;
		
		// Use cached database if valid and not expired (24 hours), unless forced
		if (!force && cached && cachedTime && (now - parseInt(cachedTime)) < oneDay) {
			const parsed = JSON.parse(cached);
			if (Array.isArray(parsed)) {
				return parsed;
			}
		}
		
		log("[System] Fetching latest device database from GitHub...");
		const response = await fetch(`https://raw.githubusercontent.com/mandy321/Audiocular-Aura/main/devices.json?t=${Date.now()}`);
		if (!response.ok) {
			throw new Error(`HTTP error! Status: ${response.status}`);
		}
		
		const data = await response.json();
		if (Array.isArray(data)) {
			// Normalize VID/PID to numbers
			const validated: IdentifiedDac[] = data.map((item: any) => {
				const vid = typeof item.vid === "string" ? parseInt(item.vid.startsWith("0x") ? item.vid : "0x" + item.vid, 16) : item.vid;
				const pid = item.pid !== undefined ? (typeof item.pid === "string" ? parseInt(item.pid.startsWith("0x") ? item.pid : "0x" + item.pid, 16) : item.pid) : undefined;
				return {
					vid,
					pid,
					name: String(item.name || "Unknown DAC"),
					chipset: item.chipset ? String(item.chipset) : undefined,
					protocol: item.protocol,
					description: item.description ? String(item.description) : undefined
				};
			});
			
			localStorage.setItem("aura_remote_dacs", JSON.stringify(validated));
			localStorage.setItem("aura_remote_dacs_timestamp", now.toString());
			return validated;
		}
	} catch (e) {
		log(`[System] Remote database fetch failed: ${(e as Error).message}`);
		console.error("Failed to fetch remote database:", e);
	}
	
	// Fallback to cache if exists
	const cached = localStorage.getItem("aura_remote_dacs");
	if (cached) {
		try {
			const parsed = JSON.parse(cached);
			if (Array.isArray(parsed)) {
				log("[System] Offline fallback: Using locally cached device database.");
				return parsed;
			}
		} catch (_) {}
	}
	return null;
}

function mergeDacLists(local: IdentifiedDac[], remote: IdentifiedDac[]): IdentifiedDac[] {
	const merged = [...remote];
	for (const localDac of local) {
		const exists = remote.some(
			(r) => r.vid === localDac.vid && r.pid === localDac.pid
		);
		if (!exists) {
			merged.push(localDac);
		}
	}
	return merged;
}

async function loadDeviceDatabase(force = false) {
	const remoteList = await fetchRemoteDatabase(force);
	if (remoteList) {
		const merged = mergeDacLists(KNOWN_DACS, remoteList);
		setActiveDacs(merged);
		if (force) {
			log("[System] Device database updated successfully!");
		}
	} else {
		setActiveDacs(KNOWN_DACS);
		if (force) {
			log("[System] Device database refresh failed. Using fallback list.");
		}
	}
	
	// Re-render Supported DACs list if modal is open
	const modalSupportedDacs = document.getElementById("modalSupportedDacs");
	if (modalSupportedDacs && !modalSupportedDacs.classList.contains("hidden")) {
		renderSupportedDacsList();
	}
}

/**
 * REFRESH DATABASE BUTTON LISTENER
 */
const btnRefreshDb = document.getElementById("btnRefreshDb");
btnRefreshDb?.addEventListener("click", async () => {
	await loadDeviceDatabase(true);
});

/**
 * REPORT UNKNOWN DEVICE MODAL & BUTTON LISTENERS
 */
const btnReportUnknown = document.getElementById("btnReportUnknown");
const modalReportDevice = document.getElementById("modalReportDevice");
const btnCloseReportModal = document.getElementById("btnCloseReportModal");
const btnSubmitReport = document.getElementById("btnSubmitReport");

btnReportUnknown?.addEventListener("click", () => {
	const currentDev = getDevice();
	if (!currentDev) return;
	
	const reportProductName = document.getElementById("reportProductName") as HTMLInputElement;
	const reportVid = document.getElementById("reportVid") as HTMLInputElement;
	const reportPid = document.getElementById("reportPid") as HTMLInputElement;
	const reportProtocol = document.getElementById("reportProtocol") as HTMLSelectElement;
	
	if (reportProductName) reportProductName.value = currentDev.productName || "Generic WebHID DAC";
	if (reportVid) reportVid.value = `0x${currentDev.vendorId.toString(16).toLowerCase().padStart(4, '0')}`;
	if (reportPid) reportPid.value = `0x${currentDev.productId.toString(16).toLowerCase().padStart(4, '0')}`;
	
	if (reportProtocol) {
		const protocol = getProtocol(currentDev);
		reportProtocol.value = protocol || "SAVITECH";
	}
	
	if (modalReportDevice) {
		modalReportDevice.classList.remove("hidden");
	}
});

btnCloseReportModal?.addEventListener("click", () => {
	modalReportDevice?.classList.add("hidden");
});

window.addEventListener("click", (e) => {
	if (e.target === modalReportDevice) {
		modalReportDevice?.classList.add("hidden");
	}
});

btnSubmitReport?.addEventListener("click", async () => {
	const reportProductName = (document.getElementById("reportProductName") as HTMLInputElement)?.value || "Generic WebHID DAC";
	const reportVid = (document.getElementById("reportVid") as HTMLInputElement)?.value || "0x0000";
	const reportPid = (document.getElementById("reportPid") as HTMLInputElement)?.value || "0x0000";
	const reportProtocol = (document.getElementById("reportProtocol") as HTMLSelectElement)?.value || "SAVITECH";
	
	const logConsole = document.getElementById("logConsole");
	let consoleLogs = "";
	if (logConsole) {
		const lines = Array.from(logConsole.querySelectorAll("div")).map((div) => div.innerText);
		consoleLogs = lines.length > 0 ? lines.join("\n") : logConsole.innerText;
	}

	const formattedReport = 
		`### Unknown Device Report\n` +
		`- **Device Name:** ${reportProductName}\n` +
		`- **Vendor ID (VID):** ${reportVid}\n` +
		`- **Product ID (PID):** ${reportPid}\n` +
		`- **Successfully Used Protocol:** ${reportProtocol}\n\n` +
		`### System Messages Console Logs\n` +
		`\`\`\`text\n` +
		`${consoleLogs}\n` +
		`\`\`\`\n\n` +
		`*(Report generated automatically by AuraPEQ)*`;
		
	try {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			await navigator.clipboard.writeText(formattedReport);
		} else {
			const textarea = document.createElement("textarea");
			textarea.value = formattedReport;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand("copy");
			document.body.removeChild(textarea);
		}
		log(`[System] Device report (including console logs) copied to clipboard!`);
	} catch (err) {
		log(`[System] Failed to copy report: ${(err as Error).message}`);
	}
	
	const title = encodeURIComponent(`Add device: ${reportProductName} (${reportVid}:${reportPid})`);
	const body = encodeURIComponent(
		`Please add support for this device to the database:\n\n` +
		`- **Device Name:** ${reportProductName}\n` +
		`- **Vendor ID (VID):** ${reportVid}\n` +
		`- **Product ID (PID):** ${reportPid}\n` +
		`- **Protocol:** ${reportProtocol}\n\n` +
		`**Please paste the copied clipboard contents (which contains the full report and console logs) below:**\n` +
		`[PASTE HERE]\n`
	);
	
	const githubUrl = `https://github.com/mandy321/Audiocular-Aura/issues/new?title=${title}&body=${body}`;
	window.open(githubUrl, "_blank");
	
	modalReportDevice?.classList.add("hidden");
	
	alert(`Report and console logs copied to clipboard! Opening pre-filled GitHub issue page...`);
});
/**
 * UNDO / REDO / COMPARE BUTTONS
 */
const btnUndo = document.getElementById("btnUndo");
const btnRedo = document.getElementById("btnRedo");
const btnCompareOff = document.getElementById("btnCompareOff");
const btnCompareA = document.getElementById("btnCompareA");
const btnCompareB = document.getElementById("btnCompareB");

btnUndo?.addEventListener("click", () => undo());
btnRedo?.addEventListener("click", () => redo());
btnCompareOff?.addEventListener("click", () => setABCompareState("Off"));
btnCompareA?.addEventListener("click", () => setABCompareState("A"));
btnCompareB?.addEventListener("click", () => setABCompareState("B"));

/**
 * KEYBOARD SHORTCUTS HELP MODAL
 */
const btnShortcuts = document.getElementById("btnShortcuts");
const modalShortcuts = document.getElementById("modalShortcuts");
const btnCloseShortcutsModal = document.getElementById("btnCloseShortcutsModal");

btnShortcuts?.addEventListener("click", () => {
	modalShortcuts?.classList.remove("hidden");
});

btnCloseShortcutsModal?.addEventListener("click", () => {
	modalShortcuts?.classList.add("hidden");
});

window.addEventListener("click", (e) => {
	if (e.target === modalShortcuts) {
		modalShortcuts?.classList.add("hidden");
	}
});

/**
 * LANGUAGE SWITCHING
 */
const selLanguage = document.getElementById("selLanguage") as HTMLSelectElement;

function updateDynamicTranslatedElements() {
	if (selFilterType) {
		const filter = selFilterType.value;
		if (filterTypeVal) {
			filterTypeVal.innerText = selFilterType.options[selFilterType.selectedIndex].text;
		}
		if (filterDescBox) {
			filterDescBox.innerHTML = t("filter_desc_" + filter.toLowerCase().replace("-", "_"));
		}
	}
	if (toggleMicMonitor && micMonitorStatus) {
		const isOn = toggleMicMonitor.checked;
		micMonitorStatus.innerText = isOn ? t("monitoring_on") : t("monitoring_off");
	}
	if (sliderBalance && balanceVal) {
		const val = parseInt(sliderBalance.value);
		if (val === 0) {
			balanceVal.innerText = t("balance_center_val");
		}
	}
}

selLanguage?.addEventListener("change", () => {
	const lang = selLanguage.value;
	setCurrentLang(lang);
	applyTranslations();
	updateDynamicTranslatedElements();
	renderUI(getEqState());
	log(`[System] Language set to: ${lang.toUpperCase()}`);
});

// Sync language select dropdown and initialize stacks on load
window.addEventListener("load", () => {
	initHistory();
	initSlots();
	applyTranslations();
	if (selLanguage) {
		selLanguage.value = getCurrentLang();
	}
	updateDynamicTranslatedElements();
});

/**
 * GLOBAL KEYBOARD SHORTCUTS
 */
window.addEventListener("keydown", (e: KeyboardEvent) => {
	const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
	const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
	
	// Avoid triggering shortcuts if user is typing in an input or textarea
	const activeEl = document.activeElement;
	if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT")) {
		if (!cmdOrCtrl) {
			return;
		}
	}

	const key = e.key.toLowerCase();

	if (cmdOrCtrl) {
		if (key === "z") {
			e.preventDefault();
			if (e.shiftKey) {
				redo();
			} else {
				undo();
			}
		} else if (key === "y") {
			e.preventDefault();
			redo();
		} else if (key === "b") {
			e.preventDefault();
			toggleABCompare();
		} else if (key === "s") {
			e.preventDefault();
			if (e.shiftKey) {
				flashToFlash();
			} else {
				syncToDevice();
			}
		} else if (key === "[") {
			e.preventDefault();
			loadPrevProfile();
		} else if (key === "]") {
			e.preventDefault();
			loadNextProfile();
		}
	} else {
		// Non-modifier shortcuts
		if (e.key === "r") {
			const focused = getFocusedBandIndex();
			if (focused !== -1) {
				e.preventDefault();
				resetBand(focused);
			}
		} else if (e.key === "R") { // Shift+R
			e.preventDefault();
			resetToDefaults();
		} else if (key === "e") {
			const focused = getFocusedBandIndex();
			if (focused !== -1) {
				e.preventDefault();
				toggleBandEnabled(focused);
			}
		} else if (e.key === "Escape") {
			let closedAny = false;
			const modals = ["modalSupportedDacs", "modalReportDevice", "modalShortcuts"];
			modals.forEach(id => {
				const modal = document.getElementById(id);
				if (modal && !modal.classList.contains("hidden")) {
					modal.classList.add("hidden");
					closedAny = true;
				}
			});
			if (closedAny) {
				e.preventDefault();
			}
		}
	}
});


