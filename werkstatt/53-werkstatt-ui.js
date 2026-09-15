/* =====================================================================
   werkstatt/53-werkstatt-ui.js — Auftraege und Planung in der Oberflaeche
   ---------------------------------------------------------------------
   Gebaut wie die Schwester-Apps: die Rechnerei steht DOM-frei in
   21-stamm.js und 22-planung.js, hier wird nur angezeigt und
   eingesammelt. Markierte Zeile, Maske mit Uebernehmen/Abbrechen,
   Statusfarben — dasselbe Muster wie der Arbeitsplan der Dreh-App.
   ===================================================================== */

const SLOT_AUF = 'wp_auftraege';
const SLOT_MASCH = 'wp_maschinen';
const SLOT_ZU = 'wp_zu';
const SLOT_FILTER = 'wp_filter';
const SLOT_FREI = 'wp_frei';
const SLOT_REGELN = 'wp_regeln';

/* Die Auswahl im Statusfeld. "offen" ist die taegliche Frage; die
   sechs Einzelstufen stehen darunter, weil man manchmal genau eine
   sucht. VORGABE IST "alle" - ein Filter, der beim ersten Oeffnen schon
   etwas versteckt, schickt den Benutzer in die Daten statt in die
   Leiste. */
const W_FILTER_STATUS = [['alle', 'alle Auftr\u00e4ge'], ['offen', 'offen (beauftragt bis l\u00e4uft)']];
const W_SORT_NAMEN = { termin:'nach Termin', nummer:'nach Nummer', kunde:'nach Kunde',
                       teil:'nach Teil', preis:'nach Preis (gr\u00f6\u00dfter zuerst)',
                       angelegt:'zuletzt angelegt' };

/* Die sieben Karten des Planungsblatts. AM HANDY sind vier davon
   zugeklappt: gemessen ist das Blatt bei 390 px 4236 px hoch, und wer
   die Termine sucht, scrollt sonst an allem anderen vorbei. Am Laptop
   steht alles offen - dort ist Platz.

   Kapazitaet, Auslastung und Termine bleiben ueberall offen: das sind
   die drei Fragen, wegen derer man das Blatt aufmacht. */
const W_KARTEN = ['plKarteKap', 'plKarteAusl', 'plKarteTermine',
                  'plKarteAusw', 'plKarteSollIst', 'plKarteZettel', 'plKarteMasch'];
const W_ZU_HANDY = ['plKarteAusw', 'plKarteSollIst', 'plKarteZettel', 'plKarteMasch'];

const W = {
  auftraege: [],
  maschinen: [],
  gewaehlt: -1,        /* Platz in der Liste, -1 = keiner */
  belegung: null,
  filter: {status:'alle', text:'', sortieren:'termin'},
  frei: [],            /* Feiertage und Betriebsurlaub, JJJJ-MM-TT */
  regeln: {wahl:'last', uebergabe:1},   /* Punkt 7 und 8 der Liste */
  nachrechnung: null   /* Ergebnis von auftragNachrechnen fuer die offene Maske */
};

/* ---- Speicher --------------------------------------------------------
   Eigene Slots neben den Einstellungen: Auftraege sind Bewegungsdaten und
   haben in einer Einstellungsdatei nichts verloren. Muell-JSON faellt auf
   die Vorgabe zurueck (Muster kalkMerge).                              */
function wLaden(){
  try{ const g = JSON.parse(localStorage.getItem(SLOT_AUF) || 'null');
       W.auftraege = Array.isArray(g) ? g : []; }
  catch(e){ W.auftraege = []; }
  try{ const m = JSON.parse(localStorage.getItem(SLOT_MASCH) || 'null');
       W.maschinen = (Array.isArray(m) && m.length) ? m
         : JSON.parse(JSON.stringify(WERKSTATT_MASCHINEN)); }
  catch(e){ W.maschinen = JSON.parse(JSON.stringify(WERKSTATT_MASCHINEN)); }
}
/* Der Anteil der Fraese an der Stueckzeit - die eine Zahl dieses
   Pakets, die nicht aus der Kalkulation folgt. Sie liegt in denselben
   Vorgaben wie die Stundensaetze und traegt dieselbe gepflegt-Marke. */
function wFraesMalen(){
  const f = el('einFraesStueck');
  const an = fraesAnteil(S.V);
  if(f) f.value = Math.round(an.stueck * 100);
  htm('einFraesHinweis',
    'Ein Drehteil mit Fr&auml;santeil l&auml;uft auf zwei Maschinen. Beim <b>R&uuml;sten</b> muss ' +
    'nichts geraten werden: der Aufschlag in der Kalkulation (' + an.ruestHerkunft +
    ') <b>ist</b> der Fr&auml;santeil, also <b>' + Math.round(an.ruest * 100) + ' %</b>. ' +
    'Bei der <b>St&uuml;ckzeit</b> gibt es keinen solchen Aufschlag — der Wert hier ist ' +
    (an.stueckGepflegt
      ? 'Deiner.'
      : '<b>eine Annahme von mir</b>. Miss ihn an einem Teil nach und trag ihn ein; ' +
        'bis dahin sagt die App bei jedem Vorschlag, dass er geraten ist.') +
    ' Der Knopf <b>Arbeitsg&auml;nge vorschlagen</b> steht in der Auftragsmaske.');
}

function wFreiLaden(){
  try{
    const g = JSON.parse(localStorage.getItem(SLOT_FREI) || 'null');
    W.frei = planFreiNorm(Array.isArray(g) ? g : []);
  }catch(e){ W.frei = []; }
}
function wFreiSichern(){
  try{ localStorage.setItem(SLOT_FREI, JSON.stringify(W.frei)); }catch(e){}
}

/* Die Vorgaben sind die bisherige Rechnung: 'last' und ein Tag. Wer
   nichts einstellt, bekommt genau den Plan von gestern. */
function wRegelnLaden(){
  let g = null;
  try{ g = JSON.parse(localStorage.getItem(SLOT_REGELN) || 'null'); }catch(e){}
  const w = g && WERKSTATT_MASCHINENWAHL.indexOf(g.wahl) >= 0 ? g.wahl : 'last';
  const u = g && isFinite(+g.uebergabe) ? Math.min(30, Math.max(0, Math.round(+g.uebergabe))) : 1;
  W.regeln = {wahl:w, uebergabe:u};
}
function wRegelnSichern(){
  try{ localStorage.setItem(SLOT_REGELN, JSON.stringify(W.regeln)); }catch(e){}
}

function wFilterLaden(){
  try{
    const g = JSON.parse(localStorage.getItem(SLOT_FILTER) || 'null');
    if(g && typeof g === 'object') W.filter = {
      status:String(g.status || 'alle'), text:String(g.text || ''),
      sortieren:String(g.sortieren || 'termin')
    };
  }catch(e){}
}
function wFilterSichern(){
  try{ localStorage.setItem(SLOT_FILTER, JSON.stringify(W.filter)); }catch(e){}
}

function wSichern(){
  try{
    localStorage.setItem(SLOT_AUF, JSON.stringify(W.auftraege));
    localStorage.setItem(SLOT_MASCH, JSON.stringify(W.maschinen));
  }catch(e){ meldung('Die Auftraege liessen sich nicht speichern: ' + e.message, 'warn'); }
}

/* ---- Freie Tage ------------------------------------------------------
   Als Marken, nicht als Liste: ein Betriebsurlaub sind zehn Eintraege,
   und zehn Tabellenzeilen dafuer waeren die falsche Form.             */
/* Eine Marke je Tag. `wer` ist '' fuer die ganze Werkstatt oder die
   Kennung der Maschine - daran haengt, was das Kreuz entfernt. */
function wFreiMarken(tage, wer){
  const TAGE = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  return '<div class="marken">' + tage.map(d =>
    '<span class="marke">' + TAGE[planWochentag(planTag(d))] + ' ' + d.slice(8) + '.' +
    d.slice(5, 7) + '.' + d.slice(0, 4) +
    '<button data-freiweg="' + d + '" data-freiwer="' + wEsc(wer) + '" ' +
    'title="entfernen">&#x2715;</button></span>').join('') + '</div>';
}

function wFreiMalen(){
  const l = el('plFreiListe'); if(!l) return;

  /* Die Auswahl "fuer wen" - sie merkt sich, was gewaehlt war: wer eine
     Maschine mehrere Tage in die Wartung schickt, waehlt sie sonst nach
     jedem Eintrag neu. */
  const ws = el('plFreiWer');
  if(ws){
    const alt = ws.value;
    ws.innerHTML = '<option value="">alle Maschinen (Feiertag, Urlaub)</option>' +
      W.maschinen.map(m => '<option value="' + wEsc(m.id) + '">' + wEsc(m.name) +
                           ' (Wartung)</option>').join('');
    if(alt && W.maschinen.some(m => m.id === alt)) ws.value = alt;
  }

  /* Die Tage der Werkstatt, darunter je Maschine ihre Wartung. Getrennt,
     weil es zwei verschiedene Aussagen sind: an einem freien Tag steht
     die Werkstatt, bei einer Wartung laufen die anderen weiter. */
  let h = W.frei.length ? wFreiMarken(W.frei, '') : '';
  W.maschinen.forEach(m => {
    if(!Array.isArray(m.wartung) || !m.wartung.length) return;
    h += '<div class="klein" style="margin-top:4px">' + wEsc(m.name) +
         ' &mdash; Wartung:</div>' + wFreiMarken(m.wartung, m.id);
  });
  l.innerHTML = h;

  const wartungZahl = W.maschinen.reduce((s, m) =>
    s + ((Array.isArray(m.wartung) && m.wartung.length) || 0), 0);
  const w = el('plFreiWeg'); if(w) w.hidden = !W.frei.length && !wartungZahl;
  const b = W.belegung;
  const wirkung = planFreiWirkung(W.frei, W.maschinen, b && b.ab, b && b.bis);
  const wart = wartungZahl
    ? ' Dazu <b>' + wartungZahl + '</b> Wartungstage an einzelnen Maschinen — an denen l&auml;uft ' +
      'der Rest der Werkstatt weiter, und die Tafel zeigt genau das.'
    : '';
  htm('plFreiHinweis', (!W.frei.length && !wartungZahl)
    ? 'Noch kein freier Tag. <b>Einen Feiertagskalender kennt die App nicht</b> — der h&auml;ngt an ' +
      'Bundesland und Jahr, und eine halbe Liste w&auml;re schlimmer als keine: sie s&auml;he ' +
      'vollst&auml;ndig aus. Trag ein, was bei Dir gilt — einzelne Tage oder einen Zeitraum ' +
      '(Betriebsurlaub). Mit dem Feld links w&auml;hlst Du, ob der Tag f&uuml;r die ganze Werkstatt ' +
      'gilt oder ob <b>eine Maschine in die Wartung</b> geht.'
    : ((W.frei.length
        ? '<b>' + wirkung.zahl + '</b> freie Tage f&uuml;r die ganze Werkstatt, <b>' + wirkung.imFenster +
          '</b> davon im Planungszeitraum' +
          (wirkung.ohneWirkung ? ' — davon ' + wirkung.ohneWirkung + ' ohne Wirkung (sie fallen ' +
            'ohnehin auf einen Tag, an dem keine Maschine l&auml;uft)' : '') + '.'
        : 'Kein freier Tag f&uuml;r die ganze Werkstatt.') + wart));
}

/* ---- Planungsregeln --------------------------------------------------
   DER HINWEIS IST DER EIGENTLICHE INHALT DER KARTE. Ein Schalter, dessen
   Wirkung man erst sieht, wenn man drei Karten weiter scrollt, ist eine
   Zumutung - also rechnet die Karte beide Regeln durch und sagt, was
   die andere anders machen wuerde.                                    */
function wRegelnMalen(){
  const s = el('plRegelWahl'); if(s) s.value = W.regeln.wahl;
  const u = el('plUebergabe'); if(u) u.value = W.regeln.uebergabe;
  const h = el('plRegelHinweis'); if(!h) return;

  /* WAS DIE REGEL WIRKLICH TUT, laesst sich ausrechnen, ohne etwas zu
     aendern: der Knopf "Arbeit verteilen" laeuft zweimal auf einer KOPIE,
     einmal je Regel. Das ist keine Schaetzung, sondern genau die
     Rechnung, die der Knopf ausfuehren wuerde.

     ERST STAND HIER ETWAS ANDERES, und es war falsch: fuer jeden offenen
     Auftrag ein frischer Vorschlag, die zwei Regeln verglichen. Ein
     Auftrag, der schon auf einer Maschine liegt, bekommt aber keinen
     Vorschlag mehr, und in der Last steckte er selbst mit drin - am Bild
     gemessen meldete die Karte "2 von 2 wuerden anders", wo kein
     einziger Gang umgelegt worden waere. */
  const andere = W.regeln.wahl === 'last' ? 'klein' : 'last';
  const probe = (regel) => {
    try{
      const kopie = JSON.parse(JSON.stringify(W.auftraege));
      return planVerteilen(kopie, W.maschinen, null, regel).zahl;
    }catch(e){ return null; }
  };
  const jetztZahl = probe(W.regeln.wahl), andersZahl = probe(andere);
  /* Wieviele Gaenge haben ueberhaupt eine Wahl? Wo nur eine Maschine
     passt, ist jede Regel dieselbe. */
  let mitWahl = 0;
  W.auftraege.forEach(a => {
    if(WERKSTATT_STATUS_PLANT.indexOf(a.status) < 0) return;
    auftragGaenge(a).forEach(g => {
      const art = (W.maschinen.filter(m => m.id === g.maschine)[0] || {}).art;
      if(!art) return;
      if(maschinenFuerAuftrag(a, W.maschinen, art).filter(x => x.passt).length > 1) mitWahl++;
    });
  });

  /* Und der Abstand wirkt nur, wo es einen ZWEITEN Gang gibt. */
  const mehrgaengig = W.auftraege.filter(a =>
    WERKSTATT_STATUS_PLANT.indexOf(a.status) >= 0 && auftragGaenge(a).length > 1).length;

  const wahlText = W.regeln.wahl === 'last'
    ? 'Ein neuer Auftrag geht auf die passende Maschine mit der <b>wenigsten Arbeit</b>. ' +
      'Das h&auml;lt die Auslastung gleichm&auml;&szlig;ig.'
    : 'Ein neuer Auftrag geht auf die <b>kleinste passende</b> Maschine. Die gro&szlig;e ' +
      'bleibt frei f&uuml;r das, was nur sie kann.';
  const wirkung = !mitWahl
    ? ' Zurzeit hat kein offener Arbeitsgang &uuml;berhaupt eine Wahl (es passt nur eine Maschine) — ' +
      'die Regel &auml;ndert heute nichts.'
    : jetztZahl === null
      ? ' ' + mitWahl + ' Arbeitsg&auml;nge h&auml;tten eine Wahl.'
      : ' So wie die Auftr&auml;ge jetzt liegen, w&uuml;rde <b>Arbeit verteilen</b> damit <b>' +
        jetztZahl + '</b> von ' + mitWahl + ' w&auml;hlbaren Arbeitsg&auml;ngen umlegen' +
        (andersZahl === jetztZahl
          ? ' — mit der anderen Regel genauso viele.'
          : ', mit der anderen <b>' + andersZahl + '</b>.');

  const ueText = W.regeln.uebergabe === 0
    ? 'Der n&auml;chste Gang beginnt <b>am selben Tag</b>. Dann steht dasselbe Teil an einem Tag ' +
      'auf zwei Maschinen — das Modell z&auml;hlt Minuten je Tag und kennt keine Uhrzeit, es kann ' +
      'also nicht belegen, dass sich das ausgeht.'
    : W.regeln.uebergabe === 1
      ? 'Der n&auml;chste Gang beginnt <b>am Tag danach</b> (Vorgabe).'
      : 'Der n&auml;chste Gang beginnt <b>' + W.regeln.uebergabe + ' Tage sp&auml;ter</b> — Zeit f&uuml;r ' +
        'H&auml;rten, Schleifen oder den Weg dorthin.';
  const ueWirkung = mehrgaengig
    ? ' Das betrifft <b>' + mehrgaengig + '</b> offene Auftr&auml;ge mit mehr als einem Gang.'
    : ' Zurzeit hat kein offener Auftrag mehr als einen Gang — der Wert &auml;ndert heute nichts.';

  htm('plRegelHinweis', wahlText + wirkung + '<br>' + ueText + ueWirkung +
      '<br>Die Regeln gelten f&uuml;r den <b>Vorschlag</b> und f&uuml;r <b>Arbeit verteilen</b>; ' +
      'eine von Hand gesetzte Maschine r&uuml;hren sie nicht an.');
}

/* ---- Karten zuklappen ------------------------------------------------
   Gefaltet wird ueber die KINDER der Karte, nicht ueber einen zweiten
   Rahmen: so muss keine der sieben Karten im HTML angefasst werden, und
   ein spaeter dazukommender Inhalt klappt von selbst mit.            */
function wKarteZu(id, zu){
  const k = el(id); if(!k) return;
  [].forEach.call(k.children || [], c => {
    if(c.tagName === 'H2') return;
    c.style.display = zu ? 'none' : '';
  });
  if(k.classList) k.classList[zu ? 'add' : 'remove']('zu');
  const p = k.querySelector && k.querySelector('h2 .pfeil');
  if(p) p.innerHTML = zu ? '&#x25B8;&#xFE0E;' : '&#x25BE;&#xFE0E;';
}
function wZuLesen(){
  try{ const g = JSON.parse(localStorage.getItem(SLOT_ZU) || 'null');
       if(Array.isArray(g)) return g; }catch(e){}
  /* Ohne gespeicherte Wahl entscheidet die Breite. 900 px ist dieselbe
     Grenze wie im Stylesheet - eine zweite waere eine zweite Wahrheit. */
  const schmal = typeof window !== 'undefined' && window.innerWidth &&
                 window.innerWidth < 900;
  return schmal ? W_ZU_HANDY.slice() : [];
}
function wZuSichern(liste){
  try{ localStorage.setItem(SLOT_ZU, JSON.stringify(liste)); }catch(e){}
}
function wKartenVerdrahten(){
  const zu = wZuLesen();
  W_KARTEN.forEach(id => {
    const k = el(id); if(!k) return;
    const h = k.querySelector && k.querySelector('h2');
    if(h && h.classList && !h.classList.contains('klapp')){
      h.classList.add('klapp');
      h.innerHTML = '<span class="pfeil"></span>' + h.innerHTML;
      h.addEventListener('click', () => {
        const liste = wZuLesen();
        const i = liste.indexOf(id);
        if(i >= 0) liste.splice(i, 1); else liste.push(id);
        wZuSichern(liste);
        wKarteZu(id, i < 0);
      });
    }
    wKarteZu(id, zu.indexOf(id) >= 0);
  });
}

function wHeute(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0');
}
function wNum(v){
  const x = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isFinite(x) ? x : 0;
}
/* Angezeigt wird gerundet, gespeichert bleibt genau.
   wFeldWert vergleicht, was im Feld steht, mit dem GERUNDETEN Altwert:
   sind sie gleich, hat niemand das Feld angefasst, und der exakte Wert
   bleibt. Sonst gilt, was dasteht. Ohne diesen Vergleich waere die
   Anzeige eine stille Aenderung des Preises - das Angebot stuende auf
   einer Zeit, die nie gerechnet wurde. */
function wRund(v, n){ const f = Math.pow(10, n == null ? 2 : n); return Math.round((+v || 0) * f) / f; }
function wFeldWert(id, exakt, n){
  const e = el(id);
  if(!e) return exakt;
  const neu = wNum(e.value);
  return (neu === wRund(exakt, n)) ? exakt : neu;
}
function wZahl(v, n){ const x = +v || 0; return x.toLocaleString('de-DE',
  {minimumFractionDigits:n == null ? 0 : n, maximumFractionDigits:n == null ? 0 : n}); }
function wMin(v){ const m = Math.round(+v || 0);
  return m >= 60 ? Math.floor(m/60) + ' h ' + String(m%60).padStart(2,'0') : m + ' min'; }
/* Der Faktor Ist/Soll als Ampel. Die Schwellen sind bewusst grob: ueber
   1,25 hat die Werkstatt ein Viertel laenger gebraucht, das ist keine
   Streuung mehr. UNTER 0,8 bekommt eine eigene Farbe - schneller als
   gerechnet ist kein Grund zur Freude, sondern ein zu teures Angebot. */
function wFaktor(f){
  if(f === null || f === undefined || !isFinite(f)) return '—';
  const kl = f > 1.25 ? 'st-schlecht' : f > 1.05 ? 'st-eng'
           : f < 0.8 ? 'st-freigegeben' : 'st-gut';
  return '<span class="status ' + kl + '">' + wZahl(f, 2) + '</span>';
}
/* Der Puffer in Arbeitstagen. NULL ist bereits die Warnung: dann muss
   heute angefangen werden, und jede Stoerung kostet den Termin. */
function wPuffer(p){
  if(p === null || p === undefined) return '';
  const kl = p < 0 ? 'st-schlecht' : p === 0 ? 'st-eng' : 'st-gut';
  const txt = p < 0 ? Math.abs(p) + (Math.abs(p) === 1 ? ' Tag zu sp&auml;t dran' : ' Tage zu sp&auml;t dran')
            : p === 0 ? 'heute anfangen'
            : p + (p === 1 ? ' Tag Puffer' : ' Tage Puffer');
  return '<span class="status ' + kl + '">' + txt + '</span>';
}
function wEsc(t){ return String(t == null ? '' : t)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ---- Auftragsliste ---------------------------------------------------
   Die markierte Zeile ist die gewaehlte - wie im Arbeitsplan der
   Dreh-App. Ein Tipp waehlt an, der Stift oeffnet die Maske.          */
/* Die Filterleiste fuellen - einmal, und danach nur den Zustand. */
function wFilterMalen(){
  const st = el('aufFStatus');
  /* .options gibt es im Ersatz-Browser nicht - dort lief die Zeile in
     einen Absturz, den nur der Fehlerfaenger gedruckt hat. */
  if(st && st.options && !st.options.length){
    st.innerHTML = W_FILTER_STATUS.map(x => '<option value="' + x[0] + '">' + wEsc(x[1]) + '</option>').join('') +
      WERKSTATT_STATUS.map(x => '<option value="' + x + '">nur ' + wEsc(x) + '</option>').join('');
  }
  if(st) st.value = W.filter.status;
  const so = el('aufFSort');
  if(so && so.options && !so.options.length){
    so.innerHTML = WERKSTATT_SORTEN.map(x =>
      '<option value="' + x + '">' + wEsc(W_SORT_NAMEN[x] || x) + '</option>').join('');
  }
  if(so) so.value = W.filter.sortieren;
  const tx = el('aufFText');
  if(tx && tx.value !== W.filter.text) tx.value = W.filter.text;
}

function wListeMalen(){
  const t = el('aufTab'); if(!t) return;
  wFilterMalen();
  if(!W.auftraege.length){
    t.innerHTML = '';
    htm('aufHinweis', 'Noch kein Auftrag. Rechne ein Teil im Blatt <b>2 Angebot</b> und ' +
        'lege es mit <b>Aus dem Angebot anlegen</b> an — R&uuml;stzeit, St&uuml;ckzeit und Preis ' +
        'kommen dann unver&auml;ndert aus der Kalkulation.');
    return;
  }
  const F = auftraegeFiltern(W.auftraege, W.filter);
  const wf = el('aufFWeg'); if(wf) wf.hidden = !F.gefiltert;
  /* BEIDE Zahlen, immer. Wer seinen Auftrag nicht findet, soll in der
     Leiste suchen und nicht in den Daten. */
  htm('aufHinweis', (F.gefiltert
      ? '<b>' + F.zahl + ' von ' + F.gesamt + '</b> Auftr&auml;gen — gefiltert'
      : F.gesamt + ' Auftr&auml;ge') +
    ', ' + wEsc(W_SORT_NAMEN[F.sortieren] || F.sortieren) +
    '. Ein Tipp w&auml;hlt an, der Stift &ouml;ffnet.');
  if(!F.zahl){
    t.innerHTML = '';
    htm('aufHinweis', '<b>Kein Auftrag passt zum Filter</b> (' + F.gesamt + ' insgesamt). ' +
        'Mit <b>Filter zur&uuml;cksetzen</b> stehen wieder alle da.');
    return;
  }
  let h = '<tr><th>Nr.</th><th>Kunde</th><th>Teil</th><th class="z">St.</th>' +
          '<th>Maschine</th><th>Status</th><th>Termin</th><th class="z">Zeit</th>' +
          '<th class="z">Preis</th><th></th></tr>';
  F.zeilen.forEach(({a, platz}) => {
    /* DER PLATZ IN DER URSPRUENGLICHEN LISTE, nicht die Nummer der
       gefilterten Zeile: sonst traefe der Loeschknopf nach dem Sortieren
       den falschen Auftrag. */
    const i = platz;
    /* Nicht mehr EINE Maschine, sondern die Kette: "Monforts 1000 -> Fraese".
       Bei einem Gang steht dort genau das, was vorher dastand. */
    const kette = auftragGaenge(a).map(g => {
      const m = W.maschinen.find(x => x.id === g.maschine);
      return wEsc(m ? m.name : (g.maschine || '—'));
    }).join(' &rarr; ');
    const min = planMinuten(a);
    h += '<tr data-auf="' + i + '"' + (i === W.gewaehlt ? ' class="markiert"' : '') + '>' +
      '<td>' + wEsc(a.nummer || '—') + '</td>' +
      '<td>' + wEsc(a.kunde) + '</td>' +
      '<td>' + wEsc(a.teil) + '</td>' +
      '<td class="z">' + wZahl(a.stueck) + '</td>' +
      '<td>' + kette + '</td>' +
      '<td><span class="status st-' + wEsc(a.status) + '">' + wEsc(a.status) + '</span></td>' +
      '<td>' + wEsc(a.liefertermin || '—') + '</td>' +
      '<td class="z">' + wMin(min.gesamt) + '</td>' +
      '<td class="z">' + wZahl(a.preis, 2) + ' &euro;</td>' +
      '<td class="kein-druck"><button class="mini" data-bearb="' + i + '" title="bearbeiten">&#x270E;</button></td></tr>';
  });
  t.innerHTML = h;
}

/* ---- Maske -----------------------------------------------------------
   Kein eigenes Fenster: die Maske ist eine Karte unter der Liste, wie die
   Zyklusmaske im Arbeitsplan. Uebernehmen schreibt zurueck, Abbrechen
   verwirft.                                                            */
function wMaskeOeffnen(i){
  W.gewaehlt = i;
  const a = W.auftraege[i]; if(!a) return;
  const m = el('aufMaske'); if(m) m.hidden = false;
  htm('aufMaskeTitel', 'Auftrag ' + (a.nummer ? wEsc(a.nummer) : (i + 1)));
  const setz = (id, v) => { const e = el(id); if(e) e.value = v == null ? '' : v; };
  setz('afNummer', a.nummer); setz('afKunde', a.kunde); setz('afTeil', a.teil);
  setz('afZeichnung', a.zeichnungsnr); setz('afWerkstoff', a.werkstoff);
  setz('afStueck', a.stueck);
  /* Zwei Nachkommastellen: 0,01 min sind 0,6 Sekunden, und darunter
     traegt niemand etwas ein. Der genaue Wert steht weiter im Auftrag. */
  setz('afRuest', wRund(a.zeiten.ruestzeit, 2));
  setz('afStueckzeit', wRund(a.zeiten.stueckzeit, 2));
  setz('afPreis', wRund(a.preis, 2));
  setz('afTermin', a.liefertermin); setz('afBemerkung', a.bemerkung);
  setz('afGefertigt', a.rueckmeldung.gefertigt); setz('afGeliefert', a.rueckmeldung.datum);
  setz('afAusschuss', a.rueckmeldung.ausschuss || 0);

  wGaengeMalen(a);
  wIstMalen(a);
  wGrundlageMalen(a);
  const st = el('afStatus');
  if(st) st.innerHTML = WERKSTATT_STATUS.map(s =>
    '<option value="' + s + '"' + (s === a.status ? ' selected' : '') + '>' + s + '</option>').join('');
  wListeMalen();
}
function wMaskeSchliessen(){ const m = el('aufMaske'); if(m) m.hidden = true; }

/* ---- Arbeitsgaenge in der Maske --------------------------------------
   Die Maschine wird JE GANG gewaehlt - deshalb bietet die Liste alle
   aktiven Maschinen an ('alle'), nicht nur die der Auftragsgattung: der
   zweite Gang eines Drehteils laeuft auf der Fraese. Der Arbeitsraum wird
   trotzdem geprueft; was nicht hineinpasst, steht mit Grund und ist nicht
   waehlbar.                                                             */
function wGangMaschinen(kand, gewaehlt){
  let o = '<option value="">&mdash; noch nicht gew&auml;hlt &mdash;</option>';
  kand.forEach(k => {
    o += '<option value="' + wEsc(k.id) + '"' + (k.id === gewaehlt ? ' selected' : '') +
         (k.passt ? '' : ' disabled') + '>' + wEsc(k.name) +
         (k.passt ? '' : ' &mdash; passt nicht: ' + wEsc(k.grund)) + '</option>';
  });
  return o;
}

/* DER ERSTE GANG IST DER REST. Seine Zeiten werden gerechnet, nicht
   eingegeben (feste Zelle statt Eingabefeld) - damit KANN die Summe der
   Gaenge nicht von der Kalkulation abweichen. Der einzige Fall, der
   schiefgehen kann, ist "die anderen brauchen mehr, als da war": dann
   steht der erste im Minus, und genau das sagt die Karte. */
function wGaengeMalen(a){
  const t = el('afGaenge'); if(!t) return;
  gaengeMaterialisieren(a);
  gaengeAusgleichen(a);
  const g = a.gaenge, n = Math.max(1, Math.round(+a.stueck || 1));
  const kand = maschinenFuerAuftrag(a, W.maschinen, 'alle');
  let h = '<tr><th>Nr.</th><th>Arbeitsgang</th><th>Maschine</th>' +
          '<th class="z">R&uuml;sten</th><th class="z">je St&uuml;ck</th>' +
          '<th class="z">gesamt</th><th></th></tr>';
  g.forEach((x, i) => {
    const schlecht = x.ruestzeit < -0.0001 || x.stueckzeit < -0.0001;
    h += '<tr' + (schlecht ? ' class="warnzeile"' : '') + '>' +
      '<td>' + x.nr + '</td>' +
      '<td><input type="text" data-gn="' + i + '" value="' + wEsc(x.name) +
        '" placeholder="' + (i ? 'z. B. fr&auml;sen' : 'z. B. drehen') + '"></td>' +
      '<td><select data-gm="' + i + '">' + wGangMaschinen(kand, x.maschine) + '</select></td>' +
      (i === 0
        ? '<td class="z fest">' + wZahl(x.ruestzeit, 1) + '</td>' +
          '<td class="z fest">' + wZahl(x.stueckzeit, 2) + '</td>'
        : '<td class="z"><input type="number" step="any" data-gr="' + i + '" value="' + x.ruestzeit + '"></td>' +
          '<td class="z"><input type="number" step="any" data-gs="' + i + '" value="' + x.stueckzeit + '"></td>') +
      '<td class="z">' + wMin(x.ruestzeit + x.stueckzeit * n) + '</td>' +
      '<td class="kein-druck">' + (i
        ? '<button class="mini" data-gweg="' + i + '" title="Arbeitsgang entfernen">&#x2715;</button>' : '') +
      '</td></tr>';
  });
  t.innerHTML = h;

  htm('afGangSumme', 'Der <b>erste Arbeitsgang bekommt, was &uuml;brig bleibt</b>: ' +
      'Arbeitsg&auml;nge teilen die kalkulierte Zeit auf, sie erzeugen keine. ' +
      'Die Kalkulation hat <b>' + wZahl(a.zeiten.ruestzeit, 1) + ' min</b> R&uuml;sten und <b>' +
      wZahl(a.zeiten.stueckzeit, 2) + ' min je St&uuml;ck</b> gerechnet — auf dieser Zeit steht der Preis.');

  /* Der Vorschlagsknopf gilt genau einem Fall: ein Drehteil mit
     Fraesanteil, das noch EINEN Gang hat. Danach verschwindet er - ein
     zweiter Klick wuerde die von Hand gesetzten Minuten ueberschreiben. */
  const vk = el('afGangVorschlag');
  if(vk) vk.hidden = !(a.klasse === 'drehteil_fraes' && g.length === 1);

  const neg = g.filter(x => x.ruestzeit < -0.0001 || x.stueckzeit < -0.0001).length;
  const hin = gangHinweis(a);
  const hw = el('afGangHinweis');
  if(hw){
    hw.hidden = !neg && !hin;
    hw.className = neg ? 'meldung warn' : 'meldung info';
    hw.innerHTML = neg
      ? 'Die weiteren Arbeitsg&auml;nge brauchen <b>mehr Zeit, als die Kalkulation gerechnet hat</b> — ' +
        'der erste Gang steht im Minus. Nimm dort Minuten weg oder rechne das Angebot neu. ' +
        'So wie es jetzt dasteht, ist der Preis auf einer Zeit gerechnet, die es nicht gibt.'
      : wEsc(hin);
  }
  const un = kand.filter(k => k.unsicher).length;
  const mh = el('afMaschinenHinweis');
  if(mh){
    mh.hidden = !un;
    mh.innerHTML = un ? 'Der Arbeitsraum dieser Maschinen ist ein <b>Platzhalter</b> ' +
      '(Blatt 4 Planung, Abschnitt Maschinen). Die Aussage &bdquo;passt&ldquo; steht damit auf ' +
      'ungepflegten Ma&szlig;en.' : '';
  }
}

/* ---- Rueckmeldung in der Maske ---------------------------------------
   Eine Zeile je Arbeitsgang, Soll fest und Ist als Feld. Der Faktor steht
   daneben, sobald beide Zeiten eines Gangs dastehen.                   */
function wIstMalen(a){
  const t = el('afIst'); if(!t) return;
  const g = istGaenge(a), su = istSumme(a), n = su.stueck;
  let h = '<tr><th>Nr.</th><th>Arbeitsgang</th><th>Maschine</th>' +
          '<th class="z">R&uuml;sten soll</th><th class="z">ist</th>' +
          '<th class="z">je St&uuml;ck soll</th><th class="z">ist</th>' +
          '<th class="z">Faktor</th></tr>';
  g.forEach(x => {
    const m = W.maschinen.find(y => y.id === x.maschine);
    const sollG = x.sollRuest + x.sollStueck * n;
    const voll = x.istRuest !== null && x.istStueck !== null;
    const f = (voll && sollG > 0) ? ((x.istRuest + x.istStueck * n) / sollG) : null;
    h += '<tr><td>' + x.nr + '</td><td>' + wEsc(x.name || '—') + '</td>' +
      '<td>' + wEsc(m ? m.name : (x.maschine || '—')) + '</td>' +
      '<td class="z fest">' + wZahl(x.sollRuest, 1) + '</td>' +
      '<td class="z"><input type="number" step="any" min="0" data-ir="' + x.nr +
        '" value="' + (x.istRuest === null ? '' : x.istRuest) + '"></td>' +
      '<td class="z fest">' + wZahl(x.sollStueck, 2) + '</td>' +
      '<td class="z"><input type="number" step="any" min="0" data-is="' + x.nr +
        '" value="' + (x.istStueck === null ? '' : x.istStueck) + '"></td>' +
      '<td class="z">' + wFaktor(f) + '</td></tr>';
  });
  t.innerHTML = h;

  let txt;
  if(su.vollstaendig){
    txt = 'Gebraucht <b>' + wMin(su.istGesamt) + '</b>, gerechnet waren <b>' + wMin(su.sollGesamt) +
      '</b> — Faktor <b>' + wZahl(su.faktor, 2) + '</b> (R&uuml;sten ' + wZahl(su.faktorRuesten, 2) +
      ', je St&uuml;ck ' + wZahl(su.faktorStueck, 2) + '). ' +
      (su.faktor > 1.05 ? 'Die Werkstatt hat l&auml;nger gebraucht als gerechnet. '
       : su.faktor < 0.8 ? 'Deutlich schneller als gerechnet — das Angebot war zu teuer. ' : '');
  } else if(su.angefangen){
    txt = 'Noch nicht vollst&auml;ndig zur&uuml;ckgemeldet. Ein Faktor entsteht erst, wenn <b>jeder</b> ' +
      'Arbeitsgang eine R&uuml;st- und eine St&uuml;ckzeit hat — aus halben Zetteln eine Kennzahl zu ' +
      'rechnen s&auml;he genauso aus wie aus ganzen. ';
  } else {
    txt = 'Noch nichts zur&uuml;ckgemeldet. Die Zeiten stehen auf der Laufkarte zum Eintragen. ';
  }
  htm('afIstSumme', txt + '<b>Die Ist-Zeiten &auml;ndern die Kalkulation nicht</b> — sie stehen daneben. ' +
      'Was daraus folgt, steht im Blatt <b>4 Planung</b> unter <i>Soll und Ist</i>.');
}

function wIstLesen(a){
  const t = el('afIst');
  if(!t || !t.querySelector) return;
  auftragGaenge(a).forEach(g => {
    const r = t.querySelector('[data-ir="' + g.nr + '"]');
    const z = t.querySelector('[data-is="' + g.nr + '"]');
    if(r) istSetzen(a, g.nr, 'ruestzeit', r.value);
    if(z) istSetzen(a, g.nr, 'stueckzeit', z.value);
  });
}

/* ---- Woher der Preis kommt -------------------------------------------
   Die Stundensaetze sind Platzhalter, und sie werden gepflegt. Von da an
   rechnet jedes neue Angebot anders - und an einem bestehenden Auftrag
   saehe man es nicht. Diese Zeile sagt es.                             */
function wGrundlageMalen(a){
  const e = el('afGrundlage'); if(!e) return;
  const zeile = el('afNeuZeile');
  const dt = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '.' + m[2] + '.' + m[1] : (iso || '&mdash;');
  };
  if(!a.kalk){
    if(zeile) zeile.hidden = true;
    W.nachrechnung = null;
    htm('afGrundlage', 'Dieser Auftrag tr&auml;gt seine <b>Kalkulationsgrundlage nicht</b> — ' +
        'er ist entstanden, bevor sie mitgeschrieben wurde, oder von Hand angelegt. ' +
        'Preis und Zeiten lassen sich deshalb nicht nachrechnen; sie bleiben, wie sie dastehen.');
    return;
  }
  const n = auftragNachrechnen(a, kalkRechnen, S.V, W.maschinen);
  W.nachrechnung = n;
  if(!n){
    if(zeile) zeile.hidden = true;
    htm('afGrundlage', 'Gerechnet am ' + dt(a.kalk.gerechnet) +
        '. Das Nachrechnen ist fehlgeschlagen — die Grundlage ist unvollst&auml;ndig.');
    return;
  }
  const grund = 'Gerechnet am <b>' + dt(n.gerechnet) + '</b> aus ' +
    wEsc(a.kalk.werkstoff || 'ohne Werkstoff') + ', Toleranz ' + wEsc(a.kalk.toleranz) +
    ', ' + wZahl(a.kalk.teil.bohrungen) + ' Bohrungen. ';
  if(n.gleich){
    if(zeile) zeile.hidden = true;
    htm('afGrundlage', grund + 'Dieselbe Rechnung ergibt mit den <b>heutigen Einstellungen ' +
        'denselben Preis</b>.');
    return;
  }
  if(zeile) zeile.hidden = false;
  const d = n.neu.preis - n.alt.preis;
  htm('afGrundlage', grund +
    '<b>Heute erg&auml;be dieselbe Rechnung ' + wZahl(n.neu.preis, 2) + ' &euro;</b> statt ' +
    wZahl(n.alt.preis, 2) + ' &euro; (' + (d > 0 ? '+' : '') + wZahl(d, 2) + ' &euro;)' +
    (n.stueckGeaendert ? ' — dabei ist auch die St&uuml;ckzahl eine andere als damals (' +
      wZahl(a.kalk.stueck) + ' &rarr; ' + wZahl(n.stueck) + ')' : '') + '. ' +
    '<b>Der Auftrag beh&auml;lt seinen Preis</b> — das Angebot liegt beim Kunden. ' +
    'Ob er den neuen bekommt, entscheidest Du.');
}

function wGaengeLesen(a){
  const t = el('afGaenge');
  if(!t || !Array.isArray(a.gaenge) || !a.gaenge.length || !t.querySelector) return;
  a.gaenge.forEach((g, i) => {
    const nm = t.querySelector('[data-gn="' + i + '"]');
    const ms = t.querySelector('[data-gm="' + i + '"]');
    const ru = t.querySelector('[data-gr="' + i + '"]');
    const sz = t.querySelector('[data-gs="' + i + '"]');
    if(nm) g.name = nm.value;
    if(ms) g.maschine = ms.value;
    if(ru) g.ruestzeit = wNum(ru.value);   /* beim ersten Gang gibt es die
                                              Felder nicht - er ist der Rest */
    if(sz) g.stueckzeit = wNum(sz.value);
  });
  gaengeAusgleichen(a);
  /* Die Maschine des Auftrags ist die des ersten Gangs: daran haengen
     Liste, Auswertung und alles, was vor den Arbeitsgaengen gebaut war. */
  a.maschine = a.gaenge[0].maschine;
}

function wMaskeLesen(){
  const a = W.auftraege[W.gewaehlt]; if(!a) return null;
  const v = id => { const e = el(id); return e ? e.value : ''; };
  const z = id => { const e = el(id); return wNum(e ? e.value : ''); };
  a.nummer = v('afNummer'); a.kunde = v('afKunde'); a.teil = v('afTeil');
  a.zeichnungsnr = v('afZeichnung'); a.werkstoff = v('afWerkstoff');
  a.stueck = Math.max(1, Math.round(z('afStueck')));
  a.zeiten.ruestzeit = wFeldWert('afRuest', a.zeiten.ruestzeit, 2);
  a.zeiten.stueckzeit = wFeldWert('afStueckzeit', a.zeiten.stueckzeit, 2);
  a.preis = wFeldWert('afPreis', a.preis, 2);
  a.status = v('afStatus') || 'angeboten';
  a.liefertermin = v('afTermin'); a.bemerkung = v('afBemerkung');
  a.rueckmeldung.gefertigt = Math.max(0, Math.round(z('afGefertigt')));
  a.rueckmeldung.ausschuss = Math.max(0, Math.round(z('afAusschuss')));
  a.rueckmeldung.datum = v('afGeliefert');
  wIstLesen(a);
  /* ZULETZT: die Gaenge brauchen Stueckzahl und Kalkulationszeit, die
     gerade erst gesetzt wurden - der erste Gang wird daraus gerechnet. */
  wGaengeLesen(a);
  return a;
}

/* ---- Aus dem Angebot ------------------------------------------------- */
function wAusAngebot(){
  if(!S.d){ meldung('Erst ein Teil laden und rechnen — dann steht die Zeit fest.', 'warn'); return; }
  const ein = {
    vorgaben:S.V, teil:S.d.teil, rohteil:S.d.rohteil,
    werkstoff:(el('kWerkstoff') || {}).value || '',
    toleranz:(el('kToleranz') || {}).value || 'mittel',
    oberflaeche:(el('kOberflaeche') || {}).value || 'normal',
    seiten:+(el('kSeiten') || {}).value || 1,
    stueck:+(el('kStueck') || {}).value || 1,
    versandArt:(el('kVersandArt') || {}).value || 'versand',
    ueber:S.ueber
  };
  const k = kalkRechnen(ein);
  const a = auftragAusKalkulation(S.d, k, {
    kunde:(el('aKunde') || {}).value || '',
    nummer:(el('aNummer') || {}).value || '',
    heute:wHeute(),
    /* Die GRUNDLAGE der Rechnung mitschreiben - dieselben Eingaben, mit
       denen k gerade entstanden ist. Ohne sie liesse sich spaeter nicht
       mehr sagen, worauf der Preis beruht. */
    ein:ein
  });
  /* Mit der Auftragsliste: unter den passenden Maschinen die mit der
     wenigsten Arbeit. Ohne sie waere es die erste der Liste - und der
     Durchstich ueber 36 echte Teile hat gezeigt, wohin das fuehrt
     (alles auf der 1000er, die 1500er leer, zwoelf Termine gerissen). */
  a.maschine = maschineVorschlag(a, W.maschinen, W.auftraege, W.regeln.wahl);
  W.auftraege.push(a);
  wSichern();
  blatt('Auf');
  wMaskeOeffnen(W.auftraege.length - 1);
  const hin = gangHinweis(a);
  meldung('Auftrag aus dem Angebot angelegt: R&uuml;stzeit ' + wMin(a.zeiten.ruestzeit) +
          ', St&uuml;ckzeit ' + (Math.round(a.zeiten.stueckzeit * 10) / 10) + ' min, ' +
          a.stueck + ' St&uuml;ck.' + (hin ? ' ' + wEsc(hin) : ''), hin ? 'warn' : 'info');
}

/* ---- Planung ---------------------------------------------------------- */
function wPlanRechnen(){
  const ab = (el('plAb') || {}).value || wHeute();
  const tage = Math.max(7, Math.round(+(el('plTage') || {}).value || 60));
  /* frei DURCHREICHEN. Der Kern kennt die Liste an 26 Stellen; die
     Oberflaeche hat sie nie uebergeben - also gab es keinen Weg, einen
     Feiertag einzutragen, und der Plan liess am 3. Oktober arbeiten. */
  W.belegung = planBelegen({ auftraege:W.auftraege, maschinen:W.maschinen, ab, tage,
                             frei:W.frei, uebergabe:W.regeln.uebergabe });
  return W.belegung;
}

function wPlanMalen(){
  const b = wPlanRechnen();
  const ausl = planAuslastung(b, W.maschinen, W.frei);

  /* --- Tafel: Maschinen als Zeilen, Wochen als Spalten --- */
  const wochen = [...new Set(ausl.map(w => w.woche))].sort();
  const t = el('plTafel');
  if(t){
    let h = '<tr><th>Maschine</th>' + wochen.map(w => '<th class="z">KW ab<br>' +
            w.slice(8) + '.' + w.slice(5,7) + '</th>').join('') + '</tr>';
    W.maschinen.forEach(m => {
      h += '<tr><td>' + wEsc(m.name) + '</td>';
      wochen.forEach(w => {
        const z = ausl.find(x => x.maschine === m.id && x.woche === w);
        const p = z ? z.anteil : 0;
        /* Die Farbe ist die Aussage: ueber 100 % ist der Plan nicht
           haltbar, ab 85 % wird es eng. Dieselbe Ampel-Logik wie die
           Warnungen der Dreh-App. */
        const kl = p > 1.0001 ? 'voll' : p >= 0.85 ? 'eng' : p > 0 ? 'ok' : '';
        /* Der Balken ist der Zellhintergrund - so kann er die Zelle nicht
           verlassen, und die Zahl bleibt darueber lesbar. */
        h += '<td class="z bal ' + kl + '" style="background-size:' +
             Math.min(100, Math.round(p * 100)) + '% 70%">' +
             (z && z.kapazitaet ? Math.round(p * 100) + ' %' : '—') + '</td>';
      });
      h += '</tr>';
    });
    t.innerHTML = h;
  }
  /* Die erste Woche ist meist angebrochen: wer am Dienstag plant, hat in
     dieser Woche nur noch vier Tage Kapazitaet. 100 % heisst dort "die
     Resttage sind voll" - ohne den Satz liest man eine Ueberlast, wo
     keine ist. */
  const ersteAngebrochen = planWochentag(planTag(b.ab)) > 1;
  htm('plLegende', 'Grundlage ist die Kapazit&auml;t der Woche, nicht die Zahl der Tage: ' +
      'eine Maschine, die nur montags l&auml;uft, ist mit einem vollen Montag zu 100 % ausgelastet. ' +
      '<b>Gr&uuml;n</b> unter 85 %, <b>gelb</b> ab 85 %, <b>rot</b> &uuml;ber 100 % — dann ist der Plan nicht haltbar.' +
      (ersteAngebrochen ? ' <b>Die erste Woche ist angebrochen</b> (Planung ab ' + b.ab +
       '): dort z&auml;hlen nur die Resttage, 100 % hei&szlig;t also &bdquo;Resttage voll&ldquo;.' : '') +
      '<br><b>Sp&auml;testens ab</b> ist die R&uuml;ckw&auml;rtsrechnung vom Liefertermin: der Tag, an dem ' +
      'es losgehen muss, damit der Termin h&auml;lt — <b>auf einer freien Maschine</b>. Das ist eine ' +
      'Frist, kein Plan. Der Unterschied zum Start links ist der <b>Puffer</b>; ist er negativ, ' +
      'reicht die Zeit selbst dann nicht, wenn sonst nichts auf der Maschine l&auml;ge.');

  /* --- Termine --- */
  const tt = el('plTermine');
  if(tt){
    if(!b.auftraege.length && !b.unplanbar.length){
      tt.innerHTML = '';
      htm('plMeldung', '<div class="meldung info">Kein Auftrag in der Planung. Nur Auftr&auml;ge mit Status ' +
          '<b>beauftragt</b>, <b>freigegeben</b> oder <b>l&auml;uft</b> binden Kapazit&auml;t — ' +
          'ein Angebot noch nicht, ein geliefertes Teil nicht mehr.</div>');
    } else {
      htm('plMeldung', '');
      let h = '<tr><th>Nr.</th><th>Teil</th><th>Maschine</th><th class="z">Zeit</th>' +
              '<th>Start</th><th>fertig</th><th>Termin</th>' +
              '<th>sp&auml;testens ab</th><th>Lage</th></tr>';
      b.auftraege.forEach(a => {
        const lage = a.haelt === null ? '<span class="status st-angeboten">kein Termin</span>'
          : a.haelt ? (a.knapp ? '<span class="status st-eng">am Tag knapp</span>'
                               : '<span class="status st-gut">h&auml;lt</span>')
          : '<span class="status st-schlecht">' + a.verzug + (a.verzug === 1 ? ' Tag' : ' Tage') + ' zu sp&auml;t</span>' +
            /* WARUM zu spaet - das ist die Auskunft, die aus beiden
               Rechnungen zusammen entsteht und aus keiner allein. Ohne
               sie liest sich "heute anfangen" neben "1 Tag zu spaet" wie
               ein Widerspruch; es ist keiner. */
            (a.grundVerzug === 'zeit'
               ? '<br><span class="klein">die Zeit reicht nicht — auch auf einer freien Maschine nicht</span>'
             : a.grundVerzug === 'belegung'
               ? '<br><span class="klein">die Maschine ist belegt — allein w&auml;re es zu schaffen</span>' : '');
        const platz = W.auftraege.indexOf(a.auftrag);
        h += '<tr' + (a.rang ? ' class="handsortiert"' : '') + '>' +
             '<td class="nw">' + wEsc(a.nummer || '—') +
             ' <button class="mini kein-druck" data-rauf="' + platz + '" title="vorziehen">&#x25B2;</button>' +
             '<button class="mini kein-druck" data-rab="' + platz + '" title="zur&uuml;ckstellen">&#x25BC;</button>' +
             (a.rang ? '<br><span class="status st-beauftragt">von Hand: ' + a.rang + '</span>' : '') +
             '</td><td>' + wEsc(a.teil) + '</td>' +
             '<td>' + wEsc(a.maschineName) + '</td><td class="z nw">' + wMin(a.minuten.gesamt) + '</td>' +
             '<td class="nw">' + a.start + '</td><td class="nw">' + a.ende + '</td>' +
             '<td class="nw">' + wEsc(a.liefertermin || '—') + '</td>' +
             '<td class="nw">' + (a.spaetester ? a.spaetester + '<br>' + wPuffer(a.puffer) : '—') + '</td>' +
             '<td>' + lage + '</td></tr>';
        /* Bei mehreren Gaengen genuegt die Kette im Maschinenfeld nicht -
           wer den Termin nachrechnen will, braucht die Tage je Gang. */
        if(a.gaenge && a.gaenge.length > 1){
          h += '<tr class="gangzeile"><td></td><td colspan="8" class="klein">' +
            a.gaenge.map(g => g.nr + '. ' + wEsc(g.name || 'ohne Namen') + ' &middot; ' +
              wEsc(g.maschineName) + ' &middot; ' + wMin(g.minuten) + ' &middot; ' + g.start +
              (g.start === g.ende ? '' : ' bis ' + g.ende)).join(' &nbsp;&#124;&nbsp; ') +
            '</td></tr>';
        }
      });
      b.unplanbar.forEach(u => {
        h += '<tr><td>' + wEsc(u.auftrag.nummer || '—') + '</td><td>' + wEsc(u.auftrag.teil) + '</td>' +
             '<td colspan="6" class="warnzeile">nicht eingeplant: ' + wEsc(u.grund) + '</td>' +
             '<td><span class="status st-schlecht">offen</span></td></tr>';
      });
      tt.innerHTML = h;
    }
  }

  /* Die Handsortierung MUSS sichtbar sein. Ein Plan, dessen Reihenfolge
     man nicht mehr erklaeren kann, ist genau das, was die Vorwaerts-
     planung vermeiden sollte. */
  const handzahl = W.auftraege.filter(a => +a.rang).length;
  const rw = el('plRangWeg');
  if(rw) rw.hidden = !handzahl;
  htm('plRangHinweis', handzahl
    ? '<b>Die Reihenfolge ist von Hand festgelegt</b> (' + handzahl + ' Auftr&auml;ge tragen einen Rang). ' +
      'Der Rang geht vor dem Liefertermin. Beim ersten Verschieben wird die ganze sichtbare Folge ' +
      'festgeschrieben — sonst h&auml;tte ein Tausch zwischen zwei Auftr&auml;gen ohne Rang keine Wirkung, ' +
      'weil der Liefertermin sie sofort wieder auseinanderz&ouml;ge.'
    : 'Die Reihenfolge folgt dem <b>Liefertermin</b>, fr&uuml;h zuerst. Mit &#x25B2; und &#x25BC; l&auml;sst ' +
      'sich ein Auftrag von Hand vorziehen oder zur&uuml;ckstellen — das ist dann Deine Entscheidung und ' +
      'steht als solche in der Tafel.');

  /* --- Auswertung --- */
  const aw = planAuswertung(W.auftraege, W.maschinen);
  const at = el('plAusw');
  if(at){
    let h = '<tr><th>Maschine</th><th class="z">Auftr&auml;ge</th><th class="z">St&uuml;ck</th>' +
            '<th class="z">Stunden</th><th class="z">Umsatz geliefert</th></tr>';
    aw.jeMaschine.forEach(m => {
      h += '<tr><td>' + wEsc(m.name) + '</td><td class="z">' + wZahl(m.auftraege) + '</td>' +
           '<td class="z">' + wZahl(m.stueck) + '</td><td class="z">' + wZahl(m.minuten/60, 1) + '</td>' +
           '<td class="z">' + wZahl(m.umsatz, 2) + ' &euro;</td></tr>';
    });
    h += '<tr class="summe"><td>zusammen</td><td class="z">' + wZahl(aw.zahl) + '</td>' +
         '<td class="z">' + wZahl(aw.stueck) + '</td><td class="z">' + wZahl(aw.stunden, 1) + '</td>' +
         '<td class="z">' + wZahl(aw.umsatz, 2) + ' &euro;</td></tr>';
    h += '<tr><td colspan="5" class="klein">Ein Auftrag mit mehreren Arbeitsg&auml;ngen z&auml;hlt bei jeder ' +
         'Maschine, die er ber&uuml;hrt; die Stunden liegen beim jeweiligen Gang. Der <b>Umsatz ist nach ' +
         'Zeitanteil umgelegt</b> — er geh&ouml;rt dem Auftrag, nicht einer Maschine. Die Zeile ' +
         '<b>zusammen</b> ist die echte Summe.</td></tr>';
    h += '<tr><td colspan="4">Auftragsbestand (beauftragt bis fertig, noch nicht geliefert)</td>' +
         '<td class="z">' + wZahl(aw.auftragsbestand, 2) + ' &euro;</td></tr>';
    h += '<tr><td colspan="5">Termintreue: ' + (aw.termintreue === null
      ? 'noch nicht bewertbar — dazu braucht es gelieferte Auftr&auml;ge mit Termin und Liefertag'
      : Math.round(aw.termintreue * 100) + ' % (' + aw.puenktlich + ' von ' + aw.bewertbar + ')') + '</td></tr>';
    at.innerHTML = h;
  }

  /* --- Soll und Ist ---
     Die Kalkulation schaetzt, die Werkstatt misst. Solange niemand beide
     nebeneinanderlegt, bleibt die Schaetzung so falsch, wie sie am
     ersten Tag war. */
  const si = planSollIst(W.auftraege, W.maschinen);
  const sit = el('plSollIst');
  if(sit){
    let h = '';
    if(!si.zahl){
      h = '<tr><td>Noch kein Auftrag ist vollst&auml;ndig zur&uuml;ckgemeldet.</td></tr>';
    } else {
      h = '<tr><th>Maschine</th><th class="z">Auftr&auml;ge</th><th class="z">Soll</th>' +
          '<th class="z">Ist</th><th class="z">Faktor</th></tr>';
      si.jeMaschine.forEach(m => {
        h += '<tr' + (m.auftraege ? '' : ' class="gangzeile"') + '><td>' + wEsc(m.name) + '</td>' +
          '<td class="z">' + wZahl(m.auftraege) + '</td>' +
          '<td class="z">' + (m.soll ? wMin(m.soll) : '—') + '</td>' +
          '<td class="z">' + (m.soll ? wMin(m.ist) : '—') + '</td>' +
          '<td class="z">' + wFaktor(m.faktor) + '</td></tr>';
      });
      h += '<tr><th>Teileklasse</th><th class="z">Auftr&auml;ge</th><th class="z">Soll</th>' +
           '<th class="z">Ist</th><th class="z">Faktor</th></tr>';
      si.jeKlasse.forEach(k => {
        h += '<tr><td>' + wEsc(k.klasse) + '</td><td class="z">' + wZahl(k.auftraege) + '</td>' +
          '<td class="z">' + wMin(k.soll) + '</td><td class="z">' + wMin(k.ist) + '</td>' +
          '<td class="z">' + wFaktor(k.faktor) + '</td></tr>';
      });
      h += '<tr class="summe"><td>zusammen</td><td class="z">' + wZahl(si.zahl) + '</td>' +
        '<td class="z">' + wMin(si.soll) + '</td><td class="z">' + wMin(si.ist) + '</td>' +
        '<td class="z">' + wFaktor(si.faktor) + '</td></tr>';
    }
    sit.innerHTML = h;
  }
  /* Die Zahl der NICHT gerechneten Auftraege gehoert dazu - eine Kennzahl
     aus drei Zetteln sieht genauso aus wie eine aus dreissig. */
  htm('plSollIstHinweis',
    '<b>' + si.zahl + ' von ' + si.betrachtet + '</b> Auftr&auml;gen sind vollst&auml;ndig ' +
    'zur&uuml;ckgemeldet und gehen in die Rechnung ein' +
    (si.angefangen ? '; <b>' + si.angefangen + '</b> ' + (si.angefangen === 1 ? 'ist angefangen und z&auml;hlt' : 'sind angefangen und z&auml;hlen') + ' noch nicht' : '') +
    (si.ohneRueckmeldung ? '; ' + si.ohneRueckmeldung + ' ohne R&uuml;ckmeldung' : '') + '. ' +
    'Der <b>Faktor ist Ist geteilt durch Soll</b>: 1,40 hei&szlig;t, die Werkstatt hat 40 % ' +
    'l&auml;nger gebraucht als gerechnet; unter 0,80 war das Angebot zu teuer. ' +
    '<b>Die App &auml;ndert daraufhin nichts von selbst.</b> Ob Zerspanleistung, Stundensatz oder ' +
    'Nebenzeit in den Einstellungen anders geh&ouml;ren, entscheidest Du — und dann gilt der neue ' +
    'Wert erst f&uuml;r die n&auml;chste Kalkulation, nicht r&uuml;ckwirkend f&uuml;r bestehende Angebote.' +
    (si.zahl && si.zahl < 5 ? ' <b>Achtung:</b> bei ' + si.zahl + ' Auftr&auml;gen ist das noch keine ' +
     'Statistik, sondern ein Einzelfall.' : ''));

  /* --- Zettel fuer die Maschine --- */
  const zs = el('plZettelM');
  if(zs){
    const alt = zs.value;
    zs.innerHTML = W.maschinen.map(m =>
      '<option value="' + wEsc(m.id) + '">' + wEsc(m.name) + '</option>').join('');
    if(alt) zs.value = alt;
  }
  const zt = el('plZettelTage'); if(zt && !zt.value) zt.value = 7;
  htm('plZettelHinweis', 'Die Liste f&uuml;r die Maschine: je Tag, was darauf liegt, mit ' +
    'St&uuml;ckzahl, Werkstoff, Zeit und Termin — und einer Spalte zum Abhaken. Sie rechnet ' +
    '<b>nichts neu</b>, sondern sortiert dieselben Bl&ouml;cke, die in der Tafel oben stehen. ' +
    'Tage ohne Kapazit&auml;t (Wochenende) stehen nicht darauf; freie Arbeitstage schon — ' +
    'die sind eine Aussage.');

  /* --- Maschinen ---
     JEDES Feld ist ein Feld. Der Arbeitsraum stand vorher als Text da -
     und die Entscheidung Nummer eins heisst "messen". Eine App, die
     nach einer Zahl fragt und kein Feld dafuer hat, fragt nicht
     ernsthaft. */
  const mt = el('plMaschinen');
  if(mt){
    const TAGE = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    let h = '<tr><th>Maschine</th><th>Art</th><th>Arbeitsraum (mm)</th>' +
            '<th class="z">min/Tag</th><th class="z">&euro;/h</th>' +
            '<th>Arbeitstage</th><th>l&auml;uft</th><th></th></tr>';
    W.maschinen.forEach((m, i) => {
      const nz = (feld, wert) => '<input type="number" step="1" min="0" data-mr="' + i +
        '" data-feld="' + feld + '" value="' + (+wert || 0) + '" title="' + feld + '">';
      const raum = !m.raum ? '<span class="klein">kein Arbeitsraum</span>'
        : m.art === 'drehen'
          ? '&empty; ' + nz('dmax', m.raum.dmax) + ' &times; ' + nz('laenge', m.raum.laenge)
          : nz('x', m.raum.x) + ' &times; ' + nz('y', m.raum.y) + ' &times; ' + nz('z', m.raum.z);
      const tage = '<div class="wtage">' + [1,2,3,4,5,6,7].map(t =>
        '<label><input type="checkbox" data-mt="' + i + '" data-tag="' + t + '"' +
        ((m.tage || []).indexOf(t) >= 0 ? ' checked' : '') + '>' + TAGE[t] + '</label>').join('') + '</div>';
      h += '<tr' + (m.gepflegt === false ? ' class="ungepflegt"' : '') + '>' +
        '<td><input type="text" data-mn="' + i + '" value="' + wEsc(m.name) + '"></td>' +
        '<td><select data-ma="' + i + '">' + WERKSTATT_ARTEN.map(a =>
          '<option value="' + a + '"' + (a === m.art ? ' selected' : '') + '>' + a + '</option>').join('') +
          '</select></td>' +
        '<td>' + raum + '</td>' +
        '<td class="z"><input type="number" data-mz="' + i + '" value="' + (+m.minuten_je_tag || 0) + '" step="10"></td>' +
        /* LEER heisst "Satz der Gattung" - eine 0 waere etwas anderes
           (umsonst), und ein vorbelegter Gattungssatz saehe aus wie ein
           eigener. Der Platzhalter sagt, was ohne Eintrag gilt. */
        '<td class="z"><input type="number" data-ms="' + i + '" step="1" min="0" ' +
          'value="' + (m.satz != null && isFinite(+m.satz) && +m.satz > 0 ? +m.satz : '') + '" ' +
          'placeholder="' + (maschineSatz(m, S.V).gattung || 60) + '" ' +
          'title="leer = Satz der Gattung aus Blatt 5"></td>' +
        '<td>' + tage + '</td>' +
        '<td><input type="checkbox" data-mk="' + i + '"' + (m.aktiv === false ? '' : ' checked') + '></td>' +
        '<td class="kein-druck"><button class="mini" data-mweg="' + i + '" title="Maschine entfernen">&#x2715;</button>' +
          (m.hinweis ? '<div class="klein">' + wEsc(m.hinweis) + '</div>' : '') + '</td></tr>';
    });
    mt.innerHTML = h;
  }
  wFreiMalen();
  wRegelnMalen();
  wFraesMalen();
  wMaschinenPruefen();
  const un = W.maschinen.filter(m => m.gepflegt === false).length;
  /* Eine Maschine, die nichts zu tun hat, waehrend eine baugleiche
     laeuft, ist der haeufigste Befund einer Kapazitaetstafel - und der
     am leichtesten zu behebende. */
  const leer = W.maschinen.filter(m => {
    const z = ausl.filter(x => x.maschine === m.id);
    return z.length && z.every(x => !x.belegt) &&
           ausl.some(x => x.belegt && W.maschinen.filter(y => y.id === x.maschine)[0] &&
                          W.maschinen.filter(y => y.id === x.maschine)[0].art === m.art);
  });
  htm('plVerteilenHinweis',
    (leer.length ? '<b>' + leer.map(m => wEsc(m.name)).join(', ') + '</b> ' +
      (leer.length === 1 ? 'steht leer' : 'stehen leer') + ', w&auml;hrend eine baugleiche Maschine ' +
      'l&auml;uft. ' : '') +
    '<b>Auf die Maschinen verteilen</b> legt die l&auml;ngsten Auftr&auml;ge zuerst auf die passende ' +
    'Maschine mit der bis dahin wenigsten Arbeit — nur innerhalb derselben Art, und nur wo das Teil ' +
    'hineinpasst. Das ist ein Knopf und keine Automatik: wenn Du ein Teil aus gutem Grund auf einer ' +
    'bestimmten Maschine f&auml;hrst, stell sie danach in der Auftragsmaske zur&uuml;ck.');
  /* Was kostet welche Maschine? Eine Tabelle voller Platzhalter ist
     eine Falle, wenn man nicht sieht, welcher Wert woher kommt. */
  const eigene = W.maschinen.filter(m => maschineSatz(m, S.V).eigen);
  htm('plMaschSaetze', eigene.length
    ? '<b>' + eigene.length + ' von ' + W.maschinen.length + ' Maschinen</b> ' +
      (eigene.length === 1 ? 'hat' : 'haben') + ' einen eigenen Stundensatz: ' + eigene.map(m => wEsc(m.name) + ' ' + wZahl(maschineSatz(m, S.V).satz, 2) +
      ' &euro;/h').join(', ') + '. Die &uuml;brigen rechnen mit dem Satz ihrer Gattung aus Blatt 5. ' +
      '<b>Das Angebot bleibt davon unber&uuml;hrt</b> — es entsteht, bevor die Maschine feststeht. ' +
      'Der Maschinensatz wirkt beim <b>Nachrechnen</b> eines Auftrags: dort steht sie fest.'
    : 'Keine Maschine hat einen eigenen Stundensatz — alle rechnen mit dem Satz ihrer Gattung ' +
      'aus Blatt 5. Trag in der Spalte <b>&euro;/h</b> einen ein, wenn eine Maschine anders ' +
      'kostet; leer lassen hei&szlig;t &bdquo;wie die Gattung&ldquo;.');
  htm('plMaschHinweis', un
    ? '<b>' + un + ' von ' + W.maschinen.length + ' Maschinen tragen Platzhalter.</b> ' +
      'Arbeitsraum, Minuten je Tag und Stundensatz sind gesch&auml;tzt, nicht gemessen — ' +
      'jede Aussage &uuml;ber Kapazit&auml;t und &bdquo;passt auf die Maschine&ldquo; steht darauf. ' +
      'Name und Minuten lassen sich hier &auml;ndern; die Ma&szlig;e geh&ouml;ren gemessen.'
    : 'Alle Maschinen sind gepflegt.');
}

/* ---- Papiere ---------------------------------------------------------
   Es gibt jetzt ZWEI Papiere, und beide liegen als .nur-druck im Blatt.
   Wer eins fuellt und das andere stehen laesst, druckt beide auf einem
   Bogen - ein Fehler, den man erst am Drucker sieht. wPapier leert alle
   und fuellt eins.                                                     */
const W_PAPIERE = ['laufkarte', 'zettel'];
function wPapier(id, html){
  W_PAPIERE.forEach(x => { if(x !== id) htm(x, ''); });
  htm(id, html);
  window.print();
}
const W_WOCHENTAG = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/* Die Maschinen pruefen und das Ergebnis hinschreiben. Eine Maschine
   ohne Arbeitstag oder ohne Namen faellt sonst erst in der Belegung auf -
   und dort als fehlende Kapazitaet, nicht als Eingabefehler.          */
function wMaschinenPruefen(){
  const zeilen = [];
  W.maschinen.forEach(m => {
    maschinePruefen(m, W.maschinen).forEach(f => zeilen.push((m.name || m.id) + ': ' + f));
  });
  const e = el('plMaschFehler');
  if(e){
    e.hidden = !zeilen.length;
    e.innerHTML = zeilen.length
      ? '<b>' + zeilen.length + ' Beanstandung' + (zeilen.length === 1 ? '' : 'en') +
        ' an den Maschinen:</b><ul style="margin:4px 0 0 18px;padding:0">' +
        zeilen.map(x => '<li>' + wEsc(x) + '</li>').join('') + '</ul>'
      : '';
  }
  return zeilen;
}

/* ---- Laufkarte -------------------------------------------------------
   Das Auftragspapier fuer die Werkstatt. Es wird in dieselbe Seite
   gedruckt wie das Angebot (Klasse nur-druck) — kein zweites Fenster,
   kein PDF-Werkzeug.                                                   */
function wLaufkarte(a){
  const min = planMinuten(a);
  const mName = id => { const m = W.maschinen.find(x => x.id === id); return m ? m.name : (id || '—'); };
  const b = W.belegung || wPlanRechnen();
  const p = (b.auftraege || []).find(x => x.nummer === a.nummer && x.teil === a.teil);
  let h = '<h1>Laufkarte</h1>' +
    '<table class="papier"><tr><th>Auftrag</th><td>' + wEsc(a.nummer || '—') + '</td>' +
    '<th>Kunde</th><td>' + wEsc(a.kunde) + '</td></tr>' +
    '<tr><th>Teil</th><td>' + wEsc(a.teil) + '</td><th>Zeichnung</th><td>' + wEsc(a.zeichnungsnr) + '</td></tr>' +
    '<tr><th>Werkstoff</th><td>' + wEsc(a.werkstoff) + '</td><th>St&uuml;ckzahl</th><td>' + wZahl(a.stueck) + '</td></tr>' +
    '<tr><th>Maschinen</th><td>' + min.gaenge.map(g => wEsc(mName(g.maschine))).join(' &rarr; ') +
      '</td><th>Liefertermin</th><td>' + wEsc(a.liefertermin || '—') + '</td></tr></table>';
  /* Das Papier ist der Grund, warum es die Arbeitsgaenge gibt: der Mann an
     der Fraese muss sehen, was vor ihm dran war und wann sein Teil kommt. */
  h += '<h2>Arbeitsg&auml;nge</h2><table class="papier">' +
    '<tr><th>Nr.</th><th>Arbeitsgang</th><th>Maschine</th><th class="z">R&uuml;sten</th>' +
    '<th class="z">' + wZahl(a.stueck) + ' St&uuml;ck</th><th class="z">zusammen</th>' +
    '<th>geplant</th><th class="z">R&uuml;sten ist</th><th class="z">je St&uuml;ck ist</th></tr>';
  const ist = {};
  istGaenge(a).forEach(x => { ist[x.nr] = x; });
  min.gaenge.forEach(g => {
    const gp = (p && p.gaenge) ? p.gaenge.filter(x => x.nr === g.nr)[0] : null;
    h += '<tr><td>' + g.nr + '</td><td>' + wEsc(g.name || '—') + '</td>' +
      '<td>' + wEsc(mName(g.maschine)) + '</td>' +
      '<td class="z">' + wMin(g.ruesten) + '</td>' +
      '<td class="z">' + wMin(g.stueck) + '</td>' +
      '<td class="z">' + wMin(g.minuten) + '</td>' +
      '<td>' + (gp ? (gp.start === gp.ende ? gp.start : gp.start + ' bis ' + gp.ende) : '—') + '</td>' +
      /* Steht schon eine Ist-Zeit da, wird sie gedruckt; sonst bleibt das
         Feld leer zum Eintragen. Ein zweiter Ausdruck derselben Karte ist
         damit auch der Beleg dessen, was gemeldet wurde. */
      (ist[g.nr] && ist[g.nr].istRuest !== null
        ? '<td class="z">' + wZahl(ist[g.nr].istRuest, 1) + ' min</td>'
        : '<td class="leer"></td>') +
      (ist[g.nr] && ist[g.nr].istStueck !== null
        ? '<td class="z">' + wZahl(ist[g.nr].istStueck, 2) + ' min</td>'
        : '<td class="leer"></td>') + '</tr>';
  });
  h += '<tr class="summe"><td colspan="3">zusammen</td>' +
    '<td class="z">' + wMin(min.ruesten) + '</td><td class="z">' + wMin(min.stueck) + '</td>' +
    '<td class="z">' + wMin(min.gesamt) + '</td><td colspan="3"></td></tr></table>';
  if(p && p.spaetester) h += '<p class="klein">Sp&auml;testens beginnen am <b>' + p.spaetester +
    '</b>, damit der Termin h&auml;lt (auf einer freien Maschine gerechnet)' +
    (p.puffer !== null ? ' — ' + (p.puffer < 0 ? '<b>' + Math.abs(p.puffer) + ' Tage zu sp&auml;t dran</b>'
      : p.puffer === 0 ? '<b>heute anfangen</b>' : p.puffer + ' Tage Puffer') : '') + '.</p>';
  if(p) h += '<p class="klein">Geplant: Start ' + p.start + ', fertig ' + p.ende +
    (min.zahl > 1 ? ' (ein Arbeitsgang beginnt fr&uuml;hestens am Tag nach dem letzten Tag des vorigen)' : '') +
    (p.haelt === false ? ' — <b>' + p.verzug + ' Tage nach dem Liefertermin</b>' : '') + '.</p>';
  if(a.bemerkung) h += '<h2>Bemerkung</h2><p>' + wEsc(a.bemerkung) + '</p>';
  const su = istSumme(a);
  h += '<h2>R&uuml;ckmeldung</h2><table class="papier">' +
    '<tr><th>gefertigt</th>' + (su.gefertigt ? '<td>' + wZahl(su.gefertigt) + ' St.</td>' : '<td class="leer"></td>') +
    '<th>Ausschuss</th>' + (su.ausschuss ? '<td>' + wZahl(su.ausschuss) + ' St.</td>' : '<td class="leer"></td>') +
    '<th>Datum</th>' + (a.rueckmeldung.datum ? '<td>' + wEsc(a.rueckmeldung.datum) + '</td>' : '<td class="leer"></td>') +
    '<th>K&uuml;rzel</th><td class="leer"></td></tr></table>';
  if(su.vollstaendig)
    h += '<p class="klein">Zur&uuml;ckgemeldet: <b>' + wMin(su.istGesamt) + '</b> gegen gerechnete <b>' +
      wMin(su.sollGesamt) + '</b> — Faktor <b>' + wZahl(su.faktor, 2) + '</b>.</p>';
  h += '<p class="klein">Die Zeiten stammen aus der Kalkulation dieses Angebots — ' +
    'sie sind gerechnet, nicht an der Maschine gemessen. Was hier zur&uuml;ckgemeldet wird, ' +
    'ist die Grundlage daf&uuml;r, dass die n&auml;chste Rechnung besser wird.</p>';
  wPapier('laufkarte', h);
}

/* ---- Der Zettel fuer die Maschine ------------------------------------
   Die Tafel beantwortet "wie voll ist die Werkstatt". An der Maschine
   steht eine andere Frage: WAS MACHE ICH HEUTE. Neben der Drehbank
   steht kein Bildschirm, also gehoert das auf Papier.                  */
function wZettel(mid, tage){
  const b = W.belegung || wPlanRechnen();
  const z = planZettel(b, W.maschinen, mid, tage, W.frei);
  if(!z){ meldung('Fuer diese Maschine laesst sich kein Zettel bauen.', 'warn'); return; }
  let h = '<h1>' + wEsc(z.name) + '</h1>' +
    '<p class="klein">' + z.von + ' bis ' + z.bis + ' &middot; ' + z.posten +
    ' Arbeitsg&auml;nge &middot; ' + wMin(z.minuten) + ' von ' + wMin(z.kapazitaet) + ' verplant</p>';
  let leer = 0;
  z.tage.forEach(t => {
    /* Tage ohne Kapazitaet gehoeren NICHT auf den Zettel - ein Samstag
       mit "0 min" ist keine Auskunft, sondern Fuellmaterial. Tage MIT
       Kapazitaet und ohne Arbeit schon: die sind frei, und das ist eine
       Aussage. */
    if(!t.kapazitaet) return;
    h += '<h2>' + W_WOCHENTAG[t.wochentag] + ' ' + t.datum +
         ' — ' + wMin(t.belegt) + ' von ' + wMin(t.kapazitaet) +
         (t.frei > 0.5 ? ', <b>' + wMin(t.frei) + ' frei</b>' : '') + '</h2>';
    if(!t.posten.length){ h += '<p class="klein">nichts eingeplant</p>'; leer++; return; }
    h += '<table class="papier"><tr><th>Auftrag</th><th>Teil</th><th>Arbeitsgang</th>' +
         '<th class="z">St.</th><th>Werkstoff</th><th class="z">Zeit</th><th>Termin</th>' +
         '<th>erledigt</th></tr>';
    t.posten.forEach(p => {
      h += '<tr><td>' + wEsc(p.auftrag) + '</td><td>' + wEsc(p.teil) + '</td>' +
        '<td>' + wEsc(p.gangName || ('Gang ' + p.gang)) + '</td>' +
        '<td class="z">' + wZahl(p.stueck) + '</td>' +
        '<td>' + wEsc(p.werkstoff || '—') + '</td>' +
        '<td class="z">' + wMin(p.minuten) + '</td>' +
        '<td>' + wEsc(p.termin || '—') + '</td>' +
        '<td class="leer"></td></tr>';
      if(p.bemerkung)
        h += '<tr><td></td><td colspan="7" class="klein">' + wEsc(p.bemerkung) + '</td></tr>';
    });
    h += '</table>';
  });
  if(leer === z.tage.filter(t => t.kapazitaet).length)
    h += '<p class="klein">In diesem Zeitraum liegt nichts auf dieser Maschine.</p>';
  h += '<p class="klein">Die Zeiten sind die geplanten aus der Kalkulation — gerechnet, nicht ' +
    'an der Maschine gemessen. Was hier in <i>erledigt</i> notiert wird, geh&ouml;rt in die ' +
    'R&uuml;ckmeldung des Auftrags; daraus wird die n&auml;chste Rechnung besser.</p>';
  wPapier('zettel', h);
}

/* ---- Lieferschein ----------------------------------------------------
   Anders als Laufkarte und Zettel geht dieser Schein AUS DEM HAUS.
   Deshalb derselbe Weg wie das Angebot: ein eigenes Fenster mit einem
   vollstaendigen Dokument, nicht ein Bereich im Blatt. So traegt er den
   Firmenkopf und sieht aus wie ein Papier und nicht wie ein
   Bildschirmausdruck.                                                  */
function wLieferschein(a){
  const d = lieferschein(a, (S.V || {}).firma, wHeute());
  if(!d.firmaGepflegt)
    meldung('Der Lieferschein hat keinen Absender: <b>Firma und Ort</b> stehen nicht in den ' +
            'Einstellungen (Blatt 5, Firmendaten). Er wird trotzdem gebaut — aber so gehoert er ' +
            'nicht zum Kunden.', 'warn');
  const dt = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '.' + m[2] + '.' + m[1] : (iso || '');
  };
  const F = d.firma;
  const z = (k, v) => '<tr><td>' + k + '</td><td>' + v + '</td></tr>';
  const h =
'<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Lieferschein ' + wEsc(d.nummer) + '</title>' +
'<style>body{font:12pt/1.45 -apple-system,Segoe UI,Arial,sans-serif;color:#16202a;margin:24mm 18mm}' +
'h1{font-size:18pt;margin:0 0 2mm;color:#1858a0}h2{font-size:12pt;margin:7mm 0 2mm;color:#1858a0}' +
'table{border-collapse:collapse;width:100%;font-size:11pt}td,th{padding:3px 6px;border-bottom:1px solid #dde3ea;text-align:left}' +
'.kopf{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8mm}' +
'.klein{font-size:9.5pt;color:#5a6873}' +
'.mng td:first-child,.mng th:first-child{text-align:right;white-space:nowrap}' +
'.strich{margin-top:16mm;display:flex;gap:12mm}.strich div{flex:1;border-top:1px solid #16202a;padding-top:2mm;font-size:9.5pt}' +
'</style></head><body>' +
'<div class="kopf"><div><b>' + wEsc(F.name || '(Firma in den Einstellungen eintragen)') + '</b><br>' +
  wEsc(F.strasse) + '<br>' + wEsc(F.ort || '(PLZ und Ort fehlen)') +
  (F.telefon ? '<br>Telefon ' + wEsc(F.telefon) : '') + (F.mail ? '<br>' + wEsc(F.mail) : '') + '</div>' +
'<div style="text-align:right" class="klein">Datum ' + dt(d.datum) +
  (d.nummer ? '<br>Lieferschein ' + wEsc(d.nummer) : '') +
  (d.auftrag ? '<br>Auftrag ' + wEsc(d.auftrag) : '') + '</div></div>' +
'<h1>Lieferschein</h1>' +
(d.kunde ? '<p>' + wEsc(d.kunde) + '</p>' : '') +
'<table class="mng"><tr><th>Menge</th><th>Benennung</th><th>Zeichnungsnr.</th><th>Werkstoff</th></tr>' +
'<tr><td>' + wZahl(d.menge) + ' St.</td><td>' + wEsc(d.teil || '—') + '</td>' +
'<td>' + wEsc(d.zeichnungsnr || '—') + '</td><td>' + wEsc(d.werkstoff || '—') + '</td></tr></table>' +
/* Woher die Menge kommt, gehoert auf das Papier - nicht in eine
   Fussnote in der App, die der Kunde nie sieht. */
'<p class="klein">' + (d.ausRueckmeldung
  ? 'Menge laut R&uuml;ckmeldung aus der Fertigung.'
  : '<b>Menge = Auftragsmenge</b> — es liegt noch keine R&uuml;ckmeldung aus der Fertigung vor.') +
(d.vollstaendig ? '' : ' <b>Teillieferung</b>: ' + wZahl(d.rest) + ' St. von ' + wZahl(d.bestellt) + ' stehen noch aus.') +
(d.ausschuss ? ' Ausschuss ' + wZahl(d.ausschuss) + ' St.' : '') + '</p>' +
(d.bemerkung ? '<h2>Bemerkung</h2><p>' + wEsc(d.bemerkung) + '</p>' : '') +
'<p class="klein">Preise siehe Rechnung. Ware bitte bei Empfang pr&uuml;fen.' +
(F.ustid ? ' USt-IdNr. ' + wEsc(F.ustid) + '.' : '') + '</p>' +
'<div class="strich"><div>Datum, Unterschrift Lieferant</div><div>Datum, Unterschrift Empf&auml;nger</div></div>' +
'</body></html>';
  const w = window.open('', '_blank');
  if(!w){ meldung('Das Druckfenster wurde blockiert. Bitte Pop-ups fuer diese Seite erlauben.', 'warn'); return; }
  w.document.write(h); w.document.close();
  setTimeout(() => { try{ w.focus(); w.print(); }catch(e){} }, 350);
}

/* ---- Verdrahtung ------------------------------------------------------ */
function wVerdrahten(){
  wLaden();
  wFilterLaden();
  wFreiLaden();
  wRegelnLaden();

  on('tabAuf', 'click', () => blatt('Auf'));
  on('tabPlan', 'click', () => blatt('Plan'));

  on('aufNeuAusAngebot', 'click', wAusAngebot);
  on('aufNeuLeer', 'click', () => {
    const a = neuerAuftrag(); a.angelegt = wHeute();
    W.auftraege.push(a); wSichern(); wMaskeOeffnen(W.auftraege.length - 1);
  });
  on('aufSichern', 'click', () => {
    const t = JSON.stringify({version:WERKSTATT_VERSION, auftraege:W.auftraege,
                              maschinen:W.maschinen}, null, 1);
    const b = new Blob([t], {type:'application/json'});
    const u = URL.createObjectURL(b), l = document.createElement('a');
    l.href = u; l.download = 'auftraege-' + wHeute() + '.json';
    document.body.appendChild(l); l.click(); l.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  });
  on('aufLaden', 'click', () => { const d = el('aufDatei'); if(d) d.click(); });
  on('aufDatei', 'change', (ev) => {
    const f = ev.target.files && ev.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = () => {
      try{
        const g = JSON.parse(r.result);
        const liste = Array.isArray(g) ? g : (g.auftraege || []);
        const schlecht = liste.map(auftragPruefen).filter(x => x.length);
        if(schlecht.length){
          meldungListe('Die Datei hat ' + schlecht.length + ' unvollstaendige Auftraege — nichts geladen:',
                       schlecht[0], 'warn');
          return;
        }
        W.auftraege = liste;
        if(g.maschinen && g.maschinen.length) W.maschinen = g.maschinen;
        wSichern(); wListeMalen(); wPlanMalen();
        meldung(liste.length + ' Auftraege geladen.', 'info');
      }catch(e){ meldung('Die Datei liess sich nicht lesen: ' + e.message, 'warn'); }
    };
    r.readAsText(f);
    ev.target.value = '';
  });

  /* Liste: Tipp waehlt an, Stift oeffnet */
  const tab = el('aufTab');
  if(tab) tab.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-bearb]');
    if(b){ wMaskeOeffnen(+b.dataset.bearb); return; }
    const z = ev.target.closest('[data-auf]');
    if(z){ W.gewaehlt = +z.dataset.auf; wListeMalen(); }
  });

  on('afOk', 'click', () => {
    const a = wMaskeLesen(); if(!a) return;
    const f = auftragPruefen(a);
    if(f.length){ meldungListe('Der Auftrag ist unvollstaendig:', f, 'warn'); return; }
    wSichern(); wMaskeSchliessen(); wListeMalen(); wPlanMalen();
  });
  on('afAb', 'click', () => { wLaden(); wMaskeSchliessen(); wListeMalen(); });
  on('afWeg', 'click', () => {
    if(W.gewaehlt < 0) return;
    W.auftraege.splice(W.gewaehlt, 1);
    W.gewaehlt = -1; wSichern(); wMaskeSchliessen(); wListeMalen(); wPlanMalen();
  });
  on('afPapier', 'click', () => { const a = wMaskeLesen(); if(a){ wSichern(); wLaufkarte(a); } });
  on('afLieferschein', 'click', () => {
    const a = wMaskeLesen(); if(!a) return;
    wSichern(); wLieferschein(a);
  });

  /* Arbeitsgaenge: jede Aenderung wird sofort gelesen und die Tabelle neu
     gemalt - sonst stimmt der Rest im ersten Gang nicht mehr mit dem
     ueberein, was dasteht. */
  on('afGangVorschlag', 'click', () => {
    const a = W.auftraege[W.gewaehlt]; if(!a) return;
    wMaskeLesen();
    const v = gaengeVorschlagen(a, W.maschinen, S.V);
    if(!v.ok){ meldung(wEsc(v.grund), 'warn'); return; }
    wSichern(); wGaengeMalen(a); wIstMalen(a); wListeMalen(); wPlanMalen();
    /* Die Zahlen NENNEN, und dazu, welche gerechnet und welche geraten
       ist. Ein Vorschlag, der nur Felder fuellt, ist eine Behauptung. */
    meldung('Aufgeteilt: <b>Drehen</b> ' + wZahl(v.ruestDrehen, 1) + ' min r&uuml;sten und ' +
      wZahl(v.stueckDrehen, 2) + ' min je St&uuml;ck, <b>' + wEsc(v.maschineName) + '</b> ' +
      wZahl(v.ruestFraes, 1) + ' min r&uuml;sten und ' + wZahl(v.stueckFraes, 2) +
      ' min je St&uuml;ck. Die Summe ist unver&auml;ndert die Kalkulation. ' +
      'Der R&uuml;stanteil von ' + Math.round(v.anteil.ruest * 100) + ' % folgt der Kalkulation (' +
      v.anteil.ruestHerkunft + '); der St&uuml;ckanteil von ' +
      Math.round(v.anteil.stueck * 100) + ' % ist ' +
      (v.anteil.stueckGepflegt ? 'Dein Wert' : 'eine <b>Annahme</b> — pr&uuml;f sie am Teil ' +
       'und trag sie in Blatt 5 ein') + '. Die Minuten lassen sich hier von Hand nachziehen.',
      v.anteil.stueckGepflegt ? 'info' : 'warn');
  });

  on('afGangPlus', 'click', () => {
    const a = W.auftraege[W.gewaehlt]; if(!a) return;
    wMaskeLesen();
    gangAnhaengen(a, '', '');
    wGaengeMalen(a); wIstMalen(a);
  });
  const gt = el('afGaenge');
  if(gt){
    gt.addEventListener('change', () => {
      const a = W.auftraege[W.gewaehlt]; if(!a) return;
      wGaengeLesen(a); wGaengeMalen(a); wIstMalen(a);
    });
    gt.addEventListener('click', (ev) => {
      const b = ev.target.closest && ev.target.closest('[data-gweg]'); if(!b) return;
      const a = W.auftraege[W.gewaehlt]; if(!a) return;
      wGaengeLesen(a); wIstLesen(a);
      gangEntfernen(a, +b.dataset.gweg);
      wGaengeMalen(a); wIstMalen(a);
    });
  }
  /* Die Faktoren haengen an den Ist-Zeiten - nach jeder Eingabe neu. */
  const it = el('afIst');
  if(it){
    it.addEventListener('change', () => {
      const a = W.auftraege[W.gewaehlt]; if(!a) return;
      wIstLesen(a); wIstMalen(a);
    });
  }
  /* Stueckzahl und Kalkulationszeit aendern die Spalte "gesamt" UND den
     Rest im ersten Gang - beides muss sofort sichtbar werden. */
  ['afStueck', 'afRuest', 'afStueckzeit', 'afPreis'].forEach(id => on(id, 'change', () => {
    const a = W.auftraege[W.gewaehlt]; if(!a) return;
    wMaskeLesen(); wGaengeMalen(a); wIstMalen(a); wGrundlageMalen(a);
  }));

  /* Der Knopf ist die Entscheidung des Bedieners, nicht die der App. */
  on('afNeuRechnen', 'click', () => {
    const a = W.auftraege[W.gewaehlt]; if(!a) return;
    wMaskeLesen();
    const n = W.nachrechnung;
    if(!n){ meldung('Dieser Auftrag laesst sich nicht nachrechnen.', 'warn'); return; }
    n.heute = wHeute();
    auftragUebernehmen(a, n);
    wSichern(); wMaskeOeffnen(W.gewaehlt); wListeMalen(); wPlanMalen();
    meldung('Preis und Zeiten neu &uuml;bernommen: ' + wZahl(n.neu.preis, 2) + ' &euro; statt ' +
            wZahl(n.alt.preis, 2) + ' &euro;. Das Angebot beim Kunden &auml;ndert sich dadurch nicht.',
            'info');
  });
  /* Die Maschinenwahl haengt an der Stueckzahl nicht, wohl aber am Mass -
     nach jeder Eingabe neu anbieten waere Unruhe; es genuegt beim Oeffnen. */

  on('plAb', 'change', wPlanMalen);
  on('plTage', 'change', wPlanMalen);
  /* Umsortieren: der Knopf kennt seinen Auftrag ueber den Platz in der
     Liste, die Planreihenfolge kommt aus der letzten Belegung. */
  const tt2 = el('plTermine');
  if(tt2) tt2.addEventListener('click', (ev) => {
    const auf = ev.target.closest && ev.target.closest('[data-rauf]');
    const ab = ev.target.closest && ev.target.closest('[data-rab]');
    const k = auf || ab; if(!k) return;
    const a = W.auftraege[+(auf ? k.dataset.rauf : k.dataset.rab)];
    if(!a || !W.belegung) return;
    const folge = (W.belegung.auftraege || []).map(x => x.auftrag);
    if(planVerschieben(folge, a, auf ? -1 : 1)){ wSichern(); wPlanMalen(); wListeMalen(); }
  });
  on('plVerteilen', 'click', () => {
    const v = planVerteilen(W.auftraege, W.maschinen, null, W.regeln.wahl);
    wSichern(); wPlanMalen(); wListeMalen();
    if(!v.zahl){ meldung('Die Arbeit liegt schon so gleichm&auml;&szlig;ig, wie diese Regel es hinbekommt — nichts umgelegt.', 'info'); return; }
    /* Was bewegt wurde, gehoert genannt: es ist eine Umplanung, keine
       Kosmetik. Wer ein Teil aus gutem Grund auf einer bestimmten
       Maschine faehrt, muss sehen, dass es weg ist. */
    const zeilen = v.bewegt.slice(0, 12).map(x => {
      const von = W.maschinen.filter(m => m.id === x.von)[0];
      const nach = W.maschinen.filter(m => m.id === x.nach)[0];
      return (x.nummer || x.teil) + (v.bewegt.some(y => y.nummer === x.nummer && y.gang !== x.gang)
              ? ' (Gang ' + x.gang + ')' : '') +
             ': ' + (von ? von.name : x.von) + ' \u2192 ' + (nach ? nach.name : x.nach);
    });
    if(v.bewegt.length > 12) zeilen.push('… und ' + (v.bewegt.length - 12) + ' weitere');
    meldungListe(v.zahl + ' Arbeitsg&auml;nge umgelegt. Jede Maschine l&auml;sst sich in der Auftragsmaske ' +
                 'wieder von Hand &auml;ndern:', zeilen, 'info');
  });
  on('plZettelDruck', 'click', () => {
    const m = (el('plZettelM') || {}).value || '';
    const t = Math.max(1, Math.round(+(el('plZettelTage') || {}).value || 7));
    wPlanRechnen();
    wZettel(m, t);
  });
  on('plRangWeg', 'click', () => {
    planRangLoeschen(W.auftraege);
    wSichern(); wPlanMalen(); wListeMalen();
    meldung('Die Reihenfolge folgt wieder dem Liefertermin.', 'info');
  });
  const mt = el('plMaschinen');
  if(mt) mt.addEventListener('change', (ev) => {
    const t = ev.target, zu = (s) => t.closest && t.closest('[data-' + s + ']');
    const n = zu('mn'), z = zu('mz'), r = zu('mr'), a = zu('ma'), tg = zu('mt'), k = zu('mk');
    const sa = zu('ms');
    let was = false;
    if(n){ W.maschinen[+n.dataset.mn].name = n.value; was = true; }
    if(z){ W.maschinen[+z.dataset.mz].minuten_je_tag = Math.max(0, Math.round(+z.value || 0)); was = true; }
    if(r){
      const m = W.maschinen[+r.dataset.mr];
      if(m && m.raum){
        m.raum[r.dataset.feld] = Math.max(0, Math.round(+r.value || 0));
        /* WER EINE ZAHL EINTRAEGT, hat sie bewusst hingeschrieben. Mehr
           kann die App nicht wissen - und der Platzhalter-Hinweis
           verschwindet sichtbar, das ist die Rueckmeldung. */
        m.gepflegt = true; m.hinweis = '';
      }
      was = true;
    }
    if(a){ maschineArtSetzen(W.maschinen[+a.dataset.ma], a.value); was = true; }
    if(tg){
      const m = W.maschinen[+tg.dataset.mt], tag = +tg.dataset.tag;
      if(m){
        if(!Array.isArray(m.tage)) m.tage = [];
        const p = m.tage.indexOf(tag);
        if(tg.checked && p < 0) m.tage.push(tag);
        if(!tg.checked && p >= 0) m.tage.splice(p, 1);
        m.tage.sort((x, y) => x - y);
      }
      was = true;
    }
    if(sa){
      const m = W.maschinen[+sa.dataset.ms];
      const v = String(sa.value).trim();
      /* Leer LOESCHT den eigenen Satz zurueck auf die Gattung. Eine 0
         waere "umsonst" und ist etwas anderes - deshalb faellt sie auch
         auf die Gattung zurueck, statt still null Euro zu rechnen. */
      m.satz = (v === '' || !isFinite(+v) || +v <= 0) ? null : +v;
      was = true;
    }
    if(k){ W.maschinen[+k.dataset.mk].aktiv = !!k.checked; was = true; }
    if(was){ wMaschinenPruefen(); wSichern(); wPlanMalen(); wListeMalen(); }
  });
  /* Entfernen - aber nicht, wenn Arbeit darauf liegt. */
  if(mt) mt.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-mweg]'); if(!b) return;
    const i = +b.dataset.mweg, m = W.maschinen[i]; if(!m) return;
    const drauf = maschineBelegt(m.id, W.auftraege);
    if(drauf.length){
      meldungListe('<b>' + wEsc(m.name) + '</b> l&auml;sst sich nicht entfernen — auf dieser Maschine ' +
        'liegt Arbeit. Erst die Auftr&auml;ge umstellen (oder <b>Auf die Maschinen verteilen</b>):',
        drauf.slice(0, 10), 'warn');
      return;
    }
    if(W.maschinen.length <= 1){ meldung('Die letzte Maschine laesst sich nicht entfernen.', 'warn'); return; }
    W.maschinen.splice(i, 1);
    wMaschinenPruefen(); wSichern(); wPlanMalen(); wListeMalen();
    meldung('<b>' + wEsc(m.name) + '</b> entfernt.', 'info');
  });
  /* Neue Maschine - die Kennung wird hier vergeben, damit der Kern
     DOM-frei und ohne Uhr bleibt. */
  ['plMaschPlus', 'plMaschPlusF', 'plMaschPlusH'].forEach(id => on(id, 'click', () => {
    const b = el(id); if(!b) return;
    const art = b.dataset.art || 'drehen';
    let nr = W.maschinen.length + 1, kennung;
    do { kennung = art.slice(0, 2) + nr; nr++; }
    while(W.maschinen.some(m => m.id === kennung));
    const m = maschineNeu(art, kennung);
    m.name = art === 'drehen' ? 'Drehmaschine' : art === 'fraesen' ? 'Fraesmaschine' : 'Arbeitsplatz';
    m.hinweis = 'Neu angelegt - Name und Ma&szlig;e eintragen.';
    W.maschinen.push(m);
    wMaschinenPruefen(); wSichern(); wPlanMalen(); wListeMalen();
  }));

  wKartenVerdrahten();

  /* Der Fraesanteil. Wer ihn eintraegt, hat ihn gemessen - mehr kann
     die App nicht wissen, und die Marke faellt sichtbar weg. */
  on('einFraesStueck', 'change', () => {
    const v = +(el('einFraesStueck') || {}).value;
    if(!isFinite(v)){ wFraesMalen(); return; }
    if(!S.V.fraesanteil) S.V.fraesanteil = {};
    S.V.fraesanteil.stueck = Math.min(0.95, Math.max(0, Math.round(v) / 100));
    S.V.fraesanteil.gepflegt = true;
    einSichern();
    wFraesMalen();
    meldung('Fr&auml;santeil an der St&uuml;ckzeit: <b>' + Math.round(v) + ' %</b>. ' +
            'Neue Vorschl&auml;ge rechnen damit; bestehende Auftr&auml;ge bleiben, wie sie sind.', 'info');
  });

  /* Planungsregeln. Beide zeichnen den ganzen Plan neu - sie aendern
     ihn ja. */
  on('plRegelWahl', 'change', () => {
    const v = (el('plRegelWahl') || {}).value || 'last';
    W.regeln.wahl = WERKSTATT_MASCHINENWAHL.indexOf(v) >= 0 ? v : 'last';
    wRegelnSichern(); wPlanMalen();
  });
  on('plUebergabe', 'change', () => {
    const v = +(el('plUebergabe') || {}).value;
    W.regeln.uebergabe = isFinite(v) ? Math.min(30, Math.max(0, Math.round(v))) : 1;
    wRegelnSichern(); wPlanMalen();
  });

  /* Freie Tage: ein Tag oder ein Zeitraum. */
  on('plFreiPlus', 'click', () => {
    const von = (el('plFreiVon') || {}).value || '';
    const bis = (el('plFreiBis') || {}).value || '';
    const wer = (el('plFreiWer') || {}).value || '';
    if(!von){ meldung('Kein Datum eingetragen.', 'warn'); return; }
    const neu = planFreiBereich(von, bis);
    if(!neu.length){ meldung('Das ist kein brauchbarer Zeitraum (hoechstens ein Jahr).', 'warn'); return; }
    const m = wer ? W.maschinen.filter(x => x.id === wer)[0] : null;
    if(wer && !m){ meldung('Diese Maschine gibt es nicht mehr.', 'warn'); return; }
    const liste = m ? (Array.isArray(m.wartung) ? m.wartung : []) : W.frei;
    const vorher = liste.length;
    const gesetzt = planFreiNorm(liste.concat(neu));
    if(m){ m.wartung = gesetzt; wSichern(); } else { W.frei = gesetzt; wFreiSichern(); }
    wPlanMalen();
    const dazu = gesetzt.length - vorher;
    const wo = m ? ' f&uuml;r ' + wEsc(m.name) : '';
    meldung(dazu === neu.length
      ? dazu + (m ? ' Wartungstage' : ' freie Tage') + wo + ' eingetragen.'
      : dazu + ' dazu' + wo + ', ' + (neu.length - dazu) + ' standen schon in der Liste.', 'info');
  });
  const fl = el('plFreiListe');
  if(fl) fl.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-freiweg]'); if(!b) return;
    const d = b.dataset.freiweg, wer = b.dataset.freiwer || '';
    const m = wer ? W.maschinen.filter(x => x.id === wer)[0] : null;
    if(m){ m.wartung = (m.wartung || []).filter(x => x !== d); wSichern(); }
    else { W.frei = W.frei.filter(x => x !== d); wFreiSichern(); }
    wPlanMalen();
  });
  on('plFreiWeg', 'click', () => {
    W.frei = []; wFreiSichern();
    W.maschinen.forEach(m => { m.wartung = []; });
    wSichern(); wPlanMalen();
    meldung('Alle freien Tage und Wartungstage entfernt.', 'info');
  });

  /* Filter: jede Aenderung zeichnet die Liste neu und merkt sich die
     Wahl. Der Text laeuft auf 'input', damit es beim Tippen mitgeht. */
  const fSetz = (was, wert) => {
    W.filter[was] = wert;
    wFilterSichern(); wListeMalen();
  };
  on('aufFStatus', 'change', () => fSetz('status', (el('aufFStatus') || {}).value || 'alle'));
  on('aufFSort', 'change', () => fSetz('sortieren', (el('aufFSort') || {}).value || 'termin'));
  const ft = el('aufFText');
  if(ft) ft.addEventListener('input', () => fSetz('text', ft.value));
  on('aufFWeg', 'click', () => {
    W.filter = {status:'alle', text:'', sortieren:W.filter.sortieren};
    wFilterSichern(); wListeMalen();
  });

  const ab = el('plAb'); if(ab && !ab.value) ab.value = wHeute();
  const tg = el('plTage'); if(tg && !tg.value) tg.value = 60;
  wListeMalen();
}
