import { setDeviceGlobalGain } from "./dsp.ts";
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
	if (globalGainSlider) globalGainSlider.value = val.toString();

	const globalGainDisplay = document.getElementById("globalGainDisplay") as HTMLElement;
	if (globalGainDisplay) globalGainDisplay.innerText = `${val} dB`;
}

/**
 * Update global gain and send to device
 * @param newGlobalGainState The new global gain value
 */
export async function updateGlobalGain(newGlobalGainState: number) {
	updateGlobalGainUI(newGlobalGainState);
	await setDeviceGlobalGain(newGlobalGainState);
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
	consoleEl.innerHTML += `<div>[${timestamp}] ${msg}</div>`;
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

