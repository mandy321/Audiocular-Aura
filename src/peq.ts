import type { Band } from "./main.ts";

/**
 * CONFIG & CONSTANTS FOR PEQ CANVAS
 */
const CONFIG = {
	minFreq: 20,
	maxFreq: 20000,
	minGain: -12,
	gainRange: 12,
	padding: 40,
};

/**
 * STATE MANAGEMENT
 */
let localBands: Band[] = [];
let selectedIndex: number | null = null;
let draggingIndex: number | null = null;
let onUpdateCallback:
	| ((index: number, key: string, value: number | string | boolean) => void)
	| null = null;

// DOM Elements
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

/**
 * MATHEMATICS: Frequency to X Coordinate (Logarithmic Scale)
 */
function freqToX(freq: number, width: number) {
	const logMin = Math.log10(CONFIG.minFreq);
	const logMax = Math.log10(CONFIG.maxFreq);
	const logFreq = Math.log10(Math.max(freq, CONFIG.minFreq));
	return (
		CONFIG.padding +
		((logFreq - logMin) / (logMax - logMin)) * (width - 2 * CONFIG.padding)
	);
}

/**
 * MATHEMATICS: X Coordinate to Frequency (Logarithmic Scale)
 */
function xToFreq(x: number, width: number) {
	const logMin = Math.log10(CONFIG.minFreq);
	const logMax = Math.log10(CONFIG.maxFreq);
	const ratio = (x - CONFIG.padding) / (width - 2 * CONFIG.padding);
	return 10 ** (logMin + ratio * (logMax - logMin));
}

/**
 * MATHEMATICS: Gain to Y Coordinate
 */
function gainToY(gain: number, height: number) {
	return height / 2 - (gain / CONFIG.gainRange) * (height / 2 - CONFIG.padding);
}

/**
 * MATHEMATICS: Y Coordinate to Gain
 */
function yToGain(y: number, height: number) {
	return (-(y - height / 2) * CONFIG.gainRange) / (height / 2 - CONFIG.padding);
}

/**
 * Calculate Biquad Filter Coefficients (RBJ Audio EQ Cookbook)
 */
function calculateBiquad(band: Band, sampleRate: number = 48000) {
	if (!band.enabled) {
		return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
	}

	const w0 = (2 * Math.PI * band.freq) / sampleRate;
	const alpha = Math.sin(w0) / (2 * band.q);
	const A = 10 ** (band.gain / 40);
	const cosw = Math.cos(w0);

	let b0, b1, b2, a0, a1, a2;

	switch (band.type) {
		case "PK": // Peaking EQ
			b0 = 1 + alpha * A;
			b1 = -2 * cosw;
			b2 = 1 - alpha * A;
			a0 = 1 + alpha / A;
			a1 = -2 * cosw;
			a2 = 1 - alpha / A;
			break;
		case "LSQ": {
			// Low Shelf
			const sa = 2 * Math.sqrt(A) * alpha;
			b0 = A * (A + 1 - (A - 1) * cosw + sa);
			b1 = 2 * A * (A - 1 - (A + 1) * cosw);
			b2 = A * (A + 1 - (A - 1) * cosw - sa);
			a0 = A + 1 + (A - 1) * cosw + sa;
			a1 = -2 * (A - 1 + (A + 1) * cosw);
			a2 = A + 1 + (A - 1) * cosw - sa;
			break;
		}
		case "HSQ": {
			// High Shelf
			const sb = 2 * Math.sqrt(A) * alpha;
			b0 = A * (A + 1 + (A - 1) * cosw + sb);
			b1 = -2 * A * (A - 1 + (A + 1) * cosw);
			b2 = A * (A + 1 + (A - 1) * cosw - sb);
			a0 = A + 1 - (A - 1) * cosw + sb;
			a1 = 2 * (A - 1 - (A + 1) * cosw);
			a2 = A + 1 - (A - 1) * cosw - sb;
			break;
		}
		default:
			b0 = 1; b1 = 0; b2 = 0;
			a0 = 1; a1 = 0; a2 = 0;
			break;
	}

	return {
		b0: b0 / a0,
		b1: b1 / a0,
		b2: b2 / a0,
		a1: a1 / a0,
		a2: a2 / a0,
	};
}

/**
 * Compute Magnitude response at a given frequency
 */
function getMagnitude(
	freq: number,
	coeffsList: any[],
	sampleRate: number = 48000,
) {
	const w = (2 * Math.PI * freq) / sampleRate;
	const cos1 = Math.cos(w);
	const cos2 = Math.cos(2 * w);
	const sin1 = Math.sin(w);
	const sin2 = Math.sin(2 * w);

	let totalDb = 0;

	coeffsList.forEach((c) => {
		const numRe = c.b0 + c.b1 * cos1 + c.b2 * cos2;
		const numIm = -(c.b1 * sin1 + c.b2 * sin2);
		const denRe = 1 + c.a1 * cos1 + c.a2 * cos2;
		const denIm = -(c.a1 * sin1 + c.a2 * sin2);

		const magSq =
			(numRe * numRe + numIm * numIm) / (denRe * denRe + denIm * denIm);
		totalDb += 10 * Math.log10(magSq);
	});

	return totalDb;
}

/**
 * Handle canvas resize events
 */
export function resizeCanvas() {
	if (!canvas || !ctx) return;
	const parent = canvas.parentElement;
	if (!parent) return;

	const rect = canvas.getBoundingClientRect();
	const dpr = window.devicePixelRatio || 1;

	canvas.width = Math.round(rect.width * dpr);
	canvas.height = Math.round(rect.height * dpr);

	ctx.scale(dpr, dpr);

	(canvas as any).logicalWidth = rect.width;
	(canvas as any).logicalHeight = rect.height;

	draw();
}

/**
 * Draw logarithmic grid, frequency lines and gain labels
 */
function drawGrid(c: CanvasRenderingContext2D, width: number, height: number) {
	// Background grid lines style
	c.strokeStyle = "rgba(255, 255, 255, 0.04)";
	c.lineWidth = 1;
	c.font = "10px 'Outfit', sans-serif";
	c.fillStyle = "rgba(255, 255, 255, 0.4)";
	c.textAlign = "right";

	// Horizontal Gain lines
	for (let g = -CONFIG.gainRange; g <= CONFIG.gainRange; g += 6) {
		const y = gainToY(g, height);
		c.beginPath();
		c.moveTo(CONFIG.padding, y);
		c.lineTo(width - CONFIG.padding, y);
		c.stroke();
		if (g !== 0) c.fillText(`${g} dB`, CONFIG.padding - 8, y + 3);
	}

	// Mid-zero reference line
	const zeroY = gainToY(0, height);
	c.strokeStyle = "rgba(139, 92, 246, 0.2)"; // Deep violet reference line
	c.lineWidth = 1.5;
	c.beginPath();
	c.moveTo(CONFIG.padding, zeroY);
	c.lineTo(width - CONFIG.padding, zeroY);
	c.stroke();

	// Logarithmic frequency lines
	const freqs = [30, 60, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
	c.strokeStyle = "rgba(255, 255, 255, 0.04)";
	c.lineWidth = 1;
	c.textAlign = "center";

	freqs.forEach((f) => {
		const x = freqToX(f, width);
		c.beginPath();
		c.moveTo(x, CONFIG.padding);
		c.lineTo(x, height - CONFIG.padding);
		c.stroke();
		c.fillText(
			f >= 1000 ? `${f / 1000}k` : f.toString(),
			x,
			height - CONFIG.padding + 16,
		);
	});
}

/**
 * Trace out the cumulative EQ filter curve on the canvas
 */
function drawCurve(c: CanvasRenderingContext2D, width: number, height: number) {
	const activeCoeffs = localBands.map((b) => calculateBiquad(b));

	c.beginPath();
	
	// Create a beautiful glowing gradient for the EQ curve
	const gradient = c.createLinearGradient(CONFIG.padding, 0, width - CONFIG.padding, 0);
	gradient.addColorStop(0, "#a78bfa"); // Neon violet-purple
	gradient.addColorStop(0.5, "#ec4899"); // Magenta/Pink aura
	gradient.addColorStop(1, "#8b5cf6"); // Deep violet
	
	c.strokeStyle = gradient;
	c.lineWidth = 3.5;
	c.shadowBlur = 15;
	c.shadowColor = "rgba(167, 139, 250, 0.5)"; // Aura glow

	const endX = width - CONFIG.padding;
	const startX = CONFIG.padding;

	for (let i = 0; i <= endX - startX; i++) {
		const x = startX + i;
		const freq = xToFreq(x, width);
		const totalGain = getMagnitude(freq, activeCoeffs);
		const y = gainToY(totalGain, height);

		if (i === 0) c.moveTo(x, y);
		else c.lineTo(x, y);
	}
	c.stroke();
	c.shadowBlur = 0; // Reset shadow
}

/**
 * Draw interactive EQ band handles on the canvas
 */
function drawHandles(
	c: CanvasRenderingContext2D,
	width: number,
	height: number,
) {
	localBands.forEach((band) => {
		const x = freqToX(band.freq, width);
		const y = gainToY(band.gain, height);
		const isSelected = band.index === selectedIndex;
		const isDisabled = !band.enabled;

		// 1. Draw outer glowing ring for selected band
		if (isSelected) {
			c.beginPath();
			c.arc(x, y, 12, 0, 2 * Math.PI);
			c.fillStyle = "rgba(167, 139, 250, 0.25)";
			c.strokeStyle = "rgba(236, 72, 153, 0.5)";
			c.lineWidth = 1;
			c.fill();
			c.stroke();
		}

		// 2. Draw core handle
		c.beginPath();
		c.arc(x, y, isSelected ? 8 : 6, 0, 2 * Math.PI);

		if (isDisabled) {
			c.fillStyle = isSelected ? "rgba(239, 68, 68, 0.5)" : "rgba(100, 116, 139, 0.4)";
			c.strokeStyle = "rgba(255, 255, 255, 0.1)";
		} else {
			c.fillStyle = isSelected ? "#ffffff" : "#ec4899"; // White when selected, magenta when active
			c.strokeStyle = isSelected ? "#ec4899" : "#8b5cf6"; // Violet borders
		}

		c.lineWidth = 2.5;
		c.fill();
		c.stroke();

		// 3. Draw band number label above handle
		c.fillStyle = isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.6)";
		c.font = "bold 9px 'Outfit', sans-serif";
		c.textAlign = "center";
		c.fillText((band.index + 1).toString(), x, y - (isSelected ? 14 : 11));
	});
}

/**
 * Redraw the entire canvas
 */
export function draw() {
	if (!canvas || !ctx) return;
	const width = (canvas as any).logicalWidth || canvas.width;
	const height = (canvas as any).logicalHeight || canvas.height;

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	drawGrid(ctx, width, height);
	drawCurve(ctx, width, height);
	drawHandles(ctx, width, height);
}

/**
 * INITIALIZATION API: Binds DOM events to the canvas
 */
export function renderPEQ(
	_container: HTMLElement, // Left for compatibility
	bands: Band[],
	updateCallback: (index: number, key: string, value: any) => void,
) {
	localBands = bands;
	onUpdateCallback = updateCallback;

	canvas = document.getElementById("eqCanvas") as HTMLCanvasElement;
	if (!canvas) return;
	ctx = canvas.getContext("2d");

	if (!(canvas as any).listenersBound) {
		(canvas as any).listenersBound = true;

		// Resize observer for canvas scalability
		const resizeObserver = new ResizeObserver(() => resizeCanvas());
		if (canvas.parentElement) {
			resizeObserver.observe(canvas.parentElement);
		}

		resizeCanvas();

		// MOUSE DRAGGING ON CANVAS
		canvas.addEventListener("mousedown", (e) => {
			const rect = canvas!.getBoundingClientRect();
			const scaleX = (canvas as any).logicalWidth / rect.width;
			const scaleY = (canvas as any).logicalHeight / rect.height;
			const x = (e.clientX - rect.left) * scaleX;
			const y = (e.clientY - rect.top) * scaleY;

			let closestIdx = -1;
			let minDst = 1000;

			const w = (canvas as any).logicalWidth;
			const h = (canvas as any).logicalHeight;

			localBands.forEach((band) => {
				const bx = freqToX(band.freq, w);
				const by = gainToY(band.gain, h);
				const dist = Math.sqrt((x - bx) ** 2 + (y - by) ** 2);
				
				// Click threshold of 24 pixels
				if (dist < 24) {
					if (dist < minDst) {
						minDst = dist;
						closestIdx = band.index;
					}
				}
			});

			if (closestIdx !== -1) {
				draggingIndex = closestIdx;
				selectedIndex = closestIdx;
				draw();
			}
		});

		window.addEventListener("mousemove", (e) => {
			if (draggingIndex === null || !canvas) return;

			const rect = canvas.getBoundingClientRect();
			const w = (canvas as any).logicalWidth || rect.width;
			const h = (canvas as any).logicalHeight || rect.height;

			const scaleX = w / rect.width;
			const scaleY = h / rect.height;

			const relX = (e.clientX - rect.left) * scaleX;
			const relY = (e.clientY - rect.top) * scaleY;

			const clampedX = Math.max(
				CONFIG.padding,
				Math.min(w - CONFIG.padding, relX),
			);
			const clampedY = Math.max(
				CONFIG.padding,
				Math.min(h - CONFIG.padding, relY),
			);

			const freq = Math.round(xToFreq(clampedX, w));
			const gain = Math.round(yToGain(clampedY, h) * 10) / 10;

			// Limit gain range within -12 to 12
			const clampedGain = Math.max(-12, Math.min(12, gain));

			handleUpdate(draggingIndex, "freq", freq);
			handleUpdate(draggingIndex, "gain", clampedGain);
		});

		window.addEventListener("mouseup", () => {
			if (draggingIndex !== null) {
				draggingIndex = null;
				if (typeof (window as any).pushHistory === "function") {
					(window as any).pushHistory();
				}
			}
		});
	}

	draw();
}

/**
 * Handle state update callbacks
 */
function handleUpdate(index: number, key: string, value: any) {
	if (onUpdateCallback) {
		onUpdateCallback(index, key, value);
	}

	const band = localBands[index];
	if (band) {
		if (key === "freq") band.freq = Number(value);
		if (key === "gain") band.gain = Number(value);
		if (key === "q") band.q = Number(value);
		if (key === "type") band.type = String(value);
		if (key === "enabled") band.enabled = Boolean(value);

		draw();
	}
}
