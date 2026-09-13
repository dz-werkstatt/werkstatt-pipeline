/* =====================================================================
   ui/51-vorschau3d.js — das Teil ansehen, mit dem Rohteil darum
   ---------------------------------------------------------------------
   Bewusst OHNE 3D-Bibliothek und ohne WebGL: eine Leinwand, Vierecke von
   hinten nach vorn gemalt, dazu die echten Kanten obenauf. Das genuegt,
   um ein Teil zu beurteilen, laeuft auf jedem iPhone und haelt die
   Doktrin der Schwester-Apps ein, dass nichts nachgeladen wird.

   WIE DIE FLAECHEN ZU VIERECKEN WERDEN: jede Flaeche hat ihre
   Parameterebene (siehe 31-geometrie). Darin liegt ein Raster; eine
   Zelle wird gemalt, wenn ihre Mitte INNERHALB der Randschleifen liegt
   (Strahlverfahren, gerade Anzahl Schnitte heisst draussen). Loecher
   fallen damit von selbst weg, ohne dass ein Vieleck zerlegt werden
   muesste. Die Zellenraender waeren zackig — deshalb liegen die exakten
   Kanten als Linien darueber, und weil jede Flaeche einfarbig ist,
   sieht man von der Zackigkeit nichts.
   ===================================================================== */

const VS = {
  az: -0.6, el: 0.5, zoom: 1, mx: 0, my: 0,
  netz: null, kanten: null, mitte: [0, 0, 0], gr: 1,
  rohteil: true, zieht: false, lx: 0, ly: 0, finger: 0
};

function vorschauNeu(){
  VS.netz = null; VS.kanten = null;
  if(!S.d){ vorschauMalen(); return; }
  const m = S.d._befund && S.d._befund.modell;
  const B = S.d.teil.bbox;
  VS.gr = Math.max(B.x, B.y, B.z, 1);
  if(m) netzBauen(m); else if(S.d._befund && S.d._befund.zuege) netzAusDxf();
  vorschauMalen();
}

/* Liegt (u,v) innerhalb der Randschleifen? Strahl nach +u. */
function vsInnen(schleifen, u, v){
  let n = 0;
  for(const p of schleifen){
    for(let i = 0; i < p.length; i++){
      const a = p[i], b = p[(i + 1) % p.length];
      if((a[1] > v) === (b[1] > v)) continue;
      const x = a[0] + (v - a[1]) / (b[1] - a[1]) * (b[0] - a[0]);
      if(x > u) n++;
    }
  }
  return (n & 1) === 1;
}

function netzBauen(m){
  const quads = [], linien = [];
  const B = S.d.teil.bbox;
  const zelle = Math.max(VS.gr / 55, 0.05);
  m.flaechen.forEach(f => {
    /* Kanten immer — sie sind die genaue Form */
    f.rand.forEach(lo => lo.kanten.forEach(k => {
      for(let i = 0; i + 1 < k.p.length; i++) linien.push([k.p[i], k.p[i + 1]]);
    }));
    if(f.art === 'frei' || !f.rahmen) return;
    const per = fPeriode(f);
    let sch = [];
    f.rand.forEach(lo => { const p = fSchleifeUV(f, lo.kanten); if(p) sch.push(p); });
    if(!sch.length) return;
    if(per > 0){ const v = fSchleifenVereinen(f, sch, per); if(!v) return; sch = v; }
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    sch.forEach(p => p.forEach(q => {
      if(q[0] < u0) u0 = q[0]; if(q[0] > u1) u1 = q[0];
      if(q[1] < v0) v0 = q[1]; if(q[1] > v1) v1 = q[1];
    }));
    if(!(u1 > u0) || !(v1 > v0)) return;
    const nu = Math.max(1, Math.min(60, Math.round((u1 - u0) / zelle)));
    const nv = Math.max(1, Math.min(60, Math.round((v1 - v0) / zelle)));
    const du = (u1 - u0) / nu, dv = (v1 - v0) / nv;
    for(let i = 0; i < nu; i++){
      for(let j = 0; j < nv; j++){
        const uu = u0 + (i + 0.5) * du, vv = v0 + (j + 0.5) * dv;
        if(!vsInnen(sch, uu, vv)) continue;
        const a = fXYZ(f, u0 + i * du, v0 + j * dv);
        const b = fXYZ(f, u0 + (i + 1) * du, v0 + j * dv);
        const c = fXYZ(f, u0 + (i + 1) * du, v0 + (j + 1) * dv);
        const d = fXYZ(f, u0 + i * du, v0 + (j + 1) * dv);
        /* Die Reihenfolge der Ecken bestimmt, wohin die Normale zeigt.
           Aus der Parameterebene kommt sie in Richtung der TRAEGER-
           flaeche; nach aussen zeigt sie nur bei gleichem Sinn. Ohne
           diese Umkehr wird die Rueckseite nicht weggelassen, und man
           schaut durch das Teil hindurch — an einer Buchse war die
           Innenwand ueber der Aussenwand zu sehen. */
        quads.push(f.sinn ? [a, b, c, d] : [d, c, b, a]);
      }
    }
  });
  VS.netz = quads;
  VS.kanten = linien;
  VS.mitte = [0, 0, 0];
  const bx = m.box;
  if(isFinite(bx.x0)) VS.mitte = [(bx.x0 + bx.x1) / 2, (bx.y0 + bx.y1) / 2, (bx.z0 + bx.z1) / 2];
  VS.box = isFinite(bx.x0) ? bx : null;
}

function netzAusDxf(){
  const z = S.d._befund.zuege || [];
  const t = S.d.teil.bbox.z;
  const linien = [];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  z.forEach(g => {
    for(let i = 0; i + 1 < g.p.length; i++){
      const a = g.p[i], b = g.p[i + 1];
      linien.push([[a[0], a[1], 0], [b[0], b[1], 0]]);
      linien.push([[a[0], a[1], t], [b[0], b[1], t]]);
    }
    g.p.forEach(p => {
      if(p[0] < x0) x0 = p[0]; if(p[0] > x1) x1 = p[0];
      if(p[1] < y0) y0 = p[1]; if(p[1] > y1) y1 = p[1];
    });
  });
  VS.netz = [];
  VS.kanten = linien;
  VS.box = isFinite(x0) ? {x0:x0, x1:x1, y0:y0, y1:y1, z0:0, z1:t} : null;
  VS.mitte = VS.box ? [(x0 + x1) / 2, (y0 + y1) / 2, t / 2] : [0, 0, 0];
}

function vsDreh(p){
  const ca = Math.cos(VS.az), sa = Math.sin(VS.az), ce = Math.cos(VS.el), se = Math.sin(VS.el);
  const x = p[0] - VS.mitte[0], y = p[1] - VS.mitte[1], z = p[2] - VS.mitte[2];
  const x1 = x * ca - y * sa, y1 = x * sa + y * ca;
  const y2 = y1 * ce - z * se, z2 = y1 * se + z * ce;
  return [x1, z2, y2];                 /* x rechts, y oben, z Tiefe */
}

function vorschauMalen(){
  const cv = el('vorschauCv'); if(!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const br = cv.clientWidth || 600, ho = cv.clientHeight || 300;
  if(cv.width !== Math.round(br * dpr) || cv.height !== Math.round(ho * dpr)){
    cv.width = Math.round(br * dpr); cv.height = Math.round(ho * dpr);
  }
  const g = cv.getContext('2d'); if(!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, br, ho);
  g.fillStyle = '#fff'; g.fillRect(0, 0, br, ho);
  if(!S.d || !VS.kanten){
    g.fillStyle = '#8a97a4'; g.font = '14px sans-serif'; g.textAlign = 'center';
    g.fillText('Noch kein Teil geladen', br / 2, ho / 2);
    return;
  }
  const sk = Math.min(br, ho) / (VS.gr * 1.9) * VS.zoom;
  const P = (p) => { const q = vsDreh(p); return [br / 2 + q[0] * sk + VS.mx, ho / 2 - q[1] * sk + VS.my, q[2]]; };

  /* Flaechen von hinten nach vorn */
  const licht = [0.42, 0.6, 0.68];
  const liste = [];
  (VS.netz || []).forEach(q => {
    const a = P(q[0]), b = P(q[1]), c = P(q[2]), d = P(q[3]);
    const nx = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if(nx <= 0) return;                                   /* Rueckseite */
    const A = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
    const Bv = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
    let n = [A[1] * Bv[2] - A[2] * Bv[1], A[2] * Bv[0] - A[0] * Bv[2], A[0] * Bv[1] - A[1] * Bv[0]];
    const L = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / L, n[1] / L, n[2] / L];
    const nn = vsDreh([VS.mitte[0] + n[0], VS.mitte[1] + n[1], VS.mitte[2] + n[2]]);
    const hell = Math.max(0.15, Math.min(1, 0.32 + 0.68 * Math.abs(nn[0] * licht[0] + nn[1] * licht[1] + nn[2] * licht[2])));
    liste.push({t:(a[2] + b[2] + c[2] + d[2]) / 4, p:[a, b, c, d], h:hell});
  });
  liste.sort((x, y) => x.t - y.t);
  g.lineJoin = 'round';
  liste.forEach(q => {
    const v = Math.round(120 + 110 * q.h);
    const farbe = 'rgb(' + Math.round(v * 0.80) + ',' + Math.round(v * 0.88) + ',' + v + ')';
    g.fillStyle = farbe; g.strokeStyle = farbe; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(q.p[0][0], q.p[0][1]); g.lineTo(q.p[1][0], q.p[1][1]);
    g.lineTo(q.p[2][0], q.p[2][1]); g.lineTo(q.p[3][0], q.p[3][1]); g.closePath();
    g.fill();
    /* Der Umriss in derselben Farbe schliesst die Haarfugen zwischen
       benachbarten Vierecken. Ohne ihn liegt ueber jeder gekruemmten
       Flaeche ein feines Gitter, das wie ein Netz aussieht. */
    g.stroke();
  });

  /* Kanten */
  g.strokeStyle = 'rgba(24,52,84,.55)'; g.lineWidth = 0.8;
  g.beginPath();
  VS.kanten.forEach(k => { const a = P(k[0]), b = P(k[1]); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); });
  g.stroke();

  /* Rohteil halbdurchsichtig darum */
  if(VS.rohteil && VS.box){
    const r = rohteilQuader();
    if(r){
      g.strokeStyle = 'rgba(24,88,160,.55)'; g.lineWidth = 1.1;
      g.setLineDash([5, 4]);
      g.beginPath();
      r.kanten.forEach(k => { const a = P(k[0]), b = P(k[1]); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); });
      g.stroke();
      g.setLineDash([]);
    }
  }
  g.fillStyle = '#8a97a4'; g.font = '12px sans-serif'; g.textAlign = 'left';
}

/* Der Rohteilumriss: beim Rundteil ein Zylinder um die Drehachse,
   sonst der Quader. Gezeichnet als Kantenzug, damit das Fertigteil
   darin sichtbar bleibt. */
function rohteilQuader(){
  const b = VS.box; if(!b) return null;
  const ro = S.d.rohteil, m = ro.masse || {};
  const kanten = [];
  /* Das Rohteil liegt mittig um das Fertigteil — beim Drehteil um seine
     Achse, sonst als Quader um den Huellquader. */
  const mitte = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];
  if((ro.form === 'rund' || ro.form === 'rohr' || ro.form === 'sechskant') && S.d.teil.rotation.ja){
    const A = S.d.teil.rotation.achse;
    const ax = A === 'X' ? 0 : (A === 'Y' ? 1 : 2);
    const i1 = (ax + 1) % 3, i2 = (ax + 2) % 3;
    const r = (ro.form === 'sechskant' ? (m.sw || 0) / Math.sqrt(3) : (m.d || 0) / 2);
    const l = m.l || 0;
    const n = ro.form === 'sechskant' ? 6 : 48;
    const kreis = (t) => {
      const p = [];
      for(let i = 0; i <= n; i++){
        const w = 2 * Math.PI * i / n + (ro.form === 'sechskant' ? Math.PI / 6 : 0);
        const q = [0, 0, 0];
        q[ax] = mitte[ax] + t;
        q[i1] = mitte[i1] + r * Math.cos(w);
        q[i2] = mitte[i2] + r * Math.sin(w);
        p.push(q);
      }
      return p;
    };
    const k1 = kreis(-l / 2), k2 = kreis(l / 2);
    for(let i = 0; i < n; i++){ kanten.push([k1[i], k1[i + 1]]); kanten.push([k2[i], k2[i + 1]]); }
    for(let i = 0; i < n; i += Math.max(1, Math.round(n / 8))) kanten.push([k1[i], k2[i]]);
    return {kanten:kanten};
  }
  const x = (m.x || b.x1 - b.x0), y = (m.y || b.y1 - b.y0), z = (m.z || b.z1 - b.z0);
  const c = mitte;
  const E = [];
  for(let i = 0; i < 8; i++)
    E.push([c[0] + ((i & 1) ? x / 2 : -x / 2), c[1] + ((i & 2) ? y / 2 : -y / 2), c[2] + ((i & 4) ? z / 2 : -z / 2)]);
  [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]]
    .forEach(p => kanten.push([E[p[0]], E[p[1]]]));
  return {kanten:kanten};
}

function vorschauVerdrahten(){
  const cv = el('vorschauCv'); if(!cv) return;
  const pos = (e) => {
    const t = e.touches && e.touches.length ? e.touches[0] : e;
    return [t.clientX, t.clientY];
  };
  const start = (e) => { VS.zieht = true; const p = pos(e); VS.lx = p[0]; VS.ly = p[1]; };
  const zieh = (e) => {
    if(!VS.zieht) return;
    if(e.touches && e.touches.length === 2){
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if(VS.finger) VS.zoom = Math.max(0.2, Math.min(8, VS.zoom * d / VS.finger));
      VS.finger = d; vorschauMalen(); e.preventDefault(); return;
    }
    const p = pos(e);
    VS.az += (p[0] - VS.lx) * 0.01;
    VS.el = Math.max(-1.5, Math.min(1.5, VS.el + (p[1] - VS.ly) * 0.01));
    VS.lx = p[0]; VS.ly = p[1];
    vorschauMalen(); e.preventDefault();
  };
  const ende = () => { VS.zieht = false; VS.finger = 0; };
  cv.addEventListener('mousedown', start);
  window.addEventListener('mousemove', zieh);
  window.addEventListener('mouseup', ende);
  cv.addEventListener('touchstart', (e) => { VS.finger = 0; start(e); }, {passive:true});
  cv.addEventListener('touchmove', zieh, {passive:false});
  cv.addEventListener('touchend', ende);
  cv.addEventListener('wheel', (e) => {
    VS.zoom = Math.max(0.2, Math.min(8, VS.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
    vorschauMalen(); e.preventDefault();
  }, {passive:false});
  cv.addEventListener('dblclick', () => { VS.az = -0.6; VS.el = 0.5; VS.zoom = 1; VS.mx = 0; VS.my = 0; vorschauMalen(); });
  on('vsRohteil', 'click', () => { VS.rohteil = !VS.rohteil; vorschauMalen(); });
  on('vsZuruck', 'click', () => { VS.az = -0.6; VS.el = 0.5; VS.zoom = 1; VS.mx = 0; VS.my = 0; vorschauMalen(); });
  window.addEventListener('resize', () => vorschauMalen());
}
