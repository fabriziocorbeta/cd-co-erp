// CD & Co ERP — BUDGETS (Presupuestos Mensuales)
// ====================================

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function populateBgtMonthSel() {
  const el = g('bgt-month-sel');
  if (!el) return;
  const now = new Date();
  const months = [];
  for (let i = -5; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = d.toISOString().slice(0, 7);
    months.push({ val, label: monthLabel(val) });
  }
  const cur = el.value || currentMonth();
  el.innerHTML = months.map(m => `<option value="${m.val}"${m.val===cur?' selected':''}>${m.label}</option>`).join('');
  if (!el.value) el.value = currentMonth();
}

function monthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return names[parseInt(mo,10)-1] + ' ' + y;
}

function getSpentByCategory(category, month, currency) {
  return (S.txs || [])
    .filter(tx => tx.type === 'expense' && tx.cat === category && (tx.date||'').slice(0,7) === month && (tx.cur||'$') === currency)
    .reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
}

function getBudgetStatus(b) {
  const spent = getSpentByCategory(b.category, b.month, b.currency || '$');
  const limit = parseFloat(b.amount) || 1;
  const pct   = Math.min((spent / limit) * 100, 999);
  let color, label, barColor;
  if (pct >= 100)      { color='#d47a7a'; barColor='var(--neg)'; label='✕ Excedido'; }
  else if (pct >= 80)  { color='#d4b47a'; barColor='#c4943a';   label='⚠ Al límite'; }
  else                 { color='var(--pos)'; barColor='var(--pos)'; label='✓ OK'; }
  return { spent, pct, color, barColor, label, limit };
}

function getOverBudgetCount() {
  const m = currentMonth();
  return (S.budgets || []).filter(b => b.month === m && getBudgetStatus(b).pct >= 100).length;
}

function getWarnBudgetCount() {
  const m = currentMonth();
  return (S.budgets || []).filter(b => b.month === m && getBudgetStatus(b).pct >= 80).length;
}

// ══════════════════════════════════════════
// ALERT CHECK (called from saveTx)
// ══════════════════════════════════════════
function checkBudgetAlerts() {
  const m = currentMonth();
  (S.budgets || []).filter(b => b.month === m).forEach(b => {
    const { pct, label } = getBudgetStatus(b);
    const cur = b.currency || '$';
    if (pct >= 100) {
      toast(`✕ Presupuesto ${b.category} excedido (${Math.round(pct)}%)`, 4000, 'danger');
    } else if (pct >= 80) {
      toast(`⚠ Presupuesto ${b.category} al ${Math.round(pct)}% del límite`, 3500, 'warn');
    }
  });
}

// ══════════════════════════════════════════
// RENDER PAGE
// ══════════════════════════════════════════
function renderBudgets() {
  populateBgtMonthSel();
  const wrap = g('budgets-wrap');
  if (!wrap) return;

  // Month selector
  const selEl = g('bgt-month-sel');
  const selMonth = selEl ? selEl.value : currentMonth();

  const budgets = (S.budgets || []).filter(b => b.month === selMonth);

  if (!budgets.length) {
    wrap.innerHTML = `<div class="tbl-empty" style="padding:40px;text-align:center">
      Sin presupuestos para ${monthLabel(selMonth)}.<br>
      <button class="btn btn-g" style="margin-top:14px" onclick="openBudgetModal()">＋ Crear presupuesto</button>
    </div>`;
    return;
  }

  // Sort by pct desc so most at-risk is first
  const withStatus = budgets.map(b => ({ b, st: getBudgetStatus(b) }))
    .sort((a, b) => b.st.pct - a.st.pct);

  wrap.innerHTML = withStatus.map(({ b, st }) => {
    const barW = Math.min(st.pct, 100).toFixed(1);
    const cur  = b.currency || '$';
    return `
    <div class="budget-row">
      <div class="budget-info">
        <div class="budget-cat">${b.category}</div>
        <div class="budget-month-lbl">${monthLabel(b.month)}</div>
      </div>
      <div class="budget-bar-wrap">
        <div class="budget-bar-track">
          <div class="budget-bar-fill" style="width:${barW}%;background:${st.barColor}"></div>
        </div>
        <div class="budget-nums">
          <span style="color:${st.color}">${fmt(st.spent, cur)}</span>
          <span style="color:var(--mu)">de ${fmt(st.limit, cur)}</span>
          <span class="budget-pct" style="color:${st.color}">${Math.round(st.pct)}%</span>
        </div>
      </div>
      <div class="budget-status">
        <span class="pill" style="background:${st.pct>=100?'var(--nb)':st.pct>=80?'rgba(196,148,58,.18)':'var(--pb)'};color:${st.color}">${st.label}</span>
      </div>
      <div class="actions">
        <button class="btn btn-s" style="padding:4px 8px;font-size:.6rem" onclick="openBudgetModal('${b.id}')">✏</button>
        <button class="btn btn-danger" style="padding:4px 8px;font-size:.6rem" onclick="delBudget('${b.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
// DASHBOARD WIDGET
// ══════════════════════════════════════════
function renderBudgetsSummary() {
  const el = g('budgets-summary');
  if (!el) return;
  const m = currentMonth();
  const budgets = (S.budgets || []).filter(b => b.month === m);
  if (!budgets.length) {
    el.innerHTML = `<div class="tbl-empty" style="padding:10px;font-size:.72rem">Sin presupuestos para este mes. <button class="btn btn-o" style="font-size:.58rem;padding:3px 8px;margin-left:6px" onclick="goPage('budgets')">Crear →</button></div>`;
    return;
  }
  const withStatus = budgets.map(b => ({ b, st: getBudgetStatus(b) }))
    .sort((a, b) => b.st.pct - a.st.pct);

  el.innerHTML = withStatus.map(({ b, st }) => {
    const barW = Math.min(st.pct, 100).toFixed(1);
    const cur  = b.cur || b.currency || '$';
    return `
    <div style="padding:6px 0;border-bottom:1px solid var(--bg5);cursor:pointer" onclick="goPage('budgets')">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:.72rem;color:var(--cr)">${b.category}</span>
        <span style="font-family:var(--fm);font-size:.65rem;color:${st.color}">${fmt(st.spent,cur)} / ${fmt(st.limit,cur)}</span>
      </div>
      <div style="height:4px;background:var(--bg5);border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${barW}%;background:${st.barColor};border-radius:99px;transition:width .4s"></div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════
let editBudgetId = null;

function openBudgetModal(id) {
  editBudgetId = id || null;
  g('bgt-mttl').textContent = id ? 'Editar presupuesto' : 'Nuevo presupuesto';
  const b = id ? (S.budgets || []).find(x => x.id === id) : null;
  g('bgt-cat').value    = b ? (b.category || 'Relojes') : 'Relojes';
  g('bgt-amt').value    = b ? (b.amount || '') : '';
  g('bgt-cur').value    = b ? (b.cur || b.currency || '$') : '$';
  g('bgt-month').value  = b ? (b.month || currentMonth()) : currentMonth();
  g('bgt-modal-acts').innerHTML = id
    ? `<button class="mb mb-d" onclick="delBudget('${id}');cm('budget-modal')">Eliminar</button><button class="mb mb-gh" onclick="cm('budget-modal')">Cancelar</button><button class="mb mb-g" onclick="saveBudget()">Guardar</button>`
    : `<button class="mb mb-gh" onclick="cm('budget-modal')">Cancelar</button><button class="mb mb-g" onclick="saveBudget()">Guardar</button>`;
  g('budget-modal').style.display = 'flex';
}

function saveBudget() {
  const category = g('bgt-cat').value;
  const amount   = parseFloat(g('bgt-amt').value);
  const cur = g('bgt-cur').value;
  const month    = g('bgt-month').value;
  if (!category)          { toast('Seleccioná una categoría'); return; }
  if (!amount || amount <= 0) { toast('Ingresá un monto límite válido'); return; }
  if (!month)             { toast('Seleccioná un mes'); return; }

  // Check duplicate category/month (unless editing same)
  const dup = (S.budgets || []).find(b => b.category === category && b.month === month && b.id !== editBudgetId);
  if (dup) { toast('Ya existe un presupuesto para esa categoría en ese mes'); return; }

  const bgt = { category, amount, cur, month };
  if (!S.budgets) S.budgets = [];
  if (editBudgetId) {
    const i = S.budgets.findIndex(b => b.id === editBudgetId);
    if (i >= 0) S.budgets[i] = { ...S.budgets[i], ...bgt };
    toast('◆ Presupuesto actualizado');
  } else {
    S.budgets.push({ ...bgt, id: uid() });
    toast('◆ Presupuesto creado');
  }
  lsave(); renderAll(); cm('budget-modal');
}

function delBudget(id) {
  if (!confirm('¿Eliminar este presupuesto?')) return;
  S.budgets = (S.budgets || []).filter(b => b.id !== id);
  lsave(); renderAll(); toast('Presupuesto eliminado');
}

// Month filter change
function onBgtMonthChange() { renderBudgets(); }
