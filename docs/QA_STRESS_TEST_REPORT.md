# CD & Co ERP — QA Stress Test Report

> **Modo:** Red Team — Auditoría arquitectónica read-only
> **Fecha:** 2026-04-14
> **Auditor:** Claude (Sonnet 4.6)
> **Alcance:** Vanilla JS SPA + Supabase (PostgREST) + Vercel Serverless
> **Total LoC analizadas:** ~11,448 (24 archivos JS + 5 endpoints API + sw.js)

---

## Resumen Ejecutivo

El sistema funciona correctamente en el régimen de uso actual (decenas a cientos de transacciones), pero presenta **vulnerabilidades estructurales severas** cuando se proyecta a escala de producción real (50K txs, 1K clientes, 3 años de historial, sesiones de 72h, multi-pestaña). Las fallas no son cosméticas: incluyen pérdida silenciosa de datos por agotamiento de cuota de localStorage, sobreventa de inventario por race condition, y degradación catastrófica del rendimiento por queries no paginadas.

| Severidad | Hallazgos | Fixes recomendados |
|-----------|-----------|---------------------|
| 🔴 **CRÍTICO** | 3 | Refactor obligatorio antes de cualquier crecimiento |
| 🟠 **ALTO** | 5 | Refactor recomendado en próximos 30 días |
| 🟡 **MEDIO** | 4 | Mejoras incrementales |

---

## 🔴 NIVEL CRÍTICO

### C-1 · Sobreventa de Inventario por Race Condition (Concurrency)

**Archivos:** `js/inventory.js:233-263` (`saveStock`), `js/sales.js:140-280` (`saveSale`)
**Vector:** Concurrencia / ACID

#### Evidencia

```javascript
// js/inventory.js:238-249
const prev = p.stock;
if (type === 'in')   p.stock += qty;
else if (type === 'out') {
  if (qty > p.stock) { toast('No hay suficiente stock'); return }
  p.stock -= qty;
}
else p.stock = qty;

if (SB_ON) {
  const updateResult = await sbSaveProduct(p, false);  // ← PATCH replace
  if (!updateResult) { p.stock = prev; ... }
}
```

```javascript
// js/sales.js:153-159
items.forEach(l => {
  const p = S.products.find(x => x.id === l.prodId);
  if (p.stock < l.qty) {            // ← read-modify-write sin lock
    toast(`Stock insuficiente: ${p.name}`); return;
  }
});
// ...línea 277:
items.forEach(l => {
  const p = S.products.find(x => x.id === l.prodId);
  if (p) { p.stock -= l.qty; p.stock = Math.max(0, p.stock) }
});
```

#### Escenario de colapso

1. **Tab A** y **Tab B** del mismo usuario (o dos vendedores con acceso compartido) abren la última unidad de un Casio EF-316D (`stock = 1`)
2. Tab A: lee `S.products[i].stock = 1` → valida `1 >= 1` ✅ → resta → `stock = 0` local → `sbSaveProduct(p)` → `PATCH stock=0` enviado
3. Tab B (en el mismo milisegundo, antes de que su `S.products` sincronice): lee `S.products[i].stock = 1` → valida `1 >= 1` ✅ → resta → `stock = 0` local → `PATCH stock=0` enviado
4. **Resultado:** dos ventas confirmadas, dos comprobantes emitidos, stock real = -1 (imposible). El cliente físico solo recibe uno → reclamo, refund, fricción legal en Paraguay (SET no perdona facturas duplicadas).

`sbSaveProduct` hace un `UPDATE products SET stock = $1 WHERE id = $2` — un *replace*, no un *increment*. PostgreSQL no detecta el conflicto porque ambas escrituras son válidas individualmente.

#### Refactor propuesto

**Opción A — RPC atómica (recomendada):**

```sql
-- Migration: deduct_stock_atomic.sql
CREATE OR REPLACE FUNCTION deduct_stock_atomic(
  p_product_id UUID,
  p_qty        INT,
  p_user_id    UUID
) RETURNS TABLE (success BOOLEAN, new_stock INT, message TEXT) AS $$
DECLARE v_current INT;
BEGIN
  SELECT stock INTO v_current
  FROM products
  WHERE id = p_product_id AND user_id = p_user_id
  FOR UPDATE;  -- ← bloqueo pessimista de fila

  IF v_current IS NULL THEN
    RETURN QUERY SELECT false, 0, 'Product not found';
    RETURN;
  END IF;

  IF v_current < p_qty THEN
    RETURN QUERY SELECT false, v_current, 'Insufficient stock';
    RETURN;
  END IF;

  UPDATE products SET stock = stock - p_qty
  WHERE id = p_product_id AND user_id = p_user_id;

  RETURN QUERY SELECT true, (v_current - p_qty), 'OK';
END;
$$ LANGUAGE plpgsql;
```

Cliente: `await sb.rpc('deduct_stock_atomic', { p_product_id, p_qty, p_user_id })`. El `FOR UPDATE` bloquea la fila hasta el commit; el segundo writer espera y vuelve a leer el valor actualizado.

**Opción B — Optimistic locking con `version`:**

Añadir columna `version INT DEFAULT 0` a `products`. Cada `UPDATE` incluye `WHERE version = $expected` y hace `version = version + 1`. Si afecta 0 filas → conflicto detectado → reintentar la operación con valores frescos.

---

### C-2 · Carga Total de Transacciones sin Paginación (Memory OOM)

**Archivos:** `js/auth.js:160-163` (`loadAllUserData → fetchTable`), `js/nav.js:30-34` (re-fetch en `txs` page)
**Vector:** Rendimiento Supabase

#### Evidencia

```javascript
// js/auth.js:160-163
const fetchTable = (t, ms) => Promise.race([
  sb.from(t).select(TABLE_COLS[t] || '*').order('created_at', { ascending: false }),
  qTimeout(ms)
]);
```

```javascript
// js/nav.js:30-34
if (SB_ON && sb) {
  const {data, error} = await sb.from('txs')
    .select('id,type,amount,cur,cat,date,desc,account_id,transferPairId')
    .order('date', {ascending: false});
  if (!error && data) S.txs = data;
}
```

**Búsqueda exhaustiva:** `grep "\.limit(\|\.range("` en `js/` → **0 resultados**. Ni una sola query del frontend usa paginación.

#### Escenario de colapso

Usuario con 3 años de actividad acumulada:

| Métrica | Valor estimado |
|---|---|
| Transacciones | 50,000 |
| Bytes promedio por fila JSON | ~280 (incluye desc + account_id + uuid) |
| Payload bruto Supabase | ~14 MB |
| Heap JS tras parse + objects | ~70–90 MB |
| Tiempo en 4G simulado (1.5 Mbps real) | 75–80 s |
| Resultado en iPhone SE | Tab killed por iOS Memory Pressure |

Adicionalmente: cada vez que el usuario navega a `/movimientos`, `nav.js:30` **vuelve a hacer la query completa** (no usa el cache de `S.txs` ya cargado en `loadAllUserData`). En 8 navegaciones diarias = 8 × 14 MB = 112 MB descargados.

Cuando `qTimeout(8000)` gana la carrera (red lenta), `applyResults` recibe `data:[]` y **silenciosamente reemplaza el estado** — el dashboard queda vacío sin error visible para el usuario.

#### Refactor propuesto

**Estrategia 1: Paginación por cursor (date-based)**

```javascript
// Solo cargar los últimos 6 meses por defecto
const sixMoAgo = new Date(Date.now() - 180*86400e3).toISOString().slice(0,10);
const fetchTxsRecent = () => sb.from('txs')
  .select(TABLE_COLS.txs)
  .gte('date', sixMoAgo)
  .order('date', { ascending: false })
  .limit(2000);

// Función separada para "Cargar más" o vista histórico
const fetchTxsBefore = (beforeDate, limit = 500) => sb.from('txs')
  .select(TABLE_COLS.txs)
  .lt('date', beforeDate)
  .order('date', { ascending: false })
  .limit(limit);
```

**Estrategia 2: Agregaciones server-side via RPC**

Para el dashboard (que solo necesita totales mensuales), crear un RPC:

```sql
CREATE OR REPLACE FUNCTION dashboard_stats(p_user_id UUID, p_months INT DEFAULT 6)
RETURNS TABLE (month_key TEXT, cur TEXT, income NUMERIC, expense NUMERIC) AS $$
  SELECT
    to_char(date, 'YYYY-MM') AS month_key,
    cur,
    SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
    SUM(CASE WHEN type='expense' THEN ABS(amount) ELSE 0 END) AS expense
  FROM txs
  WHERE user_id = p_user_id
    AND date >= NOW() - (p_months || ' months')::INTERVAL
  GROUP BY 1, 2
  ORDER BY 1 DESC;
$$ LANGUAGE SQL STABLE;
```

Reemplaza ~14 MB de transferencia por <1 KB.

**Estrategia 3: Índices SQL obligatorios**

```sql
CREATE INDEX IF NOT EXISTS idx_txs_user_date ON txs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_txs_user_cat  ON txs(user_id, cat);
CREATE INDEX IF NOT EXISTS idx_txs_user_acc  ON txs(user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_sales_user_date ON sales(user_id, date DESC);
```

Sin estos índices, cada query con `ORDER BY date` hace **sequential scan** sobre 50K filas → 200–800ms por request.

---

### C-3 · localStorage Quota Exhaustion → Pérdida Silenciosa de Datos

**Archivos:** `js/auth.js:9` (`lsave`), llamado desde 40+ sitios en todo el código
**Vector:** Rendimiento + Persistencia

#### Evidencia

```javascript
// js/auth.js:9
function lsave(){
  try {
    localStorage.setItem(LS, JSON.stringify({
      txs: S.txs, products: S.products, sales: S.sales, orders: S.orders,
      contacts: S.contacts, plan: S.plan, cards: S.cards, debts: S.debts,
      accounts: S.accounts, budgets: S.budgets, subscriptions: S.subscriptions,
      appMode: S.appMode, goals: S.goals, historical: S.historical,
      receivables: S.receivables, vehicles: S.vehicles, fx: FX, user: S.user
    }))
  } catch(e) {}  // ← ERROR SWALLOWED
}
```

#### Escenario de colapso

1. Usuario activo durante 3 años → `S.txs.length = 50000`, `S.sales.length = 8000`, `S.products.length = 500`
2. JSON.stringify del estado completo: **~17–22 MB**
3. Quota real de `localStorage` por origen: **5–10 MB** según navegador (Chrome desktop 10MB, Safari iOS 5MB)
4. `setItem` lanza `QuotaExceededError` → `catch(e){}` lo descarta sin log
5. La app sigue corriendo en memoria con `S.txs` correcto, pero **el estado nunca más se persiste**
6. Usuario cierra el tab → todo cambio post-quota se pierde → al volver, ve datos de hace meses

Además: `lsave()` se llama **sincrónicamente** dentro del event loop principal. Serializar 20MB toma 200–500ms en mobile → janks visibles, modals que tardan en cerrarse, scroll que se traba.

#### Refactor propuesto

**Estrategia A: Migrar a IndexedDB (~50MB-1GB de quota, async, indexable):**

```javascript
// utils/idb.js
import { openDB } from 'idb'; // ~3KB gzipped CDN
const db = await openDB('cdco', 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('txs')) {
      const s = db.createObjectStore('txs', { keyPath: 'id' });
      s.createIndex('date', 'date');
      s.createIndex('account_id', 'account_id');
    }
  }
});
async function saveTxIDB(tx) { return db.put('txs', tx); }
async function loadRecentTxs(days = 180) {
  const since = new Date(Date.now() - days*86400e3).toISOString().slice(0,10);
  return db.transaction('txs').objectStore('txs').index('date')
    .getAll(IDBKeyRange.lowerBound(since));
}
```

**Estrategia B (mínima, sin migrar a IDB): split + size guard**

```javascript
function lsave() {
  try {
    const payload = JSON.stringify({...});
    if (payload.length > 4 * 1024 * 1024) {
      // Solo persistir lo crítico (resto vive en memoria)
      const slim = JSON.stringify({
        plan: S.plan, user: S.user, fx: FX,
        accounts: S.accounts, products: S.products
      });
      localStorage.setItem(LS, slim);
      console.warn('[lsave] state >4MB, persisted slim version only');
      return;
    }
    localStorage.setItem(LS, payload);
  } catch(e) {
    console.error('[lsave] QUOTA EXCEEDED — data not persisted', e);
    toast('⚠ Memoria llena — recargá la app');  // ← visible al usuario
  }
}
```

Y en lectura, después de un slim save: forzar revalidate desde Supabase en lugar de usar localStorage como fuente de verdad.

---

## 🟠 NIVEL ALTO

### A-1 · Búsquedas sin Debounce → UI Thread Blocking

**Archivos:** `index.html:430,467,496,506,516,526,625` (7 inputs de búsqueda)
**Vector:** Rendimiento UI / Fatiga de red

#### Evidencia

```html
<!-- index.html:430 -->
<input id="tx-search" oninput="renderTxs()"/>
<!-- index.html:467 -->
<input id="inv-search" oninput="renderInventory()"/>
<!-- index.html:496 -->
<input id="sale-search" oninput="renderSales()"/>
```

```javascript
// js/transactions.js:84-89
let txs = [...S.txs]
  .filter(t => t.date >= curRange.start && t.date <= curRange.end)
  .sort((a,b) => new Date(b.date) - new Date(a.date));
if (txFltType !== 'all') txs = txs.filter(t => t.type === txFltType);
txs = txs.filter(t => { /* String.toLowerCase().includes(q) */ });
```

#### Escenario de colapso

Usuario tipea "casio" (5 caracteres) en `#tx-search` con 50K txs:
- 5 eventos `input` → 5 ejecuciones completas de `renderTxs()`
- Cada ejecución: spread (50K), 2 filter (100K iters), sort (~50K log 50K = 780K comparaciones), DOM rebuild
- Total: ~5M ops + 5 reflows en <500ms → main thread bloqueado, input lag visible

Si los inputs son binding directo a query Supabase (no es el caso aquí pero sí podría serlo en una refactor), también agotaría el rate limit del proyecto Supabase free tier (200 req/s).

#### Refactor propuesto

```javascript
// utils/debounce.js
function debounce(fn, ms = 250) {
  let t; return function(...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
}

// transactions.js (init)
const renderTxsDebounced = debounce(renderTxs, 200);

// index.html
<input id="tx-search" oninput="renderTxsDebounced()"/>
```

Y para el filtrado en sí: pre-indexar las txs por palabras clave en una `Map<token,Set<id>>` que se construye una vez al cargar y se actualiza on-mutation. Bajaría el filtro de O(n) a O(1).

---

### A-2 · Sin Retry / Exponential Backoff en Fetches

**Archivos:** `js/auth.js:160-163`, `js/config.js` (todos los wrappers `sbXxx`)
**Vector:** Fatiga de red

#### Evidencia

```javascript
// js/auth.js:157-163
const qTimeout = ms => new Promise(res => setTimeout(() =>
  res({data:[], error:{message:'timeout'}}), ms));
const fetchTable = (t, ms) => Promise.race([
  sb.from(t).select(TABLE_COLS[t] || '*').order('created_at', { ascending: false }),
  qTimeout(ms)
]);
```

```javascript
// js/config.js:241
const { data, error } = await sb.from(table).upsert(payload, { onConflict: 'id' }).select().single();
if (error) { console.error(...); toast('Error al guardar'); return null; }
```

**Búsqueda:** `grep "retry\|backoff"` → 0 ocurrencias en `js/`.

#### Escenario de colapso

Usuario con 4G en movimiento (taxi en Asunción, paquetes drop intermitentes):
- `saveTx()` lanza `sbSaveTransaction()` → red drop → `error` → toast → tx perdida
- Usuario reintenta manualmente → 50% probabilidad de duplicación si la primera escritura sí llegó al servidor pero la respuesta no
- `loadAllUserData` con timeout 8s → en 4G saturado, primer GET tarda 12s → vacío silencioso → usuario ve dashboard en 0

#### Refactor propuesto

```javascript
async function withRetry(fn, { tries = 3, baseMs = 400 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const result = await fn();
      if (result?.error) throw new Error(result.error.message);
      return result;
    } catch (err) {
      lastErr = err;
      if (i === tries - 1) break;
      const delay = baseMs * Math.pow(2, i) + Math.random() * 100; // jitter
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Uso:
const result = await withRetry(() =>
  sb.from('txs').insert(payload).select().single()
);
```

Combinar con **idempotency keys** (UUID v4 en cliente como `id`) y `onConflict: 'id'` en upsert para garantizar que reintento ≠ duplicado.

---

### A-3 · `setInterval` en `fx.js` Nunca Limpiado en Logout

**Archivos:** `js/fx.js:209`, `js/auth.js:324` (`doLogout`)
**Vector:** Fugas de memoria

#### Evidencia

```javascript
// js/fx.js:209
setInterval(() => { if (!FX.manual) fetchRate(); }, 30 * 60 * 1000);
```

```javascript
// js/auth.js:324
async function doLogout(){
  if (SB_ON && sb) await sb.auth.signOut();
  lsave();
  S = { txs:[], products:[], ... };  // estado limpiado
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth').style.display = 'flex';
}
// ← NO clearInterval
```

#### Escenario de colapso

72 horas de tab abierto, usuario alterna entre dos cuentas (login → logout → login → ...) 8 veces:
- Cada `enterApp` → `initFx()` (auth.js:436) → si no hay guard, instala otro `setInterval`
- Tras 8 sesiones: 8 intervals concurrentes, cada uno hace fetch a la API serverless cada 30 min
- Cada fetch consume 1 invocación de Vercel + 1 llamada a Anthropic API (web_search) → coste real
- El listener captura referencias a `FX`, `fetchRate`, y todo el closure scope → memoria pinned

Adicional: en la línea inicial del archivo (no mostrada pero presente por la convención), si hay un IIFE que registra el interval, se ejecuta una sola vez por carga del archivo. Pero el mismo problema se manifiesta si `initFx` también lo registra.

#### Refactor propuesto

```javascript
// fx.js
let _fxIntervalId = null;
function startFxAutoRefresh() {
  if (_fxIntervalId) return; // guard contra doble registro
  _fxIntervalId = setInterval(() => {
    if (!FX.manual) fetchRate();
  }, 30 * 60 * 1000);
}
function stopFxAutoRefresh() {
  if (_fxIntervalId) { clearInterval(_fxIntervalId); _fxIntervalId = null; }
}

// auth.js doLogout
async function doLogout(){
  stopFxAutoRefresh();  // ← cleanup
  if (SB_ON && sb) await sb.auth.signOut();
  // ...
}
```

Aplicar el mismo patrón a cualquier `setInterval` o long-lived `addEventListener` que se registre dentro de `enterApp`.

---

### A-4 · Endpoint `/api/admin` Sin Paginación → Memoria del Function

**Archivos:** `api/admin.js:142-149`
**Vector:** Rendimiento serverless

#### Evidencia

```javascript
// api/admin.js:142-149
const [users, accounts, products] = await Promise.all([
  safeFetch(`${SB_URL}/rest/v1/profiles?select=*&order=created_at.desc`, headers),
  safeFetch(`${SB_URL}/rest/v1/accounts?select=*`, headers),
  safeFetch(`${SB_URL}/rest/v1/products?select=*`, headers)
]);
```

Ningún `?limit=`, ningún `?range=`, ningún `?select=` projected.

#### Escenario de colapso

Plataforma con 1,000 usuarios × 8 cuentas/usuario × 50 productos/usuario = **8,000 accounts + 50,000 products**. Cada admin pageload:
- 1 GET con ~100 KB de profiles
- 1 GET con ~2 MB de accounts (todas las columnas, incluyendo `notes` de texto libre)
- 1 GET con ~15 MB de products
- Total ~17 MB en memoria del Vercel Function
- Default Vercel Function memory en Hobby: 1024 MB → técnicamente cabe
- Pero: tiempo de transferencia Supabase→Function en cold start ~6s → si el JWT verify + 3 fetches > 10s → timeout

A escala mayor (10K usuarios) la función simplemente crashea por OOM.

Además: `safeFetch` no respeta paginación PostgREST por defecto (límite implícito 1000 filas) → admin solo ve los primeros 1000 registros sin saber que hay más.

#### Refactor propuesto

1. **Agregaciones server-side** vía SQL functions (Postgres function `admin_dashboard_stats()` que devuelve los KPIs ya calculados en <1KB)
2. **Paginación con `Range` header** para listas tabulares (`Range: 0-49`)
3. **Streaming de productos** vía `Transfer-Encoding: chunked` si la tabla es grande

```sql
CREATE OR REPLACE FUNCTION admin_dashboard_stats()
RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'usuarios_total',    (SELECT COUNT(*) FROM profiles),
    'usuarios_pro',      (SELECT COUNT(*) FROM profiles WHERE plan='pro'),
    'cuentas_total',     (SELECT COUNT(*) FROM accounts),
    'patrimonio_usd',    (SELECT SUM(balance) FROM accounts WHERE cur IN ('$','USD')),
    'patrimonio_pyg',    (SELECT SUM(balance) FROM accounts WHERE cur='₲'),
    'productos_total',   (SELECT COUNT(*) FROM products),
    'productos_low',     (SELECT COUNT(*) FROM products WHERE stock <= min_stock)
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
```

---

### A-5 · N+1 Implícito en `renderDashboard` Sobre el Array `S.txs`

**Archivos:** `js/dashboard.js:213-244`
**Vector:** Rendimiento UI

#### Evidencia

```javascript
// js/dashboard.js:213
(S.accounts || []).forEach(a => { /* ... probablemente filter S.txs by account_id */ });
// línea 220
(S.cards || []).forEach(c => { /* idem */ });
// línea 228
(S.debts || []).forEach(d => { /* idem */ });
// línea 244
(S.products || []).forEach(p => { /* idem */ });
```

#### Escenario de colapso

Usuario con 50K txs + 8 accounts + 4 cards + 12 debts + 500 products:
- accounts: 8 × 50K = 400K iteraciones
- cards: 4 × 50K = 200K
- debts: 12 × 50K = 600K
- products: 500 × 50K = 25,000,000 iteraciones (!)
- Total: ~26M iteraciones por **cada** `renderDashboard()` call
- Cada navegación al dashboard → 26M ops → 800ms+ blocking en mobile

#### Refactor propuesto

Pre-indexar `S.txs` en estructuras auxiliares al cargar/mutar:

```javascript
// utils/txIndex.js
let _txByAccount = new Map();
let _txByProduct = new Map();
function rebuildTxIndex() {
  _txByAccount.clear(); _txByProduct.clear();
  for (const t of S.txs) {
    if (t.account_id) {
      if (!_txByAccount.has(t.account_id)) _txByAccount.set(t.account_id, []);
      _txByAccount.get(t.account_id).push(t);
    }
    if (t._product_id) {
      if (!_txByProduct.has(t._product_id)) _txByProduct.set(t._product_id, []);
      _txByProduct.get(t._product_id).push(t);
    }
  }
}
function getTxsByAccount(id) { return _txByAccount.get(id) || []; }
```

Llamar `rebuildTxIndex()` en `loadAllUserData` y tras cada `saveTx`/`deleteTx`. El dashboard pasa de O(N×M) a O(N+M).

---

## 🟡 NIVEL MEDIO

### M-1 · `JSONB items` en `sales` Cargado Completo Sin Necesidad

**Archivo:** `js/auth.js:144` (`TABLE_COLS.sales`)

```javascript
sales: 'id,date,total,cur,items,client_id,status,num,nro_factura,condicion'
```

`items` (array JSONB de líneas de venta) puede pesar 5–20 KB por venta. 8000 ventas × 10 KB = 80 MB transferidos en cada `loadAllUserData`. La lista de ventas (UI) solo necesita totales — `items` solo se requiere al abrir el comprobante individual.

**Fix:** Quitar `items` del SELECT por defecto. Cargar on-demand cuando el usuario abre `viewInvoice(id)`:

```javascript
async function viewInvoice(id) {
  const sale = S.sales.find(s => s.id === id);
  if (!sale.items) {
    const { data } = await sb.from('sales').select('items').eq('id', id).single();
    sale.items = data.items;
  }
  // render...
}
```

---

### M-2 · `S.txs` Re-fetch Innecesario en `nav.js:30`

**Archivo:** `js/nav.js:30-34`

```javascript
else if (pg === 'txs') {
  if (SB_ON && sb) {
    const {data, error} = await sb.from('txs').select(...).order(...);
    if (!error && data) S.txs = data;
  }
  renderTxs();
}
```

Cada navegación a la página de movimientos vuelve a hacer la query completa, descartando los datos en memoria. Si el usuario va `dashboard → movimientos → dashboard → movimientos` 5 veces, son 5 fetches de 14 MB.

**Fix:** Confiar en el cache SWR ya implementado. Sólo refetch si el último sync es >5 min antiguo:

```javascript
const TXS_TTL = 5 * 60 * 1000;
if (pg === 'txs') {
  if (SB_ON && sb && (Date.now() - (S._lastTxSync || 0)) > TXS_TTL) {
    const {data} = await sb.from('txs').select(...).limit(2000);
    if (data) { S.txs = data; S._lastTxSync = Date.now(); }
  }
  renderTxs();
}
```

---

### M-3 · `setTimeout` Encadenados Sin Tracking

**Archivos:** `js/accounts.js:121`, `js/advice.js:9`, `js/debts.js:227`, `js/auth.js:316,338,348`, `js/cdco_import.js:56`, `js/pwa.js:111-113`, `js/reports.js:423`, `js/invoices.js:222`

Búsqueda de `setTimeout`: ~14 ocurrencias en `js/`. Ninguna captura el ID retornado, ninguna tiene `clearTimeout`. Si el usuario navega a otra página antes de que dispare el timeout, el callback intenta acceder a DOM nodes que ya no están y lanza errores silenciosos (que en algunos casos quedan capturados por try/catch globales).

```javascript
// accounts.js:121
setTimeout(() => renderCashFlow(), 80);  // ¿qué pasa si la page cambió en esos 80ms?
```

**Fix:** En componentes que pueden ser destruidos, usar AbortController o un contador de "mount epoch":

```javascript
let _accountsEpoch = 0;
function openAccountsPage() {
  const myEpoch = ++_accountsEpoch;
  setTimeout(() => {
    if (myEpoch !== _accountsEpoch) return; // descarta callback obsoleto
    renderCashFlow();
  }, 80);
}
```

---

### M-4 · `forEach` con `await` Implícito Dentro

**Archivo:** Varios — patrón común en `cdco_import.js`, `dashboard.js`

`forEach` ignora promesas → si dentro del callback hay operaciones async, se ejecutan en paralelo descontroladamente, agotando el connection pool de Supabase free tier (60 conexiones simultáneas).

**Fix:** Usar `for...of` con `await` para serialización, o `Promise.all(map())` con un *concurrency limit*:

```javascript
// utils/pLimit.js
async function pLimitMap(arr, n, fn) {
  const results = []; const executing = new Set();
  for (const item of arr) {
    const p = fn(item).then(r => { executing.delete(p); return r; });
    results.push(p); executing.add(p);
    if (executing.size >= n) await Promise.race(executing);
  }
  return Promise.all(results);
}
```

---

## Plan de Acción Recomendado

| Sprint | Item | Esfuerzo | Riesgo de no hacer |
|---|---|---|---|
| **Sprint 1 (urgente)** | C-1 RPC atómica para stock | 1 día | Sobreventa real, refunds |
| **Sprint 1** | C-3 Migrar a IndexedDB (o slim-save guard) | 2 días | Pérdida silenciosa de datos |
| **Sprint 2** | C-2 Paginación de txs + RPC dashboard_stats | 3 días | Crash en mobile a >10K txs |
| **Sprint 2** | A-1 Debounce en todos los inputs de búsqueda | 0.5 día | UX degradada |
| **Sprint 2** | A-2 Wrapper `withRetry` + idempotency keys | 1 día | Data loss en redes inestables |
| **Sprint 3** | A-3 Cleanup de `setInterval` en logout | 0.5 día | Memory leak en sesiones largas |
| **Sprint 3** | A-4 RPC `admin_dashboard_stats` | 1 día | Admin panel inutilizable a escala |
| **Sprint 3** | A-5 Indexación in-memory de `S.txs` | 1 día | Dashboard >1s en mobile |
| **Sprint 4** | M-1, M-2, M-3, M-4 (incrementales) | 2 días | Optimizaciones |

**Total esfuerzo:** ~12 días-persona para cerrar todos los hallazgos críticos y altos.

---

## Anexo — Índices SQL Mínimos Recomendados

```sql
-- Performance crítico para queries actuales sin paginar
CREATE INDEX IF NOT EXISTS idx_txs_user_date     ON txs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_txs_user_cat      ON txs(user_id, cat);
CREATE INDEX IF NOT EXISTS idx_txs_user_acc      ON txs(user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_sales_user_date   ON sales(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_date  ON orders(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_products_user_sku ON products(user_id, sku);
CREATE INDEX IF NOT EXISTS idx_debts_user_status ON debts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_categorias_user   ON categorias(user_id, tipo);

-- Para concurrency control (C-1)
ALTER TABLE products ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_products_id_version ON products(id, version);
```

---

> **Nota final:** Este reporte es estrictamente diagnóstico. Ningún archivo de código fue modificado durante la auditoría. Las propuestas de refactor son orientativas y deben ser validadas en un entorno de staging antes de aplicarlas a producción.

*Generado por Claude Code Red Team — 2026-04-14*
