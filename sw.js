/* NeuroSpine Calculator service worker: offline support.
   © 2026 Dr. Mohammed Asfa. All rights reserved.
   Change CACHE when you publish a new version so phones fetch the update. */
var CACHE = "nss-v47";
var CORE = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "fig-cord.webp", "fig-ventricles.webp", "fig-cord-syndromes.webp", "fig-herniation.webp", "fig-csf.webp", "fig-cs-skull.webp", "fig-access-r.webp", "fig-kocher.webp", "fig-evd.webp", "fig-lobes.webp", "fig-posterior.webp", "fig-roots-lumbar.webp", "fig-roots-cervical.webp", "fig-cs-axial-a.webp", "fig-cs-axial-b.webp", "fig-cs-sag-mid.webp", "fig-cs-sag-lat.webp", "fig-willis.webp", "fig-ica.webp"];
// The 3D models (fig-skull3d.json, fig-ventricles3d.json; about 0.8 MB) are not downloaded at install:
// they are cached the first time the 3D skull page is opened (cache-first rule below) and then work offline.

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Cache each file on its own, so one missing file never blocks the update; bypass the browser cache so new pictures arrive.
      return Promise.all(CORE.map(function (u) { return cache.add(new Request(u, { cache: "reload" })).catch(function () {}); }));
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

// Handle only this app's own files. Other pages or apps published on the same GitHub site
// (for example in a sub-folder) pass straight to the network, so they are never cached or replaced here.
var SCOPE = new URL(self.registration.scope).pathname;
var OWN = /^(index\.html|manifest\.json|fig-[\w.-]+\.(webp|json)|icon-[\w-]+\.png|apple-touch-icon\.png|screenshot-\d+\.png)$/;
function ownFile(url) {
  if (url.origin !== self.location.origin || url.pathname.indexOf(SCOPE) !== 0) return null;
  var rest = url.pathname.slice(SCOPE.length);
  return rest === "" || OWN.test(rest) ? (rest || "index.html") : null;
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url), own = ownFile(url);

  // Pages and the manifest: try the network first so updates (including the app name) arrive,
  // fall back to the cached copy offline.
  if (own === "manifest.json") {
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

  // On a slow or unstable connection do not keep the doctor waiting: if the network has not answered
  // within 3 s, open the saved copy and let the download finish in the background for next time.
  if (req.mode === "navigate") {
    if (own !== "index.html") return;
    var net = fetch(req.url, { cache: "no-store", credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error("bad status");
      var copy = res.clone();
      return caches.open(CACHE).then(function (c) { return c.put("index.html", copy); }).then(function () { return res; }, function () { return res; });
    });
    event.waitUntil(net.catch(function () {}));
    event.respondWith(new Promise(function (resolve) {
      var settled = false;
      var useCache = function (orError) {
        return caches.match("index.html").then(function (hit) {
          if (settled) return;
          if (hit) { settled = true; resolve(hit); } else if (orError) { settled = true; resolve(Response.error()); }
        });
      };
      var timer = setTimeout(function () { useCache(false); }, 3000);
      net.then(function (res) { clearTimeout(timer); if (!settled) { settled = true; resolve(res); } },
               function () { clearTimeout(timer); useCache(true); });
    }));
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

  // The app's other files (pictures, 3D models, icons): cache first.
  if (own) {
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
