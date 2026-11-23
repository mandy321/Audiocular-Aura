# 🎧 AuraPEQ — USB DAC EQ & Hardware Parametric Equalizer (PEQ) Controller

> **A premium, browser-based hardware DSP equalizer controller.** Configure the integrated 10-band Parametric Equalizer (PEQ) on your Audiocular Aura, Moondrop, FiiO, and other compatible USB DACs directly over WebHID. No background drivers or desktop app installs required!

[![License](https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=flat-square)](LICENSE)
[![Live App](https://img.shields.io/badge/Live%20App-Launch-brightgreen?style=flat-square)](https://mandy321.github.io/Audiocular-Aura/)
[![Stars](https://img.shields.io/github/stars/mandy321/Audiocular-Aura?style=flat-square&color=yellow)](https://github.com/mandy321/Audiocular-Aura/stargazers)
[![Forks](https://img.shields.io/github/forks/mandy321/Audiocular-Aura?style=flat-square&color=blue)](https://github.com/mandy321/Audiocular-Aura/network/members)
[![Lifetime Repo Visitors](https://img.shields.io/badge/Lifetime_Visitors-1.8k+-8b5cf6?style=flat-square&logo=github)](https://github.com/mandy321/Audiocular-Aura)
[![Total Webapp Launches](https://img.shields.io/badge/Webapp_Launches-4.5k+-10b981?style=flat-square&logo=googlechrome)](https://mandy321.github.io/Audiocular-Aura/)
[![Live Traffic Counter](https://komarev.com/ghpvc/?username=mandy321-Audiocular-Aura&color=blueviolet&style=flat-square&label=All-Time+Views)](https://github.com/mandy321/Audiocular-Aura)

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
| **Savitech (Walkplay)** | 1.0 dB steps | Audiocular Aura Pro (CS43198 + SGM8262), Audiocular Aura (CS43131), Fosi Audio DS2, JCally JM20/JM20 Pro, TRN Black Pearl |
| **Moondrop / Comtrue** | 0.1 dB steps | Moondrop Dawn Pro/Dawn Pro 2, May, Tanchjim Space Lite |
| **Conexant (Freeman)** | 0.1 dB steps | Moondrop FreeDSP (9-band configuration) |
| **FiiO** | 0.1 dB steps | FiiO BTR17, KA17, KA15, KB1, etc. |
| **FiiO JA11 (KT02H20)** | 0.1 dB steps | FiiO JadeAudio JA11 (5-band configuration) |

> [!NOTE]
> **Audiocular Aura Pro (VID `0x3302`, PID `0x4317`):** Features Cirrus Logic CS43198 MasterHIFI DAC paired with a dedicated SGM8262 dual amplifier (delivering up to 235mW @ 32Ω, PCM 384kHz/32-bit, and native DSD256). Communicates over Savitech CB5100 series protocol via Report ID `0x4B` with hardware PEQ, Class H/AB amp switching, output gain modes, and 5 digital interpolation filter selections (`FAST-LL`, `FAST-PC`, `Slow-LL`, `Slow-PC`, `NON-OS`).
>
> **Moondrop / Conexant Protocol Notes:** Since Moondrop and Conexant devices rely on host-side coefficient calculations, A/B comparison level-matching is bypassed automatically to prevent gain packet corruption. A/B comparison switches active slots normally.
>
> **Dawn Pro 2 (VID `0x35D8`, PID `0x011D`):** All HID read/write operations (EQ bands, preamp gain, flash save) use Report ID `0x4B` — the same as Comtrue CT7601-based devices. The payload size must be restricted to exactly 63 bytes.
>
> **FreeDSP (VID `0x35D8`, PID `0x1496`):** Powered by a Conexant (Freeman) DSP core. The application automatically renders a custom 9-band PEQ layout and communicates via Conexant's modular `Caf` package format. Coefficient updates are scaled using Q22 fixed-point math (`2^22`) and pushed to the DSP RAM (command `190`) for instant real-time tuning, or saved permanently to Flash (command `220` + commit sequence).

### 🐧 Linux WebHID Setup (Permissions)

On Linux distributions (Arch, Ubuntu, Debian, Fedora), WebHID requires read/write permissions to `/dev/hidraw*`. If your browser reports that the device cannot be opened, install the udev rule:

```bash
# /etc/udev/rules.d/99-aura-peq.rules
KERNEL=="hidraw*", ATTRS{idVendor}=="3302", MODE="0666", GROUP="plugdev", TAG+="uaccess"
SUBSYSTEM=="usb", ATTR{idVendor}=="3302", MODE="0666", GROUP="plugdev", TAG+="uaccess"
```

Reload udev rules and re-plug the DAC:
```bash
sudo udevadm control --reload-rules && sudo udevadm trigger
```

Please do not use for JM98 MAX 2 , JM98 MAX (Cirrus Logic chips as it can cause irreversible problems in these devices)
---



---

## 📊 Repository & Web App Analytics

Real-time traffic and popularity metrics across GitHub and the live web application:

| Metric | Badge / Counter | Description |
| :--- | :--- | :--- |
| **Lifetime Visitors** | ![Lifetime Visitors](https://img.shields.io/badge/1.8k+-Unique_Visitors-8b5cf6?style=flat-square) [![Live Counter](https://komarev.com/ghpvc/?username=mandy321-Audiocular-Aura&color=blueviolet&style=flat-square&label=Live+Views)](https://github.com/mandy321/Audiocular-Aura) | Total all-time estimated visitors since project inception (May 2026) + live dynamic visitor counter |
| **Web App Launches** | ![Web App Launches](https://img.shields.io/badge/4.5k+-Active_Sessions-10b981?style=flat-square) | Total cumulative web app launches and DSP configuration sessions on GitHub Pages |
| **GitHub Stars** | [![GitHub Stars](https://img.shields.io/github/stars/mandy321/Audiocular-Aura?style=social)](https://github.com/mandy321/Audiocular-Aura/stargazers) | Community interest and stargazers |
| **GitHub Forks** | [![GitHub Forks](https://img.shields.io/github/forks/mandy321/Audiocular-Aura?style=social)](https://github.com/mandy321/Audiocular-Aura/network/members) | Independent forks and developer derivations |
| **Last Commit** | ![GitHub last commit](https://img.shields.io/github/last-commit/mandy321/Audiocular-Aura?style=flat-square&color=blue) | Active development and maintenance status |
| **Top Referrers** | `audiosciencereview.com` • `reddit.com` • `Bing` • `Google` | Major community forums sending traffic to AuraPEQ |

<details>
<summary><b>📈 View Live GitHub Traffic Insights</b></summary>
<br>

* **Top External Communities**: Audio Science Review (`audiosciencereview.com`), r/headphones / r/inearfidelity (`reddit.com`), and organic search engines.
* **Most Visited Documentation**: Hardware DSP engine (`/blob/main/src/dsp.ts`), AutoEq database integration, and WebHID issue troubleshooting.
</details>

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
