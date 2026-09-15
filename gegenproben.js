/* =====================================================================
   gegenproben.js — schlaegt der Pruefstand ueberhaupt an?
   ---------------------------------------------------------------------
   Ein gruener Haken ist nur so viel wert wie sein Gegenbeweis. Dieses
   Skript verfaelscht die gebaute Datei an je EINER Stelle, laesst den
   Pruefstand darauf laufen und erwartet, dass genau der zugehoerige
   Haken rot wird.

     node gegenproben.js

   Die Verfaelschungen laufen auf KOPIEN. Die ausgelieferte Datei wird
   nicht angefasst — die Lehre aus dem Schwesterprojekt, wo eine
   Gegenprobe per "git checkout" einen halben Tag Arbeit verworfen hat.

   ZWEI FALLEN BEIM SCHREIBEN EINER GEGENPROBE, beide in einer Nacht
   mehrfach zugeschlagen:

   1. `erwartet` ist der Text des ROTEN Hakens, nicht des gruenen.
      Bei gleich() unterscheiden sich beide nur im Anhang ("— ist X,
      soll Y"), da faellt es nicht auf. Bei ok()/bad() sind es ZWEI
      VERSCHIEDENE SAETZE, und wer den Erfolgssatz zitiert, wartet
      ewig: die Probe greift, der Haken wird rot, und die Gegenprobe
      meldet trotzdem Fehlschlag.

   2. Ein Haken, der nur bei GLEICHSTAND prueft, prueft nichts. Stehen
      in einem Testfall zwei Maschinen beide auf null, ist das Ergebnis
      mit und ohne Verfaelschung dasselbe - die Probe kann gar nicht
      anschlagen. Der Testfall braucht dann ungleiche Ausgangswerte,
      nicht die Probe eine andere Stelle.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const ORDNER = __dirname;
const QUELLE = path.join(ORDNER, 'werkstatt-pipeline.html');
const TMP = path.join(ORDNER, '.gegenprobe.html');

const faelle = [
  {
    name:'Naht der umlaufenden Flaechen stillgelegt',
    suche:'function fSchleifenVereinen(f, schleifen, per){',
    ersatz:'function fSchleifenVereinen(f, schleifen, per){ return schleifen;',
    erwartet:['Quader mit Bohrung: Volumen', 'Quader mit Bohrung: Oberflaeche']
  },
  {
    name:'Schlusspunkt der Randschleife wieder verworfen',
    suche:"  pts.umlauf = per ? Math.round((pts[pts.length - 1][0] - pts[0][0]) / per) : 0;\n  return pts;",
    ersatz:"  pts.umlauf = per ? Math.round((pts[pts.length - 1][0] - pts[0][0]) / per) : 0;\n  pts.pop();\n  return pts;",
    erwartet:['Quader mit Bohrung: Volumen']
  },
  {
    name:'Orientierungssinn der Flaechen ignoriert',
    suche:'    const sinn = !/\\.F\\./.test(String(a[3] || \'\'));',
    ersatz:'    const sinn = true;',
    /* Ohne den Sinn wird die Bohrungswand fuer einen Zapfen gehalten:
       die Bohrung verschwindet aus der Liste, und die Orientierung
       faellt auf. */
    erwartet:['Quader mit Bohrung: eine Bohrung gefunden', 'Quader mit Bohrung: keine schiefe Orientierung']
  },
  {
    name:'Kennwert des Kegels ohne den Anstieg',
    suche:'      if(!was) return [Math.abs(k) / Math.cos(f.r2), 0, 0];',
    ersatz:'      if(!was) return [Math.abs(k), 0, 0];',
    erwartet:['Kegelmantel  Flaeche = pi*(r0+r1)*Mantellinie']
  },
  {
    name:'Werkstofffaktor roh statt auf die Gruppe bezogen',
    suche:'  const faktor = W ? (W.faktor / basis) : 1;',
    ersatz:'  const faktor = W ? W.faktor : 1;',
    erwartet:['Edelstahl bezieht sich auf 1.4301 (Faktor 1)']
  },
  {
    name:'Mindestauftragswert ausgehebelt',
    suche:'  const gesamt = Math.max(gesamtRoh, mindest);',
    ersatz:'  const gesamt = gesamtRoh;',
    erwartet:['Mindestauftragswert greift nicht']
  },
  {
    name:'Ruestumlage nicht auf die Stueckzahl verteilt',
    suche:"  const ruesten = nimm('ruesten', ruestMin / 60 * ruestSatz / stueck);",
    ersatz:"  const ruesten = nimm('ruesten', ruestMin / 60 * ruestSatz);",
    erwartet:['Ruesten je Stueck', 'Ruestumlage haengt nicht an der Stueckzahl']
  },
  /* --- Drehprofil: je eine Probe pro Fehlversuch aus dem Bau ---------
     Sie stehen einzeln in versuche/drehprofil/LIESMICH.md. Ein Haken auf
     das Ergebnis allein wuerde nicht zeigen, ob die REGEL dahinter noch
     traegt - genau deshalb sind es diese vier und keine anderen. */
  {
    name:'Torus-Querschnittskreise wieder zugelassen (Achsfilter aus)',
    suche:'      if(Math.hypot(q[0], q[1], q[2]) >= DP_ACHS_TOL) return;',
    ersatz:'      if(false) return;',
    erwartet:['Torus: der Rohrradius landet nicht im Profil', 'Querschnittskreise allein ergeben']
  },
  {
    name:'Doppelte Halbzylinder nicht mehr zusammengefasst',
    suche:'    if(gleich) doppelt++; else einfach.push(s);',
    ersatz:'    einfach.push(s);',
    erwartet:['Doppelte Halbflaechen werden zu EINEM Segment']
  },
  {
    name:'Kontur wieder nach z sortiert statt der Kette zu folgen',
    suche:'  let folge = liste.slice();',
    ersatz:'  let folge = liste.slice().sort((a, b) => b.p1.z - a.p1.z);',
    erwartet:['Rohr: Aussenkontur']
  },
  {
    /* Beim schlichten Rohr (vier Elemente) faellt die Mitte-Teilung
       zufaellig mit den Umkehrpunkten zusammen - es bleibt gruen. Erst
       die gestufte Huelse trennt die beiden Regeln; darauf zeigt die
       Probe. Der erste Anlauf erwartete die Rohr-Haken und schlug fehl:
       eine Erwartung daneben, kein Codefehler. */
    name:'Kette stur in der Mitte geteilt statt an den Umkehrpunkten',
    suche:'  const [a, b] = wende;',
    ersatz:'  const [a, b] = [0, Math.floor(n / 2)];',
    erwartet:['Gestufte Huelse: Aussenkontur mit Absatz', 'Gestufte Huelse: Innenkontur']
  },
  {
    /* Genau der erste, gemessene Fehlversuch: ein Schwellwert statt der
       geometrischen Regel. Am duennwandigen Ring wirft er die ganze
       Bohrungswand weg - und sah wie ein Erfolg aus, weil das
       Spanvolumen dabei faellt. */
    name:'Bohrungswand ueber einen Schwellwert statt ueber den Plansprung',
    suche:'  const planNachAussen = (a, b) => Math.abs(a.z - b.z) < DP_TOL && b.x > a.x + DP_TOL;',
    ersatz:'  const planNachAussen = (a, b) => b.x > 33;',
    erwartet:['Mehrstufige duennwandige Bohrung: nur die Stirnflaeche faellt weg']
  },
  {
    /* Der Zustand von vorher: die Ablehnung nannte IMMER den gestuften
       Innenkontur-Fall, auch wenn die Kette schlicht unterbrochen war.
       Am echten Bestand zeigte das bei acht von neun Teilen in die
       falsche Richtung. */
    name:'Ablehnung nennt wieder pauschal die gestufte Innenkontur',
    suche:"          ' Flaechen laufen nicht um die Achse' +",
    ersatz:"          '' +",
    /* Erwartet wird der Text des ROTEN Hakens (die bad-Meldung), nicht
       der des gruenen — der erste Anlauf zitierte die ok-Zeile. */
    erwartet:['der Grund nennt die Querflaechen nicht']
  },
  {
    /* Der Kern des Unterschieds: eine Wartung haelt EINE Maschine an.
       Wird sie ignoriert, laeuft die Maschine durch, als waere nichts. */
    name:'Wartungstage werden nicht beachtet',
    suche:'  if(Array.isArray(m.wartung) && m.wartung.indexOf(s) >= 0) return 0;',
    ersatz:'  if(false) return 0;',
    erwartet:['  in der Wartung null']
  },
  {
    /* Waere die Wartung eine Liste fuer alle, waere sie ein freier Tag -
       und die ganze Unterscheidung waere keine. */
    name:'Wartung sperrt alle Maschinen statt einer',
    suche:'  const frei = e.frei || [];',
    ersatz:'  const frei = (e.frei || []).concat.apply(e.frei || [], (e.maschinen || []).map(x => Array.isArray(x.wartung) ? x.wartung : []));',
    erwartet:['  DAS FRAESTEIL BLEIBT AM MONTAG']
  },
  {
    /* Das Kreuz muss wissen, WESSEN Tag es entfernt - sonst raeumt ein
       Klick auf einen Wartungstag den Feiertag der Werkstatt weg. */
    name:'Das Kreuz der Marke kennt seine Maschine nicht',
    suche:"data-freiwer=\"' + wEsc(wer) + '\" ",
    ersatz:"",
    erwartet:['das Kreuz weiss nicht, wessen Tag es entfernt - es traefe den falschen']
  },
  {
    /* Die Vorschau der Regel-Karte laeuft auf einer KOPIE. Ohne sie
       wuerde schon das Ansehen von Blatt 4 die Maschinen umlegen. */
    name:'Die Regel-Vorschau rechnet auf den echten Auftraegen',
    suche:'      const kopie = JSON.parse(JSON.stringify(W.auftraege));',
    ersatz:'      const kopie = W.auftraege;',
    /* Der Text des ROTEN Hakens - der gruene heisst anders. Die Falle
       steht seit dem Maschinen-Paket im Kopf dieser Datei, und ich bin
       wieder hineingelaufen. */
    erwartet:['die Vorschau rechnet auf den echten Auftraegen - Ansehen wuerde umlegen']
  },
  {
    /* Die zwei Wahlregeln muessen sich UNTERSCHEIDEN. Faellt 'klein' auf
       die Lastrechnung zurueck, ist der Schalter Schein. */
    name:'Die Regel "kleinste passende" rechnet in Wahrheit die Last',
    suche:"    k.forEach(m => { if(gross[m.id] < gross[beste.id]) beste = m; });",
    ersatz:"    k.forEach(m => { if(gross[m.id] > gross[beste.id]) beste = m; });",
    erwartet:['  "klein" bleibt bei der kleinen Maschine']
  },
  {
    /* Ohne Arbeitsraum gilt eine Maschine als die GROESSTE. Waere sie
       "0 gross", zoege 'klein' den Handarbeitsplatz jeder Drehmaschine
       vor - und die Teile lieferten sich selbst aus. */
    name:'Maschine ohne Arbeitsraum gilt als die kleinste',
    suche:'  if(!m || !m.raum) return Infinity;',
    ersatz:'  if(!m || !m.raum) return 0;',
    erwartet:['ohne Arbeitsraum gilt eine Maschine als die groesste']
  },
  {
    /* Der eingestellte Abstand muss ANKOMMEN. Bleibt die feste 1 stehen,
       ist das Feld ohne Wirkung. */
    name:'Der Abstand zwischen zwei Gaengen bleibt fest bei einem Tag',
    suche:'      tag = planPlus(ge, uebergabe);',
    ersatz:'      tag = planPlus(ge, 1);',
    erwartet:['Abstand 0: beide am selben Tag']
  },
  {
    /* Vorwaerts und rueckwaerts muessen DENSELBEN Abstand rechnen -
       sonst ist der Puffer um die Differenz falsch, und der Puffer ist
       die Auskunft, wegen der man auf die Tafel sieht. */
    name:'Die Rueckwaertsrechnung kennt den Abstand nicht',
    suche:'    tag = planPlus(gs, -ueb);',
    ersatz:'    tag = planPlus(gs, -1);',
    erwartet:['der Puffer schrumpft mit dem Abstand um zwei Tage']
  },
  {
    /* DER BEFUND SELBST: wird die Liste nicht durchgereicht, ist die
       ganze Mechanik im Kern vorhanden und von aussen unerreichbar -
       genau der Zustand vor diesem Paket. */
    name:'Freie Tage werden nicht durchgereicht',
    suche:'frei:W.frei, uebergabe:W.regeln.uebergabe });',
    ersatz:'uebergabe:W.regeln.uebergabe });',
    erwartet:['planBelegen bekommt die freien Tage']
  },
  {
    /* Ein Zeitraum ueber ein Jahr ist ein Vertipper und wuerde die Liste
       mit hunderten Eintraegen fluten. */
    name:'Zeitraum ohne Obergrenze',
    suche:'  if((e - a) / 86400000 > 400) return [];',
    ersatz:'  if(false) return [];',
    erwartet:['ueber ein Jahr: abgelehnt']
  },
  {
    /* Ein "morgen" in der Liste saehe aus wie ein gesperrter Tag und
       waere keiner. */
    name:'Unsinn bleibt in der Liste der freien Tage',
    suche:'    if(t === null) return;\n    const s = planText(t);',
    ersatz:'    const s = String(x);',
    erwartet:['doppelt und Unsinn fallen weg']
  },
  {
    /* Beim Wechsel der Art muss der Arbeitsraum die FORM wechseln. Bleibt
       er stehen, misst eine Fraese nach Durchmesser und Laenge - und
       jedes Teil passt oder passt nicht aus dem falschen Grund. */
    name:'Arbeitsraum behaelt beim Artwechsel seine Form',
    suche:"  m.raum = art === 'handarbeit' ? null\n         : art === 'fraesen' ? {x:0, y:0, z:0} : {dmax:0, laenge:0};",
    ersatz:'  m.raum = m.raum;',
    erwartet:['  jetzt drei Wege']
  },
  {
    /* Eine Maschine ohne Arbeitstag hat an jedem Tag null Minuten - der
       Auftrag wandert stumm bis ans Ende des Horizonts. */
    name:'Maschine ohne Arbeitstag wird nicht beanstandet',
    suche:"  if(!Array.isArray(m.tage) || !m.tage.length) f.push('Kein Arbeitstag eingetragen.');",
    ersatz:'  if(false) f.push("x");',
    erwartet:['ohne Arbeitstag: rutscht durch']
  },
  {
    /* Eine Maschine, auf der Arbeit liegt, darf nicht verschwinden. */
    name:'Belegte Maschine meldet sich nicht',
    suche:"    if(auftragGaenge(a).some(g => g.maschine === id)) raus.push(a.nummer || a.teil || '(ohne Nummer)');",
    ersatz:'    if(false) raus.push(a.nummer);',
    erwartet:['die 1000er traegt Arbeit']
  },
  {
    /* Ohne die Grundlage beim Anlegen laeuft die ganze Mechanik ins
       Leere - und zwar unsichtbar: die Maske sagt dann bei JEDEM
       Auftrag, er trage seine Grundlage nicht. */
    name:'Anlegen schreibt die Kalkulationsgrundlage nicht mit',
    suche:'  if(z.ein) a.kalk = kalkGrundlage(z.ein, z.heute);',
    ersatz:'  if(false) a.kalk = kalkGrundlage(z.ein, z.heute);',
    erwartet:['die Grundlage fehlt']
  },
  {
    /* Die Schwelle ist ein Cent. Wer sie weit genug oeffnet, meldet nie
       einen Unterschied - und der geaenderte Stundensatz bliebe
       unsichtbar. */
    name:'Abweichung faellt unter den Tisch',
    suche:'    gleich: Math.abs(neu.preis - alt.preis) < 0.005 &&',
    ersatz:'    gleich: Math.abs(neu.preis - alt.preis) < 1e9 &&',
    erwartet:['doppelter Stundensatz: der Auftrag merkt es']
  },
  {
    /* Nach dem Uebernehmen muessen die Gaenge wieder aufgehen, sonst
       steht ihre Summe gegen die Kalkulation. */
    name:'Uebernehmen gleicht die Arbeitsgaenge nicht aus',
    suche:'  if(Array.isArray(a.gaenge) && a.gaenge.length) gaengeAusgleichen(a);',
    ersatz:'  if(false) gaengeAusgleichen(a);',
    erwartet:['nach dem Uebernehmen weiter gueltig']
  },
  {
    /* Der Platz in der urspruenglichen Liste ist der Anker jeder Zeile.
       Wer stattdessen die Nummer der gefilterten Zeile nimmt, loescht
       nach dem Sortieren den falschen Auftrag. */
    name:'Zeile zeigt auf den gefilterten statt den echten Platz',
    suche:'  const zeilen = L.map((a, platz) => ({a, platz})).filter(x => passt(x.a));',
    ersatz:'  const zeilen = L.filter(passt).map((a, platz) => ({a, platz}));',
    erwartet:['jede Zeile zeigt auf ihren Auftrag in der Liste']
  },
  {
    /* Ein leeres Datum ist kein frueher Termin - sonst stuenden alle
       Auftraege ohne Termin ganz oben. */
    name:'Auftraege ohne Termin stehen vorn',
    suche:"      if(!tp) return 1;\n      if(!tq) return -1;",
    ersatz:"      if(!tp) return -1;\n      if(!tq) return 1;",
    erwartet:['  nach Termin, ohne Termin ans Ende']
  },
  {
    /* Die Sortierung muss stabil sein, sonst springen Zeilen bei jedem
       Neuzeichnen. */
    name:'Sortierung nicht stabil',
    suche:'  zeilen.sort((p, q) => cmp(p, q) || (p.platz - q.platz));',
    ersatz:'  zeilen.sort((p, q) => cmp(p, q) || (q.platz - p.platz));',
    erwartet:['gleicher Termin: Reihenfolge der Liste bleibt']
  },
  {
    /* Eine Menge, die aussieht wie gezaehlt und geraten ist, ist die
       schlimmste Zeile auf einem Lieferschein. */
    name:'Lieferschein gibt die Auftragsmenge als gezaehlt aus',
    suche:'    ausRueckmeldung: gef > 0,',
    ersatz:'    ausRueckmeldung: true,',
    erwartet:['  aber NICHT als gezaehlt ausgegeben']
  },
  {
    /* Ohne Absender ist es kein Lieferschein - und das muss auffallen,
       bevor er beim Kunden liegt. */
    name:'Fehlender Firmenkopf faellt nicht auf',
    suche:'    firmaGepflegt: !!(F.name && F.ort),',
    ersatz:'    firmaGepflegt: true,',
    erwartet:['ohne Firma: nicht gepflegt']
  },
  {
    /* Eine Teillieferung, die wie eine ganze aussieht, faellt erst beim
       Kunden auf. */
    name:'Teillieferung wird als vollstaendig ausgegeben',
    suche:'    vollstaendig: menge >= bestellt,',
    ersatz:'    vollstaendig: true,',
    erwartet:['25 von 40: Teillieferung']
  },
  {
    /* Die Termine zuzuklappen waere das Gegenteil des Zwecks: man macht
       das Blatt auf, UM sie zu sehen. */
    name:'Termine am Handy zugeklappt',
    suche:"const W_ZU_HANDY = ['plKarteAusw', 'plKarteSollIst', 'plKarteZettel', 'plKarteMasch'];",
    ersatz:"const W_ZU_HANDY = ['plKarteTermine', 'plKarteSollIst', 'plKarteZettel', 'plKarteMasch'];",
    erwartet:['am Handy zugeklappt, obwohl es die Hauptfragen sind']
  },
  {
    /* Ohne U+FE0E malt iOS aus dem Dreieck einen blauen Play-Knopf -
       die Lehre aus der Dreh-App, wo genau das passiert ist. */
    name:'Klapp-Pfeil ohne Textdarstellung',
    suche:"  if(p) p.innerHTML = zu ? '&#x25B8;&#xFE0E;' : '&#x25BE;&#xFE0E;';",
    ersatz:"  if(p) p.innerHTML = zu ? '&#x25B8;' : '&#x25BE;';",
    erwartet:['ein Pfeil ohne U+FE0E']
  },
  {
    /* Die Maske zeigt die Stueckzeit gerundet. Schreibt sie den
       gerundeten Wert zurueck, steht das Angebot danach auf einer Zeit,
       die nie gerechnet wurde - und niemand sieht es, weil die Zahl in
       beiden Faellen gleich aussieht. */
    name:'Maske schreibt den gerundeten Wert zurueck',
    suche:"  a.zeiten.stueckzeit = wFeldWert('afStueckzeit', a.zeiten.stueckzeit, 2);",
    ersatz:"  a.zeiten.stueckzeit = z('afStueckzeit');",
    erwartet:['afStueckzeit: ']
  },
  {
    /* Der Zettel darf NICHTS neu rechnen. Rechnet er, ist er eine
       zweite Wahrheit neben der Tafel - und am Ende glaubt man keiner. */
    name:'Zettel rechnet die Minuten selbst statt aus der Belegung',
    suche:'    const belegt = posten.reduce((s, p) => s + p.minuten, 0);\n    const kap = planKapazitaet(m, t, frei);',
    ersatz:'    const belegt = posten.length * 480;\n    const kap = planKapazitaet(m, t, frei);',
    erwartet:['alle Zettel zusammen = die ganze Belegung']
  },
  {
    /* Ohne den Verweis auf den Auftrag steht auf dem Zettel eine
       Auftragsnummer und sonst nichts - unbrauchbar an der Maschine. */
    name:'Bloecke zeigen nicht mehr auf ihren Auftrag',
    suche:'                         ref:a });',
    ersatz:'                         ref:null });',
    erwartet:['der Posten nennt das Teil']
  },
  {
    /* Zwei Papiere auf einem Bogen sieht man erst am Drucker. */
    name:'Papier wird gefuellt, ohne das andere zu leeren',
    suche:"  W_PAPIERE.forEach(x => { if(x !== id) htm(x, ''); });",
    ersatz:"  W_PAPIERE.forEach(x => { if(false) htm(x, ''); });",
    erwartet:['ein Papier koennte mit einem alten zweiten zusammen gedruckt werden']
  },
  {
    /* Ohne die Last ist der Vorschlag wieder "die erste der Liste" -
       genau der Zustand, in dem 36 Auftraege auf einer Maschine lagen
       und zwoelf Termine rissen, waehrend die baugleiche leer stand. */
    name:'Maschinenvorschlag ignoriert die Last',
    suche:'  k.forEach(m => { if((last[m.id] || 0) < (last[beste.id] || 0)) beste = m; });',
    ersatz:'  k.forEach(m => { if(false) beste = m; });',
    erwartet:['mit Liste: die leere Maschine']
  },
  {
    /* Was nicht umgeraeumt wird, muss trotzdem belegen - sonst schiebt
       der Knopf Arbeit auf Maschinen, die in Wahrheit voll sind. */
    name:'Verteilen uebersieht die nicht umraeumbaren Auftraege',
    suche:'      if(last[g.maschine] !== undefined) last[g.maschine] += g.ruestzeit + g.stueckzeit * n;',
    ersatz:'      if(false) last[g.maschine] += g.ruestzeit + g.stueckzeit * n;',
    erwartet:['  aber er belegt: der neue weicht auf die 1500er aus']
  },
  {
    /* Ohne die Artpruefung landete ein Fraesgang auf der Drehbank. */
    name:'Verteilen achtet nicht auf die Maschinenart',
    suche:"      const kand = maschinenFuerAuftrag(a, M, art).filter(x => x.passt);",
    ersatz:"      const kand = maschinenFuerAuftrag(a, M, 'alle').filter(x => x.passt);",
    erwartet:['  jeder Fraesgang auf der Fraese']
  },
  {
    /* Der Grund des Verzugs aus dem PUFFER statt aus dem spaetesten
       Start - genau der Fehler, der im Bild stand: ein von Hand
       zurueckgestellter Auftrag meldete "die Zeit reicht nicht". */
    name:'Grund des Verzugs aus dem Puffer geraten',
    suche:"        ? ((sp && planTag(sp.start) < ab) ? 'zeit' : 'belegung') : null,",
    ersatz:"        ? ((puffer !== null && puffer < 0) ? 'zeit' : 'belegung') : null,",
    erwartet:['  aber der Grund ist die BELEGUNG']
  },
  {
    /* Ohne den Rang im Sortierschluessel ist der Knopf tot: er schreibt
       Zahlen, die niemand liest. */
    name:'Rang zaehlt nicht in der Reihenfolge',
    suche:'    const rp = +p.a.rang || 0, rq = +q.a.rang || 0;\n    if(rp !== rq) return rp - rq;',
    ersatz:'    const rp = 0, rq = 0;\n    if(rp !== rq) return rp - rq;',
    erwartet:['A liegt jetzt vorn']
  },
  {
    /* Ohne das Festschreiben der ganzen Folge haette ein Tausch zwischen
       zwei Auftraegen OHNE Rang keine Wirkung - beide blieben bei 0. */
    name:'Verschieben tauscht, ohne die Folge festzuschreiben',
    suche:'  L.forEach((x, k) => { x.rang = k + 1; });',
    ersatz:'  L.forEach((x, k) => { x.rang = +x.rang || 0; });',
    erwartet:['A liegt jetzt vorn']
  },
  {
    /* Ein halb zurueckgesetzter Rang ist schlimmer als gar keiner: die
       Tafel sagt "Liefertermin" und meint es nicht. */
    name:'Zuruecksetzen laesst Raenge stehen',
    suche:'  (auftraege || []).forEach(a => { a.rang = 0; });',
    ersatz:'  (auftraege || []).forEach(a => { a.rang = +a.rang || 0; });',
    erwartet:['  danach wieder B']
  },
  {
    /* Rueckwaerts muessen die Wochentage genauso gelten wie vorwaerts.
       Ohne sie liegt die Frist zwei Tage zu spaet, und der Puffer sieht
       zwei Tage groesser aus, als er ist. */
    name:'Rueckwaertsrechnung ignoriert die Wochentage',
    suche:'      const kap = planKapazitaet(m, tag, frei);\n      if(kap > 0.0001){\n        if(ge === null) ge = tag;',
    ersatz:'      const kap = (m.minuten_je_tag || 0);\n      if(kap > 0.0001){\n        if(ge === null) ge = tag;',
    erwartet:['  das Wochenende wird uebersprungen']
  },
  {
    /* Die Uebergabe gilt rueckwaerts auch: ohne sie beginnt der vorige
       Gang am selben Tag, an dem der naechste schon laeuft. */
    name:'Uebergabe rueckwaerts abgeschafft',
    suche:'    tag = planPlus(gs, -ueb);',
    ersatz:'    tag = gs;',
    erwartet:['  Drehen davor: Mi bis Do']
  },
  {
    /* Ein erfundener Puffer ist schlimmer als keiner: er sieht aus wie
       eine Auskunft. */
    name:'Puffer auch ohne Liefertermin',
    suche:'    const puffer = sp ? Math.round((planTag(sp.start) - planTag(planText(start))) / 86400000) : null;',
    ersatz:'    const puffer = sp ? Math.round((planTag(sp.start) - planTag(planText(start))) / 86400000) : 0;',
    erwartet:['ohne Termin kein Puffer']
  },
  /* --- Rueckmeldung: je eine Probe pro tragender Regel -----------------
     Die Ist-Zeiten sind die Zahlen, denen man spaeter glauben soll,
     wenn er die Kalkulation nachzieht. Jede dieser fuenf Verfaelschungen
     liefert einen Faktor, der plausibel aussieht und falsch ist. */
  {
    /* Ein halber Zettel ergibt keine Kennzahl. Rechnet die App trotzdem,
       sieht die Zahl aus wie eine aus einem ganzen - und niemand kann
       den Unterschied sehen. */
    name:'Faktor auch aus unvollstaendiger Rueckmeldung',
    suche:'  const f = (i, s) => (voll && s > 0) ? i / s : null;',
    ersatz:'  const f = (i, s) => (s > 0) ? i / s : null;',
    erwartet:['  kein Faktor']
  },
  {
    /* Die Rueckmeldungen haengen an der Gangnummer, und die Nummern
       ruecken beim Entfernen nach. Ohne Nachfuehrung wandert die
       gemessene Zeit auf den falschen Gang oder verschwindet. */
    name:'Gangnummern der Rueckmeldung nicht nachgefuehrt',
    suche:'  const alteNummern = g.map(x => x.nr);',
    ersatz:'  const alteNummern = g.map((x, i) => i + 1);',
    erwartet:['  und seine Rueckmeldung wandert mit']
  },
  {
    /* Angefangene Auftraege in die Kennzahl zu nehmen ist der bequemste
       Weg zu einer Zahl, die nichts bedeutet. */
    name:'Soll-Ist rechnet angefangene Auftraege mit',
    suche:'    if(!su.vollstaendig){',
    ersatz:'    if(false){',
    erwartet:['nur der vollstaendige Auftrag zaehlt']
  },
  {
    /* Eine Rueckmeldung ohne Arbeitsgang steht in keiner Tabelle - sie
       faellt nur der Wache auf. */
    name:'Verwaiste Rueckmeldung wird nicht bemaengelt',
    suche:'        if(nummern.indexOf(+e.nr) < 0)',
    ersatz:'        if(false)',
    erwartet:['verwaiste Rueckmeldung bleibt unbemerkt']
  },
  {
    /* Die Zuordnung ueber die Reihenfolge statt ueber die Nummer trifft
       genau dann daneben, wenn nur ein spaeterer Gang gemeldet ist - und
       dann sitzt die Fraeszeit auf der Drehbank. */
    name:'Rueckmeldung nach Reihenfolge statt nach Gangnummer',
    suche:'    const e = liste.filter(x => x && +x.nr === g.nr)[0] || null;',
    ersatz:'    const e = liste[g.nr - 1] || null;',
    erwartet:['nur Gang 2 gemeldet: Gang 1 bleibt leer']
  },
  /* --- Arbeitsgaenge: je eine Probe pro tragender Regel ---------------
     Die Kette Drehen-Fraesen ist der Teil, den man im fertigen Bild am
     wenigsten pruefen kann: ein Fertigtag sieht richtig aus, egal wie er
     zustande kam. Jede dieser sechs Verfaelschungen erzeugt einen Plan,
     den niemand ansieht - deshalb braucht jede ihren Haken. */
  {
    /* Ohne die Uebergabe laege der zweite Gang am selben Tag wie das Ende
       des ersten: das Teil waere auf zwei Maschinen zugleich, und jeder
       Termin einer Kette waere einen Tag zu frueh versprochen. */
    name:'Uebergabe abgeschafft (naechster Gang am selben Tag)',
    suche:'      tag = planPlus(ge, uebergabe);',
    ersatz:'      tag = ge;',
    erwartet:['  Gang 2 fraest am Donnerstag']
  },
  {
    /* Die eine Regel des ganzen Pakets: Arbeitsgaenge teilen die
       kalkulierte Zeit auf, sie erzeugen keine. Ohne diese Wache waere
       der Preis eine Zahl fuer sich. */
    name:'Summenregel abgeschaltet (Gaenge duerfen Zeit erfinden)',
    suche:'      if(Math.abs(su.ruestzeit - a.zeiten.ruestzeit) > 0.01)',
    ersatz:'      if(false)',
    /* Der ROTE Hakentext, nicht der gruene - beim ersten Anlauf stand hier
       die Erfolgsmeldung, und die Probe galt als fehlgeschlagen, obwohl sie
       gegriffen hatte. */
    erwartet:['Wache schweigt bei falscher Summe']
  },
  {
    /* Der erste Gang IST der Rest. Rechnet ihn niemand nach, stimmt die
       Summe beim ersten Hinueberschieben von Minuten nicht mehr. */
    name:'Ausgleichen rechnet nicht (erster Gang behaelt seine Zeit)',
    suche:'  g[0].ruestzeit = rund(g[0].ruestzeit + ((+z.ruestzeit || 0) - s.ruestzeit));',
    ersatz:'  g[0].ruestzeit = rund(g[0].ruestzeit);',
    erwartet:['Ausgleichen: der erste Gang bekommt den Rest (ruesten)']
  },
  {
    /* Einen Gang entfernen darf keine Minuten verschlucken - sonst ist
       die Summe mit einem Klick kaputt und der Preis still falsch. */
    name:'Entfernter Gang nimmt seine Zeit mit',
    suche:'  g[0].ruestzeit += weg.ruestzeit;',
    ersatz:'  g[0].ruestzeit += 0;',
    erwartet:['  mit der ganzen Ruestzeit']
  },
  {
    /* Ein Auftrag OHNE gaenge ist ein Auftrag MIT einem Gang. Faellt der
       Rueckfall weg, verliert jeder gespeicherte Auftrag von gestern
       seine Maschine - und zwar stumm. */
    name:'Einzelgang-Rueckfall ohne Maschine',
    suche:"  return [{ nr:1, name:'', maschine:String((a && a.maschine) || ''),",
    ersatz:"  return [{ nr:1, name:'', maschine:'',",
    erwartet:['  seine Maschine ist die des Auftrags']
  },
  {
    /* Die Auswertung zaehlte die ganze Zeit auf die erste Maschine - die
       Fraese stand mit 0,0 Stunden da, waehrend die Tafel daneben ihre
       Belegung zeigte. Zwei Tabellen, zwei Aussagen. */
    name:'Auswertung schreibt die Gangzeit nicht der Maschine zu',
    suche:'      m.minuten += g.minuten;',
    ersatz:'      m.minuten += 0;',
    erwartet:['  die Fraesmaschine traegt 180 min']
  },
  {
    /* Der Umsatz ist eine Umlage. Wer ihn jeder Maschine ganz gibt,
       verdoppelt ihn in der Spalte - und die Summe darunter stimmt
       trotzdem, weil sie aus einer anderen Zeile kommt. */
    name:'Umsatz jeder Maschine ganz statt nach Zeitanteil',
    suche:'      if(a.status === \'geliefert\' && min > 0) m.umsatz += (+a.preis || 0) * g.minuten / min;',
    ersatz:'      if(a.status === \'geliefert\' && min > 0) m.umsatz += (+a.preis || 0);',
    erwartet:['  Umsatz nach Zeitanteil auf die Drehmaschine']
  },
  {
    /* Einem Gang ohne Maschine heimlich eine unterzuschieben ist die
       gefaehrlichste Variante: der Auftrag steht vollstaendig in der
       Tafel, mit einem Fertigtag, den die halbe Arbeit nie trifft. */
    name:'Gang ohne Maschine bekommt heimlich die Drehbank',
    suche:'    const ohne = min.gaenge.filter(g => !maschinen.find(x => x.id === g.maschine))[0];',
    ersatz:"    min.gaenge.forEach(g => { if(!maschinen.find(x => x.id === g.maschine)) g.maschine = 'm1000'; });\n    const ohne = null;",
    erwartet:['  auch kein halber Auftrag in der Tafel']
  },
  /* --- Werkstatt: je eine Probe pro tragender Regel ------------------
     Die Belegung ist der Teil, dem man an der Maschine glauben muss.
     Jede dieser sechs Verfaelschungen ist ein Fehler, den man im
     fertigen Bild NICHT sieht - deshalb braucht jede ihren Haken. */
  {
    /* Ohne die Wochentagspruefung liefe die Maschine auch am Sonntag -
       jede Belegung ueber ein Wochenende waere zwei Tage zu optimistisch. */
    name:'Maschine laeuft auch am Wochenende',
    suche:'  if(tage.indexOf(planWochentag(t)) < 0) return 0;',
    ersatz:'  if(false) return 0;',
    erwartet:['Wochenende uebersprungen']
  },
  {
    /* Ein Angebot ist noch kein Auftrag. Ohne den Filter waere jede
       Anfrage sofort Kapazitaet, und die Tafel zeigte eine Last, die
       niemand bestellt hat. */
    name:'Angebote binden Kapazitaet wie Auftraege',
    suche:'  const offen = (e.auftraege || []).filter(a => plant.indexOf(a.status) >= 0);',
    ersatz:'  const offen = (e.auftraege || []).slice();',
    erwartet:['Status "angeboten" bindet keine Kapazitaet']
  },
  {
    /* Der Arbeitsraum ist der Grund, warum es ueberhaupt einzelne
       Maschinen gibt statt der Gattung "drehen". */
    name:'Arbeitsraum wird nicht geprueft (alles passt ueberall)',
    suche:"      else if(a.masse.laenge > m.raum.laenge + 1e-9){ passt = false; grund = 'Laenge ' + a.masse.laenge + ' ueber ' + m.raum.laenge; }",
    ersatz:'      else if(false){ passt = false; }',
    erwartet:['1200 mm passt nicht auf die 1000er']
  },
  {
    /* Ein Auftrag, der stumm aus der Tafel faellt, ist die schlimmste
       Sorte Fehler: man sucht ihn nicht. */
    name:'Auftrag ohne Maschine faellt stumm heraus',
    suche:"      unplanbar.push({ auftrag:a, grund: wo + (ohne.maschine",
    ersatz:"      if(0) unplanbar.push({ auftrag:a, grund: wo + (ohne.maschine",
    erwartet:['  sondern benannt']
  },
  {
    /* Umsatz erst bei geliefert - alles davor ist Hoffnung. */
    name:'Umsatz zaehlt schon beim Auftrag statt bei der Lieferung',
    suche:"    if(a.status === 'geliefert') umsatz += +a.preis || 0;",
    ersatz:"    if(a.status !== 'angeboten') umsatz += +a.preis || 0;",
    erwartet:['Umsatz zaehlt nur Geliefertes']
  },
  {
    /* Termintreue nur aus bewertbaren Auftraegen - sonst zaehlt jeder
       offene Auftrag als puenktlich und die Zahl ist geschoent. */
    name:'Termintreue rechnet auch offene Auftraege als puenktlich',
    suche:"  const bewertbar = liste.filter(a => a.status === 'geliefert' && a.liefertermin &&\n                                      a.rueckmeldung && a.rueckmeldung.datum);",
    ersatz:"  const bewertbar = liste.slice();",
    erwartet:['Termintreue aus zwei bewertbaren']
  },
  {
    name:'Bohrungsboden nicht gesucht (alles gilt als durchgehend)',
    suche:'    g.durch = !boden;',
    ersatz:'    g.durch = true;',
    erwartet:[],   /* der Testkoerper HAT eine durchgehende Bohrung — hier darf nichts umfallen */
    darfGruenBleiben:true
  }
];

const roh = fs.readFileSync(QUELLE, 'utf8');
let gut = 0, schlecht = 0;
faelle.forEach((f, i) => {
  if(roh.indexOf(f.suche) < 0){
    console.log('X ' + (i + 1) + ') ' + f.name + ' — ANKER NICHT GEFUNDEN, Gegenprobe wertlos');
    schlecht++; return;
  }
  fs.writeFileSync(TMP, roh.replace(f.suche, f.ersatz));
  let aus = '';
  try{ aus = execFileSync(process.execPath, [path.join(ORDNER, 'pruefstand.js'), '--datei', TMP], {encoding:'utf8'}); }
  catch(e){ aus = String(e.stdout || '') + String(e.stderr || ''); }
  const rot = (aus.match(/^  X .*/gm) || []).map(z => z.slice(4));
  if(f.darfGruenBleiben){
    if(!rot.length){ console.log('+ ' + (i + 1) + ') ' + f.name + ' — wie erwartet ohne Wirkung auf die Haken'); gut++; }
    else { console.log('X ' + (i + 1) + ') ' + f.name + ' — unerwartet rot: ' + rot.join(' | ')); schlecht++; }
    return;
  }
  const getroffen = f.erwartet.filter(e => rot.some(r => r.indexOf(e) === 0));
  if(getroffen.length === f.erwartet.length && rot.length){
    console.log('+ ' + (i + 1) + ') ' + f.name + ' — ' + rot.length + ' Haken rot, darunter alle erwarteten');
    gut++;
  } else {
    console.log('X ' + (i + 1) + ') ' + f.name + ' — erwartet: ' + f.erwartet.join(' | ') +
      '   rot wurde: ' + (rot.join(' | ') || 'NICHTS'));
    schlecht++;
  }
});
try{ fs.unlinkSync(TMP); }catch(e){}
console.log('\n' + '='.repeat(62));
console.log('Gegenproben in Ordnung: ' + gut + '   fehlgeschlagen: ' + schlecht);
console.log(schlecht ? 'GEGENPROBEN NICHT BESTANDEN' : 'GEGENPROBEN BESTANDEN');
console.log('='.repeat(62));
process.exit(schlecht ? 1 : 0);
