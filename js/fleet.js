// CD & Co ERP — GESTIÓN DE FLOTA PREMIUM v2
// ====================================

let fleetCompChart = null;
let _cashFlowChart = null;

// ══════════════════════════════════════════
// FLEET KPIs (Glassmorphism cards)
// ══════════════════════════════════════════
function renderFleetKPIs(fleetData) {
  const kpiEl = g('fleet-kpis');
  if (!kpiEl) return;

  const vehicles = S.vehicles || [];
  const totalVehicles = vehicles.length;

  // Combustible total (todas las txs de tipo fuel)
  const FUEL_CATS = ['combustible', 'transporte', 'nafta', 'gasolina', 'gas', 'diésel', 'diesel'];
  const fuelTxsAll = (S.txs || []).filter(t => {
    if (t.type !== 'expense') return false;
    const cat = (t.cat || '').toLowerCase();
    const desc = (t.desc || '').toLowerCase();
    return FUEL_CATS.some(k => cat.includes(k) || desc.startsWith('combustible'));
  });
  const totalFuel = fuelTxsAll.reduce((s, t) => s + (t.amount || 0), 0);

  // Mantenimiento total (txs cat mantenimiento)
  const maintTxsAll = (S.txs || []).filter(t => {
    if (t.type !== 'expense') return false;
    const cat = (t.cat || '').toLowerCase();
    return cat.includes('mant') || cat.includes('reparac') || cat.includes('servic');
  });
  const totalMaint = maintTxsAll.reduce((s, t) => s + (t.amount || 0), 0);

  // C/km — vehículo principal (primer vehículo)
  let ckm = null;
  if (fleetData.length > 0) {
    const pv = fleetData[0];
    const totalKm = pv.totalKm || 0;
    const totalCostPrimary = pv.totalCost + (pv.maintCost || 0);
    if (totalKm > 0) ckm = totalCostPrimary / totalKm;
  }

  kpiEl.innerHTML = `
    <div class="fleet-kpi-card glass-kpi">
      <div class="fleet-kpi-icon">🚗</div>
      <div class="fleet-kpi-val">${totalVehicles}</div>
      <div class="fleet-kpi-lbl">Vehículos Registrados</div>
    </div>
    <div class="fleet-kpi-card glass-kpi">
      <div class="fleet-kpi-icon">⛽</div>
      <div class="fleet-kpi-val">${fmt(totalFuel, '₲')}</div>
      <div class="fleet-kpi-lbl">Gasto Total Combustible</div>
    </div>
    <div class="fleet-kpi-card glass-kpi">
      <div class="fleet-kpi-icon">🔧</div>
      <div class="fleet-kpi-val">${fmt(totalMaint, '₲')}</div>
      <div class="fleet-kpi-lbl">Mantenimiento Acumulado</div>
      ${ckm ? `<div class="fleet-kpi-sub">C/km: ₲ ${Math.round(ckm).toLocaleString()}</div>` : ''}
    </div>
  `;
}

// ══════════════════════════════════════════
// MAINTENANCE ALERT
// ══════════════════════════════════════════
function checkMaintenanceAlert() {
  const el = g('fleet-maint-alert');
  if (!el) return;

  const maintTxs = (S.txs || []).filter(t => {
    const cat = (t.cat || '').toLowerCase();
    return cat.includes('mant') || cat.includes('reparac') || cat.includes('servic');
  });

  if (maintTxs.length === 0) {
    el.innerHTML = `<div class="fleet-alert-banner">⚠️ <strong>Sin registros de mantenimiento.</strong> Registrá el primer servicio para activar el historial preventivo.</div>`;
    el.style.display = 'block';
    return;
  }

  const lastMaint = maintTxs
    .map(t => new Date(t.date))
    .sort((a, b) => b - a)[0];

  const daysSince = Math.floor((Date.now() - lastMaint.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSince > 180) {
    const lastStr = lastMaint.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });
    el.innerHTML = `<div class="fleet-alert-banner">🔔 <strong>Mantenimiento preventivo requerido.</strong> Último registro: ${lastStr} (hace ${daysSince} días). Se recomienda revisión.</div>`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// ══════════════════════════════════════════
// RENDER FLEET MAIN
// ══════════════════════════════════════════
function renderFleet() {
  if (S.curPage !== 'fleet') return;

  const grid = g('fleet-grid');
  if (!grid) return;

  const vehicles = S.vehicles || [];

  if (vehicles.length === 0) {
    g('fleet-kpis') && (g('fleet-kpis').innerHTML = '');
    grid.innerHTML = '<div class="tbl-empty" style="grid-column:1/-1;padding:30px">No hay vehículos en la flota. Se configurarán automáticamente.</div>';
    return;
  }

  // Calculate metrics per vehicle
  let fleetData = [];
  const now = new Date();

  // Prepare last 6 months labels
  let monthLabels = [];
  for (let i = 5; i >= 0; i--) {
    let d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthLabels.push(d.toLocaleDateString('es-ES', { month: 'short' }));
  }

  const isPrimaryVehicle = (v) => vehicles.indexOf(v) === 0;
  const FUEL_CATS = ['combustible', 'transporte', 'nafta', 'gasolina', 'gas', 'diésel', 'diesel'];
  const MAINT_CATS = ['mant', 'reparac', 'servic'];

  vehicles.forEach(v => {
    // Fuel transactions
    const fuelTxs = (S.txs || []).filter(t => {
      if (t.type !== 'expense') return false;
      const cat = (t.cat || '').toLowerCase();
      const desc = (t.desc || '').toLowerCase();
      const isFuel = FUEL_CATS.some(k => cat.includes(k) || desc.startsWith('combustible'));
      if (!isFuel) return false;
      if (t._sale_id === v.id) return true;
      if (!t._sale_id && isPrimaryVehicle(v)) return true;
      return false;
    });

    // Maintenance transactions (attributed to primary vehicle)
    const maintTxs = (S.txs || []).filter(t => {
      if (t.type !== 'expense') return false;
      const cat = (t.cat || '').toLowerCase();
      const isMaint = MAINT_CATS.some(k => cat.includes(k));
      if (!isMaint) return false;
      if (t._sale_id === v.id) return true;
      if (!t._sale_id && isPrimaryVehicle(v)) return true;
      return false;
    });

    // Group by month
    let monthlyCost = [0,0,0,0,0,0];
    let totalCost = 0;
    let totalKm = 0;

    fuelTxs.forEach(tx => {
      totalCost += tx.amount || 0;
      let d = new Date(tx.date);
      let diffMonths = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
      if (diffMonths >= 0 && diffMonths < 6) {
        monthlyCost[5 - diffMonths] += tx.amount || 0;
      }
      // Extract km from desc "Combustible | Lts: X | Km: Y"
      const km = parseFloat((tx.desc || '').match(/Km:\s*([\d.]+)/)?.[1] || 0);
      totalKm += km;
    });

    const maintCost = maintTxs.reduce((s, t) => s + (t.amount || 0), 0);
    const ckm = totalKm > 0 ? (totalCost + maintCost) / totalKm : null;

    fleetData.push({
      ...v,
      totalCost,
      monthlyCost,
      txCount: fuelTxs.length,
      totalKm,
      maintCost,
      ckm
    });
  });

  // Render KPIs
  renderFleetKPIs(fleetData);

  // Check maintenance alert
  checkMaintenanceAlert();

  // Render vehicle cards
  grid.innerHTML = fleetData.map(v => `
    <div class="panel pp" style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:2.2rem;background:var(--bg3);width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:14px;border:1px solid var(--bg5)">${v.icon || '🚗'}</div>
        <div>
          <div style="font-weight:600;color:var(--cr);font-size:1.1rem">${v.name}</div>
          <div style="font-size:.75rem;color:var(--mu)">Acumulado: <span style="font-family:var(--fm);color:#d47a7a">${fmt(v.totalCost, '₲')}</span></div>
        </div>
      </div>
      ${v.ckm ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div style="background:var(--bg3);border:1px solid var(--bg5);border-radius:10px;padding:8px 14px;flex:1;min-width:110px">
          <div style="font-size:.6rem;color:var(--mu);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">C/km</div>
          <div style="font-family:var(--fm);font-weight:600;color:var(--g2);font-size:.9rem">₲ ${Math.round(v.ckm).toLocaleString()}</div>
        </div>
        <div style="background:var(--bg3);border:1px solid var(--bg5);border-radius:10px;padding:8px 14px;flex:1;min-width:110px">
          <div style="font-size:.6rem;color:var(--mu);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Km. Registrados</div>
          <div style="font-family:var(--fm);font-weight:600;color:var(--cr);font-size:.9rem">${Math.round(v.totalKm).toLocaleString()} km</div>
        </div>
      </div>
      ` : ''}
      <div style="font-size:.7rem;color:var(--m3);text-transform:uppercase;letter-spacing:1px;margin-top:4px">Consumo últimos 6 meses</div>
      <div style="height:110px;width:100%;position:relative;margin-top:2px">
        <canvas id="chart-vh-${v.id}"></canvas>
      </div>
    </div>
  `).join('');

  // Render comparative chart
  renderFleetCompChart(fleetData, monthLabels);

  // Render individual charts
  fleetData.forEach(v => {
    let ctx = document.getElementById(`chart-vh-${v.id}`);
    if (ctx) {
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [{
            data: v.monthlyCost,
            backgroundColor: 'rgba(212, 122, 122, 0.7)',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: true, grid: { display: false }, ticks: { font: { size: 10 } } },
            y: { display: false, grid: { display: false } }
          }
        }
      });
    }
  });
}

function renderFleetCompChart(fleetData, monthLabels) {
  let ctx = g('fleet-comp-chart');
  if (!ctx) return;

  if (fleetCompChart) {
    fleetCompChart.destroy();
  }

  const chartColors = ['#c1c1ff', '#4edea3', '#f6c23e', '#e74a3b', '#36b9cc'];

  let datasets = fleetData.map((v, i) => ({
    label: v.name,
    data: v.monthlyCost,
    borderColor: chartColors[i % chartColors.length],
    backgroundColor: chartColors[i % chartColors.length] + '20',
    borderWidth: 2,
    tension: 0.3,
    fill: true
  }));

  fleetCompChart = new Chart(ctx, {
    type: 'line',
    data: { labels: monthLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: 'var(--mu)', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.label + ': ₲ ' + ctx.parsed.y.toLocaleString()
          }
        }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: 'var(--mu)', font: { size: 10 } } },
        x: { grid: { display: false }, ticks: { color: 'var(--mu)', font: { size: 10 } } }
      }
    }
  });
}

// ══════════════════════════════════════════
// FUEL MODAL
// ══════════════════════════════════════════
function openFuelModal() {
  const vSel = g('fuel-vehicle-selector');
  const vehicles = S.vehicles || [];

  if (vSel) {
    vSel.innerHTML = vehicles.map(v => `
      <div class="v-btn" id="v-btn-${v.id}" onclick="selectFuelVehicle('${v.id}')" style="display:flex;flex-direction:column;align-items:center;padding:12px;background:var(--bg3);border:2px solid var(--bg5);border-radius:12px;cursor:pointer;min-width:88px;transition:all 0.2s;user-select:none;">
        <span style="font-size:1.8rem;margin-bottom:6px">${v.icon || '🚗'}</span>
        <span style="font-size:.7rem;color:var(--cr);text-align:center;font-weight:500;white-space:nowrap">${v.name}</span>
      </div>
    `).join('');
  }

  if (vehicles.length > 0) selectFuelVehicle(vehicles[0].id);

  const accSel = g('fuel-acc');
  if (accSel) {
    accSel.innerHTML = '<option value="">Efectivo / Caja Fija</option>';
    const list = (S.accounts || []).concat(S.cards || []);
    if (list.length > 0) accSel.innerHTML += list.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  }

  g('fuel-date').value = typeof today === 'function' ? today() : new Date().toISOString().split('T')[0];
  g('fuel-amt').value = '';
  g('fuel-lts').value = '';
  g('fuel-km').value  = '';
  g('fuel-modal').style.display = 'flex';
}

function selectFuelVehicle(id) {
  g('fuel-vehicle-id').value = id;
  (S.vehicles || []).forEach(v => {
    let btn = g(`v-btn-${v.id}`);
    if (btn) {
      btn.style.borderColor = v.id === id ? 'var(--pos)' : 'var(--bg5)';
      btn.style.background  = v.id === id ? 'var(--pb)'  : 'var(--bg3)';
    }
  });
}

function saveFuelLog() {
  const vId  = g('fuel-vehicle-id').value;
  const amt  = parseFloat(g('fuel-amt').value);
  const accId = g('fuel-acc').value;
  const lts  = parseFloat(g('fuel-lts').value);
  const km   = parseFloat(g('fuel-km').value);
  const date = g('fuel-date').value;

  if (!vId)              { toast('Selecciona un vehículo'); return; }
  if (isNaN(amt)||amt<=0){ toast('Ingresá un monto válido'); return; }
  if (!date)             { toast('Seleccioná una fecha'); return; }

  let desc = 'Combustible';
  let details = [];
  if (!isNaN(lts) && lts > 0) details.push(`Lts: ${lts}`);
  if (!isNaN(km)  && km  > 0) details.push(`Km: ${km}`);
  if (details.length > 0) desc += ` | ${details.join(' | ')}`;

  const tx = {
    id: typeof uid === 'function' ? uid() : 'tx_' + Math.random().toString(36).substr(2, 9),
    type: 'expense',
    desc,
    amount: amt,
    cur: '₲',
    cat: 'Combustible',
    date,
    _sale_id: vId
  };
  if (accId) tx.account_id = accId;

  if (!S.txs) S.txs = [];
  S.txs.push(tx);

  if (typeof lsave === 'function') lsave();
  toast('✅ Carga de combustible registrada');
  cm('fuel-modal');
  if (typeof checkBudgetAlerts === 'function') checkBudgetAlerts();
  if (typeof renderAll === 'function') renderAll();
}
