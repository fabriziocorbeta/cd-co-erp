// CD & Co ERP — TRANSACTIONS
// ====================================

// ══════════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════════
let txPeriod = 'month'; // 'month' | 'week' | 'day'
let txCursorDate = new Date();
let txFltType = 'all';

function setTxPer(p) {
  txPeriod = p;
  document.querySelectorAll('#tx-p-mo, #tx-p-wk, #tx-p-dy').forEach(b=>{b.style.borderColor='transparent';b.style.color='var(--mu)'});
  const el = document.getElementById(p==='month'?'tx-p-mo':p==='week'?'tx-p-wk':'tx-p-dy');
  if(el) { el.style.borderColor='var(--g2)'; el.style.color='var(--g2)'; }
  renderTxs();
}

function setTxType(t) {
  txFltType = t;
  document.querySelectorAll('#tx-t-all, #tx-t-inc, #tx-t-exp').forEach(b=>b.classList.remove('on'));
  document.getElementById(t==='all'?'tx-t-all':t==='income'?'tx-t-inc':'tx-t-exp').classList.add('on');
  renderTxs();
}

function moveTxCursor(dir) {
  if (txPeriod === 'month') {
    txCursorDate.setMonth(txCursorDate.getMonth() + dir);
  } else if (txPeriod === 'week') {
    txCursorDate.setDate(txCursorDate.getDate() + (dir * 7));
  } else {
    txCursorDate.setDate(txCursorDate.getDate() + dir);
  }
  renderTxs();
}

function getTxDateRange(date, period) {
  const d = new Date(date.getTime());
  let dStart, dEnd, label;
  
  if (period === 'month') {
    dStart = new Date(d.getFullYear(), d.getMonth(), 1);
    dEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const mns = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    label = `${mns[d.getMonth()]} ${d.getFullYear()}`;
  } else if (period === 'week') {
    const day = d.getDay() || 7;
    dStart = new Date(d.setDate(d.getDate() - day + 1));
    dEnd = new Date(d.setDate(d.getDate() + 6));
    label = `${dStart.getDate()}/${dStart.getMonth()+1} - ${dEnd.getDate()}/${dEnd.getMonth()+1}`;
  } else {
    dStart = new Date(d);
    dEnd = new Date(d);
    label = dStart.toLocaleDateString('es-ES', { weekday:'short', day:'2-digit', month:'short' });
  }
  return { start: dStart.toISOString().slice(0,10), end: dEnd.toISOString().slice(0,10), label };
}

let txChartInstance = null;

function exportCsvFiltered() {
  const txs = window.filteredTxs || [];
  if(!txs.length) { toast('No hay movimientos filtrados para exportar'); return; }
  const rows=['Fecha,Tipo,Descripción,Monto,Moneda,Categoría'];
  txs.forEach(t => rows.push(`${t.date},${t.type==='income'?'Ingreso':'Gasto'},"${t.desc.replace(/"/g, '""')}",${Math.abs(t.amount)},${t.cur||'$'},"${t.cat||''}"`));
  const blob = new Blob([rows.join('\\n')], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cdco-movimientos-filtrados.csv'; a.click();
  toast('◆ Archivo CSV exportado');
}

function renderTxs(){
  const q=(g('tx-search')?.value||'').toLowerCase();
  const curRange = getTxDateRange(txCursorDate, txPeriod);
  
  const prevCursorDate = new Date(txCursorDate.getTime());
  if(txPeriod==='month') prevCursorDate.setMonth(prevCursorDate.getMonth() - 1);
  else if(txPeriod==='week') prevCursorDate.setDate(prevCursorDate.getDate() - 7);
  else prevCursorDate.setDate(prevCursorDate.getDate() - 1);
  const prevRange = getTxDateRange(prevCursorDate, txPeriod);
  
  if(g('tx-period-lbl')) g('tx-period-lbl').textContent = curRange.label;

  // Filtro Estructural
  let txs=[...S.txs].filter(t => t.date >= curRange.start && t.date <= curRange.end).sort((a,b)=>new Date(b.date)-new Date(a.date));
  let prevTxs=[...S.txs].filter(t => t.date >= prevRange.start && t.date <= prevRange.end);
  
  if(txFltType!=='all') txs=txs.filter(t=>t.type===txFltType);
  if(q) {
    txs=txs.filter(t=>{
      const desc = (t.desc||'').toLowerCase();
      const cat = (t.cat||'').toLowerCase();
      const acc = (S.accounts||[]).find(a=>a.id===t.account_id);
      const accN = acc ? acc.name.toLowerCase() : '';
      return desc.includes(q) || cat.includes(q) || accN.includes(q);
    });
  }
  
  window.filteredTxs = txs;

  // METRICS & KPIS
  let cUG=0, cGG=0; txs.forEach(t=>(t.cur||t.currency)==='₲'?cGG++:cUG++); const dCur = cGG>cUG?'₲':'$';
  
  let curInc=0, curExp=0;
  txs.forEach(t=>{
    const isAdj = t.isBalanceAdj === true || (t.desc||'').toLowerCase().includes('ajuste de saldo');
    if(isAdj) return;
    const tC = t.cur||t.currency||dCur;
    if(tC===dCur) {
      if(t.type==='income'||t.type==='transfer-in') curInc+=Math.abs(t.amount);
      else if(t.type==='expense') curExp+=Math.abs(t.amount);
    }
  });
  let prevInc=0, prevExp=0;
  prevTxs.forEach(t=>{
    const isAdj = t.isBalanceAdj === true || (t.desc||'').toLowerCase().includes('ajuste de saldo');
    if(isAdj) return;
    const tC = t.cur||t.currency||dCur;
    if(tC===dCur) {
      if(t.type==='income'||t.type==='transfer-in') prevInc+=Math.abs(t.amount);
      else if(t.type==='expense') prevExp+=Math.abs(t.amount);
    }
  });
  
  const calcVar = (cur, prev) => {
    if(prev===0) return cur>0 ? '+100%' : '0%';
    const pct = ((cur - prev)/prev)*100;
    return (pct>0?'+':'') + pct.toFixed(1) + '%';
  };
  
  if(g('tx-c-inc')) g('tx-c-inc').textContent = fmt(curInc, dCur);
  if(g('tx-c-exp')) g('tx-c-exp').textContent = fmt(curExp, dCur);
  if(g('tx-c-bal')) g('tx-c-bal').textContent = fmt(curInc-curExp, dCur);
  
  const vInc = calcVar(curInc, prevInc);
  const vExp = calcVar(curExp, prevExp);
  const vBal = calcVar(curInc-curExp, prevInc-prevExp);
  
  const getPill = (pctStr, isExp=false) => {
    if(pctStr==='0%'||pctStr==='0.0%') return `<span class="pill" style="color:var(--mu);background:var(--bg3)">= 0%</span><span style="color:var(--m3)"> vs anterior</span>`;
    const isPos = pctStr.startsWith('+');
    const colorClass = isExp ? (isPos?'pill-warn':'pill-pos') : (isPos?'pill-pos':'pill-warn');
    return `<span class="pill ${colorClass}">${pctStr}</span><span style="color:var(--m3)"> vs anterior</span>`;
  };
  
  if(g('tx-c-inc-var')) g('tx-c-inc-var').innerHTML = getPill(vInc);
  if(g('tx-c-exp-var')) g('tx-c-exp-var').innerHTML = getPill(vExp, true);
  if(g('tx-c-bal-var')) g('tx-c-bal-var').innerHTML = getPill(vBal);

  // ══════════════════════════════════════════
  // ANALYTICS (DONUT & BARS)
  // ══════════════════════════════════════════
  const chartColors = ['#4e73df', '#1cc88a', '#f6c23e', '#e74a3b', '#36b9cc', '#858796', '#e83e8c', '#fd7e14', '#20c997', '#6f42c1'];
  
  const expTxs = txs.filter(t=>t.type==='expense' && (t.cur||t.currency||dCur)===dCur);
  const incTxs = txs.filter(t=>t.type==='income' && (t.cur||t.currency||dCur)===dCur);

  const expSums={}, incSums={};
  let totalExpAna=0, totalIncAna=0;
  expTxs.forEach(t=>{
    const isAdj = t.isBalanceAdj === true || (t.desc||'').toLowerCase().includes('ajuste de saldo');
    if(!isAdj) { expSums[t.cat] = (expSums[t.cat]||0) + Math.abs(t.amount); totalExpAna+=Math.abs(t.amount); }
  });
  incTxs.forEach(t=>{ 
    const isAdj = t.isBalanceAdj === true || (t.desc||'').toLowerCase().includes('ajuste de saldo');
    if(!isAdj) { incSums[t.cat] = (incSums[t.cat]||0) + Math.abs(t.amount); totalIncAna+=Math.abs(t.amount); }
  });
  
  const sortedExp = Object.entries(expSums).sort((a,b)=>b[1]-a[1]);
  const sortedInc = Object.entries(incSums).sort((a,b)=>b[1]-a[1]);
  
  // DONUT & LIST
  if(g('tx-donut')){
    if(g('tx-donut-total')) g('tx-donut-total').textContent = fmt(totalExpAna, dCur);
    
    // Show ALL categories — no truncation
    const allExpCats = sortedExp;

    let chartLabels = allExpCats.map(c=>c[0]);
    let chartData = allExpCats.map(c=>c[1]);
    let listHtml = '';

    allExpCats.forEach((c, i) => {
       const pct = totalExpAna > 0 ? ((c[1]/totalExpAna)*100).toFixed(1) : 0;
       const color = chartColors[i % chartColors.length];
       listHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
         <div style="display:flex;align-items:center;gap:8px">
           <div style="width:10px;height:10px;border-radius:50%;background:${color}"></div>
           <span style="font-size:0.8rem;color:#e2e8f0;font-weight:500">${c[0]}</span>
         </div>
         <div style="display:flex;align-items:center;gap:12px">
           <span style="font-family:var(--fm);font-size:0.8rem;color:#cbd5e1">${fmt(c[1], dCur)}</span>
           <span style="font-size:0.7rem;color:#94a3b8;width:35px;text-align:right">${pct}%</span>
         </div>
       </div>`;
    });

    if(g('tx-donut-list')){
      if(!allExpCats.length) {
        g('tx-donut-list').innerHTML = '<div style="color:var(--m3);text-align:center;font-size:0.8rem">Sin gastos registrados</div>';
      } else {
        g('tx-donut-list').innerHTML = `<div style="max-height:300px;overflow-y:auto;padding-right:4px">${listHtml}</div>`;
      }
    }

    if(window.Chart){
      if(txChartInstance) txChartInstance.destroy();
      const dynamicColors = allExpCats.map((_, i) => chartColors[i % chartColors.length]);
      txChartInstance = new Chart(g('tx-donut'), {
        type: 'doughnut',
        data: { labels: chartLabels, datasets: [{ data: chartData, backgroundColor: dynamicColors, borderWidth: 0}] },
        options: { cutout: '75%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c){ return ' ' + fmt(c.parsed, dCur); } } } } }
      });
    }
  }

  // BARS (Análisis Absoluto)
  if(g('tx-bars-exp') && g('tx-bars-inc')){
    if(g('tx-ana-exp-tot')) g('tx-ana-exp-tot').textContent = fmt(totalExpAna, dCur);
    if(g('tx-ana-inc-tot')) g('tx-ana-inc-tot').textContent = fmt(totalIncAna, dCur);
    
    const renderBars = (container, moreContainer, sortedData, totalAna, isExp) => {
      const allCats = sortedData; // Show ALL categories, no truncation

      const badgeColor = isExp ? '#d47a7a' : 'var(--pos)';

      if(!allCats.length) {
         g(container).innerHTML = '<div style="color:var(--m3);font-size:.75rem">Sin datos.</div>';
         g(moreContainer).innerHTML = '';
         return;
      }

      g(container).innerHTML = allCats.map((c, i) => {
         const pct = totalAna > 0 ? (c[1]/totalAna)*100 : 0;
         return `
           <div>
             <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
               <div style="display:flex;align-items:center;gap:6px">
                 <div style="width:6px;height:6px;border-radius:50%;background:${badgeColor}"></div>
                 <span style="font-size:0.75rem;color:#e2e8f0;font-weight:500">${c[0]}</span>
               </div>
               <div style="display:flex;align-items:center;gap:10px">
                 <span style="font-size:0.7rem;color:#94a3b8">${pct.toFixed(1)}%</span>
                 <span style="font-family:var(--fm);font-size:0.75rem;color:${badgeColor}">${fmt(c[1], dCur)}</span>
               </div>
             </div>
             <div style="width:100%;background:var(--bg3);height:4px;border-radius:2px;overflow:hidden">
               <div style="width:${pct}%;background:${badgeColor};height:100%"></div>
             </div>
           </div>
         `;
      }).join('');

      g(moreContainer).textContent = allCats.length + ' categorías';
    };
    
    renderBars('tx-bars-exp', 'tx-bars-exp-more', sortedExp, totalExpAna, true);
    renderBars('tx-bars-inc', 'tx-bars-inc-more', sortedInc, totalIncAna, false);
  }

  const tb=g('tx-tbody');
  if(!txs.length){tb.innerHTML=`<tr><td colspan="8" class="tbl-empty">Sin movimientos. Agregá el primero.</td></tr>`;return}
  tb.innerHTML=txs.map(tx=>{
    let accName = '—';
    if(tx.account_id) {
      const a=(S.accounts||[]).find(x=>x.id===tx.account_id);
      if(a) accName=a.name;
      else {
        const c=(S.cards||[]).find(x=>x.id===tx.account_id);
        if(c) accName='💳 '+c.name;
      }
    }
    const isPos=tx.type==='income'||tx.type==='transfer-in';
    const amtColor=isPos?'var(--pos)':'#d47a7a';
    const amtSign=isPos?'+':'-';
    const tCur = tx.cur || tx.currency || '₲';
    let typePill;
    if(tx.type==='income') typePill='<span class="pill pill-pos">Ingreso</span>';
    else if(tx.type==='expense') typePill='<span class="pill pill-neg">Gasto</span>';
    else if(tx.type==='transfer-in') typePill='<span class="pill" style="background:rgba(74,122,181,.18);color:var(--g2)">⇄ Entrada</span>';
    else typePill='<span class="pill" style="background:rgba(74,122,181,.18);color:var(--g2)">⇄ Salida</span>';
    return `<tr>
    <td class="mono">${fmtDate(tx.date)}</td>
    <td><strong>${tx.desc}</strong></td>
    <td><span class="pill pill-neu">${tx.cat}</span></td>
    <td class="mono">${tCur}</td>
    <td class="mono" style="color:${amtColor}">${amtSign}${fmt(Math.abs(tx.amount), tCur)}</td>
    <td>${typePill}</td>
    <td style="font-size:.62rem;color:var(--mu);font-family:var(--fm)">${accName}</td>
    <td><div class="actions">
      <button class="btn btn-s" style="padding:4px 8px;font-size:.62rem" onclick="openTxModal('${tx.type}','${tx.id}')">✏</button>
      <button class="btn btn-danger" style="padding:4px 8px;font-size:.62rem" onclick="delTx('${tx.id}')">✕</button>
    </div></td>
  </tr>`;
  }).join('');
}

function openTxModal(type,id){
  editIds.tx=id||null;txType=type||'income';
  g('tx-mttl').textContent=id?'Editar movimiento':'Nuevo movimiento';
  g('tx-desc').value='';g('tx-amt').value='';g('tx-cur').value='$';g('tx-date').value=today();
  if(typeof populateTxAccountSelect==='function') populateTxAccountSelect();
  const txAcc=g('tx-account'); if(txAcc) txAcc.value='';
  setTT(txType); // setTT ya llama populateTxCat
  if(id){const tx=S.txs.find(t=>t.id===id);if(tx){txType=tx.type;setTT(tx.type);g('tx-desc').value=tx.desc;g('tx-amt').value=Math.abs(tx.amount);g('tx-cur').value=tx.cur||'$';g('tx-cat').value=tx.cat;g('tx-date').value=tx.date;if(txAcc&&tx.account_id)txAcc.value=tx.account_id;}}
  g('tx-acts').innerHTML=id
    ?`<button class="mb mb-d" onclick="delTx('${id}');cm('tx-modal')">Eliminar</button><button class="mb mb-gh" onclick="cm('tx-modal')">Cancelar</button><button class="mb mb-g" onclick="saveTx()">Guardar</button>`
    :`<button class="mb mb-gh" onclick="cm('tx-modal')">Cancelar</button><button class="mb mb-g" onclick="saveTx()">Guardar</button>`;
  g('tx-modal').style.display='flex';
}
function setTT(t){
  txType=t;
  g('tt-inc').style.background=t==='income'?'var(--pb)':'';g('tt-inc').style.borderColor=t==='income'?'rgba(74,155,111,.3)':'var(--bg5)';g('tt-inc').style.color=t==='income'?'var(--pos)':'var(--mu)';
  g('tt-exp').style.background=t==='expense'?'var(--nb)':'';g('tt-exp').style.borderColor=t==='expense'?'rgba(155,74,74,.3)':'var(--bg5)';g('tt-exp').style.color=t==='expense'?'#d47a7a':'var(--mu)';
  if(typeof populateTxCat==='function') populateTxCat(t, 'tx-cat');
}
async function saveTx(){
  const desc=g('tx-desc').value.trim();const amt=parseFloat(g('tx-amt').value);const cur=g('tx-cur').value;const cat=g('tx-cat').value;const date=g('tx-date').value;
  if(!desc){toast('Ingresá una descripción');return}if(!amt||amt<=0){toast('Monto inválido');return}if(!date){toast('Seleccioná una fecha');return}
  const accId=g('tx-account')?.value||'';
  const isEdit=!!editIds.tx;
  // Expenses are stored as negative amounts (Audit-First: SUM(amount) = balance)
  const signedAmt = txType === 'expense' ? -Math.abs(amt) : Math.abs(amt);
  const tx={type:txType,desc,amount:signedAmt,cur,cat,date,id:isEdit?editIds.tx:uid()};
  if(accId) tx.account_id=accId;

  if(SB_ON){
    const saved=await sbUpsert('txs',tx);
    if(!saved)return;
    const i=S.txs.findIndex(t=>t.id===tx.id);
    if(i>=0)S.txs[i]=saved;else S.txs.unshift(saved);
  } else {
    if(isEdit){const i=S.txs.findIndex(t=>t.id===tx.id);if(i>=0)S.txs[i]={...S.txs[i],...tx};}
    else S.txs.unshift(tx);
    lsave();
  }

  // Recalculate account balances from txs after every save (Audit-First)
  if(typeof recomputeBalances==='function') recomputeBalances();
  toast(isEdit?'◆ Actualizado':txType==='income'?'◆ Ingreso registrado':'◆ Gasto registrado');
  if(txType==='expense'&&typeof checkBudgetAlerts==='function') checkBudgetAlerts();
  renderAll();cm('tx-modal');
}
async function delTx(id){
  if(!confirm('¿Eliminar este movimiento?'))return;
  if(SB_ON){const ok=await sbDelete('txs',id);if(!ok)return;}
  S.txs=S.txs.filter(t=>t.id!==id);
  if(!SB_ON)lsave();
  if(typeof recomputeBalances==='function') recomputeBalances();
  renderAll();toast('Eliminado');
}

// ══════════════════════════════════════════
// CSV IMPORT
// ══════════════════════════════════════════
function openCsvModal() {
  const fi = document.getElementById('csv-import-input');
  if(fi) {
    fi.value = '';
    fi.click();
  }
}

function handleCsvImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    const text = evt.target.result;
    const lines = text.split('\n');
    let importedCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
       const line = lines[i].trim();
       if (!line) continue;
       let parts = line.split(',');
       if(parts.length < 6 && line.includes(';')) parts = line.split(';');
       if (parts.length < 4) continue;
       
       let dateStr = parts[0] ? parts[0].replace(/"/g, '').trim() : '';
       let typeStr = parts[1] ? parts[1].replace(/"/g, '').trim().toLowerCase() : '';
       let desc = parts[2] ? parts[2].replace(/"/g, '').trim() : '';
       let amtStr = parts[3] ? parts[3].replace(/"/g, '').trim() : '0';
       let cur = parts[4] ? parts[4].replace(/"/g, '').trim() : '$';
       let cat = parts[5] ? parts[5].replace(/"/g, '').trim() : 'Otros';
       
       if(i===0 && isNaN(parseFloat(amtStr))) continue; // skip header
       
       let amt = parseFloat(amtStr);
       if (isNaN(amt) || amt === 0) continue;
       
       let type = (typeStr === 'ingreso' || typeStr === 'income' || typeStr === 'transfer-in') ? 'income' : 'expense';
       if(amt < 0) {
         type = 'expense';
         amt = Math.abs(amt);
       }
       
       if(dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
          let p = dateStr.split('/');
          dateStr = `${p[2]}-${p[1]}-${p[0]}`;
       } else if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          dateStr = typeof today === 'function' ? today() : new Date().toISOString().split('T')[0];
       }
       
       const tx = {
         id: typeof uid === 'function' ? uid() : Math.random().toString(36).substr(2, 9),
         type: type,
         desc: desc || 'Importado',
         amount: amt,
         cur: cur || '$',
         cat: cat || 'Otros',
         date: dateStr
       };
       S.txs.push(tx);
       importedCount++;
    }
    
    if (importedCount > 0) {
      if(typeof lsave === 'function') lsave();
      if(typeof renderAll === 'function') renderAll();
      if(typeof toast === 'function') toast(`◆ Importados ${importedCount} movimientos`);
    } else {
      if(typeof toast === 'function') toast('No se encontraron movimientos válidos en el archivo');
    }
  };
  reader.readAsText(file);
}
