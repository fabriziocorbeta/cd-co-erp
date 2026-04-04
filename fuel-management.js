// CD & Co — FUEL MANAGEMENT SYSTEM
// ====================================
// Gestión de combustible con rendimiento, devengamiento y previsión

const http = require('http');

// ══════════════════════════════════════════
// HELPER: Fetch from Supabase
// ══════════════════════════════════════════
function supabaseFetch(url, options = {}, sbUrl, sbKey) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      timeout: 10000
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

// ══════════════════════════════════════════
// 1. GET ALL FUEL LOGS
// ══════════════════════════════════════════
async function getFuelLogs(sbUrl, sbKey, limit = 50) {
  try {
    const url = `${sbUrl}/rest/v1/fuel_logs?select=*&order=date.desc&limit=${limit}`;
    const response = await supabaseFetch(url, {}, sbUrl, sbKey);

    if (response.status !== 200) {
      console.error('❌ [Fuel] Error obteniendo logs:', response.status);
      return [];
    }

    console.log(`✅ [Fuel] ${response.data.length} registros de combustible cargados`);
    return response.data || [];
  } catch (err) {
    console.error('❌ [Fuel] Exception:', err.message);
    return [];
  }
}

// ══════════════════════════════════════════
// 2. CREATE NEW FUEL LOG
// ══════════════════════════════════════════
async function createFuelLog(sbUrl, sbKey, fuelData) {
  try {
    // Validar datos
    if (!fuelData.date || !fuelData.odometer_reading || !fuelData.liters || !fuelData.total_cost) {
      return { success: false, error: 'Faltan datos requeridos' };
    }

    const data = {
      date: fuelData.date,
      odometer_reading: parseInt(fuelData.odometer_reading),
      liters: parseFloat(fuelData.liters),
      total_cost: parseInt(fuelData.total_cost),
      location: fuelData.location || null,
      is_settled: false
    };

    const url = `${sbUrl}/rest/v1/fuel_logs`;
    const response = await supabaseFetch(url, {
      method: 'POST',
      body: data,
      headers: { 'Prefer': 'return=representation' }
    }, sbUrl, sbKey);

    if (response.status !== 201) {
      console.error('❌ [Fuel] Error insertando registro:', response.status, response.data);
      return { success: false, error: response.data };
    }

    console.log('✅ [Fuel] Registro de combustible creado:', response.data[0].id);
    return { success: true, log: response.data[0] };
  } catch (err) {
    console.error('❌ [Fuel] Exception:', err.message);
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════
// 3. CALCULATE FUEL EFFICIENCY (KM/L)
// ══════════════════════════════════════════
async function calculateFuelEfficiency(sbUrl, sbKey) {
  try {
    // Obtener los últimos 2 registros para calcular km/L
    const logs = await getFuelLogs(sbUrl, sbKey, 2);

    if (logs.length < 2) {
      return { success: false, message: 'Se necesitan al menos 2 registros para calcular eficiencia' };
    }

    // Logs vienen ordenados desc (más reciente primero)
    const current = logs[0];
    const previous = logs[1];

    const kmDriven = current.odometer_reading - previous.odometer_reading;
    const litersBurned = current.liters;
    const efficiency = kmDriven / litersBurned;

    console.log(`✅ [Fuel] Eficiencia calculada: ${efficiency.toFixed(2)} km/L`);

    return {
      success: true,
      efficiency: parseFloat(efficiency.toFixed(2)),
      kmDriven,
      litersBurned,
      lastFillUp: current.date,
      previousFillUp: previous.date
    };
  } catch (err) {
    console.error('❌ [Fuel] Error calculando eficiencia:', err.message);
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════
// 4. GET 6-MONTH STATISTICS
// ══════════════════════════════════════════
async function get6MonthStats(sbUrl, sbKey) {
  try {
    // Calcular fecha hace 6 meses
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

    // Query: obtener todos los registros de los últimos 6 meses
    const url = `${sbUrl}/rest/v1/fuel_logs?select=*&date=gte.${sixMonthsAgoStr}&order=date.asc`;
    const response = await supabaseFetch(url, {}, sbUrl, sbKey);

    if (response.status !== 200 || !response.data) {
      return { success: false, error: 'No se pudieron obtener datos' };
    }

    const logs = response.data;
    if (logs.length === 0) {
      return {
        success: true,
        message: 'Sin registros en los últimos 6 meses',
        stats: {
          totalLiters: 0,
          totalCost: 0,
          averageLitersPerfill: 0,
          averageCostPerFill: 0,
          averageEfficiency: 0,
          recordCount: 0
        }
      };
    }

    // Calcular estadísticas
    const totalLiters = logs.reduce((sum, log) => sum + parseFloat(log.liters), 0);
    const totalCost = logs.reduce((sum, log) => sum + parseInt(log.total_cost), 0);
    const averageLitersPerfill = totalLiters / logs.length;
    const averageCostPerFill = totalCost / logs.length;

    // Calcular eficiencia promedio
    let totalKm = 0;
    let efficiencyCount = 0;
    for (let i = 1; i < logs.length; i++) {
      const kmDriven = logs[i].odometer_reading - logs[i - 1].odometer_reading;
      const efficiency = kmDriven / parseFloat(logs[i].liters);
      totalKm += kmDriven;
      efficiencyCount += 1;
    }
    const averageEfficiency = efficiencyCount > 0 ? (totalKm / totalLiters) : 0;

    console.log('✅ [Fuel] Estadísticas de 6 meses calculadas');

    return {
      success: true,
      stats: {
        totalLiters: parseFloat(totalLiters.toFixed(2)),
        totalCost,
        averageLitersPerfill: parseFloat(averageLitersPerfill.toFixed(2)),
        averageCostPerFill: Math.round(averageCostPerFill),
        averageEfficiency: parseFloat(averageEfficiency.toFixed(2)),
        recordCount: logs.length,
        periodStart: logs[0].date,
        periodEnd: logs[logs.length - 1].date
      }
    };
  } catch (err) {
    console.error('❌ [Fuel] Error calculando stats:', err.message);
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════
// 5. SETTLE FUEL CHARGE (Crear transacción)
// ══════════════════════════════════════════
async function settleFuelCharge(sbUrl, sbKey, fuelLogId) {
  try {
    console.log(`🔄 [Fuel] Devengando carga de combustible: ${fuelLogId}`);

    // Paso 1: Obtener el registro de combustible
    const fuelUrl = `${sbUrl}/rest/v1/fuel_logs?id=eq.${fuelLogId}&select=*`;
    const fuelResponse = await supabaseFetch(fuelUrl, {}, sbUrl, sbKey);

    if (fuelResponse.status !== 200 || !fuelResponse.data || fuelResponse.data.length === 0) {
      return { success: false, error: 'Registro de combustible no encontrado' };
    }

    const fuelLog = fuelResponse.data[0];

    // Paso 2: Crear transacción en la tabla transactions
    const transactionData = {
      type: 'expense',
      description: `Combustible - ${fuelLog.liters}L en ${fuelLog.location || 'Surtidor'}`,
      amount: fuelLog.total_cost,
      currency: '₲',
      category: 'Transporte/Combustible',
      date: fuelLog.date,
      icon: '⛽',
      fuel_log_id: fuelLogId
    };

    const txUrl = `${sbUrl}/rest/v1/transactions`;
    const txResponse = await supabaseFetch(txUrl, {
      method: 'POST',
      body: transactionData,
      headers: { 'Prefer': 'return=representation' }
    }, sbUrl, sbKey);

    if (txResponse.status !== 201) {
      console.error('❌ [Fuel] Error creando transacción:', txResponse.status);
      return { success: false, error: 'Error creando transacción' };
    }

    // Paso 3: Marcar como settled
    const updateUrl = `${sbUrl}/rest/v1/fuel_logs?id=eq.${fuelLogId}`;
    const updateResponse = await supabaseFetch(updateUrl, {
      method: 'PATCH',
      body: { is_settled: true },
      headers: { 'Prefer': 'return=representation' }
    }, sbUrl, sbKey);

    if (updateResponse.status !== 200) {
      console.error('❌ [Fuel] Error marcando como settled:', updateResponse.status);
      return { success: false, error: 'Error actualizando estado' };
    }

    console.log(`✅ [Fuel] Carga de combustible devengada exitosamente`);
    console.log(`   📊 Transacción creada: ${txResponse.data[0].id}`);
    console.log(`   💰 Monto: ₲${fuelLog.total_cost}`);

    return {
      success: true,
      fuelLog,
      transaction: txResponse.data[0],
      message: `Combustible devengado: ₲${fuelLog.total_cost}`
    };
  } catch (err) {
    console.error('❌ [Fuel] Exception en settleFuelCharge:', err.message);
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════
// 6. FORECAST NEXT MONTH FUEL COST
// ══════════════════════════════════════════
async function forecastNextMonthFuelCost(sbUrl, sbKey) {
  try {
    // Obtener estadísticas de 6 meses
    const statsResponse = await get6MonthStats(sbUrl, sbKey);

    if (!statsResponse.success || statsResponse.stats.recordCount === 0) {
      return {
        success: true,
        forecast: 0,
        message: 'Sin datos históricos para previsión',
        confidence: 'low'
      };
    }

    const { totalCost, recordCount } = statsResponse.stats;

    // Calcular promedio mensual
    const monthsOfData = Math.ceil(recordCount / 4); // ~4 llenos por mes
    const averageMonthlyCost = Math.round(totalCost / monthsOfData);

    // Sumar un 5% de variabilidad estacional
    const forecastedCost = Math.round(averageMonthlyCost * 1.05);

    console.log('✅ [Fuel] Previsión calculada');
    console.log(`   📈 Costo promedio mensual: ₲${averageMonthlyCost}`);
    console.log(`   🔮 Previsión próximo mes: ₲${forecastedCost}`);

    return {
      success: true,
      forecast: forecastedCost,
      basedOnMonths: monthsOfData,
      historicalAverage: averageMonthlyCost,
      confidence: recordCount >= 20 ? 'high' : recordCount >= 8 ? 'medium' : 'low',
      seasonalityFactor: 1.05
    };
  } catch (err) {
    console.error('❌ [Fuel] Error en forecast:', err.message);
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════
// 7. GET UNSETTLED LOGS (para UI)
// ══════════════════════════════════════════
async function getUnsettledLogs(sbUrl, sbKey) {
  try {
    const url = `${sbUrl}/rest/v1/fuel_logs?is_settled=eq.false&select=*&order=date.desc`;
    const response = await supabaseFetch(url, {}, sbUrl, sbKey);

    if (response.status !== 200) {
      return [];
    }

    console.log(`✅ [Fuel] ${response.data.length} registros sin devengar encontrados`);
    return response.data || [];
  } catch (err) {
    console.error('❌ [Fuel] Error obteniendo unsettled logs:', err.message);
    return [];
  }
}

// ══════════════════════════════════════════
// 8. DELETE FUEL LOG (admin)
// ══════════════════════════════════════════
async function deleteFuelLog(sbUrl, sbKey, fuelLogId) {
  try {
    const url = `${sbUrl}/rest/v1/fuel_logs?id=eq.${fuelLogId}`;
    const response = await supabaseFetch(url, { method: 'DELETE' }, sbUrl, sbKey);

    if (response.status !== 204) {
      return { success: false, error: 'Error eliminando registro' };
    }

    console.log('✅ [Fuel] Registro eliminado');
    return { success: true };
  } catch (err) {
    console.error('❌ [Fuel] Error eliminando:', err.message);
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════
module.exports = {
  getFuelLogs,
  createFuelLog,
  calculateFuelEfficiency,
  get6MonthStats,
  settleFuelCharge,
  forecastNextMonthFuelCost,
  getUnsettledLogs,
  deleteFuelLog
};
