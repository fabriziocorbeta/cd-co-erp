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

  // Combustible y mantenimiento — sumar desde fleetData ya calculado
  const totalFuel  = fleetData.reduce((s, v) => s + (v.fuelCost  || 0), 0);
  const totalMaint = fleetData.reduce((s, v) => s + (v.maintCost || 0), 0);

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

  // SWR: In this version S.vehicles and S.fuelLogs are loaded from local cache in auth.js.

  // Usar solo vehículos reales de Supabase (acepta nickname o brand)
  const vehicles = (S.vehicles || []).filter(v => v.id && (v.brand || v.nickname));

  if (vehicles.length === 0) {
    g('fleet-kpis') && (g('fleet-kpis').innerHTML = '');
    grid.innerHTML = `<div class="tbl-empty" style="grid-column:1/-1;padding:40px;text-align:center">
      <div style="font-size:2.5rem;margin-bottom:12px">🚗</div>
      <div style="margin-bottom:16px;color:var(--mu)">No hay vehículos registrados.</div>
      <button class="btn btn-g" onclick="openAddVehicleModal()" style="padding:12px 28px">＋ Agregar primer vehículo</button>
    </div>`;
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

    // Categorización ESTRICTA de txs del vehículo.
    // Palabras que identifican una carga de combustible (excluye de mant.)
    const FUEL_WORDS = ['combustible', 'nafta', 'alcohol', 'gasoil', 'diesel', 'lts', 'litro', 'surtidor', 'estacion', 'combustib'];
    const MAINT_WORDS = ['mant', 'repuesto', 'taller', 'service', 'servicio', 'repara', 'freno', 'aceite', 'filtro', 'neumatico', 'goma'];
    const EXCLUDE_WORDS = ['ueno', 'tc ueno'];
    const vPlate = (v.plate || '').toLowerCase();
    const vModel = (v.model || '').toLowerCase();

    // Helper: ¿una tx pertenece a este vehículo?
    const isVehicleTx = t => {
      const desc = (t.desc || '').toLowerCase();
      if (EXCLUDE_WORDS.some(w => desc.includes(w))) return false;
      if (t._sale_id === v.id) return true;
      return (vPlate && desc.includes(vPlate)) || (vModel && desc.includes(vModel));
    };

    // Helper: ¿una tx es de combustible?
    const isFuelTx = t => {
      const cat  = (t.cat  || '').toLowerCase();
      const desc = (t.desc || '').toLowerCase();
      return cat.includes('combustib') || FUEL_WORDS.some(w => desc.includes(w) || cat.includes(w));
    };

    // Combustible: única fuente de verdad = fuel_logs
    // (NO sumar con txs de combustible para evitar duplicación)
    const fuelCostTotal = fuelCost;

    // Txs de MANTENIMIENTO: pertenecen al vehículo, NO son de combustible
    const maintTxs = (S.txs || []).filter(t => {
      if (t.type !== 'expense') return false;
      if (!isVehicleTx(t)) return false;
      // Excluir si es una carga de combustible
      if (isFuelTx(t)) return false;
      // Debe tener al menos una palabra de mantenimiento (cat o desc)
      const cat  = (t.cat  || '').toLowerCase();
      const desc = (t.desc || '').toLowerCase();
      return MAINT_WORDS.some(w => cat.includes(w) || desc.includes(w)) || t._sale_id === v.id;
    });
    const maintCost = maintTxs.reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);

    // Costo mensual (últimos 6 meses) desde fuel_logs + fuelTxs
    const monthlyCost = [0, 0, 0, 0, 0, 0];
    const addToMonth = (dateStr, amount) => {
      if (!dateStr) return;
      const d = new Date(dateStr);
      const diff = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
      if (diff >= 0 && diff < 6) monthlyCost[5 - diff] += Math.abs(parseFloat(amount) || 0);
    };
    vLogs.forEach(fl => addToMonth(fl.date, fl.cost));

    // C/km
    const ckm = (totalKm > 0 && (fuelCost + maintCost) > 0)
      ? (fuelCost + maintCost) / totalKm
      : null;

    return {
      ...v,
      label: vehicleLabel(v),
      icon:  vehicleIcon(v),
      fuelCost: fuelCostTotal,
      maintCost,
      maintTxs,
      totalKm,
      totalLiters,
      efficiency,
      monthlyCost,
      ckm,
      logCount: vLogs.length,
      fuelLogs: vLogs
    };
  });

  // Renderizar KPIs globales
  renderFleetKPIs(fleetData);

  // Alerta de mantenimiento
  checkMaintenanceAlert();

  // Renderizar tarjetas de vehículos
  grid.innerHTML = fleetData.map(v => {
    // Evitar nombre duplicado "KIA KIA SPORTAGE": si model ya empieza con brand, no repetir brand
    const modelDisplay = (v.brand && v.model && v.model.toLowerCase().startsWith(v.brand.toLowerCase()))
      ? v.model
      : [v.brand, v.model].filter(Boolean).join(' ');
    const subLabel = [modelDisplay, v.year].filter(Boolean).join(' ') + (v.plate ? ` · ${v.plate}` : '');

    // Historial de movimientos: mant txs + fuel_logs + fuel txs, ordenados por fecha desc
    // id presente → tx de S.txs editable via openTxModal; sin id → fuel_log (no editable aquí)
    const movements = [
      ...v.maintTxs.map(t => ({
        id: t.id, date: t.date, icon: '🔧',
        desc: t.desc || 'Mantenimiento',
        amt:  -Math.abs(parseFloat(t.amount) || 0),
        cur:  '₲', type: t.type || 'expense'
      })),
      ...v.fuelLogs.map(fl => ({
        id: fl.id, date: fl.date, icon: '⛽',
        desc: `Combustible${fl.liters ? ' · ' + parseFloat(fl.liters).toFixed(1) + ' L' : ''}`,
        amt:  -(parseFloat(fl.cost) || 0),
        cur:  '₲', type: 'expense'
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    const histHTML = movements.length
      ? movements.map(m => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--bg5);gap:6px">
            <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
              <span style="font-size:.85rem;flex-shrink:0">${m.icon}</span>
              <div style="min-width:0">
                <div style="font-size:.72rem;color:var(--cr);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.desc}</div>
                <div style="font-size:.64rem;color:var(--mu)">${typeof fmtDate === 'function' ? fmtDate(m.date) : m.date}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              <span style="font-family:var(--fm);font-size:.78rem;color:var(--neg)">${fmt(m.amt, m.cur)}</span>
              ${m.id ? `<button onclick="openTxModal('${m.type}','${m.id}')" title="Editar" style="background:none;border:1px solid var(--bg5);border-radius:6px;color:var(--mu);cursor:pointer;padding:2px 6px;font-size:.7rem;line-height:1.4;transition:color .15s" onmouseover="this.style.color='var(--g2)'" onmouseout="this.style.color='var(--mu)'">✏</button>` : ''}
            </div>
          </div>`).join('')
      : `<div style="font-size:.72rem;color:var(--mu);padding:6px 0">Sin movimientos registrados</div>`;

    return `
    <div class="panel pp" style="padding:18px;display:flex;flex-direction:column;gap:12px">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          <div style="font-size:2.2rem;background:var(--bg3);width:56px;height:56px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:14px;border:1px solid var(--bg5)">${v.icon}</div>
          <div style="min-width:0">
            <div style="font-weight:600;color:var(--cr);font-size:1.05rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.label}</div>
            <div style="font-size:.72rem;color:var(--mu)">${subLabel}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-o" onclick="editVehicle('${v.id}')" style="padding:6px 10px;font-size:.75rem">✏</button>
          <button class="btn" onclick="deleteVehicle('${v.id}')" style="padding:6px 10px;font-size:.75rem;color:var(--neg);border-color:rgba(244,94,94,.3)">🗑</button>
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

      <!-- Historial de movimientos -->
      <div>
        <div style="font-size:.65rem;color:var(--mu);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Historial de movimientos</div>
        <div style="max-height:200px;overflow-y:auto;scrollbar-width:thin">${histHTML}</div>
      </div>

      <!-- Gráfico mensual -->
      <div style="font-size:.7rem;color:var(--m3);text-transform:uppercase;letter-spacing:1px">
        Combustible últimos 6 meses ${v.logCount === 0 ? '· Sin registros' : `· ${v.logCount} cargas`}
      </div>
      <div style="height:110px;width:100%;position:relative">
        <canvas id="chart-vh-${v.id}"></canvas>
      </div>
    </div>`;
  }).join('');

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
// ══════════════════════════════════════════
// AGREGAR VEHÍCULO
// ══════════════════════════════════════════
function openAddVehicleModal() {
  g('veh-nombre').value    = '';
  g('veh-chapa').value     = '';
  g('veh-odometro').value  = '';
  g('veh-combustible').value = 'nafta';
  if (g('veh-year')) g('veh-year').value = new Date().getFullYear();
  // Reset modal to "nuevo" mode
  const saveBtn = document.querySelector('#add-vehicle-modal .btn-g');
  if (saveBtn) {
    saveBtn.textContent = '✓ Guardar Vehículo';
    saveBtn.onclick = () => saveNewVehicle();
    saveBtn.removeAttribute('data-edit-id');
  }
  g('add-vehicle-modal').style.display = 'flex';
}

async function saveNewVehicle(editId) {
  const nombre    = g('veh-nombre').value.trim();
  const chapa     = g('veh-chapa').value.trim().toUpperCase();
  const odometro  = parseInt(g('veh-odometro').value) || 0;
  const combustible = g('veh-combustible').value;
  const yearVal   = parseInt(g('veh-year')?.value) || new Date().getFullYear();

  if (!nombre) { toast('Ingresá el nombre del vehículo'); return; }
  if (!chapa)  { toast('Ingresá la chapa (matrícula) del vehículo'); return; }

  // Construir etiqueta con chapa si se proporcionó
  const label = `${nombre} · ${chapa}`;

  // Extraer marca del nombre (primera palabra) como best-effort
  const brandGuess = nombre.split(/\s+/)[0] || nombre;

  // Mapear valores del dropdown a los strings exactos que acepta el CHECK constraint de Supabase
  const ENGINE_TYPE_MAP = {
    'nafta':    'Nafta',
    'gasoil':   'Diésel',
    'flex':     'Flex',
    'electrico':'Eléctrico',
    'hibrido':  'Híbrido',
  };
  const engineType = ENGINE_TYPE_MAP[combustible] || 'Nafta';

  const vehicle = {
    id:          uid(),
    user_id:     S.user?.id,
    vin:         'PENDIENTE',    // NOT NULL — se actualiza luego
    plate:       chapa,          // NOT NULL — capturado del input veh-chapa
    nickname:    label,
    brand:       brandGuess,     // NOT NULL — primera palabra del nombre
    model:       nombre,         // NOT NULL — nombre completo como modelo
    year:        yearVal, // NOT NULL — desde el selector de año
    engine_type: engineType,     // NOT NULL — mapeado a valor válido del CHECK constraint
    created_at:  new Date().toISOString(),
  };

  // Guardar en Supabase — upsert evita 409 si el vehículo ya existe (mismo id)
  if (SB_ON && sb && S.user?.id) {
    const { error } = await sb.from('vehicles').upsert([vehicle], { onConflict: 'id' });
    if (error) {
      console.error('[Fleet] Error al guardar vehículo:', error);
      toast('Error al guardar: ' + error.message);
      return;
    }
  }

  // Actualizar estado local (inserción o edición)
  if (!S.vehicles) S.vehicles = [];
  if (editId) {
    const idx = S.vehicles.findIndex(v => v.id === editId);
    if (idx >= 0) S.vehicles[idx] = { ...S.vehicles[idx], ...vehicle, id: editId };
  } else {
    S.vehicles.push(vehicle);
  }
  swrSave();

  cm('add-vehicle-modal');
  toast(editId ? '✅ Vehículo actualizado' : '✅ Vehículo agregado correctamente');
  renderFleet();
}

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
  if (g('fuel-type')) g('fuel-type').value = 'nafta';  // reset fuel type selector
  g('fuel-modal').style.display = 'flex';
}

function selectFuelVehicle(id) {
  g('fuel-vehicle-id').value = id;
  const selected = (S.vehicles || []).find(v => v.id === id);
  const typeContainer = g('fuel-type-container');
  const typeSelect = g('fuel-type');
  const typeHint = g('fuel-type-hint');

  if (typeContainer && typeSelect) {
    const engineType = (selected?.engine_type || '').toLowerCase();

    // Determinar qué opciones de combustible mostrar
    let showSelector = false;
    let options = [];
    let hint = '';

    if (engineType === 'flex') {
      showSelector = true;
      options = [
        { value: 'nafta_88', label: '⛽ Nafta 88 / Aditivada (Económica)' },
        { value: 'nafta_93', label: '⛽ Nafta 93 / Intermedia' },
        { value: 'nafta_95', label: '⛽ Nafta 95-97 / Súper' },
        { value: 'alcohol', label: '🍷 Alcohol / Etanol' }
      ];
      hint = 'Para vehículos Flex, seleccioná el octanaje o combustible cargado';
    } else if (engineType === 'nafta') {
      showSelector = true;
      options = [
        { value: 'nafta_88', label: '⛽ Nafta 88 / Aditivada (Económica)' },
        { value: 'nafta_93', label: '⛽ Nafta 93 / Intermedia' },
        { value: 'nafta_95', label: '⛽ Nafta 95-97 / Súper' }
      ];
      hint = 'Seleccioná el octanaje de la nafta cargada';
    } else if (engineType === 'gasoil') {
      showSelector = true;
      options = [
        { value: 'gasoil', label: '🛢️ Gasoil' }
      ];
      hint = 'Tipo de combustible';
    }

    if (showSelector) {
      typeContainer.style.display = 'block';
      typeSelect.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
      typeSelect.value = options[0]?.value || '';
      if (typeHint) typeHint.textContent = hint;
    } else {
      typeContainer.style.display = 'none';
    }
  }

  (S.vehicles || []).forEach(v => {
    const btn = g(`v-btn-${v.id}`);
    if (btn) {
      btn.style.borderColor = v.id === id ? 'var(--pos)' : 'var(--bg5)';
      btn.style.background  = v.id === id ? 'var(--pb)'  : 'var(--bg3)';
    }
  });
}

async function saveFuelLog() {
  const vId   = g('fuel-vehicle-id').value;
  const amt   = parseFloat(g('fuel-amt').value);
  const accId = g('fuel-acc').value;
  const lts   = parseFloat(g('fuel-lts').value);
  const km    = parseFloat(g('fuel-km').value);
  const date  = g('fuel-date').value;
  const vehicle = (S.vehicles || []).find(v => v.id === vId);
  let fuelType = g('fuel-type')?.value || 'nafta';  // default

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
    fuel_type: fuelType === 'alcohol' ? 'Alcohol' : 'Nafta',  // Flex vehicles can choose; others default
    is_settled: false
  };

  if (!S.fuelLogs) S.fuelLogs = [];
  S.fuelLogs.unshift(fuelLog);

  if (SB_ON) sbUpsert('fuel_logs', fuelLog);

  // También registrar como tx de gasto (impacta tesorería)
  let desc = `Combustible (${fuelLog.fuel_type})`;
  if (vehicle) desc += ` · ${vehicleLabel(vehicle)}`;
  if (!isNaN(lts) && lts > 0) desc += ` | ${lts} lts`;
  if (!isNaN(km) && km > 0)  desc += ` | Km: ${km}`;

  const tx = {
    id: uid(),
    user_id: S.user?.id,
    type: 'expense',
    desc,
    amount: -Math.abs(amt), // expenses stored as negative per system convention
    cur: '₲',
    cat: 'Combustible',
    date,
    _sale_id: vId
  };
  if (accId) tx.account_id = accId;

  if (!S.txs) S.txs = [];
  if (SB_ON) {
    const saved = await sbSaveTransaction(tx);
    S.txs.unshift(saved || tx);
  } else {
    S.txs.unshift(tx);
  }

  if (typeof recomputeBalances === 'function') recomputeBalances();
  if (accId && typeof _syncAccountBalance === 'function') _syncAccountBalance(accId);

  if (typeof lsave === 'function') lsave();
  toast('✅ Carga de combustible registrada');
  cm('fuel-modal');
  if (typeof checkBudgetAlerts === 'function') checkBudgetAlerts();
  if (typeof renderAll === 'function') renderAll();
}

// ══════════════════════════════════════════
// EDITAR / BORRAR VEHÍCULO
// ══════════════════════════════════════════
function editVehicle(id) {
  const v = (S.vehicles || []).find(v => v.id === id);
  if (!v) return;

  const REV_MAP = { 'Nafta':'nafta', 'Diésel':'gasoil', 'Flex':'flex', 'Eléctrico':'electrico', 'Híbrido':'hibrido' };

  g('veh-nombre').value    = v.model || v.nickname || '';
  g('veh-chapa').value     = v.plate || '';
  g('veh-odometro').value  = '';
  g('veh-combustible').value = REV_MAP[v.engine_type] || 'nafta';

  // Reutilizar el año si existe el selector
  if (g('veh-year')) g('veh-year').value = v.year || new Date().getFullYear();

  // Guardar id en el botón del modal para distinguir edición de alta
  const saveBtn = document.querySelector('#add-vehicle-modal .btn-g');
  if (saveBtn) {
    saveBtn.setAttribute('data-edit-id', id);
    saveBtn.textContent = '✓ Actualizar Vehículo';
    saveBtn.onclick = () => saveNewVehicle(id);
  }
  g('add-vehicle-modal').style.display = 'flex';
}

async function deleteVehicle(id) {
  if (!confirm('¿Borrar este vehículo? Esta acción no se puede deshacer.')) return;
  if (SB_ON && sb && S.user?.id) {
    const { error } = await sb.from('vehicles').delete().eq('id', id).eq('user_id', S.user.id);
    if (error) { toast('Error al borrar: ' + error.message); return; }
  }
  S.vehicles = (S.vehicles || []).filter(v => v.id !== id);
  if (typeof lsave === 'function') lsave();
  toast('🗑 Vehículo eliminado');
  renderFleet();
}
