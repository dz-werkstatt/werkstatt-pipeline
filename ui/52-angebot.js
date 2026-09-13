/* =====================================================================
   ui/52-angebot.js — Kalkulationsblatt, Staffel, Einstellungen, Angebot
   ---------------------------------------------------------------------
   Die Aufschluesselung ist die eigentliche Leistung dieses Blatts: jeder
   Posten steht da, jeder ist anzufassen, und was angefasst wurde, ist
   zu sehen. Ein Preis, der aus einer schwarzen Kiste faellt, hilft beim
   Verhandeln nicht.
   ===================================================================== */

function kalkEingabe(){
  const t = S.d ? S.d.teil : {};
  return {
    teil: t, rohteil: S.d ? S.d.rohteil : {}, vorgaben: S.V,
    werkstoff: el('kWerkstoff') ? el('kWerkstoff').value : '',
    toleranz: el('kToleranz') ? el('kToleranz').value : 'mittel',
    oberflaeche: el('kOberflaeche') ? el('kOberflaeche').value : 'normal',
    seiten: el('kSeiten') ? fLesen(el('kSeiten').value) : 1,
    stueck: el('kStueck') ? fLesen(el('kStueck').value) : 1,
    versandArt: el('kVersandArt') ? el('kVersandArt').value : 'versand',
    ueber: S.ueber, staffel: S.staffel
  };
}

function werkstoffWahlMalen(){
  const s = el('kWerkstoff'); if(!s) return;
  const alt = s.value;
  s.innerHTML = (S.V.werkstoffe || []).map(w =>
    '<option value="' + w.name + '">' + w.name + '</option>').join('');
  if(alt) s.value = alt;
  if(!s.value && S.V.werkstoffe && S.V.werkstoffe.length) s.value = S.V.werkstoffe[0].name;
  if(S.d) S.d.teil.werkstoff = s.value;
}

function kalkMalen(){
  if(!S.V) return;
  werkstoffWahlMalen();
  const kk = el('kStueck'); if(kk && !kk.value) kk.value = 1;
  const ks = el('kSeiten'); if(ks && !ks.value) ks.value = 1;
  const kst = el('kStaffel');
  if(kst && !kst.value) kst.value = (S.staffel || S.V.staffel || []).join(' / ');
  if(!S.d){ htm('kalkTab', '<tr><td>Noch kein Teil geladen.</td></tr>'); htm('staffel', ''); return; }
  S.d.teil.werkstoff = el('kWerkstoff').value;

  const r = kalkRechnen(kalkEingabe());
  const mk = el('kPreisMarke');
  if(mk) mk.textContent = (r.werkstoff && r.werkstoff.gepflegt === false) ? 'Preis zu pflegen' : '';

  const z = (schl, name, wert, einheit, dick) => {
    const u = r.ueberschrieben[schl];
    return '<tr' + (dick ? ' class="summe"' : '') + '><td>' + name + '</td>' +
      '<td class="z"><input type="number" step="any" class="kpost' + (u ? ' geaendert' : '') +
      '" data-k="' + schl + '" value="' + (Math.round(wert * 1000) / 1000) + '" style="width:110px"></td>' +
      '<td>' + einheit + '</td></tr>';
  };
  const nur = (name, wert, einheit, dick) =>
    '<tr' + (dick ? ' class="summe"' : '') + '><td>' + name + '</td><td class="z">' + wert + '</td><td>' + einheit + '</td></tr>';

  let h = '<tr><th>Posten</th><th class="z">Wert</th><th></th></tr>';
  h += nur('Maschine', r.maschine === 'drehen' ? 'Drehen' : 'Fr&auml;sen', fZahl(r.satz, 2) + ' &euro;/h');
  h += nur('Zerspanleistung', fZahl(r.faktoren.zerspanleistung, 0) + ' <span class="marke schaetz">Sch&auml;tzwert</span>', 'cm&sup3;/min');
  h += z('spanvolumen', 'Spanvolumen', r.zeiten.spanvolumen_cm3, 'cm&sup3;');
  h += z('hauptzeit', 'Hauptzeit Zerspanung', r.zeiten.hauptzeit, 'min');
  h += z('nebenzeit', 'Nebenzeit', r.zeiten.nebenzeit, 'min');
  h += z('pruefen', 'Pr&uuml;fen', r.zeiten.pruefen, 'min');
  h += z('entgraten', 'Entgraten', r.zeiten.entgraten, 'min');
  h += nur('Faktor Toleranz / Oberfl&auml;che', fZahl(r.faktoren.toleranz, 2) + ' &middot; ' + fZahl(r.faktoren.oberflaeche, 2), '');
  h += z('stueckzeit', '<b>St&uuml;ckzeit</b>', r.zeiten.stueckzeit, 'min', true);
  h += nur('R&uuml;stzeit je Auftrag', fZahl(r.zeiten.ruestzeit, 0), 'min');
  h += '<tr><td colspan="3" style="padding-top:10px"><b>Preis je St&uuml;ck bei ' + r.zeiten.stueck + ' St&uuml;ck</b></td></tr>';
  h += z('gewicht', 'Rohteilgewicht', r.preise.gewicht_kg, 'kg');
  h += z('material', 'Material (inkl. ' + Math.round(r.faktoren.verschnitt * 100) + ' % Verschnitt)', r.preise.material, '&euro;');
  h += z('bearbeitung', 'Bearbeitung', r.preise.bearbeitung, '&euro;');
  h += z('ruesten', 'R&uuml;sten (umgelegt)', r.preise.ruesten, '&euro;');
  h += z('verpackung', 'Verpackung', r.preise.verpackung, '&euro;');
  h += z('versand', 'Versand', r.preise.versand, '&euro;');
  h += z('zwischensumme', 'Zwischensumme', r.preise.zwischensumme, '&euro;', true);
  h += z('gewinn', 'Gewinn (' + Math.round(r.faktoren.gewinn * 100) + ' %)', r.preise.gewinn, '&euro;');
  h += z('einzelpreis', '<b>Einzelpreis</b>', r.preise.einzelpreis, '&euro;', true);
  h += nur('<b>Auftragswert</b>', '<b>' + fZahl(r.preise.gesamt, 2) + '</b>', '&euro;' +
    (r.preise.mindestauftrag_greift ? ' <span class="marke pflege">Mindestauftrag</span>' : ''), true);
  htm('kalkTab', h);

  Array.prototype.forEach.call(document.querySelectorAll('.kpost'), (e) => {
    e.addEventListener('change', () => {
      const k = e.getAttribute('data-k'), v = fLesen(e.value);
      if(isFinite(v)) S.ueber[k] = v; else delete S.ueber[k];
      kalkMalen();
    });
  });
  meldungKalk(r.hinweise);
  staffelMalen();
  istMalen();
}

function meldungKalk(liste){
  const alt = document.getElementById('kalkHinweis');
  if(alt) alt.parentNode.removeChild(alt);
  if(!liste || !liste.length) return;
  const d = document.createElement('div');
  d.id = 'kalkHinweis'; d.className = 'meldung warn kein-druck';
  const ul = document.createElement('ul');
  liste.forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
  d.appendChild(ul);
  const tab = el('kalkTab');
  if(tab && tab.parentNode && tab.parentNode.parentNode) tab.parentNode.parentNode.appendChild(d);
}

function staffelMalen(){
  if(!S.d){ htm('staffel', ''); return; }
  const st = kalkStaffel(kalkEingabe());
  htm('staffel', st.map(x =>
    '<div class="stueck"><span>' + x.stueck + ' St&uuml;ck</span><b>' + fZahl(x.einzelpreis, 2) + ' &euro;</b>' +
    '<span>' + fZahl(x.gesamt, 2) + ' &euro; gesamt' + (x.mindest ? ' *' : '') + '</span></div>').join('') +
    (st.some(x => x.mindest) ? '<div class="klein" style="grid-column:1/-1;color:var(--text-blass);font-size:12px">* Mindestauftragswert greift</div>' : ''));
}

function istMalen(){
  const e = el('istVergleich'); if(!e || !S.d) return;
  const ist = S.angebot.istzeit;
  if(!isFinite(ist) || ist <= 0){ e.innerHTML = ''; return; }
  const r = kalkRechnen(kalkEingabe());
  const soll = r.zeiten.stueckzeit;
  const ab = soll > 0 ? (ist - soll) / soll : 0;
  e.innerHTML = '<div class="meldung ' + (Math.abs(ab) > 0.25 ? 'warn' : 'info') + '">Soll ' + fMin(soll) +
    ', Ist ' + fMin(ist) + ' &mdash; Abweichung ' + (ab >= 0 ? '+' : '') + fZahl(ab * 100, 1) +
    ' %. Der Wert wird nur angezeigt; die App lernt daraus in diesem Paket noch nicht.</div>';
}

/* ---- Einstellungen -------------------------------------------------- */
/* Die Gruppen, deren Startwerte bewusst PLATZHALTER sind: im oeffentlichen
   Repo stehen runde Zahlen statt Daniels echter Saetze (Entscheid
   13.09.2026). Solange die Gruppe gepflegt:false traegt, bekommt jedes ihrer
   Felder die Marke — dieselbe Mechanik wie beim Materialpreis, damit ein
   Platzhalter nicht stillschweigend in ein Angebot laeuft. */
const EIN_PLATZHALTER = {'saetze':1, 'zuschlaege.gewinn':1, 'zuschlaege.mindestauftrag':1};
function einPlatzhalter(pfad){
  const gr = pfad.split('.')[0];
  if(!EIN_PLATZHALTER[gr] && !EIN_PLATZHALTER[pfad]) return false;
  return ((S.V[gr] || {}).gepflegt === false);
}
function einFeld(pfad, label, einheit, art){
  const teile = pfad.split('.');
  let v = S.V; teile.forEach(t => { v = (v || {})[t]; });
  const schaetz = (S.V.schaetzwerte || []).indexOf(pfad) >= 0;
  const platz = einPlatzhalter(pfad);
  return '<div class="feld"><label for="ein_' + pfad.replace(/\./g, '_') + '">' + label + '</label>' +
    '<input type="' + (art || 'number') + '" step="any" id="ein_' + pfad.replace(/\./g, '_') +
    '" data-pfad="' + pfad + '" value="' + (v == null ? '' : v) + '">' +
    '<span class="einheit">' + (einheit || '') + '</span>' +
    (schaetz ? '<span class="marke schaetz">Sch&auml;tzwert</span>' : '') +
    (platz ? '<span class="marke pflege">Platzhalter</span>' : '') + '</div>';
}

function einMalen(){
  if(!S.V) return;
  htm('einSaetze',
    einFeld('saetze.drehen', 'Drehen', '&euro;/h') +
    einFeld('saetze.fraesen', 'Fr&auml;sen', '&euro;/h') +
    einFeld('saetze.handarbeit', 'Handarbeit', '&euro;/h') +
    einFeld('saetze.ruesten', 'R&uuml;sten (wenn abweichend)', '&euro;/h') +
    '<div class="klein" style="color:var(--text-blass);font-size:13px">R&uuml;sten wird mit dem Maschinensatz gerechnet, solange kein eigener Wert eingetragen ist.</div>');

  let w = '<tr><th>Werkstoff</th><th>Gruppe</th><th class="z">Dichte</th><th class="z">Preis</th><th class="z">Faktor</th><th></th></tr>';
  (S.V.werkstoffe || []).forEach((x, i) => {
    w += '<tr><td><input type="text" data-w="' + i + '" data-f="name" value="' + x.name + '" style="width:110px"></td>' +
      '<td><select data-w="' + i + '" data-f="gruppe">' +
        ['stahl', 'edelstahl', 'alu', 'kunststoff'].map(g => '<option value="' + g + '"' + (g === x.gruppe ? ' selected' : '') + '>' + g + '</option>').join('') +
      '</select></td>' +
      '<td class="z"><input type="number" step="any" data-w="' + i + '" data-f="dichte" value="' + x.dichte + '" style="width:78px"></td>' +
      '<td class="z"><input type="number" step="any" data-w="' + i + '" data-f="preis" value="' + x.preis + '" style="width:84px"></td>' +
      '<td class="z"><input type="number" step="any" data-w="' + i + '" data-f="faktor" value="' + x.faktor + '" style="width:76px"></td>' +
      '<td>' + (x.gepflegt === false ? '<span class="marke pflege">Preis zu pflegen</span>' : '') + '</td></tr>';
  });
  htm('einWerkstoffe', w);

  let L = '<tr><th>Gruppe</th><th class="z">Drehen</th><th class="z">Fr&auml;sen</th></tr>';
  ['stahl', 'edelstahl', 'alu', 'kunststoff'].forEach(g => {
    const q = (S.V.zerspanleistung || {})[g] || {};
    L += '<tr><td>' + g + '</td>' +
      '<td class="z"><input type="number" step="any" data-pfad="zerspanleistung.' + g + '.drehen" value="' + (q.drehen || '') + '" style="width:86px"></td>' +
      '<td class="z"><input type="number" step="any" data-pfad="zerspanleistung.' + g + '.fraesen" value="' + (q.fraesen || '') + '" style="width:86px"></td></tr>';
  });
  htm('einLeistung', L + '<tr><td colspan="3" style="color:var(--text-blass);font-size:13px">Einheit cm&sup3;/min, wirksam ueber den ganzen Schnitt. Der Werkstofffaktor wirkt zus&auml;tzlich, aber nur INNERHALB der Gruppe &mdash; bezogen auf den g&uuml;nstigsten Werkstoff darin.</td></tr>');

  htm('einRest',
    '<h3>Zuschl&auml;ge</h3>' +
    einFeld('zuschlaege.verschnitt', 'Materialverschnitt', 'Anteil') +
    einFeld('zuschlaege.toleranz_mittel', 'Toleranz mittel (IT8&ndash;IT10)', 'Faktor') +
    einFeld('zuschlaege.toleranz_fein', 'Toleranz fein (&le; IT7)', 'Faktor') +
    einFeld('zuschlaege.oberflaeche_fein', 'Oberfl&auml;che Ra &le; 0,8', 'Faktor') +
    einFeld('zuschlaege.gewinn', 'Gewinnaufschlag', 'Anteil') +
    einFeld('zuschlaege.mindestauftrag', 'Mindestauftragswert', '&euro;') +
    '<h3>Zeiten</h3>' +
    einFeld('zeiten.nebenzeit_anteil', 'Nebenzeit, Anteil der Hauptzeit', '') +
    einFeld('zeiten.nebenzeit_je_bohrung', 'Nebenzeit je Bohrung', 'min') +
    einFeld('zeiten.nebenzeit_je_seite', 'Nebenzeit je weitere Seite', 'min') +
    einFeld('zeiten.entgraten_je_kante', 'Entgraten je Kante', 'min') +
    einFeld('zeiten.entgraten_min', 'Entgraten mindestens', 'min') +
    einFeld('zeiten.pruefen_je_teil', 'Pr&uuml;fen je Teil', 'min') +
    '<h3>R&uuml;stzeit je Klasse</h3>' +
    einFeld('ruesten.drehteil_einfach', 'Drehteil einfach', 'min') +
    einFeld('ruesten.drehteil_fraes', 'Drehteil mit Fr&auml;santeil', 'min') +
    einFeld('ruesten.fraesteil_3ax', 'Fr&auml;steil 3-Achs', 'min') +
    einFeld('ruesten.fraesteil_komplex', 'Fr&auml;steil komplex', 'min') +
    '<h3>Nebenkosten</h3>' +
    einFeld('nebenkosten.verpackung_auftrag', 'Verpackung je Auftrag', '&euro;') +
    einFeld('nebenkosten.verpackung_teil', 'Verpackung je Teil', '&euro;') +
    einFeld('nebenkosten.versand', 'Versand pauschal', '&euro;') +
    '<h3>Rohteilaufma&szlig;</h3>' +
    einFeld('rohteil.aufmass_durchmesser', 'Durchmesser', 'mm') +
    einFeld('rohteil.aufmass_laenge', 'L&auml;nge', 'mm') +
    einFeld('rohteil.aufmass_flach', 'Flach, je Seite', 'mm'));

  htm('einFirma',
    einFeld('firma.name', 'Firma', '', 'text') +
    einFeld('firma.strasse', 'Stra&szlig;e', '', 'text') +
    einFeld('firma.ort', 'PLZ und Ort', '', 'text') +
    einFeld('firma.telefon', 'Telefon', '', 'text') +
    einFeld('firma.mail', 'E-Mail', '', 'text') +
    einFeld('firma.ustid', 'USt-IdNr.', '', 'text') +
    einFeld('firma.lieferzeit', 'Lieferzeit (Vorgabe)', '', 'text') +
    einFeld('firma.gueltigkeit_tage', 'Angebot g&uuml;ltig', 'Tage'));

  Array.prototype.forEach.call(document.querySelectorAll('[data-pfad]'), (e) => {
    e.addEventListener('change', () => {
      const teile = e.getAttribute('data-pfad').split('.');
      let z = S.V;
      for(let i = 0; i < teile.length - 1; i++){ if(!z[teile[i]]) z[teile[i]] = {}; z = z[teile[i]]; }
      const roh = e.value;
      z[teile[teile.length - 1]] = (e.type === 'number') ? fLesen(roh) : roh;
      /* Wer einen Platzhalter stellt, hat ihn gepflegt — Marke und Hinweis im
         Blatt verschwinden dann (Muster: Materialpreis, eine Zeile tiefer). */
      const gr = teile[0];
      if(EIN_PLATZHALTER[gr] && S.V[gr] && S.V[gr].gepflegt === false){ S.V[gr].gepflegt = true; einMalen(); }
      einSichern(); kalkMalen();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-w]'), (e) => {
    e.addEventListener('change', () => {
      const i = +e.getAttribute('data-w'), f = e.getAttribute('data-f');
      const w = S.V.werkstoffe[i]; if(!w) return;
      w[f] = (e.type === 'number') ? fLesen(e.value) : e.value;
      if(f === 'preis') w.gepflegt = true;
      einSichern(); einMalen(); kalkMalen();
    });
  });
}

/* ---- Sichern und Laden ---------------------------------------------- */
function dateiSichern(name, text, typ){
  try{
    const b = new Blob([text], {type:typ || 'application/json'});
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(u); }, 500);
  }catch(e){ meldung('Sichern nicht moeglich: ' + e.message, 'fehler'); }
}

function angebotDatensatz(){
  const d = fKopie(S.d);
  delete d._befund;                                  /* das Modell ist zu gross und gehoert nicht ins Angebot */
  const r = kalkRechnen(kalkEingabe());
  const e = kalkEingabe();
  d.kalkulation = {
    parameter: {werkstoff:e.werkstoff, toleranz:e.toleranz, oberflaeche:e.oberflaeche,
      seiten:e.seiten, stueck:e.stueck, versandArt:e.versandArt,
      ueberschrieben:fKopie(S.ueber), einstellungen:fKopie(S.V)},
    zeiten: r.zeiten,
    preise: r.preise
  };
  d.angebot = {kunde:S.angebot.kunde, nummer:S.angebot.nummer,
    lieferzeit:S.angebot.lieferzeit || (S.V.firma && S.V.firma.lieferzeit) || '',
    istzeit:S.angebot.istzeit, datum:new Date().toISOString().slice(0, 10),
    staffel:kalkStaffel(e)};
  return d;
}

function angebotVerdrahten(){
  on('btnJson', 'click', () => {
    if(!S.d) return meldung('Erst ein Teil laden.', 'fehler');
    const d = angebotDatensatz();
    const n = (d.teil.zeichnungsnr || d.teil.name || 'angebot').replace(/[^A-Za-z0-9_.-]+/g, '_');
    dateiSichern(n + '.json', JSON.stringify(d, null, 1));
  });
  on('btnJsonLaden', 'click', () => el('jsonDatei') && el('jsonDatei').click());
  on('jsonDatei', 'change', () => {
    const f = el('jsonDatei').files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = () => {
      try{
        const d = JSON.parse(String(r.result));
        const p = schemaPruefen(d);
        if(p.length) meldungListe('Das Angebot passt nicht ganz zum Austauschformat:', p, 'warn');
        S.d = d;
        S.d._befund = S.d._befund || {koerper:1, volumenBekannt:d.teil.volumen_cm3 > 0, genaehertAnteil:0,
          sinnSchief:0, rotAnteil:0, hinterschnittAnteil:0, sechskantSW:null, warnungen:[], bericht:{}, ms:0, modell:null};
        const k = d.kalkulation && d.kalkulation.parameter;
        if(k){
          S.ueber = k.ueberschrieben || {};
          if(k.einstellungen) S.V = kalkMerge(KALK_VORGABEN, k.einstellungen);
          ['kToleranz', 'kOberflaeche', 'kVersandArt'].forEach((id, i) => {
            const v = [k.toleranz, k.oberflaeche, k.versandArt][i];
            if(el(id) && v) el(id).value = v;
          });
          if(el('kSeiten') && k.seiten) el('kSeiten').value = k.seiten;
          if(el('kStueck') && k.stueck) el('kStueck').value = k.stueck;
        }
        if(d.angebot){
          S.angebot.kunde = d.angebot.kunde || ''; S.angebot.nummer = d.angebot.nummer || '';
          S.angebot.lieferzeit = d.angebot.lieferzeit || '';
          if(el('aKunde')) el('aKunde').value = S.angebot.kunde;
          if(el('aNummer')) el('aNummer').value = S.angebot.nummer;
          if(el('aLieferzeit')) el('aLieferzeit').value = S.angebot.lieferzeit;
        }
        meldungenLeeren();
        teilMalen();
        werkstoffWahlMalen();
        if(el('kWerkstoff') && d.teil.werkstoff) el('kWerkstoff').value = d.teil.werkstoff;
        kalkMalen();
        meldung('Angebot geladen.', 'info');
      }catch(e){ meldung('Die Datei ist kein gueltiges Angebot: ' + e.message, 'fehler'); }
    };
    r.readAsText(f);
  });
  on('btnPdf', 'click', () => {
    if(!S.d) return meldung('Erst ein Teil laden.', 'fehler');
    angebotDrucken();
  });
  on('btnEinExport', 'click', () => dateiSichern('werkstatt-einstellungen.json', JSON.stringify(S.V, null, 1)));
  on('btnEinImport', 'click', () => el('einDatei') && el('einDatei').click());
  on('einDatei', 'change', () => {
    const f = el('einDatei').files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = () => {
      try{ S.V = kalkMerge(KALK_VORGABEN, JSON.parse(String(r.result))); einSichern(); einMalen(); kalkMalen(); }
      catch(e){ meldung('Die Einstellungen liessen sich nicht lesen: ' + e.message, 'fehler'); }
    };
    r.readAsText(f);
  });
  on('btnEinReset', 'click', () => {
    S.V = fKopie(KALK_VORGABEN); einSichern(); einMalen(); kalkMalen();
  });
  on('btnWstNeu', 'click', () => {
    S.V.werkstoffe = S.V.werkstoffe || [];
    S.V.werkstoffe.push({name:'neu', gruppe:'stahl', dichte:7.85, preis:0, faktor:1, gepflegt:false});
    einSichern(); einMalen();
  });
}

/* ---- Angebot drucken -------------------------------------------------
   Kein PDF-Baukasten: das Drucken des Browsers erzeugt das PDF. Damit
   bleibt die App eine Datei ohne Fremdbibliothek, und der Weg ist auf
   dem iPhone derselbe wie am Laptop (Teilen, Als PDF sichern). */
function angebotDrucken(){
  const d = angebotDatensatz();
  const F = S.V.firma || {};
  const r = d.kalkulation;
  const z = (a, b) => '<tr><td>' + a + '</td><td style="text-align:right">' + b + '</td></tr>';
  const heute = new Date();
  const bis = new Date(heute.getTime() + ((F.gueltigkeit_tage || 30) * 86400000));
  const dt = (x) => String(x.getDate()).padStart(2, '0') + '.' + String(x.getMonth() + 1).padStart(2, '0') + '.' + x.getFullYear();
  const ro = d.rohteil, m = ro.masse || {};
  const rohText = ro.form === 'rund' ? 'Rund &oslash; ' + fZahl(m.d, 1) + ' x ' + fZahl(m.l, 1)
    : ro.form === 'rohr' ? 'Rohr &oslash; ' + fZahl(m.d, 1) + '/' + fZahl(m.di, 1) + ' x ' + fZahl(m.l, 1)
    : ro.form === 'sechskant' ? 'Sechskant SW ' + fZahl(m.sw, 1) + ' x ' + fZahl(m.l, 1)
    : 'Flach ' + fZahl(m.x, 1) + ' x ' + fZahl(m.y, 1) + ' x ' + fZahl(m.z, 1);

  const h =
'<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Angebot ' + (d.angebot.nummer || '') + '</title>' +
'<style>body{font:12pt/1.45 -apple-system,Segoe UI,Arial,sans-serif;color:#16202a;margin:24mm 18mm}' +
'h1{font-size:18pt;margin:0 0 2mm;color:#1858a0}h2{font-size:12pt;margin:7mm 0 2mm;color:#1858a0}' +
'table{border-collapse:collapse;width:100%;font-size:11pt}td,th{padding:3px 6px;border-bottom:1px solid #dde3ea;text-align:left}' +
'.kopf{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8mm}' +
'.klein{font-size:9.5pt;color:#5a6873}.staffel td{text-align:right}.staffel td:first-child{text-align:left}' +
'</style></head><body>' +
'<div class="kopf"><div><b>' + (F.name || '') + '</b><br>' + (F.strasse || '') + '<br>' + (F.ort || '') +
  (F.telefon ? '<br>Telefon ' + F.telefon : '') + (F.mail ? '<br>' + F.mail : '') + '</div>' +
'<div style="text-align:right" class="klein">Datum ' + dt(heute) + '<br>G&uuml;ltig bis ' + dt(bis) +
  (d.angebot.nummer ? '<br>Angebot ' + d.angebot.nummer : '') + '</div></div>' +
'<h1>Angebot</h1>' +
(d.angebot.kunde ? '<p>' + d.angebot.kunde + '</p>' : '') +
'<h2>Teil</h2><table>' +
z('Benennung', d.teil.name || '&mdash;') +
z('Zeichnungsnummer', (d.teil.zeichnungsnr || '&mdash;') + (d.teil.revision ? ' / Rev. ' + d.teil.revision : '')) +
z('Werkstoff', d.teil.werkstoff || '&mdash;') +
z('Rohteil', rohText + ' mm') +
z('Ma&szlig;e &uuml;ber alles', fZahl(d.teil.bbox.x, 1) + ' x ' + fZahl(d.teil.bbox.y, 1) + ' x ' + fZahl(d.teil.bbox.z, 1) + ' mm') +
z('Bearbeitung', r.parameter.toleranz === 'fein' ? 'Toleranz fein (&le; IT7)' : 'Toleranz mittel (IT8&ndash;IT10)') +
'</table>' +
'<h2>Preise</h2><table class="staffel"><tr><th>St&uuml;ckzahl</th><th style="text-align:right">Einzelpreis</th><th style="text-align:right">Gesamt</th></tr>' +
d.angebot.staffel.map(x => '<tr><td>' + x.stueck + '</td><td>' + fZahl(x.einzelpreis, 2) + ' &euro;</td><td>' +
  fZahl(x.gesamt, 2) + ' &euro;</td></tr>').join('') + '</table>' +
'<p class="klein">Alle Preise netto zuz&uuml;glich der gesetzlichen Umsatzsteuer. Lieferzeit ' +
(d.angebot.lieferzeit || 'nach Vereinbarung') + '. Das Angebot ist ' + (F.gueltigkeit_tage || 30) +
' Tage g&uuml;ltig.' + (F.ustid ? ' USt-IdNr. ' + F.ustid + '.' : '') + '</p>' +
'<p class="klein">Die Kalkulation beruht auf einer rechnerischen Auswertung des &uuml;bermittelten Modells. ' +
'Ma&szlig;geblich f&uuml;r die Fertigung ist die Zeichnung.</p>' +
'</body></html>';

  const w = window.open('', '_blank');
  if(!w){ meldung('Das Druckfenster wurde blockiert. Bitte Pop-ups fuer diese Seite erlauben.', 'warn'); return; }
  w.document.write(h); w.document.close();
  setTimeout(() => { try{ w.focus(); w.print(); }catch(e){} }, 350);
}
