import {
	getDevice,
	getEqState,
	getGlobalGainState,
	renderUI,
	setEqState,
	setGlobalGainState,
	setLastAppliedEqName,
} from "./fn.ts";
import { syncToDevice } from "./dsp.ts";
import { log, updateGlobalGain } from "./helpers.ts";
import type { EQ } from "./main.ts";

interface ProfileData {
	globalGain: number;
	bands: EQ;
}

/**
 * Export profile to JSON file
 */
export async function exportProfile() {
	const device = getDevice();
	const globalGainState = getGlobalGainState();
	const eqState = getEqState();
	if (!device) return;
	
	const data = {
		device: "Audiocular Aura",
		timestamp: new Date().toISOString(),
		globalGain: globalGainState,
		bands: eqState,
	};
	
	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: "application/json",
	});
	
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = "aura_peq_profile.json";
	a.click();
}

/**
 * Parse JSON profile data
 */
function parseJsonProfile(content: string): ProfileData {
	const data = JSON.parse(content);
	if (!data.bands) {
		throw new Error("Invalid JSON profile: missing 'bands' property");
	}
	return {
		globalGain: data.globalGain || 0,
		bands: data.bands,
	};
}

/**
 * Parse Text profile data (AutoEq format: Preamp: ... Filter X: ...)
 */
function parseTextProfile(content: string): ProfileData {
	const lines = content.split(/\r?\n/);
	const bands: EQ = JSON.parse(JSON.stringify(getEqState())); // Start with current state config length
	let globalGain = 0;

	// Regex for Preamp: "Preamp: -8.0 dB"
	const preampRegex = /^Preamp:\s*(-?\d+(\.\d+)?)\s*(?:dB)?/i;

	// Regex for Filter: "Filter 1: ON PK Fc 34 Hz Gain -2.6 dB Q 0.80"
	const filterRegex =
		/^Filter\s+(\d+):\s+(ON|OFF)\s+([A-Z]+)\s+Fc\s+(\d+(?:\.\d+)?)\s*(?:Hz)?\s+Gain\s+(-?\d+(?:\.\d+)?)\s*(?:dB)?\s+Q\s+(\d+(?:\.\d+)?)/i;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const preampMatch = trimmed.match(preampRegex);
		if (preampMatch) {
			globalGain = parseFloat(preampMatch[1]);
			continue;
		}

		const filterMatch = trimmed.match(filterRegex);
		if (filterMatch) {
			const index = parseInt(filterMatch[1], 10) - 1; // 1-based to 0-based
			if (index >= 0 && index < bands.length) {
				const enabled = filterMatch[2].toUpperCase() === "ON";
				const type = filterMatch[3].toUpperCase(); // e.g. PK, LSQ, HSQ
				const freq = parseFloat(filterMatch[4]);
				const gain = parseFloat(filterMatch[5]);
				const q = parseFloat(filterMatch[6]);

				// Normalize type names
				let finalType = "PK";
				if (type === "LS" || type === "LSC" || type === "LSQ") {
					finalType = "LSQ";
				} else if (type === "HS" || type === "HSC" || type === "HSQ") {
					finalType = "HSQ";
				}

				bands[index] = {
					...bands[index],
					freq,
					gain,
					q,
					type: finalType,
					enabled,
				};
			}
		}
	}

	return { globalGain, bands };
}

/**
 * Import profile from file
 * @param e Event object
 */
export async function importProfile(e: Event) {
	const target = e.target as HTMLInputElement;
	if (!target.files) return;
	const file = target.files[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = async (event) => {
		try {
			const result = event.target?.result as string;
			let profile: ProfileData;

			// Heuristic format detection
			if (result.trim().startsWith("{")) {
				profile = parseJsonProfile(result);
			} else if (
				result.trim().startsWith("Preamp:") ||
				result.includes("Filter 1:")
			) {
				profile = parseTextProfile(result);
			} else {
				throw new Error("Unknown file format. Must be JSON or AutoEq txt file.");
			}

			// Update internal state and handle variable band count
			let importedBands = profile.bands;
			const currentBandsCount = getEqState().length;
			if (importedBands.length > currentBandsCount) {
				log(`Note: Imported profile has ${importedBands.length} bands but current device only supports ${currentBandsCount} bands. Keeping the first ${currentBandsCount} bands.`);
				importedBands = importedBands.slice(0, currentBandsCount);
			} else if (importedBands.length < currentBandsCount) {
				const currentEq = getEqState();
				importedBands = [
					...importedBands,
					...JSON.parse(JSON.stringify(currentEq.slice(importedBands.length)))
				];
			}
			
			// Normalize indices to match new length
			importedBands.forEach((band, idx) => {
				band.index = idx;
			});

			// Re-create DOM elements for strips to ensure correct bands count
			const stripsContainer = document.getElementById("eqStrips");
			if (stripsContainer) {
				stripsContainer.innerHTML = "";
			}

			setEqState(importedBands);
			setGlobalGainState(profile.globalGain);

			// Update UI and send preamp packet
			updateGlobalGain(profile.globalGain);
			renderUI(importedBands);

			const name = `Imported: ${file.name.replace(/\.[^/.]+$/, "")}`;
			setLastAppliedEqName(name);

			const device = getDevice();
			if (device) {
				log(`Syncing imported profile to DAC...`);
				await syncToDevice();
				log(`Synced: ${name}`);
			} else {
				log("Profile imported successfully. Connect DAC and click SYNC to apply.");
			}
		} catch (err) {
			log(`Import Error: ${(err as Error).message}`);
			console.error(err);
		} finally {
			// Clear value to allow selecting same file again
			target.value = "";
		}
	};
	reader.readAsText(file);
}

/**
 * Load EQ profile from raw text content
 * @param content The raw txt preset content
 * @param presetName Name of the preset being loaded
 */
export async function loadProfileFromText(content: string, presetName?: string) {
	try {
		const profile = parseTextProfile(content);

		// Update internal state and handle variable band count
		let importedBands = profile.bands;
		const currentBandsCount = getEqState().length;
		if (importedBands.length > currentBandsCount) {
			importedBands = importedBands.slice(0, currentBandsCount);
		} else if (importedBands.length < currentBandsCount) {
			const currentEq = getEqState();
			importedBands = [
				...importedBands,
				...JSON.parse(JSON.stringify(currentEq.slice(importedBands.length)))
			];
		}
		
		// Normalize indices to match new length
		importedBands.forEach((band, idx) => {
			band.index = idx;
		});

		// Re-create DOM elements for strips to ensure correct bands count
		const stripsContainer = document.getElementById("eqStrips");
		if (stripsContainer) {
			stripsContainer.innerHTML = "";
		}

		// Update internal state
		setEqState(importedBands);
		setGlobalGainState(profile.globalGain);

		// Update UI and send preamp packet
		updateGlobalGain(profile.globalGain);
		renderUI(importedBands);

		const name = presetName || "Loaded Profile";
		setLastAppliedEqName(name);

		const device = getDevice();
		if (device) {
			log(`Syncing preset "${name}" to DAC...`);
			await syncToDevice();
			log(`Synced: ${name}`);
		} else {
			log(`Preset loaded. Connect DAC to sync.`);
		}
	} catch (err) {
		log(`AutoEq Parsing Error: ${(err as Error).message}`);
		console.error(err);
	}
}
