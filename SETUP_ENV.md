# 🔐 Configuración de Variables de Entorno - CD & Co ERP

## ✅ Archivos Creados

1. **`.env.local`** ← Tu archivo de credenciales (PRIVADO, NO COMMITEAR)
2. **`.env.example`** ← Ejemplo de referencia
3. **`.gitignore`** ← Protege archivos sensibles
4. **`js/env-loader.js`** ← Carga las variables en el navegador
5. **`simple-server.js`** (actualizado) ← Inyecta variables en HTML
6. **`js/config.js`** (actualizado) ← Lee las variables de entorno

---

## 🚀 Cómo Usar

### Opción A: Servidor Node (RECOMENDADO para desarrollo)

```bash
cd /Users/Fabrizio/Library/CloudStorage/GoogleDrive-fabriziocorbeta@gmail.com/Mi\ unidad/03\ Emprendimientos/02\ \ Sistema/01\ -\ cdco/

# Instalar dependencias (si no las tienes)
npm install

# Ejecutar el servidor
node simple-server.js
```

✅ **Ventajas:**
- Lee automáticamente `.env.local`
- Inyecta variables de forma segura
- Supabase conecta correctamente

**URL:** `http://localhost:3000`

---

### Opción B: Servidor Python (si prefieres)

```bash
cd /Users/Fabrizio/Library/CloudStorage/GoogleDrive-fabriziocorbeta@gmail.com/Mi\ unidad/03\ Emprendimientos/02\ \ Sistema/01\ -\ cdco/

python3 -m http.server 8000
```

⚠️ **Limitaciones:**
- NO inyecta variables de entorno
- Necesitas cargar manualmente en localStorage:
  ```javascript
  localStorage.setItem('sb_url', 'https://beumpltrjgnehqbhtrxo.supabase.co');
  localStorage.setItem('sb_key', 'sb_publishable__dabJ1ghmLg-pyLbJAPbYg_1_yyk7As');
  ```

---

## 🔒 Seguridad

### ✓ Lo que protegemos:
- **`.env.local`** está en `.gitignore` → NO se commitea a Git
- **Variables** se inyectan en `window.__ENV__` → Solo en memoria
- **Config.js** lee desde variables de entorno → Seguro en desarrollo y producción

### ✓ Buenas prácticas:
1. **Nunca commitees `.env.local`**
2. **Nunca hardcodees credenciales** en archivos versionados
3. **En producción**, usa variables de entorno del hosting (Vercel, Netlify, etc.)

---

## 📋 Verificación

Después de iniciar el servidor, abre la consola del navegador (F12) y verifica:

```javascript
// Deberías ver en la consola:
✅ Variables de entorno cargadas desde servidor
✅ [Config] Supabase conectado correctamente

// Verifica el objeto:
window.__ENV__
// {
//   SUPABASE_URL: "https://beumpltrjgnehqbhtrxo.supabase.co",
//   SUPABASE_ANON_KEY: "sb_publishable__dabJ1ghmLg-pyLbJAPbYg_1_yyk7As"
// }
```

---

## 🐛 Solución de problemas

### Error: "Supabase NO configurado"
- ✓ Verifica que `.env.local` existe
- ✓ Verifica que tiene las líneas correctas
- ✓ Reinicia el servidor Node

### Error: "Variables no están disponibles"
- ✓ Usa `node simple-server.js` (NO Python http.server)
- ✓ Abre la consola (F12) y verifica `window.__ENV__`

### Error: "Supabase is not a function"
- ✓ Espera a que la librería de Supabase se cargue desde CDN
- ✓ Verifica que `sb` está inicializado en `config.js`

---

## 📚 Próximos pasos

1. ✅ Configura las variables en `.env.local` (YA HECHO)
2. ✅ Actualiza `config.js` para leer variables (YA HECHO)
3. ⏭️ Inicia el servidor Node: `node simple-server.js`
4. ⏭️ Abre `http://localhost:3000`
5. ⏭️ Verifica la consola y prueba Supabase

---

**Creado:** Marzo 2026 | **Proyecto:** CD & Co ERP
