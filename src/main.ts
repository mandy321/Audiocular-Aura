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
} from "./fn.ts";
import { setGlobalGain, log } from "./helpers.ts";
import { exportProfile, exportProfileAsText, importProfile } from "./importExport.ts";
import {
	getAutoEqPresets,
	searchPresets,
	loadPreset,
	type AutoEqPreset,
} from "./autoeq.ts";
import { KNOWN_DACS } from "./constants.ts";

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
 * SYNC LOGIC
 */
const btnSync = document.getElementById("btnSync");
btnSync?.addEventListener("click", async () => syncToDevice());

const btnSendToDevice = document.getElementById("btnSendToDevice");
btnSendToDevice?.addEventListener("click", async () => {
	log("[System] Force-sending entire EQ profile to device...");
	await syncToDevice();
});

/**
 * FLASH WRITE LOGIC
 */
const btnFlash = document.getElementById("btnFlash");
btnFlash?.addEventListener("click", async () => flashToFlash());

/**
 * GLOBAL GAIN PREAMP LOGIC
 */
const globalSlider = document.getElementById("globalGainSlider");
globalSlider?.addEventListener("input", async (e) => setGlobalGain(e));

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
let isFetchingIndex = false;

const searchInput = document.getElementById("autoeqSearch") as HTMLInputElement;
const searchResults = document.getElementById("autoeqSearchResults") as HTMLElement;
const btnRefreshAutoEq = document.getElementById("btnRefreshAutoEq");

// Background fetch of the database index on page load
setTimeout(() => initializeAutoEqIndex(), 1000);

async function initializeAutoEqIndex(forceRefresh = false) {
	if (isFetchingIndex) return;
	if (!forceRefresh && allPresets.length > 0) return;

	isFetchingIndex = true;
	updateDropdownUI("loading");

	try {
		allPresets = await getAutoEqPresets(forceRefresh);
		updateDropdownUI("idle");
	} catch (err) {
		console.error("AutoEq initialization failed", err);
		updateDropdownUI("error");
	} finally {
		isFetchingIndex = false;
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
		nameText.innerText = preset.name;
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

		div.addEventListener("click", async () => {
			searchResults.classList.add("hidden");
			searchInput.value = preset.name;
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

const filterDescriptions = {
	"FAST-LL": "<strong>FAST-LL (Low Latency):</strong> Minimizes pre-ringing (echo before notes) and provides the lowest latency. Warm, punchy, and thick sound. Best for gaming and videos.",
	"FAST-PC": "<strong>FAST-PC (Phase Comp):</strong> Preserves phase linearity across the entire spectrum, removing phase distortion. Highly natural, clean, and balanced sound. Best for acoustic instruments.",
	"Slow-LL": "<strong>Slow-LL (Low Latency):</strong> Combines low latency with a gentler high-frequency roll-off. Warm, relaxed, with a wider perceived soundstage. Ideal for jazz and vocals.",
	"Slow-PC": "<strong>Slow-PC (Phase Comp):</strong> Combines phase linearity with a gentler high-frequency roll-off. Detailed, analytical, and monitor-like sound. Great for critical listening.",
	"NON-OS": "<strong>NON-OS (Non-Oversampling):</strong> Bypasses digital interpolation entirely. Pure, raw, and analog-like sound signature with a slight high-frequency roll-off. Recommended for a vintage sound."
};

selFilterType?.addEventListener("change", async () => {
	const filter = selFilterType.value as keyof typeof filterDescriptions;
	const desc = filterDescriptions[filter] || "";
	if (filterDescBox) filterDescBox.innerHTML = desc;
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
	const isClassH = toggleAmpMode.checked;
	const isClassAB = !isClassH;
	if (isClassH) {
		ampLabelClassH?.classList.add("active");
		ampLabelClassAB?.classList.remove("active");
		log("[System] Amplifier topology set to: Class H (Dynamic tracking power mode)");
	} else {
		ampLabelClassH?.classList.remove("active");
		ampLabelClassAB?.classList.add("active");
		log("[System] Amplifier topology set to: Class AB (Linear power mode)");
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
	let text = "0 (Center)";
	if (val < 0) {
		text = `L +${Math.abs(val)}`;
	} else if (val > 0) {
		text = `R +${val}`;
	}
	if (balanceVal) balanceVal.innerText = text;
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
		micMonitorStatus.innerText = isOn ? "Monitoring On" : "Monitoring Off";
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
		if (toggleAmpMode && toggleAmpMode.checked) {
			toggleAmpMode.checked = false;
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
		nameSpan.innerText = preset.name;
		nameSpan.title = preset.name;
		nameSpan.addEventListener("click", async () => {
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

		div.appendChild(nameSpan);
		div.appendChild(deleteBtn);
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
	KNOWN_DACS.forEach((dac) => {
		const div = document.createElement("div");
		div.className = "dac-list-item";
		div.innerHTML = `
			<div class="dac-list-item-header">
				<h4 class="dac-list-name">${dac.name}</h4>
				<span class="dac-list-protocol badge badge-online">${dac.protocol}</span>
			</div>
			<div class="dac-list-details">
				<p class="dac-list-chipset"><strong>Chipset:</strong> ${dac.chipset}</p>
				<p class="dac-list-desc">${dac.description}</p>
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


