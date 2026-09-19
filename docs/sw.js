// Offline-Cache der Werkstatt-Pipeline. DER NAME TRAEGT DEN STAND: nur ein
// geaendertes Skript installiert den Worker neu und holt alle Dateien frisch.
const STAND='19.09.2026 09:30 (c195bf7b)';
const CACHE='wp-'+STAND.replace(/[^0-9a-f]/gi,'');
// KEIN ./ in der Liste: ein Server ohne Verzeichnis-Index laesst sonst die
// GANZE Installation platzen; Navigationen fallen unten auf index.html zurueck.
const DATEIEN=['./index.html','./manifest.webmanifest','./symbol-180.png','./symbol-192.png','./symbol-512.png'];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(DATEIEN)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e=>{
  if(/stand\.txt/.test(e.request.url)) return;   // die Datei, an der die App erkennt, ob sie alt ist - nie aus dem Cache
  if(e.request.method!=='GET') return;
  e.respondWith(caches.open(CACHE).then(async c=>{
    // DER NACHSCHUB MUSS ZU ENDE LAUFEN: ohne waitUntil beendet der Browser den Worker nach der Antwort,
    // und der Cache erneuert sich NIE (der 12.09.-Stand der Dreh-App hing genau daran).
    const frisch=fetch(e.request).then(r=>{ if(r && r.ok) return c.put(e.request, r.clone()).then(()=>r).catch(()=>r); return r; }).catch(()=>null);
    try{ e.waitUntil(frisch); }catch(err){}
    if(e.request.mode==='navigate'){
      const geduld=new Promise(r=>setTimeout(()=>r(null), 3000));
      const netz=await Promise.race([frisch, geduld]);
      if(netz && netz.ok) return netz;   // eine Fehlerseite verdraengt die Kopie nicht
      return (await c.match(e.request, {ignoreSearch:true})) || (await c.match('./index.html')) || new Response('offline', {status:503});
    }
    const alt=await c.match(e.request, {ignoreSearch:true});
    return alt || (await frisch) || new Response('offline', {status:503});
  }));
});
