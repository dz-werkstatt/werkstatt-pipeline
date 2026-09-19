/* =====================================================================
   import/32-dxf.js — DXF als ZWEITE Quelle (2D)
   ---------------------------------------------------------------------
   Das Lastenheft verlangt hier wenig: Huellrechteck und Flaecheninhalt
   genuegen. Aus einer 2D-Zeichnung laesst sich ohne Dickenangabe kein
   Volumen ableiten — die Dicke gibt der Bediener ein, und daraus wird
   ein Blechteil oder eine Platte.

   Gelesen werden LINE, ARC, CIRCLE, LWPOLYLINE und POLYLINE; Bloecke
   werden EINGESETZT (in echten Zeichnungen steckt oft der halbe Inhalt
   in Bloecken). Bemassung, Text und Schraffur werden GEZAEHLT und
   genannt, nicht gelesen — eine Massangabe ist keine Kontur.
   ===================================================================== */

function fDxfPaare(text){
  const z = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const aus = [];
  for(let i = 0; i + 1 < z.length; i += 2){
    const c = parseInt(z[i].trim(), 10);
    if(isNaN(c)) continue;
    aus.push([c, z[i + 1].trim()]);
  }
  return aus;
}

/* Die Zeichnungseinheit steht in $INSUNITS: 1 = Zoll, 4 = Millimeter. */
function fDxfEinheit(paare){
  for(let i = 0; i < paare.length - 2; i++)
    if(paare[i][0] === 9 && paare[i][1] === '$INSUNITS')
      return (+paare[i + 1][1] === 1) ? 25.4 : 1;
  return 1;
}

/* Entitaeten in Zuege aus Punkten verwandeln. Jeder Zug ist
   {p:[[x,y],...], zu:true|false}. */
function fDxfZuege(text){
  const paare = fDxfPaare(text);
  const e = fDxfEinheit(paare);
  const zuege = [];
  const ignoriert = {};
  const bloecke = {};
  let inBlock = null, abschnitt = '';

  let i = 0;
  const naechsteEntitaet = () => {
    while(i < paare.length && !(paare[i][0] === 0)) i++;
    return i < paare.length ? paare[i][1] : null;
  };

  while(i < paare.length){
    if(paare[i][0] === 2 && (paare[i - 1] && paare[i - 1][0] === 0) ) { /* nichts */ }
    if(paare[i][0] === 0){
      const typ = paare[i][1];
      /* Abschnittswechsel merken */
      if(typ === 'SECTION'){ const n = paare[i + 2]; abschnitt = (paare[i + 1] && paare[i + 1][0] === 2) ? paare[i + 1][1] : ''; i++; continue; }
      if(typ === 'BLOCK'){
        const w = {}; let j = i + 1;
        while(j < paare.length && paare[j][0] !== 0){ if(!(paare[j][0] in w)) w[paare[j][0]] = paare[j][1]; j++; }
        inBlock = w[2] || ('B' + j); bloecke[inBlock] = [];
        i = j; continue;
      }
      if(typ === 'ENDBLK'){ inBlock = null; i++; continue; }
      /* Werte dieser Entitaet einsammeln */
      const w = {}, mehr = {};
      let j = i + 1;
      while(j < paare.length && paare[j][0] !== 0){
        const c = paare[j][0], v = paare[j][1];
        if(!(c in w)) w[c] = v;
        (mehr[c] = mehr[c] || []).push(v);
        j++;
      }
      const ziel = inBlock ? bloecke[inBlock] : zuege;
      const zahl = (c, vor) => { const v = parseFloat(w[c]); return isFinite(v) ? v * e : (vor || 0); };
      if(typ === 'LINE'){
        ziel.push({p:[[zahl(10), zahl(20)], [zahl(11), zahl(21)]], zu:false});
      } else if(typ === 'CIRCLE'){
        const cx = zahl(10), cy = zahl(20), r = zahl(40);
        const p = []; const n = Math.max(24, Math.min(180, Math.ceil(2 * Math.PI * r / 0.3)));
        for(let q = 0; q <= n; q++) p.push([cx + r * Math.cos(2 * Math.PI * q / n), cy + r * Math.sin(2 * Math.PI * q / n)]);
        ziel.push({p:p, zu:true});
      } else if(typ === 'ARC'){
        const cx = zahl(10), cy = zahl(20), r = zahl(40);
        let a0 = parseFloat(w[50]) || 0, a1 = parseFloat(w[51]) || 0;
        a0 = a0 * Math.PI / 180; a1 = a1 * Math.PI / 180;
        while(a1 <= a0) a1 += 2 * Math.PI;
        const p = []; const n = Math.max(4, Math.min(180, Math.ceil((a1 - a0) * r / 0.3)));
        for(let q = 0; q <= n; q++){ const a = a0 + (a1 - a0) * q / n; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
        ziel.push({p:p, zu:false});
      } else if(typ === 'LWPOLYLINE'){
        const xs = (mehr[10] || []).map(v => parseFloat(v) * e);
        const ys = (mehr[20] || []).map(v => parseFloat(v) * e);
        const p = [];
        for(let q = 0; q < Math.min(xs.length, ys.length); q++) p.push([xs[q], ys[q]]);
        if(p.length >= 2) ziel.push({p:p, zu:(parseInt(w[70], 10) & 1) === 1});
      } else if(typ === 'VERTEX' || typ === 'SEQEND' || typ === 'POLYLINE'){
        /* alte Polylinie: die VERTEX-Saetze sammeln sich als eigene
           Entitaeten an; sie werden unten zusammengefasst */
        if(typ === 'POLYLINE') ziel.push({p:[], zu:(parseInt(w[70], 10) & 1) === 1, offen:true});
        else if(typ === 'VERTEX'){
          const z = ziel[ziel.length - 1];
          if(z && z.offen) z.p.push([zahl(10), zahl(20)]);
        } else { const z = ziel[ziel.length - 1]; if(z) delete z.offen; }
      } else if(typ === 'INSERT'){
        const nm = w[2], bx = zahl(10), by = zahl(20);
        const sx = parseFloat(w[41]), sy = parseFloat(w[42]);
        const dr = (parseFloat(w[50]) || 0) * Math.PI / 180;
        const b = bloecke[nm];
        if(b){
          const fx = isFinite(sx) ? sx : 1, fy = isFinite(sy) ? sy : 1;
          const co = Math.cos(dr), si = Math.sin(dr);
          b.forEach(z => ziel.push({zu:z.zu, p:z.p.map(q => {
            const x = q[0] * fx, y = q[1] * fy;
            return [bx + x * co - y * si, by + x * si + y * co];
          })}));
        } else ignoriert['INSERT (Block fehlt)'] = (ignoriert['INSERT (Block fehlt)'] || 0) + 1;
      } else if(typ !== 'ENDSEC' && typ !== 'EOF' && typ !== 'SECTION' && typ !== 'TABLE' &&
                typ !== 'ENDTAB' && typ !== 'CLASS' && typ !== 'LAYER' && typ !== 'STYLE' &&
                typ !== 'VPORT' && typ !== 'LTYPE' && typ !== 'APPID' && typ !== 'DIMSTYLE' &&
                typ !== 'BLOCK_RECORD' && typ !== 'UCS' && typ !== 'VIEW'){
        ignoriert[typ] = (ignoriert[typ] || 0) + 1;
      }
      i = j; continue;
    }
    i++;
  }
  zuege.forEach(z => delete z.offen);
  return {zuege:zuege.filter(z => z.p.length >= 2), ignoriert:ignoriert, einheit:e};
}

/* Huellrechteck und Flaecheninhalt der geschlossenen Zuege.
   Der Inhalt wird mit Vorzeichen summiert: ein Loch laeuft andersherum
   und zieht sich damit von selbst ab. */
function fDxfGeometrie(text, dateiname, dicke){
  const r = fDxfZuege(text);
  const b = {x0:Infinity, y0:Infinity, x1:-Infinity, y1:-Infinity};
  let flaeche = 0, zu = 0, offen = 0, laenge = 0;
  r.zuege.forEach(z => {
    z.p.forEach(p => {
      if(p[0] < b.x0) b.x0 = p[0]; if(p[0] > b.x1) b.x1 = p[0];
      if(p[1] < b.y0) b.y0 = p[1]; if(p[1] > b.y1) b.y1 = p[1];
    });
    for(let i = 0; i + 1 < z.p.length; i++)
      laenge += Math.hypot(z.p[i + 1][0] - z.p[i][0], z.p[i + 1][1] - z.p[i][1]);
    if(!z.zu){ offen++; return; }
    zu++;
    let s = 0;
    for(let i = 0; i < z.p.length; i++){
      const a = z.p[i], c = z.p[(i + 1) % z.p.length];
      s += a[0] * c[1] - c[0] * a[1];
    }
    flaeche += s / 2;
  });
  const gross = isFinite(b.x0);
  const d = neuerDatensatz();
  const t = isFinite(dicke) && dicke > 0 ? dicke : 10;
  d.teil.name = String(dateiname || '').replace(/\.[^.]+$/, '');
  d.teil.bbox = {x:gross ? fRund(b.x1 - b.x0, 3) : 0, y:gross ? fRund(b.y1 - b.y0, 3) : 0, z:fRund(t, 3)};
  d.teil.volumen_cm3 = fRund(Math.abs(flaeche) * t / 1000, 4);
  d.teil.oberflaeche_cm2 = fRund((2 * Math.abs(flaeche) + laenge * t) / 100, 3);
  d.teil.klasse = 'fraesteil_3ax';
  d.teil.flaechen = 0;
  d.teil.kanten = r.zuege.length;
  d.quelle.step = String(dateiname || '');
  d.rohteil = {form:'flach', masse:{x:fRund(d.teil.bbox.x + 3, 2), y:fRund(d.teil.bbox.y + 3, 2), z:fRund(t + 3, 2)},
    volumen_cm3:fRund((d.teil.bbox.x + 3) * (d.teil.bbox.y + 3) * (t + 3) / 1000, 3)};
  const w = [];
  w.push('DXF ist eine ZWEIDIMENSIONALE Zeichnung. Die Dicke ' + fZahl(t, 1) + ' mm ist eine Annahme und im Feld zu aendern.');
  if(!zu) w.push('Kein geschlossener Zug gefunden — ohne geschlossene Kontur gibt es keinen Flaecheninhalt und damit kein Volumen.');
  if(offen) w.push(offen + ' offene(r) Zug/Zuege wurden fuer den Flaecheninhalt nicht gewertet (nur fuer das Huellrechteck).');
  const ign = Object.keys(r.ignoriert);
  if(ign.length) w.push('Nicht gelesen: ' + ign.map(k => k + ' (' + r.ignoriert[k] + ')').join(', ') +
    '. Bemassung und Text sind keine Kontur; eine ganze Zeichnung mit Rahmen und Schriftfeld liefert auch deren Linien.');
  if(r.einheit !== 1) w.push('Zeichnungseinheit Zoll erkannt und umgerechnet.');
  d._befund = {koerper:zu ? 1 : 0, volumenBekannt:zu > 0, genaehertAnteil:0, sinnSchief:0,
    rotAnteil:0, hinterschnittAnteil:0, sechskantSW:null, dxf:true, dicke:t, zuege:r.zuege,
    bericht:{flaechen:0, zuege:r.zuege.length, geschlossen:zu, offen:offen},
    warnungen:w, ms:0, modell:null};
  return d;
}
