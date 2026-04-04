// Vercel Serverless Function — Goals API
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
    console.error('[Goals] Variables de entorno faltantes');
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
    console.error('[Goals] Error verificando JWT:', e.message);
    return res.status(500).json({ error: 'Error interno' });
  }

  const headers = {
    'apikey':        SB_SERVICE_KEY,
    'Authorization': `Bearer ${SB_SERVICE_KEY}`
  };

  if (req.method === 'GET') {
    // GET /api/goals — retorna objetivos del usuario actual
    try {
      const res2 = await fetch(
        `${SB_URL}/rest/v1/goals?user_id=eq.${user.id}&select=*`,
        { headers }
      );
      const goals = await res2.json().catch(() => []);
      console.log(`[Goals] GET ${user.id}: ${Array.isArray(goals) ? goals.length : 0} resultados`);
      return res.status(200).json({
        ok: true,
        data: Array.isArray(goals) ? goals : []
      });
    } catch (e) {
      console.error('[Goals] GET error:', e.message);
      return res.status(500).json({ error: 'Error al obtener objetivos' });
    }
  }

  if (req.method === 'POST') {
    // POST /api/goals — crea objetivo para el usuario actual
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { name, description, target_value, deadline } = body || {};

    if (!name) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    try {
      const payload = { user_id: user.id, name, description, target_value, deadline };
      const res2 = await fetch(
        `${SB_URL}/rest/v1/goals`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
          body: JSON.stringify(payload)
        }
      );
      const goal = await res2.json().catch(() => ({}));
      console.log(`[Goals] POST ${user.id}: objetivo creado`);
      return res.status(201).json({ ok: true, data: goal });
    } catch (e) {
      console.error('[Goals] POST error:', e.message);
      return res.status(500).json({ error: 'Error al crear objetivo' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
