#!/usr/bin/env node

/**
 * SEED FLOTA — CD & Co ERP
 * ========================
 * Purga y recrea 6 meses de historial de combustible (Oct 2025 – Mar 2026)
 * con parámetros realistas para Paraguay:
 *
 *   - Auto Principal (Kia Sportage 2.0 Flex): 7.5–9.5 km/L · ₲8.000/L · cada 8–10 días
 *   - Moto de Reparto (150cc Nafta):          35–40 km/L  · ₲7.800/L · cada 4–5 días
 *
 * USO (pegar en consola del navegador con la app abierta y logueado):
 *   seedFleet();
 *
 * O como módulo Node.js (solo referencia — los datos van a localStorage):
 *   node scripts/seed-fleet-data.js
 */

// ─────────────────────────────────────────────────────────────────────────────
// PARÁMETROS
// ─────────────────────────────────────────────────────────────────────────────

const KIAK = {
  vehicleId:    'v1',
  fuelPrice:    8000,    // ₲/L
  // 18 cargas: Oct×3 + Nov×3 + Dic×4 (spike) + Ene×3 + Feb×3 + Mar×2
  fills: [
    // [date, liters, kmPerL]
    ['2025-10-03', 48, 8.0],
    ['2025-10-13', 46, 8.3],
    ['2025-10-23', 50, 7.8],
    ['2025-11-03', 45, 8.5],
    ['2025-11-13', 52, 8.1],
    ['2025-11-23', 47, 8.7],
    // Dic: +20 % consumo por calor + rutas navideñas
    ['2025-12-02', 55, 7.5],
    ['2025-12-12', 53, 7.6],
    ['2025-12-21', 54, 7.5],
    ['2025-12-30', 51, 7.8],
    ['2026-01-09', 46, 8.6],
    ['2026-01-19', 48, 8.2],
    ['2026-01-29', 50, 8.4],
    ['2026-02-08', 45, 8.8],
    ['2026-02-18', 47, 9.2],
    ['2026-02-28', 49, 8.5],
    ['2026-03-10', 44, 9.0],
    ['2026-03-20', 48, 8.3],
  ],
  startKm: 98000, // odómetro antes de la primera carga
};

const MOTO = {
  vehicleId: 'v2',
  fuelPrice:  7800,  // ₲/L
  // 34 cargas: Oct×6 + Nov×6 + Dic×6 + Ene×6 + Feb×5 + Mar×5
  fills: [
    ['2025-10-04', 10.5, 37],
    ['2025-10-09', 11.0, 36],
    ['2025-10-14',  9.5, 40],
    ['2025-10-19', 11.5, 38],
    ['2025-10-24', 10.0, 39],
    ['2025-10-29', 11.0, 37],
    ['2025-11-04', 10.5, 38],
    ['2025-11-09', 11.0, 36],
    ['2025-11-14',  9.5, 40],
    ['2025-11-19', 11.5, 37],
    ['2025-11-24', 10.0, 39],
    ['2025-11-29', 11.0, 38],
    ['2025-12-05', 10.5, 37],
    ['2025-12-10', 11.0, 36],
    ['2025-12-15',  9.5, 40],
    ['2025-12-20', 11.5, 38],
    ['2025-12-25', 10.0, 37],
    ['2025-12-30', 11.0, 39],
    ['2026-01-04', 10.5, 38],
    ['2026-01-09', 11.0, 36],
    ['2026-01-14',  9.5, 40],
    ['2026-01-19', 11.5, 37],
    ['2026-01-24', 10.0, 39],
    ['2026-01-29', 11.0, 38],
    ['2026-02-04', 10.5, 37],
    ['2026-02-09', 11.0, 36],
    ['2026-02-14',  9.5, 40],
    ['2026-02-19', 11.5, 38],
    ['2026-02-24', 10.0, 37],
    ['2026-03-02', 11.0, 39],
    ['2026-03-07', 10.5, 38],
    ['2026-03-12', 11.0, 36],
    ['2026-03-17',  9.5, 40],
    ['2026-03-22', 10.0, 37],
  ],
  startKm: 24500,
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERADOR (corre en browser Y en Node para referencia)
// ─────────────────────────────────────────────────────────────────────────────

function buildTransactions(vehicle) {
  const txs = [];
  let km = vehicle.startKm;

  vehicle.fills.forEach(([date, liters, kmPerL]) => {
    km += Math.round(liters * kmPerL);
    const cost = Math.round(liters * vehicle.fuelPrice);
    const ltsStr = Number.isInteger(liters) ? liters.toFixed(1) : liters.toString();
    txs.push({
      id:        '_fuel_' + date.replace(/-/g, '') + '_' + vehicle.vehicleId,
      type:      'expense',
      cat:       'Combustible',
      desc:      `Combustible | Lts: ${ltsStr} | Km: ${km}`,
      amount:    cost,
      cur:       '₲',
      date:      date,
      _sale_id:  vehicle.vehicleId,
    });
  });

  return txs;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL — pegar en consola del navegador
// ─────────────────────────────────────────────────────────────────────────────

function seedFleet() {
  const FUEL_IDS_PREFIX = '_fuel_';
  const FUEL_CATS = ['combustible', 'transporte', 'nafta'];

  // 1. Purga idempotente: solo eliminar lo que este script generó antes.
  //    Conserva transacciones reales del usuario aunque sean de combustible.
  const before = (S.txs || []).length;
  S.txs = (S.txs || []).filter(t => {
    // Generadas por este script (prefijo _fuel_)
    if (t.id && t.id.startsWith(FUEL_IDS_PREFIX)) return false;
    // Generadas por el modal de flota (tiene _sale_id + cat Combustible)
    const cat = (t.cat || '').toLowerCase();
    const isFleetModal = t._sale_id && FUEL_CATS.some(k => cat === k);
    return !isFleetModal;
  });

  // 2. Generar nuevas transacciones
  const kiaFills    = buildTransactions(KIAK);
  const motoFills   = buildTransactions(MOTO);
  const newTxs      = [...kiaFills, ...motoFills];

  S.txs = [...S.txs, ...newTxs];

  // 3. Asegurar nombres de vehículos actualizados
  if (!S.vehicles || !S.vehicles.length) {
    S.vehicles = [
      { id: 'v1', name: 'Auto Principal', icon: '🚗' },
      { id: 'v2', name: 'Moto de Reparto', icon: '🏍️' },
      { id: 'v3', name: 'Camión Utilitario', icon: '🚚' },
    ];
  }

  // 4. Persistir y refrescar
  if (typeof lsave === 'function') lsave();
  if (typeof renderAll === 'function') renderAll();
  if (typeof renderFleet === 'function' && S.curPage === 'fleet') renderFleet();

  // 5. Resumen en consola
  const kiaMonths   = groupByMonth(kiaFills);
  const motoMonths  = groupByMonth(motoFills);

  console.group('🌱 FLEET SEED — COMPLETADO');
  console.log(`Txs eliminadas: ${before - (S.txs.length - newTxs.length)}`);
  console.log(`Txs insertadas: ${newTxs.length} (Kia: ${kiaFills.length} | Moto: ${motoFills.length})`);
  console.log('\n📊 KIAK SPORTAGE FLEX — Mensual (₲):');
  Object.entries(kiaMonths).forEach(([m, v]) =>
    console.log(`   ${m}: ₲${v.toLocaleString('es-PY')} (${v / 8000 / 1000 < 1 ? (v/8000).toFixed(0)+'L' : (v/8000).toFixed(0)+'L'})`));
  console.log('\n🏍️ MOTO NAFTA — Mensual (₲):');
  Object.entries(motoMonths).forEach(([m, v]) =>
    console.log(`   ${m}: ₲${v.toLocaleString('es-PY')}`));
  console.groupEnd();
}

function groupByMonth(txs) {
  return txs.reduce((acc, t) => {
    const m = t.date.substring(0, 7);
    acc[m] = (acc[m] || 0) + t.amount;
    return acc;
  }, {});
}

// buildTransactions se expone globalmente para que seedFleet() funcione en el browser
if (typeof window !== 'undefined') {
  window.seedFleet = seedFleet;
  window.buildTransactions = buildTransactions;
  window.KIAK = KIAK;
  window.MOTO = MOTO;
} else {
  // Node.js: imprimir resumen de los datos que se generarían
  console.log('\n🌱 FLEET SEED — Datos que se generarían:\n');
  const kia  = buildTransactions(KIAK);
  const moto = buildTransactions(MOTO);

  const months = {};
  [...kia, ...moto].forEach(t => {
    const m = t.date.substring(0, 7);
    if (!months[m]) months[m] = { kia: 0, moto: 0 };
    if (t._sale_id === 'v1') months[m].kia  += t.amount;
    else                     months[m].moto += t.amount;
  });

  console.log('Mes        | Kia Flex (₲)  | Moto (₲)     | Total (₲)');
  console.log('-----------|---------------|--------------|----------');
  Object.entries(months).forEach(([m, v]) => {
    const total = v.kia + v.moto;
    console.log(
      `${m} | ${v.kia.toLocaleString('es-PY').padStart(13)} | ${v.moto.toLocaleString('es-PY').padStart(12)} | ${total.toLocaleString('es-PY')}`
    );
  });

  const kiaTotal  = kia.reduce((s, t) => s + t.amount, 0);
  const motoTotal = moto.reduce((s, t) => s + t.amount, 0);
  console.log(`\n  Kia total: ₲${kiaTotal.toLocaleString('es-PY')} (${kia.length} cargas)`);
  console.log(`  Moto total: ₲${motoTotal.toLocaleString('es-PY')} (${moto.length} cargas)`);
  console.log(`\n  → Para ejecutar, pega seedFleet() en la consola del navegador.`);
}
