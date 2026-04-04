// CD & Co ERP — FX
// ====================================

// ══════════════════════════════════════════
// FX — CAMBIOS CHACO (Auto-update via Melizeche API)
// ══════════════════════════════════════════
async function fetchRate(){
  const btn=g('fx-rb');const errEl=g('fx-err');
  if(btn)btn.classList.add('spin');if(errEl)errEl.style.display='none';
  try{
    // Usamos la API de dolar.melizeche.com (libre, sin CORS y confiable para PY)
    const res = await fetch('https://dolar.melizeche.com/api/1.0/');
    if(!res.ok) throw new Error('API Error');
    const data = await res.json();
    
    if(!data.dolarpy || !data.dolarpy.cambioschaco) throw new Error('No Chaco data');
    
    const chaco = data.dolarpy.cambioschaco;
    FX.buy = chaco.compra;
    FX.sell = chaco.venta;
    FX.ts = new Date();
    FX.manual = false; 
    
    renderFx();
    saveFx();
    convertFx();
    toast('◆ Tipo de cambio actualizado automáticamente');
  }catch(e){
    console.error('FX Fetch Error:', e);
    // Fallback al caché si falla la red
    try{
      const c=JSON.parse(localStorage.getItem('cdco_fx')||'{}');
      if(c.buy&&c.sell){
        FX.buy=c.buy;FX.sell=c.sell;FX.ts=new Date(c.ts);FX.manual=!!c.manual;
        renderFx();convertFx();
        if(errEl){errEl.textContent=FX.manual?'⚡ Usando datos manuales':'⚡ Usando datos en caché';errEl.style.display='block';}
        return;
      }
    }catch(ce){}
    if(g('fx-dot'))g('fx-dot').className='fx-dot err';
    if(errEl){errEl.textContent='⚠ No se pudo obtener cotización';errEl.style.display='block';}
  }finally{if(btn)btn.classList.remove('spin')}
}

function renderFx(){
  if(g('fx-buy'))g('fx-buy').textContent='₲ '+Math.round(FX.buy).toLocaleString('es');
  if(g('fx-sell'))g('fx-sell').textContent='₲ '+Math.round(FX.sell).toLocaleString('es');
  if(g('fx-up'))g('fx-up').textContent=(FX.manual?'Manual: ':'Actualizado: ')+(FX.ts?FX.ts.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}):'---');
  if(g('fx-dot'))g('fx-dot').className='fx-dot '+(FX.manual?'neu':(FX.buy?'live':'err'));
}

function saveFx(){
  try{localStorage.setItem('cdco_fx',JSON.stringify({buy:FX.buy,sell:FX.sell,ts:FX.ts?FX.ts.toISOString():null,manual:FX.manual}))}catch(e){}
  if(typeof lsave==='function')lsave();
}

function onFxEdit(el, field){
  let val=el.textContent.replace(/[^\d]/g,'');
  let num=parseInt(val);
  if(!num||isNaN(num)){renderFx();return}
  if(field==='buy')FX.buy=num;else FX.sell=num;
  FX.ts=new Date();
  FX.manual=true;
  renderFx();
  saveFx();
  convertFx();
  toast('◆ Tipo de cambio ajustado manualmente');
}

function convertFx(){const val=parseFloat(g('fx-inp')?.value)||0;const res=g('fx-res');if(!res)return;if(!val||!FX.buy){res.textContent='—';return}res.textContent=FX.dir==='usd2pyg'?'₲ '+Math.round(val*FX.sell).toLocaleString('es'):'$ '+(val/FX.buy).toLocaleString('es',{minimumFractionDigits:2,maximumFractionDigits:2})}
function toggleFxDir(){FX.dir=FX.dir==='usd2pyg'?'pyg2usd':'usd2pyg';const inp=g('fx-inp');if(inp){inp.placeholder=FX.dir==='usd2pyg'?'100':'700000';inp.style.color=FX.dir==='pyg2usd'?'var(--g)':''}convertFx()}

function initFx(){
  try{
    const c=JSON.parse(localStorage.getItem('cdco_fx')||'{}');
    if(c.buy&&c.sell){
      FX.buy=c.buy;FX.sell=c.sell;FX.ts=new Date(c.ts);FX.manual=!!c.manual;
      renderFx();convertFx();
      const age=(Date.now()-FX.ts.getTime())/60000;
      // Si es manual, NO actualizamos automáticamente. Si es auto y tiene <30 min, tampoco.
      if(FX.manual || age<30) return;
    }
  }catch(e){}
  if(!FX.manual) fetchRate();
  setInterval(()=>{if(!FX.manual)fetchRate()},30*60*1000);
}
