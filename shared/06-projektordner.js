// =====================================================================
// PROJEKTORDNER: Programme als Dateien auf dem Rechner [26.09.2026,
// Punkt 5 der Liste vom 25.09.]. Gemeinsames Modul beider Apps.
//
// WARUM: die Programme lebten nur im Browserspeicher (Fraesen) oder gar
// nur in der Sitzung (Drehen: `programs` ist ein Array im Speicher, mit
// dem Schliessen weg). Wer sie behalten wollte, lud eine .json herunter
// und holte sie ueber "Importieren" zurueck - jedes Mal von Hand, jedes
// Mal in den Downloads. Ein Projektordner ist der Ort, an dem die Dateien
// eines Teils zusammenliegen: Zeichnung, STEP, Programm, NC. Genau dort
// sollen sie hin, und von dort sollen sie wieder aufgehen.
//
// WIE: der Browser gibt am Laptop (Edge/Chrome) mit showDirectoryPicker
// einen GRIFF auf einen Ordner; der Griff laesst sich in IndexedDB
// merken und in der naechsten Sitzung wieder holen - dann fragt der
// Browser einmal nach der Erlaubnis (requestPermission braucht einen
// Klick). Safari am iPhone kennt das nicht: dort bleibt alles, wie es
// war, und der ganze Block ist unsichtbar (Regel 3: unter 900 px kein
// Pixel anders - der Block ist display:none, bis poVerfuegbar() ja sagt).
//
// JEDE Ein-/Ausgabe laeuft ueber den GRIFF als Parameter. Der Pruefstand
// reicht einen Fake-Ordner (poFakeOrdner) hinein und misst die Logik
// ohne Browser; die Browser-Szene nimmt denselben Fake und obendrein den
// echten Weg ueber IndexedDB.
//
// EIN Griff fuer beide Apps [Huelle, 26.09.2026]: gemerkt unter dem
// Schluessel 'projekt' - beide Apps liegen auf derselben Herkunft (GitHub
// Pages bzw. file://), wer den Ordner in der einen waehlt, hat ihn in der
// anderen. Jede sieht nur ihre Dateien (.dreh.json / .fraes.json). Die
// alten Schluessel 'dreh'/'fraes' vom Vormittag werden beim Start
// uebernommen und nicht mehr geschrieben.
// =====================================================================
var PO = {app:'', griff:null, name:'', bereit:false};
const PO_DB = 'dz-projektordner', PO_STORE = 'griffe', PO_SCHLUESSEL = 'projekt';

function poVerfuegbar(){
  try{
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function' &&
           typeof indexedDB !== 'undefined' && !!indexedDB;
  }catch(e){ return false; }
}
// Ein Programmname wird ein Dateiname, den Windows und macOS nehmen:
// die verbotenen Zeichen werden Unterstriche, Punkt und Leerzeichen am
// Ende fallen weg (Windows legt "Name." als "Name" an), hoechstens 60
// Zeichen, nie leer. Traegt der Name die Endung schon, kommt sie nicht
// doppelt.
function poDateiname(name, endung){
  let s = String(name == null ? '' : name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if(!s) s = 'Programm';
  if(s.length > 60) s = s.slice(0, 60).replace(/[. ]+$/, '');
  endung = endung || '';
  if(endung && s.toLowerCase().endsWith(endung.toLowerCase())) return s;
  return s + endung;
}
function poNameAusDatei(datei, endung){
  const d = String(datei || '');
  if(endung && d.toLowerCase().endsWith(String(endung).toLowerCase())) return d.slice(0, d.length - endung.length);
  return d;
}
// Neueste zuerst; bei gleichem Datum nach Namen.
function poSortieren(l){
  return l.slice().sort((a, b) => ((b.datum || 0) - (a.datum || 0)) || String(a.name).localeCompare(String(b.name), 'de'));
}
function poDatumText(ms){
  const d = new Date(ms || 0), z = n => (n < 10 ? '0' : '') + n;
  return z(d.getDate()) + '.' + z(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
}
function poGroesseText(b){
  b = +b || 0;
  return b < 1024 ? b + ' B' : (b < 1048576 ? Math.round(b / 1024) + ' kB' : (b / 1048576).toFixed(1) + ' MB');
}
// Fehlertexte in Worten, die auf dem Bildschirm etwas sagen. Ein
// Abbruch durch den Bediener (Dialog weggeklickt) ist kein Fehler und
// liefert einen leeren Text.
function poFehlerText(e){
  if(!e) return 'unbekannter Fehler';
  if(e.name === 'AbortError') return '';
  if(e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'Zugriff auf den Ordner nicht erlaubt';
  if(e.name === 'NotFoundError') return 'Datei oder Ordner nicht mehr da';
  if(e.name === 'InvalidStateError') return 'der Ordner ist nicht mehr erreichbar (verschoben, umbenannt, Laufwerk weg)';
  return e.message || String(e);
}

// --- Der Griff in IndexedDB (ueberlebt das Schliessen des Browsers) ---
function poDb(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(PO_DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(PO_STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('IndexedDB'));
  });
}
function poDbTx(art, tu){
  return poDb().then(db => new Promise((res, rej) => {
    const tx = db.transaction(PO_STORE, art), st = tx.objectStore(PO_STORE);
    const q = tu(st);
    tx.oncomplete = () => { db.close(); res(q && q.result); };
    tx.onerror = () => { db.close(); rej(tx.error || new Error('IndexedDB')); };
  }));
}
function poGriffMerken(app, griff){ return poDbTx('readwrite', st => st.put(griff, app)); }
function poGriffHolen(app){ return poDbTx('readonly', st => st.get(app)); }
function poGriffLoeschen(app){ return poDbTx('readwrite', st => st.delete(app)); }

// --- Der Zustand: keiner / erlauben / bereit ---
// poStart holt den gemerkten Griff. Ob er noch gilt, sagt queryPermission:
// 'granted' = sofort bereit, 'prompt' = der Bediener muss einmal klicken
// (poErlauben), sonst ist der Ordner nur gemerkt, nicht nutzbar.
async function poStart(app){
  PO.app = app; PO.griff = null; PO.name = ''; PO.bereit = false;
  if(!poVerfuegbar()) return 'nicht verfuegbar';
  let g = null;
  try{ g = await poGriffHolen(PO_SCHLUESSEL); }catch(e){ return 'keiner'; }
  if(!g){
    // Umzug vom Vormittag: der Griff lag je App getrennt.
    try{ g = await poGriffHolen(app); if(g){ await poGriffMerken(PO_SCHLUESSEL, g); await poGriffLoeschen(app); } }catch(e){ g = g || null; }
  }
  if(!g || typeof g.queryPermission !== 'function') return 'keiner';
  PO.griff = g; PO.name = g.name || 'Ordner';
  let p = 'prompt';
  try{ p = await g.queryPermission({mode:'readwrite'}); }catch(e){ p = 'prompt'; }
  PO.bereit = (p === 'granted');
  return PO.bereit ? 'bereit' : 'erlauben';
}
async function poErlauben(){
  if(!PO.griff) return false;
  let p = 'denied';
  try{ p = await PO.griff.requestPermission({mode:'readwrite'}); }catch(e){ p = 'denied'; }
  PO.bereit = (p === 'granted');
  return PO.bereit;
}
async function poWaehlen(app){
  const g = await window.showDirectoryPicker({id:'dz-cam-' + app, mode:'readwrite'});
  PO.app = app; PO.griff = g; PO.name = g.name || 'Ordner'; PO.bereit = true;
  // Merken kann scheitern (IndexedDB gesperrt) - der Ordner gilt dann
  // trotzdem fuer diese Sitzung, nur nicht fuer die naechste.
  try{ await poGriffMerken(PO_SCHLUESSEL, g); }catch(e){}
  return g;
}
async function poLoesen(){
  const app = PO.app;
  PO.griff = null; PO.name = ''; PO.bereit = false;
  try{ await poGriffLoeschen(PO_SCHLUESSEL); await poGriffLoeschen(app); }catch(e){}
}

// --- Dateien im Ordner. createWritable schreibt in eine Hilfsdatei und
//     tauscht beim close - eine halb geschriebene Datei gibt es nicht.
async function poSchreiben(griff, datei, text){
  const fh = await griff.getFileHandle(datei, {create:true});
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
  return datei;
}
async function poLesen(griff, datei){
  const fh = await griff.getFileHandle(datei);
  const f = await fh.getFile();
  return await f.text();
}
async function poLoeschen(griff, datei){ await griff.removeEntry(datei); }
// Nur Dateien mit der Endung dieser App; Unterordner werden nicht
// durchsucht (ein Projektordner ist flach, und wer verschachtelt, waehlt
// den Unterordner).
async function poListe(griff, endung){
  const l = [], e = String(endung || '').toLowerCase();
  for await (const [n, h] of griff.entries()){
    if(!h || h.kind !== 'file') continue;
    if(e && !n.toLowerCase().endsWith(e)) continue;
    let f = null;
    try{ f = await h.getFile(); }catch(x){ continue; }
    l.push({datei:n, name:e ? n.slice(0, n.length - e.length) : n, datum:f.lastModified, groesse:f.size});
  }
  return poSortieren(l);
}

// --- Ein Ordner im Speicher mit derselben Schnittstelle, fuer Pruefstand
//     und Browser-Szene. Er tut, was der echte tut: schreiben, lesen,
//     auflisten, loeschen - und er merkt sich das Datum jeder Datei.
function poFakeOrdner(name){
  const dateien = {};
  let uhr = 1000;
  const griff = {
    kind:'directory', name:name || 'Fake',
    queryPermission(){ return Promise.resolve('granted'); },
    requestPermission(){ return Promise.resolve('granted'); },
    getFileHandle(n, opt){
      if(!dateien[n] && !(opt && opt.create)){ const e = new Error('kein ' + n); e.name = 'NotFoundError'; return Promise.reject(e); }
      if(!dateien[n]) dateien[n] = {text:'', datum:uhr++};
      const fh = {
        kind:'file', name:n,
        getFile(){ const d = dateien[n]; return Promise.resolve({name:n, lastModified:d.datum, size:d.text.length, text(){ return Promise.resolve(d.text); }}); },
        createWritable(){ let puffer = ''; return Promise.resolve({write(t){ puffer += String(t); return Promise.resolve(); }, close(){ dateien[n] = {text:puffer, datum:uhr++}; return Promise.resolve(); }}); },
      };
      return Promise.resolve(fh);
    },
    removeEntry(n){ if(!dateien[n]){ const e = new Error('kein ' + n); e.name = 'NotFoundError'; return Promise.reject(e); } delete dateien[n]; return Promise.resolve(); },
    entries(){
      const es = Object.keys(dateien).map(n => [n, {kind:'file', name:n, getFile(){ const d = dateien[n]; return Promise.resolve({name:n, lastModified:d.datum, size:d.text.length, text(){ return Promise.resolve(d.text); }}); }}]);
      let i = 0;
      return {[Symbol.asyncIterator](){ return this; }, next(){ return Promise.resolve(i < es.length ? {value:es[i++], done:false} : {value:undefined, done:true}); }};
    },
    _dateien:dateien,
  };
  return griff;
}
