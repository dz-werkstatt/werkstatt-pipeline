// =====================================================================
// bauen.js — setzt die Werkstatt-Pipeline aus den Quellmodulen zusammen
// ---------------------------------------------------------------------
// [Ansage 13.09.2026: "so wie bei den Drehen und Fraesen Apps,
// so moechte ich's da auch haben"] Gebaut wird wie in den beiden
// Schwester-Apps: Quellmodule in Ordnern, eine Byte-Verkettung, und
// AUSGELIEFERT wird GENAU EINE HTML-Datei. Doppelklick, offline, kein
// Server, keine Abhaengigkeit. Die Offline-Doktrin gilt dem Ergebnis,
// nicht der Werkbank.
//
// Die Ordnernamen sind die des Lastenhefts (import, kalkulation,
// arbeitsplan, shared, ui) — das ist die geforderte Modulstruktur, und
// sie ist zugleich die Bauliste.
//
//   node bauen.js            baut die Datei
//   node bauen.js --pruefe   baut NICHT, sondern vergleicht: stimmt die
//                            ausgelieferte Datei mit dem ueberein, was
//                            aus den Quellen entstuende? (Exit 1 bei
//                            Abweichung — der Haken fuer den Pruefstand.)
//
// ZWEI ZIELE, gleiche Bytes:
//   werkstatt-pipeline.html   zum Doppelklicken (offline, ohne Server)
//   docs/index.html           GitHub Pages liest den Ordner docs/ auf
//                             main — damit ist JEDER PUSH das Deployment,
//                             ohne Action und ohne fremden Dienst.
//
// EINE EINZIGE UMFORMUNG, und die ist Absicht: Dateien unter "einbetten"
// sind JSON und werden als "const NAME = <Dateiinhalt>;" eingesetzt.
// Grund: das Lastenheft verlangt, dass jeder Startwert in
// kalkulation/defaults.json steht und NICHT im Code. Die JSON-Datei
// bleibt damit die einzige Quelle; der Browser bekommt sie eingebettet,
// weil eine offline geoeffnete Datei nichts nachladen kann (fetch auf
// file:// ist gesperrt). Die Umformung ist deterministisch, deshalb
// bleibt --pruefe ein Byte-Beweis.
// =====================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WURZEL = __dirname;
const MANIFEST = path.join(WURZEL, 'manifest.json');

function hash(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }

function zusammensetzen(){
  if(!fs.existsSync(MANIFEST)) throw new Error('Manifest fehlt: ' + MANIFEST);
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if(!Array.isArray(man.dateien) || !man.dateien.length)
    throw new Error('Manifest enthaelt keine Dateiliste.');

  const einbetten = man.einbetten || {};
  const teile = [];
  for(const name of man.dateien){
    const p = path.join(WURZEL, name);
    if(!fs.existsSync(p)) throw new Error('Quelldatei fehlt: ' + name + ' (im Manifest gelistet)');
    const roh = fs.readFileSync(p);           // BINAER — keine Zeilenende-Umwandlung
    if(einbetten[name]){
      // Muss gueltiges JSON sein, sonst faellt es erst im Browser auf.
      try{ JSON.parse(roh.toString('utf8')); }
      catch(e){ throw new Error(name + ' ist kein gueltiges JSON: ' + e.message); }
      teile.push(Buffer.from('const ' + einbetten[name] + ' = '));
      teile.push(roh);
      teile.push(Buffer.from(';\n'));
    } else {
      teile.push(roh);
    }
  }
  return { buf: Buffer.concat(teile), man };
}

const nurPruefen = process.argv.includes('--pruefe');

try{
  const { buf, man } = zusammensetzen();
  const ZIELE = (man.ziele && man.ziele.length) ? man.ziele : ['werkstatt-pipeline.html'];

  if(nurPruefen){
    let schlecht = 0;
    for(const z of ZIELE){
      const ZIEL = path.join(WURZEL, z);
      if(!fs.existsSync(ZIEL)){
        console.error('FEHLER: ' + z + ' fehlt — "node bauen.js" ausfuehren.');
        schlecht++; continue;
      }
      const ist = fs.readFileSync(ZIEL);
      if(ist.equals(buf)) continue;
      console.error('ABWEICHUNG in ' + z + ': stimmt NICHT mit den Quellen ueberein.');
      console.error('  ausgeliefert: ' + ist.length + ' Bytes, SHA256 ' + hash(ist).slice(0, 16));
      console.error('  aus Quellen : ' + buf.length + ' Bytes, SHA256 ' + hash(buf).slice(0, 16));
      let i = 0; const n = Math.min(ist.length, buf.length);
      while(i < n && ist[i] === buf[i]) i++;
      console.error('  erste Abweichung bei Byte ' + i + ' (etwa Zeile ' +
                    ist.slice(0, i).toString('utf8').split('\n').length + ')');
      console.error('  Ursache ist fast immer: in der GEBAUTEN Datei editiert statt in den Quellen,');
      console.error('  oder nach einer Quelltextaenderung "node bauen.js" vergessen.');
      schlecht++;
    }
    if(schlecht) process.exit(1);
    console.log('OK: ' + ZIELE.length + ' ausgelieferte Datei(en) entsprechen den Quellen (' +
                buf.length + ' Bytes, ' + man.dateien.length + ' Module).');
    process.exit(0);
  }

  for(const z of ZIELE){
    const ZIEL = path.join(WURZEL, z);
    fs.mkdirSync(path.dirname(ZIEL), {recursive:true});
    fs.writeFileSync(ZIEL, buf);
  }
  console.log('gebaut: ' + ZIELE.join(', ') + ' — ' + buf.length + ' Bytes aus ' +
              man.dateien.length + ' Modulen, SHA256 ' + hash(buf).slice(0, 16));
  process.exit(0);
}catch(e){
  console.error('FEHLER: ' + e.message);
  process.exit(1);
}
