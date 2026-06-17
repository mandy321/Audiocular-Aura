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
import { readDeviceParams, setupListener, syncToDevice, queueRealtimeBandWrite, getProtocol, getActiveProtocol } from "./dsp.ts";
import { enableControls, log, updateGlobalGainUI, refreshStripUI, updateGlobalGain, configurePreampUI, createRatingElement, createNotesElement } from "./helpers.ts";
import type { Band, EQ } from "./main.ts";
import { renderPEQ, resizeCanvas } from "./peq.ts";
import { t } from "./i18n.ts";

/**
 * STATE
 */
let device: HIDDevice | null = null;

// Retrieve persisted active EQ configuration
const savedEq = localStorage.getItem("aura_active_eq_state");
const savedGain = localStorage.getItem("aura_active_preamp_gain");
const savedBassTilt = localStorage.getItem("aura_active_bass_tilt");
const savedTrebleTilt = localStorage.getItem("aura_active_treble_tilt");
const savedAutoPreamp = localStorage.getItem("aura_auto_preamp_enabled");
const savedManualPreamp = localStorage.getItem("aura_active_manual_preamp");

let globalGainState: number = savedGain !== null ? Number(savedGain) : 0;
let eqState: EQ = savedEq ? JSON.parse(savedEq) : defaultEqState();
let lastAppliedEqName: string = localStorage.getItem("last_applied_eq") || "Flat Profile (Default)";

let bassTiltState: number = savedBassTilt !== null ? Number(savedBassTilt) : 0;
let trebleTiltState: number = savedTrebleTilt !== null ? Number(savedTrebleTilt) : 0;
let autoPreampEnabled: boolean = savedAutoPreamp === "true";
let manualPreampState: number = savedManualPreamp !== null ? Number(savedManualPreamp) : 0;

// Undo/Redo History Stacks
let undoStack: Array<{ eqState: EQ; globalGainState: number }> = [];
let redoStack: Array<{ eqState: EQ; globalGainState: number }> = [];
const MAX_HISTORY_DEPTH = 50;

// A/B Comparison States
let activeSlot: "A" | "B" = "A";
let slotA: { eqState: EQ; globalGainState: number; eqName: string } | null = null;
let slotB: { eqState: EQ; globalGainState: number; eqName: string } | null = null;

export function isCompareActive(): boolean {
	return slotA !== null && slotB !== null;
}

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
		let displayName = lastAppliedEqName;
		if (displayName === "Flat Profile (Default)") {
			displayName = t("flat_profile_default") || "Flat Profile (Default)";
		} else if (displayName === "Flat Profile (Neutral)") {
			displayName = t("flat_profile_neutral") || "Flat Profile (Neutral)";
		}

		if (slotA && slotB) {
			lastEqEl.innerText = `${displayName} (Slot ${activeSlot})`;
		} else {
			lastEqEl.innerText = displayName;
		}
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
	if (device) {
		localStorage.setItem(`last_preamp_gain_${device.vendorId}_${device.productId}`, gain.toString());
	}
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
	setGlobalGain(previous.globalGainState);

	renderUI(eqState);
	
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
	setGlobalGain(next.globalGainState);

	renderUI(eqState);

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
		slotA = {
			eqState: JSON.parse(JSON.stringify(current.eqState)) as EQ,
			globalGainState: current.globalGainState,
			eqName: lastAppliedEqName
		};
		slotB = {
			eqState: defaultEqState(),
			globalGainState: 0,
			eqName: t("flat_profile_default") || "Flat Profile (Default)"
		};
		activeSlot = "B";
		
		eqState = JSON.parse(JSON.stringify(slotB.eqState)) as EQ;
		globalGainState = slotB.globalGainState;
		lastAppliedEqName = slotB.eqName;
	} else {
		// Save current state before toggle
		if (activeSlot === "A") {
			slotA = {
				eqState: current.eqState,
				globalGainState: current.globalGainState,
				eqName: lastAppliedEqName
			};
			activeSlot = "B";
			eqState = JSON.parse(JSON.stringify(slotB!.eqState)) as EQ;
			globalGainState = slotB!.globalGainState;
			lastAppliedEqName = slotB!.eqName;
		} else {
			slotB = {
				eqState: current.eqState,
				globalGainState: current.globalGainState,
				eqName: lastAppliedEqName
			};
			activeSlot = "A";
			eqState = JSON.parse(JSON.stringify(slotA!.eqState)) as EQ;
			globalGainState = slotA!.globalGainState;
			lastAppliedEqName = slotA!.eqName;
		}
	}

	renderUI(eqState);
	setGlobalGain(globalGainState);

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
	updateLastAppliedEqUI();
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
	if (device) {
		localStorage.setItem(`last_preamp_gain_${device.vendorId}_${device.productId}`, gainState.toString());
	}
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
	// Save current active state to localStorage
	localStorage.setItem("aura_active_eq_state", JSON.stringify(eqState));
	localStorage.setItem("aura_active_preamp_gain", globalGainState.toString());
	localStorage.setItem("aura_active_bass_tilt", bassTiltState.toString());
	localStorage.setItem("aura_active_treble_tilt", trebleTiltState.toString());
	localStorage.setItem("aura_active_manual_preamp", manualPreampState.toString());

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
							<option value="NOTCH" ${band.type === "NOTCH" ? "selected" : ""}>${t("band_type_notch") || "Notch"}</option>
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
		(window as any).device = dev;
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
		(window as any).device = null;
		
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

	resetTiltState();

	if (autoPreampEnabled) {
		manualPreampState = 0;
		await recalculateAutoPreamp();
	} else {
		setGlobalGain(0);
	}
	renderUI(eqState);

	setLastAppliedEqName("Flat Profile (Default)");
	initSlots();

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

	resetTiltState();

	if (autoPreampEnabled) {
		manualPreampState = 0;
		await recalculateAutoPreamp();
	} else {
		setGlobalGain(0);
	}
	renderUI(eqState);

	setLastAppliedEqName("Flat Profile (Neutral)");
	initSlots();

	if (device) {
		await syncToDevice();
	}
	log("Flat neutral profile applied and synced.");
	pushHistory();
}

/**
 * Update band properties from user inputs
 */
export async function updateState(
	index: number,
	key: string,
	value: string | number | boolean,
) {
	if (key === "freq" || key === "gain" || key === "q")
		value = parseFloat(value as string);
	else if (key === "enabled") value = Boolean(value);

	setEQ(index, key as keyof Band, value);

	if (key === "type" && value === "NOTCH") {
		setEQ(index, "q", 4.0);
		if (eqState[index].gain >= 0) {
			setEQ(index, "gain", -6.0);
		}
	}

	if (autoPreampEnabled) {
		await recalculateAutoPreamp();
	}

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
		(window as any).device = dev;
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
	resetTiltState();
	if (autoPreampEnabled) {
		manualPreampState = profile.globalGain;
		await recalculateAutoPreamp();
	} else {
		globalGainState = profile.globalGain;
		await updateGlobalGain(profile.globalGain);
	}
	renderUI(eqState);

	setLastAppliedEqName(`Profile: ${profile.name}`);
	if (!isCompareActive()) {
		initSlots();
	}

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

		const topRow = document.createElement("div");
		topRow.className = "custom-profile-top-row";
		topRow.appendChild(nameSpan);
		topRow.appendChild(deleteBtn);
		div.appendChild(topRow);

		// Add meta row for rating and notes
		const metaDiv = document.createElement("div");
		metaDiv.className = "custom-profile-meta";
		metaDiv.appendChild(createRatingElement(`custom_${profile.name}`));
		metaDiv.appendChild(createNotesElement(`custom_${profile.name}`));
		div.appendChild(metaDiv);

		container.appendChild(div);
	});
}

export function getBassTiltState() { return bassTiltState; }
export function setBassTiltState(val: number) { bassTiltState = val; }
export function getTrebleTiltState() { return trebleTiltState; }
export function setTrebleTiltState(val: number) { trebleTiltState = val; }
export function getAutoPreampEnabled() { return autoPreampEnabled; }
export function setAutoPreampEnabled(val: boolean) { autoPreampEnabled = val; }
export function getManualPreampState() { return manualPreampState; }
export function setManualPreampState(val: number) { manualPreampState = val; }

function getBiquadGainAtFreq(
	type: string,
	filterFreq: number,
	filterGain: number,
	filterQ: number,
	targetFreq: number,
	sampleRate: number
): number {
	if (filterGain === 0) return 0;

	const w0 = (2 * Math.PI * filterFreq) / sampleRate;
	const alpha = Math.sin(w0) / (2 * filterQ);
	const A = 10 ** (filterGain / 40);
	const cosw = Math.cos(w0);

	let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

	if (type === "LSQ") {
		const sa = 2 * Math.sqrt(A) * alpha;
		b0 = A * (A + 1 - (A - 1) * cosw + sa);
		b1 = 2 * A * (A - 1 - (A + 1) * cosw);
		b2 = A * (A + 1 - (A - 1) * cosw - sa);
		a0 = A + 1 + (A - 1) * cosw + sa;
		a1 = -2 * (A - 1 + (A + 1) * cosw);
		a2 = A + 1 + (A - 1) * cosw - sa;
	} else if (type === "HSQ") {
		const sb = 2 * Math.sqrt(A) * alpha;
		b0 = A * (A + 1 + (A - 1) * cosw + sb);
		b1 = -2 * A * (A - 1 + (A + 1) * cosw);
		b2 = A * (A + 1 + (A - 1) * cosw - sb);
		a0 = A + 1 - (A - 1) * cosw + sb;
		a1 = 2 * (A - 1 - (A + 1) * cosw);
		a2 = A + 1 - (A - 1) * cosw - sb;
	} else {
		return 0;
	}

	const b0_n = b0 / a0;
	const b1_n = b1 / a0;
	const b2_n = b2 / a0;
	const a1_n = a1 / a0;
	const a2_n = a2 / a0;

	const w = (2 * Math.PI * targetFreq) / sampleRate;
	const cosw_t = Math.cos(w);
	const sinw_t = Math.sin(w);
	const cos2w_t = Math.cos(2 * w);
	const sin2w_t = Math.sin(2 * w);

	const num_r = b0_n + b1_n * cosw_t + b2_n * cos2w_t;
	const num_i = -(b1_n * sinw_t + b2_n * sin2w_t);
	const den_r = 1 + a1_n * cosw_t + a2_n * cos2w_t;
	const den_i = -(a1_n * sinw_t + a2_n * sin2w_t);

	const num_mag2 = num_r * num_r + num_i * num_i;
	const den_mag2 = den_r * den_r + den_i * den_i;

	if (den_mag2 <= 0) return 0;
	const mag = Math.sqrt(num_mag2 / den_mag2);
	return 20 * Math.log10(mag);
}

export function getTiltGainAtFreq(freq: number): number {
	const sampleRate = 48000;
	const bassGain = getBiquadGainAtFreq("LSQ", 105, bassTiltState, 0.707, freq, sampleRate);
	const trebleGain = getBiquadGainAtFreq("HSQ", 8000, trebleTiltState, 0.707, freq, sampleRate);
	return bassGain + trebleGain;
}

export function getMagnitudeAtFreq(freq: number): number {
	const sampleRate = 48000;
	let totalDb = 0;

	for (const band of eqState) {
		if (!band.enabled) continue;
		
		const w0 = (2 * Math.PI * band.freq) / sampleRate;
		const alpha = Math.sin(w0) / (2 * band.q);
		const A = 10 ** (band.gain / 40);
		const cosw = Math.cos(w0);

		let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

		switch (band.type) {
			case "NOTCH":
				b0 = 1;
				b1 = -2 * cosw;
				b2 = 1;
				a0 = 1 + alpha;
				a1 = -2 * cosw;
				a2 = 1 - alpha;
				break;
			case "PK":
				b0 = 1 + alpha * A;
				b1 = -2 * cosw;
				b2 = 1 - alpha * A;
				a0 = 1 + alpha / A;
				a1 = -2 * cosw;
				a2 = 1 - alpha / A;
				break;
			case "LSQ": {
				const sa = 2 * Math.sqrt(A) * alpha;
				b0 = A * (A + 1 - (A - 1) * cosw + sa);
				b1 = 2 * A * (A - 1 - (A + 1) * cosw);
				b2 = A * (A + 1 - (A - 1) * cosw - sa);
				a0 = A + 1 + (A - 1) * cosw + sa;
				a1 = -2 * (A - 1 + (A + 1) * cosw);
				a2 = A + 1 + (A - 1) * cosw - sa;
				break;
			}
			case "HSQ": {
				const sb = 2 * Math.sqrt(A) * alpha;
				b0 = A * (A + 1 + (A - 1) * cosw + sb);
				b1 = -2 * A * (A - 1 + (A + 1) * cosw);
				b2 = A * (A + 1 + (A - 1) * cosw - sb);
				a0 = A + 1 - (A - 1) * cosw + sb;
				a1 = 2 * (A - 1 - (A + 1) * cosw);
				a2 = A + 1 - (A - 1) * cosw - sb;
				break;
			}
		}

		const b0_n = b0 / a0;
		const b1_n = b1 / a0;
		const b2_n = b2 / a0;
		const a1_n = a1 / a0;
		const a2_n = a2 / a0;

		const w = (2 * Math.PI * freq) / sampleRate;
		const cos1 = Math.cos(w);
		const cos2 = Math.cos(2 * w);
		const sin1 = Math.sin(w);
		const sin2 = Math.sin(2 * w);

		const numRe = b0_n + b1_n * cos1 + b2_n * cos2;
		const numIm = -(b1_n * sin1 + b2_n * sin2);
		const denRe = 1 + a1_n * cos1 + a2_n * cos2;
		const denIm = -(a1_n * sin1 + a2_n * sin2);

		const magSq = (numRe * numRe + numIm * numIm) / (denRe * denRe + denIm * denIm);
		if (magSq > 0) {
			totalDb += 10 * Math.log10(magSq);
		}
	}

	totalDb += getTiltGainAtFreq(freq);
	return totalDb;
}

export function calculateCombinedPeakGain(): number {
	let maxGain = -Infinity;
	const minFreq = 20;
	const maxFreq = 20000;
	const numPoints = 200;

	for (let i = 0; i < numPoints; i++) {
		const freq = minFreq * (maxFreq / minFreq) ** (i / (numPoints - 1));
		const gain = getMagnitudeAtFreq(freq);
		if (gain > maxGain) {
			maxGain = gain;
		}
	}
	return maxGain;
}

export async function recalculateAutoPreamp(skipWrite = false) {
	if (!autoPreampEnabled) return;
	const protocol = getActiveProtocol();
	let peak = calculateCombinedPeakGain();
	let targetPreamp = 0;
	if (peak > 0) {
		targetPreamp = -peak;
	}
	
	if (protocol === "SAVITECH") {
		targetPreamp = Math.round(targetPreamp);
	} else {
		targetPreamp = Math.round(targetPreamp * 10) / 10;
	}

	targetPreamp = Math.max(-20, Math.min(0, targetPreamp));

	globalGainState = targetPreamp;
	await updateGlobalGain(globalGainState, skipWrite);
}

export async function toggleAutoPreamp(enabled: boolean, skipWrite = false) {
	autoPreampEnabled = enabled;
	localStorage.setItem("aura_auto_preamp_enabled", enabled ? "true" : "false");
	if (autoPreampEnabled) {
		manualPreampState = globalGainState;
		localStorage.setItem("aura_active_manual_preamp", manualPreampState.toString());
		const globalGainSlider = document.getElementById("globalGainSlider") as HTMLInputElement;
		if (globalGainSlider) globalGainSlider.disabled = true;
		await recalculateAutoPreamp(skipWrite);
	} else {
		const globalGainSlider = document.getElementById("globalGainSlider") as HTMLInputElement;
		if (globalGainSlider && device) {
			globalGainSlider.disabled = false;
		}
		globalGainState = manualPreampState;
		localStorage.setItem("aura_active_manual_preamp", manualPreampState.toString());
		await updateGlobalGain(globalGainState, skipWrite);
	}
}

(window as any).getAutoPreampEnabled = getAutoPreampEnabled;
(window as any).setAutoPreampEnabled = setAutoPreampEnabled;
(window as any).getManualPreampState = getManualPreampState;
(window as any).setManualPreampState = setManualPreampState;
(window as any).recalculateAutoPreamp = recalculateAutoPreamp;
(window as any).toggleAutoPreamp = toggleAutoPreamp;
(window as any).setGlobalGainState = setGlobalGainState;
(window as any).getBassTiltState = getBassTiltState;
(window as any).setBassTiltState = setBassTiltState;
(window as any).getTrebleTiltState = getTrebleTiltState;
(window as any).setTrebleTiltState = setTrebleTiltState;
(window as any).getTiltGainAtFreq = getTiltGainAtFreq;

export function isConfigurationUnsafe(): boolean {
	if (globalGainState > 0) return true;

	for (const band of eqState) {
		if (band.enabled && band.gain > 10) return true;
	}

	const peak = calculateCombinedPeakGain();
	if (peak > 12) return true;

	let totalBoost = 0;
	for (const band of eqState) {
		if (band.enabled && band.gain > 0) {
			totalBoost += band.gain;
		}
	}
	if (totalBoost > 15) return true;

	return false;
}

export async function reduceGainsSafely() {
	let changed = false;

	if (globalGainState > 0) {
		globalGainState = 0;
		changed = true;
	}

	for (let i = 0; i < eqState.length; i++) {
		if (eqState[i].enabled && eqState[i].gain > 10) {
			eqState[i].gain = 10;
			changed = true;
		}
	}

	let peak = calculateCombinedPeakGain();
	if (peak > 12) {
		globalGainState -= (peak - 12);
		changed = true;
	}

	const protocol = getActiveProtocol();
	if (protocol === "SAVITECH") {
		globalGainState = Math.round(globalGainState);
	} else {
		globalGainState = Math.round(globalGainState * 10) / 10;
	}
	globalGainState = Math.max(-20, Math.min(0, globalGainState));

	if (changed) {
		await updateGlobalGain(globalGainState);
		renderUI(eqState);
		
		if (autoPreampEnabled) {
			await recalculateAutoPreamp();
		}

		if (device) {
			await syncToDevice();
		}
		pushHistory();
	}
}

(window as any).isConfigurationUnsafe = isConfigurationUnsafe;
(window as any).reduceGainsSafely = reduceGainsSafely;

export function resetTiltState() {
	bassTiltState = 0;
	trebleTiltState = 0;
	
	const slideBassTilt = document.getElementById("slideBassTilt") as HTMLInputElement;
	const slideTrebleTilt = document.getElementById("slideTrebleTilt") as HTMLInputElement;
	const lblBassTilt = document.getElementById("lblBassTilt") as HTMLElement;
	const lblTrebleTilt = document.getElementById("lblTrebleTilt") as HTMLElement;
	const tiltTextValue = document.getElementById("tiltTextValue") as HTMLElement;

	if (slideBassTilt) slideBassTilt.value = "0";
	if (slideTrebleTilt) slideTrebleTilt.value = "0";
	if (lblBassTilt) lblBassTilt.innerText = "0.0 dB";
	if (lblTrebleTilt) lblTrebleTilt.innerText = "0.0 dB";
	if (tiltTextValue) tiltTextValue.innerText = "Bass: +0.0 dB, Treble: +0.0 dB";
}
(window as any).resetTiltState = resetTiltState;





