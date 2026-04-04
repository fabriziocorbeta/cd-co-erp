// Vercel Serverless Function — Admin Panel API
// ⚠️  Usa SUPABASE_SERVICE_ROLE_KEY (nunca exponer en frontend)
// Doble verificación: JWT válido + role = 'admin' en profiles

const ADMIN_EMAIL = 'fabriziocorbeta@gmail.com';

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
    return res.status(500).json({ error: 'Variables de entorno no configuradas' });
  }

  // ── 2. Verificar JWT con Supabase Auth ─────────────────────────────────
  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: {
      'apikey':        SB_SERVICE_KEY,
      'Authorization': `Bearer ${jwt}`
    }
  });

  if (!userRes.ok) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  const user = await userRes.json();

  // ── 3. Verificar role admin en profiles ────────────────────────────────
  const profileRes = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,email`,
    {
      headers: {
        'apikey':        SB_SERVICE_KEY,
        'Authorization': `Bearer ${SB_SERVICE_KEY}`
      }
    }
  );
  const profiles = await profileRes.json();
  const profile  = profiles?.[0];

  const isAdmin = profile?.role === 'admin' || user.email === ADMIN_EMAIL;
  if (!isAdmin) {
    return res.status(403).json({ error: 'Acceso denegado — se requiere rol admin' });
  }

  // ── 4. Obtener datos agregados (solo el admin llega hasta aquí) ─────────
  const headers = {
    'apikey':        SB_SERVICE_KEY,
    'Authorization': `Bearer ${SB_SERVICE_KEY}`
  };

  const [usersRes, txsRes, productsRes] = await Promise.all([
    // Lista de usuarios
    fetch(`${SB_URL}/rest/v1/profiles?select=id,email,plan,role,created_at&order=created_at.desc`, { headers }),
    // Suma global de transacciones por tipo
    fetch(`${SB_URL}/rest/v1/transactions?select=type,amount,currency`, { headers }),
    // Inventario total de productos
    fetch(`${SB_URL}/rest/v1/products?select=name,stock,sell_price,cur,category`, { headers })
  ]);

  const [users, txs, products] = await Promise.all([
    usersRes.json(),
    txsRes.json(),
    productsRes.json()
  ]);

  // Calcular patrimonio global: ingresos - gastos en USD y en PYG
  const patrimonio = { USD: 0, PYG: 0 };
  (txs || []).forEach(t => {
    const sign  = t.type === 'income' ? 1 : -1;
    const amt   = parseFloat(t.amount) || 0;
    const cur   = t.currency || '$';
    if (cur === '$' || cur === 'USD') patrimonio.USD += sign * amt;
    else                              patrimonio.PYG += sign * amt;
  });

  // Inventario total
  const inventario = (products || []).reduce((acc, p) => {
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
    usuarios:    (users || []).map(u => ({
      id:         u.id,
      email:      u.email,
      plan:       u.plan    || 'free',
      role:       u.role    || 'user',
      created_at: u.created_at
    })),
    generated_at: new Date().toISOString()
  });
}
