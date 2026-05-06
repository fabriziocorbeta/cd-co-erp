// CD & Co ERP — Data Exporter
// Mirrors sure's Family::DataExporter pattern:
//   - One async fetcher per table  (sure: private generate_*_csv methods)
//   - Per-table error isolation     (sure: rescue in FamilyDataExportJob)
//   - Structured envelope output   (sure: generate_ndjson with type + data)
//
// Uses native fetch (no npm deps) — consistent with all other server modules.
// @supabase/supabase-js would need a package.json; REST API is equivalent here.

'use strict';

const EXPORT_VERSION = '2';

// ── Tables manifest ────────────────────────────────────────────────────────
// Each entry: { name, select, description }
//   name        → Supabase table name
//   select      → columns to fetch (* = all)
//   description → human label for metadata
//
// Order matters for import portability: parents before children.
const TABLES = [
  { name: 'profiles',           select: 'id,email,full_name,plan,created_at',              description: 'Perfil de usuario' },
  { name: 'contacts',           select: '*',                                                description: 'Clientes y proveedores' },
  { name: 'accounts',           select: '*',                                                description: 'Cuentas bancarias y cajas' },
  { name: 'cards',              select: '*',                                                description: 'Tarjetas de crédito/débito' },
  { name: 'products',           select: '*',                                                description: 'Inventario de productos' },
  { name: 'txs',                select: '*',                                                description: 'Transacciones financieras' },
  { name: 'sales',              select: '*',                                                description: 'Ventas registradas' },
  { name: 'orders',             select: '*',                                                description: 'Pedidos a proveedores' },
  { name: 'budgets',            select: '*',                                                description: 'Presupuestos por categoría' },
  { name: 'subscriptions',      select: '*',                                                description: 'Suscripciones recurrentes' },
  { name: 'debts',              select: '*',                                                description: 'Deudas y cuotas' },
  { name: 'metas',              select: '*',                                                description: 'Metas financieras' },
  { name: 'vehicles',           select: '*',                                                description: 'Vehículos de flota' },
  { name: 'fuel_logs',          select: '*',                                                description: 'Registros de combustible' },
  { name: 'fleet_statistics',   select: '*',                                                description: 'Estadísticas de flota (caché)' },
  { name: 'maintenance_alerts', select: '*',                                                description: 'Alertas de mantenimiento' },
  { name: 'prestamos',          select: '*',                                                description: 'Préstamos (cabecera)' },
  { name: 'cuotas_prestamos',   select: '*',                                                description: 'Cuotas de préstamos (detalle)' },
  { name: 'rule_alerts',        select: '*',                                                description: 'Alertas del motor de reglas' },
  { name: 'rule_runs',          select: '*',                                                description: 'Log de ejecución de reglas' },
];

// ── Core fetcher ───────────────────────────────────────────────────────────
// Mirrors sure's per-table private methods.
// Returns { name, description, count, data, error } — NEVER throws.

async function fetchTable(table, userId, sbUrl, sbKey) {
  const { name, select, description } = table;
  try {
    // profiles uses id=eq instead of user_id=eq (it IS the user row)
    const filter = name === 'profiles'
      ? `id=eq.${userId}`
      : `user_id=eq.${userId}`;

    const url = `${sbUrl}/rest/v1/${name}?${filter}&select=${encodeURIComponent(select)}&order=created_at.asc`;

    const res = await fetch(url, {
      headers: {
        'apikey':        sbKey,
        'Authorization': `Bearer ${sbKey}`,
        'Accept':        'application/json'
      }
    });

    if (!res.ok) {
      // 404 = table doesn't exist yet (e.g. rule_runs) — soft error
      const errText = await res.text();
      return { name, description, count: 0, data: [], error: `HTTP ${res.status}: ${errText.slice(0, 120)}` };
    }

    const data = await res.json();
    return { name, description, count: Array.isArray(data) ? data.length : 0, data: data ?? [], error: null };

  } catch (err) {
    // Network error, JSON parse error, etc. — isolated, export continues
    return { name, description, count: 0, data: [], error: err.message };
  }
}

// ── Main export function ───────────────────────────────────────────────────
// Mirrors sure's Family::DataExporter#generate_export.
// Returns the full JSON object — caller decides encoding/streaming.

async function exportUserData(userId, sbUrl, sbKey) {
  if (!userId) throw new Error('userId requerido');
  if (!sbUrl || !sbKey) throw new Error('SUPABASE_URL y SUPABASE_ANON_KEY requeridos');

  const startedAt = new Date().toISOString();

  // Fire all table fetches concurrently (sure uses find_each sequentially;
  // here parallelism is safe — each query is independent read-only).
  const results = await Promise.all(
    TABLES.map(t => fetchTable(t, userId, sbUrl, sbKey))
  );

  // Build tables map: { tableName: rowsArray }
  const tables = {};
  const counts = {};
  const errors = {};

  for (const result of results) {
    tables[result.name]  = result.data;
    counts[result.name]  = result.count;
    if (result.error) errors[result.name] = result.error;
  }

  const finishedAt  = new Date().toISOString();
  const totalRows   = Object.values(counts).reduce((s, n) => s + n, 0);
  const errorTables = Object.keys(errors);

  return {
    // Envelope — mirrors sure's ndjson type/version wrapper
    _meta: {
      version:          EXPORT_VERSION,
      source:           'cdco-erp',
      exported_at:      startedAt,
      finished_at:      finishedAt,
      user_id:          userId,
      total_rows:       totalRows,
      tables_exported:  results.map(r => r.name),
      row_counts:       counts,
      tables_with_errors: errorTables,
      errors:           errorTables.length > 0 ? errors : undefined
    },
    // Data — one key per table, value is array of rows
    ...tables
  };
}

// ── Filename helper ────────────────────────────────────────────────────────

function exportFilename(userId) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const shortId = userId.slice(0, 8);
  return `cdco_export_${date}_${shortId}.json`;
}

// ── HTTP handler (called from simple-server.js) ────────────────────────────
// GET  /api/export/data?user_id=<uuid>          → download full JSON
// GET  /api/export/data?user_id=<uuid>&meta=1   → metadata only (no rows)

async function handleExportRequest(pathname, method, queryParams, envVars) {
  const sbUrl = envVars.SUPABASE_URL;
  const sbKey = envVars.SUPABASE_ANON_KEY;

  if (pathname !== '/api/export/data' || method !== 'GET') return null;

  const userId = queryParams.user_id;
  if (!userId) {
    return _json(400, { success: false, error: 'user_id query param requerido' });
  }

  if (!sbUrl || !sbKey) {
    return _json(503, { success: false, error: 'Supabase no configurado en .env.local' });
  }

  try {
    const exportData = await exportUserData(userId, sbUrl, sbKey);

    // meta=1 → return only _meta (fast health check, no row data)
    if (queryParams.meta === '1') {
      return _json(200, { success: true, meta: exportData._meta });
    }

    const payload  = JSON.stringify(exportData, null, 2);
    const filename = exportFilename(userId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type':        'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Rows':       String(exportData._meta.total_rows),
        'X-Export-Errors':     String(exportData._meta.tables_with_errors.length)
      },
      body: payload
    };

  } catch (err) {
    console.error('[data-exporter] exportUserData failed:', err.message);
    return _json(500, { success: false, error: err.message });
  }
}

function _json(status, obj) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

module.exports = { exportUserData, handleExportRequest, TABLES };
