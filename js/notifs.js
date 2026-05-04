// CD & Co ERP — NOTIFICATIONS
// ====================================

// ══════════════════════════════════════════
// ALERTS ENGINE
// ══════════════════════════════════════════
function calculateAlerts() {
  const alerts = [];
  const now = new Date();
  
  // 1. Stock bajo
  S.products.forEach(p => {
    if (p.stock <= p.minStock) {
      alerts.push({
        type: p.stock <= 0 ? 'danger' : 'warning',
        icon: '📦',
        title: p.stock <= 0 ? 'Sin stock' : 'Stock bajo',
        msg: `${p.name} tiene ${p.stock} unidad(es).`,
        action: `goPage('inventory')`
      });
    }
  });

  // 2. Suscripción por vencer (<= 7 días)
  S.subscriptions.forEach(s => {
    if(s.active && s.nextDate) {
      const msDiff = new Date(s.nextDate+'T00:00:00') - now;
      const daysDiff = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7 && daysDiff >= 0) {
        alerts.push({
          type: 'warning',
          icon: '🔄',
          title: 'Suscripción próxima',
          msg: `${s.name} (${fmt(s.amount,s.cur||s.currency||'$')}) se cobra en ${daysDiff === 0 ? 'hoy' : daysDiff + ' días'}.`,
          action: `goPage('subscriptions')`
        });
      } else if (daysDiff < 0) {
        alerts.push({
          type: 'danger',
          icon: '⚠️',
          title: 'Suscripción vencida',
          msg: `${s.name} está vencida hace ${Math.abs(daysDiff)} días.`,
          action: `goPage('subscriptions')`
        });
      }
    }
  });

  // 3. Presupuesto superado
  const tm = thisMo();
  S.budgets.forEach(b => {
    if (b.month === tm) {
      // Find expenses in that category this month
      // Currencies: normalise if necessary, simplistic matching here
      const bCur = b.cur || b.currency || '$';
      const spent = S.txs
        .filter(t => t.type==='expense' && t.cat === b.category && (t.cur||'$') === bCur && mkey(t.date) === tm)
        .reduce((a,t) => a + Math.abs(parseFloat(t.amount)||0), 0); // amounts may be negative — use abs
      if (spent >= b.amount) {
        alerts.push({
          type: 'danger',
          icon: '📊',
          title: 'Presupuesto superado',
          msg: `Categoría ${b.category} excedida (${fmt(spent, bCur)} de ${fmt(b.amount, bCur)}).`,
          action: `goPage('budgets')`
        });
      }
    }
  });

  // 4. Pedido pendiente antiguo (> 7 días)
  S.orders.forEach(o => {
    if (o.status === 'pending') {
      const days = Math.floor((now - new Date(o.date+'T00:00:00')) / (1000 * 60 * 60 * 24));
      if (days > 7) {
        alerts.push({
          type: 'warning',
          icon: '📋',
          title: 'Pedido demorado',
          msg: `El pedido a ${S.contacts.find(c=>c.id===(o.supId||o.supplierId||o.supplier_id))?.name||'Proveedor'} lleva ${days} días sin entrega.`,
          action: `goPage('orders')`
        });
      }
    }
  });

  // 5. Deuda próxima a vencer (<= 7 días)
  S.debts.forEach(d => {
    if (d.total > d.paid && d.dueDate) {
      const msDiff = new Date(d.dueDate+'T00:00:00') - now;
      const days = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
      if (days <= 7 && days >= 0) {
        alerts.push({
          type: 'warning',
          icon: '💸',
          title: 'Deuda por vencer',
          msg: `Cuota de ${S.contacts.find(c=>c.id===d.creditorId)?.name||d.desc} vence en ${days === 0 ? 'hoy' : days + ' días'}.`,
          action: `goPage('debts')`
        });
      } else if (days < 0) {
        alerts.push({
          type: 'danger',
          icon: '💸',
          title: 'Deuda vencida',
          msg: `Cuota de ${S.contacts.find(c=>c.id===d.creditorId)?.name||d.desc} expiró hace ${Math.abs(days)} días.`,
          action: `goPage('debts')`
        });
      }
    }
  });

  // 6. Tarjeta próxima a pago
  // In the current CD&Co system, cards are tracked via `S.cards` and transactions.
  // There is no explicit "dueDate" on cards objects in the data model yet, 
  // but we can generate an alert if they have high utilized balance.
  S.cards.forEach(c => {
    if(typeof getCardUsed === 'function') {
      const usedObj = getCardUsed(c.id);
      const limit = c.initialBalance || 0; // Credit limit
      // If used > 80% of limit
      if (limit > 0 && Math.abs(usedObj.total) > limit * 0.8) {
        alerts.push({
          type: 'warning',
          icon: '💳',
          title: 'Alerta de Tarjeta',
          msg: `Línea de crédito de ${c.name} al ${(Math.abs(usedObj.total)/limit*100).toFixed(0)}%.`,
          action: `goPage('debts')`
        });
      }
    }
  });

  // Prioritize dangers first
  alerts.sort((a,b) => (a.type === 'danger' ? -1 : 1) - (b.type === 'danger' ? -1 : 1));

  window.systemAlerts = alerts;
  
  const b = g('badge-notifs');
  if(b) {
    if(alerts.length > 0) {
      b.textContent = alerts.length;
      b.style.display = 'inline-flex';
      let hasDanger = alerts.some(a=>a.type==='danger');
      b.className = `badge ${hasDanger ? 'badge-red' : ''}`;
      b.style.background = hasDanger ? 'var(--nb)' : 'var(--pb)';
      b.style.color = hasDanger ? '#d47a7a' : 'var(--pos)';
    } else {
      b.style.display = 'none';
      b.textContent = '0';
    }
  }
}

function renderNotifs() {
  const c = g('notifs-container');
  if(!c) return;
  const as = window.systemAlerts || [];
  if(!as.length) {
    c.innerHTML = '<div class="tbl-empty" style="padding:40px;text-align:center"><div style="font-size:3rem;margin-bottom:15px">🎉</div><div style="font-weight:600;font-size:1.1rem;color:var(--cr);margin-bottom:5px">Todo al día</div><div style="font-size:.9rem;color:var(--mu)">No tenés tareas pendientes ni alertas críticas. ¡Excelente trabajo!</div></div>';
    return;
  }
  
  const isLight = document.body.classList.contains('light-mode');
  const muColor  = isLight ? '#4a5568' : 'var(--mu)';
  const arrColor = isLight ? '#94a3b8' : 'var(--mu)';

  c.innerHTML = as.map(a => {
    const isDanger   = a.type === 'danger';
    const bgBase     = isDanger ? 'rgba(201,74,74,.08)'  : 'rgba(74,155,111,.08)';
    const bgHover    = isDanger ? 'rgba(201,74,74,.16)'  : 'rgba(74,155,111,.16)';
    const borderClr  = isDanger ? 'rgba(201,74,74,.25)'  : 'rgba(74,155,111,.25)';
    const iconBg     = isDanger ? 'rgba(201,74,74,.18)'  : 'rgba(74,155,111,.18)';
    const titleColor = isDanger ? '#c94a4a'              : '#2a7a52';
    return `
    <div style="display:flex;align-items:center;gap:14px;padding:14px;margin-bottom:8px;border:1px solid ${borderClr};border-radius:10px;background:${bgBase};cursor:pointer;transition:background 0.2s"
         onmouseover="this.style.background='${bgHover}'" onmouseout="this.style.background='${bgBase}'"
         onclick="${a.action}">
      <div style="font-size:1.6rem;width:42px;height:42px;border-radius:10px;background:${iconBg};display:flex;align-items:center;justify-content:center;flex-shrink:0">${escHtml(a.icon)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.9rem;color:${titleColor};margin-bottom:3px">${escHtml(a.title)}</div>
        <div style="font-size:.82rem;color:${muColor};line-height:1.4">${escHtml(a.msg)}</div>
      </div>
      <div style="color:${arrColor};font-size:1.1rem;font-weight:600;flex-shrink:0">›</div>
    </div>`;
  }).join('');
}

// Navigation is handled by nav.js renderPageData → calls calculateAlerts() + renderNotifs() when pg === 'notifs'
