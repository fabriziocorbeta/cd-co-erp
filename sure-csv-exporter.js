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

// ── Helpers ────────────────────────────────────────────────────────────────

/** Converts YYYY-MM-DD or ISO timestamp → DD/MM/YYYY (Sure required format) */
function toSureDate(iso) {
  if (!iso) return '';
  // Accepts "2026-04-13", "2026-04-13T00:00:00Z", etc.
  const dateStr = String(iso).slice(0, 10); // take YYYY-MM-DD portion
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
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
  const HEADER = 'date,amount,name,currency,category,tags,account,notes';
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
// jwt: user's access token — when provided, satisfies RLS (auth.uid() = user_id).
// Falls back to sbKey (anon key) which only works if RLS is disabled.

async function sbFetch(sbUrl, sbKey, table, filter, select = '*', jwt = null) {
  const url = `${sbUrl}/rest/v1/${table}?${filter}&select=${encodeURIComponent(select)}&order=created_at.asc`;
  const bearer = jwt || sbKey;
  const res = await fetch(url, {
    headers: {
      'apikey':        sbKey,
      'Authorization': `Bearer ${bearer}`,
      'Accept':        'application/json',
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[sure-csv] ${table} fetch failed HTTP ${res.status}:`, errText.slice(0, 200));
    return [];
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ── Mapping ────────────────────────────────────────────────────────────────

function mapTxs(txs, accountsMap) {
  return txs.map(t => {
    const rawDate = t.date || t.created_at || '';
    return {
      date:     toSureDate(rawDate),
      amount:   t.amount != null ? t.amount : '',  // already signed in DB
      name:     t.desc || t.description || '',
      currency: normCurrency(t.cur || t.currency || ''),
      category: t.cat || t.category || '',
      tags:     '',
      account:  accountsMap[t.account_id]?.name || '',
      notes:    t.id || '',
    };
  });
}

function mapSales(sales, contactsMap) {
  return sales.map(s => {
    const rawDate  = s.date || s.created_at || '';
    const client   = contactsMap[s.client_id]?.name || '';
    const noteParts = [s.nro_factura, s.notes, s.id].filter(Boolean);
    return {
      date:     toSureDate(rawDate),
      amount:   s.total != null ? s.total : '',   // sales are always income (positive)
      name:     client || 'Venta',
      currency: normCurrency(s.cur || ''),
      category: 'Venta',
      tags:     s.condicion || '',
      account:  s.method || '',
      notes:    noteParts.join(' | '),
    };
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

// jwt: optional user access token — required when Supabase RLS is enabled.
async function exportSureCsv(userId, sbUrl, sbKey, jwt = null) {
  if (!userId) throw new Error('userId requerido');
  if (!sbUrl || !sbKey) throw new Error('SUPABASE_URL y SUPABASE_ANON_KEY requeridos');

  console.log(`[sure-csv] exportSureCsv userId=${userId} jwt=${jwt ? 'provided' : 'MISSING — RLS will block'}`);

  const uid = `user_id=eq.${userId}`;

  // Fetch all four tables concurrently
  const [txs, sales, contacts, accounts] = await Promise.all([
    sbFetch(sbUrl, sbKey, 'txs',      uid, '*',         jwt).catch(e => { console.error('[sure-csv] txs error:', e); return []; }),
    sbFetch(sbUrl, sbKey, 'sales',    uid, '*',         jwt).catch(e => { console.error('[sure-csv] sales error:', e); return []; }),
    sbFetch(sbUrl, sbKey, 'contacts', uid, 'id,name',   jwt).catch(e => { console.error('[sure-csv] contacts error:', e); return []; }),
    sbFetch(sbUrl, sbKey, 'accounts', uid, 'id,name,type', jwt).catch(e => { console.error('[sure-csv] accounts error:', e); return []; }),
  ]);

  console.log(`[sure-csv] fetched — txs:${txs.length} sales:${sales.length} contacts:${contacts.length} accounts:${accounts.length}`);

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

// headers: raw request headers object — used to extract Authorization JWT.
async function handleSureCsvRequest(pathname, method, queryParams, envVars, headers = {}) {
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

  // Extract JWT from Authorization header (case-insensitive key lookup)
  const authHeader = headers['authorization'] || headers['Authorization'] || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  try {
    const { csv, rowCount, txCount, saleCount } = await exportSureCsv(userId, sbUrl, sbKey, jwt);
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

export { exportSureCsv, handleSureCsvRequest, sureCsvFilename };
