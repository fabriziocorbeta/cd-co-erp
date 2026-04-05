// CD & Co ERP — ORDERS
// ====================================

// ══════════════════════════════════════════
// ORDERS (Pedidos a proveedores)
// ══════════════════════════════════════════
let ordFlt='all';
function setOrdFlt(f,btn){ordFlt=f;document.querySelectorAll('#page-orders .flt').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderOrders()}
function renderOrders(){
  const q=(g('ord-search')?.value||'').toLowerCase();
  let orders=[...S.orders].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(ordFlt==='pending')orders=orders.filter(o=>o.status==='pending' || o.status==='transit');
  else if(ordFlt==='received')orders=orders.filter(o=>o.status==='received');
  if(q)orders=orders.filter(o=>{const s=S.contacts.find(c=>c.id===o.supId);return(s?.name||'').toLowerCase().includes(q)||String(o.num).includes(q)||String(o.ref||'').toLowerCase().includes(q)});
  const tb=g('orders-tbody');
  if(!orders.length){tb.innerHTML=`<tr><td colspan="7" class="tbl-empty">Sin pedidos. Creá tu primer pedido a proveedor.</td></tr>`;return}
  tb.innerHTML=orders.map(o=>{
    const sup=S.contacts.find(c=>c.id===o.supId);
    const total=o.totalAmount || o.items.reduce((a,i)=>a+i.qty*(S.products.find(p=>p.id===i.prodId)?.buyPrice||i.price||0),0);
    const statusPill = o.status==='received'?'pill-pos':o.status==='transit'?'pill-warn':'pill-warn';
    const statusLbl = o.status==='received'?'Recibido':o.status==='transit'?'En Tránsito':'Pendiente';
    const statusStyle = o.status==='transit'?'background:var(--blue);color:#fff':(o.status==='received'?'':'background:var(--pb);color:var(--pos)');

    return `<tr>
      <td class="mono">${fmtDate(o.date)}</td>
      <td class="mono">#${String(o.num).padStart(4,'0')}</td>
      <td>${sup?sup.name:'<span style="color:var(--m3)">Sin proveedor</span>'}${o.ref?`<div style="font-size:.6rem;color:var(--mu)">Ref: ${o.ref}</div>`:''}</td>
      <td style="font-size:.72rem;color:var(--mu)">${o.items.map(i=>{const p=S.products.find(x=>x.id===i.prodId);return`${p?.name||'?'} x${i.qty}`}).join(', ')}</td>
      <td class="mono">${fmt(total, o.cur || '$')}</td>
      <td><span class="pill ${statusPill}" style="${statusStyle}">${statusLbl}</span></td>
      <td><div class="actions" style="gap:4px">
        ${o.status==='pending'||o.status==='transit'?`<button class="btn btn-pos" style="padding:4px 8px;font-size:12px;display:flex;align-items:center;justify-content:center;min-width:28px" onclick="openOrderRecvModal('${o.id}')" title="Recibir">✓</button>`:''}
        <button class="btn btn-o" style="padding:4px 8px;font-size:12px;display:flex;align-items:center;justify-content:center;min-width:28px;border-color:var(--g2);color:var(--g2)" onclick="openEditOrderModal('${o.id}')">✏</button>
        <button class="btn btn-danger" style="padding:4px 8px;font-size:12px;display:flex;align-items:center;justify-content:center;min-width:28px" onclick="delOrder('${o.id}')">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

function openOrderModal(id){
  editIds.order=id||null;orderLines=[];
  g('ord-mttl').textContent=id?'Editar pedido':'Nuevo pedido';
  const o=id?S.orders.find(x=>x.id===id):null;
  g('or-sup').value=o?.supId||'';g('or-date').value=o?.eta||today();g('or-notes').value=o?.notes||'';
  g('or-num').value = o ? o.num : (S.orders.length + 1);
  g('or-status').value = o ? o.status : 'pending';
  
  // Payment Integration
  populateAccountSelect('or-pay-account');
  g('or-pay-status').value = o?.payStatus || 'pending';
  g('or-pay-account').value = o?.payAccountId || '';

  if(o)orderLines=o.items.map(i=>({...i}));else addOrderLine();
  renderOrderLines();
  g('ord-acts').innerHTML=id
    ?`<button class="mb mb-d" onclick="delOrder('${id}');cm('order-modal')">Eliminar</button><button class="mb mb-gh" onclick="cm('order-modal')">Cancelar</button><button class="mb mb-g" onclick="saveOrder()">Guardar</button>`
    :`<button class="mb mb-gh" onclick="cm('order-modal')">Cancelar</button><button class="mb mb-g" onclick="saveOrder()">Crear pedido</button>`;
  g('order-modal').style.display='flex';
}

function populateAccountSelect(elId) {
  const el = g(elId);
  if (!el) return;
  const accs = S.accounts || [];
  const cards = S.cards || [];
  let html = '<option value="">Seleccionar cuenta</option>';
  if(accs.length) {
    html += '<optgroup label="Cuentas">';
    html += accs.map(a => `<option value="${a.id}">${(typeof acctTypeIcon==='function' ? acctTypeIcon(a.type) : '🏦')} ${a.name}</option>`).join('');
    html += '</optgroup>';
  }
  if(cards.length) {
    html += '<optgroup label="Tarjetas">';
    html += cards.map(c => `<option value="${c.id}">💳 ${c.name}</option>`).join('');
    html += '</optgroup>';
  }
  el.innerHTML = html;
}
function addOrderLine(){orderLines.push({prodId:'',qty:1,price:0});renderOrderLines()}
function renderOrderLines(){
  const el=g('order-lines');
  if(!orderLines.length){el.innerHTML='<div style="font-size:.74rem;color:var(--m3);text-align:center;padding:10px">Agregá productos al pedido</div>';updateOrderTotal();return}
  el.innerHTML=orderLines.map((ln,i)=>`
    <div style="display:grid;grid-template-columns:1fr 70px 100px 32px;gap:7px;align-items:center">
      <select class="fs" style="font-size:.78rem;padding:7px 10px" onchange="onOrdProd(${i},this.value)">
        <option value="">Seleccionar producto</option>
        ${S.products.map(p=>`<option value="${p.id}" ${ln.prodId===p.id?'selected':''}>${p.name}</option>`).join('')}
      </select>
      <input class="fi" type="number" inputmode="numeric" min="1" placeholder="Cant." value="${ln.qty||''}" style="padding:7px 9px;font-size:.78rem" onchange="orderLines[${i}].qty=parseInt(this.value)||1;updateOrderTotal()"/>
      <input class="fi" type="number" inputmode="decimal" min="0" placeholder="P. compra" value="${ln.price||''}" style="padding:7px 9px;font-size:.78rem;font-family:var(--fm)" onchange="orderLines[${i}].price=parseFloat(this.value)||0;updateOrderTotal()"/>
      <button class="btn btn-danger" style="padding:5px;justify-content:center" onclick="orderLines.splice(${i},1);renderOrderLines()">✕</button>
    </div>`).join('');
  updateOrderTotal();
}
function onOrdProd(i,pid){orderLines[i].prodId=pid;const p=S.products.find(x=>x.id===pid);if(p)orderLines[i].price=p.buyPrice;renderOrderLines()}
function updateOrderTotal(){const t=orderLines.reduce((a,l)=>a+l.qty*l.price,0);g('or-total').textContent=fmt(t)}
function saveOrder(){
  const items=orderLines.filter(l=>l.prodId&&l.qty>0);
  if(!items.length){toast('Agregá al menos un producto');return}
  const num=parseInt(g('or-num').value) || S.orders.length+1;
  const status=g('or-status').value;
  const payStatus=g('or-pay-status').value;
  const payAccountId=g('or-pay-account').value;
  
  const ord={
    supId:g('or-sup').value,
    eta:g('or-date').value,
    notes:g('or-notes').value,
    items,
    status,
    payStatus,
    payAccountId,
    date:today(),
    num
  };
  
  let orderId = editIds.order;
  if(editIds.order){
    const i=S.orders.findIndex(o=>o.id===editIds.order);
    if(i>=0) {
      const oldStatus = S.orders[i].status;
      S.orders[i]={...S.orders[i],...ord,id:S.orders[i].id};
      if (status === 'received' && oldStatus !== 'received') {
        recvOrderId = editIds.order;
        confirmReceive();
      }
    }
  } else {
    orderId = uid();
    S.orders.push({...ord,id:orderId});
    if (status === 'received') {
      recvOrderId = orderId;
      confirmReceive();
    }
  }

  syncOrderPayment(orderId);

  lsave();renderAll();cm('order-modal');toast('◆ Pedido guardado');updateBadges();
}

function syncOrderPayment(orderId) {
  const o = S.orders.find(ord => ord.id === orderId);
  if (!o) return;

  if (o.payStatus === 'paid') {
    if (!o.payAccountId) return; // Should have been validated but just in case
    const sup = S.contacts.find(c => c.id === o.supId);
    const total = o.totalAmount || o.items.reduce((a,l)=>a+(l.qty||0)*(l.price||0),0);
    
    const txData = {
      type: 'expense',
      amount: total,
      account_id: o.payAccountId,
      cat: 'Stock / Compras',
      desc: 'Pago de pedido a ' + (sup?.name || 'proveedor'),
      date: o.date || today(),
      cur: o.cur || '$',
      orderId: o.id
    };

    const existingTx = S.txs.find(t => t.orderId === o.id);
    if (existingTx) {
      Object.assign(existingTx, txData);
    } else {
      S.txs.push({ ...txData, id: uid() });
    }
  } else {
    // Remove tx if status is pending
    S.txs = S.txs.filter(t => t.orderId !== o.id);
  }
}
function delOrder(id){
  if(!confirm('¿Eliminar pedido?'))return;
  S.orders=S.orders.filter(o=>o.id!==id);
  S.txs=S.txs.filter(t=>t.orderId!==id);
  lsave();renderAll();toast('Eliminado');updateBadges();
}

// RECEIVE ORDER
function openOrderRecvModal(id){
  recvOrderId=id;
  const o=S.orders.find(x=>x.id===id);if(!o)return;
  const sup=S.contacts.find(c=>c.id===o.supId);
  g('recv-content').innerHTML=`
    <p style="font-size:.8rem;color:var(--mu);margin-bottom:14px">Confirmá la recepción del pedido <strong style="color:var(--cr)">#${String(o.num).padStart(4,'0')}</strong>${sup?' de '+sup.name:''}. Se actualizará el stock automáticamente.</p>
    <div style="background:var(--bg3);border-radius:var(--rs);padding:12px;margin-bottom:12px">
      ${o.items.map(i=>{const p=S.products.find(x=>x.id===i.prodId);return`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--bg5);font-size:.78rem"><span style="color:var(--cr)">${p?.name||'?'}</span><span class="mono" style="color:var(--pos)">+${i.qty} u. → ${(p?.stock||0)+i.qty} u.</span></div>`}).join('')}
    </div>`;
  g('recv-modal').style.display='flex';
}
function confirmReceive(){
  const o=S.orders.find(x=>x.id===recvOrderId);if(!o)return;
  o.status='received';
  const total=o.items.reduce((a,i)=>a+i.qty*(i.price||S.products.find(p=>p.id===i.prodId)?.buyPrice||0),0);
  // update stock
  o.items.forEach(i=>{const p=S.products.find(x=>x.id===i.prodId);if(p)p.stock+=i.qty});
  
  // auto expense tx ONLY if not already paid/handled
  const hasTx = S.txs.find(t => t.orderId === o.id);
  if(total > 0 && !hasTx) {
    S.txs.push({id:uid(),type:'expense',desc:`Pedido #${String(o.num).padStart(4,'0')} recibido`,amount:total,cur:o.cur||'$',cat:'Stock / Compras',date:today(),orderId:o.id});
  } else if (hasTx) {
    // Ensure the tx has the latest info if needed, but usually payment is the main event
    hasTx.amount = total; 
  }

  toast('◆ Pedido recibido · Stock actualizado');
  lsave();renderAll();cm('recv-modal');updateBadges();
}
function openEditOrderModal(id) {
  editIds.order = id;
  const o = S.orders.find(x => x.id === id);
  if(!o) return;
  const sup = S.contacts.find(c => c.id === o.supId);
  const total = o.totalAmount || o.items.reduce((a,i)=>a+i.qty*(S.products.find(p=>p.id===i.prodId)?.buyPrice||i.price||0),0);

  g('provNombre').value = sup ? sup.name : 'Sin proveedor';
  g('provRef').value = o.ref || '';
  g('provCostoTotal').value = total.toFixed(2);
  g('provMoneda').value = o.cur || '$';
  g('provMontoPagado').value = (o.paidAmount || 0).toFixed(2);
  g('provEstado').value = o.status || 'pending';

  // Payment Integration
  populateAccountSelect('provPayAccount');
  g('provPayStatus').value = o.payStatus || 'pending';
  g('provPayAccount').value = o.payAccountId || '';

  g('order-edit-modal').style.display = 'flex';
}

function saveEditOrder() {
  const id = editIds.order;
  const idx = S.orders.findIndex(x => x.id === id);
  if(idx < 0) return;

  const ref = g('provRef').value.trim();
  const total = parseFloat(g('provCostoTotal').value) || 0;
  const cur = g('provMoneda').value;
  const paid = parseFloat(g('provMontoPagado').value) || 0;
  const status = g('provEstado').value;

  const payStatus = g('provPayStatus').value;
  const payAccountId = g('provPayAccount').value;

  const oldStatus = S.orders[idx].status;
  
  S.orders[idx].ref = ref;
  S.orders[idx].totalAmount = total;
  S.orders[idx].cur = cur;
  S.orders[idx].paidAmount = paid;
  S.orders[idx].payStatus = payStatus;
  S.orders[idx].payAccountId = payAccountId;
  
  if (status === 'received' && oldStatus !== 'received') {
    recvOrderId = id;
    confirmReceive();
    cm('order-edit-modal');
  } else {
    S.orders[idx].status = status;
    syncOrderPayment(id);
    lsave(); renderAll(); cm('order-edit-modal'); toast('◆ Pedido actualizado');
  }
}
