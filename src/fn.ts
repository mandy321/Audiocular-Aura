import {
	DEFAULT_FREQS,
	DEFAULT_LABELS,
	VID_COMTRUE,
	VID_FIIO,
	VID_SAVITECH,
	VID_SAVITECH_ALT,
	VID_SAVITECH_OFFICIAL,
	VID_AUDIOCULAR,
	activeDacs,
} from "./constants.ts";
import { readDeviceParams, setupListener, syncToDevice, queueRealtimeBandWrite, getProtocol } from "./dsp.ts";
import { enableControls, log, updateGlobalGainUI, refreshStripUI, updateGlobalGain, configurePreampUI } from "./helpers.ts";
import type { Band, EQ } from "./main.ts";
import { renderPEQ, resizeCanvas } from "./peq.ts";
import { t } from "./i18n.ts";

/**
 * STATE
 */
let device: HIDDevice | null = null;
let globalGainState: number = 0;
let eqState: EQ = defaultEqState();
let lastAppliedEqName: string = localStorage.getItem("last_applied_eq") || "Flat Profile (Default)";

// Undo/Redo History Stacks
let undoStack: Array<{ eqState: EQ; globalGainState: number }> = [];
let redoStack: Array<{ eqState: EQ; globalGainState: number }> = [];
const MAX_HISTORY_DEPTH = 50;

// A/B Comparison States
let activeSlot: "A" | "B" = "A";
let slotA: { eqState: EQ; globalGainState: number } | null = null;
let slotB: { eqState: EQ; globalGainState: number } | null = null;

// Focused Band Index
let focusedBandIndex: number = -1;

export function getLastAppliedEqName() {
	return lastAppliedEqName;
}

export function setLastAppliedEqName(name: string) {
	lastAppliedEqName = name;
	localStorage.setItem("last_applied_eq", name);
	updateLastAppliedEqUI();
}

export function updateLastAppliedEqUI() {
	const lastEqEl = document.getElementById("lastAppliedEqDisplay");
	if (lastEqEl) {
		lastEqEl.innerText = lastAppliedEqName;
	}
}

export function identifyConnectedDac(dev: HIDDevice) {
	const match = activeDacs.find(
		(d) =>
			d.vid === dev.vendorId &&
			(d.pid === undefined || d.pid === dev.productId)
	);

	const badgeContainer = document.getElementById("dacBadgeContainer");
	const badgeName = document.getElementById("dacBadgeName");
	const badgeChipset = document.getElementById("dacBadgeChipset");
	const badgeDesc = document.getElementById("dacBadgeDesc");
	const reportUnknownContainer = document.getElementById("reportUnknownContainer");

	if (match) {
		log(`[System] DAC Identified: ${match.name} (${match.chipset || "DSP Core"}) using ${match.protocol} protocol`);
		if (badgeContainer) badgeContainer.classList.remove("hidden");
		if (badgeName) badgeName.innerText = match.name;
		if (badgeChipset) badgeChipset.innerText = `Chipset: ${match.chipset || "DSP Core"} | Protocol: ${match.protocol}`;
		if (badgeDesc) badgeDesc.innerText = match.description || "Compatible hardware DAC controller.";
		if (reportUnknownContainer) reportUnknownContainer.classList.add("hidden");
	} else {
		if (reportUnknownContainer) reportUnknownContainer.classList.remove("hidden");
		
		// Fallback by Vendor ID alone
		const fallbackMatch = activeDacs.find((d) => d.vid === dev.vendorId);
		if (fallbackMatch) {
			log(`[System] DAC Compatible Match: Generic ${fallbackMatch.name} device`);
			if (badgeContainer) badgeContainer.classList.remove("hidden");
			if (badgeName) badgeName.innerText = `${dev.productName || "Compatible Device"}`;
			if (badgeChipset) badgeChipset.innerText = `Chipset: ${fallbackMatch.chipset || "DSP Core"} (Detected via VID) | Protocol: ${fallbackMatch.protocol}`;
			if (badgeDesc) badgeDesc.innerText = fallbackMatch.description || "Compatible hardware DAC controller.";
		} else {
			if (badgeContainer) badgeContainer.classList.remove("hidden");
			if (badgeName) badgeName.innerText = dev.productName || "Generic WebHID DAC";
			if (badgeChipset) badgeChipset.innerText = `VID: 0x${dev.vendorId.toString(16).toUpperCase()} | PID: 0x${dev.productId.toString(16).toUpperCase()}`;
			if (badgeDesc) badgeDesc.innerText = "Generic audio controller. Using standard Savitech compatibility mode.";
		}
	}

	// Update device info details
	const isMoondrop = dev.vendorId === VID_COMTRUE;
	const isJa11 = dev.vendorId === VID_FIIO && dev.productId === 258;
	const isSavitech = dev.vendorId === VID_SAVITECH || dev.vendorId === VID_SAVITECH_ALT || dev.vendorId === VID_SAVITECH_OFFICIAL || dev.vendorId === VID_AUDIOCULAR;
	const sampleRateStr = (isSavitech || isMoondrop || isJa11) ? "96 kHz" : "48 kHz";
	
	const infoSampleRate = document.getElementById("infoSampleRate");
	if (infoSampleRate) infoSampleRate.innerText = sampleRateStr;
	
	const infoFirmware = document.getElementById("infoFirmware");
	if (infoFirmware) infoFirmware.innerText = "Active";

	const infoVid = document.getElementById("infoVid");
	if (infoVid) infoVid.innerText = `0x${dev.vendorId.toString(16).toUpperCase().padStart(4, '0')}`;
	
	const infoPid = document.getElementById("infoPid");
	if (infoPid) infoPid.innerText = `0x${dev.productId.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * INITIALIZATION
 */
export function initState() {
	renderUI(eqState);
	resizeCanvas();
	updateLastAppliedEqUI();
	loadCustomProfilesFromStorage();
	renderCustomProfiles();
	configurePreampUI(globalGainState);
	
	// Pre-fill Custom USB options from localStorage
	try {
		const stored = localStorage.getItem("customUsbOverride");
		if (stored) {
			const parsed = JSON.parse(stored);
			const customVidEl = document.getElementById("customVid") as HTMLInputElement;
			const customPidEl = document.getElementById("customPid") as HTMLInputElement;
			const customProtocolEl = document.getElementById("customProtocol") as HTMLSelectElement;
			if (customVidEl && parsed.vid) customVidEl.value = parsed.vid;
			if (customPidEl && parsed.pid) customPidEl.value = parsed.pid;
			if (customProtocolEl && parsed.protocol) customProtocolEl.value = parsed.protocol;
		}
	} catch (e) {
		console.error("Failed to parse customUsbOverride from localStorage", e);
	}
}

/**
 * Update global gain state and refresh UI
 * @param gain The new gain value (in dB)
 */
export function setGlobalGain(gain: number) {
	globalGainState = gain;
	updateGlobalGainUI(gain);
}

export function getDevice() {
	return device;
}

export function getEqState() {
	return eqState;
}

export function setEqState(eq: EQ) {
	eqState = eq;
}

export function setEQ(
	index: number,
	key: keyof Band,
	value: number | boolean | string,
) {
	// @ts-expect-error - Dynamic key assignment
	eqState[index][key] = value;
}

export function initHistory() {
	undoStack = [];
	redoStack = [];
	pushHistory();
}

export function pushHistory() {
	const snapshot = {
		eqState: JSON.parse(JSON.stringify(eqState)) as EQ,
		globalGainState: globalGainState
	};

	// Check if this snapshot is identical to the last one on the stack
	if (undoStack.length > 0) {
		const last = undoStack[undoStack.length - 1];
		if (JSON.stringify(last.eqState) === JSON.stringify(snapshot.eqState) && last.globalGainState === snapshot.globalGainState) {
			return; // Avoid duplicating state
		}
	}

	undoStack.push(snapshot);
	if (undoStack.length > MAX_HISTORY_DEPTH) {
		undoStack.shift();
	}
	redoStack = []; // Clear redo stack on new action
	updateUndoRedoButtons();
}

// Expose pushHistory on window for external triggers (e.g. peq visualizer drag ends)
(window as any).pushHistory = pushHistory;

export async function undo() {
	if (undoStack.length <= 1) return; // Keep the initial baseline state

	const current = undoStack.pop()!;
	redoStack.push(current);

	const previous = undoStack[undoStack.length - 1];
	eqState = JSON.parse(JSON.stringify(previous.eqState)) as EQ;
	globalGainState = previous.globalGainState;

	renderUI(eqState);
	updateGlobalGainUI(globalGainState);
	
	if (device) {
		await syncToDevice();
	}
	updateUndoRedoButtons();
}

export async function redo() {
	if (redoStack.length === 0) return;

	const next = redoStack.pop()!;
	undoStack.push(next);

	eqState = JSON.parse(JSON.stringify(next.eqState)) as EQ;
	globalGainState = next.globalGainState;

	renderUI(eqState);
	updateGlobalGainUI(globalGainState);

	if (device) {
		await syncToDevice();
	}
	updateUndoRedoButtons();
}

export function updateUndoRedoButtons() {
	const btnUndo = document.getElementById("btnUndo") as HTMLButtonElement;
	const btnRedo = document.getElementById("btnRedo") as HTMLButtonElement;

	if (btnUndo) {
		btnUndo.disabled = undoStack.length <= 1;
	}
	if (btnRedo) {
		btnRedo.disabled = redoStack.length === 0;
	}
}

export function initSlots() {
	slotA = null;
	slotB = null;
	activeSlot = "A";
	updateSlotLabel();
}

export async function toggleABCompare() {
	const current = {
		eqState: JSON.parse(JSON.stringify(eqState)) as EQ,
		globalGainState: globalGainState
	};

	// Lazy initialization on first compare toggle: A = current, B = flat
	if (!slotA && !slotB) {
		slotA = JSON.parse(JSON.stringify(current));
		slotB = {
			eqState: defaultEqState(),
			globalGainState: 0
		};
		activeSlot = "B";
		
		eqState = JSON.parse(JSON.stringify(slotB.eqState)) as EQ;
		globalGainState = slotB.globalGainState;
	} else {
		// Save current state before toggle
		if (activeSlot === "A") {
			slotA = current;
			activeSlot = "B";
			eqState = JSON.parse(JSON.stringify(slotB!.eqState)) as EQ;
			globalGainState = slotB!.globalGainState;
		} else {
			slotB = current;
			activeSlot = "A";
			eqState = JSON.parse(JSON.stringify(slotA!.eqState)) as EQ;
			globalGainState = slotA!.globalGainState;
		}
	}

	renderUI(eqState);
	updateGlobalGainUI(globalGainState);

	if (device) {
		await syncToDevice();
	}
	updateSlotLabel();
}

function updateSlotLabel() {
	const abStateLabel = document.getElementById("abStateLabel");
	if (abStateLabel) {
		abStateLabel.innerText = activeSlot;
	}
	const btnABCompare = document.getElementById("btnABCompare");
	if (btnABCompare) {
		if (activeSlot === "B") {
			btnABCompare.classList.add("active");
		} else {
			btnABCompare.classList.remove("active");
		}
	}
}

export function getFocusedBandIndex() {
	return focusedBandIndex;
}

export function setFocusedBand(index: number) {
	if (focusedBandIndex === index) return;
	focusedBandIndex = index;

	const strips = document.querySelectorAll(".eq-strip");
	strips.forEach((strip, i) => {
		if (i === index) {
			strip.classList.add("focused");
		} else {
			strip.classList.remove("focused");
		}
	});
}

export function resetBand(index: number) {
	if (index < 0 || index >= eqState.length) return;
	eqState[index].freq = DEFAULT_FREQS[index] || 1000;
	eqState[index].gain = 0;
	eqState[index].q = 0.75;
	eqState[index].type = "PK";
	eqState[index].enabled = true;

	renderUI(eqState);
	if (device) {
		queueRealtimeBandWrite(device, eqState[index]);
	}
	pushHistory();
}

export function toggleBandEnabled(index: number) {
	if (index < 0 || index >= eqState.length) return;
	eqState[index].enabled = !eqState[index].enabled;

	renderUI(eqState);
	if (device) {
		queueRealtimeBandWrite(device, eqState[index]);
	}
	pushHistory();
}

export function loadNextProfile() {
	if (customProfiles.length === 0) return;
	let index = -1;
	if (lastAppliedEqName.startsWith("Profile: ")) {
		const name = lastAppliedEqName.replace("Profile: ", "");
		index = customProfiles.findIndex(p => p.name === name);
	}
	let nextIndex = (index + 1) % customProfiles.length;
	loadCustomProfile(customProfiles[nextIndex].name);
}

export function loadPrevProfile() {
	if (customProfiles.length === 0) return;
	let index = -1;
	if (lastAppliedEqName.startsWith("Profile: ")) {
		const name = lastAppliedEqName.replace("Profile: ", "");
		index = customProfiles.findIndex(p => p.name === name);
	}
	let prevIndex = index - 1;
	if (prevIndex < 0) prevIndex = customProfiles.length - 1;
	loadCustomProfile(customProfiles[prevIndex].name);
}

export function getGlobalGainState() {
	return globalGainState;
}

export function setGlobalGainState(gainState: number) {
	globalGainState = gainState;
}

/**
 * Generate default flat 10-band EQ state
 */
export function defaultEqState(): EQ {
	return DEFAULT_FREQS.map((freq, i) => ({
		index: i,
		freq: freq,
		gain: 0,
		q: 0.75, // Default Q
		type: "PK",
		enabled: true,
	})) as EQ;
}

/**
 * Trigger UI updates and EQ graph re-render
 */
export function renderUI(eqState: EQ) {
	// 1. Render the PEQ Canvas Visualizer Graph
	const visualizerContainer = document.querySelector(".canvas-wrapper-full");
	if (visualizerContainer) {
		renderPEQ(visualizerContainer as HTMLElement, eqState, (index, key, value) => {
			updateState(index, key, value);
		});
	}

	// Update PEQ slots count
	const activeSlots = eqState.filter(b => b.enabled && b.gain !== 0).length;
	const infoSlots = document.getElementById("infoSlots");
	if (infoSlots) infoSlots.innerText = `${activeSlots} / ${eqState.length}`;

	// 2. Render or Sync the EQ Strips side-by-side
	const stripsContainer = document.getElementById("eqStrips");
	if (stripsContainer) {
		if (stripsContainer.children.length === 0) {
			// Save scroll position before full DOM rebuild to prevent page jump
			const savedScrollY = window.scrollY;

			stripsContainer.innerHTML = "";
			eqState.forEach((band, i) => {
				const div = document.createElement("div");
				div.className = `eq-strip ${band.enabled ? "" : "bypassed"} ${i === focusedBandIndex ? "focused" : ""}`;
				div.addEventListener("click", () => {
					setFocusedBand(i);
				});
				div.addEventListener("focusin", () => {
					setFocusedBand(i);
				});
				div.innerHTML = `
					<div class="strip-header">
						<h3 class="strip-title">${t("band") || "BAND"} ${i + 1}</h3>
						<span class="strip-label">${DEFAULT_LABELS[i]}</span>
					</div>
					
					<label class="switch">
						<input type="checkbox" id="check-enabled-${i}" ${band.enabled ? "checked" : ""} onchange="window.updateState(${i}, 'enabled', this.checked); window.pushHistory()">
						<span class="slider"></span>
					</label>

					<div class="slider-container">
						<span class="slider-label">${t("band_gain") || "Gain (dB)"}</span>
						<input type="range" orient="vertical" min="-12" max="12" step="0.5" value="${band.gain}" 
							oninput="window.updateState(${i}, 'gain', this.value)" onchange="window.pushHistory()" ${device ? "" : "disabled"} class="vertical-slider">
						<div class="gain-input-wrapper">
							<input type="number" value="${band.gain}" step="0.5" min="-12" max="12"
								onchange="window.updateState(${i}, 'gain', this.value); window.pushHistory()" id="num-gain-${i}" ${device ? "" : "disabled"} class="strip-input font-mono" size="6">
						</div>
					</div>

					<div class="strip-field">
						<label class="strip-field-label">${t("band_freq") || "Freq (Hz)"}</label>
						<input type="number" value="${band.freq}" min="20" max="20000" step="1"
							onchange="window.updateState(${i}, 'freq', this.value); window.pushHistory()" id="num-freq-${i}" ${device ? "" : "disabled"} class="strip-input font-mono" size="6">
					</div>

					<div class="strip-field">
						<label class="strip-field-label">${t("band_q") || "Q Factor"}</label>
						<input type="number" value="${band.q}" min="0.1" max="10" step="0.05"
							onchange="window.updateState(${i}, 'q', this.value); window.pushHistory()" id="num-q-${i}" ${device ? "" : "disabled"} class="strip-input font-mono" size="6">
					</div>

					<div class="strip-field">
						<label class="strip-field-label">${t("band_type") || "Type"}</label>
						<select onchange="window.updateState(${i}, 'type', this.value); window.pushHistory()" id="sel-type-${i}" ${device ? "" : "disabled"} class="strip-select">
							<option value="PK" ${band.type === "PK" ? "selected" : ""}>${t("band_type_peak") || "Peak"}</option>
							<option value="LSQ" ${band.type === "LSQ" ? "selected" : ""}>${t("band_type_low") || "Low Shelf"}</option>
							<option value="HSQ" ${band.type === "HSQ" ? "selected" : ""}>${t("band_type_high") || "High Shelf"}</option>
						</select>
					</div>
				`;
				stripsContainer.appendChild(div);
			});

			// Restore scroll position after DOM rebuild
			window.scrollTo({ top: savedScrollY, behavior: "instant" });
		} else {
			// Update the values in the existing elements
			eqState.forEach((_, i) => {
				refreshStripUI(eqState, i);
			});
		}
	}
}


/**
 * Connect to audio DAC via WebHID
 */
export async function connectToDevice() {
	try {
		// Build filters dynamically from activeDacs database to include all supported VIDs
		const vendorIds = new Set<number>([
			VID_AUDIOCULAR,
			VID_SAVITECH_OFFICIAL,
			VID_SAVITECH,
			VID_SAVITECH_ALT,
			VID_COMTRUE,
			VID_FIIO
		]);
		
		activeDacs.forEach(dac => {
			vendorIds.add(dac.vid);
		});

		const filters: any[] = Array.from(vendorIds).map(vid => ({ vendorId: vid }));

		// Check for custom VID/PID overrides in the UI
		const customVidEl = document.getElementById("customVid") as HTMLInputElement;
		const customPidEl = document.getElementById("customPid") as HTMLInputElement;
		
		if (customVidEl && customVidEl.value.trim() !== "") {
			const rawVid = customVidEl.value.trim();
			const vid = parseInt(rawVid.startsWith("0x") ? rawVid : "0x" + rawVid, 16);
			
			if (!isNaN(vid)) {
				const customFilter: any = { vendorId: vid };
				
				if (customPidEl && customPidEl.value.trim() !== "") {
					const rawPid = customPidEl.value.trim();
					const pid = parseInt(rawPid.startsWith("0x") ? rawPid : "0x" + rawPid, 16);
					if (!isNaN(pid)) {
						customFilter.productId = pid;
					}
				}
				
				// Place custom filter at the front
				filters.unshift(customFilter);
				log(`Attempting connection with custom filter: VID 0x${vid.toString(16).toUpperCase()}${customFilter.productId ? `, PID 0x${customFilter.productId.toString(16).toUpperCase()}` : ""}`);
			} else {
				log("Warning: Invalid Hex Vendor ID entered. Falling back to default list.");
			}
		}

		log("Opening connection window. Please select your audio DAC...");
		const devices = await navigator.hid.requestDevice({ filters });
		
		if (devices.length === 0) {
			log("Connection cancelled: No device selected.");
			return;
		}

		const dev = devices[0];
		device = dev;
		await dev.open();

		// Log connection VID/PID immediately
		const vidStr = dev.vendorId.toString(16).toLowerCase();
		const pidStr = dev.productId.toString(16).toLowerCase();
		const isKnown = activeDacs.some(
			(d) => d.vid === dev.vendorId && (d.pid === undefined || d.pid === dev.productId)
		);
		const unknownSuffix = isKnown ? "" : " [Unknown device]";
		log(`[System] Connected: ${dev.productName || "Unknown DAC"} (VID: 0x${vidStr}, PID: 0x${pidStr})${unknownSuffix}`);

		// Persist Custom USB Options if they were used
		let usedCustom = false;
		let customVidValue = "";
		let customPidValue = "";
		let customProtocolValue = "";
		if (customVidEl && customVidEl.value.trim() !== "") {
			const rawVid = customVidEl.value.trim();
			const vid = parseInt(rawVid.startsWith("0x") ? rawVid : "0x" + rawVid, 16);
			if (!isNaN(vid) && dev.vendorId === vid) {
				usedCustom = true;
				customVidValue = customVidEl.value.trim();
				customPidValue = customPidEl ? customPidEl.value.trim() : "";
				const customProtocolEl = document.getElementById("customProtocol") as HTMLSelectElement;
				customProtocolValue = customProtocolEl ? customProtocolEl.value : "SAVITECH";
			}
		}

		if (usedCustom) {
			localStorage.setItem("customUsbOverride", JSON.stringify({
				vid: customVidValue,
				pid: customPidValue,
				protocol: customProtocolValue
			}));
			log(`[System] Saved custom USB override: VID=${customVidValue}, PID=${customPidValue}, Protocol=${customProtocolValue}`);
		}

		// Adjust bands for device
		adjustBandsForDevice(dev);

		// Identify DAC automatically
		identifyConnectedDac(dev);

		// Update UI elements for connection state
		const statusBadge = document.getElementById("statusBadge");
		if (statusBadge) {
			statusBadge.innerText = "ONLINE";
			statusBadge.classList.remove("badge-offline");
			statusBadge.classList.add("badge-online");
		}
		
		const btnConnect = document.getElementById("btnConnect");
		if (btnConnect) btnConnect.style.display = "none";
		
		const disconnectSection = document.getElementById("disconnectSection");
		if (disconnectSection) disconnectSection.style.display = "flex";

		enableControls(true);
		configurePreampUI(globalGainState);

		setupListener(device);

		// Support parameter reading for Savitech-based DACs (including FiiO JA11 and Moondrop)
		const protocol = getProtocol(device);
		if (protocol === "SAVITECH" || protocol === "FIIO_JA11" || protocol === "MOONDROP") {
			await readDeviceParams(device);
		} else {
			log("Note: Parameter reading is only supported for Savitech, FiiO JA11, and Moondrop devices. Starting with a flat profile.");
			renderUI(eqState);
		}
	} catch (err) {
		log(`Connection Error: ${(err as Error).message}`);
	}
}

/**
 * Disconnect current device
 */
export async function disconnectDevice() {
	if (!device) return;
	try {
		log(`Disconnecting from: ${device.productName || "DAC"}`);
		await device.close();
		device = null;
		
		adjustBandsForDevice(null);

		const badgeContainer = document.getElementById("dacBadgeContainer");
		if (badgeContainer) badgeContainer.classList.add("hidden");

		const statusBadge = document.getElementById("statusBadge");
		if (statusBadge) {
			statusBadge.innerText = "OFFLINE";
			statusBadge.classList.remove("badge-online");
			statusBadge.classList.add("badge-offline");
		}
		
		const btnConnect = document.getElementById("btnConnect");
		if (btnConnect) btnConnect.style.display = "inline-block";
		
		const disconnectSection = document.getElementById("disconnectSection");
		if (disconnectSection) disconnectSection.style.display = "none";

		const versionEl = document.getElementById("fwVersion");
		if (versionEl) versionEl.innerText = "";

		enableControls(false);
		configurePreampUI(globalGainState);
		renderUI(eqState);
		log("Disconnected.");
	} catch (err) {
		log(`Disconnection Error: ${(err as Error).message}`);
	}
}

/**
 * Reset all bands and gain to flat values and sync
 */
export async function resetToDefaults() {
	if (
		!confirm(
			"Reset all bands to flat Defaults (0dB, Q=0.75) and optimal frequencies?",
		)
	)
		return;

	log("Resetting to factory defaults...");

	if (device && getProtocol(device) === "FIIO_JA11") {
		eqState = [
			{ index: 0, freq: 100, gain: 0, q: 0.7, type: "PK", enabled: true },
			{ index: 1, freq: 500, gain: 0, q: 0.7, type: "PK", enabled: true },
			{ index: 2, freq: 1000, gain: 0, q: 0.7, type: "PK", enabled: true },
			{ index: 3, freq: 2500, gain: 0, q: 0.7, type: "PK", enabled: true },
			{ index: 4, freq: 10000, gain: 0, q: 0.7, type: "PK", enabled: true },
		] as EQ;
	} else {
		eqState = defaultEqState();
	}
	
	const stripsContainer = document.getElementById("eqStrips");
	if (stripsContainer) {
		stripsContainer.innerHTML = "";
	}

	setGlobalGain(0);
	renderUI(eqState);

	setLastAppliedEqName("Flat Profile (Default)");

	await syncToDevice();
	log("Defaults applied and synced.");
	pushHistory();
}

/**
 * Reset all bands and gain to a flat neutral state (0dB, Freq=1000Hz, Q=1.0) and sync
 */
export async function resetToFlat() {
	log("[System] Resetting all bands to flat neutral values...");

	eqState = eqState.map((_, i) => ({
		index: i,
		freq: 1000,
		gain: 0,
		q: 1.0,
		type: "PK",
		enabled: true,
	})) as EQ;

	setGlobalGain(0);
	renderUI(eqState);

	setLastAppliedEqName("Flat Profile (Neutral)");

	if (device) {
		await syncToDevice();
	}
	log("Flat neutral profile applied and synced.");
	pushHistory();
}

/**
 * Update band properties from user inputs
 */
export function updateState(
	index: number,
	key: string,
	value: string | number | boolean,
) {
	if (key === "freq" || key === "gain" || key === "q")
		value = parseFloat(value as string);
	else if (key === "enabled") value = Boolean(value);

	setEQ(index, key as keyof Band, value);
	renderUI(eqState);

	setLastAppliedEqName("Custom Profile (Tweaked)");

	if (device) {
		queueRealtimeBandWrite(device, eqState[index]);
	}
}

// Expose handlers for window scope trigger events
(window as any).updateState = updateState;

/**
 * Scan for previously authorized WebHID devices and connect automatically
 */
export async function autoConnectDevice() {
	if (!navigator.hid) return;
	try {
		const devices = await navigator.hid.getDevices();
		if (devices.length === 0) return;

		const dev = devices[0];
		device = dev;
		await dev.open();

		// Log connection VID/PID immediately
		const vidStr = dev.vendorId.toString(16).toLowerCase();
		const pidStr = dev.productId.toString(16).toLowerCase();
		const isKnown = activeDacs.some(
			(d) => d.vid === dev.vendorId && (d.pid === undefined || d.pid === dev.productId)
		);
		const unknownSuffix = isKnown ? "" : " [Unknown device]";
		log(`[System] Connected: ${dev.productName || "Unknown DAC"} (VID: 0x${vidStr}, PID: 0x${pidStr})${unknownSuffix}`);
		
		adjustBandsForDevice(dev);
		identifyConnectedDac(dev);

		const statusBadge = document.getElementById("statusBadge");
		if (statusBadge) {
			statusBadge.innerText = "ONLINE";
			statusBadge.classList.remove("badge-offline");
			statusBadge.classList.add("badge-online");
		}

		const btnConnect = document.getElementById("btnConnect");
		if (btnConnect) btnConnect.style.display = "none";

		const disconnectSection = document.getElementById("disconnectSection");
		if (disconnectSection) disconnectSection.style.display = "flex";

		enableControls(true);
		configurePreampUI(globalGainState);
		setupListener(dev);

		const protocol = getProtocol(dev);
		if (protocol === "SAVITECH" || protocol === "FIIO_JA11" || protocol === "MOONDROP") {
			await readDeviceParams(dev);
		} else {
			renderUI(eqState);
		}
	} catch (err) {
		log(`[System] Auto-connect failed: ${(err as Error).message}`);
	}
}

/**
 * Adjust active EQ bands configuration based on connected device type
 */
export function adjustBandsForDevice(dev: HIDDevice | null) {
	const stripsContainer = document.getElementById("eqStrips");
	if (!dev) {
		if (stripsContainer) {
			stripsContainer.innerHTML = "";
			stripsContainer.style.removeProperty("--bands-count");
			stripsContainer.style.removeProperty("--bands-count-tablet");
			stripsContainer.style.removeProperty("--bands-count-mobile");
		}
		return;
	}

	const protocol = getProtocol(dev);
	if (protocol === "FIIO_JA11") {
		if (eqState.length !== 5) {
			eqState = [
				{ index: 0, freq: 100, gain: 0, q: 0.7, type: "PK", enabled: true },
				{ index: 1, freq: 500, gain: 0, q: 0.7, type: "PK", enabled: true },
				{ index: 2, freq: 1000, gain: 0, q: 0.7, type: "PK", enabled: true },
				{ index: 3, freq: 2500, gain: 0, q: 0.7, type: "PK", enabled: true },
				{ index: 4, freq: 10000, gain: 0, q: 0.7, type: "PK", enabled: true },
			] as EQ;
		}
		if (stripsContainer) {
			stripsContainer.innerHTML = "";
			stripsContainer.style.setProperty("--bands-count", "5");
			stripsContainer.style.setProperty("--bands-count-tablet", "5");
			stripsContainer.style.setProperty("--bands-count-mobile", "2");
		}
	} else {
		if (eqState.length !== 10) {
			eqState = defaultEqState();
		}
		if (stripsContainer) {
			stripsContainer.innerHTML = "";
			stripsContainer.style.removeProperty("--bands-count");
			stripsContainer.style.removeProperty("--bands-count-tablet");
			stripsContainer.style.removeProperty("--bands-count-mobile");
		}
	}
}

/**
 * CUSTOM PROFILES PERSISTENT STORAGE MANAGEMENT
 */
export interface CustomProfile {
	name: string;
	globalGain: number;
	bands: EQ;
}

let customProfiles: CustomProfile[] = [];

export function loadCustomProfilesFromStorage() {
	try {
		const stored = localStorage.getItem("aura_custom_profiles");
		if (stored) {
			const parsed = JSON.parse(stored);
			if (Array.isArray(parsed)) {
				customProfiles = parsed;
			} else {
				log("[System] Warning: Stored custom profiles was not an array. Initializing empty.");
				customProfiles = [];
			}
		} else {
			customProfiles = [];
		}
	} catch (e) {
		console.error("Failed to parse custom profiles from storage", e);
		log(`[System] Error loading custom profiles: ${(e as Error).message}`);
		customProfiles = [];
	}
}

export function saveCustomProfile(name: string) {
	try {
		log(`[System] Saving custom profile: "${name}"...`);
		name = name.trim();
		if (!name) {
			alert("Please enter a profile name first.");
			return;
		}

		if (!Array.isArray(customProfiles)) {
			log("[System] Warning: customProfiles state was not an array. Resetting.");
			customProfiles = [];
		}

		const existingIndex = customProfiles.findIndex(
			(p) => p.name.toLowerCase() === name.toLowerCase()
		);

		if (existingIndex > -1) {
			const confirmOverwrite = confirm(
				`A custom profile named "${name}" already exists. Do you want to overwrite it?`
			);
			if (!confirmOverwrite) {
				log("[System] Profile save cancelled by user.");
				return;
			}
		}

		const profile: CustomProfile = {
			name,
			globalGain: globalGainState,
			bands: JSON.parse(JSON.stringify(eqState)),
		};

		if (existingIndex > -1) {
			customProfiles[existingIndex] = profile;
		} else {
			customProfiles.push(profile);
		}

		localStorage.setItem("aura_custom_profiles", JSON.stringify(customProfiles));
		renderCustomProfiles();
		log(`[System] Custom profile saved: ${name}`);
	} catch (err) {
		log(`[System] Error saving custom profile: ${(err as Error).message}`);
		console.error(err);
	}
}

export function deleteCustomProfile(name: string) {
	const confirmDelete = confirm(`Are you sure you want to delete "${name}"?`);
	if (!confirmDelete) return;

	customProfiles = customProfiles.filter((p) => p.name !== name);
	localStorage.setItem("aura_custom_profiles", JSON.stringify(customProfiles));
	renderCustomProfiles();
	log(`[System] Custom profile deleted: ${name}`);
}

export async function loadCustomProfile(name: string) {
	const profile = customProfiles.find((p) => p.name === name);
	if (!profile) return;

	log(`[System] Loading custom profile: ${profile.name}...`);

	let importedBands = JSON.parse(JSON.stringify(profile.bands)) as EQ;
	const currentBandsCount = eqState.length;

	if (importedBands.length > currentBandsCount) {
		log(`Note: Profile has ${importedBands.length} bands but current device only supports ${currentBandsCount} bands. Keeping the first ${currentBandsCount} bands.`);
		importedBands = importedBands.slice(0, currentBandsCount);
	} else if (importedBands.length < currentBandsCount) {
		importedBands = [
			...importedBands,
			...JSON.parse(JSON.stringify(eqState.slice(importedBands.length)))
		];
	}

	// Normalize indices
	importedBands.forEach((band, idx) => {
		band.index = idx;
	});

	// Re-create DOM elements for strips
	const stripsContainer = document.getElementById("eqStrips");
	if (stripsContainer) {
		stripsContainer.innerHTML = "";
	}

	eqState = importedBands;
	globalGainState = profile.globalGain;

	// Update UI and send preamp packet
	await updateGlobalGain(profile.globalGain);
	renderUI(eqState);

	setLastAppliedEqName(`Profile: ${profile.name}`);

	if (device) {
		log(`Syncing profile to DAC...`);
		await syncToDevice();
		log(`Synced: ${profile.name}`);
	} else {
		log("Profile loaded successfully. Connect DAC and click SYNC to apply.");
	}
	pushHistory();
}

export function renderCustomProfiles() {
	const container = document.getElementById("customProfilesList");
	if (!container) return;

	if (customProfiles.length === 0) {
		container.innerHTML = `<div class="custom-profiles-empty">No custom profiles saved yet. Enter a name above and click SAVE to store current settings!</div>`;
		return;
	}

	container.innerHTML = "";
	customProfiles.forEach((profile) => {
		const div = document.createElement("div");
		div.className = "custom-profile-item";

		const nameSpan = document.createElement("span");
		nameSpan.className = "custom-profile-name";
		nameSpan.innerText = profile.name;
		nameSpan.title = `Global Gain: ${profile.globalGain} dB\nClick to load profile`;
		nameSpan.addEventListener("click", async () => {
			await loadCustomProfile(profile.name);
		});

		const deleteBtn = document.createElement("button");
		deleteBtn.className = "custom-profile-delete-btn";
		deleteBtn.innerHTML = "✖";
		deleteBtn.title = "Delete custom profile";
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			deleteCustomProfile(profile.name);
		});

		div.appendChild(nameSpan);
		div.appendChild(deleteBtn);
		container.appendChild(div);
	});
}


