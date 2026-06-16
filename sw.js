/* Service Worker for the HR Strategic Management Platform (PWA) */
/* v4: network-first for app shell + JS/HTML, instant skip-waiting */
const CACHE = 'hrsp-v7';
const ASSETS = ['./', './index.html', './manifest.json', './icon-an-192.png', './icon-an-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Allow the page to force an immediate activation of a new worker. */
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // Never touch non-GET (AI POST calls) or cross-origin (Worker, CDNs, fonts).
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isShell = req.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.js')
    || url.pathname === '/' || url.pathname.endsWith('/');

  if (isShell) {
    // App shell + HTML + JS: ALWAYS network-first so fresh content wins online.
    e.respondWith(
      fetch(req).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(req, cp));
        return r;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Other same-origin GET (icons, manifest): cache-first, then network.
  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(resp => {
      const cp = resp.clone();
      caches.open(CACHE).then(c => c.put(req, cp));
      return resp;
    }).catch(() => r))
  );
});
