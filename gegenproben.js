/* =====================================================================
   gegenproben.js — schlaegt der Pruefstand ueberhaupt an?
   ---------------------------------------------------------------------
   Ein gruener Haken ist nur so viel wert wie sein Gegenbeweis. Dieses
   Skript verfaelscht die gebaute Datei an je EINER Stelle, laesst den
   Pruefstand darauf laufen und erwartet, dass genau der zugehoerige
   Haken rot wird.

     node gegenproben.js

   Die Verfaelschungen laufen auf KOPIEN. Die ausgelieferte Datei wird
   nicht angefasst — die Lehre aus dem Schwesterprojekt, wo eine
   Gegenprobe per "git checkout" einen halben Tag Arbeit verworfen hat.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const ORDNER = __dirname;
const QUELLE = path.join(ORDNER, 'werkstatt-pipeline.html');
const TMP = path.join(ORDNER, '.gegenprobe.html');

const faelle = [
  {
    name:'Naht der umlaufenden Flaechen stillgelegt',
    suche:'function fSchleifenVereinen(f, schleifen, per){',
    ersatz:'function fSchleifenVereinen(f, schleifen, per){ return schleifen;',
    erwartet:['Quader mit Bohrung: Volumen', 'Quader mit Bohrung: Oberflaeche']
  },
  {
    name:'Schlusspunkt der Randschleife wieder verworfen',
    suche:"  pts.umlauf = per ? Math.round((pts[pts.length - 1][0] - pts[0][0]) / per) : 0;\n  return pts;",
    ersatz:"  pts.umlauf = per ? Math.round((pts[pts.length - 1][0] - pts[0][0]) / per) : 0;\n  pts.pop();\n  return pts;",
    erwartet:['Quader mit Bohrung: Volumen']
  },
  {
    name:'Orientierungssinn der Flaechen ignoriert',
    suche:'    const sinn = !/\\.F\\./.test(String(a[3] || \'\'));',
    ersatz:'    const sinn = true;',
    /* Ohne den Sinn wird die Bohrungswand fuer einen Zapfen gehalten:
       die Bohrung verschwindet aus der Liste, und die Orientierung
       faellt auf. */
    erwartet:['Quader mit Bohrung: eine Bohrung gefunden', 'Quader mit Bohrung: keine schiefe Orientierung']
  },
  {
    name:'Kennwert des Kegels ohne den Anstieg',
    suche:'      if(!was) return [Math.abs(k) / Math.cos(f.r2), 0, 0];',
    ersatz:'      if(!was) return [Math.abs(k), 0, 0];',
    erwartet:['Kegelmantel  Flaeche = pi*(r0+r1)*Mantellinie']
  },
  {
    name:'Werkstofffaktor roh statt auf die Gruppe bezogen',
    suche:'  const faktor = W ? (W.faktor / basis) : 1;',
    ersatz:'  const faktor = W ? W.faktor : 1;',
    erwartet:['Edelstahl bezieht sich auf 1.4301 (Faktor 1)']
  },
  {
    name:'Mindestauftragswert ausgehebelt',
    suche:'  const gesamt = Math.max(gesamtRoh, mindest);',
    ersatz:'  const gesamt = gesamtRoh;',
    erwartet:['Mindestauftragswert greift nicht']
  },
  {
    name:'Ruestumlage nicht auf die Stueckzahl verteilt',
    suche:"  const ruesten = nimm('ruesten', ruestMin / 60 * ruestSatz / stueck);",
    ersatz:"  const ruesten = nimm('ruesten', ruestMin / 60 * ruestSatz);",
    erwartet:['Ruesten je Stueck', 'Ruestumlage haengt nicht an der Stueckzahl']
  },
  {
    name:'Bohrungsboden nicht gesucht (alles gilt als durchgehend)',
    suche:'    g.durch = !boden;',
    ersatz:'    g.durch = true;',
    erwartet:[],   /* der Testkoerper HAT eine durchgehende Bohrung — hier darf nichts umfallen */
    darfGruenBleiben:true
  }
];

const roh = fs.readFileSync(QUELLE, 'utf8');
let gut = 0, schlecht = 0;
faelle.forEach((f, i) => {
  if(roh.indexOf(f.suche) < 0){
    console.log('X ' + (i + 1) + ') ' + f.name + ' — ANKER NICHT GEFUNDEN, Gegenprobe wertlos');
    schlecht++; return;
  }
  fs.writeFileSync(TMP, roh.replace(f.suche, f.ersatz));
  let aus = '';
  try{ aus = execFileSync(process.execPath, [path.join(ORDNER, 'pruefstand.js'), '--datei', TMP], {encoding:'utf8'}); }
  catch(e){ aus = String(e.stdout || '') + String(e.stderr || ''); }
  const rot = (aus.match(/^  X .*/gm) || []).map(z => z.slice(4));
  if(f.darfGruenBleiben){
    if(!rot.length){ console.log('+ ' + (i + 1) + ') ' + f.name + ' — wie erwartet ohne Wirkung auf die Haken'); gut++; }
    else { console.log('X ' + (i + 1) + ') ' + f.name + ' — unerwartet rot: ' + rot.join(' | ')); schlecht++; }
    return;
  }
  const getroffen = f.erwartet.filter(e => rot.some(r => r.indexOf(e) === 0));
  if(getroffen.length === f.erwartet.length && rot.length){
    console.log('+ ' + (i + 1) + ') ' + f.name + ' — ' + rot.length + ' Haken rot, darunter alle erwarteten');
    gut++;
  } else {
    console.log('X ' + (i + 1) + ') ' + f.name + ' — erwartet: ' + f.erwartet.join(' | ') +
      '   rot wurde: ' + (rot.join(' | ') || 'NICHTS'));
    schlecht++;
  }
});
try{ fs.unlinkSync(TMP); }catch(e){}
console.log('\n' + '='.repeat(62));
console.log('Gegenproben in Ordnung: ' + gut + '   fehlgeschlagen: ' + schlecht);
console.log(schlecht ? 'GEGENPROBEN NICHT BESTANDEN' : 'GEGENPROBEN BESTANDEN');
console.log('='.repeat(62));
process.exit(schlecht ? 1 : 0);
