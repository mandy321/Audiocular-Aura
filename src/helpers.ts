import { setDeviceGlobalGain, getActiveProtocol } from "./dsp.ts";
import type { EQ } from "./main.ts";

/**
 * Refresh the UI elements for a single EQ strip
 * @param eqState Current EQ state
 * @param i Band index
 */
export function refreshStripUI(eqState: EQ, i: number) {
	// Only updates values, does not re-create DOM (prevents focus loss)
	const band = eqState[i];
	const gainInput = document.getElementById(`num-gain-${i}`) as HTMLInputElement;
	const rangeInput = document.querySelector(`.eq-strip:nth-child(${i + 1}) input[type=range]`) as HTMLInputElement;
	const freqInput = document.getElementById(`num-freq-${i}`) as HTMLInputElement;
	const qInput = document.getElementById(`num-q-${i}`) as HTMLInputElement;
	const typeSelect = document.getElementById(`sel-type-${i}`) as HTMLSelectElement;
	const checkInput = document.getElementById(`check-enabled-${i}`) as HTMLInputElement;

	if (gainInput) gainInput.value = band.gain.toString();
	if (rangeInput) rangeInput.value = band.gain.toString();
	if (freqInput) freqInput.value = band.freq.toString();
	if (qInput) qInput.value = band.q.toString();
	if (typeSelect) typeSelect.value = band.type;
	if (checkInput) checkInput.checked = band.enabled;

	// Toggle visual bypassed class state
	const strip = document.querySelector(`.eq-strip:nth-child(${i + 1})`);
	if (strip) {
		if (band.enabled) {
			strip.classList.remove("bypassed");
		} else {
			strip.classList.add("bypassed");
		}
	}
}

/**
 * Update global preamp gain UI
 * @param val The new global gain value
 */
export function updateGlobalGainUI(val: number) {
	const globalGainSlider = document.getElementById("globalGainSlider") as HTMLInputElement;
	const protocol = getActiveProtocol();

	// Primary display shows exact user/preset decimal value
	const displayValStr = `${val.toFixed(1)} dB`;
	const globalGainDisplay = document.getElementById("globalGainDisplay") as HTMLElement;
	if (globalGainDisplay) globalGainDisplay.innerText = displayValStr;

	// Adjust slider step/value
	if (globalGainSlider) {
		if (protocol === "SAVITECH") {
			globalGainSlider.step = "1";
			globalGainSlider.value = Math.round(val).toString();
		} else if (protocol === "MOONDROP" || protocol === "FIIO_JA11" || protocol === "FIIO") {
			globalGainSlider.step = "0.1";
			globalGainSlider.value = val.toString();
		} else {
			globalGainSlider.step = "1";
			globalGainSlider.value = Math.round(val).toString();
		}
	}

	// Update secondary applied note (for Savitech devices with decimal gain values)
	const preampAppliedNote = document.getElementById("preampAppliedNote") as HTMLElement;
	if (preampAppliedNote) {
		if (protocol === "SAVITECH") {
			const roundedVal = Math.round(val);
			if (Math.abs(val - roundedVal) > 0.001) {
				preampAppliedNote.innerText = `(applies as ${roundedVal} dB)`;
				preampAppliedNote.style.display = "block";
			} else {
				preampAppliedNote.style.display = "none";
			}
		} else {
			preampAppliedNote.style.display = "none";
		}
	}
}

/**
 * Update global gain and send to device
 * @param newGlobalGainState The new global gain value
 */
export async function updateGlobalGain(newGlobalGainState: number, skipWrite = false) {
	updateGlobalGainUI(newGlobalGainState);
	
	const dev = (window as any).device;
	if (dev) {
		localStorage.setItem(`last_preamp_gain_${dev.vendorId}_${dev.productId}`, newGlobalGainState.toString());
	}

	if (skipWrite) {
		if (typeof (window as any).setGlobalGainState === "function") {
			(window as any).setGlobalGainState(newGlobalGainState);
		}
	} else {
		await setDeviceGlobalGain(newGlobalGainState);
	}
}

/**
 * Set global gain (called from event handler)
 * @param e Event object
 */
export async function setGlobalGain(e: Event) {
	const globalGainEl = e.target as HTMLInputElement;
	const newGlobalGainState = Number(globalGainEl.value);
	await updateGlobalGain(newGlobalGainState);
}

/**
 * Configure preamp slider step and description based on current protocol status
 */
export function configurePreampUI(currentGain: number) {
	const protocol = getActiveProtocol();
	const globalGainSlider = document.getElementById("globalGainSlider") as HTMLInputElement;
	const preampStepIndicator = document.getElementById("preampStepIndicator") as HTMLElement;

	if (protocol === "SAVITECH") {
		if (globalGainSlider) globalGainSlider.step = "1";
		if (preampStepIndicator) {
			preampStepIndicator.innerText = "Integer steps only (Savitech hardware constraint)";
			preampStepIndicator.className = "preamp-step-indicator warning";
		}
	} else if (protocol === "MOONDROP" || protocol === "FIIO_JA11" || protocol === "FIIO") {
		if (globalGainSlider) globalGainSlider.step = "0.1";
		if (preampStepIndicator) {
			preampStepIndicator.innerText = "Fine steps (0.1 dB precision supported)";
			preampStepIndicator.className = "preamp-step-indicator success";
		}
	} else {
		if (globalGainSlider) globalGainSlider.step = "1";
		if (preampStepIndicator) {
			preampStepIndicator.innerText = "Connect DAC to enable controls";
			preampStepIndicator.className = "preamp-step-indicator disabled";
		}
	}

	// Snap/update UI based on new constraints
	updateGlobalGainUI(currentGain);
}

/**
 * Enable or disable interactive controls based on connection state
 * @param enabled True to enable controls
 */
export function enableControls(enabled: boolean) {
	const els = document.querySelectorAll(
		"input, select, button.action, button.reset, button#btnExport, button#btnExportTxt",
	);
	for (const el of els) {
		(el as HTMLInputElement | HTMLSelectElement | HTMLButtonElement).disabled = !enabled;
	}
}

/**
 * Log a message to the on-screen debug console
 * @param msg Message text
 */
export function log(msg: string) {
	const consoleEl = document.getElementById("logConsole");
	if (!consoleEl) return;
	const timestamp = new Date().toLocaleTimeString();

	let translatedMsg = msg;
	if (typeof (window as any).t === "function") {
		const tFunc = (window as any).t;
		if (msg === "Disconnected.") {
			translatedMsg = tFunc("log_disconnected");
		} else if (msg === "Defaults applied and synced.") {
			translatedMsg = tFunc("log_defaults_applied");
		} else if (msg === "Flat neutral profile applied and synced.") {
			translatedMsg = tFunc("log_flat_applied");
		} else if (msg === "Sync Complete.") {
			translatedMsg = tFunc("log_sync_complete");
		} else if (msg === "RAM Sync Successful.") {
			translatedMsg = tFunc("log_ram_sync_success");
		} else if (msg === "Flash Memory Write Successful.") {
			translatedMsg = tFunc("log_flash_write_success");
		} else if (msg.startsWith("[System] Connected:")) {
			translatedMsg = msg.replace("[System] Connected:", tFunc("log_connected") + ":");
		} else if (msg.startsWith("[System] Hardware factory reset")) {
			translatedMsg = tFunc("log_factory_reset_sent");
		}
	}

	consoleEl.innerHTML += `<div>[${timestamp}] ${translatedMsg}</div>`;
	consoleEl.scrollTop = consoleEl.scrollHeight;
}

/**
 * Async delay helper
 * @param ms Milliseconds to delay
 */
export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Log outgoing raw USB packet bytes in hex
 */
export function logTx(reportId: number, bytes: Uint8Array | number[]) {
	const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
	log(`[TX] Report ID: 0x${reportId.toString(16).toUpperCase()} | Data: ${hex}`);
}

/**
 * Log incoming raw USB packet bytes in hex
 */
export function logRx(reportId: number, bytes: Uint8Array) {
	const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
	log(`[RX] Report ID: 0x${reportId.toString(16).toUpperCase()} | Data: ${hex}`);
}

export function createRatingElement(key: string, onChange?: () => void): HTMLElement {
	const container = document.createElement("div");
	container.className = "item-rating-container";

	const currentRating = parseInt(localStorage.getItem(`rating_${key}`) || "0", 10);

	for (let i = 1; i <= 5; i++) {
		const star = document.createElement("span");
		star.className = `rating-star ${i <= currentRating ? "active" : ""}`;
		star.innerHTML = i <= currentRating ? "★" : "☆";
		star.dataset.index = i.toString();
		star.addEventListener("click", (e) => {
			e.stopPropagation();
			localStorage.setItem(`rating_${key}`, i.toString());
			const stars = container.querySelectorAll(".rating-star");
			stars.forEach((s, idx) => {
				if (idx < i) {
					s.classList.add("active");
					s.innerHTML = "★";
				} else {
					s.classList.remove("active");
					s.innerHTML = "☆";
				}
			});
			if (onChange) onChange();
		});
		container.appendChild(star);
	}
	return container;
}

export function createNotesElement(key: string): HTMLElement {
	const container = document.createElement("div");
	container.className = "item-notes-container";
	container.addEventListener("click", (e) => e.stopPropagation());

	const input = document.createElement("input");
	input.type = "text";
	input.className = "item-notes-input font-sans";
	input.placeholder = "Add notes...";
	input.value = localStorage.getItem(`notes_${key}`) || "";
	input.addEventListener("change", () => {
		localStorage.setItem(`notes_${key}`, input.value);
	});
	
	container.appendChild(input);
	return container;
}

