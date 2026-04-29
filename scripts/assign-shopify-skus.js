#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// assign-shopify-skus.js — Migración de una sola ejecución
//
// Trae todos los productos de Shopify, los cruza con los productos del ERP
// que no tienen SKU asignado, y actualiza la tabla products en Supabase.
// La clave de unión es el NOMBRE (normalizado: minúsculas + sin espacios dobles).
//
// MODO SECO (por defecto): muestra el plan sin escribir nada.
// MODO APPLY: pasa el flag --apply para ejecutar los UPDATEs.
//
// Uso:
//   node scripts/assign-shopify-skus.js
//   node scripts/assign-shopify-skus.js --apply
//
// Variables de entorno requeridas (setear antes de correr):
//   SHOPIFY_STORE_DOMAIN      — ej. mi-tienda.myshopify.com
//   SHOPIFY_CLIENT_ID         — Client ID del Dev Dashboard
//   SHOPIFY_CLIENT_SECRET     — Client Secret del Dev Dashboard
//   SUPABASE_URL              — https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — Service Role Key
//   SHOPIFY_ERP_USER_ID       — UUID del usuario ERP dueño de la tienda
//
// Ejemplo con vars inline:
//   SHOPIFY_STORE_DOMAIN=mi-tienda.myshopify.com \
//   SHOPIFY_CLIENT_ID=shpss_xxx \
//   SHOPIFY_CLIENT_SECRET=xxx \
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   SHOPIFY_ERP_USER_ID=uuid-del-usuario \
//   node scripts/assign-shopify-skus.js --apply
// ─────────────────────────────────────────────────────────────────────────────

const APPLY      = process.argv.includes('--apply');
const DEBUG      = process.argv.includes('--debug');
const API_VER    = '2024-10';
const PAGE_LIMIT = 250; // máximo que permite Shopify por página

// ── Vars de entorno ───────────────────────────────────────────────────────────
const SHOPIFY_DOMAIN        = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_CLIENT_ID     = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SB_URL                = process.env.SUPABASE_URL;
const SB_KEY                = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ERP_USER_ID           = process.env.SHOPIFY_ERP_USER_ID;

function checkEnv() {
  const missing = ['SHOPIFY_STORE_DOMAIN','SHOPIFY_CLIENT_ID','SHOPIFY_CLIENT_SECRET',
                   'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SHOPIFY_ERP_USER_ID']
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error('\n❌  Faltan variables de entorno:\n  ' + missing.join('\n  '));
    process.exit(1);
  }
}

// ── Obtener token temporal via Client Credentials Grant ───────────────────────
async function getShopifyToken() {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/oauth/access_token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      client_id:     SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      grant_type:    'client_credentials',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Shopify OAuth ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('Shopify OAuth: respuesta sin access_token');
  return data.access_token;
}

// ── Helpers de matching ───────────────────────────────────────────────────────

// Normalizar: minúsculas + colapsar espacios + quitar puntuación.
const normalize = (str) =>
  (str || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Tokenizar en partes alfanuméricas puras.
 * "LTP-1170G-9AVDF" → ["LTP", "1170G", "9AVDF"]
 * "Casio W-800H"    → ["CASIO", "W", "800H"]
 * Usado por Tier 2 para comparar sin importar si el separador es guión, espacio u otro.
 */
const tokenize = (str) =>
  (str || '').toUpperCase().split(/[^A-Z0-9]+/).filter(t => t.length > 0);

/**
 * Tier 2 — Generar variantes de código a partir de una secuencia con guiones.
 *
 * SUFIJO DE COLOR (Casio): 1–2 dígitos + 1–4 letras → 7A, 9AV, 2AV, 4AVDF
 *   Clave: los sufijos de color tienen 1–2 dígitos.
 *   Los códigos de modelo tienen 3–4 dígitos (1170G, 1381D, V007D).
 *   Esta diferencia los distingue sin ambigüedad.
 *
 * PREFIJO GENÉRICO: primer segmento formado solo por letras (LTP, GA, BGA, W).
 *
 * Ejemplos:
 *   "LTP-1170G-7A"  → strip "7A"  → ["LTP","1170G"] → ["LTP-1170G", "1170G"]
 *   "LTP-V007D-2AV" → strip "2AV" → ["LTP","V007D"] → ["LTP-V007D", "V007D"]
 *   "LA670WA-1381D" → "1381D" tiene 4 dígitos → no strip → ["LA670WA-1381D","1381D"]
 *   "LTP-1235SG-7A" → strip "7A"  → ["LTP","1235SG"] → ["LTP-1235SG","1235SG"]
 */
function codeVariants(hyphenatedCode) {
  let parts = hyphenatedCode.split('-');

  // Strip sufijo de color: exactamente 1–2 dígitos + 1–4 letras
  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^\d{1,2}[A-Z]{1,4}$/.test(last)) {
    parts = parts.slice(0, -1);
  }

  // Separar prefijo puro-letras del core
  const firstIsLettersOnly = /^[A-Z]+$/.test(parts[0]) && parts.length > 1;
  const coreParts  = firstIsLettersOnly ? parts.slice(1) : parts;
  const withPrefix = parts.join('-');    // ej. "LTP-1170G"  o "LA670WA-1381D"
  const core       = coreParts.join('-');// ej. "1170G"      o "LA670WA-1381D"

  const result = new Set([withPrefix]);
  if (core !== withPrefix) result.add(core);

  // Segmentos individuales mixtos (útil para "LA670WA-1381D" → agrega "1381D")
  for (const seg of coreParts) {
    if (seg !== core && /[A-Z]/.test(seg) && /[0-9]/.test(seg)) result.add(seg);
  }

  return [...result];
}

/**
 * Tier 2 — Extraer todos los códigos candidatos de un nombre de producto ERP.
 *
 * Estrategia doble:
 *   (a) Secuencias con guiones → aplica codeVariants para limpiar sufijo/prefijo
 *   (b) Tokens alfanuméricos mixtos sueltos → captura "1381D" en "Casio Dama 1381D"
 *
 * Retorna ordenados por longitud desc (más específico primero).
 */
function extractModelCodes(name) {
  const upper      = (name || '').toUpperCase();
  const candidates = new Set();

  // (a) Secuencias con guiones
  const hyphenGroups = upper.match(/[A-Z0-9]+(?:-[A-Z0-9]+)+/g) || [];
  for (const group of hyphenGroups) {
    codeVariants(group).forEach(c => candidates.add(c));
  }

  // (b) Tokens sueltos mixtos (≥ 3 chars, al menos 1 letra y 1 dígito)
  upper.replace(/[^A-Z0-9]/g, ' ').split(/\s+/).forEach(t => {
    if (t.length >= 3 && /[A-Z]/.test(t) && /[0-9]/.test(t)) candidates.add(t);
  });

  // Más específico (más largo) primero
  return [...candidates].sort((a, b) =>
    b.replace(/-/g, '').length - a.replace(/-/g, '').length,
  );
}

/**
 * Tier 2 — Buscar el producto Shopify que contenga todos los tokens del código.
 *
 * Comparación tokenizada: divide código Y título en partes alfanuméricas puras
 * y verifica que los tokens del código sean subconjunto de los del título.
 *
 *   código "LTP-1170G" → tokens ["LTP","1170G"]
 *   título "Casio LTP-1170G-9AVDF" → tokens {"CASIO","LTP","1170G","9AVDF"}
 *   ["LTP","1170G"] ⊆ {"CASIO","LTP","1170G","9AVDF"} → ✓ match único
 *
 * Solo retorna si exactamente 1 producto Shopify tiene todos los tokens.
 * Si hay > 1, prueba el siguiente candidato (más corto = menos tokens = menos restrictivo).
 */
function findByModelCode(codes, shopifyProducts) {
  for (const code of codes) {
    const codeTokens = tokenize(code);
    if (!codeTokens.length) continue;

    const matches = shopifyProducts.filter(sp => {
      const titleTokens = new Set(tokenize(sp.title));
      return codeTokens.every(ct => titleTokens.has(ct));
    });

    if (matches.length === 1) {
      const variant = (matches[0].variants || []).find(v => v.sku?.trim());
      if (variant) return { sku: variant.sku.trim(), title: matches[0].title, code };
    }
    // > 1 → ambiguo → probar siguiente código (más corto, menos tokens)
  }
  return null;
}

/**
 * Tier 3 — Solapamiento de palabras significativas (≥ 4 chars).
 * Excluye palabras genéricas del catálogo (Casio, Reloj, Dama, etc.) que
 * aparecen en todos los productos y generan falsos positivos.
 * Retorna score entre 0 y 1.
 */
const GENERIC_WORDS = new Set([
  'casio', 'reloj', 'dama', 'mujer', 'hombre', 'caballero', 'unisex',
  'watch', 'digital', 'analogico', 'analogo', 'negro', 'dorado', 'plateado',
  'blanco', 'rosa', 'azul', 'rojo', 'verde', 'plata', 'gold', 'silver',
  'acero', 'cuero', 'correa', 'resina', 'inoxidable',
]);

function wordOverlapScore(erpName, shopifyTitle) {
  const words = normalize(erpName)
    .split(' ')
    .filter(w => w.length >= 4 && !GENERIC_WORDS.has(w));
  if (!words.length) return 0;
  const haystack = normalize(shopifyTitle);
  return words.filter(w => haystack.includes(w)).length / words.length;
}

const OVERLAP_THRESHOLD = 0.65; // 65% de palabras discriminantes en común

// ── Shopify: fetch paginado de todos los productos ────────────────────────────
async function fetchAllShopifyProducts(token) {
  const products = [];
  let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VER}/products.json` +
            `?limit=${PAGE_LIMIT}&fields=id,title,variants`;

  while (url) {
    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Shopify ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    products.push(...(data.products || []));

    // Paginación por cursor (Link header)
    const linkHeader = res.headers.get('link') || '';
    const nextMatch  = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return products;
}

// ── Supabase: traer productos ERP sin SKU del usuario ────────────────────────
async function fetchErpProductsWithoutSku() {
  const sbHeaders = {
    'apikey':        SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
  };

  // Productos sin SKU: sku IS NULL o sku vacío
  const res = await fetch(
    `${SB_URL}/rest/v1/products` +
    `?user_id=eq.${ERP_USER_ID}` +
    `&or=(sku.is.null,sku.eq.)` +
    `&select=id,name,sku`,
    { headers: sbHeaders },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${body.slice(0, 300)}`);
  }

  return res.json();
}

// ── Supabase: actualizar SKU de un producto ───────────────────────────────────
async function updateSku(productId, sku) {
  const res = await fetch(
    `${SB_URL}/rest/v1/products?id=eq.${productId}&user_id=eq.${ERP_USER_ID}`,
    {
      method:  'PATCH',
      headers: {
        'apikey':        SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({ sku }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PATCH ${res.status}: ${body.slice(0, 200)}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  checkEnv();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(' assign-shopify-skus.js —', APPLY ? '🚀 MODO APPLY' : '🔍 MODO SECO (dry run)');
  console.log('══════════════════════════════════════════════════════\n');

  // 1. Obtener token temporal de Shopify
  console.log('⏳ Autenticando con Shopify (Client Credentials)...');
  let shopifyToken;
  try {
    shopifyToken = await getShopifyToken();
    console.log('   Token obtenido ✓\n');
  } catch (e) {
    console.error(`\n❌  Error autenticando con Shopify: ${e.message}`);
    process.exit(1);
  }

  // 2. Traer datos de ambas fuentes en paralelo
  console.log('⏳ Consultando Shopify y Supabase en paralelo...');
  const [shopifyProducts, erpProducts] = await Promise.all([
    fetchAllShopifyProducts(shopifyToken),
    fetchErpProductsWithoutSku(),
  ]);

  console.log(`   Shopify: ${shopifyProducts.length} producto(s) total`);
  console.log(`   ERP sin SKU: ${erpProducts.length} producto(s)\n`);

  if (!erpProducts.length) {
    console.log('✅ Todos los productos del ERP ya tienen SKU asignado. Nada que hacer.');
    return;
  }

  // 3. Construir índice Shopify por nombre normalizado (Tier 1)
  const shopifyIndex = new Map();
  for (const sp of shopifyProducts) {
    const variant = (sp.variants || []).find(v => v.sku?.trim());
    if (!variant) continue;
    const key = normalize(sp.title);
    if (!shopifyIndex.has(key)) {
      shopifyIndex.set(key, { sku: variant.sku.trim(), title: sp.title });
    }
  }

  // Filtrar productos Shopify con SKU (para Tier 2 y Tier 3)
  const shopifyWithSku = shopifyProducts.filter(
    sp => (sp.variants || []).some(v => v.sku?.trim()),
  );

  // 4. Matching por tiers
  const tier1 = [];      // nombre exacto normalizado
  const tier2 = [];      // código de modelo encontrado
  const tier3 = [];      // solapamiento de palabras ≥ threshold
  const unmatched = [];

  for (const erp of erpProducts) {
    // — Tier 1: nombre exacto normalizado —
    const t1 = shopifyIndex.get(normalize(erp.name));
    if (t1) {
      tier1.push({ erpId: erp.id, erpName: erp.name, sku: t1.sku, shopifyTitle: t1.title });
      continue;
    }

    // — Tier 2: código de modelo —
    const codes = extractModelCodes(erp.name);

    if (DEBUG) {
      console.log(`  [DEBUG] "${erp.name}" → códigos extraídos: [${codes.join(', ') || 'ninguno'}]`);
    }

    const t2 = codes.length ? findByModelCode(codes, shopifyWithSku) : null;
    if (t2) {
      tier2.push({ erpId: erp.id, erpName: erp.name, sku: t2.sku, shopifyTitle: t2.title, code: t2.code });
      continue;
    }

    // — Tier 3: candidato por solapamiento de palabras (se filtra después) —
    let bestScore = 0;
    let bestMatch = null;
    for (const sp of shopifyWithSku) {
      const score = wordOverlapScore(erp.name, sp.title);
      if (score > bestScore) { bestScore = score; bestMatch = sp; }
    }
    if (bestMatch && bestScore >= OVERLAP_THRESHOLD) {
      const variant = (bestMatch.variants || []).find(v => v.sku?.trim());
      tier3.push({
        erpId: erp.id, erpName: erp.name,
        sku: variant.sku.trim(), shopifyTitle: bestMatch.title,
        score: Math.round(bestScore * 100),
      });
    } else {
      unmatched.push(erp.name);
    }
  }

  // 5a. Filtrar Tier 3: unicidad mutua
  //     Si múltiples productos ERP apuntan al mismo Shopify, ninguno se sugiere.
  //     Previene el caso "8 modelos distintos → mismo producto por compartir 'Casio Dama LTP'".
  const shopifyHits = {};
  for (const c of tier3) {
    shopifyHits[c.shopifyTitle] = (shopifyHits[c.shopifyTitle] || 0) + 1;
  }
  const tier3Ambiguous = tier3.filter(c => shopifyHits[c.shopifyTitle] > 1);
  const tier3Unique    = tier3.filter(c => shopifyHits[c.shopifyTitle] === 1);

  // Los ambiguos de Tier 3 van a sin-match para revisión manual
  for (const c of tier3Ambiguous) unmatched.push(c.erpName);

  // 5. Mostrar resultados
  const pct = n => `${n}%`;

  console.log(`─── TIER 1 — nombre exacto (${tier1.length}) ─────────────────────────`);
  if (tier1.length) {
    for (const m of tier1) {
      console.log(`  ✓  "${m.erpName}"  →  SKU: ${m.sku}`);
    }
  } else { console.log('  (ninguno)'); }

  console.log(`\n─── TIER 2 — código de modelo (${tier2.length}) ──────────────────────`);
  if (tier2.length) {
    for (const m of tier2) {
      console.log(`  ✓  "${m.erpName}"  →  SKU: ${m.sku}`);
      console.log(`       código: ${m.code}  |  Shopify: "${m.shopifyTitle}"`);
    }
  } else { console.log('  (ninguno)'); }

  console.log(`\n─── TIER 3 — sugeridas por palabras (${tier3Unique.length}) [revisar antes de aplicar] ─`);
  if (tier3Unique.length) {
    for (const m of tier3Unique) {
      console.log(`  ?  "${m.erpName}"  →  SKU: ${m.sku}  (${pct(m.score)} coincidencia)`);
      console.log(`       Shopify: "${m.shopifyTitle}"`);
    }
    console.log('\n  ℹ️  Aplicar estas con: --apply-suggested');
  } else { console.log('  (ninguna)'); }

  if (tier3Ambiguous.length) {
    console.log(`\n─── TIER 3 DESCARTADAS — mismo Shopify para múltiples ERP (${tier3Ambiguous.length}) ─`);
    for (const m of tier3Ambiguous) {
      console.log(`  ⚡  "${m.erpName}"  ←→  "${m.shopifyTitle}" (ambiguo)`);
    }
    console.log('  ℹ️  Estos requieren revisión manual — el título Shopify es demasiado genérico.');
  }

  console.log(`\n─── SIN COINCIDENCIA (${unmatched.length}) ────────────────────────────`);
  if (unmatched.length) {
    for (const name of unmatched) console.log(`  ✗  "${name}"`);
  } else { console.log('  (ninguno — todos matchearon 🎉)'); }

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` Total: T1=${tier1.length} T2=${tier2.length} sugeridas=${tier3Unique.length} descartadas=${tier3Ambiguous.length} sin match=${unmatched.length}`);
  console.log('══════════════════════════════════════════════════════\n');

  // 6. Aplicar según flags
  const APPLY_SUGGESTED = process.argv.includes('--apply-suggested');
  const toApply = APPLY_SUGGESTED
    ? [...tier1, ...tier2, ...tier3Unique]
    : APPLY
      ? [...tier1, ...tier2]
      : [];

  if (!APPLY && !APPLY_SUGGESTED) {
    if (tier1.length + tier2.length > 0) {
      console.log('🔍 Modo seco — revisá el plan y ejecutá con:');
      console.log('   node scripts/assign-shopify-skus.js --apply            (T1 + T2)');
      console.log('   node scripts/assign-shopify-skus.js --apply-suggested  (T1 + T2 + T3)');
      console.log('\n   Para ver qué códigos se extraen de cada nombre ERP:');
      console.log('   node scripts/assign-shopify-skus.js --debug\n');
    } else if (tier3Unique.length > 0) {
      console.log('🔍 Solo hay sugerencias. Si las aprobás, ejecutá con:');
      console.log('   node scripts/assign-shopify-skus.js --apply-suggested\n');
    } else {
      console.log('⚠️  Sin coincidencias. Probá con --debug para ver qué códigos se extraen:');
      console.log('   node scripts/assign-shopify-skus.js --debug\n');
    }
    return;
  }

  if (!toApply.length) {
    console.log('⚠️  Nada para aplicar.\n');
    return;
  }

  console.log(`\n🚀 Aplicando ${toApply.length} UPDATE(s) en Supabase...\n`);
  let ok = 0, fail = 0;
  for (const m of toApply) {
    try {
      await updateSku(m.erpId, m.sku);
      console.log(`  ✅  "${m.erpName}"  →  SKU=${m.sku}`);
      ok++;
    } catch (e) {
      console.error(`  ❌  "${m.erpName}": ${e.message}`);
      fail++;
    }
  }

  console.log(`\n Resultado: ${ok} actualizado(s) · ${fail} error(es)\n`);
}

main().catch(e => {
  console.error('\n💥 Error fatal:', e.message);
  process.exit(1);
});
