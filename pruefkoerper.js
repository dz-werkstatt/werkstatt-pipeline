/* =====================================================================
   pruefkoerper.js — STEP-Testkoerper erzeugen
   ---------------------------------------------------------------------
   Der Pruefstand braucht Festwerte, deren Volumen und Oberflaeche man im
   Kopf nachrechnen kann. Kundenmodelle taugen dafuer nicht: sie duerfen
   nicht ins oeffentliche Repo, und ihr wahrer Wert steht nirgends
   geschrieben. Also werden die Testkoerper hier ERZEUGT — als echte
   STEP-Dateien mit Randdarstellung, nicht als vereinfachte Attrappe.

   Quader 40 x 30 x 10:
       Volumen    = 12 000 mm3
       Oberflaeche = 2*(40*30 + 40*10 + 30*10) = 3 800 mm2
   Derselbe Quader mit einer durchgehenden Bohrung 10 mm in der Mitte:
       Volumen    = 12 000 - pi*25*10          = 11 214,601 mm3
       Oberflaeche = 3 800 - 2*pi*25 + pi*10*10 =  3 957,080 mm2

   Der zweite Koerper ist der wichtigere: seine Deckflaechen haben ein
   LOCH (eine zweite Randschleife, die andersherum laeuft), und seine
   Bohrungswand ist eine Flaeche, die einmal ganz herumlaeuft und von
   zwei getrennten Kreisen begrenzt wird. Genau daran ist die erste
   Fassung dieses Projekts gescheitert.
   ===================================================================== */
'use strict';

function stepBauen(){
  const Z = [];
  let n = 0;
  const satz = (s) => { n++; Z.push('#' + n + '=' + s + ';'); return '#' + n; };
  const pkt = (x, y, z) => satz("CARTESIAN_POINT('',(" + x + ',' + y + ',' + z + '))');
  const ri  = (x, y, z) => satz("DIRECTION('',(" + x + ',' + y + ',' + z + '))');
  const lage = (p, z, x) => satz("AXIS2_PLACEMENT_3D(''," + p + ',' + z + ',' + x + ')');
  const eckp = (p) => satz('VERTEX_POINT(\'\',' + p + ')');
  return {satz, pkt, ri, lage, eckp, Z,
    text(schale){
      const kopf =
"ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Pruefkoerper'),'2;1');\n" +
"FILE_NAME('pruefkoerper','2026-09-13T00:00:00',(''),(''),'','','');\n" +
"FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n";
      const einheit =
'#9001=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));\n' +
'#9002=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));\n';
      return kopf + einheit + Z.join('\n') + '\n' + schale + '\nENDSEC;\nEND-ISO-10303-21;\n';
    }};
}

/* Eine ebene Flaeche aus einem Ringzug von Punkten (in Weltkoordinaten),
   Normale n (zeigt nach aussen), dazu beliebig viele Lochschleifen. */
function ebeneFlaeche(B, ring, n, loecher){
  const {satz, pkt, ri, lage, eckp} = B;
  const kante = (a, b) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(d[0], d[1], d[2]) || 1;
    const p0 = pkt(a[0], a[1], a[2]);
    const rr = ri(d[0] / L, d[1] / L, d[2] / L);
    const v = satz('VECTOR(\'\',' + rr + ',' + L + ')');
    const li = satz('LINE(\'\',' + p0 + ',' + v + ')');
    return li;
  };
  const ecken = ring.map(p => eckp(pkt(p[0], p[1], p[2])));
  const kanten = [];
  for(let i = 0; i < ring.length; i++){
    const j = (i + 1) % ring.length;
    const ec = satz('EDGE_CURVE(\'\',' + ecken[i] + ',' + ecken[j] + ',' + kante(ring[i], ring[j]) + ',.T.)');
    kanten.push(satz('ORIENTED_EDGE(\'\',*,*,' + ec + ',.T.)'));
  }
  const loop = satz('EDGE_LOOP(\'\',(' + kanten.join(',') + '))');
  const bounds = [satz('FACE_OUTER_BOUND(\'\',' + loop + ',.T.)')];
  (loecher || []).forEach(L => bounds.push(satz('FACE_BOUND(\'\',' + L + ',.T.)')));
  /* Bezugsrichtung: irgendeine Richtung senkrecht zur Normalen */
  const h = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let x = [n[1] * h[2] - n[2] * h[1], n[2] * h[0] - n[0] * h[2], n[0] * h[1] - n[1] * h[0]];
  const lx = Math.hypot(x[0], x[1], x[2]) || 1; x = [x[0] / lx, x[1] / lx, x[2] / lx];
  const pl = satz('PLANE(\'\',' + lage(pkt(ring[0][0], ring[0][1], ring[0][2]), ri(n[0], n[1], n[2]), ri(x[0], x[1], x[2])) + ')');
  return satz('ADVANCED_FACE(\'\',(' + bounds.join(',') + '),' + pl + ',.T.)');
}

/* Kreisschleife in der Ebene z = zz um (cx,cy), Radius r.
   ccw = gegen den Uhrzeigersinn von +Z aus gesehen. */
function kreisSchleife(B, cx, cy, zz, r, ccw){
  const {satz, pkt, ri, lage, eckp} = B;
  const v0 = eckp(pkt(cx + r, cy, zz));
  const v1 = eckp(pkt(cx - r, cy, zz));
  const kr = () => satz('CIRCLE(\'\',' +
    lage(pkt(cx, cy, zz), ri(0, 0, 1), ri(1, 0, 0)) + ',' + r + ')');
  /* Zwei Halbboegen. Mit .T. an der EDGE_CURVE laeuft jeder gegen den
     Uhrzeigersinn; die Richtung der Schleife macht die Orientierung der
     ORIENTED_EDGE. */
  const a = satz('EDGE_CURVE(\'\',' + v0 + ',' + v1 + ',' + kr() + ',.T.)');
  const b = satz('EDGE_CURVE(\'\',' + v1 + ',' + v0 + ',' + kr() + ',.T.)');
  const o = ccw
    ? [satz('ORIENTED_EDGE(\'\',*,*,' + a + ',.T.)'), satz('ORIENTED_EDGE(\'\',*,*,' + b + ',.T.)')]
    : [satz('ORIENTED_EDGE(\'\',*,*,' + b + ',.F.)'), satz('ORIENTED_EDGE(\'\',*,*,' + a + ',.F.)')];
  return {loop: satz('EDGE_LOOP(\'\',(' + o.join(',') + '))'), kanten:[a, b], ecken:[v0, v1]};
}

function quader(l, br, h, loch){
  const B = stepBauen();
  const {satz, pkt, ri, lage} = B;
  const P = (x, y, z) => [x, y, z];
  const flaechen = [];
  const lochR = loch ? loch / 2 : 0;
  const cx = l / 2, cy = br / 2;

  /* Deckel oben (+Z) und Boden (-Z), bei Bedarf mit Loch */
  let lochOben = null, lochUnten = null;
  if(loch){
    lochOben  = kreisSchleife(B, cx, cy, h, lochR, false);   /* Loch laeuft andersherum als der Rand */
    lochUnten = kreisSchleife(B, cx, cy, 0, lochR, true);
  }
  flaechen.push(ebeneFlaeche(B, [P(0,0,h), P(l,0,h), P(l,br,h), P(0,br,h)], [0,0,1], lochOben ? [lochOben.loop] : null));
  flaechen.push(ebeneFlaeche(B, [P(0,0,0), P(0,br,0), P(l,br,0), P(l,0,0)], [0,0,-1], lochUnten ? [lochUnten.loop] : null));
  /* Vier Seiten, jede gegen den Uhrzeigersinn von aussen gesehen */
  flaechen.push(ebeneFlaeche(B, [P(0,0,0), P(l,0,0), P(l,0,h), P(0,0,h)], [0,-1,0], null));
  flaechen.push(ebeneFlaeche(B, [P(l,0,0), P(l,br,0), P(l,br,h), P(l,0,h)], [1,0,0], null));
  flaechen.push(ebeneFlaeche(B, [P(l,br,0), P(0,br,0), P(0,br,h), P(l,br,h)], [0,1,0], null));
  flaechen.push(ebeneFlaeche(B, [P(0,br,0), P(0,0,0), P(0,0,h), P(0,br,h)], [-1,0,0], null));

  if(loch){
    /* Bohrungswand: laeuft einmal ganz herum, begrenzt von zwei
       getrennten Kreisen. Das Material liegt AUSSEN, also zeigt die
       Flaechennormale zur Achse — same_sense ist .F. Die Schleifen
       laufen dann andersherum als bei einem Zapfen. */
    const unten = kreisSchleife(B, cx, cy, 0, lochR, false);
    const oben  = kreisSchleife(B, cx, cy, h, lochR, true);
    const zy = satz('CYLINDRICAL_SURFACE(\'\',' +
      lage(pkt(cx, cy, 0), ri(0, 0, 1), ri(1, 0, 0)) + ',' + lochR + ')');
    const b1 = satz('FACE_OUTER_BOUND(\'\',' + unten.loop + ',.T.)');
    const b2 = satz('FACE_BOUND(\'\',' + oben.loop + ',.T.)');
    flaechen.push(satz('ADVANCED_FACE(\'\',(' + b1 + ',' + b2 + '),' + zy + ',.F.)'));
  }
  const schale = '#8001=CLOSED_SHELL(\'\',(' + flaechen.join(',') + '));\n' +
    '#8002=MANIFOLD_SOLID_BREP(\'\',#8001);';
  return B.text(schale);
}

/* Kreisflaeche in der Ebene z = zz: Vollkreis oder Ring.
   raus = Aussenradius, rin = 0 fuer Vollkreis. Die Normale zeigt nach
   +Z bei oben = true, sonst nach -Z. */
function kreisFlaeche(B, cx, cy, zz, raus, rin, oben){
  const {satz, pkt, ri, lage} = B;
  const rand = kreisSchleife(B, cx, cy, zz, raus, oben);
  const bounds = [satz('FACE_OUTER_BOUND(\'\',' + rand.loop + ',.T.)')];
  if(rin > 0){
    const loch = kreisSchleife(B, cx, cy, zz, rin, !oben);
    bounds.push(satz('FACE_BOUND(\'\',' + loch.loop + ',.T.)'));
  }
  const n = oben ? 1 : -1;
  const pl = satz('PLANE(\'\',' + lage(pkt(cx, cy, zz), ri(0, 0, n), ri(1, 0, 0)) + ')');
  return satz('ADVANCED_FACE(\'\',(' + bounds.join(',') + '),' + pl + ',.T.)');
}

/* Zylindermantel ⌀d von z1 bis z2. aussen = Material liegt innen
   (Mantel eines Wellenabsatzes), sonst Bohrungswand. */
function mantel(B, cx, cy, z1, z2, r, aussen){
  const {satz, pkt, ri, lage} = B;
  const unten = kreisSchleife(B, cx, cy, z1, r, aussen);
  const oben  = kreisSchleife(B, cx, cy, z2, r, !aussen);
  const zy = satz('CYLINDRICAL_SURFACE(\'\',' +
    lage(pkt(cx, cy, z1), ri(0, 0, 1), ri(1, 0, 0)) + ',' + r + ')');
  const b1 = satz('FACE_OUTER_BOUND(\'\',' + unten.loop + ',.T.)');
  const b2 = satz('FACE_BOUND(\'\',' + oben.loop + ',.T.)');
  return satz('ADVANCED_FACE(\'\',(' + b1 + ',' + b2 + '),' + zy + ',' + (aussen ? '.T.' : '.F.') + ')');
}

/* ---------------------------------------------------------------------
   DREHTEIL: Stufenwelle oder Rohr, Achse = Z, Stirn bei z = 0.
   stufen = [[⌀, Laenge], ...] in Reihenfolge von z 0 aufwaerts.
   di = Bohrungs-⌀ durchgehend (0 = Vollmaterial).

   Warum ein eigener Koerper und nicht ein Kundenmodell: dasselbe
   Argument wie beim Quader oben - ein Kundenmodell darf nicht ins
   oeffentliche Repo, und sein wahres Profil steht nirgends geschrieben.
   Hier ist jede Zahl von Hand nachrechenbar.
   --------------------------------------------------------------------- */
function drehteil(stufen, di){
  const B = stepBauen();
  const flaechen = [];
  const cx = 0, cy = 0, ri2 = (di || 0) / 2;
  let z = 0;
  const kanten = [];                       /* z-Stellen der Absaetze */
  stufen.forEach((st, i) => {
    const r = st[0] / 2, l = st[1];
    flaechen.push(mantel(B, cx, cy, z, z + l, r, true));
    if(i > 0){
      /* Ringflaeche zwischen der vorigen und dieser Stufe; die Normale
         zeigt dorthin, wo kein Material steht. */
      const rv = stufen[i-1][0] / 2;
      const gross = Math.max(r, rv), klein = Math.min(r, rv);
      flaechen.push(kreisFlaeche(B, cx, cy, z, gross, klein, r < rv));
    }
    kanten.push(z);
    z += l;
  });
  /* Stirnflaechen: bei z 0 nach -Z, am Ende nach +Z; mit Bohrung als Ring */
  flaechen.push(kreisFlaeche(B, cx, cy, 0, stufen[0][0] / 2, ri2, false));
  flaechen.push(kreisFlaeche(B, cx, cy, z, stufen[stufen.length-1][0] / 2, ri2, true));
  if(ri2 > 0) flaechen.push(mantel(B, cx, cy, 0, z, ri2, false));

  const schale = '#8001=CLOSED_SHELL(\'\',(' + flaechen.join(',') + '));\n' +
    '#8002=MANIFOLD_SOLID_BREP(\'\',#8001);';
  return B.text(schale);
}

module.exports = {
  quader: quader,
  drehteil: drehteil,
  /* Die erwarteten Werte, von Hand gerechnet. */
  werte: {
    quader: {v:40 * 30 * 10, a:2 * (40 * 30 + 40 * 10 + 30 * 10)},
    quaderLoch: {
      v: 40 * 30 * 10 - Math.PI * 25 * 10,
      a: 2 * (40 * 30 + 40 * 10 + 30 * 10) - 2 * Math.PI * 25 + Math.PI * 10 * 10
    },
    /* Stufenwelle ⌀40 x 20 dann ⌀30 x 30, voll:
         dmax 40, Laenge 50
       Die Kontur laeuft ab der Stirn ins Negative; Stirn ist das Ende
       mit dem GROESSEREN STEP-z, hier also die ⌀30-Seite. */
    welle: {dmax:40, laenge:50, punkte:[[0,30], [-30,30], [-30,40], [-50,40]]},
    /* Rohr ⌀40 aussen, ⌀20 innen, 50 lang.
       EIGENE FEHLERWARTUNG, hier festgehalten: erwartet waren zwei
       nackte Mantelpunkte. Die STIRNFLAECHE gehoert aber mit in die
       Kontur - sie ist ein Plansprung von ⌀20 auf ⌀40 bei z 0 und wird
       abgedreht wie jedes andere Element. Die Trennung am Umkehrpunkt
       gibt die vordere Stirn der Aussen-, die hintere der Innenkontur. */
    rohr: {dmax:40, laenge:50,
           aussen:[[0,20], [0,40], [-50,40]],
           innen: [[0,20], [-50,20], [-50,40]]},
    /* Gestufte Huelse ⌀50 x 20 + ⌀40 x 30, Bohrung ⌀20 durchgehend */
    huelse: {dmax:50, laenge:50,
             aussen:[[0,20], [0,40], [-30,40], [-30,50], [-50,50]],
             innen: [[0,20], [-50,20], [-50,50]]}
  }
};
