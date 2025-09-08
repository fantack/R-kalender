/* R‑kalender service worker */
const CACHE_NAME = 'rkalender-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', (e)=>{
  e.waitUntil((async ()=>{
    const c = await caches.open(CACHE_NAME);
    try { await c.addAll(ASSETS); } catch(e){}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  e.respondWith((async ()=>{
    const cached = await caches.match(req);
    if (cached) return cached;
    try{
      const res = await fetch(req);
      return res;
    }catch{
      return caches.match('./');
    }
  })());
});

self.addEventListener('notificationclick', (event)=>{
  event.notification.close();
  event.waitUntil((async ()=>{
    const allClients = await clients.matchAll({ type:'window', includeUncontrolled:true });
    const url = self.registration.scope;
    const client = allClients.find(c => c.url.startsWith(url));
    if (client){
      client.focus();
      client.postMessage({ type:'focus' });
    } else {
      await clients.openWindow(url);
    }
  })());
});
