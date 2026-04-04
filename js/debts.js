// CD & Co ERP — DEBTS & CARDS
// ====================================

// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let debtTab='cards'; // 'cards' | 'debts'
let editCardId=null, editDebtId=null;

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function getDaysUntil(dayOfMonth){
  const now=new Date();
  const target=new Date(now.getFullYear(),now.getMonth(),dayOfMonth);
  if(target<now) target.setMonth(target.getMonth()+1);
  return Math.ceil((target-now)/(1000*60*60*24));
}
function getDaysUntilDate(dateStr){
  if(!dateStr) return 9999;
  const now=new Date(); now.setHours(0,0,0,0);
  const t=new Date(dateStr+'T00:00:00');
  return Math.ceil((t-now)/(1000*60*60*24));
}
function usagePct(used,limit){return limit>0?Math.min(100,Math.round(used/limit*100)):0}
function usageColor(pct){return pct>=90?'#d47a7a':pct>=70?'#e8b124':'var(--pos)'}
function cardAccent(color){const m={'gold':'linear-gradient(135deg,#2a2008,#3d2e08)','blue':'linear-gradient(135deg,#081828,#0a2a40)','dark':'linear-gradient(135deg,#141210,#1c1917)','purple':'linear-gradient(135deg,#1a0828,#28103f)','green':'linear-gradient(135deg,#081a10,#0e2a18)'};return m[color]||m['dark'];}
function cardBorder(color){const m={'gold':'rgba(201,150,12,.55)','blue':'rgba(74,122,181,.55)','dark':'rgba(255,255,255,.12)','purple':'rgba(122,90,181,.55)','green':'rgba(74,155,111,.55)'};return m[color]||m['dark'];}
function cardTextColor(color){const m={'gold':'var(--g3)','blue':'#7ab5e8','dark':'var(--cr)','purple':'#b87ae8','green':'var(--pos)'};return m[color]||'var(--cr)';}

function calcNextInst(total, paid, inst, paidInst) {
  const rem = total - (paid || 0);
  const rI = inst - (paidInst || 0);
  if (rI <= 0) return 0;
  return Math.max(0, rem / rI);
}

function getDebtNextDueDate(d) {
  if (!d.dueDate) return null;
  if (!d.installments || d.installments <= 0) return d.dueDate;
  
  const remI = d.installments - (d.paidInstallments || 0);
  if (remI <= 0) return null;

  const target = new Date(d.dueDate + 'T00:00:00');
  // Final date - (remaining - 1) months = Next due date
  target.setMonth(target.getMonth() - (remI - 1));
  
  return target.toISOString().split('T')[0];
}

function getCardUsed(cardId) {
  const c = (S.cards || []).find(x => x.id === cardId);
  if(!c) return 0;
  // Supabase returns account_id (snake_case); locally created txs may use accountId
  const txSum = (S.txs || []).reduce((acc, tx) => {
    const acctId = tx.account_id || tx.accountId;
    if (acctId === cardId) {
      acc += parseFloat(tx.amount) || 0;
    }
    return acc;
  }, 0);
  // Expenses are stored as negative amounts → negate the sum to get positive used balance
  // Payments (positive amounts) reduce the used balance automatically
  const used = parseFloat(c.used || 0) - txSum;
  return used > 0 ? used : 0;
}

// ══════════════════════════════════════════
// RENDER PAGE
// ══════════════════════════════════════════
function renderDebtsPage(){
  renderDebtsTab();
  if(debtTab==='cards') renderCards();
  else renderDebts();
}

function renderDebtsTab(){
  const tabs=['cards','debts'];
  tabs.forEach(t=>{
    const el=g('dtab-'+t);
    if(el) el.classList.toggle('on',t===debtTab);
  });
  const btnCard=g('dbtn-card'), btnDebt=g('dbtn-debt');
  if(btnCard) btnCard.style.display=debtTab==='cards'?'':'none';
  if(btnDebt) btnDebt.style.display=debtTab==='debts'?'':'none';
}

function switchDebtTab(t){
  debtTab=t;
  renderDebtsTab();
  const sc=g('section-cards'), sd=g('section-debts');
  if(sc) sc.style.display=t==='cards'?'':'none';
  if(sd) sd.style.display=t==='debts'?'':'none';
  if(t==='cards') renderCards();
  else renderDebts();
}

// ══════════════════════════════════════════
// ══════════════════════════════════════════
// ETHEREAL 3D CARDS RENDER
// ══════════════════════════════════════════
function renderCards(){
  const el=g('cards-list');
  if(!el) return;
  if(!S.cards||!S.cards.length){
    el.innerHTML='<div class="tbl-empty" style="padding:30px;width:100%;text-align:center">Sin tarjetas registradas. Agregá la primera.</div>';
    g('card-details-panel').style.display = 'none';
    return;
  }
  
  el.innerHTML=S.cards.map((c, i)=>{

    
    const isFirstRun = !editCardId && i === 0;
    if(isFirstRun) editCardId = c.id;
    
    const activeClass = (editCardId === c.id) ? 'active' : '';
    const clickHandler = `selectCard3D('${c.id}')`;
    const tc = cardTextColor(c.color||'dark');
    
    return `<div class="eth-cd ${activeClass}" onclick="${clickHandler}">
         <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <span style="font-size:1.1rem;font-weight:600;letter-spacing:1px;color:${tc}">${c.brand||c.name}</span>
            <span style="font-size:1.4rem">💳</span>
         </div>
         <div style="margin-top:20px;margin-bottom:20px">
            <div style="font-family:var(--fm);letter-spacing:4px;font-size:1.3rem;margin-bottom:4px;text-shadow: 0 2px 4px rgba(0,0,0,0.5)">**** **** **** ${c.last4 || '----'}</div>
         </div>
         <div style="display:flex;justify-content:space-between;font-size:.7rem;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px">
            <span style="flex:1;white-space:nowrap;overflow:hidden">${c.name}</span>
            <span style="margin-left:8px">EXP ${c.exp || '--/--'}</span>
         </div>
      </div>`;
  }).join('');
  
  if(editCardId) renderCardDetails(editCardId);
  else if(g('card-details-panel')) g('card-details-panel').style.display='none';

  if(typeof renderCardsDashboard === 'function') renderCardsDashboard();
}

let cardsChartInstances = [];

function renderCardsDashboard() {
  const tbody = g('cards-summary-tbody');
  if(!tbody) return;
  if(!S.cards || !S.cards.length){
    if(g('cards-dashboard-grid')) g('cards-dashboard-grid').style.display = 'none';
    return;
  }
  if(g('cards-dashboard-grid')) g('cards-dashboard-grid').style.display = '';
  
  let html = '';
  let usageByCur = {};
  
  S.cards.forEach(c => {
    const cur = c.cur || '$';
    if(!usageByCur[cur]) usageByCur[cur] = { total: 0, labels: [], data: [] };
    
    const used = getCardUsed(c.id);
    usageByCur[cur].total += used;
    
    if(used > 0) {
      usageByCur[cur].labels.push(c.brand || c.name);
      usageByCur[cur].data.push(used);
    }
    
    const daysC = getDaysUntil(c.cutDay||1);
    const urgentC = daysC <= 7;
    const accent = cardTextColor(c.color||'dark');
    
    html += `<tr>
       <td><strong style="color:${accent}">${c.brand||c.name}</strong><div style="font-size:.6rem;color:var(--m3);margin-top:2px">**${c.last4 || '----'}</div></td>
       <td class="mono" style="color:var(--cr)">${fmt(used, cur)}</td>
       <td class="mono" style="color:var(--mu)">El ${c.cutDay}</td>
       <td class="mono" ${urgentC ? 'style="color:#d47a7a"' : 'style="color:var(--pos)"'}>${daysC}d</td>
       <td><button class="btn btn-s" style="font-size:.6rem;padding:4px 9px" onclick="openPayCardModal('${c.id}')">💳 Pagar</button></td>
    </tr>`;
  });
  
  tbody.innerHTML = html;
  
  const container = g('cards-donuts-container');
  if(container) {
    if(cardsChartInstances && cardsChartInstances.length) {
      cardsChartInstances.forEach(ch => ch.destroy());
    }
    cardsChartInstances = [];
    
    const curs = Object.keys(usageByCur);
    if(curs.length === 0) {
      container.innerHTML = '<div style="color:var(--mu);font-size:.8rem;padding:20px">Sin uso registrado.</div>';
    } else {
      let chartsHtml = '';
      curs.forEach((cur, idx) => {
         const dataObj = usageByCur[cur];
         const cId = 'cards-donut-' + idx;
         chartsHtml += `
            <div style="position:relative; width:180px; height:180px; display:flex; align-items:center; justify-content:center;">
               <canvas id="${cId}" style="position:relative; z-index:2;"></canvas>
               <div style="position:absolute; text-align:center; z-index:1; display:flex; flex-direction:column; gap:2px">
                  <span style="font-size:.55rem; color:var(--mu); text-transform:uppercase; letter-spacing:1px;">Uso Total</span>
                  <span style="font-size:1.1rem; color:var(--g2); font-weight:600;">${fmt(dataObj.total, cur)}</span>
               </div>
            </div>`;
      });
      container.innerHTML = chartsHtml;
      
      setTimeout(() => {
        curs.forEach((cur, idx) => {
           if(!window.Chart) return;
           const cId = 'cards-donut-' + idx;
           const ctx = g(cId);
           if(!ctx) return;
           
           let chartLabels = usageByCur[cur].labels;
           let chartData = usageByCur[cur].data;
           if(chartData.length === 0) {
              chartLabels = ['Sin Uso'];
              chartData = [1];
           }
           
           const ch = new Chart(ctx.getContext('2d'), {
             type: 'doughnut',
             data: {
               labels: chartLabels,
               datasets: [{
                 data: chartData,
                 backgroundColor: ['#c9960c','#a37a0a','#7d5d08','#574005','#302402','#222'],
                 borderWidth: 0
               }]
             },
             options: {
               cutout: '75%', responsive: true, maintainAspectRatio: false,
               plugins: { legend: { position: 'bottom', labels: { color: '#8a8278', font: { family: 'DM Mono', size: 9 } } } }
             }
           });
           cardsChartInstances.push(ch);
        });
      }, 0);
    }
  }
}

window.selectCard3D = function(id) {
  editCardId = id;
  renderCards();
};

function renderCardDetails(id) {
  const c = S.cards.find(x => x.id === id);
  const dp = g('card-details-panel');
  if(!c) { dp.style.display = 'none'; return; }
  dp.style.display = 'flex';
  
  const used = getCardUsed(c.id);
  const pct = usagePct(used,c.limit);
  const col = usageColor(pct);
  const avail = Math.max(0,(c.limit||0)-used);
  const daysC = getDaysUntil(c.cutDay||1);
  const daysP = getDaysUntil(c.payDay||1);
  
  const txs = (S.txs||[]).filter(t=>(t.account_id||t.accountId) === c.id).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  const subs = (S.subscriptions||[]).filter(s=>(s.account_id||s.accountId) === c.id && s.active);

  dp.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;border-bottom:1px solid var(--bg5);padding-bottom:16px">
      <div style="font-size:1.2rem;font-weight:300;color:var(--cr)">${c.name}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-g" style="font-size:.7rem;padding:6px 12px" onclick="openPayCardModal('${c.id}')">💳 Pagar</button>
        <button class="btn btn-s" style="font-size:.7rem;padding:6px 12px" onclick="openCardModal('${c.id}')">✏ Editar</button>
        <button class="btn btn-danger" style="font-size:.7rem;padding:6px 12px" onclick="delCard('${c.id}')">✕ Eliminar</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      <div style="background:var(--bg3);border-radius:12px;padding:16px;border:1px solid var(--bg4)">
        <div style="font-size:.7rem;color:var(--mu);margin-bottom:8px">Uso de la línea</div>
        <div style="display:flex;justify-content:space-between;align-items:end;margin-bottom:8px">
           <div style="font-size:1.6rem;font-weight:300;color:${col}">${fmt(used,c.cur||'$')}</div>
           <div style="font-size:.8rem;color:var(--m3);margin-bottom:4px">/ ${fmt(c.limit||0,c.cur||'$')}</div>
        </div>
        <div style="width:100%;height:6px;background:var(--bg5);border-radius:3px;overflow:hidden;margin-bottom:8px">
           <div style="width:${pct}%;height:100%;background:${col}"></div>
        </div>
        <div style="font-size:.7rem;color:var(--pos);text-align:right">Disponible: ${fmt(avail,c.cur||'$')}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
         <div style="background:var(--bg3);border-radius:12px;padding:16px;flex:1;display:flex;flex-direction:column;justify-content:center;border:1px solid var(--bg4)">
            <div style="font-size:.7rem;color:var(--mu)">Corte</div>
            <div style="font-size:1.1rem;color:var(--cr)">${daysC} días <span style="font-size:.7rem;color:var(--m3);font-weight:normal">(El ${c.cutDay})</span></div>
         </div>
         <div style="background:var(--bg3);border-radius:12px;padding:16px;flex:1;display:flex;flex-direction:column;justify-content:center;border:1px solid var(--bg4)">
            <div style="font-size:.7rem;color:var(--mu)">Vencimiento límite</div>
            <div style="font-size:1.1rem;color:var(--cr)">${daysP} días <span style="font-size:.7rem;color:var(--m3);font-weight:normal">(El ${c.payDay})</span></div>
         </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px">
       <div>
          <div style="font-size:.8rem;color:var(--g2);margin-bottom:12px;border-bottom:1px solid var(--bg4);padding-bottom:6px">Últimas transacciones</div>
          ${txs.length===0?'<div style="font-size:.7rem;color:var(--mu)">Sin gastos recientes</div>':txs.map(tx=>{
            const isInc = (tx.type === 'income' || tx.type === 'transfer-in' || (tx.desc || '').toLowerCase().includes('pago'));
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px dashed var(--bg4)"><div><div style="font-size:.75rem;color:var(--cr)">${tx.desc}</div><div style="font-size:.65rem;color:var(--m3)">${fmtDate(tx.date)}</div></div><div style="font-size:.8rem;color:${isInc?'var(--pos)':'#d47a7a'}">${isInc?'+':'-'}${fmt(Math.abs(tx.amount),tx.cur)}</div></div>`}).join('')}
       </div>
       <div>
          <div style="font-size:.8rem;color:var(--g2);margin-bottom:12px;border-bottom:1px solid var(--bg4);padding-bottom:6px">Suscripciones atadas</div>
          ${subs.length===0?'<div style="font-size:.7rem;color:var(--mu)">Sin suscripciones activas</div>':subs.map(s=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px dashed var(--bg4)"><div style="display:flex;align-items:center;gap:8px"><div style="font-size:1.1rem">${s.icon||'💎'}</div><div><div style="font-size:.75rem;color:var(--cr)">${s.name}</div><div style="font-size:.65rem;color:var(--pos)">Cobro: día ${s.payDay}</div></div></div><div style="font-size:.8rem;color:#d47a7a">-${fmt(s.amount,s.cur)}</div></div>`).join('')}
       </div>
    </div>`;
}

// ══════════════════════════════════════════
// DEBTS RENDER
// ══════════════════════════════════════════
function renderDebts(){
  const el=g('debts-tbody');
  if(!el) return;
  if(!S.debts||!S.debts.length){
    el.innerHTML='<tr><td colspan="8" class="tbl-empty">Sin deudas registradas.</td></tr>';
    return;
  }
  const sorted=[...S.debts].sort((a,b)=>a.status==='paid'?1:-1);
  el.innerHTML=sorted.map(d=>{
    const nextDate = getDebtNextDueDate(d);
    const days=getDaysUntilDate(nextDate || d.dueDate);
    const urgnt=d.status!=='paid'&&days<=7;
    const pct=d.totalAmount>0?Math.min(100,Math.round((d.paidAmount||0)/d.totalAmount*100)):0;
    const remaining=(d.totalAmount||0)-(d.paidAmount||0);
    const instStr=d.installments>0?`${d.paidInstallments||0}/${d.installments}`:'—';
    const daysLabel=d.status==='paid'?'—':days<0?`Vencida ${Math.abs(days)}d`:days===0?'Hoy!':days+'d';
    const daysClass=d.status==='paid'?'':'color:'+(days<=0?'#d47a7a':days<=7?'#e8b124':'var(--pos)');
    const nextInst = calcNextInst(d.totalAmount||0, d.paidAmount||0, d.installments||0, d.paidInstallments||0);
    const nextInstStr = nextInst > 0 ? `<div style="font-size:.65rem;color:var(--g2);margin-top:2px">Próx. Cuota: ${fmt(nextInst, d.cur||'$')}</div>` : '';

    return `<tr>
      <td><strong style="color:var(--cr)">${d.creditor}</strong>${nextInstStr}<div style="font-size:.6rem;color:var(--m3);margin-top:1px">${d.description||''}</div></td>
      <td class="mono" style="color:var(--g2)">${fmt(d.totalAmount||0,d.cur||'$')}</td>
      <td class="mono" style="color:#d47a7a">${fmt(remaining>0?remaining:0,d.cur||'$')}</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div style="flex:1;height:5px;background:var(--bg4);border-radius:99px;overflow:hidden;min-width:60px">
            <div style="height:100%;width:${pct}%;background:${usageColor(pct)};border-radius:99px;transition:width .3s"></div>
          </div>
          <span class="mono" style="font-size:.6rem;color:var(--mu)">${pct}%</span>
        </div>
      </td>
      <td class="mono" style="color:var(--mu)">${instStr}</td>
      <td class="mono" style="${daysClass}">${daysLabel}</td>
      <td><span class="pill ${d.status==='paid'?'pill-pos':'pill-warn'}">${d.status==='paid'?'Pagada':'Activa'}</span></td>
      <td><div class="actions" style="opacity:1;gap:4px">
        ${d.status!=='paid'?`<button class="btn btn-g" style="font-size:.58rem;padding:3px 7px" onclick="openDebtPayModal('${d.id}')">💳 Pagar</button>`:''}
        <button class="btn btn-o" style="font-size:.58rem;padding:3px 7px;min-width:auto" onclick="openDebtModal('${d.id}')">✏</button>
        <button class="btn btn-danger" style="font-size:.58rem;padding:3px 7px;min-width:auto" onclick="delDebt('${d.id}')">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════
// CARDS MODAL
// ══════════════════════════════════════════
function openCardModal(id){
  editCardId=id||null;
  g('card-mttl').textContent=id?'Editar tarjeta':'Nueva tarjeta';
  const c=id?S.cards.find(x=>x.id===id):null;
  g('cc-name').value=c?c.name:'';
  g('cc-bank').value=c?c.bank:'';
  g('cc-limit').value=c?c.limit:'';
  g('cc-used').value=c?c.used:'';
  g('cc-cut').value=c?c.cutDay:'15';
  g('cc-pay').value=c?c.payDay:'10';
  g('cc-cur').value=c?(c.cur||'$'):'$';
  g('cc-color').value=c?(c.color||'dark'):'dark';
  g('cc-last4').value=c?(c.last4||''):'';
  g('cc-exp').value=c?(c.exp||''):'';
  g('card-acts').innerHTML=id
    ?`<button class="mb mb-d" onclick="delCard('${id}');cm('card-modal')">Eliminar</button><button class="mb mb-gh" onclick="cm('card-modal')">Cancelar</button><button class="mb mb-g" onclick="saveCard()">Guardar</button>`
    :`<button class="mb mb-gh" onclick="cm('card-modal')">Cancelar</button><button class="mb mb-g" onclick="saveCard()">Guardar</button>`;
  g('card-modal').style.display='flex';
}

async function saveCard(){
  const name=g('cc-name').value.trim();
  const bank=g('cc-bank').value.trim();
  const limit=parseFloat(g('cc-limit').value)||0;
  const used=parseFloat(g('cc-used').value)||0;
  const cutDay=parseInt(g('cc-cut').value)||15;
  const payDay=parseInt(g('cc-pay').value)||10;
  const cur=g('cc-cur').value;
  const color=g('cc-color').value;
  const last4=g('cc-last4').value.trim();
  const exp=g('cc-exp').value.trim();
  if(!name){toast('Ingresá un nombre para la tarjeta');return;}
  if(limit<0){toast('El límite no puede ser negativo');return;}
  const isEdit=!!editCardId;
  const card={id:isEdit?editCardId:uid(),name,bank,limit,used,cutDay,payDay,cur,color,last4,exp};
  if(isEdit){
    const i=S.cards.findIndex(c=>c.id===editCardId);
    if(i>=0) S.cards[i]={...S.cards[i],...card};
    toast('◆ Tarjeta actualizada');
  } else {
    S.cards.push(card);
    toast('◆ Tarjeta registrada');
  }
  if(SB_ON){await sbUpsert('cards',card);}else{lsave();}
  renderAll();cm('card-modal');
}

async function delCard(id){
  if(!confirm('¿Eliminar esta tarjeta?')) return;
  if(SB_ON){const ok=await sbDelete('cards',id);if(!ok)return;}
  S.cards=S.cards.filter(c=>c.id!==id);
  if(!SB_ON)lsave();
  renderAll();toast('Eliminado');
}

let payingCardId = null;
function openPayCardModal(id) {
  payingCardId = id;
  const c = S.cards.find(x => x.id === id);
  if(!c) return;
  const pcName = document.getElementById('pc-name');
  if(pcName) pcName.value = c.name;
  
  const accs = S.accounts || [];
  const pcFrom = document.getElementById('pc-from');
  if(pcFrom) pcFrom.innerHTML = '<option value="">Seleccionar cuenta origen...</option>' + 
    accs.map(a => `<option value="${a.id}">${acctTypeIcon(a.type)} ${a.name} (${fmt(getAccountBalance(a.id), a.currency||'$')})</option>`).join('');
  
  const currentDebt = getCardUsed(id);
  const pcAmt = document.getElementById('pc-amt');
  if(pcAmt) pcAmt.value = currentDebt > 0 ? parseFloat(currentDebt.toFixed(2)) : '';
  
  const pcCur = document.getElementById('pc-cur');
  if(pcCur) pcCur.value = c.cur || '$';
  
  const pcDate = document.getElementById('pc-date');
  if(pcDate) pcDate.value = today();
  
  const pcModal = document.getElementById('pay-card-modal');
  if(pcModal) pcModal.style.display = 'flex';
}

async function saveCardPayment() {
  const fromId = document.getElementById('pc-from').value;
  const amt = parseFloat(document.getElementById('pc-amt').value);
  const date = document.getElementById('pc-date').value;

  if(!fromId) { toast('Seleccioná cuenta de origen'); return; }
  if(!amt || amt <= 0) { toast('Ingresá un monto válido'); return; }
  if(!date) { toast('Seleccioná una fecha'); return; }

  const c = S.cards.find(x => x.id === payingCardId);
  const fromAcc = S.accounts.find(a => a.id === fromId);
  const baseId = uid();
  const txOut = { id:'tout-'+baseId, type:'transfer-out', desc:`Pago de tarjeta: ${c.name}`, amount:amt, cur:c.cur||'$', cat:'Pago de Tarjeta', date, accountId:fromId, transferPairId:baseId };
  const txIn  = { id:'tin-' +baseId, type:'transfer-in',  desc:`Pago recibido desde: ${fromAcc?fromAcc.name:'Cuenta'}`, amount:amt, cur:c.cur||'$', cat:'Pago de Tarjeta', date, accountId:payingCardId, transferPairId:baseId };

  if(SB_ON){
    const [s1,s2]=await Promise.all([sbUpsert('txs',txOut),sbUpsert('txs',txIn)]);
    if(!s1||!s2)return;
    S.txs.unshift(s2); S.txs.unshift(s1);
  } else {
    S.txs.push(txOut); S.txs.push(txIn); lsave();
  }
  renderAll(); cm('pay-card-modal');
  toast('Pago de tarjeta registrado');
}

// ══════════════════════════════════════════
// DEBTS MODAL
// ══════════════════════════════════════════
function openDebtModal(id){
  editDebtId=id||null;
  g('debt-mttl').textContent=id?'Editar deuda':'Nueva deuda';
  const d=id?S.debts.find(x=>x.id===id):null;
  g('db-creditor').value=d?d.creditor:'';
  g('db-desc').value=d?d.description:'';
  g('db-total').value = d ? (d.totalAmount || d.total) : '';
  g('db-paid').value = d ? ((d.paidAmount || d.paid) || 0) : 0;
  g('db-inst').value = d ? (d.installments || 0) : '';
  g('db-paid-inst').value = d ? (d.paidInstallments || 0) : '';
  g('db-due').value=d?(d.dueDate||d.due):'';
  g('db-cur').value=d?(d.cur||d.currency||'$'):'$';
  g('debt-acts').innerHTML=id
    ?`<button class="mb mb-d" onclick="delDebt('${id}');cm('debt-modal')">Eliminar</button><button class="mb mb-gh" onclick="cm('debt-modal')">Cancelar</button><button class="mb mb-g" onclick="saveDebt()">Guardar</button>`
    :`<button class="mb mb-gh" onclick="cm('debt-modal')">Cancelar</button><button class="mb mb-g" onclick="saveDebt()">Guardar</button>`;
  g('debt-modal').style.display='flex';
}

async function saveDebt(){
  const creditor=g('db-creditor').value.trim();
  const description=g('db-desc').value.trim();
  const totalAmount=parseFloat(g('db-total').value)||0;
  const paidAmount=parseFloat(g('db-paid').value)||0;
  const installments=parseInt(g('db-inst').value)||0;
  const paidInstallments=parseInt(g('db-paid-inst').value)||0;
  const dueDate=g('db-due').value;
  const cur=g('db-cur').value;
  if(!creditor){toast('Ingresá el nombre del acreedor');return;}
  if(totalAmount<=0){toast('El monto total debe ser mayor a cero');return;}
  const isEdit=!!editDebtId;
  const status=paidAmount>=totalAmount?'paid':'active';
  const remaining=Math.max(0,totalAmount-paidAmount);
  const debt={id:isEdit?editDebtId:uid(),creditor,description,totalAmount,paidAmount,remaining,installments,paidInstallments,dueDate,cur,status};
  if(isEdit){
    const i=S.debts.findIndex(d=>d.id===editDebtId);
    if(i>=0) S.debts[i]={...S.debts[i],...debt};
    toast('◆ Deuda actualizada');
  } else {
    S.debts.push(debt);
    toast('◆ Deuda registrada');
  }
  if(SB_ON){await sbUpsert('debts',debt);}else{lsave();}
  renderAll();cm('debt-modal');
}

async function delDebt(id){
  if(!confirm('¿Eliminar esta deuda?')) return;
  if(SB_ON){const ok=await sbDelete('debts',id);if(!ok)return;}
  S.debts=S.debts.filter(d=>d.id!==id);
  if(!SB_ON)lsave();
  renderAll();toast('Eliminado');
}

async function markDebtPaid(id){
  const i=S.debts.findIndex(d=>d.id===id);
  if(i<0) return;
  S.debts[i].status='paid';
  S.debts[i].paidAmount=S.debts[i].totalAmount;
  S.debts[i].remaining=0;
  if(S.debts[i].installments>0) S.debts[i].paidInstallments=S.debts[i].installments;
  if(SB_ON){await sbUpsert('debts',S.debts[i]);}else{lsave();}
  renderAll();toast('◆ Deuda marcada como pagada');
}

function openDebtPayModal(id) {
  const d = S.debts.find(x => x.id === id);
  if(!d) return;
  
  const pending = Math.max(0, (d.totalAmount || 0) - (d.paidAmount || 0));
  const nextI = calcNextInst(d.totalAmount, d.paidAmount, d.installments, d.paidInstallments);
  
  g('debtp-name').textContent = d.creditor;
  g('debtp-pending').textContent = fmt(pending, d.cur || '$');
  g('debtp-amt').value = nextI > 0 ? nextI.toFixed(2) : '';
  g('debtp-date').value = today();
  
  const accs = S.accounts || [];
  g('debtp-account').innerHTML = '<option value="">Sin cuenta (solo registro)</option>' + 
    accs.map(a => `<option value="${a.id}">${acctTypeIcon(a.type)} ${a.name} (${fmt(getAccountBalance(a.id), a.currency||'$')})</option>`).join('');
  
  if (typeof populateTxCat === 'function') populateTxCat('expense', 'debtp-cat');
  
  payingDebtId = id; // reuse variable or local
  g('debtp-modal').style.display = 'flex';
}

let payingDebtId = null; 

async function saveDebtPay() {
  const id = payingDebtId;
  const amt = parseFloat(g('debtp-amt').value);
  const date = g('debtp-date').value;
  const accId = g('debtp-account').value;
  const registerTx = g('debtp-register-tx').checked;

  if (!amt || amt <= 0) { toast('Ingresá un monto válido'); return; }

  const idx = S.debts.findIndex(d => d.id === id);
  if (idx < 0) return;

  const d = S.debts[idx];
  const nextI = calcNextInst(d.totalAmount, d.paidAmount, d.installments, d.paidInstallments);
  const newPaid = (parseFloat(d.paidAmount) || 0) + amt;
  const completed = newPaid >= parseFloat(d.totalAmount);

  S.debts[idx].paidAmount = newPaid;
  S.debts[idx].remaining = Math.max(0, parseFloat(d.totalAmount) - newPaid);
  if (completed) S.debts[idx].status = 'paid';
  if (d.installments > 0 && amt >= (nextI - 0.01)) {
    S.debts[idx].paidInstallments = Math.min(d.installments, (parseInt(d.paidInstallments || 0) + 1));
  }

  if (SB_ON) { await sbUpsert('debts', S.debts[idx]); } else { lsave(); }

  if (registerTx) {
    const cat = g('debtp-cat')?.value || 'Deudas';
    const tx = { id: uid(), type: 'expense', desc: 'Pago Deuda: ' + d.creditor, amount: amt, cur: d.cur || '$', cat, date };
    if (accId) tx.accountId = accId;
    if (SB_ON) {
      const saved = await sbUpsert('txs', tx);
      if (saved) S.txs.unshift(saved);
    } else {
      S.txs.push(tx); lsave();
    }
  }

  renderAll();
  cm('debtp-modal');
  toast(completed ? '◆ Deuda cancelada' : `◆ Pago de ${fmt(amt, d.cur)} registrado`);
}

// ══════════════════════════════════════════
// DASHBOARD WIDGET
// ══════════════════════════════════════════
function renderDebtAlerts(){
  const el=g('debt-alerts');
  if(!el) return;
  const alerts=[];
  // Card payment alerts
  (S.cards||[]).forEach(c=>{
    const used = getCardUsed(c.id);
    const dp=getDaysUntil(c.payDay||1);
    if(dp<=7) alerts.push({type:'card',label:`💳 ${c.name}`,sub:`Pago en ${dp===0?'hoy':dp+'d'} · ${fmt(used,c.cur||'$')} adeudado`,urgent:dp<=3});
    const dc=getDaysUntil(c.cutDay||1);
    if(dc<=4) alerts.push({type:'cut',label:`✂ Corte: ${c.name}`,sub:`En ${dc===0?'hoy':dc+'d'} · ${fmt(used,c.cur||'$')} a facturar`,urgent:dc<=2});
  });
  // Debt due date alerts
  (S.debts||[]).filter(d=>d.status!=='paid').forEach(d=>{
    const nextDate = getDebtNextDueDate(d);
    if (!nextDate) return;
    const days=getDaysUntilDate(nextDate);
    if(days<=15) alerts.push({type:'debt',label:`📋 ${d.creditor}`,sub:`Vence en ${days<=0?'¡hoy/vencida!':days+'d'} · ${fmt((d.totalAmount||0)-(d.paidAmount||0),d.cur||'$')} restante`,urgent:days<=3});
  });
  if(!alerts.length){
    el.innerHTML='<div class="tbl-empty" style="padding:12px;font-size:.74rem">✓ Sin vencimientos próximos</div>';
    return;
  }
  el.innerHTML=alerts.map(a=>`
    <div style="display:flex;align-items:flex-start;gap:9px;padding:8px 0;border-bottom:1px solid var(--bg5)">
      <div style="width:7px;height:7px;border-radius:50%;background:${a.urgent?'#d47a7a':'#e8b124'};flex-shrink:0;margin-top:5px;${a.urgent?'box-shadow:0 0 6px #d47a7a':''};"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.74rem;font-weight:500;color:var(--cr)">${a.label}</div>
        <div style="font-size:.62rem;color:var(--m3);font-family:var(--fm);margin-top:2px">${a.sub}</div>
      </div>
    </div>`).join('');
}

// Called from updateBadges in nav.js
function getDebtBadgeCount(){
  let n=0;
  (S.cards||[]).forEach(c=>{if(getDaysUntil(c.payDay||1)<=5)n++;});
  (S.debts||[]).filter(d=>d.status!=='paid').forEach(d=>{
    const nextDate = getDebtNextDueDate(d);
    if(nextDate && getDaysUntilDate(nextDate)<=7) n++;
  });
  return n;
}
