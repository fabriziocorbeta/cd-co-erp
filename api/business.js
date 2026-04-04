// Vercel Serverless Function — Business Info API
// ⚠️  Multi-tenant: filtra por user_id extraído del JWT

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Extraer y verificar JWT ────────────────────────────────────────────
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado — token requerido' });
  }
  const jwt = auth.split(' ')[1];

  const SB_URL         = process.env.SUPABASE_URL;
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SB_URL || !SB_SERVICE_KEY) {
    console.error('[Business] Variables de entorno faltantes');
    return res.status(500).json({ error: 'Configuración incompleta' });
  }

  let user;
  try {
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${jwt}` }
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    user = await userRes.json();
  } catch (e) {
    console.error('[Business] Error verificando JWT:', e.message);
    return res.status(500).json({ error: 'Error interno' });
  }

  const headers = {
    'apikey':        SB_SERVICE_KEY,
    'Authorization': `Bearer ${SB_SERVICE_KEY}`
  };

  if (req.method === 'GET') {
    // GET /api/business — retorna info de negocio del usuario actual
    try {
      const res2 = await fetch(
        `${SB_URL}/rest/v1/business_info?user_id=eq.${user.id}&select=*`,
        { headers }
      );
      const info = await res2.json().catch(() => []);
      console.log(`[Business] GET ${user.id}: ${Array.isArray(info) && info.length > 0 ? 'encontrado' : 'vacío'}`);
      return res.status(200).json({
        ok: true,
        data: Array.isArray(info) ? (info[0] || null) : null
      });
    } catch (e) {
      console.error('[Business] GET error:', e.message);
      return res.status(500).json({ error: 'Error al obtener info de negocio' });
    }
  }

  if (req.method === 'POST') {
    // POST /api/business — crea/actualiza info de negocio del usuario actual
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { company_name, description, industry } = body || {};

    try {
      const payload = { user_id: user.id, company_name, description, industry };
      const res2 = await fetch(
        `${SB_URL}/rest/v1/business_info`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
          body: JSON.stringify(payload)
        }
      );
      const data = await res2.json().catch(() => ({}));
      console.log(`[Business] POST ${user.id}: info actualizada`);
      return res.status(201).json({ ok: true, data });
    } catch (e) {
      console.error('[Business] POST error:', e.message);
      return res.status(500).json({ error: 'Error al guardar info de negocio' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
