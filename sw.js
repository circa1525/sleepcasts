const CACHE = 'sleepcasts-shell-v5';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'data/stories.json',
  'img/moon-32.png', 'img/moon-180.png', 'img/moon-192.png', 'img/moon-512.png', 'img/moon-512-maskable.png',
  'img/harbor.png', 'img/train.png', 'img/cabin.png', 'img/greenhouse.png', 'img/library.png', 'img/lake.png',
  'img/harbor-512.png', 'img/train-512.png', 'img/cabin-512.png', 'img/greenhouse-512.png', 'img/library-512.png', 'img/lake-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/audio/')) return;           // let Safari stream audio with Range requests natively
  // network-first for the shell so updates arrive; fall back to cache offline
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
