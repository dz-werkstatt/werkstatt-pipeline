/* =====================================================================
   domstub.js — so viel Browser, dass die App in Node laeuft
   ---------------------------------------------------------------------
   Nur das, was die Oberflaeche anfasst. Er RASTERT NICHT: die Leinwand
   nimmt Aufrufe entgegen und tut nichts. Alles, was ein Bild beurteilt,
   gehoert deshalb in eine Aufnahme im echten Browser, nicht hierher.
   Dieselbe Grenze wie beim domstub der Schwester-Apps.
   ===================================================================== */
'use strict';

function stubCtx(){
  const f = () => {};
  return {
    canvas:null, fillStyle:'', strokeStyle:'', lineWidth:1, lineJoin:'', font:'', textAlign:'',
    setTransform:f, clearRect:f, fillRect:f, beginPath:f, moveTo:f, lineTo:f, closePath:f,
    fill:f, stroke:f, arc:f, save:f, restore:f, translate:f, scale:f, rotate:f,
    setLineDash:f, fillText:f, strokeText:f, drawImage:f,
    measureText:() => ({width:0}),
    createLinearGradient:() => ({addColorStop:f}),
    getImageData:() => ({data:[]})
  };
}

function stubEl(tag, id){
  const e = {
    tagName:String(tag || 'div').toUpperCase(), id:id || '', value:'', textContent:'', innerHTML:'',
    type:'text', checked:false, files:[], width:300, height:150, clientWidth:600, clientHeight:300,
    offsetTop:0, scrollWidth:600, style:{}, dataset:{}, kinder:[], _h:{},
    classList:{
      _s:{},
      add(c){ this._s[c] = 1; }, remove(c){ delete this._s[c]; },
      toggle(c, an){ if(an) this._s[c] = 1; else delete this._s[c]; },
      contains(c){ return !!this._s[c]; }
    },
    addEventListener(t, fn){ (this._h[t] = this._h[t] || []).push(fn); },
    removeEventListener(){},
    dispatch(t, ev){ (this._h[t] || []).forEach(fn => fn(ev || {preventDefault(){}, target:this})); },
    appendChild(k){ this.kinder.push(k); return k; },
    removeChild(k){ const i = this.kinder.indexOf(k); if(i >= 0) this.kinder.splice(i, 1); return k; },
    setAttribute(n, v){ this[n] = v; if(n.indexOf('data-') === 0) this.dataset[n.slice(5)] = v; },
    getAttribute(n){ return this[n] != null ? this[n] : null; },
    querySelectorAll(){ return []; },
    getContext(){ const c = stubCtx(); c.canvas = this; return c; },
    toDataURL(){ return 'data:image/png;base64,'; },
    click(){ this.dispatch('click'); },
    focus(){}, blur(){}
  };
  e.parentNode = null;
  return e;
}

const stubSpeicher = {};
const domstub = {
  einbauen(){
    const elemente = {};
    const doc = {
      readyState:'complete',
      body: stubEl('body'),
      getElementById(id){ return elemente[id] || (elemente[id] = stubEl('div', id)); },
      createElement(t){ return stubEl(t); },
      querySelectorAll(){ return []; },
      querySelector(){ return null; },
      addEventListener(){},
      write(){}, close(){}, open(){}
    };
    global.document = doc;
    global.window = {
      devicePixelRatio:1, innerWidth:1280, innerHeight:900,
      addEventListener(){}, removeEventListener(){}, scrollTo(){},
      open(){ return null; },
      location:{reload(){}},
      setTimeout:setTimeout, clearTimeout:clearTimeout
    };
    global.localStorage = {
      getItem(k){ return stubSpeicher[k] != null ? stubSpeicher[k] : null; },
      setItem(k, v){ stubSpeicher[k] = String(v); },
      removeItem(k){ delete stubSpeicher[k]; }
    };
    /* Node 24 bringt selbst ein navigator mit, das sich nur lesen
       laesst — ueberschrieben wird es deshalb ueber die Eigenschaft. */
    try{ Object.defineProperty(global, 'navigator', {value:{userAgent:'domstub'}, configurable:true, writable:true}); }
    catch(e){ /* dann bleibt das von Node, das genuegt auch */ }
    global.Blob = function(){ };
    global.URL = {createObjectURL(){ return 'blob:x'; }, revokeObjectURL(){}};
    global.FileReader = function(){ this.readAsText = function(){}; };
    global.performance = global.performance || {now: () => Date.now()};
    global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    return {elemente:elemente, document:doc};
  },
  speicher: stubSpeicher
};

module.exports = domstub;
