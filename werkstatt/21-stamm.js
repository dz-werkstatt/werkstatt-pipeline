'use strict';
/* =====================================================================
   werkstatt/21-stamm.js — Maschinen, Auftraege, Arbeitsgaenge
   ---------------------------------------------------------------------
   Die Kalkulation kennt bisher nur die GATTUNG einer Bearbeitung
   ("drehen", "fraesen", "handarbeit"). Fuer einen Preis genuegt das; fuer
   eine Belegung nicht: es macht einen Unterschied, ob ein Teil auf der
   1000er oder der 1500er laeuft, und ob es dort ueberhaupt hineinpasst.

   Dieses Modul ist die EINE Quelle fuer den Werkstatt-Stamm — als Bauplan
   und als Wache, nach dem Muster von shared/20-schema.js. Es ist DOM-frei
   und rechnet nichts; die Planung steht in werkstatt/22-planung.js.

   PLATZHALTER SIND ALS SOLCHE GEKENNZEICHNET. Arbeitsraum, Schichten und
   Stundensaetze der einzelnen Maschinen kenne ich nicht — sie tragen
   gepflegt:false, genau wie die Stundensaetze in defaults.json, und die
   Oberflaeche sagt es im Klartext. Ein geratener Arbeitsraum, der wie eine
   Messung aussieht, waere schlimmer als ein leeres Feld: er wuerde einen
   Auftrag auf eine Maschine legen, die ihn nicht aufnimmt.
   ===================================================================== */

const WERKSTATT_VERSION = '1.0';

/* ---- Maschinen -------------------------------------------------------
   `art` bindet die Maschine an die Gattung, die kalkRechnen liefert
   (kalkMaschine: drehteil_* -> 'drehen', fraesteil_* -> 'fraesen').
   `raum` ist der Arbeitsraum: dmax/laenge beim Drehen, x/y/z beim Fraesen.
   `minuten_je_tag` ist die verfuegbare Zeit an einem Arbeitstag — das
   Schichtmodell steckt in dieser einen Zahl, damit niemand zwei Stellen
   pflegen muss.                                                        */
const WERKSTATT_MASCHINEN = [
  { id:'m1000', name:'Monforts 1000 MTC-K', art:'drehen', aktiv:true,
    raum:{dmax:320, laenge:1000}, minuten_je_tag:480, tage:[1,2,3,4,5],
    satz:null, gepflegt:false,
    hinweis:'Arbeitsraum geschaetzt: die Drehlaenge folgt dem Namen, der Durchmesser der Rotorwelle (Rohteil ⌀305). Bitte nachmessen.' },
  { id:'m1500', name:'Monforts 1500 EuroTurn', art:'drehen', aktiv:true,
    raum:{dmax:320, laenge:1500}, minuten_je_tag:480, tage:[1,2,3,4,5],
    satz:null, gepflegt:false,
    hinweis:'Arbeitsraum geschaetzt wie bei der 1000er. Bitte nachmessen.' },
  { id:'fr1', name:'Fraesmaschine', art:'fraesen', aktiv:true,
    raum:{x:800, y:500, z:500}, minuten_je_tag:480, tage:[1,2,3,4,5],
    satz:null, gepflegt:false,
    hinweis:'Platzhalter fuer EINE Fraesmaschine - Name, Verfahrwege und Satz eintragen.' },
  { id:'hand', name:'Handarbeitsplatz', art:'handarbeit', aktiv:true,
    raum:null, minuten_je_tag:480, tage:[1,2,3,4,5],
    satz:null, gepflegt:false,
    hinweis:'Entgraten, Messen, Verpacken - kein Arbeitsraum, nimmt jedes Teil.' }
];

/* ---- Maschinen pflegen -----------------------------------------------
   DER BEFUND, der dieses Stueck ausgeloest hat: Entscheidung Nummer eins
   auf der Entscheidungsliste heisst "Arbeitsraum der beiden Drehmaschinen
   messen" - und die App liess die Masse gar nicht eintragen. Sie standen
   als Text da. Eine App, die nach einer Zahl fragt und kein Feld dafuer
   hat, fragt nicht ernsthaft.

   DAS FELD gepflegt IST DIE AUSSAGE: solange es false ist, warnt jede
   Maschinenwahl, dass "passt" auf geratenen Massen steht. Es wird true,
   sobald jemand einen Arbeitsraum EINGIBT - nicht, weil die App dann
   weiss, dass gemessen wurde, sondern weil jemand die Zahl bewusst
   hingeschrieben hat. Mehr kann sie nicht wissen, und sie tut auch nicht
   so.                                                                  */
const WERKSTATT_ARTEN = ['drehen', 'fraesen', 'handarbeit'];

function maschineNeu(art, id){
  const a = WERKSTATT_ARTEN.indexOf(art) >= 0 ? art : 'drehen';
  return {
    id: String(id || ''), name: '', art: a, aktiv: true,
    wartung: [],       /* Tage, an denen NUR diese Maschine stillsteht */
    mannanteil: null,  /* Anteil der Stueckzeit, den der Mensch dabeisteht */
    raum: a === 'handarbeit' ? null
        : a === 'fraesen' ? {x:0, y:0, z:0} : {dmax:0, laenge:0},
    minuten_je_tag: 480, tage: [1,2,3,4,5],
    satz: null, gepflegt: false, hinweis: ''
  };
}

/* Beim Wechsel der Art muss der Arbeitsraum die Form wechseln - ein
   Drehraum hat Durchmesser und Laenge, ein Fraesraum drei Wege, ein
   Handarbeitsplatz keinen. Was nicht passt, wird NICHT umgerechnet: aus
   einem Durchmesser eine Verfahrlaenge zu machen waere geraten. */
function maschineArtSetzen(m, art){
  if(!m || WERKSTATT_ARTEN.indexOf(art) < 0) return false;
  if(m.art === art) return false;
  m.art = art;
  m.raum = art === 'handarbeit' ? null
         : art === 'fraesen' ? {x:0, y:0, z:0} : {dmax:0, laenge:0};
  if(art !== 'handarbeit') m.gepflegt = false;
  return true;
}

function maschinePruefen(m, alle){
  const f = [];
  const zahl = v => typeof v === 'number' && isFinite(v);
  if(!m || typeof m !== 'object') return ['Maschine fehlt.'];
  if(!String(m.id || '').trim()) f.push('Die Maschine hat keine Kennung.');
  else if((alle || []).filter(x => x !== m && x.id === m.id).length)
    f.push('Die Kennung "' + m.id + '" gibt es zweimal.');
  if(!String(m.name || '').trim()) f.push('Die Maschine hat keinen Namen.');
  if(WERKSTATT_ARTEN.indexOf(m.art) < 0) f.push('Art "' + m.art + '" ist keine der drei.');
  if(!zahl(m.minuten_je_tag) || m.minuten_je_tag < 0) f.push('Minuten je Tag fehlen.');
  /* Ohne Arbeitstag koennte die Maschine nie laufen - und die Belegung
     wuerde den Auftrag stumm in den Horizont schieben. */
  if(!Array.isArray(m.tage) || !m.tage.length) f.push('Kein Arbeitstag eingetragen.');
  else if(m.tage.some(t => !(t >= 1 && t <= 7))) f.push('Ein Arbeitstag liegt ausserhalb 1..7.');
  const mass = v => zahl(v) && v > 0;
  if(m.art === 'drehen' && (!m.raum || !mass(m.raum.dmax) || !mass(m.raum.laenge)))
    f.push('Arbeitsraum fehlt: Durchmesser und Laenge muessen ueber 0 liegen.');
  if(m.art === 'fraesen' && (!m.raum || !mass(m.raum.x) || !mass(m.raum.y) || !mass(m.raum.z)))
    f.push('Verfahrwege fehlen: X, Y und Z muessen ueber 0 liegen.');
  return f;
}

/* Auf welchen Auftraegen liegt diese Maschine? Eine Maschine, auf der
   Arbeit liegt, darf nicht verschwinden - sonst verlieren die Auftraege
   still ihre Maschine und fallen bei der naechsten Belegung heraus. */
function maschineBelegt(id, auftraege){
  const raus = [];
  (auftraege || []).forEach(a => {
    if(auftragGaenge(a).some(g => g.maschine === id)) raus.push(a.nummer || a.teil || '(ohne Nummer)');
  });
  return raus;
}

/* ---- Auftragsstatus --------------------------------------------------
   Die REIHENFOLGE ist die Kette: ein Auftrag geht nur vorwaerts, und
   jeder Schritt hat eine Bedeutung fuer die Planung.
     angeboten   - noch kein Auftrag, zaehlt NICHT in die Belegung
     beauftragt  - Kunde hat bestellt, zaehlt in die Belegung
     freigegeben - Material da, Papiere gedruckt
     laeuft      - auf der Maschine
     fertig      - gefertigt, noch nicht ausgeliefert
     geliefert   - erledigt, faellt aus der Belegung heraus            */
const WERKSTATT_STATUS = ['angeboten', 'beauftragt', 'freigegeben', 'laeuft', 'fertig', 'geliefert'];
/* Welche Status Kapazitaet binden - angeboten noch nicht, geliefert nicht mehr. */
const WERKSTATT_STATUS_PLANT = ['beauftragt', 'freigegeben', 'laeuft'];

function neuerAuftrag(){
  return {
    version: WERKSTATT_VERSION,
    nummer: '',                 /* Auftragsnummer, frei */
    kunde: '',
    teil: '',                   /* Teilename aus dem Datensatz */
    zeichnungsnr: '',
    werkstoff: '',
    klasse: 'fraesteil_3ax',
    stueck: 1,
    status: 'angeboten',
    angelegt: '',               /* JJJJ-MM-TT */
    liefertermin: '',           /* JJJJ-MM-TT, leer = offen */
    maschine: '',               /* id aus WERKSTATT_MASCHINEN, leer = noch nicht gewaehlt */
    rang: 0,                    /* Reihenfolge von Hand; 0 = nach Liefertermin */
    kalk: null,                 /* Grundlage der Kalkulation; null = unbekannt */
    zeiten: {ruestzeit:0, stueckzeit:0},   /* Minuten, aus der Kalkulation */
    gaenge: [],                 /* Arbeitsgaenge; leer = EIN Gang aus zeiten/maschine */
    preis: 0,                   /* Gesamtpreis der Losgroesse */
    masse: {dmax:0, laenge:0, x:0, y:0, z:0},  /* fuer die Maschinenwahl */
    rueckmeldung: {gefertigt:0, ausschuss:0, datum:'', gaenge:[]},
    bemerkung: ''
  };
}

/* ---- Arbeitsgaenge ---------------------------------------------------
   DER GRUND: 17 der 37 Drehteile im echten Bestand sind drehteil_fraes - sie laufen
   erst auf der Drehmaschine und dann auf der Fraese. Mit EINEM Arbeitsgang
   je Auftrag laesst sich das nicht planen: die Fraesmaschine bekaeme nie
   eine Minute, obwohl sie belegt ist, und die Drehmaschine traegt eine
   Last, die sie gar nicht hat.

   DIE EINE REGEL: Arbeitsgaenge TEILEN die kalkulierte Zeit auf, sie
   ERZEUGEN KEINE. Die Summe ueber alle Gaenge muss die Ruestzeit und die
   Stueckzeit der Kalkulation ergeben - sonst stimmt der Preis nicht mehr.
   Genau das prueft auftragPruefen, und genau darauf beruht die Zusage des
   ganzen Pakets: kein zweites Zeitmodell.

   WIE DIE ZEIT VERTEILT WIRD, ENTSCHEIDET NICHT DIE APP. Die Kalkulation
   rechnet den Fraesanteil eines Drehteils bewusst auf der Drehmaschine mit
   (40-kalk.js, Entscheidung 2) - wieviel davon in Wahrheit auf der Fraese
   liegt, weiss nur die Werkstatt. Die App stellt das Werkzeug bereit und sagt,
   wenn die Summe nicht mehr stimmt; die Zahl traegt er ein. Ein geratener
   Anteil, der wie eine Messung aussieht, waere wieder der Fehler, den der
   Arbeitsraum-Platzhalter schon einmal zeigt.

   EIN AUFTRAG OHNE `gaenge` IST EIN AUFTRAG MIT EINEM GANG. Alle
   Auftraege von gestern und jede gespeicherte Datei laufen unveraendert
   weiter - dieselbe Konvention wie das fehlende Kuehlmittelfeld der
   Dreh-App: was nicht dasteht, ist der Normalfall.                     */
function gangNeu(nr){
  return { nr:nr || 1, name:'', maschine:'', ruestzeit:0, stueckzeit:0 };
}

/* Liefert IMMER eine Liste - auch fuer den Auftrag ohne `gaenge`. Das ist
   die einzige Stelle, an der der Einzelgang-Rueckfall steht; alles andere
   (Planung, Laufkarte, Oberflaeche) rechnet mit der Liste. */
function auftragGaenge(a){
  if(a && Array.isArray(a.gaenge) && a.gaenge.length){
    return a.gaenge.map((g, i) => ({
      nr: +(g && g.nr) || (i + 1),
      name: String((g && g.name) || ''),
      maschine: String((g && g.maschine) || ''),
      ruestzeit: +(g && g.ruestzeit) || 0,
      stueckzeit: +(g && g.stueckzeit) || 0
    }));
  }
  const z = (a && a.zeiten) || {};
  return [{ nr:1, name:'', maschine:String((a && a.maschine) || ''),
            ruestzeit:+z.ruestzeit || 0, stueckzeit:+z.stueckzeit || 0 }];
}

function gaengeSumme(a){
  const g = auftragGaenge(a);
  return { ruestzeit:g.reduce((s, x) => s + x.ruestzeit, 0),
           stueckzeit:g.reduce((s, x) => s + x.stueckzeit, 0),
           zahl:g.length };
}

/* Aus dem gedachten Einzelgang einen echten Eintrag machen - noetig,
   bevor ein zweiter dazukommt. */
function gaengeMaterialisieren(a){
  if(!Array.isArray(a.gaenge) || !a.gaenge.length) a.gaenge = auftragGaenge(a);
  return a.gaenge;
}

/* Der neue Gang beginnt mit NULL Minuten. Das ist Absicht: so bleibt die
   Summe im selben Augenblick richtig, in dem der Gang entsteht. Die
   Minuten wandern danach von Hand hinueber, und bis dahin sagt die Maske,
   wieviel noch offen ist. */
function gangAnhaengen(a, name, maschine){
  const g = gaengeMaterialisieren(a);
  const n = gangNeu(g.length + 1);
  n.name = String(name || '');
  n.maschine = String(maschine || '');
  g.push(n);
  g.forEach((x, i) => { x.nr = i + 1; });
  return n;
}

/* Die Zeit eines entfernten Gangs geht NICHT verloren - sie faellt an den
   ersten zurueck. Sonst waere die Summe mit einem Klick kaputt und der
   Preis still falsch. */
function gangEntfernen(a, idx){
  const g = gaengeMaterialisieren(a);
  if(g.length <= 1 || idx < 0 || idx >= g.length) return false;
  const weg = g.splice(idx, 1)[0];
  g[0].ruestzeit += weg.ruestzeit;
  g[0].stueckzeit += weg.stueckzeit;
  /* Die Rueckmeldungen haengen an der GANGNUMMER, und die Nummern
     ruecken beim Entfernen nach. Ohne diese Umnummerierung wandert die
     in der Werkstatt gemessene Zeit von Gang 3 still auf Gang 2 - ein
     Fehler, den niemand sieht, weil beide Zahlen plausibel aussehen. */
  const alteNummern = g.map(x => x.nr);
  g.forEach((x, i) => { x.nr = i + 1; });
  const r = a.rueckmeldung;
  if(r && Array.isArray(r.gaenge)){
    r.gaenge = r.gaenge.map(e => {
      const i = alteNummern.indexOf(+(e && e.nr));
      return i < 0 ? null : Object.assign({}, e, {nr:i + 1});
    }).filter(Boolean);
  }
  a.maschine = g[0].maschine;
  return true;
}

/* Die Differenz zur Kalkulation dem ERSTEN Gang geben. Der erste ist der
   richtige Ort dafuer: dort hat die Kalkulation die ganze Zeit
   hingerechnet, von dort wird sie weggenommen. Wird dabei zuviel
   abgezogen, entsteht eine negative Zeit - die wird NICHT stumm auf null
   geklemmt, sondern von der Wache gemeldet. */
function gaengeAusgleichen(a){
  const g = gaengeMaterialisieren(a);
  const z = a.zeiten || {};
  const s = gaengeSumme(a);
  const rund = x => Math.round(x * 1000) / 1000;
  g[0].ruestzeit = rund(g[0].ruestzeit + ((+z.ruestzeit || 0) - s.ruestzeit));
  g[0].stueckzeit = rund(g[0].stueckzeit + ((+z.stueckzeit || 0) - s.stueckzeit));
  return g[0];
}

/* Wo ein zweiter Arbeitsgang wahrscheinlich ist - als HINWEIS, nicht als
   Automatik. Die Klasse weiss, dass gefraest wird; seit dem Fraesanteil
   weiss sie auch ungefaehr, wie lange - aber der Klick bleibt beim
   Bediener. */
function gangHinweis(a){
  if(auftragGaenge(a).length > 1) return '';
  if((a && a.klasse) === 'drehteil_fraes')
    return 'Dieses Teil hat einen Fraesanteil. Die Kalkulation rechnet ihn auf der ' +
           'Drehmaschine mit (hoehere Ruestzeit, Nebenzeit je Bohrung) - laeuft er ' +
           'wirklich auf der Fraesmaschine, nimm "Arbeitsgaenge vorschlagen": ' +
           'die App teilt die Minuten, die Summe bleibt dieselbe.';
  return '';
}

/* ---- Wieviel davon ist Fraesen? --------------------------------------
   PUNKT 6 DER ENTSCHEIDUNGSLISTE, und die Haelfte davon steht laengst in
   der Kalkulation: der Ruestaufschlag von drehteil_einfach auf
   drehteil_fraes (20 -> 40 min) IST der Fraesanteil beim Ruesten. Er
   wird hier AUSGERECHNET statt hingeschrieben - wer die zwei Werte in
   den Einstellungen aendert, aendert den Anteil mit, und niemand muss
   daran denken.

   Bei der STUECKZEIT gibt es keinen solchen Aufschlag; dort wirkt die
   Klasse ueber die Nebenzeiten. Der Anteil ist deshalb ein Startwert
   (0,30) mit gepflegt false - eine Annahme, die als solche ausgewiesen
   wird und die man an einem echten Teil nachmisst.

   Geliefert werden BEIDE Anteile samt Begruendung, damit die Oberflaeche
   sagen kann, was gerechnet und was geraten ist.                      */
function fraesAnteil(vorgaben){
  const V = vorgaben || (typeof KALK_VORGABEN !== 'undefined' ? KALK_VORGABEN : null) || {};
  const r = V.ruesten || {};
  const einfach = +r.drehteil_einfach, mitFraes = +r.drehteil_fraes;
  let ruest = 0.5, ruestHer = 'Vorgabe';
  if(isFinite(einfach) && isFinite(mitFraes) && mitFraes > 0 && mitFraes >= einfach){
    ruest = (mitFraes - einfach) / mitFraes;
    ruestHer = 'R&uuml;sten ' + einfach + ' gegen ' + mitFraes + ' min';
  }
  const fa = V.fraesanteil || {};
  const st = isFinite(+fa.stueck) ? Math.min(0.95, Math.max(0, +fa.stueck)) : 0.30;
  return {
    ruest: Math.min(0.95, Math.max(0, ruest)),
    stueck: st,
    ruestHerkunft: ruestHer,
    stueckGepflegt: fa.gepflegt === true
  };
}

/* Aus einem Auftrag zwei Gaenge machen. DIE SUMME BLEIBT DIE
   KALKULATION - das ist die tragende Zusage des ganzen ERP, und sie
   haelt hier durch Konstruktion: der zweite Gang bekommt den gerundeten
   Anteil, der ERSTE den Rest. Bei krummen Anteilen fehlt damit nie eine
   Minute und es entsteht nie eine.

   Ohne Fraesmaschine in der Liste wird NICHT geraten - dann sagt die
   Funktion, was fehlt, und aendert nichts. */
function gaengeVorschlagen(a, maschinen, vorgaben){
  if(!a) return {ok:false, grund:'Kein Auftrag.'};
  if(a.klasse !== 'drehteil_fraes')
    return {ok:false, grund:'Das ist kein Drehteil mit Fraesanteil.'};
  if(auftragGaenge(a).length > 1)
    return {ok:false, grund:'Dieser Auftrag hat schon mehr als einen Arbeitsgang.'};
  const M = maschinen || WERKSTATT_MASCHINEN;
  const fr = M.filter(m => m.art === 'fraesen' && m.aktiv !== false);
  if(!fr.length)
    return {ok:false, grund:'Es gibt keine aktive Fraesmaschine. Trag eine in Blatt 4 ein.'};

  const an = fraesAnteil(vorgaben);
  const g = gaengeMaterialisieren(a);
  const rGes = g[0].ruestzeit, sGes = g[0].stueckzeit;
  /* NUR DER ABGEGEBENE TEIL WIRD GERUNDET. Der erste Gang bekommt den
     Rest, ungerundet - sonst stimmt die Summe bei krummen Anteilen
     nicht, und genau darauf steht der Preis. Ruesten auf zehntel
     Minuten, Stueckzeit auf hundertstel (so genau liefert sie die
     Kalkulation). toFixed raeumt nur den Fliesskommarest weg:
     7,77 - 2,59 ergibt sonst 5,180000000000001. */
  const rund1 = v => Math.round(v * 10) / 10;
  const rund2 = v => Math.round(v * 100) / 100;
  const glatt = v => +v.toFixed(6);
  const rFr = rund1(rGes * an.ruest), sFr = rund2(sGes * an.stueck);

  g[0].name = g[0].name || 'Drehen';
  g[0].maschine = g[0].maschine || maschineVorschlag(a, M, null);
  g[0].ruestzeit = glatt(rGes - rFr);
  g[0].stueckzeit = glatt(sGes - sFr);
  const zwei = gangAnhaengen(a, 'Fraesen', fr[0].id);
  zwei.ruestzeit = rFr;
  zwei.stueckzeit = sFr;
  a.maschine = g[0].maschine;
  return {
    ok: true, anteil: an, maschine: fr[0].id, maschineName: fr[0].name,
    ruestFraes: rFr, stueckFraes: sFr,
    ruestDrehen: g[0].ruestzeit, stueckDrehen: g[0].stueckzeit
  };
}

/* ---- Wache -----------------------------------------------------------
   Liefert eine Liste der Beanstandungen; leer heisst in Ordnung.
   Geprueft wird das Geruest, nicht die Sinnhaftigkeit - ob ein Termin
   ERREICHBAR ist, sagt die Planung, nicht diese Wache.                 */
function auftragPruefen(a){
  const f = [];
  const zahl = v => typeof v === 'number' && isFinite(v);
  if(!a || typeof a !== 'object') return ['Auftrag fehlt.'];
  if(a.version !== WERKSTATT_VERSION) f.push('Version ist "' + a.version + '", erwartet "' + WERKSTATT_VERSION + '".');
  ['nummer', 'kunde', 'teil', 'zeichnungsnr', 'werkstoff', 'klasse', 'status',
   'angelegt', 'liefertermin', 'maschine', 'bemerkung'].forEach(k => {
    if(typeof a[k] !== 'string') f.push('auftrag.' + k + ' ist kein Text.');
  });
  if(a.status && WERKSTATT_STATUS.indexOf(a.status) < 0)
    f.push('auftrag.status "' + a.status + '" ist keiner der sechs Stufen.');
  if(!zahl(a.stueck) || a.stueck < 1) f.push('auftrag.stueck fehlt oder ist kleiner als 1.');
  /* rang darf fehlen - alte Auftraege kennen das Feld nicht, und "kein
     Rang" ist genau die Vorgabe. */
  if(a.rang != null && !zahl(a.rang)) f.push('auftrag.rang ist keine Zahl.');
  /* kalk darf fehlen - Auftraege von vor dem 15.09.2026 kennen es
     nicht, und "keine Grundlage" ist eine gueltige Auskunft. */
  if(a.kalk != null && (typeof a.kalk !== 'object' || !a.kalk.teil))
    f.push('auftrag.kalk ist keine Kalkulationsgrundlage.');
  if(!zahl(a.preis)) f.push('auftrag.preis fehlt.');
  if(!a.zeiten || !zahl(a.zeiten.ruestzeit) || !zahl(a.zeiten.stueckzeit))
    f.push('auftrag.zeiten unvollstaendig.');
  if(!a.masse || !zahl(a.masse.dmax) || !zahl(a.masse.laenge)) f.push('auftrag.masse unvollstaendig.');
  if(!a.rueckmeldung || !zahl(a.rueckmeldung.gefertigt)) f.push('auftrag.rueckmeldung unvollstaendig.');
  else {
    /* ausschuss darf fehlen - alte Auftraege kennen das Feld nicht. */
    if(a.rueckmeldung.ausschuss != null && !zahl(a.rueckmeldung.ausschuss))
      f.push('auftrag.rueckmeldung.ausschuss ist keine Zahl.');
    if(a.rueckmeldung.gaenge != null && !Array.isArray(a.rueckmeldung.gaenge))
      f.push('auftrag.rueckmeldung.gaenge ist keine Liste.');
    else if(Array.isArray(a.rueckmeldung.gaenge)){
      const nummern = auftragGaenge(a).map(g => g.nr);
      a.rueckmeldung.gaenge.forEach((e, i) => {
        const wo = 'Rueckmeldung ' + (i + 1) + ': ';
        if(!e || typeof e !== 'object'){ f.push(wo + 'fehlt.'); return; }
        /* Eine Rueckmeldung ohne Arbeitsgang gehoert zu nichts. Das
           passiert beim Entfernen eines Gangs - und faellt sonst
           niemandem auf, weil sie in keiner Tabelle steht. */
        if(nummern.indexOf(+e.nr) < 0)
          f.push(wo + 'gehoert zu Arbeitsgang ' + e.nr + ', den es nicht gibt.');
        ['ruestzeit', 'stueckzeit'].forEach(k => {
          if(e[k] != null && e[k] !== '' && (!zahl(+e[k]) || +e[k] < 0))
            f.push(wo + k + ' ist keine Zahl ab 0.');
        });
      });
    }
  }
  /* Arbeitsgaenge: erst das Geruest, dann die EINE Regel. Ein Auftrag OHNE
     gaenge ist in Ordnung - das ist der Einzelgang. */
  if(a.gaenge != null && !Array.isArray(a.gaenge)) f.push('auftrag.gaenge ist keine Liste.');
  else if(Array.isArray(a.gaenge) && a.gaenge.length){
    a.gaenge.forEach((g, i) => {
      const nr = 'Arbeitsgang ' + (i + 1) + ': ';
      if(!g || typeof g !== 'object'){ f.push(nr + 'fehlt.'); return; }
      if(typeof g.name !== 'string') f.push(nr + 'Name ist kein Text.');
      if(typeof g.maschine !== 'string') f.push(nr + 'Maschine ist kein Text.');
      if(!zahl(g.ruestzeit) || !zahl(g.stueckzeit)) f.push(nr + 'Zeiten fehlen.');
      else if(g.ruestzeit < 0 || g.stueckzeit < 0)
        f.push(nr + 'negative Zeit - beim Ausgleichen ist mehr abgezogen worden, als dastand.');
    });
    /* Die tragende Regel des ganzen Pakets: die Gaenge teilen auf, was die
       Kalkulation gerechnet hat. Stimmt die Summe nicht, stimmt der Preis
       nicht - und das faellt sonst niemandem auf. */
    if(a.zeiten && zahl(a.zeiten.ruestzeit) && zahl(a.zeiten.stueckzeit)){
      const su = gaengeSumme(a), rd = x => Math.round(x * 100) / 100;
      if(Math.abs(su.ruestzeit - a.zeiten.ruestzeit) > 0.01)
        f.push('Die Arbeitsgaenge ruesten zusammen ' + rd(su.ruestzeit) + ' min, die Kalkulation hat ' +
               rd(a.zeiten.ruestzeit) + ' min gerechnet - Arbeitsgaenge teilen die Zeit auf, sie erzeugen keine.');
      if(Math.abs(su.stueckzeit - a.zeiten.stueckzeit) > 0.01)
        f.push('Die Arbeitsgaenge brauchen zusammen ' + rd(su.stueckzeit) + ' min je Stueck, die Kalkulation hat ' +
               rd(a.zeiten.stueckzeit) + ' min gerechnet - dann passt der Preis nicht mehr.');
    }
  }
  /* Datumsform, nicht Datumswert: ein "31.09." faellt der Planung auf, ein
     "morgen" schon dem Leser. */
  ['angelegt', 'liefertermin'].forEach(k => {
    if(a[k] && !/^\d{4}-\d{2}-\d{2}$/.test(a[k])) f.push('auftrag.' + k + ' ist kein Datum JJJJ-MM-TT.');
  });
  return f;
}

/* ---- Aus einem kalkulierten Teil wird ein Auftrag ---------------------
   DER KERN DES GANZEN: kein zweites Zeitmodell. Was der Preis benutzt
   hat, benutzt die Planung auch - Ruestzeit, Stueckzeit, Losgroesse und
   Maschinengattung kommen unveraendert aus kalkRechnen.                */
function auftragAusKalkulation(d, k, zusatz){
  const a = neuerAuftrag();
  const t = (d && d.teil) || {};
  const z = zusatz || {};
  a.teil = String(t.name || '');
  a.zeichnungsnr = String(t.zeichnungsnr || '');
  a.werkstoff = String(t.werkstoff || (k && k.werkstoff && k.werkstoff.name) || '');
  a.klasse = String(t.klasse || 'fraesteil_3ax');
  a.stueck = Math.max(1, Math.round(+(k && k.zeiten && k.zeiten.stueck) || 1));
  a.zeiten.ruestzeit = +(k && k.zeiten && k.zeiten.ruestzeit) || 0;
  a.zeiten.stueckzeit = +(k && k.zeiten && k.zeiten.stueckzeit) || 0;
  a.preis = +(k && k.preise && k.preise.gesamt) || 0;
  const rot = t.rotation || {};
  a.masse = {
    dmax: +rot.dmax || 0, laenge: +rot.laenge || 0,
    x: +(t.bbox && t.bbox.x) || 0, y: +(t.bbox && t.bbox.y) || 0, z: +(t.bbox && t.bbox.z) || 0
  };
  /* Die Grundlage der Rechnung mitschreiben, wenn der Aufrufer sie
     mitgibt. Ohne sie bleibt das Feld null, und der Auftrag sagt spaeter
     ehrlich, dass er sich nicht nachrechnen laesst. */
  if(z.ein) a.kalk = kalkGrundlage(z.ein, z.heute);
  a.kunde = String(z.kunde || '');
  a.nummer = String(z.nummer || '');
  a.angelegt = String(z.heute || '');
  a.liefertermin = String(z.liefertermin || '');
  /* Die GATTUNG steht fest (sie folgt der Klasse), die MASCHINE nicht -
     das entscheidet die Maschinenwahl weiter unten oder der Bediener. */
  a.gattung = String((k && k.maschine) || '');
  return a;
}

/* ---- Rueckmeldung: was wirklich gebraucht wurde ----------------------
   Auf der Laufkarte steht seit heute je Arbeitsgang eine Spalte, in die
   der Mann an der Maschine eintraegt, wie lange es gedauert hat. Bis
   hierher hat das niemand eingesammelt.

   DIE IST-ZEIT AENDERT DIE KALKULATION NIE. Sie steht daneben. Ein
   zurueckgemeldeter Wert, der still in den Preis rutscht, waere die
   schlimmste Sorte Automatik: das Angebot von gestern liesse sich nicht
   mehr nachvollziehen, und niemand wuesste, welche Zahl gerade gilt. Was
   die App tut, ist rechnen und zeigen: Soll, Ist, Faktor. Was daraus
   folgt - ob die Zerspanleistung in der Tabelle steigt oder faellt -,
   entscheidet der Bediener.

   ZUR ERINNERUNG, WARUM DAS ZAEHLT: der Durchstich am Drehprofil hat
   gemessen, dass die Zerspanleistung der Tabelle (60 cm3/min) um Faktor
   2,7 ueber dem liegt, was der Planer wirklich faehrt (21,7). Genau
   diese Art Abweichung wird hier sichtbar, nur aus der Werkstatt statt
   aus einer Rechnung.                                                  */
function istZahl(v){ return v !== null && v !== undefined && v !== '' && isFinite(+v); }

/* Eine Zeile je SOLL-Gang, mit der Rueckmeldung daneben (oder null).
   Der Soll-Gang gibt die Reihenfolge vor - eine Rueckmeldung zu einem
   Gang, den es nicht gibt, faellt der Wache auf, statt eine Zeile aus
   dem Nichts zu erzeugen. */
function istGaenge(a){
  const soll = auftragGaenge(a);
  const r = (a && a.rueckmeldung) || {};
  const liste = Array.isArray(r.gaenge) ? r.gaenge : [];
  return soll.map(g => {
    const e = liste.filter(x => x && +x.nr === g.nr)[0] || null;
    return {
      nr:g.nr, name:g.name, maschine:g.maschine,
      sollRuest:g.ruestzeit, sollStueck:g.stueckzeit,
      istRuest: (e && istZahl(e.ruestzeit)) ? +e.ruestzeit : null,
      istStueck: (e && istZahl(e.stueckzeit)) ? +e.stueckzeit : null
    };
  });
}

/* Soll, Ist und der Faktor eines Auftrags.
   DER FAKTOR RECHNET DIE IST-SAETZE AUF DIE SOLL-STUECKZAHL. Nur so sind
   zwei Auftraege vergleichbar: wer eine Serie nach 30 von 40 Stueck
   abbricht, hat trotzdem eine Ruest- und eine Stueckzeit gemessen, und
   die sind die Aussage - nicht die Gesamtzeit einer halben Serie.
   Gerechnet wird nur, wenn JEDER Gang zurueckgemeldet ist; ein halb
   gefuellter Zettel ergibt keinen Faktor, sondern eine Luecke.        */
function istSumme(a){
  const g = istGaenge(a);
  const n = Math.max(1, Math.round(+(a && a.stueck) || 1));
  let sR = 0, sS = 0, iR = 0, iS = 0, voll = g.length > 0, etwas = false;
  g.forEach(x => {
    sR += x.sollRuest; sS += x.sollStueck;
    if(x.istRuest === null || x.istStueck === null) voll = false; else etwas = true;
    iR += x.istRuest || 0; iS += x.istStueck || 0;
  });
  const sollGesamt = sR + sS * n, istGesamt = iR + iS * n;
  const f = (i, s) => (voll && s > 0) ? i / s : null;
  const r = (a && a.rueckmeldung) || {};
  return {
    zahl:g.length, vollstaendig:voll, angefangen:etwas && !voll, stueck:n,
    gefertigt:Math.max(0, Math.round(+r.gefertigt || 0)),
    ausschuss:Math.max(0, Math.round(+r.ausschuss || 0)),
    sollRuest:sR, sollStueck:sS, sollGesamt,
    istRuest:iR, istStueck:iS, istGesamt,
    faktor:f(istGesamt, sollGesamt),
    faktorRuesten:f(iR, sR),
    faktorStueck:f(iS, sS)
  };
}

/* Schreibt eine Ist-Zeit an den richtigen Gang. Leerer Wert loescht die
   Rueckmeldung dieses Gangs wieder - man muss einen Tippfehler
   zuruecknehmen koennen, ohne den ganzen Auftrag anzufassen. */
function istSetzen(a, nr, was, wert){
  if(!a.rueckmeldung) a.rueckmeldung = {gefertigt:0, ausschuss:0, datum:'', gaenge:[]};
  if(!Array.isArray(a.rueckmeldung.gaenge)) a.rueckmeldung.gaenge = [];
  const L = a.rueckmeldung.gaenge;
  let e = L.filter(x => x && +x.nr === +nr)[0];
  if(!e){ e = {nr:+nr}; L.push(e); }
  if(istZahl(wert)) e[was] = Math.max(0, +wert);
  else delete e[was];
  /* Ein Eintrag ohne eine einzige Zeit ist kein Eintrag. */
  if(!istZahl(e.ruestzeit) && !istZahl(e.stueckzeit))
    a.rueckmeldung.gaenge = L.filter(x => x !== e);
  return a.rueckmeldung.gaenge;
}

/* ---- Die Grundlage der Kalkulation mitschreiben ----------------------
   DIE FALLE, die frueher oder spaeter zuschlaegt: die Stundensaetze in
   den Einstellungen sind Platzhalter und werden gepflegt. Von
   da an rechnet jedes NEUE Angebot mit anderen Werten - und an keinem
   bestehenden Auftrag steht, dass sein Preis auf den alten beruht.
   Beide Zahlen sehen gleich aus, und die falsche ist die aeltere.

   Mit der Grundlage laesst sich die Rechnung jederzeit WIEDERHOLEN. Der
   Auftrag behaelt dabei seinen Preis - das Angebot ist beim Kunden. Die
   App sagt nur, was dieselbe Rechnung heute ergaebe; ob der Auftrag den
   neuen Preis bekommt, ist eine Entscheidung und ein Knopf.

   GESPEICHERT WIRD NUR, WAS kalkRechnen WIRKLICH LIEST: vier Zahlen vom
   Teil und eine vom Rohteil, dazu die Parameter. Eine Kopie des ganzen
   Datensatzes waere hundertmal so gross, wuerde bei jedem neuen Feld
   veralten - und niemand koennte sagen, welcher Teil davon in den Preis
   eingegangen ist.                                                     */
function kalkGrundlage(ein, heute){
  const E = ein || {};
  const t = E.teil || {}, ro = E.rohteil || {};
  return {
    gerechnet: String(heute || ''),
    werkstoff: String(E.werkstoff || ''),
    toleranz: String(E.toleranz || 'mittel'),
    oberflaeche: String(E.oberflaeche || 'normal'),
    seiten: Math.max(1, Math.round(+E.seiten || 1)),
    stueck: Math.max(1, Math.round(+E.stueck || 1)),
    versandArt: String(E.versandArt || 'versand'),
    ueber: JSON.parse(JSON.stringify(E.ueber || {})),
    teil: { klasse: String(t.klasse || ''),
            volumen_cm3: +t.volumen_cm3 || 0,
            bohrungen: Array.isArray(t.bohrungen) ? t.bohrungen.length : 0,
            kanten: +t.kanten || 0 },
    rohteil: { volumen_cm3: +ro.volumen_cm3 || 0 }
  };
}

/* ---- Was kostet die Stunde auf DIESER Maschine? ----------------------
   PUNKT 4 DER ENTSCHEIDUNGSLISTE. Das Feld m.satz steht im
   Maschinenmodell seit dem ersten Tag - es war nur nie eintragbar und
   nie gelesen. Jetzt gilt: hat die Maschine einen eigenen Satz, ist er
   es; sonst der Satz ihrer GATTUNG aus den Einstellungen. Eine Maschine
   ohne eigenen Satz verhaelt sich damit wie vorher, und niemand muss
   alle vier pflegen, um eine zu aendern.                              */
function maschineSatz(m, vorgaben){
  const V = vorgaben || (typeof KALK_VORGABEN !== 'undefined' ? KALK_VORGABEN : null) || {};
  const gattung = (V.saetze && V.saetze[(m && m.art) || '']) || null;
  if(m && m.satz != null && isFinite(+m.satz) && +m.satz > 0)
    return {satz:+m.satz, eigen:true, gattung};
  return {satz: gattung || 60, eigen:false, gattung};
}

/* Dieselbe Rechnung mit den HEUTIGEN Einstellungen.
   Der zweite Parameter ist kalkRechnen - als Parameter, damit dieses Modul nicht
   von der Reihenfolge der Bausteine abhaengt.
   Gerechnet wird mit der AKTUELLEN Stueckzahl des Auftrags, nicht mit
   der von damals: der Auftrag ist das, was er heute ist. Ob sie sich
   geaendert hat, steht im Ergebnis - sonst saehe eine geaenderte Menge
   aus wie eine geaenderte Einstellung.                                 */
function auftragNachrechnen(a, rechner, vorgaben, maschinen){
  const g = a && a.kalk;
  if(!g || !g.teil || typeof rechner !== 'function') return null;
  const stueck = Math.max(1, Math.round(+a.stueck || g.stueck || 1));
  /* DIE MASCHINE STEHT HIER FEST - anders als beim Angebot. Hat sie
     einen eigenen Stundensatz, wird mit ihm gerechnet; das ist der
     Unterschied zwischen "was haben wir versprochen" und "was kostet
     es auf der Maschine, die es wirklich faehrt". Ohne Maschinenliste
     bleibt alles wie vorher. */
  const mList = maschinen || null;
  const m = mList ? mList.filter(x => x.id === (a.gaenge && a.gaenge[0] ? a.gaenge[0].maschine : a.maschine))[0] : null;
  const ms = m ? maschineSatz(m, vorgaben) : null;
  let k;
  try{
    k = rechner({
      vorgaben,
      satz: (ms && ms.eigen) ? ms.satz : null,
      /* kalkRechnen zaehlt nur die LAENGE der Bohrungsliste - eine Liste
         dieser Laenge genuegt, und sie kostet nichts. */
      teil: { klasse:g.teil.klasse, volumen_cm3:g.teil.volumen_cm3,
              bohrungen:new Array(Math.max(0, g.teil.bohrungen)), kanten:g.teil.kanten },
      rohteil: { volumen_cm3:g.rohteil.volumen_cm3 },
      werkstoff:g.werkstoff, toleranz:g.toleranz, oberflaeche:g.oberflaeche,
      seiten:g.seiten, stueck, versandArt:g.versandArt, ueber:g.ueber
    });
  }catch(e){ return null; }
  const alt = { preis:+a.preis || 0,
                ruestzeit:+(a.zeiten && a.zeiten.ruestzeit) || 0,
                stueckzeit:+(a.zeiten && a.zeiten.stueckzeit) || 0 };
  const neu = { preis:+k.preise.gesamt || 0,
                ruestzeit:+k.zeiten.ruestzeit || 0,
                stueckzeit:+k.zeiten.stueckzeit || 0 };
  return {
    gerechnet:g.gerechnet, stueck,
    stueckGeaendert: stueck !== g.stueck,
    /* Womit gerechnet wurde, gehoert ins Ergebnis - sonst steht eine
       Zahl da, deren Herkunft niemand sieht. */
    maschine: m ? m.id : '', maschineName: m ? m.name : '',
    satz: ms ? ms.satz : null, satzEigen: !!(ms && ms.eigen),
    satzGattung: ms ? ms.gattung : null,
    alt, neu, ergebnis:k,
    /* Ein Cent und eine tausendstel Minute sind die Schwellen, unter
       denen niemand etwas merkt - und ueber denen jemand etwas merken
       MUSS. */
    gleich: Math.abs(neu.preis - alt.preis) < 0.005 &&
            Math.abs(neu.ruestzeit - alt.ruestzeit) < 0.001 &&
            Math.abs(neu.stueckzeit - alt.stueckzeit) < 0.001
  };
}

/* Den neuen Stand uebernehmen. Das ist ein Klick des Bedieners, nicht die
   Entscheidung der App - deshalb eine eigene Funktion und kein
   Nebeneffekt des Nachrechnens. Die Arbeitsgaenge werden dabei neu
   ausgeglichen, sonst stimmte ihre Summe nicht mehr. */
function auftragUebernehmen(a, nach){
  if(!a || !nach) return false;
  a.zeiten.ruestzeit = nach.neu.ruestzeit;
  a.zeiten.stueckzeit = nach.neu.stueckzeit;
  a.preis = nach.neu.preis;
  if(a.kalk){ a.kalk.gerechnet = nach.heute || a.kalk.gerechnet; a.kalk.stueck = nach.stueck; }
  if(Array.isArray(a.gaenge) && a.gaenge.length) gaengeAusgleichen(a);
  return true;
}

/* ---- Die Liste filtern und sortieren ---------------------------------
   Der Durchstich ueber den echten Bestand hat 36 Auftraege erzeugt,
   und das ist ein halbes Jahr. Eine Liste ohne Filter ist ab etwa
   zwanzig Zeilen keine Liste mehr, sondern ein Stapel.

   EIN FILTER DARF NICHTS HEIMLICH VERSTECKEN. Das ist die eine Gefahr
   dabei: wer seinen Auftrag nicht findet, sucht ihn in den Daten statt
   im Filter. Deshalb gibt auftraegeFiltern IMMER beide Zahlen zurueck -
   wieviele zu sehen sind und wieviele es gibt -, und die Oberflaeche
   schreibt sie hin, auch wenn nichts gefiltert ist.

   ZURUECK KOMMT DER PLATZ IN DER URSPRUENGLICHEN LISTE, nicht nur der
   Auftrag. Sonst zeigte jeder Knopf in der gefilterten Zeile auf den
   falschen Eintrag, sobald sortiert wird - ein Fehler, der beim Loeschen
   den falschen Auftrag trifft.                                        */
const WERKSTATT_SORTEN = ['termin', 'nummer', 'kunde', 'teil', 'preis', 'angelegt'];

function auftraegeFiltern(liste, f){
  const L = Array.isArray(liste) ? liste : [];
  const F = f || {};
  const status = String(F.status || 'alle');
  const text = String(F.text || '').trim().toLowerCase();
  const sorte = WERKSTATT_SORTEN.indexOf(F.sortieren) >= 0 ? F.sortieren : 'termin';

  const passt = (a) => {
    if(status === 'offen'){ if(WERKSTATT_STATUS_PLANT.indexOf(a.status) < 0) return false; }
    else if(status !== 'alle' && a.status !== status) return false;
    if(text){
      const wo = [a.nummer, a.kunde, a.teil, a.zeichnungsnr, a.werkstoff]
        .map(x => String(x || '').toLowerCase()).join(' ');
      if(wo.indexOf(text) < 0) return false;
    }
    return true;
  };

  const zeilen = L.map((a, platz) => ({a, platz})).filter(x => passt(x.a));

  /* Sortiert wird STABIL: bei gleichem Schluessel bleibt die Reihenfolge
     der Liste. Sonst springen Zeilen bei jedem Neuzeichnen. */
  const txt = (x) => String(x || '').toLowerCase();
  const cmp = {
    /* Ohne Termin ans Ende - ein leeres Datum ist kein frueher Termin. */
    termin: (p, q) => {
      const tp = p.a.liefertermin || '', tq = q.a.liefertermin || '';
      if(!tp && !tq) return 0;
      if(!tp) return 1;
      if(!tq) return -1;
      return tp < tq ? -1 : tp > tq ? 1 : 0;
    },
    nummer: (p, q) => txt(p.a.nummer) < txt(q.a.nummer) ? -1 : txt(p.a.nummer) > txt(q.a.nummer) ? 1 : 0,
    kunde:  (p, q) => txt(p.a.kunde) < txt(q.a.kunde) ? -1 : txt(p.a.kunde) > txt(q.a.kunde) ? 1 : 0,
    teil:   (p, q) => txt(p.a.teil) < txt(q.a.teil) ? -1 : txt(p.a.teil) > txt(q.a.teil) ? 1 : 0,
    /* Preis und Anlegedatum absteigend: das Groesste und das Neueste
       sind das, wonach man sucht. */
    preis:  (p, q) => (+q.a.preis || 0) - (+p.a.preis || 0),
    angelegt: (p, q) => {
      const tp = p.a.angelegt || '', tq = q.a.angelegt || '';
      return tp < tq ? 1 : tp > tq ? -1 : 0;
    }
  }[sorte];
  zeilen.sort((p, q) => cmp(p, q) || (p.platz - q.platz));

  return { zeilen, zahl:zeilen.length, gesamt:L.length,
           gefiltert: status !== 'alle' || !!text,
           status, text, sortieren:sorte };
}

/* ---- Lieferschein ----------------------------------------------------
   Das dritte Papier: Laufkarte fuer die Werkstatt, Zettel fuer die
   Maschine, Lieferschein fuer den Kunden.

   ER TRAEGT KEINE PREISE. Ein Lieferschein weist aus, WAS geliefert
   wurde; was es kostet, steht in der Rechnung. Wer beides mischt, hat
   den Preis auf jedem Packzettel stehen, den ein Fahrer in die Hand
   bekommt.

   DIE MENGE KOMMT AUS DER RUECKMELDUNG, wenn eine da ist - das ist die
   Zahl, die wirklich im Karton liegt. Ohne Rueckmeldung gilt die
   Auftragsmenge, und der Schein SAGT das im Klartext. Eine Menge, die
   aussieht wie gezaehlt und geraten ist, waere die schlimmste Zeile auf
   einem Lieferschein.

   Die Firmendaten kommen aus den Einstellungen und liegen NUR im
   Browser dieses Geraets - aus demselben Grund, aus dem in diesem Repo
   kein Name und keine Anschrift steht.                                */
function lieferschein(a, firma, heute){
  const A = a || {}, F = firma || {};
  const r = A.rueckmeldung || {};
  const gef = Math.max(0, Math.round(+r.gefertigt || 0));
  const bestellt = Math.max(1, Math.round(+A.stueck || 1));
  const menge = gef > 0 ? gef : bestellt;
  return {
    nummer: A.nummer ? 'L-' + A.nummer : '',
    auftrag: String(A.nummer || ''),
    datum: String(r.datum || heute || ''),
    kunde: String(A.kunde || ''),
    firma: { name:String(F.name || ''), strasse:String(F.strasse || ''),
             ort:String(F.ort || ''), telefon:String(F.telefon || ''),
             mail:String(F.mail || ''), ustid:String(F.ustid || '') },
    /* Ohne Name und Ort hat der Schein keinen Absender - das muss
       auffallen, bevor er beim Kunden liegt. */
    firmaGepflegt: !!(F.name && F.ort),
    menge, bestellt,
    ausRueckmeldung: gef > 0,
    ausschuss: Math.max(0, Math.round(+r.ausschuss || 0)),
    teil: String(A.teil || ''), zeichnungsnr: String(A.zeichnungsnr || ''),
    werkstoff: String(A.werkstoff || ''),
    /* Teillieferung ist ein eigener Fall und gehoert auf das Papier. */
    vollstaendig: menge >= bestellt,
    rest: Math.max(0, bestellt - menge),
    bemerkung: String(A.bemerkung || '')
  };
}

/* ---- Welche Maschine nimmt dieses Teil? -------------------------------
   Das ist der Punkt, den die App bisher nicht konnte. Geprueft wird die
   Gattung und der Arbeitsraum; eine Maschine OHNE gepflegten Arbeitsraum
   wird nicht ausgeschlossen, aber der Grund wird genannt - sonst wuerde
   ein Platzhalter still Auftraege verhindern.

   `gattung` uebersteuert die Gattung des Auftrags. Das braucht der zweite
   Arbeitsgang: ein Drehteil mit Fraesanteil ist als AUFTRAG ein Drehteil,
   sein zweiter Gang laeuft trotzdem auf der Fraese. 'alle' bietet jede
   aktive Maschine an und prueft den Arbeitsraum trotzdem - die Wahl trifft
   dann der Bediener, aber nicht blind.                                 */
function maschinenFuerAuftrag(a, maschinen, gattung){
  const liste = maschinen || WERKSTATT_MASCHINEN;
  const gat = gattung || a.gattung || (/^drehteil/.test(a.klasse || '') ? 'drehen'
            : /^fraesteil/.test(a.klasse || '') ? 'fraesen' : 'handarbeit');
  const raus = [];
  liste.forEach(m => {
    if(!m.aktiv) return;
    if(gat !== 'alle' && m.art !== gat) return;
    let passt = true, grund = '', unsicher = false;
    /* Der Raumvergleich haengt an der ART DER MASCHINE, nicht an der
       gesuchten Gattung - sonst wuerde bei 'alle' die Fraese nach
       Durchmesser und Laenge gemessen. */
    if(m.raum && m.art === 'drehen'){
      if(a.masse.dmax > m.raum.dmax + 1e-9){ passt = false; grund = 'Durchmesser ⌀' + a.masse.dmax + ' ueber ⌀' + m.raum.dmax; }
      else if(a.masse.laenge > m.raum.laenge + 1e-9){ passt = false; grund = 'Laenge ' + a.masse.laenge + ' ueber ' + m.raum.laenge; }
    } else if(m.raum && m.art === 'fraesen'){
      /* Das Teil darf gedreht aufgespannt werden: die drei Kanten
         sortiert gegen die sortierten Verfahrwege. */
      const t = [a.masse.x, a.masse.y, a.masse.z].sort((p, q) => q - p);
      const r = [m.raum.x, m.raum.y, m.raum.z].sort((p, q) => q - p);
      for(let i = 0; i < 3; i++) if(t[i] > r[i] + 1e-9){
        passt = false; grund = 'Kante ' + Math.round(t[i]) + ' ueber ' + r[i]; break;
      }
    }
    if(m.gepflegt === false && m.raum) unsicher = true;
    raus.push({ id:m.id, name:m.name, passt, grund,
                unsicher, satz:m.satz,
                hinweis: unsicher ? 'Arbeitsraum ist ein Platzhalter - die Aussage steht auf ungepflegten Massen.' : '' });
  });
  return raus;
}

/* ---- Vorschlag: die passende Maschine mit der wenigsten Arbeit -------
   BIS ZUM DURCHSTICH stand hier "die erste passende Maschine aus der
   Liste" - als Stamm-Entscheidung ehrlich, denn eine Optimierung kaeme
   mit der Belegung und nicht mit dem Stamm. Ueber den echten Bestand
   gefahren war das Ergebnis aber ein falsches Bild: alle 36 Auftraege
   auf der 1000er, die baugleiche 1500er bei null Stunden, und zwoelf
   Termine gerissen "weil die Maschine belegt ist".

   JETZT: unter den passenden Maschinen die mit der wenigsten schon
   eingeplanten Arbeit; bei Gleichstand die erste der Liste. Das ist EIN
   Satz und damit an der Maschine nachvollziehbar - kein Optimierer.

   Der dritte Parameter ist OPTIONAL. Ohne die Liste bleibt es bei der ersten
   passenden Maschine, genau wie vorher; kein Aufrufer im Bestand
   aendert dadurch sein Verhalten.

   WELCHE REGEL GILT, IST EINSTELLBAR (Blatt 4, Kapazitaet) - siehe
   WERKSTATT_MASCHINENWAHL unter maschineVorschlag.                    */
function maschineLast(maschinen, auftraege, plant){
  const last = {};
  (maschinen || []).forEach(m => { last[m.id] = 0; });
  const zaehlt = plant || WERKSTATT_STATUS_PLANT;
  (auftraege || []).forEach(a => {
    if(zaehlt.indexOf(a.status) < 0) return;
    const n = Math.max(1, Math.round(+a.stueck || 1));
    auftragGaenge(a).forEach(g => {
      if(last[g.maschine] === undefined) return;
      last[g.maschine] += g.ruestzeit + g.stueckzeit * n;
    });
  });
  return last;
}

/* ---- Wieviel Mensch steckt in einer Maschinenminute? -----------------
   RUESTEN zaehlt immer voll - da steht man dran. Bei der STUECKZEIT
   haengt es an der Maschine: am Handarbeitsplatz ist die Arbeit der
   Mensch (100 %), eine CNC laeuft einen Teil der Zeit allein.

   OHNE EIGENEN WERT gilt 100 % fuer Handarbeit und 60 % fuer alles mit
   einer Spindel - eine Annahme fuer Einzel- und Kleinserienfertigung,
   die als solche ausgewiesen wird. Wer laengere Zyklen faehrt oder
   einen Stangenlader hat, traegt weniger ein.

   0 ist erlaubt und heisst: laeuft voellig allein, nur das Ruesten
   kostet Zeit.                                                       */
function maschineMannAnteil(m){
  if(!m) return 1;
  const v = m.mannanteil;
  if(v != null && isFinite(+v) && +v >= 0 && +v <= 1) return +v;
  return m.art === 'handarbeit' ? 1 : 0.6;
}
/* Ist der Wert gesetzt oder ist es meine Annahme? Die Oberflaeche sagt
   den Unterschied, sonst haelt man 60 % fuer eine Messung. */
function maschineMannGepflegt(m){
  return !!(m && m.mannanteil != null && isFinite(+m.mannanteil));
}

/* ---- Welche der passenden Maschinen? ---------------------------------
   ZWEI REGELN STEHEN ZUR WAHL, und welche gilt, ist eine EINSTELLUNG:
     'last'  - die passende Maschine mit der wenigsten Arbeit. Das war die
               erste Fassung, und sie macht die Kapazitaetstafel ehrlich:
               ohne sie landete im Durchstich ueber 145 echte Dateien
               JEDER der 36 Auftraege auf der 1000er, und die 1500er bekam
               null Stunden.
     'klein' - die KLEINSTE passende Maschine. In vielen Werkstaetten die
               Hausregel: man legt ein kurzes Teil nicht auf die lange
               Bank, wenn die kurze frei ist - die grosse bleibt frei fuer
               das, was nur sie kann.

   Die Frage stand als Punkt 7 im Morgenbericht und wartete auf eine
   Antwort. Als Schalter ist sie eine Entscheidung, die man trifft, indem
   man sie ausprobiert und die Tafel ansieht - das ist ehrlicher als jede
   Begruendung, die ich mir ausdenken koennte.                         */
const WERKSTATT_MASCHINENWAHL = ['last', 'klein'];

/* Wie "gross" ist eine Maschine? Beim Drehen die DREHLAENGE - danach
   sucht man ein Teil aus - und bei Gleichstand der Durchmesser; beim
   Fraesen der Rauminhalt. Ohne Arbeitsraum gilt sie als die groesste:
   der Handarbeitsplatz nimmt jedes Teil, und "klein" darf ihn nicht zur
   ersten Wahl machen. */
function maschineGroesse(m){
  if(!m || !m.raum) return Infinity;
  if(m.art === 'drehen') return (+m.raum.laenge || 0) * 1e6 + (+m.raum.dmax || 0);
  return (+m.raum.x || 0) * (+m.raum.y || 0) * (+m.raum.z || 0);
}

function maschineVorschlag(a, maschinen, auftraege, regel){
  const k = maschinenFuerAuftrag(a, maschinen).filter(m => m.passt);
  if(!k.length) return '';
  const r = WERKSTATT_MASCHINENWAHL.indexOf(regel) >= 0 ? regel : 'last';
  if(r === 'klein'){
    /* Die kleinste passende - dafuer braucht es keine Auftragsliste.
       Bei Gleichstand bleibt es bei der ersten der Liste. */
    const gross = {};
    (maschinen || WERKSTATT_MASCHINEN).forEach(m => { gross[m.id] = maschineGroesse(m); });
    let beste = k[0];
    k.forEach(m => { if(gross[m.id] < gross[beste.id]) beste = m; });
    return beste.id;
  }
  if(!auftraege) return k[0].id;
  const last = maschineLast(maschinen, auftraege);
  let beste = k[0];
  k.forEach(m => { if((last[m.id] || 0) < (last[beste.id] || 0)) beste = m; });
  return beste.id;
}

/* ---- Die Sicherung ---------------------------------------------------
   EINE Datei, alles darin. Siehe Kopf des Patches fuer die Linie
   zwischen Betriebsdaten und Ansichtszustand.                         */
const SICHERUNG_VERSION = '1.0';
const SICHERUNG_KENNUNG = 'werkstatt-pipeline-sicherung';

/* Hat dieser Auftrag WIRKLICH eine Rueckmeldung? Ein leeres Feld
   {gefertigt:0, ausschuss:0, gaenge:[]} traegt jeder Auftrag, den
   jemand einmal geoeffnet hat - es ist keine Rueckmeldung, sondern das
   Formular dafuer. Gezaehlt wird, was jemand eingetragen HAT. */
function hatRueckmeldung(a){
  const r = a && a.rueckmeldung;
  if(!r) return false;
  if(+r.gefertigt > 0 || +r.ausschuss > 0) return true;
  if(String(r.datum || '').trim()) return true;
  return Array.isArray(r.gaenge) && r.gaenge.some(g =>
    g && (istZahl(g.ruestzeit) || istZahl(g.stueckzeit)));
}

function sicherungBauen(d){
  const e = d || {};
  const kopie = v => JSON.parse(JSON.stringify(v == null ? null : v));
  const auftraege = Array.isArray(e.auftraege) ? kopie(e.auftraege) : [];
  const maschinen = Array.isArray(e.maschinen) ? kopie(e.maschinen) : [];
  const frei = Array.isArray(e.frei) ? kopie(e.frei) : [];
  return {
    kennung: SICHERUNG_KENNUNG,
    version: SICHERUNG_VERSION,
    gesichert: String(e.heute || ''),
    /* Die Zaehlung steht IM Kopf, nicht nur in den Listen: wer die Datei
       in einem Texteditor oeffnet, soll in der ersten Zeile sehen, was
       drin ist, ohne 4000 Zeilen zu zaehlen. */
    enthaelt: {
      auftraege: auftraege.length,
      maschinen: maschinen.length,
      freieTage: frei.length,
      wartungstage: maschinen.reduce((s, m) => s + ((Array.isArray(m.wartung) && m.wartung.length) || 0), 0),
      rueckmeldungen: auftraege.filter(hatRueckmeldung).length,
      einstellungen: !!e.einstellungen
    },
    auftraege, maschinen, frei,
    regeln: e.regeln ? kopie(e.regeln) : null,
    einstellungen: e.einstellungen ? kopie(e.einstellungen) : null
  };
}

/* Beanstandungen einer gelesenen Datei; leer heisst brauchbar.
   GEPRUEFT WIRD DAS GERUEST, nicht der Inhalt jedes Auftrags - dafuer
   gibt es auftragPruefen, und ein einzelner krummer Auftrag darf eine
   Sicherung mit 200 guten nicht unbrauchbar machen. */
function sicherungPruefen(o){
  const f = [];
  if(!o || typeof o !== 'object') return ['Das ist keine Sicherungsdatei.'];
  if(o.kennung !== SICHERUNG_KENNUNG)
    f.push('Die Datei traegt nicht die Kennung einer Werkstatt-Sicherung.');
  if(typeof o.version !== 'string' || !o.version)
    f.push('Die Datei nennt keine Version.');
  else if(o.version.split('.')[0] !== SICHERUNG_VERSION.split('.')[0])
    f.push('Die Datei ist Version ' + o.version + ', diese App liest ' +
           SICHERUNG_VERSION + ' - das Format hat sich geaendert.');
  ['auftraege', 'maschinen', 'frei'].forEach(k => {
    if(!Array.isArray(o[k])) f.push('Der Abschnitt "' + k + '" fehlt oder ist keine Liste.');
  });
  if(Array.isArray(o.maschinen) && !o.maschinen.length)
    f.push('Die Datei enthaelt keine einzige Maschine - ohne Maschinen laesst sich nichts planen.');
  return f;
}

/* Was steckt WIRKLICH drin? Nicht der Kopf wird gezaehlt, sondern die
   Listen - ein Kopf laesst sich von Hand aendern, und dann stuende eine
   Zahl da, die nichts mit dem Inhalt zu tun hat. */
function sicherungZahlen(o){
  const a = (o && Array.isArray(o.auftraege)) ? o.auftraege : [];
  const m = (o && Array.isArray(o.maschinen)) ? o.maschinen : [];
  return {
    auftraege: a.length,
    maschinen: m.length,
    freieTage: (o && Array.isArray(o.frei)) ? o.frei.length : 0,
    wartungstage: m.reduce((s, x) => s + ((Array.isArray(x.wartung) && x.wartung.length) || 0), 0),
    rueckmeldungen: a.filter(hatRueckmeldung).length,
    regeln: !!(o && o.regeln),
    einstellungen: !!(o && o.einstellungen),
    gesichert: (o && o.gesichert) || ''
  };
}

/* DAZULADEN statt ersetzen. Zwei Regeln, und beide sind vorsichtig:

   1. Der VORHANDENE Auftrag gewinnt. Ohne Zeitstempel je Auftrag kann
      die App nicht wissen, welcher der neuere ist - und der vorhandene
      traegt vielleicht Rueckmeldungen von der Maschine, die in der
      Datei noch nicht stehen. Was uebersprungen wird, wird GEZAEHLT
      und benannt.
   2. Die STAMMDATEN bleiben, wie sie sind. Maschinen zu vereinen
      erzeugt Dubletten ("Monforts 1000" zweimal), und daran haengt die
      ganze Planung. Wer Maschinen uebernehmen will, ersetzt.

   Ein Auftrag OHNE Nummer laesst sich nicht abgleichen - er kommt dazu,
   und das ist die richtige Richtung: lieber einer zuviel, den man sieht
   und loescht, als einer zu wenig, den niemand vermisst.             */
function sicherungVereinen(jetzt, datei){
  const vorhanden = Array.isArray(jetzt) ? jetzt : [];
  const kommt = (datei && Array.isArray(datei.auftraege)) ? datei.auftraege : [];
  const kennt = {};
  vorhanden.forEach(a => { const n = String((a && a.nummer) || '').trim(); if(n) kennt[n] = true; });
  const dazu = [], uebersprungen = [];
  kommt.forEach(a => {
    const n = String((a && a.nummer) || '').trim();
    if(n && kennt[n]){ uebersprungen.push(n); return; }
    if(n) kennt[n] = true;
    dazu.push(JSON.parse(JSON.stringify(a)));
  });
  return { auftraege: vorhanden.concat(dazu), dazu: dazu.length, uebersprungen };
}

/* Welche Auftraege zeigen auf eine Maschine, die es hier nicht gibt?
   DAS IST DER FALL, DER STILL SCHADET: ein solcher Auftrag faellt aus
   der Planung, ohne dass jemand ihn vermisst - derselbe Befund wie beim
   Gang ohne Maschine. Nach jedem Dazuladen wird er genannt. */
function sicherungFremdeMaschinen(auftraege, maschinen){
  const da = {};
  (maschinen || []).forEach(m => { da[m.id] = true; });
  const raus = [];
  (auftraege || []).forEach(a => {
    auftragGaenge(a).forEach(g => {
      if(g.maschine && !da[g.maschine])
        raus.push({ nummer:String(a.nummer || ''), teil:String(a.teil || ''),
                    gang:g.nr, maschine:g.maschine });
    });
  });
  return raus;
}

/* ---- Demo-Werkstatt --------------------------------------------------
   Siehe Kopf dieses Pakets: erfundene Kunden, echte Musterteile,
   absichtlich ein paar Befunde darin.                                */
const DEMO_KUNDEN = ['Musterbau GmbH', 'Beispiel Antriebe KG', 'Demo Hydraulik',
                     'Probe Werkzeugbau', 'Muster Pumpen AG'];

/* tag(0) ist heute, tag(-7) vorige Woche, tag(14) in zwei Wochen. */
function demoWerkstatt(heute, maschinen){
  const M = maschinen || WERKSTATT_MASCHINEN;
  const h = planTag(heute) || planTag(planText(Date.now()));
  const tag = (n) => planText(planPlus(h, n));
  const drehen = M.filter(m => m.art === 'drehen')[0];
  const fraese = M.filter(m => m.art === 'fraesen')[0];
  const zweite = M.filter(m => m.art === 'drehen')[1] || drehen;

  /* [nummer, kunde, teil, klasse, gattung, maschine, stueck, ruest,
      stueck-zeit, status, liefertermin, preis] */
  const roh = [
    ['A-1041', 0, 'Welle glatt ⌀40x200',   'drehteil_einfach', 'drehen',   drehen, 120, 20, 3.9,  'geliefert',  tag(-6),  387],
    ['A-1042', 1, 'Buchse ⌀60x45',         'drehteil_einfach', 'drehen',   zweite, 200, 20, 2.9,  'geliefert',  tag(-2),  580],
    ['A-1043', 2, 'Flansch ⌀120',          'drehteil_fraes',   'drehen',   drehen,  60, 40, 9.3,  'laeuft',     tag(3),   234],
    ['A-1044', 0, 'Platte 200x120x12',     'fraesteil_3ax',    'fraesen',  fraese,  90, 45, 5.7,  'laeuft',     tag(5),   285],
    ['A-1045', 3, 'Lagerbock 120x80x60',   'fraesteil_3ax',    'fraesen',  fraese,  45, 45, 9.6,  'freigegeben',tag(2),   193],
    ['A-1046', 4, 'Stufenwelle ⌀50x200',   'drehteil_einfach', 'drehen',   zweite,  80, 20, 5.1,  'freigegeben',tag(9),   440],
    ['A-1047', 1, 'Deckel 90x90x10',       'fraesteil_3ax',    'fraesen',  fraese, 150, 45, 3.2,  'beauftragt', tag(12),  656],
    ['A-1048', 2, 'Lagerbuchse ⌀80/⌀60',   'drehteil_einfach', 'drehen',   drehen, 110, 20, 4.2,  'fertig',     tag(4),   254],
    ['A-1049', 3, 'Klotz 80x80x80',        'fraesteil_3ax',    'fraesen',  fraese,  30, 45, 12.4, 'laeuft',     tag(-1),  216],
    ['A-1050', 4, 'Platte mit Bohrung',    'fraesteil_3ax',    'fraesen',  fraese, 140, 45, 4.4,  'angeboten',  tag(24),  657]
  ];

  const masse = {
    'Welle glatt ⌀40x200':   {dmax:40,  laenge:200, x:0, y:0, z:0},
    'Buchse ⌀60x45':         {dmax:60,  laenge:45,  x:0, y:0, z:0},
    'Flansch ⌀120':          {dmax:120, laenge:40,  x:120, y:120, z:40},
    'Platte 200x120x12':     {dmax:0, laenge:0, x:200, y:120, z:12},
    'Lagerbock 120x80x60':   {dmax:0, laenge:0, x:120, y:80,  z:60},
    'Stufenwelle ⌀50x200':   {dmax:50,  laenge:200, x:0, y:0, z:0},
    'Deckel 90x90x10':       {dmax:0, laenge:0, x:90,  y:90,  z:10},
    'Lagerbuchse ⌀80/⌀60':   {dmax:80,  laenge:60,  x:0, y:0, z:0},
    'Klotz 80x80x80':        {dmax:0, laenge:0, x:80,  y:80,  z:80},
    'Platte mit Bohrung':    {dmax:0, laenge:0, x:160, y:100, z:15}
  };

  const raus = roh.map(r => {
    const a = neuerAuftrag();
    a.nummer = r[0];
    a.kunde = DEMO_KUNDEN[r[1]];
    a.teil = r[2];
    a.zeichnungsnr = 'Z-' + r[0].slice(2);
    a.werkstoff = /Platte|Klotz|Deckel|Lagerbock/.test(r[2]) ? 'S235' : 'C45';
    a.klasse = r[3];
    a.gattung = r[4];
    a.maschine = r[5] ? r[5].id : '';
    a.stueck = r[6];
    a.zeiten = {ruestzeit:r[7], stueckzeit:r[8]};
    a.status = r[9];
    a.liefertermin = r[10];
    a.preis = r[11];
    a.angelegt = tag(-30);
    a.masse = masse[r[2]] || {dmax:0, laenge:0, x:0, y:0, z:0};
    return a;
  });

  /* EIN AUFTRAG MIT ZWEI GAENGEN - der Flansch laeuft erst auf der
     Drehbank und dann auf der Fraese. Ohne den zeigt die Planung nie
     eine Gangkette. */
  const flansch = raus.filter(a => a.nummer === 'A-1043')[0];
  if(flansch && fraese){
    gaengeMaterialisieren(flansch);
    flansch.gaenge[0].name = 'Drehen';
    flansch.gaenge[0].ruestzeit = 20;
    flansch.gaenge[0].stueckzeit = 6.5;
    const g2 = gangAnhaengen(flansch, 'Fraesen', fraese.id);
    g2.ruestzeit = 20;
    g2.stueckzeit = 2.8;
  }

  /* ZWEI RUECKMELDUNGEN, absichtlich in beide Richtungen: einmal ging
     es schneller als kalkuliert, einmal langsamer. Ein Bestand, in dem
     alles genau aufgeht, zeigt die Soll-Ist-Rechnung als sinnlos. */
  const w1 = raus.filter(a => a.nummer === 'A-1041')[0];
  if(w1){
    w1.rueckmeldung.gefertigt = 120;
    w1.rueckmeldung.ausschuss = 0;
    w1.rueckmeldung.datum = tag(-6);
    istSetzen(w1, 1, 'ruestzeit', 24);
    istSetzen(w1, 1, 'stueckzeit', 4.4);      /* 13 % langsamer */
  }
  const w2 = raus.filter(a => a.nummer === 'A-1042')[0];
  if(w2){
    w2.rueckmeldung.gefertigt = 197;
    w2.rueckmeldung.ausschuss = 3;            /* und etwas Ausschuss */
    w2.rueckmeldung.datum = tag(-2);
    istSetzen(w2, 1, 'ruestzeit', 18);
    istSetzen(w2, 1, 'stueckzeit', 2.6);      /* 10 % schneller */
  }

  return {
    auftraege: raus,
    /* Ein freier Tag und eine Wartung, damit die Tafel beides zeigt. */
    frei: [tag(21)],
    wartung: {maschine: zweite ? zweite.id : '', tage: [tag(7), tag(8)]}
  };
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { WERKSTATT_VERSION, WERKSTATT_MASCHINEN, WERKSTATT_STATUS,
                     WERKSTATT_STATUS_PLANT, neuerAuftrag, auftragPruefen,
                     auftragAusKalkulation, maschinenFuerAuftrag, maschineVorschlag,
                     gangNeu, auftragGaenge, gaengeSumme, gaengeMaterialisieren,
                     gangAnhaengen, gangEntfernen, gaengeAusgleichen, gangHinweis,
                     fraesAnteil, gaengeVorschlagen,
                     DEMO_KUNDEN, demoWerkstatt,
                     SICHERUNG_VERSION, SICHERUNG_KENNUNG, sicherungBauen, hatRueckmeldung,
                     sicherungPruefen, sicherungZahlen, sicherungVereinen,
                     sicherungFremdeMaschinen,
                     istZahl, istGaenge, istSumme, istSetzen, lieferschein,
                     WERKSTATT_SORTEN, auftraegeFiltern,
                     kalkGrundlage, auftragNachrechnen, auftragUebernehmen, maschineSatz,
                     WERKSTATT_MASCHINENWAHL, maschineGroesse,
                     maschineMannAnteil, maschineMannGepflegt,
                     WERKSTATT_ARTEN, maschineNeu, maschineArtSetzen,
                     maschinePruefen, maschineBelegt };
}
