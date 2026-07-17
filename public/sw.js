const CACHE_NAME = "wzrd-zap-public-v1";
const OFFLINE_URL = "/offline.html";
const PUBLIC_NAVIGATION_PATHS = new Set(["/"]);
const PUBLIC_ASSET_PATHS = new Set([
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/icon-16.png",
  "/icon-32.png",
  "/icon-48.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/offline.html",
  "/zaplogo.png",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([
    OFFLINE_URL,
    "/apple-touch-icon.png",
    "/favicon.ico",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-512.png",
  ])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith("wzrd-zap-public-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request, PUBLIC_NAVIGATION_PATHS.has(url.pathname)));
    return;
  }

  if (isPrivatePath(url.pathname) || !isPublicAssetPath(url.pathname)) return;
  event.respondWith(networkFirstAsset(request));
});

function isPrivatePath(pathname) {
  return ["/api/", "/settings", "/studio", "/runs/", "/zap/"].some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function isPublicAssetPath(pathname) {
  return pathname.startsWith("/_next/static/") || PUBLIC_ASSET_PATHS.has(pathname);
}

function isCacheable(response) {
  return response.ok && !response.headers.get("cache-control")?.includes("no-store");
}

async function networkFirstNavigation(request, cacheResponse) {
  try {
    const response = await fetch(request);
    if (cacheResponse && isCacheable(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    if (cacheResponse) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    return (await cache.match(OFFLINE_URL)) ?? new Response("Offline", { status: 503 });
  }
}

async function networkFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? new Response("Asset unavailable", { status: 504 });
  }
}
