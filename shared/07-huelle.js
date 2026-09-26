// =====================================================================
// DIE GEMEINSAME HUELLE [26.09.2026, Punkt 7 der Liste vom 25.09.; am
// selben Abend nach der Durchsicht auf "drei Dateien, eine Oberflaeche"
// erweitert - Entwurf ENTWURF-HUELLE.md, Pakete A und B]:
// "ein Start, eine Werkzeugverwaltung, ein Projektordner, ein Dunkelmodus,
// und darin Drehen oder Fraesen - der sichtbare Sprung. Was fehlt, ist
// nicht Glanz, sondern Einheit."
//
// Drei Apps, drei Dateien - das bleibt (Regel 1: eine Datei, Doppelklick,
// offline). Die Huelle ist deshalb kein viertes Programm, sondern das,
// was alle drei GLEICH haben und was den Weg zwischen ihnen kennt:
//   - die WERKSTATT-KOPFZEILE (ab 900 px): links aussen das Emblem und
//     der Segment-Schalter Drehen | Fraesen | Pipeline, die eigene App
//     hervorgehoben; daneben der RUECKSPRUNG-Chip "Drehen: Mastertestteil",
//     wenn man von dort kommt. In allen drei Apps an derselben Stelle.
//   - am Handy (unter 900 px) bleibt alles, wie es war: das Logo ist der
//     Werkstatt-Schalter (ein Tipp oeffnet das Menue), die Leiste steht
//     ueber dem Startbild. Regel 3: dort aendert sich kein Pixel.
//   - der WECHSEL ist kein harter Schnitt mehr: eine Blende mit Emblem und
//     Zielname legt sich ueber die Seite, der Stand (von wo, welches
//     Programm, wann) geht ueber den gemeinsamen Speicherschluessel
//     dz_werkstatt mit, die Zielseite zeigt ihn als Ruecksprung-Chip.
//   - EIN Projektordner (06-projektordner.js, Schluessel 'projekt') und
//     EIN Dunkelmodus (etDunkel) in allen drei Apps.
//
// WOHIN der Sprung fuehrt, haengt an der FORM, in der die App laeuft:
// im Projektordner heissen die Dateien euroturn-kontur-cam.html und
// dz-cam-fraesen.html, auf GitHub Pages (PWA) index.html und fraesen.html
// (pwa-bauen.js benennt um). Die Pipeline ist ein eigenes Repo: auf Pages
// ihre Adresse, im Projektordner der Nachbarordner auf dem Desktop - und
// von ihr aus fuehrt der Weg zurueck in den Nachbarordner der CAM-Apps
// (werkstatt-pipeline.html liegt eine Ebene tiefer als docs/index.html).
// Ausgerechnet wird das aus dem eigenen Dateinamen, nicht aus einer
// Einstellung - eine Einstellung wuerde beim naechsten Umbenennen luegen.
//
// DASSELBE MODUL liegt als Kopie im Repo der Pipeline (shared/07-huelle.js);
// der Pruefstand der Pipeline haelt die Kopie byteidentisch, sobald der
// Nachbarordner da ist. Zwei Fassungen einer Regel driften.
// =====================================================================
const HUELLE_APPS = [
  {id:'dreh',     name:'Drehen',             kurz:'Drehen',   sub:'Monforts 1000 / 1500, Siemens 810T / 840D', projekt:'euroturn-kontur-cam.html', pwa:'index.html',   https:'https://dz-werkstatt.github.io/dz-cam/'},
  {id:'fraes',    name:'Fräsen',        kurz:'Fräsen',  sub:'iTNC 530, TNC 410, 840D powerline',        projekt:'dz-cam-fraesen.html',      pwa:'fraesen.html', https:'https://dz-werkstatt.github.io/dz-cam/fraesen.html'},
  {id:'pipeline', name:'Werkstatt-Pipeline', kurz:'Pipeline', sub:'Anfrage, Angebot, Auftrag',                 projekt:'../werkstatt-pipeline/docs/index.html', pwa:'https://dz-werkstatt.github.io/werkstatt-pipeline/', https:'https://dz-werkstatt.github.io/werkstatt-pipeline/', eigen:true},
];
// Der gemeinsame Speicherschluessel des Wechsels und seine Fristen: der
// Ruecksprung-Chip gilt einen halben Tag (danach ist "von wo komme ich"
// keine Auskunft mehr), die Ankunftsblende nur, wenn der Wechsel gerade
// eben war (sonst zeigte jeder spaetere Neustart eine Blende).
const HUELLE_KEY = 'dz_werkstatt', HUELLE_RUECK_MS = 12 * 3600 * 1000, HUELLE_ANKUNFT_MS = 10000, HUELLE_BLENDE_MS = 260;
// Der eigene Dateiname (letztes Pfadstueck, ohne ?query und #hash); ein
// nackter Ordner ("…/dz-cam/") ist index.html - so liefert Pages die PWA.
function huelleDateiname(href){
  const h = String(href || (typeof location !== 'undefined' && location.href) || '');
  const ohne = h.split('#')[0].split('?')[0];
  const teil = ohne.split('/').pop();
  let d = ''; try{ d = decodeURIComponent(teil); }catch(e){ d = teil; }
  return d || 'index.html';
}
// Die Pipeline heisst auf Pages UND im Projektordner index.html - erkannt
// wird sie am Ordner im Pfad, nicht am Dateinamen.
function huelleHier(href){
  const voll = String(href || (typeof location !== 'undefined' && location.href) || '').toLowerCase();
  if(voll.indexOf('werkstatt-pipeline') >= 0) return 'pipeline';
  const d = huelleDateiname(href).toLowerCase();
  const a = HUELLE_APPS.find(x => !x.eigen && (x.projekt.toLowerCase() === d || String(x.pwa).toLowerCase() === d));
  return a ? a.id : 'dreh';
}
// 'pwa' = die umbenannten Dateien der Veroeffentlichung, sonst 'projekt'.
function huelleForm(href){
  const d = huelleDateiname(href).toLowerCase();
  return (d === 'index.html' || d === 'fraesen.html') ? 'pwa' : 'projekt';
}
function huelleZiel(id, href, protokoll){
  const a = HUELLE_APPS.find(x => x.id === id); if(!a) return null;
  // Das Protokoll gehoert zum href, wenn eines uebergeben ist - sonst antwortete die
  // Funktion mit einem fremden href nach der Seite, in der sie gerade laeuft (Pruefstand
  // der Pipeline, 26.09.2026: Pages-href, file-Antwort).
  const ausHref = (href && /^[a-z]+:/i.test(String(href))) ? String(href).split(':')[0].toLowerCase() + ':' : '';
  const p = String(protokoll || ausHref || (typeof location !== 'undefined' && location.protocol) || 'file:');
  const hier = huelleHier(href);
  if(a.eigen) return (p === 'file:') ? a.projekt : a.https;
  if(hier === 'pipeline'){
    // Von der Pipeline aus: docs/index.html liegt eine Ebene tiefer als
    // werkstatt-pipeline.html - der Rueckweg in den Nachbarordner ist
    // entsprechend laenger. Der Ordnername traegt ein Leerzeichen.
    if(p === 'file:'){
      const h = String(href || (typeof location !== 'undefined' && location.href) || '').split('#')[0].split('?')[0];
      const tief = /\/docs\/[^\/]*$/i.test(h);
      return (tief ? '../../' : '../') + 'Dokumente%20euroturn/' + a.projekt;
    }
    return a.https;
  }
  return huelleForm(href) === 'pwa' ? a.pwa : a.projekt;
}
// --- Der Stand des Wechsels: von wo, welches Programm, wann, wohin. ---
function huelleStandLesen(){
  try{ const r = localStorage.getItem(HUELLE_KEY); if(!r) return null; const o = JSON.parse(r); return (o && typeof o === 'object') ? o : null; }
  catch(e){ return null; }
}
function huelleStandSchreiben(o){
  try{ localStorage.setItem(HUELLE_KEY, JSON.stringify(o)); return true; }catch(e){ return false; }
}
// Der Ruecksprung: nur wenn man wirklich von einer ANDEREN App hierher
// gekommen ist, und nur einen halben Tag lang. DOM-frei - der Stand kommt
// als Parameter, damit der Pruefstand ihn ohne Browserspeicher misst.
function huelleRueck(hier, stand, jetzt){
  const s = (stand === undefined) ? huelleStandLesen() : stand;
  const t = jetzt || Date.now();
  if(!s || !s.von || s.von === hier || s.ziel !== hier) return null;
  if(!((t - (+s.zeit || 0)) < HUELLE_RUECK_MS)) return null;
  const a = HUELLE_APPS.find(x => x.id === s.von); if(!a) return null;
  return {von:s.von, text:a.kurz + (s.programm ? ': ' + s.programm : '')};
}
// Die Ankunft: der Wechsel war gerade eben (Blende kurz zeigen).
function huelleAnkunft(hier, stand, jetzt){
  const s = (stand === undefined) ? huelleStandLesen() : stand;
  const t = jetzt || Date.now();
  if(!s || s.ziel !== hier || !((t - (+s.zeit || 0)) < HUELLE_ANKUNFT_MS)) return null;
  return s;
}
// EIN Emblem, EINE Zeichnung: die Kopfzeile und die Blende KLONEN das Emblem aus
// dem Logo der Seite (CAM: .logo svg, Pipeline: header .emblem svg) - wie das
// Startbild seit dem 31.08. Kein zweiter Quelltext derselben Zeichnung.
function huelleEmblemKlon(){
  try{ const e = document.querySelector('.hdr .logo svg') || document.querySelector('header .emblem svg'); return (e && e.cloneNode) ? e.cloneNode(true) : null; }
  catch(x){ return null; }
}
function huelleEmblemEinsetzen(ziel, klasse){
  if(!ziel) return false; const k = huelleEmblemKlon(); if(!k) return false;
  try{ k.setAttribute('class', klasse || ''); ziel.appendChild(k); return true; }catch(x){ return false; }
}
const HUELLE_EMBLEM = '<span class="we"></span>';
function huelleEsc(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
// Die Werkstatt-Kopfzeile: Emblem, Segment-Schalter, Ruecksprung-Chip.
// Die eigene App ist ein span (kein Link), die anderen sind Links mit
// echtem href UND data-wziel - der Klick laeuft ueber huelleWechsel (Blende,
// Stand), faellt aber auf das href zurueck, wenn kein Skript laeuft.
function huelleKopfHtml(hier, zurueck, href){
  const h = hier || huelleHier(href);
  return '<div class="wseg">' + HUELLE_EMBLEM + '<div class="wsg">' +
    HUELLE_APPS.map(a => a.id === h
      ? '<span class="hier" title="' + huelleEsc(a.name + ' — ' + a.sub) + '">' + huelleEsc(a.kurz) + '</span>'
      : '<a class="wsa" href="' + huelleEsc(huelleZiel(a.id, href)) + '" data-wziel="' + a.id + '" title="' + huelleEsc(a.name + ' — ' + a.sub) + '">' + huelleEsc(a.kurz) + '</a>').join('') +
    '</div>' +
    (zurueck && zurueck.von ? '<a class="wzur" href="' + huelleEsc(huelleZiel(zurueck.von, href)) + '" data-wziel="' + huelleEsc(zurueck.von) + '" title="zurück, wo Du herkommst">&#x25C2; <b>' + huelleEsc(zurueck.text) + '</b></a>' : '') +
    '</div>';
}
// Die Werkstatt-Leiste ueber dem Startbild (Handy; am Laptop ausgeblendet,
// dort steht der Schalter im Kopf).
function huelleLeisteHtml(hier, href){
  const h = hier || huelleHier(href);
  const esc = huelleEsc;
  return '<div class="wleiste"><span class="wl-tit">DZ CAM · Werkstatt</span>' +
    HUELLE_APPS.map(a => a.id === h
      ? '<span class="wl-app hier" title="' + esc(a.sub) + '">' + esc(a.name) + '</span>'
      : '<a class="wl-app" href="' + esc(huelleZiel(a.id, href)) + '" data-wziel="' + a.id + '" title="' + esc(a.sub) + '">' + esc(a.name) + '</a>').join('') +
    '</div>';
}
function huelleMenueHtml(hier, href){
  const h = hier || huelleHier(href);
  const esc = huelleEsc;
  return HUELLE_APPS.map(a => a.id === h
    ? '<span class="wm-app hier">' + esc(a.name) + '<span class="wm-sub">hier</span></span>'
    : '<a class="wm-app" href="' + esc(huelleZiel(a.id, href)) + '" data-wziel="' + a.id + '">' + esc(a.name) + '<span class="wm-sub">' + esc(a.sub) + '</span></a>').join('');
}
// Die Blende: Emblem, Zielname, eine Zeile darunter, ein laufender Strich.
// Sie haengt am body (Wurzelkontext, ueber allem) und ist reines Bild.
function huelleBlende(ziel, sub){
  let b = document.getElementById('wblende');
  if(!b){ b = document.createElement('div'); b.id = 'wblende'; document.body.appendChild(b); }
  b.className = '';
  b.innerHTML = '<div class="wb-ziel">' + huelleEsc(ziel) + '</div>' +
    (sub ? '<div class="wb-sub">' + huelleEsc(sub) + '</div>' : '') +
    '<div class="wb-strich"><i></i></div>';
  try{ const k = huelleEmblemKlon(); if(k){ k.setAttribute('class', 'wb-em'); b.insertBefore(k, b.firstChild); } }catch(e){}
  return b;
}
function huelleBlendeWeg(b, nachMs){
  setTimeout(() => { try{ b.classList.add('weg'); }catch(e){}
    setTimeout(() => { try{ b.parentNode.removeChild(b); }catch(e){} }, 450); }, nachMs || 0);
}
// Der Wechsel: Stand merken, Blende zeigen, dann die Zielseite laden. Der
// Programmname kommt aus der App (opt.programm liefert ihn), damit der
// Ruecksprung-Chip der Zielseite "Drehen: Mastertestteil" sagen kann.
function huelleWechsel(zielId, hier, opt){
  const a = HUELLE_APPS.find(x => x.id === zielId); if(!a) return false;
  const h = hier || huelleHier();
  if(a.id === h) return false;
  const href = huelleZiel(zielId); if(!href) return false;
  let programm = '';
  try{ if(opt && typeof opt.programm === 'function') programm = String(opt.programm() || ''); }catch(e){ programm = ''; }
  huelleStandSchreiben({von:h, programm:programm, zeit:Date.now(), ziel:zielId});
  const sub = (programm ? programm + ' bleibt gemerkt · ' : '') + 'Dunkelmodus und Projektordner gehen mit';
  try{ huelleBlende(a.name, sub); }catch(e){}
  setTimeout(() => { location.href = href; }, HUELLE_BLENDE_MS);
  return true;
}
// --- DER STAND JE APP [Paket D]: jede App merkt sich unter dz_werkstatt_stand,
//     was bei ihr offen ist (Drehen/Fraesen: Programmname und Schritte, Pipeline:
//     Auftraege und ueberfaellige). Die WERKSTATT-KARTE auf jedem Startbild zeigt
//     den Stand der ANDEREN beiden - man sieht die Werkstatt, nicht nur die App.
//     DOM-frei: Stand als Parameter, damit der Pruefstand ohne Speicher misst.
const HUELLE_STAND_KEY = 'dz_werkstatt_stand';
function huelleWerkstattLesen(){
  try{ const r = localStorage.getItem(HUELLE_STAND_KEY); if(!r) return {}; const o = JSON.parse(r); return (o && typeof o === 'object') ? o : {}; }
  catch(e){ return {}; }
}
function huelleStandMerken(app, info){
  const o = huelleWerkstattLesen();
  o[app] = Object.assign({}, info || {}, {zeit:Date.now()});
  try{ localStorage.setItem(HUELLE_STAND_KEY, JSON.stringify(o)); return true; }catch(e){ return false; }
}
// Ein Satz je App: "Mastertestteil, 12 Schritte" / "10 Auftraege, 1 ueberfaellig" / ehrlich "noch nichts".
function huelleStandText(app, s){
  if(!s) return app === 'pipeline' ? 'noch keine Aufträge' : 'noch nichts gemerkt';
  if(app === 'pipeline'){
    const a = +s.auftraege || 0, u = +s.ueberfaellig || 0;
    if(!a) return 'noch keine Aufträge';
    return a + (a === 1 ? ' Auftrag' : ' Aufträge') + (u ? ', ' + u + ' überfällig' : '');
  }
  if(!s.name) return 'noch nichts gemerkt';
  const k = +s.schritte || 0;
  return String(s.name) + (k ? ', ' + k + (k === 1 ? ' Schritt' : ' Schritte') : '');
}
function huelleKarteHtml(hier, stand, href){
  const h = hier || huelleHier(href);
  const st = (stand === undefined) ? huelleWerkstattLesen() : (stand || {});
  return '<div class="wkarte"><span class="wk-tit">Werkstatt</span>' +
    HUELLE_APPS.filter(a => a.id !== h).map(a =>
      '<a class="wk-app" href="' + huelleEsc(huelleZiel(a.id, href)) + '" data-wziel="' + a.id + '"><b>' + huelleEsc(a.kurz) + '</b><span>' + huelleEsc(huelleStandText(a.id, st[a.id])) + '</span></a>').join('') +
    '</div>';
}
// Beim Start: Kopfzeile einsetzen, Klicks auf jedes [data-wziel] (Segment,
// Ruecksprung, Menue, Leiste) ueber den Wechsel fuehren, die Ankunft
// zeigen, das Logo-Menue (Handy) verdrahten. Das Menue haengt am body
// (Wurzelkontext - dieselbe Lehre wie beim Meldebanner: in der Kopfzeile
// laege es unter jeder offenen Maske) und steht unter dem Logo.
function huelleStart(opt){
  if(typeof document === 'undefined') return false;
  opt = opt || {};
  const hier = opt.hier || huelleHier();
  const kopf = document.querySelector('.hdr') || document.querySelector('header');
  if(!kopf) return false;
  try{
    if(kopf.insertBefore && !document.querySelector('.wseg')){
      const d = document.createElement('div');
      d.innerHTML = huelleKopfHtml(hier, huelleRueck(hier));
      if(d.firstChild) kopf.insertBefore(d.firstChild, kopf.firstChild);
      huelleEmblemEinsetzen(document.querySelector('.wseg .we'), 'we-svg');
    }
  }catch(e){}
  document.addEventListener('click', (e) => {
    const a = (e.target && e.target.closest) ? e.target.closest('[data-wziel]') : null;
    if(!a) return;
    if(huelleWechsel(a.getAttribute('data-wziel'), hier, opt)) e.preventDefault();
  });
  // Ankunft ohne Startbild (Pipeline): die Blende kurz zeigen und ausblenden.
  // Die CAM-Apps haben ihr Startbild - das ist dort die Ankunft, nur kuerzer.
  try{ if(huelleAnkunft(hier) && !document.getElementById('splash')){ const a = HUELLE_APPS.find(x => x.id === hier); huelleBlendeWeg(huelleBlende(a ? a.name : 'DZ CAM', ''), 350); } }catch(e){}
  const logo = document.querySelector('.hdr .logo');
  if(logo && logo.addEventListener){
    let m = document.getElementById('wmenue');
    if(!m){ m = document.createElement('div'); m.id = 'wmenue'; m.className = 'wmenue'; document.body.appendChild(m); }
    m.innerHTML = huelleMenueHtml(hier);
    logo.style.cursor = 'pointer';
    logo.setAttribute('title', 'Werkstatt: Drehen · Fräsen · Pipeline');
    const zu = () => { m.classList.remove('auf'); };
    logo.addEventListener('click', (e) => {
      e.stopPropagation();
      if(m.classList.contains('auf')){ zu(); return; }
      m.classList.add('auf');
      // Unter dem Logo, aber im Bild: das Logo steht rechts in der Kopfzeile, ein
      // links buendiges Menue lief aus dem Fenster (Aufnahme 26.09.2026).
      try{ const r = logo.getBoundingClientRect(), w = m.offsetWidth || 220;
        m.style.top = (r.bottom + 4) + 'px';
        m.style.left = Math.max(6, Math.min(r.left, window.innerWidth - w - 6)) + 'px'; }catch(x){}
    });
    document.addEventListener('click', (e) => { if(!m.contains(e.target)) zu(); });
    document.addEventListener('keydown', (e) => { if(e.key === 'Escape') zu(); });
  }
  return true;
}
