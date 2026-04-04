// CD & Co — FUEL MANAGEMENT FRONTEND
// ====================================
// Interfaz de usuario para gestión de combustible
// PLACEHOLDER — Aplicar diseño con Antigravity

// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let fuelState = {
  logs: [],
  currentStats: null,
  currentForecast: null,
  currentEfficiency: null
};

// ══════════════════════════════════════════
// RENDER FUEL DASHBOARD
// ══════════════════════════════════════════
async function renderFuelDashboard() {
  fuelState.logs = await sbGetFuelLogs();
  fuelState.currentStats = await sbGet6MonthFuelStats();
  fuelState.currentForecast = await sbGetFuelForecast();
  fuelState.currentEfficiency = await sbGetFuelEfficiency();

  // PLACEHOLDER: Crear contenedor principal
  const container = document.getElementById('fuel-dashboard-container');
  if (!container) { return; }

  // ═══════════════════════════════════════
  // CARDS DE RESUMEN (4 columnas)
  // ═══════════════════════════════════════
  const summaryHTML = `
    <div id="fuel-summary-cards" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">

      <!-- Card 1: Eficiencia actual -->
      <div id="fuel-card-efficiency" style="padding: 16px; border-radius: 8px; border: 1px solid var(--bg3);">
        <div style="font-size: 12px; color: var(--mu); margin-bottom: 8px;">⛽ Eficiencia</div>
        <div style="font-size: 24px; font-weight: bold; color: var(--g2);">
          ${fuelState.currentEfficiency?.efficiency || '-'} km/L
        </div>
        <div style="font-size: 11px; color: var(--mu); margin-top: 4px;">
          ${fuelState.currentEfficiency?.kmDriven || 0} km en ${fuelState.currentEfficiency?.litersBurned || 0}L
        </div>
      </div>

      <!-- Card 2: Consumo promedio -->
      <div id="fuel-card-avg-consumption" style="padding: 16px; border-radius: 8px; border: 1px solid var(--bg3);">
        <div style="font-size: 12px; color: var(--mu); margin-bottom: 8px;">📊 Consumo Promedio</div>
        <div style="font-size: 24px; font-weight: bold; color: var(--g2);">
          ${fuelState.currentStats?.averageLitersPerfill?.toFixed(1) || '-'} L
        </div>
        <div style="font-size: 11px; color: var(--mu); margin-top: 4px;">
          Por llenada en 6 meses
        </div>
      </div>

      <!-- Card 3: Gasto promedio mensual -->
      <div id="fuel-card-avg-cost" style="padding: 16px; border-radius: 8px; border: 1px solid var(--bg3);">
        <div style="font-size: 12px; color: var(--mu); margin-bottom: 8px;">💰 Gasto Promedio</div>
        <div style="font-size: 24px; font-weight: bold; color: var(--pos);">
          ₲${fuelState.currentStats?.averageCostPerFill?.toLocaleString() || '-'}
        </div>
        <div style="font-size: 11px; color: var(--mu); margin-top: 4px;">
          Por llenada
        </div>
      </div>

      <!-- Card 4: Previsión próximo mes -->
      <div id="fuel-card-forecast" style="padding: 16px; border-radius: 8px; border: 1px solid var(--bg3);">
        <div style="font-size: 12px; color: var(--mu); margin-bottom: 8px;">🔮 Previsión</div>
        <div style="font-size: 24px; font-weight: bold; color: var(--g);">
          ₲${fuelState.currentForecast?.forecast?.toLocaleString() || '-'}
        </div>
        <div style="font-size: 11px; color: var(--mu); margin-top: 4px;">
          ${fuelState.currentForecast?.confidence || 'N/A'} confianza
        </div>
      </div>

    </div>
  `;

  // ═══════════════════════════════════════
  // TABLA DE REGISTROS
  // ═══════════════════════════════════════
  const tableHTML = `
    <div id="fuel-logs-section" style="margin-top: 24px;">
      <h3 style="margin-bottom: 12px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--cr);">
        📋 Registros Recientes
      </h3>

      <div id="fuel-logs-table" style="overflow-x: auto; border: 1px solid var(--bg3); border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead style="background: var(--bg3); border-bottom: 1px solid var(--bg4);">
            <tr>
              <th style="padding: 12px; text-align: left; color: var(--mu); font-weight: 600;">Fecha</th>
              <th style="padding: 12px; text-align: right; color: var(--mu); font-weight: 600;">Odómetro</th>
              <th style="padding: 12px; text-align: right; color: var(--mu); font-weight: 600;">Litros</th>
              <th style="padding: 12px; text-align: right; color: var(--mu); font-weight: 600;">Costo</th>
              <th style="padding: 12px; text-align: center; color: var(--mu); font-weight: 600;">Estado</th>
              <th style="padding: 12px; text-align: center; color: var(--mu); font-weight: 600;">Acciones</th>
            </tr>
          </thead>
          <tbody id="fuel-logs-tbody">
            ${fuelState.logs.length === 0 ? `
              <tr>
                <td colspan="6" style="padding: 24px; text-align: center; color: var(--mu);">
                  📭 Sin registros de combustible
                </td>
              </tr>
            ` : fuelState.logs.map(log => `
              <tr style="border-bottom: 1px solid var(--bg4); transition: background 0.2s;">
                <td style="padding: 12px; color: var(--cr);">
                  ${new Date(log.date).toLocaleDateString('es-PY')}
                </td>
                <td style="padding: 12px; text-align: right; color: var(--g2);">
                  ${log.odometer_reading.toLocaleString()} km
                </td>
                <td style="padding: 12px; text-align: right; color: var(--cr);">
                  ${log.liters.toFixed(2)} L
                </td>
                <td style="padding: 12px; text-align: right; color: var(--pos);">
                  ₲${log.total_cost.toLocaleString()}
                </td>
                <td style="padding: 12px; text-align: center;">
                  <span style="padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; ${log.is_settled ? 'background: rgba(74, 155, 111, 0.2); color: var(--pos);' : 'background: rgba(155, 74, 74, 0.2); color: var(--neg);'}">
                    ${log.is_settled ? '✓ Devengado' : '⏳ Pendiente'}
                  </span>
                </td>
                <td style="padding: 12px; text-align: center;">
                  <div style="display: flex; gap: 8px; justify-content: center;">
                    ${!log.is_settled ? `
                      <button onclick="handleSettleFuelCharge('${log.id}')"
                        style="padding: 4px 8px; background: var(--g2); color: var(--bg); border: none; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 600;">
                        Devengar
                      </button>
                    ` : ''}
                    <button onclick="handleDeleteFuelLog('${log.id}')"
                      style="padding: 4px 8px; background: var(--neg); color: var(--bg); border: none; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 600;">
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.innerHTML = summaryHTML + tableHTML;

  // ═══════════════════════════════════════
  // MODAL: NUEVO REGISTRO
  // ═══════════════════════════════════════
  const modalHTML = `
    <div id="fuel-modal" style="display: none; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 1000; align-items: center; justify-content: center;">
      <div style="background: var(--bg2); border-radius: 8px; padding: 24px; max-width: 400px; width: 90%;">

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 16px; font-weight: 600;">⛽ Nuevo Registro de Combustible</h2>
          <button onclick="closeFuelModal()" style="background: transparent; border: none; cursor: pointer; font-size: 20px; color: var(--mu);">✕</button>
        </div>

        <form id="fuel-form" onsubmit="handleCreateFuelLog(event)" style="display: flex; flex-direction: column; gap: 12px;">

          <div>
            <label style="display: block; font-size: 11px; color: var(--mu); margin-bottom: 4px; text-transform: uppercase;">Fecha</label>
            <input type="date" id="fuel-date" required style="width: 100%; padding: 8px; background: var(--bg3); border: 1px solid var(--bg4); border-radius: 4px; color: var(--cr); font-family: var(--fb);">
          </div>

          <div>
            <label style="display: block; font-size: 11px; color: var(--mu); margin-bottom: 4px; text-transform: uppercase;">Lectura Odómetro (km)</label>
            <input type="number" id="fuel-odometer" required min="0" step="1" style="width: 100%; padding: 8px; background: var(--bg3); border: 1px solid var(--bg4); border-radius: 4px; color: var(--cr); font-family: var(--fb);">
          </div>

          <div>
            <label style="display: block; font-size: 11px; color: var(--mu); margin-bottom: 4px; text-transform: uppercase;">Litros Cargados</label>
            <input type="number" id="fuel-liters" required min="0.1" step="0.1" style="width: 100%; padding: 8px; background: var(--bg3); border: 1px solid var(--bg4); border-radius: 4px; color: var(--cr); font-family: var(--fb);">
          </div>

          <div>
            <label style="display: block; font-size: 11px; color: var(--mu); margin-bottom: 4px; text-transform: uppercase;">Costo Total (₲)</label>
            <input type="number" id="fuel-cost" required min="0" step="1" style="width: 100%; padding: 8px; background: var(--bg3); border: 1px solid var(--bg4); border-radius: 4px; color: var(--cr); font-family: var(--fb);">
          </div>

          <div>
            <label style="display: block; font-size: 11px; color: var(--mu); margin-bottom: 4px; text-transform: uppercase;">Ubicación (opcional)</label>
            <input type="text" id="fuel-location" placeholder="Ej: Surtidor Shell Av. Mariscal" style="width: 100%; padding: 8px; background: var(--bg3); border: 1px solid var(--bg4); border-radius: 4px; color: var(--cr); font-family: var(--fb);">
          </div>

          <button type="submit" style="padding: 10px; background: var(--g2); color: var(--bg); border: none; border-radius: 4px; cursor: pointer; font-weight: 600; margin-top: 12px;">
            💾 Guardar Registro
          </button>

        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

}

// ══════════════════════════════════════════
// MODAL HANDLERS
// ══════════════════════════════════════════

function openFuelModal() {
  const modal = document.getElementById('fuel-modal');
  if (modal) modal.style.display = 'flex';
  document.getElementById('fuel-date').valueAsDate = new Date();
}

function closeFuelModal() {
  const modal = document.getElementById('fuel-modal');
  if (modal) modal.style.display = 'none';
}

// ══════════════════════════════════════════
// ACTION HANDLERS
// ══════════════════════════════════════════

async function handleCreateFuelLog(e) {
  e.preventDefault();

  const fuelData = {
    date: document.getElementById('fuel-date').value,
    odometer_reading: parseInt(document.getElementById('fuel-odometer').value),
    liters: parseFloat(document.getElementById('fuel-liters').value),
    total_cost: parseInt(document.getElementById('fuel-cost').value),
    location: document.getElementById('fuel-location').value || null
  };

  const result = await sbCreateFuelLog(fuelData);
  if (result) {
    closeFuelModal();
    renderFuelDashboard(); // Refrescar tabla
  }
}

async function handleSettleFuelCharge(fuelLogId) {
  if (confirm('¿Devengar esta carga de combustible? Se creará una transacción automáticamente.')) {
    const result = await sbSettleFuelCharge(fuelLogId);
    if (result) {
      renderFuelDashboard(); // Refrescar
    }
  }
}

async function handleDeleteFuelLog(fuelLogId) {
  if (confirm('¿Eliminar este registro de combustible?')) {
    const result = await sbDeleteFuelLog(fuelLogId);
    if (result) {
      renderFuelDashboard(); // Refrescar
    }
  }
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════

// Llamar cuando se carga la página
// renderFuelDashboard(); // llamar desde nav.js cuando se navegue a la sección
