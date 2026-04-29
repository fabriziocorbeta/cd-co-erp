// CD & Co ERP — SALES
// ====================================

// ── SHOPIFY: Fire-and-forget post-sale stock push ─────────────────────────
// Envía la rebaja de stock a Shopify de forma no bloqueante.
// Solo se ejecuta si el producto tiene un SKU válido registrado.
// No lanza ni muestra errores al usuario — se loguea silenciosamente.
async function pushSkusToShopify(skuList) {
  if (!SB_ON || !sb || !skuList.length) return;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch('/api/shopify_sync', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: 'syncStock', products: skuList }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.updated > 0) {
      console.log(`[Shopify] Background sync: ${data.updated} SKU(s) actualizados`);
    }
  } catch (err) {
    // Silencioso: el ERP ya procesó la venta, Shopify es best-effort
    console.warn('[Shopify] Background sync failed (non-blocking):', err.message);
  }
}

// ══════════════════════════════════════════
// SALES
// ══════════════════════════════════════════
let saleFlt='all';
let originalSaleItems=[];
function setSaleFlt(f,btn){saleFlt=f;document.querySelectorAll('#page-sales .flt').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderSales()}
function renderSales(){
  const q=(g('sale-search')?.value||'').toLowerCase();
  const tm=thisMo();
  let sales=[...S.sales].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(saleFlt==='today')sales=sales.filter(s=>s.date===today());
  else if(saleFlt==='month')sales=sales.filter(s=>mkey(s.date)===tm);
  if(q)sales=sales.filter(s=>{const c=S.contacts.find(x=>x.id===(s.client_id||s.clientId));return(c?.name||'').toLowerCase().includes(q)||String(s.num).includes(q)});
  const tb=g('sales-tbody');
  if(!sales.length){tb.innerHTML=`<tr><td colspan="8" class="tbl-empty">Sin ventas. Registrá tu primera venta.</td></tr>`;return}
  tb.innerHTML=sales.map(s=>{
    const client=S.contacts.find(c=>c.id===(s.client_id||s.clientId));
    const phone=client?.phone?client.phone.replace(/\D/g,''):'';
    const clientLabel=client
      ?(phone?`<a href="https://wa.me/${phone}" target="_blank" style="color:var(--g);text-decoration:none" title="WhatsApp">${client.name}</a>`:client.name)
      :'<span style="color:var(--m3)">Cliente ocasional</span>';
    return `<tr>
      <td class="mono">${fmtDate(s.date)}</td>
      <td class="mono">#${String(s.num).padStart(4,'0')}</td>
      <td>${clientLabel}</td>
      <td style="font-size:.72rem;color:var(--mu)">${s.items.map(i=>{const p=S.products.find(x=>x.id===i.prodId);return`${p?.name||'Producto'} x${i.qty}`}).join(', ')}</td>
      <td class="mono" style="color:var(--pos)">${fmt(s.total,s.cur)}</td>
      <td class="mono">${s.cur}</td>
      <td>
        <span class="pill ${s.status==='paid'?'pill-pos':'pill-warn'}">${s.status==='paid'?'Pagada':'Pendiente'}</span>
        ${s.method ? `<div style="font-size:9px;color:var(--mu);margin-top:4px;white-space:nowrap">${s.method}</div>` : ''}
      </td>
      <td><div class="actions">
        <button class="btn btn-pur" style="padding:4px 8px;font-size:.62rem" onclick="viewInvoice('${s.id}')" title="Ver factura">🧾</button>
        <button class="btn btn-ship" style="padding:4px 8px;font-size:.62rem" onclick="viewShippingLabel('${s.id}')" title="Imprimir etiqueta de envío">📦</button>
        <button class="btn btn-o" style="padding:4px 8px;font-size:.62rem;border-color:var(--g2);color:var(--g2)" onclick="openEditSaleModal('${s.id}')">✏</button>
        <button class="btn btn-danger" style="padding:4px 8px;font-size:.62rem" onclick="delSale('${s.id}')">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

function openSaleModal(id){
  editIds.sale=id||null;saleLines=[];
  const s=id?S.sales.find(x=>x.id===id):null;
  g('sale-mttl').textContent=id?'Editar venta':'Nueva venta';
  g('sl-client').value=s?.clientId||'';g('sl-date').value=s?.date||today();
  g('sl-cur').value=s?.cur||'$';g('sl-status').value=s?.status||'paid';
  g('sl-notes').value=s?.notes||'';
  if(g('sl-condicion'))g('sl-condicion').value=s?.condicion||'contado';
  if(g('sl-nrofactura'))g('sl-nrofactura').value=s?.nroFactura||'';
  if(g('sl-method'))g('sl-method').value=s?.method||'Efectivo';
  if(s)saleLines=s.items.map(i=>({...i}));
  else addSaleLine();
  renderSaleLines();
  g('sale-acts').innerHTML=id
    ?`<button class="mb mb-d" onclick="delSale('${id}');cm('sale-modal')">Eliminar</button><button class="mb mb-gh" onclick="cm('sale-modal')">Cancelar</button><button class="mb mb-g" onclick="saveSale()">Guardar venta</button>`
    :`<button class="mb mb-gh" onclick="cm('sale-modal')">Cancelar</button><button class="mb mb-g" onclick="saveSale()">Guardar venta</button>`;
  g('sale-modal').style.display='flex';
}

function addSaleLine(){saleLines.push({prodId:'',qty:1,price:0});renderSaleLines()}
function renderSaleLines(){
  const el=g('sale-lines');
  if(!saleLines.length){el.innerHTML='<div style="font-size:.74rem;color:var(--m3);text-align:center;padding:10px">Agregá al menos un producto</div>';updateSaleTotal();return}
  el.innerHTML=saleLines.map((ln,i)=>`
    <div style="display:grid;grid-template-columns:1fr 65px 95px 90px 32px;gap:6px;align-items:center">
      <select class="fs" style="font-size:.78rem;padding:7px 10px" onchange="onSaleProd(${i},this.value)">
        <option value="">Seleccionar producto</option>
        ${S.products.map(p=>`<option value="${p.id}" ${ln.prodId===p.id?'selected':''}>${p.name} (${p.stock} u.)</option>`).join('')}
      </select>
      <input class="fi" type="number" inputmode="numeric" min="1" placeholder="Cant." value="${ln.qty||''}" style="padding:7px 9px;font-size:.78rem" onchange="onSaleQty(${i},this.value)"/>
      <input class="fi" type="number" inputmode="decimal" min="0" placeholder="Precio" value="${ln.price||''}" style="padding:7px 9px;font-size:.78rem;font-family:var(--fm)" onchange="onSalePrice(${i},this.value)"/>
      <select class="fs" style="font-size:.72rem;padding:6px 8px" onchange="onSaleIva(${i},this.value)">
        <option value="10" ${(ln.iva||10)===10?'selected':''}>IVA 10%</option>
        <option value="5"  ${ln.iva===5?'selected':''}>IVA 5%</option>
        <option value="0"  ${ln.iva===0?'selected':''}>Exento</option>
      </select>
      <button class="btn btn-danger" style="padding:5px;justify-content:center" onclick="rmSaleLine(${i})">✕</button>
    </div>`).join('');
  updateSaleTotal();
}
function onSaleProd(i,pid){saleLines[i].prodId=pid;const p=S.products.find(x=>x.id===pid);if(p)saleLines[i].price=p.sellPrice;renderSaleLines()}
function onSaleQty(i,v){saleLines[i].qty=parseInt(v)||1;updateSaleTotal()}
function onSalePrice(i,v){saleLines[i].price=parseFloat(v)||0;updateSaleTotal()}
function rmSaleLine(i){saleLines.splice(i,1);renderSaleLines()}
function onSaleIva(i,v){saleLines[i].iva=parseInt(v);updateSaleTotal()}
function calcIva(lines,cur){
  const c=cur||g('sl-cur').value;
  let sub10=0,sub5=0,sub0=0;
  lines.forEach(l=>{const sub=l.qty*l.price;const iv=l.iva===undefined?10:l.iva;if(iv===10)sub10+=sub;else if(iv===5)sub5+=sub;else sub0+=sub;});
  const iva10=sub10/11; const iva5=sub5/21;
  const base10=sub10-iva10; const base5=sub5-iva5; const base0=sub0;
  const totalIva=iva10+iva5;
  const total=sub10+sub5+sub0;
  return {sub10,sub5,sub0,iva10,iva5,base10,base5,base0,totalIva,total,cur:c};
}
function updateSaleTotal(){
  const cur=g('sl-cur')?.value||'$';
  const {total,totalIva,sub10,sub5,sub0}=calcIva(saleLines,cur);
  if(g('sl-sub'))g('sl-sub').textContent=fmt(total-totalIva,cur);
  if(g('sl-total'))g('sl-total').textContent=fmt(total,cur);
  // Show IVA detail if mixed
  const hasMix=saleLines.some(l=>l.iva===5)||saleLines.some(l=>l.iva===0);
  const ivaEl=g('sl-iva-detail');
  if(ivaEl){
    if(hasMix){
      ivaEl.style.display='block';
      ivaEl.innerHTML=`<div style="font-size:.64rem;color:var(--mu);margin-top:4px;font-family:var(--fm)">
        ${sub10>0?`<div style="display:flex;justify-content:space-between"><span>IVA 10%</span><span>${fmt(sub10/11,cur)}</span></div>`:''}
        ${sub5>0?`<div style="display:flex;justify-content:space-between"><span>IVA 5%</span><span>${fmt(sub5/21,cur)}</span></div>`:''}
        ${sub0>0?`<div style="display:flex;justify-content:space-between"><span>Exento</span><span>${fmt(sub0,cur)}</span></div>`:''}
      </div>`;
    } else { ivaEl.style.display='none'; }
  }
}
g('sl-cur')?.addEventListener('change',updateSaleTotal);

async function saveSale(){
  // Validate required fields
  if(!saleLines.length||!saleLines[0].prodId){
    toast('Agregá al menos un producto');
    return;
  }

  const items=saleLines.filter(l=>l.prodId&&l.qty>0);
  if(!items.length){
    toast('Agregá al menos un producto con cantidad');
    return;
  }

  // Get form values
  const cur=g('sl-cur').value;
  const date=g('sl-date').value;
  const clientId=g('sl-client').value;

  if(!date){
    toast('Seleccioná una fecha');
    return;
  }

  // Stock validation: different logic for new sales vs edits
  if(!editIds.sale) {
    // NEW SALE: check current stock
    for(const l of items){
      const p=S.products.find(x=>x.id===l.prodId);
      if(!p){
        toast(`Producto no encontrado`);
        return;
      }
      if(p.stock<l.qty){
        toast(`Stock insuficiente: ${p.name} (${p.stock} u. disponibles)`);
        return;
      }
    }
  } else {
    // EDIT MODE: validate against original qty + current stock
    for(const l of items){
      const p=S.products.find(x=>x.id===l.prodId);
      if(!p){
        toast(`Producto no encontrado`);
        return;
      }
      const origItem=originalSaleItems.find(oi=>oi.prodId===l.prodId);
      const origQty=origItem?.qty||0;
      // Available stock = current stock + what was originally deducted for this sale
      const availableStock=p.stock+origQty;
      if(availableStock<l.qty){
        toast(`Stock insuficiente: ${p.name} (${availableStock} u. disponibles)`);
        return;
      }
    }
  }

  const total=items.reduce((a,l)=>a+l.qty*l.price,0);
  // Validate total
  if(!Number.isFinite(total)||total<0){
    toast('Total debe ser un número válido');
    return;
  }
  // Get remaining form values
  const status=g('sl-status').value;
  const notes=g('sl-notes').value;
  const condicion=g('sl-condicion')?.value||'contado';
  const nroFactura=g('sl-nrofactura')?.value.trim()||'';
  const method=g('sl-method')?.value||'Efectivo';
  const num=editIds.sale?S.sales.find(s=>s.id===editIds.sale)?.num:(S.sales.length+1);

  if(editIds.sale){
    // EDIT MODE: apply stock differences only, update sale, sync to Supabase
    const idx=S.sales.findIndex(s=>s.id===editIds.sale);
    const updatedSale={...S.sales[idx],items,total,cur,date,clientId,status,notes,condicion,nroFactura,method};
    S.sales[idx]=updatedSale;

    // Apply stock differences (not full restore + re-deduct)
    items.forEach(l=>{
      const p=S.products.find(x=>x.id===l.prodId);
      if(!p)return;
      const origItem=originalSaleItems.find(oi=>oi.prodId===l.prodId);
      const origQty=origItem?.qty||0;
      const qtyDifference=l.qty-origQty;
      if(qtyDifference!==0){
        p.stock-=qtyDifference;
        p.stock=Math.max(0,p.stock);
      }
    });

    // Supabase update
    if(SB_ON && sb && S.user?.id){
      sb.from('sales').update({
        items:JSON.stringify(items),
        total,
        cur,
        date,
        client_id:clientId||null,
        status,
        notes:notes||null,
        condicion,
        nro_factura:nroFactura||null,
        method:method||null
      }).eq('id',editIds.sale).eq('user_id',S.user.id).then(res=>{
        if(res.error){
          console.error('[Sales] Update error:',res.error.message,res.error.details);
          toast('⚠️ Error al sincronizar venta: '+res.error.message);
        }
        else console.log('[Sales] Updated in Supabase');
      }).catch(err=>{
        console.error('[Sales] Update error:',err);
        toast('⚠️ Error de conexión: '+err.message);
      });
    }

    // remove old auto-tx and sync new one
    S.txs=S.txs.filter(t=>t._saleId!==editIds.sale);
  } else {
    // NEW SALE MODE
    const saleId=uid();
    const newSale={id:saleId,num:num||S.sales.length+1,items,total,cur,date,client_id:clientId||null,clientId,status,notes,condicion,nroFactura,method};
    S.sales.push(newSale);

    // Supabase insert
    if(SB_ON && sb && S.user?.id){
      sb.from('sales').insert({
        id:saleId,
        user_id:S.user.id,
        num:newSale.num,
        items:JSON.stringify(items),
        total,
        cur,
        date,
        client_id:clientId||null,
        status,
        notes:notes||null,
        condicion,
        nro_factura:nroFactura||null,
        method:method||null,
        created_at:new Date().toISOString()
      }).then(res=>{
        if(res.error){
          console.error('[Sales] Insert error:',res.error.message,res.error.details);
          toast('⚠️ Error al guardar venta: '+res.error.message);
        }
        else console.log('[Sales] Inserted to Supabase');
      }).catch(err=>{
        console.error('[Sales] Insert error:',err);
        toast('⚠️ Error de conexión: '+err.message);
      });
    }
  }

  // deduct stock & auto income tx (NEW SALES ONLY — edits already handled above)
  const saleId=editIds.sale||S.sales[S.sales.length-1].id;
  if(!editIds.sale){
    if(SB_ON && sb && S.user?.id){
      // ── Descuento atómico via RPC (FOR UPDATE — resuelve race condition C-1) ──
      // Garantiza que dos ventas concurrentes no puedan sobrepasar el stock real en DB.
      let rpcFailed=false;
      for(const l of items){
        const {data:rpcData,error:rpcErr}=await sb.rpc('deduct_stock_atomic',{
          p_product_id:l.prodId,
          p_qty:l.qty,
          p_user_id:S.user.id
        });
        if(rpcErr||!rpcData?.ok){
          const avail=rpcData?.available??'?';
          const prod=S.products.find(x=>x.id===l.prodId);
          vibrate([30,30,30]); // Haptic: error
          toast(`❌ ${rpcErr?.message||`Sin stock suficiente: ${prod?.name||'Producto'} (${avail} u. disponibles en BD)`}`,3500);
          rpcFailed=true;break;
        }
        // Actualizar estado local desde respuesta de DB (source of truth)
        const prod=S.products.find(x=>x.id===l.prodId);
        if(prod) prod.stock=rpcData.new_stock;
      }
      if(rpcFailed){
        // Rollback: revertir venta de S.sales y de Supabase
        S.sales=S.sales.filter(s=>s.id!==saleId);
        sb.from('sales').delete().eq('id',saleId).eq('user_id',S.user.id).catch(()=>{});
        lsave();return;
      }
    } else {
      // Offline fallback: descuento local (sin garantía de atomicidad)
      items.forEach(l=>{const p=S.products.find(x=>x.id===l.prodId);if(p){p.stock-=l.qty;p.stock=Math.max(0,p.stock)}});
    }
  }
  // Create/update transaction
  S.txs=S.txs.filter(t=>t._saleId!==saleId);
  const saleTx={id:uid(),type:'income',desc:`Venta #${String(num).padStart(4,'0')} — ${items.length} producto(s)`,amount:total,cur,cat:'Relojes',date,_saleId:saleId};
  if(SB_ON){ const saved=await sbSaveTransaction(saleTx); S.txs.push(saved||saleTx); }
  else S.txs.push(saleTx);

  if(typeof recomputeBalances==='function') recomputeBalances();

  const msg=editIds.sale?'◆ Venta actualizada':'◆ Venta registrada';
  vibrate(50); // Haptic: confirmación de venta
  toast(msg+' · Stock actualizado');
  lsave();renderAll();cm('sale-modal');populateSelects();

  // ── Shopify: rebaja de stock post-venta (fire-and-forget, no bloqueante) ──
  // Solo para ventas nuevas. Sincroniza el stock físico actualizado de cada
  // producto vendido que tenga un SKU registrado en la tienda web.
  if (!editIds.sale) {
    const soldWithSku = items
      .map(l => {
        const p = S.products.find(x => x.id === l.prodId);
        return p?.sku && p.sku !== '—' ? { sku: p.sku, qty: p.stock || 0 } : null;
      })
      .filter(Boolean);
    if (soldWithSku.length) pushSkusToShopify(soldWithSku); // sin await — no bloquea la UI
  }

  editIds.sale=null;
}
function openEditSaleModal(id) {
  const sale = S.sales.find(s => s.id === id);
  if (!sale) return;

  editIds.sale = id;
  saleLines = sale.items.map(i => ({...i}));
  // Store original items for stock recalculation
  originalSaleItems = sale.items.map(i => ({...i}));

  g('sale-mttl').textContent = 'Editar venta';
  g('sl-client').value = sale.clientId || '';
  g('sl-date').value = sale.date || today();
  g('sl-cur').value = sale.cur || '$';
  g('sl-status').value = sale.status || 'paid';
  g('sl-notes').value = sale.notes || '';
  if(g('sl-condicion')) g('sl-condicion').value = sale.condicion || 'contado';
  if(g('sl-nrofactura')) g('sl-nrofactura').value = sale.nroFactura || '';
  if(g('sl-method')) g('sl-method').value = sale.method || 'Efectivo';

  renderSaleLines();

  g('sale-acts').innerHTML = `
    <button class="mb mb-d" onclick="delSale('${id}');cm('sale-modal')">Eliminar</button>
    <button class="mb mb-gh" onclick="cm('sale-modal')">Cancelar</button>
    <button class="mb mb-g" onclick="saveSale()">Guardar cambios</button>
  `;

  g('sale-modal').style.display = 'flex';
}

function delSale(id){
  if(!confirm('¿Eliminar venta? El stock no se restaura automáticamente.'))return;
  S.sales=S.sales.filter(s=>s.id!==id);S.txs=S.txs.filter(t=>t._saleId!==id);
  lsave();renderAll();toast('Venta eliminada');
}
