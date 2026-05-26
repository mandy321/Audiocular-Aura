import "./style.css";
import { flashToFlash, syncToDevice } from "./dsp.ts";
import {
	connectToDevice,
	disconnectDevice,
	initState,
	resetToDefaults,
} from "./fn.ts";
import { setGlobalGain } from "./helpers.ts";
import { exportProfile, importProfile } from "./importExport.ts";
import {
	getAutoEqPresets,
	searchPresets,
	loadPreset,
	type AutoEqPreset,
} from "./autoeq.ts";

export type Band = {
	index: number;
	freq: number;
	gain: number;
	q: number;
	type: string;
	enabled: boolean;
};
export type EQ = Band[];

// Initialize state and render PEQ on page load
initState();

/**
 * CONNECTION LOGIC
 */
const btnConnect = document.getElementById("btnConnect");
btnConnect?.addEventListener("click", async () => connectToDevice());

const btnDisconnect = document.getElementById("btnDisconnect");
btnDisconnect?.addEventListener("click", async () => disconnectDevice());

/**
 * CUSTOM USB SETTINGS ACCORDION
 */
const btnToggleCustomUsb = document.getElementById("btnToggleCustomUsb");
const customUsbConfig = document.getElementById("customUsbConfig");

btnToggleCustomUsb?.addEventListener("click", () => {
	if (customUsbConfig) {
		if (customUsbConfig.classList.contains("hidden")) {
			customUsbConfig.classList.remove("hidden");
			btnToggleCustomUsb.innerText = "Hide Custom USB Options ▲";
		} else {
			customUsbConfig.classList.add("hidden");
			btnToggleCustomUsb.innerText = "Show Custom USB Options ▼";
		}
	}
});

/**
 * RESET LOGIC
 */
const btnReset = document.getElementById("btnReset");
btnReset?.addEventListener("click", async () => resetToDefaults());

/**
 * SYNC LOGIC
 */
const btnSync = document.getElementById("btnSync");
btnSync?.addEventListener("click", async () => syncToDevice());

/**
 * FLASH WRITE LOGIC
 */
const btnFlash = document.getElementById("btnFlash");
btnFlash?.addEventListener("click", async () => flashToFlash());

/**
 * GLOBAL GAIN PREAMP LOGIC
 */
const globalSlider = document.getElementById("globalGainSlider");
globalSlider?.addEventListener("input", async (e) => setGlobalGain(e));

/**
 * PROFILE IMPORT / EXPORT LOGIC
 */
const btnExport = document.getElementById("btnExport");
btnExport?.addEventListener("click", () => exportProfile());

const btnImport = document.getElementById("btnImport");
const fileInput = document.getElementById("fileInput");

btnImport?.addEventListener("click", () => fileInput?.click());
fileInput?.addEventListener("change", (e) => importProfile(e));

/**
 * AUTOEQ ONLINE PRESETS INTEGRATION
 */
let allPresets: AutoEqPreset[] = [];
let isFetchingIndex = false;

const searchInput = document.getElementById("autoeqSearch") as HTMLInputElement;
const searchResults = document.getElementById("autoeqSearchResults") as HTMLElement;
const btnRefreshAutoEq = document.getElementById("btnRefreshAutoEq");

// Background fetch of the database index on page load
setTimeout(() => initializeAutoEqIndex(), 1000);

async function initializeAutoEqIndex(forceRefresh = false) {
	if (isFetchingIndex) return;
	if (!forceRefresh && allPresets.length > 0) return;

	isFetchingIndex = true;
	updateDropdownUI("loading");

	try {
		allPresets = await getAutoEqPresets(forceRefresh);
		updateDropdownUI("idle");
	} catch (err) {
		console.error("AutoEq initialization failed", err);
		updateDropdownUI("error");
	} finally {
		isFetchingIndex = false;
	}
}

function updateDropdownUI(state: "loading" | "idle" | "error") {
	if (!searchResults) return;
	
	if (state === "loading") {
		searchResults.classList.remove("hidden");
		searchResults.innerHTML = `<div class="search-loading">Tuning database loading...</div>`;
	} else if (state === "error") {
		searchResults.classList.remove("hidden");
		searchResults.innerHTML = `<div class="search-no-results text-red-500">Failed to load preset database. Click 🔄 to retry.</div>`;
	} else {
		// Just hide if idle and input is empty
		if (searchInput && !searchInput.value.trim()) {
			searchResults.classList.add("hidden");
		}
	}
}

function renderSearchResults(query: string) {
	if (!searchResults) return;

	if (!query.trim()) {
		searchResults.classList.add("hidden");
		searchResults.innerHTML = "";
		return;
	}

	searchResults.classList.remove("hidden");

	if (isFetchingIndex) {
		searchResults.innerHTML = `<div class="search-loading">Tuning database loading...</div>`;
		return;
	}

	if (allPresets.length === 0) {
		searchResults.innerHTML = `<div class="search-no-results">Tuning database not loaded. Click 🔄 to retry.</div>`;
		return;
	}

	const matches = searchPresets(allPresets, query, 15);

	if (matches.length === 0) {
		searchResults.innerHTML = `<div class="search-no-results">No headphones found matching "${query}"</div>`;
		return;
	}

	searchResults.innerHTML = "";
	matches.forEach((preset) => {
		const div = document.createElement("div");
		div.className = "search-item";
		div.innerText = preset.name;
		div.addEventListener("click", async () => {
			searchResults.classList.add("hidden");
			searchInput.value = preset.name;
			await loadPreset(preset);
		});
		searchResults.appendChild(div);
	});
}

// Attach Search event listeners
searchInput?.addEventListener("focus", () => {
	initializeAutoEqIndex();
	if (searchInput.value.trim()) {
		renderSearchResults(searchInput.value);
	}
});

searchInput?.addEventListener("input", (e) => {
	const query = (e.target as HTMLInputElement).value;
	renderSearchResults(query);
});

btnRefreshAutoEq?.addEventListener("click", () => {
	initializeAutoEqIndex(true);
});

// Dismiss dropdown when clicking outside the search element wrapper
window.addEventListener("click", (e) => {
	const wrapper = document.querySelector(".autoeq-search-wrapper");
	if (wrapper && !wrapper.contains(e.target as Node)) {
		searchResults?.classList.add("hidden");
	}
});
