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

  // Cargar datos necesarios para admin dashboard
  const [users, accounts, products] = await Promise.all([
    // Lista de usuarios
    safeFetch(`${SB_URL}/rest/v1/profiles?select=*&order=created_at.desc`, headers),
    // Cuentas/Saldos para calcular patrimonio global
    safeFetch(`${SB_URL}/rest/v1/accounts?select=*`, headers),
    // Inventario
    safeFetch(`${SB_URL}/rest/v1/products?select=*`, headers)
  ]);

  console.log(`[Admin] Datos: ${users.length} usuarios, ${accounts.length} cuentas, ${products.length} productos`);

  // Calcular patrimonio global desde tabla accounts
  // Sumar balance por moneda (cur)
  const patrimonio = { USD: 0, PYG: 0 };
  accounts.forEach(acc => {
    const balance = parseFloat(acc.balance || 0) || 0;
    const cur = (acc.cur || '$').toUpperCase();

    if (cur === 'USD' || cur === '$') patrimonio.USD += balance;
    else patrimonio.PYG += balance;

    console.log(`[Admin] Account: ${acc.name || 'unknown'} - balance: ${balance} ${cur}`);
  });

  // Inventario total — sumar sell_price × stock para valor total
  const inventario = products.reduce((acc, p) => {
    // Convertir a número, manejar strings y nulls
    const stock = parseInt(p.stock) || parseInt(p.cantidad) || 0;
    const price = parseFloat(p.sell_price) || parseFloat(p.precio_venta) || parseFloat(p.price) || 0;

    // Solo contar productos válidos
    if (stock >= 0 && price >= 0) {
      acc.totalUnidades  += stock;
      acc.valorTotal     += (stock * price);
      acc.totalProductos += 1;
      console.log(`[Admin] Prod: ${p.name || 'unknown'} - stock: ${stock}, sell_price: ${price}, subtotal: ${stock * price}`);
    } else {
      console.warn(`[Admin] Prod inválido ${p.name}: stock=${stock}, price=${price}`);
    }
    return acc;
  }, { totalUnidades: 0, valorTotal: 0, totalProductos: 0 });

  return res.status(200).json({
    ok:          true,
    admin_email: user.email,
    patrimonio,
    inventario,
    productos: products.map(p => ({
      name:       p.name      || '—',
      cat:        p.cat       || p.category || '—',
      stock:      parseInt(p.stock) || 0,
      minStock:   parseInt(p.minStock || p.min_stock) || 2,
      sellPrice:  parseFloat(p.sellPrice || p.sell_price) || 0,
    })),
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
