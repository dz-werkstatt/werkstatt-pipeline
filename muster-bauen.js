/* =====================================================================
   muster-bauen.js — Musterteile als echte STEP-Dateien erzeugen
   ---------------------------------------------------------------------
   WOZU: die App braucht Material zum Ausprobieren, und Kundenmodelle
   taugen dafuer nicht. Sie duerfen nicht ins oeffentliche Repo, sie
   tragen Dateinamen, die etwas verraten, und ihr wahrer Inhalt steht
   nirgends geschrieben.

   Diese Teile sind ERZEUGT - aus denselben Bausteinen wie die
   Pruefkoerper, also echte STEP-Dateien mit Randdarstellung, die der
   Leser der App genauso verarbeitet wie ein CAD-Modell. Nichts daran
   stammt von einem Kunden, und jedes Mass steht hier im Klartext.

   Die Teile sind so gewaehlt, dass sie die KLASSEN der App abdecken:
   einfache Drehteile, ein Drehteil mit Fraesanteil (Bohrbild kommt aus
   dem Quader-Zweig), Frasteile flach und kubisch. Damit zeigt die
   Kalkulation nicht viermal dieselbe Rechnung.

       node muster-bauen.js
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const PK = require('./pruefkoerper.js');

const ORD = path.join(__dirname, 'muster');

/* Jedes Teil mit seinen Massen im Klartext - wer nachrechnen will, muss
   nicht die STEP-Datei lesen. Die Namen sind bewusst generisch
   (Werkstattdeutsch), damit keiner wie ein Kundenteil aussieht. */
const TEILE = [
  { datei:'welle-glatt.step',
    was:'Welle, glatt: ⌀40 x 200',
    bau:() => PK.drehteil([[40, 200]], 0) },

  { datei:'welle-gestuft.step',
    was:'Stufenwelle: ⌀50 x 40, ⌀40 x 120, ⌀30 x 40',
    bau:() => PK.drehteil([[50, 40], [40, 120], [30, 40]], 0) },

  { datei:'buchse.step',
    was:'Buchse: ⌀60 x 45, Bohrung ⌀30 durchgehend',
    bau:() => PK.drehteil([[60, 45]], 30) },

  { datei:'lagerbuchse-gestuft.step',
    was:'Lagerbuchse: ⌀80 x 25 / ⌀60 x 35, Bohrung ⌀40',
    bau:() => PK.drehteil([[80, 25], [60, 35]], 40) },

  { datei:'flansch.step',
    was:'Flansch: ⌀120 x 18 / ⌀70 x 22, Bohrung ⌀35',
    bau:() => PK.drehteil([[120, 18], [70, 22]], 35) },

  { datei:'platte-flach.step',
    was:'Platte, flach: 200 x 120 x 12',
    bau:() => PK.quader(200, 120, 12, 0) },

  { datei:'platte-mit-bohrung.step',
    was:'Platte mit Durchgang: 160 x 100 x 15, Bohrung ⌀25',
    bau:() => PK.quader(160, 100, 15, 25) },

  { datei:'lagerbock.step',
    was:'Lagerbock: 120 x 80 x 60, Bohrung ⌀40',
    bau:() => PK.quader(120, 80, 60, 40) },

  { datei:'deckel.step',
    was:'Deckel: 90 x 90 x 10, Bohrung ⌀20',
    bau:() => PK.quader(90, 90, 10, 20) },

  { datei:'klotz-massiv.step',
    was:'Klotz, massiv: 80 x 80 x 80',
    bau:() => PK.quader(80, 80, 80, 0) }
];

if(!fs.existsSync(ORD)) fs.mkdirSync(ORD, {recursive:true});

let bytes = 0;
TEILE.forEach(t => {
  const text = t.bau();
  fs.writeFileSync(path.join(ORD, t.datei), text, 'utf8');
  bytes += text.length;
  console.log('  ' + t.datei.padEnd(28) + t.was);
});

/* Ein Zettel dazu, damit in einem Jahr noch klar ist, was das ist. */
const liesmich =
'# Musterteile\n\n' +
'Zehn STEP-Dateien zum Ausprobieren der App. Sie sind von\n' +
'`muster-bauen.js` ERZEUGT, nicht aus einem CAD exportiert: echte\n' +
'Randdarstellung, aber jedes Mass steht im Skript im Klartext. Nichts\n' +
'daran stammt von einem Kunden.\n\n' +
'| Datei | Teil |\n|---|---|\n' +
TEILE.map(t => '| `' + t.datei + '` | ' + t.was + ' |').join('\n') + '\n\n' +
'Neu erzeugen: `node muster-bauen.js`\n';
fs.writeFileSync(path.join(ORD, 'LIESMICH.md'), liesmich, 'utf8');

console.log('\n' + TEILE.length + ' Musterteile in muster/ (' + bytes + ' Bytes)');
