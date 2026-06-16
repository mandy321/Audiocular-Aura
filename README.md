# 🎧 AuraPEQ

> **A premium, browser-based hardware DSP controller.** Tune the integrated Parametric Equalizer (PEQ) on your Audiocular Aura and other compatible DSP DACs directly over WebHID.

[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Live Demo](https://img.shields.io/badge/Live%20App-Demo-brightgreen?style=flat-square)](https://mandy321.github.io/Audiocular-Aura/)
[![Tech Stack](https://img.shields.io/badge/Stack-TypeScript%20%7C%20CSS-blueviolet?style=flat-square)](#-tech-stack)

---

## 🚀 What is AuraPEQ?

Normally, software equalizers run as background processes on your computer or phone, which consumes CPU resources and can degrade audio quality. **AuraPEQ communicates directly with the DSP chip inside your DAC hardware.**

When you save your custom EQ settings, they are written permanently to the DAC's internal flash memory. **Your custom tuning persists when plugged into any device** (iPhone, Android, Nintendo Switch, PlayStation, iPad, etc.)—completely app-free and driverless!

---

## ✨ Features

*   🔊 **Hardware-Level DSP**: RBJ cookbook filters (Peak, Low Shelf, High Shelf) processed directly on the DAC.
*   ⚡ **Instant Real-Time Sync**: Smooth visualizer edits (Gain, Freq, Q) are throttled and pushed instantly to the device.
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
| **Savitech (Walkplay)** | 1.0 dB steps | Audiocular Aura (CB5100), Fosi Audio DS2, JCally JM20/JM20 Pro |
| **Moondrop / Comtrue** | 0.1 dB steps | Moondrop Dawn Pro/Dawn Pro 2, FreeDSP, May, Tanchjim Space Lite |
| **FiiO** | 0.1 dB steps | FiiO KA17, KA15, KB1, etc. |
| **FiiO JA11 (KT02H20)** | 0.1 dB steps | FiiO JadeAudio JA11 (5-band configuration) |

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

1.  Connect your compatible DAC using a desktop Chromium-based browser (Chrome, Edge, Brave, Opera).
2.  Open **[AuraPEQ](https://mandy321.github.io/Audiocular-Aura/)** and click **CONNECT DAC**.
3.  Load a preset from the **AutoEq Database**, My Custom Profiles, or adjust bands manually on the frequency visualizer.
4.  Click **SYNC TO RAM** to test changes instantly.
5.  Click **SAVE TO FLASH** to store your preset permanently on the DAC hardware.

---

## 🛡️ License

This project is licensed under the MIT License.
