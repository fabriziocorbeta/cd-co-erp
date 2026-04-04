// CD & Co ERP — SALES
// ====================================

// ══════════════════════════════════════════
// SALES
// ══════════════════════════════════════════
let saleFlt='all';
function setSaleFlt(f,btn){saleFlt=f;document.querySelectorAll('#page-sales .flt').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderSales()}
function renderSales(){
  const q=(g('sale-search')?.value||'').toLowerCase();
  const tm=thisMo();
  let sales=[...S.sales].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(saleFlt==='today')sales=sales.filter(s=>s.date===today());
  else if(saleFlt==='month')sales=sales.filter(s=>mkey(s.date)===tm);
  if(q)sales=sales.filter(s=>{const c=S.contacts.find(x=>x.id===s.clientId);return(c?.name||'').toLowerCase().includes(q)||String(s.num).includes(q)});
  const tb=g('sales-tbody');
  if(!sales.length){tb.innerHTML=`<tr><td colspan="8" class="tbl-empty">Sin ventas. Registrá tu primera venta.</td></tr>`;return}
  tb.innerHTML=sales.map(s=>{
    const client=S.contacts.find(c=>c.id===s.clientId);
    return `<tr>
      <td class="mono">${fmtDate(s.date)}</td>
      <td class="mono">#${String(s.num).padStart(4,'0')}</td>
      <td>${client?client.name:'<span style="color:var(--m3)">Cliente ocasional</span>'}</td>
      <td style="font-size:.72rem;color:var(--mu)">${s.items.map(i=>{const p=S.products.find(x=>x.id===i.prodId);return`${p?.name||'Producto'} x${i.qty}`}).join(', ')}</td>
      <td class="mono" style="color:var(--pos)">${fmt(s.total,s.cur)}</td>
      <td class="mono">${s.cur}</td>
      <td>
        <span class="pill ${s.status==='paid'?'pill-pos':'pill-warn'}">${s.status==='paid'?'Pagada':'Pendiente'}</span>
        ${s.method ? `<div style="font-size:9px;color:var(--mu);margin-top:4px;white-space:nowrap">${s.method}</div>` : ''}
      </td>
      <td><div class="actions">
        <button class="btn btn-pur" style="padding:4px 8px;font-size:.62rem" onclick="viewInvoice('${s.id}')">🧾</button>
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

function saveSale(){
  if(!saleLines.length||!saleLines[0].prodId){toast('Agregá al menos un producto');return}
  const items=saleLines.filter(l=>l.prodId&&l.qty>0);
  // Check stock
  for(const l of items){const p=S.products.find(x=>x.id===l.prodId);if(!p)continue;if(p.stock<l.qty){toast(`Stock insuficiente: ${p.name} (${p.stock} u. disponibles)`);return}}
  const total=items.reduce((a,l)=>a+l.qty*l.price,0);
  const cur=g('sl-cur').value;
  const date=g('sl-date').value;
  const clientId=g('sl-client').value;
  const status=g('sl-status').value;
  const notes=g('sl-notes').value;
  const condicion=g('sl-condicion')?.value||'contado';
  const nroFactura=g('sl-nrofactura')?.value.trim()||'';
  const method=g('sl-method')?.value||'Efectivo';
  const num=editIds.sale?S.sales.find(s=>s.id===editIds.sale)?.num:(S.sales.length+1);
  if(editIds.sale){
    // restore old stock
    const old=S.sales.find(s=>s.id===editIds.sale);
    if(old)old.items.forEach(l=>{const p=S.products.find(x=>x.id===l.prodId);if(p)p.stock+=l.qty});
    const idx=S.sales.findIndex(s=>s.id===editIds.sale);
    S.sales[idx]={...S.sales[idx],items,total,cur,date,clientId,status,notes,condicion,nroFactura,method};
    // remove old auto-tx
    S.txs=S.txs.filter(t=>t._saleId!==editIds.sale);
  } else {
    S.sales.push({id:uid(),num:num||S.sales.length+1,items,total,cur,date,clientId,status,notes,condicion,nroFactura,method});
  }
  // deduct stock & auto income tx
  const saleId=editIds.sale||S.sales[S.sales.length-1].id;
  items.forEach(l=>{const p=S.products.find(x=>x.id===l.prodId);if(p){p.stock-=l.qty;p.stock=Math.max(0,p.stock)}});
  S.txs.push({id:uid(),type:'income',desc:`Venta #${String(num).padStart(4,'0')} — ${items.length} producto(s)`,amount:total,cur,cat:'Relojes',date,_saleId:saleId});
  toast('◆ Venta registrada · Stock actualizado');lsave();renderAll();cm('sale-modal');populateSelects();
}
function delSale(id){
  if(!confirm('¿Eliminar venta? El stock no se restaura automáticamente.'))return;
  S.sales=S.sales.filter(s=>s.id!==id);S.txs=S.txs.filter(t=>t._saleId!==id);
  lsave();renderAll();toast('Venta eliminada');
}
