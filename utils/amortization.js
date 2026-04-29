/**
 * utils/amortization.js
 * CD & Co ERP — Funciones de amortización de préstamos
 *
 * Exporta:
 *   calcularSistemaFrances(capital, tasaMensual, cuotas) → Array<CuotaDetalle>
 *   calcularSistemaAleman(capital, tasaMensual, cuotas)  → Array<CuotaDetalle>
 *
 * CuotaDetalle: {
 *   num_cuota:    number,   // 1-based
 *   saldo_inicial: number,
 *   amortizacion:  number,
 *   intereses:     number,
 *   cuota_total:   number,
 *   saldo_final:   number,
 * }
 *
 * Parámetros:
 *   capital     — monto original del préstamo
 *   tasaMensual — tasa mensual en decimal (ej. 0.02 = 2%)
 *   cuotas      — número total de cuotas
 *
 * Redondeo: 2 decimales por fila. La última cuota absorbe diferencia de centavos.
 */

const round2 = (n) => Math.round(n * 100) / 100;

// ── Sistema Francés ───────────────────────────────────────────────────────────
// Cuota fija = Capital × [i(1+i)^n] / [(1+i)^n − 1]
// Cada mes: Intereses = Saldo × i  |  Amortización = Cuota − Intereses
export function calcularSistemaFrances(capital, tasaMensual, cuotas) {
  if (capital <= 0 || tasaMensual <= 0 || cuotas <= 0) {
    throw new Error('calcularSistemaFrances: todos los parámetros deben ser > 0');
  }

  const i = tasaMensual;
  const n = cuotas;

  // Cuota constante (fórmula de anualidad vencida)
  const factor = Math.pow(1 + i, n);
  const cuotaFija = round2(capital * (i * factor) / (factor - 1));

  const tabla = [];
  let saldo = capital;

  for (let k = 1; k <= n; k++) {
    const saldoInicial  = round2(saldo);
    const intereses     = round2(saldoInicial * i);
    let   amortizacion  = round2(cuotaFija - intereses);
    let   cuotaTotal    = cuotaFija;

    // Última cuota: ajustar para cancelar exactamente el saldo residual
    if (k === n) {
      amortizacion = saldoInicial;
      cuotaTotal   = round2(amortizacion + intereses);
    }

    const saldoFinal = round2(Math.max(0, saldoInicial - amortizacion));

    tabla.push({
      num_cuota:    k,
      saldo_inicial: saldoInicial,
      amortizacion,
      intereses,
      cuota_total:  cuotaTotal,
      saldo_final:  saldoFinal,
    });

    saldo = saldoFinal;
  }

  return tabla;
}

// ── Sistema Alemán ────────────────────────────────────────────────────────────
// Amortización fija = Capital / n
// Cuota decreciente = Amortización + (Saldo × i)
export function calcularSistemaAleman(capital, tasaMensual, cuotas) {
  if (capital <= 0 || tasaMensual <= 0 || cuotas <= 0) {
    throw new Error('calcularSistemaAleman: todos los parámetros deben ser > 0');
  }

  const i             = tasaMensual;
  const n             = cuotas;
  const amortFija     = round2(capital / n);

  const tabla = [];
  let saldo = capital;

  for (let k = 1; k <= n; k++) {
    const saldoInicial = round2(saldo);
    const intereses    = round2(saldoInicial * i);

    // Última cuota absorbe centavos residuales
    const amortizacion = k === n ? saldoInicial : amortFija;
    const cuotaTotal   = round2(amortizacion + intereses);
    const saldoFinal   = round2(Math.max(0, saldoInicial - amortizacion));

    tabla.push({
      num_cuota:    k,
      saldo_inicial: saldoInicial,
      amortizacion,
      intereses,
      cuota_total:  cuotaTotal,
      saldo_final:  saldoFinal,
    });

    saldo = saldoFinal;
  }

  return tabla;
}

// ── Resumen financiero (helper) ───────────────────────────────────────────────
export function resumenPrestamo(tabla) {
  const totalPagado    = tabla.reduce((s, r) => s + r.cuota_total,  0);
  const totalIntereses = tabla.reduce((s, r) => s + r.intereses,    0);
  const totalCapital   = tabla.reduce((s, r) => s + r.amortizacion, 0);
  return {
    total_pagado:    round2(totalPagado),
    total_intereses: round2(totalIntereses),
    total_capital:   round2(totalCapital),
    costo_financiero_pct: round2((totalIntereses / totalCapital) * 100),
  };
}
