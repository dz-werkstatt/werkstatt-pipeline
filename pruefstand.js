/* =====================================================================
   PRUEFSTAND der Werkstatt-Pipeline
   ---------------------------------------------------------------------
     node pruefstand.js            alles pruefen
     node pruefstand.js --datei X  eine andere gebaute Datei pruefen
                                   (fuer Gegenproben; Abschnitt 0 entfaellt)

   Nach JEDER Aenderung laufen lassen und das Ergebnis nennen. Die Regel
   der Schwester-Apps gilt hier genauso: das Ergebnis am Satz
   "PRUEFSTAND BESTANDEN" festmachen, nie an der Fehlerzahl allein — ein
   Syntaxfehler im Pruefcode liefert null Haken UND null Fehler.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ORDNER = __dirname;
const dateiArg = (() => { const i = process.argv.indexOf('--datei'); return (i >= 0 && process.argv[i + 1]) ? path.resolve(process.argv[i + 1]) : null; })();
const HTML = dateiArg || path.join(ORDNER, 'werkstatt-pipeline.html');

let fehler = 0, haken = 0, warnungen = 0;
const ok   = (t) => { haken++; console.log('  + ' + t); };
const bad  = (t) => { fehler++; console.log('  X ' + t); };
const warn = (t) => { warnungen++; console.log('  ! ' + t); };
const gleich = (was, ist, soll) => { if(ist === soll) ok(was); else bad(was + ' — ist ' + JSON.stringify(ist) + ', soll ' + JSON.stringify(soll)); };
const nahe = (was, ist, soll, tol) => {
  const d = Math.abs(ist - soll);
  if(d <= tol) ok(was + ' (' + ist.toFixed(4) + ', Abweichung ' + d.toExponential(1) + ')');
  else bad(was + ' — ist ' + ist + ', soll ' + soll + ' (Abweichung ' + d + ' > ' + tol + ')');
};

/* --- 0. Quellen gegen die ausgelieferten Dateien --------------------- */
console.log('\n0) Quellen gegen die ausgelieferten Dateien');
if(dateiArg) warn('--datei gesetzt: Abschnitt 0 entfaellt, geprueft wird ' + HTML);
else {
  const man = JSON.parse(fs.readFileSync(path.join(ORDNER, 'manifest.json'), 'utf8'));
  const einb = man.einbetten || {};
  const teile = [];
  let fehlend = null;
  for(const nm of man.dateien){
    const p = path.join(ORDNER, nm);
    if(!fs.existsSync(p)){ fehlend = nm; break; }
    const roh = fs.readFileSync(p);
    if(einb[nm]){ teile.push(Buffer.from('const ' + einb[nm] + ' = '), roh, Buffer.from(';\n')); }
    else teile.push(roh);
  }
  if(fehlend){ console.log('  X Quelldatei fehlt: ' + fehlend); process.exit(2); }
  const soll = Buffer.concat(teile);
  let schief = 0;
  (man.ziele || []).forEach(zn => {
    const z = path.join(ORDNER, zn);
    if(!fs.existsSync(z)){ console.log('  X ' + zn + ' fehlt'); schief++; return; }
    const ist = fs.readFileSync(z);
    if(ist.equals(soll)) ok(zn + ' entspricht den ' + man.dateien.length + ' Quellmodulen (' + ist.length + ' Bytes)');
    else {
      let i = 0; const n = Math.min(ist.length, soll.length);
      while(i < n && ist[i] === soll[i]) i++;
      console.log('  X ' + zn + ' weicht ab (ab Byte ' + i + ')');
      schief++;
    }
  });
  if(schief){ console.error('\nABBRUCH: "node bauen.js" vergessen oder in einer gebauten Datei editiert.'); process.exit(2); }
}

/* --- 1. Die App laedt ------------------------------------------------ */
console.log('\n1) Die App laedt ohne Ausnahme');
const domstub = require('./domstub.js');
domstub.einbauen();
const quelltext = fs.readFileSync(HTML, 'utf8');
const m = quelltext.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if(!m){ console.log('  X Kein Skriptblock in der Datei gefunden'); process.exit(2); }
const ctx = vm.createContext(global);
try{ vm.runInContext(m[1], ctx, {filename:'app.js'}); ok('Skriptblock ausgefuehrt (' + m[1].length + ' Zeichen)'); }
catch(e){ console.log('  X Ausnahme beim Laden: ' + e.message); console.log(e.stack); process.exit(2); }
const hole = (nm) => { try{ return vm.runInContext(nm, ctx); }catch(e){ return undefined; } };
['fStepModell', 'fGeometrie', 'fDxfGeometrie', 'kalkRechnen', 'kalkStaffel', 'neuerDatensatz',
 'schemaPruefen', 'fRandIntegral', 'fABC', 'vorschauMalen', 'angebotDrucken'].forEach(nm => {
  if(typeof hole(nm) === 'function') ok('Funktion vorhanden: ' + nm);
  else bad('Funktion fehlt: ' + nm);
});

const fGeometrie = hole('fGeometrie'), fDxfGeometrie = hole('fDxfGeometrie');
const kalkRechnen = hole('kalkRechnen'), kalkStaffel = hole('kalkStaffel');
const neuerDatensatz = hole('neuerDatensatz'), schemaPruefen = hole('schemaPruefen');
const fABC = hole('fABC'), fRund = hole('fRund'), KALK_VORGABEN = hole('KALK_VORGABEN');
const fRandIntegral = hole('fRandIntegral'), fSchleifeUV = hole('fSchleifeUV');

/* --- 2. Austauschformat ---------------------------------------------- */
console.log('\n2) Austauschformat (Abschnitt 6 des Lastenhefts)');
{
  const d = neuerDatensatz();
  gleich('Version', d.version, '1.0');
  gleich('frischer Datensatz ist gueltig', schemaPruefen(d).length, 0);
  ['teil', 'rohteil', 'kalkulation', 'quelle'].forEach(k => {
    if(d[k]) ok('Feld vorhanden: ' + k); else bad('Feld fehlt: ' + k);
  });
  ['name', 'zeichnungsnr', 'revision', 'klasse', 'werkstoff', 'bbox', 'volumen_cm3',
   'oberflaeche_cm2', 'rotation', 'bohrungen', 'flaechen', 'kanten'].forEach(k => {
    if(k in d.teil) ok('teil.' + k + ' vorhanden'); else bad('teil.' + k + ' fehlt');
  });
  const kaputt = neuerDatensatz(); delete kaputt.teil.bohrungen;
  if(schemaPruefen(kaputt).length) ok('Wache schlaegt an, wenn ein Feld fehlt');
  else bad('Wache schlaegt NICHT an, wenn ein Feld fehlt');
  const k2 = neuerDatensatz(); k2.teil.klasse = 'irgendwas';
  if(schemaPruefen(k2).length) ok('Wache schlaegt bei unbekannter Klasse an');
  else bad('Wache schlaegt bei unbekannter Klasse NICHT an');
}

/* --- 3. Die Kennwerte des Integranden, analytisch --------------------
   Der Kern der Volumenrechnung sind die drei Kennwerte A, B, C je
   Flaechenart. Sie lassen sich ohne jede Datei pruefen: ueber die GANZE
   Flaeche integriert muessen Flaecheninhalt und Fluss die bekannten
   Werte der Schulgeometrie ergeben. Faellt hier ein Haken, ist die
   Formel falsch — und nicht der Leser.                                */
console.log('\n3) Kennwerte der Flaechenarten, gegen die Schulformeln');
{
  /* Zweidimensionale Integration ueber ein Rechteck im Parameterbereich */
  /* Die zweite Achse wird hier NUMERISCH abgetastet, die erste exakt.
     4000 Stuetzstellen, weil bei 400 der eigene Abtastfehler der Kugel
     (ihr Integrand ist ein Kosinus ueber den halben Umfang) mit 0,005
     bereits ueber der Schwelle lag — ein Fehler der PRUEFUNG, nicht der
     App. Die Schwellen darunter sind deshalb so eng gesetzt, dass sie
     einen echten Formelfehler auch fangen wuerden. */
  const flaeche = (f, u0, u1, v0, v1, was) => {
    const N = 4000; let s = 0;
    for(let i = 0; i < N; i++){
      const v = v0 + (v1 - v0) * (i + 0.5) / N;
      const abc = fABC(f, v, was);
      /* Integral ueber u von A + B cos(u/s) + C sin(u/s) */
      const sk = (f.art === 'ebene') ? 1 : (f.r > 1e-9 ? f.r : 1);
      let iu = abc[0] * (u1 - u0);
      if(abc[1] || abc[2]){
        iu += abc[1] * sk * (Math.sin(u1 / sk) - Math.sin(u0 / sk));
        iu -= abc[2] * sk * (Math.cos(u1 / sk) - Math.cos(u0 / sk));
      }
      s += iu * (v1 - v0) / N;
    }
    return s;
  };
  const rahmen = (p) => ({p:p, x:[1, 0, 0], y:[0, 1, 0], z:[0, 0, 1]});

  /* Zylinder r=8, Hoehe 25, Ursprung im Nullpunkt */
  const zy = {art:'zylinder', r:8, r2:0, sinn:true, rahmen:rahmen([0, 0, 0])};
  nahe('Zylindermantel  Flaeche = 2*pi*r*h',
    flaeche(zy, 0, 2 * Math.PI * 8, 0, 25, 0), 2 * Math.PI * 8 * 25, 1e-6);
  nahe('Zylindermantel  Fluss = 2*pi*r^2*h',
    flaeche(zy, 0, 2 * Math.PI * 8, 0, 25, 1), 2 * Math.PI * 64 * 25, 1e-5);

  /* Kegelstumpf r=6 bei v=0, halber Oeffnungswinkel 20 Grad, Hoehe 10 */
  const al = 20 * Math.PI / 180, R1 = 6 + 10 * Math.tan(al);
  const ke = {art:'kegel', r:6, r2:al, sinn:true, rahmen:rahmen([0, 0, 0])};
  nahe('Kegelmantel  Flaeche = pi*(r0+r1)*Mantellinie',
    flaeche(ke, 0, 2 * Math.PI * 6, 0, 10, 0), Math.PI * (6 + R1) * (10 / Math.cos(al)), 1e-4);

  /* Kugel r=12 um den Nullpunkt: Flaeche 4 pi r^2, Volumen 4/3 pi r^3 */
  const ku = {art:'kugel', r:12, r2:0, sinn:true, rahmen:rahmen([0, 0, 0])};
  nahe('Kugel  Flaeche = 4*pi*r^2',
    flaeche(ku, 0, 2 * Math.PI * 12, -Math.PI * 6, Math.PI * 6, 0), 4 * Math.PI * 144, 1e-3);
  nahe('Kugel  Volumen = Fluss/3 = 4/3*pi*r^3',
    flaeche(ku, 0, 2 * Math.PI * 12, -Math.PI * 6, Math.PI * 6, 1) / 3, 4 / 3 * Math.PI * 1728, 1e-2);

  /* Torus R=30, r=4: Flaeche 4 pi^2 R r, Volumen 2 pi^2 R r^2 */
  const to = {art:'torus', r:30, r2:4, sinn:true, rahmen:rahmen([0, 0, 0])};
  nahe('Torus  Flaeche = 4*pi^2*R*r',
    flaeche(to, 0, 2 * Math.PI * 30, -Math.PI * 4, Math.PI * 4, 0), 4 * Math.PI * Math.PI * 30 * 4, 1e-3);
  nahe('Torus  Volumen = Fluss/3 = 2*pi^2*R*r^2',
    flaeche(to, 0, 2 * Math.PI * 30, -Math.PI * 4, Math.PI * 4, 1) / 3, 2 * Math.PI * Math.PI * 30 * 16, 1e-2);

  /* Ebene 20x15 in der Hoehe z=7: Flaeche 300, Fluss = Hoehe * Flaeche */
  const eb = {art:'ebene', r:0, r2:0, sinn:true, rahmen:rahmen([0, 0, 7])};
  nahe('Ebene  Flaeche', flaeche(eb, 0, 20, 0, 15, 0), 300, 1e-9);
  nahe('Ebene  Fluss = Abstand * Flaeche', flaeche(eb, 0, 20, 0, 15, 1), 7 * 300, 1e-9);
}

/* --- 4. STEP-Testkoerper mit bekanntem Volumen ----------------------- */
console.log('\n4) STEP-Testkoerper (erzeugt, Werte von Hand gerechnet)');
const PK = require('./pruefkoerper.js');
{
  const q = fGeometrie(PK.quader(40, 30, 10, 0), 'quader.step', KALK_VORGABEN);
  gleich('Quader: ein Koerper erkannt', q._befund.koerper, 1);
  nahe('Quader: Volumen', q.teil.volumen_cm3 * 1000, PK.werte.quader.v, 0.01);
  nahe('Quader: Oberflaeche', q.teil.oberflaeche_cm2 * 100, PK.werte.quader.a, 0.01);
  gleich('Quader: Huellquader X', q.teil.bbox.x, 40);
  gleich('Quader: Huellquader Y', q.teil.bbox.y, 30);
  gleich('Quader: Huellquader Z', q.teil.bbox.z, 10);
  gleich('Quader: nicht rotationssymmetrisch', q.teil.rotation.ja, false);
  gleich('Quader: keine Bohrung', q.teil.bohrungen.length, 0);
  gleich('Quader: Rohteil flach', q.rohteil.form, 'flach');
  gleich('Quader: keine Flaeche genaehert', q._befund.genaehertAnteil, 0);
  gleich('Quader: keine schiefe Orientierung', q._befund.sinnSchief, 0);

  const l = fGeometrie(PK.quader(40, 30, 10, 10), 'quader-loch.step', KALK_VORGABEN);
  nahe('Quader mit Bohrung: Volumen', l.teil.volumen_cm3 * 1000, PK.werte.quaderLoch.v, 1.0);
  nahe('Quader mit Bohrung: Oberflaeche', l.teil.oberflaeche_cm2 * 100, PK.werte.quaderLoch.a, 1.0);
  gleich('Quader mit Bohrung: eine Bohrung gefunden', l.teil.bohrungen.length, 1);
  if(l.teil.bohrungen.length){
    nahe('Bohrung: Durchmesser', l.teil.bohrungen[0].d, 10, 0.01);
    nahe('Bohrung: Tiefe', l.teil.bohrungen[0].tiefe, 10, 0.01);
    gleich('Bohrung: durchgehend', l.teil.bohrungen[0].durch, true);
  }
  gleich('Quader mit Bohrung: keine schiefe Orientierung', l._befund.sinnSchief, 0);
  const dv = (PK.werte.quader.v - PK.werte.quaderLoch.v);
  nahe('Die Bohrung nimmt genau ihr Zylindervolumen weg',
    q.teil.volumen_cm3 * 1000 - l.teil.volumen_cm3 * 1000, dv, 1.0);
}

/* --- 5. DXF ---------------------------------------------------------- */
console.log('\n5) DXF (2D): Huellrechteck und Flaecheninhalt');
{
  /* Ein geschlossenes Rechteck 50 x 20 als LWPOLYLINE */
  const dxf = ['0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE', '90', '4', '70', '1',
    '10', '0', '20', '0', '10', '50', '20', '0', '10', '50', '20', '20', '10', '0', '20', '20',
    '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const d = fDxfGeometrie(dxf, 'platte.dxf', 8);
  nahe('DXF: Huellrechteck X', d.teil.bbox.x, 50, 1e-6);
  nahe('DXF: Huellrechteck Y', d.teil.bbox.y, 20, 1e-6);
  nahe('DXF: Volumen = Flaeche * Dicke', d.teil.volumen_cm3, 50 * 20 * 8 / 1000, 1e-6);
  if(d._befund.warnungen.join(' ').indexOf('ZWEIDIMENSIONAL') >= 0) ok('DXF sagt ausdruecklich, dass die Dicke eine Annahme ist');
  else bad('DXF verschweigt, dass die Dicke eine Annahme ist');
}

/* --- 6. Kalkulation: ein Handbeispiel -------------------------------- */
console.log('\n6) Kalkulation, Handbeispiel');
{
  /* Rundteil S235, Rohteil 100 cm3, Fertigteil 60 cm3, 4 Bohrungen,
     40 Kanten, eine Aufspannung, 10 Stueck.
     Spanvolumen   = 40 cm3
     Hauptzeit     = 40 / 60 * 1,0            = 0,6667 min
     Nebenzeit     = 0,25*0,6667 + 4*0,3 + 0  = 1,3667 min
     Pruefen 2, Entgraten max(1; 40*0,02=0,8) = 1
     Stueckzeit    = (0,6667+1,3667)*1*1 + 2 + 1 = 5,0333 min
     Gewicht       = 100 * 7,85 / 1000        = 0,785 kg
     Material      = 0,785 * 2,20 * 1,1       = 1,9 Euro (gerundet 1,9      )
     Bearbeitung   = 5,0333/60 * 50           = 4,1944 Euro
     Ruesten       = 20/60 * 50 / 10          = 1,6667 Euro
     Verpackung    = 0,5 + 8/10               = 1,3 Euro
     Versand       = 12/10                    = 1,2 Euro
     Zwischensumme = 10,2608 Euro
     Gewinn 15 %   = 1,5391
     Einzelpreis   = 11,7999 Euro
     Seit dem 13.09.2026 rechnet dieses Beispiel mit dem PLATZHALTER-Satz 50
     (vorher 60) und 15 % Gewinn (vorher 20): die echten Werte stehen nicht
     mehr im oeffentlichen Repo. Von Hand neu nachgerechnet. Der
     Mindestauftrag (jetzt 100) greift hier nicht: 10 x 11,80 = 118.      */
  const ein = {
    teil: {klasse:'drehteil_einfach', volumen_cm3:60, bohrungen:[{}, {}, {}, {}], kanten:40},
    rohteil: {volumen_cm3:100},
    vorgaben: KALK_VORGABEN, werkstoff:'S235', toleranz:'mittel', oberflaeche:'normal',
    seiten:1, stueck:10, versandArt:'versand', ueber:{}
  };
  const r = kalkRechnen(ein);
  nahe('Spanvolumen', r.zeiten.spanvolumen_cm3, 40, 1e-9);
  nahe('Hauptzeit', r.zeiten.hauptzeit, 40 / 60, 1e-9);
  nahe('Nebenzeit', r.zeiten.nebenzeit, 0.25 * (40 / 60) + 4 * 0.3, 1e-9);
  nahe('Entgraten (Mindestwert greift)', r.zeiten.entgraten, 1, 1e-9);
  nahe('Stueckzeit', r.zeiten.stueckzeit, (40 / 60) * 1.25 + 1.2 + 2 + 1, 1e-9);
  nahe('Rohteilgewicht', r.preise.gewicht_kg, 0.785, 1e-9);
  nahe('Material', r.preise.material, 0.785 * 2.2 * 1.1, 1e-9);
  nahe('Ruesten je Stueck', r.preise.ruesten, 20 / 60 * 50 / 10, 1e-9);
  nahe('Verpackung je Stueck', r.preise.verpackung, 0.5 + 0.8, 1e-9);
  nahe('Versand je Stueck', r.preise.versand, 1.2, 1e-9);
  const soll = (r.preise.material + r.preise.bearbeitung + r.preise.ruesten + 1.3 + 1.2) * 1.15;
  nahe('Einzelpreis', r.preise.einzelpreis, soll, 1e-9);

  /* Gegenproben */
  const fein = kalkRechnen(Object.assign({}, ein, {toleranz:'fein'}));
  if(fein.zeiten.stueckzeit > r.zeiten.stueckzeit) ok('feine Toleranz kostet mehr Zeit');
  else bad('feine Toleranz aendert die Zeit nicht');
  const abh = kalkRechnen(Object.assign({}, ein, {versandArt:'abholung'}));
  nahe('Abholung: kein Versand', abh.preise.versand, 0, 1e-12);
  const eins = kalkRechnen(Object.assign({}, ein, {stueck:1}));
  if(eins.preise.ruesten > r.preise.ruesten * 9) ok('Ruestumlage faellt mit der Stueckzahl');
  else bad('Ruestumlage haengt nicht an der Stueckzahl');
  const ueberschrieben = kalkRechnen(Object.assign({}, ein, {ueber:{hauptzeit:10}}));
  nahe('ueberschriebene Hauptzeit wird verwendet', ueberschrieben.zeiten.hauptzeit, 10, 1e-12);
  if(ueberschrieben.ueberschrieben.hauptzeit) ok('ueberschriebener Posten wird als solcher gemeldet');
  else bad('ueberschriebener Posten wird nicht gemeldet');

  /* Mindestauftragswert */
  const klein = kalkRechnen(Object.assign({}, ein, {stueck:1,
    teil:{klasse:'drehteil_einfach', volumen_cm3:0.9, bohrungen:[], kanten:4},
    rohteil:{volumen_cm3:1}}));
  if(klein.preise.mindestauftrag_greift) ok('Mindestauftragswert greift beim Kleinteil');
  else bad('Mindestauftragswert greift nicht');

  /* Staffel */
  const st = kalkStaffel(ein);
  if(st.length >= 5) ok('Staffel hat ' + st.length + ' Stufen');
  else bad('Staffel zu kurz');
  let faellt = true;
  for(let i = 1; i < st.length; i++) if(st[i].einzelpreis > st[i - 1].einzelpreis + 1e-9) faellt = false;
  if(faellt) ok('der Einzelpreis faellt mit der Stueckzahl');
  else bad('der Einzelpreis faellt NICHT durchgehend');
}

/* --- 7. Werkstofffaktor zaehlt nicht doppelt ------------------------- */
console.log('\n7) Werkstofffaktor und Zerspanleistung');
{
  const basis = {teil:{klasse:'drehteil_einfach', volumen_cm3:0, bohrungen:[], kanten:10},
    rohteil:{volumen_cm3:60}, vorgaben:KALK_VORGABEN, toleranz:'mittel', oberflaeche:'normal',
    seiten:1, stueck:1, versandArt:'abholung', ueber:{}};
  const s235 = kalkRechnen(Object.assign({}, basis, {werkstoff:'S235'}));
  const c45  = kalkRechnen(Object.assign({}, basis, {werkstoff:'C45'}));
  const v2a  = kalkRechnen(Object.assign({}, basis, {werkstoff:'1.4301'}));
  nahe('S235 ist der Bezug seiner Gruppe (Faktor 1)', s235.faktoren.werkstoff, 1, 1e-12);
  nahe('C45 braucht das 1,15-fache', c45.zeiten.hauptzeit / s235.zeiten.hauptzeit, 1.15, 1e-9);
  if(v2a.zeiten.hauptzeit > s235.zeiten.hauptzeit * 1.5) ok('Edelstahl braucht deutlich laenger als Baustahl');
  else bad('Edelstahl unterscheidet sich kaum von Baustahl');
  nahe('Edelstahl bezieht sich auf 1.4301 (Faktor 1)', v2a.faktoren.werkstoff, 1, 1e-12);
}

/* --- 8. Die Oberflaeche ist verdrahtet ------------------------------- */
console.log('\n8) Oberflaeche');
{
  const noetig = ['ablage', 'datei', 'meldungen', 'teilBereich', 'vorschauCv', 'geoTab', 'bohrTab',
    'teilName', 'teilKlasse', 'rohForm', 'rohMasse', 'kWerkstoff', 'kToleranz', 'kOberflaeche',
    'kStueck', 'kalkTab', 'staffel', 'einSaetze', 'einWerkstoffe', 'einLeistung', 'einRest',
    'einFirma', 'btnPdf', 'btnJson', 'btnEinExport', 'tabImport', 'tabKalk', 'tabEin', 'laden'];
  const fehlt = noetig.filter(id => quelltext.indexOf('id="' + id + '"') < 0);
  if(!fehlt.length) ok('alle ' + noetig.length + ' benoetigten Elemente stehen im Quelltext');
  else bad('Elemente fehlen: ' + fehlt.join(', '));
  /* Keine Fremdquelle: die Datei muss offline laufen */
  const fremd = quelltext.match(/(?:src|href)\s*=\s*"(https?:)?\/\//g);
  if(!fremd) ok('keine externen Verweise (die Datei laeuft offline)');
  else bad('externe Verweise gefunden: ' + fremd.length);
  if(quelltext.indexOf('#1858a0') >= 0) ok('die geforderte Akzentfarbe steht im Stylesheet');
  else bad('Akzentfarbe #1858a0 fehlt');
  /* Startwerte kommen aus defaults.json, nicht aus dem Code */
  const V = KALK_VORGABEN;
  if(V && V.saetze && V.saetze.drehen === 50) ok('Startwerte aus defaults.json sind eingebettet');
  else bad('Startwerte fehlen oder weichen ab');
  /* PLATZHALTER-WACHE (13.09.2026). Dieses Repo ist oeffentlich, deshalb
     stehen in defaults.json runde Zahlen statt Daniels Saetzen. Das darf
     keine stille Falle werden: die Gruppen tragen gepflegt:false, das Blatt
     sagt es in einem Hinweis, und wer einen Wert stellt, loescht die Marke.
     Geprueft wird alles drei — sonst waere die Neutralisierung ein
     Datenschutzgewinn und ein Kalkulationsrisiko zugleich. */
  if(V.saetze && V.saetze.gepflegt === false && V.zuschlaege && V.zuschlaege.gepflegt === false)
    ok('Stundensaetze und Zuschlaege sind als Platzhalter gekennzeichnet');
  else bad('die Betriebswerte tragen kein Platzhalter-Kennzeichen');
  {
    const einP = {
      teil: {klasse:'drehteil_einfach', volumen_cm3:60, bohrungen:[], kanten:10},
      rohteil: {volumen_cm3:100}, vorgaben: KALK_VORGABEN, werkstoff:'S235',
      toleranz:'mittel', oberflaeche:'normal', seiten:1, stueck:10, versandArt:'versand', ueber:{}
    };
    const rP = kalkRechnen(einP);
    const sagtSatz = rP.hinweise.filter(h => /Stundensaetze sind Platzhalter/.test(h)).length;
    const sagtZu = rP.hinweise.filter(h => /Gewinnaufschlag und Mindestauftragswert sind Platzhalter/.test(h)).length;
    if(sagtSatz === 1 && sagtZu === 1) ok('das Blatt weist beide Platzhalter-Gruppen im Klartext aus');
    else bad('das Blatt schweigt zu den Platzhaltern (Satz ' + sagtSatz + ', Zuschlaege ' + sagtZu + ')');
    /* Gegenprobe: gepflegt:true laesst den Hinweis verschwinden — sonst
       stuende er fuer immer da und niemand liest ihn mehr. */
    const V2 = JSON.parse(JSON.stringify(KALK_VORGABEN));
    V2.saetze.gepflegt = true; V2.zuschlaege.gepflegt = true;
    const rQ = kalkRechnen(Object.assign({}, einP, {vorgaben:V2}));
    if(!rQ.hinweise.filter(h => /Platzhalter/.test(h) && !/Materialpreis/.test(h)).length)
      ok('ein gepflegter Wert nimmt den Hinweis wieder weg');
    else bad('der Platzhalter-Hinweis bleibt auch nach dem Pflegen stehen');
  }
  if(V && (V.schaetzwerte || []).length) ok((V.schaetzwerte || []).length + ' Werte sind ausdruecklich als Schaetzwert gekennzeichnet');
  else bad('keine Schaetzwerte gekennzeichnet');
  const ungepflegt = (V.werkstoffe || []).filter(w => w.gepflegt === false).length;
  if(ungepflegt) ok(ungepflegt + ' Materialpreise sind als "zu pflegen" gekennzeichnet');
  else warn('kein Materialpreis ist als Platzhalter gekennzeichnet');
}

/* --- Ergebnis -------------------------------------------------------- */
console.log('\n' + '='.repeat(62));
console.log('Haken: ' + haken + '   Fehler: ' + fehler + '   Hinweise: ' + warnungen);
if(fehler === 0) console.log('PRUEFSTAND BESTANDEN');
else console.log('PRUEFSTAND NICHT BESTANDEN');
console.log('='.repeat(62));
process.exit(fehler ? 1 : 0);
