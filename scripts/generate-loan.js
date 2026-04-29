#!/usr/bin/env node
/**
 * scripts/generate-loan.js
 * CD & Co ERP — Generador de préstamos con tabla de amortización
 *
 * Uso:
 *   node scripts/generate-loan.js \
 *     --capital    10000 \
 *     --tasa       2 \          ← tasa mensual en % (2 = 2% mensual)
 *     --cuotas     12 \
 *     --sistema    frances \    ← 'frances' | 'aleman'
 *     --descripcion "Préstamo BNF" \
 *     --fecha-inicio 2026-05-01 \
 *     --moneda     $ \
 *     --user-id    <UUID> \
 *     [--creditor-id <contact_id>] \
 *     [--apply]                 ← escribe en Supabase (sin --apply: dry-run)
 *
 * Env vars requeridas:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { calcularSistemaFrances, calcularSistemaAleman, resumenPrestamo }
  from '../utils/amortization.js';

// ── Args ──────────────────────────────────────────────────────────────────────
const argv    = process.argv.slice(2);
const arg     = (f) => { const i = argv.indexOf(f); return i !== -1 ? argv[i + 1] : null; };
const hasFlag = (f) => argv.includes(f);

const CAPITAL       = parseFloat(arg('--capital')   || '0');
const TASA_PCT      = parseFloat(arg('--tasa')      || '0');  // en %
const CUOTAS        = parseInt(arg('--cuotas')      || '0');
const SISTEMA       = (arg('--sistema') || '').toLowerCase();
const DESCRIPCION   = arg('--descripcion') || 'Préstamo sin descripción';
const FECHA_INICIO  = arg('--fecha-inicio') || '';
const MONEDA        = arg('--moneda')      || '$';
const USER_ID       = arg('--user-id')     || '';
const CREDITOR_ID   = arg('--creditor-id') || null;
const APPLY         = hasFlag('--apply');

const TASA_MENSUAL  = TASA_PCT / 100;  // convertir % → decimal

// ── Env vars ──────────────────────────────────────────────────────────────────
const SB_URL         = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Validate ──────────────────────────────────────────────────────────────────
function validate() {
  const err = [];
  if (!CAPITAL || CAPITAL <= 0)           err.push('--capital debe ser > 0');
  if (!TASA_PCT || TASA_PCT <= 0)         err.push('--tasa debe ser > 0 (en %)');
  if (!CUOTAS || CUOTAS <= 0)             err.push('--cuotas debe ser > 0');
  if (!['frances', 'aleman'].includes(SISTEMA))
                                          err.push('--sistema debe ser: frances | aleman');
  if (!FECHA_INICIO || !/^\d{4}-\d{2}-\d{2}$/.test(FECHA_INICIO))
                                          err.push('--fecha-inicio debe ser YYYY-MM-DD');
  if (!USER_ID)                           err.push('--user-id requerido');
  if (APPLY && (!SB_URL || !SB_SERVICE_KEY))
                                          err.push('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (env) requeridos con --apply');
  if (err.length) {
    console.error('Errores:\n  ' + err.join('\n  '));
    process.exit(1);
  }
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
const SB_HEADERS = {
  'apikey':        SB_SERVICE_KEY,
  'Authorization': `Bearer ${SB_SERVICE_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
};

async function sbFetch(path, opts = {}) {
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...opts,
    headers: { ...SB_HEADERS, ...(opts.headers || {}) },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Supabase ${r.status} ${path}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

// ── ID generator ──────────────────────────────────────────────────────────────
const uid = (pfx) => `${pfx}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ── Calcular fechas de vencimiento ────────────────────────────────────────────
// Suma N meses a una fecha YYYY-MM-DD (respeta días de fin de mes)
function sumarMes(fechaStr, meses) {
  const [y, m, d] = fechaStr.split('-').map(Number);
  const dt = new Date(y, m - 1 + meses, d);
  // Si el día se desbordó (ej. 31 de febrero), retrocede al último día del mes
  if (dt.getDate() !== d) dt.setDate(0);
  return dt.toISOString().slice(0, 10);
}

// ── Imprimir tabla ────────────────────────────────────────────────────────────
function printTabla(tabla, resumen, moneda) {
  const fmt = (n) => n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const w   = (s, n) => String(s).padStart(n);
  const wl  = (s, n) => String(s).padEnd(n);

  const line = '─'.repeat(80);
  console.log(`\n${line}`);
  console.log(wl('Cuota', 7) + w('Saldo Ini.', 14) + w('Amortiz.', 14) +
              w('Intereses', 14) + w('Cuota Tot.', 14) + w('Saldo Fin.', 14));
  console.log(line);

  for (const r of tabla) {
    console.log(
      wl(r.num_cuota, 7) +
      w(fmt(r.saldo_inicial), 14) +
      w(fmt(r.amortizacion),  14) +
      w(fmt(r.intereses),     14) +
      w(fmt(r.cuota_total),   14) +
      w(fmt(r.saldo_final),   14)
    );
  }

  console.log(line);
  console.log(`Total pagado:      ${moneda} ${fmt(resumen.total_pagado)}`);
  console.log(`Total capital:     ${moneda} ${fmt(resumen.total_capital)}`);
  console.log(`Total intereses:   ${moneda} ${fmt(resumen.total_intereses)}`);
  console.log(`Costo financiero:  ${resumen.costo_financiero_pct}% sobre capital`);
  console.log(line);
}

// ── Guardar en Supabase ───────────────────────────────────────────────────────
async function guardarEnDB(tabla) {
  const prestamoId = uid('prs');

  // 1. Insertar cabecera
  console.log('\n[DB] Insertando cabecera del préstamo...');
  await sbFetch('/prestamos', {
    method: 'POST',
    body: JSON.stringify({
      id:           prestamoId,
      user_id:      USER_ID,
      descripcion:  DESCRIPCION,
      creditor_id:  CREDITOR_ID,
      capital:      CAPITAL,
      tasa_mensual: TASA_MENSUAL,
      cuotas_total: CUOTAS,
      sistema:      SISTEMA,
      fecha_inicio: FECHA_INICIO,
      moneda:       MONEDA,
      estado:       'activo',
      cuotas_pagadas: 0,
    }),
  });
  console.log(`[DB] Préstamo creado: ${prestamoId}`);

  // 2. Insertar cuotas en batch
  const cuotasRows = tabla.map((r) => ({
    id:                uid('cta'),
    user_id:           USER_ID,
    prestamo_id:       prestamoId,
    num_cuota:         r.num_cuota,
    fecha_vencimiento: sumarMes(FECHA_INICIO, r.num_cuota - 1),
    saldo_inicial:     r.saldo_inicial,
    amortizacion:      r.amortizacion,
    intereses:         r.intereses,
    cuota_total:       r.cuota_total,
    saldo_final:       r.saldo_final,
    estado:            'pendiente',
  }));

  console.log(`[DB] Insertando ${cuotasRows.length} cuotas...`);
  await sbFetch('/cuotas_prestamos', {
    method: 'POST',
    body:   JSON.stringify(cuotasRows),
  });
  console.log(`[DB] ${cuotasRows.length} cuotas insertadas.`);

  return prestamoId;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  validate();

  // Calcular tabla de amortización
  const calcFn = SISTEMA === 'frances' ? calcularSistemaFrances : calcularSistemaAleman;
  const tabla  = calcFn(CAPITAL, TASA_MENSUAL, CUOTAS);
  const resumen = resumenPrestamo(tabla);

  // Imprimir encabezado
  const line = '─'.repeat(80);
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`TABLA DE AMORTIZACIÓN — SISTEMA ${SISTEMA.toUpperCase()}`);
  console.log('═'.repeat(80));
  console.log(`Descripción:   ${DESCRIPCION}`);
  console.log(`Capital:       ${MONEDA} ${CAPITAL.toLocaleString('es-PY')}`);
  console.log(`Tasa mensual:  ${TASA_PCT}%  (${(TASA_PCT * 12).toFixed(2)}% TNA)`);
  console.log(`Cuotas:        ${CUOTAS}`);
  console.log(`Primer vto.:   ${FECHA_INICIO}`);
  console.log(`Modo:          ${APPLY ? '✔  APPLY — escritura en Supabase' : '⬜ DRY-RUN — sin cambios'}`);

  // Imprimir tabla
  printTabla(tabla, resumen, MONEDA);

  // Guardar en DB si --apply
  if (APPLY) {
    const prestamoId = await guardarEnDB(tabla);
    console.log(`\n✔ Préstamo guardado. ID: ${prestamoId}`);
  } else {
    console.log('\n→ Dry-run. Agregar --apply para escribir en Supabase.');
  }
}

main().catch(err => {
  console.error('\n[ERROR]', err.message);
  process.exit(1);
});
