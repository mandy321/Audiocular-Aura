import {
	DEFAULT_FREQS,
	DEFAULT_LABELS,
	VID_COMTRUE,
	VID_FIIO,
	VID_SAVITECH,
	VID_SAVITECH_ALT,
	VID_SAVITECH_OFFICIAL,
	VID_AUDIOCULAR,
	KNOWN_DACS,
} from "./constants.ts";
import { readDeviceParams, setupListener, syncToDevice, queueRealtimeBandWrite, getProtocol } from "./dsp.ts";
import { enableControls, log, updateGlobalGainUI, refreshStripUI } from "./helpers.ts";
import type { Band, EQ } from "./main.ts";
import { renderPEQ, resizeCanvas } from "./peq.ts";

/**
 * STATE
 */
let device: HIDDevice | null = null;
let globalGainState: number = 0;
let eqState: EQ = defaultEqState();
let lastAppliedEqName: string = localStorage.getItem("last_applied_eq") || "Flat Profile (Default)";

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
	const match = KNOWN_DACS.find(
		(d) =>
			d.vid === dev.vendorId &&
			(d.pid === undefined || d.pid === dev.productId)
	);

	const badgeContainer = document.getElementById("dacBadgeContainer");
	const badgeName = document.getElementById("dacBadgeName");
	const badgeChipset = document.getElementById("dacBadgeChipset");
	const badgeDesc = document.getElementById("dacBadgeDesc");

	if (match) {
		log(`[System] DAC Identified: ${match.name} (${match.chipset}) using ${match.protocol} protocol`);
		if (badgeContainer) badgeContainer.classList.remove("hidden");
		if (badgeName) badgeName.innerText = match.name;
		if (badgeChipset) badgeChipset.innerText = `Chipset: ${match.chipset} | Protocol: ${match.protocol}`;
		if (badgeDesc) badgeDesc.innerText = match.description;
	} else {
		// Fallback by Vendor ID alone
		const fallbackMatch = KNOWN_DACS.find((d) => d.vid === dev.vendorId);
		if (fallbackMatch) {
			log(`[System] DAC Compatible Match: Generic ${fallbackMatch.name} device`);
			if (badgeContainer) badgeContainer.classList.remove("hidden");
			if (badgeName) badgeName.innerText = `${dev.productName || "Compatible Device"}`;
			if (badgeChipset) badgeChipset.innerText = `Chipset: ${fallbackMatch.chipset} (Detected via VID) | Protocol: ${fallbackMatch.protocol}`;
			if (badgeDesc) badgeDesc.innerText = fallbackMatch.description;
		} else {
			log(`[System] Connected to unrecognized DAC (VID: 0x${dev.vendorId.toString(16).toUpperCase()})`);
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

	// 2. Render or Sync the 8 EQ Strips side-by-side
	const stripsContainer = document.getElementById("eqStrips");
	if (stripsContainer) {
		if (stripsContainer.children.length === 0) {
			stripsContainer.innerHTML = "";
			eqState.forEach((band, i) => {
				const div = document.createElement("div");
				div.className = `eq-strip ${band.enabled ? "" : "bypassed"}`;
				div.innerHTML = `
					<div class="strip-header">
						<h3 class="strip-title">BAND ${i + 1}</h3>
						<span class="strip-label">${DEFAULT_LABELS[i]}</span>
					</div>
					
					<label class="switch">
						<input type="checkbox" id="check-enabled-${i}" ${band.enabled ? "checked" : ""} onchange="window.updateState(${i}, 'enabled', this.checked)">
						<span class="slider"></span>
					</label>

					<div class="slider-container">
						<span class="slider-label">Gain (dB)</span>
						<input type="range" orient="vertical" min="-12" max="12" step="0.5" value="${band.gain}" 
							oninput="window.updateState(${i}, 'gain', this.value)" ${device ? "" : "disabled"} class="vertical-slider">
						<div class="gain-input-wrapper">
							<input type="number" value="${band.gain}" step="0.5" min="-12" max="12"
								onchange="window.updateState(${i}, 'gain', this.value)" id="num-gain-${i}" ${device ? "" : "disabled"} class="strip-input font-mono" size="6">
						</div>
					</div>

					<div class="strip-field">
						<label class="strip-field-label">Freq (Hz)</label>
						<input type="number" value="${band.freq}" min="20" max="20000" step="1"
							onchange="window.updateState(${i}, 'freq', this.value)" id="num-freq-${i}" ${device ? "" : "disabled"} class="strip-input font-mono" size="6">
					</div>

					<div class="strip-field">
						<label class="strip-field-label">Q Factor</label>
						<input type="number" value="${band.q}" min="0.1" max="10" step="0.05"
							onchange="window.updateState(${i}, 'q', this.value)" id="num-q-${i}" ${device ? "" : "disabled"} class="strip-input font-mono" size="6">
					</div>

					<div class="strip-field">
						<label class="strip-field-label">Type</label>
						<select onchange="window.updateState(${i}, 'type', this.value)" id="sel-type-${i}" ${device ? "" : "disabled"} class="strip-select">
							<option value="PK" ${band.type === "PK" ? "selected" : ""}>Peak</option>
							<option value="LSQ" ${band.type === "LSQ" ? "selected" : ""}>Low Shelf</option>
							<option value="HSQ" ${band.type === "HSQ" ? "selected" : ""}>High Shelf</option>
						</select>
					</div>
				`;
				stripsContainer.appendChild(div);
			});
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
		// Basic automatic filters
		const filters: any[] = [
			{ vendorId: VID_AUDIOCULAR },        // TTGK / Audiocular Aura (CB5100)
			{ vendorId: VID_SAVITECH_OFFICIAL }, // Fosi, iBasso, Savitech Official
			{ vendorId: VID_SAVITECH },          // JCally, Savitech Generic
			{ vendorId: VID_SAVITECH_ALT },      // JCally JM20 Pro, Savitech Alt
			{ vendorId: VID_COMTRUE },           // Moondrop, Tanchjim
			{ vendorId: VID_FIIO },              // FiiO
		];

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

		device = devices[0];
		await device.open();

		log(
			`Successfully connected to: ${device.productName || "Unknown DAC"} (VID: 0x${device.vendorId.toString(16).toUpperCase()}, PID: 0x${device.productId.toString(16).toUpperCase()})`,
		);

		// Adjust bands for device
		adjustBandsForDevice(device);

		// Identify DAC automatically
		identifyConnectedDac(device);

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

		setupListener(device);

		// Support parameter reading for Savitech-based DACs (including FiiO JA11)
		const nameUpper = (device.productName || "").toUpperCase();
		const protocol = getProtocol(device);
		if (
			protocol === "FIIO_JA11" ||
			device.vendorId === VID_SAVITECH ||
			device.vendorId === VID_SAVITECH_ALT ||
			device.vendorId === VID_SAVITECH_OFFICIAL ||
			device.vendorId === VID_AUDIOCULAR ||
			nameUpper.includes("JA11") ||
			(customVidEl && customVidEl.value.trim() !== "") // Allow reading for custom-defined Savitech variants
		) {
			await readDeviceParams(device);
		} else {
			log("Note: Parameter reading is only supported for Savitech and FiiO JA11 devices. Starting with a flat profile.");
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

		device = devices[0];
		await device.open();

		log(`[System] Auto-connected to previously authorized device: ${device.productName || "Unknown DAC"}`);
		adjustBandsForDevice(device);
		identifyConnectedDac(device);

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
		setupListener(device);

		const nameUpper = (device.productName || "").toUpperCase();
		const customVidEl = document.getElementById("customVid") as HTMLInputElement;
		const protocol = getProtocol(device);
		if (
			protocol === "FIIO_JA11" ||
			device.vendorId === VID_SAVITECH ||
			device.vendorId === VID_SAVITECH_ALT ||
			device.vendorId === VID_SAVITECH_OFFICIAL ||
			device.vendorId === VID_AUDIOCULAR ||
			nameUpper.includes("JA11") ||
			(customVidEl && customVidEl.value.trim() !== "")
		) {
			await readDeviceParams(device);
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
		eqState = defaultEqState();
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
		eqState = [
			{ index: 0, freq: 100, gain: 0, q: 0.7, type: "PK", enabled: true },
			{ index: 1, freq: 500, gain: 0, q: 0.7, type: "PK", enabled: true },
			{ index: 2, freq: 1000, gain: 0, q: 0.7, type: "PK", enabled: true },
			{ index: 3, freq: 2500, gain: 0, q: 0.7, type: "PK", enabled: true },
			{ index: 4, freq: 10000, gain: 0, q: 0.7, type: "PK", enabled: true },
		] as EQ;
		if (stripsContainer) {
			stripsContainer.innerHTML = "";
			stripsContainer.style.setProperty("--bands-count", "5");
			stripsContainer.style.setProperty("--bands-count-tablet", "5");
			stripsContainer.style.setProperty("--bands-count-mobile", "2");
		}
	} else {
		eqState = defaultEqState();
		if (stripsContainer) {
			stripsContainer.innerHTML = "";
			stripsContainer.style.removeProperty("--bands-count");
			stripsContainer.style.removeProperty("--bands-count-tablet");
			stripsContainer.style.removeProperty("--bands-count-mobile");
		}
	}
}

