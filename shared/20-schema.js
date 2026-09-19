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

/* ---- Austausch mit DZ CAM (19.09.2026, Bericht Teil 3, Luecken 1, 3, 6) ----------
   Drei Dateien zwischen den Schwestern - jede traegt format und version im Kopf, damit
   die Gegenseite eine falsche Datei ERKENNT statt stumm Unsinn zu rechnen. DOM-frei:
   der Pruefstand rechnet die Uebernahme nach. */
const CAM_ZEIT_FORMAT = 'dz-cam-zeit';
function camZeitPruefen(j){
  const f = [];
  const zahl = (v) => typeof v === 'number' && isFinite(v);
  if(!j || typeof j !== 'object') return ['Keine Zeit-Datei.'];
  if(j.format !== CAM_ZEIT_FORMAT) f.push('format ist "' + j.format + '", erwartet "' + CAM_ZEIT_FORMAT + '".');
  if(+j.version !== 1) f.push('version ' + j.version + ' unbekannt (erwartet 1).');
  if(j.quelle !== 'drehen' && j.quelle !== 'fraesen') f.push('quelle muss drehen oder fraesen sein.');
  if(!j.programm || typeof j.programm.name !== 'string') f.push('programm.name fehlt.');
  const z = j.zeiten;
  if(!z || !zahl(z.komplett_min) || z.komplett_min < 0) f.push('zeiten.komplett_min fehlt (Laufzeit in Minuten, mit Werkzeugwechseln).');
  else ['schnitt_min', 'werkzeuge', 'wechsel'].forEach(k => { if(z[k] != null && !zahl(z[k])) f.push('zeiten.' + k + ' ist keine Zahl.'); });
  if(j.aufspannungen != null && !zahl(j.aufspannungen)) f.push('aufspannungen ist keine Zahl.');
  return f;
}
/* Was aus der Zeit-Datei in die Kalkulation geht: die HAUPTZEIT ist die Laufzeit
   des Programms mit Werkzeugwechseln (das ist die Zeit, die an der Maschine
   vergeht); die RUESTZEIT kommt aus der Werkzeugzahl (Grundwert plus Minuten je
   Werkzeug, Blatt 5); die BEARBEITUNGSSEITEN aus den Aufspannungen. Die Nebenzeit
   bleibt Formel - Spannen und Messen stehen in keinem NC-Programm. */
function camZeitUebernahme(j, V){
  const Z = (V && V.zeiten) || {};
  const z = (j && j.zeiten) || {};
  const aus = { ueber:{ hauptzeit: fRund(+z.komplett_min, 3) }, seiten:null, herkunft:'' };
  if(z.werkzeuge != null && z.werkzeuge > 0){
    const grund = Z.ruest_grund != null ? Z.ruest_grund : 10, je = Z.ruest_je_werkzeug != null ? Z.ruest_je_werkzeug : 3;
    aus.ueber.ruestzeit = fRund(grund + z.werkzeuge * je, 2);
  }
  if(j.aufspannungen != null && j.aufspannungen >= 1) aus.seiten = Math.round(j.aufspannungen);
  const q = j.quelle === 'drehen' ? 'DZ CAM Drehen' : 'DZ CAM Fraesen';
  aus.herkunft = q + ' \u00b7 ' + ((j.programm && j.programm.name) || '') + ((j.programm && j.programm.maschine) ? ' \u00b7 ' + j.programm.maschine : '') +
    ' \u00b7 ' + fMin(+z.komplett_min) + (z.wechsel != null ? ' mit ' + z.wechsel + ' Werkzeugwechseln' : '') +
    (z.werkzeuge != null ? ', ' + z.werkzeuge + ' Werkzeuge' : '') + (j.datum ? ' \u00b7 ' + String(j.datum).slice(0, 10) : '');
  return aus;
}
/* Die Werkstoffliste als Datei fuer die Dreh-App (dort: Kalkulation, Betriebswerte,
   'Werkstoffpreise aus der Pipeline laden'). EINE Quelle statt zwei Listen. */
function wpWerkstoffeDatei(V){
  return { format:'wp-werkstoffe', version:1, datum:new Date().toISOString().slice(0, 10),
    werkstoffe:((V && V.werkstoffe) || []).map(w => ({ name:String(w.name || ''), gruppe:String(w.gruppe || ''),
      dichte:+w.dichte || 0, preis:+w.preis || 0, faktor:+w.faktor || 1, gepflegt:w.gepflegt !== false })) };
}
/* Kernloch -> Gewinde: NUR der exakte Regelkernloch-Durchmesser (DIN 13, M5 bis M20).
   8,5 ist M10; 8,4 ist ein Loch. Aus dem Durchmesser geschlossen - die Tabelle sagt es dazu. */
const WP_KERNLOCH = [['M5', 4.2], ['M6', 5], ['M8', 6.8], ['M10', 8.5], ['M12', 10.2], ['M14', 12], ['M16', 14], ['M18', 15.5], ['M20', 17.5]];
function fGewindeAusKernloch(d){
  const x = +d; if(!isFinite(x)) return null;
  for(const [g, k] of WP_KERNLOCH) if(Math.abs(x - k) < 0.051) return g;
  return null;
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = {SCHEMA_VERSION, neuerDatensatz, schemaPruefen, SCHEMA_KLASSEN, SCHEMA_FORMEN,
                    CAM_ZEIT_FORMAT, camZeitPruefen, camZeitUebernahme, wpWerkstoffeDatei, WP_KERNLOCH, fGewindeAusKernloch,
                    fRund, fZahl, fEuro, fMin, fLesen, fText, fKopie};
}
