# 🎧 AuraPEQ

> A premium browser-based controller to unlock and configure the hardware-level 10-band Parametric Equalizer (PEQ) on the **Audiocular Aura** and other compatible multi-brand DSP DACs.

AuraPEQ communicates directly with the **Savitech CB5100**, **Comtrue (CT7601)**, or **FiiO** USB audio bridge and DSP chips via the **WebHID API**. This allows you to configure a true hardware-level 10-band PEQ. All DSP math is calculated directly on the DAC hardware rather than running as a software overlay, saving system resources and preserving native audio fidelity.

Live Web App: **[https://mandy321.github.io/Audiocular-Aura/](https://mandy321.github.io/Audiocular-Aura/)**

---

## 💡 AuraPEQ in Simple Terms (Layman's Guide)

If you are new to audio tuning, here is what this tool does and why it is special:

* **What is a Parametric Equalizer (PEQ)?**
  Most simple equalizers only let you adjust broad ranges (like "Bass" or "Treble"). A Parametric EQ gives you surgical control. You can target a very specific frequency (like a muddy vocal range or a sharp piercing treble peak) and adjust its volume, width, and shape.
* **What is "Hardware-Level" EQ?**
  Normally, EQ apps run in the background on your computer or phone, which drains your battery and uses CPU power. AuraPEQ sends your settings directly into the little USB headphone adapter (DAC) itself. The hardware chip inside the adapter does all the heavy lifting.
* **Why "Save to Flash" is a Game Changer:**
  When you click **Save to Flash**, your custom sound profile is saved permanently inside the USB adapter's internal memory. You can unplug it and plug it into a Nintendo Switch, Playstation, iPhone, iPad, or Android phone—and **your custom sound will work instantly**, with zero apps or drivers needed on those devices!
* **The "Dynamic Database" & "Report" Buttons:**
  We maintain a cloud database of supported audio devices. The app automatically fetches the latest list on startup, so new devices work instantly without requiring you to update the app. If you connect an unrecognized device, the **"Report Unknown Device"** button copies the technical details (including logs) to your clipboard and opens a pre-filled GitHub page so we can add support for your device.

---

## ✨ Features

* **EQ Undo/Redo History Stack**: Full undo/redo functionality (up to 50 snapshots depth) to revert or re-apply any adjustments (slider drags, visualizer graph edits, presets, resets). Reverting or re-applying steps updates the UI and automatically syncs to the connected hardware.
* **A/B Comparison Toggling**: Toggle between slot A (your active custom profile) and slot B (initialized to a flat neutral baseline reference on first compare click). Updates both visualizer canvas and hardware values instantly.
* **Multi-lingual Translation Framework (i18n)**: High-performance vanilla i18n translation system supporting English (`en`), Spanish (`es`), German (`de`), and Simplified Chinese (`zh`). Dynamic translations cover all static labels, alerts, placeholders, aria-labels, titles, and system message logs, persisting on page reload.
* **Global Keyboard Shortcuts & Help Modal**: Control key mappings mapped dynamically for Windows/Mac (Ctrl/Cmd) including Z (Undo), Shift+Z/Y (Redo), B (A/B Compare), S (Sync to RAM), Shift+S (Save to Flash), `[`/`]` (Prev/Next Custom Profile), R (Reset focused band), Shift+R (Reset all), E (Toggle focused band bypass), and Escape (Close modals), paired with a visual shortcuts helper overlay modal.
* **Hardware-Level DSP Processing**: The audio filter logic is processed directly inside the DAC's integrated DSP chip.
* **Verified Peaking & Shelving Filter Math**: Exact implementation of RBJ Audio EQ cookbook formulas for Peaking (`PK`), Low-Shelf (`LSQ`), and High-Shelf (`HSQ`) filters calculated and sent directly to the device.
* **Instant Real-Time Sync**: No manual syncing required! Band parameters (Frequency, Q, Gain, Type, Enable state) are throttled (50ms window) and sent instantly to the DAC as you drag canvas handles, update select dropdowns, or adjust sliders.
* **Automatic Parameter Reading**: Automatically reads active preamp gain and EQ band settings directly from connected Savitech, FiiO JA11, and Moondrop/Comtrue devices upon connection. The UI sliders and interactive graph populate instantly with the device's actual hardware state, ensuring a seamless synchronization process without overwriting stored parameters.
* **Preamp Gain UI Transparency (Dual-Display)**: Automatically detects hardware preamp gain constraints. For Savitech devices (which only support integer dB steps), the UI preserves user-entered or imported decimal values in the primary display (e.g. `-4.8 dB`) while displaying the actual hardware-applied value (e.g. `(applies as -5 dB)`) in a secondary badge. The slider step adjusts dynamically (`1` for Savitech, `0.1` for Moondrop/FiiO) to align with hardware capabilities.
* **Interactive Frequency Graph**: Drag and drop visual handles on a logarithmic grid to adjust Gain and Frequency, with real-time cumulative curve tracing. The grid matches the hardware scale limits (-12 dB to +12 dB) for pixel-perfect tracking.
* **10 Configurable Bands**: Individual frequency, gain, and Q (filter width) settings supporting Peak, Low Shelf, and High Shelf filter types.
* **Dynamic Remote Device Database**: Automatically fetches and updates the device compatibility database from a remote JSON file on startup (with 24-hour local caching and automatic offline fallback). Includes a manual **"REFRESH DATABASE"** button to check for new models instantly.
* **Persistent Custom USB Connections**: Connect unrecognized DACs using manual Vendor IDs, Product IDs, and select the corresponding DSP protocol. Successfully connected configurations are saved locally and pre-filled on next launch.
* **Frictionless Unknown Device Reporting**: Connect any unrecognized DAC to display a **"Report Unknown Device"** button. This automatically copies a formatted markdown report (including device name, VID, PID, protocol, and full System Messages Console logs) to your clipboard and opens a pre-filled GitHub issue page to contribute new IDs.
* **Moondrop Dawn Pro 2 Support**: Static out-of-the-box compatibility added for the Moondrop Dawn Pro 2 (VID: `0x35d8` / PID: `0x011d`) running on the MOONDROP protocol.
* **Immediate VID/PID Connection Logging**: Connection logging immediately prints the device's Vendor ID (VID) and Product ID (PID) in hex upon opening, aiding debug and device contribution.
* **Offline-Capable PWA with In-App Installation**: Fully installable as a Progressive Web App (PWA) via a dedicated **"INSTALL APP"** button in the header, enabling complete offline operation using a stale-while-revalidate service worker cache.
* **Real-Time Device Info Panel (with VID/PID)**: Displays live stats for the connected DAC including firmware version, operational DSP sample rate, active PEQ slots used (`0` to `10`), and hexadecimal USB Vendor ID (VID) and Product ID (PID).
* **Automatic Connection & Hot-Plug Detection**: Auto-detects and connects to previously paired USB DACs on load. Listens to WebHID connection/disconnection events to automatically connect or disconnect in real-time when physical devices are plugged or unplugged.
* **Vibrant Status Indicators**: Status badge changes to a glowing emerald green ONLINE state when connected and returns to a grey OFFLINE state when disconnected.
* **AutoEq Filter Type Normalization**: Robust parsing normalizes all shelf filter variants (such as `LS`, `LSC`, `HS`, `HSC`) from imported AutoEq profiles to ensure they display clearly in the bands controller dropdowns.
* **Reset Defaults (Octave Baseline)**: A button that resets the 10 bands to standard octave frequencies (`31` Hz to `16000` Hz) with `0 dB` gain and `0.75` Q factor (yielding a flat pass-through response).
* **Reset to Flat (Clean Slate Baseline)**: A button that aligns all 10 bands to exactly `1000 Hz` with `0 dB` gain and `1.0` Q factor, giving you a clean slate to manually configure custom EQ bands from scratch.
* **Full Hardware Factory Reset**: A button in the advanced controls panel that sends a direct command (`[1, 23, 0]`) to wipe the DAC's DSP registers and restore it to its un-equalized out-of-the-box state.
* **Verbose USB Packet Console**: Displays live formatted hex payloads for all outgoing (`[TX]`) and incoming (`[RX]`) WebHID reports, with smart Feature Report control transfer fallbacks.
* **Ergonomic DAW-Style Layout**: A wider `1400px` layout with vertical sliders, side-by-side band strips, and wider input boxes that support up to 5-digit frequency fields (such as `16000` Hz) without visual truncation.
* **Pinned Favorites List**: Click the star `★` icon next to search items in the AutoEq index to save headphone models to your pinned favorites panel for rapid switching.
* **Local Custom Profiles Manager**: Save your current active EQ profiles directly to browser local storage with custom names. Easily reload, overwrite, or delete saved custom profiles with built-in band compatibility handling between 5-band and 10-band configurations.
* **Supported Devices Database**: A searchable modal listing all compatible controllers (Savitech, Comtrue, FiiO) with their chipset details.
* **Profile Import/Export**:
  * Save and load settings using standard `.json` configuration files (**EXPORT JSON** button).
  * Export as a standard **AutoEq parametric text file** (`.txt`) compatible with EqualizerAPO, Poweramp, Squiglink, and any AutoEq-aware tool (**EXPORT TEXT** button).
  * Import standard **AutoEq text profiles** (compatible with presets exported from [AutoEq.app](https://autoeq.app) or [Squiglink](https://squig.link)).
* **Memory Persistence**:
  * **Sync to RAM**: Applies settings instantly to hear your changes.
  * **Save to Flash**: Write the settings permanently to the DAC's internal flash memory so they persist when you connect the DAC to other devices (like phones, tablets, or consoles).
* **Universal USB Override Connection**: If your specific DAC revision or batch reports different USB identification codes, enter a custom hex Vendor ID (VID) and Product ID (PID) to bypass connections.
* **Clean Neutral Import Padding**: When importing an AutoEq text profile with fewer than 10 filters, all unspecified bands are automatically filled to a neutral state (Gain `0 dB`, Freq `1000 Hz`, Q `0.71`, Type `Peak`) instead of inheriting stale values from the previous preset.
* **Scroll Lock on Preset Load**: Selecting a preset or loading a profile no longer jumps the page. Scroll position is saved and restored around the DOM rebuild, keeping you exactly where you were on the page.
* **Full Preset Name Display**: The "Last Applied EQ" label in the header now shows the complete preset name without truncation, so long names like `Sennheiser HD 600 (oratory1990)` are always fully visible.

---

## 💻 Tech Stack

* **Core**: Pure semantic HTML5 and Vanilla TypeScript logic.
* **Styling**: Premium Glassmorphic Vanilla CSS (No heavy framework overlays).
* **Build Tool**: Vite v4 (configured with relative base paths for portable deployments).
* **Communication**: WebHID API.

---

## 🔌 Hardware Compatibility & Chipsets

AuraPEQ features a multi-protocol hardware communication layer that supports several popular DSP chipsets and audio brands out-of-the-box:

| Chipset / Protocol | Key Brands & Models | Preamp Gain Step | Connection Details |
| :--- | :--- | :--- | :--- |
| **Savitech (Walkplay)** | Audiocular Aura, JCally (Generic), Fosi, iBasso | **Integer dB (1 dB)** | Uses standard Q30 fixed-point IIR filter calculations (10 bands). |
| **Moondrop / Comtrue** | Moondrop Dawn Pro 2, Moondrop, Tanchjim (CT7601 chips) | **Decimal dB (0.1 dB)** | Uses specialized double-precision biquad coefficient encoding (10 bands). |
| **FiiO** | FiiO (KA17, KA15, KB1, etc.) | **Decimal dB (0.1 dB)** | Decodes gain, frequency, and Q parameters to FiiO's custom 10-band DSP PEQ formats (Report ID 7). |
| **FiiO JA11 (KT02H20)** | FiiO JadeAudio JA11 | **Decimal dB (0.1 dB)** | Uses the KT02H20 5-band DSP PEQ protocol over proprietary raw HID commands (Report ID 2). |

### Officially Supported DAC Models

| DAC Model / Brand | DSP Chipset | Protocol | Vendor ID (VID) | Product ID (PID) |
| :--- | :--- | :--- | :--- | :--- |
| **Audiocular Aura** | Savitech CB5100 + CS43131 | SAVITECH | `0x3302` | *Any* |
| **Fosi Audio DS2 / iBasso DC04 Pro** | Savitech Official CB5100 | SAVITECH | `0x262a` | *Any* |
| **JCally JM20 / Savitech Generic** | Savitech SA9312 / SA9123 DSP | SAVITECH | `0x0661` | *Any* |
| **JCally JM20 Pro / Alt Savitech** | Savitech Alternate Controller | SAVITECH | `0x0666` | *Any* |
| **Moondrop Dawn Pro 2** | Comtrue CT7601 (DSP Enabled) | MOONDROP | `0x35d8` | `0x011d` |
| **Moondrop Dawn Pro / FreeDSP / May / Tanchjim Space Lite** | Comtrue CT7601 (DSP Enabled) | MOONDROP | `0x2fc6` | *Any* |
| **FiiO JadeAudio JA11** | KT02H20 DSP Core | FIIO_JA11 | `0x2972` | `0x0102` |
| **FiiO KA17 / KA15 / KB1** | FiiO DSP Core | FIIO | `0x2972` | *Any* (excl. `0x0102`) |

### How to use with other DACs:
1. If your DAC uses one of the supported chipsets listed above, connect it to your computer.
2. In the Web App, click **Show Custom USB Options**.
3. Input your DAC's hexadecimal **Vendor ID (VID)** and **Product ID (PID)**.
4. Click **CONNECT DAC**. The app will automatically detect which communication protocol to use based on the Vendor ID!

---

## 🚀 Quick Start (Local Development)

### Prerequisites

You need [Node.js](https://nodejs.org/) installed (supports Node 16+).

### Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/mandy321/Audiocular-Aura.git
   cd Audiocular-Aura
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the local development server**:
   ```bash
   npm run dev
   ```
   Open **`http://localhost:5173`** in a desktop Chromium-based browser (Chrome, Edge, Brave, or Opera).

4. **Compile production build**:
   ```bash
   npm run build
   ```

---

## 📖 How to Use

1. Connect your **Audiocular Aura** DAC to a USB port.
2. Open the [AuraPEQ Web App](https://mandy321.github.io/Audiocular-Aura/).
3. Click the **CONNECT DAC** button and select the device from the browser popup.
4. If the device does not show up:
   * Click **Show Custom USB Options**.
   * Inspect your system details to find the DAC's Vendor ID (VID) and Product ID (PID) in hex.
   * Input the values (e.g. `262a`) and click **CONNECT DAC** again.
5. Interact with the visualizer canvas by dragging the band handles, or configure parameters manually in the sidebar panel.
6. Click **SYNC TO RAM** to test the tuning.
7. Once satisfied with the sound, click **SAVE TO FLASH** to store your preset permanently on the DAC.

---

## ⚡ Deployment to GitHub Pages

This project is configured to easily deploy to GitHub Pages. To publish changes:

1. Build the production build locally:
   ```bash
   npm run build
   ```
2. Deploy the built `dist` folder to your `gh-pages` branch:
   ```bash
   npx gh-pages -d dist
   ```

---

## 🛡️ License

This project is open-source and licensed under the MIT License.
