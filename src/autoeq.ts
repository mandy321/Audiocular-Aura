import { loadProfileFromText } from "./importExport.ts";
import { log } from "./helpers.ts";
import { trackEvent } from "./analytics.ts";

export interface AutoEqPreset {
	path: string;
	name: string;
}

let cachedPresets: AutoEqPreset[] = [];
const APP_VERSION = "1.1.0";

/**
 * Fetch and index the AutoEq presets tree from jaakkopasanen/AutoEq on GitHub
 */
export async function getAutoEqPresets(forceRefresh = false): Promise<AutoEqPreset[]> {
	if (!forceRefresh && cachedPresets.length > 0) {
		return cachedPresets;
	}

	// 1. Check LocalStorage Cache
	const cachedData = localStorage.getItem("autoeq_presets");
	const cacheTime = localStorage.getItem("autoeq_presets_time");
	const cacheVersion = localStorage.getItem("autoeq_presets_version");
	const cacheDuration = 7 * 24 * 60 * 60 * 1000; // 7 Days in milliseconds

	if (
		!forceRefresh &&
		cachedData &&
		cacheTime &&
		cacheVersion === APP_VERSION &&
		Date.now() - Number(cacheTime) < cacheDuration
	) {
		try {
			cachedPresets = JSON.parse(cachedData);
			return cachedPresets;
		} catch (err) {
			console.error("Failed to parse cached AutoEq presets", err);
		}
	}

	// 2. Fetch INDEX.md from Raw CDN
	log("Fetching AutoEq online database index...");
	
	try {
		const response = await fetch(
			"https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/INDEX.md"
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch database index: ${response.status} ${response.statusText}`);
		}

		const text = await response.text();
		const lines = text.split(/\r?\n/);
		const presets: AutoEqPreset[] = [];

		// Match pattern: - [Model Name](./relativePath)
		const regex = /^-\s+\[(.*?)\]\(\.\/(.*?)\)\s+by/;

		for (const line of lines) {
			const match = line.trim().match(regex);
			if (match) {
				const model = match[1];
				const relPathEscaped = match[2];
				const decodedPath = decodeURIComponent(relPathEscaped);
				
				const parts = decodedPath.split("/");
				if (parts.length >= 2) {
					const source = parts[0]; // e.g. "oratory1990", "crinacle"
					const folderName = parts[parts.length - 1]; // Last directory name
					
					// Reconstruct full path that jaakkopasanen repository uses
					const path = `results/${decodedPath}/${folderName} ParametricEQ.txt`;
					
					// Extract any targets or subfolders between the source and the model folder
					const subfolders = parts.slice(1, parts.length - 1).join(" / ");
					const name = `${model} (${source}${subfolders ? ` - ${subfolders}` : ""})`;

					presets.push({ path, name });
				}
			}
		}

		// 3. Sort alphabetically
		presets.sort((a, b) => a.name.localeCompare(b.name));

		// 4. Update local memory and cache
		cachedPresets = presets;
		localStorage.setItem("autoeq_presets", JSON.stringify(presets));
		localStorage.setItem("autoeq_presets_time", Date.now().toString());
		localStorage.setItem("autoeq_presets_version", APP_VERSION);

		log(`Successfully loaded & cached ${presets.length} headphone presets from AutoEq.`);
		return presets;
	} catch (err) {
		log(`Failed to fetch online index: ${(err as Error).message}`);
		// Fallback to cache if offline/error
		if (cachedData) {
			log("Loading stale AutoEq cached index as fallback.");
			cachedPresets = JSON.parse(cachedData);
			return cachedPresets;
		}
		throw err;
	}
}

/**
 * Filter the presets array by a case-insensitive query string
 */
export function searchPresets(presets: AutoEqPreset[], query: string, limit = 15): AutoEqPreset[] {
	if (!query.trim()) return [];
	
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	
	return presets
		.filter((preset) => {
			const nameLower = preset.name.toLowerCase();
			return terms.every((term) => nameLower.includes(term));
		})
		.slice(0, limit);
}

/**
 * Download raw preset content from GitHub and load it into the EQ engine
 */
export async function loadPreset(preset: AutoEqPreset) {
	log(`Downloading preset: ${preset.name}...`);
	
	try {
		const encodedParts = preset.path.split("/").map(encodeURIComponent).join("/");
		const rawUrl = `https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/${encodedParts}`;
		const response = await fetch(rawUrl);

		if (!response.ok) {
			throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
		}

		const text = await response.text();
		await loadProfileFromText(text, preset.name);

		// Track preset applied
		trackEvent("preset_applied", {
			preset_name: preset.name
		});
	} catch (err) {
		log(`Error downloading preset: ${(err as Error).message}`);
	}
}

let cachedScores: Record<string, number> | null = null;

export async function getHarmanScores(forceRefresh = false): Promise<Record<string, number>> {
	if (!forceRefresh && cachedScores) return cachedScores;

	const cacheData = localStorage.getItem("autoeq_scores");
	const cacheTime = localStorage.getItem("autoeq_scores_time");
	const cacheVersion = localStorage.getItem("autoeq_scores_version");
	const cacheDuration = 7 * 24 * 60 * 60 * 1000; // 7 days

	if (
		!forceRefresh &&
		cacheData &&
		cacheTime &&
		cacheVersion === APP_VERSION &&
		Date.now() - Number(cacheTime) < cacheDuration
	) {
		try {
			cachedScores = JSON.parse(cacheData);
			return cachedScores!;
		} catch (e) {
			console.error("Failed to parse cached Harman scores", e);
		}
	}

	log("Fetching Harman target preference scores index...");
	try {
		const response = await fetch(
			"https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/RANKING.md"
		);
		if (!response.ok) {
			throw new Error(`Failed to fetch RANKING.md: ${response.status} ${response.statusText}`);
		}

		const text = await response.text();
		const lines = text.split(/\r?\n/);
		const scores: Record<string, number> = {};

		// Regex: match | [Model](./relativePath) | Score |
		const regex = /^\|\s+\[(.*?)\]\(\.\/(.*?)\)\s+\|\s+(-?\d+)\s+\|/;

		for (const line of lines) {
			const match = line.trim().match(regex);
			if (match) {
				const relPathEscaped = match[2];
				const decodedPath = decodeURIComponent(relPathEscaped); // e.g. oratory1990/over-ear/Sennheiser HD 650
				const score = parseInt(match[3], 10);
				scores[decodedPath] = score;
			}
		}

		cachedScores = scores;
		localStorage.setItem("autoeq_scores", JSON.stringify(scores));
		localStorage.setItem("autoeq_scores_time", Date.now().toString());
		localStorage.setItem("autoeq_scores_version", APP_VERSION);

		log(`Successfully loaded and cached ${Object.keys(scores).length} preference scores.`);
		return scores;
	} catch (e) {
		log(`Failed to load Harman preference scores: ${(e as Error).message}`);
		if (cacheData) {
			log("Loading stale Harman scores cache as fallback.");
			cachedScores = JSON.parse(cacheData);
			return cachedScores!;
		}
		return {};
	}
}

export function getPresetHarmanScore(preset: AutoEqPreset, scores: Record<string, number>): number | null {
	const matchPath = preset.path
		.replace(/^results\//, "")
		.replace(/\/[^\/]+ ParametricEQ\.txt$/, "");
	return scores[matchPath] !== undefined ? scores[matchPath] : null;
}

