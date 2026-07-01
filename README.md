# 🎧 AuraPEQ — USB DAC EQ & Hardware Parametric Equalizer (PEQ) Controller

> **A premium, browser-based hardware DSP equalizer controller.** Configure the integrated 10-band Parametric Equalizer (PEQ) on your Audiocular Aura, Moondrop, FiiO, and other compatible USB DACs directly over WebHID. No background drivers or desktop app installs required!

[![License](https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=flat-square)](LICENSE)
[![Live App](https://img.shields.io/badge/Live%20App-Launch-brightgreen?style=flat-square)](https://mandy321.github.io/Audiocular-Aura/)
[![Stars](https://badgen.net/github/stars/mandy321/Audiocular-Aura?color=yellow)](https://github.com/mandy321/Audiocular-Aura/stargazers)
[![Tech Stack](https://img.shields.io/badge/Stack-TypeScript%20%7C%20CSS-blueviolet?style=flat-square)](#-tech-stack)

---

## 🚀 What is AuraPEQ?

Normally, software equalizers run as background processes on your computer or phone, which consumes CPU resources and can degrade audio quality. **AuraPEQ communicates directly with the DSP chip inside your DAC hardware.**

When you save your custom EQ settings, they are written permanently to the DAC's internal flash memory. **Your custom tuning persists when plugged into any device** (iPhone, Android, Nintendo Switch, PlayStation, iPad, etc.)—completely app-free and driverless!

---

## ✨ Features

*   🔊 **Hardware-Level DSP**: RBJ cookbook filters (Peak, Low Shelf, High Shelf, and Notch) processed directly on the DAC.
*   🛡️ **Ear Protection Alerts**: Automated warning prompts for unsafe volume/gain sync thresholds with a one-click real-time correction engine.
*   📉 **Global Bass/Treble Tilt**: Layered low-shelf and high-shelf global tilt sliders with active dashed indicators convolved mathematically on top of the physical bands.
*   📐 **Auto Preamp Headroom**: Real-time combined EQ curve analysis to dynamically apply clipping prevention headroom depending on device protocol precision.
*   ⭐ **Harman Preference Scores**: On-demand rankings index lookup from the official AutoEq index database with stars indicator (with race-condition protection to ensure accurate scores on load).
*   📝 **Preset Ratings & Notes**: Apply star ratings and persist customized notes to presets and custom profiles locally.
*   ⚡ **Instant Real-Time Sync**: Smooth visualizer edits (Gain, Freq, Q) are throttled and pushed instantly to the device, with a real-time rotating sync indicator showing connection status.
*   🔄 **EQ A/B Comparison**: Swap between slot configurations to easily compare presets.
*   ↩️ **Undo/Redo History**: Debounced state-based history traversal (up to 50 snapshots depth) with hardware sync.
*   🌐 **Translation System (i18n)**: Fully localized UI in English, Spanish, German, and Simplified Chinese.
*   ⌨️ **Power-User Shortcuts**: Dedicated keyboard mappings for Windows/Mac (Ctrl/Cmd) to control the visualizer, reset bands, and sync settings.
*   📂 **Preset Import & Database**: Load AutoEq parametric text profiles or search thousands of IEM/headphone models from the online database.

<details>
<summary><b>🔍 View Full Features Checklist</b></summary>

*   **PWA Support**: Installable offline-first web app using a stale-while-revalidate service worker cache.
*   **Dual-Display Preamp**: Preserves decimal user values in UI while handling integer-rounding constraints for Savitech hardware.
*   **Persistent USB Overrides**: Enter manual hex VIDs and PIDs for custom DAC revisions.
*   **Frictionless Bug Reporting**: Pre-filled GitHub issue page generator with console logs.
*   **Offline Cached Database**: Remote database list cached locally (24h) with automatic fallback.
*   **Verbose USB Packet Console**: View outgoing (`[TX]`) and incoming (`[RX]`) raw WebHID reports.
</details>

---

## 🔌 Hardware Compatibility & Chipsets

AuraPEQ features a multi-protocol hardware communication layer that automatically adapts based on your device's Vendor ID (VID):

| Protocol | Preamp Precision | Officially Supported DAC Models |
| :--- | :--- | :--- |
| **Savitech (Walkplay)** | 1.0 dB steps | Audiocular Aura (CB5100), Fosi Audio DS2, JCally JM20/JM20 Pro, TRN Black Pearl |
| **Moondrop / Comtrue** | 0.1 dB steps | Moondrop Dawn Pro/Dawn Pro 2, May, Tanchjim Space Lite |
| **Conexant (Freeman)** | 0.1 dB steps | Moondrop FreeDSP (9-band configuration) |
| **FiiO** | 0.1 dB steps | FiiO BTR17, KA17, KA15, KB1, etc. |
| **FiiO JA11 (KT02H20)** | 0.1 dB steps | FiiO JadeAudio JA11 (5-band configuration) |

> [!NOTE]
> **Moondrop / Conexant Protocol Notes:** Since Moondrop and Conexant devices rely on host-side coefficient calculations, A/B comparison level-matching is bypassed automatically to prevent gain packet corruption. A/B comparison switches active slots normally.
>
> **Dawn Pro 2 (VID `0x35D8`, PID `0x011D`):** All HID read/write operations (EQ bands, preamp gain, flash save) use Report ID `0x4B` — the same as Comtrue CT7601-based devices. The payload size must be restricted to exactly 63 bytes.
>
> **FreeDSP (VID `0x35D8`, PID `0x1496`):** Powered by a Conexant (Freeman) DSP core. The application automatically renders a custom 9-band PEQ layout and communicates via Conexant's modular `Caf` package format. Coefficient updates are scaled using Q22 fixed-point math (`2^22`) and pushed to the DSP RAM (command `190`) for instant real-time tuning, or saved permanently to Flash (command `220` + commit sequence).

---

## 🛠️ Quick Start (Local Development)

To run the project locally, ensure you have **Node.js (16+)** installed.

```bash
# 1. Clone the repository
git clone https://github.com/mandy321/Audiocular-Aura.git
cd Audiocular-Aura

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev

# 4. Build for production
npm run build
```

---

## 📖 How to Use

Follow these simple steps to configure your USB DAC hardware equalizer:

### 1. Prerequisite Browser Check
*   Ensure you are using a desktop **Chromium-based browser** (Google Chrome, Microsoft Edge, Opera, or Brave).
*   *Note: Apple Safari, Mozilla Firefox, and mobile browsers do not support WebHID communications.*

### 2. Connect Your Hardware
1. Connect your compatible USB DAC to your computer.
2. Open the **[AuraPEQ Web App](https://mandy321.github.io/Audiocular-Aura/)**.
3. Click the **CONNECT DAC** button at the top and select your device in the browser pop-up.

### 3. Configure Your EQ Settings
*   🎵 **AutoEq Database**: Search from thousands of pre-calculated headphone and IEM profiles and apply them instantly.
*   🎛️ **Interactive Visualizer**: Drag the frequency control points on the response curve graph to adjust **Gain**, **Frequency**, and **Q-factor** in real-time.
*   ⌨️ **Manual Adjustment**: Refine parameters using the sliders or numerical inputs for each of the 10 DSP bands.

### 4. Sync & Store
*   ⚡ **SYNC TO RAM (APPLY)**: Instantly pushes parameters to the DAC's active memory to test adjustments. *Settings will reset if the DAC is disconnected.*
*   💾 **SAVE TO FLASH (PERMANENT)**: Writes your preset permanently to the DAC's onboard storage. **Your EQ settings will now persist automatically on any player** (iPhone, Android, Nintendo Switch, PlayStation, iPad, etc.) without running any software.

---

## ⭐ Star the Project

If you find AuraPEQ helpful, please consider giving this repository a star! It helps more people discover the project and supports continued open-source development.

[![GitHub stars](https://badgen.net/github/stars/mandy321/Audiocular-Aura?icon=github&label=Star)](https://github.com/mandy321/Audiocular-Aura/stargazers)

---

## 🏷️ Search & Indexing Keywords

If you are looking for resources on equalizers or DAC configuration, this project covers:
*   **DAC EQ / USB DAC Equalizer**: Configure audio tuning for Audiocular Aura, Fosi Audio, JCally, Moondrop, and FiiO.
*   **Parametric Equalizer (PEQ) Equalizer**: Set up precise 10-band audio filter configurations (Gain, Freq, Q-factor) on hardware.
*   **Hardware DSP Tuning**: Process high-fidelity audio filter math (peaking and shelving biquad filters) directly inside the DAC chip.
*   **WebHID Equalizer**: Connect, read, and write device parameters directly from your web browser without installing local desktop apps.
*   **Onboard Flash Flashing**: Save custom presets permanently to the internal memory of the USB audio controller.

---


## 🛡️ License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0). See the [LICENSE](LICENSE) file for details.
