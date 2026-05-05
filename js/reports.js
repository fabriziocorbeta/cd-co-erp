// CD & Co ERP — REPORTS MODULE
// ====================================

let repCharts = {
  patrimonio: null,
  flow: null,
  cats: null
};

// ══════════════════════════════════════════
// MONTH PICKER HELPERS
// ══════════════════════════════════════════

// Returns selected month as "YYYY-MM", defaults to current month
function getRepMonth() {
  const el = g('rep-month-picker');
  if (el && el.value) return el.value;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}

// Initialize the picker to current month on page load
function initRepMonthPicker() {
  const el = g('rep-month-picker');
  if (!el || el.value) return;
  el.value = getRepMonth();
}

// Called when user changes the month picker
function onRepMonthChange() {
  // Re-render whichever view is currently active
  const activeView = document.querySelector('.rep-view.active');
  if (!activeView) return;
  const type = activeView.id.replace('rep-view-', '');
  if (type === 'patrimonio') renderReportPatrimonio();
  if (type === 'flow')       renderReportFlow();
  if (type === 'categories') renderReportCategories();
  if (type === 'fixed')      renderReportFixedExpenses();
}

// ══════════════════════════════════════════
// NAVIGATION LOGIC
// ══════════════════════════════════════════

function switchReport(type, btn) {
  initRepMonthPicker();

  document.querySelectorAll('.rep-btn').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');

  document.getElementById('rep-empty-state').style.display = 'none';
  document.querySelectorAll('.rep-view').forEach(v => v.classList.remove('active'));

  const view = document.getElementById(`rep-view-${type}`);
  if(view) view.classList.add('active');

  if(type === 'patrimonio') renderReportPatrimonio();
  if(type === 'flow')       renderReportFlow();
  if(type === 'categories') renderReportCategories();
  if(type === 'fixed')      renderReportFixedExpenses();
}

// ══════════════════════════════════════════
// 1. MI PATRIMONIO NETO (Line Chart)
// ══════════════════════════════════════════
function renderReportPatrimonio() {
  const ctx = document.getElementById('rep-chart-patrimonio');
  if(!ctx || !window.Chart) return;

  if(repCharts.patrimonio) repCharts.patrimonio.destroy();

  // Filter income + expense, sort ascending — no amount>0 filter (expenses stored as negative)
  const txs = [...S.txs].filter(t => t.type === 'income' || t.type === 'expense').sort((a,b) => new Date(a.date) - new Date(b.date));
  let runningBalance = 0;
  let monthlyData = {};

  txs.forEach(t => {
    const d = new Date(t.date);
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const amt = parseFloat(t.amount) || 0;
    // Amounts: income=positive, expense=negative (signed). Use Math.abs with type to handle both conventions.
    if(t.type === 'income') runningBalance += Math.abs(amt);
    else runningBalance -= Math.abs(amt);
    monthlyData[ym] = runningBalance;
  });

  const labels = Object.keys(monthlyData).sort();
  const data = labels.map(l => monthlyData[l]);

  // Highlight selected month
  const selMo = getRepMonth();
  const pointColors = labels.map(l => l === selMo ? '#fff' : '#e8b124');
  const pointRadii  = labels.map(l => l === selMo ? 7 : 4);

  repCharts.patrimonio = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Patrimonio Neto',
        data: data,
        borderColor: '#e8b124',
        backgroundColor: 'rgba(232, 177, 36, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 3,
        pointRadius: pointRadii,
        pointBackgroundColor: pointColors
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8a8278' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8a8278', callback: v => fmt(v) } }
      }
    }
  });
}

// ══════════════════════════════════════════
// 2. INGRESOS VS GASTOS (Bar Chart)
// ══════════════════════════════════════════
function renderReportFlow() {
  const ctx = document.getElementById('rep-chart-flow');
  if(!ctx || !window.Chart) return;

  if(repCharts.flow) repCharts.flow.destroy();

  const dCur = patDomCur();
  const selMo = getRepMonth(); // selected month as "YYYY-MM"

  // Build 6-month window centred around selected month
  const [selY, selM] = selMo.split('-').map(Number);
  const months = [];
  for (let i = -5; i <= 0; i++) {
    let m = selM + i, y = selY;
    if (m <= 0) { m += 12; y--; }
    months.push(`${y}-${String(m).padStart(2,'0')}`);
  }

  const flow6 = months.map(ym => {
    const txs = S.txs.filter(t => mkey(t.date) === ym);
    const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(patToDom(t.amount, t.cur || '$', dCur)), 0);
    const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(patToDom(t.amount, t.cur || '$', dCur)), 0);
    return { key: ym, inc, exp };
  });

  const borderColors = flow6.map(m => m.key === selMo ? 'rgba(255,255,255,0.6)' : 'transparent');

  repCharts.flow = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: flow6.map(m => m.key),
      datasets: [
        {
          label: 'Ingresos',
          data: flow6.map(m => m.inc),
          backgroundColor: flow6.map(m => m.key === selMo ? 'rgba(74,155,111,1)' : 'rgba(74,155,111,0.55)'),
          borderRadius: 6
        },
        {
          label: 'Gastos',
          data: flow6.map(m => m.exp),
          backgroundColor: flow6.map(m => m.key === selMo ? 'rgba(155,74,74,1)' : 'rgba(155,74,74,0.55)'),
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { color: '#e8e0d4' } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8a8278' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8a8278', callback: v => fmt(v, dCur) } }
      }
    }
  });
}

// ══════════════════════════════════════════
// 3. RESUMEN DE CATEGORÍAS (Doughnut Chart)
// ══════════════════════════════════════════
function renderReportCategories() {
  const ctx = document.getElementById('rep-chart-cats');
  const legend = document.getElementById('rep-cats-legend');
  if(!ctx || !window.Chart) return;

  if(repCharts.cats) repCharts.cats.destroy();

  const dCur = patDomCur();
  const selMo = getRepMonth(); // ← uses picker instead of always thisMo()
  const expTxs = S.txs.filter(t => t.type === 'expense' && mkey(t.date) === selMo);

  const cats = {};
  let total = 0;
  expTxs.forEach(t => {
    const amt = Math.abs(patToDom(t.amount, t.cur || '$', dCur)); // expenses may be negative — use abs
    cats[t.cat] = (cats[t.cat] || 0) + amt;
    total += amt;
  });

  let sorted = Object.entries(cats).sort((a,b) => b[1] - a[1]);

  if (sorted.length > 7) {
    const top = sorted.slice(0, 7);
    const otherSum = sorted.slice(7).reduce((a, c) => a + c[1], 0);
    top.push(['Otras / Varios', otherSum]);
    sorted = top;
  }

  const labels = sorted.map(s => s[0]);
  const data = sorted.map(s => s[1]);
  const colors = ['#e8b124', '#4a9b6f', '#4a7ab5', '#7a5ab5', '#9b4a4a', '#c9960c', '#36b9cc', '#858796'];

  legend.innerHTML = sorted.map((c, i) => {
    const pct = total > 0 ? ((c[1]/total)*100).toFixed(1) : 0;
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--bg5); padding: 8px 0">
        <div style="display:flex; align-items:center; gap:10px">
          <div style="width:12px; height:12px; border-radius:3px; background:${colors[i % colors.length]}"></div>
          <span style="font-size:0.85rem">${c[0]}</span>
        </div>
        <div style="text-align:right">
          <div style="font-family:var(--fm); font-size:0.85rem">${fmt(c[1], dCur)}</div>
          <div style="font-size:0.65rem; color:var(--mu)">${pct}%</div>
        </div>
      </div>
    `;
  }).join('');

  if(sorted.length === 0) legend.innerHTML = `<div class="rep-empty">No hay gastos en ${selMo}.</div>`;

  repCharts.cats = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '70%',
      plugins: { legend: { display: false } }
    }
  });
}

// ══════════════════════════════════════════
// 4. GASTOS FIJOS MENSUALES (Table)
// ══════════════════════════════════════════
function renderReportFixedExpenses() {
  const tbody = document.getElementById('rep-fixed-tbody');
  const summary = document.getElementById('rep-fixed-summary');
  if(!tbody) return;

  const dCur = patDomCur();
  let totalSubs = 0;
  let totalDebts = 0;

  const subs = (S.subscriptions || []).map(s => {
    const amt = patToDom(s.amount, s.cur || '$', dCur);
    totalSubs += amt;
    return { name: s.name, icon: s.icon || '🔄', type: 'Suscripción', amount: amt, due: s.nextBilling || '—' };
  });

  const debts = (S.debts || []).filter(d => {
     const pending = parseFloat(d.total || 0) - parseFloat(d.paid || 0);
     return pending > 0;
  }).map(d => {
    let instAmt = 0;
    const instCount = parseInt(d.installments || 1);
    const paidCount = parseInt(d.paidInstallments || 0);
    const remaining = parseFloat(d.total || 0) - parseFloat(d.paid || 0);
    if(instCount > 0 && paidCount < instCount) instAmt = remaining / (instCount - paidCount);
    else instAmt = remaining;
    const amt = patToDom(instAmt, d.cur || '$', dCur);
    totalDebts += amt;
    return { name: d.creditor || d.description, icon: '💳', type: 'Cuota de Deuda', amount: amt, due: d.dueDate || 'En el mes' };
  });

  const all = [...subs, ...debts].sort((a,b) => b.amount - a.amount);

  summary.innerHTML = `
    <div class="panel" style="background:var(--bg3); padding:16px; border-radius:12px; border:1px solid var(--bg5)">
      <div style="font-size:0.65rem; color:var(--mu); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px">Total Suscripciones</div>
      <div style="font-size:1.3rem; font-family:var(--fm); color:var(--pos)">${fmt(totalSubs, dCur)}</div>
    </div>
    <div class="panel" style="background:var(--bg3); padding:16px; border-radius:12px; border:1px solid var(--bg5)">
      <div style="font-size:0.65rem; color:var(--mu); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px">Cuotas de Deuda</div>
      <div style="font-size:1.3rem; font-family:var(--fm); color:#d47a7a">${fmt(totalDebts, dCur)}</div>
    </div>
  `;

  tbody.innerHTML = all.map(x => `
    <tr>
      <td><div style="display:flex; align-items:center; gap:8px"><span>${x.icon}</span> <strong>${x.name}</strong></div></td>
      <td><span class="pill pill-neu" style="font-size:0.6rem">${x.type}</span></td>
      <td style="font-size:0.75rem; color:var(--mu)">${x.due}</td>
      <td style="text-align:right; font-family:var(--fm); font-weight:600">${fmt(x.amount, dCur)}</td>
    </tr>
  `).join('');

  if(all.length === 0) tbody.innerHTML = '<tr><td colspan="4" class="tbl-empty">No se encontraron gastos fijos para este mes.</td></tr>';
}

// ══════════════════════════════════════════
// MONTHLY PDF REPORT GENERATOR
// ══════════════════════════════════════════
function generatePdfReport() {
  initRepMonthPicker();
  const pa = g('print-area');
  if(!pa) return;

  const tX = S.txs || [];
  const selMo = getRepMonth(); // ← uses month picker
  const [selYr, selMNum] = selMo.split('-').map(Number);
  const mc = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const moLabel = `${mc[selMNum - 1]} ${selYr}`;

  const fxRate = (typeof FX !== 'undefined' && FX.buy) ? FX.buy : 7200;

  let mIncUSD = 0, mIncGS = 0;
  let mExpUSD = 0, mExpGS = 0;
  const expCategories = {};
  const incCategories = {};

  // Fuel logs for selected month
  const fuelTotal = (S.fuelLogs || []).filter(fl => mkey(fl.date) === selMo)
    .reduce((s, fl) => s + parseFloat(fl.cost || 0), 0);

  // Sales & Orders for selected month
  const salesTotal = (S.sales || []).filter(sa => mkey(sa.date) === selMo)
    .reduce((s, sa) => s + parseFloat(sa.total || 0), 0);
  const ordersTotal = (S.orders || []).filter(od => mkey(od.date) === selMo)
    .reduce((s, od) => s + parseFloat(od.total || 0), 0);

  tX.forEach(t => {
    const isAdj = (t.desc||'').toLowerCase().includes('ajuste') || (t.cat||'').toLowerCase().includes('ajuste') || (t.cat === 'Otros Ingresos' && t.amount > 500000);
    if(mkey(t.date) === selMo && !isAdj) {
      const isGS = t.cur === '₲';
      const amtUSD = isGS ? t.amount / fxRate : t.amount;
      const amtGS  = isGS ? t.amount : t.amount * fxRate;

      if(t.type === 'income') {
        mIncUSD += amtUSD; mIncGS += amtGS;
        const c = t.cat || 'Otros';
        if(!incCategories[c]) incCategories[c] = { usd: 0, gs: 0 };
        incCategories[c].usd += amtUSD; incCategories[c].gs += amtGS;
      }
      if(t.type === 'expense') {
        mExpUSD += amtUSD; mExpGS += amtGS;
        const c = t.cat || 'Otros';
        if(!expCategories[c]) expCategories[c] = { usd: 0, gs: 0 };
        expCategories[c].usd += amtUSD; expCategories[c].gs += amtGS;
      }
    }
  });

  const mBalUSD = mIncUSD - mExpUSD;
  const mBalGS  = mIncGS  - mExpGS;

  const expRows = Object.keys(expCategories).sort((a,b) => expCategories[b].usd - expCategories[a].usd).map(k => {
    const pct = mExpUSD > 0 ? (expCategories[k].usd/mExpUSD*100).toFixed(1) : 0;
    return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${k}</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee"><div style="font-weight:bold;font-size:11px">${fmt(expCategories[k].gs,'₲')}</div><div style="color:#666;font-size:9px">${fmt(expCategories[k].usd,'$')}</div></td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee">${pct}%</td></tr>`;
  }).join('');

  const incRows = Object.keys(incCategories).sort((a,b) => incCategories[b].usd - incCategories[a].usd).map(k => {
    const pct = mIncUSD > 0 ? (incCategories[k].usd/mIncUSD*100).toFixed(1) : 0;
    return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${k}</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee"><div style="font-weight:bold;font-size:11px">${fmt(incCategories[k].gs,'₲')}</div><div style="color:#666;font-size:9px">${fmt(incCategories[k].usd,'$')}</div></td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee">${pct}%</td></tr>`;
  }).join('');

  const fuelRow = fuelTotal > 0
    ? `<div style="margin-top:16px;padding:10px;background:#f8f9fa;border-radius:8px;border:1px solid #eee"><div style="font-size:10px;color:#666;text-transform:uppercase;margin-bottom:4px">⛽ Gasto Flota (Combustible)</div><div style="font-size:14px;font-weight:bold">${fmt(fuelTotal,'₲')}</div></div>`
    : '';

  const salesRow = salesTotal > 0
    ? `<div style="margin-top:16px;padding:10px;background:#f8f9fa;border-radius:8px;border:1px solid #eee"><div style="font-size:10px;color:#666;text-transform:uppercase;margin-bottom:4px">🛒 Ventas</div><div style="font-size:14px;font-weight:bold">${fmt(salesTotal,'₲')}</div></div>`
    : '';

  const ordersRow = ordersTotal > 0
    ? `<div style="margin-top:16px;padding:10px;background:#f8f9fa;border-radius:8px;border:1px solid #eee"><div style="font-size:10px;color:#666;text-transform:uppercase;margin-bottom:4px">📦 Compras</div><div style="font-size:14px;font-weight:bold">${fmt(ordersTotal,'₲')}</div></div>`
    : '';

  const html = `
    <div style="font-family:sans-serif;color:#000;padding:40px;max-width:800px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:15px">
        <div><h1 style="margin:0;font-size:20px">${EMPRESA.razonSocial || EMPRESA.nombre || 'Mi Empresa'}</h1><div style="font-size:11px;color:#555">RUC: ${EMPRESA.ruc || '-'} | Tel: ${EMPRESA.telefono || '-'}</div></div>
        <div style="text-align:right"><h2 style="margin:0;font-size:16px">Reporte Mensual</h2><div style="font-size:13px;font-weight:bold">${moLabel}</div></div>
      </div>
      <div style="display:flex;gap:15px;margin-bottom:20px">
        <div style="flex:1;background:#f8f9fa;padding:10px;border-radius:8px;border:1px solid #eee">
          <div style="font-size:10px;color:#666;text-transform:uppercase;margin-bottom:4px">Ingresos</div>
          <div style="font-size:16px;font-weight:bold">${fmt(mIncGS,'₲')}</div>
          <div style="font-size:12px;color:#555">${fmt(mIncUSD,'$')}</div>
        </div>
        <div style="flex:1;background:#f8f9fa;padding:10px;border-radius:8px;border:1px solid #eee">
          <div style="font-size:10px;color:#666;text-transform:uppercase;margin-bottom:4px">Gastos</div>
          <div style="font-size:16px;font-weight:bold">${fmt(mExpGS,'₲')}</div>
          <div style="font-size:12px;color:#555">${fmt(mExpUSD,'$')}</div>
        </div>
        <div style="flex:1;background:#f8f9fa;padding:10px;border-radius:8px;border:1px solid ${mBalUSD>=0?'#4a9b6f':'#c94a4a'}">
          <div style="font-size:10px;color:#666;text-transform:uppercase;margin-bottom:4px">Balance</div>
          <div style="font-size:16px;font-weight:bold;color:${mBalUSD>=0?'#4a9b6f':'#c94a4a'}">${fmt(mBalGS,'₲')}</div>
          <div style="font-size:12px;color:${mBalUSD>=0?'#4a9b6f':'#c94a4a'};opacity:0.8">${fmt(mBalUSD,'$')}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;">
        ${fuelRow}
        ${salesRow}
        ${ordersRow}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px">
        ${expRows ? `<div><h3 style="border-bottom:1px solid #333;font-size:14px;margin-bottom:10px">Egresos por Categoría</h3><table style="width:100%;border-collapse:collapse">${expRows}</table></div>` : ''}
        ${incRows ? `<div><h3 style="border-bottom:1px solid #333;font-size:14px;margin-bottom:10px">Ingresos por Categoría</h3><table style="width:100%;border-collapse:collapse">${incRows}</table></div>` : ''}
      </div>
    </div>
  `;

  pa.innerHTML = html;
  document.body.classList.add('printing-report');
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove('printing-report'), 1000);
  }, 500);
}

// Ensure the default empty state is shown when entering the page
if(typeof goPage === 'function' && !window.reportsGoPagePatched) {
  window.reportsGoPagePatched = true;
  const origGoPage = goPage;
  window.goPage = function(p) {
    origGoPage(p);
    if(p === 'reports') {
      initRepMonthPicker();
      document.querySelectorAll('.rep-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('rep-empty-state').style.display = 'flex';
      document.querySelectorAll('.rep-view').forEach(v => v.classList.remove('active'));
    }
  };
}
