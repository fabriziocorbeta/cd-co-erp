// api/export-data.js — Vercel Serverless Function
// GET /api/export-data?user_id=<uuid>        → descarga JSON completo
// GET /api/export-data?user_id=<uuid>&meta=1 → solo metadatos
//
// Reads SUPABASE_URL + SUPABASE_ANON_KEY from Vercel environment variables.
// Delegates to shared data-exporter module (no duplicate logic).
//
// data-exporter.js is CJS — import via default to avoid named-import issues.

import dataExporter from '../data-exporter.js';

const { exportUserData, exportFilename } = dataExporter;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id: userId, meta } = req.query;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'user_id query param requerido' });
  }

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_ANON_KEY;

  if (!sbUrl || !sbKey) {
    return res.status(503).json({ success: false, error: 'Supabase no configurado en variables de entorno de Vercel' });
  }

  try {
    const exportData = await exportUserData(userId, sbUrl, sbKey);

    // ?meta=1 → metadata only (fast health check, no row data)
    if (meta === '1') {
      return res.status(200).json({ success: true, meta: exportData._meta });
    }

    const filename = exportFilename(userId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Export-Rows',   String(exportData._meta.total_rows));
    res.setHeader('X-Export-Errors', String(exportData._meta.tables_with_errors.length));
    return res.status(200).send(JSON.stringify(exportData, null, 2));

  } catch (err) {
    console.error('[export-data] exportUserData failed:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
