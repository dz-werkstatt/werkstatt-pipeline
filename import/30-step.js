/* =====================================================================
   import/30-step.js — STEP lesen (AP203 / AP214 / AP242)
   ---------------------------------------------------------------------
   UEBERNOMMEN aus der Fraes-App (quellen/F10-kern.js, Paket S1 vom
   14.09.2026). Dort ist der Leser an 143 von 145 echten Modellen ohne
   eine einzige Ausnahme gelaufen, groesste Datei 176 ms. Die beiden
   uebrigen sind Skizzen ohne Volumen. Kopiert statt verlinkt — die
   Schwesterprojekte werden nicht angefasst (Lastenheft Regel 7).

   DREI ERWEITERUNGEN fuer dieses Paket, ohne die es kein Volumen gibt:
     1. Jede Flaeche traegt ihren vollen RAHMEN (Ursprung und die drei
        Achsen), nicht nur die Achsrichtung. Ohne ihn laesst sich eine
        Zylinder- oder Kegelflaeche nicht in ihre Parameterebene legen
        und damit nicht vernetzen.
     2. Jede Flaeche traegt den ORIENTIERUNGSSINN (same_sense der
        ADVANCED_FACE). Er sagt, ob die Flaechennormale nach aussen oder
        nach innen zeigt. Das Volumen nach dem Satz von Gauss ist ohne
        ihn nur bis aufs Vorzeichen bestimmt — und zwar je Flaeche
        einzeln, was die Summe unbrauchbar machen wuerde.
     3. Die Flaechen werden ihren KOERPERN zugeordnet
        (MANIFOLD_SOLID_BREP mit seiner CLOSED_SHELL). Nur Flaechen an
        einer geschlossenen Schale umschliessen ein Volumen. Gemessen an
        127 Dateien: 102 tragen einen Koerper, 25 sind Flaechenmodelle —
        die haben mit keinem Werkzeug ein Volumen, und das sagt die App
        dann auch statt eine Zahl zu erfinden. 8 Dateien tragen mehrere
        Koerper.
   ===================================================================== */

/* Saetze der Form "#12 = TYP(...);" einsammeln. Der Scanner achtet auf
   Zeichenketten und Klammern, weil ein Semikolon auch in einem Namen
   stehen darf. */
function fStepSaetze(text){
  const s = String(text || '');
  const ab = s.indexOf('DATA;');
  const d = ab >= 0 ? s.slice(ab + 5) : s;
  const E = new Map();
  const n = d.length;
  let i = 0;
  while(i < n){
    while(i < n && d.charCodeAt(i) !== 35) i++;                 /* '#' */
    if(i >= n) break;
    let j = i + 1, id = '';
    while(j < n && d[j] >= '0' && d[j] <= '9') id += d[j++];
    if(!id){ i = j; continue; }
    let k = j;
    while(k < n && (d[k] === ' ' || d[k] === '\t' || d[k] === '\r' || d[k] === '\n')) k++;
    if(d[k] !== '='){ i = j; continue; }
    k++;
    const start = k;
    let str = false, tief = 0;
    while(k < n){
      const c = d[k];
      if(str){ if(c === "'"){ if(d[k + 1] === "'") k++; else str = false; } }
      else if(c === "'") str = true;
      else if(c === '(') tief++;
      else if(c === ')') tief--;
      else if(c === ';' && tief <= 0) break;
      k++;
    }
    const koerper = d.slice(start, k).trim();
    const m = koerper.match(/^([A-Za-z0-9_]+)\s*\(([\s\S]*)\)$/);
    E.set(+id, m ? {typ:m[1], arg:m[2]} : {typ:'', arg:koerper});
    i = k + 1;
  }
  return E;
}

/* Argumente auf oberster Ebene trennen (Klammern und Zeichenketten beachten). */
function fStepArgs(s){
  const aus = []; let tief = 0, str = false, akt = '';
  for(let i = 0; i < s.length; i++){
    const c = s[i];
    if(str){ akt += c; if(c === "'"){ if(s[i + 1] === "'") akt += s[++i]; else str = false; } continue; }
    if(c === "'"){ str = true; akt += c; continue; }
    if(c === '('){ tief++; akt += c; continue; }
    if(c === ')'){ tief--; akt += c; continue; }
    if(c === ',' && tief === 0){ aus.push(akt.trim()); akt = ''; continue; }
    akt += c;
  }
  if(akt.trim() !== '') aus.push(akt.trim());
  return aus;
}

const fStepRefs = (s) => (String(s).match(/#\d+/g) || []).map(v => +v.slice(1));
const fStepZahl = (s) => { const m = String(s).match(/-?\d+\.?\d*(?:[eE][-+]?\d+)?/); return m ? +m[0] : NaN; };

/* Millimeter oder Zoll? Die Laengeneinheit steht als SI_UNIT(.MILLI.,.METRE.)
   oder als CONVERSION_BASED_UNIT mit dem Namen INCH. */
function fStepEinheit(text){
  const t = String(text || '');
  if(/CONVERSION_BASED_UNIT\s*\(\s*'INCH'/i.test(t)) return 25.4;
  if(/SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\./i.test(t)) return 1;
  if(/SI_UNIT\s*\(\s*\$\s*,\s*\.METRE\./i.test(t)) return 1000;
  return 1;
}
/* Winkel stehen fast immer im Bogenmass; manche Ausgaben fuehren Grad.
   Betrifft nur den halben Oeffnungswinkel des Kegels — ein uebersehenes
   Grad machte daraus einen Kegel mit 57-fachem Anstieg. */
function fStepWinkelMass(text){
  return /CONVERSION_BASED_UNIT\s*\(\s*'DEGREE'/i.test(String(text || '')) ? Math.PI / 180 : 1;
}

/* ---- Geometrie aufloesen (mit Gedaechtnis, die Punkte werden oft geteilt) ---- */
function fStepGeo(E, einheit){
  const merkP = new Map(), merkR = new Map(), merkL = new Map();
  const G = {};
  G.punkt = (id) => {
    if(merkP.has(id)) return merkP.get(id);
    const e = E.get(id); let p = null;
    if(e && e.typ === 'CARTESIAN_POINT'){
      const z = (fStepArgs(e.arg)[1] || '').match(/-?\d+\.?\d*(?:[eE][-+]?\d+)?/g) || [];
      p = [(+z[0] || 0) * einheit, (+z[1] || 0) * einheit, (+z[2] || 0) * einheit];
    }
    merkP.set(id, p); return p;
  };
  G.richtung = (id) => {
    if(merkR.has(id)) return merkR.get(id);
    const e = E.get(id); let r = null;
    if(e && e.typ === 'DIRECTION'){
      const z = (fStepArgs(e.arg)[1] || '').match(/-?\d+\.?\d*(?:[eE][-+]?\d+)?/g) || [];
      const v = [+z[0] || 0, +z[1] || 0, +z[2] || 0], L = Math.hypot(v[0], v[1], v[2]) || 1;
      r = [v[0] / L, v[1] / L, v[2] / L];
    }
    merkR.set(id, r); return r;
  };
  /* AXIS2_PLACEMENT_3D: Ursprung, Achse z, Bezugsrichtung x. Fehlen
     Richtungen, gelten die Vorgaben der Norm (z = 0/0/1, x = 1/0/0). */
  G.lage = (id) => {
    if(merkL.has(id)) return merkL.get(id);
    const e = E.get(id); let L = null;
    if(e && /AXIS2_PLACEMENT_3D/.test(e.typ)){
      const a = fStepArgs(e.arg);
      const p = G.punkt(fStepRefs(a[1])[0]) || [0, 0, 0];
      let z = (a[2] && a[2] !== '$') ? G.richtung(fStepRefs(a[2])[0]) : null;
      let x = (a[3] && a[3] !== '$') ? G.richtung(fStepRefs(a[3])[0]) : null;
      z = z || [0, 0, 1];
      x = x || (Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
      const d = x[0] * z[0] + x[1] * z[1] + x[2] * z[2];
      let xx = [x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]];
      const lx = Math.hypot(xx[0], xx[1], xx[2]);
      xx = lx > 1e-9 ? [xx[0] / lx, xx[1] / lx, xx[2] / lx] : [1, 0, 0];
      const y = [z[1] * xx[2] - z[2] * xx[1], z[2] * xx[0] - z[0] * xx[2], z[0] * xx[1] - z[1] * xx[0]];
      L = {p:p, z:z, x:xx, y:y};
    }
    merkL.set(id, L); return L;
  };
  return G;
}

/* Eine Kante als Streckenzug PLUS ihrer Art. Gerade: zwei Punkte. Kreis:
   abgetastet, die Richtung folgt dem Sinn der Kante. Die Bogendaten
   (Mitte, Radius, Achse) bleiben erhalten — ohne sie wuerde aus jedem
   Radius spaeter ein Vieleck.
   Rueckgabe: {p:[Punkte], art:'gerade'|'bogen'|'frei', b:{c, r, achse}|null} */
function fStepKante(E, G, id, aus, einheit){
  const e = E.get(id);
  if(!e || e.typ !== 'EDGE_CURVE') return null;
  const a = fStepArgs(e.arg);
  const v1 = E.get(fStepRefs(a[1])[0]), v2 = E.get(fStepRefs(a[2])[0]);
  const p1 = v1 ? G.punkt(fStepRefs(v1.arg)[0]) : null;
  const p2 = v2 ? G.punkt(fStepRefs(v2.arg)[0]) : null;
  const sinn = /\.T\./.test(a[4] || '');
  let k = E.get(fStepRefs(a[3])[0]);
  /* EINE KANTE, DREI VERPACKUNGEN. Fast die Haelfte aller Kanten in
     echten Dateien (11480 von 24620 gemessen) steht nicht als LINE oder
     CIRCLE am Satz, sondern als SURFACE_CURVE: ein Umschlag, der die
     echte Raumkurve und zusaetzlich ihre Abbildungen auf den beiden
     angrenzenden Flaechen fuehrt. Wer den Umschlag nicht oeffnet, sieht
     eine unbekannte Kurve und macht aus jedem Bogen eine Sehne — an
     einer Lehre fehlten dadurch zwei Drittel der Oberflaeche. Das erste
     Bezugsargument ist die Raumkurve. */
  for(let t = 0; k && t < 4; t++){
    if(k.typ !== 'SURFACE_CURVE' && k.typ !== 'SEAM_CURVE' && k.typ !== 'INTERSECTION_CURVE') break;
    k = E.get(fStepRefs(fStepArgs(k.arg)[1])[0]);
  }
  const gerade = () => (p1 && p2) ? {p:[p1, p2], art:'gerade', b:null} : null;
  if(!k) return gerade();
  if(k.typ === 'LINE'){ aus.linien++; return gerade(); }
  if(k.typ === 'CIRCLE' || k.typ === 'ELLIPSE'){
    const ka = fStepArgs(k.arg), L = G.lage(fStepRefs(ka[1])[0]);
    const r = fStepZahl(ka[2]) * einheit, r2 = k.typ === 'ELLIPSE' ? fStepZahl(ka[3]) * einheit : r;
    if(!L || !isFinite(r)) return gerade();
    const wink = (p) => {
      if(!p) return null;
      const d = [p[0] - L.p[0], p[1] - L.p[1], p[2] - L.p[2]];
      return Math.atan2(d[0] * L.y[0] + d[1] * L.y[1] + d[2] * L.y[2], d[0] * L.x[0] + d[1] * L.x[1] + d[2] * L.x[2]);
    };
    let a0 = wink(p1), a1 = wink(p2);
    if(a0 == null || a1 == null){ a0 = 0; a1 = 2 * Math.PI; }
    else {
      let d = a1 - a0;
      /* Anfang gleich Ende heisst VOLLKREIS: die Schleife macht daraus von
         selbst einen ganzen Umlauf, weil 0 unter der Schwelle liegt. */
      if(sinn){ while(d <= 1e-9) d += 2 * Math.PI; }
      else { while(d >= -1e-9) d -= 2 * Math.PI; }
      a1 = a0 + d;
    }
    /* Bogenfeinheit nach der PFEILHOEHE, nicht nach einem festen Winkel.
       Der Bogen wird durch einen Streckenzug ersetzt; der groesste
       Abstand dazwischen ist r*(1-cos(halber Schritt)). Bei 0,01 mm
       bleibt der Flaechenfehler einer vollen Kreisflaeche unter
       0,03 Prozent — deutlich unter allem, was ein Zeitmodell hergibt.
       Ein fester Winkelschritt waere bei kleinen Radien verschwenderisch
       und bei grossen zu grob. */
    const dw = 2 * Math.acos(Math.max(0, Math.min(1, 1 - 0.01 / Math.max(r, r2, 0.01))));
    const n = Math.max(2, Math.min(240, Math.ceil(Math.abs(a1 - a0) / Math.max(dw, 1e-3))));
    const pts = [];
    for(let q = 0; q <= n; q++){
      const w = a0 + (a1 - a0) * q / n, c = Math.cos(w), s = Math.sin(w);
      pts.push([L.p[0] + r * c * L.x[0] + r2 * s * L.y[0],
                L.p[1] + r * c * L.x[1] + r2 * s * L.y[1],
                L.p[2] + r * c * L.x[2] + r2 * s * L.y[2]]);
    }
    aus.bogen++;
    return {p:pts, art:(k.typ === 'CIRCLE' && Math.abs(r - r2) < 1e-9) ? 'bogen' : 'frei',
      b:(k.typ === 'CIRCLE') ? {c:[L.p[0], L.p[1], L.p[2]], r:r, achse:[L.z[0], L.z[1], L.z[2]]} : null};
  }
  /* B-Spline: richtig auswerten statt die Kontrollpunkte als Kurve
     auszugeben. Das Kontrollpolygon ist nur die Huelle — an einem
     Pruefteil lag das Volumen dadurch um 2,9 Prozent daneben. */
  const bs = fStepBSpline(E, G, k);
  if(bs){ aus.spline++; return {p:bs, art:'frei', b:null}; }
  /* Alles Uebrige (rationale und zusammengesetzte Kurven): ueber die
     Kontrollpunkte genaehert, und als solches gezaehlt. */
  const refs = fStepRefs(k.arg).map(q => G.punkt(q)).filter(q => q);
  aus.frei++;
  if(refs.length >= 2) return {p:refs, art:'frei', b:null};
  return gerade();
}

/* ---- B-Spline-Kurve nach de Boor ------------------------------------
   Gedeckt sind die beiden Formen, die in echten Dateien vorkommen:
   B_SPLINE_CURVE_WITH_KNOTS mit ausgeschriebenem Knotenvektor und
   QUASI_UNIFORM_CURVE / UNIFORM_CURVE mit stillschweigend gleichmaessigen
   Knoten. Rationale Kurven (mit Gewichten) stehen in den Dateien als
   zusammengesetzter Satz und bleiben der Naeherung ueberlassen. */
function fStepBSpline(E, G, k){
  const mitKnoten = k.typ === 'B_SPLINE_CURVE_WITH_KNOTS';
  const quasi = k.typ === 'QUASI_UNIFORM_CURVE' || k.typ === 'UNIFORM_CURVE';
  if(!mitKnoten && !quasi) return null;
  const a = fStepArgs(k.arg);
  const grad = Math.round(fStepZahl(a[1]));
  const P = fStepRefs(a[2]).map(q => G.punkt(q)).filter(q => q);
  if(!(grad >= 1) || P.length < grad + 1) return null;

  let K = [];
  if(mitKnoten){
    const mult = (a[6] || '').match(/\d+/g) || [];
    const wert = (a[7] || '').match(/-?\d+\.?\d*(?:[eE][-+]?\d+)?/g) || [];
    if(mult.length !== wert.length || !mult.length) return null;
    for(let i = 0; i < mult.length; i++)
      for(let j = 0, n = +mult[i]; j < n; j++) K.push(+wert[i]);
  } else {
    /* gleichmaessig, an den Enden festgeklemmt */
    const inn = P.length - grad - 1;
    for(let i = 0; i <= grad; i++) K.push(0);
    for(let i = 1; i <= inn; i++) K.push(i);
    for(let i = 0; i <= grad; i++) K.push(inn + 1);
  }
  if(K.length !== P.length + grad + 1) return null;

  const t0 = K[grad], t1 = K[P.length];
  if(!(t1 > t0)) return null;
  const auswerten = (t) => {
    let s = grad;
    while(s < P.length - 1 && K[s + 1] <= t) s++;
    const d = [];
    for(let j = 0; j <= grad; j++) d.push(P[j + s - grad].slice());
    for(let r = 1; r <= grad; r++){
      for(let j = grad; j >= r; j--){
        const u0 = K[j + s - grad], u1 = K[j + 1 + s - r];
        const al = (u1 - u0) > 1e-12 ? (t - u0) / (u1 - u0) : 0;
        for(let c = 0; c < 3; c++) d[j][c] = (1 - al) * d[j - 1][c] + al * d[j][c];
      }
    }
    return d[grad];
  };
  const spannen = Math.max(1, P.length - grad);
  const n = Math.max(8, Math.min(160, spannen * 8));
  const aus = [];
  for(let i = 0; i <= n; i++) aus.push(auswerten(t0 + (t1 - t0) * i / n));
  return aus;
}

/* Welche Flaechenarten kann die App EXAKT beschreiben? Alles andere wird
   ueber den Flaechenrand genaehert und als solches ausgewiesen. */
const F_STEP_EXAKT = {
  PLANE:'ebene', CYLINDRICAL_SURFACE:'zylinder', CONICAL_SURFACE:'kegel',
  TOROIDAL_SURFACE:'torus', SPHERICAL_SURFACE:'kugel'
};

/* Das ganze Modell: Flaechen mit Art, Rahmen, Sinn und Randkurven,
   dazu die Koerperzuordnung und ein Bericht. */
function fStepModell(text){
  const E = fStepSaetze(text);
  const einheit = fStepEinheit(text);
  const wm = fStepWinkelMass(text);
  const G = fStepGeo(E, einheit);
  const aus = {linien:0, bogen:0, frei:0, spline:0};
  const flaechen = [];
  const nachId = new Map();                 /* Satznummer -> Platz in flaechen */
  const zaehl = {ebene:0, zylinder:0, kegel:0, torus:0, kugel:0, frei:0};

  E.forEach((e, id) => {
    if(e.typ !== 'ADVANCED_FACE') return;
    const a = fStepArgs(e.arg);
    const fl = E.get(fStepRefs(a[2])[0]);
    if(!fl) return;
    const art = F_STEP_EXAKT[fl.typ] || 'frei';
    let rahmen = null, r = 0, r2 = 0;
    if(art !== 'frei'){
      const fa = fStepArgs(fl.arg);
      rahmen = G.lage(fStepRefs(fa[1])[0]);
      if(fa[2] != null) r = (fStepZahl(fa[2]) || 0) * einheit;
      if(art === 'kegel')  r2 = (fStepZahl(fa[3]) || 0) * wm;      /* halber Oeffnungswinkel */
      if(art === 'torus')  r2 = (fStepZahl(fa[3]) || 0) * einheit; /* Rohrradius */
    }
    if(!rahmen && art !== 'frei') return;   /* ohne Rahmen unbrauchbar */
    zaehl[art]++;
    /* same_sense: zeigt die Flaechennormale wie die Normale der
       Traegerflaeche (.T.) oder entgegen (.F.)? Entscheidet beim
       Volumen ueber innen und aussen. */
    const sinn = !/\.F\./.test(String(a[3] || ''));

    /* Randkurven, nach SCHLEIFEN getrennt: die aeussere umschliesst die
       Flaeche, jede weitere ist ein Loch darin. */
    const rand = [];
    fStepRefs(a[1]).forEach(bid => {
      const b = E.get(bid); if(!b) return;
      const aussen = /FACE_OUTER_BOUND/.test(b.typ);
      const ba = fStepArgs(b.arg);
      /* .F. an der Berandung kehrt die Schleifenrichtung um. */
      const bsinn = !/\.F\./.test(String(ba[2] || ''));
      const loop = E.get(fStepRefs(ba[1])[0]); if(!loop || loop.typ !== 'EDGE_LOOP') return;
      const kanten = [];
      fStepRefs(fStepArgs(loop.arg)[1]).forEach(oid => {
        const oe = E.get(oid); if(!oe || oe.typ !== 'ORIENTED_EDGE') return;
        const oa = fStepArgs(oe.arg);
        const kid = fStepRefs(oa[3])[0];
        const kk = fStepKante(E, G, kid, aus, einheit);
        if(!kk || kk.p.length < 2) return;
        kk.kid = kid;
        kanten.push(/\.F\./.test(oa[4] || '') ? {p:kk.p.slice().reverse(), art:kk.art, b:kk.b, kid:kid} : kk);
      });
      if(!kanten.length) return;
      if(!bsinn) kanten.reverse().forEach(k => k.p.reverse());
      rand.push({aussen:aussen, kanten:kanten});
    });
    nachId.set(id, flaechen.length);
    flaechen.push({id:id, art:art, rahmen:rahmen, r:r, r2:r2, sinn:sinn,
      achse:rahmen ? rahmen.z : null, ort:rahmen ? rahmen.p : null,
      rand:rand, koerper:-1});
  });

  /* ---- Koerper: nur eine GESCHLOSSENE Schale umschliesst ein Volumen ---- */
  const koerper = [];
  E.forEach((e) => {
    if(e.typ !== 'MANIFOLD_SOLID_BREP' && e.typ !== 'BREP_WITH_VOIDS') return;
    const schalen = fStepRefs(e.arg);       /* aeussere Schale, dann etwaige Hohlraeume */
    const idx = koerper.length, meine = [];
    schalen.forEach(sid => {
      const s = E.get(sid);
      if(!s || !/CLOSED_SHELL/.test(s.typ)) return;
      fStepRefs(fStepArgs(s.arg)[1]).forEach(fid => {
        const k = nachId.get(fid);
        if(k != null && flaechen[k].koerper < 0){ flaechen[k].koerper = idx; meine.push(k); }
      });
    });
    if(meine.length) koerper.push({flaechen:meine});
  });

  /* KEIN geschlossener Koerper im Satz — und trotzdem vielleicht einer.
     Manche Ausgaben (FreeCAD zum Beispiel) schreiben ein Teil als
     SHELL_BASED_SURFACE_MODEL mit lauter offenen Schalen, obwohl die
     Flaechen zusammen dicht sind. Gemessen: 18 von 127 Dateien. Ob sie
     dicht sind, laesst sich nachrechnen statt glauben — in einem
     geschlossenen Gebilde gehoert JEDE Kante zu genau zwei Flaechen.
     Genau das prueft der Satz von Gauss auch stillschweigend voraus. */
  let genaeht = false;
  if(!koerper.length && flaechen.length){
    const dichtNach = (schluessel) => {
      const z = new Map();
      flaechen.forEach(f => f.rand.forEach(lo => lo.kanten.forEach(k => {
        const s = schluessel(k); if(s == null) return;
        z.set(s, (z.get(s) || 0) + 1);
      })));
      if(!z.size) return false;
      let ok = true; z.forEach(v => { if(v !== 2) ok = false; });
      return ok;
    };
    /* Geprueft wird TOPOLOGISCH: teilen sich zwei Flaechen dieselbe
       Kante? Das trifft zu, wenn die Datei eine ordentliche Schale
       fuehrt und sie nur nicht als geschlossen deklariert.
       NICHT geprueft wird geometrisch. Der Versuch steht hier als
       Erfahrung: FreeCAD-Ausgaben geben jeder Flaeche ihre EIGENE Kopie
       jeder Kante (gemessen: 504 Kanten, jede genau einmal benutzt),
       und die beiden Kopien sind unterschiedlich fein zerlegt. Ueber
       Endpunkte allein zusammenzufuehren waere geraten, und der Lauf
       kostete 20 Sekunden mehr ohne eine einzige Datei zu gewinnen.
       Solche Dateien bekommen ehrlich kein Volumen. */
    if(dichtNach(k => k.kid)){
      flaechen.forEach(f => { f.koerper = 0; });
      koerper.push({flaechen:flaechen.map((_, i) => i)});
      genaeht = true;
    }
  }

  /* Huellquader ueber alle Randpunkte */
  const box = {x0:Infinity, y0:Infinity, z0:Infinity, x1:-Infinity, y1:-Infinity, z1:-Infinity};
  flaechen.forEach(f => f.rand.forEach(lo => lo.kanten.forEach(k => k.p.forEach(p => {
    if(p[0] < box.x0) box.x0 = p[0]; if(p[0] > box.x1) box.x1 = p[0];
    if(p[1] < box.y0) box.y0 = p[1]; if(p[1] > box.y1) box.y1 = p[1];
    if(p[2] < box.z0) box.z0 = p[2]; if(p[2] > box.z1) box.z1 = p[2];
  }))));

  const warnungen = [];
  if(!flaechen.length) warnungen.push('Keine Flaechen gefunden — ist das ein Flaechen- oder Punktmodell statt eines Volumens?');
  else if(!koerper.length) warnungen.push('Kein geschlossener Koerper in der Datei: es sind lose Flaechen, und sie schliessen nicht dicht ab. Ein Volumen laesst sich daraus nicht rechnen — weder hier noch mit einem anderen Programm.');
  else if(genaeht) warnungen.push('Die Datei fuehrt keinen Koerper, sondern lose Flaechen. Sie schliessen aber dicht ab — jede Kante gehoert zu genau zwei Flaechen — deshalb ist das Volumen gerechnet.');
  if(koerper.length > 1) warnungen.push(koerper.length + ' getrennte Koerper: die Werte gelten fuer alle zusammen.');
  if(zaehl.frei) warnungen.push(zaehl.frei + ' Freiformflaeche(n): dort wird ueber den Flaechenrand genaehert.');
  if(einheit !== 1) warnungen.push('Zeichnungseinheit umgerechnet (Faktor ' + einheit + ').');
  const teile = [...E.values()].filter(e => e.typ === 'NEXT_ASSEMBLY_USAGE_OCCURRENCE').length;
  if(teile) warnungen.push('Baugruppe mit ' + teile + ' Verknuepfung(en): die Teile werden dort gelesen, wo sie im Modell liegen.');

  return {flaechen:flaechen, koerper:koerper, box:box, einheit:einheit,
    bericht:{saetze:E.size, flaechen:flaechen.length, ebenen:zaehl.ebene, zylinder:zaehl.zylinder,
      kegel:zaehl.kegel, torus:zaehl.torus, kugel:zaehl.kugel, frei:zaehl.frei,
      linien:aus.linien, bogen:aus.bogen, freieKanten:aus.frei, splines:aus.spline,
      teile:teile, koerper:koerper.length, genaeht:genaeht},
    warnungen:warnungen};
}
