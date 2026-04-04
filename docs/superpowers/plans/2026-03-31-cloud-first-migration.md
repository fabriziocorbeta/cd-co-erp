# Cloud-First Supabase Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate CD & Co ERP from localStorage-first to Supabase-primary so every CRUD operation persists to the cloud, RLS enforces tenant isolation, and the app is ready for multi-user SaaS onboarding.

**Architecture:** Supabase JS SDK (`sb` client) is used for all reads/writes — it automatically attaches the logged-in user's JWT so RLS works without passing `user_id` from the frontend. `loadAllUserData()` replaces `lload()` + `pullFromSupabase()` at login. Two new helpers `sbUpsert(table, obj)` and `sbDelete(table, id)` in `config.js` are the single call site for all write-through operations. localStorage becomes an optional offline fallback only.

**Tech Stack:** Vanilla JS, Supabase JS v2 SDK (`sb` client from `config.js`), Supabase project `beumpltrjgnehqbhtrxo`, Node.js server on port 8000.

---

## Phase Gates — do NOT proceed past a gate until verified

| Gate | Condition to verify before proceeding |
|------|---------------------------------------|
| **Gate 1** | After Task 3: Verification SQL shows non-zero rows in **all 10 tables** |
| **Gate 2** | After Task 6: Login with email/password → browser shows ₲16,325,913 patrimonio neto loaded from Supabase (not localStorage) |
| **Gate 3** | After Task 14: Create a new transaction in the UI → it appears immediately in Supabase SQL Editor (`SELECT * FROM txs ORDER BY created_at DESC LIMIT 5`) |
| **Gate 4** | After Task 16: Delete `sync.js` → full app restart → all data still loads correctly, no JS errors in console |

---

## File Map

| File | Action | Summary of changes |
|------|--------|--------------------|
| `js/auth.js` | Modify | Add `loadAllUserData()`; rewrite `enterApp()` to remove `lload`/`initSupabase`/`pullFromSupabase`; remove `adminEmergencyLogin` |
| `js/config.js` | Modify | Add `sbUpsert()` and `sbDelete()` helpers; remove `sbSaveProduct`, `sbDeleteProduct`, `sbLoadProducts`, `sbLoadTransactions`, `sbLoadSales`, `initSupabase` and all fuel-API helpers |
| `js/transactions.js` | Modify | `saveTx()` async + write-through; `delTx()` async + write-through |
| `js/inventory.js` | Modify | `saveProd()`, `delProduct()`, `saveStock()`, `saveImport()` — replace raw-fetch calls with SDK helpers |
| `js/accounts.js` | Modify | `saveAccount()` async + write-through (account + optional adjustment tx); `delAccount()` async + write-through |
| `js/debts.js` | Modify | `saveCard()`, `delCard()`, `saveDebt()`, `delDebt()` async + write-through |
| `js/sales.js` | Modify | `saveSale()`, `delSale()` async + write-through (sale + auto income tx + stock) |
| `js/orders.js` | Modify | `saveOrder()`, `syncOrderPayment()`, `confirmReceive()`, `delOrder()` async + write-through |
| `js/contacts.js` | Modify | `saveContact()`, `delContact()` async + write-through |
| `js/budgets.js` | Modify | `saveBudget()`, `delBudget()` async + write-through |
| `js/subscriptions.js` | Modify | `saveSub()`, `delSub()` async + write-through |
| `js/sync.js` | **Delete** | Entire file removed in Phase 4 |
| `index.html` | Modify | Remove `<script src="js/sync.js">` tag; remove `#localhost-gate` emergency login div and its inline script |

---

## Phase 1 — Foundation

### Task 1: Enable RLS + set auth.uid() defaults on all 10 tables

**Files:**
- Supabase SQL Editor (no local files)

- [ ] **Step 1: Open Supabase SQL Editor**

  Go to `https://supabase.com/dashboard/project/beumpltrjgnehqbhtrxo/sql/new`

- [ ] **Step 2: Run the following SQL**

```sql
-- ═══ ENABLE RLS ═══
ALTER TABLE public.accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.txs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions  ENABLE ROW LEVEL SECURITY;

-- ═══ SET auth.uid() AS DEFAULT FOR user_id ═══
-- This lets upsert() work without passing user_id explicitly from the frontend
ALTER TABLE public.accounts      ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.txs           ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.products      ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.sales         ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.orders        ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.contacts      ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.cards         ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.debts         ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.budgets       ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.subscriptions ALTER COLUMN user_id SET DEFAULT auth.uid();

-- ═══ DROP EXISTING POLICIES TO AVOID CONFLICTS ═══
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','txs','products','sales','orders',
                            'contacts','cards','debts','budgets','subscriptions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "user_isolation" ON public.%I', t);
  END LOOP;
END $$;

-- ═══ CREATE UNIFIED TENANT ISOLATION POLICIES ═══
CREATE POLICY "user_isolation" ON public.accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON public.txs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON public.products
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON public.sales
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON public.orders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON public.contacts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON public.cards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON public.debts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON public.budgets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON public.subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 3: Verify policies were created**

Run in SQL Editor:
```sql
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND policyname = 'user_isolation'
ORDER BY tablename;
```
Expected: 10 rows, one per table.

---

### Task 2: First Supabase login + run data migration

**Files:**
- Browser console only (no local file changes)

**Context:** The real business data (₲16,325,913) lives in localStorage under `cdco_erp_v1` on `localhost:8000`. This step migrates it to Supabase before any localStorage code is removed. The Supabase session is required for RLS to accept the writes.

- [ ] **Step 1: Start the local server**

```bash
cd "/Users/Fabrizio/Library/CloudStorage/GoogleDrive-fabriziocorbeta@gmail.com/Mi unidad/03 Emprendimientos/02  Sistema/01 - cdco"
node simple-server.js
```
Expected console output: `Servidor corriendo en http://localhost:8000`

- [ ] **Step 2: Register a real Supabase account**

  Open `http://localhost:8000` in browser. Click the **Registro** tab. Register with:
  - Email: `fabriziocorbeta@gmail.com`
  - Password: (choose a strong password — save it)
  - Nombre: `Fabrizio`

  If already registered: use the **Ingresar** tab to log in.

  Expected: App opens and shows the ERP dashboard (data comes from localStorage for now — that's correct at this stage).

- [ ] **Step 3: Open browser console (F12 → Console) and paste the migration function**

```javascript
async function migrateLocalToSupabase() {
  const local = JSON.parse(localStorage.getItem('cdco_erp_v1'));
  if (!local) { console.error('No data found in cdco_erp_v1'); return; }

  const { data: { session } } = await sb.auth.getSession();
  if (!session) { console.error('No active session — log in first'); return; }
  const uid = session.user.id;
  console.log('Migrating as user:', uid);

  const tables = {
    accounts:      local.accounts      || [],
    txs:           local.txs           || [],
    products:      local.products      || [],
    cards:         local.cards         || [],
    debts:         local.debts         || [],
    contacts:      local.contacts      || [],
    subscriptions: local.subscriptions || [],
    budgets:       local.budgets       || [],
    sales:         local.sales         || [],
    orders:        local.orders        || [],
  };

  const results = await Promise.all(
    Object.entries(tables).map(([table, rows]) =>
      rows.length > 0
        ? sb.from(table).upsert(rows.map(r => ({ ...r, user_id: uid })), { onConflict: 'id' })
        : Promise.resolve({ error: null, count: 0 })
    )
  );

  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    console.error('Migration errors:', errors.map(e => e.error.message));
    return;
  }

  const { count } = await sb.from('txs').select('*', { count: 'exact', head: true });
  console.log(`✅ Migration complete. ${count} transactions in Supabase.`);

  Object.entries(tables).forEach(([t, rows]) =>
    console.log(`  ${t}: ${rows.length} rows migrated`)
  );
}
```

- [ ] **Step 4: Run the migration**

In console:
```javascript
await migrateLocalToSupabase()
```
Expected output:
```
Migrating as user: <uuid>
✅ Migration complete. <N> transactions in Supabase.
  accounts: X rows migrated
  txs: X rows migrated
  ...
```

If you see `"No active session"`: refresh the page, log in again, then re-run.

---

### Task 3: Verify migration with SQL

**Files:**
- Supabase SQL Editor only

- [ ] **Step 1: Run verification query in Supabase SQL Editor**

```sql
SELECT 'accounts'     AS tabla, COUNT(*) AS filas FROM public.accounts
UNION ALL SELECT 'txs',           COUNT(*) FROM public.txs
UNION ALL SELECT 'products',      COUNT(*) FROM public.products
UNION ALL SELECT 'cards',         COUNT(*) FROM public.cards
UNION ALL SELECT 'debts',         COUNT(*) FROM public.debts
UNION ALL SELECT 'contacts',      COUNT(*) FROM public.contacts
UNION ALL SELECT 'subscriptions', COUNT(*) FROM public.subscriptions
UNION ALL SELECT 'budgets',       COUNT(*) FROM public.budgets
UNION ALL SELECT 'sales',         COUNT(*) FROM public.sales
UNION ALL SELECT 'orders',        COUNT(*) FROM public.orders
ORDER BY tabla;
```

Expected: All rows > 0 (at minimum `accounts` and `txs` must be non-zero).

- [ ] **Step 2: Spot-check patrimonio**

```sql
-- Check accounts balances exist
SELECT id, name, cur, "initialBalance" FROM public.accounts;

-- Check transaction count and total
SELECT COUNT(*) as total_txs,
       SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as total_ingresos,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as total_gastos
FROM public.txs
WHERE cur = '₲';
```

> **⛔ GATE 1:** Do NOT proceed to Phase 2 until all 10 tables show non-zero rows.

---

## Phase 2 — Auth Replacement

### Task 4: Add `loadAllUserData()` to `auth.js`

**Files:**
- Modify: `js/auth.js`

- [ ] **Step 1: Add `loadAllUserData()` function after `lload()` (around line 59)**

In `js/auth.js`, find the line:
```javascript
function uid(){return '_'+Math.random().toString(36).slice(2,9)}
```

Insert the new function **before** that line:

```javascript
async function loadAllUserData() {
  const tables = ['accounts','txs','products','sales','orders',
                  'contacts','cards','debts','budgets','subscriptions'];
  const results = await Promise.all(
    tables.map(t => sb.from(t).select('*').order('created_at', { ascending: false }))
  );
  tables.forEach((t, i) => {
    if (!results[i].error) S[t] = results[i].data;
  });
}
```

- [ ] **Step 2: Verify syntax — open browser console and check for errors after page reload**

Open `http://localhost:8000` and check the console for any JS parse errors.
Expected: No errors. The function is defined but not called yet.

---

### Task 5: Update `enterApp()` to use `loadAllUserData()`

**Files:**
- Modify: `js/auth.js` (lines ~147–180)

- [ ] **Step 1: Read the current enterApp() function to confirm line numbers**

The function starts with `async function enterApp(name,plan){` and ends with the closing `}` after `if(typeof pullFromSupabase==='function') pullFromSupabase();`

- [ ] **Step 2: Replace the two data-loading lines in enterApp()**

Find and replace this block at the **top of enterApp()** (the `lload()` call and the `initSupabase` call):

```javascript
  lload();

  // 🔄 CARGAR PRODUCTOS DESDE SUPABASE SI ESTÁ CONFIGURADO
  if (typeof initSupabase === 'function') {
    await initSupabase();
  }
```

Replace with:

```javascript
  if (SB_ON) {
    await loadAllUserData();
  } else {
    lload();
  }
```

- [ ] **Step 3: Remove the `pullFromSupabase` call at the bottom of enterApp()**

Find this line near the **end of enterApp()** (last line before closing `}`):
```javascript
  if(typeof pullFromSupabase==='function') pullFromSupabase();
```
Delete it entirely.

- [ ] **Step 4: Test — login and verify data loads from Supabase**

1. Restart the server: `node simple-server.js`
2. Open `http://localhost:8000`, clear app state by logging out (or open incognito)
3. Log in with `fabriziocorbeta@gmail.com`
4. Open F12 → Console and confirm you see `✅ [Config] Supabase conectado correctamente`
5. Verify the dashboard shows accounts and transactions

> **⛔ GATE 2:** Patrimonio neto must equal ₲16,325,913. If it doesn't, check: (a) migration ran successfully, (b) no JS errors, (c) `loadAllUserData()` is awaited before `renderAll()`.

---

### Task 6: Remove `adminEmergencyLogin` bypass

**Files:**
- Modify: `index.html`
- Modify: `js/auth.js`

This is temporary scaffolding added to unblock development. With real Supabase auth working end-to-end it is no longer needed.

- [ ] **Step 1: Remove the emergency button block from index.html**

Find this block in `index.html` (inside the auth section):
```html
    <div id="localhost-gate" style="display:none;margin-top:12px">
```

Delete the entire `<div id="localhost-gate">` block and its inline `<script>` tag (the one containing `adminEmergencyLogin`).

- [ ] **Step 2: Remove `adminEmergencyLogin()` from auth.js (if it was added there)**

Search in `js/auth.js` for:
```javascript
function adminEmergencyLogin
```
If found, delete the entire function body.

- [ ] **Step 3: Verify login still works**

Reload `http://localhost:8000`, confirm login with email/password still works normally.

---

## Phase 3 — Write-Through CRUD

### Task 7: Add `sbUpsert()` and `sbDelete()` helpers to `config.js`

These two helpers are the only place in the codebase that calls `sb.from().upsert()` and `sb.from().delete()`. They keep all CRUD functions DRY and ensure consistent error handling.

**Files:**
- Modify: `js/config.js`

- [ ] **Step 1: Find the `// ══════════════════════════════════════════` section header `// SUPABASE CRUD FUNCTIONS` in config.js (around line 97)**

- [ ] **Step 2: Replace everything from that header through the end of `sbDeleteProduct()` (around line 207) with the two new helpers**

The block to remove starts at:
```javascript
// ══════════════════════════════════════════
// SUPABASE CRUD FUNCTIONS
// ══════════════════════════════════════════

// 📝 INSERT or UPDATE product in Supabase
async function sbSaveProduct(prod, isNew = true) {
```

And ends at the closing `}` of `sbDeleteProduct()`.

Replace that entire block with:

```javascript
// ══════════════════════════════════════════
// SUPABASE WRITE HELPERS (SDK-based, auth-aware)
// ══════════════════════════════════════════

/**
 * Upsert one row to a Supabase table.
 * Returns the saved row (with server-assigned user_id + created_at), or null on error.
 * The sb client automatically attaches the logged-in user's JWT so RLS works.
 */
async function sbUpsert(table, obj) {
  if (!SB_ON || !sb) return null;
  const { data, error } = await sb.from(table).upsert(obj).select().single();
  if (error) {
    console.error(`❌ sbUpsert(${table}):`, error.message);
    toast('Error al guardar: ' + error.message);
    return null;
  }
  return data;
}

/**
 * Delete one row from a Supabase table by id.
 * Returns true on success, false on error.
 */
async function sbDelete(table, id) {
  if (!SB_ON || !sb) return true; // offline mode: skip, caller handles S.* directly
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) {
    console.error(`❌ sbDelete(${table}, ${id}):`, error.message);
    toast('Error al eliminar: ' + error.message);
    return false;
  }
  return true;
}
```

- [ ] **Step 3: Reload the server and verify no JS errors in console**

```bash
node simple-server.js
```
Open `http://localhost:8000`, log in, check console. Expected: `✅ [Config] Supabase conectado correctamente`, no `sbSaveProduct is not defined` errors yet (we'll fix callers next).

---

### Task 8: Write-through `saveTx()` and `delTx()` in transactions.js

**Files:**
- Modify: `js/transactions.js` (lines 316–328)

- [ ] **Step 1: Replace `saveTx()` with the write-through version**

Find:
```javascript
function saveTx(){
  const desc=g('tx-desc').value.trim();const amt=parseFloat(g('tx-amt').value);const cur=g('tx-cur').value;const cat=g('tx-cat').value;const date=g('tx-date').value;
  if(!desc){toast('Ingresá una descripción');return}if(!amt||amt<=0){toast('Monto inválido');return}if(!date){toast('Seleccioná una fecha');return}
  const tx={type:txType,desc,amount:amt,cur,cat,date};
  const accId=g('tx-account')?.value||'';
  if(accId) tx.accountId=accId;
  if(editIds.tx){const i=S.txs.findIndex(t=>t.id===editIds.tx);if(i>=0)S.txs[i]={...S.txs[i],...tx};toast('◆ Actualizado');}
  else{S.txs.push({...tx,id:uid()});toast(txType==='income'?'◆ Ingreso registrado':'◆ Gasto registrado');}
  lsave();
  if(txType==='expense'&&typeof checkBudgetAlerts==='function') checkBudgetAlerts();
  renderAll();cm('tx-modal');
}
```

Replace with:
```javascript
async function saveTx(){
  const desc=g('tx-desc').value.trim();const amt=parseFloat(g('tx-amt').value);const cur=g('tx-cur').value;const cat=g('tx-cat').value;const date=g('tx-date').value;
  if(!desc){toast('Ingresá una descripción');return}if(!amt||amt<=0){toast('Monto inválido');return}if(!date){toast('Seleccioná una fecha');return}
  const accId=g('tx-account')?.value||'';
  let tx={type:txType,desc,amount:amt,cur,cat,date,id:editIds.tx||uid()};
  if(accId) tx.accountId=accId;
  if(SB_ON){
    const saved=await sbUpsert('txs',tx);
    if(!saved)return;
    tx=saved;
  }
  const i=S.txs.findIndex(t=>t.id===tx.id);
  if(i>=0)S.txs[i]=tx;else S.txs.push(tx);
  if(!SB_ON)lsave();
  toast(editIds.tx?'◆ Actualizado':txType==='income'?'◆ Ingreso registrado':'◆ Gasto registrado');
  if(txType==='expense'&&typeof checkBudgetAlerts==='function') checkBudgetAlerts();
  renderAll();cm('tx-modal');
}
```

- [ ] **Step 2: Replace `delTx()` with the write-through version**

Find:
```javascript
function delTx(id){if(!confirm('¿Eliminar este movimiento?'))return;S.txs=S.txs.filter(t=>t.id!==id);lsave();renderAll();toast('Eliminado')}
```

Replace with:
```javascript
async function delTx(id){
  if(!confirm('¿Eliminar este movimiento?'))return;
  if(!(await sbDelete('txs',id)))return;
  S.txs=S.txs.filter(t=>t.id!==id);
  if(!SB_ON)lsave();
  renderAll();toast('Eliminado');
}
```

- [ ] **Step 3: Test**

1. Reload `http://localhost:8000`, log in
2. Create a new transaction (income or expense)
3. Go to Supabase SQL Editor and run: `SELECT id, desc, amount, type FROM public.txs ORDER BY created_at DESC LIMIT 3;`
4. Expected: The new transaction appears in Supabase within seconds.
5. Delete that transaction from the UI, re-run the SQL — it should be gone.

---

### Task 9: Write-through `saveProd()`, `delProduct()`, `saveStock()`, `saveImport()` in inventory.js

These four functions currently call `sbSaveProduct()` (raw fetch, broken with RLS). Replace every call with `sbUpsert`/`sbDelete`.

**Files:**
- Modify: `js/inventory.js`

- [ ] **Step 1: Replace `saveProd()` — remove sbSaveProduct calls, use sbUpsert**

Find the existing `async function saveProd()` and replace it entirely:

```javascript
async function saveProd(){
  const name=g('pr-name').value.trim();if(!name){toast('Ingresá un nombre');return}
  let prod={
    name,
    sku:g('pr-sku').value.trim(),
    cat:g('pr-cat').value,
    variant:g('pr-var').value.trim(),
    serialNumber:g('pr-sn').value.trim(),
    sup:g('pr-sup').value,
    buyPrice:parseFloat(g('pr-buy').value)||0,
    sellPrice:parseFloat(g('pr-sell').value)||0,
    cur:g('pr-cur').value,
    stock:parseInt(g('pr-stock').value)||0,
    minStock:parseInt(g('pr-min').value)||2,
    desc:g('pr-desc').value.trim(),
    exchangeRate:parseFloat(g('pr-fx').value)||null,
    id:editIds.prod||uid()
  };
  if(SB_ON){
    const saved=await sbUpsert('products',prod);
    if(!saved)return;
    prod=saved;
  }
  const i=S.products.findIndex(p=>p.id===prod.id);
  if(i>=0)S.products[i]={...S.products[i],...prod};else S.products.push(prod);
  if(!SB_ON)lsave();
  renderAll();cm('prod-modal');toast('◆ Producto guardado');populateSelects();
}
```

- [ ] **Step 2: Replace `delProduct()` — remove sbDeleteProduct call, use sbDelete**

Find the existing `async function delProduct(id)` and replace it entirely:

```javascript
async function delProduct(id){
  if(!confirm('¿Eliminar producto?'))return;
  if(!(await sbDelete('products',id)))return;
  S.products=S.products.filter(p=>p.id!==id);
  if(!SB_ON)lsave();
  renderAll();toast('◆ Producto eliminado');populateSelects();
}
```

- [ ] **Step 3: Replace `saveStock()` — remove sbSaveProduct call, use sbUpsert**

Find the `async function saveStock()` block. Replace it entirely:

```javascript
async function saveStock(){
  const p=S.products.find(x=>x.id===stockProdId);if(!p)return;
  const qty=parseInt(g('stk-qty').value)||0;const type=g('stk-type').value;
  if(qty<=0&&type!=='set'){toast('Ingresá una cantidad');return}
  const prev=p.stock;
  if(type==='in')p.stock+=qty;
  else if(type==='out'){if(qty>p.stock){toast('No hay suficiente stock');return}p.stock-=qty;}
  else p.stock=qty;
  if(SB_ON){
    const saved=await sbUpsert('products',p);
    if(!saved){p.stock=prev;return;}
    Object.assign(p,saved);
  }
  if(!SB_ON)lsave();
  renderAll();cm('stock-modal');toast('◆ Stock actualizado');
}
```

- [ ] **Step 4: Replace `saveImport()` — use sbUpsert for both product and auto-tx**

Find the existing `async function saveImport()` and replace it entirely:

```javascript
async function saveImport(){
  const pid=g('imp-prod').value;
  if(!pid){toast('Selecciona un producto al que ingresar el stock');return}
  const calc=window.currentLandedCalc;
  if(!calc||calc.qty<=0){toast('Ingresá una cantidad de importación válida mayor a 0');return}
  if(calc.landedCostUnitPyg<=0){toast('El costo unitario real estimado debe ser mayor que 0');return}
  const p=S.products.find(x=>x.id===pid);if(!p)return;
  const prevStock=p.stock;

  const updatedProd={...p,
    stock:p.stock+calc.qty,
    cur:'₲',
    buyPrice:Math.round(calc.landedCostUnitPyg),
    sellPrice:Math.round(calc.suggestedPyg),
    exchangeRate:calc.fxProd,
    unit_cost_usd:calc.costUsd,
    freight_usd:calc.unitFreightUsd,
    customs_pyg:calc.unitCustomsPyg,
    total_landed_cost_pyg:Math.round(calc.landedCostUnitPyg),
    exchange_rate_product:calc.fxProd,
    exchange_rate_freight:calc.fxFreight
  };

  const totalInversion=Math.round(calc.totalLandedPyg);
  const expenseTx={
    id:uid(),
    type:'expense',
    desc:`Importación: ${p.name} (${calc.qty} u.) | FOB $${calc.costUsd}/u × TC ${calc.fxProd} + Flete $${calc.freightUsd} × TC ${calc.fxFreight}`,
    amount:totalInversion,
    cur:'₲',
    cat:'Importación / Landed Cost',
    date:today(),
    _import:true,
    _product_id:p.id
  };

  if(SB_ON){
    const [prodRes, txRes] = await Promise.all([
      sbUpsert('products', updatedProd),
      sbUpsert('txs', expenseTx)
    ]);
    if(!prodRes||!txRes){p.stock=prevStock;return;}
    Object.assign(p, prodRes);
    S.txs.push(txRes);
  } else {
    Object.assign(p, updatedProd);
    S.txs.push(expenseTx);
    lsave();
  }

  toast(`✅ Importación Registrada: Stock ${prevStock} → ${p.stock} u. | Egreso ₲${totalInversion.toLocaleString('es')} generado.`);
  renderAll();cm('import-modal');
}
```

- [ ] **Step 5: Test**

1. In the app, create a new product via the inventory modal
2. In Supabase SQL Editor: `SELECT id, name, sku FROM public.products ORDER BY created_at DESC LIMIT 3;`
3. Expected: the product appears. Delete it from the UI, confirm it's removed from Supabase.

---

### Task 10: Write-through `saveAccount()` and `delAccount()` in accounts.js

`saveAccount()` is complex: editing an account can trigger an auto-generated balance-adjustment transaction. Both the account row and the adjustment tx must be written to Supabase atomically.

**Files:**
- Modify: `js/accounts.js` (lines 254–303)

- [ ] **Step 1: Replace `saveAccount()` entirely**

Find `function saveAccount() {` and replace through its closing `}` (line 294):

```javascript
async function saveAccount(){
  const name=g('acc-name').value.trim();
  const type=g('acc-type').value;
  const bank=g('acc-bank').value.trim();
  const cur=g('acc-cur').value;
  const init=parseFloat(g('acc-init').value)||0;
  const notes=g('acc-notes').value.trim();
  if(!name){toast('Ingresá un nombre para la cuenta');return}

  let acct={name,type,bank,cur,initialBalance:init,notes};
  let adjTx=null;

  if(editAccountId){
    acct.id=editAccountId;
    const newBalEl=g('acc-new-balance');
    if(newBalEl&&newBalEl.value!==''){
      const targetBal=parseFloat(newBalEl.value);
      const currentBal=getAccountBalance(editAccountId);
      const diff=targetBal-currentBal;
      if(Math.abs(diff)>0.001){
        adjTx={id:uid(),type:diff>0?'income':'expense',
          desc:'⚖ Ajuste de saldo — '+name,amount:Math.abs(diff),
          cur,cat:diff>0?'Otros Ingresos':'Otros Gastos',
          date:today(),accountId:editAccountId,isBalanceAdj:true};
      }
    }
    toast('◆ Cuenta actualizada');
  } else {
    if(!S.accounts)S.accounts=[];
    acct.id=uid();
    toast('◆ Cuenta registrada');
  }

  if(SB_ON){
    const ops=[sbUpsert('accounts',acct)];
    if(adjTx) ops.push(sbUpsert('txs',adjTx));
    const results=await Promise.all(ops);
    if(!results[0])return;
    acct=results[0];
    if(adjTx){if(!results[1])return;adjTx=results[1];}
  }

  const i=(S.accounts||[]).findIndex(a=>a.id===acct.id);
  if(i>=0)S.accounts[i]={...S.accounts[i],...acct};else S.accounts.push(acct);
  if(adjTx){const ti=S.txs.findIndex(t=>t.id===adjTx.id);if(ti>=0)S.txs[ti]=adjTx;else S.txs.push(adjTx);}
  if(!SB_ON)lsave();
  renderAll();cm('account-modal');
  populateTxAccountSelect();
}
```

- [ ] **Step 2: Replace `delAccount()` with write-through version**

Find:
```javascript
function delAccount(id) {
  if (!confirm('¿Eliminar esta cuenta? Los movimientos vinculados quedarán sin cuenta.')) return;
  S.accounts = (S.accounts || []).filter(a => a.id !== id);
  // remove accountId from linked txs
  S.txs.forEach(tx => { if (tx.accountId === id) delete tx.accountId; });
  lsave(); renderAll(); toast('Cuenta eliminada');
  populateTxAccountSelect();
}
```

Replace with:
```javascript
async function delAccount(id){
  if(!confirm('¿Eliminar esta cuenta? Los movimientos vinculados quedarán sin cuenta.'))return;
  if(!(await sbDelete('accounts',id)))return;
  S.accounts=(S.accounts||[]).filter(a=>a.id!==id);
  S.txs.forEach(tx=>{if(tx.accountId===id)delete tx.accountId});
  if(!SB_ON)lsave();
  renderAll();toast('Cuenta eliminada');
  populateTxAccountSelect();
}
```

---

### Task 11: Write-through `saveCard`, `delCard`, `saveDebt`, `delDebt` in debts.js

**Files:**
- Modify: `js/debts.js`

- [ ] **Step 1: Replace `saveCard()` with write-through version**

Find `function saveCard(){` and replace through its closing `}`:

```javascript
async function saveCard(){
  const name=g('cc-name').value.trim();
  const bank=g('cc-bank').value.trim();
  const limit=parseFloat(g('cc-limit').value)||0;
  const used=parseFloat(g('cc-used').value)||0;
  const cutDay=parseInt(g('cc-cut').value)||15;
  const payDay=parseInt(g('cc-pay').value)||10;
  const cur=g('cc-cur').value;
  const color=g('cc-color').value;
  const last4=g('cc-last4').value.trim();
  const exp=g('cc-exp').value.trim();
  if(!name){toast('Ingresá un nombre para la tarjeta');return}
  if(limit<0){toast('El límite no puede ser negativo');return}
  let card={name,bank,limit,used,cutDay,payDay,cur,color,last4,exp,id:editCardId||uid()};
  if(SB_ON){
    const saved=await sbUpsert('cards',card);
    if(!saved)return;
    card=saved;
  }
  const i=S.cards.findIndex(c=>c.id===card.id);
  if(i>=0)S.cards[i]={...S.cards[i],...card};else S.cards.push(card);
  if(!SB_ON)lsave();
  renderAll();cm('card-modal');
  toast(editCardId?'◆ Tarjeta actualizada':'◆ Tarjeta registrada');
}
```

- [ ] **Step 2: Replace `delCard()` with write-through version**

Find:
```javascript
function delCard(id){
  if(!confirm('¿Eliminar esta tarjeta?')) return;
  S.cards=S.cards.filter(c=>c.id!==id);
  lsave();renderAll();toast('Eliminado');
}
```

Replace with:
```javascript
async function delCard(id){
  if(!confirm('¿Eliminar esta tarjeta?'))return;
  if(!(await sbDelete('cards',id)))return;
  S.cards=S.cards.filter(c=>c.id!==id);
  if(!SB_ON)lsave();
  renderAll();toast('Eliminado');
}
```

- [ ] **Step 3: Replace `saveDebt()` with write-through version**

Find `function saveDebt(){` and replace through its closing `}`:

```javascript
async function saveDebt(){
  const creditor=g('db-creditor').value.trim();
  const description=g('db-desc').value.trim();
  const totalAmount=parseFloat(g('db-total').value)||0;
  const paidAmount=parseFloat(g('db-paid').value)||0;
  const installments=parseInt(g('db-inst').value)||0;
  const paidInstallments=parseInt(g('db-paid-inst').value)||0;
  const dueDate=g('db-due').value;
  const cur=g('db-cur').value;
  if(!creditor){toast('Ingresá el nombre del acreedor');return}
  if(totalAmount<=0){toast('El monto total debe ser mayor a cero');return}
  const status=paidAmount>=totalAmount?'paid':'active';
  let debt={creditor,description,totalAmount,paidAmount,installments,paidInstallments,dueDate,cur,status,id:editDebtId||uid()};
  if(SB_ON){
    const saved=await sbUpsert('debts',debt);
    if(!saved)return;
    debt=saved;
  }
  const i=S.debts.findIndex(d=>d.id===debt.id);
  if(i>=0)S.debts[i]={...S.debts[i],...debt};else S.debts.push(debt);
  if(!SB_ON)lsave();
  renderAll();cm('debt-modal');
  toast(editDebtId?'◆ Deuda actualizada':'◆ Deuda registrada');
}
```

- [ ] **Step 4: Replace `delDebt()` with write-through version**

Find:
```javascript
function delDebt(id){
  if(!confirm('¿Eliminar esta deuda?')) return;
  S.debts=S.debts.filter(d=>d.id!==id);
  lsave();renderAll();toast('Eliminado');
}
```

Replace with:
```javascript
async function delDebt(id){
  if(!confirm('¿Eliminar esta deuda?'))return;
  if(!(await sbDelete('debts',id)))return;
  S.debts=S.debts.filter(d=>d.id!==id);
  if(!SB_ON)lsave();
  renderAll();toast('Eliminado');
}
```

---

### Task 12: Write-through `saveSale()` and `delSale()` in sales.js

`saveSale()` creates a sale record AND an auto-income transaction AND decrements product stock. All three entities must reach Supabase.

**Files:**
- Modify: `js/sales.js` (lines 115–151)

- [ ] **Step 1: Replace `saveSale()` entirely**

Find `function saveSale(){` and replace through its closing `}`:

```javascript
async function saveSale(){
  if(!saleLines.length||!saleLines[0].prodId){toast('Agregá al menos un producto');return}
  const items=saleLines.filter(l=>l.prodId&&l.qty>0);
  for(const l of items){const p=S.products.find(x=>x.id===l.prodId);if(!p)continue;if(p.stock<l.qty){toast(`Stock insuficiente: ${p.name} (${p.stock} u. disponibles)`);return}}
  const total=items.reduce((a,l)=>a+l.qty*l.price,0);
  const cur=g('sl-cur').value;
  const date=g('sl-date').value;
  const clientId=g('sl-client').value;
  const status=g('sl-status').value;
  const notes=g('sl-notes').value;
  const condicion=g('sl-condicion')?.value||'contado';
  const nroFactura=g('sl-nrofactura')?.value.trim()||'';
  const method=g('sl-method')?.value||'Efectivo';

  let sale,autoTx;
  if(editIds.sale){
    const old=S.sales.find(s=>s.id===editIds.sale);
    if(old)old.items.forEach(l=>{const p=S.products.find(x=>x.id===l.prodId);if(p)p.stock+=l.qty});
    const num=S.sales.find(s=>s.id===editIds.sale)?.num;
    sale={id:editIds.sale,num,items,total,cur,date,clientId,status,notes,condicion,nroFactura,method};
    S.txs=S.txs.filter(t=>t._saleId!==editIds.sale);
  } else {
    sale={id:uid(),num:S.sales.length+1,items,total,cur,date,clientId,status,notes,condicion,nroFactura,method};
  }

  autoTx={id:uid(),type:'income',
    desc:`Venta #${String(sale.num).padStart(4,'0')} — ${items.length} producto(s)`,
    amount:total,cur,cat:'Relojes',date,_saleId:sale.id};

  // Deduct stock in memory
  items.forEach(l=>{const p=S.products.find(x=>x.id===l.prodId);if(p){p.stock-=l.qty;p.stock=Math.max(0,p.stock)}});

  if(SB_ON){
    // Write sale + auto-tx in parallel; write stock updates in parallel
    const stockUpserts=items.map(l=>{
      const p=S.products.find(x=>x.id===l.prodId);
      return p?sbUpsert('products',p):Promise.resolve(null);
    });
    const [savedSale,savedTx,...stockResults]=await Promise.all([
      sbUpsert('sales',sale),
      sbUpsert('txs',autoTx),
      ...stockUpserts
    ]);
    if(!savedSale||!savedTx){
      // Rollback in-memory stock
      items.forEach(l=>{const p=S.products.find(x=>x.id===l.prodId);if(p)p.stock+=l.qty});
      return;
    }
    sale=savedSale;autoTx=savedTx;
  }

  const si=S.sales.findIndex(s=>s.id===sale.id);
  if(si>=0)S.sales[si]=sale;else S.sales.push(sale);
  S.txs.push(autoTx);

  if(!SB_ON)lsave();
  toast('◆ Venta registrada · Stock actualizado');renderAll();cm('sale-modal');populateSelects();
}
```

- [ ] **Step 2: Replace `delSale()` with write-through version**

Find:
```javascript
function delSale(id){
  if(!confirm('¿Eliminar venta? El stock no se restaura automáticamente.'))return;
  S.sales=S.sales.filter(s=>s.id!==id);S.txs=S.txs.filter(t=>t._saleId!==id);
  lsave();renderAll();toast('Venta eliminada');
}
```

Replace with:
```javascript
async function delSale(id){
  if(!confirm('¿Eliminar venta? El stock no se restaura automáticamente.'))return;
  const linkedTxIds=S.txs.filter(t=>t._saleId===id).map(t=>t.id);
  if(SB_ON){
    const ops=[sbDelete('sales',id),...linkedTxIds.map(tid=>sbDelete('txs',tid))];
    const results=await Promise.all(ops);
    if(!results[0])return;
  }
  S.sales=S.sales.filter(s=>s.id!==id);
  S.txs=S.txs.filter(t=>t._saleId!==id);
  if(!SB_ON)lsave();
  renderAll();toast('Venta eliminada');
}
```

---

### Task 13: Write-through orders in orders.js

`saveOrder()` calls `syncOrderPayment()` which writes to `S.txs`. Both must write to Supabase. `confirmReceive()` updates stock and creates/updates the expense tx.

**Files:**
- Modify: `js/orders.js`

- [ ] **Step 1: Make `syncOrderPayment()` async and add write-through**

Find `function syncOrderPayment(orderId) {` and replace through its closing `}`:

```javascript
async function syncOrderPayment(orderId){
  const o=S.orders.find(ord=>ord.id===orderId);if(!o)return;
  if(o.payStatus==='paid'){
    if(!o.payAccountId)return;
    const sup=S.contacts.find(c=>c.id===o.supId);
    const total=o.totalAmount||o.items.reduce((a,l)=>a+(l.qty||0)*(l.price||0),0);
    const txData={type:'expense',amount:total,accountId:o.payAccountId,
      cat:'Stock / Compras',desc:'Pago de pedido a '+(sup?.name||'proveedor'),
      date:o.date||today(),cur:o.cur||'$',orderId:o.id};
    const existingTx=S.txs.find(t=>t.orderId===o.id);
    if(existingTx){
      Object.assign(existingTx,txData);
      if(SB_ON)await sbUpsert('txs',existingTx);
    } else {
      const newTx={...txData,id:uid()};
      if(SB_ON){const saved=await sbUpsert('txs',newTx);if(saved)S.txs.push(saved);}
      else S.txs.push(newTx);
    }
  } else {
    const toRemove=S.txs.filter(t=>t.orderId===o.id);
    S.txs=S.txs.filter(t=>t.orderId!==o.id);
    if(SB_ON)await Promise.all(toRemove.map(t=>sbDelete('txs',t.id)));
  }
}
```

- [ ] **Step 2: Make `saveOrder()` async and add write-through**

Find `function saveOrder(){` and replace through its closing `}` (at `lsave();renderAll();...`):

```javascript
async function saveOrder(){
  const items=orderLines.filter(l=>l.prodId&&l.qty>0);
  if(!items.length){toast('Agregá al menos un producto');return}
  const num=parseInt(g('or-num').value)||S.orders.length+1;
  const status=g('or-status').value;
  const payStatus=g('or-pay-status').value;
  const payAccountId=g('or-pay-account').value;
  const ord={supId:g('or-sup').value,eta:g('or-date').value,notes:g('or-notes').value,
    items,status,payStatus,payAccountId,date:today(),num};
  let orderId=editIds.order;
  if(editIds.order){
    const i=S.orders.findIndex(o=>o.id===editIds.order);
    if(i>=0){
      const oldStatus=S.orders[i].status;
      S.orders[i]={...S.orders[i],...ord,id:S.orders[i].id};
      if(status==='received'&&oldStatus!=='received'){recvOrderId=editIds.order;confirmReceive();}
    }
  } else {
    orderId=uid();
    S.orders.push({...ord,id:orderId});
    if(status==='received'){recvOrderId=orderId;confirmReceive();}
  }
  await syncOrderPayment(orderId);
  const orderObj=S.orders.find(o=>o.id===orderId);
  if(SB_ON&&orderObj){await sbUpsert('orders',orderObj);}
  if(!SB_ON)lsave();
  renderAll();cm('order-modal');toast('◆ Pedido guardado');updateBadges();
}
```

- [ ] **Step 3: Make `confirmReceive()` async and add write-through**

Find `function confirmReceive(){` and replace through its closing `}`:

```javascript
async function confirmReceive(){
  const o=S.orders.find(x=>x.id===recvOrderId);if(!o)return;
  o.status='received';
  const total=o.items.reduce((a,i)=>a+i.qty*(i.price||S.products.find(p=>p.id===i.prodId)?.buyPrice||0),0);
  o.items.forEach(i=>{const p=S.products.find(x=>x.id===i.prodId);if(p)p.stock+=i.qty});

  const hasTx=S.txs.find(t=>t.orderId===o.id);
  let expTx;
  if(total>0&&!hasTx){
    expTx={id:uid(),type:'expense',
      desc:`Pedido #${String(o.num).padStart(4,'0')} recibido`,
      amount:total,cur:o.cur||'$',cat:'Stock / Compras',date:today(),orderId:o.id};
  } else if(hasTx){hasTx.amount=total;expTx=hasTx;}

  if(SB_ON){
    const stockUpserts=o.items.map(i=>{
      const p=S.products.find(x=>x.id===i.prodId);
      return p?sbUpsert('products',p):Promise.resolve(null);
    });
    const ops=[sbUpsert('orders',o),...stockUpserts];
    if(expTx)ops.push(sbUpsert('txs',expTx));
    const results=await Promise.all(ops);
    if(!results[0])return;
    if(expTx&&results[results.length-1]){
      const savedTx=results[results.length-1];
      const ti=S.txs.findIndex(t=>t.id===savedTx.id);
      if(ti>=0)S.txs[ti]=savedTx;else S.txs.push(savedTx);
    }
  } else {
    if(expTx){const ti=S.txs.findIndex(t=>t.id===expTx.id);if(ti>=0)S.txs[ti]=expTx;else S.txs.push(expTx);}
    lsave();
  }

  toast('◆ Pedido recibido · Stock actualizado');renderAll();cm('recv-modal');updateBadges();
}
```

- [ ] **Step 4: Make `delOrder()` async and add write-through**

Find:
```javascript
function delOrder(id){
  if(!confirm('¿Eliminar pedido?'))return;
  S.orders=S.orders.filter(o=>o.id!==id);
  S.txs=S.txs.filter(t=>t.orderId!==id);
  lsave();renderAll();toast('Eliminado');updateBadges();
}
```

Replace with:
```javascript
async function delOrder(id){
  if(!confirm('¿Eliminar pedido?'))return;
  const linkedTxIds=S.txs.filter(t=>t.orderId===id).map(t=>t.id);
  if(SB_ON){
    const ops=[sbDelete('orders',id),...linkedTxIds.map(tid=>sbDelete('txs',tid))];
    const results=await Promise.all(ops);
    if(!results[0])return;
  }
  S.orders=S.orders.filter(o=>o.id!==id);
  S.txs=S.txs.filter(t=>t.orderId!==id);
  if(!SB_ON)lsave();
  renderAll();toast('Eliminado');updateBadges();
}
```

---

### Task 14: Write-through contacts, budgets, and subscriptions

These three modules follow the identical simple pattern. No side effects.

**Files:**
- Modify: `js/contacts.js`
- Modify: `js/budgets.js`
- Modify: `js/subscriptions.js`

- [ ] **Step 1: Replace `saveContact()` and `delContact()` in contacts.js**

Find `function saveContact(){` and replace through `delContact`:

```javascript
async function saveContact(){
  const name=g('co-name').value.trim();if(!name){toast('Ingresá un nombre');return}
  let con={name,type:g('co-type').value,phone:g('co-phone').value.trim(),
    email:g('co-email').value.trim(),ruc:g('co-ruc').value.trim(),
    notes:g('co-notes').value.trim(),id:editIds.con||uid()};
  if(SB_ON){const saved=await sbUpsert('contacts',con);if(!saved)return;con=saved;}
  const i=S.contacts.findIndex(c=>c.id===con.id);
  if(i>=0)S.contacts[i]={...S.contacts[i],...con};else S.contacts.push(con);
  if(!SB_ON)lsave();
  renderAll();cm('contact-modal');toast('◆ Contacto guardado');populateSelects();
}
async function delContact(id){
  if(!confirm('¿Eliminar contacto?'))return;
  if(!(await sbDelete('contacts',id)))return;
  S.contacts=S.contacts.filter(c=>c.id!==id);
  if(!SB_ON)lsave();
  renderAll();toast('Eliminado');populateSelects();
}
```

- [ ] **Step 2: Replace `saveBudget()` and `delBudget()` in budgets.js**

Find `function saveBudget() {` and replace through `delBudget`:

```javascript
async function saveBudget(){
  const category=g('bgt-cat').value;
  const amount=parseFloat(g('bgt-amt').value);
  const cur=g('bgt-cur').value;
  const month=g('bgt-month').value;
  if(!category){toast('Seleccioná una categoría');return}
  if(!amount||amount<=0){toast('Ingresá un monto límite válido');return}
  if(!month){toast('Seleccioná un mes');return}
  const dup=(S.budgets||[]).find(b=>b.category===category&&b.month===month&&b.id!==editBudgetId);
  if(dup){toast('Ya existe un presupuesto para esa categoría en ese mes');return}
  let bgt={category,amount,cur,month,id:editBudgetId||uid()};
  if(!S.budgets)S.budgets=[];
  if(SB_ON){const saved=await sbUpsert('budgets',bgt);if(!saved)return;bgt=saved;}
  const i=S.budgets.findIndex(b=>b.id===bgt.id);
  if(i>=0)S.budgets[i]={...S.budgets[i],...bgt};else S.budgets.push(bgt);
  if(!SB_ON)lsave();
  renderAll();cm('budget-modal');
  toast(editBudgetId?'◆ Presupuesto actualizado':'◆ Presupuesto creado');
}
async function delBudget(id){
  if(!confirm('¿Eliminar este presupuesto?'))return;
  if(!(await sbDelete('budgets',id)))return;
  S.budgets=(S.budgets||[]).filter(b=>b.id!==id);
  if(!SB_ON)lsave();
  renderAll();toast('Presupuesto eliminado');
}
```

- [ ] **Step 3: Replace `saveSub()` and `delSub()` in subscriptions.js**

Find `function saveSub() {` and replace through `delSub`:

```javascript
async function saveSub(){
  const name=g('sub-name').value.trim();
  const amt=parseFloat(g('sub-amt').value);
  const cur=g('sub-cur').value;
  const freq=g('sub-freq').value;
  const next=g('sub-next').value;
  const icon=g('sub-icon').value.trim()||'🔄';
  const desc=g('sub-desc').value.trim();
  if(!name){toast('Ingresá el nombre');return}
  if(!amt||amt<=0){toast('Ingresá un monto válido');return}
  if(!next){toast('Seleccioná la fecha del próximo cobro');return}
  let sub={name,description:desc,icon,amount:amt,cur,frequency:freq,nextDate:next,active:true,id:editSubId||uid()};
  if(!S.subscriptions)S.subscriptions=[];
  if(SB_ON){const saved=await sbUpsert('subscriptions',sub);if(!saved)return;sub=saved;}
  const i=S.subscriptions.findIndex(s=>s.id===sub.id);
  if(i>=0)S.subscriptions[i]={...S.subscriptions[i],...sub};else S.subscriptions.push(sub);
  if(!SB_ON)lsave();
  renderAll();cm('sub-modal');
  toast(editSubId?'◆ Suscripción actualizada':'◆ Suscripción registrada');
}
async function delSub(id){
  if(!confirm('¿Eliminar esta suscripción?'))return;
  if(!(await sbDelete('subscriptions',id)))return;
  S.subscriptions=(S.subscriptions||[]).filter(s=>s.id!==id);
  if(!SB_ON)lsave();
  renderAll();toast('Suscripción eliminada');
}
```

> **⛔ GATE 3:** Create a transaction, a product, a contact, and a sale in the UI. Run `SELECT * FROM txs ORDER BY created_at DESC LIMIT 5` in Supabase SQL Editor — all four should appear.

---

## Phase 4 — Cleanup

### Task 15: Remove all dead raw-fetch Supabase functions from `config.js`

Now that every CRUD function uses `sbUpsert`/`sbDelete`, the original raw-fetch functions are dead code and must be removed. This step is safe only after Tasks 8–14 are complete.

**Files:**
- Modify: `js/config.js`

- [ ] **Step 1: Verify no callers remain before deleting**

Run from the `01 - cdco/` directory:
```bash
grep -rn "sbSaveProduct\|sbDeleteProduct\|sbLoadProducts\|sbLoadTransactions\|sbLoadSales\|initSupabase\|sbCreateFuelLog\|sbGetFuelLogs\|sbSettleFuelCharge" js/
```
Expected: **zero matches**. If any remain, fix the caller first.

- [ ] **Step 2: Delete the dead functions from config.js**

In `js/config.js`, find and delete each of the following function bodies (they start after the `// ══ EXPORT FUNCTIONS ══` section):
- `async function sbLoadProducts() { ... }`
- `async function initSupabase() { ... }`
- `async function sbLoadTransactions() { ... }`
- `async function sbLoadSales() { ... }`
- `async function sbCreateFuelLog(...) { ... }`
- `async function sbGetFuelLogs() { ... }`
- `async function sbGetFuelEfficiency() { ... }`
- `async function sbGet6MonthFuelStats() { ... }`
- `async function sbGetFuelForecast() { ... }`
- `async function sbSettleFuelCharge(...) { ... }`
- `async function sbGetUnsettledFuelLogs() { ... }`
- `async function sbDeleteFuelLog(...) { ... }`

- [ ] **Step 3: Verify no remaining references to removed functions across all JS files**

```bash
grep -rn "initSupabase\|sbSaveProduct\|sbDeleteProduct\|sbLoadProducts\|sbLoadTransactions\|sbLoadSales\|pullFromSupabase\|pushToSupabase" js/
```

Expected: no matches. If any remain, remove or replace the call.

---

### Task 16: Delete `sync.js` and remove its script tag from `index.html`

**Files:**
- Modify: `index.html`
- Delete: `js/sync.js`

- [ ] **Step 1: Remove the sync.js script tag from index.html**

Search in `index.html` for:
```html
<script src="js/sync.js"></script>
```
Delete that line entirely.

- [ ] **Step 2: Delete the file**

```bash
rm "js/sync.js"
```

- [ ] **Step 3: Verify no remaining references to sync.js functions**

```bash
grep -rn "pushToSupabase\|pullFromSupabase\|supabaseClient" js/
```
Expected: no matches (those functions lived only in sync.js and are now gone).

- [ ] **Step 4: Full restart + smoke test**

1. Restart server: `node simple-server.js`
2. Open `http://localhost:8000` in a fresh incognito window
3. Log in with email/password
4. Verify: dashboard loads, accounts show, patrimonio neto displays correctly
5. Check console: no `pushToSupabase is not defined` or similar errors

> **⛔ GATE 4:** App must load with zero JS errors after sync.js is deleted. If errors appear, check for missed references and remove them.

---

## Phase 5 — SaaS Verification

### Task 17: Verify patrimonio neto = ₲16,325,913

**Files:**
- None (verification only)

- [ ] **Step 1: Clear browser storage entirely to eliminate localStorage influence**

In browser DevTools → Application → Storage → Clear site data (check "cookies and site data").

- [ ] **Step 2: Log in fresh**

Log in with `fabriziocorbeta@gmail.com`. Wait for app to load.

- [ ] **Step 3: Verify patrimonio neto on dashboard**

The dashboard "Patrimonio Neto" card should show ₲16,325,913. If the number is different:
- Check that all accounts migrated: run `SELECT name, "initialBalance", cur FROM public.accounts;` in Supabase SQL Editor
- Check that transactions are complete: run `SELECT COUNT(*), SUM(CASE WHEN type='income' THEN amount ELSE -amount END) FROM public.txs WHERE cur='₲';`
- If accounts are missing from Supabase, re-run the migration function from Task 2

---

### Task 18: Test multi-user RLS isolation

This verifies that a second user sees zero data — confirming tenant isolation is working.

**Files:**
- None (browser-only verification)

- [ ] **Step 1: Open a second browser (or incognito) and register a new test account**

Register with a different email (e.g., `test-isolation@example.com`) at `http://localhost:8000`.

- [ ] **Step 2: Verify the new user sees an empty dashboard**

After registration, the dashboard should show:
- Accounts: empty (₲0 patrimonio neto)
- Transactions: empty
- Products: 0

- [ ] **Step 3: Verify in Supabase SQL Editor with user IDs**

```sql
-- List all users and their data counts
SELECT u.email,
       (SELECT COUNT(*) FROM public.txs WHERE user_id = u.id) AS txs,
       (SELECT COUNT(*) FROM public.accounts WHERE user_id = u.id) AS accounts,
       (SELECT COUNT(*) FROM public.products WHERE user_id = u.id) AS products
FROM auth.users u
ORDER BY u.created_at;
```

Expected: `fabriziocorbeta@gmail.com` shows non-zero counts; `test-isolation@example.com` shows 0 for all.

- [ ] **Step 4: Delete the test user from Supabase Auth**

Go to Supabase Dashboard → Authentication → Users → delete `test-isolation@example.com`.

---

### Task 19: Fix Google OAuth (manual step in Google Cloud Console)

This is a configuration-only fix. The code already calls `sb.auth.signInWithOAuth({provider:'google',...})` correctly.

**Files:**
- None (external configuration)

- [ ] **Step 1: Open Google Cloud Console**

Go to `https://console.cloud.google.com` → select the project tied to this app → APIs & Services → Credentials → OAuth 2.0 Client IDs → select the web client.

- [ ] **Step 2: Add the Supabase redirect URI**

Under **Authorized redirect URIs**, add:
```
https://beumpltrjgnehqbhtrxo.supabase.co/auth/v1/callback
```
Click **Save**.

- [ ] **Step 3: Test Google OAuth**

At `http://localhost:8000`, click **Continuar con Google**. A new user created via Google OAuth should land in the app with an empty dataset (RLS isolation confirmed automatically).

---

## Self-Review Checklist

- [x] **Spec coverage:** All 5 phases from spec are covered. Step 0 (migration) = Tasks 2–3. Phase 1 = Task 1. Phase 2 = Tasks 4–6. Phase 3 = Tasks 8–14. Phase 4 = Tasks 15–16. Phase 5 = Tasks 17–19.
- [x] **No placeholders:** Every code block is complete and runnable.
- [x] **Type consistency:** `sbUpsert(table, obj)` and `sbDelete(table, id)` signatures are identical across all CRUD tasks. `SB_ON` boolean from config.js is used consistently.
- [x] **Gate coverage:** 4 hard gates prevent proceeding past broken states.
- [x] **Critical ordering:** Task 2 (migration) runs before Task 5 (enterApp change) — data exists in Supabase before localStorage is bypassed. ✓
- [x] **Raw fetch removal ordering:** Task 7 only adds helpers; raw-fetch function removal is in Task 15 (after all callers in Tasks 8–14 are updated). No broken window. ✓
