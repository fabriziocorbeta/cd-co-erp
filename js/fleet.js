// CD & Co ERP — GESTIÓN DE FLOTA PREMIUM v2
// Datos 100% reales desde Supabase (vehicles + fuel_logs + txs)
// ====================================

let fleetCompChart = null;

// ── Nombre legible del vehículo ──────────────────────────────────────────────
function vehicleLabel(v) {
  if (v.nickname) return v.nickname;
  const parts = [v.brand, v.model, v.year].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Vehículo';
}

// ── Ícono según engine_type ──────────────────────────────────────────────────
function vehicleIcon(v) {
  const et = (v.engine_type || '').toLowerCase();
  if (et.includes('moto') || et.includes('bike')) return '🏍️';
  if (et.includes('truck') || et.includes('camion')) return '🚚';
  if (et.includes('electric')) return '⚡';
  return '🚗';
}

// ══════════════════════════════════════════
// FLEET KPIs (Glassmorphism cards)
// ══════════════════════════════════════════
function renderFleetKPIs(fleetData) {
  const kpiEl = g('fleet-kpis');
  if (!kpiEl) return;

  const totalVehicles = (S.vehicles || []).length;

  // Combustible total — fuente real: fuel_logs.cost
  const totalFuel = (S.fuelLogs || []).reduce((s, fl) => s + (parseFloat(fl.cost) || 0), 0);

  // Mantenimiento total — fuente real: txs cat 'Mantenimiento'
  const totalMaint = (S.txs || []).filter(t =>
    t.type === 'expense' && (t.cat || '').toLowerCase().includes('mant')
  ).reduce((s, t) => s + (t.amount || 0), 0);

  // C/km — vehículo principal
  let ckm = null;
  if (fleetData.length > 0) {
    const pv = fleetData[0];
    const totalKm = pv.totalKm || 0;
    if (totalKm > 0) ckm = (pv.fuelCost + pv.maintCost) / totalKm;
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

  // Usar solo vehículos reales de Supabase
  const vehicles = (S.vehicles || []).filter(v => v.id && v.brand);

  if (vehicles.length === 0) {
    g('fleet-kpis') && (g('fleet-kpis').innerHTML = '');
    grid.innerHTML = '<div class="tbl-empty" style="grid-column:1/-1;padding:30px">No hay vehículos registrados en Supabase. Agregá el primero desde el panel de administración.</div>';
    return;
  }

  const now = new Date();
  const fuelLogs = S.fuelLogs || [];

  // Preparar etiquetas de 6 meses
  let monthLabels = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthLabels.push(d.toLocaleDateString('es-ES', { month: 'short' }));
  }

  // Calcular métricas por vehículo usando fuel_logs real
  const fleetData = vehicles.map(v => {
    // Logs de combustible de este vehículo
    const vLogs = fuelLogs.filter(fl => fl.vehicle_id === v.id);

    // Costo combustible = sum(fuel_logs.cost)
    const fuelCost = vLogs.reduce((s, fl) => s + (parseFloat(fl.cost) || 0), 0);

    // Km total = sum(odometer_reading) del último log - del primero; o sum(liters) si no hay odómetro
    // Usamos la diferencia de odómetro si hay al menos 2 registros con odómetro
    let totalKm = 0;
    const withOdo = vLogs.filter(fl => fl.odometer_reading > 0).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (withOdo.length >= 2) {
      totalKm = withOdo[withOdo.length - 1].odometer_reading - withOdo[0].odometer_reading;
    }

    // Litros totales
    const totalLiters = vLogs.reduce((s, fl) => s + (parseFloat(fl.liters) || 0), 0);

    // Eficiencia km/l
    const efficiency = (totalKm > 0 && totalLiters > 0) ? totalKm / totalLiters : null;

    // Mantenimiento vinculado a este vehículo (txs cat Mantenimiento + _sale_id = v.id)
    const maintTxs = (S.txs || []).filter(t =>
      t.type === 'expense' &&
      (t.cat || '').toLowerCase().includes('mant') &&
      (t._sale_id === v.id || (!t._sale_id && vehicles.indexOf(v) === 0))
    );
    const maintCost = maintTxs.reduce((s, t) => s + (t.amount || 0), 0);

    // Costo mensual (últimos 6 meses) desde fuel_logs
    const monthlyCost = [0, 0, 0, 0, 0, 0];
    vLogs.forEach(fl => {
      if (!fl.date) return;
      const d = new Date(fl.date);
      const diff = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
      if (diff >= 0 && diff < 6) monthlyCost[5 - diff] += parseFloat(fl.cost) || 0;
    });

    // C/km
    const ckm = (totalKm > 0 && (fuelCost + maintCost) > 0)
      ? (fuelCost + maintCost) / totalKm
      : null;

    return {
      ...v,
      label: vehicleLabel(v),
      icon:  vehicleIcon(v),
      fuelCost,
      maintCost,
      totalKm,
      totalLiters,
      efficiency,
      monthlyCost,
      ckm,
      logCount: vLogs.length
    };
  });

  // Renderizar KPIs globales
  renderFleetKPIs(fleetData);

  // Alerta de mantenimiento
  checkMaintenanceAlert();

  // Renderizar tarjetas de vehículos
  grid.innerHTML = fleetData.map(v => `
    <div class="panel pp" style="padding:18px;display:flex;flex-direction:column;gap:12px">
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:2.2rem;background:var(--bg3);width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:14px;border:1px solid var(--bg5)">${v.icon}</div>
        <div>
          <div style="font-weight:600;color:var(--cr);font-size:1.05rem">${v.label}</div>
          <div style="font-size:.72rem;color:var(--mu)">${[v.brand, v.model, v.year].filter(Boolean).join(' ')} · ${v.plate || ''}</div>
        </div>
      </div>

      <!-- Desglose de costos -->
      <div style="background:var(--bg3);border:1px solid var(--bg5);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:.75rem;color:var(--mu)">⛽ Combustible</span>
          <span style="font-family:var(--fm);font-weight:600;color:var(--neg);font-size:.85rem">${fmt(v.fuelCost, '₲')}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:.75rem;color:var(--mu)">🔧 Mantenimiento</span>
          <span style="font-family:var(--fm);font-weight:600;color:#f6c23e;font-size:.85rem">${fmt(v.maintCost, '₲')}</span>
        </div>
        <div style="border-top:1px solid var(--bg5);padding-top:6px;margin-top:2px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:.75rem;color:var(--cr);font-weight:500">Total acumulado</span>
          <span style="font-family:var(--fm);font-weight:700;color:var(--cr);font-size:.9rem">${fmt(v.fuelCost + v.maintCost, '₲')}</span>
        </div>
      </div>

      <!-- Métricas de eficiencia -->
      ${(v.ckm || v.totalKm > 0 || v.efficiency) ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${v.totalKm > 0 ? `
        <div style="background:var(--bg3);border:1px solid var(--bg5);border-radius:10px;padding:8px 12px;flex:1;min-width:90px">
          <div style="font-size:.6rem;color:var(--mu);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Km registrados</div>
          <div style="font-family:var(--fm);font-weight:600;color:var(--cr);font-size:.85rem">${Math.round(v.totalKm).toLocaleString()} km</div>
        </div>` : ''}
        ${v.ckm ? `
        <div style="background:var(--bg3);border:1px solid var(--bg5);border-radius:10px;padding:8px 12px;flex:1;min-width:90px">
          <div style="font-size:.6rem;color:var(--mu);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Costo / km</div>
          <div style="font-family:var(--fm);font-weight:600;color:var(--g2);font-size:.85rem">₲ ${Math.round(v.ckm).toLocaleString()}</div>
        </div>` : ''}
        ${v.efficiency ? `
        <div style="background:var(--bg3);border:1px solid var(--bg5);border-radius:10px;padding:8px 12px;flex:1;min-width:90px">
          <div style="font-size:.6rem;color:var(--mu);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Eficiencia</div>
          <div style="font-family:var(--fm);font-weight:600;color:var(--pos);font-size:.85rem">${v.efficiency.toFixed(1)} km/L</div>
        </div>` : ''}
      </div>` : ''}

      <!-- Gráfico mensual -->
      <div style="font-size:.7rem;color:var(--m3);text-transform:uppercase;letter-spacing:1px">
        Combustible últimos 6 meses ${v.logCount === 0 ? '· Sin registros' : `· ${v.logCount} cargas`}
      </div>
      <div style="height:110px;width:100%;position:relative">
        <canvas id="chart-vh-${v.id}"></canvas>
      </div>
    </div>
  `).join('');

  // Renderizar gráfico comparativo
  renderFleetCompChart(fleetData, monthLabels);

  // Renderizar gráficos individuales
  fleetData.forEach(v => {
    const ctx = document.getElementById(`chart-vh-${v.id}`);
    if (!ctx) return;
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [{
          data: v.monthlyCost,
          backgroundColor: 'rgba(193, 193, 255, 0.65)',
          borderColor: '#c1c1ff',
          borderRadius: 5,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            display: true,
            grid: { display: false },
            ticks: { color: '#dae2fd', font: { size: 12 } }
          },
          y: { display: false }
        }
      }
    });
  });
}

// ══════════════════════════════════════════
// GRÁFICO COMPARATIVO
// ══════════════════════════════════════════
function renderFleetCompChart(fleetData, monthLabels) {
  const ctx = g('fleet-comp-chart');
  if (!ctx) return;

  if (fleetCompChart) fleetCompChart.destroy();

  const chartColors = ['#c1c1ff', '#4edea3', '#f6c23e', '#ffb4ab', '#36b9cc'];

  const datasets = fleetData.map((v, i) => ({
    label: v.label,
    data: v.monthlyCost,
    borderColor: chartColors[i % chartColors.length],
    backgroundColor: chartColors[i % chartColors.length] + '22',
    borderWidth: 2.5,
    tension: 0.35,
    fill: true,
    pointRadius: 3,
    pointHoverRadius: 5
  }));

  fleetCompChart = new Chart(ctx, {
    type: 'line',
    data: { labels: monthLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#dae2fd',   // blanco/crema — alto contraste
            font: { size: 13 },
            padding: 16,
            boxWidth: 12
          }
        },
        tooltip: {
          callbacks: {
            label: c => `${c.dataset.label}: ₲ ${c.parsed.y.toLocaleString()}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#c6c6cd',   // gris claro — legible sobre fondo oscuro
            font: { size: 12 },
            callback: v => v >= 1e6 ? '₲' + (v/1e6).toFixed(1)+'M' : '₲' + (v/1e3).toFixed(0)+'K'
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: '#c6c6cd',
            font: { size: 12 }
          }
        }
      }
    }
  });
}

// ══════════════════════════════════════════
// FUEL MODAL
// ══════════════════════════════════════════
function openFuelModal() {
  const vSel = g('fuel-vehicle-selector');
  const vehicles = (S.vehicles || []).filter(v => v.id && v.brand);

  if (vSel) {
    vSel.innerHTML = vehicles.length
      ? vehicles.map(v => `
          <div class="v-btn" id="v-btn-${v.id}" onclick="selectFuelVehicle('${v.id}')"
               style="display:flex;flex-direction:column;align-items:center;padding:12px;background:var(--bg3);border:2px solid var(--bg5);border-radius:12px;cursor:pointer;min-width:88px;transition:all 0.2s;user-select:none;">
            <span style="font-size:1.8rem;margin-bottom:6px">${vehicleIcon(v)}</span>
            <span style="font-size:.7rem;color:var(--cr);text-align:center;font-weight:500">${vehicleLabel(v)}</span>
          </div>`).join('')
      : '<div style="color:var(--mu);font-size:.8rem">Sin vehículos registrados</div>';
  }

  if (vehicles.length > 0) selectFuelVehicle(vehicles[0].id);

  const accSel = g('fuel-acc');
  if (accSel) {
    accSel.innerHTML = '<option value="">Efectivo / Caja Fija</option>';
    const list = (S.accounts || []).concat(S.cards || []);
    if (list.length) accSel.innerHTML += list.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
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
    const btn = g(`v-btn-${v.id}`);
    if (btn) {
      btn.style.borderColor = v.id === id ? 'var(--pos)' : 'var(--bg5)';
      btn.style.background  = v.id === id ? 'var(--pb)'  : 'var(--bg3)';
    }
  });
}

function saveFuelLog() {
  const vId   = g('fuel-vehicle-id').value;
  const amt   = parseFloat(g('fuel-amt').value);
  const accId = g('fuel-acc').value;
  const lts   = parseFloat(g('fuel-lts').value);
  const km    = parseFloat(g('fuel-km').value);
  const date  = g('fuel-date').value;

  if (!vId)               { toast('Seleccioná un vehículo'); return; }
  if (isNaN(amt) || amt <= 0) { toast('Ingresá un monto válido'); return; }
  if (!date)              { toast('Seleccioná una fecha'); return; }

  // Guardar en fuel_logs (fuente primaria) + tx de gasto para tesorería
  const fuelLog = {
    id: uid(),
    user_id: S.user?.id,
    vehicle_id: vId,
    date,
    cost: amt,
    liters: isNaN(lts) ? null : lts,
    odometer_reading: isNaN(km) ? null : km,
    fuel_type: 'Gasolina',
    is_settled: false
  };

  if (!S.fuelLogs) S.fuelLogs = [];
  S.fuelLogs.unshift(fuelLog);

  if (SB_ON) sbUpsert('fuel_logs', fuelLog);

  // También registrar como tx de gasto (impacta tesorería)
  let desc = 'Combustible';
  if (!isNaN(lts) && lts > 0) desc += ` | ${lts} lts`;
  if (!isNaN(km) && km > 0)  desc += ` | Km: ${km}`;

  const tx = {
    id: uid(),
    user_id: S.user?.id,
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
  S.txs.unshift(tx);
  if (SB_ON) sbUpsert('txs', tx);

  if (typeof lsave === 'function') lsave();
  toast('✅ Carga de combustible registrada');
  cm('fuel-modal');
  if (typeof checkBudgetAlerts === 'function') checkBudgetAlerts();
  if (typeof renderAll === 'function') renderAll();
}
