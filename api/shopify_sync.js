// Vercel Serverless Function — Shopify Bidirectional Sync
// Sprint 5: Sincronización ERP ↔ Shopify
// ─────────────────────────────────────────────────────────────────────────────
// Auth: Supabase JWT (Authorization: Bearer <token>)
//       Mismo patrón que /api/business.js y /api/goals.js
//
// Env vars requeridas (configurar en Vercel Dashboard → Settings → Env Variables):
//   SUPABASE_URL              — URL del proyecto Supabase
//   SUPABASE_SERVICE_ROLE_KEY — Service Role Key (solo en servidor, nunca en frontend)
//   SHOPIFY_STORE_DOMAIN      — ej. mi-tienda.myshopify.com
//   SHOPIFY_ACCESS_TOKEN      — Admin API token (Custom App → API credentials)
//
// Acciones disponibles (POST body: { action, ...payload }):
//   syncStock   — Sincroniza inventario físico de N productos hacia Shopify (batch)
//   syncSku     — Sincroniza 1 SKU (post-venta, fire-and-forget)
//   fetchOrders — Trae órdenes web pagadas/sin procesar de las últimas 24h
// ─────────────────────────────────────────────────────────────────────────────

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

  // ── Auth: verificar JWT via Supabase ──────────────────────────────────────
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado — token requerido' });
  }
  const jwt = auth.split(' ')[1];

  const SB_URL         = process.env.SUPABASE_URL;
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
  const SHOPIFY_TOKEN  = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!SB_URL || !SB_SERVICE_KEY) {
    console.error('[ShopifySync] Faltan vars de Supabase');
    return res.status(500).json({ error: 'Configuración de Supabase incompleta' });
  }
  if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
    return res.status(500).json({
      error: 'Shopify no configurado — agrega SHOPIFY_STORE_DOMAIN y SHOPIFY_ACCESS_TOKEN en Vercel → Settings → Environment Variables',
    });
  }

  // Verificar JWT con Supabase
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

  // ── Shopify helpers ───────────────────────────────────────────────────────
  const shopifyBase = `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;

  /**
   * shopifyFetch — wrapper autenticado para la Admin REST API de Shopify.
   * Lanza error si el status HTTP no es 2xx.
   */
  const shopifyFetch = async (path, opts = {}) => {
    const r = await fetch(`${shopifyBase}${path}`, {
      ...opts,
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json',
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
  // Empuja niveles de inventario (stock físico) desde el ERP hacia Shopify.
  //
  // syncStock → body: { action: 'syncStock', products: [{sku, qty}] }
  // syncSku   → body: { action: 'syncSku',   sku: 'REL-001', qty: 3 }
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'syncStock' || action === 'syncSku') {
    // Normalizar payload: syncSku → array de 1 elemento
    const products = action === 'syncSku'
      ? [{ sku: body.sku, qty: body.qty }]
      : (body.products || []);

    if (!products.length) {
      return res.status(400).json({ error: 'No hay productos para sincronizar' });
    }

    // 1. Obtener la primera ubicación activa de Shopify (location_id requerido)
    let locationId;
    try {
      const locsData = await shopifyFetch('/locations.json?active=true');
      const locs = locsData.locations || [];
      if (!locs.length) throw new Error('No hay ubicaciones activas en Shopify');
      // Usar la primera ubicación activa (típicamente "Ubicación principal")
      locationId = locs[0].id;
      console.log(`[ShopifySync] location_id=${locationId} (${locs[0].name})`);
    } catch (e) {
      console.error('[ShopifySync] Error obteniendo locations:', e.message);
      return res.status(502).json({ error: `Error obteniendo ubicaciones de Shopify: ${e.message}` });
    }

    // 2. Para cada SKU: buscar la variante y actualizar el nivel de inventario
    const results = { updated: 0, skipped: 0, errors: [] };

    for (const prod of products) {
      if (!prod.sku || prod.sku === '—') {
        results.skipped++;
        continue;
      }

      try {
        // Buscar variante por SKU
        const varData = await shopifyFetch(
          `/variants.json?sku=${encodeURIComponent(prod.sku)}`
        );
        const variants = varData.variants || [];

        if (!variants.length) {
          console.log(`[ShopifySync] SKU no encontrado en Shopify: ${prod.sku}`);
          results.skipped++;
          continue;
        }

        const inventoryItemId = variants[0].inventory_item_id;
        const qty = Math.max(0, parseInt(prod.qty) || 0);

        // Actualizar nivel de inventario en la ubicación activa
        await shopifyFetch('/inventory_levels/set.json', {
          method: 'POST',
          body: JSON.stringify({
            location_id:       locationId,
            inventory_item_id: inventoryItemId,
            available:         qty,
          }),
        });

        console.log(`[ShopifySync] ✓ SKU=${prod.sku} → qty=${qty}`);
        results.updated++;
      } catch (e) {
        console.error(`[ShopifySync] ✗ SKU=${prod.sku}:`, e.message);
        results.errors.push({ sku: prod.sku, error: e.message });
      }
    }

    console.log(
      `[ShopifySync] syncStock user=${user.id}: ` +
      `updated=${results.updated}, skipped=${results.skipped}, errors=${results.errors.length}`
    );
    return res.status(200).json({ ok: true, ...results });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTION: fetchOrders
  // Trae órdenes web pagadas y sin procesar de las últimas 24h.
  //
  // body: { action: 'fetchOrders', hours?: number }  (hours default: 24)
  //
  // Retorna: { ok: true, count: N, orders: [...] }
  // Cada orden: { id, name, created_at, total, currency, customer, items: [{sku, title, qty, price}] }
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'fetchOrders') {
    const hours = Math.min(parseInt(body.hours) || 24, 168); // máx 7 días
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    try {
      const ordersData = await shopifyFetch(
        `/orders.json` +
        `?status=any` +
        `&financial_status=paid` +
        `&fulfillment_status=unfulfilled` +
        `&created_at_min=${encodeURIComponent(since)}` +
        `&fields=id,name,created_at,line_items,total_price,currency,customer` +
        `&limit=50`
      );

      const orders = (ordersData.orders || []).map(o => ({
        id:         o.id,
        name:       o.name,                   // ej. "#1042"
        created_at: o.created_at,
        total:      o.total_price,
        currency:   o.currency,
        customer:   o.customer
          ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() || 'Cliente web'
          : 'Cliente web',
        items: (o.line_items || []).map(li => ({
          sku:      li.sku   || '',
          title:    li.title || '',
          qty:      li.quantity,
          price:    li.price,
        })),
      }));

      console.log(`[ShopifySync] fetchOrders user=${user.id}: ${orders.length} órdenes (last ${hours}h)`);
      return res.status(200).json({ ok: true, count: orders.length, orders });
    } catch (e) {
      console.error('[ShopifySync] fetchOrders error:', e.message);
      return res.status(502).json({ error: `Error obteniendo órdenes de Shopify: ${e.message}` });
    }
  }

  // ── Acción desconocida ────────────────────────────────────────────────────
  return res.status(400).json({
    error: `Acción desconocida: "${action}". Acciones válidas: syncStock, syncSku, fetchOrders`,
  });
}
