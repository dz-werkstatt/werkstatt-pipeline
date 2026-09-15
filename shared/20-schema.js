'use strict';
/* =====================================================================
   shared/20-schema.js — das Austauschformat und die kleinen Werkzeuge
   ---------------------------------------------------------------------
   Das Format aus Abschnitt 6 des Lastenhefts ist VERBINDLICH: spaetere
   Pakete (Konturableitung fuer die Dreh-App, Arbeitsplan, Belegung)
   haengen daran. Deshalb steht es hier als EINE Quelle — als Bauplan
   (neuerDatensatz) und als Wache (schemaPruefen). Bestehende Felder
   werden nie umbenannt; neue kommen dazu.

   Warum eine Wache und nicht nur ein Bauplan: ein Angebot wird als JSON
   gesichert und spaeter wieder geladen, moeglicherweise von einem
   anderen Paket geschrieben. Ein stumm fehlendes Feld faellt sonst erst
   im Preis auf.
   ===================================================================== */

const SCHEMA_VERSION = '1.0';

function neuerDatensatz(){
  return {
    version: SCHEMA_VERSION,
    teil: {
      name: '', zeichnungsnr: '', revision: '',
      klasse: 'fraesteil_3ax',
      werkstoff: '',
      bbox: {x:0, y:0, z:0},
      volumen_cm3: 0, oberflaeche_cm2: 0,
      rotation: {ja:false, achse:'Z', dmax:0, laenge:0, innen:false},
      bohrungen: [],
      flaechen: 0, kanten: 0
    },
    rohteil: {form:'flach', masse:{}, volumen_cm3:0},
    kalkulation: {parameter:{}, zeiten:{}, preise:{}},
    quelle: {step:'', pdf:''}
  };
}

const SCHEMA_KLASSEN = ['drehteil_einfach', 'drehteil_fraes', 'fraesteil_3ax', 'fraesteil_komplex'];
const SCHEMA_FORMEN  = ['rund', 'flach', 'sechskant', 'rohr'];

/* Liefert eine Liste der Beanstandungen; leer heisst in Ordnung.
   Geprueft wird das Geruest, nicht die Plausibilitaet der Zahlen —
   ob ein Volumen SINNVOLL ist, entscheidet die Geometrie (31). */
function schemaPruefen(d){
  const f = [];
  const zahl = (v) => typeof v === 'number' && isFinite(v);
  if(!d || typeof d !== 'object') return ['Datensatz fehlt.'];
  if(d.version !== SCHEMA_VERSION) f.push('Version ist "' + d.version + '", erwartet "' + SCHEMA_VERSION + '".');
  const t = d.teil;
  if(!t || typeof t !== 'object') return f.concat(['teil fehlt.']);
  ['name', 'zeichnungsnr', 'revision', 'klasse', 'werkstoff'].forEach(k => {
    if(typeof t[k] !== 'string') f.push('teil.' + k + ' ist kein Text.');
  });
  if(t.klasse && SCHEMA_KLASSEN.indexOf(t.klasse) < 0) f.push('teil.klasse "' + t.klasse + '" ist keine der vier Klassen.');
  if(!t.bbox || !zahl(t.bbox.x) || !zahl(t.bbox.y) || !zahl(t.bbox.z)) f.push('teil.bbox unvollstaendig.');
  if(!zahl(t.volumen_cm3)) f.push('teil.volumen_cm3 fehlt.');
  if(!zahl(t.oberflaeche_cm2)) f.push('teil.oberflaeche_cm2 fehlt.');
  const r = t.rotation;
  if(!r || typeof r.ja !== 'boolean' || !zahl(r.dmax) || !zahl(r.laenge) || typeof r.innen !== 'boolean')
    f.push('teil.rotation unvollstaendig.');
  if(!Array.isArray(t.bohrungen)) f.push('teil.bohrungen ist keine Liste.');
  else t.bohrungen.forEach((b, i) => {
    if(!zahl(b.d) || !zahl(b.tiefe) || typeof b.durch !== 'boolean')
      f.push('teil.bohrungen[' + i + '] unvollstaendig (d, tiefe, durch).');
  });
  if(!zahl(t.flaechen) || !zahl(t.kanten)) f.push('teil.flaechen/kanten fehlen.');
  const ro = d.rohteil;
  if(!ro || typeof ro !== 'object') f.push('rohteil fehlt.');
  else{
    if(SCHEMA_FORMEN.indexOf(ro.form) < 0) f.push('rohteil.form "' + ro.form + '" ist keine bekannte Form.');
    if(!ro.masse || typeof ro.masse !== 'object') f.push('rohteil.masse fehlt.');
    if(!zahl(ro.volumen_cm3)) f.push('rohteil.volumen_cm3 fehlt.');
  }
  if(!d.kalkulation || typeof d.kalkulation !== 'object') f.push('kalkulation fehlt.');
  else ['parameter', 'zeiten', 'preise'].forEach(k => {
    if(!d.kalkulation[k] || typeof d.kalkulation[k] !== 'object') f.push('kalkulation.' + k + ' fehlt.');
  });
  if(!d.quelle || typeof d.quelle.step !== 'string' || typeof d.quelle.pdf !== 'string')
    f.push('quelle unvollstaendig.');
  return f;
}

/* ---- Kleine Werkzeuge ----------------------------------------------
   Anzeige mit Dezimalkomma, intern immer Punkt (Lastenheft Abschnitt 2). */
function fRund(v, n){ const p = Math.pow(10, n == null ? 3 : n); return Math.round(v * p) / p; }
function fZahl(v, n){
  if(v == null || !isFinite(v)) return '—';
  return Number(v).toFixed(n == null ? 2 : n).replace('.', ',');
}
function fEuro(v){ return fZahl(v, 2) + ' €'; }
/* Minuten als m:ss — eine Zeit liest man nicht als 7,43 min */
function fMin(v){
  if(v == null || !isFinite(v)) return '—';
  const s = Math.round(v * 60), m = Math.floor(s / 60);
  return m + ':' + String(s - m * 60).padStart(2, '0') + ' min';
}
/* Eingaben kommen mit Komma herein (am iPhone getippt) */
function fLesen(s){
  if(typeof s === 'number') return s;
  const v = parseFloat(String(s == null ? '' : s).replace(',', '.').trim());
  return isFinite(v) ? v : NaN;
}
function fText(s){ return String(s == null ? '' : s); }
/* Eine tiefe Kopie ohne Verweise — gespeicherte Staende duerfen sich
   nicht nachtraeglich aendern, wenn im Blatt weitergerechnet wird. */
function fKopie(o){ return JSON.parse(JSON.stringify(o)); }

if(typeof module !== 'undefined' && module.exports){
  module.exports = {SCHEMA_VERSION, neuerDatensatz, schemaPruefen, SCHEMA_KLASSEN, SCHEMA_FORMEN,
                    fRund, fZahl, fEuro, fMin, fLesen, fText, fKopie};
}
