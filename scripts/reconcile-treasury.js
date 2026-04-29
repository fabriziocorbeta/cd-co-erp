#!/usr/bin/env node
/**
 * scripts/reconcile-treasury.js
 * Agente de Tesorería y Conciliación Bancaria — CD & Co ERP
 *
 * FASE 1 — Extracción LLM: parsea extracto bancario/tarjeta → JSON estructurado
 * FASE 2 — Motor de conciliación: cruza movimientos contra cuentas por cobrar
 *
 * Uso:
 *   node scripts/reconcile-treasury.js \
 *     --statement extractos/visa-marzo-2026.txt \
 *     --entidad   "Visa Continental" \
 *     --tipo      tarjeta \
 *     --periodo   2026-03 \
 *     --user-id   <UUID> \
 *     [--apply]            ← escribe en Supabase (sin --apply: dry-run)
 *     [--tolerance 2]      ← tolerancia de monto en % (default: 2)
 *     [--date-window 30]   ← ventana de fechas en días (default: 30)
 *
 * Env vars requeridas:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from 'fs';
import Anthropic        from '@anthropic-ai/sdk';

// ── Args ──────────────────────────────────────────────────────────────────────
const argv    = process.argv.slice(2);
const arg     = (f) => { const i = argv.indexOf(f); return i !== -1 ? argv[i + 1] : null; };
const hasFlag = (f) => argv.includes(f);

const STATEMENT   = arg('--statement');  // ruta a archivo de extracto
const TEXT_INLINE = arg('--text');       // extracto como string directo (para pruebas)
const ENTIDAD     = arg('--entidad');
const TIPO        = arg('--tipo');
const PERIODO     = arg('--periodo');
const USER_ID     = arg('--user-id');
const APPLY       = hasFlag('--apply');
const TOLERANCE   = parseFloat(arg('--tolerance')   || '2');   // %
const DATE_WINDOW = parseInt(arg('--date-window')   || '30');  // days

// ── Env vars ──────────────────────────────────────────────────────────────────
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const SB_URL         = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Validate ──────────────────────────────────────────────────────────────────
function validate() {
  const missing = [];
  if (!STATEMENT && !TEXT_INLINE) missing.push('--statement <archivo> o --text "<extracto>"');
  if (!ENTIDAD)        missing.push('--entidad');
  if (!TIPO)           missing.push('--tipo');
  if (!PERIODO)        missing.push('--periodo');
  if (!USER_ID)        missing.push('--user-id');
  if (!ANTHROPIC_KEY)  missing.push('ANTHROPIC_API_KEY (env)');
  if (!SB_URL)         missing.push('SUPABASE_URL (env)');
  if (!SB_SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY (env)');
  if (!['tarjeta', 'banco', 'prestamo'].includes(TIPO || '')) {
    missing.push('--tipo debe ser: tarjeta | banco | prestamo');
  }
  if (!/^\d{4}-\d{2}$/.test(PERIODO || '')) {
    missing.push('--periodo debe ser YYYY-MM');
  }
  if (missing.length) {
    console.error('Faltan parámetros:\n  ' + missing.join('\n  '));
    process.exit(1);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = (pfx) => `${pfx}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

async function sbRpc(fn, params) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method:  'POST',
    headers: SB_HEADERS,
    body:    JSON.stringify(params),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Supabase RPC ${fn} ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

// ── FASE 1: Extracción LLM ────────────────────────────────────────────────────
async function extractTransactions(statementText) {
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  const system = `Sos un agente especializado en parsing de extractos bancarios de Paraguay.
Tarea: extraer TODOS los movimientos de crédito (acreditaciones, liquidaciones, depósitos recibidos).
No incluir débitos (cargos, comisiones cobradas, retiros, intereses deudores).
Retornar ÚNICAMENTE JSON válido sin texto adicional:
{
  "moneda": "$",
  "transactions": [
    {
      "fecha": "YYYY-MM-DD",
      "descripcion": "texto literal del movimiento",
      "monto_bruto": 0.00,
      "comisiones": 0.00,
      "retenciones": 0.00,
      "monto_neto": 0.00,
      "numero_referencia": ""
    }
  ]
}
Reglas:
- fecha: convertir a YYYY-MM-DD (el extracto puede tener DD/MM/YYYY o MM/DD/YYYY).
- monto_bruto: antes de deducciones. Si no hay columna, igual a monto_neto.
- comisiones: comisión del procesador/banco. 0 si no aplica.
- retenciones: retención impositiva (IVA, renta). 0 si no aplica.
- monto_neto: lo que acredita efectivamente. Usar columna "neto" o "acreditado" si existe.
- numero_referencia: nro de lote, voucher, operación. String vacío si no hay.
- moneda: "$" para USD, "₲" para guaraníes. Inferir del contexto del extracto.`;

  console.log(`\n[LLM] Extrayendo transacciones (${statementText.length} chars)...`);
  process.stdout.write('[LLM] ');

  const stream = client.messages.stream({
    model:      'claude-opus-4-7',
    max_tokens: 16000,
    thinking:   { type: 'adaptive' },
    system,
    messages: [{
      role:    'user',
      content: `Entidad: ${ENTIDAD}\nTipo: ${TIPO}\nPeríodo: ${PERIODO}\n\nExtracto:\n${statementText}`,
    }],
  });

  stream.on('text', () => process.stdout.write('.'));
  const msg = await stream.getFinalMessage();
  console.log(' OK');

  const text = msg.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('LLM no retornó JSON válido:\n' + text.slice(0, 400));

  return JSON.parse(jsonMatch[0]);
}

// ── FASE 2: Motor de conciliación ─────────────────────────────────────────────
/**
 * Calcula score de match entre una conciliacion y un cobro pendiente.
 * Retorna null si falla algún filtro duro (moneda, monto fuera de tolerancia, fecha lejana).
 * Score mínimo para auto-match: 4 (único candidato) o 6 (múltiples candidatos).
 */
function scoreMatch(concil, cobro) {
  // Filtro duro 1: moneda
  if (concil.moneda !== cobro.moneda) return null;

  // Filtro duro 2: monto dentro de tolerancia
  const pendiente = cobro.monto_total - cobro.monto_cobrado;
  const diff      = Math.abs(pendiente - concil.monto_neto);
  const pct       = pendiente > 0 ? (diff / pendiente) * 100 : 100;
  if (pct > TOLERANCE) return null;

  let score = 0;
  const why = [];

  // Puntaje: monto
  if (pct === 0) { score += 3; why.push('monto exacto'); }
  else           { score += 2; why.push(`monto ±${pct.toFixed(1)}%`); }

  // Puntaje: referencia (match exacto → máximo boost)
  const ref1 = (concil.numero_referencia || '').trim();
  const ref2 = (cobro.numero_referencia  || '').trim();
  if (ref1 && ref2 && ref1 === ref2) {
    score += 3; why.push('referencia exacta');
  }

  // Filtro duro 3: fecha dentro de ventana
  const d1   = new Date(concil.fecha);
  const d2   = new Date(cobro.fecha_venta);
  const days = Math.abs((d1 - d2) / 86400000);
  if (days > DATE_WINDOW) return null;
  if (days <= 3) { score += 2; why.push('fecha ≤3d'); }
  else           { score += 1; why.push(`fecha ${Math.round(days)}d`); }

  return { score, why };
}

function matchAll(transactions, cobros) {
  const pending   = cobros.filter(c => ['Pendiente', 'Parcial'].includes(c.estado));
  const usedCobro = new Set();
  const matched   = [];
  const exception = [];
  const unmatched = [];

  for (const concil of transactions) {
    const candidates = pending
      .filter(c => !usedCobro.has(c.id))
      .map(cobro => {
        const s = scoreMatch(concil, cobro);
        return s ? { cobro, ...s } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    if (!candidates.length) {
      unmatched.push(concil);
    } else if (
      candidates[0].score >= 6 ||
      (candidates.length === 1 && candidates[0].score >= 4)
    ) {
      // Confianza alta → auto-conciliar
      usedCobro.add(candidates[0].cobro.id);
      matched.push({
        concil,
        cobro:  candidates[0].cobro,
        score:  candidates[0].score,
        why:    candidates[0].why,
      });
    } else {
      // Ambiguo → excepción
      exception.push({ concil, candidates: candidates.slice(0, 3) });
    }
  }

  return { matched, exception, unmatched };
}

// ── Escritura en DB ───────────────────────────────────────────────────────────
async function persistResults(transactions, moneda, matchResult) {
  const lote = `${ENTIDAD.toLowerCase().replace(/\s+/g, '-')}-${PERIODO}`;

  // 1. Insertar todos los movimientos extraídos
  const rows = transactions.map(t => ({
    id:                   uid('cb'),
    user_id:              USER_ID,
    entidad:              ENTIDAD,
    tipo:                 TIPO,
    periodo:              PERIODO,
    fecha:                t.fecha,
    descripcion_original: t.descripcion,
    monto_bruto:          t.monto_bruto,
    comisiones:           t.comisiones,
    retenciones:          t.retenciones,
    monto_neto:           t.monto_neto,
    moneda,
    numero_referencia:    t.numero_referencia || null,
    estado:               'Pendiente',
    lote_importacion:     lote,
  }));

  console.log(`\n[DB] Insertando ${rows.length} conciliaciones (lote: ${lote})...`);
  const inserted = await sbFetch('/conciliaciones_bancarias', {
    method: 'POST',
    body:   JSON.stringify(rows),
  });

  // Mapear cada objeto concil → ID insertado por posición (orden preservado por PostgREST)
  const insertedMap = new Map(transactions.map((t, i) => [t, inserted[i].id]));
  const getId = (concil) => insertedMap.get(concil) || null;

  // 2. Auto-conciliar matches de alta confianza
  let conciliados = 0;
  for (const { concil, cobro } of matchResult.matched) {
    const cid = getId(concil);
    if (!cid) { console.warn(`  ⚠ Sin ID para ${concil.fecha} ${concil.monto_neto}`); continue; }
    const result = await sbRpc('marcar_conciliacion', {
      p_concil_id: cid,
      p_cobro_id:  cobro.id,
      p_user_id:   USER_ID,
    });
    if (result?.ok) conciliados++;
    else console.warn(`  ⚠ marcar_conciliacion falló: ${JSON.stringify(result)}`);
  }

  // 3. Marcar excepciones
  const exIds = matchResult.exception.map(({ concil }) => getId(concil)).filter(Boolean);
  if (exIds.length) {
    await sbFetch(
      `/conciliaciones_bancarias?id=in.(${exIds.join(',')})`,
      {
        method:  'PATCH',
        headers: { Prefer: 'return=minimal' },
        body:    JSON.stringify({ estado: 'Excepción a Revisar' }),
      }
    );
  }

  return { lote, conciliados, exceptions: exIds.length };
}

// ── Reporte ───────────────────────────────────────────────────────────────────
function printReport(transactions, cobros, matchResult, dbResult) {
  const line = '─'.repeat(62);
  console.log(`\n${line}`);
  console.log('REPORTE DE CONCILIACIÓN — CD & Co ERP');
  console.log(line);
  console.log(`Entidad:   ${ENTIDAD} (${TIPO})`);
  console.log(`Período:   ${PERIODO}`);
  console.log(`Modo:      ${APPLY ? '✔  APPLY — escritura en DB' : '⬜ DRY-RUN — sin cambios'}`);
  console.log(line);
  console.log(`Movimientos extraídos por LLM:    ${transactions.length}`);
  console.log(`Cobros pendientes en Supabase:    ${cobros.filter(c => ['Pendiente','Parcial'].includes(c.estado)).length}`);
  console.log(line);
  console.log(`✔  Conciliados automáticamente:  ${matchResult.matched.length}`);
  console.log(`⚠  Excepciones a revisar:        ${matchResult.exception.length}`);
  console.log(`?  Sin match (quedan Pendiente): ${matchResult.unmatched.length}`);
  console.log(line);

  if (matchResult.matched.length) {
    console.log('\nMATCHES AUTO-CONCILIADOS:');
    for (const { concil, cobro, score, why } of matchResult.matched) {
      console.log(`  ${concil.fecha}  ${concil.monto_neto.toFixed(2)} ${concil.moneda}`);
      console.log(`    → Cobro ${cobro.id.slice(-10)}  (${cobro.cliente_nombre || cobro.cliente_id || '—'})`);
      console.log(`    Score ${score}  [${why.join(', ')}]`);
    }
  }

  if (matchResult.exception.length) {
    console.log('\nEXCEPCIONES (revisión manual requerida):');
    for (const { concil, candidates } of matchResult.exception) {
      console.log(`  ${concil.fecha}  ${concil.monto_neto.toFixed(2)} ${concil.moneda}  "${concil.descripcion}"`);
      for (const c of candidates) {
        console.log(`    Candidato: ${c.cobro.id.slice(-10)}  score=${c.score}  [${c.why.join(', ')}]`);
      }
    }
  }

  if (matchResult.unmatched.length) {
    console.log('\nSIN MATCH (quedan como Pendiente):');
    for (const t of matchResult.unmatched) {
      console.log(`  ${t.fecha}  ${t.monto_neto.toFixed(2)} ${t.moneda}  "${t.descripcion}"`);
    }
  }

  if (APPLY && dbResult) {
    console.log(`\n[DB] Lote: ${dbResult.lote}`);
    console.log(`[DB] Conciliados: ${dbResult.conciliados} | Excepciones marcadas: ${dbResult.exceptions}`);
  }

  if (!APPLY) {
    console.log('\n→ Dry-run. Agregar --apply para escribir en la base de datos.');
  }

  console.log(line);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  validate();

  // Leer extracto (archivo o inline)
  let statementText;
  if (TEXT_INLINE) {
    statementText = TEXT_INLINE;
  } else {
    try {
      statementText = readFileSync(STATEMENT, 'utf-8');
    } catch (e) {
      console.error(`No se pudo leer: ${STATEMENT}\n${e.message}`);
      process.exit(1);
    }
  }

  // FASE 1: Extracción LLM
  const extracted = await extractTransactions(statementText);
  const { moneda, transactions } = extracted;
  if (!transactions?.length) {
    console.log('[LLM] No se encontraron movimientos de crédito en el extracto.');
    process.exit(0);
  }
  console.log(`[LLM] ${transactions.length} movimientos extraídos (moneda: ${moneda})`);

  // FASE 2: Cargar cobros pendientes
  console.log('\n[DB] Cargando cuentas por cobrar pendientes...');
  const cobros = await sbFetch(
    `/listas_cobros?user_id=eq.${USER_ID}&estado=in.(Pendiente,Parcial)&select=*`
  );
  console.log(`[DB] ${cobros.length} cobros pendientes`);

  // FASE 2: Matching
  const matchResult = matchAll(transactions, cobros);

  // FASE 3: Persistir (solo con --apply)
  let dbResult = null;
  if (APPLY) {
    dbResult = await persistResults(transactions, moneda, matchResult);
  }

  // Reporte final
  printReport(transactions, cobros, matchResult, dbResult);
}

main().catch(err => {
  console.error('\n[ERROR]', err.message);
  process.exit(1);
});
