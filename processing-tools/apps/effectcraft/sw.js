importScripts("../../effect-assets.js");
// EffectCraft service worker: the app works offline once loaded, and installs as an app.
//
// `cargo xtask web` fills in the build's file list and version. Every file is precached into a
// cache named after the version, served cache-first (responses keep the server's headers, so
// the page stays cross-origin isolated: COOP/COEP), and old versions are dropped once the new
// one activates. Anything else same-origin is fetched from the network and cached for next time,
// except the config file, which must stay live.
const VERSION = "7110fea2d01a994d";
const FILES = ["./", "./audio-worklet.js", "./effectcraft_web.js", "./effectcraft_web_bg.wasm", "./favicon.svg", "./icon-256.png", "./icon-512.png", "./index.html", "./manifest.webmanifest", "./snippets/effectcraft-web-37988623cc869135/js/host.js", "./snippets/eframe-d31a8450ea12dfc1/inline0.js", "./worker.js"];
const prefix = "access-motion:" + self.registration.scope;
const CACHE = prefix + VERSION;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => installMotionAssets(c, FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(prefix) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (!url.href.startsWith(self.registration.scope) || url.href.startsWith(new URL("host/", self.registration.scope).href) || url.pathname.endsWith("/effectcraft-config.json")) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE).catch(() => null);
      if (cache) {
        // The page itself regardless of its query (?empty, ?demo…).
        const key = req.mode === "navigate" ? new URL("./", self.registration.scope).href : req;
        const hit = await cache.match(key, { ignoreSearch: req.mode === "navigate" }).catch(() => null);
        if (hit) return hit;
      }
      const res = await motionAsset(req);
      if (cache && res.ok && res.type === "basic") void cache.put(req, res.clone()).catch(() => {});
      return res;
    })(),
  );
});
