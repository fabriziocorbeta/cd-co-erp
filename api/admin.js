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
  const ALLOWED_ORIGINS = ['https://cd-co-hub.vercel.app', 'http://localhost:3000'];
  const origin = req.headers.origin || '';

  // CORS enforcement:
  // - If Origin header is present and NOT in the allowlist → 403 (cross-origin attack)
  // - If Origin header is absent → allow through to JWT check.
  //   Browsers ALWAYS send Origin for cross-origin requests; absence means same-origin
  //   or a server-to-server call (Service Worker re-fetch, Vercel internal, curl, etc.)
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Set CORS headers for browser requests that did send an Origin
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

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

  // ── 4a. PATCH — Actualizar producto desde el panel admin ────────────────
  // Permite al admin ajustar stock/precio de cualquier producto de cualquier usuario.
  // Escribe directamente a Supabase con service_role_key (bypasa RLS).
  // El ERP verá el cambio en la próxima carga porque lee la misma tabla.
  if (req.method === 'PATCH') {
    const { productId, stock, sell_price, buy_price } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'productId requerido' });

    const patch = {};
    if (stock !== undefined)      patch.stock      = parseInt(stock)       ?? undefined;
    if (sell_price !== undefined) patch.sell_price = parseFloat(sell_price) ?? undefined;
    if (buy_price  !== undefined) patch.buy_price  = parseFloat(buy_price)  ?? undefined;

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Ningún campo para actualizar' });

    const patchRes = await fetch(
      `${SB_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey':        SB_SERVICE_KEY,
          'Authorization': `Bearer ${SB_SERVICE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=representation'
        },
        body: JSON.stringify(patch)
      }
    );

    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({}));
      console.error('[Admin PATCH product]', err);
      return res.status(patchRes.status).json({ error: 'Error al actualizar producto', detail: err });
    }

    const updated = await patchRes.json();
    console.log(`[Admin] Producto ${productId} actualizado por ${user.email}:`, patch);
    return res.status(200).json({ ok: true, product: updated[0] || null });
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
      plan:       u.plan_type  || u.plan || 'free',
      role:       u.role       || 'user',
      created_at: u.created_at || null
    })),
    generated_at: new Date().toISOString()
  });
}
