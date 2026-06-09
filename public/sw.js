const CACHE_NAME = "aurapeq-cache-v1";
const ASSETS_TO_CACHE = [
	"./",
	"./index.html",
	"./manifest.json",
	"./icon-192.png",
	"./icon-512.png"
];

// Install Event - Pre-cache basic static assets
self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			console.log("[Service Worker] Pre-caching offline assets");
			return cache.addAll(ASSETS_TO_CACHE);
		}).then(() => self.skipWaiting())
	);
});

// Activate Event - Clean up old caches
self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames.map((cache) => {
					if (cache !== CACHE_NAME) {
						console.log("[Service Worker] Removing old cache:", cache);
						return caches.delete(cache);
					}
				})
			);
		}).then(() => self.clients.claim())
	);
});

// Fetch Event - Cache First / Network Fallback with Dynamic Caching
self.addEventListener("fetch", (event) => {
	// Only handle GET requests (Cache API does not support POST/PUT etc.)
	if (event.request.method !== "GET") {
		return;
	}

	// Only handle HTTP/HTTPS requests (bypasses chrome-extension etc.)
	if (!event.request.url.startsWith(self.location.origin)) {
		return;
	}

	event.respondWith(
		caches.match(event.request).then((cachedResponse) => {
			if (cachedResponse) {
				// Return cached response, but fetch in background to update cache (stale-while-revalidate)
				fetch(event.request).then((networkResponse) => {
					if (networkResponse && networkResponse.status === 200) {
						caches.open(CACHE_NAME).then((cache) => {
							cache.put(event.request, networkResponse);
						});
					}
				}).catch(() => {/* Ignore network errors offline */});
				return cachedResponse;
			}

			// If not cached, fetch from network and cache dynamically
			return fetch(event.request).then((networkResponse) => {
				if (!networkResponse || networkResponse.status !== 200) {
					return networkResponse;
				}

				const responseToCache = networkResponse.clone();
				caches.open(CACHE_NAME).then((cache) => {
					cache.put(event.request, responseToCache);
				});

				return networkResponse;
			}).catch(() => {
				// Offline fallback for html pages
				if (event.request.headers.get("accept") && event.request.headers.get("accept").includes("text/html")) {
					return caches.match("./index.html");
				}
			});
		})
	);
});
