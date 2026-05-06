// CD & Co ERP — Sure CSV Exporter
// Exports txs + sales from Supabase to the exact CSV format Sure expects:
//   date*,amount*,name,currency,category,tags,account,notes
//
// Design:
//   - Fetches txs, sales, contacts, accounts in parallel (read-only)
//   - Per-source error isolation: one failing table never aborts the export
//   - Currency normalisation: '$'→USD, '₲'→PYG, '€'→EUR
//   - Date normalisation: YYYY-MM-DD → MM/DD/YYYY (Sure requires MM/DD/YYYY)
//   - Amounts: txs already signed; sales always positive (income)

'use strict';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Converts YYYY-MM-DD → MM/DD/YYYY */
function toSureDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
}

/** Maps CD&Co currency symbol → ISO code Sure expects */
function normCurrency(cur) {
  if (!cur) return '';
  const map = { '$': 'USD', '₲': 'PYG', '€': 'EUR', 'G': 'PYG', 'Gs': 'PYG' };
  return map[cur] || cur.toUpperCase();
}

/** RFC-4180 CSV field: wrap in quotes if needed, escape inner quotes */
function csvField(val) {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Serialise array of row-objects to CSV text */
function rowsToCsv(rows) {
  const HEADER = 'date*,amount*,name,currency,category,tags,account,notes';
  const lines = rows.map(r => [
    csvField(r.date),
    csvField(r.amount),
    csvField(r.name),
    csvField(r.currency),
    csvField(r.category),
    csvField(r.tags),
    csvField(r.account),
    csvField(r.notes),
  ].join(','));
  return HEADER + '\n' + lines.join('\n');
}

// ── Supabase fetcher ───────────────────────────────────────────────────────

async function sbFetch(sbUrl, sbKey, table, filter, select = '*') {
  const url = `${sbUrl}/rest/v1/${table}?${filter}&select=${encodeURIComponent(select)}&order=created_at.asc`;
  const res = await fetch(url, {
    headers: {
      'apikey': sbKey,
      'Authorization': `Bearer ${sbKey}`,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ── Mapping ────────────────────────────────────────────────────────────────

function mapTxs(txs, accountsMap) {
  return txs.map(t => ({
    date:     toSureDate(t.date),
    amount:   t.amount,               // already signed in DB
    name:     t.desc || '',
    currency: normCurrency(t.cur || t.currency),
    category: t.cat || '',
    tags:     '',
    account:  accountsMap[t.account_id]?.name || '',
    notes:    t.id || '',
  }));
}

function mapSales(sales, contactsMap) {
  return sales.map(s => {
    const client = contactsMap[s.client_id]?.name || '';
    const noteParts = [s.nro_factura, s.notes, s.id].filter(Boolean);
    return {
      date:     toSureDate(s.date),
      amount:   s.total,              // sales are always income (positive)
      name:     client || 'Venta',
      currency: normCurrency(s.cur),
      category: 'Venta',
      tags:     s.condicion || '',
      account:  s.method || '',
      notes:    noteParts.join(' | '),
    };
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

async function exportSureCsv(userId, sbUrl, sbKey) {
  if (!userId) throw new Error('userId requerido');
  if (!sbUrl || !sbKey) throw new Error('SUPABASE_URL y SUPABASE_ANON_KEY requeridos');

  const uid = `user_id=eq.${userId}`;

  // Fetch all four tables concurrently
  const [txs, sales, contacts, accounts] = await Promise.all([
    sbFetch(sbUrl, sbKey, 'txs',      uid).catch(() => []),
    sbFetch(sbUrl, sbKey, 'sales',    uid).catch(() => []),
    sbFetch(sbUrl, sbKey, 'contacts', uid, 'id,name').catch(() => []),
    sbFetch(sbUrl, sbKey, 'accounts', uid, 'id,name,type').catch(() => []),
  ]);

  // Index lookup maps
  const contactsMap = Object.fromEntries(contacts.map(c => [c.id, c]));
  const accountsMap = Object.fromEntries(accounts.map(a => [a.id, a]));

  // Map and merge — sales first (income), then txs (expenses + misc income)
  const rows = [
    ...mapSales(sales, contactsMap),
    ...mapTxs(txs, accountsMap),
  ].sort((a, b) => {
    // Sort by date ascending (MM/DD/YYYY → Date comparison via original sort)
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return 0;
  });

  return {
    csv:      rowsToCsv(rows),
    rowCount: rows.length,
    txCount:  txs.length,
    saleCount: sales.length,
  };
}

function sureCsvFilename(userId) {
  const date    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const shortId = userId.slice(0, 8);
  return `sure_import_${date}_${shortId}.csv`;
}

// ── HTTP handler (simple-server.js) ───────────────────────────────────────
// GET /api/export-sure-csv?user_id=<uuid>

async function handleSureCsvRequest(pathname, method, queryParams, envVars) {
  if (pathname !== '/api/export-sure-csv' || method !== 'GET') return null;

  const userId = queryParams.user_id;
  if (!userId) {
    return _json(400, { success: false, error: 'user_id query param requerido' });
  }

  const sbUrl = envVars.SUPABASE_URL;
  const sbKey = envVars.SUPABASE_ANON_KEY;

  if (!sbUrl || !sbKey) {
    return _json(503, { success: false, error: 'Supabase no configurado en .env.local' });
  }

  try {
    const { csv, rowCount, txCount, saleCount } = await exportSureCsv(userId, sbUrl, sbKey);
    const filename = sureCsvFilename(userId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Rows':       String(rowCount),
        'X-Export-Txs':        String(txCount),
        'X-Export-Sales':      String(saleCount),
      },
      body: csv,
    };
  } catch (err) {
    console.error('[sure-csv-exporter] error:', err.message);
    return _json(500, { success: false, error: err.message });
  }
}

function _json(status, obj) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

module.exports = { exportSureCsv, handleSureCsvRequest, sureCsvFilename };
