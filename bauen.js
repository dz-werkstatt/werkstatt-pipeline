// =====================================================================
// bauen.js — setzt die Werkstatt-Pipeline aus den Quellmodulen zusammen
// ---------------------------------------------------------------------
// [Ansage 13.09.2026: "so wie bei den Drehen und Fraesen Apps,
// so moechte ich's da auch haben"] Gebaut wird wie in den beiden
// Schwester-Apps: Quellmodule in Ordnern, eine Byte-Verkettung, und
// AUSGELIEFERT wird GENAU EINE HTML-Datei. Doppelklick, offline, kein
// Server, keine Abhaengigkeit. Die Offline-Doktrin gilt dem Ergebnis,
// nicht der Werkbank.
//
// Die Ordnernamen sind die des Lastenhefts (import, kalkulation,
// arbeitsplan, shared, ui) — das ist die geforderte Modulstruktur, und
// sie ist zugleich die Bauliste.
//
//   node bauen.js            baut die Datei
//   node bauen.js --pruefe   baut NICHT, sondern vergleicht: stimmt die
//                            ausgelieferte Datei mit dem ueberein, was
//                            aus den Quellen entstuende? (Exit 1 bei
//                            Abweichung — der Haken fuer den Pruefstand.)
//
// ZWEI ZIELE, gleiche Bytes:
//   werkstatt-pipeline.html   zum Doppelklicken (offline, ohne Server)
//   docs/index.html           GitHub Pages liest den Ordner docs/ auf
//                             main — damit ist JEDER PUSH das Deployment,
//                             ohne Action und ohne fremden Dienst.
//
// DER STAND (19.09.2026, Design-Punkt 6 der Nachtdurchsicht): Datum plus
// Kurzpruefsumme ueber die Quellen. Er steht in BEIDEN Zielen an der
// Marke window.__WP_STAND (shared/00-kopf.html), im Namen des Service-
// Worker-Caches (docs/sw.js) und in docs/stand.txt. Ein Browser
// installiert einen Service-Worker nur neu, wenn sich SEIN SKRIPT
// aendert - mit festem Namen bliebe der Cache vom ersten Tag stehen
// (Befund der Dreh-App vom 15.09.2026). --pruefe liest den Stand aus der
// ausgelieferten Datei zurueck und baut damit - so bleibt der Vergleich
// ein Byte-Beweis, obwohl das Datum in der Datei steht.
//
// ZWEI UMFORMUNGEN, beide Absicht: Dateien unter "einbetten"
// sind JSON und werden als "const NAME = <Dateiinhalt>;" eingesetzt.
// Grund: das Lastenheft verlangt, dass jeder Startwert in
// kalkulation/defaults.json steht und NICHT im Code. Die JSON-Datei
// bleibt damit die einzige Quelle; der Browser bekommt sie eingebettet,
// weil eine offline geoeffnete Datei nichts nachladen kann (fetch auf
// file:// ist gesperrt). Die Umformung ist deterministisch, deshalb
// bleibt --pruefe ein Byte-Beweis.
// =====================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WURZEL = __dirname;
const MANIFEST = path.join(WURZEL, 'manifest.json');

function hash(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }

const STAND_MARKE = 'window.__WP_STAND="ARBEITSKOPIE"';
function standLesen(text){
  const m = /window\.__WP_STAND="([^"]*)"/.exec(String(text || ''));
  return (m && m[1] !== 'ARBEITSKOPIE') ? m[1] : null;
}
function standNeu(summe){
  const d = new Date(), zz = n => String(n).padStart(2, '0');
  return zz(d.getDate()) + '.' + zz(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + zz(d.getHours()) + ':' + zz(d.getMinutes()) + ' (' + summe + ')';
}
/* standVorgabe: der Stand, der eingesetzt werden soll (beim Pruefen der aus der
   Datei gelesene); ohne Vorgabe entsteht ein neuer aus Datum und Pruefsumme. */
function zusammensetzen(standVorgabe){
  if(!fs.existsSync(MANIFEST)) throw new Error('Manifest fehlt: ' + MANIFEST);
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if(!Array.isArray(man.dateien) || !man.dateien.length)
    throw new Error('Manifest enthaelt keine Dateiliste.');

  const einbetten = man.einbetten || {};
  const teile = [];
  for(const name of man.dateien){
    const p = path.join(WURZEL, name);
    if(!fs.existsSync(p)) throw new Error('Quelldatei fehlt: ' + name + ' (im Manifest gelistet)');
    const roh = fs.readFileSync(p);           // BINAER — keine Zeilenende-Umwandlung
    if(einbetten[name]){
      // Muss gueltiges JSON sein, sonst faellt es erst im Browser auf.
      try{ JSON.parse(roh.toString('utf8')); }
      catch(e){ throw new Error(name + ' ist kein gueltiges JSON: ' + e.message); }
      teile.push(Buffer.from('const ' + einbetten[name] + ' = '));
      teile.push(roh);
      teile.push(Buffer.from(';\n'));
    } else {
      teile.push(roh);
    }
  }
  const roh = Buffer.concat(teile);
  const summe = hash(roh).slice(0, 8);            /* ueber die Quellen OHNE Stand - der Stand haengt nicht an sich selbst */
  const stand = standVorgabe || standNeu(summe);
  const text = roh.toString('utf8');
  if(text.split(STAND_MARKE).length !== 2) throw new Error('Die Stand-Marke ' + STAND_MARKE + ' muss genau einmal in den Quellen stehen (shared/00-kopf.html).');
  const buf = Buffer.from(text.replace(STAND_MARKE, 'window.__WP_STAND="' + stand + '"'), 'utf8');
  return { buf, man, stand, summe };
}

/* Der Service-Worker fuer docs/ - dasselbe Muster wie pwa-bauen.js der Dreh-App
   (Cache-Name traegt den Stand, waitUntil am Nachschub, Seitenaufrufe erst
   uebers Netz mit 3 s Geduld, stand.txt am Cache vorbei). */
function swText(stand){
  return [
    '// Offline-Cache der Werkstatt-Pipeline. DER NAME TRAEGT DEN STAND: nur ein',
    '// geaendertes Skript installiert den Worker neu und holt alle Dateien frisch.',
    "const STAND='" + stand + "';",
    "const CACHE='wp-'+STAND.replace(/[^0-9a-f]/gi,'');",
    '// KEIN ./ in der Liste: ein Server ohne Verzeichnis-Index laesst sonst die',
    '// GANZE Installation platzen; Navigationen fallen unten auf index.html zurueck.',
    "const DATEIEN=['./index.html','./manifest.webmanifest','./symbol-180.png','./symbol-192.png','./symbol-512.png'];",
    "self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(DATEIEN)).then(()=>self.skipWaiting())); });",
    "self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });",
    "self.addEventListener('fetch', e=>{",
    "  if(/stand\\.txt/.test(e.request.url)) return;   // die Datei, an der die App erkennt, ob sie alt ist - nie aus dem Cache",
    "  if(e.request.method!=='GET') return;",
    "  e.respondWith(caches.open(CACHE).then(async c=>{",
    "    // DER NACHSCHUB MUSS ZU ENDE LAUFEN: ohne waitUntil beendet der Browser den Worker nach der Antwort,",
    "    // und der Cache erneuert sich NIE (der 12.09.-Stand der Dreh-App hing genau daran).",
    "    const frisch=fetch(e.request).then(r=>{ if(r && r.ok) return c.put(e.request, r.clone()).then(()=>r).catch(()=>r); return r; }).catch(()=>null);",
    "    try{ e.waitUntil(frisch); }catch(err){}",
    "    if(e.request.mode==='navigate'){",
    "      const geduld=new Promise(r=>setTimeout(()=>r(null), 3000));",
    "      const netz=await Promise.race([frisch, geduld]);",
    "      if(netz && netz.ok) return netz;   // eine Fehlerseite verdraengt die Kopie nicht",
    "      return (await c.match(e.request, {ignoreSearch:true})) || (await c.match('./index.html')) || new Response('offline', {status:503});",
    "    }",
    "    const alt=await c.match(e.request, {ignoreSearch:true});",
    "    return alt || (await frisch) || new Response('offline', {status:503});",
    "  }));",
    "});", ''
  ].join('\n');
}

const nurPruefen = process.argv.includes('--pruefe');

if(require.main === module) try{
  /* Beim Pruefen zaehlt der Stand, der in der ausgelieferten Datei steht - sonst waere
     jeder Vergleich allein am Datum verloren. */
  let vorgabe = null;
  if(nurPruefen){
    const erstes = path.join(WURZEL, 'werkstatt-pipeline.html');
    if(fs.existsSync(erstes)) vorgabe = standLesen(fs.readFileSync(erstes, 'utf8'));
  }
  const { buf, man, stand } = zusammensetzen(vorgabe);
  const ZIELE = (man.ziele && man.ziele.length) ? man.ziele : ['werkstatt-pipeline.html'];

  if(nurPruefen){
    let schlecht = 0;
    for(const z of ZIELE){
      const ZIEL = path.join(WURZEL, z);
      if(!fs.existsSync(ZIEL)){
        console.error('FEHLER: ' + z + ' fehlt — "node bauen.js" ausfuehren.');
        schlecht++; continue;
      }
      const ist = fs.readFileSync(ZIEL);
      if(ist.equals(buf)) continue;
      console.error('ABWEICHUNG in ' + z + ': stimmt NICHT mit den Quellen ueberein.');
      console.error('  ausgeliefert: ' + ist.length + ' Bytes, SHA256 ' + hash(ist).slice(0, 16));
      console.error('  aus Quellen : ' + buf.length + ' Bytes, SHA256 ' + hash(buf).slice(0, 16));
      let i = 0; const n = Math.min(ist.length, buf.length);
      while(i < n && ist[i] === buf[i]) i++;
      console.error('  erste Abweichung bei Byte ' + i + ' (etwa Zeile ' +
                    ist.slice(0, i).toString('utf8').split('\n').length + ')');
      console.error('  Ursache ist fast immer: in der GEBAUTEN Datei editiert statt in den Quellen,');
      console.error('  oder nach einer Quelltextaenderung "node bauen.js" vergessen.');
      schlecht++;
    }
    /* Auch der Worker und stand.txt muessen zu diesem Stand gehoeren. */
    const swZiel = path.join(WURZEL, 'docs', 'sw.js'), stZiel = path.join(WURZEL, 'docs', 'stand.txt');
    if(!fs.existsSync(swZiel) || fs.readFileSync(swZiel, 'utf8') !== swText(stand)){ console.error('ABWEICHUNG: docs/sw.js passt nicht zum Stand ' + stand + '.'); schlecht++; }
    if(!fs.existsSync(stZiel) || fs.readFileSync(stZiel, 'utf8') !== stand + '\n'){ console.error('ABWEICHUNG: docs/stand.txt passt nicht zum Stand ' + stand + '.'); schlecht++; }
    if(schlecht) process.exit(1);
    console.log('OK: ' + ZIELE.length + ' ausgelieferte Datei(en) entsprechen den Quellen (' +
                buf.length + ' Bytes, ' + man.dateien.length + ' Module, Stand ' + stand + ').');
    process.exit(0);
  }

  for(const z of ZIELE){
    const ZIEL = path.join(WURZEL, z);
    fs.mkdirSync(path.dirname(ZIEL), {recursive:true});
    fs.writeFileSync(ZIEL, buf);
  }
  fs.mkdirSync(path.join(WURZEL, 'docs'), {recursive:true});
  fs.writeFileSync(path.join(WURZEL, 'docs', 'sw.js'), swText(stand), 'utf8');
  fs.writeFileSync(path.join(WURZEL, 'docs', 'stand.txt'), stand + '\n', 'utf8');
  console.log('gebaut: ' + ZIELE.join(', ') + ' + docs/sw.js + docs/stand.txt — ' + buf.length + ' Bytes aus ' +
              man.dateien.length + ' Modulen, SHA256 ' + hash(buf).slice(0, 16) + ', Stand ' + stand);
  process.exit(0);
}catch(e){
  console.error('FEHLER: ' + e.message);
  process.exit(1);
}

module.exports = { zusammensetzen, swText, standLesen };
