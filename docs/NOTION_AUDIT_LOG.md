# CD & Co ERP — Audit Log 360

> Fecha: 2026-04-13 | Auditor: Claude Code (Opus 4.6) | Commits: `8769755`, `2cd443d`, `6e930ec`, `e7a02fa`, `23b2df4`, `63d59a9`

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

## Errores Pendientes

### Prioridad Alta

| # | Modulo | Problema | Impacto | Esfuerzo |
|---|--------|----------|---------|----------|
| P1 | `categorias` table | RLS desactivado — cualquier usuario autenticado puede leer/escribir categorias de otros | Fuga de datos | SQL migration |
| P2 | API `admin.js` | CORS con `*` — cualquier origen puede llamar endpoints admin | Seguridad API | Restringir a dominio |
| P3 | `api/update-user-plan.js` | CORS con `*` | Seguridad API | Restringir a dominio |
| P4 | `subscriptions.js` | Balance sync usa `sb.from('accounts').update()` directo (sin `user_id` filter) linea 201 | Multi-tenant leak | Agregar `.eq('user_id')` |
| P5 | `debts.js` | Card payment flow (lineas 520-563) no usa `recomputeBalances()` — manipula balance manualmente | Desinc de saldo | Refactorizar a pattern estandar |
| P6 | `accounts.js` | `sbDeleteProduct()` y `sbDeleteFuelLog()` en config.js no usan filtro `user_id` | Multi-tenant | Agregar filtro |
| P7 | Global | Funciones `async` en onclick handlers no capturan errores — un throw silencioso deja UI colgada | UX | Wrappear en try/catch |

### Prioridad Media

| # | Modulo | Problema | Impacto |
|---|--------|----------|---------|
| M1 | `dashboard.js` | innerHTML con expense category names sin escHtml (linea 364) | XSS potencial |
| M2 | `settings.js` | Plan cards innerHTML con template literals (linea 73) | XSS bajo riesgo |
| M3 | `fleet.js` | Alertas de mantenimiento innerHTML con fechas (linea 90) | XSS bajo riesgo |
| M4 | `orders.js` | Product names en receive modal sin escapar (linea 192) | XSS |
| M5 | Global | Service Worker cache (`cdco-cache-v3`) no se invalida automaticamente en cada deploy | Cache stale |
| M6 | `auth.js` | `recomputeBalances()` usa `Math.abs()` incondicional — txs negativos (gastos) se vuelven positivos y luego se niegan | Potencial doble negacion |
| M7 | Global | No hay rate limiting en API endpoints serverless | Abuso de API |

### Prioridad Baja

| # | Modulo | Problema | Impacto |
|---|--------|----------|---------|
| B1 | `categorias` table | Falta columna `user_id` — no hay aislamiento por usuario | Arquitectura |
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

> Generado automaticamente por Claude Code | Sesion 2026-04-13
