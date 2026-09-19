'use strict';
/* =====================================================================
   werkstatt/22-planung.js — Belegung, Auslastung, Termine
   ---------------------------------------------------------------------
   DOM-frei wie die Kalkulation. Hier wird gerechnet, nicht angezeigt.

   DAS VERFAHREN IST BEWUSST EINFACH: VORWAERTS EINPLANEN.
   Die Auftraege werden nach Liefertermin sortiert (frueh zuerst, ohne
   Termin zuletzt) und der Reihe nach auf ihre Maschine gelegt; jeder
   nimmt sich die naechsten freien Minuten. Kein Optimierer, keine
   Umsortierung, kein Ruecksprung.

   WARUM SO UND NICHT KLUEGER: eine Belegung, die niemand nachrechnen
   kann, ist an der Maschine wertlos. Man muss in einer Zeile sehen
   koennen, warum ein Auftrag am Donnerstag liegt und nicht am Dienstag -
   und das geht nur, wenn die Regel in einem Satz steht.

   DER RANG GEHT VOR DEM LIEFERTERMIN. 0 ist normal, kleiner zieht vor,
   groesser stellt zurueck. Damit bleibt die Regel ein Satz, und die
   Handentscheidung ist als solche sichtbar - die Tafel MARKIERT jeden
   Auftrag mit Rang. Eine stille Umsortierung waere genau das, was der
   Absatz darueber ausschliesst: ein Plan, den niemand nachrechnen kann.

   RUESTEN ZAEHLT EINMAL JE AUFTRAG, nicht je Stueck - so rechnet auch
   die Kalkulation (ruesten = ruestMin / 60 * satz / stueck, also auf die
   Losgroesse umgelegt). Beide Seiten benutzen dieselbe Zahl.

   ARBEITSGAENGE LAUFEN NACHEINANDER, mit einem EINSTELLBAREN Abstand
   (Vorgabe EIN TAG). Ein Auftrag kann mehrere Gaenge haben (drehen, dann
   fraesen); jeder liegt auf seiner Maschine, und ein Gang beginnt
   fruehestens den Abstand nach dem letzten Tag des vorigen.

   WARUM EIN TAG DIE VORGABE IST: das Modell zaehlt Minuten je Tag und
   kennt keine Uhrzeit - "am selben Tag noch umspannen" waere eine
   Auskunft, die es nicht belegen kann. Lieber einen Tag zu vorsichtig als
   einen zu knapp; an der Maschine ist ein zu frueh versprochener Termin
   teurer als ein zu spaeter. Wer in seiner Werkstatt am selben Tag
   weiterfaehrt, stellt 0 ein; wer das Teil zum Haerten gibt, mehr.
   ===================================================================== */

/* ---- Datum: nur was gebraucht wird, ohne Bibliothek -------------------
   Gerechnet wird in UTC, damit die Sommerzeit keine Tage verschiebt -
   ein Kalendertag ist hier eine Zaehleinheit, keine Uhrzeit.          */
function planTag(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if(!m) return null;
  const d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return isFinite(d) ? d : null;
}
function planText(t){
  const d = new Date(t);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') +
         '-' + String(d.getUTCDate()).padStart(2, '0');
}
function planPlus(t, tage){ return t + tage * 86400000; }
/* Wochentag 1 = Montag … 7 = Sonntag (wie die Maschinenfelder tage[]) */
function planWochentag(t){ const w = new Date(t).getUTCDay(); return w === 0 ? 7 : w; }
/* Kalenderwoche nach ISO 8601 - der Montag der Woche als Schluessel
   genuegt und ist unmissverstaendlich; eine KW-Nummer waere ueber den
   Jahreswechsel eine Falle. */
function planWochenanfang(t){ return planPlus(t, -(planWochentag(t) - 1)); }

/* ---- Kalenderwoche fuer die ANZEIGE ----------------------------------
   Die Notiz ueber planWochenanfang bleibt richtig: als SCHLUESSEL taugt
   eine KW-Nummer nicht, ueber den Jahreswechsel gibt es die 1 zweimal.
   Als ANZEIGE ist sie das, worin eine Werkstatt rechnet - "KW 41" sagt
   jeder, "Montag der Woche" niemand. Deshalb traegt sie hier ihr Jahr
   mit, und das Jahr entscheidet der Donnerstag (ISO 8601).           */
function planKw(t){
  const mo = planWochenanfang(t);
  const jahr = new Date(planPlus(mo, 3)).getUTCFullYear();
  const w1 = planWochenanfang(Date.UTC(jahr, 0, 4));
  return {kw: Math.round((mo - w1) / (7 * 86400000)) + 1, jahr};
}

/* ---- Freie Tage ------------------------------------------------------
   DER BEFUND: planKapazitaet kennt die Liste der freien Tage seit dem
   ersten Tag, und der ganze Kern reicht sie durch - 26 Stellen. Die
   OBERFLAECHE hat sie nie uebergeben. Es gab also keinen Weg, einen
   Feiertag einzutragen, und der Plan liess am 3. Oktober arbeiten. Im
   Morgenbericht stand von mir der Satz "wer einen Tag sperren will,
   traegt ihn als freien Tag ein" - fuer etwas, das sich nicht eintragen
   liess.

   KEIN FEIERTAGSKALENDER. Der haengt an Bundesland und Jahr, und eine
   halbe Liste waere schlimmer als keine: sie saehe vollstaendig aus.
   Eingetragen wird von Hand - einzelne Tage und Zeitraeume
   (Betriebsurlaub), und das ist die ehrliche Form.

   DIE TAGE GELTEN FUER ALLE MASCHINEN. Eine einzelne Maschine in der
   Wartung waere etwas anderes und braucht ein eigenes Feld; das steht
   im Bericht, nicht im Code.                                          */
function planFreiBereich(von, bis){
  const a = planTag(von), b = planTag(bis);
  if(a === null) return [];
  const e = (b === null || b < a) ? a : b;
  /* Ein Zeitraum ueber ein Jahr ist ein Vertipper, kein Betriebsurlaub -
     und wuerde die Liste mit hunderten Eintraegen fluten. */
  if((e - a) / 86400000 > 400) return [];
  const raus = [];
  for(let t = a; t <= e; t = planPlus(t, 1)) raus.push(planText(t));
  return raus;
}

/* Sortiert, ohne Doppel, ohne Unsinn. Was nicht wie ein Datum aussieht,
   faellt weg - eine Liste, in der ein "morgen" steht, wirkt sonst, als
   waere der Tag gesperrt, und ist es nicht. */
function planFreiNorm(liste){
  const gesehen = {}, raus = [];
  (liste || []).forEach(x => {
    const t = planTag(x);
    if(t === null) return;
    const s = planText(t);
    if(gesehen[s]) return;
    gesehen[s] = true;
    raus.push(s);
  });
  return raus.sort();
}

/* Wieviele ARBEITSTAGE eine Maschine durch die freien Tage verliert -
   ein Samstag in der Liste kostet nichts, und das soll man sehen,
   bevor man sich wundert. */
function planFreiWirkung(frei, maschinen, von, bis){
  const L = planFreiNorm(frei);
  const a = planTag(von), b = planTag(bis);
  let imFenster = 0, wirksam = 0;
  L.forEach(d => {
    const t = planTag(d);
    if(a !== null && t < a) return;
    if(b !== null && t > b) return;
    imFenster++;
    /* Wirksam ist der Tag, an dem WENIGSTENS EINE Maschine sonst
       gelaufen waere. */
    if((maschinen || []).some(m => m.aktiv !== false &&
        (m.tage || [1,2,3,4,5]).indexOf(planWochentag(t)) >= 0)) wirksam++;
  });
  return { zahl:L.length, imFenster, wirksam, ohneWirkung:imFenster - wirksam };
}

/* ---- Was ein Auftrag die Maschine kostet -----------------------------
   Minuten gesamt = Ruesten (einmal) + Stueckzeit x Stueckzahl, je Gang
   und zusammen. Beim Auftrag mit EINEM Gang kommt dieselbe Zahl heraus wie
   vorher - auftragGaenge liefert dort den Gang aus zeiten/maschine, und
   die Summe ueber eine einelementige Liste ist das Element selbst.     */
function planMinuten(a){
  const n = Math.max(1, Math.round(+a.stueck || 1));
  const gaenge = auftragGaenge(a).map(g => ({
    nr:g.nr, name:g.name, maschine:g.maschine, programm:g.programm || '',
    ruesten:g.ruestzeit, stueck:g.stueckzeit * n,
    minuten:g.ruestzeit + g.stueckzeit * n
  }));
  const ruesten = gaenge.reduce((s, g) => s + g.ruesten, 0);
  const stueck = gaenge.reduce((s, g) => s + g.stueck, 0);
  return { ruesten, stueck, gesamt:ruesten + stueck, gaenge, zahl:gaenge.length };
}

/* ---- Verfuegbare Minuten an einem Tag --------------------------------
   Feiertage kennt die App nicht - sie waeren ein Kalender fuer sich und
   von Bundesland und Jahr abhaengig. Wer einen Tag sperren will, traegt
   ihn in `frei` ein; das ist ehrlicher als eine halbe Feiertagsliste.

   ZWEI ARTEN VON STILLSTAND, und sie sind nicht dasselbe:
     `frei`      gilt fuer die ganze Werkstatt - Feiertag, Betriebsurlaub.
     `m.wartung` gilt fuer GENAU DIESE Maschine - Wartung, Reparatur,
                 Umbau. Die anderen laufen weiter, und genau das soll die
                 Tafel zeigen: die Arbeit dieser Maschine schiebt sich,
                 die der Nachbarin nicht.
   Beide sind Listen von Tagen im selben Format. Eine Maschine ohne
   `wartung` verhaelt sich wie vorher - gespeicherte Maschinenlisten aus
   der Zeit davor laufen unveraendert weiter.                           */
/* ---- Wieviel Mensch ist an einem Tag da? -----------------------------
   Die Wochenzahl wird auf die Arbeitstage verteilt - wer samstags
   faehrt, verteilt auf sechs. 0 heisst "keine Grenze".

   GERUNDET WIRD NICHT: 30 Stunden auf 5 Tage sind 360 Minuten, auf 6
   Tage 300. Eine gerundete Tageszahl summiert sich ueber die Woche auf
   etwas anderes als die Wochenzahl - und dann stimmt genau die Groesse
   nicht mehr, die jemand eingetragen hat.                          */
function planMannMinuten(mannStunden, tageProWoche){
  const w = +mannStunden;
  if(!isFinite(w) || w <= 0) return null;
  const n = Math.max(1, Math.round(+tageProWoche || 5));
  return w * 60 / n;
}

function planKapazitaet(m, t, frei){
  if(!m || !m.aktiv) return 0;
  const tage = m.tage || [1,2,3,4,5];
  if(tage.indexOf(planWochentag(t)) < 0) return 0;
  const s = planText(t);
  if(frei && frei.indexOf(s) >= 0) return 0;
  if(Array.isArray(m.wartung) && m.wartung.indexOf(s) >= 0) return 0;
  return Math.max(0, +m.minuten_je_tag || 0);
}

/* ---- Rueckwaerts: wann muss es spaetestens anfangen? -----------------
   Die Vorwaertsplanung sagt, wann ein Auftrag fertig WIRD. Sie sagt
   nicht, wann er anfangen MUSS. Dafuer laeuft dieselbe Kette rueckwaerts
   vom Liefertermin: der letzte Gang muss am Liefertag fertig sein, der
   vorige einen Tag frueher, und so weiter bis zum ersten.

   OHNE KAPAZITAETSPRUEFUNG UND OHNE MANPOWER-GRENZE, und das ist
   Absicht. Ein spaetester Start
   ist eine FRIST, kein Plan: er sagt, wann es selbst auf einer voellig
   freien Maschine zu spaet waere. Ob die Maschine an diesen Tagen
   wirklich frei ist, beantwortet die Vorwaertsplanung daneben - und die
   Differenz zwischen beiden ist genau der Teil des Verzugs, der an der
   AUSLASTUNG liegt und nicht an der Laenge der Arbeit. Wer beides in
   eine Zahl presst, kann den Unterschied nicht mehr sehen und weiss
   nicht, ob er umplanen oder Ueberstunden fahren muss.

   Die Wochentage gelten rueckwaerts genauso: faellt der Liefertag auf
   einen Samstag, ist der letzte Arbeitstag der Freitag davor.        */
function planSpaetester(a, maschinen, frei, uebergabe){
  /* Derselbe Abstand wie vorwaerts - haette die Rueckwaertsrechnung ihren
     eigenen, waere der Puffer um die Differenz falsch. */
  const ueb = (uebergabe == null || !isFinite(+uebergabe))
    ? 1 : Math.max(0, Math.round(+uebergabe));
  const soll = planTag(a.liefertermin);
  if(soll === null) return null;
  const min = planMinuten(a);
  if(min.gesamt <= 0) return null;
  const liste = maschinen || [];
  const gaenge = [];
  let tag = soll, start = null, ende = null, sicher = 0;
  for(let i = min.gaenge.length - 1; i >= 0; i--){
    const g = min.gaenge[i];
    const m = liste.filter(x => x.id === g.maschine)[0];
    if(!m) return null;
    let rest = g.minuten, gs = null, ge = null;
    while(rest > 0.0001 && sicher < 3650){
      const kap = planKapazitaet(m, tag, frei);
      if(kap > 0.0001){
        if(ge === null) ge = tag;
        gs = tag;
        rest -= Math.min(kap, rest);
      }
      if(rest > 0.0001) tag = planPlus(tag, -1);
      sicher++;
    }
    if(rest > 0.0001) return null;
    gaenge.unshift({ nr:g.nr, name:g.name, maschine:m.id, maschineName:m.name,
                     minuten:g.minuten, start:planText(gs), ende:planText(ge) });
    if(ende === null) ende = ge;
    start = gs;
    /* Uebergabe rueckwaerts: derselbe Abstand wie vorwaerts, nur
       andersherum. */
    tag = planPlus(gs, -ueb);
  }
  return { start:planText(start), ende:planText(ende), gaenge,
           tage:Math.round((planTag(planText(ende)) - planTag(planText(start))) / 86400000) + 1 };
}

/* ---- Die Belegung ----------------------------------------------------
   ein: { auftraege, maschinen, ab (JJJJ-MM-TT), tage (Horizont),
          frei: [Datum], plant: [Status] }
   raus: { bloecke, auftraege, unplanbar, horizont }
   Ein BLOCK ist ein Stueck Arbeit an einem Tag auf einer Maschine -
   laeuft ein Auftrag ueber drei Tage, sind es drei Bloecke. Das ist die
   Form, die die Tafel braucht und aus der sich jede Auswertung ergibt. */
function planBelegen(ein){
  const e = ein || {};
  const maschinen = e.maschinen || [];
  const plant = e.plant || ['beauftragt', 'freigegeben', 'laeuft'];
  const horizont = Math.max(1, Math.round(+e.tage || 60));
  const frei = e.frei || [];
  const ab = planTag(e.ab) || planTag(planText(Date.now()));
  /* Abstand zwischen zwei Arbeitsgaengen, in Tagen. 0 heisst "am selben
     Tag weiter" - eine bewusste Einstellung, keine Vorgabe. */
  const uebergabe = (e.uebergabe == null || !isFinite(+e.uebergabe))
    ? 1 : Math.max(0, Math.round(+e.uebergabe));

  /* Nur was Kapazitaet bindet. Ein Angebot ist noch kein Auftrag; ein
     geliefertes Teil belegt nichts mehr. */
  const offen = (e.auftraege || []).filter(a => plant.indexOf(a.status) >= 0);

  /* Reihenfolge: frueher Liefertermin zuerst, ohne Termin ans Ende.
     Bei gleichem Termin entscheidet die Reihenfolge der Liste - das ist
     nachvollziehbar und in der Tafel sichtbar. */
  const sortiert = offen.map((a, i) => ({a, i})).sort((p, q) => {
    /* Rang zuerst - wer von Hand vorgezogen hat, meint es so. */
    const rp = +p.a.rang || 0, rq = +q.a.rang || 0;
    if(rp !== rq) return rp - rq;
    const tp = planTag(p.a.liefertermin), tq = planTag(q.a.liefertermin);
    if(tp && tq && tp !== tq) return tp - tq;
    if(tp && !tq) return -1;
    if(!tp && tq) return 1;
    return p.i - q.i;
  }).map(x => x.a);

  /* Freier Stand je Maschine: Tag -> schon belegte Minuten */
  const stand = {};
  maschinen.forEach(m => { stand[m.id] = {}; });

  /* MANPOWER: eine Grenze ueber ALLE Maschinen zusammen. Ohne sie
     rechnet die App vier Maschinen mal acht Stunden - in einer
     Ein-Mann-Werkstatt gibt es die nicht, und jeder Termin waere zu
     frueh versprochen. Siehe Kopf des Pakets.
     Was schon verbraucht ist, steht im BELEGUNGSSTAND - ein zweiter
     Zaehler liefe frueher oder spaeter auseinander. */
  const mannStunden = +e.mannStunden;
  const mannAn = isFinite(mannStunden) && mannStunden > 0;
  /* Was an einem Tag schon an MANNZEIT verbraucht ist. Die Zahl steht
     in den Bloecken selbst - ein zweiter Zaehler liefe frueher oder
     spaeter auseinander. */
  const mannStand = {};
  const mannFrei = (m, tag) => {
    if(!mannAn) return Infinity;
    const proTag = planMannMinuten(mannStunden, (m.tage || [1,2,3,4,5]).length);
    if(proTag === null) return Infinity;
    return Math.max(0, proTag - (mannStand[tag] || 0));
  };

  const bloecke = [], ergebnis = [], unplanbar = [];
  /* Der Horizont als DATUM statt als Schrittzaehler: mehrere Gaenge
     hintereinander duerfen zusammen nicht weiter reichen als die eine
     Grenze, die auch in b.bis steht. Beim Einzelgang ist das dieselbe
     Menge Tage wie vorher (ab .. ab+horizont-1). */
  const grenze = planPlus(ab, horizont - 1);
  sortiert.forEach(a => {
    const min = planMinuten(a);
    /* Jeder Arbeitsgang braucht seine Maschine. Fehlt einer, faellt der
       GANZE Auftrag heraus. Ein halb geplanter Auftrag waere die
       gefaehrlichste Auskunft von allen: er stuende mit einem Fertigtag in
       der Tafel, den nur die halbe Arbeit trifft. */
    const ohne = min.gaenge.filter(g => !maschinen.find(x => x.id === g.maschine))[0];
    if(ohne){
      const wo = min.zahl > 1
        ? 'Arbeitsgang ' + ohne.nr + (ohne.name ? ' (' + ohne.name + ')' : '') + ': ' : '';
      unplanbar.push({ auftrag:a, grund: wo + (ohne.maschine
        ? 'Maschine "' + ohne.maschine + '" gibt es nicht'
        : 'keine Maschine gewaehlt') });
      return;
    }
    if(min.gesamt <= 0){
      unplanbar.push({ auftrag:a, grund:'keine Zeit hinterlegt (Ruesten und Stueckzeit sind 0)' });
      return;
    }
    let tag = ab, start = null, ende = null, fehlt = 0;
    const gPlan = [];
    for(let i = 0; i < min.gaenge.length; i++){
      const g = min.gaenge[i];
      const m = maschinen.find(x => x.id === g.maschine);
      /* WIEVIEL MENSCH STECKT IN EINER MINUTE DIESES GANGS?
         Ruesten voll, Stueckzeit anteilig - gemittelt ueber den ganzen
         Gang, weil die Belegung nur Minuten kennt und nicht weiss,
         welche davon Ruesten war. Bei einem Gang aus reiner Ruestzeit
         ist der Faktor 1, bei reiner Laufzeit der Maschinenanteil. */
      const mAnteil = maschineMannAnteil(m);
      const mFaktor = g.minuten > 0
        ? ((g.ruesten || 0) + (g.stueck || 0) * mAnteil) / g.minuten
        : 1;
      let rest = g.minuten, gs = null, ge = null;
      while(rest > 0.0001 && tag <= grenze){
        const kap = planKapazitaet(m, tag, frei);
        const belegt = stand[m.id][tag] || 0;
        /* Das KLEINERE aus "was die Maschine koennte" und "was von der
           Manpower noch uebrig ist". Legt ein anderer Auftrag die
           Person heute schon auf eine andere Maschine, bleibt hier
           weniger - genau das ist der Punkt.
           UMGERECHNET: die freie MANNzeit reicht fuer mehr
           Maschinenminuten, wenn die Maschine einen Teil allein laeuft.
           Bei mFaktor 0 (laeuft ganz allein) bremst sie gar nicht. */
        const mFrei = mannFrei(m, tag);
        const maschAusMann = mFaktor > 0 ? mFrei / mFaktor : Infinity;
        const frei_min = Math.min(kap - belegt, maschAusMann);
        if(frei_min > 0.0001){
          const nimm = Math.min(frei_min, rest);
          stand[m.id][tag] = belegt + nimm;
          mannStand[tag] = (mannStand[tag] || 0) + nimm * mFaktor;
          bloecke.push({ maschine:m.id, tag, datum:planText(tag), minuten:nimm,
                         /* Wieviel davon DEINE Zeit war - die Uebersicht
                            summiert diese Zahl, statt neu zu rechnen. */
                         mann:nimm * mFaktor,
                         auftrag:a.nummer || a.teil, kunde:a.kunde, status:a.status,
                         gang:g.nr, gangName:g.name, programm:g.programm || '',
                         /* Zeigt auf seinen Auftrag: der Maschinenzettel
                            braucht Teil, Stueckzahl und Termin, und die
                            stehen nicht im Block. Ueber Nummer zu suchen
                            waere eine Falle, sobald zwei Auftraege sie
                            teilen. */
                         ref:a });
          if(gs === null) gs = tag;
          ge = tag;
          rest -= nimm;
        }
        tag = planPlus(tag, 1);
      }
      if(rest > 0.0001){ fehlt = rest; break; }
      gPlan.push({ nr:g.nr, name:g.name, maschine:m.id, maschineName:m.name,
                   minuten:g.minuten, ruesten:g.ruesten, stueck:g.stueck,
                   start:planText(gs), ende:planText(ge) });
      if(start === null) start = gs;
      ende = ge;
      /* UEBERGABE: der naechste Gang fruehestens nach dem eingestellten
         Abstand. Bei 0 geht es am selben Tag weiter - dann steht dasselbe
         Teil an einem Tag auf zwei Maschinen, und das ist eine
         Entscheidung, nicht meine. */
      tag = planPlus(ge, uebergabe);
    }
    if(fehlt > 0.0001){
      unplanbar.push({ auftrag:a, grund:'passt nicht in den Horizont von ' + horizont +
        ' Tagen - es fehlen noch ' + Math.round(fehlt) + ' Minuten' });
      /* Was bis hierher belegt wurde, BLEIBT belegt: die Maschine ist an
         diesen Tagen wirklich besetzt. Sie wieder freizugeben hiesse, den
         naechsten Auftrag auf Zeit zu setzen, die schon vergeben ist. */
      return;
    }
    const soll = planTag(a.liefertermin);
    /* Der PUFFER ist die eigentliche Auskunft: wieviele Arbeitstage
       liegen zwischen dem Tag, an dem die Planung anfaengt, und dem Tag,
       an dem es spaetestens losgehen muss. Negativ heisst: der Termin
       ist schon jetzt nicht mehr zu halten, auch nicht mit einer leeren
       Maschine. */
    const sp = planSpaetester(a, maschinen, frei, uebergabe);
    const puffer = sp ? Math.round((planTag(sp.start) - planTag(planText(start))) / 86400000) : null;
    ergebnis.push({
      /* Die Zeile zeigt auf ihren Auftrag. Ueber Nummer und Teil zu
         suchen waere eine Falle, sobald zwei Auftraege beides teilen. */
      auftrag:a, rang:+a.rang || 0,
      spaetester: sp ? sp.start : null,
      spaetesterEnde: sp ? sp.ende : null,
      puffer,
      nummer:a.nummer, teil:a.teil, kunde:a.kunde,
      /* maschine = die des ERSTEN Gangs (daran haengen Liste und
         Auswertung); der Name nennt die ganze Kette. */
      maschine:gPlan[0].maschine,
      maschineName:gPlan.map(g => g.maschineName).join(' \u2192 '),
      gaenge:gPlan,
      status:a.status, stueck:a.stueck, minuten:min,
      start:planText(start), ende:planText(ende),
      liefertermin:a.liefertermin,
      /* Der Termin haelt, wenn die Maschine VOR dem Liefertag fertig ist.
         Gleicher Tag zaehlt als knapp gehalten - an dem Tag muss noch
         geprueft und verpackt werden. */
      /* WARUM zu spaet? Die Antwort entsteht aus BEIDEN Rechnungen und
         aus keiner allein:
           'zeit'      - der spaeteste Start liegt vor dem Planungsbeginn.
                         Die Arbeit ist laenger als die Zeit bis zum
                         Termin; da hilft keine Reihenfolge.
           'belegung'  - er liegt danach. Allein waere es zu schaffen,
                         die Maschine ist nur besetzt. Da hilft
                         Umsortieren.
         DER PUFFER TAUGT DAFUER NICHT. Er misst den Abstand zu dem
         Start, den die Belegung gerade vorgibt - und der ist selbst
         schon das Ergebnis der Auslastung. Genau daran ist die erste
         Fassung gescheitert: sie meldete "die Zeit reicht nicht" bei
         einem Auftrag, der nur von Hand zurueckgestellt worden war. */
      grundVerzug: (soll && planTag(planText(ende)) > soll)
        ? ((sp && planTag(sp.start) < ab) ? 'zeit' : 'belegung') : null,
      haelt: soll ? (planTag(planText(ende)) <= soll) : null,
      knapp: soll ? (planTag(planText(ende)) === soll) : false,
      verzug: soll ? Math.max(0, Math.round((planTag(planText(ende)) - soll) / 86400000)) : 0
    });
  });

  return { bloecke, auftraege:ergebnis, unplanbar,
           /* Womit gerechnet wurde, gehoert ins Ergebnis - sonst steht
              eine Terminkette da, deren Grundlage niemand sieht. */
           mannStunden: mannAn ? mannStunden : null,
           horizont, ab:planText(ab), bis:planText(planPlus(ab, horizont - 1)) };
}

/* ---- Wann waere es fertig? -------------------------------------------
   Die zweite Frage jedes Kunden nach dem Preis - und die App konnte sie
   nicht beantworten. Sie kann es: der Probeauftrag wird HINTEN an die
   vorhandene Arbeit gestellt (ohne Rang und ohne Liefertermin sortiert
   planBelegen ihn selbst ans Ende) und die Werkstatt einmal belegt.
   Herauskommt derselbe Plan wie auf der Tafel, nur mit einem Auftrag
   mehr - keine zweite Rechnung, keine zweite Wahrheit.

   ZWEI DINGE, DIE ES AUSDRUECKLICH NICHT IST, und beide gehoeren in die
   Anzeige:
     KEINE ZUSAGE. Es ist der Stand von heute mit den heute offenen
       Auftraegen. Ein Eilauftrag von morgen schiebt es nach hinten.
     KEIN VERSANDTAG. Zwischen "Maschine fertig" und "beim Kunden"
       liegen Pruefen, Verpacken und der Weg. Dafuer ist der Zuschlag da,
       und er zaehlt in ARBEITSTAGEN - zwei freie Tage am Stueck sind
       keine zwei Tage Arbeit.                                        */
function planLieferbar(ein){
  const e = ein || {};
  if(!e.probe) return null;
  const maschinen = e.maschinen || [];
  const frei = e.frei || [];
  const ab = planTag(e.ab) || planTag(planText(Date.now()));
  /* Weiter Horizont als die Tafel: wer eine Lieferzeit nennt, fragt
     nach Wochen, nicht nach den naechsten zehn Tagen. */
  const tage = Math.max(7, Math.round(+e.tage || 180));
  const zuschlag = Math.max(0, Math.round(+e.zuschlag || 0));

  /* Die Probe ist eine KOPIE - die Kalkulation soll von der Frage nichts
     merken. Der Status muss ein PLANENDER sein: ein Angebot bindet keine
     Kapazitaet, und die Antwort waere "sofort fertig". */
  const probe = JSON.parse(JSON.stringify(e.probe));
  probe.status = 'beauftragt';
  probe.rang = 0;
  probe.liefertermin = '';

  /* Jedes Feld ausgeschrieben, auch wo die Kurzform ginge: die Wache
     in Pruefabschnitt 28 sucht frei: in JEDEM Planungsaufruf, und sie
     soll streng bleiben. Sie hat diesen Aufruf beim ersten Lauf
     angezeigt - genau ihre Aufgabe. */
  const b = planBelegen({auftraege:(e.auftraege || []).concat([probe]),
                         maschinen:maschinen, ab:planText(ab), tage:tage,
                         frei:frei, uebergabe:e.uebergabe,
                         mannStunden:e.mannStunden});
  const z = b.auftraege.filter(x => x.auftrag === probe)[0];
  if(!z){
    /* Kein Termin ist auch eine Auskunft - aber nur mit dem Grund. */
    const un = (b.unplanbar || []).filter(u => (u.auftrag === probe) ||
                                               (u.nummer === probe.nummer && u.teil === probe.teil))[0];
    return {termin:null, fertig:null, belegung:b, horizont:b.bis,
            grund: un ? (un.grund || 'unplanbar') : 'horizont'};
  }

  /* Der Zuschlag laeuft ueber ARBEITSTAGE: ein Tag, an dem keine
     Maschine laeuft, ist keiner. Die Grenze von 60 Versuchen ist eine
     Notbremse fuer den Fall, dass gar keine Maschine aktiv ist - sonst
     liefe die Schleife ewig. */
  let t = planTag(z.ende), gezaehlt = 0, versuche = 0;
  while(gezaehlt < zuschlag && versuche < 60){
    t = planPlus(t, 1); versuche++;
    if(maschinen.some(m => planKapazitaet(m, t, frei) > 0)) gezaehlt++;
  }
  const w = planKw(t);
  return {
    /* Der Vorschlag - Maschine fertig PLUS Zuschlag. */
    termin: planText(t),
    /* Und was davon die Maschine ist: wer den Zuschlag aendert, sieht
       sofort, worauf er sich legt. */
    fertig: z.ende,
    start: z.start,
    zuschlag,
    kw: w.kw, kwJahr: w.jahr,
    /* Kalendertage ab dem Planungsbeginn - das ist die Zahl, die im
       Angebot als "rund X Wochen" steht. */
    tage: Math.round((planTag(planText(t)) - ab) / 86400000) + 1,
    maschine: z.maschineName,
    minuten: z.minuten ? z.minuten.gesamt : 0,
    /* WORAUF ES BERUHT - ohne diese Zahlen ist der Termin eine
       Behauptung. */
    davor: b.auftraege.length - 1,
    mannStunden: b.mannStunden,
    belegung: b
  };
}

/* ---- Reihenfolge von Hand -------------------------------------------
   Die Tafel sagt jetzt, WARUM ein Auftrag zu spaet liegt - "die Maschine
   ist belegt, allein waere es zu schaffen". Der naechste Griff darauf
   ist, zwei Auftraege zu tauschen.

   ZUERST WIRD DIE GANZE SICHTBARE FOLGE FESTGESCHRIEBEN, dann getauscht.
   Ohne das Festschreiben haette ein Tausch zwischen zwei Auftraegen OHNE
   Rang gar keine Wirkung: beide behielten Rang 0, und der Liefertermin
   zoege sie im naechsten Lauf sofort wieder auseinander. Der Knopf waere
   tot, und man saehe nicht warum.

   Die Folge ist danach vollstaendig von Hand gesetzt - das ist ehrlich
   so, und die Tafel sagt es. planRangLoeschen stellt den Liefertermin
   wieder her.                                                          */
function planVerschieben(reihenfolge, auftrag, richtung){
  const L = reihenfolge || [];
  const i = L.indexOf(auftrag);
  if(i < 0) return false;
  const j = i + (richtung < 0 ? -1 : 1);
  if(j < 0 || j >= L.length) return false;
  L.forEach((x, k) => { x.rang = k + 1; });
  const t = L[i].rang;
  L[i].rang = L[j].rang;
  L[j].rang = t;
  return true;
}

function planRangLoeschen(auftraege){
  (auftraege || []).forEach(a => { a.rang = 0; });
}

/* ---- Die Arbeit auf baugleiche Maschinen verteilen -------------------
   Der Durchstich ueber den echten Bestand zeigte 36 Auftraege auf
   der 1000er und null auf der baugleichen 1500er. Fuer BESTEHENDE
   Auftraege hilft der neue Vorschlag nicht - ihre Maschine steht schon
   drin. Dieser Knopf raeumt sie um.

   DIE REGEL IST EIN SATZ: die laengsten Auftraege zuerst, jeder
   Arbeitsgang auf die passende Maschine mit der bis dahin wenigsten
   Arbeit. Das ist die klassische Greedy-Regel; sie ist nicht optimal und
   soll es nicht sein - sie ist nachrechenbar, und das zaehlt an der
   Maschine mehr.

   VERSCHOBEN WIRD NUR INNERHALB DERSELBEN ART. Ein Drehgang bleibt auf
   einer Drehmaschine; dass ein Teil statt auf der 1000er auf der 1500er
   laeuft, ist eine Umplanung, dass es statt gedreht gefraest wird, waere
   eine andere Fertigung. Und nur Maschinen, in die das Teil PASST -
   der Arbeitsraum gilt weiter.

   WAS SCHON LAEUFT, WIRD NICHT UMGELEGT. "Laeuft" heisst, dass das Teil
   eingespannt ist und die Spaene fliegen - so einen Auftrag auf eine
   andere Maschine zu schreiben ist keine Umplanung, sondern eine
   Falschmeldung. Er belegt weiter, er wandert nur nicht mehr. Umraeumbar
   sind deshalb nur "beauftragt" und "freigegeben" - eine ANDERE Liste
   als die der Belegung, und das ist der Grund.

   ES IST EIN KNOPF, KEINE AUTOMATIK. Es kann Gruende geben, ein Teil
   auf einer bestimmten Maschine zu fahren (Spannmittel, Werkzeuge, ein
   eingefahrenes Programm). Die App schlaegt vor und sagt, was sie
   bewegt hat; jede Maschine laesst sich danach von Hand wieder
   aendern.                                                             */
function planVerteilen(auftraege, maschinen, umlegbar, regel){
  const zaehlt = umlegbar || ['beauftragt', 'freigegeben'];
  const M = maschinen || [];
  const artVon = {};
  M.forEach(m => { artVon[m.id] = m.art; });
  const last = {};
  M.forEach(m => { last[m.id] = 0; });

  /* Was NICHT umgeraeumt wird, belegt trotzdem - sonst schoebe der Knopf
     die Arbeit auf Maschinen, die in Wahrheit voll sind. Das betrifft
     vor allem die LAUFENDEN Auftraege: sie sind der Grund, warum eine
     Maschine heute keine Zeit hat. */
  const offen = [], fest = [];
  (auftraege || []).forEach(a => {
    (zaehlt.indexOf(a.status) >= 0 ? offen : fest).push(a);
  });
  fest.forEach(a => {
    const n = Math.max(1, Math.round(+a.stueck || 1));
    auftragGaenge(a).forEach(g => {
      if(last[g.maschine] !== undefined) last[g.maschine] += g.ruestzeit + g.stueckzeit * n;
    });
  });

  const bewegt = [];
  offen.slice().sort((p, q) => planMinuten(q).gesamt - planMinuten(p).gesamt).forEach(a => {
    const n = Math.max(1, Math.round(+a.stueck || 1));
    gaengeMaterialisieren(a);
    a.gaenge.forEach(g => {
      const art = artVon[g.maschine];
      const min = g.ruestzeit + g.stueckzeit * n;
      if(!art){ /* keine oder unbekannte Maschine - nichts zu verteilen */ return; }
      const kand = maschinenFuerAuftrag(a, M, art).filter(x => x.passt);
      if(!kand.length){ last[g.maschine] = (last[g.maschine] || 0) + min; return; }
      let beste = kand.filter(x => x.id === g.maschine)[0] || kand[0];
      if(regel === 'klein'){
        /* Dieselbe Regel wie beim Vorschlag: die kleinste passende. Zwei
           verschiedene Regeln fuer denselben Zweck waeren nicht zu
           erklaeren. */
        const gross = {};
        M.forEach(x => { gross[x.id] = maschineGroesse(x); });
        kand.forEach(x => { if(gross[x.id] < gross[beste.id]) beste = x; });
      } else {
        kand.forEach(x => { if((last[x.id] || 0) < (last[beste.id] || 0)) beste = x; });
      }
      if(beste.id !== g.maschine){
        bewegt.push({ nummer:a.nummer, teil:a.teil, gang:g.nr,
                      von:g.maschine, nach:beste.id, minuten:min });
        g.maschine = beste.id;
      }
      last[beste.id] = (last[beste.id] || 0) + min;
    });
    a.maschine = a.gaenge[0].maschine;
  });
  return { bewegt, zahl:bewegt.length, last };
}

/* ---- Auslastung je Maschine und Woche --------------------------------
   Grundlage ist die KAPAZITAET der Woche, nicht die Zahl der Tage: eine
   Maschine, die nur montags laeuft, ist mit einem vollen Montag zu
   100 % ausgelastet und nicht zu 20 %.                                 */
function planAuslastung(belegung, maschinen, frei){
  const b = belegung || {};
  const wochen = {};
  const anf = planTag(b.ab), end = planTag(b.bis);
  if(anf === null || end === null) return [];

  /* Erst die Kapazitaet jeder Woche aufbauen, dann die Belegung
     hineinlegen - sonst fehlen die leeren Wochen in der Tafel, und eine
     Tafel mit Loechern liest sich wie ein Fehler. */
  (maschinen || []).forEach(m => {
    for(let t = anf; t <= end; t = planPlus(t, 1)){
      const w = planWochenanfang(t), s = m.id + '|' + planText(w);
      if(!wochen[s]) wochen[s] = { maschine:m.id, maschineName:m.name, woche:planText(w),
                                   kapazitaet:0, belegt:0, auftraege:{} };
      wochen[s].kapazitaet += planKapazitaet(m, t, frei);
    }
  });
  (b.bloecke || []).forEach(k => {
    const s = k.maschine + '|' + planText(planWochenanfang(k.tag));
    if(!wochen[s]) return;
    wochen[s].belegt += k.minuten;
    /* Der Schluessel ist der AUFTRAG, nicht der Gang: in der Tafel steht,
       wieviele Auftraege eine Maschine in der Woche beruehren. Zwei Gaenge
       desselben Auftrags auf derselben Maschine sind ein Auftrag. */
    wochen[s].auftraege[k.auftrag] = (wochen[s].auftraege[k.auftrag] || 0) + k.minuten;
  });

  return Object.keys(wochen).map(s => {
    const w = wochen[s];
    w.anteil = w.kapazitaet > 0 ? w.belegt / w.kapazitaet : 0;
    w.frei = Math.max(0, w.kapazitaet - w.belegt);
    w.zahl = Object.keys(w.auftraege).length;
    return w;
  }).sort((p, q) => p.woche < q.woche ? -1 : p.woche > q.woche ? 1 :
                    (p.maschine < q.maschine ? -1 : 1));
}

/* ---- Der Zettel fuer die Maschine ------------------------------------
   Die Tafel beantwortet "wie voll ist die Werkstatt". An der Maschine
   steht eine andere Frage: WAS MACHE ICH HEUTE. Dafuer hilft keine
   Wochenprozentzahl, sondern eine Liste je Tag - und zwar auf Papier,
   weil neben der Drehbank kein Bildschirm steht.

   Der Zettel rechnet NICHTS NEU. Er sortiert die Bloecke, die schon in
   der Belegung stehen, nach Tag und Maschine. Eine zweite Rechnung waere
   eine zweite Wahrheit; der Zettel muss dasselbe sagen wie die Tafel,
   sonst glaubt man am Ende keinem von beiden.                         */
function planZettel(belegung, maschinen, maschineId, tage, frei){
  const b = belegung || {};
  const m = (maschinen || []).filter(x => x.id === maschineId)[0];
  const anf = planTag(b.ab);
  if(!m || anf === null) return null;
  const n = Math.max(1, Math.round(+tage || 7));
  const raus = [];
  for(let i = 0; i < n; i++){
    const t = planPlus(anf, i);
    const posten = (b.bloecke || [])
      .filter(k => k.maschine === maschineId && k.tag === t)
      .map(k => {
        const a = k.ref || {};
        return { auftrag:k.auftrag, kunde:k.kunde, status:k.status,
                 teil:a.teil || '', stueck:+a.stueck || 0,
                 werkstoff:a.werkstoff || '', zeichnungsnr:a.zeichnungsnr || '',
                 termin:a.liefertermin || '', bemerkung:a.bemerkung || '',
                 gang:k.gang, gangName:k.gangName || '', programm:k.programm || '', minuten:k.minuten };
      });
    const belegt = posten.reduce((s, p) => s + p.minuten, 0);
    const kap = planKapazitaet(m, t, frei);
    raus.push({ tag:t, datum:planText(t), wochentag:planWochentag(t),
                kapazitaet:kap, belegt, frei:Math.max(0, kap - belegt), posten });
  }
  return { maschine:m.id, name:m.name,
           von:planText(anf), bis:planText(planPlus(anf, n - 1)),
           tage:raus,
           minuten:raus.reduce((s, x) => s + x.belegt, 0),
           kapazitaet:raus.reduce((s, x) => s + x.kapazitaet, 0),
           posten:raus.reduce((s, x) => s + x.posten.length, 0) };
}

/* ---- Auswertung ------------------------------------------------------
   Aus denselben Daten, keine zweite Buchhaltung. `bis` begrenzt den
   Zeitraum (leer = alles).                                             */
/* Liegt ein Auftrag im Zeitfenster? EINE Regel fuer Auswertung und
   Soll-Ist: der Liefertermin zaehlt, sonst das Anlegedatum. Ohne Fenster
   zaehlt alles - auch die Auftraege ohne jedes Datum. */
function planImFenster(a, tv, tb){
  const t = planTag(a.liefertermin) || planTag(a.angelegt);
  if(t === null) return !tv && !tb;
  if(tv !== null && t < tv) return false;
  if(tb !== null && t > tb) return false;
  return true;
}

function planAuswertung(auftraege, maschinen, von, bis){
  const tv = planTag(von), tb = planTag(bis);
  const liste = (auftraege || []).filter(a => planImFenster(a, tv, tb));
  const jeMaschine = {};
  (maschinen || []).forEach(m => {
    jeMaschine[m.id] = { id:m.id, name:m.name, auftraege:0, stueck:0,
                         minuten:0, umsatz:0 };
  });
  let umsatz = 0, minuten = 0, stueck = 0;
  const offen = {}, statusZahl = {};
  liste.forEach(a => {
    const pm = planMinuten(a), min = pm.gesamt;
    const n = Math.max(1, +a.stueck || 1);
    statusZahl[a.status] = (statusZahl[a.status] || 0) + 1;
    /* Umsatz zaehlt erst, wenn geliefert ist - alles davor ist Hoffnung.
       Der Rest steht als Auftragsbestand daneben. */
    if(a.status === 'geliefert') umsatz += +a.preis || 0;
    else if(a.status !== 'angeboten') offen.wert = (offen.wert || 0) + (+a.preis || 0);
    minuten += min; stueck += n;
    /* JE MASCHINE UEBER DIE ARBEITSGAENGE. Vorher stand die ganze Zeit
       eines Auftrags auf a.maschine - der Maschine des ERSTEN Gangs; die
       Fraese blieb mit 0,0 Stunden stehen, obwohl sie in der Tafel
       daneben belegt war.
       Drei Regeln, damit die Spalten lesbar bleiben:
       - Minuten werden je Gang zugeschlagen (das ist die Belastung).
       - Auftraege und Stueck zaehlen je Maschine EINMAL, auch wenn ein
         Auftrag zweimal auf dieselbe Maschine kommt.
       - Der Umsatz gehoert dem AUFTRAG, nicht einer Maschine. Er wird
         nach Zeitanteil umgelegt, damit die Spalte ueberhaupt etwas
         aussagt; die Zeile "zusammen" bleibt die echte Summe. */
    const gesehen = {};
    pm.gaenge.forEach(g => {
      const m = jeMaschine[g.maschine];
      if(!m) return;
      m.minuten += g.minuten;
      if(!gesehen[g.maschine]){
        gesehen[g.maschine] = true;
        m.auftraege++;
        m.stueck += n;
      }
      if(a.status === 'geliefert' && min > 0) m.umsatz += (+a.preis || 0) * g.minuten / min;
    });
  });
  /* Termintreue: nur gelieferte Auftraege mit Termin und Rueckmeldedatum
     koennen ueberhaupt puenktlich oder zu spaet sein. Alles andere ist
     noch offen - es als "puenktlich" zu zaehlen waere geschoent. */
  const bewertbar = liste.filter(a => a.status === 'geliefert' && a.liefertermin &&
                                      a.rueckmeldung && a.rueckmeldung.datum);
  const puenktlich = bewertbar.filter(a =>
    planTag(a.rueckmeldung.datum) <= planTag(a.liefertermin)).length;
  return {
    zahl:liste.length, stueck, minuten, stunden:minuten / 60,
    umsatz, auftragsbestand:offen.wert || 0,
    statusZahl,
    jeMaschine:Object.keys(jeMaschine).map(k => jeMaschine[k]),
    termintreue: bewertbar.length ? puenktlich / bewertbar.length : null,
    bewertbar:bewertbar.length, puenktlich
  };
}

/* ---- Soll gegen Ist --------------------------------------------------
   Die Kalkulation SCHAETZT eine Zeit, die Werkstatt MISST eine. Solange
   niemand beide nebeneinanderlegt, bleibt die Schaetzung fuer immer so
   falsch, wie sie am ersten Tag war.

   GERECHNET WIRD NUR MIT VOLLSTAENDIGEN RUECKMELDUNGEN. Ein Auftrag, bei
   dem ein Gang fehlt, faellt heraus und wird GEZAEHLT - eine Kennzahl aus
   halben Zetteln saehe genauso aus wie eine aus ganzen, und niemand
   koennte den Unterschied sehen.

   DER FAKTOR IST EINE BEOBACHTUNG, KEINE ANWEISUNG. 1,4 heisst: in
   diesem Zeitraum hat die Werkstatt fuer diese Teile 40 % laenger
   gebraucht, als gerechnet war. Ob deshalb die Zerspanleistung, der
   Stundensatz oder die Nebenzeit in defaults.json anders gehoert, steht
   hier NICHT - das ist eine Entscheidung des Bedieners und gehoert in den
   Morgenbericht.                                                       */
function planSollIst(auftraege, maschinen, von, bis){
  const tv = planTag(von), tb = planTag(bis);
  const liste = (auftraege || []).filter(a => planImFenster(a, tv, tb));
  const jeMaschine = {}, jeKlasse = {};
  (maschinen || []).forEach(m => {
    jeMaschine[m.id] = { id:m.id, name:m.name, soll:0, ist:0, gaenge:0, auftraege:0 };
  });
  const zeilen = [];
  let soll = 0, ist = 0, zahl = 0, angefangen = 0, ohne = 0;

  liste.forEach(a => {
    const su = istSumme(a);
    if(!su.vollstaendig){
      if(su.angefangen) angefangen++; else ohne++;
      return;
    }
    zahl++;
    soll += su.sollGesamt; ist += su.istGesamt;
    const n = su.stueck, gesehen = {};
    istGaenge(a).forEach(g => {
      const m = jeMaschine[g.maschine];
      if(!m) return;
      m.soll += g.sollRuest + g.sollStueck * n;
      m.ist  += (g.istRuest || 0) + (g.istStueck || 0) * n;
      m.gaenge++;
      if(!gesehen[g.maschine]){ gesehen[g.maschine] = true; m.auftraege++; }
    });
    const k = a.klasse || '(ohne Klasse)';
    if(!jeKlasse[k]) jeKlasse[k] = { klasse:k, soll:0, ist:0, auftraege:0 };
    jeKlasse[k].soll += su.sollGesamt; jeKlasse[k].ist += su.istGesamt; jeKlasse[k].auftraege++;
    zeilen.push({ nummer:a.nummer, teil:a.teil, kunde:a.kunde, klasse:k,
                  stueck:n, gefertigt:su.gefertigt, ausschuss:su.ausschuss,
                  soll:su.sollGesamt, ist:su.istGesamt, faktor:su.faktor,
                  faktorRuesten:su.faktorRuesten, faktorStueck:su.faktorStueck });
  });

  const fak = (i, s) => s > 0 ? i / s : null;
  const raus = o => Object.keys(o).map(k => { o[k].faktor = fak(o[k].ist, o[k].soll); return o[k]; });
  return {
    zahl, angefangen, ohneRueckmeldung:ohne, betrachtet:liste.length,
    soll, ist, faktor:fak(ist, soll),
    zeilen, jeMaschine:raus(jeMaschine), jeKlasse:raus(jeKlasse)
  };
}

/* ---- Die Uebersicht --------------------------------------------------
   Fasst zusammen, was die Planung ohnehin gerechnet hat. Siehe Kopf des
   Pakets: rechnet NICHTS neu, sonst gaebe es zwei Wahrheiten.

   `e` ist dasselbe Eingabeobjekt wie bei planBelegen, plus `wochen`
   (wieviele Wochen die Auslastung zeigen soll).                     */
function planUebersicht(e){
  const E = e || {};
  const auftraege = E.auftraege || [];
  const maschinen = E.maschinen || [];
  const heute = planTag(E.ab) || planTag(planText(Date.now()));
  const b = E.belegung || planBelegen(E);
  const wochenZahl = Math.max(1, Math.round(+E.wochen || 4));

  /* ---- 1. Termine: was ist ueberfaellig, was wird eng? ----
     UEBERFAELLIG heisst: der Liefertag ist vorbei und das Teil ist
     nicht draussen. Das ist eine Tatsache, kein Rechenergebnis - und
     deshalb steht es an erster Stelle.
     GERISSEN heisst: der Plan sagt, es wird nicht mehr rechtzeitig
     fertig. Das ist eine Vorhersage, und sie kann sich noch aendern. */
  const offen = auftraege.filter(a => a.status !== 'geliefert' && a.status !== 'angeboten');
  const ueberfaellig = [], gerissen = [], eng = [];
  const zeilen = [];
  (b.auftraege || []).forEach(z => {
    const a = z.auftrag;
    const soll = planTag(a.liefertermin);
    const ueber = soll !== null && soll < heute && a.status !== 'geliefert';
    const zeile = {
      nummer:String(a.nummer || ''), teil:String(a.teil || ''), kunde:String(a.kunde || ''),
      status:a.status, termin:a.liefertermin || '', start:z.start, ende:z.ende,
      puffer:z.puffer, grundVerzug:z.grundVerzug || null,
      maschinen:(z.gaenge || []).map(g => g.maschine),
      ueberfaellig:ueber,
      /* Wieviele Arbeitstage bis zum Termin - das ist die Zahl, die man
         wirklich liest, nicht das Datum. */
      tageBis: soll === null ? null : Math.round((soll - heute) / 86400000)
    };
    zeilen.push(zeile);
    if(ueber) ueberfaellig.push(zeile);
    else if(z.puffer !== null && z.puffer < 0) gerissen.push(zeile);
    else if(z.puffer !== null && z.puffer <= 2) eng.push(zeile);
  });
  /* Auftraege, die gar nicht in den Plan passen, sind der schlimmste
     Fall - sie tauchen in keiner Tafel auf. */
  const unplanbar = (b.unplanbar || []).map(u => ({
    nummer:String(u.auftrag.nummer || ''), teil:String(u.auftrag.teil || ''),
    grund:u.grund
  }));

  /* ---- 2. Was laeuft, was wartet ---- */
  const nachStatus = {};
  auftraege.forEach(a => { nachStatus[a.status] = (nachStatus[a.status] || 0) + 1; });

  /* ---- 3. Auslastung, auf die naechsten Wochen gekuerzt ----
     Neun Spalten, von denen acht leer sind, sind keine Auskunft. */
  const ausl = planAuslastung(b, maschinen, E.frei);
  /* DIE EIGENE ZEIT ist fuer eine Ein-Mann-Werkstatt die Zahl, die
     zaehlt. Vier Maschinen zu je 20 % sehen leer aus und sind in
     Wahrheit die volle Woche. Gerechnet aus denselben Bloecken wie die
     Maschinenauslastung - keine zweite Wahrheit. */
  const mann = (function(){
    const w = +E.mannStunden;
    if(!isFinite(w) || w <= 0) return null;
    const jeWoche = {};
    (b.bloecke || []).forEach(x => {
      const wo = planText(planWochenanfang(x.tag));
      /* DIE MANNMINUTEN, nicht die Maschinenminuten - sie stehen im
         Block, weil die Planung sie dort abgelegt hat. Wer hier
         x.minuten naehme, zaehlte die Zeit der Maschine als die des
         Menschen und waere wieder beim Fehler von vorgestern. */
      jeWoche[wo] = (jeWoche[wo] || 0) + (x.mann != null ? x.mann : x.minuten);
    });
    return { stunden:w, jeWoche };
  })();
  const wochen = [...new Set(ausl.map(w => w.woche))].sort().slice(0, wochenZahl);
  const last = maschinen.map(m => ({
    id:m.id, name:m.name, art:m.art,
    wochen: wochen.map(w => {
      const z = ausl.filter(x => x.maschine === m.id && x.woche === w)[0];
      return { woche:w, belegt:z ? z.belegt : 0, kapazitaet:z ? z.kapazitaet : 0,
               anteil:z && z.kapazitaet > 0 ? z.belegt / z.kapazitaet : 0,
               angebrochen:!!(z && z.angebrochen) };
    })
  }));

  /* ---- 4. Wert: was steht offen ----
     Getrennt nach dem, was verbindlich ist, und dem, was noch ein
     Angebot ist - das sind zwei verschiedene Zahlen, und sie in eine zu
     werfen waere die haeufigste Art, sich reich zu rechnen. */
  const wert = (liste) => liste.reduce((s, a) => s + (+a.preis || 0) * Math.max(1, +a.stueck || 1), 0);
  const werte = {
    angeboten: wert(auftraege.filter(a => a.status === 'angeboten')),
    beauftragt: wert(auftraege.filter(a => ['beauftragt', 'freigegeben'].indexOf(a.status) >= 0)),
    inArbeit: wert(auftraege.filter(a => a.status === 'laeuft')),
    fertig: wert(auftraege.filter(a => a.status === 'fertig')),
    geliefert: wert(auftraege.filter(a => a.status === 'geliefert'))
  };
  werte.offen = werte.beauftragt + werte.inArbeit + werte.fertig;

  /* ---- 5. Soll gegen Ist ---- */
  const si = planSollIst(auftraege);

  return {
    heute: planText(heute),
    zahlen: {
      gesamt: auftraege.length,
      offen: offen.length,
      ueberfaellig: ueberfaellig.length,
      gerissen: gerissen.length,
      eng: eng.length,
      unplanbar: unplanbar.length,
      laeuft: nachStatus.laeuft || 0,
      wartet: (nachStatus.beauftragt || 0) + (nachStatus.freigegeben || 0),
      fertig: nachStatus.fertig || 0
    },
    nachStatus, ueberfaellig, gerissen, eng, unplanbar, zeilen,
    last, wochen, werte, sollIst: si,
    /* null heisst: keine Grenze gesetzt, es gilt die Maschinenrechnung. */
    mann: mann ? {
      stunden: mann.stunden,
      wochen: wochen.map(w => {
        const belegt = (mann.jeWoche[w] || 0) / 60;
        return { woche:w, belegt, kapazitaet:mann.stunden,
                 anteil: mann.stunden > 0 ? belegt / mann.stunden : 0 };
      })
    } : null,
    /* Die naechsten fuenf nach Termin - das ist die Liste, die man
       morgens ansieht. */
    naechste: zeilen.filter(z => z.tageBis !== null)
      .sort((p, q) => p.tageBis - q.tageBis).slice(0, 5)
  };
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { planTag, planText, planPlus, planWochentag, planWochenanfang,
                     planMinuten, planKapazitaet, planBelegen, planAuslastung,
                     planSpaetester, planVerschieben, planRangLoeschen, planVerteilen,
                     planZettel, planFreiBereich, planFreiNorm, planFreiWirkung,
                     planImFenster, planAuswertung, planSollIst, planUebersicht };
}
