# 🚀 CD & Co ERP — Despliegue a Vercel

> Guía paso a paso para subir tu ERP a la web con URL propia y variables de entorno seguras.

---

## **Paso 1: Verificar que Vercel CLI esté instalado**

```bash
# Instalar Vercel CLI (si no lo tienes)
npm install -g vercel

# Verificar instalación
vercel --version
```

---

## **Paso 2: Autenticarse en Vercel**

```bash
# Inicia sesión en Vercel (se abrirá el navegador)
vercel login
```

Si no tienes cuenta en Vercel, crea una en: **https://vercel.com/signup**

---

## **Paso 3: Preparar el repositorio**

Desde la carpeta del proyecto (`/Users/Fabrizio/Library/CloudStorage/GoogleDrive-fabriziocorbeta@gmail.com/Mi unidad/03 Emprendimientos/02  Sistema/01 - cdco`):

```bash
cd "/Users/Fabrizio/Library/CloudStorage/GoogleDrive-fabriziocorbeta@gmail.com/Mi unidad/03 Emprendimientos/02  Sistema/01 - cdco"

# Verificar que tengas los archivos necesarios:
ls -la vercel.json api/config.js index.html
```

Deberías ver:
- ✅ `vercel.json` (configuración de despliegue)
- ✅ `api/config.js` (función que inyecta variables de entorno)
- ✅ `index.html` (con script que carga config)
- ✅ `js/config.js` (lee de `window.__ENV__`)

---

## **Paso 4: Despliegue inicial (desde CLI)**

### **Primera vez (crear proyecto en Vercel):**

```bash
# Desde la carpeta del proyecto
vercel --prod

# Responder las preguntas:
# ✓ Set up and deploy? → Y (yes)
# ✓ Which scope? → tu cuenta de Vercel
# ✓ Link to existing project? → N (no)
# ✓ Project name? → cd-co-erp (o tu preferencia)
# ✓ Root directory? → ./ (actual)
# ✓ Override settings? → N (no)
```

**El CLI te dará una URL:** `https://cd-co-erp-xxxxx.vercel.app`

✅ **Tu app ya está en vivo, pero sin las variables de entorno seguras**

---

## **Paso 5: Configurar Variables de Entorno en Vercel Dashboard**

1. **Ir a Vercel Dashboard:** https://vercel.com/dashboard

2. **Seleccionar tu proyecto** (`cd-co-erp`)

3. **Settings → Environment Variables**

4. **Agregar variables** (copia exactamente desde tu `.env.local`):

| Variable | Valor | Scope |
|---|---|---|
| `SUPABASE_URL` | `https://beumpltrjgnehqbhtrxo.supabase.co` | Production |
| `SUPABASE_ANON_KEY` | `sb_publishable__dabJ1ghmLg-pyLbJAPbYg_1_yyk7As` | Production |
| `ANTHROPIC_KEY` | `tu-api-key-aqui` | Production |
| `STRIPE_PRO` | `https://buy.stripe.com/...` | Production |

**⚠️ IMPORTANTE:** Marca todas como **Production** (son solo para deploy, no dev)

---

## **Paso 6: Redeploy con variables activas**

```bash
# Desde la carpeta del proyecto
vercel --prod
```

O desde Vercel Dashboard:
- **Deployments → volver a desplegar el commit actual**
- Vercel volverá a buildar con las nuevas variables

---

## **Paso 7: Configurar dominio personalizado (opcional)**

### **Opción A: Usando un dominio que ya tenés**

1. **Vercel Dashboard → Settings → Domains**

2. **Add Domain** → escribe tu dominio (ej: `erp.cd-co.com.py`)

3. **Vercel te mostrará nameservers o registros CNAME**

4. **En tu registrador de dominios** (donde compraste el dominio):
   - Apunta los nameservers a Vercel, O
   - Configura un CNAME record que apunte a `cname.vercel.com`

5. **Esperar 24-48h para que se propague el DNS**

### **Opción B: Usar el dominio gratis de Vercel**

- Dashboard verá `cd-co-erp-xxxxx.vercel.app` como tu URL
- Puedes cambiar el subdomain en **Settings → Domains**

---

## **Paso 8: Verificar que el ERP funciona en producción**

1. **Abrir tu URL** en el navegador (ej: `https://erp.cd-co.com.py`)

2. **Consola del navegador** (F12 → Console):
   - Verificar que no haya errores de CORS
   - Deberías ver: `[Config] Supabase auth initialized`

3. **Probar login:**
   - Usa cualquier email/password (demo mode)
   - O inicia sesión con Google

4. **Dashboard:**
   - Deberías ver los números cargados inmediatamente
   - Los gráficos y listas en segundo plano

---

## **Paso 9: Acceso desde el celular**

✅ **Ya está listo:**
- Abre tu URL en el celular: `https://erp.cd-co.com.py`
- Aparecerá el botón "Instalar" (PWA)
- Toca "Instalar" para agregar el icono a tu pantalla de inicio
- Funciona offline (Service Worker caché)

**Shortcuts directos desde pantalla de inicio:**
- "Nueva venta"
- "Nuevo ingreso"
- "Nuevo pedido"

---

## **Redeploy después de cambios de código**

### **Opción 1: Desde CLI (recomendado)**

```bash
cd "/Users/Fabrizio/Library/CloudStorage/GoogleDrive-fabriziocorbeta@gmail.com/Mi unidad/03 Emprendimientos/02  Sistema/01 - cdco"
vercel --prod
```

### **Opción 2: Push a Git (si tienes GitHub/GitLab)**

- Vercel puede redeployar automáticamente en cada push
- Configura esto en **Settings → Git**

---

## **Solucionar problemas**

### **❌ "Cannot find module" o errores de compilación**

```bash
# Verificar que los archivos existan
ls -la vercel.json api/config.js index.html js/config.js

# Redeployar forzado
vercel --prod --force
```

### **❌ Variables de entorno no se cargan**

```javascript
// Abrir consola (F12) y ejecutar:
fetch('/api/config').then(r => r.text()).then(console.log)
```

Deberías ver:
```javascript
window.__ENV__ = {
  SUPABASE_URL: "https://...",
  SUPABASE_ANON_KEY: "sb_...",
  ...
}
```

Si dice `undefined`, es que las variables no están configuradas en Vercel Dashboard.

### **❌ Supabase retorna 403 Forbidden**

- Verifica que `SUPABASE_ANON_KEY` sea la **llave pública (publishable)**, no la de service role
- Supabase → Settings → API → copiar `anon` key exacto

### **❌ "ERR_CONNECTION_REFUSED" en el celular**

- Verifica que la URL esté accesible desde internet (prueba en otro WiFi)
- Si tienes SSL/TLS issues: Vercel genera certificados automáticamente, espera 1 min

---

## **Checklist final**

- [ ] ✅ Proyecto creado en Vercel (`vercel --prod`)
- [ ] ✅ Variables de entorno configuradas (Dashboard → Settings → Environment Variables)
- [ ] ✅ Redeployed con variables (`vercel --prod` nuevamente)
- [ ] ✅ App abierta y funciona en vivo (https://tu-url)
- [ ] ✅ ERP carga números al instante (RPC + SWR)
- [ ] ✅ Dashboard completo en segundo plano
- [ ] ✅ Funciona desde celular
- [ ] ✅ PWA instalable (botón "Instalar" aparece)
- [ ] ✅ Dominio personalizado (opcional, DNS propagado)

---

## **URLs útiles**

- **Dashboard Vercel:** https://vercel.com/dashboard
- **Documentación Vercel:** https://vercel.com/docs
- **Status Vercel:** https://vercel-status.com

---

## **Comando rápido para redeploy en el futuro**

```bash
cd "/Users/Fabrizio/Library/CloudStorage/GoogleDrive-fabriziocorbeta@gmail.com/Mi unidad/03 Emprendimientos/02  Sistema/01 - cdco" && vercel --prod
```

---

**¡Tu ERP está en la web! 🎉**

Accedé desde cualquier dispositivo con internet en: `https://erp.cd-co.com.py`
