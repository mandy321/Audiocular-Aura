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
import type { Band, EQ } from "./main.ts";

interface ProfileData {
	globalGain: number;
	bands: EQ;
}

/**
 * Returns a neutral/flat band at a given index.
 * Used to fill any unspecified slots when importing a profile.
 */
function neutralBand(index: number): Band {
	return {
		index,
		freq: 1000,
		gain: 0,
		q: 0.71,
		type: "PK",
		enabled: true,
	};
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
 * Export profile to AutoEq-compatible parametric text file
 * Format: Preamp: X dB / Filter N: ON/OFF PK|LSQ|HSQ Fc XXXX Hz Gain X.X dB Q X.XX
 */
export async function exportProfileAsText() {
	const device = getDevice();
	const globalGainState = getGlobalGainState();
	const eqState = getEqState();
	if (!device) return;

	// Map internal type names to AutoEq standard names
	const typeMap: Record<string, string> = {
		PK: "PK",
		LSQ: "LSQ",
		HSQ: "HSQ",
	};

	const lines: string[] = [];
	lines.push(`Preamp: ${globalGainState.toFixed(1)} dB`);

	eqState.forEach((band, i) => {
		const enabled = band.enabled ? "ON" : "OFF";
		const type = typeMap[band.type] || "PK";
		const freq = Math.round(band.freq);
		const gain = band.gain.toFixed(1);
		const q = band.q.toFixed(2);
		lines.push(`Filter ${i + 1}: ${enabled} ${type} Fc ${freq} Hz Gain ${gain} dB Q ${q}`);
	});

	const text = lines.join("\n");
	const blob = new Blob([text], { type: "text/plain" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = "aura_peq_profile.txt";
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
	const currentBandsCount = getEqState().length;
	// Start from a clean neutral baseline — never inherit current active EQ values
	const bands: EQ = Array.from({ length: currentBandsCount }, (_, i) => neutralBand(i)) as EQ;
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
				// Fill remaining slots with neutral flat bands, not current EQ state
				const extraNeutral = Array.from(
					{ length: currentBandsCount - importedBands.length },
					(_, i) => neutralBand(importedBands.length + i)
				);
				importedBands = [...importedBands, ...extraNeutral];
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
			// Fill remaining slots with neutral flat bands, not current EQ state
			const extraNeutral = Array.from(
				{ length: currentBandsCount - importedBands.length },
				(_, i) => neutralBand(importedBands.length + i)
			);
			importedBands = [...importedBands, ...extraNeutral];
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
