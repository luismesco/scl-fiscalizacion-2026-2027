/* Luis Montañez Escobar */
const CACHE='calendario-electoral-2026-2027-seleccion-multiple-5-2';
const SHELL=['./','index.html','styles.css','app.js','documents.js','naming.js','export-config.json','assets/icons.svg','assets/mexico.svg','assets/estados.svg','assets/favicon.svg','assets/fonts/Montserrat-Regular.ttf','assets/fonts/Montserrat-SemiBold.ttf','assets/fonts/Montserrat-Bold.ttf','data/calendar.json','manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('calendario-electoral-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);const cached=await cache.match(event.request);
    if(event.request.mode==='navigate'||/\.(?:js|css)$/.test(new URL(event.request.url).pathname)||new URL(event.request.url).pathname.endsWith('/data/calendar.json')){
      try{const fresh=await fetch(event.request);if(fresh.ok)await cache.put(event.request,fresh.clone());return fresh;}catch{if(cached)return cached;throw new Error('offline');}
    }
    if(cached)return cached;
    try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}catch{if(event.request.mode==='navigate')return cache.match('index.html');throw new Error('offline');}
  })());
});
