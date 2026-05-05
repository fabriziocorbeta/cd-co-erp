// CD & Co ERP — Rules Engine
// Mirrors sure's Rule/ConditionFilter/ActionExecutor pattern.
//
// Sure architecture translated to Node.js + Supabase REST:
//   ConditionFilter  → EVALUATORS  (filter in-memory instead of SQL scope)
//   ActionExecutor   → EXECUTORS   (async, write back to Supabase)
//   Rule             → rule object  { conditions[], actions[] }
//   Rule#apply()     → evaluateRule(rule, resources)
//
// SQL to create the rule_alerts table (run once in Supabase SQL Editor):
//
//   CREATE TABLE IF NOT EXISTS rule_alerts (
//     id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//     user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
//     rule_id     TEXT NOT NULL,
//     rule_name   TEXT NOT NULL,
//     alert_type  TEXT NOT NULL DEFAULT 'info',
//     title       TEXT NOT NULL,
//     message     TEXT NOT NULL,
//     payload     JSONB DEFAULT '{}',
//     is_read     BOOLEAN DEFAULT FALSE,
//     created_at  TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE rule_alerts ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "owner_only" ON rule_alerts
//     FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
//   CREATE INDEX idx_rule_alerts_user_id  ON rule_alerts(user_id);
//   CREATE INDEX idx_rule_alerts_is_read  ON rule_alerts(user_id, is_read);

'use strict';

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function compareNumbers(a, operator, b) {
  const n = Number(a);
  const v = Number(b);
  switch (operator) {
    case '=':   return n === v;
    case '!=':  return n !== v;
    case '>':   return n > v;
    case '>=':  return n >= v;
    case '<':   return n < v;
    case '<=':  return n <= v;
    default:    return false;
  }
}

function compareStrings(a, operator, b) {
  const s = String(a ?? '').toLowerCase();
  const v = String(b ?? '').toLowerCase();
  switch (operator) {
    case '=':        return s === v;
    case '!=':       return s !== v;
    case 'like':     return s.includes(v);
    case 'not_like': return !s.includes(v);
    case 'starts':   return s.startsWith(v);
    default:         return false;
  }
}

async function sbFetch(sbUrl, sbKey, path, opts = {}) {
  const res = await fetch(`${sbUrl}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'Content-Type':  'application/json',
      'apikey':        sbKey,
      'Authorization': `Bearer ${sbKey}`,
      ...(opts.headers || {})
    }
  });
  if (!res.ok) throw new Error(`Supabase ${opts.method || 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════
// CONDITION EVALUATORS  (mirrors Sure's ConditionFilter)
// Each evaluator: { label, match(resource, operator, value) → bool }
//
// A "resource" here is a context object built by the trigger, e.g.:
//   { sale, product, supplier }   for the sale trigger
// ═══════════════════════════════════════════════════════════════════

const EVALUATORS = {
  // ── Product ─────────────────────────────────────────────────────
  product_stock: {
    label: 'Stock actual del producto',
    match(ctx, op, value) {
      return compareNumbers(ctx.product?.stock ?? 0, op, value);
    }
  },

  product_stock_vs_min: {
    label: 'Stock respecto al mínimo (stock - min_stock)',
    match(ctx, op, value) {
      const stock = ctx.product?.stock ?? 0;
      const min   = ctx.product?.min_stock ?? ctx.product?.minStock ?? 2;
      return compareNumbers(stock - min, op, value);
    }
  },

  product_transit: {
    label: 'Stock en tránsito',
    match(ctx, op, value) {
      return compareNumbers(ctx.product?.stock_transit ?? 0, op, value);
    }
  },

  product_sku: {
    label: 'SKU del producto',
    match(ctx, op, value) {
      return compareStrings(ctx.product?.sku, op, value);
    }
  },

  product_category: {
    label: 'Categoría del producto',
    match(ctx, op, value) {
      return compareStrings(ctx.product?.category, op, value);
    }
  },

  has_supplier: {
    label: 'Tiene proveedor asignado',
    match(ctx, op, _value) {
      const has = !!(ctx.product?.supplier_id || ctx.product?.supId);
      return op === '=' ? has : !has;
    }
  },

  // ── Sale ────────────────────────────────────────────────────────
  sale_total: {
    label: 'Total de venta',
    match(ctx, op, value) {
      return compareNumbers(ctx.sale?.total ?? 0, op, value);
    }
  },

  sale_currency: {
    label: 'Moneda de venta',
    match(ctx, op, value) {
      return compareStrings(ctx.sale?.cur ?? '$', op, value);
    }
  },

  sale_status: {
    label: 'Estado de venta',
    match(ctx, op, value) {
      return compareStrings(ctx.sale?.status ?? '', op, value);
    }
  },

  sale_items_qty: {
    label: 'Cantidad total de unidades en la venta',
    match(ctx, op, value) {
      const qty = (ctx.sale?.items ?? []).reduce((s, i) => s + (i.qty ?? i.quantity ?? 0), 0);
      return compareNumbers(qty, op, value);
    }
  }
};

// ═══════════════════════════════════════════════════════════════════
// ACTION EXECUTORS  (mirrors Sure's ActionExecutor)
// Each executor: { label, async execute(contexts, value, deps) }
//   contexts → array of matched context objects
//   value    → configured value from the rule action
//   deps     → { sbUrl, sbKey, userId, ruleId, ruleName }
// ═══════════════════════════════════════════════════════════════════

const EXECUTORS = {
  // Write an alert row to rule_alerts — the primary notification mechanism
  create_rule_alert: {
    label: 'Crear alerta en rule_alerts',
    async execute(contexts, value, { sbUrl, sbKey, userId, ruleId, ruleName }) {
      const results = [];

      for (const ctx of contexts) {
        const product  = ctx.product;
        const supplier = ctx.supplier;
        const sale     = ctx.sale;

        const alertType = value || 'warning';
        const stock     = product?.stock ?? 0;
        const minStock  = product?.min_stock ?? product?.minStock ?? 2;
        const prodName  = product?.name ?? 'Producto desconocido';
        const supName   = supplier?.name ?? 'Sin proveedor';

        const title   = `Stock bajo: ${prodName}`;
        const message = stock <= 0
          ? `"${prodName}" está sin stock tras la venta ${sale?.num ?? ''}. Pedido urgente a ${supName}.`
          : `"${prodName}" tiene ${stock} unidad(es) — mínimo es ${minStock}. Considerar pedido a ${supName}.`;

        const payload = {
          product_id:   product?.id,
          product_name: prodName,
          stock_actual: stock,
          stock_min:    minStock,
          supplier_id:  product?.supplier_id ?? product?.supId ?? null,
          supplier_name: supName,
          sale_id:      sale?.id,
          sale_num:     sale?.num
        };

        try {
          await sbFetch(sbUrl, sbKey, 'rule_alerts', {
            method:  'POST',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              user_id:    userId,
              rule_id:    ruleId,
              rule_name:  ruleName,
              alert_type: alertType,
              title,
              message,
              payload
            })
          });
          results.push({ ok: true, product_id: product?.id, title });
        } catch (err) {
          results.push({ ok: false, product_id: product?.id, error: err.message });
        }
      }

      return results;
    }
  },

  // Create a pending auto-order suggestion in the orders table
  create_order_suggestion: {
    label: 'Crear sugerencia de pedido a proveedor',
    async execute(contexts, value, { sbUrl, sbKey, userId }) {
      const results = [];

      for (const ctx of contexts) {
        const product = ctx.product;
        if (!product) continue;

        const supplierId = product.supplier_id ?? product.supId;
        if (!supplierId) {
          results.push({ ok: false, product_id: product.id, error: 'no_supplier' });
          continue;
        }

        const suggestedQty = Math.max(
          (product.min_stock ?? product.minStock ?? 2) * 2 - (product.stock ?? 0),
          1
        );

        const orderItem = {
          productId: product.id,
          name:      product.name,
          sku:       product.sku,
          qty:       suggestedQty,
          price:     product.buy_price ?? product.buyPrice ?? 0,
          cur:       product.cur ?? '$'
        };

        try {
          await sbFetch(sbUrl, sbKey, 'orders', {
            method:  'POST',
            headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
            body: JSON.stringify({
              user_id:     userId,
              supplier_id: supplierId,
              items:       [orderItem],
              status:      'suggested',
              date:        new Date().toISOString().slice(0, 10),
              notes:       `Auto-generado por motor de reglas — stock bajo tras venta`
            })
          });
          results.push({ ok: true, product_id: product.id, suggested_qty: suggestedQty });
        } catch (err) {
          results.push({ ok: false, product_id: product.id, error: err.message });
        }
      }

      return results;
    }
  },

  // Log rule execution for audit trail (mirrors sure's rule_runs)
  log_rule_run: {
    label: 'Registrar ejecución (audit log)',
    async execute(contexts, _value, { sbUrl, sbKey, userId, ruleId, ruleName }) {
      const payload = {
        user_id:       userId,
        rule_id:       ruleId,
        rule_name:     ruleName,
        matched_count: contexts.length,
        resource_ids:  contexts.map(c => c.product?.id).filter(Boolean),
        executed_at:   new Date().toISOString()
      };

      try {
        await sbFetch(sbUrl, sbKey, 'rule_runs', {
          method:  'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify(payload)
        });
        return [{ ok: true, matched_count: contexts.length }];
      } catch (err) {
        // rule_runs table might not exist — not fatal
        console.warn('[rules-engine] log_rule_run skipped:', err.message);
        return [{ ok: false, error: err.message }];
      }
    }
  }
};

// ═══════════════════════════════════════════════════════════════════
// RULE ENGINE CORE  (mirrors Sure's Rule#apply + matching_resources_scope)
// ═══════════════════════════════════════════════════════════════════

// Evaluate a single condition against a context object.
// Supports compound conditions with 'and'/'or' operator.
function evalCondition(condition, ctx) {
  if (condition.condition_type === 'compound') {
    // Mirrors sure's build_compound_scope
    if (condition.operator === 'or') {
      return (condition.sub_conditions ?? []).some(sub => evalCondition(sub, ctx));
    }
    // Default: 'and'
    return (condition.sub_conditions ?? []).every(sub => evalCondition(sub, ctx));
  }

  const evaluator = EVALUATORS[condition.condition_type];
  if (!evaluator) {
    console.warn(`[rules-engine] Unknown condition_type: ${condition.condition_type}`);
    return false;
  }

  return evaluator.match(ctx, condition.operator, condition.value);
}

// Filter contexts through all conditions (all must pass — AND semantics at top level).
// Mirrors Rule#matching_resources_scope.
function matchingContexts(conditions, contexts) {
  return contexts.filter(ctx =>
    conditions.every(cond => evalCondition(cond, ctx))
  );
}

// Apply a rule to an array of context objects.
// Returns { rule_id, matched_count, action_results[] }
// Mirrors Rule#apply.
async function applyRule(rule, contexts, deps) {
  const matched = matchingContexts(rule.conditions ?? [], contexts);

  if (matched.length === 0) {
    return { rule_id: rule.id, rule_name: rule.name, matched_count: 0, action_results: [] };
  }

  const actionResults = [];
  for (const action of (rule.actions ?? [])) {
    const executor = EXECUTORS[action.action_type];
    if (!executor) {
      console.warn(`[rules-engine] Unknown action_type: ${action.action_type}`);
      continue;
    }
    const results = await executor.execute(matched, action.value, {
      ...deps,
      ruleId:   rule.id,
      ruleName: rule.name
    });
    actionResults.push({ action_type: action.action_type, results });
  }

  return { rule_id: rule.id, rule_name: rule.name, matched_count: matched.length, action_results: actionResults };
}

// ═══════════════════════════════════════════════════════════════════
// BUILT-IN RULES
// These mirror "default rules" — defined in code, not DB.
// Phase 2: load from Supabase `rules` table instead.
// ═══════════════════════════════════════════════════════════════════

const BUILT_IN_RULES = [
  {
    id:            'stock_below_min_on_sale',
    name:          'Stock bajo mínimo tras venta',
    resource_type: 'sale',
    active:        true,
    conditions: [
      // Product stock dropped to or below min_stock
      { condition_type: 'product_stock_vs_min', operator: '<=', value: '0' }
    ],
    actions: [
      { action_type: 'create_rule_alert',    value: 'warning' },
      { action_type: 'create_order_suggestion', value: null }
    ]
  },
  {
    id:            'out_of_stock_on_sale',
    name:          'Producto sin stock tras venta',
    resource_type: 'sale',
    active:        true,
    conditions: [
      { condition_type: 'product_stock', operator: '<=', value: '0' }
    ],
    actions: [
      { action_type: 'create_rule_alert', value: 'danger' },
      { action_type: 'log_rule_run',      value: null }
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════
// TRIGGER: onSaleCreated
// Call this after a sale is saved, passing the full sale object.
// The engine fetches affected products from Supabase, builds contexts,
// and evaluates all active rules.
// ═══════════════════════════════════════════════════════════════════

async function onSaleCreated(sale, userId, sbUrl, sbKey) {
  if (!sale || !userId || !sbUrl || !sbKey) {
    throw new Error('onSaleCreated: sale, userId, sbUrl, sbKey all required');
  }

  // 1. Collect product IDs from sale line items
  const items = sale.items ?? [];
  const productIds = [...new Set(
    items.map(i => i.productId ?? i.product_id).filter(Boolean)
  )];

  if (productIds.length === 0) {
    return { triggered: 0, rules_evaluated: 0, message: 'No products in sale' };
  }

  // 2. Fetch current product state from Supabase (post-sale — stock already decremented)
  const idFilter = productIds.map(id => `id.eq.${id}`).join(',');
  const products = await sbFetch(sbUrl, sbKey, `products?or=(${idFilter})&select=*`);

  if (!products.length) {
    return { triggered: 0, rules_evaluated: 0, message: 'Products not found in Supabase' };
  }

  // 3. Optionally fetch supplier info for enriched alert messages
  const supplierIds = [...new Set(
    products.map(p => p.supplier_id).filter(Boolean)
  )];

  let suppliers = [];
  if (supplierIds.length > 0) {
    const supFilter = supplierIds.map(id => `id.eq.${id}`).join(',');
    try {
      suppliers = await sbFetch(sbUrl, sbKey, `contacts?or=(${supFilter})&select=id,name,phone`);
    } catch (_) {
      // Suppliers are enrichment only — don't fail
    }
  }

  const supplierMap = Object.fromEntries(suppliers.map(s => [s.id, s]));

  // 4. Build one context per product that was in the sale
  //    (mirrors sure's "resource" — the thing conditions are evaluated against)
  const contexts = products.map(product => ({
    sale,
    product,
    supplier: supplierMap[product.supplier_id] ?? null
  }));

  // 5. Evaluate all active built-in rules
  const deps     = { sbUrl, sbKey, userId };
  const results  = [];
  let   triggered = 0;

  for (const rule of BUILT_IN_RULES.filter(r => r.active)) {
    const result = await applyRule(rule, contexts, deps);
    results.push(result);
    if (result.matched_count > 0) triggered++;
  }

  return {
    triggered,
    rules_evaluated: BUILT_IN_RULES.filter(r => r.active).length,
    product_ids:     productIds,
    results
  };
}

// ═══════════════════════════════════════════════════════════════════
// HTTP ROUTE REGISTRATION  (call from simple-server.js)
// Adds these endpoints:
//   POST /api/rules/evaluate-sale  — trigger manually with { sale, user_id }
//   GET  /api/rules/alerts         — list unread rule_alerts for a user
//   POST /api/rules/alerts/:id/read — mark alert as read
//   GET  /api/rules/list            — list built-in rules (metadata only)
// ═══════════════════════════════════════════════════════════════════

async function handleRulesRequest(pathname, method, body, envVars) {
  const sbUrl = envVars.SUPABASE_URL;
  const sbKey = envVars.SUPABASE_ANON_KEY;

  // POST /api/rules/evaluate-sale
  if (pathname === '/api/rules/evaluate-sale' && method === 'POST') {
    try {
      const b      = typeof body === 'string' ? JSON.parse(body) : (body || {});
      const sale   = b.sale;
      const userId = b.user_id;

      if (!sale || !userId) {
        return _json(400, { success: false, error: 'sale y user_id requeridos' });
      }

      const result = await onSaleCreated(sale, userId, sbUrl, sbKey);
      return _json(200, { success: true, ...result });

    } catch (err) {
      console.error('[rules-engine] evaluate-sale error:', err);
      return _json(500, { success: false, error: err.message });
    }
  }

  // GET /api/rules/alerts?user_id=...
  if (pathname === '/api/rules/alerts' && method === 'GET') {
    try {
      const params = new URLSearchParams(pathname.split('?')[1] || '');
      const userId = params.get('user_id');

      if (!userId) return _json(400, { success: false, error: 'user_id requerido' });

      const alerts = await sbFetch(
        sbUrl, sbKey,
        `rule_alerts?user_id=eq.${userId}&order=created_at.desc&limit=50`
      );
      return _json(200, { success: true, data: alerts });

    } catch (err) {
      return _json(500, { success: false, error: err.message });
    }
  }

  // POST /api/rules/alerts/:id/read
  if (pathname.match(/^\/api\/rules\/alerts\/[^/]+\/read$/) && method === 'POST') {
    const alertId = pathname.split('/')[4];
    try {
      await sbFetch(sbUrl, sbKey, `rule_alerts?id=eq.${alertId}`, {
        method:  'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ is_read: true })
      });
      return _json(200, { success: true });
    } catch (err) {
      return _json(500, { success: false, error: err.message });
    }
  }

  // GET /api/rules/list — introspect available rules, evaluators, executors
  if (pathname === '/api/rules/list' && method === 'GET') {
    return _json(200, {
      success: true,
      rules:      BUILT_IN_RULES.map(r => ({ id: r.id, name: r.name, active: r.active, resource_type: r.resource_type })),
      evaluators: Object.entries(EVALUATORS).map(([k, v]) => ({ key: k, label: v.label })),
      executors:  Object.entries(EXECUTORS).map(([k, v]) => ({ key: k, label: v.label }))
    });
  }

  return null; // not handled — caller falls through to 404
}

function _json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  onSaleCreated,
  handleRulesRequest,
  // Expose internals for testing / extension
  EVALUATORS,
  EXECUTORS,
  BUILT_IN_RULES,
  applyRule,
  matchingContexts
};
