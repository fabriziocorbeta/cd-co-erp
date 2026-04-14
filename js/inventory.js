// CD & Co ERP — INVENTORY
// ====================================

// ══════════════════════════════════════════
// INVENTORY
// ══════════════════════════════════════════
let invFlt='all';
function setInvFlt(f,btn){invFlt=f;document.querySelectorAll('#page-inventory .flt').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderInventory()}

// ── ALERT LOGIC ──
function checkStockAlert(product) {
  if (!product) return '';
  if (product.stock <= product.minStock) return 'low-stock-alert';
  return '';
}

// ── DÍAS EN STOCK ──
// Usa la fecha de la última transacción de stock entrada (compra) del producto,
// o la fecha de created_at si no hay txs de entrada
function daysInStock(p) {
  // Buscar la última tx de entrada de stock ligada al producto
  const entryTxs = (S.txs || []).filter(t =>
    t._product_id === p.id && t.type === 'expense' && (t.cat || '').toLowerCase().includes('stock')
  );
  let refDate = null;
  if (entryTxs.length > 0) {
    refDate = entryTxs.map(t => new Date(t.date)).sort((a, b) => b - a)[0];
  } else if (p.created_at) {
    refDate = new Date(p.created_at);
  }
  if (!refDate) return null;
  return Math.floor((Date.now() - refDate.getTime()) / (1000 * 60 * 60 * 24));
}

function renderInventory(){
  const q=(g('inv-search')?.value||'').toLowerCase();
  const cat=g('inv-cat-flt')?.value||'';
  let prods=[...(S.products||[])];
  if(invFlt==='low')prods=prods.filter(p=>p.stock>0&&p.stock<=(p.minStock||0));
  else if(invFlt==='out')prods=prods.filter(p=>(p.stock||0)<=0);
  if(q)prods=prods.filter(p=>(p.name||'').toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q)||(p.cat||'').toLowerCase().includes(q));
  if(cat)prods=prods.filter(p=>p.cat===cat);
  const grid=g('inv-grid');
  if(!grid)return;

  // ── Actualizar panel resumen de valor total ──
  const fxS = (FX && FX.sell) ? FX.sell : 7200;
  const allProds = S.products || [];
  const totalValPYG = allProds.reduce((s,p)=>{
    const bp = parseFloat(p.buyPrice)||0, sk = parseInt(p.stock)||0;
    return s + (p.cur==='$' ? bp*sk*fxS : bp*sk);
  },0);
  const totalValUSD = allProds.reduce((s,p)=>{
    const sp = parseFloat(p.sellPrice)||0, sk = parseInt(p.stock)||0;
    return s + (p.cur==='$' ? sp*sk : sp*sk/fxS);
  },0);
  const elTotPYG = g('inv-total-pyg');
  const elTotUSD = g('inv-total-usd');
  const elTotCnt = g('inv-total-cnt');
  if(elTotPYG) elTotPYG.textContent = fmt(totalValPYG,'₲');
  if(elTotUSD) elTotUSD.textContent = fmt(totalValUSD,'$');
  if(elTotCnt) elTotCnt.textContent = allProds.length + ' productos';

  if(!prods.length){grid.innerHTML='<div class="tbl-empty" style="grid-column:1/-1;padding:32px">Sin productos. Agregá el primero.</div>';return}
  grid.innerHTML=prods.map(p=>{
    // Normalizar campos nulos para evitar errores de render
    p.name     = p.name     || '(sin nombre)';
    p.sku      = p.sku      || '—';
    p.cat      = p.cat      || 'Otros';
    p.buyPrice = parseFloat(p.buyPrice)  || 0;
    p.sellPrice= parseFloat(p.sellPrice) || 0;
    p.stock    = parseInt(p.stock)       || 0;
    p.minStock = parseInt(p.minStock)    || 2;

    const sup=S.contacts.find(c=>c.id===p.sup);
    const stockClass=p.stock<=0?'stock-out':p.stock<=p.minStock?'stock-low':'stock-ok';
    const margin=p.buyPrice>0?Math.round((p.sellPrice-p.buyPrice)/p.buyPrice*100):0;
    const alertClass=checkStockAlert(p);
    const dias = daysInStock(p);
    const isCriticalStock = p.stock < 2;
    const isLiquidation = dias !== null && dias > 60 && p.stock > 0;

    // Dual currency calculation
    const cur = p.cur || '₲';
    const otherCur = cur === '$' ? '₲' : '$';
    const fxBuy = (FX && FX.buy) ? FX.buy : 7200;
    const fxSell = (FX && FX.sell) ? FX.sell : 7200;
    const rate = cur === '$' ? fxBuy : (1/fxSell);

    // Converted values
    const buyConv = cur === '$' ? p.buyPrice * fxBuy : p.buyPrice / fxSell;
    const sellConv = cur === '$' ? p.sellPrice * fxBuy : p.sellPrice / fxSell;

    return `<div class="pcard ${alertClass}">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">
        <div class="pcard-cat">${p.cat} · ${p.sku}</div>
        ${isCriticalStock && p.stock > 0 ? '<span class="badge-stock-low">⚠ STOCK BAJO</span>' : ''}
        ${p.stock <= 0 ? '<span class="badge-stock-out">✕ SIN STOCK</span>' : ''}
        ${isLiquidation ? '<span class="badge-liquidation">💸 LIQUIDACIÓN</span>' : ''}
      </div>
      <div class="pcard-name">${p.name}</div>
      ${p.variant?`<div style="font-size:.68rem;color:var(--m3);margin-top:2px">🎨 ${p.variant}</div>`:''}
      ${p.serialNumber?`<div style="font-size:.68rem;color:var(--mu);margin-top:2px;font-family:var(--fm)">🔖 ${p.serialNumber}</div>`:''}
      ${p.desc?`<div style="font-size:.68rem;color:var(--m3);margin-top:2px">${p.desc}</div>`:''}
      ${sup?`<div style="font-size:.62rem;color:var(--mu);margin-top:4px;font-family:var(--fm)">📦 ${sup.name}</div>`:''}
      <div class="pcard-prices">
        <div class="pcard-price">
          <div class="pcard-price-l">Compra</div>
          <div class="pcard-price-v">
            <div style="font-weight:600">${fmt(p.buyPrice, cur)}</div>
            <div style="font-size:.6rem;color:var(--mu);margin-top:1px">${fmt(buyConv, otherCur)}</div>
          </div>
        </div>
        <div class="pcard-price">
          <div class="pcard-price-l">Venta</div>
          <div class="pcard-price-v" style="color:var(--g2)">
            <div style="font-weight:600">${fmt(p.sellPrice, cur)}</div>
            <div style="font-size:.6rem;color:var(--mu);margin-top:1px">${fmt(sellConv, otherCur)}</div>
          </div>
        </div>
        <div class="pcard-price"><div class="pcard-price-l">Margen</div><div class="pcard-price-v" style="color:var(--pos)">${margin}%</div></div>
      </div>
      <div class="pcard-stock">
        <div>
          <span class="mono ${stockClass}" style="font-size:.8rem;font-weight:600">${p.stock} u.</span>
          <span style="font-size:.6rem;color:var(--m3);font-family:var(--fm);margin-left:5px">mín: ${p.minStock}</span>
        </div>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
          ${p.stock<=0?'<span class="pill pill-neg">Sin stock</span>':p.stock<=p.minStock?'<span class="pill pill-warn">Stock bajo</span>':'<span class="pill pill-pos">En stock</span>'}
          ${dias !== null ? `<span class="pill" style="background:var(--bg4);color:var(--mu);font-size:.6rem">${dias}d en stock${isLiquidation?' · Liquidar':''}</span>` : ''}
        </div>
      </div>
      <div style="padding:12px;background:var(--bg2);border-radius:var(--rs);margin-top:8px;border-left:3px solid var(--g)">
        <div style="font-size:.7rem;color:var(--m3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">💰 Valor Acumulado</div>
        <div style="font-family:var(--fm);font-weight:600;color:var(--cr);margin-bottom:6px">${fmt(p.stock * p.buyPrice, cur)}</div>
        <div style="font-size:.6rem;color:var(--mu);font-family:var(--fm)">${fmt(cur === '₲' ? (p.stock * p.buyPrice) / (p.exchangeRate || fxSell) : (p.stock * p.buyPrice) * (p.exchangeRate || fxSell), cur === '₲' ? '$' : '₲')}</div>
        <div style="font-size:.6rem;color:var(--m3);margin-top:6px;padding-top:6px;border-top:1px solid var(--gb)">
          💱 TDC: ${p.exchangeRate ? `Histórico: ${p.exchangeRate.toFixed(0)}` : `Actual: ${fxSell.toFixed(0)}`}
        </div>
      </div>
      <div class="pcard-actions">
        <button class="btn btn-o" onclick="openStockModal('${p.id}')">± Stock</button>
        <button class="btn btn-s" onclick="openProdModal('${p.id}')">✏</button>
        <button class="btn btn-danger" onclick="delProduct('${p.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

function openProdModal(id){
  editIds.prod=id||null;
  const p=id?S.products.find(x=>x.id===id):null;
  g('prod-mttl').textContent=id?'Editar producto':'Nuevo producto';
  g('pr-name').value=p?.name||'';g('pr-sku').value=p?.sku||'';g('pr-cat').value=p?.cat||'Relojes';
  g('pr-var').value=p?.variant||'';
  g('pr-sn').value=p?.serialNumber||'';
  g('pr-sup').value=p?.sup||'';g('pr-buy').value=p?.buyPrice||'';g('pr-sell').value=p?.sellPrice||'';
  g('pr-cur').value=p?.cur||'₲';
  g('pr-stock').value=p?.stock??'';g('pr-min').value=p?.minStock??2;g('pr-desc').value=p?.desc||'';
  g('pr-fx').value=p?.exchangeRate||'';  // 💱 Cargar tipo de cambio histórico
  g('prod-acts').innerHTML=id
    ?`<button class="mb mb-d" onclick="delProduct('${id}');cm('prod-modal')">Eliminar</button><button class="mb mb-gh" onclick="cm('prod-modal')">Cancelar</button><button class="mb mb-g" onclick="saveProd()">Guardar</button>`
    :`<button class="mb mb-gh" onclick="cm('prod-modal')">Cancelar</button><button class="mb mb-g" onclick="saveProd()">Guardar</button>`;
  g('prod-modal').style.display='flex';
}
async function saveProd(){
  const name=g('pr-name').value.trim();if(!name){toast('Ingresá un nombre');return}
  const prod={
    name,
    sku:g('pr-sku').value.trim(),
    cat:g('pr-cat').value,
    variant:g('pr-var').value.trim(),
    serialNumber:g('pr-sn').value.trim(),
    sup:g('pr-sup').value,
    buyPrice:parseFloat(g('pr-buy').value)||0,
    sellPrice:parseFloat(g('pr-sell').value)||0,
    cur:g('pr-cur').value,
    stock:parseInt(g('pr-stock').value)||0,
    minStock:parseInt(g('pr-min').value)||2,
    desc:g('pr-desc').value.trim(),
    exchangeRate: parseFloat(g('pr-fx').value) || null  // 💱 Tipo de cambio histórico
  };

  // 🔄 INTENTAR GUARDAR EN SUPABASE PRIMERO
  if (SB_ON) {
    if (editIds.prod) {
      // UPDATE en Supabase
      prod.id = editIds.prod;
      const sbResult = await sbSaveProduct(prod, false);
      if (!sbResult) return; // Error al guardar en Supabase
    } else {
      // INSERT en Supabase (nuevo producto)
      const sbResult = await sbSaveProduct(prod, true);
      if (!sbResult) return; // Error al guardar en Supabase
      prod.id = sbResult.id; // Usar ID generado por Supabase
    }
  } else {
    // Fallback: generar ID local si Supabase no está disponible
    if (!editIds.prod) prod.id = uid();
    else prod.id = editIds.prod;
  }

  // 💾 GUARDAR EN MEMORIA Y LOCALSTORAGE
  if(editIds.prod){const i=S.products.findIndex(p=>p.id===editIds.prod);if(i>=0)S.products[i]={...S.products[i],...prod};}
  else S.products.push(prod);
  lsave();renderAll();cm('prod-modal');toast('◆ Producto guardado en BD');populateSelects();
}
async function delProduct(id){
  if(!confirm('¿Eliminar producto?'))return;

  // 🗑️ ELIMINAR DE SUPABASE SI ESTÁ CONFIGURADO
  if (SB_ON) {
    const deleted = await sbDeleteProduct(id);
    if (!deleted) {
      toast('❌ Error al eliminar de BD');
      return;
    }
  }

  // 💾 ELIMINAR DE MEMORIA Y LOCALSTORAGE
  S.products=S.products.filter(p=>p.id!==id);
  lsave();renderAll();toast('◆ Producto eliminado');populateSelects();
}

// STOCK
function openStockModal(pid){
  stockProdId=pid;const p=S.products.find(x=>x.id===pid);
  g('stock-mttl').textContent=`Stock: ${p.name}`;g('stk-qty').value='';g('stk-notes').value='';
  g('stock-modal').style.display='flex';
}
async function saveStock(){
  const p=S.products.find(x=>x.id===stockProdId);if(!p)return;
  const qty=parseInt(g('stk-qty').value)||0;const type=g('stk-type').value;const reason=g('stk-reason').value;
  if(qty<=0&&type!=='set'){toast('Ingresá una cantidad');return}
  const prev=p.stock;
  if(type==='in')p.stock+=qty;else if(type==='out'){if(qty>p.stock){toast('No hay suficiente stock');return}p.stock-=qty;}else p.stock=qty;

  // 🔄 ACTUALIZAR STOCK EN SUPABASE
  if (SB_ON) {
    const updateResult = await sbSaveProduct(p, false);
    if (!updateResult) {
      p.stock = prev; // Revertir cambio si falla
      toast('❌ Error al actualizar stock en BD');
      return;
    }
  }

  const notes=g('stk-notes').value;
  // auto tx if set reason is purchase
  if(reason==='Compra a proveedor'&&type==='in'&&p.buyPrice>0){
    const stockTx={id:uid(),type:'expense',desc:`Compra stock: ${p.name} (${qty} u.)`,amount:qty*p.buyPrice,cur:'$',cat:'Stock / Compras',date:today()};
    if(SB_ON){ const saved=await sbSaveTransaction(stockTx); S.txs.push(saved||stockTx); }
    else S.txs.push(stockTx);
    if(typeof recomputeBalances==='function') recomputeBalances();
  }
  toast(`◆ Stock actualizado: ${prev} → ${p.stock} u.`);
  lsave();renderAll();cm('stock-modal');
}

// ── SHOPIFY SYNC (Phase 2) ──
function syncShopify(){
  toast('🔄 Sincronización con Shopify — Próximamente');
  // Fase 2: Conectar con Shopify API real
}

// ── LANDED COST CALCULATOR ──
function openImportModal() {
  const sel = g('imp-prod');
  if(!sel) return;
  sel.innerHTML = '<option value="">Selecciona un producto del inventario...</option>' +
    S.products.map(p => `<option value="${escHtml(p.id)}">${escHtml(p.cat)} · ${escHtml(p.name)} (${escHtml(p.sku)})</option>`).join('');
  
  g('imp-qty').value = '';
  g('imp-cost-usd').value = '';
  g('imp-freight-usd').value = '';
  g('imp-customs-pyg').value = '';
  g('imp-margin').value = '40';
  
  // Set current FX rate display
  const fxSell = (typeof FX !== 'undefined' && FX && FX.sell) ? FX.sell : 7350;
  g('imp-fx-display').textContent = `₲ ${fmt(fxSell, '')}`;
  
  // Pre-fill the specific FX inputs
  g('imp-fx-prod').value = fxSell;
  g('imp-fx-freight').value = fxSell;

  impCalc();
  g('import-modal').style.display = 'flex';
}

function impCalc() {
  const qty = parseInt(g('imp-qty').value) || 0;
  const costUsd = parseFloat(g('imp-cost-usd').value) || 0;
  const fxProd = parseFloat(g('imp-fx-prod').value) || 7350;
  const freightUsd = parseFloat(g('imp-freight-usd').value) || 0;
  const fxFreight = parseFloat(g('imp-fx-freight').value) || 7350;
  const customsPyg = parseFloat(g('imp-customs-pyg').value) || 0;
  const margin = parseFloat(g('imp-margin').value) || 0;
  
  let unitFreightUsd = 0;
  let unitCustomsPyg = 0;
  
  if (qty > 0) {
    unitFreightUsd = freightUsd / qty;
    unitCustomsPyg = customsPyg / qty;
  }
  
  // Display units
  g('imp-freight-unit').textContent = `Flete unitario: ${fmt(unitFreightUsd, '$')}`;
  g('imp-customs-unit').textContent = `Despacho unitario: ${fmt(unitCustomsPyg, '₲')}`;

  // Summary calculations using SPLIT EXCHANGE RATES
  const costOrigPyg = (costUsd * qty) * fxProd;
  const freightTotalPyg = freightUsd * fxFreight;
  const totalLandedPyg = costOrigPyg + freightTotalPyg + customsPyg;

  g('imp-tot-pyg').textContent = fmt(totalLandedPyg, '₲');

  // Real Unit Cost
  let landedCostUnitPyg = 0;
  let landedCostUnitUsd = 0;

  if (qty > 0) {
    landedCostUnitPyg = totalLandedPyg / qty;
    const effectiveUsdCost = (costUsd * qty) + freightUsd + (customsPyg / Math.max(fxProd, fxFreight));
    landedCostUnitUsd = effectiveUsdCost / qty;
  }

  g('imp-landed-cost').textContent = fmt(landedCostUnitPyg, '₲');
  g('imp-landed-usd').textContent = `(${fmt(landedCostUnitUsd, '$')})`;

  // Suggested Price
  const suggestedPyg = landedCostUnitPyg * (1 + (margin / 100));
  g('imp-suggested-price').textContent = fmt(suggestedPyg, '₲');
  
  // Save references for save action
  window.currentLandedCalc = {
    qty, costUsd, fxProd, freightUsd, fxFreight, customsPyg,
    landedCostUnitPyg, suggestedPyg, totalLandedPyg,
    unitFreightUsd, unitCustomsPyg
  };
}

async function saveImport() {
  const pid = g('imp-prod').value;
  if (!pid) { toast('Selecciona un producto al que ingresar el stock'); return; }

  const calc = window.currentLandedCalc;
  if (!calc || calc.qty <= 0) { toast('Ingresá una cantidad de importación válida mayor a 0'); return; }
  if (calc.landedCostUnitPyg <= 0) { toast('El costo unitario real estimado debe ser mayor que 0'); return; }

  const p = S.products.find(x => x.id === pid);
  if (!p) return;

  const prevStock = p.stock;
  p.stock += calc.qty;

  // Update product with full landed cost breakdown
  p.cur = '₲';
  p.buyPrice = Math.round(calc.landedCostUnitPyg);
  p.sellPrice = Math.round(calc.suggestedPyg);
  p.exchangeRate = calc.fxProd;
  p.unit_cost_usd = calc.costUsd;
  p.freight_usd = calc.unitFreightUsd;
  p.customs_pyg = calc.unitCustomsPyg;
  p.total_landed_cost_pyg = Math.round(calc.landedCostUnitPyg);
  p.exchange_rate_product = calc.fxProd;
  p.exchange_rate_freight = calc.fxFreight;

  if (typeof SB_ON !== 'undefined' && SB_ON) {
    const updateResult = await sbSaveProduct(p, false);
    if (!updateResult) {
      toast('❌ Error al actualizar la base de datos');
      p.stock = prevStock;
      return;
    }
  }

  // Auto-generate expense transaction (impacta Patrimonio)
  const totalInversion = Math.round(calc.totalLandedPyg);
  S.txs.push({
    id: uid(),
    type: 'expense',
    desc: `Importación: ${p.name} (${calc.qty} u.) | FOB $${calc.costUsd}/u × TC ${calc.fxProd} + Flete $${calc.freightUsd} × TC ${calc.fxFreight} + Aduana ₲${fmt(calc.customsPyg,'')}`,
    amount: totalInversion,
    cur: '₲',
    cat: 'Importación / Landed Cost',
    date: today(),
    _import: true,
    _product_id: p.id,
    _breakdown: {
      unit_cost_usd: calc.costUsd,
      qty: calc.qty,
      freight_usd: calc.freightUsd,
      customs_pyg: calc.customsPyg,
      exchange_rate_product: calc.fxProd,
      exchange_rate_freight: calc.fxFreight,
      total_landed_pyg: totalInversion
    }
  });

  toast(`✅ Importación Registrada: Stock ${prevStock} → ${p.stock} u. | Egreso ₲ ${fmt(totalInversion,'')} generado.`);
  lsave();
  renderAll();
  cm('import-modal');
}

