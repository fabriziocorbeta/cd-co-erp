// CD & Co ERP — SAVINGS GOALS
// ====================================

function renderGoals() {
  const grid = document.getElementById('goals-grid');
  const compGrid = document.getElementById('goals-completed');
  if (!grid || !compGrid) return;

  const goals = S.goals || [];
  grid.innerHTML = '';
  compGrid.innerHTML = '';

  const active = goals.filter(g => !g.completed);
  const completed = goals.filter(g => g.completed);

  if (!active.length) {
    grid.innerHTML = '<div class="tbl-empty" style="grid-column:1/-1">No hay metas activas. ¡Comenzá una nueva!</div>';
  } else {
    active.forEach(goal => {
      const card = createGoalCard(goal);
      grid.appendChild(card);
    });
  }

  if (!completed.length) {
    compGrid.innerHTML = '<div class="tbl-empty" style="grid-column:1/-1;width:100%">No hay metas completadas.</div>';
  } else {
    completed.forEach(goal => {
      const card = createGoalCard(goal);
      compGrid.appendChild(card);
    });
  }

  document.getElementById('goals-comp-count').textContent = completed.length;
}

function createGoalCard(goal) {
  // Normalizar campos: el DB usa target_amount/current_amount/deadline, el JS usa target/current/date
  goal = {
    ...goal,
    name:    goal.name    || goal.nombre           || '—',
    target:  parseFloat(goal.target   || goal.target_amount  || 0),
    current: parseFloat(goal.current  || goal.current_amount || 0),
    date:    goal.date    || goal.deadline          || null,
    cur:     goal.cur     || '₲',
    icon:    goal.icon    || '🎯',
  };

  const card = document.createElement('div');
  card.className = 'pcard';

  // Sync with account if applicable
  let currentValue = goal.current || 0;
  if (goal.accountId === 'patrimonio') {
    const n = typeof patCalcNumbers === 'function' ? patCalcNumbers() : null;
    if (n) currentValue = n.patrimonioNeto;
  } else if (goal.accountId) {
    const acc = (S.accounts || []).find(a => a.id === goal.accountId);
    if (acc) {
      currentValue = typeof getAccountBalance === 'function' ? getAccountBalance(acc.id) : calculateGoalBalance(acc.id);
    }
  }

  const pct = Math.min(100, Math.round((currentValue / goal.target) * 100) || 0);
  const isMet = currentValue >= goal.target;
  const daysLeft = goal.date ? Math.ceil((new Date(goal.date + 'T00:00:00') - new Date()) / (1000 * 60 * 60 * 24)) : null;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div style="font-size:24px">${goal.icon || '🎯'}</div>
      <div class="actions">
        <button class="ib" onclick="openGoalModal('${goal.id}')">✎</button>
        <button class="ib" onclick="deleteGoal('${goal.id}')">✕</button>
      </div>
    </div>
    <div class="pcard-name">${goal.name}</div>
    <div style="font-size:.7rem;color:var(--mu);margin-bottom:14px">
      ${goal.date ? `Meta: ${fmtDate(goal.date)}` : 'Sin fecha límite'}
      ${daysLeft !== null && daysLeft > 0 ? ` • <span style="color:var(--g2)">Faltan ${daysLeft} días</span>` : ''}
    </div>
    
    <div style="margin-bottom:6px;display:flex;justify-content:space-between;align-items:baseline">
      <span style="font-family:var(--fm);font-size:.9rem;color:#fff">${fmt(currentValue, goal.cur)}</span>
      <span style="font-family:var(--fm);font-size:.7rem;color:var(--mu)">de ${fmt(goal.target, goal.cur)}</span>
    </div>
    
    <div class="budget-bar-track" style="margin-bottom:6px;height:8px;background:var(--bg3)">
      <div class="budget-bar-fill" style="width:${pct}%;background:${isMet ? 'var(--pos)' : 'var(--g)'}"></div>
    </div>
    
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:.65rem;font-weight:600;color:${isMet ? 'var(--pos)' : 'var(--g2)'}">${pct}% completado</span>
      ${!goal.completed && isMet ? `<button class="btn btn-g" style="padding:2px 8px;font-size:.6rem" onclick="toggleGoalCompleted('${goal.id}', true)">Completar</button>` : ''}
      ${goal.completed ? `<span class="pill pill-pos">Completada</span>` : ''}
    </div>
  `;
  
  return card;
}

function calculateGoalBalance(accId) {
  const acc = (S.accounts || []).find(a => a.id === accId);
  if (!acc) return 0;
  let bal = parseFloat(acc.initialBalance || 0);
  // Signed amounts: income = positive, expense = negative → just sum all
  (S.txs || []).forEach(t => {
    const tAccId = t.account_id || t.accountId;
    if (tAccId === accId) bal += parseFloat(t.amount) || 0;
  });
  return bal;
}

function openGoalModal(id) {
  const m = document.getElementById('goal-modal');
  if (!m) return;

  const goal = id ? (S.goals || []).find(g => g.id === id) : null;
  editIds.goal = id || null;

  document.getElementById('goal-mttl').textContent = goal ? 'Editar meta' : 'Nueva meta';
  document.getElementById('goal-name').value = goal ? goal.name : '';
  document.getElementById('goal-icon').value = goal ? goal.icon : '🎯';
  document.getElementById('goal-target').value = goal ? goal.target : '';
  document.getElementById('goal-cur').value = goal ? goal.cur : (FX.dir.includes('pyg') ? '$' : '$');
  document.getElementById('goal-current').value = goal ? (goal.current || 0) : 0;
  document.getElementById('goal-date').value = goal ? goal.date : '';
  
  // Populate Accounts Select
  const accSel = document.getElementById('goal-account');
  accSel.innerHTML = `
    <option value="">Ingreso manual</option>
    <option value="patrimonio">🌟 Patrimonio Neto Total</option>
  ` + (S.accounts || []).map(a => `<option value="${a.id}">${a.name} (${a.cur})</option>`).join('');
  accSel.value = goal ? (goal.accountId || '') : '';

  // Modal Actions
  const acts = document.getElementById('goal-modal-acts');
  acts.innerHTML = `
    <button class="mb mb-gh" onclick="cm('goal-modal')">Cancelar</button>
    ${goal ? `<button class="mb mb-d" onclick="deleteGoal('${goal.id}')">Eliminar</button>` : ''}
    <button class="mb mb-g" onclick="saveGoal()">Guardar</button>
  `;

  m.style.display = 'flex';
}

function saveGoal() {
  const name = document.getElementById('goal-name').value.trim();
  const target = parseFloat(document.getElementById('goal-target').value) || 0;
  if (!name || target <= 0) { toast('Completá nombre y monto objetivo'); return; }

  const isEdit = !!editIds.goal;
  const existingGoal = isEdit ? (S.goals || []).find(g => g.id === editIds.goal) : null;

  const goalData = {
    id: editIds.goal || uid(),
    name: name,
    icon: document.getElementById('goal-icon').value.trim() || '🎯',
    target: target,
    cur: document.getElementById('goal-cur').value,
    current: parseFloat(document.getElementById('goal-current').value) || 0,
    date: document.getElementById('goal-date').value || null,
    accountId: (document.getElementById('goal-account')?.value) || null,
    completed: existingGoal ? existingGoal.completed : false
  };

  if (!S.goals) S.goals = [];
  if (isEdit) {
    const idx = S.goals.findIndex(g => g.id === editIds.goal);
    if (idx !== -1) S.goals[idx] = goalData;
    else S.goals.push(goalData);
  } else {
    S.goals.push(goalData);
  }

  lsave();
  cm('goal-modal');
  renderGoals();
  toast('◆ Guardando meta...');

  // Persist to Supabase (DB uses snake_case columns)
  if (SB_ON && S.user) {
    const row = {
      id: goalData.id,
      user_id: S.user.id,
      name: goalData.name,
      icon: goalData.icon,
      target_amount: goalData.target,
      current_amount: goalData.current,
      cur: goalData.cur,
      deadline: goalData.date || null,
      accountId: goalData.accountId || null,
      completed: goalData.completed
    };
    sb.from('goals').upsert(row).then(({ error }) => {
      if (error) {
        console.error('[Goals] upsert error:', error);
        toast('⚠ Error al guardar en la nube');
      } else {
        // Invalidate SWR cache so next reload fetches fresh data
        try { localStorage.removeItem('cdco_swr_v2'); } catch(e) {}
        toast('✓ Meta guardada en la nube');
      }
    });
  }
}

function deleteGoal(id) {
  if (!confirm('¿Eliminar esta meta?')) return;
  S.goals = (S.goals || []).filter(g => g.id !== id);
  lsave();
  if (document.getElementById('goal-modal').style.display === 'flex') cm('goal-modal');
  renderGoals();
  toast('Meta eliminada');

  // Delete from Supabase
  if (SB_ON && S.user) {
    sb.from('goals').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('[Goals] delete error:', error);
      else try { localStorage.removeItem('cdco_swr_v2'); } catch(e) {}
    });
  }
}

function toggleGoalCompleted(id, status) {
  const goal = (S.goals || []).find(g => g.id === id);
  if (goal) {
    goal.completed = status;
    lsave();
    renderGoals();
    if (status) toast('🎉 ¡Felicitaciones! Meta alcanzada');

    // Persist completion status to Supabase
    if (SB_ON && S.user) {
      sb.from('goals').update({ completed: status }).eq('id', id).then(({ error }) => {
        if (error) console.error('[Goals] toggle error:', error);
        else try { localStorage.removeItem('cdco_swr_v2'); } catch(e) {}
      });
    }
  }
}

function toggleGoalsCompleted(btn) {
  const box = document.getElementById('goals-completed');
  const arrow = document.getElementById('goals-comp-arrow');
  if (box.style.display === 'none') {
    box.style.display = 'grid';
    arrow.textContent = '▼';
  } else {
    box.style.display = 'none';
    arrow.textContent = '▶';
  }
}

function renderGoalsSummary() {
  const el = document.getElementById('goals-summary');
  if(!el) return;
  const active = (S.goals || []).filter(g=>!g.completed);
  if(!active.length) {
    el.innerHTML = `<div style="font-size:.7rem;color:var(--mu)">Sin metas activas</div>`;
    return;
  }
  el.innerHTML = active.slice(0,2).map(g=>{
    const pct = Math.min(100, Math.round(((g.current||0)/g.target)*100));
    return `
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:4px">
          <span style="color:var(--cr)">${g.icon||'🎯'} ${g.name}</span>
          <span style="color:var(--mu);font-family:var(--fm);font-size:.65rem">${pct}%</span>
        </div>
        <div style="height:6px;background:var(--bg3);border-radius:10px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--g2);border-radius:10px;transition:width .6s"></div>
        </div>
      </div>
    `;
  }).join('');
}
