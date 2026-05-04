// Vercel Serverless Function — Shopify Bidirectional Sync
// Auth: Supabase JWT (Authorization: Bearer <token>)
//
// Shopify Auth: Admin API Access Token (Custom App)
//   Obtené el token en: Shopify Admin → Settings → Apps → Develop apps
//   → Create an app → Configure Admin API scopes → Install → "Admin API access token"
//
// Env vars requeridas (Vercel Dashboard → Settings → Environment Variables):
//   SUPABASE_URL              — URL del proyecto Supabase
//   SUPABASE_SERVICE_ROLE_KEY — Service Role Key (solo servidor)
//   SHOPIFY_STORE_DOMAIN      — ej. mi-tienda.myshopify.com  (sin https://)
//   SHOPIFY_ADMIN_TOKEN       — shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//
// Acciones disponibles (POST body: { action, ...payload }):
//   syncStock   — Sincroniza inventario físico de N productos hacia Shopify (batch)
//   syncSku     — Sincroniza 1 SKU (post-venta, fire-and-forget)
//   fetchOrders — Trae órdenes web pagadas/sin procesar de las últimas N horas

const SHOPIFY_API_VERSION = '2024-10';

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — usa POST' });
  }

  // ── Env vars ──────────────────────────────────────────────────────────────
  const SB_URL         = process.env.SUPABASE_URL;
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
  const SHOPIFY_TOKEN  = process.env.SHOPIFY_ADMIN_TOKEN;

  if (!SB_URL || !SB_SERVICE_KEY) {
    return res.status(500).json({ error: 'Configuración de Supabase incompleta' });
  }
  if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
    return res.status(500).json({
      error: 'Shopify no configurado — agregá SHOPIFY_STORE_DOMAIN y SHOPIFY_ADMIN_TOKEN en Vercel → Settings → Environment Variables',
    });
  }
  if (!SHOPIFY_TOKEN.startsWith('shpat_')) {
    console.warn('[ShopifySync] SHOPIFY_ADMIN_TOKEN no comienza con shpat_ — verificá que sea un Admin API Access Token');
  }

  // ── Auth: verificar JWT via Supabase ──────────────────────────────────────
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado — token requerido' });
  }
  const jwt = auth.split(' ')[1];

  let user;
  try {
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: {
        'apikey':        SB_SERVICE_KEY,
        'Authorization': `Bearer ${jwt}`,
      },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Token inválido o expirado' });
    user = await userRes.json();
  } catch (e) {
    console.error('[ShopifySync] JWT verify error:', e.message);
    return res.status(500).json({ error: 'Error interno de autenticación' });
  }

  // ── Shopify helper ────────────────────────────────────────────────────────
  const shopifyBase = `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;

  const shopifyFetch = async (path, opts = {}) => {
    const r = await fetch(`${shopifyBase}${path}`, {
      ...opts,
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type':           'application/json',
        ...(opts.headers || {}),
      },
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '(sin cuerpo)');
      throw new Error(`Shopify ${r.status} ${r.statusText}: ${text.slice(0, 300)}`);
    }
    return r.json();
  };

  // ── Parse body ────────────────────────────────────────────────────────────
  const body   = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const action = body.action;

  // ══════════════════════════════════════════════════════════════════════════
  // ACTION: syncStock | syncSku
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'syncStock' || action === 'syncSku') {
    const products = action === 'syncSku'
      ? [{ sku: body.sku, qty: body.qty }]
      : (body.products || []);

    if (!products.length) {
      return res.status(400).json({ error: 'No hay productos para sincronizar' });
    }

    // Obtener primera ubicación activa (location_id requerido por Shopify)
    let locationId;
    try {
      const locsData = await shopifyFetch('/locations.json?active=true');
      const locs = locsData.locations || [];
      if (!locs.length) throw new Error('No hay ubicaciones activas en Shopify');
      locationId = locs[0].id;
      console.log(`[ShopifySync] location_id=${locationId} (${locs[0].name})`);
    } catch (e) {
      console.error('[ShopifySync] Error obteniendo locations:', e.message);
      return res.status(502).json({ error: `Error obteniendo ubicaciones de Shopify: ${e.message}` });
    }

    const results = { updated: 0, skipped: 0, errors: [] };

    for (const prod of products) {
      if (!prod.sku || prod.sku === '—') { results.skipped++; continue; }

      try {
        const varData  = await shopifyFetch(`/variants.json?sku=${encodeURIComponent(prod.sku)}`);
        const variants = varData.variants || [];

        if (!variants.length) {
          console.log(`[ShopifySync] SKU no encontrado en Shopify: ${prod.sku}`);
          results.skipped++;
          continue;
        }

        await shopifyFetch('/inventory_levels/set.json', {
          method: 'POST',
          body: JSON.stringify({
            location_id:       locationId,
            inventory_item_id: variants[0].inventory_item_id,
            available:         Math.max(0, parseInt(prod.qty) || 0),
          }),
        });

        console.log(`[ShopifySync] ✓ SKU=${prod.sku} → qty=${prod.qty}`);
        results.updated++;
      } catch (e) {
        console.error(`[ShopifySync] ✗ SKU=${prod.sku}:`, e.message);
        results.errors.push({ sku: prod.sku, error: e.message });
      }
    }

    console.log(`[ShopifySync] syncStock user=${user.id}: updated=${results.updated}, skipped=${results.skipped}, errors=${results.errors.length}`);
    return res.status(200).json({ ok: true, ...results });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTION: fetchOrders
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'fetchOrders') {
    const hours = Math.min(parseInt(body.hours) || 24, 168);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    try {
      const ordersData = await shopifyFetch(
        `/orders.json` +
        `?status=any&financial_status=paid&fulfillment_status=unfulfilled` +
        `&created_at_min=${encodeURIComponent(since)}` +
        `&fields=id,name,created_at,line_items,total_price,currency,customer` +
        `&limit=50`
      );

      const orders = (ordersData.orders || []).map(o => ({
        id:         o.id,
        name:       o.name,
        created_at: o.created_at,
        total:      o.total_price,
        currency:   o.currency,
        customer:   o.customer
          ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() || 'Cliente web'
          : 'Cliente web',
        items: (o.line_items || []).map(li => ({
          sku:   li.sku   || '',
          title: li.title || '',
          qty:   li.quantity,
          price: li.price,
        })),
      }));

      console.log(`[ShopifySync] fetchOrders user=${user.id}: ${orders.length} órdenes (last ${hours}h)`);
      return res.status(200).json({ ok: true, count: orders.length, orders });
    } catch (e) {
      console.error('[ShopifySync] fetchOrders error:', e.message);
      return res.status(502).json({ error: `Error obteniendo órdenes de Shopify: ${e.message}` });
    }
  }

  return res.status(400).json({
    error: `Acción desconocida: "${action}". Válidas: syncStock, syncSku, fetchOrders`,
  });
}
