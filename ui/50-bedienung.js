/* =====================================================================
   ui/50-bedienung.js — Dateiannahme, Tabellen, Masken, Speicher
   ---------------------------------------------------------------------
   Alles, was die Oberflaeche zusammenhaelt. Die Rechnerei steht in den
   Modulen darunter und ist DOM-frei; hier wird nur angezeigt und
   eingesammelt.
   ===================================================================== */

const el = (id) => document.getElementById(id);
const htm = (id, s) => { const e = el(id); if(e) e.innerHTML = s; };
const on = (id, ev, fn) => { const e = el(id); if(e) e.addEventListener(ev, fn); };
const SLOT_EIN = 'wp_einstellungen';

const S = {
  d: null,                 /* Datensatz nach dem Austauschformat */
  ueber: {},               /* ueberschriebene Kalkulationsposten */
  V: null,                 /* Einstellungen (Startwerte plus Gespeichertes) */
  angebot: {kunde:'', nummer:'', lieferzeit:'', istzeit:null},
  staffel: null
};

/* ---- Einstellungen laden und sichern ---- */
function einLaden(){
  let g = null;
  try{ g = JSON.parse(localStorage.getItem(SLOT_EIN) || 'null'); }catch(e){ g = null; }
  S.V = kalkMerge(KALK_VORGABEN, g);
}
function einSichern(){
  try{ localStorage.setItem(SLOT_EIN, JSON.stringify(S.V)); }
  catch(e){ meldung('Die Einstellungen liessen sich nicht speichern: ' + e.message, 'warn'); }
}

/* ---- Meldungen ---- */
function meldung(text, art){
  const e = el('meldungen'); if(!e) return;
  const d = document.createElement('div');
  d.className = 'meldung ' + (art || 'info');
  d.textContent = text;
  e.appendChild(d);
}
function meldungenLeeren(){ htm('meldungen', ''); }
function meldungListe(titel, liste, art){
  if(!liste || !liste.length) return;
  const e = el('meldungen'); if(!e) return;
  const d = document.createElement('div');
  d.className = 'meldung ' + (art || 'warn');
  const b = document.createElement('b'); b.textContent = titel; d.appendChild(b);
  const ul = document.createElement('ul');
  liste.forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
  d.appendChild(ul); e.appendChild(d);
}

/* ---- Blaetter ---- */
function blatt(name){
  ['Import', 'Kalk', 'Auf', 'Plan', 'Ein'].forEach(n => {
    const b = el('tab' + n), s = el('blatt' + n);
    if(b) b.classList.toggle('an', n === name);
    if(s) s.classList.toggle('an', n === name);
  });
  if(name === 'Kalk') kalkMalen();
  /* Die Planung rechnet beim Aufschlagen neu: sie haengt an Auftraegen,
     Maschinen und am heutigen Tag - ein zwischengespeichertes Bild waere
     schon morgen falsch. */
  if(name === 'Auf') wListeMalen();
  if(name === 'Plan') wPlanMalen();
  if(name === 'Ein') einMalen();
}

/* ---- Dateien annehmen ---------------------------------------------- */
function dateienAnnehmen(liste){
  const dateien = Array.prototype.slice.call(liste || []);
  if(!dateien.length) return;
  meldungenLeeren();
  const step = dateien.filter(f => /\.(stp|step)$/i.test(f.name));
  const dxf  = dateien.filter(f => /\.dxf$/i.test(f.name));
  const pdf  = dateien.filter(f => /\.pdf$/i.test(f.name));
  const erste = step[0] || dxf[0];
  if(!erste){
    if(pdf.length){ quelleMerken(pdf[0].name); meldung('PDF abgelegt. Zeichnungen werden in diesem Paket nicht ausgewertet — das kommt spaeter.', 'info'); }
    else meldung('Keine STEP- oder DXF-Datei dabei.', 'fehler');
    return;
  }
  ladenAn('Datei wird gelesen …', 0.1);
  const r = new FileReader();
  r.onerror = () => { ladenAus(); meldung('Die Datei liess sich nicht lesen.', 'fehler'); };
  r.onload = () => {
    ladenAn('Geometrie wird gerechnet …', 0.45);
    /* Dem Browser Luft geben, damit der Balken erscheint, bevor die
       Rechnung den Faden blockiert. Bei grossen Baugruppen sind das am
       iPhone mehrere Sekunden. */
    setTimeout(() => {
      try{
        const text = String(r.result || '');
        S.d = /\.dxf$/i.test(erste.name)
          ? fDxfGeometrie(text, erste.name, 10)
          : fGeometrie(text, erste.name, S.V);
        S.ueber = {};
        if(pdf.length) S.d.quelle.pdf = pdf[0].name;
        ladenAn('fertig', 1);
        teilMalen();
        ladenAus();
      }catch(e){
        ladenAus();
        meldung('Beim Lesen der Datei ist ein Fehler aufgetreten: ' + e.message, 'fehler');
      }
    }, 30);
  };
  r.readAsText(erste);
}
function quelleMerken(name){ if(S.d) S.d.quelle.pdf = name; quelleMalen(); }
function ladenAn(text, anteil){
  const l = el('laden'); if(l) l.classList.add('an');
  const b = el('ladenBalken'); if(b) b.style.width = Math.round((anteil || 0) * 100) + '%';
  const t = el('ladenText'); if(t) t.textContent = text || '';
}
function ladenAus(){ const l = el('laden'); if(l) setTimeout(() => l.classList.remove('an'), 400); }

/* ---- Teil anzeigen -------------------------------------------------- */
function teilMalen(){
  const b = el('teilBereich');
  if(!S.d){ if(b) b.style.display = 'none'; return; }
  if(b) b.style.display = '';
  const t = S.d.teil, f = S.d._befund || {};

  const setz = (id, v) => { const e = el(id); if(e) e.value = v; };
  setz('teilName', t.name); setz('teilZnr', t.zeichnungsnr); setz('teilRev', t.revision);
  setz('teilKlasse', t.klasse);
  setz('rohForm', S.d.rohteil.form);
  const R = S.V.rohteil || {};
  setz('aufD', R.aufmass_durchmesser); setz('aufL', R.aufmass_laenge);

  const km = el('klasseMarke');
  if(km){ km.className = 'marke gemessen'; km.textContent = 'automatisch erkannt'; }

  rohMasseMalen();
  geoTabMalen();
  bohrTabMalen();
  quelleMalen();
  meldungListe('Was die App zu dieser Datei anmerkt:', f.warnungen, 'warn');
  if(f.volumenBekannt === false)
    meldung('Ohne Volumen laesst sich kein Spanvolumen und damit keine Zerspanzeit rechnen. Die Zeit ist im Blatt von Hand einzutragen.', 'fehler');
  vorschauNeu();
}

function rohMasseMalen(){
  const ro = S.d.rohteil, m = ro.masse || {};
  const zeile = (id, label, wert, einheit) =>
    '<div class="feld"><label for="' + id + '">' + label + '</label>' +
    '<input type="number" step="any" id="' + id + '" value="' + (wert != null ? wert : '') + '">' +
    '<span class="einheit">' + einheit + '</span></div>';
  let h = '';
  if(ro.form === 'rund') h = zeile('rm_d', 'Durchmesser', m.d, 'mm') + zeile('rm_l', 'L&auml;nge', m.l, 'mm');
  else if(ro.form === 'rohr') h = zeile('rm_d', 'Au&szlig;endurchmesser', m.d, 'mm') + zeile('rm_di', 'Innendurchmesser', m.di, 'mm') + zeile('rm_l', 'L&auml;nge', m.l, 'mm');
  else if(ro.form === 'sechskant') h = zeile('rm_sw', 'Schl&uuml;sselweite', m.sw, 'mm') + zeile('rm_l', 'L&auml;nge', m.l, 'mm');
  else h = zeile('rm_x', 'L&auml;nge X', m.x, 'mm') + zeile('rm_y', 'Breite Y', m.y, 'mm') + zeile('rm_z', 'H&ouml;he Z', m.z, 'mm');
  h += '<div class="feld"><label>Rohteilvolumen</label><input type="text" id="rm_v" readonly value="' +
       fZahl(ro.volumen_cm3, 2) + '"><span class="einheit">cm&sup3;</span></div>';
  htm('rohMasse', h);
  ['rm_d', 'rm_di', 'rm_l', 'rm_sw', 'rm_x', 'rm_y', 'rm_z'].forEach(id => {
    const e = el(id); if(!e) return;
    e.addEventListener('input', () => { rohAusFeldern(); });
  });
}
/* Die Masse bestimmen das Volumen — nicht umgekehrt. Wer ein Mass
   aendert, bekommt sofort das neue Volumen und den neuen Preis. */
function rohAusFeldern(){
  const ro = S.d.rohteil, m = {};
  const z = (id) => { const e = el(id); return e ? fLesen(e.value) : NaN; };
  if(ro.form === 'rund'){ m.d = z('rm_d'); m.l = z('rm_l'); ro.volumen_cm3 = fRund(Math.PI / 4 * m.d * m.d * m.l / 1000, 3); }
  else if(ro.form === 'rohr'){ m.d = z('rm_d'); m.di = z('rm_di'); m.l = z('rm_l'); ro.volumen_cm3 = fRund(Math.PI / 4 * (m.d * m.d - m.di * m.di) * m.l / 1000, 3); }
  else if(ro.form === 'sechskant'){ m.sw = z('rm_sw'); m.l = z('rm_l'); ro.volumen_cm3 = fRund(Math.sqrt(3) / 2 * m.sw * m.sw * m.l / 1000, 3); }
  else { m.x = z('rm_x'); m.y = z('rm_y'); m.z = z('rm_z'); ro.volumen_cm3 = fRund(m.x * m.y * m.z / 1000, 3); }
  Object.keys(m).forEach(k => { if(!isFinite(m[k])) m[k] = 0; });
  ro.masse = m;
  if(!isFinite(ro.volumen_cm3) || ro.volumen_cm3 < 0) ro.volumen_cm3 = 0;
  const v = el('rm_v'); if(v) v.value = fZahl(ro.volumen_cm3, 2);
  geoTabMalen(); vorschauNeu();
}
/* Rohteil aus der Geometrie neu vorschlagen (Form oder Aufmass geaendert) */
function rohNeuVorschlagen(){
  if(!S.d || !S.d._befund || !S.d._befund.modell) { rohMasseMalen(); return; }
  const t = S.d.teil;
  const rot = {dmax:t.rotation.dmax, laenge:t.rotation.laenge, di:0};
  (t.bohrungen || []).forEach(b => { if(b.durch && b.tiefe >= t.rotation.laenge - 0.5 && b.d > rot.di) rot.di = b.d; });
  S.d.rohteil = fRohteil(t, rot, el('rohForm').value, S.V.rohteil, S.d._befund.sechskantSW);
  rohMasseMalen(); geoTabMalen(); vorschauNeu();
}

function geoTabMalen(){
  const t = S.d.teil, f = S.d._befund || {}, ro = S.d.rohteil;
  const span = Math.max(0, ro.volumen_cm3 - t.volumen_cm3);
  const z = (a, b, c) => '<tr><td>' + a + '</td><td class="z">' + b + '</td><td>' + (c || '') + '</td></tr>';
  let h = '';
  h += z('H&uuml;llquader X / Y / Z', fZahl(t.bbox.x, 2) + ' &middot; ' + fZahl(t.bbox.y, 2) + ' &middot; ' + fZahl(t.bbox.z, 2), 'mm');
  h += z('Fertigteilvolumen', f.volumenBekannt === false ? '&mdash;' : fZahl(t.volumen_cm3, 2), 'cm&sup3;');
  h += z('Oberfl&auml;che', fZahl(t.oberflaeche_cm2, 1), 'cm&sup2;');
  h += z('Rohteilvolumen', fZahl(ro.volumen_cm3, 2), 'cm&sup3;');
  h += z('<b>Spanvolumen</b>', '<b>' + fZahl(span, 2) + '</b>', 'cm&sup3;');
  h += z('Rotationssymmetrisch', t.rotation.ja ? 'ja, Achse ' + t.rotation.achse : 'nein',
         t.rotation.ja ? '' : (f.rotAnteil ? Math.round(f.rotAnteil * 100) + ' % der Fl&auml;che' : ''));
  if(t.rotation.ja){
    h += z('Gr&ouml;&szlig;ter Durchmesser', fZahl(t.rotation.dmax, 2), 'mm');
    h += z('L&auml;nge &uuml;ber alles', fZahl(t.rotation.laenge, 2), 'mm');
    h += z('Innenbearbeitung', t.rotation.innen ? 'ja' : 'nein', '');
  }
  h += z('Bohrungen', String((t.bohrungen || []).length), '');
  h += z('Fl&auml;chen / Kanten', t.flaechen + ' / ' + t.kanten, '');
  if(f.koerper > 1) h += z('Getrennte K&ouml;rper', String(f.koerper), 'zusammen gerechnet');
  if(f.genaehertAnteil > 0)
    h += z('Davon gen&auml;hert', Math.round(f.genaehertAnteil * 1000) / 10 + ' %',
           '<span class="marke schaetz">Freiform</span>');
  if(f.ms) h += z('Rechenzeit', String(f.ms), 'ms');
  htm('geoTab', h);
}

function bohrTabMalen(){
  const b = S.d.teil.bohrungen || [];
  const k = el('bohrKarte');
  if(!b.length){ if(k) k.style.display = 'none'; return; }
  if(k) k.style.display = '';
  let h = '<tr><th>Durchmesser</th><th class="z">Tiefe</th><th>Art</th></tr>';
  b.forEach(x => h += '<tr><td class="z">&oslash; ' + fZahl(x.d, 2) + ' mm</td><td class="z">' +
    fZahl(x.tiefe, 2) + ' mm</td><td>' + (x.durch ? 'durchgehend' : 'Sackloch') + '</td></tr>');
  htm('bohrTab', h);
}

function quelleMalen(){
  const k = el('quelleKarte'); if(!k || !S.d) return;
  const q = S.d.quelle;
  if(!q.step && !q.pdf){ k.style.display = 'none'; return; }
  k.style.display = '';
  let h = '';
  if(q.step) h += '<div class="feld"><label>Modell</label><span>' + q.step + '</span></div>';
  if(q.pdf)  h += '<div class="feld"><label>Zeichnung</label><span>' + q.pdf + ' <span class="marke schaetz">nicht ausgewertet</span></span></div>';
  htm('quelleListe', h);
}

/* ---- Verdrahtung ---------------------------------------------------- */
function bedienungVerdrahten(){
  on('tabImport', 'click', () => blatt('Import'));
  on('tabKalk', 'click', () => blatt('Kalk'));
  on('tabEin', 'click', () => blatt('Ein'));

  const ab = el('ablage'), dt = el('datei');
  if(ab && dt){
    ab.addEventListener('click', () => dt.click());
    dt.addEventListener('change', () => dateienAnnehmen(dt.files));
    ['dragenter', 'dragover'].forEach(e => ab.addEventListener(e, (ev) => { ev.preventDefault(); ab.classList.add('drueber'); }));
    ['dragleave', 'drop'].forEach(e => ab.addEventListener(e, (ev) => { ev.preventDefault(); ab.classList.remove('drueber'); }));
    ab.addEventListener('drop', (ev) => dateienAnnehmen(ev.dataTransfer && ev.dataTransfer.files));
  }
  /* Die ganze Seite nimmt Dateien an, nicht nur das Feld. */
  ['dragover', 'drop'].forEach(e => document.addEventListener(e, (ev) => {
    if(e === 'dragover'){ ev.preventDefault(); return; }
    ev.preventDefault();
    if(ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) dateienAnnehmen(ev.dataTransfer.files);
  }));

  ['teilName', 'teilZnr', 'teilRev'].forEach(id => on(id, 'input', () => {
    if(!S.d) return;
    S.d.teil.name = el('teilName').value;
    S.d.teil.zeichnungsnr = el('teilZnr').value;
    S.d.teil.revision = el('teilRev').value;
  }));
  on('teilKlasse', 'change', () => {
    if(!S.d) return;
    S.d.teil.klasse = el('teilKlasse').value;
    const km = el('klasseMarke'); if(km){ km.className = 'marke pflege'; km.textContent = 'von Hand gesetzt'; }
    kalkMalen();
  });
  on('rohForm', 'change', () => { if(S.d){ S.d.rohteil.form = el('rohForm').value; rohNeuVorschlagen(); } });
  ['aufD', 'aufL'].forEach(id => on(id, 'input', () => {
    S.V.rohteil = S.V.rohteil || {};
    S.V.rohteil.aufmass_durchmesser = fLesen(el('aufD').value);
    S.V.rohteil.aufmass_laenge = fLesen(el('aufL').value);
    S.V.rohteil.aufmass_flach = S.V.rohteil.aufmass_durchmesser;
    einSichern();
    if(S.d) rohNeuVorschlagen();
  }));
  ['kWerkstoff', 'kToleranz', 'kOberflaeche', 'kSeiten', 'kStueck', 'kVersandArt'].forEach(id =>
    on(id, 'input', () => kalkMalen()));
  ['kWerkstoff', 'kToleranz', 'kOberflaeche', 'kVersandArt'].forEach(id =>
    on(id, 'change', () => kalkMalen()));
  on('kStaffel', 'input', () => {
    const v = String(el('kStaffel').value || '').split(/[^0-9]+/).map(x => parseInt(x, 10)).filter(x => x > 0);
    S.staffel = v.length ? v : null;
    staffelMalen();
  });
  on('kalkZuruck', 'click', () => { S.ueber = {}; kalkMalen(); });
  ['aKunde', 'aNummer', 'aLieferzeit'].forEach(id => on(id, 'input', () => {
    S.angebot.kunde = el('aKunde').value; S.angebot.nummer = el('aNummer').value;
    S.angebot.lieferzeit = el('aLieferzeit').value;
  }));
  on('aIstzeit', 'input', () => { S.angebot.istzeit = fLesen(el('aIstzeit').value); istMalen(); });
}
