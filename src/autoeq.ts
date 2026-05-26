import { loadProfileFromText } from "./importExport.ts";
import { log } from "./helpers.ts";

export interface AutoEqPreset {
	path: string;
	name: string;
}

let cachedPresets: AutoEqPreset[] = [];

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
	const cacheDuration = 7 * 24 * 60 * 60 * 1000; // 7 Days in milliseconds

	if (
		!forceRefresh &&
		cachedData &&
		cacheTime &&
		Date.now() - Number(cacheTime) < cacheDuration
	) {
		try {
			cachedPresets = JSON.parse(cachedData);
			return cachedPresets;
		} catch (err) {
			console.error("Failed to parse cached AutoEq presets", err);
		}
	}

	// 2. Fetch fresh index from GitHub API
	log("Fetching AutoEq online database index from GitHub...");
	
	try {
		const response = await fetch(
			"https://api.github.com/repos/jaakkopasanen/AutoEq/git/trees/master?recursive=1"
		);

		if (!response.ok) {
			throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		if (!data.tree || !Array.isArray(data.tree)) {
			throw new Error("Invalid response tree structure from GitHub API");
		}

		// 3. Filter for ParametricEQ.txt profiles and map names
		const presets: AutoEqPreset[] = data.tree
			.filter((item: any) => item.path && item.path.endsWith("ParametricEQ.txt"))
			.map((item: any) => {
				const path: string = item.path;
				const parts = path.split("/");
				
				const source = parts[1]; // e.g. "oratory1990", "Crinacle"
				const model = parts[parts.length - 2]; // Folder name is the model name
				
				// Extract targets or subfolders if they exist (e.g. "harman_in-ear_2019-v2" or "in-ear")
				const subfolders = parts.slice(2, parts.length - 2).join(" / ");
				const name = `${model} (${source}${subfolders ? ` - ${subfolders}` : ""})`;

				return { path, name };
			});

		// 4. Sort alphabetically
		presets.sort((a, b) => a.name.localeCompare(b.name));

		// 5. Update local memory and cache
		cachedPresets = presets;
		localStorage.setItem("autoeq_presets", JSON.stringify(presets));
		localStorage.setItem("autoeq_presets_time", Date.now().toString());

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
		const rawUrl = `https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/${encodeURIComponent(preset.path)}`;
		const response = await fetch(rawUrl);

		if (!response.ok) {
			throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
		}

		const text = await response.text();
		loadProfileFromText(text);
	} catch (err) {
		log(`Error downloading preset: ${(err as Error).message}`);
	}
}
