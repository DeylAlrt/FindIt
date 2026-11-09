// service-worker.js - runs in the background, separate from the page.
// It sits between the app and the network, so it can answer requests
// from its cache when there is no internet connection.

// Change this number whenever you change a frontend file (html, css, js),
// so phones download the new version instead of keeping the old cached one.
const VERSION = "v1";
const SHELL_CACHE = "findit-shell-" + VERSION; // the app's own files
const API_CACHE = "findit-api-v1";             // the last data we got from the server

// The "app shell": everything needed to open the app with no internet
const APP_SHELL = [
    "/",
    "/index.html",
    "/style.css",
    "/app.js",
    "/manifest.json",
    "/icon-192.png",
    "/icon-512.png",
    "/images/samples/wallet.jpg",
    "/images/samples/id-card.svg",
    "/images/samples/charger.jpg",
    "/images/samples/umbrella.jpg",
    "/images/samples/car-keys.jpg"
];


// 1. INSTALL: save the app shell in the cache
self.addEventListener("install", (event) => {
    console.log("Service Worker installed");
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting(); // use the new service worker straight away
});


// 2. ACTIVATE: delete old versions of the app shell cache
self.addEventListener("activate", (event) => {
    console.log("Service Worker activated");
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names
                .filter((name) => name.startsWith("findit-shell-") && name !== SHELL_CACHE)
                .map((name) => caches.delete(name))
        ))
    );
    self.clients.claim(); // start controlling open pages now
});


// 3. FETCH: runs for every request the app makes
self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle GET requests to our own server.
    // POST, PUT, PATCH and DELETE always go straight to the network.
    if (request.method !== "GET" || url.origin !== self.location.origin) return;

    if (url.pathname.startsWith("/api/")) {
        event.respondWith(networkFirst(request));
    } else {
        event.respondWith(cacheFirst(request));
    }
});


// NETWORK-FIRST (for API data): try the server for fresh data and save a copy.
// If the server can't be reached, use the saved copy instead.
async function networkFirst(request) {
    const cache = await caches.open(API_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone()); // a response can only be read once, so save a copy
        }
        return response;
    } catch (error) {
        const saved = await cache.match(request);
        if (saved) return saved;

        // Nothing saved: send a JSON error the app can show
        return new Response(
            JSON.stringify({ error: "You are offline and this hasn't been saved yet." }),
            { status: 503, headers: { "Content-Type": "application/json" } }
        );
    }
}


// CACHE-FIRST (for the app shell): use the cached file if we have it,
// otherwise download it from the network.
async function cacheFirst(request) {
    const saved = await caches.match(request);
    if (saved) return saved;

    try {
        return await fetch(request);
    } catch (error) {
        // Offline and not cached: for page loads, fall back to the app's main page
        if (request.mode === "navigate") {
            return caches.match("/index.html");
        }
        return Response.error();
    }
}
