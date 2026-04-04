// CD & Co ERP — PATRIMONIO
// ====================================

let patrimonioChart7d = null;

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function patDomCur() {
  let cU = 0, cG = 0;
  (S.txs || []).forEach(t => t.cur === '₲' ? cG++ : cU++);
  (S.accounts || []).forEach(a => (a.cur || a.currency) === '₲' ? cG++ : cU++);
  return cG > cU ? '₲' : '$';
}

function patToDom(amount, fromCur, dCur) {
  if (!amount || isNaN(amount)) return 0;
  if (fromCur === dCur) return parseFloat(amount);
  const rate = (FX && FX.buy && FX.buy > 1000) ? FX.buy : 7200;
  if (dCur === '₲') return parseFloat(amount) * rate;
  return parseFloat(amount) / rate;
}

function patCalcNumbers() {
  const dCur = patDomCur();

  // Accounts total
  let acctTotal = 0;
  (S.accounts || []).forEach(a => {
    acctTotal += patToDom(getAccountBalance(a.id), a.cur || a.currency || '$', dCur);
  });

  // Card debts
  let cardDebt = 0;
  (S.cards || []).forEach(c => {
    const used = typeof getCardUsed === 'function' ? getCardUsed(c.id) : 0;
    cardDebt += patToDom(used, c.cur || '$', dCur);
  });

  // Other debts
  let otherDebt = 0;
  (S.debts || []).forEach(d => {
    const pending = Math.max(0, parseFloat(d.totalAmount || d.total || 0) - parseFloat(d.paidAmount || d.paid || 0));
    otherDebt += patToDom(pending, d.cur || '$', dCur);
  });

  // Receivables
  let recvTotal = 0;
  (S.receivables || []).filter(r => !r.completed).forEach(r => {
    const pending = Math.max(0, parseFloat(r.total || 0) - parseFloat(r.paid || 0));
    recvTotal += patToDom(pending, r.cur || '$', dCur);
  });

  // Inventory value (Asset)
  let invValue = 0;
  (S.products || []).forEach(p => {
    const val = (parseFloat(p.buyPrice) || 0) * (parseInt(p.stock) || 0);
    const pCur = p.cur || '₲'; 
    invValue += patToDom(val, pCur, dCur);
  });

  const totalDebt = cardDebt + otherDebt;
  const totalActivos = acctTotal + recvTotal + invValue;
  const patrimonioNeto = totalActivos - totalDebt;

  return { dCur, acctTotal, cardDebt, otherDebt, totalDebt, recvTotal, invValue, totalActivos, patrimonioNeto };
}

// Monthly income/expense from txs (last N months)
function patMonthlyFlow(months) {
  const result = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const dCur = patDomCur();
    let inc = 0, exp = 0;
    (S.txs || []).forEach(tx => {
      if (!(tx.date || '').startsWith(key)) return;
      const isAdj = (tx.desc||'').toLowerCase().includes('ajuste') || (tx.cat||'').toLowerCase().includes('ajuste') || (tx.cat === 'Otros Ingresos' && Math.abs(tx.amount) > 500000);
      if (isAdj) return;
      const amt = patToDom(Math.abs(tx.amount) || 0, tx.cur || '$', dCur);
      if (tx.type === 'income' || tx.type === 'transfer-in') inc += amt;
      else if (tx.type === 'expense' || tx.type === 'transfer-out') exp += amt;
    });
    result.push({ key, inc, exp, net: inc - exp });
  }
  return result;
}

function patGet6MonthStats() {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);
    const startDate = sixMonthsAgo.toISOString().slice(0, 10);
    
    const dCur = patDomCur();
    let totalInc = 0, totalExp = 0;
    
    (S.txs || []).forEach(tx => {
      if (tx.date < startDate) return;
      const isAdj = (tx.desc||'').toLowerCase().includes('ajuste') || (tx.cat||'').toLowerCase().includes('ajuste') || (tx.cat === 'Otros Ingresos' && Math.abs(tx.amount) > 500000);
      if (isAdj) return;
      
      const amt = patToDom(Math.abs(tx.amount) || 0, tx.cur || '$', dCur);
      if (tx.type === 'income' || tx.type === 'transfer-in') totalInc += amt;
      else if (tx.type === 'expense' || tx.type === 'transfer-out') totalExp += amt;
    });
    
    // Calculate divisor based on available months (at least 1 to avoid /0)
    const monthsToDate = Math.max(1, Math.ceil((now - new Date(startDate)) / (1000 * 60 * 60 * 24 * 30.44)));
    const divisor = Math.min(6, monthsToDate);
    
    return {
      avgInc: totalInc / divisor,
      avgExp: totalExp / divisor,
      avgNet: (totalInc - totalExp) / divisor
    };
  } catch (e) {
    console.error("Error in patGet6MonthStats:", e);
    return { avgInc: 0, avgExp: 0, avgNet: 0 };
  }
}
function patAvgMonthlyGrowth() {
  return patGet6MonthStats().avgNet;
}

// ══════════════════════════════════════════
// HEALTH INDICATOR
// ══════════════════════════════════════════
function patHealth(totalDebt, totalActivos) {
  if (!totalActivos || totalActivos <= 0) return { label: 'Sin datos', color: 'var(--mu)', score: 0 };
  const ratio = totalDebt / totalActivos;
  if (ratio <= 0.20) return { label: 'Excelente', color: '#4ade80', score: 4 };
  if (ratio <= 0.40) return { label: 'Buena', color: 'var(--g2)', score: 3 };
  if (ratio <= 0.60) return { label: 'Regular', color: '#e8b124', score: 2 };
  return { label: 'Crítica', color: '#d47a7a', score: 1 };
}

// ══════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════
function renderPatrimonio() {
  const el = g('patrimonio-body');
  if (!el) return;

  const n = patCalcNumbers();
  const { dCur, acctTotal, cardDebt, otherDebt, totalDebt, recvTotal, invValue, totalActivos, patrimonioNeto } = n;
  const health = patHealth(totalDebt, totalActivos);

  // Monthly data
  const flow6 = patMonthlyFlow(6);
  const prevMonth = flow6.length >= 2 ? flow6[flow6.length - 2] : null;
  const curMonth = flow6.length >= 1 ? flow6[flow6.length - 1] : null;
  const avgGrowth = patAvgMonthlyGrowth();

  // Previous patrimonio (rough: current - last month net)
  const prevPatrimonio = patrimonioNeto - (curMonth ? curMonth.net : 0);
  const patDiff = patrimonioNeto - prevPatrimonio;
  const patPct = prevPatrimonio !== 0 ? (patDiff / Math.abs(prevPatrimonio) * 100) : 0;

  // Ratios
  const liquidez = totalDebt > 0 ? (acctTotal / totalDebt) : (acctTotal > 0 ? 99 : 0);
  const endeudamiento = totalActivos > 0 ? (totalDebt / totalActivos * 100) : 0;
  const solvencia = totalActivos > 0 ? (patrimonioNeto / totalActivos * 100) : 0;
  const totalInc6 = flow6.reduce((s, m) => s + m.inc, 0);
  const totalNet6 = flow6.reduce((s, m) => s + m.net, 0);
  const ahorro = totalInc6 > 0 ? (totalNet6 / totalInc6 * 100) : 0;

  // 7-day daily data
  const days7 = [];
  const today7Labels = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' });
    let net = 0;
    (S.txs || []).forEach(tx => {
      if (tx.date !== key) return;
      const isAdj = (tx.desc||'').toLowerCase().includes('ajuste') || (tx.cat||'').toLowerCase().includes('ajuste') || (tx.cat === 'Otros Ingresos' && Math.abs(tx.amount) > 500000);
      if (isAdj) return;
      const amt = patToDom(Math.abs(tx.amount) || 0, tx.cur || '$', dCur);
      if (tx.type === 'income') net += amt;
      else if (tx.type === 'expense') net -= amt;
    });
    days7.push(net);
    today7Labels.push(label);
  }

  // Goals
  const goals = (S.goals || []).filter(g2 => !g2.completed);

  // Próximas deudas
  const proxDeudas = [...(S.debts || [])]
    .filter(d => d.due && Math.max(0, parseFloat(d.total || 0) - parseFloat(d.paid || 0)) > 0)
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .slice(0, 3);

  // Próximos cobros (top by pending amount, no specific due date usually)
  const proxCobros = [...(S.receivables || [])]
    .filter(r => !r.completed && Math.max(0, parseFloat(r.total || 0) - parseFloat(r.paid || 0)) > 0)
    .sort((a, b) => Math.max(0, parseFloat(b.total || 0) - parseFloat(b.paid || 0)) - Math.max(0, parseFloat(a.total || 0) - parseFloat(a.paid || 0)))
    .slice(0, 3);

  // Alertas saldo bajo
  const alertasCuentas = (S.accounts || []).filter(a => {
    const bal = getAccountBalance(a.id);
    return bal < parseFloat(a.minBalance || 0) || bal < 0;
  });

  const varColor = patDiff >= 0 ? 'var(--pos)' : '#d47a7a';
  const varSign = patDiff >= 0 ? '+' : '';

  el.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:20px;padding-bottom:40px">

    <!-- ROW 1: Patrimonio Neto + Salud Financiera -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">

      <!-- Patrimonio Neto Card -->
      <div class="panel pp" style="padding:24px;background:linear-gradient(135deg,var(--bg2),var(--bg3));border:1px solid var(--gd)">
        <div style="font-size:.7rem;color:var(--mu);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Patrimonio Neto</div>
        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px">
          <div style="font-size:2.8rem;font-weight:300;font-family:var(--fm);color:${patrimonioNeto >= 0 ? 'var(--g2)' : '#d47a7a'}">${fmt(patrimonioNeto, dCur)}</div>
          <div style="font-size:.85rem;color:${varColor};font-family:var(--fm)">${varSign}${fmt(patDiff, dCur)} <span style="font-size:.7rem">(${varSign}${patPct.toFixed(1)}%)</span></div>
        </div>
        <div style="font-size:.65rem;color:var(--mu);margin-bottom:20px">vs. mes anterior</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
          <div style="background:var(--bg4);border-radius:8px;padding:12px;border:1px solid var(--bg5)">
            <div style="font-size:.62rem;color:var(--mu);margin-bottom:4px">💰 Cuentas</div>
            <div style="font-size:1.1rem;font-family:var(--fm);color:var(--g2)">${fmt(acctTotal, dCur)}</div>
          </div>
          <div style="background:var(--bg4);border-radius:8px;padding:12px;border:1px solid var(--bg5)">
            <div style="font-size:.62rem;color:var(--mu);margin-bottom:4px">📦 Stock</div>
            <div style="font-size:1.1rem;font-family:var(--fm);color:var(--g2)" id="pat-inventario">${fmt(invValue, dCur)}</div>
          </div>
          <div style="background:var(--bg4);border-radius:8px;padding:12px;border:1px solid var(--bg5)">
            <div style="font-size:.62rem;color:var(--mu);margin-bottom:4px">🤝 A Cobrar</div>
            <div style="font-size:1.1rem;font-family:var(--fm);color:var(--pos)">${fmt(recvTotal, dCur)}</div>
          </div>
          <div style="background:var(--bg4);border-radius:8px;padding:12px;border:1px solid var(--bg5)">
            <div style="font-size:.62rem;color:var(--mu);margin-bottom:4px">💳 Deudas</div>
            <div style="font-size:1.1rem;font-family:var(--fm);color:#d47a7a">-${fmt(totalDebt, dCur)}</div>
          </div>
        </div>
      </div>

      <!-- Salud Financiera -->
      <div class="panel pp" style="padding:24px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
        <div style="font-size:.7rem;color:var(--mu);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:16px">Salud Financiera</div>
        <div style="width:80px;height:80px;border-radius:50%;background:${health.color}22;border:3px solid ${health.color};display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <div style="font-size:.95rem;font-weight:700;color:${health.color}">${health.score > 0 ? '★'.repeat(health.score) : '—'}</div>
        </div>
        <div style="font-size:1.3rem;font-weight:600;color:${health.color};margin-bottom:6px">${health.label}</div>
        <div style="font-size:.65rem;color:var(--mu)">Deuda/Activos: ${endeudamiento.toFixed(1)}%</div>
      </div>
    </div>

    <!-- ROW 2: Estado de Situación Patrimonial -->
    <div class="panel pp" style="padding:20px">
      <div class="sh-t" style="margin-bottom:16px">Estado de Situación Patrimonial</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div>
          <div style="font-size:.72rem;font-weight:600;color:var(--g2);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--bg5)">ACTIVOS</div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:.78rem">
            <div style="color:var(--mu);font-size:.65rem;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">Activos Corrientes (AC)</div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--cr)">Efectivo en cuentas</span><span style="font-family:var(--fm);color:var(--g2)">${fmt(acctTotal, dCur)}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--cr)">Cuentas a cobrar</span><span style="font-family:var(--fm);color:var(--pos)">${fmt(recvTotal, dCur)}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--cr)">Inventario (stock)</span><span style="font-family:var(--fm);color:var(--g2)">${fmt(invValue, dCur)}</span></div>
            <div style="border-top:1px solid var(--bg5);margin-top:4px;padding-top:8px;display:flex;justify-content:space-between;font-weight:600"><span style="color:var(--g2)">TOTAL ACTIVOS</span><span style="font-family:var(--fm);color:var(--g2)">${fmt(totalActivos, dCur)}</span></div>
          </div>
        </div>
        <div>
          <div style="font-size:.72rem;font-weight:600;color:#d47a7a;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--bg5)">PASIVOS Y PATRIMONIO</div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:.78rem">
            <div style="color:var(--mu);font-size:.65rem;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">Pasivos</div>
            ${cardDebt > 0 ? `<div style="display:flex;justify-content:space-between"><span style="color:var(--cr)">Deuda tarjetas</span><span style="font-family:var(--fm);color:#d47a7a">${fmt(cardDebt, dCur)}</span></div>` : ''}
            ${otherDebt > 0 ? `<div style="display:flex;justify-content:space-between"><span style="color:var(--cr)">Deudas y Cuotas</span><span style="font-family:var(--fm);color:#d47a7a">${fmt(otherDebt, dCur)}</span></div>` : ''}
            ${totalDebt === 0 ? `<div style="color:var(--mu);font-size:.72rem">Sin pasivos registrados</div>` : ''}
            <div style="border-top:1px dashed var(--bg5);margin-top:4px;padding-top:8px;display:flex;justify-content:space-between"><span style="color:#d47a7a">Total Pasivos</span><span style="font-family:var(--fm);color:#d47a7a">${fmt(totalDebt, dCur)}</span></div>
            <div style="color:var(--mu);font-size:.65rem;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">Patrimonio</div>
            <div style="border-top:1px solid var(--bg5);margin-top:4px;padding-top:8px;display:flex;justify-content:space-between;font-weight:600"><span style="color:var(--g2)">PATRIMONIO NETO</span><span style="font-family:var(--fm);color:${patrimonioNeto >= 0 ? 'var(--g2)' : '#d47a7a'}">${fmt(patrimonioNeto, dCur)}</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ROW 3: Ratios Financieros -->
    <div>
      <div class="sh-t" style="margin-bottom:12px">Ratios Financieros</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
        ${patRatioCard('Liquidez', liquidez.toFixed(2) + 'x', liquidez >= 2 ? 'var(--pos)' : liquidez >= 1 ? 'var(--g2)' : '#d47a7a', 'Cuentas / Deudas')}
        ${patRatioCard('Endeudamiento', endeudamiento.toFixed(1) + '%', endeudamiento <= 30 ? 'var(--pos)' : endeudamiento <= 60 ? 'var(--g2)' : '#d47a7a', 'Deudas / Activos')}
        ${patRatioCard('Solvencia', solvencia.toFixed(1) + '%', solvencia >= 60 ? 'var(--pos)' : solvencia >= 30 ? 'var(--g2)' : '#d47a7a', 'Pat.Neto / Activos')}
        ${patRatioCard('Capital', fmt(patrimonioNeto, dCur), patrimonioNeto >= 0 ? 'var(--g2)' : '#d47a7a', 'Patrimonio neto')}
        ${patRatioCard('Ahorro', ahorro.toFixed(1) + '%', ahorro >= 20 ? 'var(--pos)' : ahorro >= 5 ? 'var(--g2)' : '#d47a7a', '% ingresos ahorrados')}
      </div>
    </div>

    <!-- ROW 4: Desglose Activos + Distribución Patrimonio -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

      <!-- Desglose Activos -->
      <div class="panel pp" style="padding:20px">
        <div class="sh-t" style="margin-bottom:16px">Desglose de Activos</div>
        ${patBarH('Efectivo (AC)', acctTotal, totalActivos, dCur, 'var(--g2)')}
        ${patBarH('A Cobrar (AC)', recvTotal, totalActivos, dCur, 'var(--pos)')}
        ${patBarH('Inventario (Stock)', invValue, totalActivos, dCur, '#a58eeb')}
      </div>

      <!-- Detalle de Cuentas (Debug) -->
      <div class="panel pp" style="padding:20px">
        <div class="sh-t" style="margin-bottom:12px">Detalle por Cuenta</div>
        <div style="font-size:.65rem;max-height:160px;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="color:var(--mu);text-align:left;border-bottom:1px solid var(--bg5)">
                <th style="padding:4px">Nombre</th>
                <th style="padding:4px">Original</th>
                <th style="padding:4px;text-align:right">Convertido (${dCur})</th>
              </tr>
            </thead>
            <tbody>
              ${(S.accounts || []).map(a => {
                const b = getAccountBalance(a.id);
                const cur = a.cur || a.currency || '$';
                const conv = patToDom(b, cur, dCur);
                return `<tr style="border-bottom:1px solid var(--bg5)">
                  <td style="padding:6px 4px;color:var(--cr)">${a.name}</td>
                  <td style="padding:6px 4px">${fmt(b, cur)}</td>
                  <td style="padding:6px 4px;text-align:right;font-family:var(--fm);color:var(--g2)">${fmt(conv, dCur)}</td>
                </tr>`;
              }).join('')}
              ${(S.cards || []).map(c => {
                const b = typeof getCardUsed === 'function' ? getCardUsed(c.id) : 0;
                const cur = c.cur || c.currency || '$';
                const conv = patToDom(b, cur, dCur);
                return `<tr style="border-bottom:1px solid var(--bg5)">
                  <td style="padding:6px 4px;color:rgba(184,122,232,0.8)">💳 ${c.name}</td>
                  <td style="padding:6px 4px">${fmt(b, cur)}</td>
                  <td style="padding:6px 4px;text-align:right;font-family:var(--fm);color:#d47a7a">-${fmt(conv, dCur)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ROW 5: Proyección Financiera -->
    <div>
      <div class="sh-t" style="margin-bottom:12px">Proyección Financiera <span style="font-size:.65rem;color:var(--mu);font-weight:400">basada en crecimiento promedio mensual</span></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        ${patProjectionCard(3, patrimonioNeto, avgGrowth, dCur)}
        ${patProjectionCard(6, patrimonioNeto, avgGrowth, dCur)}
        ${patProjectionCard(12, patrimonioNeto, avgGrowth, dCur)}
      </div>
    </div>

    <!-- ROW 6: Tendencia 7 días + Crecimiento Mensual + Resumen Mensual -->
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:16px">

      <!-- Tendencia 7 días -->
      <div class="panel pp" style="padding:20px">
        <div class="sh-t" style="margin-bottom:16px">Tendencia 7 días <span style="font-size:.65rem;color:var(--mu);font-weight:400">Net diario</span></div>
        <div style="position:relative;height:100px"><canvas id="pat-chart-7d"></canvas></div>
      </div>

      <!-- Crecimiento Mensual -->
      <div class="panel pp" style="padding:20px;display:flex;flex-direction:column;justify-content:center">
        <div style="font-size:.65rem;color:var(--mu);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Crecimiento Mensual</div>
        <div style="font-size:1.6rem;font-family:var(--fm);font-weight:600;color:${patDiff >= 0 ? 'var(--g2)' : '#d47a7a'}">${varSign}${fmt(patDiff, dCur)}</div>
        <div style="font-size:1rem;color:${patDiff >= 0 ? 'var(--pos)' : '#d47a7a'};margin-top:4px">${varSign}${patPct.toFixed(2)}%</div>
        <div style="font-size:.62rem;color:var(--mu);margin-top:6px">vs. mes anterior</div>
      </div>

      <!-- Resumen Mensual -->
      <div class="panel pp" style="padding:20px;display:flex;flex-direction:column;justify-content:center">
        <div style="font-size:.65rem;color:var(--mu);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Resumen del Mes</div>
        ${curMonth ? `
          <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:6px"><span style="color:var(--mu)">Ingresos</span><span style="font-family:var(--fm);color:var(--pos)">${fmt(curMonth.inc, dCur)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:6px"><span style="color:var(--mu)">Gastos</span><span style="font-family:var(--fm);color:#d47a7a">${fmt(curMonth.exp, dCur)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:.78rem;font-weight:600;border-top:1px solid var(--bg5);padding-top:6px;margin-top:4px"><span style="color:var(--cr)">Balance</span><span style="font-family:var(--fm);color:${curMonth.net >= 0 ? 'var(--g2)' : '#d47a7a'}">${curMonth.net >= 0 ? '+' : ''}${fmt(curMonth.net, dCur)}</span></div>
          ${prevMonth ? `<div style="font-size:.6rem;color:var(--mu);margin-top:4px">Mes ant: ${fmt(prevMonth.net, dCur)}</div>` : ''}
        ` : '<div style="color:var(--mu);font-size:.72rem">Sin datos este mes</div>'}
      </div>
    </div>

    <!-- ROW 7: Metas + Próximas Deudas + Próximos Cobros -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">

      <!-- Progreso de Metas -->
      <div class="panel pp" style="padding:20px">
        <div class="sh-t" style="margin-bottom:14px">Progreso de Metas</div>
        ${goals.length === 0 ? `<div class="tbl-empty" style="padding:12px;font-size:.72rem">Sin metas activas</div>` :
          goals.slice(0, 5).map(goal => {
            const pct = goal.target > 0 ? Math.min(100, Math.round((parseFloat(goal.current || 0) / parseFloat(goal.target)) * 100)) : 0;
            return `<div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:4px">
                <span style="color:var(--cr);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%">${goal.name || 'Meta'}</span>
                <span style="color:var(--g2);font-family:var(--fm)">${pct}%</span>
              </div>
              <div style="height:4px;background:var(--bg5);border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--g),var(--g2));border-radius:4px;transition:width .4s"></div>
              </div>
            </div>`;
          }).join('')}
      </div>

      <!-- Próximas Deudas -->
      <div class="panel pp" style="padding:20px">
        <div class="sh-t" style="margin-bottom:14px">Próximas Deudas</div>
        ${proxDeudas.length === 0 ? `<div class="tbl-empty" style="padding:12px;font-size:.72rem">Sin deudas con vencimiento</div>` :
          proxDeudas.map(d => {
            const pend = Math.max(0, parseFloat(d.total || 0) - parseFloat(d.paid || 0));
            const dias = getDaysUntilDate(d.due);
            return `<div style="padding:8px 0;border-bottom:1px solid var(--bg5)">
              <div style="display:flex;justify-content:space-between;margin-bottom:2px">
                <span style="font-size:.72rem;color:var(--cr);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%">${d.creditor || d.description || 'Deuda'}</span>
                <span style="font-size:.72rem;font-family:var(--fm);color:#d47a7a">${fmt(pend, d.cur || '$')}</span>
              </div>
              <div style="font-size:.62rem;color:${dias <= 7 ? '#d47a7a' : dias <= 30 ? '#e8b124' : 'var(--mu)'}">
                ${dias <= 0 ? 'Vencida' : `En ${dias} día${dias === 1 ? '' : 's'}`} · ${fmtDate(d.due)}
              </div>
            </div>`;
          }).join('')}
      </div>

      <!-- Próximos Cobros -->
      <div class="panel pp" style="padding:20px">
        <div class="sh-t" style="margin-bottom:14px">Próximos Cobros</div>
        ${proxCobros.length === 0 ? `<div class="tbl-empty" style="padding:12px;font-size:.72rem">Sin cuentas a cobrar activas</div>` :
          proxCobros.map(r => {
            const pend = Math.max(0, parseFloat(r.total || 0) - parseFloat(r.paid || 0));
            return `<div style="padding:8px 0;border-bottom:1px solid var(--bg5)">
              <div style="display:flex;justify-content:space-between;margin-bottom:2px">
                <span style="font-size:.72rem;color:var(--cr);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%">${r.name || 'Cobro'}</span>
                <span style="font-size:.72rem;font-family:var(--fm);color:var(--pos)">${fmt(pend, r.cur || '$')}</span>
              </div>
              <div style="font-size:.62rem;color:var(--mu)">Pendiente de cobro</div>
            </div>`;
          }).join('')}
      </div>
    </div>

    <!-- ROW 8: Alertas de Saldos Bajos -->
    ${alertasCuentas.length > 0 ? `
    <div class="panel pp" style="padding:16px;border:1px solid rgba(232,177,36,.3);background:rgba(232,177,36,.05)">
      <div style="font-size:.72rem;font-weight:600;color:#e8b124;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">⚠ Alertas de Saldos Bajos</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${alertasCuentas.map(a => {
          const bal = getAccountBalance(a.id);
          return `<div style="display:flex;justify-content:space-between;font-size:.75rem">
            <span style="color:var(--cr)">${acctTypeIcon(a.type)} ${a.name}</span>
            <span style="font-family:var(--fm);color:${bal < 0 ? '#d47a7a' : '#e8b124'}">${fmt(bal, a.currency || '$')}</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

  </div>`;

  // Draw 7-day chart
  patDraw7d(today7Labels, days7, dCur);
}

// ──────────────────────────────────────────
// SUB-HELPERS FOR HTML GENERATION
// ──────────────────────────────────────────
function patRatioCard(label, value, color, sub) {
  return `<div class="panel pp" style="padding:16px">
    <div style="font-size:.62rem;color:var(--mu);margin-bottom:6px">${label}</div>
    <div style="font-size:1.3rem;font-weight:600;font-family:var(--fm);color:${color}">${value}</div>
    <div style="font-size:.6rem;color:var(--mu);margin-top:4px">${sub}</div>
  </div>`;
}

function patBarH(label, value, total, dCur, color) {
  const pct = total > 0 ? Math.min(100, Math.round(Math.abs(value) / Math.abs(total) * 100)) : 0;
  return `<div style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:5px">
      <span style="color:var(--cr)">${label}</span>
      <span style="font-family:var(--fm);color:${color}">${fmt(value, dCur)} <span style="color:var(--mu)">${pct}%</span></span>
    </div>
    <div style="height:6px;background:var(--bg5);border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width .5s"></div>
    </div>
  </div>`;
}

function patProjectionCard(months, current, avgGrowth, dCur) {
  const projected = current + avgGrowth * months;
  const diff = projected - current;
  const color = diff >= 0 ? 'var(--pos)' : '#d47a7a';
  return `<div class="panel pp" style="padding:16px;text-align:center">
    <div style="font-size:.62rem;color:var(--mu);margin-bottom:8px">En ${months} ${months === 1 ? 'mes' : 'meses'}</div>
    <div style="font-size:1.2rem;font-family:var(--fm);font-weight:600;color:var(--g2)">${fmt(projected, dCur)}</div>
    <div style="font-size:.7rem;color:${color};margin-top:4px">${diff >= 0 ? '+' : ''}${fmt(diff, dCur)}</div>
  </div>`;
}

// ──────────────────────────────────────────
// 7-DAY CHART
// ──────────────────────────────────────────
function patDraw7d(labels, data, dCur) {
  const canvas = document.getElementById('pat-chart-7d');
  if (!canvas) return;
  if (patrimonioChart7d) { patrimonioChart7d.destroy(); patrimonioChart7d = null; }
  const colors = data.map(v => v >= 0 ? 'rgba(201,160,12,.7)' : 'rgba(212,122,122,.7)');
  const style = getComputedStyle(document.body);
  const colorMU = style.getPropertyValue('--mu').trim() || 'rgba(0,0,0,0.5)';
  const colorBG5 = style.getPropertyValue('--bg5').trim() || 'rgba(0,0,0,0.1)';

  patrimonioChart7d = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 0,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => (ctx.raw >= 0 ? '+' : '') + fmt(ctx.raw, dCur)
          }
        }
      },
      scales: {
        x: { ticks: { color: colorMU, font: { size: 9 } }, grid: { display: false }, border: { display: false } },
        y: { ticks: { color: colorMU, font: { size: 9 }, callback: v => fmt(v, dCur) }, grid: { color: colorBG5 }, border: { display: false } }
      }
    }
  });
}
