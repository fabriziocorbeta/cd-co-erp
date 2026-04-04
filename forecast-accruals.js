// ════════════════════════════════════════════════════════════════════════════════
// FORECAST & ACCRUALS — Previsión de Gastos y Devengamiento Automático
// ════════════════════════════════════════════════════════════════════════════════

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
// 1. CALCULATE EXPENSE FORECASTS
// ════════════════════════════════════════════════════════════════════════════════
async function calculateExpenseForecasts(sbUrl, sbKey, userId, currency = '₲') {
  try {
    console.log(`📊 [Forecast] Calculando previsiones para usuario ${userId}`);

    // 1.1 OBTENER GASTOS DE LOS ÚLTIMOS 6 MESES
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startDate = sixMonthsAgo.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const txUrl = `${sbUrl}/rest/v1/transactions?user_id=eq.${userId}&type=eq.expense&date=gte.${startDate}&date=lte.${today}&currency=eq.${currency}`;
    const txResponse = await supabaseFetch(txUrl, {}, sbUrl, sbKey);

    if (txResponse.status !== 200) {
      throw new Error(`Error fetching transactions: ${txResponse.data}`);
    }

    const txs = txResponse.data || [];

    // 1.2 AGRUPAR POR CATEGORÍA Y FECHA (YYYY-MM)
    const expensesByMonth = {};
    txs.forEach(tx => {
      const month = tx.date.substring(0, 7); // YYYY-MM
      const cat = tx.cat || 'Sin Categoría';

      if (!expensesByMonth[month]) expensesByMonth[month] = {};
      expensesByMonth[month][cat] = (expensesByMonth[month][cat] || 0) + (tx.amount || 0);
    });

    // 1.3 CALCULAR PROMEDIO POR CATEGORÍA (6 meses)
    const categoryAverages = {};
    const monthsCount = Object.keys(expensesByMonth).length;

    Object.keys(expensesByMonth).forEach(month => {
      Object.keys(expensesByMonth[month]).forEach(cat => {
        if (!categoryAverages[cat]) categoryAverages[cat] = [];
        categoryAverages[cat].push(expensesByMonth[month][cat]);
      });
    });

    const forecasts = [];
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const forecastDate = nextMonth.toISOString().split('T')[0].substring(0, 7) + '-01';

    Object.keys(categoryAverages).forEach(cat => {
      const amounts = categoryAverages[cat];
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const stdDev = Math.sqrt(amounts.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / amounts.length);
      const confidence = Math.min(100, (monthsCount / 6) * 80 + 20); // Entre 20% y 100%

      forecasts.push({
        user_id: userId,
        category: cat,
        forecast_month: forecastDate,
        average_amount: parseFloat(avg.toFixed(2)),
        last_6m_avg: parseFloat(avg.toFixed(2)),
        confidence_level: parseFloat(confidence.toFixed(1)),
        currency: currency
      });
    });

    // 1.4 ELIMINAR PREVISIONES ANTIGUAS Y INSERTAR NUEVAS
    const deleteUrl = `${sbUrl}/rest/v1/expense_forecasts?user_id=eq.${userId}&forecast_month=eq.${forecastDate}`;
    await supabaseFetch(deleteUrl, { method: 'DELETE' }, sbUrl, sbKey);

    if (forecasts.length > 0) {
      const insertUrl = `${sbUrl}/rest/v1/expense_forecasts`;
      const insertResponse = await supabaseFetch(insertUrl, {
        method: 'POST',
        body: forecasts,
        headers: { 'Prefer': 'return=representation' }
      }, sbUrl, sbKey);

      if (insertResponse.status !== 201) {
        console.warn(`⚠️ [Forecast] Error insertando forecasts: ${insertResponse.data}`);
      }
    }

    console.log(`✅ [Forecast] ${forecasts.length} previsiones calculadas`);

    return {
      success: true,
      forecasts: forecasts,
      forecastDate: forecastDate,
      monthsAnalyzed: monthsCount,
      categoriesCount: forecasts.length
    };
  } catch (err) {
    console.error('❌ [Forecast] Error calculando previsiones:', err.message);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// 2. GET NEXT MONTH FORECAST
// ════════════════════════════════════════════════════════════════════════════════
async function getNextMonthForecast(sbUrl, sbKey, userId, currency = '₲') {
  try {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const forecastDate = nextMonth.toISOString().split('T')[0].substring(0, 7) + '-01';

    const url = `${sbUrl}/rest/v1/expense_forecasts?user_id=eq.${userId}&forecast_month=eq.${forecastDate}&currency=eq.${currency}`;
    const response = await supabaseFetch(url, {}, sbUrl, sbKey);

    if (response.status !== 200) {
      return { success: false, error: response.data };
    }

    const forecasts = response.data || [];
    const totalForecast = forecasts.reduce((sum, f) => sum + (f.average_amount || 0), 0);
    const avgConfidence = forecasts.length > 0
      ? (forecasts.reduce((sum, f) => sum + (f.confidence_level || 0), 0) / forecasts.length)
      : 0;

    return {
      success: true,
      forecastMonth: forecastDate,
      totalBudget: parseFloat(totalForecast.toFixed(2)),
      categories: forecasts,
      averageConfidence: parseFloat(avgConfidence.toFixed(1)),
      categoryCount: forecasts.length
    };
  } catch (err) {
    console.error('❌ [Forecast] Error obteniendo previsión:', err.message);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// 3. PROCESS ACCRUALS (Crear asientos de provisión)
// ════════════════════════════════════════════════════════════════════════════════
async function processAccruals(sbUrl, sbKey, userId, accrualMonth = null, currency = '₲') {
  try {
    console.log(`📝 [Accruals] Procesando provisiones para ${userId}`);

    // Determinar mes de accrual (por defecto, mes actual si es cierre)
    const targetMonth = accrualMonth || new Date().toISOString().split('T')[0].substring(0, 7);
    const firstDayOfMonth = targetMonth + '-01';

    // 3.1 OBTENER PREVISIONES DEL MES
    const forecastUrl = `${sbUrl}/rest/v1/expense_forecasts?user_id=eq.${userId}&forecast_month=eq.${firstDayOfMonth}&currency=eq.${currency}`;
    const forecastResponse = await supabaseFetch(forecastUrl, {}, sbUrl, sbKey);

    if (forecastResponse.status !== 200) {
      throw new Error(`Error fetching forecasts: ${forecastResponse.data}`);
    }

    const forecasts = forecastResponse.data || [];

    // 3.2 VERIFICAR GASTOS REALES DEL MES
    const monthStart = targetMonth + '-01';
    const monthEnd = new Date(targetMonth + '-01');
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(monthEnd.getDate() - 1);
    const monthEndStr = monthEnd.toISOString().split('T')[0];

    const txUrl = `${sbUrl}/rest/v1/transactions?user_id=eq.${userId}&type=eq.expense&date=gte.${monthStart}&date=lte.${monthEndStr}&currency=eq.${currency}`;
    const txResponse = await supabaseFetch(txUrl, {}, sbUrl, sbKey);
    const txs = txResponse.data || [];

    // 3.3 AGRUPAR GASTOS REALES POR CATEGORÍA
    const actualByCategory = {};
    txs.forEach(tx => {
      const cat = tx.cat || 'Sin Categoría';
      actualByCategory[cat] = (actualByCategory[cat] || 0) + (tx.amount || 0);
    });

    // 3.4 CREAR ACCRUALS: Provisión = Previsión - Actual (solo si hay diferencia)
    const accruals = [];
    forecasts.forEach(forecast => {
      const actual = actualByCategory[forecast.category] || 0;
      const provisión = forecast.average_amount - actual;

      if (provisión > 0) { // Solo crear accrual si hay monto pendiente
        accruals.push({
          user_id: userId,
          accrual_month: firstDayOfMonth,
          category: forecast.category,
          description: `Provisión ${forecast.category} - ${targetMonth}`,
          forecasted_amount: forecast.average_amount,
          actual_amount: actual,
          status: 'pending',
          currency: currency
        });
      }
    });

    // 3.5 ELIMINAR ACCRUALS ANTIGUOS Y INSERTAR NUEVOS
    const deleteUrl = `${sbUrl}/rest/v1/accruals?user_id=eq.${userId}&accrual_month=eq.${firstDayOfMonth}&status=eq.pending`;
    await supabaseFetch(deleteUrl, { method: 'DELETE' }, sbUrl, sbKey);

    if (accruals.length > 0) {
      const insertUrl = `${sbUrl}/rest/v1/accruals`;
      const insertResponse = await supabaseFetch(insertUrl, {
        method: 'POST',
        body: accruals,
        headers: { 'Prefer': 'return=representation' }
      }, sbUrl, sbKey);

      if (insertResponse.status !== 201) {
        console.warn(`⚠️ [Accruals] Error insertando accruals: ${insertResponse.data}`);
      }
    }

    const totalAccrual = accruals.reduce((sum, a) => sum + (a.forecasted_amount - a.actual_amount), 0);

    console.log(`✅ [Accruals] ${accruals.length} provisiones creadas por ₲${totalAccrual.toFixed(2)}`);

    return {
      success: true,
      accruals: accruals,
      accrualMonth: targetMonth,
      totalAccrualAmount: parseFloat(totalAccrual.toFixed(2)),
      accrualCount: accruals.length
    };
  } catch (err) {
    console.error('❌ [Accruals] Error procesando provisiones:', err.message);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════════════
module.exports = {
  calculateExpenseForecasts,
  getNextMonthForecast,
  processAccruals
};
