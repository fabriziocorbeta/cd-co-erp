// ════════════════════════════════════════════════════════════════════════════════
// FLEET MANAGEMENT SAAS — Advanced Analytics & Intelligence
// ════════════════════════════════════════════════════════════════════════════════
// Gestión profesional de flotas mixtas con IA de consumo

const http = require('http');

// ════════════════════════════════════════════════════════════════════════════════
// HELPER: Fetch from Supabase
// ════════════════════════════════════════════════════════════════════════════════
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
      timeout: 15000
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

// ════════════════════════════════════════════════════════════════════════════════
// 1. CALCULATE CONSUMPTION DEVIATION (Desvío Estándar)
// ════════════════════════════════════════════════════════════════════════════════
async function calculateConsumptionDeviation(sbUrl, sbKey, vehicleId) {
  try {
    // Obtener últimos 6 meses de logs para este vehículo
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

    const url = `${sbUrl}/rest/v1/fuel_logs?vehicle_id=eq.${vehicleId}&date=gte.${sixMonthsAgoStr}&order=date.asc&select=*`;
    const response = await supabaseFetch(url, {}, sbUrl, sbKey);

    if (response.status !== 200 || !response.data || response.data.length < 2) {
      return {
        success: false,
        message: 'Datos insuficientes para calcular desviación'
      };
    }

    const logs = response.data;
    let efficiencies = [];

    // Calcular eficiencia km/L para cada registro
    for (let i = 1; i < logs.length; i++) {
      if (logs[i].liters && logs[i].liters > 0) {
        const kmDriven = logs[i].odometer_reading - logs[i - 1].odometer_reading;
        const efficiency = kmDriven / parseFloat(logs[i].liters);
        efficiencies.push(efficiency);
      }
    }

    if (efficiencies.length < 2) {
      return { success: false, message: 'Eficiencias insuficientes' };
    }

    // Calcular promedio y desvío estándar
    const mean = efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length;
    const variance = efficiencies.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / efficiencies.length;
    const stdDev = Math.sqrt(variance);

    // Último valor
    const lastEfficiency = efficiencies[efficiencies.length - 1];
    const deviationPercent = ((lastEfficiency - mean) / mean) * 100;

    console.log(`✅ [Fleet] Desviación consumo calculada: ${stdDev.toFixed(2)} (${deviationPercent.toFixed(1)}%)`);

    return {
      success: true,
      mean: parseFloat(mean.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      lastEfficiency: parseFloat(lastEfficiency.toFixed(2)),
      deviationPercent: parseFloat(deviationPercent.toFixed(1)),
      isAnomalous: Math.abs(deviationPercent) > 15,  // >15% es anomalía
      recordCount: efficiencies.length
    };
  } catch (err) {
    console.error('❌ [Fleet] Error calculando desviación:', err.message);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// 2. CHECK & CREATE MAINTENANCE ALERTS
// ════════════════════════════════════════════════════════════════════════════════
async function checkAndCreateMaintenanceAlerts(sbUrl, sbKey, vehicleId, fuelLogId) {
  try {
    const deviation = await calculateConsumptionDeviation(sbUrl, sbKey, vehicleId);

    if (!deviation.success) {
      return { success: false, alerts: [] };
    }

    const alerts = [];

    // ALERTA 1: Desviación de consumo
    if (deviation.isAnomalous) {
      const severity = Math.abs(deviation.deviationPercent) > 25 ? 'critical' : 'warning';
      const message = deviation.deviationPercent > 0
        ? `Consumo INCREMENTADO ${deviation.deviationPercent.toFixed(1)}% — Revisar motor/neumáticos`
        : `Consumo REDUCIDO ${Math.abs(deviation.deviationPercent).toFixed(1)}% — Mejora detectada`;

      const alert = {
        alert_type: 'consumption_deviation',
        severity,
        message,
        metric_name: 'km/L',
        expected_value: deviation.mean,
        actual_value: deviation.lastEfficiency,
        deviation_percent: deviation.deviationPercent,
        vehicle_id: vehicleId,
        fuel_log_id: fuelLogId
      };

      alerts.push(alert);
    }

    // Crear alertas en BD
    if (alerts.length > 0) {
      for (const alert of alerts) {
        const url = `${sbUrl}/rest/v1/maintenance_alerts`;
        const response = await supabaseFetch(url, {
          method: 'POST',
          body: alert,
          headers: { 'Prefer': 'return=representation' }
        }, sbUrl, sbKey);

        if (response.status === 201) {
          console.log(`✅ [Fleet] Alerta creada: ${alert.alert_type}`);
        }
      }
    }

    return { success: true, alerts, deviationData: deviation };
  } catch (err) {
    console.error('❌ [Fleet] Error creando alertas:', err.message);
    return { success: false, error: err.message, alerts: [] };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// 3. CALCULATE ELECTRIC/HYBRID EFFICIENCY
// ════════════════════════════════════════════════════════════════════════════════
async function calculateElectricEfficiency(sbUrl, sbKey, vehicleId) {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

    const url = `${sbUrl}/rest/v1/fuel_logs?vehicle_id=eq.${vehicleId}&date=gte.${sixMonthsAgoStr}&select=*`;
    const response = await supabaseFetch(url, {}, sbUrl, sbKey);

    if (response.status !== 200 || !response.data) {
      return { success: false, message: 'Sin datos eléctricos' };
    }

    const logs = response.data;
    let efficiencies = [];

    // Calcular km/kWh para cada registro
    for (let i = 1; i < logs.length; i++) {
      if (logs[i].kwh && logs[i].kwh > 0) {
        const kmDriven = logs[i].odometer_reading - logs[i - 1].odometer_reading;
        const efficiency = kmDriven / parseFloat(logs[i].kwh);
        efficiencies.push(efficiency);
      }
    }

    if (efficiencies.length === 0) {
      return { success: false, message: 'Sin registros eléctricos' };
    }

    const mean = efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length;
    const totalKwh = logs.reduce((sum, log) => sum + (parseFloat(log.kwh) || 0), 0);
    const totalCost = logs.reduce((sum, log) => sum + (log.kwh ? log.total_cost : 0), 0);

    console.log(`✅ [Fleet] Eficiencia eléctrica: ${mean.toFixed(2)} km/kWh`);

    return {
      success: true,
      avg_km_per_kwh: parseFloat(mean.toFixed(2)),
      total_kwh: parseFloat(totalKwh.toFixed(2)),
      total_cost_electric: totalCost,
      cost_per_km: parseFloat((totalCost / (mean * totalKwh)).toFixed(2))
    };
  } catch (err) {
    console.error('❌ [Fleet] Error eléctrico:', err.message);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// 4. SEASONAL FORECAST ENGINE (Pronóstico con estacionalidad)
// ════════════════════════════════════════════════════════════════════════════════
async function forecastWithSeasonality(sbUrl, sbKey, vehicleId) {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

    const url = `${sbUrl}/rest/v1/fuel_logs?vehicle_id=eq.${vehicleId}&date=gte.${sixMonthsAgoStr}&order=date.asc&select=*`;
    const response = await supabaseFetch(url, {}, sbUrl, sbKey);

    if (response.status !== 200 || !response.data) {
      return { success: false, message: 'Sin datos históricos' };
    }

    const logs = response.data;

    // Agrupar por mes
    const monthlyData = {};
    logs.forEach(log => {
      const month = new Date(log.date).toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyData[month]) {
        monthlyData[month] = { cost: 0, count: 0 };
      }
      monthlyData[month].cost += log.total_cost;
      monthlyData[month].count += 1;
    });

    const monthlyAverages = Object.values(monthlyData).map(m => m.cost / m.count);
    const overallAverage = monthlyAverages.reduce((a, b) => a + b, 0) / monthlyAverages.length;

    // Calcular pesos estacionales (picos)
    const seasonalWeights = monthlyAverages.map(avg => avg / overallAverage);
    const nextMonthIndex = new Date().getMonth();
    const seasonalFactor = seasonalWeights[nextMonthIndex] || 1.0;

    // Forecast: promedio * factor estacional * buffer
    const baseForecast = overallAverage * seasonalFactor;
    const forecastWithBuffer = Math.round(baseForecast * 1.05); // 5% buffer

    // Confianza basada en cantidad de datos
    let confidence = 'low';
    if (logs.length >= 24) confidence = 'high';
    else if (logs.length >= 12) confidence = 'medium';

    console.log(`🔮 [Fleet] Pronóstico estacional: ₲${forecastWithBuffer} (factor: ${seasonalFactor.toFixed(2)})`);

    return {
      success: true,
      forecast: forecastWithBuffer,
      base_forecast: Math.round(baseForecast),
      seasonal_factor: parseFloat(seasonalFactor.toFixed(2)),
      confidence,
      monthly_average: Math.round(overallAverage),
      record_count: logs.length
    };
  } catch (err) {
    console.error('❌ [Fleet] Error en forecast:', err.message);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// 5. GET FLEET OVERVIEW (Resumen de toda la flota)
// ════════════════════════════════════════════════════════════════════════════════
async function getFleetOverview(sbUrl, sbKey, userId) {
  try {
    const vehiclesUrl = `${sbUrl}/rest/v1/vehicles?user_id=eq.${userId}&is_active=eq.true&select=*`;
    const vehiclesResponse = await supabaseFetch(vehiclesUrl, {}, sbUrl, sbKey);

    if (vehiclesResponse.status !== 200 || !vehiclesResponse.data) {
      return { success: false, vehicles: [] };
    }

    const vehicles = vehiclesResponse.data;
    const overviews = [];

    for (const vehicle of vehicles) {
      // Obtener stats de 6 meses
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

      const logsUrl = `${sbUrl}/rest/v1/fuel_logs?vehicle_id=eq.${vehicle.id}&date=gte.${sixMonthsAgoStr}&select=*`;
      const logsResponse = await supabaseFetch(logsUrl, {}, sbUrl, sbKey);

      if (logsResponse.status !== 200) continue;

      const logs = logsResponse.data || [];
      const totalCost = logs.reduce((sum, log) => sum + log.total_cost, 0);
      const totalLiters = logs.reduce((sum, log) => sum + (parseFloat(log.liters) || 0), 0);

      let vehicleOverview = {
        vehicle_id: vehicle.id,
        nickname: vehicle.nickname || `${vehicle.brand} ${vehicle.model}`,
        engine_type: vehicle.engine_type,
        total_cost_6m: totalCost,
        total_liters_6m: totalLiters,
        avg_efficiency: totalLiters > 0 ? 0 : null,
        logs_count: logs.length
      };

      // Calcular eficiencia
      if (totalLiters > 0 && logs.length > 1) {
        let totalKm = 0;
        for (let i = 1; i < logs.length; i++) {
          totalKm += logs[i].odometer_reading - logs[i - 1].odometer_reading;
        }
        vehicleOverview.avg_efficiency = parseFloat((totalKm / totalLiters).toFixed(2));
      }

      // Obtener forecast
      const forecast = await forecastWithSeasonality(sbUrl, sbKey, vehicle.id);
      if (forecast.success) {
        vehicleOverview.monthly_forecast = forecast.forecast;
      }

      overviews.push(vehicleOverview);
    }

    console.log(`✅ [Fleet] Overview generado para ${vehicles.length} vehículos`);

    return {
      success: true,
      total_vehicles: vehicles.length,
      fleet_overview: overviews,
      total_fleet_cost: overviews.reduce((sum, o) => sum + o.total_cost_6m, 0)
    };
  } catch (err) {
    console.error('❌ [Fleet] Error en fleet overview:', err.message);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// 6. SETTLE FUEL LOGS BATCH (Liquidación masiva)
// ════════════════════════════════════════════════════════════════════════════════
async function settleFuelBatch(sbUrl, sbKey, userId, fuelLogIds) {
  try {
    console.log(`🔄 [Fleet] Liquidando batch de ${fuelLogIds.length} cargas...`);

    // Crear registro de batch
    const batchData = {
      user_id: userId,
      batch_date: new Date().toISOString().split('T')[0],
      fuel_log_ids: fuelLogIds,
      total_logs_processed: fuelLogIds.length,
      status: 'processing'
    };

    const batchUrl = `${sbUrl}/rest/v1/settle_batches`;
    const batchResponse = await supabaseFetch(batchUrl, {
      method: 'POST',
      body: batchData,
      headers: { 'Prefer': 'return=representation' }
    }, sbUrl, sbKey);

    if (batchResponse.status !== 201) {
      return { success: false, error: 'Error creando batch' };
    }

    const batchId = batchResponse.data[0].id;
    const transactions = [];
    let totalCost = 0;
    let failedCount = 0;

    // Procesar cada log
    for (const fuelLogId of fuelLogIds) {
      try {
        // Obtener el fuel log
        const logUrl = `${sbUrl}/rest/v1/fuel_logs?id=eq.${fuelLogId}&select=*`;
        const logResponse = await supabaseFetch(logUrl, {}, sbUrl, sbKey);

        if (logResponse.status !== 200 || !logResponse.data || logResponse.data.length === 0) {
          failedCount++;
          continue;
        }

        const fuelLog = logResponse.data[0];

        // Obtener información del vehículo
        const vehicleUrl = `${sbUrl}/rest/v1/vehicles?id=eq.${fuelLog.vehicle_id}&select=*`;
        const vehicleResponse = await supabaseFetch(vehicleUrl, {}, sbUrl, sbKey);

        if (vehicleResponse.status !== 200 || !vehicleResponse.data) {
          failedCount++;
          continue;
        }

        const vehicle = vehicleResponse.data[0];

        // Crear transacción
        const transactionData = {
          user_id: userId,
          type: 'expense',
          description: `⛽ ${vehicle.nickname || vehicle.brand} ${vehicle.model} - ${fuelLog.liters || fuelLog.kwh}${fuelLog.liters ? 'L' : 'kWh'} en ${fuelLog.location || 'Surtidor'}`,
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
          failedCount++;
          continue;
        }

        const transaction = txResponse.data[0];

        // Actualizar fuel_log como liquidado
        const updateUrl = `${sbUrl}/rest/v1/fuel_logs?id=eq.${fuelLogId}`;
        await supabaseFetch(updateUrl, {
          method: 'PATCH',
          body: {
            is_settled: true,
            settled_at: new Date().toISOString(),
            settled_by_transaction_id: transaction.id
          }
        }, sbUrl, sbKey);

        transactions.push(transaction.id);
        totalCost += fuelLog.total_cost;
      } catch (err) {
        console.warn(`⚠️  [Fleet] Error procesando log ${fuelLogId}:`, err.message);
        failedCount++;
      }
    }

    // Actualizar batch como completado
    const updateBatchUrl = `${sbUrl}/rest/v1/settle_batches?id=eq.${batchId}`;
    await supabaseFetch(updateBatchUrl, {
      method: 'PATCH',
      body: {
        status: 'completed',
        transactions_created: transactions.length,
        total_cost: totalCost,
        processed_at: new Date().toISOString()
      }
    }, sbUrl, sbKey);

    console.log(`✅ [Fleet] Batch completado: ${transactions.length} transacciones, ₲${totalCost}`);

    return {
      success: true,
      batch_id: batchId,
      total_processed: fuelLogIds.length,
      successful: transactions.length,
      failed: failedCount,
      total_cost: totalCost,
      transactions: transactions
    };
  } catch (err) {
    console.error('❌ [Fleet] Error en settle batch:', err.message);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// 7. CREATE VEHICLE
// ════════════════════════════════════════════════════════════════════════════════
async function createVehicle(sbUrl, sbKey, vehicleData) {
  try {
    const data = {
      vin: vehicleData.vin,
      plate: vehicleData.plate,
      nickname: vehicleData.nickname,
      brand: vehicleData.brand,
      model: vehicleData.model,
      year: vehicleData.year,
      engine_type: vehicleData.engine_type,
      displacement: vehicleData.displacement || null,
      fuel_capacity: vehicleData.fuel_capacity || null,
      battery_capacity: vehicleData.battery_capacity || null,
      electric_only: vehicleData.engine_type === 'Eléctrico',
      expected_km_per_liter: vehicleData.expected_km_per_liter,
      expected_km_per_kwh: vehicleData.expected_km_per_kwh
    };

    const url = `${sbUrl}/rest/v1/vehicles`;
    const response = await supabaseFetch(url, {
      method: 'POST',
      body: data,
      headers: { 'Prefer': 'return=representation' }
    }, sbUrl, sbKey);

    if (response.status !== 201) {
      return { success: false, error: response.data };
    }

    console.log(`✅ [Fleet] Vehículo creado: ${data.nickname}`);
    return { success: true, vehicle: response.data[0] };
  } catch (err) {
    console.error('❌ [Fleet] Error creando vehículo:', err.message);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// 8. SEED DATA — Generar datos de prueba (6 meses de historial)
// ════════════════════════════════════════════════════════════════════════════════
async function seedFleetData(sbUrl, sbKey, userId) {
  try {
    console.log(`🌱 [Fleet] Iniciando seed data para usuario ${userId}`);

    // 1. CREAR VEHÍCULOS
    const vehicles = [
      {
        user_id: userId,
        vin: 'KNDJN241XF7123456',
        plate: 'ABC-123',
        nickname: 'Kia Sportage Personal',
        brand: 'Kia',
        model: 'Sportage',
        year: 2014,
        engine_type: 'Diésel',
        displacement: 2000,
        fuel_capacity: 70,
        expected_km_per_liter: 8.5,
        last_maintenance_date: '2025-10-01',
        maintenance_interval_km: 10000,
        is_active: true,
        notes: 'Vehículo personal para ciudad - Consumo estable'
      },
      {
        user_id: userId,
        vin: 'HND1500CC000001',
        plate: 'MOTO-001',
        nickname: 'Moto Entregas',
        brand: 'Honda',
        model: '150cc',
        year: 2020,
        engine_type: 'Nafta',
        displacement: 150,
        fuel_capacity: 8,
        expected_km_per_liter: 45,
        last_maintenance_date: '2025-10-15',
        maintenance_interval_km: 5000,
        is_active: true,
        notes: 'Para entregas rápidas de relojes'
      },
      {
        user_id: userId,
        vin: 'VOL2800DS000001',
        plate: 'TRUCK-001',
        nickname: 'Camioneta Logística',
        brand: 'Volvo',
        model: 'FH16',
        year: 2018,
        engine_type: 'Diésel',
        displacement: 2800,
        fuel_capacity: 80,
        expected_km_per_liter: 6.5,
        last_maintenance_date: '2025-10-20',
        maintenance_interval_km: 12000,
        is_active: true,
        notes: 'Vehículo para logística pesada'
      }
    ];

    const vehiclesUrl = `${sbUrl}/rest/v1/vehicles`;
    const vehiclesResponse = await supabaseFetch(vehiclesUrl, {
      method: 'POST',
      body: vehicles,
      headers: { 'Prefer': 'return=representation' }
    }, sbUrl, sbKey);

    if (vehiclesResponse.status !== 201) {
      throw new Error(`Error insertando vehículos: ${vehiclesResponse.data}`);
    }

    const createdVehicles = vehiclesResponse.data;
    const kiaId = createdVehicles.find(v => v.vin === 'KNDJN241XF7123456')?.id;
    const motoId = createdVehicles.find(v => v.vin === 'HND1500CC000001')?.id;
    const truckId = createdVehicles.find(v => v.vin === 'VOL2800DS000001')?.id;

    console.log(`✅ [Fleet] Vehículos creados: 3`);

    // 2. GENERAR FUEL_LOGS
    const fuelLogs = [];

    // KIA SPORTAGE - 24 cargas
    const kiaLogsData = [
      { date: '2025-10-07', liters: 35.2, odo: 5320, settled: false },
      { date: '2025-10-14', liters: 34.8, odo: 5600, settled: false },
      { date: '2025-10-21', liters: 36.1, odo: 5900, settled: false },
      { date: '2025-10-28', liters: 35.5, odo: 6200, settled: false },
      { date: '2025-11-04', liters: 34.9, odo: 6480, settled: false },
      { date: '2025-11-11', liters: 35.7, odo: 6800, settled: false },
      { date: '2025-11-18', liters: 36.2, odo: 7100, settled: false },
      { date: '2025-11-25', liters: 35.4, odo: 7380, settled: false },
      { date: '2025-12-02', liters: 35.8, odo: 7680, settled: true },
      { date: '2025-12-09', liters: 36.3, odo: 7960, settled: true },
      { date: '2025-12-16', liters: 35.9, odo: 8240, settled: true },
      { date: '2025-12-23', liters: 36.5, odo: 8520, settled: true },
      { date: '2026-01-06', liters: 35.1, odo: 8850, settled: true },
      { date: '2026-01-13', liters: 34.6, odo: 9120, settled: true },
      { date: '2026-01-20', liters: 35.9, odo: 9410, settled: true },
      { date: '2026-01-27', liters: 36.2, odo: 9690, settled: true },
      { date: '2026-02-03', liters: 35.4, odo: 9980, settled: true },
      { date: '2026-02-10', liters: 35.8, odo: 10260, settled: true },
      { date: '2026-02-17', liters: 34.9, odo: 10530, settled: true },
      { date: '2026-02-24', liters: 36.1, odo: 10820, settled: true },
      { date: '2026-03-03', liters: 35.6, odo: 11110, settled: false },
      { date: '2026-03-10', liters: 36.2, odo: 11400, settled: false },
      { date: '2026-03-17', liters: 35.3, odo: 11680, settled: false },
      { date: '2026-03-24', liters: 34.7, odo: 11950, settled: false }
    ];

    kiaLogsData.forEach(log => {
      fuelLogs.push({
        user_id: userId,
        vehicle_id: kiaId,
        date: log.date,
        liters: log.liters,
        odometer_reading: log.odo,
        cost: parseFloat((log.liters * 9.5).toFixed(2)),
        fuel_type: 'Diésel',
        cost_per_unit: 9.5,
        is_settled: log.settled,
        notes: `Kia - ${log.settled ? 'Liquidado' : 'Pendiente'}`
      });
    });

    // MOTO 150CC - 24 cargas
    const motoLogsData = [
      { date: '2025-10-06', liters: 5.2, odo: 2150, settled: false },
      { date: '2025-10-13', liters: 5.0, odo: 2380, settled: false },
      { date: '2025-10-20', liters: 5.3, odo: 2610, settled: false },
      { date: '2025-10-27', liters: 4.9, odo: 2820, settled: false },
      { date: '2025-11-03', liters: 5.1, odo: 3050, settled: false },
      { date: '2025-11-10', liters: 5.4, odo: 3280, settled: false },
      { date: '2025-11-17', liters: 5.2, odo: 3510, settled: false },
      { date: '2025-11-24', liters: 5.0, odo: 3720, settled: false },
      { date: '2025-12-01', liters: 5.3, odo: 3950, settled: true },
      { date: '2025-12-08', liters: 5.1, odo: 4180, settled: true },
      { date: '2025-12-15', liters: 5.2, odo: 4410, settled: true },
      { date: '2025-12-22', liters: 5.0, odo: 4620, settled: true },
      { date: '2026-01-05', liters: 5.1, odo: 4850, settled: true },
      { date: '2026-01-12', liters: 5.3, odo: 5080, settled: true },
      { date: '2026-01-19', liters: 4.9, odo: 5290, settled: true },
      { date: '2026-01-26', liters: 5.2, odo: 5520, settled: true },
      { date: '2026-02-02', liters: 5.0, odo: 5750, settled: true },
      { date: '2026-02-09', liters: 5.1, odo: 5980, settled: true },
      { date: '2026-02-16', liters: 5.3, odo: 6210, settled: true },
      { date: '2026-02-23', liters: 5.2, odo: 6440, settled: true },
      { date: '2026-03-02', liters: 5.0, odo: 6670, settled: false },
      { date: '2026-03-09', liters: 5.1, odo: 6900, settled: false },
      { date: '2026-03-16', liters: 5.3, odo: 7130, settled: false },
      { date: '2026-03-23', liters: 5.2, odo: 7360, settled: false }
    ];

    motoLogsData.forEach(log => {
      fuelLogs.push({
        user_id: userId,
        vehicle_id: motoId,
        date: log.date,
        liters: log.liters,
        odometer_reading: log.odo,
        cost: parseFloat((log.liters * 8.75).toFixed(2)),
        fuel_type: 'Nafta',
        cost_per_unit: 8.75,
        is_settled: log.settled,
        notes: `Moto - ${log.settled ? 'Liquidada' : 'Pendiente'}`
      });
    });

    // CAMIONETA VOLVO - 24 cargas (con +20% en diciembre)
    const truckLogsData = [
      { date: '2025-10-08', liters: 52.3, odo: 15420, settled: false },
      { date: '2025-10-15', liters: 54.1, odo: 15850, settled: false },
      { date: '2025-10-22', liters: 53.7, odo: 16280, settled: false },
      { date: '2025-10-29', liters: 55.2, odo: 16720, settled: false },
      { date: '2025-11-05', liters: 53.8, odo: 17150, settled: false },
      { date: '2025-11-12', liters: 54.5, odo: 17590, settled: false },
      { date: '2025-11-19', liters: 52.9, odo: 18020, settled: false },
      { date: '2025-11-26', liters: 55.0, odo: 18450, settled: false },
      // DICIEMBRE: +20% por fiestas/tráfico
      { date: '2025-12-03', liters: 65.2, odo: 18920, settled: true },
      { date: '2025-12-10', liters: 63.8, odo: 19370, settled: true },
      { date: '2025-12-17', liters: 66.1, odo: 19840, settled: true },
      { date: '2025-12-24', liters: 64.5, odo: 20280, settled: true },
      { date: '2026-01-07', liters: 53.2, odo: 20750, settled: true },
      { date: '2026-01-14', liters: 54.7, odo: 21180, settled: true },
      { date: '2026-01-21', liters: 55.3, odo: 21620, settled: true },
      { date: '2026-01-28', liters: 53.9, odo: 22050, settled: true },
      { date: '2026-02-04', liters: 52.4, odo: 22480, settled: true },
      { date: '2026-02-11', liters: 53.6, odo: 22910, settled: true },
      { date: '2026-02-18', liters: 54.2, odo: 23350, settled: true },
      { date: '2026-02-25', liters: 53.0, odo: 23780, settled: true },
      { date: '2026-03-04', liters: 52.8, odo: 24210, settled: false },
      { date: '2026-03-11', liters: 54.1, odo: 24650, settled: false },
      { date: '2026-03-18', liters: 53.5, odo: 25080, settled: false },
      { date: '2026-03-25', liters: 55.0, odo: 25520, settled: false }
    ];

    truckLogsData.forEach(log => {
      fuelLogs.push({
        user_id: userId,
        vehicle_id: truckId,
        date: log.date,
        liters: log.liters,
        odometer_reading: log.odo,
        cost: parseFloat((log.liters * 9.5).toFixed(2)),
        fuel_type: 'Diésel',
        cost_per_unit: 9.5,
        is_settled: log.settled,
        notes: `Camioneta - ${log.settled ? 'Liquidada' : 'Pendiente'}`
      });
    });

    // 3. INSERTAR FUEL_LOGS EN LOTES
    const BATCH_SIZE = 50;
    let insertedCount = 0;

    for (let i = 0; i < fuelLogs.length; i += BATCH_SIZE) {
      const batch = fuelLogs.slice(i, i + BATCH_SIZE);
      const logsUrl = `${sbUrl}/rest/v1/fuel_logs`;
      const logsResponse = await supabaseFetch(logsUrl, {
        method: 'POST',
        body: batch,
        headers: { 'Prefer': 'return=representation' }
      }, sbUrl, sbKey);

      if (logsResponse.status !== 201) {
        console.warn(`⚠️ Error en lote ${i / BATCH_SIZE + 1}: ${logsResponse.data}`);
      } else {
        insertedCount += batch.length;
      }
    }

    console.log(`✅ [Fleet] Fuel logs insertados: ${insertedCount}`);

    const settled = fuelLogs.filter(f => f.is_settled).length;
    const pending = fuelLogs.filter(f => !f.is_settled).length;
    const totalCost = fuelLogs.reduce((sum, f) => sum + f.cost, 0);

    return {
      success: true,
      summary: {
        vehicles_created: 3,
        fuel_logs_created: insertedCount,
        settled: settled,
        pending: pending,
        total_cost: parseFloat(totalCost.toFixed(2))
      }
    };
  } catch (err) {
    console.error('❌ [Fleet] Error en seed data:', err.message);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════════════
module.exports = {
  calculateConsumptionDeviation,
  checkAndCreateMaintenanceAlerts,
  calculateElectricEfficiency,
  forecastWithSeasonality,
  getFleetOverview,
  settleFuelBatch,
  createVehicle,
  seedFleetData
};
