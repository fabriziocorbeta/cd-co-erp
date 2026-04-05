// CD & Co ERP — GESTIÓN DE FLOTA PREMIUM
// ====================================

let fleetCompChart = null;

function renderFleet() {
  if (S.curPage !== 'fleet') return;

  const grid = g('fleet-grid');
  if (!grid) return;

  const vehicles = S.vehicles || [];

  if (vehicles.length === 0) {
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
  const FUEL_CATS = ['combustible', 'transporte', 'nafta', 'gasolina', 'gas', 'diésel'];

  vehicles.forEach(v => {
    // Find matching transactions: expense with fuel category linked to this vehicle.
    // Unlinked fuel transactions (no _sale_id) are attributed to the primary vehicle.
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
    
    // Group by month
    let monthlyCost = [0,0,0,0,0,0];
    let totalCost = 0;
    
    fuelTxs.forEach(tx => {
      totalCost += tx.amount || 0;
      let d = new Date(tx.date);
      let diffMonths = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
      if (diffMonths >= 0 && diffMonths < 6) {
        monthlyCost[5 - diffMonths] += tx.amount || 0;
      }
    });

    fleetData.push({
      ...v,
      totalCost,
      monthlyCost,
      txCount: fuelTxs.length
    });
  });

  // Render cards
  grid.innerHTML = fleetData.map(v => `
    <div class="panel pp" style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:2.2rem;background:var(--bg3);width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:14px;border:1px solid var(--bg5)">${v.icon}</div>
        <div>
          <div style="font-weight:600;color:var(--cr);font-size:1.1rem">${v.name}</div>
          <div style="font-size:.75rem;color:var(--mu)">Acumulado histórico: <span style="font-family:var(--fm);color:#d47a7a">${fmt(v.totalCost, '₲')}</span></div>
        </div>
      </div>
      <div style="font-size:.7rem;color:var(--m3);text-transform:uppercase;letter-spacing:1px;margin-top:12px">Salud de Consumo (6 Meses)</div>
      <div style="height:110px;width:100%;position:relative;margin-top:4px">
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

  const chartColors = ['#4a7ab5', '#1cc88a', '#f6c23e', '#e74a3b', '#36b9cc'];

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
    data: {
      labels: monthLabels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: 'var(--mu)', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ₲ ' + context.parsed.y.toLocaleString();
            }
          }
        }
      },
      scales: {
        y: { 
          beginAtZero: true, 
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: 'var(--mu)', font: { size: 10 } }
        },
        x: { 
          grid: { display: false },
          ticks: { color: 'var(--mu)', font: { size: 10 } }
        }
      }
    }
  });
}

// ══════════════════════════════════════════
// FUEL MODAL (MOBILE OPTIMIZED)
// ══════════════════════════════════════════

function openFuelModal() {
  const vSel = g('fuel-vehicle-selector');
  const vehicles = S.vehicles || [];

  if (vSel) {
    vSel.innerHTML = vehicles.map(v => `
      <div class="v-btn" id="v-btn-${v.id}" onclick="selectFuelVehicle('${v.id}')" style="display:flex;flex-direction:column;align-items:center;padding:12px;background:var(--bg3);border:2px solid var(--bg5);border-radius:12px;cursor:pointer;min-width:88px;transition:all 0.2s;user-select:none;">
        <span style="font-size:1.8rem;margin-bottom:6px">${v.icon}</span>
        <span style="font-size:.7rem;color:var(--cr);text-align:center;font-weight:500;white-space:nowrap">${v.name}</span>
      </div>
    `).join('');
  }

  // Default select first vehicle
  if (vehicles.length > 0) {
    selectFuelVehicle(vehicles[0].id);
  }

  // Populate accounts
  const accSel = g('fuel-acc');
  if (accSel) {
    accSel.innerHTML = '<option value="">Efectivo / Caja Fija</option>';
    const list = (S.accounts || []).concat(S.cards || []);
    if (list.length > 0) {
       accSel.innerHTML += list.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    }
  }

  g('fuel-date').value = typeof today === 'function' ? today() : new Date().toISOString().split('T')[0];
  g('fuel-amt').value = '';
  g('fuel-lts').value = '';
  g('fuel-km').value = '';

  g('fuel-modal').style.display = 'flex';
}

function selectFuelVehicle(id) {
  g('fuel-vehicle-id').value = id;
  const vehicles = S.vehicles || [];
  vehicles.forEach(v => {
    let btn = g(`v-btn-${v.id}`);
    if (btn) {
      if (v.id === id) {
        btn.style.borderColor = 'var(--pos)';
        btn.style.background = 'var(--pb)';
      } else {
        btn.style.borderColor = 'var(--bg5)';
        btn.style.background = 'var(--bg3)';
      }
    }
  });
}

function saveFuelLog() {
  const vId = g('fuel-vehicle-id').value;
  const amt = parseFloat(g('fuel-amt').value);
  const accId = g('fuel-acc').value;
  const lts = parseFloat(g('fuel-lts').value);
  const km = parseFloat(g('fuel-km').value);
  const date = g('fuel-date').value;

  if (!vId) { toast('Selecciona un vehículo'); return; }
  if (isNaN(amt) || amt <= 0) { toast('Ingresa un monto válido'); return; }
  if (!date) { toast('Selecciona una fecha'); return; }

  let desc = 'Combustible';
  let details = [];
  if (!isNaN(lts) && lts > 0) details.push(`Lts: ${lts}`);
  if (!isNaN(km) && km > 0) details.push(`Km: ${km}`);
  if (details.length > 0) desc += ` | ${details.join(' | ')}`;

  const tx = {
    id: typeof uid === 'function' ? uid() : 'tx_' + Math.random().toString(36).substr(2, 9),
    type: 'expense',
    desc: desc,
    amount: amt,
    cur: '₲', // Assuming default local currency for simplicity
    cat: 'Combustible', // Matches standard expense category
    date: date,
    _sale_id: vId // Leveraging _sale_id to link the expense to the specific vehicle natively!
  };
  
  if (accId) tx.account_id = accId;

  if (!S.txs) S.txs = [];
  S.txs.push(tx);
  
  // Save locally and queue sync
  if (typeof lsave === 'function') lsave();
  
  toast('✅ Carga de Combustible Registrada');
  cm('fuel-modal');
  
  if (typeof checkBudgetAlerts === 'function') checkBudgetAlerts();

  if (typeof renderAll === 'function') {
    renderAll();
  }
}
