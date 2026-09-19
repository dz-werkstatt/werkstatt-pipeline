/* =====================================================================
   drehprofil.js — aus einem STEP-Drehkoerper die Drehkontur ablesen
   ---------------------------------------------------------------------
   Kein Abtasten, kein Naehern: Jede Flaeche eines Drehteils wird von
   KREISEN um die Rotationsachse begrenzt. Ein Zylinder r=10 mit
   Randkreisen bei a=2 und a=43 ist im Profil eine Gerade von z2 bis z43
   auf ⌀20 - abgelesen, mit allen Nachkommastellen des Modells.

     Zylinder -> Gerade parallel zur Achse
     Kegel    -> Schraege
     Torus    -> Radius am Uebergang
     Ebene    -> Planflaeche

   Gemessen an 145 echten STEP-Modellen: 37 davon sind Drehteile, und
   keines der gepruefen enthaelt eine Freiformflaeche.

   VERWENDUNG (DOM-frei, laeuft im Pruefstand wie im Browser):
     const p = fDrehProfil(fStepModell(text));
     p.aussen / p.innen   Konturen im Format der Dreh-App
     p.warnungen          was nicht gedeutet werden konnte
   ===================================================================== */

const DP_TOL = 0.02;          /* Punkte naeher als das gelten als derselbe */
const DP_ACHS_TOL = 0.01;     /* so nah muss ein Kreismittelpunkt an der Achse liegen */

function dpR3(v){ return Math.round(v * 1000) / 1000; }
function dpNorm(v){ const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/L, v[1]/L, v[2]/L]; }
function dpDot(a, b){ return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function dpNah(p, q){ return Math.abs(p.z - q.z) < DP_TOL && Math.abs(p.r - q.r) < DP_TOL; }

/* ---- Rotationsachse: die Richtung, die sich die meisten gekruemmten
   Flaechen teilen. Im gemessenen Bestand durchweg Y, nicht Z. --------- */
function dpAchse(modell){
  const z = {};
  (modell.flaechen || []).forEach(f => {
    if(f.art !== 'zylinder' && f.art !== 'kegel' && f.art !== 'torus') return;
    const a = f.achse || (f.rahmen && f.rahmen.z);
    if(!a) return;
    const n = dpNorm(a);
    /* Richtung und Gegenrichtung sind dieselbe Achse */
    const s = (n[2] < -1e-9 || (Math.abs(n[2]) < 1e-9 && n[1] < -1e-9)) ? n.map(v => -v) : n;
    const k = s.map(v => Math.abs(v) < 1e-6 ? 0 : Math.round(v * 1000) / 1000).join(',');
    z[k] = (z[k] || 0) + 1;
  });
  let best = null, n = 0;
  Object.keys(z).forEach(k => { if(z[k] > n){ n = z[k]; best = k; } });
  return best ? { richtung: best.split(',').map(Number), zahl: n } : null;
}

/* ---- Flaechen -> Segmente in der (z,r)-Halbebene ---------------------
   NUR Kreise, deren Mittelpunkt AUF der Achse liegt, sind Profilstellen.
   Ein Torus hat auch Querschnittskreise mit dem Rohrradius; ohne diesen
   Filter kam Unsinn heraus wie "⌀0,4 -> 34,6". */
function dpSegmente(modell, achse){
  const seg = [], warn = [];
  /* Flaechen, die NICHT um die Achse laufen, werden GEZAEHLT - sie sind
     das Mass fuer den Fraesanteil eines Teils. Ohne diese Zahl nennt die
     Ablehnung spaeter den falschen Grund: bei einem Teil mit angefraesten
     Flaechen reisst die Kette, und das sieht von aussen genauso aus wie
     eine gestufte Innenkontur. Am echten Bestand gemessen sind das zwei
     ganz verschiedene Faelle (8 Teile mit Fraesanteil gegen 1 Huelse). */
  let quer = 0, flaechen = 0;
  (modell.flaechen || []).forEach(f => {
    flaechen++;
    const stellen = [];
    (f.rand || []).forEach(lo => (lo.kanten || []).forEach(k => {
      if(!k.b || !k.b.c) return;
      const laengs = dpDot(k.b.c, achse);
      const q = [k.b.c[0] - achse[0]*laengs, k.b.c[1] - achse[1]*laengs, k.b.c[2] - achse[2]*laengs];
      if(Math.hypot(q[0], q[1], q[2]) >= DP_ACHS_TOL) return;
      stellen.push({ z: dpR3(laengs), r: dpR3(k.b.r) });
    }));
    if(stellen.length < 2){
      quer++;
      if(f.art !== 'ebene') warn.push(f.art + ' ohne zwei Umfangskreise');
      return;
    }
    stellen.sort((p, q) => p.z - q.z || p.r - q.r);
    const A = stellen[0], B = stellen[stellen.length - 1];
    if(Math.abs(A.z - B.z) < 1e-6 && Math.abs(A.r - B.r) < 1e-6) return;   /* entartet */
    const typ = f.art === 'zylinder' ? 'gerade'
              : f.art === 'kegel'    ? 'kegel'
              : f.art === 'torus'    ? 'bogen'
              : f.art === 'ebene'    ? 'plan' : null;
    if(!typ){ warn.push('Flaechenart ' + f.art + ' uebergangen'); return; }
    seg.push({ typ, p1:{z:A.z, r:A.r}, p2:{z:B.z, r:B.r},
               rB: f.art === 'torus' ? dpR3(f.r2 || 0) : null });
  });

  /* DOPPELTE SEGMENTE ENTFERNEN.
     Ein voller Zylinder wird im STEP haeufig als ZWEI Halbzylinder-
     Flaechen modelliert (ebenso Kegel und Tori). Beide Haelften tragen
     dieselben Randkreise und liefern damit dasselbe Profilsegment. Ohne
     diesen Filter haengt die Kettenbildung sie hintereinander, laeuft hin
     und zurueck, und die Kontur bekommt einen Ruecksprung - gemessen an
     485898 (ein schlichtes Rohr ⌀50/⌀13, 71 lang): 6 Segmente statt 4,
     zwei Ketten statt einer, zwei Ruecksprueunge. Gleich sind zwei
     Segmente, wenn Typ und beide Endpunkte uebereinstimmen, in welcher
     Reihenfolge auch immer. */
  const einfach = [];
  let doppelt = 0;
  seg.forEach(s => {
    const gleich = einfach.some(t => t.typ === s.typ &&
      ((dpNah(t.p1, s.p1) && dpNah(t.p2, s.p2)) || (dpNah(t.p1, s.p2) && dpNah(t.p2, s.p1))));
    if(gleich) doppelt++; else einfach.push(s);
  });
  if(doppelt) warn.push(doppelt + ' doppelte Flaeche(n) zusammengefasst');
  return { seg: einfach, warn, quer, flaechen };
}

/* ---- Segmente -> Ketten (Endpunkt an Endpunkt) ----------------------- */
function dpKetten(seg){
  const offen = seg.slice(), zuege = [];
  while(offen.length){
    const start = offen.shift();
    const zug = [start];
    let ende = start.p2, vorn = start.p1, weiter = true;
    while(weiter){
      weiter = false;
      for(let i = 0; i < offen.length; i++){
        const s = offen[i];
        const dreh = { typ:s.typ, p1:s.p2, p2:s.p1, rB:s.rB };
        if(dpNah(s.p1, ende)){ zug.push(s);    ende = s.p2; offen.splice(i,1); weiter = true; break; }
        if(dpNah(s.p2, ende)){ zug.push(dreh); ende = s.p1; offen.splice(i,1); weiter = true; break; }
        if(dpNah(s.p2, vorn)){ zug.unshift(s);    vorn = s.p1; offen.splice(i,1); weiter = true; break; }
        if(dpNah(s.p1, vorn)){ zug.unshift(dreh); vorn = s.p2; offen.splice(i,1); weiter = true; break; }
      }
    }
    zuege.push({ zug, geschlossen: dpNah(vorn, ende) });
  }
  /* laengste Kette zuerst - sie traegt das Teil */
  zuege.sort((a, b) => b.zug.length - a.zug.length);
  return zuege;
}

/* ---- Mantel und Bohrung trennen -------------------------------------
   DIE REGEL: Ein geschlossener Querschnitt laeuft einmal hin und einmal
   zurueck. Die beiden UMKEHRPUNKTE der z-Richtung sind die Stirnflaechen;
   dazwischen liegt auf der einen Seite der Mantel, auf der anderen die
   Bohrung.
   Zwei Vorgaenger dieser Regel sind gescheitert und stehen im LIESMICH:
   der mittlere Radius je Segment (am Zentrierstift widerlegt) und
   "Planflaeche am Kettenende" (die Huelse hat an einem Ende gar keine -
   dort laeuft die Kette ueber einen Kegel um). Die Umkehr ist das
   Merkmal, das jedes Rohr hat, unabhaengig von der Flaechenart. */
function dpTrennen(kette, geschlossen){
  const alle = kette.flatMap(s => [s.p1.z, s.p2.z]);
  const zMin = Math.min(...alle), zMax = Math.max(...alle);
  if(!geschlossen) return { aussen: kette, innen: [], zMin, zMax, voll: true };

  /* Richtung je Element; Planflaechen (dz = 0) erben die Richtung des
     Vorgaengers, damit sie keine falsche Umkehr melden. */
  const n = kette.length;
  const richtung = kette.map(s => {
    const dz = s.p2.z - s.p1.z;
    return Math.abs(dz) < 1e-9 ? 0 : (dz > 0 ? 1 : -1);
  });
  let letzte = 0;
  for(let i = 0; i < n * 2; i++){                 /* zweimal herum: der Ring hat keinen Anfang */
    const k = i % n;
    if(richtung[k] === 0) richtung[k] = letzte; else letzte = richtung[k];
  }
  /* Umkehrstellen suchen */
  const wende = [];
  for(let i = 0; i < n; i++){
    const v = richtung[i], w = richtung[(i + 1) % n];
    if(v !== 0 && w !== 0 && v !== w) wende.push(i);
  }
  if(wende.length !== 2){
    /* Kein sauberer Hin- und Rueckweg - lieber alles als Aussenkontur
       ausgeben und es sagen, als falsch zu trennen. */
    return { aussen: kette, innen: [], zMin, zMax,
             warn: 'kein eindeutiger Hin- und Rueckweg (' + wende.length + ' Umkehrstellen)' };
  }
  const [a, b] = wende;
  const A = [], B = [];
  for(let k = a + 1; k <= b; k++) A.push(kette[k]);
  for(let k = b + 1; k < n; k++) B.push(kette[k]);
  for(let k = 0; k <= a; k++) B.push(kette[k]);
  const mittel = (l) => l.length ? l.reduce((s, x) => s + (x.p1.r + x.p2.r) / 2, 0) / l.length : 0;
  const aussenIstA = mittel(A) >= mittel(B);
  return { aussen: aussenIstA ? A : B, innen: aussenIstA ? B : A, zMin, zMax };
}

/* ---- Segmentkette -> Kontur der Dreh-App -----------------------------
   Format dort: {kind:'gerade', z, x, trans:{type,val}} mit x als
   DURCHMESSER und z ab der Stirn ins Negative. Ein Torus ist kein
   eigenes Element, sondern ein 'radius' am Uebergang.
   NICHT SORTIEREN: die Kette ist bereits geordnet; ein Sortieren nach z
   zerreisst sie (am Zentrierstift sofort sichtbar). Zu entscheiden ist
   nur die Richtung - der Zug beginnt an der Stirn. */
function dpAlsKontur(liste, zMax){
  if(!liste.length) return [];
  const P = (p) => ({ z: dpR3(-(zMax - p.z)), x: dpR3(p.r * 2) });
  let folge = liste.slice();
  /* Richtung am ANFANGS- und ENDPUNKT DES ZUGES entscheiden, nicht am
     groessten z der beiden Randsegmente: bei einem Rohr tragen erstes und
     letztes Segment dasselbe Maximum (485898: beide 71), der Vergleich
     faellt dann immer gleich aus und die Kontur bleibt rueckwaerts. */
  const anfang = folge[0].p1, schluss = folge[folge.length - 1].p2;
  if(folge.length > 1 && anfang.z < schluss.z){
    folge = folge.slice().reverse().map(s => ({ typ:s.typ, p1:s.p2, p2:s.p1, rB:s.rB }));
  }
  const els = [];
  let letzter = null;
  folge.forEach(s => {
    if(s.typ === 'bogen'){
      if(els.length) els[els.length - 1].trans = { type:'radius', val: s.rB || 0 };
      letzter = s.p2;
      return;
    }
    if(!letzter || !dpNah(letzter, s.p1)) els.push({ kind:'gerade', ...P(s.p1), trans:{type:'none', val:0} });
    els.push({ kind:'gerade', ...P(s.p2), trans:{type:'none', val:0} });
    letzter = s.p2;
  });
  return els;
}

/* ---- Bohrungswand: die Innenkontur OHNE die Stirnflaechen -------------
   Die Trennung am Umkehrpunkt gibt der Innenkontur die hintere
   Stirnflaeche mit - beim Rohr endet sie als [[0,20],[-50,20],[-50,40]].
   Geometrisch ist das richtig (die Stirnflaeche gehoert zum Querschnitt),
   fuer die UEBERGABE an ein CAM aber nicht: dort ist die Bohrungswand
   gefragt, und ein Sprung auf den Aussendurchmesser liest sich als
   Bohrungsabsatz.

   DIE REGEL ist geometrisch, nicht geschaetzt: ein PLANSPRUNG NACH AUSSEN
   am Kettenende (gleiches z, groesserer ⌀) ist eine Stirnflaeche.
   Geprueft wird an beiden Enden, denn welches Ende die Stirn traegt,
   haengt an der Laufrichtung der Kette.

   EIN SCHWELLWERT WAERE HIER FALSCH, und das ist gemessen: der erste
   Versuch schnitt Endpunkte ueber 90 % von dmax ab. An der Spreitzhuelse
   (aussen ⌀155,2, Bohrung ⌀145,4 - ein RING mit 5 mm Wand) warf das die
   komplette Bohrungswand weg, 8 Punkte auf 2. Das sah nach einem Erfolg
   aus, weil das Spanvolumen von 2166 auf 194 cm3 fiel - in Wahrheit war
   der grosse Wert richtig: eine ⌀145-Bohrung aus einem ⌀160-Vollzylinder
   auszudrehen SIND rund 2100 cm3. Nicht die Zahl war falsch, sondern die
   Annahme, so ein Teil komme aus dem Vollen. Dasselbe gilt fuer 065.010
   (⌀156 aussen, ⌀150 Bohrung).

   GRENZE, ehrlich: ein KEGELIGER Uebergang zur Stirn (Fase an der
   Bohrungsmuendung) ist kein Plansprung und bleibt stehen - bei Lehre
   U206 Bearing etwa der Zug von ⌀63 auf ⌀71 ueber 1 mm. Das ist
   beabsichtigt: eine Muendungsfase gehoert zur Bohrung und wird
   mitgefertigt. Wo sie es nicht tut, faellt es beim Planer auf. */
function dpBohrungswand(innen){
  if(!innen || innen.length < 3) return (innen || []).slice();
  const w = innen.slice();
  const planNachAussen = (a, b) => Math.abs(a.z - b.z) < DP_TOL && b.x > a.x + DP_TOL;
  while(w.length > 2 && planNachAussen(w[w.length - 2], w[w.length - 1])) w.pop();
  while(w.length > 2 && planNachAussen(w[1], w[0])) w.shift();
  return w;
}

/* ---- alles zusammen -------------------------------------------------- */
function fDrehProfil(modell){
  const warnungen = [];
  const ach = dpAchse(modell);
  if(!ach) return { ok:false, grund:'keine Rotationsachse gefunden', warnungen };
  const { seg, warn, quer, flaechen } = dpSegmente(modell, ach.richtung);
  warn.forEach(w => { if(warnungen.indexOf(w) < 0) warnungen.push(w); });
  if(seg.length < 2) return { ok:false, achse:ach, warnungen, quer, flaechen,
    grund:'zu wenige Profilsegmente (' + seg.length + '): ' + quer + ' von ' + flaechen +
          ' Flaechen laufen nicht um die Achse' +
          (quer === flaechen ? ' - das ist kein Drehteil' : '') };
  const ketten = dpKetten(seg);
  const haupt = ketten[0];
  if(ketten.length > 1) warnungen.push(ketten.length + ' getrennte Ketten - nur die laengste genommen');
  const t = dpTrennen(haupt.zug, haupt.geschlossen);
  if(t.warn) warnungen.push(t.warn);
  const aussen = dpAlsKontur(t.aussen, t.zMax);
  const innen  = dpAlsKontur(t.innen,  t.zMax);

  /* SELBSTPRUEFUNG: Eine Drehkontur laeuft von der Stirn zum Futter, ohne
     zurueckzuspringen. Tut sie es doch, ist die Trennung nicht aufgegangen -
     dann wird das GESAGT statt eine falsche Kontur ausgeliefert.
     Der Fall dahinter (Huelse 2 Sauger): eine mehrfach gestufte Bohrung,
     die selbst umkehrt (z0 -> z22 -> z0 -> z55). Die Umkehrpunkt-Regel
     findet dort zwar zwei Wendestellen, aber die Bohrung hat weitere; eine
     Aussenkontur mit Ruecksprueungen waere fuer den Planer unbrauchbar und
     im schlimmsten Fall eine Bahn ins Material. */
  const spruenge = (l) => { let letzte = null, n = 0;
    l.forEach(e => { if(letzte !== null && e.z > letzte + 1e-6) n++; letzte = e.z; }); return n; };
  const rs = spruenge(aussen);
  if(rs){
    /* ZWEI GANZ VERSCHIEDENE URSACHEN, und die Ablehnung muss sie
       auseinanderhalten - die erste Fassung nannte bei ALLEN den
       gestuften Innenkontur-Fall und lag damit bei acht von neun Teilen
       daneben (am echten Bestand gemessen):

       OFFENE Kette = die Drehkontur ist UNTERBROCHEN. Ein Teil mit
       angefraesten Flaechen oder Querbohrungen hat dort, wo gefraest
       wurde, keine Flaeche um die Achse; die Kette findet keinen
       Anschluss und laeuft hin und zurueck. Das ist kein Fehler des
       Lesers, sondern ein Teil, das nicht rein gedreht wird.

       GESCHLOSSENE Kette mit mehr als zwei Umkehrstellen = die gestufte
       oder hinterschnittene Innenkontur (Huelse 2 Sauger: z0 -> z22 ->
       z0 -> z55). Dort greift die Trennung nicht.

       Gemessen: von 20 reinen Drehteilen liefern 19 ein Profil; die acht
       weiteren Ablehnungen sind Teile mit Fraesanteil. */
    const offen = !haupt.geschlossen;
    const grund = offen
      ? 'Drehkontur unterbrochen (' + rs + ' Ruecksprung' + (rs > 1 ? 'e' : '') + ' in z): ' +
        quer + ' von ' + flaechen + ' Flaechen laufen nicht um die Achse' +
        (ketten.length > 1 ? ', die Kette zerfaellt in ' + ketten.length + ' Stuecke' : '') +
        ' - das Teil hat einen Fraesanteil und wird nicht rein gedreht'
      : 'Aussenkontur nicht eindeutig trennbar (' + rs + ' Ruecksprung' + (rs > 1 ? 'e' : '') +
        ' in z) - gestufte oder hinterschnittene Innenkontur, die mehr als zweimal umkehrt';
    return { ok:false, grund, achse: ach.richtung, segmente: seg.length,
             quer, flaechen, ketten: ketten.length, geschlossen: haupt.geschlossen, warnungen };
  }
  return {
    ok: true,
    achse: ach.richtung,
    voll: !haupt.geschlossen,
    aussen,
    innen,
    innenWand: dpBohrungswand(innen),
    laenge: dpR3(t.zMax - t.zMin),
    dmax: dpR3(2 * Math.max(...haupt.zug.map(s => Math.max(s.p1.r, s.p2.r)))),
    segmente: seg.length,
    warnungen
  };
}

/* ---- Das Programm fuer die Dreh-App (19.09.2026, Luecke 4 des Berichts) ------------
   Format 'euroturn-cam-programm', Version 2 (radiale Wertung): Konturen als Element-
   listen mit einem START-Element (so beginnt in der Dreh-App jede Kontur - beim vollen
   Teil auf der Achse, beim Rohr an der Bohrungskante), das Rohteil aus den Rohteil-
   massen der Pipeline (mit Aufmass), KEINE Zyklen: die legt man in der Dreh-App an.
   Dort: Programme -> Importieren. */
function dpAlsDrehProgramm(p, d, V){
  if(!p || !p.ok || !p.aussen || !p.aussen.length) return null;
  const t = (d && d.teil) || {}, ro = (d && d.rohteil) || {}, m = ro.masse || {};
  const R = (V && V.rohteil) || {};
  const aufL = +R.aufmass_laenge || 2;
  const stirn = Math.max(1, dpR3(aufL / 2));
  const laenge = +m.l || dpR3(p.laenge + aufL);
  const rohD = +m.d || dpR3(p.dmax + (+R.aufmass_durchmesser || 3));
  const rohr = !p.voll && Array.isArray(p.innenWand) && p.innenWand.length >= 2;
  const start = (e) => ({ kind:'start', z:e.z, x:e.x, trans:{type:'none', val:0} });
  const kopie = (l) => l.map(e => ({ kind:e.kind || 'gerade', z:e.z, x:e.x, trans:{type:(e.trans && e.trans.type) || 'none', val:(e.trans && e.trans.val) || 0} }));
  const contours = [];
  if(p.voll) contours.push({ id:1, name:'Aussen', els:[start({z:0, x:0})].concat(kopie(p.aussen)) });
  else contours.push({ id:1, name:'Aussen', els:[start(p.aussen[0])].concat(kopie(p.aussen.slice(1))) });
  if(rohr) contours.push({ id:2, name:'Innen', els:[start(p.innenWand[0])].concat(kopie(p.innenWand.slice(1))) });
  const ziffern = String(t.zeichnungsnr || t.name || '').replace(/[^0-9]/g, '').slice(-8) || '9900';
  const progNo = ('00000000' + ziffern).slice(-8);
  return {
    format:'euroturn-cam-programm', version:2, wertung:'radial',
    datum:new Date().toISOString(), name:'O' + progNo,
    quelle:'werkstatt-pipeline', teil:{ name:String(t.name || ''), zeichnungsnr:String(t.zeichnungsnr || '') },
    settings:{ progNo:progNo, pkForm:rohr ? 'rohr' : 'zylinder', stockDia:String(rohD),
      pkXI:rohr ? String(+m.di || p.innenWand[0].x) : '0', pkZA:String(stirn), pkZI:String(dpR3(-(laenge - stirn))) },
    contours:contours, activeContourIdx:0, nextContourId:contours.length + 1, programSteps:[]
  };
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { fDrehProfil, dpAchse, dpSegmente, dpKetten, dpTrennen, dpAlsKontur, dpBohrungswand, dpAlsDrehProgramm };
}
