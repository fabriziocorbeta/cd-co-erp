// Vercel Serverless Function — Shopify Product Webhook Receiver
// Escucha: products/create  y  products/update
// ─────────────────────────────────────────────────────────────────────────────
// SEGURIDAD: Verifica HMAC-SHA256 (X-Shopify-Hmac-Sha256) antes de procesar.
//   bodyParser DEBE estar desactivado para poder leer el body crudo que Shopify firmó.
//
// MULTI-TENANT: Los webhooks de Shopify no llevan JWT de usuario.
//   La tienda se mapea al usuario ERP via env var SHOPIFY_ERP_USER_ID.
//   Obtener: Vercel Dashboard → Settings → Env Variables.
//
// Env vars requeridas:
//   SUPABASE_URL              — URL del proyecto Supabase
//   SUPABASE_SERVICE_ROLE_KEY — Service Role Key (solo servidor)
//   SHOPIFY_WEBHOOK_SECRET    — Clave de firma del webhook (Shopify Admin →
//                               Settings → Notifications → Webhooks → signing secret)
//   SHOPIFY_ERP_USER_ID       — UUID del usuario ERP dueño de esta tienda
//                               (auth.users.id en Supabase)
//
// Registro del webhook en Shopify (una sola vez):
//   POST https://{tienda}.myshopify.com/admin/api/2024-10/webhooks.json
//   Body: { "webhook": { "topic": "products/create",
//                        "address": "https://tu-app.vercel.app/api/webhooks/shopify-product",
//                        "format": "json" } }
//   Repetir para "products/update".
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';

// Desactivar bodyParser para leer el raw body — imprescindible para HMAC.
export const config = {
  api: { bodyParser: false },
};

// ── Leer body crudo como Buffer ───────────────────────────────────────────────
const readRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end',  ()      => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

// ── Verificar firma HMAC-SHA256 de Shopify ────────────────────────────────────
const verifyShopifyHmac = (rawBody, hmacHeader, secret) => {
  if (!hmacHeader) return false;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(hmacHeader),
    );
  } catch {
    // timingSafeEqual lanza si los buffers tienen distinta longitud
    return false;
  }
};

export default async function handler(req, res) {
  // Solo acepta POST (Shopify siempre envía POST)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Vars de entorno ───────────────────────────────────────────────────────
  const SB_URL         = process.env.SUPABASE_URL;
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
  const ERP_USER_ID    = process.env.SHOPIFY_ERP_USER_ID;

  if (!SB_URL || !SB_SERVICE_KEY || !WEBHOOK_SECRET || !ERP_USER_ID) {
    console.error('[ShopifyWebhook] Faltan variables de entorno requeridas');
    // Responder 200 para que Shopify no reintente (el problema es nuestro, no de Shopify)
    return res.status(200).json({ ok: false, error: 'Configuración incompleta' });
  }

  // ── Leer y verificar body ─────────────────────────────────────────────────
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (e) {
    console.error('[ShopifyWebhook] Error leyendo body:', e.message);
    return res.status(400).json({ error: 'Error leyendo body' });
  }

  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  if (!verifyShopifyHmac(rawBody, hmacHeader, WEBHOOK_SECRET)) {
    console.warn('[ShopifyWebhook] HMAC inválido — solicitud rechazada');
    return res.status(401).json({ error: 'Firma HMAC inválida' });
  }

  // ── Parsear payload ───────────────────────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    console.error('[ShopifyWebhook] JSON inválido:', e.message);
    return res.status(400).json({ error: 'Payload JSON inválido' });
  }

  const topic = req.headers['x-shopify-topic'] || '(sin topic)';
  console.log(`[ShopifyWebhook] topic=${topic} product_id=${payload.id}`);

  // ── Extraer datos del producto desde el payload de Shopify ───────────────
  // Shopify puede tener múltiples variantes; usamos la primera con SKU válido.
  const variant = (payload.variants || []).find(
    (v) => v.sku && v.sku.trim() !== ''
  );

  if (!variant) {
    console.log(`[ShopifyWebhook] Producto ${payload.id} sin SKU — ignorado`);
    return res.status(200).json({ ok: true, skipped: 'sin SKU válido' });
  }

  const sku       = variant.sku.trim();
  const sellPrice = parseFloat(variant.price) || 0;
  // inventory_quantity es null cuando Shopify no rastrea stock del producto.
  const stockQty  = variant.inventory_quantity !== null && variant.inventory_quantity !== undefined
    ? Math.max(0, parseInt(variant.inventory_quantity) || 0)
    : null;
  const name      = (payload.title || '').trim() || sku;

  // ── Buscar producto existente en Supabase por SKU + user_id ──────────────
  const sbHeaders = {
    'apikey':        SB_SERVICE_KEY,
    'Authorization': `Bearer ${SB_SERVICE_KEY}`,
    'Content-Type':  'application/json',
  };

  let existingId = null;
  try {
    const searchRes = await fetch(
      `${SB_URL}/rest/v1/products?sku=eq.${encodeURIComponent(sku)}&user_id=eq.${ERP_USER_ID}&select=id`,
      { headers: sbHeaders },
    );
    if (!searchRes.ok) throw new Error(`Supabase ${searchRes.status}`);
    const rows = await searchRes.json();
    existingId = Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
  } catch (e) {
    console.error(`[ShopifyWebhook] Error buscando SKU ${sku}:`, e.message);
    return res.status(200).json({ ok: false, error: 'Error consultando Supabase' });
  }

  // ── UPDATE o INSERT ───────────────────────────────────────────────────────
  try {
    if (existingId) {
      // Producto existe → actualizar nombre, precio de venta y stock (si Shopify lo rastrea)
      const patch = { name, sell_price: sellPrice };
      if (stockQty !== null) patch.stock = stockQty;

      const patchRes = await fetch(
        `${SB_URL}/rest/v1/products?id=eq.${existingId}&user_id=eq.${ERP_USER_ID}`,
        {
          method:  'PATCH',
          headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
          body:    JSON.stringify(patch),
        },
      );
      if (!patchRes.ok) {
        const errText = await patchRes.text().catch(() => '');
        throw new Error(`PATCH ${patchRes.status}: ${errText.slice(0, 200)}`);
      }
      console.log(`[ShopifyWebhook] UPDATED SKU=${sku} (id=${existingId}) stock=${stockQty ?? 'no-tracked'} sell_price=${sellPrice}`);
      return res.status(200).json({ ok: true, action: 'updated', sku });

    } else {
      // Producto no existe → crear fila nueva en el ERP
      const newRow = {
        user_id:    ERP_USER_ID,
        sku,
        name,
        sell_price: sellPrice,
        buy_price:  0,          // Shopify no expone precio de costo
        stock:      stockQty ?? 0,
        min_stock:  2,          // valor por defecto conservador
        category:   (payload.product_type || '').trim() || null,
        description:(payload.body_html || '').replace(/<[^>]*>/g, '').trim().slice(0, 500) || null,
      };

      const insertRes = await fetch(
        `${SB_URL}/rest/v1/products`,
        {
          method:  'POST',
          headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
          body:    JSON.stringify(newRow),
        },
      );
      if (!insertRes.ok) {
        const errText = await insertRes.text().catch(() => '');
        throw new Error(`INSERT ${insertRes.status}: ${errText.slice(0, 200)}`);
      }
      console.log(`[ShopifyWebhook] CREATED SKU=${sku} stock=${stockQty ?? 0} sell_price=${sellPrice}`);
      return res.status(200).json({ ok: true, action: 'created', sku });
    }
  } catch (e) {
    console.error(`[ShopifyWebhook] Error escribiendo en Supabase (SKU=${sku}):`, e.message);
    // 200 para no generar reintento de Shopify por un error nuestro
    return res.status(200).json({ ok: false, error: e.message });
  }
}
