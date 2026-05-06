#!/usr/bin/env node

/**
 * test_concurrency.js
 *
 * Script de prueba ligero para validar la persistencia atómica en Supabase.
 * Simula la recepción de 5 pedidos concurrentes para un mismo producto
 * e incrementa el stock usando la función RPC `adjust_stock_atomic`.
 *
 * Uso:
 *   SUPABASE_URL="https://tu-proyecto.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key" \
 *   USER_ID="uuid-del-usuario-de-prueba" \
 *   node test_concurrency.js
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = process.env.USER_ID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !USER_ID) {
  console.error("❌ Faltan variables de entorno requeridas.");
  console.error("Por favor provea SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y USER_ID.");
  process.exit(1);
}

// Simple fetch wrapper to query Supabase REST API
async function fetchSupabase(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${endpoint}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...(options.headers || {})
  };

  const response = await fetch(url, { ...options, headers });

  // Return text to safely handle empty responses (like from DELETE)
  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, data: text ? JSON.parse(text) : null, error: null };
  } catch (err) {
    if (!response.ok) {
        return { ok: false, status: response.status, data: null, error: text };
    }
    return { ok: true, status: response.status, data: text, error: null };
  }
}

// Call a Supabase RPC
async function rpcSupabase(rpcName, payload) {
    const url = `${SUPABASE_URL}/rest/v1/rpc/${rpcName}`;
    const headers = {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers });
    const text = await response.text();
    try {
        return { ok: response.ok, status: response.status, data: text ? JSON.parse(text) : null, error: null };
    } catch (err) {
        if (!response.ok) {
            return { ok: false, status: response.status, data: null, error: text };
        }
        return { ok: true, status: response.status, data: text, error: null };
    }
}

async function runTest() {
  console.log("🚀 Iniciando test de concurrencia atómica...\n");

  const testProductId = `test-prod-${Date.now()}`;
  const initialStock = 10;
  const numConcurrentRequests = 5;
  const qtyPerRequest = 3;

  try {
    // 1. Crear producto de prueba
    console.log(`[1] Creando producto de prueba (ID: ${testProductId}) con stock inicial: ${initialStock}`);
    const insertRes = await fetchSupabase('/products', {
      method: 'POST',
      body: JSON.stringify({
        id: testProductId,
        user_id: USER_ID,
        name: 'Producto Test Concurrencia',
        sku: 'TEST-CONC-001',
        stock: initialStock,
        buy_price: 100,
        sell_price: 200
      })
    });

    if (!insertRes.ok) {
        throw new Error(`Error creando producto: ${insertRes.error || JSON.stringify(insertRes.data)}`);
    }

    // 2. Ejecutar 5 requests simultáneos de incremento de stock usando el RPC atómico
    console.log(`\n[2] Simulando ${numConcurrentRequests} pedidos simultáneos (Agregando ${qtyPerRequest} u. cada uno)...`);

    const promises = [];
    for (let i = 0; i < numConcurrentRequests; i++) {
        const payload = {
            p_product_id: testProductId,
            p_qty: qtyPerRequest,
            p_type: 'in',
            p_user_id: USER_ID
        };
        // Las requests se envían casi al mismo tiempo
        promises.push(rpcSupabase('adjust_stock_atomic', payload));
    }

    const results = await Promise.all(promises);

    let successCount = 0;
    results.forEach((res, index) => {
        if (res.ok && res.data && res.data.ok) {
            successCount++;
            console.log(`  ✅ Request ${index + 1}: OK. Nuevo stock devuelto: ${res.data.new_stock}`);
        } else {
            console.error(`  ❌ Request ${index + 1}: FALLÓ.`, res.error || res.data);
        }
    });

    // 3. Verificar el stock final en la base de datos
    console.log(`\n[3] Verificando stock final en Supabase...`);
    const verifyRes = await fetchSupabase(`/products?id=eq.${testProductId}&select=stock`);

    if (!verifyRes.ok || !verifyRes.data || verifyRes.data.length === 0) {
        throw new Error("No se pudo obtener el producto final para verificar.");
    }

    const finalStockDB = verifyRes.data[0].stock;
    const expectedStock = initialStock + (numConcurrentRequests * qtyPerRequest);

    console.log(`  Stock final en BD: ${finalStockDB}`);
    console.log(`  Stock esperado:    ${expectedStock}`);

    if (finalStockDB === expectedStock) {
        console.log(`\n✅ ÉXITO: El contador de stock es exacto. La condición de carrera fue prevenida por el RPC atómico.`);
    } else {
        console.log(`\n❌ ERROR: Hay discrepancia en el stock. Se perdieron actualizaciones concurrentes.`);
    }

  } catch (error) {
    console.error("\n❌ Test fallido por error inesperado:");
    console.error(error.message);
  } finally {
      // Limpieza
      console.log(`\n[4] Limpiando datos de prueba...`);
      await fetchSupabase(`/products?id=eq.${testProductId}`, { method: 'DELETE' });
      console.log("Test finalizado.");
  }
}

runTest();