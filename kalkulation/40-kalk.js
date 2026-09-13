/* =====================================================================
   kalkulation/40-kalk.js — vom Teil zum Preis
   ---------------------------------------------------------------------
   Die Formeln stehen Wort fuer Wort im Lastenheft (Abschnitt 4); dieses
   Modul rechnet sie nach und sonst nichts. Es ist DOM-frei, damit der
   Pruefstand ein Handbeispiel gegenrechnen kann.

   JEDER POSTEN IST EINZELN SICHTBAR UND EINZELN UEBERSCHREIBBAR. Das
   ist keine Bequemlichkeit: eine Kalkulation, deren Zwischenschritte
   man nicht sieht, ist ein Orakel. Ein ueberschriebener Wert wird
   weitergerechnet und im Blatt hervorgehoben.

   ZWEI STELLEN, an denen das Lastenheft offen ist, und wie sie hier
   entschieden sind:
   1. Der BEARBEITBARKEITSFAKTOR der Werkstoffliste und die
      ZERSPANLEISTUNG der Gruppe wuerden einander doppelt zaehlen.
      Deshalb: die Zerspanleistung gilt fuer die GRUPPE, der Faktor nur
      noch fuer den Unterschied INNERHALB der Gruppe — bezogen auf den
      guenstigsten Werkstoff darin. Bei Stahl ist das S235; C45 braucht
      dann das 1,15-fache, 42CrMo4 das 1,4-fache.
   2. Die MASCHINE folgt der Klasse: Drehteile auf der Drehmaschine,
      Fraesteile auf der Fraese. Beim Drehteil mit Fraesanteil schlaegt
      der Mehraufwand ueber die hoehere Ruestzeit und die Nebenzeit je
      Bohrung zu Buche, nicht ueber einen zweiten Stundensatz.
   ===================================================================== */

const KALK_POSTEN = [
  'spanvolumen', 'hauptzeit', 'nebenzeit', 'pruefen', 'entgraten', 'stueckzeit',
  'gewicht', 'material', 'bearbeitung', 'ruesten', 'verpackung', 'versand',
  'zwischensumme', 'gewinn', 'einzelpreis'
];

function kalkWerkstoff(vorgaben, name){
  const L = (vorgaben && vorgaben.werkstoffe) || [];
  return L.filter(w => w.name === name)[0] || L[0] || null;
}
/* Der guenstigste Werkstoff seiner Gruppe ist der Bezug des Faktors. */
function kalkGruppenBasis(vorgaben, gruppe){
  const L = ((vorgaben && vorgaben.werkstoffe) || []).filter(w => w.gruppe === gruppe);
  if(!L.length) return 1;
  let m = L[0].faktor;
  L.forEach(w => { if(w.faktor < m) m = w.faktor; });
  return m > 0 ? m : 1;
}
function kalkMaschine(klasse){
  return (klasse === 'drehteil_einfach' || klasse === 'drehteil_fraes') ? 'drehen' : 'fraesen';
}

/* ein = {teil, rohteil, vorgaben, werkstoff, toleranz, oberflaeche,
          seiten, stueck, versandArt, ueber} */
function kalkRechnen(ein){
  const V = ein.vorgaben || KALK_VORGABEN;
  const t = ein.teil || {}, ro = ein.rohteil || {};
  const ueber = ein.ueber || {};
  const hinweise = [];
  const nimm = (schl, wert) => {
    const u = ueber[schl];
    return (u != null && isFinite(u)) ? {w:+u, ueberschrieben:true} : {w:wert, ueberschrieben:false};
  };

  const W = kalkWerkstoff(V, ein.werkstoff);
  if(!W) hinweise.push('Kein Werkstoff gewaehlt — Material bleibt unberuecksichtigt.');
  const gruppe = W ? W.gruppe : 'stahl';
  const maschine = kalkMaschine(t.klasse);
  const satz = (V.saetze && V.saetze[maschine]) || 60;
  const ruestSatz = (V.saetze && V.saetze.ruesten_wie_maschine) ? satz : ((V.saetze && V.saetze.ruesten) || satz);

  /* ---- Zeiten ---- */
  const rohV = +ro.volumen_cm3 || 0;
  const teilV = +t.volumen_cm3 || 0;
  const span0 = Math.max(0, rohV - teilV);
  const span = nimm('spanvolumen', span0);
  if(rohV > 0 && teilV <= 0)
    hinweise.push('Das Teilvolumen ist nicht bekannt. Als Spanvolumen gilt das ganze Rohteil — das ueberschaetzt die Zeit deutlich.');

  const Q0 = ((V.zerspanleistung && V.zerspanleistung[gruppe]) || {})[maschine] || 50;
  const basis = kalkGruppenBasis(V, gruppe);
  const faktor = W ? (W.faktor / basis) : 1;
  const haupt = nimm('hauptzeit', span.w / Q0 * faktor);

  const bohr = Array.isArray(t.bohrungen) ? t.bohrungen.length : 0;
  const seiten = Math.max(1, Math.round(+ein.seiten || 1));
  const Z = V.zeiten || {};
  const neben = nimm('nebenzeit',
    haupt.w * (Z.nebenzeit_anteil != null ? Z.nebenzeit_anteil : 0.25) +
    bohr * (Z.nebenzeit_je_bohrung != null ? Z.nebenzeit_je_bohrung : 0.3) +
    (seiten - 1) * (Z.nebenzeit_je_seite != null ? Z.nebenzeit_je_seite : 0.2));

  const pruefen = nimm('pruefen', Z.pruefen_je_teil != null ? Z.pruefen_je_teil : 2);
  const entgraten = nimm('entgraten',
    Math.max(Z.entgraten_min != null ? Z.entgraten_min : 1,
             (+t.kanten || 0) * (Z.entgraten_je_kante != null ? Z.entgraten_je_kante : 0.02)));

  const Zu = V.zuschlaege || {};
  const fTol = ein.toleranz === 'fein' ? (Zu.toleranz_fein || 1.4) : (Zu.toleranz_mittel || 1);
  const fObf = ein.oberflaeche === 'fein' ? (Zu.oberflaeche_fein || 1.3) : 1;
  const stueckzeit = nimm('stueckzeit', (haupt.w + neben.w) * fTol * fObf + pruefen.w + entgraten.w);

  const ruestMin = ((V.ruesten || {})[t.klasse] != null) ? V.ruesten[t.klasse] : 45;
  const stueck = Math.max(1, Math.round(+ein.stueck || 1));

  /* ---- Preise ---- */
  const dichte = W ? W.dichte : 0;
  const gewicht = nimm('gewicht', rohV * dichte / 1000);           /* cm3 * g/cm3 -> kg */
  const verschnitt = Zu.verschnitt != null ? Zu.verschnitt : 0.1;
  const material = nimm('material', gewicht.w * (W ? W.preis : 0) * (1 + verschnitt));
  if(W && W.gepflegt === false)
    hinweise.push('Der Materialpreis fuer ' + W.name + ' ist ein Platzhalter und noch zu pflegen.');
  /* Dieselbe Wache fuer die BETRIEBSWERTE. Sie stehen als runde Platzhalter in
     defaults.json, weil dieses Repo oeffentlich ist (Entscheid 13.09.2026) —
     ohne diesen Hinweis waere das eine Falle: ein Angebot auf 50 Euro die
     Stunde, ohne dass es jemand merkt. Sobald ein Satz im Blatt gestellt wird,
     setzt die Oberflaeche gepflegt auf true, und der Hinweis verschwindet. */
  if(V.saetze && V.saetze.gepflegt === false)
    hinweise.push('Die Stundensaetze sind Platzhalter (gerechnet mit ' + satz + ' Euro/h) und noch zu pflegen.');
  if(Zu && Zu.gepflegt === false)
    hinweise.push('Gewinnaufschlag und Mindestauftragswert sind Platzhalter und noch zu pflegen.');

  const bearbeitung = nimm('bearbeitung', stueckzeit.w / 60 * satz);
  const ruesten = nimm('ruesten', ruestMin / 60 * ruestSatz / stueck);
  const N = V.nebenkosten || {};
  const verpackung = nimm('verpackung',
    (N.verpackung_teil != null ? N.verpackung_teil : 0.5) +
    (N.verpackung_auftrag != null ? N.verpackung_auftrag : 8) / stueck);
  const abholung = ein.versandArt === 'abholung';
  const versand = nimm('versand', abholung ? 0 : (N.versand != null ? N.versand : 12) / stueck);

  const zwischen = nimm('zwischensumme',
    material.w + bearbeitung.w + ruesten.w + verpackung.w + versand.w);
  const gewinnSatz = Zu.gewinn != null ? Zu.gewinn : 0.2;
  const gewinn = nimm('gewinn', zwischen.w * gewinnSatz);
  const einzel = nimm('einzelpreis', zwischen.w + gewinn.w);

  const gesamtRoh = einzel.w * stueck;
  const mindest = Zu.mindestauftrag != null ? Zu.mindestauftrag : 80;
  const gesamt = Math.max(gesamtRoh, mindest);
  if(gesamt > gesamtRoh + 1e-9)
    hinweise.push('Der Mindestauftragswert von ' + fZahl(mindest, 2) + ' Euro greift (gerechnet waeren ' + fZahl(gesamtRoh, 2) + ').');

  return {
    maschine: maschine, satz: satz, ruestSatz: ruestSatz, werkstoff: W,
    faktoren: {toleranz:fTol, oberflaeche:fObf, werkstoff:faktor, zerspanleistung:Q0, verschnitt:verschnitt, gewinn:gewinnSatz},
    zeiten: {
      spanvolumen_cm3:span.w, hauptzeit:haupt.w, nebenzeit:neben.w, pruefen:pruefen.w,
      entgraten:entgraten.w, stueckzeit:stueckzeit.w, ruestzeit:ruestMin, stueck:stueck
    },
    preise: {
      gewicht_kg:gewicht.w, material:material.w, bearbeitung:bearbeitung.w, ruesten:ruesten.w,
      verpackung:verpackung.w, versand:versand.w, zwischensumme:zwischen.w, gewinn:gewinn.w,
      einzelpreis:einzel.w, gesamt:gesamt, mindestauftrag_greift:gesamt > gesamtRoh + 1e-9
    },
    ueberschrieben: {
      spanvolumen:span.ueberschrieben, hauptzeit:haupt.ueberschrieben, nebenzeit:neben.ueberschrieben,
      pruefen:pruefen.ueberschrieben, entgraten:entgraten.ueberschrieben, stueckzeit:stueckzeit.ueberschrieben,
      gewicht:gewicht.ueberschrieben, material:material.ueberschrieben, bearbeitung:bearbeitung.ueberschrieben,
      ruesten:ruesten.ueberschrieben, verpackung:verpackung.ueberschrieben, versand:versand.ueberschrieben,
      zwischensumme:zwischen.ueberschrieben, gewinn:gewinn.ueberschrieben, einzelpreis:einzel.ueberschrieben
    },
    hinweise: hinweise
  };
}

/* Die Staffel: nur die Ruestumlage und die auftragsbezogenen
   Nebenkosten fallen mit der Stueckzahl, alles andere bleibt. */
function kalkStaffel(ein){
  const V = ein.vorgaben || KALK_VORGABEN;
  const liste = (ein.staffel && ein.staffel.length) ? ein.staffel : (V.staffel || [1, 5, 10, 25, 50, 100]);
  return liste.map(n => {
    const r = kalkRechnen(Object.assign({}, ein, {stueck:n}));
    return {stueck:n, einzelpreis:r.preise.einzelpreis, gesamt:r.preise.gesamt,
      mindest:r.preise.mindestauftrag_greift};
  });
}

/* Gespeicherte Einstellungen ueber die Startwerte legen — Feld fuer
   Feld, damit ein spaeter dazugekommener Startwert nicht verloren geht
   (dieselbe Falle wie beim Werkzeuglager der Dreh-App: ein alter
   gespeicherter Stand verdeckte sonst jeden neuen Vorgabewert). */
function kalkMerge(vorgabe, gespeichert){
  const aus = fKopie(vorgabe);
  if(!gespeichert || typeof gespeichert !== 'object') return aus;
  const geh = (z, q) => {
    Object.keys(q).forEach(k => {
      if(k.charAt(0) === '_') return;
      const v = q[k];
      if(Array.isArray(v)) z[k] = fKopie(v);
      else if(v && typeof v === 'object') { if(!z[k] || typeof z[k] !== 'object') z[k] = {}; geh(z[k], v); }
      else if(v !== undefined && v !== null && v !== '') z[k] = v;
      else if(typeof v === 'boolean' || v === 0) z[k] = v;
    });
  };
  geh(aus, gespeichert);
  return aus;
}
