// Offline support: keeps the app itself (page, scripts, styles, fonts) cached so it opens without internet.
// Notes are not handled here: Firestore has its own offline cache, local mode lives in the browser.
const VERSION = "v1";
const SHELL = `nb-shell-${VERSION}`;
const FONTS = `nb-fonts-${VERSION}`;
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Pages: try the network first so updates show up, fall back to the cached app when offline.
  if (req.mode === "navigate" && url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put("/", copy)); return res; })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Built files have a hash in their name, so a cached copy is always right.
  if (url.origin === location.origin && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/"))) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Google Fonts: use the cached copy right away and refresh it in the background.
  if (url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(FONTS).then((c) => c.match(req).then((hit) => {
        const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }))
    );
  }
  // Everything else (Firebase, AI images) goes straight to the network.
});
