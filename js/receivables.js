// CD & Co ERP — RECEIVABLES (A Cobrar)
// ====================================

let editRecvId = null;
let recvCompletedOpen = false;

// ══════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════
function calcNextInst(total, paid, inst, paidInst) {
  const rem = total - (paid || 0);
  const rI = inst - (paidInst || 0);
  if (rI <= 0) return 0;
  return Math.max(0, rem / rI);
}

function renderReceivables() {
  const all = S.receivables || [];
  const active = all.filter(r => !r.completed);
  const completed = all.filter(r => r.completed);

  // Stats: separar por moneda dominante
  let pendingUSD = 0, pendingPYG = 0, paidUSD = 0, paidPYG = 0;
  all.forEach(r => {
    const total = parseFloat(r.total || 0);
    const paid = parseFloat(r.paid || 0);
    const pending = Math.max(0, total - paid);
    if (r.cur === '₲') { pendingPYG += pending; paidPYG += paid; }
    else { pendingUSD += pending; paidUSD += paid; }
  });

  const el = id => document.getElementById(id);
  if (el('recv-stat-pending')) {
    const lines = [];
    if (pendingUSD > 0) lines.push(fmt(pendingUSD, '$'));
    if (pendingPYG > 0) lines.push(fmt(pendingPYG, '₲'));
    el('recv-stat-pending').textContent = lines.join(' · ') || '$0.00';
  }
  if (el('recv-stat-paid')) {
    const lines = [];
    if (paidUSD > 0) lines.push(fmt(paidUSD, '$'));
    if (paidPYG > 0) lines.push(fmt(paidPYG, '₲'));
    el('recv-stat-paid').textContent = lines.join(' · ') || '$0.00';
  }
  if (el('recv-stat-active')) el('recv-stat-active').textContent = active.length;

  // Active cards
  const grid = el('recv-grid');
  if (grid) {
    if (!active.length) {
      grid.innerHTML = '<div class="tbl-empty" style="padding:30px;text-align:center">Sin cuentas activas. Agregá la primera con el botón de arriba.</div>';
    } else {
      grid.innerHTML = active.map(r => recvCardHTML(r, false)).join('');
    }
  }

  // Completed
  const compCount = el('recv-comp-count');
  if (compCount) compCount.textContent = completed.length;
  const compEl = el('recv-completed');
  if (compEl) {
    compEl.innerHTML = completed.map(r => recvCardHTML(r, true)).join('');
    compEl.style.display = recvCompletedOpen ? 'flex' : 'none';
  }
  const arrow = el('recv-comp-arrow');
  if (arrow) arrow.textContent = recvCompletedOpen ? '▼' : '▶';
}

function recvCardHTML(r, isCompleted) {
  const total = parseFloat(r.total || 0);
  const paid = parseFloat(r.paid || 0);
  const pending = Math.max(0, total - paid);
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const installments = parseInt(r.installments || 0);
  const paidInst = parseInt(r.paidInst || 0);
  const barColor = pct >= 100 ? 'var(--pos)' : 'var(--g2)';

  return `<div class="panel pp" style="padding:18px;${isCompleted ? 'opacity:.55;' : ''}transition:opacity .2s">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--cr);font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.contact_id || r.contact || r.name || r.customer || '—'}</div>
        ${r.type ? `<span class="pill pill-neu" style="margin-top:4px;display:inline-block">${r.type}</span>` : ''}
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
        ${!isCompleted ? `<button class="btn btn-g" style="padding:5px 12px;font-size:.72rem" onclick="openRecvPayModal('${r.id}')">Registrar Pago</button>` : ''}
        <button class="btn btn-o" style="padding:4px 8px;font-size:.65rem" onclick="openReceivableModal('${r.id}')">✏</button>
        <button class="btn btn-danger" style="padding:4px 8px;font-size:.65rem" onclick="delRecv('${r.id}')">✕</button>
      </div>
    </div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:12px">
      <div>
        <div style="font-size:.6rem;color:var(--mu);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Total</div>
        <div style="font-family:var(--fm);font-size:.95rem;font-weight:600;color:var(--g2)">${fmt(total, r.cur)}</div>
      </div>
      <div>
        <div style="font-size:.6rem;color:var(--mu);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Cobrado</div>
        <div style="font-family:var(--fm);font-size:.95rem;color:var(--pos)">${fmt(paid, r.cur)}</div>
      </div>
      <div>
        <div style="font-size:.6rem;color:var(--mu);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Pendiente</div>
        <div style="font-family:var(--fm);font-size:.95rem;color:${pending > 0 ? '#d47a7a' : 'var(--pos)'}">${fmt(pending, r.cur)}</div>
      </div>
      ${installments > 0 ? `<div>
        <div style="font-size:.6rem;color:var(--mu);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Cuotas</div>
        <div style="font-family:var(--fm);font-size:.95rem;color:var(--cr)">${paidInst}/${installments}</div>
      </div>` : ''}
      ${installments > 0 && !isCompleted ? `<div>
        <div style="font-size:.6rem;color:var(--mu);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Próxima Cuota</div>
        <div style="font-family:var(--fm);font-size:.95rem;color:var(--g2)">${fmt(calcNextInst(total, paid, installments, paidInst), r.cur)}</div>
      </div>` : ''}
    </div>
    <div style="width:100%;background:var(--bg3);height:6px;border-radius:3px;overflow:hidden;margin-bottom:4px">
      <div style="width:${pct.toFixed(1)}%;background:${barColor};height:100%;transition:width .4s ease"></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:.65rem;color:var(--mu)">${pct.toFixed(0)}% cobrado</span>
      ${r.notes ? `<span style="font-size:.65rem;color:var(--mu);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.notes}</span>` : ''}
    </div>
  </div>`;
}

function toggleRecvCompleted(btn) {
  recvCompletedOpen = !recvCompletedOpen;
  renderReceivables();
}

// ══════════════════════════════════════════
// MODAL NUEVA / EDITAR CUENTA
// ══════════════════════════════════════════
function openReceivableModal(id) {
  editRecvId = id || null;
  const r = id ? (S.receivables || []).find(x => x.id === id) : null;
  const el = i => document.getElementById(i);

  el('recv-mttl').textContent = id ? 'Editar cuenta a cobrar' : 'Nueva cuenta a cobrar';
  el('recv-name').value = r ? r.name : '';
  el('recv-type').value = r ? (r.type || '') : '';
  el('recv-total').value = r ? r.total : '';
  el('recv-paid-ini').value = r ? r.paid : '0';
  el('recv-cur').value = r ? r.cur : '$';
  el('recv-inst').value = r ? (r.installments || '') : '';
  el('recv-paid-inst').value = r ? (r.paidInst || '') : '0';
  el('recv-notes').value = r ? (r.notes || '') : '';

  el('recv-modal-acts').innerHTML = id
    ? `<button class="mb mb-d" onclick="delRecv('${id}');cm('ra-modal')">Eliminar</button><button class="mb mb-gh" onclick="cm('ra-modal')">Cancelar</button><button class="mb mb-g" onclick="saveRecv()">Guardar</button>`
    : `<button class="mb mb-gh" onclick="cm('ra-modal')">Cancelar</button><button class="mb mb-g" onclick="saveRecv()">Guardar</button>`;

  el('ra-modal').style.display = 'flex';
}

function saveRecv() {
  const el = i => document.getElementById(i);
  const name = el('recv-name').value.trim();
  const total = parseFloat(el('recv-total').value);
  const paidIni = parseFloat(el('recv-paid-ini').value) || 0;
  const cur = el('recv-cur').value;

  if (!name) { toast('Ingresá un nombre'); return; }
  if (!total || total <= 0) { toast('Ingresá un monto total válido'); return; }

  const installments = parseInt(el('recv-inst').value) || 0;
  const paidInst = parseInt(el('recv-paid-inst').value) || 0;
  const completed = paidIni >= total;

  const data = {
    name,
    type: el('recv-type').value.trim(),
    total,
    paid: paidIni,
    cur,
    installments,
    paidInst,
    notes: el('recv-notes').value.trim(),
    completed
  };

  if (editRecvId) {
    const i = S.receivables.findIndex(r => r.id === editRecvId);
    if (i >= 0) S.receivables[i] = { ...S.receivables[i], ...data };
    toast('◆ Cuenta actualizada');
  } else {
    S.receivables.push({ ...data, id: 'recv_' + uid().slice(1) });
    toast('◆ Cuenta a cobrar creada');
  }

  lsave();
  renderReceivables();
  updateBadges();
  cm('ra-modal');
}

function delRecv(id) {
  if (!confirm('¿Eliminar esta cuenta a cobrar?')) return;
  S.receivables = (S.receivables || []).filter(r => r.id !== id);
  lsave();
  renderReceivables();
  updateBadges();
  toast('Eliminada');
}

// ══════════════════════════════════════════
// MODAL REGISTRAR PAGO
// ══════════════════════════════════════════
function openRecvPayModal(id) {
  const r = (S.receivables || []).find(x => x.id === id);
  if (!r) return;
  const el = i => document.getElementById(i);
  const pending = Math.max(0, parseFloat(r.total || 0) - parseFloat(r.paid || 0));

  const nextI = calcNextInst(parseFloat(r.total || 0), parseFloat(r.paid || 0), parseInt(r.installments || 0), parseInt(r.paidInst || 0));

  el('recvp-id').value = id;
  el('recvp-name').textContent = r.name;
  el('recvp-pending').textContent = fmt(pending, r.cur);
  el('recvp-amt').value = nextI > 0 ? nextI.toFixed(2) : '';
  el('recvp-date').value = today();
  el('recvp-register-tx').checked = true;
  el('recvp-modal').style.display = 'flex';
  // Poblar categoría con ingresos
  if (typeof populateTxCat === 'function') populateTxCat('income', 'recvp-cat');
}

async function saveRecvPay() {
  const el = i => document.getElementById(i);
  const id = el('recvp-id').value;
  const amt = parseFloat(el('recvp-amt').value);
  const date = el('recvp-date').value;
  const registerTx = el('recvp-register-tx').checked;

  if (!amt || amt <= 0) { toast('Ingresá un monto válido'); return; }
  if (!date) { toast('Seleccioná una fecha'); return; }

  const idx = S.receivables.findIndex(r => r.id === id);
  if (idx < 0) return;

  const currentTotal = parseFloat(r.total || 0);
  const currentPaid = parseFloat(r.paid || 0);
  const currentInst = parseInt(r.installments || 0);
  const currentPaidInst = parseInt(r.paidInst || 0);
  const nextI = calcNextInst(currentTotal, currentPaid, currentInst, currentPaidInst);

  const newPaid = currentPaid + amt;
  const completed = newPaid >= currentTotal;

  S.receivables[idx] = { ...r, paid: newPaid, completed };

  // Increment installments only if amount covers the target installment
  if (currentInst > 0 && amt >= (nextI - 0.01)) {
    S.receivables[idx].paidInst = Math.min(currentInst, (currentPaidInst + 1));
  }

  // Registrar ingreso automáticamente
  if (registerTx) {
    const cat = el('recvp-cat')?.value || 'Otros Ingresos';
    const recvTx = { id: uid(), type: 'income', desc: 'Cobro: ' + r.name, amount: amt, cur: r.cur, cat, date };
    if (SB_ON) { const saved = await sbSaveTransaction(recvTx); S.txs.push(saved || recvTx); }
    else S.txs.push(recvTx);
    if (typeof recomputeBalances === 'function') recomputeBalances();
    if (typeof checkBudgetAlerts === 'function') checkBudgetAlerts();
  }

  lsave();
  renderAll();
  cm('recvp-modal');
  toast(completed ? '◆ Cuenta cobrada completamente' : `◆ Pago de ${fmt(amt, r.cur)} registrado`);
}
