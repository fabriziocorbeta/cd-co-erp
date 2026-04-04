const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const backup = require('./backup');
const fuelMgmt = require('./fuel-management');
const fleetMgmt = require('./fleet-management');
const forecastAccruals = require('./forecast-accruals');

const PORT = 8000;
const PROJECT_DIR = __dirname;

// 🔐 Cargar variables de entorno desde .env.local
function loadEnvFile() {
  const envPath = path.join(PROJECT_DIR, '.env.local');
  const env = {};

  try {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const lines = envContent.split('\n');

      lines.forEach(line => {
        // Ignorar comentarios y líneas vacías
        if (line.startsWith('#') || !line.trim()) return;

        const [key, ...valueParts] = line.split('=');
        // Strip value: trim whitespace + carriage returns + quotes
        const value = valueParts.join('=').trim().replace(/\r/g, '');

        // Remover comillas si existen
        env[key.trim().replace(/\r/g, '')] = value.replace(/^["']|["']$/g, '').trim();
      });

      console.log('✅ Variables de entorno cargadas desde .env.local');
      return env;
    }
  } catch (err) {
    console.warn('⚠️ No se pudo leer .env.local:', err.message);
  }

  return env;
}

const envVars = loadEnvFile();
console.log('🔧 Variables cargadas:', {
  SUPABASE_URL: envVars.SUPABASE_URL ? '✅' : '❌',
  SUPABASE_ANON_KEY: envVars.SUPABASE_ANON_KEY ? '✅' : '❌'
});

// ══════════════════════════════════════════
// MANEJADOR DE API ENDPOINTS
// ══════════════════════════════════════════
async function handleApiRequest(pathname, method, body) {
  // GET /api/backup/status — obtener estado del último backup
  if (pathname === '/api/backup/status' && method === 'GET') {
    const status = await backup.getBackupStatus();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(status)
    };
  }

  // POST /api/backup/now — forzar backup inmediato
  if (pathname === '/api/backup/now' && method === 'POST') {
    const result = await backup.generateBackup(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY);
    return {
      statusCode: result.success ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // ══════════════════════════════════════════
  // FUEL MANAGEMENT ENDPOINTS
  // ══════════════════════════════════════════

  // GET /api/fuel/logs — obtener todos los registros de combustible
  if (pathname === '/api/fuel/logs' && method === 'GET') {
    const logs = await fuelMgmt.getFuelLogs(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, data: logs })
    };
  }

  // POST /api/fuel/log — crear nuevo registro de combustible
  if (pathname === '/api/fuel/log' && method === 'POST') {
    const result = await fuelMgmt.createFuelLog(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY, body);
    return {
      statusCode: result.success ? 201 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // GET /api/fuel/efficiency — calcular eficiencia del último tanque
  if (pathname === '/api/fuel/efficiency' && method === 'GET') {
    const result = await fuelMgmt.calculateFuelEfficiency(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY);
    return {
      statusCode: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // GET /api/fuel/stats/6months — estadísticas de los últimos 6 meses
  if (pathname === '/api/fuel/stats/6months' && method === 'GET') {
    const result = await fuelMgmt.get6MonthStats(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY);
    return {
      statusCode: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // GET /api/fuel/forecast — previsión de gasto del próximo mes
  if (pathname === '/api/fuel/forecast' && method === 'GET') {
    const result = await fuelMgmt.forecastNextMonthFuelCost(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY);
    return {
      statusCode: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // POST /api/fuel/settle/:id — devengar carga de combustible (crear transacción)
  if (pathname.startsWith('/api/fuel/settle/') && method === 'POST') {
    const fuelLogId = pathname.split('/').pop();
    const result = await fuelMgmt.settleFuelCharge(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY, fuelLogId);
    return {
      statusCode: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // GET /api/fuel/unsettled — obtener registros sin devengar
  if (pathname === '/api/fuel/unsettled' && method === 'GET') {
    const logs = await fuelMgmt.getUnsettledLogs(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, data: logs })
    };
  }

  // DELETE /api/fuel/log/:id — eliminar registro de combustible
  if (pathname.startsWith('/api/fuel/log/') && method === 'DELETE') {
    const fuelLogId = pathname.split('/').pop();
    const result = await fuelMgmt.deleteFuelLog(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY, fuelLogId);
    return {
      statusCode: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // ══════════════════════════════════════════
  // FLEET MANAGEMENT ENDPOINTS (SaaS)
  // ══════════════════════════════════════════

  // POST /api/fleet/vehicle — crear nuevo vehículo
  if (pathname === '/api/fleet/vehicle' && method === 'POST') {
    const result = await fleetMgmt.createVehicle(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY, body);
    return {
      statusCode: result.success ? 201 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // GET /api/fleet/overview/:userId — resumen de toda la flota
  if (pathname.startsWith('/api/fleet/overview/') && method === 'GET') {
    const userId = pathname.split('/').pop();
    const result = await fleetMgmt.getFleetOverview(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY, userId);
    return {
      statusCode: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // GET /api/fleet/deviation/:vehicleId — desvío estándar de consumo
  if (pathname.startsWith('/api/fleet/deviation/') && method === 'GET') {
    const vehicleId = pathname.split('/').pop();
    const result = await fleetMgmt.calculateConsumptionDeviation(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY, vehicleId);
    return {
      statusCode: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // GET /api/fleet/electric/:vehicleId — eficiencia eléctrica
  if (pathname.startsWith('/api/fleet/electric/') && method === 'GET') {
    const vehicleId = pathname.split('/').pop();
    const result = await fleetMgmt.calculateElectricEfficiency(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY, vehicleId);
    return {
      statusCode: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // GET /api/fleet/forecast/:vehicleId — pronóstico con estacionalidad
  if (pathname.startsWith('/api/fleet/forecast/') && method === 'GET') {
    const vehicleId = pathname.split('/').pop();
    const result = await fleetMgmt.forecastWithSeasonality(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY, vehicleId);
    return {
      statusCode: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // POST /api/fleet/settle — liquidar lotes de cargas
  if (pathname === '/api/fleet/settle' && method === 'POST') {
    const result = await fleetMgmt.settleFuelBatch(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY, body.user_id, body.fuel_log_ids);
    return {
      statusCode: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  }

  // GET /api/fleet/alerts/:vehicleId — obtener alertas de mantenimiento
  if (pathname.startsWith('/api/fleet/alerts/') && method === 'GET') {
    const vehicleId = pathname.split('/').pop();
    const url = `${envVars.SUPABASE_URL}/rest/v1/maintenance_alerts?vehicle_id=eq.${vehicleId}&is_acknowledged=eq.false&order=created_at.desc`;

    try {
      const response = await fetch(url, {
        headers: {
          'apikey': envVars.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${envVars.SUPABASE_ANON_KEY}`
        }
      });
      const data = await response.json();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, alerts: data })
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: err.message })
      };
    }
  }

  // POST /api/fleet/seed — generar datos de prueba (6 meses de historial)
  if (pathname === '/api/fleet/seed' && method === 'POST') {
    try {
      const bodyObj = body ? JSON.parse(body) : {};
      const userId = bodyObj.user_id;

      if (!userId) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, error: 'user_id es requerido' })
        };
      }

      const result = await fleetMgmt.seedFleetData(
        envVars.SUPABASE_URL,
        envVars.SUPABASE_ANON_KEY,
        userId
      );

      return {
        statusCode: result.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: err.message })
      };
    }
  }

  // ══════════════════════════════════════════
  // ADMIN ENDPOINTS (solo fabriziocorbeta)
  // ══════════════════════════════════════════

  // GET /api/admin/users — listar todos los perfiles (requiere JWT admin)
  if (pathname === '/api/admin/users' && method === 'GET') {
    const jwt = (body && typeof body === 'object' ? body : {}).jwt || '';
    // JWT viene en el header Authorization
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, note: 'Use RPC from client with admin JWT' }) };
  }

  // POST /api/admin/set-pro — actualizar plan de usuario
  if (pathname === '/api/admin/set-pro' && method === 'POST') {
    try {
      const b = typeof body === 'string' ? JSON.parse(body) : body;
      const { user_id, plan, jwt } = b;
      if (!user_id || !jwt) return {
        statusCode: 400, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'user_id y jwt requeridos' })
      };
      // Llamar RPC de Supabase con el JWT del admin
      const sbUrl = envVars.SUPABASE_URL;
      const resp = await fetch(`${sbUrl}/rest/v1/rpc/admin_set_plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': envVars.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${jwt}`
        },
        body: JSON.stringify({ target_id: user_id, new_plan: plan || 'pro' })
      });
      if (!resp.ok) {
        const err = await resp.text();
        return { statusCode: 403, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, error: err }) };
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, user_id, plan: plan || 'pro' }) };
    } catch (err) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: err.message }) };
    }
  }

  // ══════════════════════════════════════════
  // IMPORTS / LANDED COST ENDPOINTS (FASE 2)
  // ══════════════════════════════════════════

  // POST /api/imports/calculate — preview landed cost with dual exchange rates
  if (pathname === '/api/imports/calculate' && method === 'POST') {
    try {
      const b = typeof body === 'string' ? JSON.parse(body) : body;
      const qty = parseInt(b.qty) || 0;
      const costUsd = parseFloat(b.unit_cost_usd) || 0;
      const freightUsd = parseFloat(b.freight_usd) || 0;
      const customsPyg = parseFloat(b.customs_pyg) || 0;
      const fxProd = parseFloat(b.exchange_rate_product) || 7350;
      const fxFreight = parseFloat(b.exchange_rate_freight) || 7350;
      const margin = parseFloat(b.margin) || 0;

      if (qty <= 0) return { statusCode: 400, headers: {'Content-Type':'application/json'}, body: JSON.stringify({success:false, error:'qty debe ser > 0'}) };
      if (costUsd <= 0) return { statusCode: 400, headers: {'Content-Type':'application/json'}, body: JSON.stringify({success:false, error:'unit_cost_usd debe ser > 0'}) };

      const costOrigPyg = (costUsd * qty) * fxProd;
      const freightTotalPyg = freightUsd * fxFreight;
      const totalLandedPyg = costOrigPyg + freightTotalPyg + customsPyg;
      const landedCostUnitPyg = totalLandedPyg / qty;
      const suggestedPricePyg = landedCostUnitPyg * (1 + margin / 100);
      const unitFreightUsd = freightUsd / qty;
      const unitCustomsPyg = customsPyg / qty;

      return {
        statusCode: 200,
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          success: true,
          preview: {
            qty,
            unit_cost_usd: costUsd,
            freight_usd: freightUsd,
            customs_pyg: customsPyg,
            exchange_rate_product: fxProd,
            exchange_rate_freight: fxFreight,
            cost_product_pyg: Math.round(costOrigPyg),
            cost_freight_pyg: Math.round(freightTotalPyg),
            total_landed_pyg: Math.round(totalLandedPyg),
            landed_cost_unit_pyg: Math.round(landedCostUnitPyg),
            unit_freight_usd: Math.round(unitFreightUsd * 100) / 100,
            unit_customs_pyg: Math.round(unitCustomsPyg),
            margin_pct: margin,
            suggested_price_pyg: Math.round(suggestedPricePyg)
          }
        })
      };
    } catch (err) {
      return { statusCode: 500, headers: {'Content-Type':'application/json'}, body: JSON.stringify({success:false, error:err.message}) };
    }
  }

  // POST /api/imports/register — register import: update product + create expense tx
  if (pathname === '/api/imports/register' && method === 'POST') {
    try {
      const b = typeof body === 'string' ? JSON.parse(body) : body;
      const { product_id, qty, unit_cost_usd, freight_usd, customs_pyg, exchange_rate_product, exchange_rate_freight, margin } = b;

      if (!product_id) return { statusCode: 400, headers: {'Content-Type':'application/json'}, body: JSON.stringify({success:false, error:'product_id requerido'}) };
      if (!qty || qty <= 0) return { statusCode: 400, headers: {'Content-Type':'application/json'}, body: JSON.stringify({success:false, error:'qty debe ser > 0'}) };
      if (!unit_cost_usd || unit_cost_usd <= 0) return { statusCode: 400, headers: {'Content-Type':'application/json'}, body: JSON.stringify({success:false, error:'unit_cost_usd debe ser > 0'}) };

      const fxProd = exchange_rate_product || 7350;
      const fxFreight = exchange_rate_freight || 7350;
      const fUsd = freight_usd || 0;
      const cPyg = customs_pyg || 0;
      const mgn = margin || 0;

      const costOrigPyg = (unit_cost_usd * qty) * fxProd;
      const freightTotalPyg = fUsd * fxFreight;
      const totalLandedPyg = costOrigPyg + freightTotalPyg + cPyg;
      const landedCostUnitPyg = totalLandedPyg / qty;
      const suggestedPricePyg = landedCostUnitPyg * (1 + mgn / 100);

      return {
        statusCode: 200,
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          success: true,
          message: 'Importación calculada. Aplicar en frontend via localStorage.',
          instruction: 'Este endpoint valida y calcula. El registro real se ejecuta en el cliente (saveImport) para mantener consistencia con la arquitectura localStorage-first.',
          result: {
            product_id,
            qty,
            landed_cost_unit_pyg: Math.round(landedCostUnitPyg),
            suggested_price_pyg: Math.round(suggestedPricePyg),
            total_landed_pyg: Math.round(totalLandedPyg),
            expense_transaction: {
              type: 'expense',
              desc: `Importación (${qty} u.) | FOB $${unit_cost_usd}/u × TC ${fxProd} + Flete $${fUsd} × TC ${fxFreight} + Aduana ₲${cPyg}`,
              amount: Math.round(totalLandedPyg),
              cur: '₲',
              cat: 'Importación / Landed Cost'
            },
            product_updates: {
              cur: '₲',
              buyPrice: Math.round(landedCostUnitPyg),
              sellPrice: Math.round(suggestedPricePyg),
              unit_cost_usd,
              freight_usd: Math.round((fUsd / qty) * 100) / 100,
              customs_pyg: Math.round(cPyg / qty),
              total_landed_cost_pyg: Math.round(landedCostUnitPyg),
              exchange_rate_product: fxProd,
              exchange_rate_freight: fxFreight
            }
          }
        })
      };
    } catch (err) {
      return { statusCode: 500, headers: {'Content-Type':'application/json'}, body: JSON.stringify({success:false, error:err.message}) };
    }
  }

  // ══════════════════════════════════════════
  // FORECAST & ACCRUALS ENDPOINTS
  // ══════════════════════════════════════════

  // POST /api/forecast/calculate — calcular previsiones de gastos
  if (pathname === '/api/forecast/calculate' && method === 'POST') {
    try {
      const bodyObj = body ? JSON.parse(body) : {};
      const userId = bodyObj.user_id;
      const currency = bodyObj.currency || '₲';

      if (!userId) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, error: 'user_id es requerido' })
        };
      }

      const result = await forecastAccruals.calculateExpenseForecasts(
        envVars.SUPABASE_URL,
        envVars.SUPABASE_ANON_KEY,
        userId,
        currency
      );

      return {
        statusCode: result.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: err.message })
      };
    }
  }

  // GET /api/forecast/next-month — obtener previsión del mes siguiente
  if (pathname === '/api/forecast/next-month' && method === 'GET') {
    try {
      const query = url.parse(req.url, true).query;
      const userId = query.user_id;
      const currency = query.currency || '₲';

      if (!userId) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, error: 'user_id es requerido' })
        };
      }

      const result = await forecastAccruals.getNextMonthForecast(
        envVars.SUPABASE_URL,
        envVars.SUPABASE_ANON_KEY,
        userId,
        currency
      );

      return {
        statusCode: result.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: err.message })
      };
    }
  }

  // POST /api/accruals/process — crear asientos de provisión
  if (pathname === '/api/accruals/process' && method === 'POST') {
    try {
      const bodyObj = body ? JSON.parse(body) : {};
      const userId = bodyObj.user_id;
      const accrualMonth = bodyObj.accrual_month; // YYYY-MM (opcional)
      const currency = bodyObj.currency || '₲';

      if (!userId) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, error: 'user_id es requerido' })
        };
      }

      const result = await forecastAccruals.processAccruals(
        envVars.SUPABASE_URL,
        envVars.SUPABASE_ANON_KEY,
        userId,
        accrualMonth,
        currency
      );

      return {
        statusCode: result.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: err.message })
      };
    }
  }

  // GET /api/validate/fuel-transaction — validar si una categoría es combustible
  if (pathname === '/api/validate/fuel-transaction' && method === 'GET') {
    try {
      const query = url.parse(req.url, true).query;
      const category = (query.category || '').toLowerCase();
      const description = (query.description || '').toLowerCase();

      const fuelKeywords = ['combustible', 'nafta', 'diésel', 'transporte', 'gasolina', 'gas', 'fuel'];
      const isFuel = fuelKeywords.some(kw => category.includes(kw) || description.includes(kw));

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          isFuelTransaction: isFuel,
          warning: isFuel
            ? '⚠️ Esta transacción parece ser COMBUSTIBLE. Por favor, regístrala en el módulo de FLOTA (Fleet) para mantener consistencia contable. ¿Deseas continuar o ir a Flota?'
            : null,
          recommendation: isFuel ? 'redirect-to-fleet' : null
        })
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: err.message })
      };
    }
  }

  // Endpoint no encontrado
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Endpoint no encontrado' })
  };
}

// Inyectar variables de entorno en HTML
function injectEnv(htmlContent) {
  const envObj = JSON.stringify({
    SUPABASE_URL: envVars.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: envVars.SUPABASE_ANON_KEY || ''
  });

  const envScript = `
    <script>
      window.__ENV__ = ${envObj};
      console.log('🔐 [Server] Variables de entorno inyectadas', window.__ENV__);
    </script>
  `;

  // Inyectar antes de </head>
  const updated = htmlContent.replace('</head>', envScript + '</head>');

  if (!updated.includes(envScript.trim())) {
    console.warn('⚠️ [Server] Advertencia: Las variables NO se inyectaron correctamente');
  } else {
    console.log('✅ [Server] Variables inyectadas en HTML');
  }

  return updated;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 🔌 PROCESAR ENDPOINTS DE API
  if (pathname.startsWith('/api/')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const apiResponse = await handleApiRequest(pathname, req.method, body);
        res.writeHead(apiResponse.statusCode, apiResponse.headers);
        res.end(apiResponse.body);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 📄 SERVIR ARCHIVOS ESTÁTICOS
  let filePath = path.join(PROJECT_DIR, pathname);

  // Si es una carpeta, intenta servir index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // Si no existe, intenta index.html (para SPA routing)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(PROJECT_DIR, 'index.html');
  }

  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 - Archivo no encontrado</h1>');
      return;
    }

    // Detectar tipo de contenido
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf'
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Si es HTML, inyectar variables de entorno
    let content = data;
    if (ext === '.html' && typeof data === 'string') {
      content = injectEnv(data);
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
});

server.listen(PORT, async () => {
  console.log(`\n🚀 CD & Co ERP - Servidor de desarrollo`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📁 Directorio: ${PROJECT_DIR}`);
  if (envVars.SUPABASE_URL) {
    console.log('✅ Supabase: Configurado');
    // 💾 Iniciar sistema de backup automático
    backup.initBackupScheduler(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY);
  } else {
    console.log('⚠️ Supabase: No configurado (revisa .env.local)');
  }
  console.log('');
});
