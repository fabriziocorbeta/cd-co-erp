// Vercel Serverless Function — Actualizar Plan de Usuario
// ⚠️  Solo el admin puede ejecutar este endpoint
// Verifica JWT + email admin antes de cualquier escritura

const ADMIN_EMAIL   = 'fabriziocorbeta@gmail.com';
const ALLOWED_PLANS = ['free', 'pro', 'socio', 'familiar'];

export default async function handler(req, res) {
  const ALLOWED_ORIGINS = ['https://cd-co-hub.vercel.app', 'http://localhost:3000'];
  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Verificar JWT ───────────────────────────────────────────────────
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado — token requerido' });
  }
  const jwt = auth.split(' ')[1];

  const SB_URL         = process.env.SUPABASE_URL;
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SB_URL || !SB_SERVICE_KEY) {
    console.error('[UpdatePlan] Variables de entorno faltantes');
    return res.status(500).json({ error: 'Variables de entorno no configuradas' });
  }

  // ── 2. Verificar identidad del solicitante ─────────────────────────────
  let caller;
  try {
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${jwt}` }
    });
    if (!userRes.ok) {
      console.error('[UpdatePlan] JWT inválido, status:', userRes.status);
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }
    caller = await userRes.json();
  } catch (e) {
    console.error('[UpdatePlan] Exception verificando JWT:', e.message);
    return res.status(500).json({ error: 'Error interno al verificar sesión' });
  }

  // ── 3. Solo admin puede actualizar planes ──────────────────────────────
  const isAdmin = caller.email === ADMIN_EMAIL;
  if (!isAdmin) {
    // Verificar también por role en profiles
    try {
      const profileRes = await fetch(
        `${SB_URL}/rest/v1/profiles?id=eq.${caller.id}&select=role`,
        { headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}` } }
      );
      const profiles = await profileRes.json().catch(() => []);
      const role = Array.isArray(profiles) ? profiles?.[0]?.role : null;
      if (role !== 'admin') {
        console.error(`[UpdatePlan] Acceso denegado para ${caller.email}`);
        return res.status(403).json({ error: 'Acceso denegado — se requiere rol admin' });
      }
    } catch (e) {
      console.error('[UpdatePlan] Exception verificando role:', e.message);
      return res.status(500).json({ error: 'Error interno al verificar permisos' });
    }
  }

  // ── 4. Validar body ────────────────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Body inválido — se esperaba JSON' });
  }

  const { userId, plan } = body || {};

  if (!userId) {
    return res.status(400).json({ error: 'userId es requerido' });
  }
  if (!plan || !ALLOWED_PLANS.includes(plan)) {
    return res.status(400).json({
      error: `Plan inválido. Valores permitidos: ${ALLOWED_PLANS.join(', ')}`
    });
  }

  // ── 5. Actualizar plan en profiles (PATCH + return=representation) ──────
  // Si el userId no existe, PostgREST devuelve [] — detectamos sin pre-check extra
  try {
    const updateRes = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${userId}`,
      {
        method:  'PATCH',
        headers: {
          'apikey':        SB_SERVICE_KEY,
          'Authorization': `Bearer ${SB_SERVICE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=representation'
        },
        body: JSON.stringify({ plan_type: plan })
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}));
      const errMsg = typeof err === 'string' ? err : JSON.stringify(err);
      console.error(`[UpdatePlan] HTTP ${updateRes.status}: ${errMsg}`);
      return res.status(updateRes.status).json({
        error: 'Error al actualizar el plan en base de datos',
        detail: errMsg
      });
    }

    const updated = await updateRes.json().catch(() => []);
    const rows    = Array.isArray(updated) ? updated : (updated ? [updated] : []);

    if (rows.length === 0) {
      console.error(`[UpdatePlan] Usuario ${userId} no encontrado en profiles`);
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = rows[0];
    console.log(`[UpdatePlan] ✓ Plan de ${user?.email || userId} actualizado a '${plan}' por ${caller.email}`);

    return res.status(200).json({
      ok:   true,
      user: { id: user?.id, email: user?.email, plan: user?.plan_type || user?.plan }
    });

  } catch (e) {
    console.error('[UpdatePlan] Exception al actualizar plan:', e.message);
    return res.status(500).json({ error: 'Error interno del servidor', detail: e.message });
  }
}
