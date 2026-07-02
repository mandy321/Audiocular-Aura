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
	VID_JKALLY_KTMICRO,
	activeDacs,
} from "./constants.ts";
import {
	getDevice,
	getEqState,
	setEqState,
	defaultEqState,
	getGlobalGainState,
	renderUI,
	setGlobalGain,
	getTiltGainAtFreq,
	getAutoPreampEnabled,
	getManualPreampState,
	getLastAppliedEqName,
	updateBaselineFromActive,
} from "./fn.ts";
import { delay, log, refreshStripUI, logTx, logRx, showSyncing, hideSyncing } from "./helpers.ts";
import type { Band } from "./main.ts";
import { t } from "./i18n.ts";

/**
 * Get the correct HID Report ID for a Moondrop device.
 *
 * FreeDSP (PID 0x1496) HID descriptor (confirmed via navigator.hid):
 *   outputReports[0].reportId = 1, reportCount = 61 bytes
 * All other Moondrop/Comtrue devices: REPORT_ID_DEFAULT (0x4B)
 */
function getMoondropReportId(device: HIDDevice): number {
	// FreeDSP (PID 0x1496) exposes output reports only on Report ID 1
	if (device.productId === 0x1496) return 1;
	// All other Moondrop/Comtrue devices
	return REPORT_ID_DEFAULT;
}

/**
 * Get the correct HID packet size for a Moondrop device.
 * Different Moondrop devices use different packet sizes:
 * - Dawn Pro 2 (PID 0x011D): 63 bytes
 * - Free DSP (PID 0x1496): 61 bytes (reportCount=61 from HID descriptor)
 * - Default: 63 bytes (safe fallback)
 */
function getMoondropPacketSize(device: HIDDevice): number {
	// Dawn Pro 2 (PID 0x011D) uses 63 bytes
	if (device.productId === 0x011D) return 63;

	// Free DSP (PID 0x1496): HID outputReport has reportCount=61
	if (device.productId === 0x1496) return 61;

	// Default for unknown Moondrop devices: 63 bytes (safe fallback)
	return 63;
}

/**
 * Send a report to a Moondrop device.
 * Attempts sendReport first, and falls back to sendFeatureReport if it fails.
 */
async function sendMoondropReport(device: HIDDevice, packet: Uint8Array) {
	const reportId = getMoondropReportId(device);
	logTx(reportId, packet);
	try {
		await device.sendReport(reportId, packet);
	} catch (err) {
		const errMsg = (err as Error).message || "";
		console.warn(`[Moondrop TX] sendReport(id=${reportId}) failed: ${errMsg}. Retrying via sendFeatureReport...`);
		try {
			await device.sendFeatureReport(reportId, packet);
		} catch (featErr) {
			console.error(`[Moondrop TX] sendFeatureReport(id=${reportId}) also failed:`, featErr);
			throw featErr;
		}
	}
}


const REV_TYPE_MAP_JA11: Record<number, string> = { 0: "PK", 1: "LSQ", 2: "HSQ" };

/**
 * DETECT PROTOCOL BASED ON VENDOR ID AND DATABASE
 */
export function getProtocol(device: HIDDevice) {
	// 1. Check merged active database
	const match = activeDacs.find(
		(d) =>
			d.vid === device.vendorId &&
			(d.pid === undefined || d.pid === device.productId)
	);
	if (match) return match.protocol;

	// 2. Check stored custom USB override
	try {
		const storedStr = localStorage.getItem("customUsbOverride");
		if (storedStr) {
			const stored = JSON.parse(storedStr);
			if (stored && stored.vid) {
				const storedVid = parseInt(stored.vid.startsWith("0x") ? stored.vid : "0x" + stored.vid, 16);
				const storedPid = stored.pid ? parseInt(stored.pid.startsWith("0x") ? stored.pid : "0x" + stored.pid, 16) : undefined;

				if (device.vendorId === storedVid && (storedPid === undefined || isNaN(storedPid) || device.productId === storedPid)) {
					if (stored.protocol) {
						return stored.protocol;
					}
				}
			}
		}
	} catch (e) {
		console.error("Error reading customUsbOverride for protocol detection", e);
	}

	// 3. Fallback to vendor ID matching
	if (device.vendorId === 0x35d8 && device.productId === 0x1496) return "CONEXANT";
	if (device.vendorId === VID_COMTRUE || device.vendorId === 0x35d8) return "MOONDROP";
	if (device.vendorId === VID_JKALLY_KTMICRO) return "FIIO_JA11";
	if (device.vendorId === VID_FIIO) {
		const prodName = (device.productName || "").toUpperCase();
		if (device.productId === 258 || prodName.includes("JA11")) return "FIIO_JA11";
		return "FIIO";
	}
	return "SAVITECH"; // Default (used by CB5100/Audiocular Aura)
}

/**
 * GET ACTIVE DEVICE PROTOCOL
 */
export function getActiveProtocol(): string {
	const device = getDevice();
	if (!device) return "NONE";
	return getProtocol(device);
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

	// Moondrop/Conexant uses host-side coefficient calculation; A/B level-matching would corrupt the gain value.
	let appliedGain = gain;
	if (protocol !== "MOONDROP" && protocol !== "CONEXANT") {
		if (typeof (window as any).isCompareActive === "function" && (window as any).isCompareActive()) {
			const gA = (window as any).getSlotAGain?.() ?? 0;
			const gB = (window as any).getSlotBGain?.() ?? 0;
			appliedGain = Math.min(gA, gB);
		}
	} else {
		// Moondrop/Conexant hardware range is -20 to +10 dB
		appliedGain = Math.max(-20, Math.min(10, appliedGain));
	}

	console.debug(`[DEBUG] setDeviceGlobalGain: protocol=${protocol}, raw=${gain}, applied=${appliedGain}`);

	if (protocol === "FIIO") {
		await setGlobalGainFiio(device, appliedGain);
	} else if (protocol === "FIIO_JA11") {
		await setMasterGainJa11(device, appliedGain);
	} else if (protocol === "MOONDROP") {
		await setGlobalGainMoondrop(device, appliedGain);
	} else if (protocol === "CONEXANT") {
		await setGlobalGainConexant(device, appliedGain);
	} else {
		// Savitech Default
		const gVal = appliedGain < 0 ? 256 + Math.round(appliedGain) : Math.round(appliedGain);
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
 * Wait for a specific input report matching a command and sub-command
 */
function waitForReport(
	device: HIDDevice,
	expectedCmd: number,
	expectedSubcmd: number,
	expectedBandIndex?: number,
	timeoutMs = 200,
): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			device.removeEventListener("inputreport", listener);
			reject(new Error(`Timeout waiting for cmd=${expectedCmd}, subcmd=${expectedSubcmd}`));
		}, timeoutMs);

		function listener(event: any) {
			const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
			const cmd = data[0];
			const subcmd = data[1];

			if (cmd === expectedCmd && subcmd === expectedSubcmd) {
				const bandIdxIndex = 4;
				if (expectedBandIndex === undefined || data[bandIdxIndex] === expectedBandIndex) {
					clearTimeout(timer);
					device.removeEventListener("inputreport", listener);
					resolve(data);
				}
			}
		}

		device.addEventListener("inputreport", listener);
	});
}

/**
 * Read preamp gain and 10 bands sequentially from a Moondrop/Comtrue device
 */
async function readMoondropParams(device: HIDDevice): Promise<{ preamp: number; bands: any[] }> {
	log("Reading Moondrop device configuration...");

	// 1. Read preamp gain
	const gainPacket = new Uint8Array(getMoondropPacketSize(device));
	gainPacket[0] = CMD_MOON.READ;
	gainPacket[1] = CMD_MOON.PRE_GAIN;

	let preamp = 0;
	try {
		const promise = waitForReport(device, CMD_MOON.READ, CMD_MOON.PRE_GAIN, undefined, 200);
		console.debug("[Moondrop] Sending read preamp request:", gainPacket);
		await sendMoondropReport(device, gainPacket);
		console.debug("[Moondrop] Read preamp request sent.");
		const response = await promise;

		const raw = response[3] | (response[4] << 8);
		const signed = raw > 32767 ? raw - 65536 : raw;
		preamp = Number.parseFloat((signed / 256).toFixed(1));
		log(`[Moondrop] Read Preamp: ${preamp} dB`);
	} catch (e) {
		log(`[Moondrop] Preamp read failed: ${(e as Error).message}`);
		throw e;
	}

	// 2. Read all 10 bands sequentially
	const bands: any[] = [];
	const typeMapRev: Record<number, string> = { 1: "LSQ", 2: "PK", 3: "HSQ" };

	for (let i = 0; i < 10; i++) {
		const bandPacket = new Uint8Array(getMoondropPacketSize(device));
		bandPacket[0] = CMD_MOON.READ;

		bandPacket[1] = CMD_MOON.UPDATE_EQ;
		bandPacket[2] = 0x18;
		bandPacket[3] = 0;
		bandPacket[4] = i;

		try {
			const promise = waitForReport(device, CMD_MOON.READ, CMD_MOON.UPDATE_EQ, i, 200);
			await sendMoondropReport(device, bandPacket);
			const response = await promise;

			let freq = response[27] | (response[28] << 8);
			const qRaw = response[29] | (response[30] << 8);
			const gainRaw = response[31] | (response[32] << 8);

			let q = Number.parseFloat((qRaw / 256).toFixed(2));
			const signedGain = gainRaw > 32767 ? gainRaw - 65536 : gainRaw;
			let gain = Number.parseFloat((signedGain / 256).toFixed(1));
			let type = typeMapRev[response[33]] || "PK";

			// Interpret zero/invalid values as flat default band
			if (freq === 0 || isNaN(freq) || q <= 0 || isNaN(q)) {
				const defaultFreqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
				freq = defaultFreqs[i];
				gain = 0;
				q = 0.75;
				type = "PK";
			}

			bands.push({
				index: i,
				freq,
				gain,
				q,
				type,
				enabled: true,
			});
		} catch (e) {
			log(`[Moondrop] Band ${i + 1} read failed: ${(e as Error).message}`);
			throw e;
		}
	}

	return { preamp, bands };
}

/**
 * Read parameters from device configuration
 * @param device The WebHID device
 */
export async function readDeviceParams(device: HIDDevice) {
	if (!device) return;
	showSyncing();
	try {
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
		} else if (protocol === "MOONDROP") {
			try {
				let { preamp, bands } = await readMoondropParams(device);
				if (preamp === 0 && device) {
					if (getAutoPreampEnabled()) {
						preamp = getGlobalGainState();
					} else {
						const deviceKey = `last_preamp_gain_${device.vendorId}_${device.productId}`;
						let savedVal = localStorage.getItem(deviceKey);
						if (savedVal === null) {
							savedVal = localStorage.getItem("aura_active_manual_preamp");
						}
						if (savedVal === null) {
							savedVal = localStorage.getItem("aura_active_preamp_gain");
						}
						if (savedVal !== null) {
							preamp = Number(savedVal);
						} else {
							preamp = getManualPreampState() || getGlobalGainState() || 0;
						}
					}
				}
				setGlobalGain(preamp);
				setEqState(bands);
				renderUI(bands);
				log("Moondrop configuration loaded successfully.");
			} catch (err) {
				log(`[Moondrop] Device read not supported or failed (${(err as Error).message}). Loading configuration from local storage.`);
				// Load last saved values from localStorage
				const isDawnPro2 = device.vendorId === 0x35d8 && device.productId === 0x11d;
				let savedEq = null;
				let savedGain = null;

				if (isDawnPro2) {
					savedEq = localStorage.getItem(`last_eq_state_${device.vendorId}_${device.productId}`);
					savedGain = localStorage.getItem(`last_preamp_gain_${device.vendorId}_${device.productId}`);
				}

				if (!savedEq) savedEq = localStorage.getItem("aura_active_eq_state");
				if (!savedGain) savedGain = localStorage.getItem("aura_active_preamp_gain");
				
				let preamp = savedGain !== null ? Number(savedGain) : 0;
				let bands = savedEq ? JSON.parse(savedEq) : defaultEqState();
				
				setGlobalGain(preamp);
				setEqState(bands);
				renderUI(bands);
				
				// Sync the loaded localStorage settings to the device so the device is updated
				log("[Moondrop] Syncing local storage configuration to device...");
				try {
					await syncToDevice();
				} catch (syncErr) {
					log(`[Moondrop] Initial sync failed: ${(syncErr as Error).message}`);
				}
			}
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
	} finally {
		hideSyncing();
	}
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

	if (balanceVal) {
		if (balance === 0) {
			balanceVal.setAttribute("data-i18n", "balance_center_val");
			balanceVal.innerText = t("balance_center_val");
		} else if (balance < 0) {
			balanceVal.removeAttribute("data-i18n");
			balanceVal.innerText = `L +${Math.abs(balance)}`;
		} else {
			balanceVal.removeAttribute("data-i18n");
			balanceVal.innerText = `R +${balance}`;
		}
	}
}

/**
 * Listen to incoming input reports from the device
 * @param device The WebHID device
 */
export function setupListener(device: HIDDevice) {
	const eqState = getEqState();
	device.addEventListener("inputreport", (event) => {
		const versionEl = document.getElementById("fwVersion");
		const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
		logRx(event.reportId, data);

		const protocol = getProtocol(device);
		if (protocol === "FIIO_JA11") {
			const cmd = data[4];
			if (cmd === 23) {
				const raw = (data[7] << 8) | data[6];
				const signed = raw > 32767 ? raw - 65536 : raw;
				let gain = Number.parseFloat((signed / 2560).toFixed(1));
				if (gain === 0 && device) {
					if (getAutoPreampEnabled()) {
						gain = getGlobalGainState();
					} else {
						const deviceKey = `last_preamp_gain_${device.vendorId}_${device.productId}`;
						let savedVal = localStorage.getItem(deviceKey);
						if (savedVal === null) {
							savedVal = localStorage.getItem("aura_active_manual_preamp");
						}
						if (savedVal === null) {
							savedVal = localStorage.getItem("aura_active_preamp_gain");
						}
						if (savedVal !== null) {
							gain = Number(savedVal);
						} else {
							gain = getManualPreampState() || getGlobalGainState() || 0;
						}
					}
				}
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

		if (protocol === "MOONDROP" || protocol === "CONEXANT") {
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
			let gain = new Int8Array([data[4]])[0];
			console.log(`[Debug] setupListener CMD_SAVI.GAIN: raw gain byte = ${data[4]}, parsed gain = ${gain}`);
			if (gain === 0 && device) {
				if (getAutoPreampEnabled()) {
					gain = getGlobalGainState();
				} else {
					const deviceKey = `last_preamp_gain_${device.vendorId}_${device.productId}`;
					let savedVal = localStorage.getItem(deviceKey);
					console.log(`[Debug] setupListener fallback check: deviceKey = ${deviceKey}, savedVal = ${savedVal}`);
					if (savedVal === null || savedVal === "0") {
						savedVal = localStorage.getItem("aura_active_manual_preamp");
						console.log(`[Debug] setupListener fallback check: checking aura_active_manual_preamp = ${savedVal}`);
					}
					if (savedVal === null || savedVal === "0") {
						savedVal = localStorage.getItem("aura_active_preamp_gain");
						console.log(`[Debug] setupListener fallback check: checking aura_active_preamp_gain = ${savedVal}`);
					}
					if (savedVal !== null && savedVal !== "0") {
						gain = Number(savedVal);
					} else {
						gain = getManualPreampState() || getGlobalGainState() || 0;
					}
				}
			}
			setGlobalGain(gain);
		} else if (cmd === 17) { // Filter
			const val = data[3];
			const filters = ["FAST-LL", "FAST-PC", "Slow-LL", "Slow-PC", "NON-OS"];
			const filter = filters[val - 1];
			if (filter) {
				const selFilterType = document.getElementById("selFilterType") as HTMLSelectElement;
				const filterDescBox = document.getElementById("filterDescBox") as HTMLElement;
				const filterTypeVal = document.getElementById("filterTypeVal") as HTMLElement;
				if (selFilterType) selFilterType.value = filter;
				if (filterTypeVal && selFilterType) filterTypeVal.innerText = selFilterType.options[selFilterType.selectedIndex].text;
				if (filterDescBox) {
					filterDescBox.innerHTML = t("filter_desc_" + filter.toLowerCase().replace("-", "_"));
				}
			}
		} else if (cmd === 29) { // Amp Mode
			const val = data[3];
			const toggleAmpMode = document.getElementById("toggleAmpMode") as HTMLInputElement;
			const ampLabelClassH = document.getElementById("ampLabelClassH") as HTMLElement;
			const ampLabelClassAB = document.getElementById("ampLabelClassAB") as HTMLElement;
			if (toggleAmpMode) {
				const isClassAB = (val === 1);
				toggleAmpMode.checked = isClassAB;
				if (isClassAB) {
					ampLabelClassH?.classList.remove("active");
					ampLabelClassAB?.classList.add("active");
				} else {
					ampLabelClassH?.classList.add("active");
					ampLabelClassAB?.classList.remove("active");
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
				const view = event.data;
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

	showSyncing();
	try {
		const protocol = getProtocol(device);
		console.debug(`[DEBUG] syncToDevice: Starting sync with protocol=${protocol}`);
		log(`Syncing via protocol: ${protocol}...`);

		// Moondrop: use dedicated sync path
		if (protocol === "MOONDROP") {
			// Persist device-specific EQ state
			localStorage.setItem(`last_eq_state_${device.vendorId}_${device.productId}`, JSON.stringify(eqState));

			// Write all bands sequentially (including disabled ones) using Moondrop's coefficient-based writes
			for (const band of eqState) {
				await writeBand(device, band, "MOONDROP");
				await delay(30);
			}
			// Write gain without A/B modifications
			await setDeviceGlobalGain(getGlobalGainState(), true);

			// Activate/Select custom EQ preset slot index 0 to ensure the coefficients take effect immediately
			await selectPresetMoondrop(device, 0);

			console.debug("[DEBUG] syncToDevice: Moondrop dedicated sync path completed.");
			log("Sync Complete.");
			return;
		}

		// Conexant: use dedicated sync path
		if (protocol === "CONEXANT") {
			// Persist device-specific EQ state
			localStorage.setItem(`last_eq_state_${device.vendorId}_${device.productId}`, JSON.stringify(eqState));

			// Write all bands sequentially (write to RAM)
			for (const band of eqState) {
				await writeBandConexant(device, band, (band.enabled ? band.gain : 0) + getTiltGainAtFreq(band.freq), false);
				await delay(30);
			}

			// Activate/Select custom EQ mode index 0
			await switchEQModeConexant(device, 0);

			console.debug("[DEBUG] syncToDevice: Conexant dedicated sync path completed.");
			log("Sync Complete.");
			return;
		}

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

		// Save current profile name to device-specific key in localStorage (skip during active A/B compare)
		if (typeof (window as any).isCompareActive === "function" && !(window as any).isCompareActive()) {
			const currentName = getLastAppliedEqName();
			if (currentName) {
				localStorage.setItem(`last_applied_eq_${device.vendorId}_${device.productId}`, currentName);
			}
		}
	} finally {
		hideSyncing();
	}
}

/**
 * Flash settings permanently to device memory
 */
export async function flashToFlash() {
	const device = getDevice();
	if (!device) return;
	if (!confirm("Save to permanent memory? The settings will load automatically when you power on the DAC.")) return;

	showSyncing();
	try {
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
			const packet = new Uint8Array(getMoondropPacketSize(device));
			packet[0] = CMD_MOON.WRITE;
			packet[1] = CMD_MOON.SAVE_FLASH;
			await sendMoondropReport(device, packet);
		} else if (protocol === "CONEXANT") {
			// Write all bands in Flash Mode (flash = true)
			const eqState = getEqState();
			if (eqState) {
				for (const band of eqState) {
					const val = (band.enabled ? band.gain : 0) + getTiltGainAtFreq(band.freq);
					const effectiveGain = Math.max(-12, Math.min(12, val));
					await writeBandConexant(device, band, effectiveGain, true);
					await delay(30);
				}
			}
			// Send the final Flash commit packet: command 220 [-1, 0, 0, 0, 0, ...]
			const commitData = new Array(13).fill(0);
			commitData[0] = -1; // -1 represents commit / save custom EQ option
			const commitPacket = buildConexantPacket(220, commitData);
			await sendConexantReport(device, commitPacket);
			await delay(100);
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

		// If A/B comparison is active, copy Slot B's settings to Slot A baseline on save
		if (typeof updateBaselineFromActive === "function") {
			updateBaselineFromActive();
		}

		// Save current profile name to device-specific key in localStorage
		const currentName = getLastAppliedEqName();
		if (currentName) {
			localStorage.setItem(`last_applied_eq_${device.vendorId}_${device.productId}`, currentName);
		}
	} finally {
		hideSyncing();
	}
}

/**
 * Dispatch band writing to appropriate protocol handler
 */
export async function writeBand(
	device: HIDDevice,
	band: Band,
	protocol: string,
) {
	let val = (band.enabled ? band.gain : 0) + getTiltGainAtFreq(band.freq);
	const effectiveGain = Math.max(-12, Math.min(12, val));

	if (protocol === "FIIO") {
		await writeBandFiio(device, band, effectiveGain);
	} else if (protocol === "FIIO_JA11") {
		await writeBandJa11(device, band, effectiveGain);
	} else if (protocol === "MOONDROP") {
		await writeBandMoondrop(device, band, effectiveGain);
	} else if (protocol === "CONEXANT") {
		await writeBandConexant(device, band, effectiveGain);
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
 * Write band for Moondrop devices.
 * Sends one UPDATE_EQ packet per supported sample rate (44100, 48000, 96000,
 * 192000 Hz) with coefficients computed at the correct Fs for each slot.
 * This matches the per-rate "saveEQParamsToFlash" flow in the official
 * Moondrop Android app (FreemanCnxtUsbDevice). 384000 Hz is skipped because
 * the CT7601 SDK itself cannot compute valid coefficients at that rate
 * (convertRes=1024 / eqCoeff==null), as confirmed by the Android logcat.
 */
async function writeBandMoondrop(device: HIDDevice, band: Band, gain: number) {
	try {
		const typeMap = { PK: 2, LSQ: 1, HSQ: 3 };

		// Build shared per-band metadata once
		const qVal = Math.round(band.q * 256);
		const gainVal = Math.round(gain * 256);
		const typeCode = typeMap[band.type as keyof typeof typeMap] || 2;

		// Send one UPDATE_EQ packet per sample rate with correctly-computed coefficients
		for (const [sampleRateIdx, sampleRate] of MOONDROP_SAMPLE_RATES) {
			const coeffs = encodeBiquadMoondropForRate(band.type, band.freq, gain, band.q, sampleRate);
			const coeffBytes = encodeToByteArray(coeffs);

			const packet = new Uint8Array(getMoondropPacketSize(device));
			packet[0] = CMD_MOON.WRITE;
			packet[1] = CMD_MOON.UPDATE_EQ;
			packet[2] = 0x18;
			packet[3] = sampleRateIdx; // CT7601 sample-rate slot index (4-7)
			packet[4] = band.index;

			packet.set(coeffBytes, 7);

			packet[27] = band.freq & 0xff;
			packet[28] = (band.freq >> 8) & 0xff;
			packet[29] = qVal & 255;
			packet[30] = (qVal >> 8) & 255;
			packet[31] = gainVal & 255;
			packet[32] = (gainVal >> 8) & 255;
			packet[33] = typeCode;
			packet[35] = 0;

			console.debug(
				`[Moondrop] Writing band ${band.index} @ ${sampleRate} Hz (idx ${sampleRateIdx}): ` +
				`freq=${band.freq}, gain=${gain}, q=${band.q}`
			);
			await sendMoondropReport(device, packet);
			await delay(10); // Small inter-rate delay to avoid USB buffer overrun
		}

		// Send UPDATE_EQ_COEFF trigger once after all sample-rate packets for this band
		const enablePacket = new Uint8Array(getMoondropPacketSize(device));
		enablePacket[0] = CMD_MOON.WRITE;
		enablePacket[1] = CMD_MOON.UPDATE_EQ_COEFF;
		enablePacket[2] = band.index;
		enablePacket[4] = 255;
		enablePacket[5] = 255;
		enablePacket[6] = 255;
		await sendMoondropReport(device, enablePacket);

		// Activate/Select custom EQ preset slot index 0 to ensure the coefficients take effect immediately
		await selectPresetMoondrop(device, 0);
	} catch (err) {
		console.error(`[Moondrop] Failed to write band ${band.index}:`, err);
		log(`[Moondrop] Write band ${band.index} failed: ${(err as Error).message}`);
		throw err;
	}
}

/**
 * Select a specific EQ preset/profile index on Moondrop/Comtrue devices.
 * Custom/User PEQ slot is always index 0.
 */
async function selectPresetMoondrop(device: HIDDevice, index: number) {
	try {
		const packet = new Uint8Array(getMoondropPacketSize(device));
		packet[0] = CMD_MOON.WRITE;
		packet[1] = CMD_MOON.SELECT_PRESET;
		packet[2] = 0;
		packet[3] = index & 0xff;
		packet[4] = (index >> 8) & 0xff;
		console.debug(`[Moondrop] Selecting EQ preset slot index: ${index}`);
		await sendMoondropReport(device, packet);
	} catch (err) {
		console.error(`[Moondrop] Failed to select preset slot index ${index}:`, err);
		log(`[Moondrop] Select preset failed: ${(err as Error).message}`);
		throw err;
	}
}

/**
 * --- CONEXANT (FREEMAN) PROTOCOL HANDLERS ---
 */

const CONEXANT_SAMPLE_RATES: ReadonlyArray<[number, number]> = [
	[4, 44100],
	[5, 48000],
	[6, 96000],
	[7, 192000],
	[8, 384000],
];

/**
 * Encodes Peaking Biquad filters specifically for Conexant.
 * Conexant expects coefficients scaled by 2^22 (Q22 fixed point) and negative A coefficients.
 */
function encodeBiquadConexantForRate(type: string, freq: number, gain: number, q: number, sampleRate: number): number[] {
	const coeffs = computeBiquadCoeffs(type, freq, gain, q, sampleRate);
	const scale = 4194304; // Q22 = 2^22

	return [
		coeffs.b0,
		coeffs.b1,
		coeffs.b2,
		-coeffs.a1, // Conexant expects -a1
		-coeffs.a2, // Conexant expects -a2
	].map((c) => Math.round(c * scale));
}

/**
 * Packs a Conexant transaction into a little-endian 32-bit packet array.
 */
function buildConexantPacket(commandId: number, data: number[]): Uint8Array {
	const packet = new Uint8Array(61);
	packet[0] = 1; // Report ID = 1
	packet[1] = 1 & 0xff; // transaction ID low
	packet[2] = (1 >> 8) & 0xff; // transaction ID high

	const numWords = data.length;
	const p1_combined = (numWords & 0xff) | ((commandId & 0xfff) << 16);
	packet[3] = p1_combined & 0xff;
	packet[4] = (p1_combined >> 8) & 0xff;
	packet[5] = (p1_combined >> 16) & 0xff;
	packet[6] = (p1_combined >> 24) & 0xff;

	// Module ID = CafId("CTRL") = 0xB32D2300
	const moduleId = 0xB32D2300;
	packet[7] = moduleId & 0xff;
	packet[8] = (moduleId >> 8) & 0xff;
	packet[9] = (moduleId >> 16) & 0xff;
	packet[10] = (moduleId >> 24) & 0xff;

	// Write 32-bit data words
	for (let i = 0; i < numWords; i++) {
		const val = data[i];
		const offset = 11 + i * 4;
		packet[offset] = val & 0xff;
		packet[offset + 1] = (val >> 8) & 0xff;
		packet[offset + 2] = (val >> 16) & 0xff;
		packet[offset + 3] = (val >> 24) & 0xff;
	}

	return packet;
}

/**
 * Send a report to a Conexant device.
 * Attempts sendReport first, and falls back to sendFeatureReport if it fails.
 */
async function sendConexantReport(device: HIDDevice, packet: Uint8Array) {
	const reportId = 1;
	logTx(reportId, packet);
	try {
		await device.sendReport(reportId, packet);
	} catch (err) {
		const errMsg = (err as Error).message || "";
		console.warn(`[Conexant TX] sendReport(id=${reportId}) failed: ${errMsg}. Retrying via sendFeatureReport...`);
		try {
			await device.sendFeatureReport(reportId, packet);
		} catch (featErr) {
			console.error(`[Conexant TX] sendFeatureReport(id=${reportId}) also failed:`, featErr);
			throw featErr;
		}
	}
}

/**
 * Sets EQ Mode on Conexant. Index 0 is the custom/user EQ slot.
 */
async function switchEQModeConexant(device: HIDDevice, index: number) {
	try {
		// Switch mode payload: command 90 [90, index, 0, 0, ...]
		const data = new Array(13).fill(0);
		data[0] = 90;
		data[1] = index;
		const packet = buildConexantPacket(90, data);
		await sendConexantReport(device, packet);
		console.debug(`[Conexant] Switched EQ Mode to index: ${index}`);
	} catch (err) {
		console.error("[Conexant] Failed to switch EQ Mode:", err);
		throw err;
	}
}

/**
 * Set global preamp gain for Conexant.
 */
async function setGlobalGainConexant(device: HIDDevice, gain: number) {
	// Conexant doesn't have a direct master preamp command in the log,
	// but we can scale coefficients or save/commit custom preamp.
	console.debug(`[Conexant] setGlobalGainConexant: ${gain} dB (stored in state) for device ${device.vendorId}`);
}

/**
 * Write Conexant Band.
 * For real-time updates, write to RAM using command 190 (0xbe).
 * For Flash writes, write metadata + coefficients using command 220 (0xdc).
 */
async function writeBandConexant(device: HIDDevice, band: Band, gain: number, flash = false) {
	try {
		const bandIdx = band.index + 1; // 1-based index (1..9)
		const typeMap = { PK: 0, LSQ: 1, HSQ: 2 }; // 0: PK, 1: LSQ, 2: HSQ
		const filterType = typeMap[band.type as keyof typeof typeMap] ?? 0;

		if (flash) {
			// 1. Write Metadata: [0, bandIdx, freq, Q*256, type, gain*256]
			const metadata = new Array(13).fill(0);
			metadata[0] = 0;
			metadata[1] = bandIdx;
			metadata[2] = band.freq;
			metadata[3] = Math.round(band.q * 256);
			metadata[4] = filterType;
			metadata[5] = Math.round(gain * 256);

			const metaPacket = buildConexantPacket(220, metadata);
			await sendConexantReport(device, metaPacket);
			await delay(15);

			// 2. Write coefficients for all 5 sample rates to Flash (command 220)
			for (const [rateIdx, rateVal] of CONEXANT_SAMPLE_RATES) {
				const q22Coeffs = encodeBiquadConexantForRate(band.type, band.freq, gain, band.q, rateVal);
				const data = new Array(13).fill(0);
				data[0] = rateIdx;
				data[1] = bandIdx;
				data[2] = 3; // pEQCoeff.Gain slot (always 3 in Conexant log)
				data[3] = q22Coeffs[0]; // B0
				data[4] = q22Coeffs[1]; // B1
				data[5] = q22Coeffs[2]; // B2
				data[6] = q22Coeffs[3]; // A0 (-a1)
				data[7] = q22Coeffs[4]; // A1 (-a2)

				const coeffPacket = buildConexantPacket(220, data);
				await sendConexantReport(device, coeffPacket);
				await delay(15);
			}
		} else {
			// Write to RAM: command 190 (0xbe)
			// RAM payload structure: [0, bandIdx, gain*256 (preamp/gain?), B0, B1, B2, A0, A1, ...]
			// Note: RAM coefficients are usually written for the current active sample rate, 
			// but we can write to all sample rates or update the active slot index (index 0).
			for (const [rateIdx, rateVal] of CONEXANT_SAMPLE_RATES) {
				const q22Coeffs = encodeBiquadConexantForRate(band.type, band.freq, gain, band.q, rateVal);
				const data = new Array(13).fill(0);
				data[0] = rateIdx;
				data[1] = bandIdx;
				data[2] = 3;
				data[3] = q22Coeffs[0];
				data[4] = q22Coeffs[1];
				data[5] = q22Coeffs[2];
				data[6] = q22Coeffs[3];
				data[7] = q22Coeffs[4];

				const ramPacket = buildConexantPacket(190, data);
				await sendConexantReport(device, ramPacket);
				await delay(15);
			}
		}
	} catch (err) {
		console.error(`[Conexant] Failed to write band ${band.index}:`, err);
		log(`[Conexant] Write band ${band.index} failed: ${(err as Error).message}`);
		throw err;
	}
}

/**
 * Set Moondrop global gain
 */
async function setGlobalGainMoondrop(device: HIDDevice, gain: number) {
	try {
		const val = Math.round(gain * 256);
		const packet = new Uint8Array(getMoondropPacketSize(device));
		packet[0] = CMD_MOON.WRITE;
		packet[1] = CMD_MOON.PRE_GAIN;
		packet[2] = 0;
		packet[3] = val & 255;
		packet[4] = (val >> 8) & 255;
		console.debug(`[Moondrop] Writing global gain: ${gain} dB`);
		await sendMoondropReport(device, packet);
	} catch (err) {
		console.error(`[Moondrop] Failed to write global gain:`, err);
		log(`[Moondrop] Write global gain failed: ${(err as Error).message}`);
		throw err;
	}
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
	const gainHigh = (t >> 8) & 0xff;
	const gainLow = t & 0xff;

	const qVal = Math.round(band.q * 100);
	const qHigh = (qVal >> 8) & 0xff;
	const qLow = qVal & 0xff;

	const packet = new Uint8Array([
		CMD_FIIO.HEADER_SET_1,
		CMD_FIIO.HEADER_SET_2,
		0,
		0,
		CMD_FIIO.FILTER_PARAMS,
		8,
		band.index,
		gainHigh,
		gainLow,
		freqHigh,
		freqLow,
		qHigh,
		qLow,
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
		case "NOTCH": {
			// Notch filter
			b0 = 1;
			b1 = -2 * cosw;
			b2 = 1;
			a0 = 1 + alpha;
			a1 = -2 * cosw;
			a2 = 1 - alpha;
			break;
		}
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
 * Moondrop sample rate table.
 * Maps the CT7601 sampleRateIndex (as seen in Android logcat) to its Hz value.
 * Index 8 (384000 Hz) is intentionally omitted — the CT7601 SDK itself fails
 * to compute valid coefficients at 384 kHz (convertRes=1024, eqCoeff==null),
 * as confirmed by the official Moondrop Android app logcat.
 */
const MOONDROP_SAMPLE_RATES: ReadonlyArray<[number, number]> = [
	[4, 44100],
	[5, 48000],
	[6, 96000],
	[7, 192000],
];

/**
 * Moondrop DSP Math: compute Q30 biquad coefficients for a specific sample rate.
 */
function encodeBiquadMoondropForRate(type: string, freq: number, gain: number, q: number, sampleRate: number) {
	const coeffs = computeBiquadCoeffs(type, freq, gain, q, sampleRate);
	const s = 1073741824; // Q30 = 2^30

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
		case "NON-OS": r = 5; break;
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
		showSyncing();
		try {
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
			} else if (protocol === "CONEXANT") {
				try {
					await switchEQModeConexant(device, 0);
				} catch (e) {
					log(`Conexant Realtime Commit Error: ${(e as Error).message}`);
				}
			}
		} finally {
			hideSyncing();
		}
	}, 50); // 50ms batching window
}

export async function executeFactoryReset(device: HIDDevice) {
	log("Executing Factory Reset...");
	showSyncing();
	try {
		await sendPacketSavitech(device, [1, 23, 0]);
		await delay(100);
		await refreshToFlash(device);
	} finally {
		hideSyncing();
	}
}
