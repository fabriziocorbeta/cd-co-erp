// Vercel Serverless Function — Admin Panel API
// ⚠️  Usa SUPABASE_SERVICE_ROLE_KEY (nunca exponer en frontend)
// Doble verificación: JWT válido + role = 'admin' en profiles

const ADMIN_EMAIL = 'fabriziocorbeta@gmail.com';

// Fetch seguro: retorna [] si la respuesta no es un array válido
async function safeFetch(url, headers) {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[Admin] Supabase ${res.status} → ${url}`, JSON.stringify(err));
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      console.error(`[Admin] Respuesta no es array para ${url}:`, JSON.stringify(data));
      return [];
    }
    return data;
  } catch (e) {
    console.error(`[Admin] Exception en safeFetch(${url}):`, e.message);
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Extraer JWT del header ──────────────────────────────────────────
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado — token requerido' });
  }
  const jwt = auth.split(' ')[1];

  const SB_URL         = process.env.SUPABASE_URL;
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SB_URL || !SB_SERVICE_KEY) {
    console.error('[Admin] Variables de entorno faltantes: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Variables de entorno no configuradas' });
  }

  // ── 2. Verificar JWT con Supabase Auth ─────────────────────────────────
  let user;
  try {
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${jwt}` }
    });
    if (!userRes.ok) {
      const err = await userRes.json().catch(() => ({}));
      console.error('[Admin] JWT inválido:', JSON.stringify(err));
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }
    user = await userRes.json();
  } catch (e) {
    console.error('[Admin] Exception verificando JWT:', e.message);
    return res.status(500).json({ error: 'Error interno al verificar sesión' });
  }

  // ── 3. Verificar acceso admin ────────────────────────────────────────────
  // Primero verificar por email (fallback rápido); luego chequear role en profiles
  const isEmailAdmin = user.email === ADMIN_EMAIL;

  if (!isEmailAdmin) {
    // Solo hace la consulta si no es el email admin para ahorrar un round-trip
    const profileRes = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`,
      {
        headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}` }
      }
    );
    const profiles = await profileRes.json().catch(() => []);
    const role     = Array.isArray(profiles) ? profiles?.[0]?.role : null;
    if (role !== 'admin') {
      console.error(`[Admin] Acceso denegado para ${user.email} (role: ${role})`);
      return res.status(403).json({ error: 'Acceso denegado — se requiere rol admin' });
    }
  }

  // ── 4. Obtener datos agregados (solo el admin llega hasta aquí) ─────────
  const headers = {
    'apikey':        SB_SERVICE_KEY,
    'Authorization': `Bearer ${SB_SERVICE_KEY}`
  };

  console.log(`[Admin] Cargando datos para ${user.email}...`);

  const [users, txs, products] = await Promise.all([
    // Lista de usuarios — select=* para tolerar columnas opcionales (role puede no existir)
    safeFetch(`${SB_URL}/rest/v1/profiles?select=*&order=created_at.desc`, headers),
    // Todas las transacciones para calcular patrimonio neto global
    safeFetch(`${SB_URL}/rest/v1/transactions?select=type,amount,currency`, headers),
    // Inventario — sin columna 'cur' que no existe en el schema
    safeFetch(`${SB_URL}/rest/v1/products?select=name,stock,sell_price,category`, headers)
  ]);

  console.log(`[Admin] Datos: ${users.length} usuarios, ${txs.length} txs, ${products.length} productos`);

  // Calcular patrimonio global: suma neta por moneda
  // Soporta ambas convenciones: montos con signo (expense=-) y montos positivos con type field
  const patrimonio = { USD: 0, PYG: 0 };
  txs.forEach(t => {
    const rawAmt = parseFloat(t.amount) || 0;
    const cur    = (t.currency || '$').toUpperCase();

    let contribution;
    if (rawAmt < 0) {
      // Convención "signed amount": negativo = gasto, positivo = ingreso
      contribution = rawAmt;
    } else {
      // Convención "type field": type=income suma, type=expense resta
      const sign = t.type === 'income' ? 1 : -1;
      contribution = sign * rawAmt;
    }

    if (cur === '$' || cur === 'USD') patrimonio.USD += contribution;
    else                              patrimonio.PYG += contribution;
  });

  // Inventario total
  const inventario = products.reduce((acc, p) => {
    acc.totalUnidades  += (p.stock || 0);
    acc.valorTotal     += (p.stock || 0) * (parseFloat(p.sell_price) || 0);
    acc.totalProductos += 1;
    return acc;
  }, { totalUnidades: 0, valorTotal: 0, totalProductos: 0 });

  return res.status(200).json({
    ok:          true,
    admin_email: user.email,
    patrimonio,
    inventario,
    usuarios: users.map(u => ({
      id:         u.id,
      email:      u.email      || '',
      plan:       u.plan       || 'free',
      role:       u.role       || 'user',
      created_at: u.created_at || null
    })),
    generated_at: new Date().toISOString()
  });
}
