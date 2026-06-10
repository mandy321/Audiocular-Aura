import {
	CMD_FIIO,
	CMD_MOON,
	CMD_SAVI,
	DEFAULT_FREQS,
	NUM_BANDS,
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
import { delay, log, refreshStripUI, logTx, logRx } from "./helpers.ts";
import type { Band } from "./main.ts";

const REV_TYPE_MAP_JA11: Record<number, string> = { 0: "PK", 1: "LSQ", 2: "HSQ" };

/**
 * DETECT PROTOCOL BASED ON VENDOR ID
 */
export function getProtocol(device: HIDDevice) {
	if (device.vendorId === VID_COMTRUE) return "MOONDROP";
	if (device.vendorId === VID_FIIO) {
		const prodName = (device.productName || "").toUpperCase();
		if (device.productId === 258 || prodName.includes("JA11")) return "FIIO_JA11";
		return "FIIO";
	}
	return "SAVITECH"; // Default (used by CB5100/Audiocular Aura)
}

/**
 * Write band for FiiO JA11 (KT02H20) devices
 */
async function writeBandJa11(device: HIDDevice, band: Band, gain: number) {
	const typeMap = { PK: 0, LSQ: 1, HSQ: 2 };
	const i = band.index;
	let g = Math.round(gain * 10);
	if (g < 0) g = 65536 + g;
	const f = Math.round(band.freq);
	const qv = Math.round(band.q * 100);

	const packet = new Uint8Array([
		0xaa,
		0x0a,
		0,
		0,
		21,
		8,
		i,
		(g >> 8) & 0xff,
		g & 0xff,
		(f >> 8) & 0xff,
		f & 0xff,
		(qv >> 8) & 0xff,
		qv & 0xff,
		typeMap[band.type as keyof typeof typeMap] || 0,
		0,
		0xee,
	]);

	logTx(2, packet);
	await device.sendReport(2, packet);
}

/**
 * Set FiiO JA11 global master gain
 */
async function setMasterGainJa11(device: HIDDevice, gain: number) {
	let value = Math.round(Math.max(-12, Math.min(12, gain)) * 2560);
	if (value < 0) value = 65536 + value;

	const packet = new Uint8Array([
		0xaa,
		0x0a,
		0,
		0,
		23,
		2,
		value & 0xff,
		(value >> 8) & 0xff,
		0,
		0xee,
	]);

	logTx(2, packet);
	await device.sendReport(2, packet);
}

/**
 * UNIVERSAL GLOBAL GAIN SETTER
 * Updates state and transmits over the wire
 */
export async function setDeviceGlobalGain(gain: number, skipBandSync = false) {
	setGlobalGain(gain);
	const device = getDevice();
	if (!device) return;

	const protocol = getProtocol(device);

	if (protocol === "FIIO") {
		await setGlobalGainFiio(device, gain);
	} else if (protocol === "FIIO_JA11") {
		await setMasterGainJa11(device, gain);
	} else if (protocol === "MOONDROP") {
		await setGlobalGainMoondrop(device, gain);
	} else {
		// Savitech Default
		const gVal = gain < 0 ? 256 + Math.round(gain) : Math.round(gain);
		await sendPacketSavitech(device, [
			CMD_SAVI.WRITE,
			CMD_SAVI.GAIN,
			0x02,
			0x00,
			gVal,
		]);

		if (!skipBandSync) {
			await delay(20);
			// Re-sync all bands so that byte 34 in all PEQ blocks is updated
			const eqState = getEqState();
			if (eqState) {
				for (const band of eqState) {
					await writeBand(device, band, "SAVITECH");
					await delay(20);
				}
			}
			// Send final commit packet
			await sendPacketSavitech(device, [1, 10, 4, 0, 0, 255, 255]);
			await refreshToFlash(device);
		}
	}
}

/**
 * Read parameters from Savitech device
 * @param device The WebHID device
 */
export async function readDeviceParams(device: HIDDevice) {
	if (!device) return;
	const protocol = getProtocol(device);
	if (protocol === "FIIO_JA11") {
		log("Reading FiiO JA11 configuration...");
		// Request global gain
		const gainPacket = new Uint8Array([0xbb, 0x0b, 0, 0, 23, 0, 0, 0xee]);
		logTx(2, gainPacket);
		await device.sendReport(2, gainPacket);
		await delay(200);

		// Request 5 bands
		for (let i = 0; i < 5; i++) {
			const bandPacket = new Uint8Array([0xbb, 0x0b, 0, 0, 21, 1, i, 0xee]);
			logTx(2, bandPacket);
			await device.sendReport(2, bandPacket);
			await delay(150);
		}
		log("Configuration loaded.");
		return;
	}

	log("Reading device configuration...");

	// Read Version (Query and Ack Query sequence)
	await sendPacketSavitech(device, [
		CMD_SAVI.READ,
		CMD_SAVI.VERSION,
		CMD_SAVI.END,
	]);
	await delay(20);
	await sendPacketSavitech(device, [
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

	// Read Advanced settings (Filter, Work Mode, Gain Mode, Mic Volume, Balance)
	await sendPacketSavitech(device, [CMD_SAVI.READ, 17, CMD_SAVI.END]);
	await delay(30);
	await sendPacketSavitech(device, [CMD_SAVI.READ, 29, CMD_SAVI.END]);
	await delay(30);
	await sendPacketSavitech(device, [CMD_SAVI.READ, 25, CMD_SAVI.END]);
	await delay(30);
	await sendPacketSavitech(device, [CMD_SAVI.READ, 2, CMD_SAVI.END]);
	await delay(30);
	await sendPacketSavitech(device, [CMD_SAVI.READ, 22, 1, 0]); // channel 0
	await delay(30);
	await sendPacketSavitech(device, [CMD_SAVI.READ, 22, 1, 1]); // channel 1
	await delay(30);

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

const balanceState = { left: 0, right: 0 };

function updateBalanceState(channel: number, attenuation: number) {
	if (channel === 0) {
		balanceState.left = attenuation;
	} else if (channel === 1) {
		balanceState.right = attenuation;
	}
	
	let balance = 0;
	if (balanceState.left > 0) {
		balance = balanceState.left; // Right shift (left channel attenuated)
	} else if (balanceState.right > 0) {
		balance = -balanceState.right; // Left shift (right channel attenuated)
	}
	
	const sliderBalance = document.getElementById("sliderBalance") as HTMLInputElement;
	const balanceVal = document.getElementById("balanceVal") as HTMLElement;
	if (sliderBalance) sliderBalance.value = balance.toString();
	
	let text = "0 (Center)";
	if (balance < 0) {
		text = `L +${Math.abs(balance)}`;
	} else if (balance > 0) {
		text = `R +${balance}`;
	}
	if (balanceVal) balanceVal.innerText = text;
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
		logRx(event.reportId, data);

		const protocol = getProtocol(device);
		if (protocol === "FIIO_JA11") {
			const cmd = data[4];
			if (cmd === 23) {
				const raw = (data[7] << 8) | data[6];
				const signed = raw > 32767 ? raw - 65536 : raw;
				const gain = Number.parseFloat((signed / 2560).toFixed(1));
				setGlobalGain(gain);
			} else if (cmd === 21) {
				const idx = data[6];
				if (idx < eqState.length) {
					const rawGain = (data[7] << 8) | data[8];
					const signedGain = rawGain > 32767 ? rawGain - 65536 : rawGain;
					const gain = Number.parseFloat((signedGain / 10).toFixed(1));
					const freq = (data[9] << 8) | data[10];
					const qRaw = (data[11] << 8) | data[12];
					const q = Number.parseFloat((qRaw / 100).toFixed(2));
					const type = REV_TYPE_MAP_JA11[data[13]] || "PK";

					eqState[idx].freq = freq;
					eqState[idx].q = q;
					eqState[idx].gain = gain;
					eqState[idx].type = type;
					eqState[idx].enabled = true;

					refreshStripUI(eqState, idx);
				}
			}
			renderUI(eqState);
			return;
		}

		const cmd = data[1];

		if (cmd === CMD_SAVI.VERSION) {
			let ver = "";
			for (let i = 3; i < 10; i++) {
				if (data[i] === 0) break;
				ver += String.fromCharCode(data[i]);
			}
			if (versionEl) versionEl.innerText = `FW: ${ver}`;
			const infoFirmware = document.getElementById("infoFirmware");
			if (infoFirmware) infoFirmware.innerText = ver;
		} else if (cmd === CMD_SAVI.GAIN) {
			const gain = new Int8Array([data[4]])[0];
			setGlobalGain(gain);
		} else if (cmd === 17) { // Filter
			const val = data[3];
			const filters = ["FAST-LL", "FAST-PC", "Slow-LL", "Slow-PC", "NON-OS"];
			const filter = filters[val - 1];
			if (filter) {
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
				if (selFilterType) selFilterType.value = filter;
				if (filterTypeVal) filterTypeVal.innerText = selFilterType.options[selFilterType.selectedIndex].text;
				if (filterDescBox) filterDescBox.innerHTML = filterDescriptions[filter as keyof typeof filterDescriptions] || "";
			}
		} else if (cmd === 29) { // Amp Mode
			const val = data[3];
			const toggleAmpMode = document.getElementById("toggleAmpMode") as HTMLInputElement;
			const ampLabelClassH = document.getElementById("ampLabelClassH") as HTMLElement;
			const ampLabelClassAB = document.getElementById("ampLabelClassAB") as HTMLElement;
			if (toggleAmpMode) {
				const isClassH = (val === 0);
				toggleAmpMode.checked = isClassH;
				if (isClassH) {
					ampLabelClassH?.classList.add("active");
					ampLabelClassAB?.classList.remove("active");
				} else {
					ampLabelClassH?.classList.remove("active");
					ampLabelClassAB?.classList.add("active");
				}
			}
		} else if (cmd === 25) { // Gain Mode
			const val = data[3];
			const toggleGainMode = document.getElementById("toggleGainMode") as HTMLInputElement;
			const gainLabelLow = document.getElementById("gainLabelLow") as HTMLElement;
			const gainLabelHigh = document.getElementById("gainLabelHigh") as HTMLElement;
			if (toggleGainMode) {
				const isHigh = (val === 1);
				toggleGainMode.checked = isHigh;
				if (isHigh) {
					gainLabelLow?.classList.remove("active");
					gainLabelHigh?.classList.add("active");
				} else {
					gainLabelLow?.classList.add("active");
					gainLabelHigh?.classList.remove("active");
				}
			}
		} else if (cmd === 2) { // Mic Volume
			let val = data[4];
			if (val > 127) val = val - 256;
			const sliderMicGain = document.getElementById("sliderMicGain") as HTMLInputElement;
			const micGainVal = document.getElementById("micGainVal") as HTMLElement;
			if (sliderMicGain) sliderMicGain.value = val.toString();
			if (micGainVal) micGainVal.innerText = `${val} dB`;
		} else if (cmd === 22) { // Balance
			const channel = data[3];
			const valByte = data[5];
			const att = valByte > 0 ? 256 - valByte : 0;
			updateBalanceState(channel, att);
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

	// 1. Write Global Preamp Gain (skip band sync since we write them below)
	await setDeviceGlobalGain(getGlobalGainState(), true);

	// 2. Write all bands
	for (const band of eqState) {
		await writeBand(device, band, protocol);
		await delay(30);
	}

	// 3. Commit / Temp Save
	if (protocol === "SAVITECH") {
		await sendPacketSavitech(device, [1, 10, 4, 0, 0, 255, 255]);
		await refreshToFlash(device);
	} else if (protocol === "FIIO_JA11") {
		const packet = new Uint8Array([0xaa, 0x0a, 0, 0, 24, 1, 1, 0, 0xee]);
		logTx(2, packet);
		await device.sendReport(2, packet);
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
	} else if (protocol === "FIIO_JA11") {
		const packet = new Uint8Array([0xaa, 0x0a, 0, 0, 25, 1, 3, 0, 0xee]);
		logTx(2, packet);
		await device.sendReport(2, packet);
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
	} else if (protocol === "FIIO_JA11") {
		await writeBandJa11(device, band, effectiveGain);
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
	const bArr = computeIIRFilter(band.type, band.freq, gain, band.q);
	const typeMap = { PK: 2, LSQ: 1, HSQ: 3 };

	const freqBytes = toBytes(band.freq, 2);
	const qBytes = toBytes(Math.round(band.q * 256), 2);
	const gainBytes = toBytes(Math.round(gain * 256), 2);

	let m = Math.round(getGlobalGainState());
	if (m > 127) m = 127;
	if (m < -128) m = -128;
	if (m < 0) m = 256 + m;

	const packet = [
		CMD_SAVI.WRITE, // 1
		CMD_SAVI.PEQ,   // 9
		0x18,           // 24 (4 + 20)
		0x00,
		band.index,
		0x00,
		0x00,
		...bArr,        // 20 bytes
		...freqBytes,   // 2 bytes
		...qBytes,      // 2 bytes
		...gainBytes,   // 2 bytes
		typeMap[band.type as keyof typeof typeMap] || 2, // type code
		m,              // global gain
		0x00,
	];
	await sendPacketSavitech(device, packet);
}

/**
 * Write band for Moondrop devices
 */
async function writeBandMoondrop(device: HIDDevice, band: Band, gain: number) {
	const coeffs = encodeBiquadMoondrop(band.type, band.freq, gain, band.q);
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
	// If it's a read command (starts with 128 / 0x80) or version ack (starts with 12) or
	// PEQ write command (starts with 1, 9), pad to exactly 36 bytes.
	// Otherwise, send the exact array length.
	let size = bytes.length;
	if (bytes[0] === 128 || bytes[0] === 12 || (bytes[0] === 1 && bytes[1] === 9)) {
		size = 36;
	}
	
	const p = new Uint8Array(size);
	for (let i = 0; i < bytes.length; i++) p[i] = bytes[i];
	
	logTx(REPORT_ID_DEFAULT, p);
	
	try {
		await device.sendReport(REPORT_ID_DEFAULT, p);
	} catch (err) {
		const errMsg = (err as Error).message || "";
		log(`[TX Debug] sendReport ID=${REPORT_ID_DEFAULT} failed: ${errMsg}. Retrying sendFeatureReport...`);
		try {
			await device.sendFeatureReport(REPORT_ID_DEFAULT, p);
			log(`[TX Debug] Success via sendFeatureReport ID=${REPORT_ID_DEFAULT}`);
			return;
		} catch (featErr) {
			log(`[TX Debug] sendFeatureReport ID=${REPORT_ID_DEFAULT} failed: ${(featErr as Error).message}`);
		}
		
		if ((err as Error).name === "NotAllowedError" || errMsg.includes("NotAllowedError")) {
			try {
				await device.sendReport(0, p);
				log(`[TX Debug] Success via sendReport ID=0`);
				return;
			} catch (retryErr) {
				log(`[TX Debug] sendReport ID=0 failed: ${(retryErr as Error).message}. Retrying sendFeatureReport ID=0...`);
				try {
					await device.sendFeatureReport(0, p);
					log(`[TX Debug] Success via sendFeatureReport ID=0`);
					return;
				} catch (featRetryErr) {
					log(`[TX Debug] sendFeatureReport ID=0 failed: ${(featRetryErr as Error).message}`);
				}
			}
		}
		log(`TX Error: ${errMsg}`);
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
/**
 * Calculate biquad filter coefficients (RBJ Audio EQ Cookbook)
 * Normalizes by a0 and returns {b0, b1, b2, a1, a2}
 */
function computeBiquadCoeffs(
	type: string,
	freq: number,
	gain: number,
	q: number,
	sampleRate: number
) {
	const w0 = (2 * Math.PI * freq) / sampleRate;
	const alpha = Math.sin(w0) / (2 * q);
	const A = 10 ** (gain / 40);
	const cosw = Math.cos(w0);

	let b0, b1, b2, a0, a1, a2;

	switch (type) {
		case "LSQ": {
			// Low Shelf
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
			// High Shelf
			const sb = 2 * Math.sqrt(A) * alpha;
			b0 = A * (A + 1 + (A - 1) * cosw + sb);
			b1 = -2 * A * (A - 1 + (A + 1) * cosw);
			b2 = A * (A + 1 + (A - 1) * cosw - sb);
			a0 = A + 1 - (A - 1) * cosw + sb;
			a1 = 2 * (A - 1 - (A + 1) * cosw);
			a2 = A + 1 - (A - 1) * cosw - sb;
			break;
		}
		case "PK":
		default: {
			// Peaking EQ
			b0 = 1 + alpha * A;
			b1 = -2 * cosw;
			b2 = 1 - alpha * A;
			a0 = 1 + alpha / A;
			a1 = -2 * cosw;
			a2 = 1 - alpha / A;
			break;
		}
	}

	const inv_a0 = 1 / a0;
	return {
		b0: b0 * inv_a0,
		b1: b1 * inv_a0,
		b2: b2 * inv_a0,
		a1: a1 * inv_a0,
		a2: a2 * inv_a0,
	};
}

/**
 * Savitech DSP Math: Q30 fixed-point IIR filter coefficients calculator
 */
function computeIIRFilter(type: string, freq: number, gain: number, q: number) {
	const fs = 96000;
	const coeffs = computeBiquadCoeffs(type, freq, gain, q, fs);
	const s = 1073741824; // Scale factor for Q30 representation (2^30)
	const q30 = (n: number) => Math.round(n * s);

	return [
		q30(coeffs.b0),
		q30(coeffs.b1),
		q30(coeffs.b2),
		q30(-coeffs.a1), // Savitech expects -a1
		q30(-coeffs.a2), // Savitech expects -a2
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
function encodeBiquadMoondrop(type: string, freq: number, gain: number, q: number) {
	const fs = 96000;
	const coeffs = computeBiquadCoeffs(type, freq, gain, q, fs);
	const s = 1073741824;

	return [
		coeffs.b0,
		coeffs.b1,
		coeffs.b2,
		-coeffs.a1, // Moondrop expects -a1
		-coeffs.a2, // Moondrop expects -a2
	].map((c) => Math.round(c * s));
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

/**
 * Advanced settings commands (Savitech CB5100 DSP)
 */
export async function setDacFilter(device: HIDDevice, filterType: string) {
	let r = 1;
	switch (filterType) {
		case "FAST-LL": r = 1; break;
		case "FAST-PC": r = 2; break;
		case "Slow-LL": r = 3; break;
		case "Slow-PC": r = 4; break;
		case "NON-OS":  r = 5; break;
		default: r = 1;
	}
	log(`Setting DAC Filter: ${filterType} (index ${r})`);
	await sendPacketSavitech(device, [1, 17, 1, r]);
	await refreshToFlash(device);
}

export async function setDacWorkMode(device: HIDDevice, isClassAB: boolean) {
	const r = isClassAB ? 1 : 0;
	log(`Setting Amp Mode: ${isClassAB ? "Class AB" : "Class H"}`);
	await sendPacketSavitech(device, [1, 29, 1, r]);
	await refreshToFlash(device);
}

export async function setDacOutputGain(device: HIDDevice, isHighGain: boolean) {
	const r = isHighGain ? 1 : 0;
	log(`Setting DAC Output Gain Mode: ${isHighGain ? "HIGH" : "LOW"}`);
	await sendPacketSavitech(device, [1, 25, 1, r]);
	await refreshToFlash(device);
}

export async function setDacBalance(device: HIDDevice, balance: number) {
	log(`Setting DAC Balance: ${balance}`);
	const he = balance <= 0 ? Math.abs(balance) : 0;
	const ne = balance > 0 ? balance : 0;
	
	if (he > 0) {
		const n = -1 * he;
		await sendPacketSavitech(device, [1, 22, 4, 1, 0, n, 0]);
		await delay(20);
		await sendPacketSavitech(device, [1, 22, 4, 0, 0, 0, 0]);
	} else if (ne > 0) {
		await sendPacketSavitech(device, [1, 22, 4, 1, 0, 0, 0]);
		await delay(20);
		const n = -1 * ne;
		await sendPacketSavitech(device, [1, 22, 4, 0, 0, n, 0]);
	} else {
		await sendPacketSavitech(device, [1, 22, 4, 0, 1, 0, 0]);
		await delay(20);
		await sendPacketSavitech(device, [1, 22, 4, 0, 0, 0, 0]);
	}
	await refreshToFlash(device);
}

export async function setMicVolume(device: HIDDevice, volume: number) {
	log(`Setting Microphone Gain: ${volume} dB`);
	await sendPacketSavitech(device, [1, 2, 2, 128, volume]);
	await delay(50);
	await refreshToFlash(device);
}

let refreshTimeoutId: any = null;

export async function refreshToFlash(device: HIDDevice) {
	if (refreshTimeoutId) {
		clearTimeout(refreshTimeoutId);
	}
	refreshTimeoutId = setTimeout(async () => {
		refreshTimeoutId = null;
		try {
			await sendPacketSavitech(device, [1, 1, 0]);
		} catch (e) {
			log(`Refresh to Flash Error: ${(e as Error).message}`);
		}
	}, 1000);
}

/**
 * Real-time throttled band write queue manager
 */
let pendingBands = new Map<number, Band>();
let writeTimeoutId: any = null;

export function queueRealtimeBandWrite(device: HIDDevice, band: Band) {
	// Store the latest state of this band
	pendingBands.set(band.index, { ...band });

	if (writeTimeoutId !== null) return;

	writeTimeoutId = setTimeout(async () => {
		writeTimeoutId = null;
		
		const bandsToClear = Array.from(pendingBands.values());
		pendingBands.clear();

		if (!device) return;
		const protocol = getProtocol(device);

		// Write all pending bands
		for (const b of bandsToClear) {
			await writeBand(device, b, protocol);
			await delay(25);
		}

		// Commit / Apply changes for Savitech or FiiO JA11
		if (protocol === "SAVITECH") {
			try {
				await sendPacketSavitech(device, [1, 10, 4, 0, 0, 255, 255]);
				// Call refresh to flash to apply registers
				await refreshToFlash(device);
			} catch (e) {
				log(`Savitech Realtime Commit Error: ${(e as Error).message}`);
			}
		} else if (protocol === "FIIO_JA11") {
			try {
				const packet = new Uint8Array([0xaa, 0x0a, 0, 0, 24, 1, 1, 0, 0xee]);
				logTx(2, packet);
				await device.sendReport(2, packet);
			} catch (e) {
				log(`FiiO JA11 Realtime Commit Error: ${(e as Error).message}`);
			}
		}
	}, 50); // 50ms batching window
}

export async function executeFactoryReset(device: HIDDevice) {
	log("Executing Factory Reset...");
	await sendPacketSavitech(device, [1, 23, 0]);
	await delay(100);
	await refreshToFlash(device);
}
