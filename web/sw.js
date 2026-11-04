// Service worker: o app abre sem internet com os últimos dados vistos.
// Estratégia: rede primeiro para os dados (sempre tenta a versão mais nova), cache como reserva.
const CACHE = 'reclamabh-v1';
const BASE = ['./', 'index.html', 'css/estilo.css', 'js/app.js', 'js/busca.js', 'js/graficos.js', 'img/icone.svg', 'manifest.webmanifest'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== location.origin) return;
  ev.respondWith(fetch(ev.request).then((resp) => {
    const copia = resp.clone();
    caches.open(CACHE).then((c) => c.put(ev.request, copia));
    return resp;
  }).catch(() => caches.match(ev.request)));
});
