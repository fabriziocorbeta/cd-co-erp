// api/export-sure-csv.js — Vercel Serverless Function
// GET /api/export-sure-csv?user_id=<uuid>
// Returns a Sure-compatible CSV attachment.

import sureCsvExporter from '../sure-csv-exporter.js';

const { exportSureCsv, sureCsvFilename } = sureCsvExporter;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id: userId } = req.query;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'user_id query param requerido' });
  }

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_ANON_KEY;

  if (!sbUrl || !sbKey) {
    return res.status(503).json({ success: false, error: 'Supabase no configurado en variables de entorno de Vercel' });
  }

  try {
    const { csv, rowCount, txCount, saleCount } = await exportSureCsv(userId, sbUrl, sbKey);
    const filename = sureCsvFilename(userId);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Export-Rows',  String(rowCount));
    res.setHeader('X-Export-Txs',   String(txCount));
    res.setHeader('X-Export-Sales', String(saleCount));
    return res.status(200).send(csv);

  } catch (err) {
    console.error('[export-sure-csv] error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
