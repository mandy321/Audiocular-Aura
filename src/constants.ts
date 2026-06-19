/**
 * CONSTANTS
 */
export const PACKET_SIZE = 63;
export const NUM_BANDS = 10;

export const REPORT_ID_DEFAULT = 75; // 0x4B (Savitech / Comtrue default)
export const REPORT_ID_FIIO = 7;     // FiiO default

// Vendor IDs
export const VID_SAVITECH = 0x0661;           // JCally, generic Savitech
export const VID_SAVITECH_ALT = 0x0666;       // JCally JM20 Pro, generic Savitech alt
export const VID_SAVITECH_OFFICIAL = 0x262a;  // Fosi, iBasso
export const VID_COMTRUE = 0x2fc6;            // Moondrop, Tanchjim (Comtrue CT7601)
export const VID_FIIO = 0x2972;               // FiiO (JA11, KA17, etc.)
export const VID_AUDIOCULAR = 0x3302;         // TTGK Technology / Audiocular Aura
export const PID_TRN_BLACK_PEARL = 0x43e8;    // TRN Black Pearl PID

// --- WALKPLAY (SAVITECH) COMMANDS ---
export const CMD_SAVI = {
	PEQ: 0x09,
	VERSION: 0x0c,
	TEMP: 0x0a,
	FLASH: 0x01,
	GAIN: 0x03,
	READ: 0x80,
	WRITE: 0x01,
	END: 0x00,
};

// --- MOONDROP / COMTRUE COMMANDS ---
export const CMD_MOON = {
	WRITE: 1,
	READ: 128,
	UPDATE_EQ: 9,
	UPDATE_EQ_COEFF: 10,
	SAVE_FLASH: 1,
	PRE_GAIN: 35,
	VER: 12,
};

// --- FIIO COMMANDS ---
export const CMD_FIIO = {
	HEADER_SET_1: 0xaa,
	HEADER_SET_2: 0x0a,
	HEADER_GET_1: 0xbb,
	HEADER_GET_2: 0x0b,
	FILTER_PARAMS: 0x15,
	GLOBAL_GAIN: 0x17,
	FILTER_COUNT: 0x18,
	SAVE: 0x19,
	END: 0xee,
};

/**
 * DEFAULT SETTINGS
 */
export const DEFAULT_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const DEFAULT_LABELS = [
	"Sub-Bass",
	"Bass",
	"Low-Mids",
	"Mids",
	"Mids",
	"High-Mids",
	"High-Mids",
	"Presence",
	"Presence",
	"Air",
];

export interface IdentifiedDac {
	vid: number;
	pid?: number;
	name: string;
	chipset?: string;
	protocol: "SAVITECH" | "MOONDROP" | "FIIO" | "FIIO_JA11";
	description?: string;
}

export const KNOWN_DACS: IdentifiedDac[] = [
	{
		vid: VID_AUDIOCULAR,
		pid: PID_TRN_BLACK_PEARL,
		name: "TRN Black Pearl",
		chipset: "Savitech CB5100 + CS43131",
		protocol: "SAVITECH",
		description: "Portable USB DAC featuring dual CS43131 and Savitech CB5100 PEQ.",
	},
	{
		vid: VID_AUDIOCULAR,
		name: "Audiocular Aura",
		chipset: "Savitech CB5100 + CS43131",
		protocol: "SAVITECH",
		description: "Premium portable DAC featuring zero-latency hardware PEQ.",
	},
	{
		vid: VID_SAVITECH_OFFICIAL,
		name: "Fosi Audio DS2 / iBasso DC04 Pro",
		chipset: "Savitech Official (CB5100 series)",
		protocol: "SAVITECH",
		description: "Vibrant and powerful portable DAC/AMP with digital filter customization.",
	},
	{
		vid: VID_SAVITECH,
		name: "JCally JM20 / Savitech Generic",
		chipset: "Savitech SA9312 / SA9123 DSP",
		protocol: "SAVITECH",
		description: "Generic Savitech DSP audio controller compatible with standard PEQ command packets.",
	},
	{
		vid: VID_SAVITECH_ALT,
		name: "JCally JM20 Pro / Alt Savitech",
		chipset: "Savitech Alternate Controller",
		protocol: "SAVITECH",
		description: "Compatible alternate Savitech chip implementation.",
	},
	{
		vid: 0x35d8,
		pid: 0x011d,
		name: "Moondrop Dawn Pro 2",
		chipset: "Comtrue CT7601 (DSP Enabled)",
		protocol: "MOONDROP",
		description: "Premium portable DAC featuring Moondrop's DSP configuration."
	},
	{
		vid: VID_COMTRUE,
		name: "Moondrop Dawn Pro / FreeDSP / May / Tanchjim Space Lite",
		chipset: "Comtrue CT7601 (DSP Enabled)",
		protocol: "MOONDROP",
		description: "Supports Moondrop's Interactive DSP protocol with coefficients computed on-host.",
	},
	{
		vid: VID_FIIO,
		pid: 258, // 0x0102
		name: "FiiO JadeAudio JA11",
		chipset: "KT02H20 DSP Core",
		protocol: "FIIO_JA11",
		description: "Supports FiiO's custom 5-band KT02H20 DSP PEQ protocol over raw HID commands.",
	},
	{
		vid: VID_FIIO,
		name: "FiiO KA17 / KA15 / KB1",
		chipset: "FiiO DSP Core",
		protocol: "FIIO",
		description: "Supports FiiO's custom 10-band DSP PEQ protocol over proprietary raw HID commands.",
	},
];

export let activeDacs: IdentifiedDac[] = [...KNOWN_DACS];
export function setActiveDacs(dacs: IdentifiedDac[]) {
	activeDacs = dacs;
}

