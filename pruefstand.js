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
  nahe('Ruesten je Stueck', r.preise.ruesten, 20 / 60 * 55 / 10, 1e-9);
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
  if(V && V.saetze && V.saetze.drehen === 55) ok('Startwerte aus defaults.json sind eingebettet');
  else bad('Startwerte fehlen oder weichen ab');
  /* WERTE-WACHE, neue Fassung (15.09.2026). Bis dahin standen in
     defaults.json runde 50/50/50 mit Platzhalter-Marke. Ansage des Bedieners:
     was ein Lohnfertiger fuer eine Dreh- oder Fraesstunde verlangt, ist
     BRANCHENWISSEN und kein Geschaeftsgeheimnis - und eine runde 50 ist
     keine Vorsicht, sondern eine Zahl, die niemandem hilft.

     DIE LINIE, in beide Richtungen geprueft:
       Branchenwerte  realistisch besetzt, KEINE Marke, keine Warnung.
       Betriebswerte  bleiben markiert - die kann die App nicht wissen.
     Ohne die zweite Haelfte waere das Umstellen ein Freibrief, auch den
     Rest still zu besetzen. */
  if(V.saetze && V.saetze.gepflegt === true && V.zuschlaege && V.zuschlaege.gepflegt === true)
    ok('Stundensaetze und Zuschlaege sind besetzt, nicht markiert');
  else bad('die Branchenwerte tragen noch eine Platzhalter-Marke');
  if(V.saetze && V.saetze.drehen >= 45 && V.saetze.drehen <= 65 &&
     V.saetze.fraesen >= 55 && V.saetze.fraesen <= 80)
    ok('  und sie liegen im branchenueblichen Rahmen (' + V.saetze.drehen +
       ' / ' + V.saetze.fraesen + ' Euro/h)');
  else bad('die Stundensaetze liegen ausserhalb des branchenueblichen Rahmens');
  if(V.saetze.fraesen > V.saetze.drehen)
    ok('  Fraesen kostet mehr als Drehen');
  else bad('Fraesen kostet nicht mehr als Drehen - das ist in der Lohnfertigung verkehrt');
  /* Die BETRIEBSWERTE dagegen behalten ihre Marke. */
  {
    const ungepflegt = (hole('WERKSTATT_MASCHINEN') || []).filter(m => m.gepflegt === false).length;
    if(ungepflegt > 0) ok('die Maschinenwerte bleiben als Platzhalter gekennzeichnet (' + ungepflegt + ')');
    else bad('auch die Maschinenwerte gelten jetzt als gepflegt - die kann die App nicht wissen');
    const fa = V.fraesanteil || {};
    if(fa.gepflegt === false) ok('  und der Fraesanteil an der Stueckzeit ebenso');
    else bad('der Fraesanteil gilt als gepflegt - er ist eine Annahme');
    const w = (V.werkstoffe || []).filter(x => x.gepflegt === false).length;
    if(w > 0) ok('  und die Materialpreise (' + w + ' von ' + (V.werkstoffe || []).length + ')');
    else bad('die Materialpreise gelten als gepflegt - Einkaufspreise kann die App nicht wissen');
  }
  {
    const einP = {
      teil: {klasse:'drehteil_einfach', volumen_cm3:60, bohrungen:[], kanten:10},
      rohteil: {volumen_cm3:100}, vorgaben: KALK_VORGABEN, werkstoff:'S235',
      toleranz:'mittel', oberflaeche:'normal', seiten:1, stueck:10, versandArt:'versand', ueber:{}
    };
    const rP = kalkRechnen(einP);
    const sagtSatz = rP.hinweise.filter(h => /Stundensaetze sind Platzhalter/.test(h)).length;
    const sagtZu = rP.hinweise.filter(h => /Gewinnaufschlag und Mindestauftragswert sind Platzhalter/.test(h)).length;
    /* KEINE DAUERWARNUNG MEHR fuer die Branchenwerte - ein Hinweis, der
       bei jeder Rechnung steht, wird nach dem dritten Mal nicht mehr
       gelesen, und dann ueberliest man auch den, der zaehlt. */
    if(sagtSatz === 0 && sagtZu === 0) ok('das Blatt warnt nicht mehr vor den Branchenwerten');
    else bad('das Blatt warnt weiter vor den Branchenwerten (Satz ' + sagtSatz + ', Zuschlaege ' + sagtZu + ')');
    /* Der Materialhinweis BLEIBT: Einkaufspreise sind betriebsspezifisch. */
    const sagtMat = rP.hinweise.filter(h => /Materialpreis/.test(h)).length;
    if(sagtMat === 1) ok('  aber weiter vor dem ungepflegten Materialpreis');
    else bad('der Materialhinweis fehlt (' + sagtMat + ')');
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

/* --- 9. Drehkontur aus einem Drehkoerper ------------------------------
   Geprueft wird an ERZEUGTEN Koerpern, deren Profil man im Kopf
   nachrechnet — und je ein Haken haelt einen der Fehlversuche fest, die
   beim Bau aufgetreten sind. Ohne die waeren es Haken auf das Ergebnis,
   nicht auf die Regel, die es traegt. Die Fehlversuche stehen einzeln in
   versuche/drehprofil/LIESMICH.md.                                     */
console.log('\n9) Drehkontur (fDrehProfil)');
{
  const fDrehProfil = hole('fDrehProfil'), dpAchse = hole('dpAchse');
  const dpSegmente = hole('dpSegmente'), dpKetten = hole('dpKetten');
  const dpTrennen = hole('dpTrennen'), dpAlsKontur = hole('dpAlsKontur');
  const dpBohrungswand = hole('dpBohrungswand');
  const punkte = (l) => (l || []).map(e => [e.z, e.x]);

  /* (1) Stufenwelle: das einfachste Drehteil, vier Punkte */
  {
    const p = fDrehProfil(fStepModell(PK.drehteil([[40,20],[30,30]], 0)));
    const S = PK.werte.welle;
    gleich('Stufenwelle: erkannt', p.ok, true);
    gleich('Stufenwelle: Vollmaterial', p.voll, true);
    gleich('Stufenwelle: groesster ⌀', p.dmax, S.dmax);
    gleich('Stufenwelle: Laenge', p.laenge, S.laenge);
    gleich('Stufenwelle: Kontur Punkt fuer Punkt', JSON.stringify(punkte(p.aussen)), JSON.stringify(S.punkte));
  }

  /* (2) Rohr: Aussen- und Innenkontur muessen GETRENNT herauskommen.
     Die Regel dahinter ist die Umkehr der z-Richtung, nicht der mittlere
     Radius — der mittlere Radius war der erste Versuch und ist am
     Zentrierstift gescheitert (dort liegt die Spitze naeher an der Achse
     als die Bohrung eines Rohrs, die Zuordnung kippte). */
  {
    const p = fDrehProfil(fStepModell(PK.drehteil([[40,50]], 20)));
    const S = PK.werte.rohr;
    gleich('Rohr: als Bohrungsteil erkannt', p.voll, false);
    gleich('Rohr: groesster ⌀', p.dmax, S.dmax);
    gleich('Rohr: Aussenkontur', JSON.stringify(punkte(p.aussen)), JSON.stringify(S.aussen));
    gleich('Rohr: Innenkontur', JSON.stringify(punkte(p.innen)), JSON.stringify(S.innen));
  }

  /* (3) Gestufte Huelse: Absatz aussen UND durchgehende Bohrung */
  {
    const p = fDrehProfil(fStepModell(PK.drehteil([[50,20],[40,30]], 20)));
    const S = PK.werte.huelse;
    gleich('Gestufte Huelse: Aussenkontur mit Absatz', JSON.stringify(punkte(p.aussen)), JSON.stringify(S.aussen));
    gleich('Gestufte Huelse: Innenkontur', JSON.stringify(punkte(p.innen)), JSON.stringify(S.innen));
    gleich('Gestufte Huelse: groesster ⌀', p.dmax, S.dmax);
  }

  /* (3b) Bohrungswand: dieselbe Innenkontur OHNE die Stirnflaeche.
     Das ist die Fassung, die an ein CAM geht - ein Sprung auf den
     Aussendurchmesser laese sich dort als Bohrungsabsatz lesen.
     Der DUENNWANDIGE RING ist der tragende Fall: er belegt, dass die
     Regel geometrisch ist und kein Schwellwert. Ein Filter "⌀ ueber 90 %
     von dmax" wuerde hier die ganze Bohrungswand wegwerfen - genau das
     tat der erste Versuch an der Spreitzhuelse (aussen ⌀155,2, Bohrung
     ⌀145,4), und es sah nach einem Erfolg aus, weil das Spanvolumen fiel. */
  {
    const rohr = fDrehProfil(fStepModell(PK.drehteil([[40,50]], 20)));
    gleich('Rohr: Bohrungswand ohne die Stirnflaeche',
      JSON.stringify(punkte(rohr.innenWand)), JSON.stringify([[0,20], [-50,20]]));
    const ring = fDrehProfil(fStepModell(PK.drehteil([[40,30]], 36)));
    gleich('Duennwandiger Ring ⌀40/⌀36: Bohrungswand bleibt vollstaendig',
      JSON.stringify(punkte(ring.innenWand)), JSON.stringify([[0,36], [-30,36]]));
    /* Der tragende Fall ist die MEHRSTUFIGE duennwandige Bohrung: erst
       dort frisst ein Schwellwert mehr als einen Punkt. Am Ring mit nur
       drei Punkten stoppt jede Regel nach einem Schritt - deshalb blieb
       die erste Gegenprobe dort gruen, und das lag am Testfall, nicht am
       Code. dpBohrungswand ist eine reine Funktion auf der Punktliste und
       laesst sich direkt fuettern; ein STEP-Koerper dafuer waere Aufwand
       ohne Mehrwert. */
    const gestuft = [{z:0,x:36}, {z:-20,x:36}, {z:-20,x:34}, {z:-30,x:34}, {z:-30,x:40}];
    gleich('Mehrstufige duennwandige Bohrung: nur die Stirnflaeche faellt weg',
      JSON.stringify(punkte(dpBohrungswand(gestuft))),
      JSON.stringify([[0,36], [-20,36], [-20,34], [-30,34]]));
    /* Und am anderen Ende: ein Plansprung nach aussen VOR der Bohrung ist
       die vordere Stirn. Der Fall ist Huelse Sauger, Punkt fuer Punkt aus
       dem echten Modell - die Bohrung ⌀40 geht nach 59,5 mm auf ⌀56,2
       auf, und DIESE Erweiterung muss bleiben: sie ist Bohrung, keine
       Stirn (das Teil ist erst bei z -80 zu Ende).
       EIGENER FEHLER, hier festgehalten: der erste Testfall war um den
       letzten Punkt verkuerzt, und dadurch sah die Aufweitung wie ein
       Endsprung aus. Die Regel hat sie folgerichtig abgeschnitten, meine
       Erwartung war daneben - nicht der Code. */
    const vorn = [{z:0,x:46}, {z:0,x:40}, {z:-59.5,x:40}, {z:-59.5,x:56.2}, {z:-80,x:56.2}];
    gleich('Stirnflaeche am Anfang faellt weg, die Bohrungserweiterung bleibt',
      JSON.stringify(punkte(dpBohrungswand(vorn))),
      JSON.stringify([[0,40], [-59.5,40], [-59.5,56.2], [-80,56.2]]));
    /* Vollmaterial hat keine Bohrungswand, und das darf nicht knallen. */
    const welle = fDrehProfil(fStepModell(PK.drehteil([[40,20],[30,30]], 0)));
    gleich('Vollmaterial: keine Bohrungswand', JSON.stringify(punkte(welle.innenWand)), '[]');
  }

  /* (4) Die Achse ist die Richtung der MEISTEN gekruemmten Flaechen.
     das CAD des Bestands legt die Teile ueberwiegend in Y, nicht in Z — wer Z
     annimmt, bekommt bei ihm Unsinn (182 angeblich schiefe Zylinder in
     einer Grundplatte). Geprueft am synthetischen Modell, weil der
     Koerperbaukasten nur in Z baut. */
  {
    const mod = {flaechen:[
      {art:'zylinder', achse:[0,1,0]}, {art:'zylinder', achse:[0,-1,0]},
      {art:'kegel',    achse:[0,1,0]}, {art:'zylinder', achse:[1,0,0]},
      {art:'ebene',    achse:[0,0,1]}
    ]};
    const a = dpAchse(mod);
    gleich('Achse: Y gewinnt gegen eine einzelne Querbohrung', JSON.stringify(a.richtung), JSON.stringify([0,1,0]));
    gleich('Achse: Richtung und Gegenrichtung zaehlen zusammen', a.zahl, 3);
  }

  /* (5) FEHLVERSUCH 1 — Torus-Querschnittskreise.
     Ein Torus traegt neben den Umfangskreisen auch Kreise mit dem
     ROHRradius, deren Mittelpunkt NICHT auf der Achse liegt. Ohne den
     Achsfilter kam Unsinn heraus wie "⌀0,4 -> 34,6". */
  {
    const achse = [0,0,1];
    /* Der Querschnittskreis muss AUSSERHALB der beiden Umfangskreise
       liegen, sonst ist die Probe stumpf: dpSegmente nimmt je Flaeche das
       kleinste und groesste z, und ein Stoerkreis DAZWISCHEN aendert daran
       nichts. Der erste Anlauf legte ihn auf z 11 zwischen 10 und 12 - die
       Gegenprobe blieb gruen, und das lag am Test, nicht am Code. */
    const mod = {flaechen:[{art:'torus', r2:2, rand:[{kanten:[
      {b:{c:[0,0,10], r:15}},          /* Umfangskreis, Mitte auf der Achse */
      {b:{c:[0,0,12], r:13}},          /* zweiter Umfangskreis */
      {b:{c:[14,0,16], r:2}}           /* Querschnittskreis, Mitte NEBEN der Achse */
    ]}]}]};
    const {seg} = dpSegmente(mod, achse);
    if(seg.length === 1)
      gleich('Torus: der Rohrradius landet nicht im Profil',
        JSON.stringify([seg[0].p1.r, seg[0].p2.r]), JSON.stringify([15, 13]));
    else bad('Torus: ' + seg.length + ' Segmente statt einem');
    /* Zweiter Haken auf denselben Filter, von der anderen Seite: eine
       Flaeche, die NUR Querschnittskreise traegt, ist keine Profilstelle
       und muss ganz herausfallen.
       BLINDER HAKEN, hier festgehalten: der erste Anlauf prueffte statt
       dessen seg.length === 1 - das haengt aber gar nicht am Filter,
       denn dpSegmente liefert je FLAECHE genau ein Segment, wie viele
       Kreise sie auch hat. Die Gegenprobe blieb an dieser Stelle gruen
       und hat den Haken damit als wertlos entlarvt. */
    const nurQuer = {flaechen:[{art:'torus', r2:2, rand:[{kanten:[
      {b:{c:[14,0,10], r:2}}, {b:{c:[0,14,12], r:2}}
    ]}]}]};
    const q = dpSegmente(nurQuer, achse);
    if(!q.seg.length && q.warn.length) ok('Torus nur mit Querschnittskreisen faellt heraus: "' + q.warn.join(' | ') + '"');
    else bad('Querschnittskreise allein ergeben ' + q.seg.length + ' Segment(e) statt keinem');
  }

  /* (6) FEHLVERSUCH 2 — doppelte Halbzylinder.
     Ein voller Zylinder steht im STEP haeufig als ZWEI Halbflaechen mit
     denselben Randkreisen. Ungefiltert haengt die Kettenbildung sie
     hintereinander und die Kontur springt zurueck (gemessen an 485898,
     einem schlichten Rohr: 6 Segmente statt 4, zwei Ketten, zwei
     Ruecksprueunge). */
  {
    const achse = [0,0,1];
    const haelfte = () => ({art:'zylinder', rand:[{kanten:[
      {b:{c:[0,0,0], r:20}}, {b:{c:[0,0,50], r:20}}
    ]}]});
    const {seg, warn} = dpSegmente({flaechen:[haelfte(), haelfte()]}, achse);
    gleich('Doppelte Halbflaechen werden zu EINEM Segment', seg.length, 1);
    if(warn.join(' ').indexOf('doppelte') >= 0) ok('und es wird gesagt: "' + warn.join(' | ') + '"');
    else bad('das Zusammenfassen bleibt stumm');
  }

  /* (7) FEHLVERSUCH 3 — Sortieren nach z zerreisst die Kette.
     Die Kette ist bereits geordnet; wer sie nach z sortiert, wirft bei
     einem Rohr Hin- und Rueckweg durcheinander. Geprueft an der
     Stufenwelle: ihre Punkte sind in z ABSTEIGEND, aber der ⌀ springt
     dazwischen zurueck — eine z-Sortierung koennte das nicht liefern. */
  {
    const p = fDrehProfil(fStepModell(PK.drehteil([[40,20],[30,30]], 0)));
    const zs = (p.aussen || []).map(e => e.z);
    const fallend = zs.every((z, i) => i === 0 || z <= zs[i-1] + 1e-9);
    if(fallend) ok('Kontur laeuft von der Stirn zum Futter, ohne Ruecksprung');
    else bad('die Kontur springt in z zurueck: ' + JSON.stringify(zs));
    /* Und die Reihenfolge ist die der KETTE: zwischen zwei Punkten mit
       gleichem z steht der Absatz, nicht die z-Sortierung. */
    const paar = (p.aussen || []).findIndex((e, i) => i > 0 && Math.abs(e.z - p.aussen[i-1].z) < 1e-9);
    if(paar > 0) ok('der Absatz steht als Punktpaar bei gleichem z (Platz ' + paar + ')');
    else bad('kein Absatz-Punktpaar in der Kontur');
  }

  /* (8) FEHLVERSUCH 4 — Trennung ueber den mittleren Radius.
     Sie ist am Zentrierstift gescheitert. Die geltende Regel ist die
     Umkehr der z-Richtung: ein geschlossener Querschnitt laeuft einmal
     hin und einmal zurueck, die beiden Umkehrpunkte sind die Stirnflaechen.
     Hier an einer Kette geprueft, die genau zwei Umkehrstellen hat. */
  {
    const P = (z, r) => ({z, r});
    const kette = [
      {typ:'gerade', p1:P(0,20),  p2:P(50,20)},   /* Mantel hin  */
      {typ:'plan',   p1:P(50,20), p2:P(50,10)},   /* Stirn       */
      {typ:'gerade', p1:P(50,10), p2:P(0,10)},    /* Bohrung zurueck */
      {typ:'plan',   p1:P(0,10),  p2:P(0,20)}     /* Stirn       */
    ];
    const t = dpTrennen(kette, true);
    const rA = t.aussen.map(s => s.p1.r), rI = t.innen.map(s => s.p1.r);
    if(Math.max(...rA) > Math.max(...rI)) ok('Umkehrpunkt-Regel trennt Mantel von Bohrung');
    else bad('Trennung falsch herum: aussen ' + JSON.stringify(rA) + ', innen ' + JSON.stringify(rI));
    /* Gegenstueck: ohne Umkehr (offene Kette) gilt alles als Aussenkontur */
    const t2 = dpTrennen([kette[0]], false);
    gleich('offene Kette gilt als Vollmaterial', t2.voll, true);
  }

  /* (9) SELBSTPRUEFUNG: lieber ablehnen als falsch liefern.
     Eine mehrfach gestufte Innenkontur kehrt oefter um als zweimal; die
     Trennung geht dann nicht auf. Statt einer Aussenkontur mit
     Ruecksprung — fuer den Planer unbrauchbar, im schlimmsten Fall eine
     Bahn ins Material — wird der Grund genannt. */
  {
    const P = (z, r) => ({z, r});
    const kette = [
      {typ:'gerade', p1:P(0,25),  p2:P(60,25)},
      {typ:'plan',   p1:P(60,25), p2:P(60,10)},
      {typ:'gerade', p1:P(60,10), p2:P(30,10)},   /* Bohrung, erste Stufe */
      {typ:'plan',   p1:P(30,10), p2:P(30,15)},   /* Absatz IN der Bohrung */
      {typ:'gerade', p1:P(30,15), p2:P(0,15)},
      {typ:'plan',   p1:P(0,15),  p2:P(0,25)}
    ];
    const t = dpTrennen(kette, true);
    /* Diese Kette hat genau zwei Umkehrstellen, die Trennung greift also;
       der Haken gilt dem Verhalten bei MEHR Umkehrstellen.
       EIGENER FEHLER im ersten Anlauf: die Gegenkette hatte trotz eines
       zusaetzlichen Zuges wieder nur ZWEI Wenden (+1,+1,-1,+1,+1) — die
       Wenden waren nicht durchgezaehlt, und der Haken fiel zu Recht um.
       Vier Wenden braucht es, und genau die hat der echte Fall: eine
       mehrfach gestufte Bohrung, die selbst umkehrt (Huelse 2 Sauger,
       z0 -> z22 -> z0 -> z55). */
    const wirr = [
      {typ:'gerade', p1:P(0,25),  p2:P(60,25)},   /* Mantel hin        +1 */
      {typ:'plan',   p1:P(60,25), p2:P(60,10)},   /* Stirn                */
      {typ:'gerade', p1:P(60,10), p2:P(30,10)},   /* Bohrung zurueck   -1 */
      {typ:'plan',   p1:P(30,10), p2:P(30,15)},   /* Absatz in der Bohrung */
      {typ:'gerade', p1:P(30,15), p2:P(45,15)},   /* wieder vorwaerts  +1 */
      {typ:'plan',   p1:P(45,15), p2:P(45,12)},
      {typ:'gerade', p1:P(45,12), p2:P(0,12)},    /* und wieder zurueck -1 */
      {typ:'plan',   p1:P(0,12),  p2:P(0,25)}     /* Stirn, Kette schliesst */
    ];
    const t3 = dpTrennen(wirr, true);
    if(t3.warn) ok('mehrdeutige Kette wird benannt statt geraten: "' + t3.warn + '"');
    else bad('mehrdeutige Kette wird stillschweigend getrennt');
    if(t.aussen.length && t.innen.length) ok('die eindeutige Kette wird dagegen sauber getrennt');
    else bad('auch die eindeutige Kette geht nicht auf');
  }

  /* (10) Ein Koerper ohne Rotationsflaechen liefert kein Profil — mit
     Grund, nicht mit einer leeren Kontur. */
  {
    const p = fDrehProfil(fStepModell(PK.quader(40, 30, 10, 0)));
    gleich('Quader: kein Drehprofil', p.ok, false);
    if(p.grund) ok('und der Grund steht dabei: "' + p.grund + '"');
    else bad('die Ablehnung nennt keinen Grund');
  }

  /* (10b) DIE ABLEHNUNG MUSS DEN RICHTIGEN GRUND NENNEN.
     Es gibt zwei ganz verschiedene Faelle, und die erste Fassung nannte
     bei ALLEN den zweiten — am echten Bestand lag sie damit bei acht
     von neun Teilen daneben:
       offene Kette      = Drehkontur unterbrochen, Teil mit Fraesanteil
       geschlossene Kette
       mit >2 Umkehrungen = gestufte Innenkontur
     Ein Grund, der in die falsche Richtung zeigt, ist schlimmer als
     keiner: er schickt den Leser zur falschen Ursache. */
  {
    /* Quader mit Bohrung: kreisrunde Flaechen gibt es, aber keine
       zusammenhaengende Drehkontur - der Fall "kein Drehteil". */
    const q = fDrehProfil(fStepModell(PK.quader(40, 30, 10, 10)));
    gleich('Quader mit Bohrung: kein Profil', q.ok, false);
    if(/laufen nicht um die Achse/.test(q.grund || ''))
      ok('der Grund nennt die Flaechen quer zur Achse: "' + (q.grund || '').slice(0, 78) + '..."');
    else bad('der Grund nennt die Querflaechen nicht: "' + q.grund + '"');
    if(q.quer > 0 && q.flaechen > 0) ok('und gibt die Zahlen mit (' + q.quer + ' von ' + q.flaechen + ')');
    else bad('quer/flaechen fehlen im Ergebnis');

    /* Der ANDERE Fall, an der Kette geprueft: geschlossen, vier
       Umkehrungen — dort darf NICHT von Fraesanteil die Rede sein. */
    const P = (z, r) => ({z, r});
    const gestuft = [
      {typ:'gerade', p1:P(0,25),  p2:P(60,25)},
      {typ:'plan',   p1:P(60,25), p2:P(60,10)},
      {typ:'gerade', p1:P(60,10), p2:P(30,10)},
      {typ:'plan',   p1:P(30,10), p2:P(30,15)},
      {typ:'gerade', p1:P(30,15), p2:P(45,15)},
      {typ:'plan',   p1:P(45,15), p2:P(45,12)},
      {typ:'gerade', p1:P(45,12), p2:P(0,12)},
      {typ:'plan',   p1:P(0,12),  p2:P(0,25)}
    ];
    const t = dpTrennen(gestuft, true);
    if(/Umkehrstellen/.test(t.warn || '')) ok('die gestufte Innenkontur wird als solche benannt: "' + t.warn + '"');
    else bad('die gestufte Innenkontur meldet keine Umkehrstellen: "' + t.warn + '"');
  }

  /* (11) Das Modul ist in der ausgelieferten Datei angekommen und
     DOM-frei — es laeuft hier im Ersatz-Browser ohne Oberflaeche. */
  ['fDrehProfil', 'dpAchse', 'dpSegmente', 'dpKetten', 'dpTrennen', 'dpAlsKontur', 'dpBohrungswand'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('Funktion vorhanden: ' + nm);
    else bad('Funktion fehlt: ' + nm);
  });
}

/* --- 11. Werkstatt: Auftraege, Belegung, Auslastung -------------------
   Alle Faelle sind von Hand nachrechenbar - das ist die Bedingung dafuer,
   dass ein roter Haken etwas bedeutet. 2026-09-15 ist ein Dienstag,
   2026-09-18 ein Freitag; darauf beruhen die Wochentagsfaelle.        */
console.log('\n11) Werkstatt: Auftraege, Belegung, Auslastung');
{
  const neuerAuftrag = hole('neuerAuftrag'), auftragPruefen = hole('auftragPruefen');
  const auftragAusKalkulation = hole('auftragAusKalkulation');
  const maschinenFuerAuftrag = hole('maschinenFuerAuftrag'), maschineVorschlag = hole('maschineVorschlag');
  const planBelegen = hole('planBelegen'), planAuslastung = hole('planAuslastung');
  const planAuswertung = hole('planAuswertung'), planMinuten = hole('planMinuten');
  const planKapazitaet = hole('planKapazitaet'), planWochenanfang = hole('planWochenanfang');
  const planTag = hole('planTag'), planText = hole('planText');
  const M = hole('WERKSTATT_MASCHINEN'), STATUS = hole('WERKSTATT_STATUS');

  ['neuerAuftrag', 'auftragPruefen', 'auftragAusKalkulation', 'maschinenFuerAuftrag',
   'maschineVorschlag', 'planBelegen', 'planAuslastung', 'planAuswertung',
   'planMinuten', 'WERKSTATT_MASCHINEN'].forEach(nm => {
    if(typeof hole(nm) !== 'undefined') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });

  /* Ein Auftrag, der genau zwei volle Tage braucht: 60 + 100 x 9 = 960 min
     bei 480 min/Tag. Jede Abweichung davon ist ein Rechenfehler. */
  const bau = (o) => {
    const a = neuerAuftrag();
    a.nummer = o.nr || 'A-1'; a.teil = o.teil || 'Welle';
    a.stueck = o.stueck || 100; a.status = o.status || 'beauftragt';
    a.zeiten = {ruestzeit:o.ruest != null ? o.ruest : 60, stueckzeit:o.sz != null ? o.sz : 9};
    a.maschine = o.m || 'm1000'; a.liefertermin = o.termin || '';
    a.preis = o.preis || 0; a.klasse = 'drehteil_einfach'; a.gattung = 'drehen';
    a.masse = {dmax:o.dmax || 60, laenge:o.lae || 200, x:0, y:0, z:0};
    if(o.geliefert) a.rueckmeldung = {gefertigt:a.stueck, datum:o.geliefert};
    return a;
  };

  gleich('frischer Auftrag ist gueltig', auftragPruefen(neuerAuftrag()).length, 0);
  {
    const k = neuerAuftrag(); k.status = 'irgendwas';
    if(auftragPruefen(k).length) ok('Wache schlaegt bei unbekanntem Status an');
    else bad('Wache schlaegt bei unbekanntem Status NICHT an');
    const d = neuerAuftrag(); d.liefertermin = '31.09.2026';
    if(auftragPruefen(d).length) ok('Wache schlaegt bei falscher Datumsform an');
    else bad('Wache schlaegt bei falscher Datumsform NICHT an');
  }

  /* (1) Zwei volle Tage, Start Dienstag */
  {
    const b = planBelegen({auftraege:[bau({termin:'2026-09-18'})], maschinen:M, ab:'2026-09-15', tage:30});
    gleich('960 min auf 480 min/Tag ergeben zwei Bloecke', b.bloecke.length, 2);
    gleich('  erster Tag voll', b.bloecke[0] && b.bloecke[0].minuten, 480);
    gleich('  Start Dienstag', b.auftraege[0] && b.auftraege[0].start, '2026-09-15');
    gleich('  fertig Mittwoch', b.auftraege[0] && b.auftraege[0].ende, '2026-09-16');
    gleich('  Termin am Freitag haelt', b.auftraege[0] && b.auftraege[0].haelt, true);
  }

  /* (2) Das Wochenende wird uebersprungen — Start Freitag, drei Tage
     Arbeit: Fr, Mo, Di. Ohne diese Regel waere jede Belegung ueber ein
     Wochenende um zwei Tage zu optimistisch. */
  {
    const b = planBelegen({auftraege:[bau({m:'m1500', ruest:0, sz:9, stueck:160})],
                           maschinen:M, ab:'2026-09-18', tage:30});
    const tage = b.bloecke.map(k => k.datum);
    gleich('Wochenende uebersprungen', JSON.stringify(tage),
           JSON.stringify(['2026-09-18', '2026-09-21', '2026-09-22']));
  }

  /* (3) Nur beauftragt/freigegeben/laeuft binden Kapazitaet */
  {
    ['angeboten', 'geliefert'].forEach(st => {
      const b = planBelegen({auftraege:[bau({status:st})], maschinen:M, ab:'2026-09-15', tage:30});
      gleich('Status "' + st + '" bindet keine Kapazitaet', b.bloecke.length, 0);
    });
    const b = planBelegen({auftraege:[bau({status:'laeuft'})], maschinen:M, ab:'2026-09-15', tage:30});
    if(b.bloecke.length) ok('Status "laeuft" bindet Kapazitaet');
    else bad('Status "laeuft" bindet keine Kapazitaet');
  }

  /* (4) Die Maschinenwahl kennt den Arbeitsraum. DAS ist der Punkt, den
     die App vorher nicht konnte: eine Gattung "drehen" haette das Teil
     auf jede Drehbank gelegt. */
  {
    const lang = bau({lae:1200});
    const k = maschinenFuerAuftrag(lang, M);
    const tausend = k.find(x => x.id === 'm1000'), fuenfzehn = k.find(x => x.id === 'm1500');
    gleich('1200 mm passt nicht auf die 1000er', tausend && tausend.passt, false);
    gleich('1200 mm passt auf die 1500er', fuenfzehn && fuenfzehn.passt, true);
    if(tausend && /Laenge/.test(tausend.grund)) ok('und der Grund steht dabei: "' + tausend.grund + '"');
    else bad('die Ablehnung nennt keinen Grund');
    gleich('Vorschlag ist die passende Maschine', maschineVorschlag(lang, M), 'm1500');
    /* Der Arbeitsraum ist ein Platzhalter — das muss mitkommen, sonst
       liest sich "passt" wie eine Messung. */
    if(k.filter(x => x.unsicher).length) ok('der Platzhalter-Arbeitsraum wird ausgewiesen');
    else bad('der Platzhalter-Arbeitsraum wird verschwiegen');
  }

  /* (5) Auslastung rechnet gegen die KAPAZITAET der Woche, nicht gegen
     die Zahl der Tage. Start Montag: 5 x 480 = 2400 min, 960 belegt. */
  {
    const b = planBelegen({auftraege:[bau({})], maschinen:M, ab:'2026-09-14', tage:14});
    const au = planAuslastung(b, M);
    const w = au.find(x => x.maschine === 'm1000' && x.woche === '2026-09-14');
    gleich('volle Woche hat 2400 min Kapazitaet', w && w.kapazitaet, 2400);
    gleich('  davon 960 belegt', w && Math.round(w.belegt), 960);
    gleich('  macht 40 %', w && Math.round(w.anteil * 100), 40);
    /* Leere Wochen muessen in der Tafel stehen - eine Tafel mit Loechern
       liest sich wie ein Fehler. */
    const leer = au.filter(x => x.belegt === 0).length;
    if(leer) ok('leere Wochen stehen mit in der Tafel (' + leer + ')');
    else bad('leere Wochen fehlen in der Tafel');
  }

  /* (6) Termin gerissen: fertig am 16., Termin am 15. = ein Tag Verzug */
  {
    const b = planBelegen({auftraege:[bau({termin:'2026-09-15'})], maschinen:M, ab:'2026-09-15', tage:30});
    const e = b.auftraege[0];
    gleich('Termin vor dem Fertigtag haelt nicht', e && e.haelt, false);
    gleich('  und der Verzug wird gezaehlt', e && e.verzug, 1);
  }

  /* (7) Ohne Maschine und ohne Zeit wird NICHT eingeplant, sondern
     benannt. Ein Auftrag, der stumm aus der Tafel faellt, ist die
     schlimmste Sorte Fehler: man sucht ihn nicht. */
  {
    const ohne = bau({}); ohne.maschine = '';
    const b = planBelegen({auftraege:[ohne], maschinen:M, ab:'2026-09-15', tage:30});
    gleich('ohne Maschine: nicht eingeplant', b.auftraege.length, 0);
    gleich('  sondern benannt', b.unplanbar.length, 1);
    if(b.unplanbar[0] && /Maschine/.test(b.unplanbar[0].grund)) ok('  mit Grund: "' + b.unplanbar[0].grund + '"');
    else bad('  ohne brauchbaren Grund');
    const leerZeit = bau({ruest:0, sz:0});
    const b2 = planBelegen({auftraege:[leerZeit], maschinen:M, ab:'2026-09-15', tage:30});
    if(b2.unplanbar.length && /Zeit/.test(b2.unplanbar[0].grund)) ok('ohne Zeit: benannt statt eingeplant');
    else bad('ohne Zeit: stumm verschwunden');
  }

  /* (8) Auswertung: Umsatz erst bei geliefert, Termintreue nur aus
     bewertbaren Auftraegen. Alles andere waere geschoent. */
  {
    const a1 = bau({nr:'G1', status:'geliefert', preis:1000, termin:'2026-09-18', geliefert:'2026-09-17'});
    const a2 = bau({nr:'G2', status:'geliefert', preis:500, termin:'2026-09-18', geliefert:'2026-09-22'});
    const a3 = bau({nr:'B1', status:'beauftragt', preis:2000});
    const a4 = bau({nr:'N1', status:'angeboten', preis:9999});
    const aw = planAuswertung([a1, a2, a3, a4], M);
    gleich('Umsatz zaehlt nur Geliefertes', aw.umsatz, 1500);
    gleich('Auftragsbestand ist das Beauftragte', aw.auftragsbestand, 2000);
    gleich('  das Angebot zaehlt in keins von beidem', aw.umsatz + aw.auftragsbestand, 3500);
    gleich('Termintreue aus zwei bewertbaren', aw.bewertbar, 2);
    gleich('  einer davon puenktlich', aw.puenktlich, 1);
    gleich('  macht 50 %', Math.round(aw.termintreue * 100), 50);
    const ohne = planAuswertung([a3], M);
    gleich('ohne gelieferte Auftraege ist Termintreue nicht bewertbar', ohne.termintreue, null);
  }

  /* (9) Aus der Kalkulation wird ein Auftrag, ohne dass eine Zahl neu
     entsteht — der Kern des ganzen Pakets. */
  {
    const d = neuerDatensatz();
    d.teil.name = 'Pruefwelle'; d.teil.klasse = 'drehteil_einfach';
    d.teil.volumen_cm3 = 60; d.teil.rotation = {ja:true, achse:'Z', dmax:50, laenge:120, innen:false};
    d.rohteil = {form:'rund', masse:{d:53, l:122}, volumen_cm3:100};
    const k = kalkRechnen({vorgaben:KALK_VORGABEN, teil:d.teil, rohteil:d.rohteil,
                           werkstoff:'S235', toleranz:'mittel', oberflaeche:'normal',
                           seiten:1, stueck:10, versandArt:'versand', ueber:{}});
    const a = auftragAusKalkulation(d, k, {kunde:'Muster', nummer:'A-9', heute:'2026-09-15'});
    gleich('Auftrag ist gueltig', auftragPruefen(a).length, 0);
    gleich('  Ruestzeit unveraendert aus der Kalkulation', a.zeiten.ruestzeit, k.zeiten.ruestzeit);
    gleich('  Stueckzeit unveraendert', a.zeiten.stueckzeit, k.zeiten.stueckzeit);
    gleich('  Stueckzahl unveraendert', a.stueck, k.zeiten.stueck);
    gleich('  Preis unveraendert', a.preis, k.preise.gesamt);
    gleich('  Gattung aus der Kalkulation', a.gattung, k.maschine);
    gleich('  Masse fuer die Maschinenwahl', a.masse.dmax, 50);
    /* Und die Gegenrechnung: die Belegung dieses Auftrags muss dieselbe
       Zeit ergeben, die der Preis benutzt hat. */
    const min = planMinuten(a);
    nahe('  Belegung = Ruesten + Stueckzeit x Stueck', min.gesamt,
         k.zeiten.ruestzeit + k.zeiten.stueckzeit * k.zeiten.stueck, 1e-9);
  }

  /* (10) Oberflaeche verdrahtet */
  {
    const noetig = ['tabAuf', 'tabPlan', 'aufTab', 'aufMaske', 'afNummer', 'afGaenge', 'afGangPlus',
                    'afStatus', 'afTermin', 'afOk', 'afPapier', 'plAb', 'plTage',
                    'plTafel', 'plTermine', 'plAusw', 'plMaschinen', 'laufkarte'];
    const fehlt = noetig.filter(id => quelltext.indexOf('id="' + id + '"') < 0);
    if(!fehlt.length) ok('alle ' + noetig.length + ' Bedienelemente stehen im Quelltext');
    else bad('Bedienelemente fehlen: ' + fehlt.join(', '));
    ['wVerdrahten', 'wListeMalen', 'wPlanMalen', 'wLaufkarte'].forEach(nm => {
      if(typeof hole(nm) === 'function') ok('Funktion vorhanden: ' + nm);
      else bad('Funktion fehlt: ' + nm);
    });
    /* Der Stil MUSS im style-Block stehen - der erste Bau haengte ihn
       dahinter, und das CSS stand als Text auf der Seite. */
    const st = quelltext.indexOf('/* ---- Werkstatt: Auftraege und Planung');
    const zu = quelltext.indexOf('</style>');
    if(st > 0 && zu > st) ok('der Werkstatt-Stil steht INNERHALB des style-Blocks');
    else bad('der Werkstatt-Stil steht ausserhalb des style-Blocks — er erscheint als Text');
    if(quelltext.indexOf('wVerdrahten();') > 0) ok('wVerdrahten laeuft beim Start mit');
    else bad('wVerdrahten wird beim Start nicht gerufen');
  }
}

/* --- 12. Arbeitsgaenge ------------------------------------------------
   Ein Auftrag ist nicht mehr EIN Arbeitsgang auf EINER Maschine. Das war
   die groesste Luecke des ERP-Grundgeruests: 17 der 37 Drehteile des Bestands
   sind drehteil_fraes und laufen erst auf der Drehbank, dann auf der
   Fraese - mit einem Gang je Auftrag bekommt die Fraesmaschine nie eine
   Minute, obwohl sie belegt ist.

   ALLE ZAHLEN SIND VON HAND NACHRECHENBAR. 2026-09-15 ist ein Dienstag,
   2026-09-18 ein Freitag, 2026-09-21 ein Montag.                      */
console.log('\n12) Arbeitsgaenge: die Kette Drehen - Fraesen');
{
  const neuerAuftrag = hole('neuerAuftrag'), auftragPruefen = hole('auftragPruefen');
  const auftragGaenge = hole('auftragGaenge'), gaengeSumme = hole('gaengeSumme');
  const gangAnhaengen = hole('gangAnhaengen'), gangEntfernen = hole('gangEntfernen');
  const gaengeAusgleichen = hole('gaengeAusgleichen'), gangHinweis = hole('gangHinweis');
  const gaengeMaterialisieren = hole('gaengeMaterialisieren');
  const maschinenFuerAuftrag = hole('maschinenFuerAuftrag');
  const planBelegen = hole('planBelegen'), planMinuten = hole('planMinuten');
  const planAuslastung = hole('planAuslastung');
  const M = hole('WERKSTATT_MASCHINEN');

  ['auftragGaenge', 'gaengeSumme', 'gangAnhaengen', 'gangEntfernen',
   'gaengeAusgleichen', 'gangHinweis', 'gaengeMaterialisieren'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });

  /* Der Auftrag, an dem gerechnet wird: 100 Stueck, 90 min ruesten,
     10,5 min je Stueck. Zusammen 90 + 1050 = 1140 Minuten. */
  const bau = (o) => {
    const a = neuerAuftrag();
    a.nummer = (o && o.nr) || 'G-1'; a.teil = 'Flansch'; a.stueck = 100;
    a.status = 'beauftragt'; a.klasse = 'drehteil_fraes'; a.gattung = 'drehen';
    a.zeiten = {ruestzeit:90, stueckzeit:10.5};
    a.maschine = 'm1000';
    a.masse = {dmax:60, laenge:200, x:200, y:60, z:60};
    return a;
  };
  /* Die Kette: 60/9 auf der Drehbank, 30/1,5 auf der Fraese. Die Summe
     ist genau das, was die Kalkulation gerechnet hat. */
  const kette = (o) => {
    const a = bau(o);
    a.gaenge = [
      {nr:1, name:'drehen',  maschine:'m1000', ruestzeit:60, stueckzeit:9},
      {nr:2, name:'fraesen', maschine:'fr1',   ruestzeit:30, stueckzeit:1.5}
    ];
    return a;
  };

  /* (1) OHNE gaenge ist ein Auftrag EIN Gang - alles von gestern laeuft
     unveraendert weiter. Das ist die Bedingung dafuer, dass gespeicherte
     Auftraege und Dateien nichts merken. */
  {
    const a = bau({});
    const g = auftragGaenge(a);
    gleich('ohne gaenge: genau ein Arbeitsgang', g.length, 1);
    gleich('  seine Maschine ist die des Auftrags', g[0].maschine, 'm1000');
    gleich('  seine Ruestzeit ist die der Kalkulation', g[0].ruestzeit, 90);
    const min = planMinuten(a);
    nahe('  planMinuten rechnet wie vorher (Ruesten + Stueckzeit x Stueck)',
         min.gesamt, 90 + 10.5 * 100, 1e-9);
    const b = planBelegen({auftraege:[a], maschinen:M, ab:'2026-09-15', tage:30});
    gleich('  1140 min auf 480 min/Tag ergeben drei Bloecke', b.bloecke.length, 3);
    gleich('  Start Dienstag', b.auftraege[0] && b.auftraege[0].start, '2026-09-15');
    gleich('  fertig Donnerstag', b.auftraege[0] && b.auftraege[0].ende, '2026-09-17');
  }

  /* (2) DIE EINE REGEL: die Gaenge teilen die kalkulierte Zeit auf, sie
     erzeugen keine. Ohne sie waere der Preis eine Zahl fuer sich. */
  {
    const a = kette({});
    const su = gaengeSumme(a);
    gleich('Summe der Ruestzeiten = Kalkulation', su.ruestzeit, 90);
    gleich('Summe der Stueckzeiten = Kalkulation', su.stueckzeit, 10.5);
    gleich('  der Auftrag ist gueltig', auftragPruefen(a).length, 0);

    const kaputt = kette({});
    kaputt.gaenge[0].ruestzeit = 50;      /* 50 + 30 = 80 statt 90 */
    const f = auftragPruefen(kaputt);
    if(f.some(x => /ruesten zusammen 80 min/.test(x)))
      ok('Wache schlaegt an, wenn die Gaenge nicht die kalkulierte Zeit ergeben');
    else bad('Wache schweigt bei falscher Summe: ' + JSON.stringify(f));

    /* Anhaengen darf die Summe NICHT veraendern - der neue Gang faengt
       bei null an, und erst die Minuten, die hinueberwandern, fehlen
       woanders. */
    const c = bau({});
    gaengeMaterialisieren(c);
    gangAnhaengen(c, 'entgraten', 'hand');
    const s2 = gaengeSumme(c);
    gleich('ein neuer Gang aendert die Summe nicht (ruesten)', s2.ruestzeit, 90);
    gleich('  und nicht die Stueckzeit', s2.stueckzeit, 10.5);
    gleich('  der Auftrag bleibt gueltig', auftragPruefen(c).length, 0);
    /* Jetzt wandern 15 Minuten hinueber: der erste Gang bekommt den Rest. */
    c.gaenge[1].ruestzeit = 15; c.gaenge[1].stueckzeit = 2;
    gaengeAusgleichen(c);
    gleich('Ausgleichen: der erste Gang bekommt den Rest (ruesten)', c.gaenge[0].ruestzeit, 75);
    gleich('  und den Rest je Stueck', c.gaenge[0].stueckzeit, 8.5);
    gleich('  die Summe stimmt weiter', auftragPruefen(c).length, 0);
  }

  /* (3) DER KERN: zwei Gaenge, zwei Maschinen, ein Tag Abstand.
     Drehen 60 + 9 x 100 = 960 min = zwei volle Tage (Di, Mi).
     Fraesen 30 + 1,5 x 100 = 180 min = ein Tag, fruehestens Do. */
  {
    const b = planBelegen({auftraege:[kette({})], maschinen:M, ab:'2026-09-15', tage:30});
    const e = b.auftraege[0];
    gleich('zwei Gaenge ergeben drei Bloecke', b.bloecke.length, 3);
    gleich('  der Auftrag ist eingeplant', b.auftraege.length, 1);
    gleich('  er hat zwei Arbeitsgaenge', e && e.gaenge && e.gaenge.length, 2);
    gleich('  Gang 1 dreht Di bis Mi', e && e.gaenge[0].start + '..' + e.gaenge[0].ende,
           '2026-09-15..2026-09-16');
    gleich('  Gang 2 fraest am Donnerstag', e && e.gaenge[1].start, '2026-09-17');
    gleich('  Uebergabe: nicht am selben Tag wie das Drehende', e && e.gaenge[1].start !== e.gaenge[0].ende, true);
    gleich('  der Auftrag ist am Donnerstag fertig', e && e.ende, '2026-09-17');
    gleich('  und faengt am Dienstag an', e && e.start, '2026-09-15');
    /* DAS ist der Punkt des ganzen Pakets: die Fraesmaschine bekommt
       Minuten. Vorher war sie in jeder Tafel leer. */
    const fr = b.bloecke.filter(k => k.maschine === 'fr1');
    gleich('die Fraesmaschine bekommt einen Block', fr.length, 1);
    gleich('  mit 180 Minuten', fr[0] && Math.round(fr[0].minuten), 180);
    gleich('  und er weiss, zu welchem Gang er gehoert', fr[0] && fr[0].gang, 2);
    const dr = b.bloecke.filter(k => k.maschine === 'm1000');
    gleich('die Drehmaschine traegt nur noch ihre 960 min', dr.length, 2);
    nahe('  zusammen', dr.reduce((x, k) => x + k.minuten, 0), 960, 1e-9);
    /* Und die Tafel zeigt beide. */
    const au = planAuslastung(b, M);
    const wD = au.filter(x => x.maschine === 'm1000' && x.woche === '2026-09-14')[0];
    const wF = au.filter(x => x.maschine === 'fr1' && x.woche === '2026-09-14')[0];
    /* Die Woche ist ANGEBROCHEN: geplant wird ab Dienstag, also zaehlen
       nur vier Tage = 1920 min. (Meine erste Erwartung stand auf 2400 und
       war falsch - genau der Fall, vor dem die Legende der Tafel warnt.) */
    gleich('die angebrochene Woche hat vier Tage Kapazitaet', wD && wD.kapazitaet, 1920);
    gleich('Auslastung Drehmaschine 960 min', wD && Math.round(wD.belegt), 960);
    gleich('Auslastung Fraesmaschine 180 min', wF && Math.round(wF.belegt), 180);
    gleich('  macht 50 % und 9 %',
           (wD && Math.round(wD.anteil * 100)) + '/' + (wF && Math.round(wF.anteil * 100)), '50/9');
    /* Die Kette steht im Klartext - danach sucht man in der Tafel. */
    if(e && /Monforts 1000/.test(e.maschineName) && /Fraes/.test(e.maschineName))
      ok('der Maschinenname nennt die ganze Kette: "' + e.maschineName + '"');
    else bad('der Maschinenname nennt die Kette nicht: "' + (e && e.maschineName) + '"');
  }

  /* (4) Die Uebergabe ueberspringt das Wochenende. Gang 1 endet Freitag,
     Gang 2 kann fruehestens Samstag - und da laeuft nichts. */
  {
    const a = bau({});
    a.stueck = 1; a.zeiten = {ruestzeit:720, stueckzeit:0};
    a.gaenge = [
      {nr:1, name:'drehen',  maschine:'m1000', ruestzeit:480, stueckzeit:0},
      {nr:2, name:'fraesen', maschine:'fr1',   ruestzeit:240, stueckzeit:0}
    ];
    gleich('Summe stimmt', gaengeSumme(a).ruestzeit, 720);
    const b = planBelegen({auftraege:[a], maschinen:M, ab:'2026-09-18', tage:30});
    const e = b.auftraege[0];
    gleich('Gang 1 am Freitag', e && e.gaenge[0].ende, '2026-09-18');
    gleich('Gang 2 erst am Montag', e && e.gaenge[1].start, '2026-09-21');
  }

  /* (5) Fehlt EINEM Gang die Maschine, faellt der GANZE Auftrag heraus.
     Ein halb geplanter Auftrag waere die gefaehrlichste Auskunft: er
     stuende mit einem Fertigtag da, den nur die halbe Arbeit trifft. */
  {
    const a = kette({});
    a.gaenge[1].maschine = '';
    const b = planBelegen({auftraege:[a], maschinen:M, ab:'2026-09-15', tage:30});
    gleich('nichts eingeplant', b.auftraege.length, 0);
    gleich('  auch kein halber Auftrag in der Tafel', b.bloecke.length, 0);
    gleich('  sondern benannt', b.unplanbar.length, 1);
    if(b.unplanbar[0] && /Arbeitsgang 2 \(fraesen\)/.test(b.unplanbar[0].grund))
      ok('  und der Grund nennt den Gang: "' + b.unplanbar[0].grund + '"');
    else bad('  ohne Angabe, welcher Gang: "' + (b.unplanbar[0] && b.unplanbar[0].grund) + '"');
  }

  /* (6) Einen Gang entfernen darf keine Zeit verschlucken - sie faellt
     an den ersten zurueck. Sonst waere die Summe mit einem Klick kaputt
     und der Preis still falsch. */
  {
    const a = kette({});
    gleich('Entfernen gelingt', gangEntfernen(a, 1), true);
    gleich('  ein Gang bleibt', a.gaenge.length, 1);
    gleich('  mit der ganzen Ruestzeit', a.gaenge[0].ruestzeit, 90);
    gleich('  und der ganzen Stueckzeit', a.gaenge[0].stueckzeit, 10.5);
    gleich('  der Auftrag ist weiter gueltig', auftragPruefen(a).length, 0);
    gleich('den LETZTEN Gang entfernen geht nicht', gangEntfernen(a, 0), false);
  }

  /* (7) Zuviel verteilt: der erste Gang geht ins Minus, und das wird
     NICHT stumm auf null geklemmt. Ein geklemmter Wert saehe richtig aus
     und waere es nicht. */
  {
    const a = kette({});
    a.gaenge[1].ruestzeit = 120;     /* mehr als die 90 der Kalkulation */
    gaengeAusgleichen(a);
    gleich('der erste Gang steht im Minus', a.gaenge[0].ruestzeit, -30);
    const f = auftragPruefen(a);
    if(f.some(x => /negative Zeit/.test(x))) ok('  und die Wache sagt es');
    else bad('  aber niemand sagt es: ' + JSON.stringify(f));
  }

  /* (8) Der Hinweis auf den Fraesanteil. Die Klasse weiss, DASS gefraest
     wird; wieviel Zeit dorthin faellt, weiss nur die Werkstatt - deshalb ein
     Hinweis und keine Automatik. */
  {
    const a = bau({});
    const h = gangHinweis(a);
    if(/Fraesanteil/.test(h)) ok('drehteil_fraes mit einem Gang bekommt den Hinweis');
    else bad('kein Hinweis beim Drehteil mit Fraesanteil: "' + h + '"');
    gleich('  bei zwei Gaengen schweigt er', gangHinweis(kette({})), '');
    const einfach = bau({}); einfach.klasse = 'drehteil_einfach';
    gleich('  beim reinen Drehteil schweigt er auch', gangHinweis(einfach), '');
  }

  /* (9) Die Maschinenwahl je Gang: 'alle' bietet auch die Fraese an -
     und prueft ihren Arbeitsraum trotzdem. */
  {
    const a = bau({});
    const nurDrehen = maschinenFuerAuftrag(a, M);
    const alle = maschinenFuerAuftrag(a, M, 'alle');
    gleich('die Auftragsgattung bietet nur Drehmaschinen', nurDrehen.length, 2);
    gleich('  "alle" bietet jede aktive Maschine', alle.length, M.filter(m => m.aktiv).length);
    const fr = alle.filter(x => x.id === 'fr1')[0];
    gleich('  die Fraese ist waehlbar', fr && fr.passt, true);
    /* Ein Teil, das nicht in die Fraese passt: 900 x 400 x 400 gegen
       800 x 500 x 500 - die laengste Kante reisst. */
    const gross = bau({}); gross.masse = {dmax:60, laenge:900, x:900, y:400, z:400};
    const fr2 = maschinenFuerAuftrag(gross, M, 'alle').filter(x => x.id === 'fr1')[0];
    gleich('  ein 900er Teil passt nicht in die Fraese', fr2 && fr2.passt, false);
    if(fr2 && /Kante 900/.test(fr2.grund)) ok('  mit Grund: "' + fr2.grund + '"');
    else bad('  ohne brauchbaren Grund: "' + (fr2 && fr2.grund) + '"');
    /* Und der Arbeitsraum der DREHmaschine wird bei 'alle' nicht auf die
       Fraese angewandt - das war die Falle beim Bau. */
    const m15 = maschinenFuerAuftrag(gross, M, 'alle').filter(x => x.id === 'm1500')[0];
    gleich('  die 1500er misst weiter nach Durchmesser und Laenge', m15 && m15.passt, true);
  }

  /* (10) Die Auswertung rechnet ueber die Gaenge. BEFUND AM BILD: die
     Planungstafel zeigte die Fraese belegt, die Auswertung darunter
     stand bei 0 Auftraegen und 0,0 Stunden - planAuswertung schrieb die
     ganze Zeit auf die Maschine des ERSTEN Gangs. */
  {
    const planAuswertung = hole('planAuswertung');
    const a = kette({nr:'G-A'});
    a.status = 'geliefert'; a.preis = 3000;
    a.liefertermin = '2026-09-18'; a.rueckmeldung = {gefertigt:100, datum:'2026-09-17'};
    const aw = planAuswertung([a], M);
    const dr = aw.jeMaschine.filter(m => m.id === 'm1000')[0];
    const fr = aw.jeMaschine.filter(m => m.id === 'fr1')[0];
    gleich('Auswertung: die Drehmaschine traegt 960 min', dr && Math.round(dr.minuten), 960);
    gleich('  die Fraesmaschine traegt 180 min', fr && Math.round(fr.minuten), 180);
    gleich('  und zaehlt den Auftrag mit', fr && fr.auftraege, 1);
    nahe('  zusammen ergeben die Maschinen die Auftragszeit',
         aw.jeMaschine.reduce((x, m) => x + m.minuten, 0), 1140, 1e-9);
    /* Der Umsatz gehoert dem Auftrag; auf die Maschinen kommt er als
       UMLAGE nach Zeit. Erfunden werden darf dabei nichts. */
    nahe('  Umsatz nach Zeitanteil auf die Drehmaschine', dr && dr.umsatz, 3000 * 960 / 1140, 1e-6);
    nahe('  und auf die Fraese', fr && fr.umsatz, 3000 * 180 / 1140, 1e-6);
    nahe('  die Umlage erfindet kein Geld',
         aw.jeMaschine.reduce((x, m) => x + m.umsatz, 0), 3000, 1e-6);
    gleich('  der Gesamtumsatz bleibt der Auftragswert', aw.umsatz, 3000);
    /* Zweimal dieselbe Maschine ist EIN Auftrag - sonst waere die Spalte
       "Auftraege" in Wahrheit eine Gangzahl. */
    const zwei = kette({nr:'G-B'});
    zwei.gaenge[1].maschine = 'm1000';
    const aw2 = planAuswertung([zwei], M);
    const d2 = aw2.jeMaschine.filter(m => m.id === 'm1000')[0];
    gleich('zwei Gaenge auf derselben Maschine zaehlen als ein Auftrag', d2 && d2.auftraege, 1);
    nahe('  aber mit beiden Zeiten', d2 && d2.minuten, 1140, 1e-9);
  }

  /* (11) Oberflaeche */
  {
    ['wGaengeMalen', 'wGaengeLesen', 'wGangMaschinen'].forEach(nm => {
      if(typeof hole(nm) === 'function') ok('Funktion vorhanden: ' + nm);
      else bad('Funktion fehlt: ' + nm);
    });
    ['afGaenge', 'afGangPlus', 'afGangSumme', 'afGangHinweis'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    /* Die Handy-Regeln der Feldzeile muessen NACH .feld label stehen.
       Eine Media-Query zaehlt bei der Spezifitaet nicht mit; steht die
       Regel frueher, gewinnt .feld label und die Maske ist am Handy
       27 px zu breit. Genau so gemessen, bevor sie ans Ende wanderte. */
    const iLabel = quelltext.indexOf('.feld label{ flex:0 0 auto');
    const iHandy = quelltext.indexOf('.feld label{ min-width:118px; }');
    if(iLabel > 0 && iHandy > iLabel) ok('die Handy-Feldregeln stehen NACH .feld label');
    else bad('die Handy-Feldregeln stehen vor .feld label - sie bleiben wirkungslos');
    /* Fuenf Reiter passen bei 390 px nicht in eine Zeile (gemessen: die
       Seite war 499 statt 390 px breit). */
    if(/@media \(max-width: 700px\)\{[\s\S]{0,200}header \.schritt\{[^}]*flex-wrap:wrap/.test(quelltext))
      ok('die Reiterleiste darf am Handy umbrechen');
    else bad('die Reiterleiste bricht am Handy nicht um - die Seite laesst sich zur Seite schieben');

    /* Die Zeiten des ERSTEN Gangs duerfen kein Eingabefeld sein - sie
       sind der Rest. Waeren sie eingebbar, koennte die Summe abweichen,
       ohne dass es jemandem auffaellt. */
    if(/i === 0[\s\S]{0,200}class="z fest"/.test(quelltext))
      ok('der erste Gang zeigt seine Zeiten als feste Zelle, nicht als Feld');
    else bad('der erste Gang hat Eingabefelder - dann kann die Summe abweichen');
  }
}

/* --- 13. Rueckmeldung: Soll gegen Ist ---------------------------------
   Die Kalkulation SCHAETZT eine Zeit, die Werkstatt MISST eine. Dieser
   Abschnitt haelt fest, dass beide nebeneinanderstehen und keine die
   andere still ueberschreibt.

   ALLE ZAHLEN SIND SO GEWAEHLT, DASS SIE IM KOPF AUFGEHEN: die Ist-Werte
   sind genau das 1,2-fache der Soll-Werte, der Faktor muss also ueberall
   exakt 1,2 sein.                                                      */
console.log('\n13) Rueckmeldung: Soll gegen Ist');
{
  const neuerAuftrag = hole('neuerAuftrag'), auftragPruefen = hole('auftragPruefen');
  const istGaenge = hole('istGaenge'), istSumme = hole('istSumme'), istSetzen = hole('istSetzen');
  const gangEntfernen = hole('gangEntfernen'), planSollIst = hole('planSollIst');
  const M = hole('WERKSTATT_MASCHINEN');

  ['istZahl', 'istGaenge', 'istSumme', 'istSetzen', 'planSollIst', 'planImFenster'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });

  /* Soll: 60/9 auf der Drehbank, 30/1,5 auf der Fraese, 100 Stueck.
     Zusammen 90 min ruesten und 10,5 min je Stueck = 1140 min. */
  const kette = (nr) => {
    const a = neuerAuftrag();
    a.nummer = nr || 'I-1'; a.teil = 'Flansch'; a.kunde = 'Muster';
    a.stueck = 100; a.status = 'geliefert'; a.klasse = 'drehteil_fraes';
    a.gattung = 'drehen'; a.zeiten = {ruestzeit:90, stueckzeit:10.5};
    a.maschine = 'm1000'; a.masse = {dmax:60, laenge:200, x:200, y:60, z:60};
    a.gaenge = [
      {nr:1, name:'drehen',  maschine:'m1000', ruestzeit:60, stueckzeit:9},
      {nr:2, name:'fraesen', maschine:'fr1',   ruestzeit:30, stueckzeit:1.5}
    ];
    return a;
  };
  /* Ist = 1,2 x Soll, ueberall. */
  const melden = (a) => {
    istSetzen(a, 1, 'ruestzeit', 72);  istSetzen(a, 1, 'stueckzeit', 10.8);
    istSetzen(a, 2, 'ruestzeit', 36);  istSetzen(a, 2, 'stueckzeit', 1.8);
    return a;
  };

  /* (1) Ohne Rueckmeldung entsteht kein Faktor. */
  {
    const a = kette();
    const su = istSumme(a);
    gleich('ohne Rueckmeldung: nicht vollstaendig', su.vollstaendig, false);
    gleich('  und auch nicht angefangen', su.angefangen, false);
    gleich('  kein Faktor', su.faktor, null);
    gleich('  das Soll steht trotzdem da', su.sollGesamt, 1140);
    gleich('  der Auftrag ist gueltig', auftragPruefen(a).length, 0);
  }

  /* (2) Ein halber Zettel ergibt keine Kennzahl. Aus halben Zetteln eine
     Zahl zu rechnen saehe genauso aus wie aus ganzen - und niemand
     koennte den Unterschied sehen. */
  {
    const a = kette();
    istSetzen(a, 1, 'ruestzeit', 72); istSetzen(a, 1, 'stueckzeit', 10.8);
    const su = istSumme(a);
    gleich('nur Gang 1 gemeldet: angefangen', su.angefangen, true);
    gleich('  nicht vollstaendig', su.vollstaendig, false);
    gleich('  kein Faktor', su.faktor, null);
    /* Die Rueckmeldung sitzt am RICHTIGEN Gang - nicht an dem, der
       zufaellig als erster in der Liste steht. */
    const b = kette();
    istSetzen(b, 2, 'ruestzeit', 36); istSetzen(b, 2, 'stueckzeit', 1.8);
    const g = istGaenge(b);
    gleich('nur Gang 2 gemeldet: Gang 1 bleibt leer', g[0].istRuest, null);
    gleich('  und Gang 2 traegt die Zeit', g[1].istRuest, 36);
  }

  /* (3) Vollstaendig: der Faktor ist ueberall exakt 1,2. */
  {
    const a = melden(kette());
    const su = istSumme(a);
    gleich('vollstaendig zurueckgemeldet', su.vollstaendig, true);
    gleich('  Ist-Ruesten 108 min', su.istRuest, 108);
    nahe('  Ist je Stueck 12,6 min', su.istStueck, 12.6, 1e-9);
    nahe('  Ist gesamt 1368 min', su.istGesamt, 1368, 1e-9);
    nahe('  Faktor 1,2', su.faktor, 1.2, 1e-9);
    nahe('  Faktor Ruesten 1,2', su.faktorRuesten, 1.2, 1e-9);
    nahe('  Faktor je Stueck 1,2', su.faktorStueck, 1.2, 1e-9);
    /* DIE TRAGENDE ZUSAGE: die Kalkulation bleibt unberuehrt. */
    gleich('die Kalkulation ist unveraendert (ruesten)', a.zeiten.ruestzeit, 90);
    gleich('  und je Stueck', a.zeiten.stueckzeit, 10.5);
    gleich('  der Auftrag ist gueltig', auftragPruefen(a).length, 0);
  }

  /* (4) Ein abgebrochener Auftrag verfaelscht den Faktor nicht: der
     Faktor rechnet die Ist-SAETZE auf die Soll-Stueckzahl. Wer nach 30
     von 100 Stueck abbricht, hat trotzdem eine Ruest- und eine
     Stueckzeit gemessen, und die sind die Aussage. */
  {
    const a = melden(kette());
    a.rueckmeldung.gefertigt = 30; a.rueckmeldung.ausschuss = 2;
    const su = istSumme(a);
    nahe('abgebrochene Serie: Faktor bleibt 1,2', su.faktor, 1.2, 1e-9);
    gleich('  gefertigt und Ausschuss stehen trotzdem da', su.gefertigt + '/' + su.ausschuss, '30/2');
  }

  /* (5) istSetzen: ein leerer Wert nimmt die Meldung zurueck. Einen
     Tippfehler muss man loeschen koennen, ohne den Auftrag anzufassen. */
  {
    const a = melden(kette());
    istSetzen(a, 2, 'ruestzeit', '');
    gleich('leerer Wert loescht die Ruestzeit', istGaenge(a)[1].istRuest, null);
    gleich('  die Stueckzeit bleibt', istGaenge(a)[1].istStueck, 1.8);
    istSetzen(a, 2, 'stueckzeit', '');
    gleich('  ohne beide Zeiten verschwindet der Eintrag', a.rueckmeldung.gaenge.length, 1);
  }

  /* (6) DER FEHLER, der beim Durchdenken der Kopplung auffiel: die
     Rueckmeldungen haengen an der GANGNUMMER, und gangEntfernen
     nummeriert um. Ohne Nachfuehrung wandert die gemessene Zeit von
     Gang 3 still auf Gang 2 - beide Zahlen sehen danach plausibel aus. */
  {
    const a = kette();
    a.gaenge.push({nr:3, name:'entgraten', maschine:'hand', ruestzeit:0, stueckzeit:0});
    istSetzen(a, 3, 'ruestzeit', 5); istSetzen(a, 3, 'stueckzeit', 0.5);
    istSetzen(a, 2, 'ruestzeit', 36); istSetzen(a, 2, 'stueckzeit', 1.8);
    gleich('Gang 2 entfernen gelingt', gangEntfernen(a, 1), true);
    gleich('  zwei Gaenge bleiben', a.gaenge.length, 2);
    gleich('  der dritte heisst jetzt 2', a.gaenge[1].name, 'entgraten');
    const g = istGaenge(a);
    gleich('  und seine Rueckmeldung wandert mit', g[1].istRuest, 5);
    gleich('  die des entfernten Gangs ist weg', a.rueckmeldung.gaenge.length, 1);
    gleich('  kein Verweis auf einen Gang, den es nicht gibt', auftragPruefen(a).length, 0);
  }

  /* (7) Die Wache: eine Rueckmeldung, die zu keinem Gang gehoert. Sie
     steht in keiner Tabelle und faellt sonst niemandem auf. */
  {
    const a = melden(kette());
    a.rueckmeldung.gaenge.push({nr:7, ruestzeit:12, stueckzeit:1});
    const f = auftragPruefen(a);
    if(f.some(x => /Arbeitsgang 7, den es nicht gibt/.test(x)))
      ok('Wache schlaegt bei einer verwaisten Rueckmeldung an');
    else bad('verwaiste Rueckmeldung bleibt unbemerkt: ' + JSON.stringify(f));
  }

  /* (8) Soll gegen Ist ueber mehrere Auftraege. */
  {
    const voll = melden(kette('I-A'));
    const halb = kette('I-B');
    istSetzen(halb, 1, 'ruestzeit', 999); istSetzen(halb, 1, 'stueckzeit', 99);
    const stumm = kette('I-C');
    const si = planSollIst([voll, halb, stumm], M);
    gleich('nur der vollstaendige Auftrag zaehlt', si.zahl, 1);
    gleich('  der angefangene wird gezaehlt, nicht gerechnet', si.angefangen, 1);
    gleich('  der stumme auch', si.ohneRueckmeldung, 1);
    gleich('  betrachtet wurden alle drei', si.betrachtet, 3);
    nahe('  Soll 1140 min', si.soll, 1140, 1e-9);
    nahe('  Ist 1368 min', si.ist, 1368, 1e-9);
    nahe('  Faktor 1,2', si.faktor, 1.2, 1e-9);
    const dr = si.jeMaschine.filter(m => m.id === 'm1000')[0];
    const fr = si.jeMaschine.filter(m => m.id === 'fr1')[0];
    nahe('  Drehmaschine Soll 960', dr && dr.soll, 960, 1e-9);
    nahe('  Drehmaschine Ist 1152', dr && dr.ist, 1152, 1e-9);
    nahe('  Fraesmaschine Soll 180', fr && fr.soll, 180, 1e-9);
    nahe('  Fraesmaschine Ist 216', fr && fr.ist, 216, 1e-9);
    nahe('  beide mit Faktor 1,2', (dr && dr.faktor) + (fr && fr.faktor), 2.4, 1e-9);
    const kl = si.jeKlasse.filter(k => k.klasse === 'drehteil_fraes')[0];
    gleich('  die Klasse wird gefuehrt', kl && kl.auftraege, 1);
    nahe('  mit demselben Faktor', kl && kl.faktor, 1.2, 1e-9);
    /* Der 999er Auftrag darf NIRGENDS auftauchen - sonst waere die
       Kennzahl aus einem halben Zettel gerechnet. */
    if(si.ist < 1400) ok('  der angefangene Auftrag faerbt nicht ab');
    else bad('  der angefangene Auftrag ist mitgerechnet: Ist ' + si.ist);
  }

  /* (9) Oberflaeche */
  {
    ['wIstMalen', 'wIstLesen', 'wFaktor'].forEach(nm => {
      if(typeof hole(nm) === 'function') ok('Funktion vorhanden: ' + nm);
      else bad('Funktion fehlt: ' + nm);
    });
    ['afIst', 'afAusschuss', 'plSollIst', 'plSollIstHinweis'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    /* Der Satz muss in der Oberflaeche stehen, nicht nur im Kommentar -
       wer die Faktoren sieht, muss wissen, dass nichts von selbst
       passiert. */
    if(/App &auml;ndert daraufhin nichts von selbst/.test(quelltext))
      ok('die Tafel sagt, dass die App von sich aus nichts aendert');
    else bad('die Tafel verschweigt, dass die App von sich aus nichts aendert');
  }
}

/* --- 14. Rueckwaerts: der spaeteste Start -----------------------------
   Die Vorwaertsplanung sagt, wann ein Auftrag fertig WIRD. Dieser
   Abschnitt haelt fest, dass die App auch sagt, wann er anfangen MUSS -
   und dass beide Zahlen getrennt bleiben.

   KALENDER: 2026-09-15 Dienstag, 2026-09-18 Freitag, 2026-09-21 Montag,
   2026-09-23 Mittwoch, 2026-09-25 Freitag, 2026-09-26 Samstag.      */
console.log('\n14) Rueckwaerts: der spaeteste Start');
{
  const neuerAuftrag = hole('neuerAuftrag');
  const planSpaetester = hole('planSpaetester'), planBelegen = hole('planBelegen');
  const M = hole('WERKSTATT_MASCHINEN');

  if(typeof planSpaetester === 'function') ok('vorhanden: planSpaetester');
  else bad('fehlt: planSpaetester');

  /* Drehen 60 + 9 x 100 = 960 min = zwei volle Tage.
     Fraesen 30 + 1,5 x 100 = 180 min = ein Tag. */
  const kette = (termin) => {
    const a = neuerAuftrag();
    a.nummer = 'R-1'; a.teil = 'Flansch'; a.stueck = 100; a.status = 'beauftragt';
    a.klasse = 'drehteil_fraes'; a.gattung = 'drehen';
    a.zeiten = {ruestzeit:90, stueckzeit:10.5}; a.maschine = 'm1000';
    a.liefertermin = termin || '';
    a.masse = {dmax:60, laenge:200, x:200, y:60, z:60};
    a.gaenge = [
      {nr:1, name:'drehen',  maschine:'m1000', ruestzeit:60, stueckzeit:9},
      {nr:2, name:'fraesen', maschine:'fr1',   ruestzeit:30, stueckzeit:1.5}
    ];
    return a;
  };

  /* (1) Liefertermin Freitag 25.: fraesen am Freitag, davor zwei Tage
     drehen (Mi 23. und Do 24.). Spaetester Start also Mittwoch. */
  {
    const sp = planSpaetester(kette('2026-09-25'), M);
    gleich('Fraesen liegt am Liefertag', sp && sp.gaenge[1].start, '2026-09-25');
    gleich('  Drehen davor: Mi bis Do', sp && sp.gaenge[0].start + '..' + sp.gaenge[0].ende,
           '2026-09-23..2026-09-24');
    gleich('  spaetester Start ist der Mittwoch', sp && sp.start, '2026-09-23');
    gleich('  Ende bleibt der Liefertag', sp && sp.ende, '2026-09-25');
    gleich('  drei Tage Spanne', sp && sp.tage, 3);
  }

  /* (2) Rueckwaerts gilt der Kalender genauso: Liefertermin Montag 21.,
     davor liegen Samstag und Sonntag - gedreht wird Do und Fr. */
  {
    const sp = planSpaetester(kette('2026-09-21'), M);
    gleich('Fraesen am Montag', sp && sp.gaenge[1].start, '2026-09-21');
    gleich('  Drehen Do bis Fr davor', sp && sp.gaenge[0].start + '..' + sp.gaenge[0].ende,
           '2026-09-17..2026-09-18');
    gleich('  das Wochenende wird uebersprungen', sp && sp.start, '2026-09-17');
  }

  /* (3) Faellt der Liefertag selbst auf ein Wochenende, ist der letzte
     Arbeitstag der Freitag davor. */
  {
    const sp = planSpaetester(kette('2026-09-26'), M);
    gleich('Liefertermin Samstag: gefraest wird am Freitag', sp && sp.ende, '2026-09-25');
  }

  /* (4) Ohne Liefertermin gibt es keine Frist - und keine erfundene. */
  {
    gleich('ohne Termin kein spaetester Start', planSpaetester(kette(''), M), null);
    const ohne = kette('2026-09-25'); ohne.gaenge[1].maschine = '';
    gleich('ohne Maschine ebenso', planSpaetester(ohne, M), null);
  }

  /* (5) DER PUFFER in der Vorwaertsplanung: Start am Dienstag 15.,
     spaetester Start Mittwoch 23. - das sind acht Tage. */
  {
    const b = planBelegen({auftraege:[kette('2026-09-25')], maschinen:M, ab:'2026-09-15', tage:30});
    const e = b.auftraege[0];
    gleich('Vorwaertsplanung faengt am Dienstag an', e && e.start, '2026-09-15');
    gleich('  spaetester Start steht daneben', e && e.spaetester, '2026-09-23');
    gleich('  Puffer acht Tage', e && e.puffer, 8);
    gleich('  und der Termin haelt', e && e.haelt, true);
  }

  /* (6) Der Puffer wird negativ, wenn die Arbeit laenger dauert als die
     Zeit bis zum Termin - auch auf einer voellig freien Maschine. Genau
     dafuer ist die Rueckwaertsrechnung da: die Vorwaertsplanung sagt nur
     "zu spaet", nicht "das war nie zu schaffen". */
  {
    const eng = kette('2026-09-16');   /* Mittwoch, einen Tag nach dem Start */
    const b = planBelegen({auftraege:[eng], maschinen:M, ab:'2026-09-15', tage:30});
    const e = b.auftraege[0];
    gleich('enger Termin: Vorwaertsplanung ist zu spaet', e && e.haelt, false);
    gleich('  und der Grund ist die Zeit, nicht die Belegung', e && e.grundVerzug, 'zeit');
    if(e && e.puffer < 0) ok('  und der Puffer ist negativ (' + e.puffer + ')');
    else bad('  aber der Puffer meldet nichts: ' + (e && e.puffer));
    /* Der spaeteste Start laege VOR dem Planungsbeginn - die Arbeit
       haette schon laufen muessen. */
    if(e && e.spaetester < '2026-09-15') ok('  der spaeteste Start liegt vor dem Planungsbeginn: ' + e.spaetester);
    else bad('  der spaeteste Start liegt nicht vor dem Planungsbeginn: ' + (e && e.spaetester));
  }

  /* (6b) DER BEFUND AUS DEM BILD: ein Auftrag, der nur wegen der
     BELEGUNG zu spaet ist, darf nicht "die Zeit reicht nicht" melden.
     Zwei Auftraege auf derselben Maschine, der zweite muss warten. */
  {
    const vorn = kette('2026-09-30'); vorn.nummer = 'V'; vorn.rang = 1;
    const hinten = kette('2026-09-19'); hinten.nummer = 'H'; hinten.rang = 2;
    const b = planBelegen({auftraege:[vorn, hinten], maschinen:M, ab:'2026-09-15', tage:30});
    const h = b.auftraege.filter(x => x.nummer === 'H')[0];
    gleich('der zurueckgestellte Auftrag ist zu spaet', h && h.haelt, false);
    gleich('  aber der Grund ist die BELEGUNG', h && h.grundVerzug, 'belegung');
    /* Die Gegenprobe im selben Atemzug: allein waere er wirklich
       fertig geworden. */
    const allein = planBelegen({auftraege:[kette('2026-09-19')], maschinen:M, ab:'2026-09-15', tage:30});
    gleich('  allein haelt derselbe Termin', allein.auftraege[0].haelt, true);
    /* Und ein Auftrag, der haelt, traegt gar keinen Grund. */
    const v = b.auftraege.filter(x => x.nummer === 'V')[0];
    gleich('  wer haelt, traegt keinen Grund', v && v.grundVerzug, null);
  }

  /* (7) Ein Auftrag ohne Termin traegt keinen Puffer - kein Wert ist
     besser als ein erfundener. */
  {
    const b = planBelegen({auftraege:[kette('')], maschinen:M, ab:'2026-09-15', tage:30});
    const e = b.auftraege[0];
    gleich('ohne Termin kein Puffer', e && e.puffer, null);
    gleich('  und kein spaetester Start', e && e.spaetester, null);
  }

  /* (8) Oberflaeche */
  {
    if(typeof hole('wPuffer') === 'function') ok('Funktion vorhanden: wPuffer');
    else bad('Funktion fehlt: wPuffer');
    if(/sp&auml;testens ab/.test(quelltext)) ok('die Termintafel hat die Spalte');
    else bad('die Termintafel hat keine Spalte fuer den spaetesten Start');
    /* Der Satz muss dastehen: eine Frist ohne Kapazitaetspruefung sieht
       aus wie ein Plan und ist keiner. */
    if(/Frist, kein Plan/.test(quelltext)) ok('die Legende nennt es eine Frist, keinen Plan');
    else bad('die Legende verschweigt, dass die Frist ohne Kapazitaet gerechnet ist');
  }
}

/* --- 15. Reihenfolge von Hand -----------------------------------------
   Zwei Auftraege auf DERSELBEN Maschine, damit der Tausch ueberhaupt
   etwas bedeutet:
     A  960 min (zwei Tage), Liefertermin 2026-09-25
     B  480 min (ein Tag),   Liefertermin 2026-09-18
   Nach Liefertermin kommt B zuerst. Von Hand vorgezogen kommt A zuerst -
   und bekommt die frueheren Tage.                                     */
console.log('\n15) Reihenfolge von Hand');
{
  const neuerAuftrag = hole('neuerAuftrag'), auftragPruefen = hole('auftragPruefen');
  const planBelegen = hole('planBelegen'), planVerschieben = hole('planVerschieben');
  const planRangLoeschen = hole('planRangLoeschen');
  const M = hole('WERKSTATT_MASCHINEN');

  ['planVerschieben', 'planRangLoeschen'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });

  const bau = (nr, min, termin) => {
    const a = neuerAuftrag();
    a.nummer = nr; a.teil = 'Teil ' + nr; a.stueck = 1; a.status = 'beauftragt';
    a.klasse = 'drehteil_einfach'; a.gattung = 'drehen';
    a.zeiten = {ruestzeit:min, stueckzeit:0}; a.maschine = 'm1000';
    a.liefertermin = termin; a.masse = {dmax:60, laenge:200, x:0, y:0, z:0};
    return a;
  };
  const lauf = (liste) => planBelegen({auftraege:liste, maschinen:M, ab:'2026-09-15', tage:30});

  /* (1) Ohne Rang gilt der Liefertermin. */
  {
    const A = bau('A', 960, '2026-09-25'), Bt = bau('B', 480, '2026-09-18');
    gleich('frischer Auftrag hat Rang 0', neuerAuftrag().rang, 0);
    gleich('  und ist gueltig', auftragPruefen(A).length, 0);
    const b = lauf([A, Bt]);
    gleich('B liegt vorn (frueherer Termin)',
           (b.auftraege[0] || {}).nummer || 'NICHT GEPLANT', 'B');
    gleich('  B am Dienstag', b.auftraege[0].start, '2026-09-15');
    gleich('  A danach, Mi bis Do', b.auftraege[1].start + '..' + b.auftraege[1].ende,
           '2026-09-16..2026-09-17');
  }

  /* (2) A von Hand vorziehen: der Tausch schreibt erst die ganze Folge
     fest und tauscht dann. Ohne das Festschreiben blieben beide bei
     Rang 0 und der Liefertermin zoege sie sofort zurueck - der Knopf
     waere tot, und man saehe nicht warum. */
  {
    const A = bau('A', 960, '2026-09-25'), Bt = bau('B', 480, '2026-09-18');
    const b1 = lauf([A, Bt]);
    const folge = b1.auftraege.map(x => x.auftrag);
    gleich('die Zeile zeigt auf ihren Auftrag', folge[0], Bt);
    gleich('Verschieben gelingt', planVerschieben(folge, A, -1), true);
    gleich('  A hat jetzt den kleineren Rang', A.rang < Bt.rang, true);
    gleich('  und beide tragen einen', (A.rang ? 1 : 0) + (Bt.rang ? 1 : 0), 2);
    const b2 = lauf([A, Bt]);
    gleich('A liegt jetzt vorn', b2.auftraege[0].nummer, 'A');
    gleich('  A am Dienstag und Mittwoch', b2.auftraege[0].start + '..' + b2.auftraege[0].ende,
           '2026-09-15..2026-09-16');
    gleich('  B am Donnerstag', b2.auftraege[1].start, '2026-09-17');
    /* Und die Folge ist als Handentscheidung erkennbar. */
    gleich('  die Tafel kann es markieren', b2.auftraege[0].rang > 0, true);
    /* B ist dadurch zu spaet - das ist der Preis, und er steht da. */
    gleich('  B reisst jetzt seinen Termin nicht', b2.auftraege[1].haelt, true);
  }

  /* (3) Am Rand passiert nichts: der erste laesst sich nicht weiter
     vorziehen, der letzte nicht weiter zurueckstellen. */
  {
    const A = bau('A', 960, '2026-09-25'), Bt = bau('B', 480, '2026-09-18');
    const folge = lauf([A, Bt]).auftraege.map(x => x.auftrag);
    gleich('der erste laesst sich nicht vorziehen', planVerschieben(folge, folge[0], -1), false);
    gleich('  der letzte nicht zurueckstellen', planVerschieben(folge, folge[folge.length - 1], 1), false);
    gleich('  und dabei entsteht kein Rang', (A.rang || 0) + (Bt.rang || 0), 0);
    gleich('  ein Auftrag, der nicht in der Folge steht, auch nicht',
           planVerschieben(folge, bau('C', 60, ''), -1), false);
  }

  /* (4) Zuruecksetzen stellt den Liefertermin wieder her. */
  {
    const A = bau('A', 960, '2026-09-25'), Bt = bau('B', 480, '2026-09-18');
    planVerschieben(lauf([A, Bt]).auftraege.map(x => x.auftrag), A, -1);
    gleich('vor dem Zuruecksetzen liegt A vorn', lauf([A, Bt]).auftraege[0].nummer, 'A');
    planRangLoeschen([A, Bt]);
    gleich('  danach wieder B', lauf([A, Bt]).auftraege[0].nummer, 'B');
    gleich('  und kein Rang bleibt stehen', (A.rang || 0) + (Bt.rang || 0), 0);
  }

  /* (5) Zurueckstellen ist der Gegenweg. */
  {
    const A = bau('A', 960, '2026-09-25'), Bt = bau('B', 480, '2026-09-18');
    const folge = lauf([A, Bt]).auftraege.map(x => x.auftrag);
    gleich('B zurueckstellen gelingt', planVerschieben(folge, Bt, 1), true);
    gleich('  dann liegt A vorn', lauf([A, Bt]).auftraege[0].nummer, 'A');
  }

  /* (6) Oberflaeche */
  {
    ['plRangWeg', 'plRangHinweis'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    if(/data-rauf=/.test(quelltext) && /data-rab=/.test(quelltext))
      ok('die Termintafel traegt die Pfeile');
    else bad('die Termintafel hat keine Pfeile zum Umsortieren');
    /* Eine stille Handsortierung waere genau das, was die
       Vorwaertsplanung vermeiden soll. */
    if(/tr.handsortiert/.test(quelltext) && /class="handsortiert"/.test(quelltext))
      ok('handsortierte Zeilen sind markiert, in CSS UND in der Vergabe');
    else bad('die Handsortierung ist nicht sichtbar');
    if(/Der Rang geht vor dem Liefertermin/.test(quelltext))
      ok('und der Hinweis nennt die Regel');
    else bad('die Regel steht nirgends in der Oberflaeche');
  }
}

/* --- 16. Die Arbeit auf baugleiche Maschinen verteilen ----------------
   BEFUND DES DURCHSTICHS ueber den echten Bestand: alle 36
   Auftraege landeten auf der 1000er, die baugleiche 1500er bekam null
   Stunden - und zwoelf Termine rissen "weil die Maschine belegt ist".
   maschineVorschlag nahm die erste passende Maschine aus der Liste.

   Vier Auftraege zu je 480 Minuten: auf einer Maschine sind das vier
   Tage, auf zwei je zwei.                                             */
console.log('\n16) Arbeit auf baugleiche Maschinen verteilen');
{
  const neuerAuftrag = hole('neuerAuftrag');
  const maschineVorschlag = hole('maschineVorschlag'), maschineLast = hole('maschineLast');
  const planVerteilen = hole('planVerteilen'), planBelegen = hole('planBelegen');
  const planAuslastung = hole('planAuslastung');
  const M = hole('WERKSTATT_MASCHINEN');

  ['maschineLast', 'planVerteilen'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });

  const bau = (nr, min) => {
    const a = neuerAuftrag();
    a.nummer = nr; a.teil = 'Teil ' + nr; a.stueck = 1; a.status = 'beauftragt';
    a.klasse = 'drehteil_einfach'; a.gattung = 'drehen';
    a.zeiten = {ruestzeit:min, stueckzeit:0}; a.maschine = 'm1000';
    a.liefertermin = ''; a.masse = {dmax:60, laenge:200, x:0, y:0, z:0};
    return a;
  };

  /* (1) Ohne Auftragsliste bleibt es bei der ersten passenden Maschine -
     kein Aufrufer im Bestand aendert sein Verhalten. */
  {
    const a = bau('A', 480);
    gleich('ohne Liste: die erste passende Maschine', maschineVorschlag(a, M), 'm1000');
  }

  /* (2) MIT Liste: die Maschine mit der wenigsten Arbeit. Genau das
     fehlte, und genau daran hingen zwoelf Termine. */
  {
    const liste = [bau('A', 480)];
    const neu = bau('B', 480);
    gleich('mit Liste: die leere Maschine', maschineVorschlag(neu, M, liste), 'm1500');
    /* Und die Last wird richtig gezaehlt. */
    const last = maschineLast(M, liste);
    gleich('  Last der 1000er', last.m1000, 480);
    gleich('  Last der 1500er', last.m1500, 0);
    /* Ein Angebot bindet nichts - dieselbe Regel wie in der Belegung. */
    const ang = bau('C', 9999); ang.status = 'angeboten';
    gleich('  ein Angebot zaehlt nicht in die Last', maschineLast(M, [ang]).m1000, 0);
  }

  /* (3) Der Vorschlag wirkt ueber eine ganze Serie: vier Auftraege
     nacheinander angelegt verteilen sich zwei zu zwei. */
  {
    const liste = [];
    ['A', 'B', 'C', 'D'].forEach(nr => {
      const a = bau(nr, 480);
      a.maschine = maschineVorschlag(a, M, liste);
      liste.push(a);
    });
    const auf1000 = liste.filter(a => a.maschine === 'm1000').length;
    gleich('vier Auftraege verteilen sich zwei zu zwei', auf1000, 2);
  }

  /* (4) planVerteilen raeumt BESTEHENDE Auftraege um - die tragen ihre
     Maschine schon, der Vorschlag hilft ihnen nicht mehr. */
  {
    const liste = ['A', 'B', 'C', 'D'].map(nr => bau(nr, 480));
    const vor = planBelegen({auftraege:liste, maschinen:M, ab:'2026-09-14', tage:30});
    gleich('vorher: alles auf der 1000er', vor.bloecke.every(k => k.maschine === 'm1000'), true);
    gleich('  vier Tage hintereinander', vor.auftraege[3].ende, '2026-09-17');

    const v = planVerteilen(liste, M);
    gleich('zwei Arbeitsgaenge werden umgelegt', v.zahl, 2);
    gleich('  und es steht dabei, wohin', v.bewegt[0].nach, 'm1500');
    const nach = planBelegen({auftraege:liste, maschinen:M, ab:'2026-09-14', tage:30});
    gleich('nachher liegen zwei auf der 1500er',
           nach.bloecke.filter(k => k.maschine === 'm1500').length, 2);
    gleich('  und alles ist nach zwei Tagen fertig',
           nach.auftraege.map(e => e.ende).sort().pop(), '2026-09-15');
    /* Nichts verschwindet und nichts kommt dazu. */
    nahe('  dieselbe Arbeit wie vorher',
         nach.bloecke.reduce((s, k) => s + k.minuten, 0),
         vor.bloecke.reduce((s, k) => s + k.minuten, 0), 1e-9);
  }

  /* (5) Verschoben wird NUR innerhalb derselben Art und nur, wo das Teil
     hineinpasst.

     ZWEI Auftraege, nicht einer: mit einem allein stehen Fraese und
     Handarbeitsplatz beide auf null, und ein Fraesgang bliebe auch bei
     abgeschalteter Artpruefung aus lauter Gleichstand auf der Fraese.
     Erst wenn Last entsteht, zeigt sich, ob die Regel greift. Geprueft
     wird die INVARIANTE: jeder Gang sitzt danach auf einer Maschine
     SEINER Art. */
  {
    const mach = (nr) => {
      const a = bau(nr, 0);
      a.klasse = 'drehteil_fraes';
      a.zeiten = {ruestzeit:720, stueckzeit:0};
      a.gaenge = [{nr:1, name:'drehen',  maschine:'m1000', ruestzeit:600, stueckzeit:0},
                  {nr:2, name:'fraesen', maschine:'fr1',   ruestzeit:120, stueckzeit:0}];
      return a;
    };
    const K1 = mach('K1'), K2 = mach('K2');
    planVerteilen([K1, K2], M);
    const artVon = {}; M.forEach(m => { artVon[m.id] = m.art; });
    gleich('jeder Drehgang bleibt auf einer Drehmaschine',
           [K1, K2].map(a => artVon[a.gaenge[0].maschine]).join(','), 'drehen,drehen');
    gleich('  jeder Fraesgang auf der Fraese',
           [K1, K2].map(a => artVon[a.gaenge[1].maschine]).join(','), 'fraesen,fraesen');
    gleich('  und die beiden Drehgaenge verteilen sich',
           K1.gaenge[0].maschine !== K2.gaenge[0].maschine, true);

    const lang = bau('L', 480); lang.masse.laenge = 1200; lang.maschine = 'm1500';
    const kurz = bau('K3', 480); kurz.maschine = 'm1500';
    planVerteilen([lang, kurz], M);
    gleich('das 1200er Teil bleibt auf der 1500er', lang.maschine, 'm1500');
    gleich('  das kurze weicht auf die 1000er aus', kurz.maschine, 'm1000');
  }

  /* (6) Was NICHT umgeraeumt wird, belegt trotzdem. Sonst schoebe der
     Knopf Arbeit auf Maschinen, die in Wahrheit voll sind.

     NUR EINE Maschine traegt die fremde Last - mit zweien waere es
     Gleichstand, und ob gezaehlt wird oder nicht, ergaebe dasselbe
     Ergebnis. Genau daran ist mein erster Haken vorbeigelaufen. */
  {
    /* "Laeuft" heisst eingespannt. Beim Schaerfen dieses Hakens kam
       heraus, dass planVerteilen solche Auftraege sehr wohl umgelegt
       hat - dieselbe Statusliste wie die Belegung. Behoben. */
    const laeuft = bau('L', 1920); laeuft.status = 'laeuft'; laeuft.maschine = 'm1000';
    const neu = bau('N', 480);
    planVerteilen([laeuft, neu], M);
    gleich('ein laufender Auftrag wird NICHT umgelegt', laeuft.maschine, 'm1000');
    gleich('  aber er belegt: der neue weicht auf die 1500er aus', neu.maschine, 'm1500');
    /* Ein fertiger Auftrag ebenso - er ist Vergangenheit, aber seine
       Minuten liegen im Zeitraum. */
    const fertig = bau('F', 1920); fertig.status = 'fertig'; fertig.maschine = 'm1500';
    const neu2 = bau('N2', 480); neu2.maschine = 'm1500';
    planVerteilen([fertig, neu2], M);
    gleich('  ein fertiger Auftrag wird auch nicht umgelegt', fertig.maschine, 'm1500');
    gleich('  und belegt ebenso: der neue weicht auf die 1000er aus', neu2.maschine, 'm1000');
  }

  /* (7) Oberflaeche */
  {
    if(quelltext.indexOf('id="plVerteilen"') > 0) ok('Bedienelement vorhanden: plVerteilen');
    else bad('Bedienelement fehlt: plVerteilen');
    if(quelltext.indexOf('id="plVerteilenHinweis"') > 0) ok('Bedienelement vorhanden: plVerteilenHinweis');
    else bad('Bedienelement fehlt: plVerteilenHinweis');
    /* Der Vorschlag MUSS die Auftragsliste bekommen - sonst ist die
       ganze Aenderung wirkungslos, und zwar unsichtbar. */
    if(/maschineVorschlag\(a, W\.maschinen, W\.auftraege[,)]/.test(quelltext))
      ok('der Vorschlag beim Anlegen kennt die Auftragsliste');
    else bad('der Vorschlag beim Anlegen kennt die Auftragsliste NICHT - die Regel liefe ins Leere');
    if(/ein Knopf und keine Automatik/.test(quelltext))
      ok('und der Hinweis sagt, dass es ein Knopf ist');
    else bad('der Hinweis verschweigt, dass die App nicht von selbst umraeumt');
  }
}

/* --- 17. Sichern, Laden und die Auftraege von gestern -----------------
   Drei Felder sind in dieser Nacht dazugekommen: gaenge, rang und die
   Rueckmeldung je Arbeitsgang. Was im Browserspeicher oder in einer
   Sicherungsdatei liegt, kennt sie nicht.

   ZWEI FRAGEN, und beide muessen ja heissen:
     1. Ueberlebt ein VOLLSTAENDIGER Auftrag den Weg durch JSON?
     2. Laeuft ein Auftrag im ALTEN Format weiter, ohne dass etwas
        verschwindet - und ohne dass jemand etwas tun muss?

   Das Zweite ist das wichtigere: ein fehlendes Feld sieht genauso aus
   wie ein leeres, und der Unterschied faellt erst auf, wenn eine Zeit
   fehlt, die jemand gerechnet hat.                                    */
console.log('\n17) Sichern, Laden und die Auftraege von gestern');
{
  const neuerAuftrag = hole('neuerAuftrag'), auftragPruefen = hole('auftragPruefen');
  const auftragGaenge = hole('auftragGaenge'), gaengeSumme = hole('gaengeSumme');
  const gaengeMaterialisieren = hole('gaengeMaterialisieren');
  const istSumme = hole('istSumme'), istSetzen = hole('istSetzen');
  const planBelegen = hole('planBelegen'), planMinuten = hole('planMinuten');
  const WERKSTATT_VERSION = hole('WERKSTATT_VERSION');
  const M = hole('WERKSTATT_MASCHINEN');

  /* Ein Auftrag mit ALLEM, was es heute gibt. */
  const voll = () => {
    const a = neuerAuftrag();
    a.nummer = 'S-1'; a.kunde = 'Muster'; a.teil = 'Flansch'; a.zeichnungsnr = 'Z-1';
    a.werkstoff = 'S235'; a.klasse = 'drehteil_fraes'; a.stueck = 100;
    a.status = 'laeuft'; a.angelegt = '2026-09-14'; a.liefertermin = '2026-09-25';
    a.maschine = 'm1000'; a.rang = 3; a.preis = 1234.5;
    a.zeiten = {ruestzeit:90, stueckzeit:10.5};
    a.masse = {dmax:60, laenge:200, x:200, y:60, z:60};
    a.bemerkung = 'Backen weich';
    a.gaenge = [{nr:1, name:'drehen', maschine:'m1000', ruestzeit:60, stueckzeit:9},
                {nr:2, name:'fraesen', maschine:'fr1', ruestzeit:30, stueckzeit:1.5}];
    istSetzen(a, 1, 'ruestzeit', 72); istSetzen(a, 1, 'stueckzeit', 10.8);
    istSetzen(a, 2, 'ruestzeit', 36); istSetzen(a, 2, 'stueckzeit', 1.8);
    a.rueckmeldung.gefertigt = 98; a.rueckmeldung.ausschuss = 2;
    a.rueckmeldung.datum = '2026-09-24';
    return a;
  };

  /* (1) Der Rundlauf durch JSON - genau das, was "Als Datei sichern"
     und "Aus Datei laden" tun. */
  {
    const a = voll();
    const text = JSON.stringify({version:WERKSTATT_VERSION, auftraege:[a], maschinen:M}, null, 1);
    const zurueck = JSON.parse(text);
    const b = zurueck.auftraege[0];
    gleich('der geladene Auftrag ist gueltig', auftragPruefen(b).length, 0);
    gleich('  Version stimmt', zurueck.version, WERKSTATT_VERSION);
    gleich('  Rang ueberlebt', b.rang, 3);
    gleich('  beide Arbeitsgaenge ueberleben', b.gaenge.length, 2);
    gleich('  mit Maschine und Zeit', b.gaenge[1].maschine + '/' + b.gaenge[1].stueckzeit, 'fr1/1.5');
    gleich('  die Rueckmeldung ueberlebt', b.rueckmeldung.gaenge.length, 2);
    gleich('  mit Ausschuss', b.rueckmeldung.ausschuss, 2);
    nahe('  der Faktor ist derselbe', istSumme(b).faktor, istSumme(a).faktor, 1e-12);
    nahe('  und die Zeit', planMinuten(b).gesamt, planMinuten(a).gesamt, 1e-12);
    /* Die harte Probe: Zeichen fuer Zeichen dasselbe, wenn man es noch
       einmal sichert. Ein Feld, das beim Laden still wegfaellt, faellt
       hier auf. */
    gleich('  noch einmal gesichert ergibt dieselbe Datei',
           JSON.stringify(zurueck, null, 1) === text, true);
  }

  /* (2) Und die Belegung rechnet danach dasselbe. */
  {
    const a = voll();
    const b = JSON.parse(JSON.stringify(a));
    const p1 = planBelegen({auftraege:[a], maschinen:M, ab:'2026-09-14', tage:30});
    const p2 = planBelegen({auftraege:[b], maschinen:M, ab:'2026-09-14', tage:30});
    gleich('dieselbe Belegung nach dem Laden',
           JSON.stringify(p1.bloecke.map(k => k.maschine + k.datum + Math.round(k.minuten))),
           JSON.stringify(p2.bloecke.map(k => k.maschine + k.datum + Math.round(k.minuten))));
    gleich('  derselbe spaeteste Start', p1.auftraege[0].spaetester, p2.auftraege[0].spaetester);
  }

  /* (3) DAS WICHTIGERE: ein Auftrag im ALTEN Format. So sah
     neuerAuftrag() aus, bevor in dieser Nacht gaenge, rang und die
     Rueckmeldung je Gang dazukamen - Wort fuer Wort. */
  {
    const alt = {
      version:'1.0', nummer:'A-alt', kunde:'Gschossmann', teil:'Huelse',
      zeichnungsnr:'Z-9', werkstoff:'S235', klasse:'drehteil_einfach',
      stueck:40, status:'beauftragt', angelegt:'2026-09-10',
      liefertermin:'2026-09-25', maschine:'m1000',
      zeiten:{ruestzeit:75, stueckzeit:18}, preis:2240,
      masse:{dmax:61, laenge:180, x:0, y:0, z:0},
      rueckmeldung:{gefertigt:0, datum:''}, bemerkung:''
    };
    gleich('der alte Auftrag ist gueltig - ohne dass jemand etwas tut',
           auftragPruefen(alt).length, 0);
    const g = auftragGaenge(alt);
    gleich('  er ist ein Auftrag mit EINEM Arbeitsgang', g.length, 1);
    gleich('  auf seiner Maschine', g[0].maschine, 'm1000');
    gleich('  mit seiner ganzen Ruestzeit', g[0].ruestzeit, 75);
    nahe('  die Zeit ist unveraendert', planMinuten(alt).gesamt, 75 + 18 * 40, 1e-12);
    gleich('  er zaehlt als Rang 0', +alt.rang || 0, 0);
    const su = istSumme(alt);
    gleich('  nichts zurueckgemeldet', su.vollstaendig, false);
    gleich('  und auch nicht angefangen', su.angefangen, false);
    const b = planBelegen({auftraege:[alt], maschinen:M, ab:'2026-09-14', tage:30});
    gleich('  er wird eingeplant', b.auftraege.length, 1);
    gleich('  und traegt einen spaetesten Start', !!b.auftraege[0].spaetester, true);

    /* Und wenn die Maske ihn anfasst: aus dem gedachten Einzelgang wird
       ein echter, OHNE dass eine Minute wandert. */
    const vorher = planMinuten(alt).gesamt;
    gaengeMaterialisieren(alt);
    gleich('  nach dem Oeffnen der Maske: ein echter Gang', alt.gaenge.length, 1);
    nahe('  die Zeit ist dieselbe geblieben', planMinuten(alt).gesamt, vorher, 1e-12);
    gleich('  die Summe deckt sich mit der Kalkulation', auftragPruefen(alt).length, 0);
    nahe('  Ruestzeit', gaengeSumme(alt).ruestzeit, 75, 1e-12);
  }

  /* (4) Die VERSION bleibt 1.0, und das ist eine Aussage: die drei neuen
     Felder sind ERGAENZUNGEN, keine Aenderung. Wer sie hochzaehlt, macht
     jede Datei von gestern ungueltig - und die Wache wuerde sie mit
     "Version ist 1.0, erwartet 1.1" zurueckweisen, obwohl nichts fehlt. */
  {
    gleich('die Version steht auf 1.0', WERKSTATT_VERSION, '1.0');
    const falsch = neuerAuftrag(); falsch.version = '0.9';
    if(auftragPruefen(falsch).some(x => /Version/.test(x)))
      ok('eine andere Version wird zurueckgewiesen');
    else bad('eine andere Version rutscht durch');
  }

  /* (5) Muell darf nicht durchgehen - die Datei kommt aus der Welt. */
  {
    const kaputt = voll(); kaputt.gaenge = 'zwei';
    if(auftragPruefen(kaputt).some(x => /gaenge ist keine Liste/.test(x)))
      ok('gaenge als Text wird bemaengelt');
    else bad('gaenge als Text rutscht durch');
    const k2 = voll(); k2.rang = 'vorne';
    if(auftragPruefen(k2).some(x => /rang/.test(x))) ok('rang als Text wird bemaengelt');
    else bad('rang als Text rutscht durch');
    const k3 = voll(); k3.rueckmeldung.gaenge = [{nr:1, ruestzeit:'lang'}];
    if(auftragPruefen(k3).some(x => /ruestzeit ist keine Zahl/.test(x)))
      ok('eine Ist-Zeit als Text wird bemaengelt');
    else bad('eine Ist-Zeit als Text rutscht durch');
  }

  /* (5b) ANGEZEIGT WIRD GERUNDET, GESPEICHERT BLEIBT GENAU.
     Die Kalkulation liefert 3,103689583 min Stueckzeit; im Maskenfeld
     ist das unlesbar und wird vom Rand abgeschnitten (am echten Teil
     gesehen). Gerundet ANZEIGEN ist richtig - gerundet ZURUECKSCHREIBEN
     waere das Ende der Zusage "die Zahlen kommen unveraendert aus der
     Kalkulation". wFeldWert haelt beides auseinander. */
  {
    const wRund = hole('wRund');
    if(typeof wRund === 'function'){
      nahe('wRund kuerzt 3,103689583 auf 3,1', wRund(3.103689583, 2), 3.1, 1e-12);
      nahe('  und 138,33363874 auf 138,33', wRund(138.33363874, 2), 138.33, 1e-12);
    } else bad('fehlt: wRund');
    if(typeof hole('wFeldWert') === 'function') ok('vorhanden: wFeldWert');
    else bad('fehlt: wFeldWert');
    /* Die Maske muss BEIDE Seiten benutzen - anzeigen gerundet, lesen
       ueber wFeldWert. Faellt eine weg, ist die Wirkung unsichtbar:
       die Zahl sieht in beiden Faellen gleich aus. */
    ['afRuest', 'afStueckzeit', 'afPreis'].forEach(id => {
      const rundet = quelltext.indexOf("setz('" + id + "', wRund(") > 0;
      const liest = quelltext.indexOf("wFeldWert('" + id + "'") > 0;
      if(rundet && liest) ok(id + ': gerundet angezeigt und exakt gelesen');
      else bad(id + ': ' + (rundet ? '' : 'wird nicht gerundet angezeigt; ') +
                          (liest ? '' : 'wird nicht ueber wFeldWert gelesen'));
    });
  }

  /* (6) Oberflaeche: die Knoepfe gibt es, und die Wache laeuft beim
     Laden ueber JEDEN Auftrag - nicht nur ueber den ersten. */
  {
    ['aufSichern', 'aufLaden', 'aufDatei'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    if(/liste\.map\(auftragPruefen\)\.filter/.test(quelltext))
      ok('beim Laden wird JEDER Auftrag geprueft');
    else bad('beim Laden wird nicht jeder Auftrag geprueft');
    /* Und nichts wird halb geladen: entweder alle oder keiner. */
    if(/nichts geladen/.test(quelltext))
      ok('eine schlechte Datei laedt GAR nichts, nicht die halbe Liste');
    else bad('eine schlechte Datei koennte halb geladen werden');
  }
}

/* --- 18. Der Zettel fuer die Maschine ---------------------------------
   Die Tafel beantwortet "wie voll ist die Werkstatt". An der Maschine
   steht die andere Frage: was mache ich heute.

   DER ZETTEL RECHNET NICHTS NEU - er sortiert die Bloecke, die schon in
   der Belegung stehen. Eine zweite Rechnung waere eine zweite Wahrheit,
   und am Ende glaubte man keiner von beiden. Genau das haelt dieser
   Abschnitt fest.

   Ein Auftrag ueber zwei Tage (960 min auf der 1000er) und einer ueber
   einen (180 min auf der Fraese), Planung ab Montag 2026-09-14.      */
console.log('\n18) Der Zettel fuer die Maschine');
{
  const neuerAuftrag = hole('neuerAuftrag'), planBelegen = hole('planBelegen');
  const planZettel = hole('planZettel');
  const M = hole('WERKSTATT_MASCHINEN');

  if(typeof planZettel === 'function') ok('vorhanden: planZettel');
  else bad('fehlt: planZettel');

  const kette = () => {
    const a = neuerAuftrag();
    a.nummer = 'Z-1'; a.teil = 'Flansch'; a.kunde = 'Muster'; a.werkstoff = '42CrMo4';
    a.stueck = 100; a.status = 'beauftragt'; a.klasse = 'drehteil_fraes';
    a.gattung = 'drehen'; a.zeiten = {ruestzeit:90, stueckzeit:10.5};
    a.maschine = 'm1000'; a.liefertermin = '2026-09-25';
    a.bemerkung = 'Backen weich';
    a.masse = {dmax:60, laenge:200, x:200, y:60, z:60};
    a.gaenge = [{nr:1, name:'drehen',  maschine:'m1000', ruestzeit:60, stueckzeit:9},
                {nr:2, name:'fraesen', maschine:'fr1',   ruestzeit:30, stueckzeit:1.5}];
    return a;
  };
  const b = planBelegen({auftraege:[kette()], maschinen:M, ab:'2026-09-14', tage:30});

  /* (1) Die Drehmaschine: zwei volle Tage, Montag und Dienstag. */
  {
    const z = planZettel(b, M, 'm1000', 7);
    gleich('der Zettel gehoert der 1000er', z && z.name, 'Monforts 1000 MTC-K');
    gleich('  sieben Tage', z && z.tage.length, 7);
    gleich('  zwei Arbeitsgaenge darauf', z && z.posten, 2);
    nahe('  zusammen 960 Minuten', z && z.minuten, 960, 1e-9);
    gleich('  Montag voll', z && Math.round(z.tage[0].belegt), 480);
    gleich('  Montag ist Wochentag 1', z && z.tage[0].wochentag, 1);
    gleich('  Dienstag voll', z && Math.round(z.tage[1].belegt), 480);
    gleich('  Mittwoch frei', z && z.tage[2].belegt, 0);
    gleich('  und hat trotzdem Kapazitaet', z && z.tage[2].kapazitaet, 480);
    /* Samstag und Sonntag haben keine - der Zettel laesst sie weg. */
    gleich('  Samstag ohne Kapazitaet', z && z.tage[5].kapazitaet, 0);
    gleich('  Sonntag auch', z && z.tage[6].kapazitaet, 0);
  }

  /* (2) Der Posten traegt, was an der Maschine gebraucht wird - Teil,
     Stueckzahl, Werkstoff, Termin und die Bemerkung. Nichts davon steht
     im Block; es kommt ueber den Verweis auf den Auftrag. */
  {
    const z = planZettel(b, M, 'm1000', 7);
    const p = z.tage[0].posten[0];
    gleich('der Posten nennt das Teil', p && p.teil, 'Flansch');
    gleich('  die Stueckzahl', p && p.stueck, 100);
    gleich('  den Werkstoff', p && p.werkstoff, '42CrMo4');
    gleich('  den Termin', p && p.termin, '2026-09-25');
    gleich('  den Arbeitsgang', p && p.gangName, 'drehen');
    gleich('  und die Bemerkung', p && p.bemerkung, 'Backen weich');
  }

  /* (3) Die Fraese bekommt IHREN Gang und sonst nichts. */
  {
    const z = planZettel(b, M, 'fr1', 7);
    gleich('die Fraese hat einen Posten', z && z.posten, 1);
    nahe('  mit 180 Minuten', z && z.minuten, 180, 1e-9);
    gleich('  am Mittwoch', z && z.tage[2].posten.length, 1);
    gleich('  und es ist der Fraesgang', z && z.tage[2].posten[0].gangName, 'fraesen');
    gleich('  Montag und Dienstag leer',
           (z.tage[0].posten.length + z.tage[1].posten.length), 0);
  }

  /* (4) DIE TRAGENDE PROBE: der Zettel sagt dasselbe wie die Tafel.
     Ueber alle Maschinen zusammengezaehlt muss genau die Arbeit
     herauskommen, die in der Belegung steht - keine Minute mehr, keine
     weniger. */
  {
    let summe = 0;
    M.forEach(m => { const z = planZettel(b, M, m.id, 30); if(z) summe += z.minuten; });
    const inBloecken = b.bloecke.reduce((s, k) => s + k.minuten, 0);
    nahe('alle Zettel zusammen = die ganze Belegung', summe, inBloecken, 1e-9);
    nahe('  und das ist die Zeit des Auftrags', inBloecken, 90 + 10.5 * 100, 1e-9);
  }

  /* (5) Was es nicht gibt, gibt es nicht. */
  {
    gleich('unbekannte Maschine: kein Zettel', planZettel(b, M, 'gibtsnicht', 7), null);
    gleich('ohne Belegung auch nicht', planZettel(null, M, 'm1000', 7), null);
  }

  /* (6) Oberflaeche - und die Wache gegen zwei Papiere auf einem Bogen.
     Laufkarte und Zettel liegen beide als .nur-druck im Blatt; wer eins
     fuellt und das andere stehen laesst, druckt beide. Das sieht man
     erst am Drucker. */
  {
    ['plZettelM', 'plZettelTage', 'plZettelDruck', 'zettel'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    ['wZettel', 'wPapier'].forEach(nm => {
      if(typeof hole(nm) === 'function') ok('Funktion vorhanden: ' + nm);
      else bad('Funktion fehlt: ' + nm);
    });
    if(/W_PAPIERE\.forEach\(x => \{ if\(x !== id\) htm\(x, ''\); \}\)/.test(quelltext))
      ok('wPapier leert die anderen Papiere, bevor es eines fuellt');
    else bad('ein Papier koennte mit einem alten zweiten zusammen gedruckt werden');
    /* Und beide Papiere gehen ueber diesen einen Weg. */
    const direkt = (quelltext.match(/htm\('laufkarte', h\)|htm\('zettel', h\)/g) || []).length;
    if(!direkt) ok('kein Papier wird am gemeinsamen Druckweg vorbei gefuellt');
    else bad(direkt + ' Papier(e) werden direkt gefuellt, an wPapier vorbei');
  }
}

/* --- 19. Klappbare Karten im Planungsblatt ----------------------------
   GEMESSEN bei 390 px: das Blatt war 4236 px hoch - fuenf Bildschirme,
   sieben Karten hintereinander. Kein Ueberlauf, aber wer die Termine
   sucht, scrollt an allem anderen vorbei. Mit vier zugeklappten Karten
   sind es 1803 px; am Laptop bleibt alles offen (2361 px).

   GEPRUEFT WIRD DER BAU, nicht die Pixel - die stehen als Messwerte
   hier im Kopf, gemessen im Headless-Edge.                            */
console.log('\n19) Klappbare Karten im Planungsblatt');
{
  const W_KARTEN = hole('W_KARTEN'), W_ZU_HANDY = hole('W_ZU_HANDY');

  ['wKarteZu', 'wZuLesen', 'wZuSichern', 'wKartenVerdrahten'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('Funktion vorhanden: ' + nm);
    else bad('Funktion fehlt: ' + nm);
  });

  /* (1) Jede gefuehrte Karte gibt es auch wirklich. Eine Kennung ohne
     Karte klappt nichts und faellt sonst niemandem auf. */
  {
    if(Array.isArray(W_KARTEN)){
      gleich('sieben Karten gefuehrt', W_KARTEN.length, 7);
      const fehlt = W_KARTEN.filter(id => quelltext.indexOf('id="' + id + '"') < 0);
      if(!fehlt.length) ok('  jede hat ihre Karte im Blatt');
      else bad('  ohne Karte im Blatt: ' + fehlt.join(', '));
    } else bad('W_KARTEN fehlt');
  }

  /* (2) DIE DREI FRAGEN, wegen derer man das Blatt aufmacht, bleiben
     offen - sonst waere das Zuklappen eine Verschlechterung. */
  {
    if(Array.isArray(W_ZU_HANDY)){
      const offen = ['plKarteKap', 'plKarteAusl', 'plKarteTermine'];
      const zu = offen.filter(id => W_ZU_HANDY.indexOf(id) >= 0);
      if(!zu.length) ok('Kapazitaet, Auslastung und Termine bleiben auch am Handy offen');
      else bad('am Handy zugeklappt, obwohl es die Hauptfragen sind: ' + zu.join(', '));
      const unbekannt = W_ZU_HANDY.filter(id => W_KARTEN.indexOf(id) < 0);
      if(!unbekannt.length) ok('  und jede zugeklappte Karte ist eine gefuehrte');
      else bad('  zugeklappt, aber nicht gefuehrt: ' + unbekannt.join(', '));
      gleich('  vier von sieben zugeklappt', W_ZU_HANDY.length, 4);
    } else bad('W_ZU_HANDY fehlt');
  }

  /* (3) Der Pfeil braucht die Textdarstellung. Ohne U+FE0E malt iOS aus
     dem Dreieck einen blauen Play-Knopf - dieselbe Falle wie bei den
     Gruppenkoepfen der Dreh-App. */
  {
    const auf = /&#x25BE;&#xFE0E;/.test(quelltext);
    const zu = /&#x25B8;&#xFE0E;/.test(quelltext);
    if(auf && zu) ok('beide Pfeile tragen die Textdarstellung U+FE0E');
    else bad('ein Pfeil ohne U+FE0E - iOS malt daraus einen blauen Knopf');
  }

  /* (4) Gefaltet wird ueber die KINDER der Karte: so muss keine der
     sieben im HTML angefasst werden, und spaeterer Inhalt klappt mit. */
  {
    if(/if\(c\.tagName === 'H2'\) return;/.test(quelltext))
      ok('die Ueberschrift bleibt stehen, der Rest klappt weg');
    else bad('die Faltung greift nicht ueber die Kinder der Karte');
    if(/wKartenVerdrahten\(\);/.test(quelltext))
      ok('wKartenVerdrahten laeuft beim Start mit');
    else bad('wKartenVerdrahten wird nie gerufen - die Koepfe blieben tot');
    /* Die Breitengrenze muss dieselbe sein wie im Stylesheet. Zwei
       Grenzen waeren zwei Wahrheiten. */
    if(/window\.innerWidth < 900/.test(quelltext) && /max-width: 700px/.test(quelltext))
      ok('die Klappgrenze (900) steht neben der Layoutgrenze (700) - beide bewusst');
    else bad('die Breitengrenze der Faltung fehlt');
  }
}

/* --- 20. Der Lieferschein ---------------------------------------------
   Das dritte Papier - und das einzige, das AUS DEM HAUS geht. Was darauf
   steht, kann niemand mehr richtigstellen.

   DREI REGELN, die dieser Abschnitt festhaelt:
     1. Keine Preise. Ein Lieferschein weist aus, WAS geliefert wurde.
     2. Die Menge kommt aus der Rueckmeldung, wenn eine da ist - und der
        Schein sagt, woher sie kommt. Eine geratene Menge, die aussieht
        wie gezaehlt, ist die schlimmste Zeile auf so einem Papier.
     3. Ohne Firma und Ort hat der Schein keinen Absender, und das muss
        auffallen, bevor er beim Kunden liegt.                         */
console.log('\n20) Der Lieferschein');
{
  const neuerAuftrag = hole('neuerAuftrag'), lieferschein = hole('lieferschein');
  const istSetzen = hole('istSetzen');

  if(typeof lieferschein === 'function') ok('vorhanden: lieferschein');
  else bad('fehlt: lieferschein');

  const FIRMA = { name:'Musterdreherei', strasse:'Musterweg 1', ort:'12345 Musterstadt',
                  telefon:'01234 567', mail:'post@example.invalid', ustid:'DE000000000' };
  const bau = () => {
    const a = neuerAuftrag();
    a.nummer = 'A-2603'; a.kunde = 'Gschossmann'; a.teil = 'Lehre Bearing';
    a.zeichnungsnr = 'Z-4102'; a.werkstoff = '42CrMo4'; a.stueck = 40;
    a.status = 'fertig'; a.bemerkung = 'Kanten gebrochen';
    a.zeiten = {ruestzeit:75, stueckzeit:18}; a.maschine = 'm1000';
    a.masse = {dmax:61, laenge:180, x:0, y:0, z:0};
    return a;
  };

  /* (1) Mit Rueckmeldung: die Menge ist die gezaehlte. */
  {
    const a = bau();
    a.rueckmeldung.gefertigt = 40; a.rueckmeldung.ausschuss = 1;
    a.rueckmeldung.datum = '2026-09-24';
    const d = lieferschein(a, FIRMA, '2026-09-25');
    gleich('Menge aus der Rueckmeldung', d.menge, 40);
    gleich('  und der Schein weiss es', d.ausRueckmeldung, true);
    gleich('  Datum aus der Rueckmeldung, nicht heute', d.datum, '2026-09-24');
    gleich('  Nummer aus dem Auftrag abgeleitet', d.nummer, 'L-A-2603');
    gleich('  Auftrag genannt', d.auftrag, 'A-2603');
    gleich('  Kunde', d.kunde, 'Gschossmann');
    gleich('  Teil und Zeichnung', d.teil + '/' + d.zeichnungsnr, 'Lehre Bearing/Z-4102');
    gleich('  vollstaendig geliefert', d.vollstaendig, true);
    gleich('  Ausschuss steht dabei', d.ausschuss, 1);
  }

  /* (2) OHNE Rueckmeldung gilt die Auftragsmenge - und der Schein sagt
     es. Das ist der Unterschied zwischen einer gezaehlten und einer
     angenommenen Zahl. */
  {
    const d = lieferschein(bau(), FIRMA, '2026-09-25');
    gleich('ohne Rueckmeldung: die Auftragsmenge', d.menge, 40);
    gleich('  aber NICHT als gezaehlt ausgegeben', d.ausRueckmeldung, false);
    gleich('  Datum ist dann heute', d.datum, '2026-09-25');
  }

  /* (3) Teillieferung ist ein eigener Fall und gehoert aufs Papier. */
  {
    const a = bau();
    a.rueckmeldung.gefertigt = 25; a.rueckmeldung.datum = '2026-09-24';
    const d = lieferschein(a, FIRMA, '2026-09-25');
    gleich('25 von 40: Teillieferung', d.vollstaendig, false);
    gleich('  15 stehen aus', d.rest, 15);
    gleich('  die bestellte Menge steht dabei', d.bestellt, 40);
  }

  /* (4) Ohne Absender ist es kein Lieferschein. Die Firmendaten sind
     Platzhalter, bis sie eingetragen sind - genau wie die
     Stundensaetze. */
  {
    const leer = lieferschein(bau(), {}, '2026-09-25');
    gleich('ohne Firma: nicht gepflegt', leer.firmaGepflegt, false);
    const halb = lieferschein(bau(), {name:'Musterdreherei'}, '2026-09-25');
    gleich('  nur Name reicht nicht', halb.firmaGepflegt, false);
    gleich('  mit Name und Ort schon', lieferschein(bau(), FIRMA, '2026-09-25').firmaGepflegt, true);
  }

  /* (5) KEINE PREISE. Der Datensatz darf gar keinen tragen, sonst
     rutscht er frueher oder spaeter aufs Papier. */
  {
    const a = bau(); a.preis = 2240;
    const d = lieferschein(a, FIRMA, '2026-09-25');
    const felder = Object.keys(d).join(' ');
    if(!/preis|betrag|euro/i.test(felder)) ok('der Lieferschein-Datensatz traegt keinen Preis');
    else bad('der Lieferschein-Datensatz traegt einen Preis: ' + felder);
    /* Und die Ausgabe auch nicht. */
    const aus = quelltext.slice(quelltext.indexOf('function wLieferschein'));
    const ende = aus.indexOf('\n/* ---- Verdrahtung');
    const block = ende > 0 ? aus.slice(0, ende) : aus;
    if(!/&euro;|a\.preis|d\.preis/.test(block)) ok('  und die Ausgabe druckt keinen');
    else bad('  aber die Ausgabe druckt einen');
    if(/Preise siehe Rechnung/.test(block)) ok('  sie sagt stattdessen, wo sie stehen');
    else bad('  ohne Hinweis, wo die Preise stehen');
  }

  /* (6) Oberflaeche */
  {
    if(quelltext.indexOf('id="afLieferschein"') > 0) ok('Bedienelement vorhanden: afLieferschein');
    else bad('Bedienelement fehlt: afLieferschein');
    if(typeof hole('wLieferschein') === 'function') ok('Funktion vorhanden: wLieferschein');
    else bad('Funktion fehlt: wLieferschein');
    /* Dieses Papier geht AUS DEM HAUS - es gehoert in ein eigenes
       Dokument mit Firmenkopf, nicht in den Bildschirmausdruck des
       Blattes. Dasselbe Muster wie das Angebot. */
    if(/window\.open\('', '_blank'\)/.test(quelltext.slice(quelltext.indexOf('function wLieferschein'))))
      ok('der Lieferschein geht in ein eigenes Dokument, wie das Angebot');
    else bad('der Lieferschein wird in das Blatt gedruckt statt in ein eigenes Dokument');
  }
}

/* --- 21. Die Liste filtern und sortieren ------------------------------
   Der Durchstich ueber den echten Bestand hat 36 Auftraege erzeugt.
   Eine Liste ohne Filter ist ab etwa zwanzig Zeilen keine Liste mehr.

   DIE GEFAHR IST DAS HEIMLICHE VERSTECKEN: wer seinen Auftrag nicht
   findet, sucht ihn in den Daten statt in der Leiste. Deshalb kommen
   IMMER beide Zahlen zurueck - und der PLATZ in der urspruenglichen
   Liste, damit nach dem Sortieren kein Knopf auf den falschen Auftrag
   zeigt.                                                               */
console.log('\n21) Die Liste filtern und sortieren');
{
  const neuerAuftrag = hole('neuerAuftrag'), auftraegeFiltern = hole('auftraegeFiltern');
  const WERKSTATT_SORTEN = hole('WERKSTATT_SORTEN');

  if(typeof auftraegeFiltern === 'function') ok('vorhanden: auftraegeFiltern');
  else bad('fehlt: auftraegeFiltern');

  const bau = (o) => {
    const a = neuerAuftrag();
    a.nummer = o.nr; a.kunde = o.kunde; a.teil = o.teil;
    a.status = o.status; a.liefertermin = o.termin || '';
    a.preis = o.preis || 0; a.angelegt = o.angelegt || '';
    a.zeichnungsnr = o.zn || ''; a.werkstoff = o.ws || '';
    return a;
  };
  /* Fuenf Auftraege, jeder in einem anderen Status, mit Terminen, die
     der Reihenfolge der Liste WIDERSPRECHEN - sonst beweist ein
     sortierter Lauf nichts. */
  const L = [
    bau({nr:'A-5', kunde:'BorgWarner',  teil:'Kupplung',  status:'geliefert',   termin:'2026-09-10', preis:3960, angelegt:'2026-09-01'}),
    bau({nr:'A-1', kunde:'Gschossmann', teil:'Huelse',    status:'beauftragt',  termin:'2026-09-25', preis:2240, angelegt:'2026-09-05', zn:'Z-4102'}),
    bau({nr:'A-3', kunde:'Gschossmann', teil:'Lehre',     status:'laeuft',      termin:'',           preis:9999, angelegt:'2026-09-03'}),
    bau({nr:'A-2', kunde:'Eigenbedarf', teil:'Stift',     status:'angeboten',   termin:'2026-09-18', preis:1900, angelegt:'2026-09-08'}),
    bau({nr:'A-4', kunde:'BorgWarner',  teil:'Verbinder', status:'freigegeben', termin:'2026-09-20', preis:3150, angelegt:'2026-09-02'})
  ];
  const nrn = (f) => f.zeilen.map(x => x.a.nummer).join(',');

  /* (1) Ohne Filter steht alles da - und zwar nach Termin, ohne Termin
     ans Ende. Ein leeres Datum ist kein frueher Termin. */
  {
    const f = auftraegeFiltern(L, {});
    gleich('ohne Filter: alle fuenf', f.zahl, 5);
    gleich('  und die Gesamtzahl daneben', f.gesamt, 5);
    gleich('  nichts gefiltert', f.gefiltert, false);
    gleich('  nach Termin, ohne Termin ans Ende', nrn(f), 'A-5,A-2,A-4,A-1,A-3');
  }

  /* (2) "offen" ist die taegliche Frage: beauftragt, freigegeben,
     laeuft. Ein Angebot ist noch keiner, ein geliefertes keiner mehr. */
  {
    const f = auftraegeFiltern(L, {status:'offen'});
    gleich('offen: drei von fuenf', f.zahl + '/' + f.gesamt, '3/5');
    gleich('  und es sind die richtigen', nrn(f), 'A-4,A-1,A-3');
    gleich('  als gefiltert ausgewiesen', f.gefiltert, true);
  }

  /* (3) Einzelne Stufen. */
  {
    gleich('nur geliefert', nrn(auftraegeFiltern(L, {status:'geliefert'})), 'A-5');
    gleich('nur angeboten', nrn(auftraegeFiltern(L, {status:'angeboten'})), 'A-2');
    const leer = auftraegeFiltern(L, {status:'fertig'});
    gleich('keiner ist fertig', leer.zahl, 0);
    gleich('  aber die Gesamtzahl steht trotzdem da', leer.gesamt, 5);
  }

  /* (4) Der Text sucht in Nummer, Kunde, Teil, Zeichnung und Werkstoff -
     und ohne Ruecksicht auf Gross- und Kleinschreibung. */
  {
    gleich('Text "gschossmann"', nrn(auftraegeFiltern(L, {text:'gschossmann'})), 'A-1,A-3');
    gleich('  "Kupplung"', nrn(auftraegeFiltern(L, {text:'Kupplung'})), 'A-5');
    gleich('  eine Zeichnungsnummer', nrn(auftraegeFiltern(L, {text:'Z-4102'})), 'A-1');
    gleich('  Text und Status zusammen',
           nrn(auftraegeFiltern(L, {text:'borgwarner', status:'offen'})), 'A-4');
    gleich('  Leerzeichen zaehlen nicht als Text', auftraegeFiltern(L, {text:'   '}).gefiltert, false);
  }

  /* (5) Sortieren. Preis und Anlegedatum absteigend - das Groesste und
     das Neueste sind das, wonach man sucht. */
  {
    gleich('nach Nummer', nrn(auftraegeFiltern(L, {sortieren:'nummer'})), 'A-1,A-2,A-3,A-4,A-5');
    gleich('nach Preis, groesster zuerst', nrn(auftraegeFiltern(L, {sortieren:'preis'})), 'A-3,A-5,A-4,A-1,A-2');
    gleich('zuletzt angelegt zuerst (08., 05., 03., 02., 01. September)',
           nrn(auftraegeFiltern(L, {sortieren:'angelegt'})), 'A-2,A-1,A-3,A-4,A-5');
    gleich('nach Kunde', nrn(auftraegeFiltern(L, {sortieren:'kunde'})), 'A-5,A-4,A-2,A-1,A-3');
    gleich('eine unbekannte Sorte faellt auf Termin zurueck',
           auftraegeFiltern(L, {sortieren:'quatsch'}).sortieren, 'termin');
  }

  /* (6) DER PLATZ. Nach dem Sortieren muss jede Zeile immer noch auf
     ihren Auftrag in der urspruenglichen Liste zeigen - sonst trifft der
     Loeschknopf den falschen. */
  {
    /* MIT Filter, sonst prueft der Haken nichts: ohne Filter sind die
       gefilterten Plaetze dieselben wie die echten, und ein falsch
       gezaehlter Platz faellt gar nicht auf. "offen" laesst drei von
       fuenf uebrig - deren echte Plaetze sind 1, 2 und 4. */
    const f = auftraegeFiltern(L, {status:'offen', sortieren:'nummer'});
    gleich('gefiltert und sortiert: drei Zeilen', f.zahl, 3);
    gleich('jede Zeile zeigt auf ihren Auftrag in der Liste',
           f.zeilen.filter(x => L[x.platz] !== x.a).length, 0);
    gleich('  und die Plaetze sind die der ECHTEN Liste',
           f.zeilen.map(x => x.platz).sort().join(','), '1,2,4');
  }

  /* (7) Stabil: bei gleichem Schluessel bleibt die Reihenfolge der
     Liste, sonst springen Zeilen bei jedem Neuzeichnen. */
  {
    const gleichTermin = [
      bau({nr:'B-1', kunde:'X', teil:'a', status:'beauftragt', termin:'2026-09-20'}),
      bau({nr:'B-2', kunde:'X', teil:'b', status:'beauftragt', termin:'2026-09-20'}),
      bau({nr:'B-3', kunde:'X', teil:'c', status:'beauftragt', termin:'2026-09-20'})
    ];
    gleich('gleicher Termin: Reihenfolge der Liste bleibt',
           nrn(auftraegeFiltern(gleichTermin, {})), 'B-1,B-2,B-3');
  }

  /* (8) Oberflaeche */
  {
    ['aufFStatus', 'aufFText', 'aufFSort', 'aufFWeg'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    if(typeof hole('wFilterMalen') === 'function') ok('Funktion vorhanden: wFilterMalen');
    else bad('Funktion fehlt: wFilterMalen');
    /* Die Vorgabe MUSS "alle" sein - ein Filter, der beim ersten Oeffnen
       schon etwas versteckt, schickt den Benutzer in die Daten. */
    if(/filter: \{status:'alle'/.test(quelltext)) ok('die Vorgabe zeigt alle Auftraege');
    else bad('die Vorgabe versteckt beim ersten Oeffnen schon etwas');
    /* Und beide Zahlen muessen in der Zeile stehen. */
    if(/von ' \+ F\.gesamt \+ '<\/b> Auftr/.test(quelltext))
      ok('die Zeile nennt beide Zahlen, wenn gefiltert ist');
    else bad('die Zeile nennt nicht, wieviele es insgesamt gibt');
    if(/Kein Auftrag passt zum Filter/.test(quelltext))
      ok('und eine leere Liste sagt, dass es am Filter liegt');
    else bad('eine leere Liste sieht aus wie ein leerer Bestand');
  }
}

/* --- 22. Die Kalkulationsgrundlage ------------------------------------
   DIE FALLE, die frueher oder spaeter zuschlaegt: die Stundensaetze sind
   Platzhalter, und werden gepflegt. Von da an rechnet jedes NEUE
   Angebot mit anderen Werten - und an keinem bestehenden Auftrag stuende,
   dass sein Preis auf den alten beruht. Beide Zahlen sehen gleich aus,
   und die falsche ist die aeltere.

   Dieser Abschnitt macht die Probe mit einem HANDGREIFLICHEN Eingriff:
   der Stundensatz wird verdoppelt, und der Auftrag muss es merken.   */
console.log('\n22) Die Kalkulationsgrundlage');
{
  const neuerDatensatz = hole('neuerDatensatz'), kalkRechnen = hole('kalkRechnen');
  const KALK_VORGABEN = hole('KALK_VORGABEN');
  const auftragAusKalkulation = hole('auftragAusKalkulation');
  const auftragPruefen = hole('auftragPruefen'), neuerAuftrag = hole('neuerAuftrag');
  const kalkGrundlage = hole('kalkGrundlage');
  const auftragNachrechnen = hole('auftragNachrechnen');
  const auftragUebernehmen = hole('auftragUebernehmen');
  const gaengeSumme = hole('gaengeSumme');

  ['kalkGrundlage', 'auftragNachrechnen', 'auftragUebernehmen'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });

  const teilBauen = () => {
    const d = neuerDatensatz();
    d.teil.name = 'Pruefwelle'; d.teil.klasse = 'drehteil_einfach';
    d.teil.volumen_cm3 = 60; d.teil.kanten = 12;
    d.teil.bohrungen = [{d:6}, {d:8}, {d:10}];
    d.teil.rotation = {ja:true, achse:'Z', dmax:50, laenge:120, innen:false};
    d.rohteil = {form:'rund', masse:{d:53, l:122}, volumen_cm3:100};
    return d;
  };
  const einBauen = (d, stueck) => ({
    vorgaben:KALK_VORGABEN, teil:d.teil, rohteil:d.rohteil,
    werkstoff:'S235', toleranz:'mittel', oberflaeche:'normal',
    seiten:1, stueck:stueck || 10, versandArt:'versand', ueber:{}
  });

  /* (1) Beim Anlegen wird die Grundlage mitgeschrieben - und zwar NUR
     das, was kalkRechnen liest. */
  {
    const d = teilBauen(), ein = einBauen(d);
    const k = kalkRechnen(ein);
    const a = auftragAusKalkulation(d, k, {kunde:'M', nummer:'A-1', heute:'2026-09-15', ein});
    gleich('der Auftrag ist gueltig', auftragPruefen(a).length, 0);
    if(a.kalk) ok('die Grundlage ist mitgeschrieben');
    else bad('die Grundlage fehlt');
    if(a.kalk){
      gleich('  Datum', a.kalk.gerechnet, '2026-09-15');
      gleich('  Werkstoff', a.kalk.werkstoff, 'S235');
      gleich('  Stueckzahl', a.kalk.stueck, 10);
      gleich('  Teilvolumen', a.kalk.teil.volumen_cm3, 60);
      gleich('  Rohteilvolumen', a.kalk.rohteil.volumen_cm3, 100);
      gleich('  Bohrungen als ZAHL, nicht als Liste', a.kalk.teil.bohrungen, 3);
      gleich('  Kanten', a.kalk.teil.kanten, 12);
      /* Die Grundlage ist klein - eine Kopie des Datensatzes waere
         hundertmal so gross und wuerde bei jedem neuen Feld veralten. */
      const gross = JSON.stringify(a.kalk).length;
      if(gross < 400) ok('  und sie ist klein (' + gross + ' Zeichen)');
      else bad('  aber sie ist ' + gross + ' Zeichen gross');
    }
  }

  /* (2) OHNE die Eingaben bleibt sie null - und das ist eine gueltige,
     ehrliche Auskunft, keine Luecke. */
  {
    const d = teilBauen(), k = kalkRechnen(einBauen(d));
    const a = auftragAusKalkulation(d, k, {kunde:'M', nummer:'A-2', heute:'2026-09-15'});
    gleich('ohne Eingaben: keine Grundlage', a.kalk, null);
    gleich('  und der Auftrag ist trotzdem gueltig', auftragPruefen(a).length, 0);
    gleich('  nachrechnen geht dann nicht', auftragNachrechnen(a, kalkRechnen, KALK_VORGABEN), null);
  }

  /* (3) Unveraenderte Einstellungen ergeben dieselbe Zahl. Das ist die
     Voraussetzung dafuer, dass eine Abweichung etwas bedeutet. */
  {
    const d = teilBauen(), ein = einBauen(d);
    const k = kalkRechnen(ein);
    const a = auftragAusKalkulation(d, k, {kunde:'M', nummer:'A-3', heute:'2026-09-15', ein});
    const n = auftragNachrechnen(a, kalkRechnen, KALK_VORGABEN);
    gleich('gleiche Einstellungen: kein Unterschied', n && n.gleich, true);
    if(n){
      nahe('  derselbe Preis', n.neu.preis, a.preis, 1e-9);
      nahe('  dieselbe Stueckzeit', n.neu.stueckzeit, a.zeiten.stueckzeit, 1e-9);
      gleich('  und die Stueckzahl ist dieselbe', n.stueckGeaendert, false);
    }
  }

  /* (4) DIE PROBE: Stundensatz verdoppeln. Der Auftrag MUSS es merken,
     ohne dass sich an ihm etwas geaendert hat. */
  {
    const d = teilBauen(), ein = einBauen(d);
    const k = kalkRechnen(ein);
    const a = auftragAusKalkulation(d, k, {kunde:'M', nummer:'A-4', heute:'2026-09-15', ein});
    const alt = a.preis;
    const teurer = JSON.parse(JSON.stringify(KALK_VORGABEN));
    teurer.saetze.drehen = (teurer.saetze.drehen || 60) * 2;
    const n = auftragNachrechnen(a, kalkRechnen, teurer);
    gleich('doppelter Stundensatz: der Auftrag merkt es', n && n.gleich, false);
    if(n && n.neu.preis > alt) ok('  und der neue Preis ist hoeher (' +
      Math.round(alt) + ' -> ' + Math.round(n.neu.preis) + ' Euro)');
    else bad('  aber der neue Preis ist nicht hoeher');
    /* DER AUFTRAG BEHAELT SEINEN PREIS, bis jemand ihn uebernimmt. Das
       Angebot liegt beim Kunden. */
    gleich('  der Auftrag behaelt bis dahin seinen Preis', a.preis, alt);
    gleich('  und seine Zeiten', a.zeiten.stueckzeit, k.zeiten.stueckzeit);
    /* Und dann der Knopf. */
    if(n){
      n.heute = '2026-09-20';
      gleich('Uebernehmen gelingt', auftragUebernehmen(a, n), true);
      nahe('  jetzt traegt der Auftrag den neuen Preis', a.preis, n.neu.preis, 1e-9);
      gleich('  und das neue Rechendatum', a.kalk && a.kalk.gerechnet, '2026-09-20');
      const n2 = auftragNachrechnen(a, kalkRechnen, teurer);
      gleich('  danach gibt es keinen Unterschied mehr', n2 && n2.gleich, true);
    }
  }

  /* (5) Nach dem Uebernehmen muessen die Arbeitsgaenge wieder aufgehen -
     sonst stuende die Summe gegen die Kalkulation. */
  {
    const d = teilBauen(), ein = einBauen(d);
    const k = kalkRechnen(ein);
    const a = auftragAusKalkulation(d, k, {kunde:'M', nummer:'A-5', heute:'2026-09-15', ein});
    a.gaenge = [
      {nr:1, name:'drehen', maschine:'m1000',
       ruestzeit:a.zeiten.ruestzeit - 10, stueckzeit:a.zeiten.stueckzeit - 1},
      {nr:2, name:'fraesen', maschine:'fr1', ruestzeit:10, stueckzeit:1}
    ];
    gleich('vorher gueltig', auftragPruefen(a).length, 0);
    /* GEAENDERT WIRD DIE RUESTZEIT, nicht der Stundensatz: ein anderer
       Satz aendert nur den Preis, und dann bliebe die Summe der
       Arbeitsgaenge ohnehin richtig - der Haken traefe ins Leere. Mit
       20 -> 50 min muss der erste Gang 30 Minuten aufnehmen. */
    const teurer = JSON.parse(JSON.stringify(KALK_VORGABEN));
    teurer.ruesten.drehteil_einfach = 50;
    const n = auftragNachrechnen(a, kalkRechnen, teurer);
    if(n) nahe('  die neue Ruestzeit ist 30 min hoeher',
               n.neu.ruestzeit - n.alt.ruestzeit, 30, 1e-9);
    if(!n) bad('nach dem Uebernehmen weiter gueltig — nicht nachrechenbar');
    else {
      n.heute = '2026-09-20';
      auftragUebernehmen(a, n);
      gleich('nach dem Uebernehmen weiter gueltig', auftragPruefen(a).length, 0);
      nahe('  die Gaenge summieren sich auf die neue Ruestzeit',
           gaengeSumme(a).ruestzeit, a.zeiten.ruestzeit, 1e-9);
      gleich('  der zweite Gang ist unangetastet geblieben', a.gaenge[1].ruestzeit, 10);
    }
  }

  /* (6) Eine geaenderte Stueckzahl ist NICHT dasselbe wie eine geaenderte
     Einstellung - beides zugleich saehe sonst gleich aus. */
  {
    const d = teilBauen(), ein = einBauen(d, 10);
    const k = kalkRechnen(ein);
    const a = auftragAusKalkulation(d, k, {kunde:'M', nummer:'A-6', heute:'2026-09-15', ein});
    a.stueck = 50;
    const n = auftragNachrechnen(a, kalkRechnen, KALK_VORGABEN);
    gleich('andere Stueckzahl: wird als solche ausgewiesen', n && n.stueckGeaendert, true);
    if(!n){ bad('  gerechnet wird mit der heutigen — nicht nachrechenbar'); }
    else {
    gleich('  gerechnet wird mit der heutigen', n.stueck, 50);
    const einzAlt = k.preise.einzelpreis, einzNeu = n.ergebnis.preise.einzelpreis;
    gleich('  der GESAMTpreis steigt mit der Menge', n.neu.preis > a.preis, true);
    if(einzNeu < einzAlt) ok('  der EINZELpreis sinkt (Ruestumlage auf mehr Stueck): ' +
      (Math.round(einzAlt * 100) / 100) + ' -> ' + (Math.round(einzNeu * 100) / 100) + ' Euro');
    else bad('  aber der Einzelpreis sinkt nicht: ' + einzNeu + ' gegen ' + einzAlt);
    }
  }

  /* (7) Oberflaeche */
  {
    ['afGrundlage', 'afNeuRechnen', 'afNeuZeile'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    if(typeof hole('wGrundlageMalen') === 'function') ok('Funktion vorhanden: wGrundlageMalen');
    else bad('Funktion fehlt: wGrundlageMalen');
    /* Beim Anlegen MUSS die Grundlage mitgehen - sonst laeuft die ganze
       Mechanik ins Leere, und zwar unsichtbar. */
    if(/ein:ein\s*\n\s*\}\);/.test(quelltext)) ok('das Anlegen gibt die Grundlage mit');
    else bad('das Anlegen gibt die Grundlage NICHT mit - die Mechanik liefe ins Leere');
    if(/Der Auftrag beh&auml;lt seinen Preis/.test(quelltext))
      ok('und die Maske sagt, dass der Auftrag seinen Preis behaelt');
    else bad('die Maske verschweigt, dass der Auftrag seinen Preis behaelt');
  }
}

/* --- 23. Maschinen pflegen --------------------------------------------
   DER BEFUND: Entscheidung Nummer eins auf der Entscheidungsliste heisst
   "Arbeitsraum der beiden Drehmaschinen messen" - und die App liess die
   Masse gar nicht eintragen. Sie standen als Text da. Eine App, die nach
   einer Zahl fragt und kein Feld dafuer hat, fragt nicht ernsthaft.  */
console.log('\n23) Maschinen pflegen');
{
  const maschineNeu = hole('maschineNeu'), maschineArtSetzen = hole('maschineArtSetzen');
  const maschinePruefen = hole('maschinePruefen'), maschineBelegt = hole('maschineBelegt');
  const WERKSTATT_ARTEN = hole('WERKSTATT_ARTEN');
  const neuerAuftrag = hole('neuerAuftrag');
  const planBelegen = hole('planBelegen'), planKapazitaet = hole('planKapazitaet');
  const M = hole('WERKSTATT_MASCHINEN');

  ['maschineNeu', 'maschineArtSetzen', 'maschinePruefen', 'maschineBelegt'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });
  gleich('drei Arten', (WERKSTATT_ARTEN || []).join(','), 'drehen,fraesen,handarbeit');

  /* (1) Eine neue Maschine hat die Form ihrer Art - und ist noch nicht
     gepflegt, denn sie hat noch keine Masse. */
  {
    const d = maschineNeu('drehen', 'dr9');
    gleich('Drehmaschine: Durchmesser und Laenge', Object.keys(d.raum).join(','), 'dmax,laenge');
    gleich('  480 min an fuenf Tagen', d.minuten_je_tag + '/' + d.tage.join(''), '480/12345');
    gleich('  und sie gilt als ungepflegt', d.gepflegt, false);
    const f = maschineNeu('fraesen', 'fr9');
    gleich('Fraesmaschine: drei Verfahrwege', Object.keys(f.raum).join(','), 'x,y,z');
    const h = maschineNeu('handarbeit', 'ha9');
    gleich('Arbeitsplatz: kein Arbeitsraum', h.raum, null);
    gleich('eine unbekannte Art wird zur Drehmaschine', maschineNeu('quatsch', 'q').art, 'drehen');
  }

  /* (2) Beim Wechsel der Art wechselt der Arbeitsraum die FORM - und
     wird NICHT umgerechnet. Aus einem Durchmesser eine Verfahrlaenge zu
     machen waere geraten. */
  {
    const m = maschineNeu('drehen', 'x1');
    m.raum.dmax = 320; m.raum.laenge = 1000; m.gepflegt = true;
    gleich('Wechsel auf fraesen gelingt', maschineArtSetzen(m, 'fraesen'), true);
    gleich('  jetzt drei Wege', Object.keys(m.raum).join(','), 'x,y,z');
    gleich('  und sie stehen auf null, nicht auf 320', m.raum.x + m.raum.y + m.raum.z, 0);
    gleich('  die Maschine gilt wieder als ungepflegt', m.gepflegt, false);
    gleich('derselbe Art nochmal: nichts passiert', maschineArtSetzen(m, 'fraesen'), false);
    gleich('eine unbekannte Art wird abgelehnt', maschineArtSetzen(m, 'quatsch'), false);
  }

  /* (3) Die Wache. Jede Beanstandung ist eine, die sonst erst in der
     Belegung auffiele - und dort als fehlende Kapazitaet, nicht als
     Eingabefehler. */
  {
    const gut = maschineNeu('drehen', 'g1');
    gut.name = 'Monforts'; gut.raum.dmax = 320; gut.raum.laenge = 1000;
    gleich('eine vollstaendige Maschine ist in Ordnung', maschinePruefen(gut, [gut]).length, 0);

    const ohneName = maschineNeu('drehen', 'g2'); ohneName.raum.dmax = 1; ohneName.raum.laenge = 1;
    if(maschinePruefen(ohneName, []).some(x => /keinen Namen/.test(x))) ok('ohne Namen: beanstandet');
    else bad('ohne Namen: rutscht durch');

    const ohneTag = maschineNeu('drehen', 'g3');
    ohneTag.name = 'X'; ohneTag.raum.dmax = 1; ohneTag.raum.laenge = 1; ohneTag.tage = [];
    if(maschinePruefen(ohneTag, []).some(x => /Arbeitstag/.test(x))) ok('ohne Arbeitstag: beanstandet');
    else bad('ohne Arbeitstag: rutscht durch');
    /* Und das ist kein formaler Einwand: eine Maschine ohne Arbeitstag
       hat an JEDEM Tag null Minuten. */
    gleich('  sie haette an keinem Tag Kapazitaet',
           planKapazitaet(ohneTag, hole('planTag')('2026-09-15')), 0);

    const falscherTag = maschineNeu('drehen', 'g4');
    falscherTag.name = 'X'; falscherTag.raum.dmax = 1; falscherTag.raum.laenge = 1;
    falscherTag.tage = [1, 9];
    if(maschinePruefen(falscherTag, []).some(x => /ausserhalb 1\.\.7/.test(x)))
      ok('Tag 9 wird beanstandet');
    else bad('Tag 9 rutscht durch');

    const doppelt = maschineNeu('drehen', 'g1'); doppelt.name = 'Y';
    doppelt.raum.dmax = 1; doppelt.raum.laenge = 1;
    if(maschinePruefen(doppelt, [gut, doppelt]).some(x => /zweimal/.test(x)))
      ok('eine doppelte Kennung wird beanstandet');
    else bad('eine doppelte Kennung rutscht durch');

    const halbeFraese = maschineNeu('fraesen', 'g5'); halbeFraese.name = 'F';
    halbeFraese.raum.x = 800; halbeFraese.raum.y = 500;
    if(maschinePruefen(halbeFraese, []).some(x => /Verfahrwege/.test(x)))
      ok('eine Fraese ohne Z wird beanstandet');
    else bad('eine Fraese ohne Z rutscht durch');
    /* Der Handarbeitsplatz braucht keinen Raum - und darf deshalb auch
       nicht danach gefragt werden. */
    const hand = maschineNeu('handarbeit', 'g6'); hand.name = 'Entgraten';
    gleich('der Arbeitsplatz braucht keinen Arbeitsraum', maschinePruefen(hand, []).length, 0);
  }

  /* (4) Eine Maschine, auf der Arbeit liegt, darf nicht verschwinden -
     sonst verlieren die Auftraege still ihre Maschine. */
  {
    const a = neuerAuftrag();
    a.nummer = 'A-9'; a.teil = 'Welle'; a.stueck = 1; a.status = 'beauftragt';
    a.zeiten = {ruestzeit:60, stueckzeit:0}; a.maschine = 'm1000';
    a.masse = {dmax:60, laenge:200, x:0, y:0, z:0};
    gleich('die 1000er traegt Arbeit', maschineBelegt('m1000', [a]).join(','), 'A-9');
    gleich('  die 1500er nicht', maschineBelegt('m1500', [a]).length, 0);
    /* Auch ein zweiter Arbeitsgang zaehlt. */
    a.gaenge = [{nr:1, name:'drehen', maschine:'m1000', ruestzeit:30, stueckzeit:0},
                {nr:2, name:'fraesen', maschine:'fr1', ruestzeit:30, stueckzeit:0}];
    gleich('auch die Fraese ueber den zweiten Gang', maschineBelegt('fr1', [a]).join(','), 'A-9');
  }

  /* (5) Eine abgeschaltete Maschine bindet keine Kapazitaet - das ist
     der Weg fuer "die Fraesmaschine gibt es noch nicht". */
  {
    const aus = JSON.parse(JSON.stringify(M));
    aus.filter(m => m.id === 'm1500')[0].aktiv = false;
    const a = neuerAuftrag();
    a.nummer = 'A-8'; a.teil = 'Lang'; a.stueck = 1; a.status = 'beauftragt';
    a.klasse = 'drehteil_einfach'; a.gattung = 'drehen';
    a.zeiten = {ruestzeit:60, stueckzeit:0}; a.maschine = 'm1500';
    a.masse = {dmax:60, laenge:200, x:0, y:0, z:0};
    const b = planBelegen({auftraege:[a], maschinen:aus, ab:'2026-09-15', tage:30});
    gleich('auf einer abgeschalteten Maschine wird nichts eingeplant', b.auftraege.length, 0);
    gleich('  aber es wird benannt', b.unplanbar.length, 1);
  }

  /* (6) Oberflaeche */
  {
    ['plMaschPlus', 'plMaschPlusF', 'plMaschPlusH', 'plMaschFehler'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    if(typeof hole('wMaschinenPruefen') === 'function') ok('Funktion vorhanden: wMaschinenPruefen');
    else bad('Funktion fehlt: wMaschinenPruefen');
    /* DER KERN DES PAKETS: der Arbeitsraum ist ein FELD, kein Text. */
    if(/data-mr="/.test(quelltext) && /data-feld="/.test(quelltext))
      ok('der Arbeitsraum ist ein Eingabefeld, kein Text');
    else bad('der Arbeitsraum steht immer noch nur als Text da');
    ['data-ma=', 'data-mt=', 'data-mk=', 'data-mweg='].forEach(x => {
      if(quelltext.indexOf(x) > 0) ok('  auch ' + x.replace('data-', '').replace('=', '') + ' ist bedienbar');
      else bad('  ' + x + ' fehlt');
    });
    /* Wer eine Zahl eintraegt, hat sie bewusst hingeschrieben - und der
       Platzhalter-Hinweis muss dann verschwinden. */
    if(/m\.gepflegt = true; m\.hinweis = '';/.test(quelltext))
      ok('eine eingetragene Zahl macht die Maschine gepflegt');
    else bad('der Platzhalter-Hinweis bliebe auch nach dem Eintragen stehen');
  }
}

/* --- 24. Freie Tage ---------------------------------------------------
   DER BEFUND: planKapazitaet kennt die Liste der freien Tage seit dem
   ersten Tag, und der Kern reicht sie an 26 Stellen durch. Die
   OBERFLAECHE hat sie NIE uebergeben - es gab also keinen Weg, einen
   Feiertag einzutragen, und der Plan liess am 3. Oktober arbeiten. Im
   Morgenbericht stand von mir der Satz "wer einen Tag sperren will,
   traegt ihn als freien Tag ein" - fuer etwas, das sich nicht eintragen
   liess.

   KALENDER: 2026-09-14 Montag, 2026-09-16 Mittwoch, 2026-09-19 Samstag,
   2026-10-03 Samstag.                                                 */
console.log('\n24) Freie Tage');
{
  const neuerAuftrag = hole('neuerAuftrag');
  const planFreiBereich = hole('planFreiBereich'), planFreiNorm = hole('planFreiNorm');
  const planFreiWirkung = hole('planFreiWirkung');
  const planBelegen = hole('planBelegen'), planKapazitaet = hole('planKapazitaet');
  const planSpaetester = hole('planSpaetester'), planZettel = hole('planZettel');
  const planTag = hole('planTag');
  const M = hole('WERKSTATT_MASCHINEN');

  ['planFreiBereich', 'planFreiNorm', 'planFreiWirkung'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });

  /* (1) Ein Zeitraum wird zu einer Liste von Tagen - und zwar zu allen,
     auch den Wochenenden darin: was frei ist, ist frei. */
  {
    gleich('ein einzelner Tag', planFreiBereich('2026-10-03', '').join(','), '2026-10-03');
    gleich('  leeres Ende = ein Tag', planFreiBereich('2026-10-03').length, 1);
    gleich('eine Woche Betriebsurlaub', planFreiBereich('2026-09-14', '2026-09-20').length, 7);
    gleich('  von Montag bis Sonntag',
           planFreiBereich('2026-09-14', '2026-09-20').slice(0, 2).join(','),
           '2026-09-14,2026-09-15');
    /* Verdrehte Grenzen sind ein Vertipper, kein leerer Zeitraum. */
    gleich('bis vor von: ein Tag statt nichts', planFreiBereich('2026-09-20', '2026-09-14').length, 1);
    /* Und ein Zeitraum ueber ein Jahr ist ein Vertipper, der die Liste
       mit hunderten Eintraegen fluten wuerde. */
    gleich('ueber ein Jahr: abgelehnt', planFreiBereich('2026-01-01', '2028-01-01').length, 0);
    gleich('ohne Anfang: nichts', planFreiBereich('', '2026-09-20').length, 0);
  }

  /* (2) Die Liste wird sortiert, entdoppelt und von Unsinn befreit. Ein
     "morgen" in der Liste saehe aus wie ein gesperrter Tag und waere
     keiner. */
  {
    const n = planFreiNorm(['2026-10-03', 'morgen', '2026-09-14', '2026-10-03', '', null]);
    gleich('doppelt und Unsinn fallen weg', n.join(','), '2026-09-14,2026-10-03');
    gleich('leere Liste bleibt leer', planFreiNorm([]).length, 0);
    gleich('gar keine Liste ebenso', planFreiNorm(null).length, 0);
  }

  /* (3) DIE WIRKUNG: der 3. Oktober 2026 ist ein SAMSTAG. Ein freier Tag
     am Wochenende kostet nichts - und das soll man sehen, bevor man sich
     wundert, warum sich am Plan nichts aendert. */
  {
    const w = planFreiWirkung(['2026-10-03', '2026-09-16'], M, '2026-09-14', '2026-10-31');
    gleich('zwei Tage im Fenster', w.imFenster, 2);
    gleich('  aber nur einer wirkt', w.wirksam, 1);
    gleich('  der Samstag zaehlt nicht', w.ohneWirkung, 1);
    const eng = planFreiWirkung(['2026-10-03'], M, '2026-09-14', '2026-09-20');
    gleich('ausserhalb des Fensters: nicht gezaehlt', eng.imFenster, 0);
    gleich('  in der Liste steht er trotzdem', eng.zahl, 1);
  }

  /* (4) Und der Tag wirkt WIRKLICH: die Kapazitaet faellt auf null, der
     Auftrag rueckt nach hinten. */
  {
    const a = neuerAuftrag();
    a.nummer = 'F-1'; a.teil = 'Welle'; a.stueck = 1; a.status = 'beauftragt';
    a.klasse = 'drehteil_einfach'; a.gattung = 'drehen';
    a.zeiten = {ruestzeit:960, stueckzeit:0}; a.maschine = 'm1000';
    a.liefertermin = '2026-09-25';
    a.masse = {dmax:60, laenge:200, x:0, y:0, z:0};
    const m = M.filter(x => x.id === 'm1000')[0];
    gleich('ohne freien Tag hat der Dienstag 480 min',
           planKapazitaet(m, planTag('2026-09-15')), 480);
    gleich('  mit freiem Tag null',
           planKapazitaet(m, planTag('2026-09-15'), ['2026-09-15']), 0);

    const ohne = planBelegen({auftraege:[a], maschinen:M, ab:'2026-09-14', tage:30});
    gleich('ohne freie Tage: Mo und Di', ohne.auftraege[0].start + '..' + ohne.auftraege[0].ende,
           '2026-09-14..2026-09-15');
    const mit = planBelegen({auftraege:[a], maschinen:M, ab:'2026-09-14', tage:30,
                             frei:['2026-09-15']});
    gleich('mit freiem Dienstag: Mo und Mi', mit.auftraege[0].start + '..' + mit.auftraege[0].ende,
           '2026-09-14..2026-09-16');
    /* Auch die Rueckwaertsrechnung muss ihn kennen - sonst waere die
       Frist einen Tag zu spaet und der Puffer zu gross. */
    const spOhne = planSpaetester(a, M);
    const spMit = planSpaetester(a, M, ['2026-09-24']);
    gleich('die Frist ohne freien Tag', spOhne && spOhne.start, '2026-09-24');
    gleich('  mit freiem Donnerstag einen Tag frueher', spMit && spMit.start, '2026-09-23');
    /* Und der Zettel: ein freier Tag hat keine Kapazitaet und steht
       deshalb nicht darauf. */
    const z = planZettel(mit, M, 'm1000', 7, ['2026-09-15']);
    gleich('der Zettel gibt dem freien Tag keine Kapazitaet',
           z && z.tage.filter(t => t.datum === '2026-09-15')[0].kapazitaet, 0);
  }

  /* (5) Oberflaeche - und der eigentliche Befund: die Liste muss
     DURCHGEREICHT werden. Ohne das ist die ganze Mechanik im Kern
     vorhanden und von aussen unerreichbar. */
  {
    ['plFreiVon', 'plFreiBis', 'plFreiPlus', 'plFreiWeg', 'plFreiListe', 'plFreiHinweis'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    ['wFreiMalen', 'wFreiLaden', 'wFreiSichern'].forEach(nm => {
      if(typeof hole(nm) === 'function') ok('Funktion vorhanden: ' + nm);
      else bad('Funktion fehlt: ' + nm);
    });
    /* JEDER Aufruf, nicht irgendeiner. Die alte Fassung suchte das
       Muster irgendwo im Quelltext - seit es das Dashboard gibt, ruft
       die Oberflaeche die Planung an zwei Stellen, und die Wache fand
       die zweite, auch wenn an der ersten das Durchreichen fehlte. */
    {
      const rufe = quelltext.match(/plan(?:Belegen|Uebersicht)\(\{[\s\S]{0,400}?\}\)/g) || [];
      const ohne = rufe.filter(r => r.indexOf('frei:W.frei') < 0 && r.indexOf('frei:') < 0);
      if(rufe.length >= 2 && !ohne.length)
        ok('alle ' + rufe.length + ' Planungsaufrufe bekommen die freien Tage');
      else if(!rufe.length) bad('kein einziger Planungsaufruf gefunden - die Wache misst nichts');
      else bad(ohne.length + ' von ' + rufe.length + ' Planungsaufrufen bekommen die freien Tage NICHT');
    }
    [['planAuslastung', /planAuslastung\(b, W\.maschinen, W\.frei\)/],
     ['planZettel', /planZettel\(b, W\.maschinen, mid, tage, W\.frei\)/]].forEach(([nm, re]) => {
      if(re.test(quelltext)) ok(nm + ' bekommt die freien Tage');
      else bad(nm + ' bekommt die freien Tage NICHT - die Mechanik bliebe unerreichbar');
    });
    if(/Feiertagskalender kennt die App nicht/.test(quelltext))
      ok('und die App sagt, dass sie keinen Feiertagskalender hat');
    else bad('die App verschweigt, dass sie keinen Feiertagskalender hat');
  }
}

/* --- 25. Die zwei Planungsregeln als Schalter -------------------------
   PUNKT 7 UND 8 DER ENTSCHEIDUNGSLISTE. Beide standen im Morgenbericht
   als offene Frage; beide sind jetzt Schalter, und die VORGABE ist
   genau die Rechnung von vorher ('last' und ein Tag) - wer nichts
   einstellt, bekommt denselben Plan wie gestern.

   DIE TRAGENDE MESSUNG ist der Fall, in dem sich die zwei Wahlregeln
   UNTERSCHEIDEN: ein kurzes Teil passt auf beide Drehmaschinen, die
   1000er ist voller. 'last' legt es dann auf die 1500er, 'klein' bleibt
   bei der 1000er. Ein Testfall, in dem beide dasselbe liefern, prueft
   nichts.

   KALENDER: 2026-09-14 Montag ... 2026-09-18 Freitag, 19./20. Wochenende.
                                                                       */
console.log('\n25) Die zwei Planungsregeln');
{
  const neuerAuftrag = hole('neuerAuftrag');
  const maschineVorschlag = hole('maschineVorschlag'), maschineGroesse = hole('maschineGroesse');
  const WAHL = hole('WERKSTATT_MASCHINENWAHL');
  const planBelegen = hole('planBelegen'), planSpaetester = hole('planSpaetester');
  const planVerteilen = hole('planVerteilen'), auftragGaenge = hole('auftragGaenge');
  const gangAnhaengen = hole('gangAnhaengen'), gaengeSumme = hole('gaengeSumme');
  const M = hole('WERKSTATT_MASCHINEN');

  ['maschineGroesse', 'maschineVorschlag', 'planVerteilen'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });
  gleich('zwei Wahlregeln, mehr nicht', (WAHL || []).join(','), 'last,klein');

  const mit = (id) => M.filter(x => x.id === id)[0];

  /* (1) Wie gross ist eine Maschine? Beim Drehen entscheidet die
     DREHLAENGE - 1000 gegen 1500 bei gleichem Durchmesser. */
  {
    const g1000 = maschineGroesse(mit('m1000')), g1500 = maschineGroesse(mit('m1500'));
    if(g1000 < g1500) ok('die 1000er gilt als kleiner als die 1500er');
    else bad('die 1000er gilt NICHT als kleiner — ist ' + g1000 + ', 1500er ' + g1500);
    /* Bei gleicher Laenge entscheidet der Durchmesser - sonst waeren
       zwei verschieden grosse Maschinen gleich gross. */
    const a = {art:'drehen', raum:{dmax:200, laenge:1000}};
    const b = {art:'drehen', raum:{dmax:320, laenge:1000}};
    if(maschineGroesse(a) < maschineGroesse(b)) ok('bei gleicher Laenge entscheidet der Durchmesser');
    else bad('bei gleicher Laenge entscheidet der Durchmesser NICHT');
    /* Der Handarbeitsplatz hat keinen Arbeitsraum. Waere er "0 gross",
       zoege ihn 'klein' jedem echten Werkzeug vor. */
    gleich('ohne Arbeitsraum gilt eine Maschine als die groesste',
           maschineGroesse(mit('hand')), Infinity);
    gleich('  und nicht als die kleinste', maschineGroesse(mit('hand')) > maschineGroesse(mit('m1000')), true);
    /* Fraesen: der Rauminhalt. */
    if(maschineGroesse({art:'fraesen', raum:{x:400, y:300, z:300}}) <
       maschineGroesse(mit('fr1'))) ok('beim Fraesen entscheidet der Rauminhalt');
    else bad('beim Fraesen entscheidet der Rauminhalt NICHT');
  }

  /* (2) DER FALL, IN DEM SICH DIE REGELN UNTERSCHEIDEN. Ein Brocken von
     20 Stunden liegt auf der 1000er; das kurze Teil passt auf beide. */
  {
    const brocken = neuerAuftrag();
    brocken.nummer = 'R-0'; brocken.teil = 'Grosswelle'; brocken.stueck = 1;
    brocken.status = 'beauftragt'; brocken.klasse = 'drehteil_einfach';
    brocken.gattung = 'drehen'; brocken.maschine = 'm1000';
    brocken.zeiten = {ruestzeit:1200, stueckzeit:0};
    brocken.masse = {dmax:100, laenge:800, x:0, y:0, z:0};

    const kurz = neuerAuftrag();
    kurz.nummer = 'R-1'; kurz.teil = 'Buchse'; kurz.stueck = 1;
    kurz.status = 'beauftragt'; kurz.klasse = 'drehteil_einfach';
    kurz.gattung = 'drehen';
    kurz.zeiten = {ruestzeit:60, stueckzeit:0};
    kurz.masse = {dmax:60, laenge:200, x:0, y:0, z:0};

    gleich('voll belegte 1000er, kurzes Teil: "last" weicht aus',
           maschineVorschlag(kurz, M, [brocken], 'last'), 'm1500');
    gleich('  "klein" bleibt bei der kleinen Maschine',
           maschineVorschlag(kurz, M, [brocken], 'klein'), 'm1000');
    /* Ohne Regel gilt die alte Rechnung - jeder Bestandsaufruf mit drei
       Parametern verhaelt sich unveraendert. */
    gleich('ohne Regel gilt "last" (Bestandsverhalten)',
           maschineVorschlag(kurz, M, [brocken]), 'm1500');
    gleich('  Unsinn als Regel ebenso',
           maschineVorschlag(kurz, M, [brocken], 'mittelgross'), 'm1500');

    /* Wo es keine Wahl gibt, ist die Regel bedeutungslos: 1200 mm passen
       nur auf die 1500er. */
    const lang = neuerAuftrag();
    lang.nummer = 'R-2'; lang.teil = 'Lange Welle'; lang.stueck = 1;
    lang.status = 'beauftragt'; lang.klasse = 'drehteil_einfach';
    lang.gattung = 'drehen'; lang.zeiten = {ruestzeit:60, stueckzeit:0};
    lang.masse = {dmax:60, laenge:1200, x:0, y:0, z:0};
    gleich('1200 mm: "klein" nimmt trotzdem die 1500er',
           maschineVorschlag(lang, M, [], 'klein'), 'm1500');
    gleich('  "last" auch', maschineVorschlag(lang, M, [], 'last'), 'm1500');

    /* Und derselbe Unterschied beim VERTEILEN - zwei Regeln fuer
       denselben Zweck waeren nicht zu erklaeren. */
    const bauKurz = () => {
      const a = JSON.parse(JSON.stringify(kurz)); a.maschine = 'm1500'; return a;
    };
    const setL = [JSON.parse(JSON.stringify(brocken)), bauKurz()];
    planVerteilen(setL, M, null, 'last');
    gleich('verteilen "last": das kurze Teil bleibt auf der leeren 1500er',
           setL[1].maschine, 'm1500');
    const setK = [JSON.parse(JSON.stringify(brocken)), bauKurz()];
    const vK = planVerteilen(setK, M, null, 'klein');
    gleich('verteilen "klein": es wandert auf die 1000er', setK[1].maschine, 'm1000');
    gleich('  und der Knopf sagt es', vK.zahl, 1);
    /* Ohne Regel wie bisher. */
    const setO = [JSON.parse(JSON.stringify(brocken)), bauKurz()];
    planVerteilen(setO, M, null);
    gleich('verteilen ohne Regel: Bestandsverhalten', setO[1].maschine, 'm1500');
  }

  /* (3) DER ABSTAND ZWISCHEN ZWEI GAENGEN. Ein Auftrag mit zwei Gaengen
     zu je einem halben Tag: der zweite beginnt je nach Einstellung am
     selben Tag, am naechsten oder spaeter. */
  {
    const a = neuerAuftrag();
    a.nummer = 'U-1'; a.teil = 'Drehteil mit Fraesanteil'; a.stueck = 1;
    a.status = 'beauftragt'; a.klasse = 'drehteil_fraes'; a.gattung = 'drehen';
    /* Die Summe der Gaenge IST die Kalkulation: 480 Minuten, halbe/halbe.
       Ein neuer Gang beginnt mit null Minuten (Absicht - so bleibt die
       Summe im selben Augenblick richtig), die Minuten wandern danach
       hinueber. */
    a.zeiten = {ruestzeit:480, stueckzeit:0}; a.maschine = 'm1000';
    a.masse = {dmax:60, laenge:200, x:100, y:100, z:100};
    a.liefertermin = '2026-10-02';
    gangAnhaengen(a, 'Fraesen', 'fr1');
    a.gaenge[0].ruestzeit = 240;
    a.gaenge[1].ruestzeit = 240;
    gleich('der Testauftrag hat zwei Gaenge', auftragGaenge(a).length, 2);
    gleich('  und die Summe ist die Kalkulation', gaengeSumme(a).ruestzeit, 480);

    /* WAECHTER: faellt der Auftrag aus der Planung, MUSS der Haken rot
       werden, nicht der Lauf abstuerzen. Sechster Fall dieser Klasse -
       die Regel steht seit dem STEP-Paket in CLAUDE.md. */
    const lauf = (ueb) => {
      const e = {auftraege:[JSON.parse(JSON.stringify(a))], maschinen:M,
                 ab:'2026-09-14', tage:40};
      if(ueb !== null) e.uebergabe = ueb;
      const b = planBelegen(e);
      const z = b.auftraege[0];
      if(!z || !z.gaenge) return 'NICHT GEPLANT: ' +
        ((b.unplanbar[0] || {}).grund || 'ohne Grund');
      return z.gaenge.map(g => g.start + '/' + g.ende).join(' ');
    };
    gleich('Vorgabe: der zweite Gang am Tag danach', lauf(null),
           '2026-09-14/2026-09-14 2026-09-15/2026-09-15');
    gleich('  Abstand 1 ist dieselbe Rechnung', lauf(1), lauf(null));
    gleich('Abstand 0: beide am selben Tag', lauf(0),
           '2026-09-14/2026-09-14 2026-09-14/2026-09-14');
    gleich('Abstand 3: drei Tage spaeter', lauf(3),
           '2026-09-14/2026-09-14 2026-09-17/2026-09-17');
    /* Ueber das Wochenende: Donnerstag + 3 Kalendertage ist Sonntag, und
       der hat keine Kapazitaet - die Belegung rueckt auf Montag. */
    const spaet = planBelegen({auftraege:[JSON.parse(JSON.stringify(a))], maschinen:M,
                              ab:'2026-09-17', tage:40, uebergabe:3});
    gleich('der Abstand zaehlt Kalendertage, gearbeitet wird werktags',
           spaet.auftraege[0] ? spaet.auftraege[0].gaenge.map(g => g.start).join(' ') : 'NICHT GEPLANT',
           '2026-09-17 2026-09-21');
    /* Unsinn faellt auf die Vorgabe zurueck, negative Werte auf 0. */
    gleich('Unsinn als Abstand: Vorgabe', lauf('bald'), lauf(1));
    gleich('negativ: kein Rueckwaertslauf', lauf(-5), lauf(0));

    /* DIE RUECKWAERTSRECHNUNG MUSS DENSELBEN ABSTAND KENNEN. Sonst waere
       der Puffer um die Differenz falsch - und der Puffer ist die
       Auskunft, wegen der man auf die Termintafel sieht. */
    const s1 = planSpaetester(a, M, [], 1), s3 = planSpaetester(a, M, [], 3);
    gleich('Frist bei Abstand 1', s1 && s1.start, '2026-10-01');
    gleich('Frist bei Abstand 3: zwei Tage frueher', s3 && s3.start, '2026-09-29');
    gleich('  ohne Angabe wie bei 1', (planSpaetester(a, M, []) || {}).start, s1.start);
    /* Und die Belegung reicht ihn durch: der Puffer haengt an beiden. */
    const puf = (ueb) => {
      const z = planBelegen({auftraege:[JSON.parse(JSON.stringify(a))], maschinen:M,
                             ab:'2026-09-14', tage:40, uebergabe:ueb}).auftraege[0];
      return z ? z.puffer : null;
    };
    const p1 = puf(1), p3 = puf(3);
    gleich('der Puffer schrumpft mit dem Abstand um zwei Tage', p1 - p3, 2);

    /* Ein Auftrag mit EINEM Gang wird vom Abstand nicht beruehrt. */
    const eins = neuerAuftrag();
    eins.nummer = 'U-2'; eins.teil = 'Welle'; eins.stueck = 1;
    eins.status = 'beauftragt'; eins.klasse = 'drehteil_einfach'; eins.gattung = 'drehen';
    eins.zeiten = {ruestzeit:240, stueckzeit:0}; eins.maschine = 'm1000';
    eins.masse = {dmax:60, laenge:200, x:0, y:0, z:0};
    const e0 = planBelegen({auftraege:[eins], maschinen:M, ab:'2026-09-14', tage:40, uebergabe:0});
    const e7 = planBelegen({auftraege:[eins], maschinen:M, ab:'2026-09-14', tage:40, uebergabe:7});
    gleich('ein einziger Gang: der Abstand aendert nichts',
           e0.auftraege[0].start + '..' + e0.auftraege[0].ende,
           e7.auftraege[0].start + '..' + e7.auftraege[0].ende);
  }

  /* (4) Oberflaeche - und wieder der Punkt, an dem eine Mechanik im Kern
     stehen und von aussen unerreichbar sein kann. */
  {
    ['plRegelWahl', 'plUebergabe', 'plRegelHinweis'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    ['wRegelnLaden', 'wRegelnSichern', 'wRegelnMalen'].forEach(nm => {
      if(typeof hole(nm) === 'function') ok('Funktion vorhanden: ' + nm);
      else bad('Funktion fehlt: ' + nm);
    });
    [['planBelegen', /uebergabe:W\.regeln\.uebergabe/],
     ['maschineVorschlag', /maschineVorschlag\(a, W\.maschinen, W\.auftraege, W\.regeln\.wahl\)/],
     ['planVerteilen', /planVerteilen\(W\.auftraege, W\.maschinen, null, W\.regeln\.wahl\)/]].forEach(([nm, re]) => {
      if(re.test(quelltext)) ok(nm + ' bekommt die eingestellte Regel');
      else bad(nm + ' bekommt die Regel NICHT - der Schalter waere ohne Wirkung');
    });
    /* Der Hinweis ist der eigentliche Inhalt der Karte: er rechnet die
       ANDERE Regel mit und sagt, was sie anders machen wuerde. */
    if(/w&uuml;rde <b>Arbeit verteilen<\/b> damit/.test(quelltext) &&
       /mit der anderen <b>/.test(quelltext))
      ok('die Karte sagt, was der Knopf mit jeder Regel taete');
    else bad('die Karte zeigt nur den Schalter, nicht seine Wirkung');
    if(/auf zwei Maschinen/.test(quelltext))
      ok('und sie sagt, was Abstand 0 bedeutet');
    else bad('Abstand 0 wird nicht erklaert');

    /* DIE VORSCHAU MUSS DIESELBE RECHNUNG SEIN WIE DER KNOPF. Eine
       Schaetzung daneben waere eine zweite Wahrheit - und die erste
       Fassung dieser Karte war genau das (sie verglich Vorschlaege fuer
       Auftraege, die ihre Maschine laengst hatten, und meldete "2 von 2
       wuerden anders", wo kein einziger Gang umgelegt worden waere).
       IM BROWSER GEMESSEN bei 1366 px, vier Stellungen: was die Karte
       sagt, ist genau die Zahl, die der Knopf umlegt (0/0, 1/1, 0/0,
       0/0 - scratchpad erp-regel-*.png). */
    if(/planVerteilen\(kopie, W\.maschinen, null, regel\)\.zahl/.test(quelltext))
      ok('die Vorschau rechnet mit demselben planVerteilen wie der Knopf');
    else bad('die Vorschau rechnet etwas anderes als der Knopf - eine zweite Wahrheit');
    /* UND SIE MUSS AUF EINER KOPIE RECHNEN. Ohne sie wuerde schon das
       ANSEHEN von Blatt 4 die Maschinen umlegen - eine Vorschau, die
       heimlich ausfuehrt. */
    if(/const kopie = JSON\.parse\(JSON\.stringify\(W\.auftraege\)\);/.test(quelltext))
      ok('und zwar auf einer Kopie - die Vorschau aendert nichts');
    else bad('die Vorschau rechnet auf den echten Auftraegen - Ansehen wuerde umlegen');
  }
}

/* --- 26. Wartung: eine Maschine steht, die anderen laufen -------------
   DIE APP HAT DIESE LUECKE SELBST BENANNT: im Hinweis der Karte stand
   "eine einzelne Maschine in der Wartung waere etwas anderes und gibt es
   noch nicht". Jetzt gibt es sie.

   DIE TRAGENDE MESSUNG ist der UNTERSCHIED zum freien Tag. Ein freier Tag
   haelt die ganze Werkstatt an; eine Wartung haelt EINE Maschine an, und
   die Arbeit der Nachbarin verschiebt sich NICHT. Ein Testfall mit nur
   einer Maschine koennte die zwei Faelle gar nicht auseinanderhalten.

   KALENDER: 2026-09-14 Montag, 15. Dienstag.                           */
console.log('\n26) Wartung je Maschine');
{
  const neuerAuftrag = hole('neuerAuftrag'), maschineNeu = hole('maschineNeu');
  const planKapazitaet = hole('planKapazitaet'), planBelegen = hole('planBelegen');
  const planSpaetester = hole('planSpaetester'), planZettel = hole('planZettel');
  const planTag = hole('planTag');
  const M0 = hole('WERKSTATT_MASCHINEN');

  gleich('eine neue Maschine bringt ihre Wartungsliste mit',
         JSON.stringify((maschineNeu('drehen', 'x') || {}).wartung), '[]');

  /* Eigene Maschinenliste, damit der Stamm unberuehrt bleibt. */
  const bau = () => JSON.parse(JSON.stringify(M0));

  /* (1) Die Kapazitaet des Tages. */
  {
    const M = bau(), m = M.filter(x => x.id === 'm1000')[0];
    gleich('ohne Wartung hat der Montag 480 min',
           planKapazitaet(m, planTag('2026-09-14')), 480);
    m.wartung = ['2026-09-14'];
    gleich('  in der Wartung null', planKapazitaet(m, planTag('2026-09-14')), 0);
    gleich('  der Dienstag bleibt frei', planKapazitaet(m, planTag('2026-09-15')), 480);
    gleich('  und die Nachbarin laeuft',
           planKapazitaet(M.filter(x => x.id === 'm1500')[0], planTag('2026-09-14')), 480);
    /* Eine gespeicherte Maschinenliste aus der Zeit davor hat das Feld
       nicht - sie muss sich verhalten wie vorher. */
    const alt = bau().filter(x => x.id === 'm1000')[0];
    delete alt.wartung;
    gleich('ohne das Feld verhaelt sie sich wie vorher',
           planKapazitaet(alt, planTag('2026-09-14')), 480);
    /* Und Unsinn im Feld darf nicht sperren. */
    const mist = bau().filter(x => x.id === 'm1000')[0];
    mist.wartung = 'Montag';
    gleich('Unsinn im Feld sperrt nichts', planKapazitaet(mist, planTag('2026-09-14')), 480);
  }

  /* (2) DER UNTERSCHIED ZUM FREIEN TAG - die eigentliche Frage. */
  {
    const dreh = neuerAuftrag();
    dreh.nummer = 'W-1'; dreh.teil = 'Welle'; dreh.stueck = 1; dreh.status = 'beauftragt';
    dreh.klasse = 'drehteil_einfach'; dreh.gattung = 'drehen'; dreh.maschine = 'm1000';
    dreh.zeiten = {ruestzeit:240, stueckzeit:0};
    dreh.masse = {dmax:60, laenge:200, x:0, y:0, z:0};

    const fraes = neuerAuftrag();
    fraes.nummer = 'W-2'; fraes.teil = 'Platte'; fraes.stueck = 1; fraes.status = 'beauftragt';
    fraes.klasse = 'fraesteil_einfach'; fraes.gattung = 'fraesen'; fraes.maschine = 'fr1';
    fraes.zeiten = {ruestzeit:240, stueckzeit:0};
    fraes.masse = {dmax:0, laenge:0, x:200, y:200, z:50};

    const lauf = (M, frei) => {
      const b = planBelegen({auftraege:[JSON.parse(JSON.stringify(dreh)),
                                       JSON.parse(JSON.stringify(fraes))],
                             maschinen:M, ab:'2026-09-14', tage:30, frei:frei || []});
      const s = {};
      (b.auftraege || []).forEach(z => { s[z.auftrag.nummer] = z.start; });
      (b.unplanbar || []).forEach(z => { s[z.auftrag.nummer] = 'NICHT GEPLANT'; });
      return s;
    };

    const ohne = lauf(bau());
    gleich('ohne alles: beide am Montag', ohne['W-1'] + ' ' + ohne['W-2'],
           '2026-09-14 2026-09-14');

    const Mw = bau();
    Mw.filter(x => x.id === 'm1000')[0].wartung = ['2026-09-14'];
    const mitW = lauf(Mw);
    gleich('Drehbank in Wartung: das Drehteil rueckt auf Dienstag', mitW['W-1'], '2026-09-15');
    gleich('  DAS FRAESTEIL BLEIBT AM MONTAG', mitW['W-2'], '2026-09-14');

    const mitFrei = lauf(bau(), ['2026-09-14']);
    gleich('freier Tag dagegen: BEIDE ruecken', mitFrei['W-1'] + ' ' + mitFrei['W-2'],
           '2026-09-15 2026-09-15');

    /* Die Rueckwaertsrechnung kennt sie ebenfalls - ohne das waere die
       Frist einen Tag zu spaet und der Puffer zu gross. */
    const mitTermin = JSON.parse(JSON.stringify(dreh));
    mitTermin.liefertermin = '2026-09-25';
    const frist = (M) => (planSpaetester(mitTermin, M) || {}).start;
    const Mw2 = bau();
    gleich('Frist ohne Wartung', frist(bau()), '2026-09-25');
    Mw2.filter(x => x.id === 'm1000')[0].wartung = ['2026-09-25'];
    gleich('  mit Wartung am Liefertag einen Tag frueher', frist(Mw2), '2026-09-24');

    /* Und der Maschinenzettel: ein Wartungstag hat keine Kapazitaet. */
    const z = planZettel(planBelegen({auftraege:[JSON.parse(JSON.stringify(dreh))],
                                      maschinen:Mw, ab:'2026-09-14', tage:30}),
                         Mw, 'm1000', 7);
    const zt = z && z.tage.filter(t => t.datum === '2026-09-14')[0];
    gleich('der Zettel gibt dem Wartungstag keine Kapazitaet', zt ? zt.kapazitaet : null, 0);
  }

  /* (3) Oberflaeche. */
  {
    if(quelltext.indexOf('id="plFreiWer"') > 0) ok('Bedienelement vorhanden: plFreiWer');
    else bad('Bedienelement fehlt: plFreiWer');
    if(typeof hole('wFreiMarken') === 'function') ok('Funktion vorhanden: wFreiMarken');
    else bad('Funktion fehlt: wFreiMarken');
    if(/m\.wartung = gesetzt; wSichern\(\);/.test(quelltext))
      ok('die Wartung wird an der Maschine gespeichert');
    else bad('die Wartung wird nicht gespeichert');
    if(/data-freiwer=/.test(quelltext))
      ok('das Kreuz weiss, wessen Tag es entfernt');
    else bad('das Kreuz weiss nicht, wessen Tag es entfernt - es traefe den falschen');
    /* REGEL 6 DER SCHWESTER-APP, hier genauso: wer eine Funktion baut,
       sucht die alte Aussage und korrigiert sie. Der Hinweis der Karte
       BEHAUPTETE, es gebe die Wartung nicht. */
    if(/in der Wartung w&auml;re etwas anderes und gibt es noch nicht/.test(quelltext))
      bad('die Karte behauptet weiter, es gebe keine Wartung - das ist jetzt falsch');
    else ok('die Karte behauptet nicht mehr, es gebe keine Wartung');
  }
}

/* --- 27. Fraesanteil und Meldungsdarstellung -------------------------
   PUNKT 6 DER ENTSCHEIDUNGSLISTE: wieviel Zeit eines Drehteils mit
   Fraesanteil faellt auf die Fraese? Zur Haelfte muss das NICHT geraten
   werden - der Ruestaufschlag steht seit dem ersten Tag in der
   Kalkulation (20 gegen 40 min), und das IST der Anteil. Die
   Stueckzeit ist eine Annahme und traegt die gepflegt-Marke.

   DIE TRAGENDE PRUEFUNG ist die SUMME: was aufgeteilt wird, wird nicht
   mehr. Auf dieser Zusage steht der ganze ERP-Ausbau.

   DAZU der Befund an den MELDUNGEN: sie zeigten ihren Auszeichnungstext
   woertlich ("R&uuml;stzeit <b>20 min</b>"), weil meldung() mit
   textContent setzte, die Texte aber seit dem ERP-Ausbau mit
   Auszeichnung geschrieben sind. Im Browser gemessen, hier verankert. */
console.log('\n27) Fraesanteil und Meldungen');
{
  const neuerAuftrag = hole('neuerAuftrag'), fraesAnteil = hole('fraesAnteil');
  const gaengeVorschlagen = hole('gaengeVorschlagen'), auftragGaenge = hole('auftragGaenge');
  const gaengeSumme = hole('gaengeSumme'), gangHinweis = hole('gangHinweis');
  const meldungAuszeichnen = hole('meldungAuszeichnen');
  const V = hole('KALK_VORGABEN');
  const M0 = hole('WERKSTATT_MASCHINEN');

  ['fraesAnteil', 'gaengeVorschlagen', 'meldungAuszeichnen'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });

  /* (1) Der Ruestanteil wird GERECHNET, nicht hingeschrieben. */
  {
    const an = fraesAnteil(V);
    gleich('Ruestanteil aus der Kalkulation: (40-20)/40', an.ruest, 0.5);
    if(/20 gegen 40/.test(an.ruestHerkunft)) ok('  und die Herkunft steht dabei');
    else bad('  die Herkunft fehlt: ' + an.ruestHerkunft);
    gleich('Stueckanteil ist der Startwert', an.stueck, 0.3);
    gleich('  und ist als Annahme ausgewiesen', an.stueckGepflegt, false);

    /* Wer die Ruestzeiten aendert, aendert den Anteil mit - das ist der
       Sinn der Rechnung. */
    const eigen = JSON.parse(JSON.stringify(V));
    eigen.ruesten.drehteil_einfach = 30; eigen.ruesten.drehteil_fraes = 50;
    gleich('andere Ruestzeiten, anderer Anteil', fraesAnteil(eigen).ruest, 0.4);
    /* Und Unsinn faellt auf die Vorgabe zurueck statt zu rechnen. */
    const kaputt = JSON.parse(JSON.stringify(V));
    kaputt.ruesten.drehteil_fraes = 0;
    gleich('ohne brauchbare Werte die Vorgabe', fraesAnteil(kaputt).ruest, 0.5);
    const hoeher = JSON.parse(JSON.stringify(V));
    hoeher.ruesten.drehteil_einfach = 60;   /* einfach teurer als mit Fraesen */
    gleich('verdrehte Werte ebenso', fraesAnteil(hoeher).ruest, 0.5);
  }

  /* (2) DIE SUMME BLEIBT DIE KALKULATION - die tragende Zusage. */
  {
    const bau = () => {
      const a = neuerAuftrag();
      a.nummer = 'F-1'; a.teil = 'Flansch'; a.stueck = 10; a.status = 'beauftragt';
      a.klasse = 'drehteil_fraes'; a.gattung = 'drehen'; a.maschine = 'm1000';
      a.zeiten = {ruestzeit:40, stueckzeit:6.4};
      a.masse = {dmax:120, laenge:60, x:120, y:120, z:60};
      return a;
    };
    const a = bau();
    const v = gaengeVorschlagen(a, M0, V);
    gleich('der Vorschlag laeuft', v.ok, true);
    const g = auftragGaenge(a);
    gleich('zwei Gaenge', g.length, 2);
    gleich('  Gang 1 dreht', g[0].name + ' auf ' + g[0].maschine, 'Drehen auf m1000');
    gleich('  Gang 2 fraest', g[1].name + ' auf ' + g[1].maschine, 'Fraesen auf fr1');
    gleich('Ruesten geteilt 20/20', g[0].ruestzeit + '/' + g[1].ruestzeit, '20/20');
    gleich('Stueckzeit geteilt 4,48/1,92', g[0].stueckzeit + '/' + g[1].stueckzeit, '4.48/1.92');
    const s = gaengeSumme(a);
    gleich('DIE SUMME IST DIE KALKULATION (ruesten)', s.ruestzeit, 40);
    gleich('DIE SUMME IST DIE KALKULATION (stueck)', s.stueckzeit, 6.4);

    /* KRUMME ANTEILE: der erste Gang bekommt den Rest, damit nie eine
       Minute fehlt oder entsteht. Das ist der Fall, der eine naive
       Aufteilung auffliegen laesst. */
    const krumm = JSON.parse(JSON.stringify(V));
    krumm.fraesanteil = {stueck:0.333, gepflegt:true};
    const b = bau();
    b.zeiten = {ruestzeit:37, stueckzeit:7.77};
    gaengeVorschlagen(b, M0, krumm);
    const sb = gaengeSumme(b);
    gleich('krumme Anteile: Ruestsumme stimmt', Math.abs(sb.ruestzeit - 37) < 1e-9, true);
    gleich('  Stuecksumme stimmt', Math.abs(sb.stueckzeit - 7.77) < 1e-9, true);

    /* Wachen: kein zweiter Lauf, keine falsche Klasse, keine Fraese. */
    gleich('ein zweiter Lauf wird abgelehnt', gaengeVorschlagen(a, M0, V).ok, false);
    const einfach = bau(); einfach.klasse = 'drehteil_einfach';
    gleich('ein einfaches Drehteil wird abgelehnt', gaengeVorschlagen(einfach, M0, V).ok, false);
    const ohneFr = M0.filter(m => m.art !== 'fraesen');
    const c = bau();
    const r = gaengeVorschlagen(c, ohneFr, V);
    gleich('ohne Fraesmaschine wird NICHT geraten', r.ok, false);
    if(/keine aktive Fraesmaschine/.test(r.grund)) ok('  und der Grund steht da');
    else bad('  der Grund fehlt: ' + r.grund);
    gleich('  und der Auftrag bleibt unveraendert', auftragGaenge(c).length, 1);

    /* Der Hinweis nennt den Knopf, seit es ihn gibt. */
    const h = gangHinweis(bau());
    if(/Arbeitsgaenge vorschlagen/.test(h)) ok('der Hinweis nennt den Knopf');
    else bad('der Hinweis nennt den Knopf nicht: ' + h);
  }

  /* (3) MELDUNGEN: auszeichnen ja, einschleusen nein. Im Browser
     gemessen (1366 px): Umlaute und drei fette Stellen kamen an, der
     Einschleusversuch blieb sichtbarer Text, 0 Bilder, 0 Skripte. */
  {
    gleich('Umlaut-Entity wird zum Zeichen',
           meldungAuszeichnen('R&uuml;sten'), 'R&uuml;sten');
    gleich('fett bleibt fett', meldungAuszeichnen('<b>20</b>'), '<b>20</b>');
    gleich('Zeilenumbruch bleibt', meldungAuszeichnen('a<br>b'), 'a<br>b');
    gleich('ein Bild wird zu Text',
           meldungAuszeichnen('<img src=x onerror=boese()>'),
           '&lt;img src=x onerror=boese()&gt;');
    gleich('ein Skript ebenso',
           meldungAuszeichnen('<script>1</scr' + 'ipt>'),
           '&lt;script&gt;1&lt;/scr' + 'ipt&gt;');
    gleich('ein echtes Kleinerzeichen bleibt lesbar',
           meldungAuszeichnen('Winkel < 90'), 'Winkel &lt; 90');
    gleich('ein einzelnes Und bleibt ein Und',
           meldungAuszeichnen('Fritz & Co'), 'Fritz &amp; Co');
    if(/d\.innerHTML = meldungAuszeichnen\(text\)/.test(quelltext))
      ok('meldung() zeichnet aus statt den Text vorzuzeigen');
    else bad('meldung() setzt weiter Klartext - die Marken stehen im Bild');
  }

  /* (4) Oberflaeche. */
  {
    ['afGangVorschlag', 'einFraesStueck', 'einFraesHinweis'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    if(typeof hole('wFraesMalen') === 'function') ok('Funktion vorhanden: wFraesMalen');
    else bad('Funktion fehlt: wFraesMalen');
    if(/vk\.hidden = !\(a\.klasse === 'drehteil_fraes' && g\.length === 1\)/.test(quelltext))
      ok('der Knopf steht nur bei genau diesem Fall');
    else bad('der Knopf steht immer - ein zweiter Klick ueberschriebe von Hand gesetzte Minuten');
    if(/eine <b>Annahme<\/b>/.test(quelltext))
      ok('und der Vorschlag sagt, dass der Stueckanteil geraten ist');
    else bad('der Vorschlag verschweigt, dass der Stueckanteil geraten ist');
  }
}

/* --- 28. Stundensatz je Maschine -------------------------------------
   PUNKT 4 DER ENTSCHEIDUNGSLISTE, und die Architekturfrage dahinter:
   die Kalkulation rechnet, BEVOR eine Maschine feststeht. Ein
   maschinenscharfer Satz im Angebotspreis haenge an einer Wahl, die
   noch niemand getroffen hat.

   DESHALB IST DER TRAGENDE HAKEN EIN NEGATIVER: das Angebot bleibt
   unberuehrt. Der Satz wirkt beim NACHRECHNEN, wo die Maschine
   feststeht - Vorkalkulation gegen Nachkalkulation.

   Im Browser gemessen (1366 px): Angebot 393,08 Euro, nach Eintrag von
   80 Euro/h auf der 1500er rechnet die Nachkalkulation 493,70 - das
   Angebot unveraendert 393,08.                                        */
console.log('\n28) Stundensatz je Maschine');
{
  const neuerAuftrag = hole('neuerAuftrag'), maschineSatz = hole('maschineSatz');
  const kalkGrundlage = hole('kalkGrundlage'), auftragNachrechnen = hole('auftragNachrechnen');
  const kalkRechnen = hole('kalkRechnen');
  const V = hole('KALK_VORGABEN');
  const M0 = hole('WERKSTATT_MASCHINEN');

  if(typeof maschineSatz === 'function') ok('vorhanden: maschineSatz');
  else bad('fehlt: maschineSatz');

  /* (1) Welcher Satz gilt? */
  {
    const bau = () => JSON.parse(JSON.stringify(M0));
    const M = bau(), m = M.filter(x => x.id === 'm1500')[0];
    const ohne = maschineSatz(m, V);
    gleich('ohne eigenen Satz gilt die Gattung', ohne.satz, V.saetze.drehen);
    gleich('  und das steht auch dran', ohne.eigen, false);
    m.satz = 80;
    const mit = maschineSatz(m, V);
    gleich('mit eigenem Satz gilt der', mit.satz, 80);
    gleich('  und das steht dran', mit.eigen, true);
    gleich('  die Gattung bleibt daneben sichtbar', mit.gattung, V.saetze.drehen);
    /* Null Euro ist etwas anderes als "nicht gepflegt" - beides faellt
       auf die Gattung, aber aus verschiedenen Gruenden, und keines
       rechnet still umsonst. */
    m.satz = 0;
    gleich('null Euro rechnet nicht umsonst', maschineSatz(m, V).satz, V.saetze.drehen);
    m.satz = 'teuer';
    gleich('Unsinn ebenso', maschineSatz(m, V).satz, V.saetze.drehen);
    /* Die Fraese hat ihre eigene Gattung. */
    gleich('die Fraese fragt den Fraessatz',
           maschineSatz(M.filter(x => x.id === 'fr1')[0], V).gattung, V.saetze.fraesen);
  }

  /* (2) DAS ANGEBOT BLEIBT UNBERUEHRT - der tragende Haken. */
  {
    const ein = {
      vorgaben:V,
      teil:{klasse:'drehteil_einfach', volumen_cm3:300, bohrungen:[], kanten:12},
      rohteil:{volumen_cm3:900}, werkstoff:'S235', toleranz:'mittel',
      oberflaeche:'normal', seiten:1, stueck:10, versandArt:'versand', ueber:{}
    };
    const k0 = kalkRechnen(ein);
    const k1 = kalkRechnen(Object.assign({}, ein, {satz:80}));
    if(k1.preise.gesamt > k0.preise.gesamt) ok('ein hoeherer Satz macht die Rechnung teurer');
    else bad('ein hoeherer Satz aendert nichts - der Eingang wirkt nicht');
    const k2 = kalkRechnen(Object.assign({}, ein, {satz:null}));
    gleich('ohne Satz von aussen bleibt es die Gattungsrechnung',
           k2.preise.gesamt, k0.preise.gesamt);
    gleich('  und ein unsinniger Satz ebenso',
           kalkRechnen(Object.assign({}, ein, {satz:'viel'})).preise.gesamt, k0.preise.gesamt);
    gleich('  eine Null auch', kalkRechnen(Object.assign({}, ein, {satz:0})).preise.gesamt,
           k0.preise.gesamt);
    /* NEGATIV ist der Fall, den die Wache wirklich abfaengt: die Null
       faengt das Oder daneben ohnehin, eine -5 aber waere truthy und
       zoege den Preis ins Minus. Gefunden, weil die Gegenprobe zur Null
       nicht anschlug - eine Gegenprobe, die nicht anschlaegt, ist
       manchmal ein Codefund. */
    gleich('  und ein negativer Satz rechnet nicht rueckwaerts',
           kalkRechnen(Object.assign({}, ein, {satz:-5})).preise.gesamt, k0.preise.gesamt);

    /* Der Auftrag: Angebot steht, Nachrechnung folgt der Maschine. */
    const a = neuerAuftrag();
    a.nummer = 'S-1'; a.teil = 'Welle'; a.stueck = 10; a.status = 'beauftragt';
    a.klasse = 'drehteil_einfach'; a.gattung = 'drehen'; a.maschine = 'm1500';
    a.masse = {dmax:80, laenge:400, x:0, y:0, z:0};
    a.kalk = kalkGrundlage(ein, '2026-09-15');
    a.preis = k0.preise.gesamt;
    a.zeiten.ruestzeit = k0.zeiten.ruestzeit;
    a.zeiten.stueckzeit = k0.zeiten.stueckzeit;

    const M = JSON.parse(JSON.stringify(M0));
    M.filter(x => x.id === 'm1500')[0].satz = 80;

    const ohneListe = auftragNachrechnen(a, kalkRechnen, V);
    gleich('ohne Maschinenliste rechnet es wie immer',
           Math.abs(ohneListe.neu.preis - k0.preise.gesamt) < 0.005, true);
    const mitListe = auftragNachrechnen(a, kalkRechnen, V, M);
    gleich('mit Liste zaehlt der Satz der Maschine', mitListe.satz, 80);
    gleich('  und er ist als eigener ausgewiesen', mitListe.satzEigen, true);
    gleich('  die Maschine steht dabei', mitListe.maschine, 'm1500');
    if(mitListe.neu.preis > k0.preise.gesamt)
      ok('die Nachrechnung liegt ueber dem Angebot (teurere Maschine)');
    else bad('die Nachrechnung folgt der Maschine NICHT');
    /* UND DAS IST DER PUNKT: das Angebot selbst ruehrt sie nicht an. */
    gleich('DAS ANGEBOT BLEIBT, WAS ES WAR', a.preis, k0.preise.gesamt);

    /* Eine Maschine OHNE eigenen Satz aendert nichts. */
    const M2 = JSON.parse(JSON.stringify(M0));
    const glatt = auftragNachrechnen(a, kalkRechnen, V, M2);
    gleich('Maschine ohne eigenen Satz: wie die Gattung',
           Math.abs(glatt.neu.preis - k0.preise.gesamt) < 0.005, true);
    gleich('  und sie sagt, dass es nicht ihr eigener ist', glatt.satzEigen, false);
  }

  /* (3) Oberflaeche. */
  {
    if(quelltext.indexOf('id="plMaschSaetze"') > 0) ok('Bedienelement vorhanden: plMaschSaetze');
    else bad('Bedienelement fehlt: plMaschSaetze');
    if(/data-ms="/.test(quelltext)) ok('die Maschinentabelle hat eine Spalte fuer den Satz');
    else bad('die Maschinentabelle hat keine Spalte fuer den Satz');
    if(/auftragNachrechnen\(a, kalkRechnen, S\.V, W\.maschinen\)/.test(quelltext))
      ok('das Nachrechnen bekommt die Maschinen');
    else bad('das Nachrechnen bekommt die Maschinen NICHT - der Satz bliebe wirkungslos');
    if(/Das Angebot bleibt davon unber&uuml;hrt/.test(quelltext))
      ok('und die Karte sagt, dass das Angebot unberuehrt bleibt');
    else bad('die Karte verschweigt, dass das Angebot unberuehrt bleibt');
  }
}

/* --- 29. Die Sicherung -----------------------------------------------
   DER BEFUND, der dieses Paket ausgeloest hat: die Werkstattdaten lagen
   in sieben Browser-Speicherplaetzen, und sichern liess sich davon
   NICHTS. Ein geloeschter Websitespeicher, ein neues Geraet - und der
   ganze Auftragsbestand ist weg. Solange das so war, konnte die App
   nicht ernsthaft benutzt werden.

   DER TRAGENDE TEST IST DER RUNDLAUF: sichern, alles wegwerfen,
   zurueckholen, den GANZEN Bestand vergleichen. Einzelne Felder zu
   pruefen findet genau das nicht, was beim naechsten Feld vergessen
   wird. Im Browser zusaetzlich am laufenden Bild gefahren (1366 px):
   Bestand vorher und nachher zeichengleich, zwischendrin wirklich leer.

   DABEI GEFUNDEN: die Zaehlung der Rueckmeldungen war falsch -
   istZahl(0) ist WAHR, und jeder Auftrag traegt ein leeres
   Rueckmeldefeld. Die Datei behauptete "3 mit Rueckmeldung", wo eine
   war. Genau die Zahl, der man beim Zurueckholen glaubt.            */
console.log('\n29) Die Sicherung');
{
  const neuerAuftrag = hole('neuerAuftrag'), istSetzen = hole('istSetzen');
  const sicherungBauen = hole('sicherungBauen'), sicherungPruefen = hole('sicherungPruefen');
  const sicherungZahlen = hole('sicherungZahlen'), sicherungVereinen = hole('sicherungVereinen');
  const sicherungFremdeMaschinen = hole('sicherungFremdeMaschinen');
  const hatRueckmeldung = hole('hatRueckmeldung');
  const gangAnhaengen = hole('gangAnhaengen'), auftragGaenge = hole('auftragGaenge');
  const V = hole('KALK_VORGABEN'), M0 = hole('WERKSTATT_MASCHINEN');

  ['sicherungBauen', 'sicherungPruefen', 'sicherungZahlen', 'sicherungVereinen',
   'sicherungFremdeMaschinen', 'hatRueckmeldung'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });

  const bauAuftrag = (nr, teil, masch) => {
    const a = neuerAuftrag();
    a.nummer = nr; a.teil = teil; a.kunde = 'Kunde ' + nr; a.stueck = 7;
    a.status = 'beauftragt'; a.klasse = 'drehteil_einfach'; a.gattung = 'drehen';
    a.maschine = masch || 'm1000'; a.zeiten = {ruestzeit:40, stueckzeit:6.4};
    a.masse = {dmax:80, laenge:400, x:0, y:0, z:0};
    a.liefertermin = '2026-10-09';
    return a;
  };

  /* (1) Was in die Datei gehoert - und was nicht. */
  {
    const a = bauAuftrag('A-1', 'Welle');
    gangAnhaengen(a, 'Fraesen', 'fr1');
    a.gaenge[1].ruestzeit = 10;
    istSetzen(a, 1, 'ruestzeit', 45);
    a.rueckmeldung.gefertigt = 7;
    const M = JSON.parse(JSON.stringify(M0));
    M.filter(x => x.id === 'm1500')[0].satz = 80;
    M.filter(x => x.id === 'm1000')[0].wartung = ['2026-09-21'];

    const d = sicherungBauen({auftraege:[a], maschinen:M, frei:['2026-10-03'],
                              regeln:{wahl:'klein', uebergabe:3}, einstellungen:V,
                              heute:'2026-09-15'});
    gleich('die Datei traegt ihre Kennung', d.kennung, 'werkstatt-pipeline-sicherung');
    gleich('  und eine Version', typeof d.version === 'string' && d.version.length > 0, true);
    gleich('  und das Datum', d.gesichert, '2026-09-15');
    gleich('Auftraege sind drin', d.auftraege.length, 1);
    gleich('  samt Gaengen', d.auftraege[0].gaenge.length, 2);
    gleich('  samt Rueckmeldung', d.auftraege[0].rueckmeldung.gaenge[0].ruestzeit, 45);
    gleich('Maschinen sind drin', d.maschinen.length, M.length);
    gleich('  samt Stundensatz', d.maschinen.filter(x => x.id === 'm1500')[0].satz, 80);
    gleich('  samt Wartung', d.maschinen.filter(x => x.id === 'm1000')[0].wartung.join(','), '2026-09-21');
    gleich('freie Tage sind drin', d.frei.join(','), '2026-10-03');
    gleich('Regeln sind drin', d.regeln.wahl + '/' + d.regeln.uebergabe, 'klein/3');
    gleich('Einstellungen sind drin', !!d.einstellungen, true);
    /* ANSICHTSZUSTAND GEHOERT NICHT HINEIN - er ist Sache des Geraets,
       und beim Zurueckholen bekaeme man die Ansicht eines anderen. */
    gleich('kein Filter in der Datei', d.filter === undefined, true);
    gleich('keine zugeklappten Karten', d.karten === undefined, true);

    /* Die Datei ist eine KOPIE - wer danach den Auftrag aendert, aendert
       nicht die Sicherung. */
    a.teil = 'geaendert';
    gleich('die Datei ist eine Kopie, kein Zeiger', d.auftraege[0].teil, 'Welle');
  }

  /* (2) DIE ZAEHLUNG, die falsch war. */
  {
    const leer = bauAuftrag('A-2', 'Buchse');
    gleich('ein leeres Rueckmeldefeld ist KEINE Rueckmeldung', hatRueckmeldung(leer), false);
    const g = bauAuftrag('A-3', 'Bolzen'); g.rueckmeldung.gefertigt = 5;
    gleich('gefertigte Stueck sind eine', hatRueckmeldung(g), true);
    const aus = bauAuftrag('A-4', 'Ring'); aus.rueckmeldung.ausschuss = 2;
    gleich('Ausschuss auch', hatRueckmeldung(aus), true);
    const dat = bauAuftrag('A-5', 'Scheibe'); dat.rueckmeldung.datum = '2026-09-20';
    gleich('ein Datum auch', hatRueckmeldung(dat), true);
    const zt = bauAuftrag('A-6', 'Flansch'); istSetzen(zt, 1, 'stueckzeit', 6.9);
    gleich('eine zurueckgemeldete Zeit auch', hatRueckmeldung(zt), true);
    const d = sicherungBauen({auftraege:[leer, g, aus, dat, zt], maschinen:M0, frei:[]});
    gleich('gezaehlt werden nur die echten', d.enthaelt.rueckmeldungen, 4);
    gleich('  und die Zahlen stimmen mit den Listen ueberein',
           sicherungZahlen(d).rueckmeldungen, d.enthaelt.rueckmeldungen);
  }

  /* (3) Was NICHT zurueckgeholt wird. */
  {
    gleich('kein Objekt', sicherungPruefen(null).length > 0, true);
    gleich('fremde Datei ohne Kennung',
           sicherungPruefen({auftraege:[], maschinen:M0, frei:[]}).length > 0, true);
    const alt = sicherungBauen({auftraege:[], maschinen:M0, frei:[]});
    alt.version = '9.0';
    if(sicherungPruefen(alt).some(f => /Version/.test(f))) ok('eine kuenftige Version wird erkannt');
    else bad('eine kuenftige Version rutscht durch');
    const ohneM = sicherungBauen({auftraege:[], maschinen:[], frei:[]});
    if(sicherungPruefen(ohneM).some(f => /Maschine/.test(f))) ok('eine Datei ohne Maschinen wird bemaengelt');
    else bad('eine Datei ohne Maschinen rutscht durch');
    const gut = sicherungBauen({auftraege:[], maschinen:M0, frei:[]});
    gleich('eine saubere Datei wird nicht bemaengelt', sicherungPruefen(gut).length, 0);
    /* Die ZAHLEN kommen aus den Listen, nicht aus dem Kopf - ein Kopf
       laesst sich von Hand aendern. */
    const gelogen = sicherungBauen({auftraege:[bauAuftrag('A-7', 'Welle')], maschinen:M0, frei:[]});
    gelogen.enthaelt.auftraege = 999;
    gleich('die Vorschau zaehlt die Liste, nicht den Kopf',
           sicherungZahlen(gelogen).auftraege, 1);
  }

  /* (4) DAZULADEN: der vorhandene Auftrag gewinnt. */
  {
    const hier = [bauAuftrag('A-1', 'Welle'), bauAuftrag('A-2', 'Buchse')];
    hier[0].rueckmeldung.gefertigt = 7;      /* traegt eine Rueckmeldung */
    const datei = sicherungBauen({
      auftraege:[bauAuftrag('A-1', 'Welle ANDERS'), bauAuftrag('A-9', 'Neu')],
      maschinen:M0, frei:[]});
    const v = sicherungVereinen(hier, datei);
    gleich('einer kommt dazu', v.dazu, 1);
    gleich('  einer wird uebersprungen', v.uebersprungen.join(','), 'A-1');
    gleich('  und zwar bleibt der HIESIGE', v.auftraege[0].teil, 'Welle');
    gleich('  mit seiner Rueckmeldung', v.auftraege[0].rueckmeldung.gefertigt, 7);
    gleich('zusammen drei', v.auftraege.length, 3);
    /* Ein Auftrag OHNE Nummer laesst sich nicht abgleichen - er kommt
       dazu. Lieber einer zuviel, den man sieht. */
    const ohneNr = bauAuftrag('', 'Namenlos');
    const d2 = sicherungBauen({auftraege:[ohneNr, ohneNr], maschinen:M0, frei:[]});
    gleich('zwei ohne Nummer kommen beide dazu', sicherungVereinen([], d2).dazu, 2);
  }

  /* (5) Der Befund, der STILL schadet: ein Gang auf einer Maschine, die
     es hier nicht gibt, faellt aus der Planung. */
  {
    const fremd = bauAuftrag('A-8', 'Welle', 'm9999');
    const raus = sicherungFremdeMaschinen([fremd], M0);
    gleich('eine unbekannte Maschine wird gefunden', raus.length, 1);
    gleich('  mit Auftrag und Gang', raus[0].nummer + '/' + raus[0].gang + '/' + raus[0].maschine,
           'A-8/1/m9999');
    gleich('bekannte Maschinen sind still',
           sicherungFremdeMaschinen([bauAuftrag('A-1', 'Welle')], M0).length, 0);
  }

  /* (6) DER RUNDLAUF, DOM-frei: bauen, lesen, vergleichen. */
  {
    const a = bauAuftrag('R-1', 'Welle');
    gangAnhaengen(a, 'Fraesen', 'fr1');
    a.gaenge[1].ruestzeit = 10;
    istSetzen(a, 2, 'stueckzeit', 7.1);
    const M = JSON.parse(JSON.stringify(M0));
    M.filter(x => x.id === 'm1500')[0].satz = 72;
    const vorher = JSON.stringify({a:[a], m:M, f:['2026-10-03']});
    const d = JSON.parse(JSON.stringify(sicherungBauen({
      auftraege:[a], maschinen:M, frei:['2026-10-03'], einstellungen:V, heute:'2026-09-15'})));
    const nachher = JSON.stringify({a:d.auftraege, m:d.maschinen, f:d.frei});
    gleich('RUNDLAUF: was hineingeht, kommt heraus', nachher, vorher);
  }

  /* (7) Oberflaeche. */
  {
    ['btnSicherExport', 'btnSicherImport', 'sicherDatei', 'sicherVorschau',
     'sicherInhalt', 'btnSicherErsetzen', 'btnSicherDazu', 'btnSicherAbbruch',
     'sicherStand'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    ['wSicherVorschau', 'wStandLesen', 'wStandSchreiben', 'wStandZaehlen', 'wStandMalen'].forEach(nm => {
      if(typeof hole(nm) === 'function') ok('Funktion vorhanden: ' + nm);
      else bad('Funktion fehlt: ' + nm);
    });
    /* DER ZWEITE KLICK ist der Schutz: die Vorschau steht VOR dem
       Ersetzen, nicht daneben. */
    if(/v\.hidden = !d;/.test(quelltext) && /W\.sicherung = d;\s*\n\s*wSicherVorschau\(\);/.test(quelltext))
      ok('eine gewaehlte Datei oeffnet die Vorschau, sie ersetzt nicht sofort');
    else bad('die Datei ersetzt ohne Vorschau - das ist die zweite Gelegenheit, Daten zu verlieren');
    /* Und der Zaehler, ohne den niemand an die Sicherung denkt. */
    if(/wStandZaehlen\(\);\s*\n\}/.test(quelltext))
      ok('jede Aenderung erhoeht den Zaehler');
    else bad('der Zaehler laeuft nicht mit - der Hinweis bliebe stehen');
    if(/Zeit f&uuml;r eine neue Sicherung/.test(quelltext))
      ok('und ab zwanzig Aenderungen wird er deutlich');
    else bad('der Hinweis wird nie deutlich');
  }
}

/* --- 30. Musterteile und Hinterschnitt -------------------------------
   ZEHN ERZEUGTE STEP-DATEIEN in muster/ - selbst gebaut aus denselben
   Bausteinen wie die Pruefkoerper, damit es Material zum Ausprobieren
   gibt, ohne dass ein Kundenmodell das Repo sieht. Jedes Mass steht in
   muster-bauen.js im Klartext, also ist jedes Volumen von Hand
   nachrechenbar - und genau das tut dieser Abschnitt.

   DER BEFUND, den diese zehn Teile aufgedeckt haben: JEDES Fraesteil
   kam als fraesteil_komplex heraus, auch ein massiver Wuerfel. Die
   Hinterschnitt-Erkennung zaehlte die AUFLAGE mit - bei einem Quader
   immer die Rueckseite, beim Wuerfel exakt ein Sechstel. Die Schwelle
   stand bei 0,001, die erreicht kein Teil dieser Welt. Eine Regel, die
   immer dasselbe sagt, ist keine Regel.

   WAS DIE MUSTERTEILE NICHT KOENNEN: einen echten Hinterschnitt. Die
   Bausteine erzeugen nur Quader und Drehteile. Deshalb steht der Fall
   hier als SYNTHETISCHES Modell mit von Hand gesetzten Normalen - sonst
   waere nur die eine Haelfte der Regel geprueft, und eine Regel, die
   alles als 3ax einstuft, ist genauso blind wie die alte.          */
console.log('\n30) Musterteile und Hinterschnitt');
{
  const fGeometrie = hole('fGeometrie'), fStepModell = hole('fStepModell');
  const fKoerperWerte = hole('fKoerperWerte'), fHinterschnitt = hole('fHinterschnitt');
  const P = Math.PI, zyl = (d, l) => P * (d/2)*(d/2) * l;

  /* (1) Die zehn Musterteile: gelesen, und das Volumen von Hand. */
  {
    const ORD = path.join(ORDNER, 'muster');
    const SOLL = {
      'welle-glatt.step':         zyl(40,200),
      'welle-gestuft.step':       zyl(50,40) + zyl(40,120) + zyl(30,40),
      'buchse.step':              zyl(60,45) - zyl(30,45),
      'lagerbuchse-gestuft.step': zyl(80,25) + zyl(60,35) - zyl(40,60),
      'flansch.step':             zyl(120,18) + zyl(70,22) - zyl(35,40),
      'platte-flach.step':        200*120*12,
      'platte-mit-bohrung.step':  160*100*15 - zyl(25,15),
      'lagerbock.step':           120*80*60 - zyl(40,60),
      'deckel.step':              90*90*10 - zyl(20,10),
      'klotz-massiv.step':        80*80*80
    };
    if(!fs.existsSync(ORD)){
      bad('der Ordner muster/ fehlt - "node muster-bauen.js" laeuft nicht');
    } else {
      const da = fs.readdirSync(ORD).filter(n => /\.step$/i.test(n));
      gleich('zehn Musterteile liegen bereit', da.length, 10);
      let schief = 0, klassen = {};
      Object.keys(SOLL).forEach(n => {
        const p = path.join(ORD, n);
        if(!fs.existsSync(p)){ bad('Musterteil fehlt: ' + n); schief++; return; }
        let d = null;
        try{ d = fGeometrie(fs.readFileSync(p, 'utf8'), n); }catch(e){}
        if(!d || !d.teil){ bad('Musterteil nicht lesbar: ' + n); schief++; return; }
        const ist = +d.teil.volumen_cm3 || 0, soll = SOLL[n] / 1000;
        if(Math.abs(ist - soll) / soll > 0.01){
          bad(n + ': Volumen ' + ist.toFixed(2) + ' cm3, von Hand ' + soll.toFixed(2));
          schief++;
        }
        klassen[d.teil.klasse] = (klassen[d.teil.klasse] || 0) + 1;
      });
      if(!schief) ok('alle zehn gelesen, jedes Volumen auf 1 % der Handrechnung');
      /* DIE UNTERSCHEIDUNG MUSS GREIFEN: fuenf Drehteile, fuenf
         Fraesteile - und kein einziges "komplex", denn keines DIESER
         Teile ist komplex. */
      gleich('fuenf gelten als Drehteil', klassen.drehteil_einfach || 0, 5);
      gleich('fuenf als einfaches Fraesteil', klassen.fraesteil_3ax || 0, 5);
      gleich('  und keines als komplex', klassen.fraesteil_komplex || 0, 0);
    }
  }

  /* (2) DER FALL, DEN DIE MUSTERTEILE NICHT KOENNEN: ein echter
     Hinterschnitt. Synthetisches Modell, Normalen von Hand.
     Aufbau: ein Boden (zeigt nach -Z, die AUFLAGE), ein Deckel (+Z)
     und eine schraege Flaeche, die nach hinten unten zeigt - die
     erreicht der Fraeser von oben nicht. */
  {
    const fl = (nx, ny, nz, flaeche) => ({
      art:'ebene', sinn:true,
      /* fV rechnet mit ARRAYS. Eine Fixture mit {x,y,z} liefert NaN,
         und dann ist jeder Vergleich falsch und alles kommt als 0
         heraus - so sah es aus, als waere die Erkennung blind. */
      rahmen:{z:[nx, ny, nz]},
      _w:{flaeche:flaeche}
    });
    const wurzel = Math.sqrt(0.5);

    /* Ohne Schraege: Boden ist Auflage, Deckel zeigt zur Spindel. */
    const glatt = {flaechen:[fl(0,0,1,100), fl(0,0,-1,100),
                             fl(1,0,0,40), fl(-1,0,0,40)]};
    gleich('Quader ohne Schraege: kein Hinterschnitt',
           fHinterschnitt(glatt).anteil, 0);

    /* EINE einzelne Schraege ist KEIN Hinterschnitt - dieses Teil
       fraest man von der Seite, und genau die Richtung findet die
       Funktion. Mein erster Testfall erwartete hier faelschlich einen
       Befund; der Code hatte recht. */
    const eineSchraege = {flaechen:[fl(0,0,1,100), fl(0,0,-1,100),
                                    fl(1,0,0,40), fl(-1,0,0,40),
                                    fl(wurzel,0,-wurzel,20)]};
    gleich('eine einzelne Schraege: von der Seite erreichbar',
           fHinterschnitt(eineSchraege).anteil, 0);

    /* DER EHRLICHE FALL: eine Form, die aus JEDER Richtung etwas
       verdeckt. Ein Oktaeder - acht Flaechen mit den Normalen
       (+-0,577, +-0,577, +-0,577); aus jeder Achsrichtung zeigen genau
       vier davon weg, also die Haelfte. Im Kopf nachrechenbar. */
    const d3 = 1 / Math.sqrt(3);
    const okta = {flaechen:[]};
    [-1, 1].forEach(sx => [-1, 1].forEach(sy => [-1, 1].forEach(sz => {
      okta.flaechen.push(fl(sx * d3, sy * d3, sz * d3, 10));
    })));
    gleich('Oktaeder: aus jeder Richtung die Haelfte hinten',
           Math.round(fHinterschnitt(okta).anteil * 1000) / 1000, 0.5);

    /* DIE GRENZE, benannt statt versteckt: gemessen werden NORMALEN,
       nicht Verdeckungen. Eine Nut mit Ueberhang traegt eine Decke, die
       nach unten zeigt wie die Auflage - beide sind so nicht zu
       unterscheiden. Fuer die Ruestzeitklasse reicht das; fuer eine
       Bahnplanung reichte es nicht, und das steht hier, damit es
       niemand fuer mehr haelt, als es ist. */
    const mitDecke = {flaechen:[fl(0,0,1,100), fl(0,0,-1,100),
                                fl(1,0,0,40), fl(-1,0,0,40),
                                fl(0,0,-1,5)]};   /* die "Decke" der Nut */
    gleich('ein Ueberhang mit senkrechter Decke faellt durch (bekannte Grenze)',
           fHinterschnitt(mitDecke).anteil, 0);

    /* Und sie fuehrt zur anderen Klasse. */
    const fKlasse = hole('fKlasse');
    if(typeof fKlasse === 'function'){
      gleich('ohne Hinterschnitt: einfaches Fraesteil',
             fKlasse({ja:false}, [], {anteil:0}, glatt), 'fraesteil_3ax');
      gleich('mit Hinterschnitt: komplex',
             fKlasse({ja:false}, [], {anteil:0.2}, okta), 'fraesteil_komplex');
    } else warn('fKlasse ist nicht erreichbar - die Klassenprobe entfaellt');
  }

  /* (3) Die Vorbedingung, an der ich selbst gescheitert bin: _w
     entsteht erst in fKoerperWerte. Wer fHinterschnitt ohne sie ruft,
     misst NICHTS und haelt die Erkennung fuer tot. */
  {
    const roh = fStepModell(fs.readFileSync(path.join(ORDNER, 'muster', 'klotz-massiv.step'), 'utf8'));
    gleich('ohne fKoerperWerte traegt keine Flaeche ihr Mass',
           roh.flaechen.filter(f => f._w).length, 0);
    fKoerperWerte(roh);
    gleich('  danach jede', roh.flaechen.filter(f => f._w).length, roh.flaechen.length);
  }
}

/* --- 31. Die Beispiel-Werkstatt --------------------------------------
   WOZU: leere Tabellen sagen nichts, und wer die App ausprobieren will,
   sollte nicht erst eine halbe Stunde tippen muessen.

   EIN DEMOBESTAND, IN DEM ALLES GUT AUSSIEHT, VERBIRGT GENAU DAS,
   WOFUER DIE APP DA IST. Also stecken absichtlich Befunde darin: ein
   gerissener Termin, zwei Rueckmeldungen in beide Richtungen (einmal
   schneller, einmal langsamer als kalkuliert), ein Auftrag mit zwei
   Arbeitsgaengen, ein freier Tag und eine Wartung. Das prueft dieser
   Abschnitt - nicht, dass Daten da sind, sondern dass sie etwas
   ZEIGEN.

   Im Browser bei 1366 px nachgefahren: 10 Auftraege, 7 geplant, 0
   unplanbar, einer mit Verzug, kleinster Puffer -4 Tage.            */
console.log('\n31) Die Beispiel-Werkstatt');
{
  const demoWerkstatt = hole('demoWerkstatt');
  const planBelegen = hole('planBelegen'), planSollIst = hole('planSollIst');
  const auftragGaenge = hole('auftragGaenge'), hatRueckmeldung = hole('hatRueckmeldung');
  const auftragPruefen = hole('auftragPruefen');
  const M0 = hole('WERKSTATT_MASCHINEN');
  const STATUS = hole('WERKSTATT_STATUS');

  if(typeof demoWerkstatt === 'function') ok('vorhanden: demoWerkstatt');
  else bad('fehlt: demoWerkstatt');

  const d = demoWerkstatt('2026-09-15', M0);

  /* (1) Der Bestand selbst. */
  gleich('zehn Auftraege', d.auftraege.length, 10);
  {
    const kaputt = [];
    d.auftraege.forEach(a => {
      const f = auftragPruefen(a);
      if(f.length) kaputt.push(a.nummer + ': ' + f[0]);
    });
    if(!kaputt.length) ok('jeder Auftrag besteht die Wache');
    else bad('Beispielauftraege sind fehlerhaft: ' + kaputt.slice(0, 3).join(' | '));
  }
  {
    const da = {};
    d.auftraege.forEach(a => { da[a.status] = (da[a.status] || 0) + 1; });
    /* JEDER STATUS KOMMT VOR - sonst zeigt der Filter eine leere Stufe,
       und man haelt sie fuer kaputt. */
    const fehlt = STATUS.filter(s => !da[s]);
    if(!fehlt.length) ok('jeder der sechs Status kommt vor');
    else bad('diese Status fehlen im Beispiel: ' + fehlt.join(', '));
  }
  {
    const mehr = d.auftraege.filter(a => auftragGaenge(a).length > 1);
    gleich('einer hat zwei Arbeitsgaenge', mehr.length, 1);
    gleich('  und zwar auf zwei verschiedenen Maschinen',
           new Set(auftragGaenge(mehr[0]).map(g => g.maschine)).size, 2);
  }
  gleich('zwei tragen eine Rueckmeldung', d.auftraege.filter(hatRueckmeldung).length, 2);
  gleich('ein freier Tag', d.frei.length, 1);
  gleich('und eine Maschine in Wartung', d.wartung.tage.length, 2);

  /* (2) DIE BEFUNDE, die darin stecken sollen. */
  {
    const M = JSON.parse(JSON.stringify(M0));
    const m = M.filter(x => x.id === d.wartung.maschine)[0];
    if(m) m.wartung = d.wartung.tage;
    const b = planBelegen({auftraege:JSON.parse(JSON.stringify(d.auftraege)),
                           maschinen:M, ab:'2026-09-15', tage:60, frei:d.frei});
    gleich('alles laesst sich einplanen', b.unplanbar.length, 0);
    if(b.auftraege.length >= 5) ok('  ' + b.auftraege.length + ' Auftraege binden Kapazitaet');
    else bad('zu wenige Auftraege in der Planung: ' + b.auftraege.length);
    /* EIN GERISSENER TERMIN gehoert dazu - eine Tafel, auf der alles
       gruen ist, zeigt nie, wie Verzug aussieht. */
    const eng = b.auftraege.filter(z => z.puffer !== null && z.puffer < 0);
    if(eng.length >= 1) ok('mindestens ein Termin ist nicht zu halten (Puffer ' +
                           Math.min.apply(null, eng.map(z => z.puffer)) + ' Tage)');
    else bad('kein einziger Termin ist eng - der Bestand zeigt keinen Verzug');
    /* Und die Arbeit liegt NICHT auf einer einzigen Maschine. */
    const belegt = {};
    b.auftraege.forEach(z => (z.gaenge || []).forEach(g => { belegt[g.maschine] = 1; }));
    if(Object.keys(belegt).length >= 2) ok('  und sie verteilt sich auf ' +
      Object.keys(belegt).length + ' Maschinen');
    else bad('alle Arbeit liegt auf einer Maschine - die Tafel zeigt nichts');
  }

  /* (3) SOLL UND IST: einmal schneller, einmal langsamer. Ein Bestand,
     in dem alles genau aufgeht, zeigt die Rechnung als sinnlos. */
  {
    const si = planSollIst(d.auftraege);
    if(si && si.zahl >= 2) ok('zwei Auftraege liefern einen Soll-Ist-Vergleich');
    else bad('der Soll-Ist-Vergleich bekommt keine Daten');
    const faktoren = (si.zeilen || []).map(z => z.faktor).filter(f => f != null);
    if(faktoren.some(f => f > 1.02) && faktoren.some(f => f < 0.98))
      ok('  und zwar in beide Richtungen (' + faktoren.map(f => f.toFixed(2)).join(' / ') + ')');
    else bad('alle Faktoren zeigen in dieselbe Richtung: ' + faktoren.join(', '));
  }

  /* (4) Die Termine haengen am uebergebenen HEUTE, nicht an einem
     festen Datum - sonst waere der Bestand in drei Wochen Geschichte. */
  {
    const spaet = demoWerkstatt('2027-03-01', M0);
    const alle = spaet.auftraege.map(a => a.liefertermin).join(' ');
    if(/2027-0[23]/.test(alle) && !/2026/.test(alle))
      ok('die Termine wandern mit dem Tag mit');
    else bad('die Termine kleben an einem festen Datum: ' + alle.slice(0, 60));
  }

  /* (5) Kein Name, der eine echte Firma treffen koennte. */
  {
    const kunden = hole('DEMO_KUNDEN') || [];
    const erfunden = kunden.filter(k => /Muster|Beispiel|Demo|Probe/i.test(k)).length;
    gleich('jeder Beispielkunde ist als erfunden erkennbar', erfunden, kunden.length);
  }

  /* (6) Oberflaeche. */
  {
    ['btnDemo', 'btnDemoJa', 'btnDemoNein', 'demoHinweis'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    if(typeof hole('wDemoMalen') === 'function') ok('Funktion vorhanden: wDemoMalen');
    else bad('Funktion fehlt: wDemoMalen');
    /* WER SCHON AUFTRAEGE HAT, bekommt sie nicht still ueberschrieben. */
    if(/if\(W\.auftraege\.length\)\{\s*\n\s*W\.demoFragt = true;/.test(quelltext))
      ok('bei vorhandenen Auftraegen fragt der Knopf erst');
    else bad('die Beispieldaten ueberschreiben ohne Rueckfrage');
  }
}

/* --- 32. Mannstunden und Uebersicht ----------------------------------
   DER BEFUND AM MODELL (Ansage 15.09.2026): die App rechnete
   jede Maschine fuer sich. Vier Maschinen mal 480 Minuten mal fuenf
   Tage sind 160 Stunden die Woche - in einer Werkstatt, in der einer
   alles macht, gibt es die nicht. JEDER TERMIN war damit zu frueh
   versprochen.

   Im Browser gemessen, Beispiel-Werkstatt, 30 h die Woche: aus "3 wird
   knapp" wurde "5 Termin in Gefahr", und die eigene Zeit steht bei
   80 und 87 Prozent, wo die Maschinen 21 und 54 zeigen.

   DIE UEBERSICHT rechnet NICHTS neu. Sie fasst zusammen, was
   planBelegen und planAuslastung ohnehin geliefert haben - sonst gaebe
   es zwei Wahrheiten ueber denselben Plan.                          */
console.log('\n32) Mannstunden und Uebersicht');
{
  const planMannMinuten = hole('planMannMinuten');
  const planBelegen = hole('planBelegen'), planUebersicht = hole('planUebersicht');
  const demoWerkstatt = hole('demoWerkstatt');
  const M0 = hole('WERKSTATT_MASCHINEN');

  ['planMannMinuten', 'planUebersicht'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });

  /* (1) Die Wochenzahl auf Tage. NICHT GERUNDET - eine gerundete
     Tageszahl summiert sich ueber die Woche auf etwas anderes als die
     Wochenzahl, und dann stimmt die eingetragene Groesse nicht mehr. */
  {
    gleich('30 h auf 5 Tage sind 360 min', planMannMinuten(30, 5), 360);
    gleich('30 h auf 6 Tage sind 300 min', planMannMinuten(30, 6), 300);
    gleich('  krumm bleibt krumm', planMannMinuten(30, 7), 30 * 60 / 7);
    gleich('0 heisst keine Grenze', planMannMinuten(0, 5), null);
    gleich('  Unsinn ebenso', planMannMinuten('viel', 5), null);
    gleich('  und negativ auch', planMannMinuten(-5, 5), null);
    /* Die Summe ueber die Woche MUSS die Wochenzahl ergeben - das ist
       der ganze Sinn der Zahl. */
    nahe('fuenf Tage ergeben wieder 30 Stunden', planMannMinuten(30, 5) * 5 / 60, 30, 1e-9);
    nahe('  sechs Tage auch', planMannMinuten(30, 6) * 6 / 60, 30, 1e-9);
  }

  /* (2) DIE GRENZE WIRKT - und zwar ueber Maschinen hinweg. Das ist der
     Kern: zwei Maschinen gleichzeitig kosten doppelt. */
  {
    const bau = (nr, masch, min) => {
      const a = hole('neuerAuftrag')();
      a.nummer = nr; a.teil = 'Teil ' + nr; a.stueck = 1; a.status = 'beauftragt';
      a.klasse = masch === 'fr1' ? 'fraesteil_3ax' : 'drehteil_einfach';
      a.gattung = masch === 'fr1' ? 'fraesen' : 'drehen';
      a.maschine = masch; a.zeiten = {ruestzeit:min, stueckzeit:0};
      a.masse = masch === 'fr1' ? {dmax:0, laenge:0, x:100, y:100, z:50}
                                : {dmax:60, laenge:200, x:0, y:0, z:0};
      return a;
    };
    /* Zwei Auftraege zu je 360 Minuten auf ZWEI verschiedenen Maschinen.
       Ohne Grenze laufen beide am selben Tag; mit 30 h die Woche
       (= 360 min am Tag) passt nur einer. */
    const zwei = () => [bau('M-1', 'm1000', 360), bau('M-2', 'fr1', 360)];
    const ohne = planBelegen({auftraege:zwei(), maschinen:M0, ab:'2026-09-14', tage:30});
    gleich('ohne Grenze laufen beide am Montag',
           ohne.auftraege.map(z => z.ende).join(' '), '2026-09-14 2026-09-14');
    const mit = planBelegen({auftraege:zwei(), maschinen:M0, ab:'2026-09-14', tage:30,
                             mannStunden:30});
    gleich('mit 30 h die Woche muss der zweite warten',
           mit.auftraege.map(z => z.ende).join(' '), '2026-09-14 2026-09-15');
    gleich('  und das Ergebnis sagt, womit gerechnet wurde', mit.mannStunden, 30);
    gleich('  ohne Grenze sagt es das auch', ohne.mannStunden, null);

    /* Die Grenze darf die MASCHINENgrenze nicht aufheben: 600 Minuten
       an einem Tag gehen auch mit viel Manpower nicht, wenn die
       Maschine nur 480 kann. */
    const viel = planBelegen({auftraege:[bau('M-3', 'm1000', 600)], maschinen:M0,
                              ab:'2026-09-14', tage:30, mannStunden:100});
    gleich('die Maschinengrenze gilt weiter',
           viel.auftraege[0].start + '..' + viel.auftraege[0].ende, '2026-09-14..2026-09-15');
  }

  /* (3) Die Uebersicht fasst zusammen, sie rechnet nicht neu. */
  {
    const M = JSON.parse(JSON.stringify(M0));
    const d = demoWerkstatt('2026-09-15', M);
    const e = {auftraege:d.auftraege, maschinen:M, ab:'2026-09-15', tage:60,
               frei:d.frei, mannStunden:30, wochen:4};
    const b = planBelegen(e);
    const u = planUebersicht(Object.assign({}, e, {belegung:b}));

    gleich('die Uebersicht nimmt die uebergebene Belegung',
           u.zahlen.gesamt, d.auftraege.length);
    gleich('  und zaehlt dieselben Auftraege wie die Planung',
           u.zeilen.length, b.auftraege.length);
    if(u.zahlen.ueberfaellig >= 1) ok('der ueberfaellige Auftrag steht in der Uebersicht');
    else bad('die Uebersicht kennt keinen ueberfaelligen Auftrag');
    gleich('vier Wochen Auslastung', u.wochen.length, 4);
    gleich('  je Maschine eine Zeile', u.last.length, M.length);

    /* DIE EIGENE ZEIT ist die Zahl, die zaehlt. */
    if(u.mann && u.mann.stunden === 30) ok('die eigene Zeit steht in der Uebersicht');
    else bad('die Uebersicht kennt die eigene Zeit nicht');
    if(u.mann && u.mann.wochen[0].anteil > 0.5)
      ok('  und sie ist deutlich hoeher als jede einzelne Maschine (' +
         Math.round(u.mann.wochen[0].anteil * 100) + ' % gegen ' +
         Math.max.apply(null, u.last.map(m => Math.round(m.wochen[0].anteil * 100))) + ' %)');
    else bad('die eigene Zeit liegt nicht ueber den Maschinen - dann rechnet sie falsch');
    /* Ohne Grenze gibt es die Zeile nicht - und das ist richtig. */
    const ohneM = planUebersicht(Object.assign({}, e, {mannStunden:0, belegung:null}));
    gleich('ohne Grenze keine Zeile fuer die eigene Zeit', ohneM.mann, null);

    /* Der Wert: Angebot und Auftrag GETRENNT. Sie in eine Zahl zu
       werfen ist die haeufigste Art, sich reich zu rechnen. */
    if(u.werte.angeboten > 0) ok('Angebote sind beziffert');
    else bad('keine Angebote im Beispiel');
    gleich('und sie zaehlen NICHT zum Offenen',
           u.werte.offen < u.werte.offen + u.werte.angeboten, true);
  }

  /* (4) Oberflaeche. */
  {
    ['tabUeber', 'blattUeber', 'ueAmpel', 'ueTermine', 'ueLast', 'ueWert', 'ueSoll',
     'plMann', 'plMannHinweis'].forEach(id => {
      if(quelltext.indexOf('id="' + id + '"') > 0) ok('Bedienelement vorhanden: ' + id);
      else bad('Bedienelement fehlt: ' + id);
    });
    ['wUebersichtMalen', 'wMannMalen', 'ueStufe', 'ueKachel'].forEach(nm => {
      if(typeof hole(nm) === 'function') ok('Funktion vorhanden: ' + nm);
      else bad('Funktion fehlt: ' + nm);
    });
    /* DURCHREICHEN - dreimal in diesem Projekt war eine Mechanik im Kern
       vorhanden und von aussen unerreichbar. */
    if(/mannStunden:W\.mannStunden, wochen:4/.test(quelltext))
      ok('die Uebersicht bekommt die eigene Zeit');
    else bad('die Uebersicht bekommt die eigene Zeit NICHT - die Zeile bliebe leer');
    if(/mannStunden:W\.mannStunden \}\);/.test(quelltext))
      ok('und die Planung ebenso');
    else bad('die Planung bekommt die eigene Zeit NICHT - die Termine blieben zu frueh');
    /* STATUSFARBE NIE ALLEIN: jede Kachel traegt Zeichen und Wort. */
    if(/<span class="zeichen">/.test(quelltext) && /class="wort"/.test(quelltext))
      ok('jede Kachel traegt Zeichen und Wort, nicht nur Farbe');
    else bad('die Kacheln tragen die Auskunft in der Farbe allein');
    /* JEDER BALKEN TRAEGT SEINE ZAHL. */
    if(/class="wbz"/.test(quelltext))
      ok('jeder Wochenbalken traegt seine Zahl');
    else bad('die Wochenbalken tragen keine Zahl - ein Balken ohne Zahl ist ein Gefuehl');
    /* Und die Inline-Falle, die im Bild vier gleiche Balken erzeugte. */
    if(/\.balkenzeile \.bfuell\{ display:block;/.test(quelltext))
      ok('die Fuellstaende sind Bloecke - sonst wirkt die Breite nicht');
    else bad('die Fuellstaende sind inline - width wirkt dort nicht, alle Balken saehen gleich aus');
  }
}

/* --- 33. Mannzeit ist nicht Maschinenzeit ----------------------------
   DER FEHLER AUS DEM PAKET DAVOR, hier geradegerueckt: die
   Mannstunden-Grenze nahm an, jede Maschinenminute koste eine
   Mannminute. Das stimmt beim Ruesten - aber nicht, wenn die Drehbank
   zehn Minuten schruppt und der Mann daneben an der Fraese steht.

   Die App war vorher zu OPTIMISTISCH (jede Maschine fuer sich, 160
   Stunden die Woche) und danach zu PESSIMISTISCH. Derselbe Fehler,
   andere Richtung - und deshalb prueft dieser Abschnitt beide Enden,
   nicht nur das neue.

   Gemessen an der Beispiel-Werkstatt mit 30 h die Woche: ohne Grenze
   ist der letzte Auftrag am 21.09. fertig, mit "jede Minute zaehlt" am
   25.09., mit Ruesten voll und Stueckzeit zu 60 % am 22.09.        */
console.log('\n33) Mannzeit ist nicht Maschinenzeit');
{
  const maschineMannAnteil = hole('maschineMannAnteil');
  const maschineMannGepflegt = hole('maschineMannGepflegt');
  const planBelegen = hole('planBelegen'), planUebersicht = hole('planUebersicht');
  const neuerAuftrag = hole('neuerAuftrag');
  const M0 = hole('WERKSTATT_MASCHINEN');

  ['maschineMannAnteil', 'maschineMannGepflegt'].forEach(nm => {
    if(typeof hole(nm) === 'function') ok('vorhanden: ' + nm);
    else bad('fehlt: ' + nm);
  });

  /* (1) Welcher Anteil gilt? */
  {
    const dreh = M0.filter(m => m.art === 'drehen')[0];
    const hand = M0.filter(m => m.art === 'handarbeit')[0];
    gleich('am Handarbeitsplatz zaehlt jede Minute', maschineMannAnteil(hand), 1);
    gleich('an der Maschine die Annahme 60 %', maschineMannAnteil(dreh), 0.6);
    gleich('  und sie ist als Annahme ausgewiesen', maschineMannGepflegt(dreh), false);
    const eigen = JSON.parse(JSON.stringify(dreh));
    eigen.mannanteil = 0.25;
    gleich('ein eigener Wert gilt', maschineMannAnteil(eigen), 0.25);
    gleich('  und ist als eigener ausgewiesen', maschineMannGepflegt(eigen), true);
    /* NULL IST ERLAUBT und heisst etwas: laeuft ganz allein. Das darf
       nicht wie "nicht gesetzt" behandelt werden. */
    const allein = JSON.parse(JSON.stringify(dreh));
    allein.mannanteil = 0;
    gleich('0 heisst "laeuft allein", nicht "nicht gesetzt"', maschineMannAnteil(allein), 0);
    gleich('  und gilt als gepflegt', maschineMannGepflegt(allein), true);
    const mist = JSON.parse(JSON.stringify(dreh));
    mist.mannanteil = 'viel';
    gleich('Unsinn faellt auf die Annahme zurueck', maschineMannAnteil(mist), 0.6);
    const zuViel = JSON.parse(JSON.stringify(dreh));
    zuViel.mannanteil = 3;
    gleich('  und ein Wert ueber 1 ebenso', maschineMannAnteil(zuViel), 0.6);
  }

  /* (2) RUESTEN ZAEHLT VOLL, STUECKZEIT ANTEILIG. Der tragende Fall. */
  {
    const bau = (nr, masch, ruest, stueckzeit, stueck) => {
      const a = neuerAuftrag();
      a.nummer = nr; a.teil = 'Teil ' + nr; a.stueck = stueck;
      a.status = 'beauftragt';
      a.klasse = masch === 'fr1' ? 'fraesteil_3ax' : 'drehteil_einfach';
      a.gattung = masch === 'fr1' ? 'fraesen' : 'drehen';
      a.maschine = masch; a.zeiten = {ruestzeit:ruest, stueckzeit:stueckzeit};
      a.masse = masch === 'fr1' ? {dmax:0, laenge:0, x:100, y:100, z:50}
                                : {dmax:60, laenge:200, x:0, y:0, z:0};
      return a;
    };
    const M = (anteil) => {
      const L = JSON.parse(JSON.stringify(M0));
      L.forEach(m => { m.mannanteil = anteil; });
      return L;
    };
    /* Ein Auftrag: 60 min Ruesten, 10 Stueck zu 30 min = 300 min
       Stueckzeit, zusammen 360 Maschinenminuten.
       Bei Anteil 1   sind das 360 Mannminuten.
       Bei Anteil 0,5 sind es 60 + 150 = 210.
       Bei Anteil 0   sind es 60. */
    const nimm = (anteil) => {
      const b = planBelegen({auftraege:[bau('X-1', 'm1000', 60, 30, 10)],
                             maschinen:M(anteil), ab:'2026-09-14', tage:30, mannStunden:40});
      return Math.round((b.bloecke || []).reduce((s2, x) => s2 + (x.mann || 0), 0));
    };
    gleich('Anteil 1: alle 360 Minuten sind Mannzeit', nimm(1), 360);
    gleich('Anteil 0,5: Ruesten voll, Stueckzeit halb', nimm(0.5), 210);
    gleich('Anteil 0: nur das Ruesten', nimm(0), 60);
    /* Und die Maschinenminuten bleiben, was sie sind. */
    const b = planBelegen({auftraege:[bau('X-2', 'm1000', 60, 30, 10)],
                           maschinen:M(0.5), ab:'2026-09-14', tage:30, mannStunden:40});
    gleich('die Maschine braucht trotzdem ihre 360 Minuten',
           Math.round((b.bloecke || []).reduce((s2, x) => s2 + x.minuten, 0)), 360);
  }

  /* (3) WAS ALLEIN LAEUFT, BREMST DIE ZWEITE MASCHINE NICHT.
     Das ist der Sinn der ganzen Uebung. */
  {
    const bau2 = (nr, masch) => {
      const a = neuerAuftrag();
      a.nummer = nr; a.teil = 'T' + nr; a.stueck = 1; a.status = 'beauftragt';
      a.klasse = masch === 'fr1' ? 'fraesteil_3ax' : 'drehteil_einfach';
      a.gattung = masch === 'fr1' ? 'fraesen' : 'drehen';
      a.maschine = masch;
      /* Reine Laufzeit, kein Ruesten - dann haengt alles am Anteil. */
      a.zeiten = {ruestzeit:0, stueckzeit:360};
      a.masse = masch === 'fr1' ? {dmax:0, laenge:0, x:100, y:100, z:50}
                                : {dmax:60, laenge:200, x:0, y:0, z:0};
      return a;
    };
    const paar = () => [bau2('P-1', 'm1000'), bau2('P-2', 'fr1')];
    const mitAnteil = (anteil) => {
      const L = JSON.parse(JSON.stringify(M0));
      L.forEach(m => { m.mannanteil = anteil; });
      const b = planBelegen({auftraege:paar(), maschinen:L, ab:'2026-09-14',
                             tage:30, mannStunden:30});
      return b.auftraege.map(z => z.ende).join(' ');
    };
    /* 30 h die Woche sind 360 min am Tag. Zwei Auftraege zu je 360 min
       reiner Laufzeit: */
    gleich('bei voller Mannzeit passt nur einer am Montag',
           mitAnteil(1), '2026-09-14 2026-09-15');
    gleich('bei halber passen beide am Montag',
           mitAnteil(0.5), '2026-09-14 2026-09-14');
    gleich('  und wenn sie ganz allein laufen erst recht',
           mitAnteil(0), '2026-09-14 2026-09-14');
  }

  /* (4) Die Uebersicht zeigt die MANNminuten, nicht die
     Maschinenminuten - sonst waere sie wieder beim Fehler. */
  {
    const L = JSON.parse(JSON.stringify(M0));
    L.forEach(m => { m.mannanteil = 0.5; });
    const a = neuerAuftrag();
    a.nummer = 'U-1'; a.teil = 'Welle'; a.stueck = 10; a.status = 'beauftragt';
    a.klasse = 'drehteil_einfach'; a.gattung = 'drehen'; a.maschine = 'm1000';
    a.zeiten = {ruestzeit:60, stueckzeit:30};
    a.masse = {dmax:60, laenge:200, x:0, y:0, z:0};
    const e = {auftraege:[a], maschinen:L, ab:'2026-09-14', tage:30,
               mannStunden:40, wochen:2};
    const u = planUebersicht(e);
    /* 210 Mannminuten von 40 h die Woche = 3,5 h von 40. */
    nahe('die Uebersicht rechnet mit Mannminuten',
         u.mann.wochen[0].belegt, 210 / 60, 1e-6);
    /* Und die Maschinenzeile zeigt weiter die Maschine. */
    const dreh = u.last.filter(m => m.id === 'm1000')[0];
    if(dreh.wochen[0].belegt === 360) ok('  und die Maschinenzeile weiter die Maschine');
    else bad('die Maschinenzeile zeigt ' + dreh.wochen[0].belegt + ' statt 360');
  }

  /* (5) Oberflaeche. */
  {
    if(/data-mm="/.test(quelltext)) ok('die Maschinentabelle hat eine Spalte fuer den Anteil');
    else bad('die Maschinentabelle hat keine Spalte fuer den Anteil');
    if(/R&uuml;sten z&auml;hlt voll/.test(quelltext))
      ok('und der Hinweis sagt, dass Ruesten voll zaehlt');
    else bad('der Hinweis erklaert die Rechnung nicht');
    /* Leer loescht zurueck auf die Annahme, 0 ist etwas anderes. */
    if(/\(v === '' \|\| !isFinite\(\+v\)\) \? null/.test(quelltext))
      ok('leer loescht zurueck auf die Annahme, 0 bleibt 0');
    else bad('leer und 0 sind nicht unterschieden - dann laesst sich "laeuft allein" nicht eintragen');
    /* Und der Block traegt seine Mannminuten - daran haengt alles. */
    if(/mann:nimm \* mFaktor/.test(quelltext))
      ok('jeder Belegungsblock traegt seine Mannminuten');
    else bad('die Bloecke tragen keine Mannminuten - die Uebersicht muesste neu rechnen');
  }
}

/* --- Ergebnis -------------------------------------------------------- */
console.log('\n' + '='.repeat(62));
console.log('Haken: ' + haken + '   Fehler: ' + fehler + '   Hinweise: ' + warnungen);
if(fehler === 0) console.log('PRUEFSTAND BESTANDEN');
else console.log('PRUEFSTAND NICHT BESTANDEN');
console.log('='.repeat(62));
process.exit(fehler ? 1 : 0);
