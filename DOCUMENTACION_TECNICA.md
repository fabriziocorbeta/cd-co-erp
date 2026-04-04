# CD & Co. ERP — Documentación Técnica y Funcional

**Versión:** 1.0
**Fecha:** Abril 2026
**Audiencia:** Equipo de Administración y Desarrollo

---

## 1. Arquitectura del Sistema

### Stack Tecnológico

CD & Co. ERP está construido bajo una arquitectura moderna **sin servidores** (serverless) y completamente escalable:

- **Frontend (Presentación):** HTML5 + CSS3 + JavaScript Vanilla — desplegado en **Vercel** con CDN global
- **Backend (Lógica de Negocio):** Funciones Serverless en **Vercel Functions** (Node.js/Edge Runtime)
- **Base de Datos (Persistencia):** **Supabase** (PostgreSQL administrado) con autenticación integrada
- **Autenticación:** Supabase Auth — Email/Password + JWT tokens
- **Hosting / Dominio:** Vercel (se integra automáticamente con Git)

### Flujo de Arquitectura

```
Usuario (navegador)
    ↓
Vercel CDN (index.html, CSS, JS)
    ↓
Vercel Functions (/api/*)
    ↓
Supabase (PostgreSQL + Auth)
```

**Ventajas:**
- Sin infraestructura a mantener
- Escalado automático según demanda
- Costos variables según uso
- Despliegue automático al hacer push a GitHub

---

## 2. Esquema de Datos — Base de Datos

### 2.1 Tabla: `accounts`

**Propósito:** Gestionar saldos reales, divisas y balances por moneda.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | Identificador único |
| `user_id` | UUID | Referencia al usuario propietario (Foreign Key → profiles.id) |
| `name` | TEXT | Nombre de la cuenta (ej: "Caja Principal", "Tarjeta Conti") |
| `balance` | NUMERIC(12,2) | Saldo actual en la moneda especificada |
| `cur` | TEXT | Moneda: `USD` o `PYG` |
| `description` | TEXT | Descripción opcional |
| `created_at` | TIMESTAMPTZ | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | Última actualización |

**Nota Importante:** Este es el **origen único** del patrimonio real (suma de todos los balances del usuario).

---

### 2.2 Tabla: `products`

**Propósito:** Inventario de relojes, accesorios y perfumes.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | Identificador único |
| `user_id` | UUID | Referencia al usuario propietario |
| `name` | TEXT | Nombre del producto (ej: "Rolex Submariner") |
| `sku` | TEXT | Código único de producto (ej: "ROL-SUB-001") |
| `category` | TEXT | Categoría: Relojes, Accesorios, Perfumes, Otros |
| `stock` | INTEGER | Cantidad disponible en stock |
| `min_stock` | INTEGER | Nivel mínimo de alerta (ej: 2 unidades) |
| `buy_price` | NUMERIC(12,2) | Precio de compra (costo) |
| `sell_price` | NUMERIC(12,2) | Precio de venta al cliente |
| `cur` | TEXT | Moneda: `USD` o `PYG` |
| `description` | TEXT | Descripción detallada |
| `created_at` | TIMESTAMPTZ | Fecha de creación |

**Alertas Visuales:**
- Rojo: Stock = 0 (sin existencias)
- Amarillo: Stock ≤ min_stock (nivel bajo)
- Verde: Stock normal

---

### 2.3 Tabla: `profiles`

**Propósito:** Usuarios del sistema y control de acceso.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | ID de usuario (generado por Supabase Auth) |
| `email` | TEXT | Correo electrónico único |
| `full_name` | TEXT | Nombre completo |
| `plan` | TEXT | Plan activo: free, pro, socio, familiar |
| `role` | TEXT | Rol de acceso: user, admin |
| `created_at` | TIMESTAMPTZ | Fecha de registro |
| `updated_at` | TIMESTAMPTZ | Última actualización |

**Roles de Acceso:**
- **user:** Acceso a su propio panel (ver/editar sus datos)
- **admin:** Acceso al Panel Maestro (visibilidad de todos los usuarios y datos agregados)

---

### 2.4 Tabla: `transactions`

**Propósito:** Historial de movimientos financieros (ingresos, gastos, transferencias).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | Identificador único |
| `user_id` | UUID | Referencia al usuario |
| `type` | TEXT | Tipo: income, expense, transfer |
| `description` | TEXT | Descripción del movimiento |
| `amount` | NUMERIC(12,2) | Monto (convención: negativo = gasto, positivo = ingreso) |
| `currency` | TEXT | Moneda: USD, PYG |
| `category` | TEXT | Categoría: Ventas, Gastos, Impuestos, Otros |
| `date` | DATE | Fecha del movimiento |
| `account_id` | UUID | Referencia a la cuenta afectada (FK → accounts.id) |
| `created_at` | TIMESTAMPTZ | Fecha de registro |

---

### 2.5 Tabla: `sales`

**Propósito:** Registro de ventas a clientes.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | Identificador único |
| `user_id` | UUID | Referencia al usuario |
| `num` | INTEGER | Número secuencial de venta |
| `items` | JSONB | Array de line items: `[{product_id, qty, price, iva}, ...]` |
| `total` | NUMERIC(12,2) | Total de venta |
| `currency` | TEXT | USD o PYG |
| `date` | DATE | Fecha de venta |
| `client_id` | UUID | Referencia al cliente (FK → contacts.id) |
| `status` | TEXT | Estado: pending, completed, cancelled |
| `nro_factura` | TEXT | Número fiscal (opcional) |
| `created_at` | TIMESTAMPTZ | Fecha de registro |

---

### 2.6 Tabla: `contacts`

**Propósito:** Clientes y proveedores.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | Identificador único |
| `user_id` | UUID | Referencia al usuario |
| `name` | TEXT | Nombre del contacto |
| `type` | TEXT | client o supplier |
| `phone` | TEXT | Número de teléfono |
| `email` | TEXT | Correo electrónico |
| `ruc` | TEXT | RUC (Paraguay) |
| `notes` | TEXT | Notas internas |
| `created_at` | TIMESTAMPTZ | Fecha de creación |

---

## 3. Protocolo de Privacidad — Multi-Tenancy

### 3.1 ¿Cómo funciona el blindaje?

Cada usuario solo puede ver y modificar **sus propios datos**. Esto se garantiza mediante dos mecanismos:

#### A) Validación de Token JWT

1. El usuario inicia sesión con email + contraseña
2. Supabase Auth genera un **JWT (JSON Web Token)** con duración limitada
3. El JWT se almacena en el navegador (session storage)
4. Cada petición a una API incluye: `Authorization: Bearer <JWT>`
5. El servidor verifica el JWT y extrae el `user_id` del usuario

```
Cabecera HTTP:
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
                       ↓
                   Verifica validez
                   Extrae user_id
```

#### B) Filtros de Base de Datos (Row Level Security — RLS)

En Supabase, cada tabla tiene una **política de seguridad RLS** que obliga:

```sql
-- Ejemplo: tabla products
SELECT * FROM products
WHERE user_id = auth.uid();  -- Solo muestra productos del usuario actual
```

**Resultado:**
- Si Gabriela intenta acceder a productos de Fabrizio: **error 403 (Forbidden)**
- Cada usuario ve solo sus datos, aunque intente hackear la URL

#### C) Validación en APIs Serverless

Todas las funciones en `/api/*` validan el JWT y filtran por `user_id`:

```javascript
// En cada endpoint:
const user = await sb.auth.getUser();  // Extrae user_id del JWT
const data = await fetch(`...?user_id=eq.${user.id}`);  // Filtra por usuario
```

---

### 3.2 Flujo de Seguridad Completo

```
Usuario (Gabriela) abre app
    ↓
Login con email + contraseña
    ↓
Supabase Auth valida credenciales
    ↓
Genera JWT (válido 1 hora)
    ↓
JWT se almacena en navegador
    ↓
Cualquier petición incluye JWT en header
    ↓
API Vercel valida JWT
    ↓
Extrae user_id de JWT
    ↓
Supabase RLS filtra por user_id
    ↓
Solo datos de Gabriela se retornan
```

---

## 4. Panel de Administración Maestro

### 4.1 Acceso

**Solo usuarios con rol `admin`** pueden acceder a `/admin`.

Dos formas de ser admin:
1. Ser el propietario (email = `fabriziocorbeta@gmail.com`)
2. Tener `role = 'admin'` en la tabla `profiles`

**Ubicación:** `https://cd-co-hub.vercel.app/admin`

---

### 4.2 Capacidades del Admin

#### A) Dashboard — Stat Cards (KPIs)

| KPI | Cálculo | Descripción |
|-----|---------|-------------|
| **Patrimonio USD** | SUM(accounts.balance WHERE cur='USD') | Suma de saldos en dólares |
| **Patrimonio PYG** | SUM(accounts.balance WHERE cur='PYG') | Suma de saldos en guaraníes |
| **Usuarios Activos** | COUNT(profiles) | Total de usuarios registrados |
| **Usuarios en Plan Pro** | COUNT(profiles WHERE plan='pro') | Métrica de monetización |
| **Unidades en Stock** | SUM(products.stock) | Cantidad total de artículos |
| **Valor de Inventario** | SUM(products.stock × products.sell_price) | Valor total estimado |

---

#### B) Tabla de Usuarios

Permite gestionar perfiles y planes.

**Columnas:**
- Email
- Plan actual (Free/Pro/Socio/Familiar)
- Rol (user/admin)
- Fecha de registro

**Acciones disponibles:**
1. **Dropdown de plan:** Seleccionar nuevo plan
2. **Botón "Actualizar Plan":** Aplicar cambio (estilo premium, dorado)
3. **Toggle de rol:** Otorgar/quitar permisos de admin

---

#### C) Tabla de Inventario

Resumen del stock total y valor agregado.

**Información:**
- Total de unidades en existencia
- Total de productos registrados
- Valor estimado de venta (stock × precio_venta)

---

### 4.3 Endpoint Administrativo: `/api/admin`

**Método:** GET
**Autenticación:** JWT requerido + role = admin

**Respuesta:**
```json
{
  "ok": true,
  "admin_email": "fabriziocorbeta@gmail.com",
  "patrimonio": {
    "USD": 5234.50,
    "PYG": 28500000
  },
  "inventario": {
    "totalUnidades": 145,
    "totalProductos": 23,
    "valorTotal": 125000
  },
  "usuarios": [
    { "id": "...", "email": "gabriela@...", "plan": "pro", "role": "user", "created_at": "..." },
    ...
  ],
  "generated_at": "2026-04-04T15:30:00Z"
}
```

---

### 4.4 Gestión de Planes

**Endpoint:** `POST /api/update-user-plan`

**Payload:**
```json
{
  "userId": "uuid-del-usuario",
  "plan": "pro"  // free | pro | socio | familiar
}
```

**Respuesta:** Confirma cambio de plan y retorna usuario actualizado.

---

## 5. Bitácora de Mejoras Recientes (Sprint Actual)

### 5.1 Fixes de Datos y Patrimonio

**Problema:** Panel admin mostraba ceros en patrimonio e inventario.

**Causa:**
- Tabla de origen era `transactions` (archivo de movimientos), no el saldo real
- Nombres de columnas no coincidían (amount vs monto)

**Solución Implementada:**
- ✅ Fuente de patrimonio: **`accounts`** (tabla de saldos reales)
- ✅ Suma directa de: `balance` agrupada por `cur` (USD | PYG)
- ✅ Inventario: `products.stock × products.sell_price`
- ✅ Fallbacks para nombres alternativos de columnas

**Resultado:** Panel ahora refleja **valores reales** del negocio.

---

### 5.2 Privacidad Multi-Tenancy

**Problema:** Necesidad de blindaje para que Gabriela y otros usuarios no vean datos ajenos.

**Solución Implementada:**
- ✅ Validación JWT en todos los endpoints (`/api/goals`, `/api/business`, etc.)
- ✅ Filtro `user_id=eq.{user_id}` en todas las consultas Supabase
- ✅ Row Level Security (RLS) en cada tabla
- ✅ Console.error detallado de intentos de acceso no autorizado

**Tranquilidad:** Cada usuario solo ve sus datos, incluso si intenta hackear URLs.

---

### 5.3 Estética — Modo Claro Corregido

**Problema:** Modo claro tenía:
- Bordes redondeados rotos (--rs sobreescrito a color)
- Textos ilegibles (--mu = #000000 absoluto)

**Solución Implementada:**
- ✅ Restaurar `--rs: 12px` (border-radius)
- ✅ Muted text legible: `#475569` (gris medio, no negro puro)
- ✅ Bordes visibles en cards/panels: `#CBD5E1`
- ✅ Botones con contraste adecuado

**Resultado:** Modo claro ahora es perfectamente legible.

---

### 5.4 Botones Premium — "Actualizar Plan"

**Antes:** Botones genéricos con estilos por defecto.

**Ahora:**
- ✅ Fondo dorado (`--g2`)
- ✅ Bordes redondeados (`--rs`)
- ✅ Transiciones suave (0.2s)
- ✅ Feedback visual al pasar mouse

**Ubicación:** Panel admin, tabla de usuarios, columna "Acción".

---

### 5.5 Sesión Personalizada

**Problema:** Email hardcodeado en formulario de login (`fabriziocorbeta@gmail.com`).

**Impacto:** Gabriela veía el email de Fabrizio al entrar.

**Solución:**
- ✅ Input vacío por defecto
- ✅ Cada usuario ingresa su propio email

---

## 6. Arquitectura de Seguridad — Síntesis

### Capas de Protección

| Capa | Mecanismo | Beneficio |
|------|-----------|-----------|
| **JWT Auth** | Token firmado por Supabase | Solo usuarios válidos pueden entrar |
| **user_id en JWT** | Identificador del usuario en token | Se extrae automáticamente, sin confusiones |
| **Filtros en API** | `?user_id=eq.{user_id}` | Supabase rechaza consultas de otros usuarios |
| **RLS Policies** | Políticas a nivel base de datos | Incluso con acceso directo, se filtra por usuario |
| **Console.error Logs** | Logs detallados en Vercel | Auditoría de intentos de acceso malicioso |

---

## 7. Endpoints Principales — Resumen Técnico

| Endpoint | Método | Autenticación | Uso |
|----------|--------|----------------|-----|
| `/api/admin` | GET | JWT + admin | Dashboard maestro |
| `/api/update-user-plan` | POST | JWT + admin | Cambiar plan de usuario |
| `/api/goals` | GET/POST | JWT | Objetivos personales |
| `/api/business` | GET/POST | JWT | Info del negocio |

---

## 8. Próximos Pasos Recomendados

1. **Integración e-Kuatia:** Para facturación legal (SET Paraguay)
2. **Reportes Avanzados:** Análisis de rentabilidad por período
3. **Notificaciones Push:** Alertas de stock bajo
4. **API Terceros:** Integración con sistemas de contabilidad
5. **Mobile App:** Versión nativa (Capacitor/React Native)

---

## 9. Contacto y Soporte

Para preguntas técnicas o cambios en la arquitectura:
- **Repositorio:** github.com/fabriziocorbeta/cd-co-erp
- **Hosting:** Vercel (auto-deploy desde GitHub)
- **Base de Datos:** Supabase Console (SQL Editor disponible)

---

**Documento generado:** Abril 2026
**Versión de sistema:** 1.0 (Production Ready)
**Estado:** ✅ Listo para producción
