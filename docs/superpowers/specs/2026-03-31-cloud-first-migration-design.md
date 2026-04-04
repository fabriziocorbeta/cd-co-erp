# CD & Co ERP — Cloud-First SaaS Migration
**Date:** 2026-03-31
**Status:** Approved
**Goal:** Migrate from localStorage-first personal tool to Supabase-primary multi-tenant SaaS for 20–100+ PyME users

---

## Context

CD & Co ERP is a vanilla-JS financial management system (accounts, transactions, inventory, sales) currently running as a localStorage-first SPA served by a Node.js static server on port 8000. Supabase exists as secondary storage but sync is broken and RLS policies are incomplete. The owner wants to convert this into a SaaS product targeting small businesses in Paraguay/Latam.

**Stack:**
- Frontend: Vanilla JS, single `index.html` (1401 lines), ~27 JS modules loaded globally
- Server: `simple-server.js` (Node.js HTTP, port 8000) — serves static files + API endpoints
- Database: Supabase (PostgreSQL + Auth + RLS), project `beumpltrjgnehqbhtrxo`
- Auth: Supabase Auth (email/password working; Google OAuth broken — `invalid_client` due to missing callback URL in Google Cloud Console)

---

## Design Decisions

### Data Architecture

Supabase is the single source of truth. localStorage is a read-only fallback for offline/degraded states only. The global `S` object remains as an in-memory session cache.

**New data flow:**
```
Login → getSession() → loadAllUserData() → S.* populated from Supabase
Every CRUD → write to Supabase first → update S.* in memory → re-render affected module
```

**Eliminated:**
- `lsave()` as primary persistence (kept only as optional offline backup)
- `lload()` as primary data source (replaced by `loadAllUserData()`)
- `sync.js` entirely (both `pushToSupabase()` and `pullFromSupabase()`)
- `defaults()` with demo data injected into real accounts (replaced by `seedDemoData()` behind explicit flag)

### Auth

Supabase Auth handles all session management. Three supported flows:
1. **Email/password** — works today, primary flow
2. **Google OAuth** — fix requires adding `https://beumpltrjgnehqbhtrxo.supabase.co/auth/v1/callback` to Google Cloud Console authorized redirect URIs
3. **Demo mode** — `seedDemoData()` creates isolated demo data, never mixed with real data

Session states:
| State | Behavior |
|-------|----------|
| No session | Show login screen, no data loaded |
| Valid session | `loadAllUserData()` → enter app |
| Expired session | Supabase refresh token handles automatically |
| Network error | Use S.* in-memory cache, show warning banner |

The `adminEmergencyLogin()` bypass and `⚡ Acceso Admin` button are **temporary scaffolding** — removed after auth works end-to-end.

### Multi-Tenancy / RLS

All 10 tables enforce `user_id = auth.uid()` via RLS policies. The frontend never passes `user_id` explicitly — Supabase injects it server-side via `auth.uid()`.

Tables requiring RLS completion: `accounts`, `txs`, `products`, `sales`, `orders`, `contacts`, `cards`, `debts`, `budgets`, `subscriptions`.

Policy pattern (identical for all tables):
```sql
CREATE POLICY "user_isolation" ON public.{table}
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### CRUD Pattern — Write-Through

Each save operation writes to Supabase first, then updates `S.*` in memory:

```javascript
// Pattern for all save functions
// Note: user_id is NOT passed explicitly — Supabase injects it via auth.uid() on the server
async function saveTx(tx) {
  const { data, error } = await sb.from('txs').upsert(tx);
  if (error) { toast('Error al guardar'); return; }
  // Update S.txs in memory
  const idx = S.txs.findIndex(t => t.id === tx.id);
  if (idx >= 0) S.txs[idx] = data[0]; else S.txs.push(data[0]);
  renderTxs(); // re-render only affected module, not renderAll()
}
```

**Performance gain:** No more serializing 10 arrays on every save. One row written per operation.

### `loadAllUserData()` — replaces lload() + pullFromSupabase()

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

All fetches are parallel. RLS on Supabase side guarantees tenant isolation automatically.

---

## Step 0 — Data Migration (MUST complete before any other step)

The owner has real business data in localStorage (₲ 16,325,913 in accounts + all transactions). This data must be migrated to Supabase before localStorage logic is removed.

### Migration function `migrateLocalToSupabase()`

Run once from browser console (F12) after creating a Supabase account:

```javascript
async function migrateLocalToSupabase() {
  const local = JSON.parse(localStorage.getItem('cdco_erp_v1'));
  if (!local) { console.error('No data found'); return; }

  const { data: { session } } = await sb.auth.getSession();
  if (!session) { console.error('No active session — log in first'); return; }
  const uid = session.user.id;

  const tables = {
    accounts: local.accounts || [],
    txs: local.txs || [],
    products: local.products || [],
    cards: local.cards || [],
    debts: local.debts || [],
    contacts: local.contacts || [],
    subscriptions: local.subscriptions || [],
    budgets: local.budgets || [],
    sales: local.sales || [],
    orders: local.orders || [],
  };

  const results = await Promise.all(
    Object.entries(tables).map(([table, rows]) =>
      rows.length > 0
        ? sb.from(table).upsert(rows.map(r => ({ ...r, user_id: uid })), { onConflict: 'id' })
        : Promise.resolve({ error: null })
    )
  );

  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    console.error('Migration errors:', errors.map(e => e.error.message));
    return;
  }

  // Verification
  const { count } = await sb.from('txs').select('*', { count: 'exact', head: true });
  console.log(`✅ Migration complete. ${count} transactions in Supabase.`);
  console.log('Run verification SQL in Supabase SQL Editor to confirm all tables.');
}
```

### Verification SQL (run in Supabase SQL Editor after migration)

```sql
SELECT 'accounts' as tabla, COUNT(*) as filas FROM public.accounts
UNION ALL SELECT 'txs', COUNT(*) FROM public.txs
UNION ALL SELECT 'products', COUNT(*) FROM public.products
UNION ALL SELECT 'cards', COUNT(*) FROM public.cards
UNION ALL SELECT 'debts', COUNT(*) FROM public.debts
UNION ALL SELECT 'contacts', COUNT(*) FROM public.contacts
UNION ALL SELECT 'subscriptions', COUNT(*) FROM public.subscriptions
UNION ALL SELECT 'budgets', COUNT(*) FROM public.budgets
ORDER BY tabla;
-- All rows must be > 0 before proceeding
```

**Gate:** Do NOT proceed to implementation steps until the verification SQL shows non-zero rows in all tables.

---

## Implementation Order

### Phase 1 — Foundation (blocker removal)
1. Complete RLS policies on all 10 tables
2. Fix Google OAuth callback URL in Google Cloud Console
3. Run data migration (Step 0 above)
4. Verify migration with SQL

### Phase 2 — Auth replacement
5. Replace `lload()` + `defaults()` in `enterApp()` with `loadAllUserData()`
6. Update `doLogin()` and `doReg()` to use new flow
7. Remove `adminEmergencyLogin()` and `⚡ Acceso Admin` button
8. Test: register → login → data visible from Supabase

### Phase 3 — Write-through CRUD
9. Update `saveTx()`, `saveProd()`, `saveImport()`, `saveStock()` to write-through pattern
10. Update `delTx()`, `delProduct()` to delete from Supabase
11. Update `saveAccount()`, `saveCard()`, `saveDebt()` to write-through
12. Test: create transaction → verify in Supabase SQL Editor

### Phase 4 — Cleanup
13. Remove `sync.js`
14. Remove `pushToSupabase()` and `pullFromSupabase()` calls
15. Rename `defaults()` to `seedDemoData()`, gate behind explicit flag
16. Remove `adminEmergencyLogin()` references from `index.html`
17. localStorage becomes optional backup only

### Phase 5 — SaaS readiness
18. Verify patrimonio neto = ₲ 16,325,913 after migration
19. Test multi-user isolation: two accounts, verify data doesn't bleed
20. Fix Google OAuth end-to-end
21. Onboard first external user

---

## What Does NOT Change

- All UI: modals, styles, layouts, charts
- `S.*` object structure in memory
- Helper functions: `fmt()`, `uid()`, `today()`, `fmtDate()`
- `simple-server.js` static file serving
- All module JS files structure (accounts.js, transactions.js, etc.)
- FASE 2 landed cost calculator (already implemented)

---

## Success Criteria

- [ ] Owner logs in with email/password, sees ₲ 16,325,913 patrimonio neto from Supabase
- [ ] A second test user sees zero data (RLS isolation confirmed)
- [ ] Google OAuth works end-to-end (new user registers via Google, profile created)
- [ ] All CRUD operations persist to Supabase with no localStorage dependency
- [ ] `sync.js` deleted, `lsave()`/`lload()` no longer in critical path
