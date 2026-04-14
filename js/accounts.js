// CD & Co ERP — ACCOUNTS (Cuentas Bancarias y Efectivo)
// ====================================

// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let editAccountId = null;
let acctDetailOpen = null; // id of account showing history inline

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function acctTypeLabel(type) {
  if (type === 'bank')       return 'Banco';
  if (type === 'cash')       return 'Efectivo';
  if (type === 'investment') return 'Inversión';
  return 'Billetera Digital';
}
function acctTypeIcon(type) {
  if (type === 'bank')       return '🏦';
  if (type === 'cash')       return '💵';
  if (type === 'investment') return '📈';
  return '📱';
}
function acctTypeGradient(type) {
  if (type === 'bank')       return 'linear-gradient(135deg,#071828,#0a2840)';
  if (type === 'cash')       return 'linear-gradient(135deg,#081a10,#0d2a18)';
  if (type === 'investment') return 'linear-gradient(135deg,#1a1408,#2a1f04)';
  return 'linear-gradient(135deg,#1a0828,#281040)';
}
function acctTypeBorder(type) {
  if (type === 'bank')       return 'rgba(74,122,181,.45)';
  if (type === 'cash')       return 'rgba(74,155,111,.45)';
  if (type === 'investment') return 'rgba(232,177,36,.45)';
  return 'rgba(122,90,181,.45)';
}

// ─── INVESTMENT MATH (CFO Logic) ─────────────────────────────────────────────
// Categorías que representan RENDIMIENTO (no capital): se excluyen del base
const INVEST_RETURN_CATS = new Set([
  'Interés','interés','interes','Interes',
  'Dividendo','dividendo',
  'Ganancia','ganancia',
  'Rendimiento','rendimiento',
  'Inversiones',  // categoría usada en práctica para acreditaciones de interés
]);

// Capital Base = capital inicial declarado - retiros (expense txs)
// Los retiros de capital NO son pérdidas de mercado
function getInvestmentCapital(acc) {
  const initialCap = parseFloat(acc.init_balance || acc.initialBalance || 0);
  const retiros = (S.txs || [])
    .filter(t => (t.account_id || t.accountId) === acc.id && t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);
  return Math.max(0, initialCap - retiros);
}

// Intereses = income txs con categoría de rendimiento
// Compatible con account_id (Supabase/snake_case) y accountId (localStorage/camelCase)
function getInvestmentInterests(accountId) {
  return (S.txs || [])
    .filter(t => (t.account_id || t.accountId) === accountId && t.type === 'income' && INVEST_RETURN_CATS.has(t.cat))
    .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
}

// Rendimiento (%) = Intereses / Capital Base × 100
// Desvinculado del balance actual → retiros no distorsionan el %
function getInvestmentROI(acc) {
  const capital = getInvestmentCapital(acc);
  if (!capital) return 0;
  const interests = getInvestmentInterests(acc.id);
  return (interests / capital * 100);
}

// Formateador Intl para montos de inversión (estándar Paraguay)
function fmtInv(amount, cur) {
  const n = parseFloat(amount) || 0;
  if (cur === '₲' || cur === 'G' || cur === 'PYG') {
    return new Intl.NumberFormat('es-PY', { style:'currency', currency:'PYG', maximumFractionDigits:0 }).format(n);
  }
  if (cur === '$' || cur === 'USD') {
    return new Intl.NumberFormat('es-PY', { style:'currency', currency:'USD', minimumFractionDigits:2 }).format(n);
  }
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits:0 }).format(n) + ' ' + cur;
}

// Calculate real balance: initial balance ± all linked transactions
function getAccountBalance(accountId) {
  // La columna `balance` es la fuente de verdad — mantenida por write-through CRUD.
  // No recalculamos desde txs para evitar doble conteo (initialBalance ya refleja saldo final).
  const acc = (S.accounts || []).find(a => a.id === accountId);
  if (!acc) return 0;
  return parseFloat(acc.balance) || 0;
}

// Get transactions linked to an account, sorted by date desc
function getAccountTxs(accountId) {
  return [...(S.txs || [])]
    .filter(tx => (tx.account_id || tx.accountId) === accountId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Total monthly cost across all accounts (used in dashboard)
function getTotalBalancesByCurrency() {
  const totals = {};
  (S.accounts || []).forEach(acc => {
    const cur = acc.cur || acc.currency || '$';
    const bal = getAccountBalance(acc.id);
    totals[cur] = (totals[cur] || 0) + bal;
  });
  return totals;
}

// ══════════════════════════════════════════
// RENDER PAGE
// ══════════════════════════════════════════
function renderAccounts() {
  const grid = g('accounts-grid');
  if (!grid) return;
  // Render cash flow chart after a tick (canvas needs to be visible)
  setTimeout(() => renderCashFlow(), 80);

  const pw = g('acc-networth-panel');
  if(pw) {
    const fxRate = (typeof FX !== 'undefined' && FX.buy) ? FX.buy : 7200;
    let cU=0, cG=0; (S.txs||[]).forEach(t=>t.cur==='₲'?cG++:cU++); const dCur = cG>cU?'₲':'$';
    
    let dtEf = 0; 
    (S.accounts||[]).forEach(a => { const bal = getAccountBalance(a.id); const aCur = a.cur || a.currency || '$'; dtEf += (aCur === dCur ? bal : (dCur==='₲' ? bal*fxRate : bal/fxRate)); });
    
    let dtTarj = 0; 
    (S.cards||[]).forEach(c => { const u = typeof getCardUsed==='function' ? getCardUsed(c.id) : 0; dtTarj += (c.cur === dCur ? u : (dCur==='₲' ? u*fxRate : u/fxRate)); });
    
    let dtCob = 0; 
    (S.receivables||[]).filter(r=>!r.completed).forEach(r => { const u = Math.max(0, parseFloat(r.total||0) - parseFloat(r.paid||0)); dtCob += (r.cur === dCur ? u : (dCur==='₲' ? u*fxRate : u/fxRate)); });
    
    let patNeto = dtEf - dtTarj + dtCob;
    
    pw.innerHTML = `
      <div class="panel pp" style="padding:20px; display:flex; flex-direction:column; gap:16px; border:1px solid rgba(255,255,255,0.05); background:linear-gradient(135deg, var(--bg2), rgba(20,20,20,0.4))">
         <div style="color:var(--mu);font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;font-weight:600">Patrimonio Neto</div>
         
         <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:24px">
           <div>
              <div style="font-size:0.8rem;color:#e2e8f0;margin-bottom:6px"><span style="margin-right:6px">💰</span> Efectivo en cuentas</div>
              <div style="font-size:1.4rem;font-family:var(--fm);color:#fff">${fmt(dtEf, dCur)}</div>
           </div>
           <div>
              <div style="font-size:0.8rem;color:#e2e8f0;margin-bottom:6px"><span style="margin-right:6px">💳</span> Deuda en tarjetas</div>
              <div style="font-size:1.4rem;font-family:var(--fm);color:#d47a7a">-${fmt(dtTarj, dCur)}</div>
           </div>
           <div>
              <div style="font-size:0.8rem;color:#e2e8f0;margin-bottom:6px"><span style="margin-right:6px">🔔</span> A cobrar</div>
              <div style="font-size:1.4rem;font-family:var(--fm);color:var(--pos)">${fmt(dtCob, dCur)}</div>
           </div>
         </div>
         
         <div style="border-top:1px dashed rgba(255,255,255,0.1);padding-top:16px;display:flex;align-items:baseline;justify-content:space-between">
            <span style="font-size:0.9rem;color:var(--mu)">Total Patrimonio</span>
            <span style="font-size:1.8rem;font-weight:600;font-family:var(--fm);color:var(--g2)">${fmt(patNeto, dCur)}</span>
         </div>
      </div>
    `;
  }

  if (!S.accounts || !S.accounts.length) {
    grid.innerHTML = `<div class="tbl-empty" style="padding:40px;grid-column:1/-1">
      Sin cuentas registradas. Agregá tu primera cuenta.
    </div>`;
    return;
  }
  grid.innerHTML = S.accounts.map(acc => {
    const bal = getAccountBalance(acc.id);
    const gradient = acctTypeGradient(acc.type);
    const border = acctTypeBorder(acc.type);
    const icon = acctTypeIcon(acc.type);
    const label = acctTypeLabel(acc.type);
    const cur = acc.cur || acc.currency || '$';
    const isOpen = acctDetailOpen === acc.id;
    const txs = isOpen ? getAccountTxs(acc.id) : [];
    const isInvestment = acc.type === 'investment';

    // Investment-specific metrics (CFO logic)
    const capitalBase = isInvestment ? getInvestmentCapital(acc) : 0;
    const interests   = isInvestment ? getInvestmentInterests(acc.id) : 0;
    const roi         = isInvestment ? getInvestmentROI(acc) : 0;
    // Colores condicionales estrictos: verde = positivo, rojo = negativo
    const roiColor    = roi > 0 ? '#4ade80' : roi < 0 ? '#f87171' : 'var(--mu)';
    const intColor    = interests > 0 ? '#4ade80' : interests < 0 ? '#f87171' : 'var(--mu)';

    const investmentPanel = isInvestment ? `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:10px 0;border-top:1px solid rgba(232,177,36,.2);border-bottom:1px solid rgba(232,177,36,.2);margin:8px 0">
        <div>
          <div class="acc-bal-lbl">Capital Base</div>
          <div style="font-family:var(--fm);font-size:.82rem;color:var(--mu)">${fmtInv(capitalBase, cur)}</div>
        </div>
        <div>
          <div class="acc-bal-lbl">Intereses</div>
          <div style="font-family:var(--fm);font-size:.82rem;color:${intColor}">${interests >= 0 ? '+' : ''}${fmtInv(interests, cur)}</div>
        </div>
        <div>
          <div class="acc-bal-lbl">Rendimiento</div>
          <div style="font-family:var(--fm);font-size:.9rem;font-weight:700;color:${roiColor}">${roi > 0 ? '+' : ''}${roi.toFixed(2)}%</div>
        </div>
      </div>` : `
      <div class="acc-balance-row">
        <div>
          <div class="acc-bal-lbl">Saldo actual</div>
          <div class="acc-balance" style="color:${bal < 0 ? '#d47a7a' : 'var(--g3)'}">${fmt(bal, cur)}</div>
        </div>
        <div>
          <div class="acc-bal-lbl">Saldo inicial</div>
          <div class="acc-balance-init">${fmt(acc.initialBalance || 0, cur)}</div>
        </div>
      </div>`;

    return `
    <div class="account-card" style="background:${gradient};border-color:${border}">
      <div class="acc-shimmer"></div>
      <div class="acc-top">
        <div>
          <div class="acc-type-label">${icon} ${label}${acc.bank ? ' · ' + acc.bank : ''}</div>
          <div class="acc-name">${acc.name}</div>
        </div>
        <div class="acc-actions-top">
          ${isInvestment ? `<button class="btn btn-o" style="font-size:.58rem;padding:3px 10px" onclick="openInterestModal('${acc.id}')">＋ Interés</button>` : ''}
          <button class="btn btn-s" style="font-size:.58rem;padding:3px 8px" onclick="openAccountModal('${acc.id}')">✏</button>
          <button class="btn btn-danger" style="font-size:.58rem;padding:3px 8px" onclick="delAccount('${acc.id}')">✕</button>
        </div>
      </div>
      ${isInvestment ? `
        <div style="margin-top:6px">
          <div class="acc-bal-lbl">Valor actual</div>
          <div class="acc-balance" style="color:var(--g2)">${fmt(bal, cur)}</div>
        </div>` : ''}
      ${investmentPanel}
      <div class="acc-foot">
        <span class="pill ${acc.type==='bank'?'pill-blue':acc.type==='cash'?'pill-pos':acc.type==='investment'?'pill-g':'pill-pur'}">${cur}</span>
        <button class="acc-hist-btn" onclick="toggleAcctDetail('${acc.id}')">
          ${isOpen ? '▲ Ocultar historial' : '▼ Ver historial'}
        </button>
      </div>
      ${isOpen ? `
      <div class="acc-hist">
        <div class="acc-hist-header">
          <span>${txs.length} movimiento${txs.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="acc-hist-scroll">
          ${txs.length === 0 ? '<div class="tbl-empty" style="padding:12px;font-size:.72rem">Sin movimientos en esta cuenta</div>' :
            txs.map(tx => `
            <div class="acc-hist-row">
              <div class="acc-hist-icon" style="background:${tx.type==='income'||tx.type==='transfer-in'?'var(--pb)':'var(--nb)'}">
                ${tx.type==='income'||tx.type==='transfer-in'?'＋':'－'}
              </div>
              <div class="acc-hist-info">
                <div class="acc-hist-desc">${tx.desc}</div>
                <div class="acc-hist-date">${fmtDate(tx.date)}</div>
              </div>
              <div class="acc-hist-amt" style="color:${tx.type==='income'||tx.type==='transfer-in'?'var(--pos)':'#d47a7a'}">
                ${tx.type==='income'||tx.type==='transfer-in'?'+':'-'}${fmt(tx.amount, tx.cur||'$')}
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
    </div>`;
  }).join('');
}

function toggleAcctDetail(id) {
  acctDetailOpen = acctDetailOpen === id ? null : id;
  renderAccounts();
}

// ══════════════════════════════════════════
// DASHBOARD WIDGET
// ══════════════════════════════════════════
function renderAccountsSummary() {
  const el = g('accounts-summary');
  if (!el) return;
  if (!S.accounts || !S.accounts.length) {
    el.innerHTML = `<div class="tbl-empty" style="padding:10px;font-size:.72rem">Sin cuentas. <button class="btn btn-o" style="font-size:.58rem;padding:3px 8px;margin-left:6px" onclick="goPage('accounts')">Agregar →</button></div>`;
    return;
  }
  el.innerHTML = S.accounts.map(acc => {
    const bal = getAccountBalance(acc.id);
    const cur = acc.cur || acc.currency || '$';
    return `
    <div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--bg5);cursor:pointer" onclick="goPage('accounts')">
      <div style="width:30px;height:30px;border-radius:8px;background:${acctTypeGradient(acc.type)};border:1px solid ${acctTypeBorder(acc.type)};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${acctTypeIcon(acc.type)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.74rem;font-weight:500;color:var(--cr);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${acc.name}</div>
        <div style="font-size:.6rem;color:var(--m3);font-family:var(--fm)">${acctTypeLabel(acc.type)}${acc.bank?' · '+acc.bank:''}</div>
      </div>
      <div style="font-family:var(--fm);font-size:.8rem;color:${bal<0?'#d47a7a':'var(--g2)'}">
        ${fmt(bal, cur)}
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
// ACCOUNT MODAL
// ══════════════════════════════════════════
// Emoji picker for accounts uses the global openEmojiPicker() from config.js

function openAccountModal(id) {
  editAccountId = id || null;
  g('acc-mttl').textContent = id ? 'Editar cuenta' : 'Nueva cuenta';
  const acc = id ? (S.accounts || []).find(a => a.id === id) : null;
  g('acc-name').value   = acc ? acc.name : '';
  g('acc-type').value   = acc ? (acc.type || 'bank') : 'bank';
  g('acc-bank').value   = acc ? (acc.bank || '') : '';
  g('acc-cur').value    = acc ? (acc.cur || acc.currency || '₲') : '₲';
  g('acc-init').value   = acc ? (acc.initialBalance || 0) : 0;
  g('acc-notes').value  = acc ? (acc.notes || '') : '';
  // Set emoji button
  const emojiBtn = g('acc-emoji-btn');
  if (emojiBtn) emojiBtn.textContent = acc?.icon || '🏦';
  const picker = g('acc-emoji-picker');
  if (picker) picker.style.display = 'none';
  // Balance adjustment section (edit only)
  const balAdj = g('acc-bal-adj');
  if (balAdj) {
    if (id && acc) {
      const curBal = getAccountBalance(id);
      const cur = acc.cur || acc.currency || '₲';
      balAdj.style.display = '';
      g('acc-cur-bal-disp').textContent = fmt(curBal, cur);
      g('acc-new-balance').value = '';
    } else {
      balAdj.style.display = 'none';
    }
  }
  g('acc-modal-acts').innerHTML = id
    ? `<button class="mb mb-d" onclick="delAccount('${id}');cm('account-modal')">Eliminar</button><button class="mb mb-gh" onclick="cm('account-modal')">Cancelar</button><button class="mb mb-g" onclick="saveAccount()">Guardar</button>`
    : `<button class="mb mb-gh" onclick="cm('account-modal')">Cancelar</button><button class="mb mb-g" onclick="saveAccount()">Guardar</button>`;
  g('account-modal').style.display = 'flex';
}

async function saveAccount() {
  const name  = g('acc-name').value.trim();
  const type  = g('acc-type').value;
  const bank  = g('acc-bank').value.trim();
  const cur   = g('acc-cur').value;
  const init  = parseFloat(g('acc-init').value) || 0;
  const notes = g('acc-notes').value.trim();
  const icon  = g('acc-emoji-btn')?.textContent?.trim() || '🏦';
  if (!name) { toast('Ingresá un nombre para la cuenta'); return; }
  const isEdit = !!editAccountId;
  const acct = { id: isEdit ? editAccountId : uid(), name, type, bank, cur, initialBalance: init, notes, icon };

  if (isEdit) {
    const i = (S.accounts || []).findIndex(a => a.id === editAccountId);
    if (i >= 0) S.accounts[i] = { ...S.accounts[i], ...acct };
    // Handle direct balance adjustment tx
    const newBalEl = g('acc-new-balance');
    if (newBalEl && newBalEl.value !== '') {
      const targetBal = parseFloat(newBalEl.value);
      const currentBal = getAccountBalance(editAccountId);
      const diff = targetBal - currentBal;
      if (Math.abs(diff) > 0.001) {
        const adjTx = {
          id: uid(),
          type: diff > 0 ? 'income' : 'expense',
          desc: '⚖ Ajuste de saldo — ' + name,
          amount: Math.abs(diff),
          cur, cat: diff > 0 ? 'Otros Ingresos' : 'Otros Gastos',
          date: today(), account_id: editAccountId, isBalanceAdj: true
        };
        if (SB_ON) {
          const saved = await sbUpsert('txs', adjTx);
          if (saved) S.txs.unshift(saved);
        } else {
          S.txs.unshift(adjTx);
        }
      }
    }
    toast('◆ Cuenta actualizada');
  } else {
    if (!S.accounts) S.accounts = [];
    S.accounts.push(acct);
    toast('◆ Cuenta registrada');
  }

  if (SB_ON) { await sbUpsert('accounts', acct); } else { lsave(); }
  renderAll(); cm('account-modal');
  populateTxAccountSelect();
}

async function delAccount(id) {
  if (!confirm('¿Eliminar esta cuenta? Los movimientos vinculados quedarán sin cuenta.')) return;
  if (SB_ON) { const ok = await sbDelete('accounts', id); if (!ok) return; }
  S.accounts = (S.accounts || []).filter(a => a.id !== id);
  S.txs.forEach(tx => { if (tx.account_id === id) delete tx.account_id; });
  if (!SB_ON) lsave();
  renderAll(); toast('Cuenta eliminada');
  populateTxAccountSelect();
}

// ══════════════════════════════════════════
// TRANSFER MODAL
// ══════════════════════════════════════════
function openTransferModal() {
  const accs = S.accounts || [];
  const cards = S.cards || [];
  if (accs.length + cards.length < 2) {
    toast('Necesitás al menos 2 cuentas/tarjetas para transferir');
    return;
  }
  let opts = '';
  if(accs.length) {
    opts += '<optgroup label="Cuentas">';
    opts += accs.map(a => `<option value="${a.id}">${acctTypeIcon(a.type)} ${a.name}</option>`).join('');
    opts += '</optgroup>';
  }
  if(cards.length) {
    opts += '<optgroup label="Tarjetas">';
    opts += cards.map(c => `<option value="${c.id}">💳 ${c.name}</option>`).join('');
    opts += '</optgroup>';
  }
  g('tr-from').innerHTML = opts;
  g('tr-to').innerHTML   = opts;
  // default: select different accounts
  if (accs.length + cards.length >= 2) g('tr-to').selectedIndex = 1;
  g('tr-amt').value  = '';
  g('tr-cur').value  = '$';
  g('tr-date').value = today();
  g('tr-note').value = '';
  g('transfer-modal').style.display = 'flex';
}

async function saveTransfer() {
  const fromId = g('tr-from').value;
  const toId   = g('tr-to').value;
  const amt    = parseFloat(g('tr-amt').value);
  const cur    = g('tr-cur').value;
  const date   = g('tr-date').value;
  const note   = g('tr-note').value.trim() || 'Transferencia';
  if (fromId === toId)  { toast('Las cuentas de origen y destino deben ser diferentes'); return; }
  if (!amt || amt <= 0) { toast('Ingresá un monto válido'); return; }
  if (!date)            { toast('Seleccioná una fecha'); return; }
  const fromAcc = (S.accounts || []).find(a => a.id === fromId) || (S.cards||[]).find(c=>c.id===fromId);
  const toAcc   = (S.accounts || []).find(a => a.id === toId) || (S.cards||[]).find(c=>c.id===toId);
  // Create two mirrored transactions
  const baseId = uid();
  const txOut = { id: 'tout-' + baseId, type: 'transfer-out', desc: `⇄ Transferencia a ${toAcc ? toAcc.name : 'cuenta'}: ${note}`, amount: amt, cur, cat: 'Transferencia', date, account_id: fromId, transferPairId: baseId };
  const txIn  = { id: 'tin-'  + baseId, type: 'transfer-in',  desc: `⇄ Transferencia de ${fromAcc ? fromAcc.name : 'cuenta'}: ${note}`, amount: amt, cur, cat: 'Transferencia', date, account_id: toId,   transferPairId: baseId };
  if (SB_ON) {
    const [s1, s2] = await Promise.all([sbUpsert('txs', txOut), sbUpsert('txs', txIn)]);
    if (!s1 || !s2) return;
    S.txs.unshift(s2); S.txs.unshift(s1);
  } else {
    S.txs.push(txOut); S.txs.push(txIn); lsave();
  }
  renderAll(); cm('transfer-modal');
  toast(`◆ Transferencia de ${fmt(amt, cur)} registrada`);
}

// ══════════════════════════════════════════
// INVESTMENT — ACREDITAR INTERÉS
// ══════════════════════════════════════════
let _investmentAccId = null;

function openInterestModal(accId) {
  const acc = (S.accounts || []).find(a => a.id === accId);
  if (!acc) return;
  _investmentAccId = accId;
  const cur = acc.cur || acc.currency || '$';
  const bal = getAccountBalance(accId);
  const capital = getInvestmentCapital(acc);  // Capital Base (no Capital Inicial)
  const interests = getInvestmentInterests(accId);
  const roi = getInvestmentROI(acc);
  const roiEl = g('inv-roi-disp');

  g('inv-acc-name').textContent = acc.name + (acc.bank ? ' · ' + acc.bank : '');
  g('inv-capital-disp').textContent = fmtInv(capital, cur);
  g('inv-balance-disp').textContent = fmtInv(bal, cur);
  if (roiEl) {
    roiEl.textContent = (roi > 0 ? '+' : '') + roi.toFixed(2) + '%';
    roiEl.style.color = roi > 0 ? '#4ade80' : roi < 0 ? '#f87171' : 'var(--mu)';
  }
  g('inv-interest-amt').value = '';
  g('inv-interest-cur').value = cur;
  g('inv-interest-date').value = today();
  g('inv-interest-desc').value = '';
  g('interest-modal').style.display = 'flex';
}

async function saveInvestmentInterest() {
  const acc = (S.accounts || []).find(a => a.id === _investmentAccId);
  if (!acc) return;

  const amt  = parseFloat(g('inv-interest-amt').value);
  const cur  = g('inv-interest-cur').value;
  const date = g('inv-interest-date').value;
  const desc = g('inv-interest-desc').value.trim() || 'Rendimiento / Interés acreditado';

  if (!amt || amt <= 0) { toast('Ingresá un monto válido'); return; }
  if (!date)            { toast('Seleccioná una fecha'); return; }

  // 1. Create income tx linked to this account
  const tx = {
    id: uid(),
    type: 'income',
    desc: `📈 ${desc} — ${acc.name}`,
    amount: amt,
    cur,
    cat: 'Interés',
    date,
    account_id: _investmentAccId
  };

  // 2. Update account balance
  const newBal = getAccountBalance(_investmentAccId) + amt;
  const accIdx = (S.accounts || []).findIndex(a => a.id === _investmentAccId);
  if (accIdx >= 0) S.accounts[accIdx].balance = newBal;

  if (SB_ON) {
    const saved = await sbUpsert('txs', { ...tx, user_id: S.user?.id });
    if (saved) S.txs.unshift(saved); else S.txs.unshift(tx);
    await sbUpsert('accounts', { ...S.accounts[accIdx] });
  } else {
    S.txs.unshift(tx);
    lsave();
  }

  renderAll();
  cm('interest-modal');
  const updatedAcc = S.accounts[accIdx];
  const roi = getInvestmentROI(updatedAcc);
  const totalInt = getInvestmentInterests(updatedAcc.id);
  toast(`✅ ${fmtInv(amt, cur)} acreditado en ${updatedAcc.name} — Rendimiento: ${roi > 0 ? '+' : ''}${roi.toFixed(2)}% · Intereses totales: ${fmtInv(totalInt, cur)}`);
}

// ══════════════════════════════════════════
// TX ACCOUNT SELECT POPULATOR
// ══════════════════════════════════════════
function populateTxAccountSelect() {
  const el = g('tx-account');
  if (!el) return;
  const accs = S.accounts || [];
  const cards = S.cards || [];
  
  let html = '<option value="">Sin cuenta</option>';
  
  if(accs.length) {
    html += '<optgroup label="Cuentas">';
    html += accs.map(a => `<option value="${escHtml(a.id)}">${acctTypeIcon(a.type)} ${escHtml(a.name)}</option>`).join('');
    html += '</optgroup>';
  }

  if(cards.length) {
    html += '<optgroup label="Tarjetas">';
    html += cards.map(c => `<option value="${escHtml(c.id)}">💳 ${escHtml(c.name)}</option>`).join('');
    html += '</optgroup>';
  }
  
  el.innerHTML = html;
}

// ══════════════════════════════════════════
// CONCILIACIÓN BANCARIA — PDF LOADER
// ══════════════════════════════════════════
function reconHandleDrop(event) {
  event.preventDefault();
  const dz = document.getElementById('recon-drop-zone');
  if (dz) dz.style.borderColor = 'var(--gb)';
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  if (file.type !== 'application/pdf') { toast('Solo se aceptan archivos PDF'); return; }
  reconLoadPdf(file);
}

async function reconLoadPdf(file) {
  if (!file) return;

  const statusEl = document.getElementById('recon-status');
  const dropEl   = document.getElementById('recon-drop-zone');

  // Show loading state
  if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = '⏳ Procesando documento…'; }
  if (dropEl)   { dropEl.style.opacity = '0.5'; dropEl.style.pointerEvents = 'none'; }

  try {
    if (!window.pdfjsLib) {
      // Fallback: try dynamic import
      const lib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs');
      lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs';
      window.pdfjsLib = lib;
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Join items preserving line breaks (items on same y → same line)
      let lastY = null;
      content.items.forEach(item => {
        const y = item.transform?.[5];
        if (lastY !== null && Math.abs(y - lastY) > 3) fullText += '\n';
        fullText += item.str + ' ';
        lastY = y;
      });
      fullText += '\n';
    }

    // Inject into recon-input (fallback textarea) and trigger parse
    const textarea = document.getElementById('recon-input');
    if (textarea) textarea.value = fullText.trim();

    if (statusEl) statusEl.textContent = `✓ PDF leído (${pdf.numPages} pág.) — analizando movimientos…`;

    // Run the existing regex parser on extracted text
    _reconParseText(fullText);

  } catch (err) {
    console.error('reconLoadPdf error:', err);
    if (statusEl) statusEl.textContent = '⚠ No se pudo leer el PDF. Pegá el texto manualmente.';
    toast('Error al leer PDF: ' + (err.message || err));
  } finally {
    if (dropEl) { dropEl.style.opacity = '1'; dropEl.style.pointerEvents = ''; }
  }
}

// ── RECONCILIATION HELPERS ──────────────────────────────────────────────────

// Extract date from a bank statement line (dd/mm/yyyy or yyyy-mm-dd or dd/mm)
function _reconExtractDate(line) {
  // yyyy-mm-dd
  let m = line.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/yyyy or dd-mm-yyyy
  m = line.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // dd/mm (assume current year)
  m = line.match(/(\d{2})[\/\-](\d{2})(?!\d)/);
  if (m) return `${new Date().getFullYear()}-${m[2]}-${m[1]}`;
  return null;
}

// Find a matching tx by amount + type, optionally also by date
function _reconFindMatch(amount, type, date) {
  const txs = S.txs || [];
  // Priority: date + amount + type (exact or within 1 day)
  if (date) {
    const d = new Date(date).getTime();
    const byDate = txs.find(t =>
      Math.abs(t.amount - amount) < 1 &&
      t.type === type &&
      Math.abs(new Date(t.date).getTime() - d) <= 86400000 // ±1 day
    );
    if (byDate) return byDate;
  }
  // Fallback: amount + type only
  return txs.find(t => Math.abs(t.amount - amount) < 1 && t.type === type) || null;
}

// Internal: shared parse logic (used by both PDF path and manual textarea)
function _reconParseText(raw) {
  const statusEl  = document.getElementById('recon-status');
  const resultsEl = document.getElementById('recon-results');
  if (!resultsEl) return;

  if (!raw || !raw.trim()) {
    if (statusEl) statusEl.style.display = 'none';
    resultsEl.innerHTML = '<div style="color:var(--mu);font-size:.8rem;text-align:center;padding:20px">No se detectaron movimientos. Verificá el formato del extracto.</div>';
    return;
  }

  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const suggestions = [];

  lines.forEach(line => {
    const amtMatch = line.match(/([+-]?\s*[\d.,]+(?:\.?\d{3})*(?:,\d{2})?)/g);
    if (!amtMatch) return;

    let amtStr = amtMatch.map(m => m.replace(/\s/g, '')).sort((a, b) => b.length - a.length)[0];
    const isNeg = amtStr.startsWith('-');
    amtStr = amtStr.replace(/[^0-9.,]/g, '');

    if (amtStr.includes('.') && amtStr.includes(',')) {
      amtStr = amtStr.replace(/\./g, '').replace(',', '.');
    } else if (amtStr.includes('.') && amtStr.split('.').pop().length !== 2) {
      amtStr = amtStr.replace(/\./g, '');
    }
    const amount = parseFloat(amtStr);
    if (!amount || amount < 100) return;

    const desc = line.replace(/[0-9\/\-.,+]/g, ' ').replace(/\s{2,}/g, ' ').trim().substring(0, 60);
    const type = isNeg ? 'expense' : 'income';
    const date = _reconExtractDate(line);

    // Duplicate detection: date+amount (exact) OR amount-only (fallback)
    const matchedTx = _reconFindMatch(amount, type, date);
    const isDuplicate = !!matchedTx;

    suggestions.push({
      line, amount, desc: desc || 'Movimiento bancario', type, date,
      isDuplicate,
      matchedDesc: matchedTx ? (matchedTx.desc || matchedTx.cat || '—') : null
    });
  });

  if (statusEl) {
    const newCount = suggestions.filter(s => !s.isDuplicate).length;
    if (suggestions.length > 0) {
      statusEl.style.display = 'block';
      statusEl.textContent = `✓ ${suggestions.length} movimientos detectados — ${newCount} nuevos, ${suggestions.length - newCount} duplicados`;
    } else {
      statusEl.style.display = 'block';
      statusEl.textContent = '⚠ No se detectaron movimientos. Verificá el formato del PDF.';
    }
  }

  if (suggestions.length === 0) {
    resultsEl.innerHTML = '<div style="color:var(--mu);font-size:.8rem;text-align:center;padding:20px">No se detectaron movimientos. Intentá pegar el texto manualmente.</div>';
    window._reconSuggestions = [];
    return;
  }

  const newCount = suggestions.filter(s => !s.isDuplicate).length;

  // "Import all new" header button
  const importAllBtn = newCount > 0
    ? `<div style="text-align:right;margin-bottom:8px">
        <button class="btn btn-g" style="font-size:.72rem;padding:5px 14px" onclick="importAllReconTx()">
          ＋ Importar todos los nuevos (${newCount})
        </button>
       </div>`
    : '';

  resultsEl.innerHTML = importAllBtn + suggestions.map((s, i) => {
    const bgColor  = s.isDuplicate ? 'rgba(201,150,12,0.08)' : '';
    const border   = s.isDuplicate ? '1px solid rgba(201,150,12,0.3)' : '1px solid transparent';
    const typePill = `<span style="font-size:.7rem;padding:2px 8px;border-radius:20px;font-weight:600;background:${s.type==='income'?'rgba(78,222,163,0.15)':'rgba(255,180,171,0.15)'};color:${s.type==='income'?'var(--pos)':'var(--neg)'}">${s.type==='income'?'INGRESO':'EGRESO'}</span>`;

    return `
    <div class="recon-row" style="background:${bgColor};border:${border};border-radius:var(--rs);padding:8px 10px">
      <div style="display:flex;gap:8px;align-items:flex-start">
        ${typePill}
        <div style="flex:1">
          <div style="font-size:.8rem;color:var(--cr);font-weight:500">${s.desc}</div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:2px">
            <div style="font-family:var(--fm);font-weight:600;color:${s.type==='income'?'var(--pos)':'var(--neg)'}">₲ ${s.amount.toLocaleString()}</div>
            ${s.date ? `<span style="font-size:.65rem;color:var(--mu)">${s.date}</span>` : ''}
          </div>
          ${s.isDuplicate ? `<div style="font-size:.68rem;color:#c9960c;margin-top:3px">⚠ Posible duplicado — coincide con: <em>${s.matchedDesc}</em></div>` : ''}
        </div>
        ${s.isDuplicate
          ? `<button class="btn" style="font-size:.65rem;padding:3px 10px;opacity:.5;cursor:default" disabled>Ya registrado</button>`
          : `<button class="btn btn-o" style="font-size:.7rem;padding:4px 10px;white-space:nowrap" onclick="importReconTx(${i})">＋ Importar</button>`
        }
      </div>
    </div>`;
  }).join('');

  window._reconSuggestions = suggestions;
}

// ══════════════════════════════════════════
// CONCILIACIÓN BANCARIA (Importador Rápido)
// ══════════════════════════════════════════
function openReconcileModal() {
  const el = g('recon-modal');
  if (!el) return;
  g('recon-input').value = '';
  g('recon-results').innerHTML = '<div style="color:var(--mu);font-size:.8rem;text-align:center;padding:20px">Pegá el texto del extracto bancario arriba y presioná Analizar.</div>';
  el.style.display = 'flex';
}

function parseReconciliation() {
  const raw = (g('recon-input')?.value || '').trim();
  if (!raw) { toast('Pegá el texto del extracto primero'); return; }
  _reconParseText(raw);
  const count = (window._reconSuggestions || []).length;
  const newCount = (window._reconSuggestions || []).filter(s => !s.exists).length;
  if (count) toast(`◆ ${count} movimientos detectados — ${newCount} nuevos`);
}

function importReconTx(idx) {
  const s = (window._reconSuggestions || [])[idx];
  if (!s || s.isDuplicate) return;
  const tx = {
    id: uid(),
    type: s.type,
    desc: s.desc,
    amount: s.amount,
    cur: '₲',
    cat: s.type === 'income' ? 'Ingresos' : 'Gastos',
    date: s.date || today()
  };
  S.txs.unshift(tx);
  if (SB_ON) sbUpsert('txs', { ...tx, user_id: S.user?.id });
  else lsave();
  renderAll();
  // Mark as imported in UI
  const rows = document.querySelectorAll('#recon-results .recon-row');
  if (rows[idx + (document.querySelector('#recon-results [onclick="importAllReconTx()"]') ? 1 : 0)]) {
    const btn = rows[idx]?.querySelector('button');
    if (btn) { btn.textContent = '✓ Importado'; btn.disabled = true; btn.style.opacity = '0.5'; }
  }
  // Mark suggestion as duplicate so "import all" skips it
  s.isDuplicate = true;
  toast('◆ Movimiento importado');
}

async function importAllReconTx() {
  const pending = (window._reconSuggestions || []).filter(s => !s.isDuplicate);
  if (!pending.length) { toast('No hay movimientos nuevos para importar'); return; }

  const txBatch = pending.map(s => ({
    id: uid(),
    type: s.type,
    desc: s.desc,
    amount: s.amount,
    cur: '₲',
    cat: s.type === 'income' ? 'Ingresos' : 'Gastos',
    date: s.date || today()
  }));

  txBatch.forEach(tx => S.txs.unshift(tx));

  if (SB_ON) {
    await Promise.allSettled(txBatch.map(tx => sbUpsert('txs', { ...tx, user_id: S.user?.id })));
  } else {
    lsave();
  }

  // Mark all as imported in window state
  (window._reconSuggestions || []).forEach(s => { s.isDuplicate = true; });

  renderAll();
  // Rebuild results to show everything as imported
  _reconParseText(document.getElementById('recon-input')?.value || '');
  toast(`◆ ${txBatch.length} movimientos importados`);
}

// ══════════════════════════════════════════
// CASH FLOW PROYECTADO (30 días)
// ══════════════════════════════════════════
let _cashFlowChart = null;

function renderCashFlow() {
  const el = g('cashflow-chart');
  if (!el) return;
  if (typeof Chart === 'undefined') {
    console.warn('[Chart.js] librería no disponible — renderCashFlow abortado');
    return;
  }

  const txs = S.txs || [];
  const now = new Date();
  const msDay = 1000 * 60 * 60 * 24;

  // Calcular promedio diario de ingresos y gastos (últimos 60 días)
  const recent = txs.filter(t => {
    const d = new Date(t.date);
    return (now - d) / msDay <= 60;
  });

  const avgDailyInc = recent.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0) / 60;
  const avgDailyExp = recent.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0) / 60;

  // Saldo inicial (suma de cuentas)
  const initBalance = (S.accounts || []).reduce((s, a) => s + (a.balance || 0), 0);

  // Proyectar 30 días
  const labels = [];
  const projData = [];
  let balance = initBalance;

  for (let d = 0; d <= 30; d++) {
    const date = new Date(now.getTime() + d * msDay);
    labels.push(d === 0 ? 'Hoy' : date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }));
    balance += (avgDailyInc - avgDailyExp);
    projData.push(Math.round(balance));
  }

  if (_cashFlowChart) _cashFlowChart.destroy();

  _cashFlowChart = new Chart(el, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Saldo Proyectado',
        data: projData,
        borderColor: '#4edea3',
        backgroundColor: 'rgba(78,222,163,0.08)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => '₲ ' + ctx.parsed.y.toLocaleString()
          }
        }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: 'var(--mu)', font: { size: 10 }, callback: v => '₲' + (v/1e6).toFixed(1)+'M' }
        },
        x: {
          grid: { display: false },
          ticks: { color: 'var(--mu)', font: { size: 9 }, maxTicksLimit: 8 }
        }
      }
    }
  });
}

// trigger vercel webhook deploy 01:40 AM
