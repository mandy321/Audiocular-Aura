// Lightweight analytics wrapper for PostHog

declare global {
	interface Window {
		posthog?: any;
	}
}

/**
 * Capture an event if PostHog is loaded
 */
export function trackEvent(eventName: string, properties?: Record<string, any>) {
	try {
		if (typeof window !== "undefined" && window.posthog && typeof window.posthog.capture === "function") {
			window.posthog.capture(eventName, properties);
		}
	} catch (e) {
		console.debug("[Analytics] Failed to capture event:", e);
	}
}
