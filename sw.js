/* NeuroSpine Calculator service worker: offline support.
   © 2026 Dr. Mohammed Asfa. All rights reserved.
   Change CACHE when you publish a new version so phones fetch the update. */
var CACHE = "nss-v18";
var CORE = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Cache each file on its own, so one missing file never blocks the update.
      return Promise.all(CORE.map(function (u) { return cache.add(u).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Pages and the manifest: try the network first so updates (including the app name) arrive,
  // fall back to the cached copy offline.
  if (url.origin === self.location.origin && /manifest\.json$/.test(url.pathname)) {
    event.respondWith(
      fetch(req.url, { cache: "no-store", credentials: "same-origin" }).then(function (res) {
        if (!res.ok) throw new Error("bad status");
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("manifest.json", copy); });
        return res;
      }).catch(function () { return caches.match("manifest.json"); })
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req.url, { cache: "no-store", credentials: "same-origin" }).then(function (res) {
        if (!res.ok) throw new Error("bad status");
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("index.html", copy); });
        return res;
      }).catch(function () { return caches.match("index.html"); })
    );
    return;
  }

  // Google Fonts: serve from cache, refresh in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) { cache.put(req, res.clone()); return res; }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  // Other files on this site: cache first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
          return res;
        });
      })
    );
  }
});
