/* =====================================================================
   import/31-geometrie.js — aus dem STEP-Modell werden Zahlen
   ---------------------------------------------------------------------
   Volumen, Oberflaeche, Rotation, Bohrungen, Rohteilvorschlag, Klasse.

   WIE DAS VOLUMEN GERECHNET WIRD, und warum so:
   Nach dem Satz von Gauss ist das Volumen eines Koerpers
       V = 1/3 * (Fluss des Ortsvektors durch seine Oberflaeche).
   Der Fluss zerfaellt in die Beitraege der einzelnen Flaechen. Jede
   Flaeche wird dafuer in ihre eigene PARAMETEREBENE gelegt (Ebene:
   zwei Achsen; Zylinder und Kegel: Winkel und Hoehe; Torus und Kugel:
   zwei Winkel), und das Flaechenintegral wird mit dem Satz von Green
   in ein RANDINTEGRAL verwandelt. Gerechnet wird also nur noch entlang
   der Flaechenraender, die der Leser ohnehin liefert.

   Der Gewinn ist nicht Schoenheit, sondern Genauigkeit: die Flaeche
   selbst wird NICHT in Dreiecke zerlegt, also entsteht dort auch kein
   Zerlegungsfehler. Eine Bohrung ist damit exakt ein Zylinder und
   nicht ein 60-Eck. Uebrig bleibt nur der Fehler der Randkurven, und
   der ist ueber die Bogenfeinheit steuerbar.

   Moeglich ist das, weil der Integrand fuer ALLE fuenf Flaechenarten
   dieselbe Gestalt hat:
       f(u,v) = A(v) + B(v)*cos(u/s) + C(v)*sin(u/s)
   Die Stammfunktion in u ist damit geschlossen hinschreibbar (fM), und
   das Randintegral laeuft mit einer Vier-Punkt-Gauss-Formel je
   Kantenstueck.

   WAS NICHT EXAKT IST, und das steht auch im Blatt: Freiformflaechen
   (B-Spline, Rotations- und Extrusionsflaechen) haben keine solche
   Parameterform. Sie werden ueber ihren Rand genaehert. Gemessen an
   127 echten Dateien sind 85 davon zu 100 Prozent frei von solchen
   Flaechen. Der genaeherte Anteil wird ausgewiesen — ein Preis soll
   nie auf einer stillen Schaetzung stehen.
   ===================================================================== */

/* ---- Vektorwerkzeug ---- */
const fV = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  kreuz: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  laenge: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L]; }
};

/* Vier-Punkt-Gauss auf [0,1]: exakt bis Grad 7. Die Stammfunktion M
   traegt Sinus und Kosinus, die ueber ein kurzes Kantenstueck fast
   linear verlaufen — vier Punkte sind dafuer reichlich. */
const F_GAUSS_T = [0.06943184420297371, 0.33000947820757187, 0.6699905217924281, 0.9305681557970263];
const F_GAUSS_W = [0.1739274225687269, 0.3260725774312731, 0.3260725774312731, 0.1739274225687269];

/* Massstab der Winkelachse. Frei waehlbar — die Kennwerte tragen ihn
   mit, und u = s*Winkel haelt beide Achsen in derselben Groessenordnung. */
function fSkala(f){
  if(f.art === 'zylinder' || f.art === 'kugel') return f.r > 1e-9 ? f.r : 1;
  if(f.art === 'kegel' || f.art === 'torus')    return f.r > 1e-9 ? f.r : 1;
  return 1;
}
/* Periode der Winkelachse (0 = nicht periodisch) */
function fPeriode(f){
  return (f.art === 'zylinder' || f.art === 'kegel' || f.art === 'torus' || f.art === 'kugel')
    ? 2 * Math.PI * fSkala(f) : 0;
}
function fPeriodeV(f){ return f.art === 'torus' ? 2 * Math.PI * (f.r2 || 1) : 0; }

/* Einmal je Flaeche: die Lage des Rahmenursprungs in seinen eigenen
   Achsen. Diese drei Zahlen tragen im Fluss den Abstand zum Nullpunkt. */
function fVor(f){
  if(f._vor) return f._vor;
  const R = f.rahmen;
  f._vor = R ? {px:fV.dot(R.p, R.x), py:fV.dot(R.p, R.y), pz:fV.dot(R.p, R.z), s:fSkala(f)}
             : {px:0, py:0, pz:0, s:1};
  return f._vor;
}

/* Weltpunkt -> Parameterebene (u,v) */
function fUV(f, p){
  const R = f.rahmen, d = fV.sub(p, R.p);
  const a = fV.dot(d, R.x), b = fV.dot(d, R.y), c = fV.dot(d, R.z);
  const s = fSkala(f);
  switch(f.art){
    case 'ebene':    return [a, b];
    case 'zylinder': return [s * Math.atan2(b, a), c];
    case 'kegel':    return [s * Math.atan2(b, a), c];
    case 'torus':    return [s * Math.atan2(b, a), (f.r2 || 1) * Math.atan2(c, Math.hypot(a, b) - f.r)];
    case 'kugel':    return [s * Math.atan2(b, a), f.r * Math.atan2(c, Math.hypot(a, b))];
  }
  return [a, b];
}
/* Parameterebene -> Weltpunkt (fuer die Vorschau und zum Nachmessen) */
function fXYZ(f, u, v){
  const R = f.rahmen, s = fSkala(f), th = u / s;
  const co = Math.cos(th), si = Math.sin(th);
  const er = [R.x[0] * co + R.y[0] * si, R.x[1] * co + R.y[1] * si, R.x[2] * co + R.y[2] * si];
  switch(f.art){
    case 'ebene':    return fV.add(R.p, fV.add(fV.mul(R.x, u), fV.mul(R.y, v)));
    case 'zylinder': return fV.add(R.p, fV.add(fV.mul(er, f.r), fV.mul(R.z, v)));
    case 'kegel':    return fV.add(R.p, fV.add(fV.mul(er, f.r + v * Math.tan(f.r2)), fV.mul(R.z, v)));
    case 'torus': {
      const ph = v / (f.r2 || 1);
      return fV.add(R.p, fV.add(fV.mul(er, f.r + f.r2 * Math.cos(ph)), fV.mul(R.z, f.r2 * Math.sin(ph))));
    }
    case 'kugel': {
      const ph = v / f.r;
      return fV.add(R.p, fV.add(fV.mul(er, f.r * Math.cos(ph)), fV.mul(R.z, f.r * Math.sin(ph))));
    }
  }
  return R.p;
}

/* Die Kennwerte A, B, C des Integranden bei der Hoehe v.
   was = 0: Mass der Flaeche   was = 1: Fluss des Ortsvektors
   Hergeleitet je Flaechenart aus der Normparametrisierung
   (ISO 10303-42); nachgerechnet ist jede in Pruefabschnitt 4. */
function fABC(f, v, was){
  const V = fVor(f), s = V.s;
  switch(f.art){
    case 'ebene':
      return was ? [V.pz, 0, 0] : [1, 0, 0];
    case 'zylinder':
      return was ? [f.r, V.px, V.py] : [1, 0, 0];
    case 'kegel': {
      const ta = Math.tan(f.r2), Rv = f.r + v * ta, k = Rv / s;
      if(!was) return [Math.abs(k) / Math.cos(f.r2), 0, 0];
      return [k * (f.r - ta * V.pz), k * V.px, k * V.py];
    }
    case 'torus': {
      const r2 = f.r2 || 1, ph = v / r2, co = Math.cos(ph), si = Math.sin(ph);
      const k = (f.r + r2 * co) / s;
      if(!was) return [Math.abs(k), 0, 0];
      return [k * (V.pz * si + (f.r + r2 * co) * co + r2 * si * si), k * co * V.px, k * co * V.py];
    }
    case 'kugel': {
      const ph = v / f.r, co = Math.cos(ph), si = Math.sin(ph);
      if(!was) return [Math.abs(co), 0, 0];
      return [co * (f.r + V.pz * si), co * co * V.px, co * co * V.py];
    }
  }
  return [0, 0, 0];
}

/* Stammfunktion in u:  M(u,v) = Integral von 0 bis u ueber A + B*cos(t/s) + C*sin(t/s) */
function fM(f, u, v, was){
  const abc = fABC(f, v, was), s = fVor(f).s;
  if(!abc[1] && !abc[2]) return abc[0] * u;
  const th = u / s;
  return abc[0] * u + abc[1] * s * Math.sin(th) - abc[2] * s * (Math.cos(th) - 1);
}

/* Randintegral ueber einen Streckenzug in der Parameterebene.
   Green: Flaechenintegral = Umlaufintegral von M dv. */
function fRandIntegral(f, pts, was){
  let summe = 0;
  for(let i = 0; i < pts.length; i++){
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const du = b[0] - a[0], dv = b[1] - a[1];
    if(!dv) continue;                       /* waagerechte Kante traegt nichts bei */
    let t = 0;
    for(let q = 0; q < 4; q++){
      const x = F_GAUSS_T[q];
      t += F_GAUSS_W[q] * fM(f, a[0] + du * x, a[1] + dv * x, was);
    }
    summe += t * dv;
  }
  return summe;
}

/* Eine Randschleife in die Parameterebene legen und dabei ENTWICKELN.
   Der Winkel springt bei Pi; ohne das Entwickeln wuerde aus einer
   Bohrung, deren Naht dort liegt, ein zerrissenes Gebilde. Zugleich
   ist das Entwickeln der Grund, warum eine ganze Bohrung ohne
   Sonderfall funktioniert: sie wird in der Parameterebene schlicht
   zum Rechteck. */
function fSchleifeUV(f, kanten){
  const per = fPeriode(f), perV = fPeriodeV(f);
  const pts = [];
  kanten.forEach(k => {
    for(let i = 0; i < k.p.length - 1; i++) pts.push(fUV(f, k.p[i]));
  });
  const letzte = kanten.length ? kanten[kanten.length - 1].p : null;
  if(letzte && letzte.length) pts.push(fUV(f, letzte[letzte.length - 1]));
  if(pts.length < 3) return null;
  const dicht = (w, vor, p) => {
    if(!p) return w;
    while(w - vor >  p / 2) w -= p;
    while(w - vor < -p / 2) w += p;
    return w;
  };
  for(let i = 1; i < pts.length; i++){
    pts[i][0] = dicht(pts[i][0], pts[i - 1][0], per);
    pts[i][1] = dicht(pts[i][1], pts[i - 1][1], perV);
  }
  /* Der Schlusspunkt ist derselbe RAUMpunkt wie der Anfangspunkt, sein
     entwickelter WINKEL aber nicht: an ihm steht, ob die Schleife einmal
     ganz um die Flaeche herumlaeuft. Das entscheidet weiter unten, ob
     sie fuer sich einen Bereich einschliesst oder erst zusammen mit
     einer zweiten.
     Er bleibt stehen. Ihn wegzulassen war ein stiller Fehler von 1,4
     Prozent auf jeder Mantelflaeche: der Kreis endete ein Segment vor
     sich selbst, und die Naht zur zweiten Schleife stand schraeg statt
     senkrecht. Bei einer geschlossenen Schleife ist er ein Punkt ohne
     Laenge und damit ohne Wirkung. */
  pts.umlauf = per ? Math.round((pts[pts.length - 1][0] - pts[0][0]) / per) : 0;
  return pts;
}

/* Eine Flaeche, die einmal GANZ um ihre Achse laeuft, hat in der
   Parameterebene keinen geschlossenen Rand: der Mantel einer Bohrung
   ist oben und unten von je einer Schleife begrenzt, und jede fuer sich
   schliesst nichts ein. Erst zusammen tun sie es.

   Das ist der haeufigste Fall ueberhaupt und war der erste grobe Fehler
   dieses Moduls: ohne diese Naht fehlten an einer Lehre zwei Drittel der
   Oberflaeche, weil jede Mantelflaeche nur den schmalen Saum ihrer
   eigenen Randschleife beisteuerte.

   Zusammengesetzt wird, indem die zweite Schleife um ganze Perioden
   verschoben wird, bis sie dort beginnt, wo die erste endet. Die beiden
   senkrechten Verbindungsstuecke sind die Schnittkante, an der man den
   Zylinder aufrollt. Loecher in derselben Flaeche wandern in dasselbe
   Fenster — der Integrand ist periodisch, seine Stammfunktion nicht. */
function fSchleifenVereinen(f, schleifen, per){
  const offen = [];
  schleifen.forEach((p, i) => { if(p.umlauf) offen.push(i); });
  if(!offen.length) return schleifen;

  let A = null, B = null, rest;
  if(offen.length === 2 && schleifen[offen[0]].umlauf + schleifen[offen[1]].umlauf === 0){
    A = schleifen[offen[0]]; B = schleifen[offen[1]];
    rest = schleifen.filter((_, i) => i !== offen[0] && i !== offen[1]);
  } else if(offen.length === 1){
    /* Nur EINE umlaufende Schleife: der Gegenpart ist eine entartete
       Linie — der Pol einer Kugel oder die Spitze eines Kegels. Die
       Flaeche liegt links vom Umlauf, also bei wachsendem Winkel oben. */
    A = schleifen[offen[0]];
    let vz = null;
    if(f.art === 'kugel') vz = A.umlauf > 0 ? f.r * Math.PI / 2 : -f.r * Math.PI / 2;
    else if(f.art === 'kegel' && Math.abs(Math.tan(f.r2)) > 1e-9) vz = -f.r / Math.tan(f.r2);
    if(vz == null) return null;
    const u0 = A[A.length - 1][0];
    B = [[u0, vz], [u0 - A.umlauf * per, vz]];
    B.umlauf = -A.umlauf;
    rest = schleifen.filter((_, i) => i !== offen[0]);
  } else return null;

  const k = Math.round((A[A.length - 1][0] - B[0][0]) / per);
  /* Beim Torus ist auch die ZWEITE Achse periodisch. Die beiden
     Schleifen werden getrennt entwickelt, und dabei kann dieselbe
     Stelle einmal als -180 und einmal als +180 Grad herauskommen. Aus
     einer Viertelkehle wird dann eine Dreiviertelkehle. Gewaehlt wird
     der Vertreter, der naeher an der ersten Schleife liegt — an einer
     Pruefvorrichtung lag das Volumen sonst um 2,9 Prozent daneben. */
  const perV = fPeriodeV(f);
  let kv = 0;
  if(perV > 0){
    const mv = (p) => { let s = 0; p.forEach(q => s += q[1]); return s / p.length; };
    kv = Math.round((mv(A) - mv(B)) / perV);
  }
  const Bv = (k || kv) ? B.map(p => [p[0] + k * per, p[1] + kv * perV]) : B;
  const vereint = A.concat(Bv);
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  vereint.forEach(p => {
    if(p[0] < umin) umin = p[0]; if(p[0] > umax) umax = p[0];
    if(p[1] < vmin) vmin = p[1]; if(p[1] > vmax) vmax = p[1];
  });
  const mu = (umin + umax) / 2, mvv = (vmin + vmax) / 2;
  const geschoben = rest.map(p => {
    let cu = 0, cv = 0; p.forEach(q => { cu += q[0]; cv += q[1]; });
    cu /= p.length; cv /= p.length;
    const ku = Math.round((mu - cu) / per);
    const kw = perV > 0 ? Math.round((mvv - cv) / perV) : 0;
    return (ku || kw) ? p.map(q => [q[0] + ku * per, q[1] + kw * perV]) : p;
  });
  return [vereint].concat(geschoben);
}

/* Flaecheninhalt und Flussbeitrag EINER Flaeche. */
function fFlaecheWerte(f){
  if(f.art === 'frei' || !f.rahmen) return fFreiWerte(f);
  const per = fPeriode(f);
  let schleifen = [];
  for(const lo of f.rand){
    const pts = fSchleifeUV(f, lo.kanten);
    if(pts) schleifen.push(pts);
  }
  if(!schleifen.length) return {flaeche:0, fluss:0, genaehert:false, sinnOk:true, offen:false};
  let offen = false;
  if(per > 0){
    const vereint = fSchleifenVereinen(f, schleifen, per);
    if(vereint) schleifen = vereint;
    else offen = true;          /* Randlage, die die App nicht deuten kann */
  }
  let mass = 0, fluss = 0;
  schleifen.forEach(pts => {
    mass  += fRandIntegral(f, pts, 0);
    fluss += fRandIntegral(f, pts, 1);
  });
  return {flaeche:Math.abs(mass), fluss:fluss, genaehert:false,
    sinnOk:(mass >= 0) === !!f.sinn, offen:offen};
}

/* Freiformflaechen: es gibt keine Parameterform, also wird der Rand
   vom Schwerpunkt aus in Dreiecke gelegt. Das ist eine NAEHERUNG —
   sie stimmt genau dann, wenn die Flaeche eben ist, und wird mit
   zunehmender Woelbung schlechter. Der Anteil solcher Flaechen steht
   im Bericht. Die Schleifenrichtung ist nach der Norm gegen den
   Uhrzeigersinn um die AUSSENnormale; Loecher laufen andersherum und
   ziehen sich dadurch von selbst ab. */
function fFreiWerte(f){
  let flaeche = 0, fluss = 0;
  for(const lo of f.rand){
    const p = [];
    lo.kanten.forEach(k => { for(let i = 0; i < k.p.length - 1; i++) p.push(k.p[i]); });
    if(p.length < 3) continue;
    const c = [0, 0, 0];
    p.forEach(q => { c[0] += q[0]; c[1] += q[1]; c[2] += q[2]; });
    c[0] /= p.length; c[1] /= p.length; c[2] /= p.length;
    for(let i = 0; i < p.length; i++){
      const a = p[i], b = p[(i + 1) % p.length];
      const n = fV.kreuz(fV.sub(a, c), fV.sub(b, c));     /* 2 * Flaechenvektor */
      flaeche += 0.5 * fV.laenge(n);
      fluss   += 0.5 * fV.dot(c, n);
    }
  }
  return {flaeche:flaeche, fluss:fluss, genaehert:true, sinnOk:true};
}

/* ---- Volumen und Oberflaeche des ganzen Modells ---- */
function fKoerperWerte(modell){
  let vol = 0, flaeche = 0, freiFlaeche = 0, sinnSchief = 0, offen = 0;
  const ohneKoerper = !modell.koerper.length;
  modell.flaechen.forEach(f => {
    const w = fFlaecheWerte(f);
    f._w = w;
    flaeche += w.flaeche;
    if(w.genaehert) freiFlaeche += w.flaeche;
    if(!w.sinnOk) sinnSchief++;
    if(w.offen) offen++;
    /* Nur Flaechen an einer geschlossenen Schale umschliessen Volumen. */
    if(f.koerper >= 0) vol += w.fluss;
  });
  vol /= 3;
  return {
    volumen_mm3: ohneKoerper ? null : vol,
    flaeche_mm2: flaeche,
    genaehert_anteil: flaeche > 0 ? freiFlaeche / flaeche : 0,
    sinnSchief: sinnSchief,
    offen: offen
  };
}

/* ---- Rotationssymmetrie ----------------------------------------------
   Gesucht ist EINE Achse, um die sich (fast) alles dreht. Kandidaten
   sind die Achsen aller Zylinder, Kegel, Tori und Kugeln, gewichtet
   mit ihrem Flaecheninhalt; dazu die Normalen der Ebenen (eine Plan-
   flaeche steht senkrecht zur Drehachse). Eine Flaeche gilt als
   drehsymmetrisch, wenn sie koaxial zur Achse liegt (Zylinder, Kegel,
   Torus, Kugel) oder als Ebene senkrecht dazu steht.

   Nicht die Richtung allein zaehlt, sondern die ACHSLINIE: zwei
   parallele Bohrungen nebeneinander machen kein Drehteil. */
function fRotation(modell){
  const F = modell.flaechen.filter(f => f._w && f._w.flaeche > 1e-9);
  if(!F.length) return {ja:false, achse:'Z', dmax:0, laenge:0, innen:false, anteil:0, gerade:null};

  const kand = [];
  F.forEach(f => {
    if(f.art === 'zylinder' || f.art === 'kegel' || f.art === 'torus'){
      kand.push({r:fV.norm(f.rahmen.z), p:f.rahmen.p.slice(), g:f._w.flaeche});
    }
  });
  if(!kand.length) return {ja:false, achse:'Z', dmax:0, laenge:0, innen:false, anteil:0, gerade:null};

  /* Kandidaten buendeln: gleiche Richtung UND gleiche Achslinie */
  const gruppen = [];
  kand.forEach(k => {
    for(const g of gruppen){
      if(Math.abs(fV.dot(g.r, k.r)) > 0.9999){
        const d = fV.sub(k.p, g.p);
        const quer = fV.sub(d, fV.mul(g.r, fV.dot(d, g.r)));
        if(fV.laenge(quer) < 0.02){ g.g += k.g; return; }
      }
    }
    gruppen.push({r:k.r, p:k.p, g:k.g});
  });
  gruppen.sort((a, b) => b.g - a.g);
  const A = gruppen[0];

  /* Wie viel Flaeche dreht sich wirklich um diese Achse? */
  let dreh = 0, ganz = 0, innen = false, dmax = 0, zmin = Infinity, zmax = -Infinity;
  F.forEach(f => {
    ganz += f._w.flaeche;
    let ok = false;
    if(f.art === 'ebene'){
      ok = Math.abs(fV.dot(fV.norm(f.rahmen.z), A.r)) > 0.9995;
    } else if(f.rahmen){
      if(Math.abs(fV.dot(fV.norm(f.rahmen.z), A.r)) > 0.9995){
        const d = fV.sub(f.rahmen.p, A.p);
        const quer = fV.sub(d, fV.mul(A.r, fV.dot(d, A.r)));
        ok = fV.laenge(quer) < 0.02;
      }
    }
    if(ok) dreh += f._w.flaeche;
    /* Groesster Durchmesser und Laenge ueber ALLE Randpunkte */
    f.rand.forEach(lo => lo.kanten.forEach(k => k.p.forEach(p => {
      const d = fV.sub(p, A.p), l = fV.dot(d, A.r);
      const q = fV.laenge(fV.sub(d, fV.mul(A.r, l)));
      if(q > dmax) dmax = q;
      if(l < zmin) zmin = l;
      if(l > zmax) zmax = l;
    })));
    /* Innenbearbeitung: ein koaxialer Zylinder, dessen Flaeche zur
       Achse hin zeigt (Bohrung statt Zapfen). */
    if(f.art === 'zylinder' && !f.sinn && f.rahmen &&
       Math.abs(fV.dot(fV.norm(f.rahmen.z), A.r)) > 0.9995) innen = true;
  });
  const anteil = ganz > 0 ? dreh / ganz : 0;
  const nam = ['X', 'Y', 'Z'];
  let bi = 0; for(let i = 1; i < 3; i++) if(Math.abs(A.r[i]) > Math.abs(A.r[bi])) bi = i;
  return {ja:anteil >= 0.9, achse:nam[bi], dmax:2 * dmax, laenge:zmax - zmin,
    innen:innen, anteil:anteil, gerade:{r:A.r, p:A.p}};
}

/* ---- Bohrungen -------------------------------------------------------
   Eine Bohrung ist eine Zylinderflaeche, deren Material AUSSEN liegt —
   der Sinn der Flaeche zeigt zur Achse hin. Mehrere Teilflaechen
   derselben Bohrung (etwa durch eine Quernut getrennt) werden ueber
   Achslinie und Radius zusammengefasst.
   DURCHGEHEND oder nicht: gesucht wird ein Boden, also eine koaxiale
   Ebene oder ein koaxialer Kegel (Bohrerspitze) mit hoechstens dem
   Bohrungsradius, an einem der beiden Enden. Findet sich keiner, gilt
   die Bohrung als durchgehend. */
function fBohrungen(modell){
  const roh = [];
  modell.flaechen.forEach(f => {
    if(f.art !== 'zylinder' || !f.rahmen || f.sinn) return;   /* sinn=false: Normale nach innen */
    if(!(f.r > 1e-6)) return;
    let lo = Infinity, hi = -Infinity;
    f.rand.forEach(l => l.kanten.forEach(k => k.p.forEach(p => {
      const t = fV.dot(fV.sub(p, f.rahmen.p), f.rahmen.z);
      if(t < lo) lo = t; if(t > hi) hi = t;
    })));
    if(!isFinite(lo)) return;
    roh.push({r:f.r, achse:fV.norm(f.rahmen.z), p:f.rahmen.p, lo:lo, hi:hi});
  });
  const grp = [];
  roh.forEach(b => {
    for(const g of grp){
      if(Math.abs(b.r - g.r) < 0.01 && Math.abs(fV.dot(g.achse, b.achse)) > 0.9995){
        const d = fV.sub(b.p, g.p);
        const quer = fV.sub(d, fV.mul(g.achse, fV.dot(d, g.achse)));
        if(fV.laenge(quer) < 0.02){
          const s = fV.dot(d, g.achse);
          g.lo = Math.min(g.lo, b.lo + s); g.hi = Math.max(g.hi, b.hi + s);
          return;
        }
      }
    }
    grp.push({r:b.r, achse:b.achse, p:b.p, lo:b.lo, hi:b.hi});
  });
  /* Boden suchen.
     TEMPOHINWEIS: an einer Grundplatte mit 182 Bohrungen und 277
     Flaechen war das anfangs der langsamste Teil der ganzen App
     (2,1 von 3,2 Sekunden), weil jede Bohrung jede Flaeche Punkt fuer
     Punkt abtastete. Jetzt liegen Achse, Schwerpunkt und Umkreis je
     Flaeche EINMAL bereit, und ein Boden muss mittig in der Bohrung
     sitzen — damit fallen fast alle Paarungen mit einer einzigen
     Abstandsrechnung weg. */
  const kand = [];
  modell.flaechen.forEach(f => {
    if(!f.rahmen || (f.art !== 'ebene' && f.art !== 'kegel')) return;
    const P = [];
    f.rand.forEach(l => l.kanten.forEach(k => k.p.forEach(p => P.push(p))));
    if(!P.length) return;
    const c = [0, 0, 0];
    P.forEach(p => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
    c[0] /= P.length; c[1] /= P.length; c[2] /= P.length;
    let um = 0;
    P.forEach(p => { const q = fV.laenge(fV.sub(p, c)); if(q > um) um = q; });
    kand.push({z:fV.norm(f.rahmen.z), c:c, um:um, P:P});
  });
  grp.forEach(g => {
    let boden = false;
    for(const f of kand){
      if(boden) break;
      if(Math.abs(fV.dot(f.z, g.achse)) < 0.9995) continue;
      /* Ein Boden sitzt mittig in der Bohrung. Liegt schon sein
         Schwerpunkt weiter als Bohrungsradius plus Umkreis daneben,
         kann keiner seiner Punkte hineinreichen. */
      const dc = fV.sub(f.c, g.p), tc = fV.dot(dc, g.achse);
      if(fV.laenge(fV.sub(dc, fV.mul(g.achse, tc))) > g.r + f.um + 0.02) continue;
      if(tc + f.um < g.lo - 0.05 || tc - f.um > g.hi + 0.05) continue;
      let rmax = 0, tmin = Infinity, tmax = -Infinity;
      for(const p of f.P){
        const dx = p[0] - g.p[0], dy = p[1] - g.p[1], dz = p[2] - g.p[2];
        const t = dx * g.achse[0] + dy * g.achse[1] + dz * g.achse[2];
        const qx = dx - g.achse[0] * t, qy = dy - g.achse[1] * t, qz = dz - g.achse[2] * t;
        const q = Math.sqrt(qx * qx + qy * qy + qz * qz);
        if(q > rmax){ rmax = q; if(rmax > g.r + 0.02) break; }
        if(t < tmin) tmin = t; if(t > tmax) tmax = t;
      }
      if(rmax > g.r + 0.02) continue;               /* breiter als die Bohrung: kein Boden */
      if(tmax < g.lo - 0.05 || tmin > g.hi + 0.05) continue;
      boden = true;
    }
    g.durch = !boden;
  });
  return grp.map(g => ({d:fRund(2 * g.r, 3), tiefe:fRund(g.hi - g.lo, 3), durch:!!g.durch}))
            .sort((a, b) => b.d - a.d);
}

/* ---- Sechskant erkennen ---------------------------------------------
   Sechs ebene Flaechen, deren Normalen quer zur Achse stehen, alle im
   selben Abstand von ihr, und zwar AUSSEN: bei einem Sechskant ist die
   Schluesselweite das Mass ueber die Flaechen, der groesste Durchmesser
   das Mass ueber die Ecken, und beide haengen fest zusammen
   (SW = dmax * Wurzel(3) / 2).

   Die letzte Bedingung ist der Grund fuer diesen Kommentar: ohne sie
   hat die Erkennung an einer Lehre mit sechs Schlitzen angeschlagen.
   Deren Schlitzflanken stehen auch quer zur Achse und auch im selben
   Abstand — nur eben INNEN. Das Rohteil wurde dadurch kleiner als das
   Fertigteil vorgeschlagen, im Bild als Sechskant mitten im Werkstueck
   zu sehen. */
function fSechskant(modell, achse, dmax){
  if(!achse || !(dmax > 0)) return null;
  const n = [];
  modell.flaechen.forEach(f => {
    if(f.art !== 'ebene' || !f.rahmen || !f._w || f._w.flaeche < 1e-6) return;
    const z = fV.norm(f.rahmen.z);
    if(Math.abs(fV.dot(z, achse.r)) > 0.01) return;   /* Normale muss quer zur Achse stehen */
    n.push(Math.abs(fV.dot(fV.sub(f.rahmen.p, achse.p), z)));
  });
  if(n.length < 6) return null;
  const soll = dmax * Math.sqrt(3) / 2;               /* Schluesselweite eines Sechskants */
  const passend = n.filter(a => Math.abs(2 * a - soll) < 0.03 * soll).length;
  return passend >= 6 ? fRund(soll, 3) : null;
}

/* ---- Rohteilvorschlag ------------------------------------------------ */
function fRohteil(teil, rot, form, auf, sechskant){
  const aD = auf && auf.aufmass_durchmesser != null ? auf.aufmass_durchmesser : 3;
  const aL = auf && auf.aufmass_laenge != null ? auf.aufmass_laenge : 2;
  const aF = auf && auf.aufmass_flach != null ? auf.aufmass_flach : 3;
  const b = teil.bbox;
  if(form === 'rund'){
    const d = fRund(rot.dmax + aD, 2), l = fRund(rot.laenge + aL, 2);
    return {form:'rund', masse:{d:d, l:l}, volumen_cm3:fRund(Math.PI / 4 * d * d * l / 1000, 3)};
  }
  if(form === 'rohr'){
    const d = fRund(rot.dmax + aD, 2), l = fRund(rot.laenge + aL, 2);
    const di = fRund(Math.max(0, (rot.di || 0) - aD), 2);
    return {form:'rohr', masse:{d:d, di:di, l:l},
      volumen_cm3:fRund(Math.PI / 4 * (d * d - di * di) * l / 1000, 3)};
  }
  if(form === 'sechskant'){
    const sw = fRund((sechskant || rot.dmax) + aD, 2), l = fRund(rot.laenge + aL, 2);
    return {form:'sechskant', masse:{sw:sw, l:l},
      volumen_cm3:fRund(Math.sqrt(3) / 2 * sw * sw * l / 1000, 3)};
  }
  const x = fRund(b.x + aF, 2), y = fRund(b.y + aF, 2), z = fRund(b.z + aF, 2);
  return {form:'flach', masse:{x:x, y:y, z:z}, volumen_cm3:fRund(x * y * z / 1000, 3)};
}

/* ---- Klasse ----------------------------------------------------------
   Drehteil einfach: dreht sich um eine Achse, ohne Nebenformen.
   Drehteil mit Fraesanteil: dreht sich, hat aber Querbohrungen oder
     Flaechen, die nicht um die Achse laufen.
   Fraesteil 3-Achs: prismatisch, ohne Hinterschnitt aus der besten
     Aufspannrichtung — gemessen als Flaechenanteil, dessen Normale
     nach unten zeigt, obwohl die Flaeche nicht der Boden ist.
   Fraesteil komplex: der Rest. */
const F_RICHTUNGEN = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function fHinterschnitt(modell){
  let best = 1, bestR = [0, 0, 1];
  F_RICHTUNGEN.forEach(R => {
    let ganz = 0, schlecht = 0;
    modell.flaechen.forEach(f => {
      if(!f._w || f._w.flaeche < 1e-9) return;
      /* mittlere Normale der Flaeche ueber ihren Flussvektor annaehern:
         bei Ebenen exakt, sonst die Achsrichtung als grobe Auskunft */
      let n = null;
      if(f.art === 'ebene' && f.rahmen) n = fV.mul(fV.norm(f.rahmen.z), f.sinn ? 1 : -1);
      if(!n) return;                        /* gekruemmte Flaechen zaehlen nicht mit */
      ganz += f._w.flaeche;
      if(fV.dot(n, R) < -0.02) schlecht += f._w.flaeche;   /* zeigt von der Spindel weg */
    });
    const q = ganz > 0 ? schlecht / ganz : 1;
    if(q < best){ best = q; bestR = R; }
  });
  return {anteil:best, richtung:bestR};
}
function fKlasse(rot, bohrungen, hinter, modell){
  if(rot.ja){
    const quer = bohrungen.some(b => b.d > 0) && modell.flaechen.some(f =>
      f.art === 'zylinder' && f.rahmen && rot.gerade &&
      Math.abs(fV.dot(fV.norm(f.rahmen.z), rot.gerade.r)) < 0.9995);
    const flach = modell.flaechen.some(f => f.art === 'ebene' && f.rahmen && rot.gerade &&
      Math.abs(fV.dot(fV.norm(f.rahmen.z), rot.gerade.r)) < 0.9995 && f._w && f._w.flaeche > 1);
    return (quer || flach || rot.anteil < 0.995) ? 'drehteil_fraes' : 'drehteil_einfach';
  }
  return hinter.anteil <= 0.001 ? 'fraesteil_3ax' : 'fraesteil_komplex';
}

/* ---- Alles zusammen: STEP-Text -> Datensatz nach dem Austauschformat ---- */
function fGeometrie(text, dateiname, vorgaben){
  const t0 = Date.now();
  const m = fStepModell(text);
  const w = fKoerperWerte(m);
  const rot = fRotation(m);
  const bo = fBohrungen(m);
  const hinter = fHinterschnitt(m);
  const d = neuerDatensatz();
  const B = m.box;
  const gross = isFinite(B.x0);
  d.teil.name = String(dateiname || '').replace(/\.[^.]+$/, '');
  d.teil.bbox = {x:gross ? fRund(B.x1 - B.x0, 3) : 0, y:gross ? fRund(B.y1 - B.y0, 3) : 0,
                 z:gross ? fRund(B.z1 - B.z0, 3) : 0};
  d.teil.volumen_cm3 = w.volumen_mm3 == null ? 0 : fRund(w.volumen_mm3 / 1000, 4);
  d.teil.oberflaeche_cm2 = fRund(w.flaeche_mm2 / 100, 3);
  d.teil.rotation = {ja:rot.ja, achse:rot.achse, dmax:fRund(rot.dmax, 3),
                     laenge:fRund(rot.laenge, 3), innen:rot.innen};
  d.teil.bohrungen = bo;
  d.teil.flaechen = m.bericht.flaechen;
  d.teil.kanten = m.bericht.linien + m.bericht.bogen + m.bericht.freieKanten;
  /* Innendurchmesser fuer den Rohrvorschlag: die groesste durchgehende
     Bohrung auf der Drehachse */
  rot.di = 0;
  if(rot.ja){
    bo.forEach(b => { if(b.durch && b.tiefe >= rot.laenge - 0.5 && b.d > rot.di) rot.di = b.d; });
  }
  const sw = rot.ja ? fSechskant(m, rot.gerade, rot.dmax) : null;
  const form = rot.ja ? (rot.di > 0 ? 'rohr' : (sw ? 'sechskant' : 'rund')) : 'flach';
  d.rohteil = fRohteil(d.teil, rot, form, (vorgaben && vorgaben.rohteil) || null, sw);
  d.teil.klasse = fKlasse(rot, bo, hinter, m);
  d.quelle.step = String(dateiname || '');

  /* Alles, was kein Schemafeld ist, aber im Blatt stehen soll. */
  d._befund = {
    koerper: m.koerper.length,
    volumenBekannt: w.volumen_mm3 != null,
    genaehertAnteil: fRund(w.genaehert_anteil, 4),
    sinnSchief: w.sinnSchief,
    rotAnteil: fRund(rot.anteil, 3),
    hinterschnittAnteil: fRund(hinter.anteil, 4),
    sechskantSW: sw,
    bericht: m.bericht,
    warnungen: m.warnungen.slice(),
    ms: Date.now() - t0,
    modell: m
  };
  if(w.volumen_mm3 != null && gross){
    const bv = d.teil.bbox.x * d.teil.bbox.y * d.teil.bbox.z;
    if(w.volumen_mm3 <= 0)
      d._befund.warnungen.push('Das gerechnete Volumen ist nicht positiv — die Flaechen der Datei bilden keinen sauber geschlossenen Koerper.');
    else if(bv > 0 && w.volumen_mm3 > bv * 1.001)
      d._befund.warnungen.push('Das gerechnete Volumen ist groesser als der Huellquader. Die Datei ist vermutlich fehlerhaft.');
  }
  if(w.genaehert_anteil > 0.02)
    d._befund.warnungen.push('Auf ' + Math.round(w.genaehert_anteil * 100) + ' % der Oberflaeche stehen Freiformflaechen. Volumen und Oberflaeche sind dort genaehert.');
  if(w.sinnSchief)
    d._befund.warnungen.push(w.sinnSchief + ' Flaeche(n) mit uneinheitlicher Orientierung — das Volumen kann daneben liegen.');
  const p = schemaPruefen(d);
  if(p.length) d._befund.warnungen.push('Austauschformat: ' + p.join(' '));
  return d;
}
