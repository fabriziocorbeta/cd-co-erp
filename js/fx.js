// CD & Co ERP — FX (Pizarra de Cambios Multi-Divisa)
// ====================================================
//
// FUENTES DE DATOS:
//   1. Melizeche API  → USD/PYG (Cambios Chaco, Paraguay)
//      URL: https://dolar.melizeche.com/api/1.0/
//      Retorna: data.dolarpy.cambioschaco.{compra, venta}
//
//   2. Open ER API    → cross rates (EUR, ARS, BRL) vs USD
//      URL: https://open.er-api.com/v6/latest/USD
//      Retorna: data.rates.{EUR, ARS, BRL, PYG}
//      Licencia: free, sin API key, CORS habilitado
//
// CÁLCULO CROSS-RATE:
//   1 EUR en PYG = (1 / erRates.EUR) * chacoUSD.venta
//   → erRates.EUR = 0.868 → 1 EUR = 1.152 USD → * 6500 = 7487 ₲
//
// PERSISTENCIA:
//   localStorage('cdco_fx_v2') — incluye todas las monedas
//   FX.currencies es accesible desde fleet.js, profitability.js, etc.
// ====================================================

// ── FETCH: dual-API paralelo ──────────────────────────────────────
async function fetchRate(){
  const btn=g('fx-rb'); const errEl=g('fx-err');
  if(btn) btn.classList.add('spin');
  if(errEl) errEl.style.display='none';

  try {
    // Llamadas paralelas: Cambios Chaco (USD/PYG) + Open ER API (cross rates)
    const [chRes, erRes] = await Promise.allSettled([
      fetch('https://dolar.melizeche.com/api/1.0/').then(r=>r.ok?r.json():Promise.reject('chaco-err')),
      fetch('https://open.er-api.com/v6/latest/USD').then(r=>r.ok?r.json():Promise.reject('er-err'))
    ]);

    // ── USD/PYG desde Cambios Chaco ──────────────────────────────
    let usdBuy = FX.buy || 6420;
    let usdSell = FX.sell || 6500;

    if(chRes.status === 'fulfilled'){
      const chaco = chRes.value?.dolarpy?.cambioschaco;
      if(chaco?.compra && chaco?.venta){
        usdBuy  = chaco.compra;
        usdSell = chaco.venta;
      }
    }

    // Actualizar legados USD para compatibilidad con resto del sistema
    FX.buy  = usdBuy;
    FX.sell = usdSell;
    FX.currencies.USD.buy  = usdBuy;
    FX.currencies.USD.sell = usdSell;

    // ── Cross rates EUR, ARS, BRL ─────────────────────────────────
    // open.er-api retorna: 1 USD = N unidades de cada moneda
    // → 1 EUR = (1/erRates.EUR) USD = (1/erRates.EUR)*usdSell ₲
    if(erRes.status === 'fulfilled'){
      const rates = erRes.value?.rates || {};
      ['EUR','ARS','BRL'].forEach(cur => {
        const perUsd = rates[cur];
        if(perUsd && perUsd > 0){
          FX.currencies[cur].buy  = usdBuy  / perUsd;
          FX.currencies[cur].sell = usdSell / perUsd;
        }
      });
    } else {
      // Fallback: mantener valores del caché para cross rates
      const cached = _loadFxCache();
      if(cached?.currencies){
        ['EUR','ARS','BRL'].forEach(cur=>{
          if(cached.currencies[cur]?.buy) FX.currencies[cur].buy  = cached.currencies[cur].buy;
          if(cached.currencies[cur]?.sell) FX.currencies[cur].sell = cached.currencies[cur].sell;
        });
      }
    }

    FX.ts     = new Date();
    FX.manual = false;

    renderFx();
    saveFx();
    convertFx();
    toast('◆ Pizarra de cambios actualizada');

  } catch(e) {
    console.error('[FX] fetchRate error:', e);
    // Fallback total al caché
    const cached = _loadFxCache();
    if(cached?.buy){
      _applyFxCache(cached);
      renderFx(); convertFx();
      if(errEl){ errEl.textContent='⚡ Datos en caché'; errEl.style.display='block'; }
      return;
    }
    if(g('fx-dot')) g('fx-dot').className='fx-dot err';
    if(errEl){ errEl.textContent='⚠ No se pudo obtener cotización'; errEl.style.display='block'; }
  } finally {
    if(btn) btn.classList.remove('spin');
  }
}

// ── RENDER: actualiza la pizarra completa ─────────────────────────
function renderFx(){
  // Tarjetas de monedas
  Object.entries(FX.currencies).forEach(([cur, d])=>{
    const buyEl  = g('fxb-'+cur);
    const sellEl = g('fxs-'+cur);
    if(!buyEl && !sellEl) return;
    const decimals = (cur==='ARS'||cur==='BRL') ? 2 : 0;
    const fmt = v => cur==='ARS' ? v.toFixed(2) : Math.round(v).toLocaleString('es');
    if(buyEl)  buyEl.textContent  = d.buy  > 0 ? '₲'+fmt(d.buy)  : '—';
    if(sellEl) sellEl.textContent = d.sell > 0 ? '₲'+fmt(d.sell) : '—';
  });

  // fx-buy / fx-sell son alias de fxb-USD / fxs-USD (ya renderizados arriba)

  // Footer: timestamp + dot de estado
  const timeStr = FX.ts ? FX.ts.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) : '---';
  if(g('fx-up')) g('fx-up').textContent = (FX.manual?'Manual: ':'Actualizado: ') + timeStr;
  if(g('fx-dot')) g('fx-dot').className = 'fx-dot ' + (FX.manual?'neu': (FX.buy?'live':'err'));
}

// ── CONVERSOR multi-moneda ────────────────────────────────────────
function convertFx(){
  const val = parseFloat(g('fx-inp')?.value) || 0;
  const res  = g('fx-res');
  if(!res) return;

  const selEl = g('fx-cur-sel');
  const cur   = selEl ? selEl.value : (FX.cur || 'USD');
  FX.cur = cur;

  const d = FX.currencies[cur];
  if(!val || !d || !d.sell){ res.textContent='—'; return; }

  // Siempre convertimos → PYG (a la venta, que es lo que el usuario paga)
  const pyg = val * d.sell;
  res.textContent = '₲ ' + Math.round(pyg).toLocaleString('es');

  // Actualizar label
  const lbl = g('fx-conv-lbl');
  if(lbl) lbl.textContent = `${d.flag} ${cur} → ₲`;
}

// ── EDICIÓN MANUAL USD ────────────────────────────────────────────
function onFxEdit(el, field){
  let val = el.textContent.replace(/[^\d.,]/g,'').replace(',','.');
  let num = parseFloat(val);
  if(!num || isNaN(num)){ renderFx(); return; }
  if(field==='buy')  { FX.buy = num; FX.currencies.USD.buy  = num; }
  else               { FX.sell= num; FX.currencies.USD.sell = num; }
  FX.ts     = new Date();
  FX.manual = true;
  renderFx(); saveFx(); convertFx();
  toast('◆ USD ajustado manualmente');
}

// ── PERSISTENCIA ──────────────────────────────────────────────────
function saveFx(){
  try {
    const payload = {
      buy: FX.buy, sell: FX.sell,
      ts:  FX.ts ? FX.ts.toISOString() : null,
      manual: FX.manual,
      currencies: {}
    };
    Object.entries(FX.currencies).forEach(([cur,d])=>{
      payload.currencies[cur] = { buy: d.buy, sell: d.sell };
    });
    localStorage.setItem('cdco_fx_v2', JSON.stringify(payload));
    // Mantener legacy key para compatibilidad
    localStorage.setItem('cdco_fx', JSON.stringify({buy:FX.buy,sell:FX.sell,ts:payload.ts,manual:FX.manual}));
  } catch(e){}
  if(typeof lsave==='function') lsave();
}

function _loadFxCache(){
  try { return JSON.parse(localStorage.getItem('cdco_fx_v2')||'{}'); } catch(e){ return {}; }
}

function _applyFxCache(c){
  if(c.buy)  { FX.buy=c.buy; FX.currencies.USD.buy=c.buy; }
  if(c.sell) { FX.sell=c.sell; FX.currencies.USD.sell=c.sell; }
  if(c.ts)   FX.ts = new Date(c.ts);
  FX.manual = !!c.manual;
  if(c.currencies){
    Object.entries(c.currencies).forEach(([cur,d])=>{
      if(FX.currencies[cur]){
        if(d.buy)  FX.currencies[cur].buy  = d.buy;
        if(d.sell) FX.currencies[cur].sell = d.sell;
      }
    });
  }
}

// ── INIT ──────────────────────────────────────────────────────────
function initFx(){
  // 1. Cargar caché primero para render inmediato
  const cached = _loadFxCache();
  if(cached?.buy){
    _applyFxCache(cached);
    renderFx(); convertFx();
    const age = FX.ts ? (Date.now()-FX.ts.getTime())/60000 : 999;
    if(FX.manual || age < 30) return; // no refrescar si es manual o tiene <30min
  }
  // 2. Actualizar desde las APIs
  fetchRate();
  // 3. Auto-refresh cada 30min
  setInterval(()=>{ if(!FX.manual) fetchRate(); }, 30*60*1000);
}

// Self-invoke: runs when fx.js finishes loading so FX initializes
// even if the auth callback fired before this script was ready.
initFx();
