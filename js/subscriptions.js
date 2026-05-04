// CD & Co ERP — SUBSCRIPTIONS (Suscripciones y Gastos Recurrentes)
// ====================================

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function getDaysUntil(dateStr) {
  if (!dateStr) return 9999;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function getMonthlyEquivalent(amount, frequency) {
  return frequency === 'annual' ? amount / 12 : amount;
}

function nextBillingDate(dateStr, frequency) {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  if (frequency === 'annual') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function getTotalMonthlyCost(currency) {
  return (S.subscriptions || [])
    .filter(s => s.active !== false && (s.currency || '$') === currency)
    .reduce((sum, s) => sum + getMonthlyEquivalent(parseFloat(s.amount) || 0, s.frequency), 0);
}

function getSubsBadgeCount() {
  return (S.subscriptions || []).filter(s => s.active !== false && getDaysUntil(s.nextDate) <= 7).length;
}

function freqLabel(f) { return f === 'annual' ? 'Anual' : 'Mensual'; }
function freqShort(f) { return f === 'annual' ? '/año' : '/mes'; }

function daysColor(days) {
  if (days < 0)  return '#d47a7a';
  if (days <= 3) return '#d47a7a';
  if (days <= 7) return '#d4b47a';
  return 'var(--pos)';
}
function daysLabel(days) {
  if (days < 0)  return `Vencida hace ${Math.abs(days)}d`;
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
}

// ══════════════════════════════════════════
// RENDER PAGE
// ══════════════════════════════════════════
function renderSubscriptions() {
  const wrap = g('subs-list');
  if (!wrap) return;
  const subs = [...(S.subscriptions || [])].sort((a, b) => {
    const da = getDaysUntil(a.nextDate), db = getDaysUntil(b.nextDate);
    return da - db;
  });
  if (!subs.length) {
    wrap.innerHTML = `<div class="tbl-empty" style="padding:40px;text-align:center">
      Sin suscripciones. <button class="btn btn-g" style="margin-top:12px" onclick="openSubModal()">＋ Agregar primera</button>
    </div>`;
    return;
  }

  const totalUSD = getTotalMonthlyCost('$');
  const totalPYG = getTotalMonthlyCost('₲');

  wrap.innerHTML = subs.map(s => {
    const days = getDaysUntil(s.nextDate);
    const dc   = daysColor(days);
    const cur  = s.currency || '$';
    const amt  = parseFloat(s.amount) || 0;
    const monthly = getMonthlyEquivalent(amt, s.frequency);
    const icon = s.icon || '🔄';
    const active = s.active !== false;
    return `
    <div class="sub-card${active ? '' : ' sub-inactive'}">
      <div class="sub-icon">${icon}</div>
      <div class="sub-body">
        <div class="sub-name">${s.name}</div>
        ${s.description ? `<div class="sub-desc">${s.description}</div>` : ''}
        <div class="sub-meta">
          <span class="pill pill-neu">${freqLabel(s.frequency)}</span>
          ${s.frequency==='annual' ? `<span style="font-size:.6rem;color:var(--mu);font-family:var(--fm)">~${fmt(monthly,cur)}/mes</span>` : ''}
        </div>
      </div>
      <div class="sub-right">
        <div class="sub-amount">${fmt(amt,cur)}<span class="sub-freq">${freqShort(s.frequency)}</span></div>
        <div class="sub-days" style="color:${dc}">
          <span>📅 ${s.nextDate}</span>
          <span class="sub-days-badge" style="background:${dc}22;color:${dc}">${daysLabel(days)}</span>
        </div>
        <div class="sub-actions">
          <button class="btn btn-g" style="font-size:.6rem;padding:4px 10px" onclick="markSubPaid('${s.id}')">✓ Cobrada</button>
          <button class="btn btn-s" style="font-size:.6rem;padding:4px 8px" onclick="openSubModal('${s.id}')">✏</button>
          <button class="btn btn-danger" style="font-size:.6rem;padding:4px 8px" onclick="delSub('${s.id}')">✕</button>
        </div>
      </div>
    </div>`;
  }).join('') +
  // totals footer
  `<div class="sub-total-row">
    <span>Total costo mensual:</span>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      ${totalUSD > 0 ? `<span style="font-family:var(--fm);color:var(--g2)">${fmt(totalUSD,'$')}<span style="color:var(--mu);font-size:.65rem">/mes</span> · ${fmt(totalUSD*12,'$')}<span style="color:var(--mu);font-size:.65rem">/año</span></span>` : ''}
      ${totalPYG > 0 ? `<span style="font-family:var(--fm);color:var(--g2)">${fmt(totalPYG,'₲')}<span style="color:var(--mu);font-size:.65rem">/mes</span></span>` : ''}
      ${totalUSD===0 && totalPYG===0 ? `<span style="color:var(--mu)">—</span>` : ''}
    </div>
  </div>`;
}

// ══════════════════════════════════════════
// DASHBOARD WIDGET
// ══════════════════════════════════════════
function renderSubsAlerts() {
  const el = g('subs-alerts');
  if (!el) return;
  const urgent = (S.subscriptions || [])
    .filter(s => s.active !== false && getDaysUntil(s.nextDate) <= 7)
    .sort((a, b) => getDaysUntil(a.nextDate) - getDaysUntil(b.nextDate));

  if (!urgent.length) {
    el.innerHTML = `<div class="tbl-empty" style="padding:10px;font-size:.72rem">✓ Sin suscripciones por vencer</div>`;
    return;
  }
  el.innerHTML = urgent.map(s => {
    const days = getDaysUntil(s.nextDate);
    const dc   = daysColor(days);
    const cur  = s.currency || '$';
    return `
    <div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--bg5);cursor:pointer" onclick="goPage('subscriptions')">
      <div style="width:28px;height:28px;border-radius:8px;background:var(--bg4);border:1px solid var(--gb);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${s.icon||'🔄'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.74rem;font-weight:500;color:var(--cr);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}</div>
        <div style="font-size:.6rem;color:${dc};font-family:var(--fm);margin-top:1px">${daysLabel(days)}</div>
      </div>
      <div style="font-family:var(--fm);font-size:.8rem;color:var(--g2);flex-shrink:0">${fmt(parseFloat(s.amount)||0,cur)}</div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
// MARK AS PAID
// ══════════════════════════════════════════
async function markSubPaid(id) {
  const s = (S.subscriptions || []).find(x => x.id === id);
  if (!s) return;

  const amt    = parseFloat(s.amount) || 0;
  const cur    = s.cur || s.currency || '$';
  const accId  = s.account_id || null;

  // Determinar si está vinculada a tarjeta o cuenta bancaria
  const linkedCard = accId ? (S.cards    || []).find(c => c.id === accId) : null;
  const linkedAcc  = accId ? (S.accounts || []).find(a => a.id === accId) : null;

  const txData = {
    id:         uid(),
    type:       'expense',
    desc:       `${s.icon || '🔄'} ${s.name}`,
    amount:     -amt,          // negativo = gasto
    cur,
    cat:        'Servicios',
    date:       today(),
    account_id: accId || null
  };

  if (SB_ON) {
    try {
      // ── Token fresco ──
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) { toast('❌ Sesión expirada — reiniciá sesión'); return; }

      // ── 1. Guardar transacción en tabla txs ──
      const saved = await sbSaveTransaction(txData);
      if (!saved) {
        toast('❌ No se pudo registrar el gasto en la BD');
        return;
      }
      S.txs.unshift({ ...txData, id: saved.id || txData.id });

      // ── 2a. Si es tarjeta: SUMAR al monto utilizado (el cargo cayó en la tarjeta) ──
      if (linkedCard) {
        const newUsed = Math.max(0, (parseFloat(linkedCard.used) || 0) + amt);
        const { error: cardErr } = await sb.from('cards').update({ used: newUsed }).eq('id', accId);
        if (!cardErr) {
          linkedCard.used = newUsed;
          console.log(`[markSubPaid] ✓ Card used actualizado: ${newUsed}`);
        } else {
          console.warn('[markSubPaid] No se pudo actualizar card.used:', cardErr.message);
        }
      }

      // ── 2b. Si es cuenta bancaria: RESTAR del saldo ──
      if (linkedAcc) {
        const newBal = (parseFloat(linkedAcc.balance) || 0) - amt;
        const { error: accErr } = await sb.from('accounts').update({ balance: newBal }).eq('id', accId).eq('user_id', S.user?.id);
        if (!accErr) {
          linkedAcc.balance = newBal;
          console.log(`[markSubPaid] ✓ Account balance actualizado: ${newBal}`);
        } else {
          console.warn('[markSubPaid] No se pudo actualizar account.balance:', accErr.message);
        }
      }

      // ── 3. Avanzar nextDate en Supabase (falla silenciosamente si tabla no existe) ──
      const newNext = nextBillingDate(s.nextDate, s.frequency);
      try { await sbUpsert('subscriptions', { ...s, nextDate: newNext }); } catch (_) {}

      toast(`✅ ${s.name} cobrada — gasto de ${fmt(amt, cur)} registrado`);

    } catch (e) {
      console.error('[markSubPaid] Excepción:', e.message);
      toast(`❌ Error al procesar: ${e.message}`);
      return;
    }

  } else {
    // ── Modo offline ──
    S.txs.unshift({ ...txData });
    if (linkedCard) linkedCard.used = Math.max(0, (parseFloat(linkedCard.used) || 0) + amt);
    if (linkedAcc)  linkedAcc.balance = (parseFloat(linkedAcc.balance) || 0) - amt;
    toast(`✅ ${s.name} cobrada (offline) — gasto de ${fmt(amt, cur)} registrado`);
  }

  // ── Avanzar nextDate localmente ──
  const idx = S.subscriptions.findIndex(x => x.id === id);
  if (idx >= 0) S.subscriptions[idx].nextDate = nextBillingDate(s.nextDate, s.frequency);

  lsave();
  renderAll();
}

// ══════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════
let editSubId = null;

function openSubModal(id) {
  editSubId = id || null;
  g('sub-mttl').textContent = id ? 'Editar suscripción' : 'Nueva suscripción';
  const s = id ? (S.subscriptions || []).find(x => x.id === id) : null;
  g('sub-name').value    = s ? (s.name || '') : '';
  g('sub-desc').value    = s ? (s.description || '') : '';
  g('sub-icon').value    = s ? (s.icon || '🔄') : '🔄';
  g('sub-amt').value     = s ? (s.amount || '') : '';
  g('sub-cur').value     = s ? (s.cur || s.currency || '$') : '$';
  g('sub-freq').value    = s ? (s.frequency || 'monthly') : 'monthly';
  g('sub-next').value    = s ? (s.nextDate || '') : '';
  // Poblar selector de cuenta/tarjeta con optgroup y íconos
  const selAcc = g('sub-account');
  if (selAcc) {
    let html = '<option value="">Sin vincular</option>';
    const accs  = S.accounts || [];
    const cards = S.cards    || [];
    if (accs.length) {
      html += '<optgroup label="─── Cuentas bancarias ───">';
      html += accs.map(a => {
        const icon = typeof acctTypeIcon === 'function' ? acctTypeIcon(a.type) : '🏦';
        const cur  = a.cur || a.currency || '';
        return `<option value="${a.id}">${icon} ${a.name}${cur ? ' (' + cur + ')' : ''}</option>`;
      }).join('');
      html += '</optgroup>';
    }
    if (cards.length) {
      html += '<optgroup label="─── Tarjetas ───">';
      html += cards.map(c => `<option value="${c.id}">💳 ${c.name}</option>`).join('');
      html += '</optgroup>';
    }
    selAcc.innerHTML = html;
    selAcc.value = s ? (s.account_id || '') : '';
  }
  g('sub-modal-acts').innerHTML = id
    ? `<button class="mb mb-d" onclick="delSub('${id}');cm('sub-modal')">Eliminar</button><button class="mb mb-gh" onclick="cm('sub-modal')">Cancelar</button><button class="mb mb-g" onclick="saveSub()">Guardar</button>`
    : `<button class="mb mb-gh" onclick="cm('sub-modal')">Cancelar</button><button class="mb mb-g" onclick="saveSub()">Guardar</button>`;
  g('sub-modal').style.display = 'flex';
}

function saveSub() {
  const name      = g('sub-name').value.trim();
  const amt       = parseFloat(g('sub-amt').value);
  const cur       = g('sub-cur').value;
  const freq      = g('sub-freq').value;
  const next      = g('sub-next').value;
  const icon      = g('sub-icon').value.trim() || '🔄';
  const desc      = g('sub-desc').value.trim();
  const accountId = g('sub-account')?.value || null;
  if (!name)          { toast('Ingresá el nombre'); return; }
  if (!amt || amt<=0) { toast('Ingresá un monto válido'); return; }
  if (!next)          { toast('Seleccioná la fecha del próximo cobro'); return; }
  const sub = { name, description: desc, icon, amount: amt, cur, currency: cur, frequency: freq, nextDate: next, active: true, account_id: accountId || null };
  if (!S.subscriptions) S.subscriptions = [];
  let savedId;
  if (editSubId) {
    const i = S.subscriptions.findIndex(s => s.id === editSubId);
    if (i >= 0) S.subscriptions[i] = { ...S.subscriptions[i], ...sub };
    savedId = editSubId;
    toast('◆ Suscripción actualizada');
  } else {
    const newSub = { ...sub, id: uid() };
    S.subscriptions.push(newSub);
    savedId = newSub.id;
    toast('◆ Suscripción registrada');
  }
  if (SB_ON && sb && S.user?.id) {
    const row = S.subscriptions.find(s => s.id === savedId);
    if (row) sbUpsert('subscriptions', row).catch(e => console.error('[Subs] upsert:', e));
  } else { lsave(); }
  renderAll(); cm('sub-modal');
}

function delSub(id) {
  if (!confirm('¿Eliminar esta suscripción?')) return;
  S.subscriptions = (S.subscriptions || []).filter(s => s.id !== id);
  if (SB_ON && sb && S.user?.id) {
    sbDelete('subscriptions', id).catch(e => console.error('[Subs] delete:', e));
  } else { lsave(); }
  renderAll(); toast('Suscripción eliminada');
}
