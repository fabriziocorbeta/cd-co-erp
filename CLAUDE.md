# CD & Co — ERP Financiero
> Archivo de contexto para Claude Code — retomar desde aquí

---

## ¿Qué es esto?

**CD & Co Finanzas** es una app web ERP (Enterprise Resource Planning) liviana, construida como SPA (Single Page Application) en HTML + CSS + JS vanilla. Diseñada para un negocio de venta de relojes, accesorios y próximamente perfumes en Paraguay.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | HTML5 + CSS3 + JavaScript ES6 (vanilla, sin frameworks) |
| Base de datos | Supabase (PostgreSQL) — configurar en `js/config.js` |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Pagos | Stripe Payment Links |
| Hosting | Vercel (deploy del directorio `/cdco`) |
| Charts | Chart.js 4.4.1 (CDN) |
| Fonts | Cormorant Garamond + Outfit + DM Mono (Google Fonts) |

---

## Estructura del proyecto

```
cdco/
├── index.html          ← Shell HTML + todos los modals
├── css/
│   └── app.css         ← Todos los estilos (design tokens, componentes, responsive)
├── js/
│   ├── config.js       ← STATE global, EMPRESA config, helpers (fmt, uid, toast, etc.)
│   ├── auth.js         ← Login, registro, Google OAuth, demoLogin, enterApp, logout
│   ├── nav.js          ← goPage(), renderAll(), populateSelects(), updateBadges()
│   ├── dashboard.js    ← renderDashboard(), renderStats(), renderChart(), alertas stock
│   ├── transactions.js ← Movimientos financieros (CRUD), filtros
│   ├── inventory.js    ← Productos (CRUD), stock adjustment modal
│   ├── sales.js        ← Ventas con line items, IVA por línea, auto-stock, auto-tx
│   ├── orders.js       ← Pedidos a proveedores, recepción con auto-stock + auto-tx
│   ├── invoices.js     ← viewInvoice() con datos fiscales PY, printInvoice(), numToLetras()
│   ├── contacts.js     ← Clientes y proveedores (CRUD)
│   ├── settings.js     ← saveEmpresa(), loadEmpresaForm(), buildPlanCards(), toggleMode()
│   ├── fx.js           ← Tipo de cambio Cambios Chaco (via Claude API), conversor
│   └── pwa.js          ← Service Worker, PWA manifest, install prompt, offline detection
└── assets/             ← (vacío — iconos, logo si se agregan)
```

---

## Variables globales clave (js/config.js)

```javascript
// Supabase — configurar antes de deploy
const SB_URL = 'TU_SUPABASE_URL_AQUI';
const SB_KEY = 'TU_SUPABASE_ANON_KEY_AQUI';
const STRIPE  = { pro: 'TU_LINK_PRO', business: 'TU_LINK_BUSINESS' };

// Estado global de la app
let S = {
  txs:[],        // Transacciones financieras
  products:[],   // Inventario
  sales:[],      // Ventas
  orders:[],     // Pedidos a proveedores
  contacts:[],   // Clientes y proveedores
  user: null,
  plan: 'pro',
  // ... filtros y navegación
};

// Datos fiscales del emisor (guardados en localStorage)
let EMPRESA = {
  razonSocial, ruc, direccion, telefono, email, web,
  timbrado, vigenciaDesde, vigenciaHasta, nroFacturaInicio
};
```

---

## Diseño / Identidad visual

- **Tema:** Oscuro lujoso — negro obsidiana + dorado champagne
- **CSS tokens:** definidos en `:root` al inicio de `css/app.css`
  - `--bg` / `--bg2` / `--bg3` / `--bg4` / `--bg5` — capas de fondo
  - `--g` / `--g2` / `--g3` — escala de dorado
  - `--pos` / `--neg` — verde/rojo para estados
  - `--cr` — texto principal (crema)
- **Fuentes:** Cormorant Garamond (display, serif), Outfit (body), DM Mono (números/código)
- **Modo claro:** toggle via `toggleMode()` en `js/settings.js`

---

## Módulos funcionales

### ✅ Finanzas
- Dashboard con stats en $ y ₲ por separado
- Gráfico 6 meses (ingresos vs gastos vs ventas)
- Movimientos CRUD con categorías personalizadas
- Tipo de cambio en tiempo real — **fuente: Cambios Chaco Paraguay**
  - Endpoint: `http://www.cambioschaco.com.py/api/branch_office/1/exchange`
  - CORS bloqueado → se obtiene via **Anthropic API** con web_search
  - Caché en localStorage, refresco cada 30 min

### ✅ Inventario
- Productos con SKU, categoría, precio compra/venta, stock, stock mínimo
- Alertas visuales: stock bajo (amarillo) / sin stock (rojo)
- Ajuste de stock: entrada / salida / exacto
- Al comprar stock → auto-registra gasto en finanzas

### ✅ Ventas
- Line items con selector de producto, cantidad, precio, **IVA por línea** (10%/5%/exento)
- Al guardar → **baja stock automáticamente** + **registra ingreso en finanzas**
- Condición de venta: contado / crédito
- Número de factura legal opcional

### ✅ Pedidos a proveedores
- Orden de compra con proveedor, productos, cantidades
- Al recibir → **sube stock automáticamente** + **registra gasto en finanzas**
- Badge de pendientes en sidebar

### ✅ Facturas / Comprobantes
- Comprobante fiscal con datos del emisor (usuario de la app)
- Campos: timbrado, vigencia, RUC emisor/receptor, condición de venta
- Tabla IVA: gravadas 10% / 5% / exentas con liquidación
- Total en letras (guaraníes o dólares)
- **⚠️ AVISO VISIBLE:** "Comprobante de demostración — No válido ante la SET"
- Impresión/PDF con estilos específicos para papel

### ✅ Contactos
- Clientes y proveedores
- WhatsApp clickeable directo
- Historial de ventas/pedidos por contacto

### ✅ PWA
- Instalable en Android, iPhone, Windows, Mac
- Service Worker con cache offline
- Shortcuts: "Nueva venta", "Nuevo ingreso", "Nuevo pedido"

---

## Configuración para producción (hacer en este orden)

### 1. Supabase
```bash
# Ir a supabase.com → nuevo proyecto → SQL Editor → ejecutar:
CREATE TABLE profiles (id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY, full_name TEXT, email TEXT, plan TEXT DEFAULT 'free', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE transactions (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, type TEXT NOT NULL, description TEXT NOT NULL, amount NUMERIC(12,2), currency TEXT DEFAULT '$', category TEXT, date DATE NOT NULL, icon TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE products (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, name TEXT, sku TEXT, category TEXT, buy_price NUMERIC(12,2), sell_price NUMERIC(12,2), stock INTEGER DEFAULT 0, min_stock INTEGER DEFAULT 2, description TEXT, supplier_id UUID, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE sales (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, num INTEGER, items JSONB, total NUMERIC(12,2), currency TEXT, date DATE, client_id UUID, status TEXT, condicion TEXT, nro_factura TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE orders (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, num INTEGER, supplier_id UUID, items JSONB, status TEXT DEFAULT 'pending', date DATE, eta DATE, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE contacts (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, name TEXT, type TEXT, phone TEXT, email TEXT, ruc TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW());

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "own" ON transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON products FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON sales FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON orders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON contacts FOR ALL USING (auth.uid() = user_id);
```

### 2. Configurar credenciales en js/config.js
```javascript
const SB_URL = 'https://xxxx.supabase.co';
const SB_KEY = 'eyJhbGc...';
const STRIPE  = { pro: 'https://buy.stripe.com/xxx', business: 'https://buy.stripe.com/yyy' };
```

### 3. Deploy en Vercel
```bash
# Instalar Vercel CLI
npm i -g vercel
# Desde la carpeta cdco/
vercel --prod
```

---

## Próximas features pendientes (backlog)

- [ ] Conectar Supabase CRUD real (actualmente todo en localStorage)
- [ ] Sincronización offline → online (cola de operaciones)
- [ ] Reportes exportables (PDF de ventas por período)
- [ ] Gráficos por categoría de producto
- [ ] Multi-usuario / roles (admin, vendedor, solo lectura)
- [ ] Integración e-Kuatia para facturación electrónica legal
- [ ] Catálogo de productos con fotos
- [ ] App móvil nativa (Capacitor / React Native)
- [ ] Notificaciones push para stock bajo
- [ ] Dashboard analytics con comparación entre períodos

---

## Notas importantes

- **Facturación:** Los comprobantes generados por la app son **solo de demostración**. No son válidos ante la SET (Subsecretaría de Estado de Tributación de Paraguay). Para facturación legal, se requiere integrar un PSE autorizado por e-Kuatia.
- **IVA Paraguay:** Tres categorías — 10% (mayoría de bienes), 5% (algunos alimentos/medicamentos), Exento. La app calcula IVA incluido (precio ya incluye IVA).
- **Tipo de cambio:** Se obtiene de Cambios Chaco via Claude API para evitar CORS. La API directa es `http://www.cambioschaco.com.py/api/branch_office/1/exchange`.
- **Persistencia actual:** localStorage con key `cdco_erp_v1`. Al conectar Supabase, migrar datos existentes.

---

*Proyecto iniciado en Claude.ai — continuando en Claude Code*
*Última actualización: Marzo 2026*

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
