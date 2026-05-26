import {
	defaultEqState,
	getDevice,
	getEqState,
	getGlobalGainState,
	renderUI,
	setEqState,
	setGlobalGainState,
} from "./fn.ts";
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
	const bands: EQ = defaultEqState(); // Start with defaults
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
				let finalType = type;
				if (type === "LS") finalType = "LSQ";
				if (type === "HS") finalType = "HSQ";

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
	reader.onload = (event) => {
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

			// Update internal state
			setEqState(profile.bands);
			setGlobalGainState(profile.globalGain);

			// Update UI and send preamp packet
			updateGlobalGain(profile.globalGain);
			renderUI(profile.bands);

			log("Profile imported successfully. Click 'SYNC' to apply to the DAC.");
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
 */
export function loadProfileFromText(content: string) {
	try {
		const profile = parseTextProfile(content);

		// Update internal state
		setEqState(profile.bands);
		setGlobalGainState(profile.globalGain);

		// Update UI and send preamp packet
		updateGlobalGain(profile.globalGain);
		renderUI(profile.bands);

		log("AutoEq preset loaded. Click 'SYNC TO RAM' to apply settings to the DAC.");
	} catch (err) {
		log(`AutoEq Parsing Error: ${(err as Error).message}`);
		console.error(err);
	}
}
