# CD & Co ERP — Audit Log 360

> Fecha: 2026-04-13 → 2026-04-14 | Auditor: Claude Code (Opus 4.6 + Sonnet 4.6) | Commits: `8769755`, `2cd443d`, `6e930ec`, `e7a02fa`, `23b2df4`, `63d59a9`, `b73150f`, `7c82243`, `c4bbe30`, `pendiente`

---

## Errores Corregidos (Esta Sesion)

### Integridad Financiera (CRITICA)

| # | Modulo | Problema | Fix | Commit |
|---|--------|----------|-----|--------|
| 1 | `transactions.js` | `saveTx()` no sincronizaba balance a Supabase despues de `recomputeBalances()` | Nuevo helper `_syncAccountBalance()` + rollback atomico si falla | `6e930ec` |
| 2 | `accounts.js` | `saveAccount()` (ajustes de saldo GNB) no incluia `balance` en `sbUpsert('accounts')` — solo metadata | Incluir `balance: S.accounts[i].balance` en upsert | `2cd443d` |
| 3 | `accounts.js` | `saveAccount()` no llamaba `recomputeBalances()` despues del adj tx | Agregar `recomputeBalances()` post-insert | `2cd443d` |
| 4 | `sales.js` | `saveSale()` creaba tx local sin persistir a Supabase ni recalcular balances | `sbSaveTransaction()` + `recomputeBalances()` | `8769755` |
| 5 | `orders.js` | `saveOrder()` y `confirmReceive()` — txs solo en memoria, sin Supabase ni balance sync | `sbSaveTransaction()` + `recomputeBalances()` + `_syncAccountBalance()` | `8769755` |
| 6 | `debts.js` | Pago de deuda creaba tx pero no recalculaba balance de cuenta vinculada | `recomputeBalances()` + `_syncAccountBalance(accId)` | `8769755` |
| 7 | `fleet.js` | Carga de combustible usaba `sbUpsert('txs')` sin await, sin recalcular balance | `await sbSaveTransaction()` + `recomputeBalances()` + `_syncAccountBalance()` | `8769755` |
| 8 | `accounts.js` | Transferencias entre cuentas no sincronizaban balances post-tx | `recomputeBalances()` + `_syncAccountBalance()` en ambas cuentas | `8769755` |
| 9 | `inventory.js` | Compra de stock creaba tx local sin Supabase ni balance sync | `sbSaveTransaction()` + `recomputeBalances()` | `8769755` |
| 10 | `receivables.js` | Cobro de cuenta por cobrar creaba tx local sin Supabase | `sbSaveTransaction()` + `recomputeBalances()` | `8769755` |

### Seguridad (ALTA)

| # | Modulo | Problema | Fix | Commit |
|---|--------|----------|-----|--------|
| 11 | `config.js` | `sbDelete()` permitia borrar cualquier registro por ID (sin filtro `user_id`) | `.eq('user_id', userId)` agregado | `63d59a9` |
| 12 | `fleet.js` | `deleteVehicle()` — delete directo sin `.eq('user_id')` | Agregado `.eq('user_id', S.user.id)` | `8769755` |
| 13 | `goals.js` | `deleteGoal()` — delete directo sin `.eq('user_id')` | Agregado `.eq('user_id', S.user.id)` | `8769755` |
| 14 | `nav.js` | XSS en `populateTxCat`, `populateSelects`, `bgtCat` — nombres de usuario sin escapar en innerHTML | `escHtml()` aplicado a todos los campos | `63d59a9` |
| 15 | `accounts.js` | XSS en `populateTxAccountSelect` y `openTransferModal` — nombres de cuentas/tarjetas sin escapar | `escHtml()` aplicado | `23b2df4`, `8769755` |
| 16 | `inventory.js` | XSS en selector de producto del import modal | `escHtml()` en name, sku, cat | `8769755` |
| 17 | `orders.js` | XSS en modal de recepcion — nombre de proveedor sin escapar | `escHtml(sup.name)` | `8769755` |

### Bugs de Inicio (CRITICA)

| # | Modulo | Problema | Fix | Commit |
|---|--------|----------|-----|--------|
| 18 | `auth.js` | `ReferenceError: initFx is not defined` — crasheaba la app al iniciar | Stub en config.js + `typeof` guards en auth.js + self-invoke en fx.js | `e7a02fa`, `23b2df4` |
| 19 | `nav.js` | `saveNewCat()` llamaba `supabase.from()` (variable inexistente, el cliente es `sb`) | Corregido a `sb.from('categorias')` con patron local-first | `63d59a9` |
| 20 | `config.js` | Emoji-Mart solo mostraba emojis de caras por `data: window['emoji-mart-data']` | Eliminada prop `data:` para usar CDN completo | `63d59a9` |
| 21 | `nav.js` | `populateSelects()` no llamaba `populateTxAccountSelect()` — tarjetas desaparecian del selector | Agregado al final de `populateSelects()` | `23b2df4` |

### Limpieza

| # | Modulo | Problema | Fix | Commit |
|---|--------|----------|-----|--------|
| 22 | `config.js` | Stubs mostraban `[stub] X no disponible aun` en consola | Silenciados: `const _stub = _n => function(){};` | `6e930ec` |
| 23 | `config.js` | `sbUpsert` logueaba JSON completo de cada write | `console.log` eliminado | `2cd443d` |
| 24 | `config.js` | `sbSaveTransaction` logueaba payload completo | `console.log` eliminado | `8769755` |

---

## Completado en Lote 2026-04-14 (commit `7c82243`)

| # | Modulo | Fix aplicado |
|---|--------|-------------|
| ✅ P1 | `categorias` table | Migration SQL: `ADD COLUMN user_id`, `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY "categorias_own"` vía Supabase MCP |
| ✅ P2 | `api/admin.js` | CORS restringido a `ALLOWED_ORIGINS` — devuelve 403 si el origen no está en la lista |
| ✅ P3 | `api/update-user-plan.js` | Mismo hardening CORS que P2 |
| ✅ P4 | `subscriptions.js` | Agregado `.eq('user_id', S.user?.id)` al `accounts.update()` de balance sync |
| ✅ P5 | `debts.js` | Card payment ahora llama `recomputeBalances()` tras insertar la tx |
| ✅ P6 | `config.js` | `sbDeleteProduct()` añade `&user_id=eq.{userId}` a la URL del fetch |
| ✅ M1 | `dashboard.js` | `escHtml()` aplicado a nombres de categoría en el resumen de gastos |
| ✅ M4 | `orders.js` | `escHtml()` aplicado a nombres de producto en el modal de recepción |
| ✅ M5 | `sw.js` | `CACHE_VERSION = '20260414a'` — invalidación automática en cada deploy |
| ✅ M6 | `auth.js` | `recomputeBalances()` refactorizado con matching explícito por tipo (`expense`, `transfer-out`, `transfer-in`) — elimina doble negación |
| ✅ B1 | `categorias` table | Resuelto con la misma migration de P1 |

---

## Completado en Lote 2026-04-14 — Sesion 2 (commit en este push)

| # | Modulo | Fix aplicado |
|---|--------|-------------|
| ✅ P7 | `saveProd`, `saveStock`, `saveAccount`, `saveTransfer` | Try/catch global en todas las funciones async críticas — toast de error en caso de excepción inesperada |
| ✅ Seguridad | `config.js sbSaveProduct` | INSERT: agregado `user_id` al payload; UPDATE: URL filtrada con `&user_id=eq.{userId}` para bloquear cross-tenant write |
| ✅ Admin↔ERP | `api/admin.js` | Agregado handler PATCH para actualización de productos desde el panel admin usando `service_role_key`; el ERP ve el cambio en la próxima carga (misma tabla) |
| ✅ M2 | `settings.js buildPlanCards` | Auditado: los valores son literales hardcodeados (sin datos de usuario) — no hay riesgo XSS real; marcado como no accionable |
| ✅ M3 | `fleet.js checkMaintenanceAlert` | `lastStr` proviene de `Date.toLocaleDateString()` (dato del sistema, no del usuario) — no hay riesgo XSS |
| ✅ CSS | `css/app.css light mode` | Pills (neu/warn/blue/pur/gold), pcard, stat-val, tbl mono, labels, analytics panels — contraste WCAG AA garantizado sobre fondos claros |

## Errores Pendientes

### Prioridad Alta

*(ninguno — todos los P cerrados)*

### Prioridad Media

| # | Modulo | Problema | Impacto |
|---|--------|----------|---------|
| M7 | Global | No hay rate limiting en API endpoints serverless | Abuso de API |

### Prioridad Baja

| # | Modulo | Problema | Impacto |
|---|--------|----------|---------|
| B2 | Global | localStorage puede crecer indefinidamente (txs array) | Performance |
| B3 | `fx.js` | Auto-refresh cada 30min via `setInterval` — no se limpia al logout | Memory leak menor |
| B4 | `receivables.js` | Foreign key apunta a `profiles.id` en vez de `auth.users.id` | Consistencia DB |
| B5 | Global | No hay mecanismo de offline queue — txs creadas offline se pierden si se recarga antes de sync | Data loss |

---

## Sugerencias de Arquitectura (Siguiente Fase)

### 1. Server-Side Balance Computation
Crear una funcion RPC en Supabase:
```sql
CREATE OR REPLACE FUNCTION compute_account_balance(acc_id TEXT, uid UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(
    CASE WHEN type = 'expense' THEN -ABS(amount)
         ELSE ABS(amount) END
  ), 0)
  FROM txs
  WHERE account_id = acc_id AND user_id = uid;
$$ LANGUAGE SQL STABLE;
```
Esto elimina la dependencia del calculo client-side y funciona como fuente de verdad.

### 2. Categorias con User Isolation
```sql
ALTER TABLE categorias ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON categorias FOR ALL USING (auth.uid() = user_id);
```

### 3. CORS Restrictivo en APIs
```javascript
const ALLOWED = ['https://cd-co-hub.vercel.app'];
if (!ALLOWED.includes(origin)) return res.status(403).json({ error: 'Forbidden' });
```

### 4. Offline Queue (Futuro)
Implementar un array `pendingOps` en localStorage que acumule operaciones offline y las ejecute en orden al reconectar. Patron: Command Queue + idempotent writes.

---

> Generado automaticamente por Claude Code | Sesion 2026-04-13 → 2026-04-14
