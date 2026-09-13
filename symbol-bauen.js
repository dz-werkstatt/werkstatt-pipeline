/* =====================================================================
   symbol-bauen.js — das Symbol fuer den Home-Bildschirm
   ---------------------------------------------------------------------
   iOS nimmt fuer eine Verknuepfung auf dem Home-Bildschirm nur ein PNG;
   ein SVG wird ignoriert und stattdessen ein Bildschirmfoto der Seite
   verwendet, was unleserlich aussieht. Erzeugt wird es hier von Hand
   (Node bringt zlib mit) statt eine Bilddatei ins Repo zu legen, damit
   das Symbol dieselbe Quelle hat wie alles andere: Code.

   Motiv wie das Browsersymbol: ein Rohteilrahmen, darin das Fertigteil.

     node symbol-bauen.js
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function png(breite, hoehe, pixel){
  const roh = Buffer.alloc((breite * 4 + 1) * hoehe);
  let o = 0;
  for(let y = 0; y < hoehe; y++){
    roh[o++] = 0;                                   /* Filter: keiner */
    for(let x = 0; x < breite; x++){
      const p = pixel(x, y);
      roh[o++] = p[0]; roh[o++] = p[1]; roh[o++] = p[2]; roh[o++] = 255;
    }
  }
  const teil = (typ, daten) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(daten.length, 0);
    const t = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(t) >>> 0, 0);
    return Buffer.concat([l, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0); ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    teil('IHDR', ihdr),
    teil('IDAT', zlib.deflateSync(roh, {level:9})),
    teil('IEND', Buffer.alloc(0))
  ]);
}
let tab = null;
function crc(buf){
  if(!tab){
    tab = new Int32Array(256);
    for(let n = 0; n < 256; n++){
      let c = n;
      for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      tab[n] = c;
    }
  }
  let c = -1;
  for(let i = 0; i < buf.length; i++) c = tab[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return c ^ -1;
}

function symbol(n){
  const blau = [0x18, 0x58, 0xa0], weiss = [255, 255, 255];
  const s = n / 64;                                  /* Motiv in 64er-Einheiten */
  return png(n, n, (x, y) => {
    const u = x / s, v = y / s;
    /* Rohteilrahmen 14..50 / 18..46, Strichstaerke 2,5, gestrichelt */
    const inRahmen = (u > 13 && u < 51 && v > 17 && v < 47);
    const innen = (u > 16.5 && u < 47.5 && v > 20.5 && v < 43.5);
    if(inRahmen && !innen){
      const laengs = (v <= 20.5 || v >= 43.5);
      const t = laengs ? u : v;
      if(Math.floor(t / 3.5) % 2 === 0) return weiss;   /* Strichelung */
      return blau;
    }
    /* Fertigteil 21..43 / 25..39 mit gebrochenen Ecken */
    if(u > 20.5 && u < 43.5 && v > 24.5 && v < 39.5){
      const dx = Math.max(0, Math.max(21.5 - u, u - 42.5));
      const dy = Math.max(0, Math.max(25.5 - v, v - 38.5));
      if(dx + dy < 1.6) return blau;
      return weiss;
    }
    return blau;
  });
}

const ziel = path.join(__dirname, 'docs');
fs.mkdirSync(ziel, {recursive:true});
[180, 192, 512].forEach(n => {
  fs.writeFileSync(path.join(ziel, 'symbol-' + n + '.png'), symbol(n));
});
fs.writeFileSync(path.join(ziel, 'manifest.webmanifest'), JSON.stringify({
  name:'Werkstatt-Pipeline', short_name:'Angebot', lang:'de',
  start_url:'./', scope:'./', display:'standalone',
  background_color:'#f7f9fb', theme_color:'#1858a0',
  icons:[
    {src:'symbol-192.png', sizes:'192x192', type:'image/png'},
    {src:'symbol-512.png', sizes:'512x512', type:'image/png', purpose:'any maskable'}
  ]
}, null, 1) + '\n');
console.log('Symbole und Manifest in docs/ erzeugt.');
