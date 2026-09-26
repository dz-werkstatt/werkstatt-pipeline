
/* =====================================================================
   PROJEKTORDNER UND WERKSTATT-HUELLE der Pipeline (26.09.2026, Entwurf
   "drei Dateien, eine Oberflaeche", Pakete A+B der CAM-Apps).
   ---------------------------------------------------------------------
   Die Bausteine dafuer sind KOPIEN aus dem Repo der CAM-Apps
   (shared/06-projektordner.js, shared/07-huelle.js): dieselbe Kopfzeile,
   derselbe Wechsel, derselbe Ordner-Griff (IndexedDB-Schluessel 'projekt').
   Wer den Ordner in Drehen waehlt, hat ihn hier - und umgekehrt. Der
   Pruefstand haelt die Kopien byteidentisch mit dem Nachbarordner.

   Was hier dazukommt, ist die Bedienung fuer DIESE App: die Sicherung
   (Auftraege, Maschinen, freie Tage, Regeln, Einstellungen - derselbe
   Bau wie "Alles als Datei sichern") und das Angebot gehen als Datei in
   den Ordner statt in die Downloads, und die Liste zeigt, was von dieser
   App dort liegt. Eigene Endung .wp.json - die Programme der CAM-Apps
   (.dreh.json / .fraes.json) liegen im selben Ordner und gehen niemanden
   hier etwas an.

   Nur am Laptop (Edge, Chrome): bis poVerfuegbar() ja sagt, bleibt die
   Karte versteckt; Safari am iPhone sieht nichts davon.
   ===================================================================== */
const PO_ENDUNG = '.wp.json';
const PO_ENDUNG_SICHERUNG = '.werkstatt.wp.json';
const PO_ENDUNG_ANGEBOT = '.angebot.wp.json';

/* Der Name, der beim Wechsel in die Schwester-App mitgeht (Ruecksprung-Chip
   dort: "Pipeline: Flansch 4711"): das geladene Teil, sonst die Zahl der
   Auftraege, sonst nichts. */
function wHuelleName(){
  try{
    if(typeof S !== 'undefined' && S && S.d && S.d.teil){
      const t = S.d.teil; return String(t.name || t.zeichnungsnr || (S.d.quelle && S.d.quelle.step) || 'Teil');
    }
    if(typeof W !== 'undefined' && W && Array.isArray(W.auftraege) && W.auftraege.length)
      return W.auftraege.length + ' Aufträge';
  }catch(e){}
  return '';
}

/* Dateinamen und ihre Art - sync, damit der Pruefstand sie ohne Ordner misst. */
function poPipelineSicherungName(datum){ return 'werkstatt-sicherung-' + (datum || 'ohne-datum') + PO_ENDUNG_SICHERUNG; }
function poPipelineAngebotName(d){
  const t = (d && d.teil) ? (d.teil.zeichnungsnr || d.teil.name || '') : '';
  return poDateiname(t || 'angebot', PO_ENDUNG_ANGEBOT);
}
function poPipelineArt(datei){
  const d = String(datei || '').toLowerCase();
  if(d.endsWith(PO_ENDUNG_SICHERUNG)) return 'sicherung';
  if(d.endsWith(PO_ENDUNG_ANGEBOT)) return 'angebot';
  return null;
}

function poPipelineMalen(zustand){
  const k = el('einOrdnerKarte'); if(!k) return;
  k.hidden = !poVerfuegbar();
  const bereit = zustand === 'bereit', erlauben = zustand === 'erlauben';
  const zeig = (id, an) => { const e = el(id); if(e) e.hidden = !an; };
  zeig('poWaehlen', !bereit);
  zeig('poErlauben', erlauben);
  zeig('poSichern', bereit);
  zeig('poAngebot', bereit);
  zeig('poLoesen', bereit || erlauben);
  const s = el('poStatus');
  if(s){
    if(bereit) s.innerHTML = 'Ordner <b>' + wEsc(PO.name) + '</b> ist bereit &mdash; derselbe wie in Drehen und Fr&auml;sen.';
    else if(erlauben) s.innerHTML = 'Ordner <b>' + wEsc(PO.name) + '</b> ist gemerkt. Der Browser will einmal die Erlaubnis &mdash; <i>Zugriff erlauben</i>.';
    else s.innerHTML = 'Noch kein Projektordner. <i>Ordner w&auml;hlen</i> zeigt den Ordnerdialog des Browsers.';
  }
  if(!bereit) htm('poListe', '');
}

async function poPipelineListe(){
  const l = el('poListe'); if(!l || !PO.bereit || !PO.griff) return;
  let liste = [];
  try{ liste = await poListe(PO.griff, PO_ENDUNG); }
  catch(e){ l.innerHTML = '<div class="klein">Ordner nicht lesbar: ' + wEsc(poFehlerText(e)) + '</div>'; return; }
  if(!liste.length){ l.innerHTML = '<div class="klein">Von dieser App liegt noch nichts im Ordner.</div>'; return; }
  l.innerHTML = liste.map(f => {
    const art = poPipelineArt(f.datei);
    return '<div class="po-zeile"><span class="po-art">' + (art === 'sicherung' ? 'Sicherung' : art === 'angebot' ? 'Angebot' : 'Datei') + '</span>' +
      '<span class="po-name">' + wEsc(f.name) + '</span><span class="klein">' + poDatumText(f.datum) + ' &middot; ' + poGroesseText(f.groesse) + '</span>' +
      '<button class="knopf mini" type="button" data-pol="' + wEsc(f.datei) + '">Laden</button>' +
      '<button class="knopf mini" type="button" data-pox="' + wEsc(f.datei) + '">L&ouml;schen</button></div>';
  }).join('');
}

async function poPipelineSichern(){
  if(!PO.bereit || !PO.griff) return false;
  const d = sicherungBauen({auftraege: W.auftraege, maschinen: W.maschinen, frei: W.frei, regeln: W.regeln, einstellungen: S.V, heute: wHeute()});
  const n = poPipelineSicherungName(wHeute());
  try{ await poSchreiben(PO.griff, n, JSON.stringify(d, null, 1)); }
  catch(e){ meldung('Sichern in den Ordner nicht m&ouml;glich: ' + wEsc(poFehlerText(e)), 'fehler'); return false; }
  wStandSchreiben({gesichert: wHeute(), zahl: 0}); wStandMalen();
  const z = d.enthaelt;
  meldung('Im Projektordner gesichert als <b>' + wEsc(n) + '</b>: ' + z.auftraege + ' Auftr&auml;ge, ' + z.maschinen + ' Maschinen, ' + z.freieTage + ' freie Tage.', 'info');
  poPipelineListe();
  return true;
}

async function poPipelineAngebot(){
  if(!PO.bereit || !PO.griff) return false;
  if(!S.d){ meldung('Erst ein Teil laden.', 'fehler'); return false; }
  const d = angebotDatensatz();
  const n = poPipelineAngebotName(d);
  try{ await poSchreiben(PO.griff, n, JSON.stringify(d, null, 1)); }
  catch(e){ meldung('Angebot in den Ordner nicht m&ouml;glich: ' + wEsc(poFehlerText(e)), 'fehler'); return false; }
  meldung('Angebot im Projektordner als <b>' + wEsc(n) + '</b> abgelegt.', 'info');
  poPipelineListe();
  return true;
}

async function poPipelineLaden(datei){
  if(!PO.bereit || !PO.griff) return false;
  let text = '';
  try{ text = await poLesen(PO.griff, datei); }
  catch(e){ meldung('Datei nicht lesbar: ' + wEsc(poFehlerText(e)), 'fehler'); return false; }
  const art = poPipelineArt(datei);
  if(art === 'sicherung'){
    let d = null;
    try{ d = JSON.parse(text); }catch(e){ meldung('Das ist keine lesbare Sicherung.', 'warn'); return false; }
    const f2 = sicherungPruefen(d);
    if(f2.length){ meldungListe('Diese Sicherung l&auml;sst sich nicht zur&uuml;ckholen:', f2, 'warn'); return false; }
    W.sicherung = d; wSicherVorschau();
    blatt('Ein');
    const k = el('einSicherKarte'); if(k && k.scrollIntoView){ try{ k.scrollIntoView({block:'start'}); }catch(e){} }
    meldung('Sicherung aus dem Ordner gelesen &mdash; unten entscheiden: alles ersetzen oder nur Auftr&auml;ge dazu.', 'info');
    return true;
  }
  if(art === 'angebot'){
    const ok = angebotAusText(text);
    if(ok) blatt('Kalk');
    return ok;
  }
  meldung('Diese Datei geh&ouml;rt nicht zu dieser App.', 'warn');
  return false;
}

async function poPipelineStart(){
  if(!poVerfuegbar()) return 'nicht verfuegbar';
  let z = 'keiner';
  try{ z = await poStart('pipeline'); }catch(e){ z = 'keiner'; }
  poPipelineMalen(z);
  if(z === 'bereit') poPipelineListe();
  return z;
}

function poPipelineVerdrahten(){
  on('poWaehlen', 'click', async () => {
    try{ await poWaehlen('pipeline'); }
    catch(e){ const t = poFehlerText(e); if(t) meldung('Ordner w&auml;hlen: ' + wEsc(t), 'warn'); return; }
    poPipelineMalen('bereit'); poPipelineListe();
    meldung('Projektordner <b>' + wEsc(PO.name) + '</b> gew&auml;hlt &mdash; er gilt jetzt auch in Drehen und Fr&auml;sen.', 'info');
  });
  on('poErlauben', 'click', async () => {
    const ok = await poErlauben();
    poPipelineMalen(ok ? 'bereit' : 'erlauben');
    if(ok) poPipelineListe(); else meldung('Der Browser hat den Zugriff nicht erlaubt.', 'warn');
  });
  on('poLoesen', 'click', async () => { await poLoesen(); poPipelineMalen('keiner'); meldung('Projektordner gel&ouml;st (in allen drei Apps).', 'info'); });
  on('poSichern', 'click', () => { poPipelineSichern(); });
  on('poAngebot', 'click', () => { poPipelineAngebot(); });
  on('poListe', 'click', async (e) => {
    const b = e.target && e.target.closest ? e.target.closest('button[data-pol],button[data-pox]') : null;
    if(!b) return;
    if(b.dataset.pol){ poPipelineLaden(b.dataset.pol); return; }
    const f = b.dataset.pox;
    if(b.dataset.armed !== '1'){ b.dataset.armed = '1'; b.textContent = 'Wirklich?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Löschen'; }, 2500); return; }
    try{ await poLoeschen(PO.griff, f); }catch(x){ meldung('L&ouml;schen nicht m&ouml;glich: ' + wEsc(poFehlerText(x)), 'fehler'); }
    poPipelineListe();
  });
}
