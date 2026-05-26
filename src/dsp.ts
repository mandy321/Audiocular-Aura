import {
	CMD_FIIO,
	CMD_MOON,
	CMD_SAVI,
	DEFAULT_FREQS,
	NUM_BANDS,
	PACKET_SIZE,
	REPORT_ID_DEFAULT,
	REPORT_ID_FIIO,
	VID_COMTRUE,
	VID_FIIO,
} from "./constants.ts";
import {
	getDevice,
	getEqState,
	getGlobalGainState,
	renderUI,
	setGlobalGain,
} from "./fn.ts";
import { delay, log, refreshStripUI } from "./helpers.ts";
import type { Band } from "./main.ts";

/**
 * DETECT PROTOCOL BASED ON VENDOR ID
 */
function getProtocol(device: HIDDevice) {
	if (device.vendorId === VID_COMTRUE) return "MOONDROP";
	if (device.vendorId === VID_FIIO) return "FIIO";
	return "SAVITECH"; // Default (used by CB5100/Audiocular Aura)
}

/**
 * UNIVERSAL GLOBAL GAIN SETTER
 * Updates state and transmits over the wire
 */
export async function setDeviceGlobalGain(gain: number) {
	setGlobalGain(gain);
	const device = getDevice();
	if (!device) return;

	const protocol = getProtocol(device);

	if (protocol === "FIIO") {
		await setGlobalGainFiio(device, gain);
	} else if (protocol === "MOONDROP") {
		await setGlobalGainMoondrop(device, gain);
	} else {
		// Savitech Default
		await sendPacketSavitech(device, [
			CMD_SAVI.WRITE,
			CMD_SAVI.GAIN,
			0x02,
			0x00,
			gain,
		]);
	}
}

/**
 * Read parameters from Savitech device
 * @param device The WebHID device
 */
export async function readDeviceParams(device: HIDDevice) {
	if (!device) return;
	log("Reading device configuration...");

	// Read Version
	await sendPacketSavitech(device, [
		CMD_SAVI.READ,
		CMD_SAVI.VERSION,
		CMD_SAVI.END,
	]);
	await delay(50);
	
	// Read Gain
	await sendPacketSavitech(device, [
		CMD_SAVI.READ,
		CMD_SAVI.GAIN,
		CMD_SAVI.END,
	]);
	await delay(50);

	// Request all 10 bands
	for (let i = 0; i < NUM_BANDS; i++) {
		await sendPacketSavitech(device, [
			CMD_SAVI.READ,
			CMD_SAVI.PEQ,
			0x00,
			0x00,
			i,
			CMD_SAVI.END,
		]);
		await delay(40);
	}
	log("Configuration loaded.");
}

/**
 * Listen to incoming input reports from the device
 * @param device The WebHID device
 */
export function setupListener(device: HIDDevice) {
	const eqState = getEqState();
	device.addEventListener("inputreport", (event) => {
		const versionEl = document.getElementById("fwVersion");
		const data = new Uint8Array(event.data.buffer);
		const cmd = data[1];

		if (cmd === CMD_SAVI.VERSION) {
			let ver = "";
			for (let i = 3; i < 10; i++) {
				if (data[i] === 0) break;
				ver += String.fromCharCode(data[i]);
			}
			if (versionEl) versionEl.innerText = `FW: ${ver}`;
		} else if (cmd === CMD_SAVI.GAIN) {
			const gain = new Int8Array([data[4]])[0];
			setGlobalGain(gain);
		} else if (cmd === CMD_SAVI.PEQ && data.byteLength >= 34) {
			const idx = data[4];
			if (idx < NUM_BANDS) {
				const view = new DataView(data.buffer);
				const rawFreq = view.getUint16(27, true);
				const rawQ = view.getUint16(29, true);
				const rawGain = view.getInt16(31, true);
				const typeCode = data[33];

				const freq = rawFreq;
				const q = Math.round((rawQ / 256) * 100) / 100;
				const gain = Math.round((rawGain / 256) * 10) / 10;

				let typeStr = "PK";
				if (typeCode === 1) typeStr = "LSQ";
				else if (typeCode === 3) typeStr = "HSQ";

				// Validate data - 0xFFFF (65535) or 0 indicates uninitialized/corrupted flash memory
				const isInvalidData =
					rawFreq === 0xffff ||
					rawFreq === 0 ||
					rawFreq > 24000 ||
					rawQ === 0xffff ||
					q > 100 ||
					q <= 0;

				// Update State with defaults if data is corrupted
				eqState[idx].freq = isInvalidData ? DEFAULT_FREQS[idx] : freq;
				eqState[idx].q = isInvalidData ? 0.75 : q;
				eqState[idx].gain = isInvalidData ? 0 : gain;
				eqState[idx].type = typeStr;
				eqState[idx].enabled = true;

				refreshStripUI(eqState, idx);
			}
		}

		renderUI(eqState);
	});
}

/**
 * Sync all bands and preamp gain to device RAM
 */
export async function syncToDevice() {
	const device = getDevice();
	const eqState = getEqState();
	if (!device || !eqState) return;

	const protocol = getProtocol(device);
	log(`Syncing via protocol: ${protocol}...`);

	// 1. Write Global Preamp Gain
	await setDeviceGlobalGain(getGlobalGainState());

	// 2. Write all bands
	for (const band of eqState) {
		await writeBand(device, band, protocol);
		await delay(30);
	}

	// 3. Commit / Temp Save (required by Savitech)
	if (protocol === "SAVITECH") {
		const currentGain = getGlobalGainState();
		await sendPacketSavitech(device, [
			CMD_SAVI.WRITE,
			CMD_SAVI.TEMP,
			0x04,
			0x00,
			currentGain,
			0xff,
			0xff,
			CMD_SAVI.END,
		]);
	}

	log("Sync Complete.");
}

/**
 * Flash settings permanently to device memory
 */
export async function flashToFlash() {
	const device = getDevice();
	if (!device) return;
	if (!confirm("Save to permanent memory? The settings will load automatically when you power on the DAC.")) return;

	const protocol = getProtocol(device);

	if (protocol === "FIIO") {
		const packet = new Uint8Array(64);
		packet.set([
			CMD_FIIO.HEADER_SET_1,
			CMD_FIIO.HEADER_SET_2,
			0,
			0,
			CMD_FIIO.SAVE,
			1,
			1,
			0,
			CMD_FIIO.END,
		]);
		await device.sendReport(REPORT_ID_FIIO, packet);
	} else if (protocol === "MOONDROP") {
		const packet = new Uint8Array([CMD_MOON.WRITE, CMD_MOON.SAVE_FLASH]);
		await device.sendReport(REPORT_ID_DEFAULT, packet);
	} else {
		// Savitech Flash Save
		await sendPacketSavitech(device, [
			CMD_SAVI.WRITE,
			CMD_SAVI.FLASH,
			0x01,
			0x00,
			CMD_SAVI.END,
		]);
	}

	log("Saved permanently to Flash.");
}

/**
 * Dispatch band writing to appropriate protocol handler
 */
export async function writeBand(
	device: HIDDevice,
	band: Band,
	protocol: string,
) {
	const effectiveGain = band.enabled ? band.gain : 0;

	if (protocol === "FIIO") {
		await writeBandFiio(device, band, effectiveGain);
	} else if (protocol === "MOONDROP") {
		await writeBandMoondrop(device, band, effectiveGain);
	} else {
		await writeBandSavitech(device, band, effectiveGain);
	}
}

/**
 * Write band for Savitech devices
 */
async function writeBandSavitech(device: HIDDevice, band: Band, gain: number) {
	const bArr = computeIIRFilter(band.freq, gain, band.q);
	const typeMap = { PK: 2, LSQ: 1, HSQ: 3 };

	const freqBytes = toBytes(band.freq, 2);
	const qBytes = toBytes(Math.round(band.q * 256), 2);
	const gainBytes = toBytes(Math.round(gain * 256), 2);

	const packet = [
		CMD_SAVI.WRITE,
		CMD_SAVI.PEQ,
		0x18,
		0x00,
		band.index,
		0x00,
		0x00,
		...bArr,
		...freqBytes,
		...qBytes,
		...gainBytes,
		typeMap[band.type as keyof typeof typeMap] || 2,
		0x00,
		0x00,
		CMD_SAVI.END,
	];
	await sendPacketSavitech(device, packet);
}

/**
 * Write band for Moondrop devices
 */
async function writeBandMoondrop(device: HIDDevice, band: Band, gain: number) {
	const coeffs = encodeBiquadMoondrop(band.freq, gain, band.q);
	const typeMap = { PK: 2, LSQ: 1, HSQ: 3 };

	const packet = new Uint8Array(63);
	packet[0] = CMD_MOON.WRITE;
	packet[1] = CMD_MOON.UPDATE_EQ;
	packet[2] = 0x18;
	packet[3] = 0x00;
	packet[4] = band.index;

	const coeffBytes = encodeToByteArray(coeffs);
	packet.set(coeffBytes, 7);

	packet[27] = band.freq & 0xff;
	packet[28] = (band.freq >> 8) & 0xff;

	const qVal = Math.round(band.q * 256);
	packet[29] = qVal & 255;
	packet[30] = (qVal >> 8) & 255;

	const gainVal = Math.round(gain * 256);
	packet[31] = gainVal & 255;
	packet[32] = (gainVal >> 8) & 255;

	packet[33] = typeMap[band.type as keyof typeof typeMap] || 2;
	packet[35] = REPORT_ID_DEFAULT;

	await device.sendReport(REPORT_ID_DEFAULT, packet);

	// Coefficients trigger packet
	const enablePacket = new Uint8Array(63);
	enablePacket[0] = CMD_MOON.WRITE;
	enablePacket[1] = CMD_MOON.UPDATE_EQ_COEFF;
	enablePacket[2] = band.index;
	enablePacket[4] = 255;
	enablePacket[5] = 255;
	enablePacket[6] = 255;
	await device.sendReport(REPORT_ID_DEFAULT, enablePacket);
}

/**
 * Set Moondrop global gain
 */
async function setGlobalGainMoondrop(device: HIDDevice, gain: number) {
	const val = Math.round(gain * 256);
	const packet = new Uint8Array([
		CMD_MOON.WRITE,
		CMD_MOON.PRE_GAIN,
		0,
		val & 255,
		(val >> 8) & 255,
	]);
	await device.sendReport(REPORT_ID_DEFAULT, packet);
}

/**
 * Write band for FiiO devices
 */
async function writeBandFiio(device: HIDDevice, band: Band, gain: number) {
	const typeMap = { PK: 0, LSQ: 1, HSQ: 2 };

	const freqLow = band.freq & 0xff;
	const freqHigh = (band.freq >> 8) & 0xff;

	let t = gain * 10;
	if (t < 0) t = (Math.abs(t) ^ 65535) + 1;
	const gainLow = (t >> 8) & 0xff;
	const gainHigh = t & 0xff;

	const qVal = Math.round(band.q * 100);
	const qLow = (qVal >> 8) & 0xff;
	const qHigh = qVal & 0xff;

	const packet = new Uint8Array([
		CMD_FIIO.HEADER_SET_1,
		CMD_FIIO.HEADER_SET_2,
		0,
		0,
		CMD_FIIO.FILTER_PARAMS,
		8,
		band.index,
		gainLow,
		gainHigh,
		freqLow,
		freqHigh,
		qLow,
		qHigh,
		typeMap[band.type as keyof typeof typeMap] || 0,
		0,
		CMD_FIIO.END,
	]);

	await device.sendReport(REPORT_ID_FIIO, packet);
}

/**
 * Set FiiO global gain
 */
async function setGlobalGainFiio(device: HIDDevice, gain: number) {
	const val = Math.round(gain * 10);
	const gLow = val & 0xff;
	const gHigh = (val >> 8) & 0xff;

	const packet = new Uint8Array([
		CMD_FIIO.HEADER_SET_1,
		CMD_FIIO.HEADER_SET_2,
		0,
		0,
		CMD_FIIO.GLOBAL_GAIN,
		2,
		gHigh,
		gLow,
		0,
		CMD_FIIO.END,
	]);
	await device.sendReport(REPORT_ID_FIIO, packet);
}

/**
 * Send packet over WebHID using Savitech layout
 */
async function sendPacketSavitech(device: HIDDevice, bytes: number[]) {
	try {
		const p = new Uint8Array(PACKET_SIZE);
		for (let i = 0; i < bytes.length; i++) p[i] = bytes[i];
		await device.sendReport(REPORT_ID_DEFAULT, p);
	} catch (err) {
		log(`TX Error: ${(err as Error).message}`);
	}
}

/**
 * Helper to split a number into an array of bytes
 */
function toBytes(n: number, c: number) {
	return [...Array(c)].map((_, i) => (n >> (8 * i)) & 0xff);
}

/**
 * Savitech DSP Math: Q30 fixed-point IIR filter coefficients calculator
 */
function computeIIRFilter(freq: number, gain: number, q: number) {
	const fs = 96000;
	const A = 10 ** (gain / 20);
	const w0 = (freq * 2 * Math.PI) / fs;
	const alpha = Math.sin(w0) / (2 * q);
	const d4 = alpha * Math.sqrt(A);
	const d5 = alpha / Math.sqrt(A);
	const inv_a0 = 1 / (d5 + 1);
	
	const s = 1073741824; // Scale factor for Q30 representation (2^30)
	const q30 = (n: number) => Math.round(n * s);

	return [
		q30((1 + d4) * inv_a0),
		q30(-2 * Math.cos(w0) * inv_a0),
		q30((1 - d4) * inv_a0),
		q30(-(-2 * Math.cos(w0) * inv_a0)),
		q30(-((1 - d5) * inv_a0)),
	].flatMap((v) => [
		v & 0xff,
		(v >> 8) & 0xff,
		(v >> 16) & 0xff,
		(v >> 24) & 0xff,
	]);
}

/**
 * Moondrop DSP Math: coefficients encoding
 */
function encodeBiquadMoondrop(freq: number, gain: number, q: number) {
	const A = 10 ** (gain / 40);
	const w0 = (2 * Math.PI * freq) / 96000;
	const alpha = Math.sin(w0) / (2 * q);
	const cosW0 = Math.cos(w0);
	const norm = 1 + alpha / A;

	const b0 = (1 + alpha * A) / norm;
	const b1 = (-2 * cosW0) / norm;
	const b2 = (1 - alpha * A) / norm;
	const a1 = -b1;
	const a2 = (1 - alpha / A) / norm;

	return [b0, b1, b2, a1, -a2].map((c) => Math.round(c * 1073741824));
}

/**
 * Convert coefficients array to byte array
 */
function encodeToByteArray(coeffs: number[]) {
	const arr = new Uint8Array(20);
	for (let i = 0; i < coeffs.length; i++) {
		const val = coeffs[i];
		arr[i * 4] = val & 0xff;
		arr[i * 4 + 1] = (val >> 8) & 0xff;
		arr[i * 4 + 2] = (val >> 16) & 0xff;
		arr[i * 4 + 3] = (val >> 24) & 0xff;
	}
	return arr;
}
