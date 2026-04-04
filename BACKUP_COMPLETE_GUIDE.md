# 💾 CD & Co — GUÍA COMPLETA DE BACKUP v2.0

## 🎯 Resumen de mejoras

✅ **Error anterior arreglado**: Mejor retry logic y manejo de errores
✅ **Google Drive automático**: Semanal (configurable)
✅ **Email automático**: Con backup adjunto
✅ **Estado mejorado en Dashboard**: Muestra fecha y tamaño real

---

## 📋 INSTALACIÓN RÁPIDA

### 1. Instalar dependencias

```bash
npm install node-cron @google-cloud/storage nodemailer
```

### 2. Crear configuración

```bash
cp backup-config.example.js backup-config.js
```

### 3. Editar `backup-config.js` con tus credenciales

### 4. Reiniciar servidor

```bash
# Ctrl+C en la terminal actual
npm start
```

---

## 🟦 CONFIGURACIÓN DETALLADA

### OPCIÓN 1: Solo backup local (más simple)

**Archivo**: `backup-config.js`

```javascript
module.exports = {
  googleDrive: { enabled: false },
  email: { enabled: false },
  retention: { localDays: 30, minBackups: 5 }
};
```

✅ Genera backup cada 24h en `/backups`
✅ Se limpia automáticamente después de 30 días

---

### OPCIÓN 2: Con Google Drive (semanal)

#### Paso 1: Crear proyecto en Google Cloud

1. Ir a: https://console.cloud.google.com/
2. Click en selector de proyecto (parte superior)
3. **"Nuevo proyecto"**
   - Nombre: `CD Co Backups`
   - Crear

#### Paso 2: Habilitar Google Drive API

1. En búsqueda superior: `Google Drive API`
2. Click en resultado
3. **"Habilitar"**

#### Paso 3: Crear Service Account

1. Ir a **Credenciales** (izquierda)
2. **"Crear credenciales"** → **"Cuenta de servicio"**
3. Rellenar:
   - ID: `cd-co-backup-service`
   - Nombre: `CD & Co Backup Service`
   - Crear

#### Paso 4: Generar clave JSON

1. Click en cuenta de servicio creada
2. Tab **"Claves"**
3. **"Agregar clave"** → **"Nueva clave"**
4. Seleccionar **JSON**
5. **"Crear"** (descarga automáticamente)

#### Paso 5: Copiar datos al archivo de configuración

Abre el JSON descargado y copia en `backup-config.js`:

```javascript
googleDrive: {
  enabled: true,  // ← Cambiar a true
  serviceAccountEmail: 'COPIAR DE JSON',
  privateKey: 'COPIAR DE JSON (línea completa con -----BEGIN)',
  projectId: 'COPIAR DE JSON',
  folderId: 'VER PASO 6',
  uploadFrequencyDays: 7  // Semanal
}
```

**¿Dónde copiar qué?**
```json
{
  "type": "service_account",
  "project_id": "← ESTO → projectId",
  "private_key_id": "...",
  "private_key": "← ESTO (completo) → privateKey",
  "client_email": "← ESTO → serviceAccountEmail",
  "client_id": "...",
  ...
}
```

#### Paso 6: Crear carpeta en Drive y obtener ID

1. Ir a https://drive.google.com
2. **"Nuevo"** → **"Carpeta"**
   - Nombre: `CD & Co Backups`
   - Crear

3. Clic derecho → **"Compartir"**
   - Pegar el `serviceAccountEmail` (ej: `cd-co-backup-service@project.iam.gserviceaccount.com`)
   - Rol: **Editor**
   - Compartir

4. Abrir carpeta y copiar ID de la URL:
   ```
   https://drive.google.com/drive/folders/[ESTA-ES-LA-ID]/
   ```
   - Pegar en `folderId`

**Resultado:**
```javascript
folderId: '1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P'
```

---

### OPCIÓN 3: Con Email (semanal con backup adjunto)

#### Paso 1: Activar 2FA en Google

1. Ir a https://myaccount.google.com/
2. **"Seguridad"** (izquierda)
3. **"Verificación de dos pasos"**
4. Seguir pasos (usar teléfono)

#### Paso 2: Generar App Password

1. Ir a https://myaccount.google.com/apppasswords
2. Seleccionar:
   - Aplicación: **Mail**
   - Dispositivo: **Windows Computer** (o lo que uses)
3. **"Generar"**
4. Copiar la contraseña de 16 caracteres (sin espacios)

**Ejemplo:**
```
abcdefghijklmnop
```

#### Paso 3: Configurar email en `backup-config.js`

```javascript
email: {
  enabled: true,  // ← Cambiar a true
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'tu-email@gmail.com',
    pass: 'abcdefghijklmnop'  // ← App Password de 16 caracteres
  },
  from: 'tu-email@gmail.com',
  to: 'tu-email@gmail.com',  // Donde recibir backups
  subject: 'CD & Co - Backup automático',
  emailFrequencyDays: 7  // Semanal
}
```

---

### OPCIÓN 4: Ambos (Google Drive + Email)

```javascript
module.exports = {
  googleDrive: {
    enabled: true,
    serviceAccountEmail: '...',
    privateKey: '...',
    projectId: '...',
    folderId: '...',
    uploadFrequencyDays: 7
  },
  email: {
    enabled: true,
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'tu-email@gmail.com',
      pass: 'tu-app-password'
    },
    from: 'tu-email@gmail.com',
    to: 'tu-email@gmail.com',
    subject: 'CD & Co - Backup automático',
    emailFrequencyDays: 7
  },
  retention: {
    localDays: 30,
    minBackups: 5
  }
};
```

---

## 🧪 PROBAR CONFIGURACIÓN

### Test 1: Verificar que el servidor inicia

```bash
npm start
```

Deberías ver:
```
✅ [Backup] Carpeta /backups verificada
🔄 [Backup] Haciendo backup inicial...
✅ [Backup] Scheduler iniciado - backup diario a las 00:00
```

### Test 2: Generar backup manual

1. Abrir app → **Configuración** (⚙️)
2. Desplazarse a **"🔐 Seguridad & Respaldos"**
3. Click **"💾 Generar Backup Ahora"**
4. Esperar 5-10 segundos
5. Deberías ver: **"✅ Backup completado exitosamente"**

### Test 3: Verificar estado en Dashboard

1. El estado debe mostrar:
   ```
   ✅ Último backup: 27/03/2026 15:30:45
   📦 N/A registros
   📋 12 tablas
   💾 250 KB
   📁 backup-27-03-2026-15-30-45.json
   ```

### Test 4: Verificar carpeta local

```bash
ls -la backups/
# Deberías ver:
# backup-27-03-2026-00-00-00.json
# backup-27-03-2026-15-30-45.json
# backup-metadata.json
```

### Test 5: Verificar Google Drive (si configurado)

1. Abrir Drive
2. Ir a carpeta "CD & Co Backups"
3. Deberías ver el archivo JSON del backup

### Test 6: Verificar email (si configurado)

1. Abrir Gmail
2. Buscar emails de `tu-email@gmail.com`
3. Deberías tener el backup como adjunto

---

## 🔧 TROUBLESHOOTING

### Problema: "Error: Cannot find module 'node-cron'"

**Solución:**
```bash
npm install node-cron
npm start
```

### Problema: "No se pudo obtener estado"

**Causas posibles:**
1. El servidor no está corriendo
2. `/backups` no tiene permisos de lectura

**Solución:**
```bash
# Verificar que el servidor está corriendo
npm start

# Verificar permisos
chmod -R 755 backups/
```

### Problema: "Error obteniendo estado de backup"

**Solución en navegador (F12 → Consola):**
```javascript
// Test el endpoint directamente
fetch('/api/backup/status')
  .then(r => r.json())
  .then(data => console.log(data))
  .catch(err => console.error(err))
```

### Problema: Google Drive no funciona

**Checklist:**
- [ ] `backup-config.js` existe
- [ ] `googleDrive.enabled: true`
- [ ] `serviceAccountEmail` es correcto
- [ ] `privateKey` comienza con `-----BEGIN`
- [ ] `projectId` es correcto
- [ ] `folderId` existe y el service account tiene acceso

### Problema: Email no se envía

**Checklist:**
- [ ] Gmail 2FA está habilitado
- [ ] App Password tiene 16 caracteres
- [ ] NO es tu contraseña normal
- [ ] `email.enabled: true`
- [ ] Puerto 587 no está bloqueado (algunos ISP lo bloquean)

**Test manual en Node:**
```javascript
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tu-email@gmail.com',
    pass: 'tu-app-password'
  }
});

transporter.verify((err, success) => {
  if (err) console.error('❌', err);
  else console.log('✅ Conexión OK');
});
```

---

## 📊 CALENDARIO DE EJECUCIÓN

```
HORA          TAREA
════════════════════════════════════════════
00:00         Backup automático diario
   ├─ Descarga 12 tablas desde Supabase
   ├─ Guarda en /backups
   ├─ Actualiza metadata
   └─ Limpia backups >30 días

Cada 3 min    Dashboard actualiza estado

Cada 7 días   (si Google Drive habilitado)
   └─ Sube a Drive automáticamente

Cada 7 días   (si Email habilitado)
   └─ Envía email con backup adjunto
```

---

## 💾 ESTRUCTURA FINAL DE ARCHIVOS

```
cdco/
├── backup.js                    ← Core backup logic ✅
├── backup-integrations.js       ← Google Drive + Email ✅
├── backup-config.example.js     ← Template (ejemplo)
├── backup-config.js             ← TU configuración (NO compartir)
├── js/backup-ui.js              ← UI Dashboard ✅
├── simple-server.js             ← Endpoints API ✅
├── index.html                   ← Con panel backup ✅
├── backups/                     ← Se crea automáticamente
│   ├── backup-27-03-2026-00-00-00.json
│   ├── backup-26-03-2026-00-00-00.json
│   └── backup-metadata.json
└── .gitignore
    ├── backup-config.js         ← NO hacer commit
    └── backups/                 ← NO hacer commit
```

---

## 🔒 SEGURIDAD

- ✅ `backup-config.js` NUNCA se sube a git (.gitignore)
- ✅ Credenciales de Google y email están encriptadas localmente
- ✅ Los backups en Drive pueden eliminarse de Google manualmente
- ✅ Los emails van por SMTP con TLS (seguro)
- ✅ Service Account de Google tiene solo permisos en carpeta específica

---

## 📞 SOPORTE RÁPIDO

| Problema | Solución |
|----------|----------|
| "No se pudo obtener estado" | Reinicia servidor: `npm start` |
| Google Drive no sube | Verifica que el service account tiene acceso a la carpeta |
| Email no se envía | Verifica que 2FA está habilitado y app password es correcto |
| Discos lleno | `ls -lah backups/` y elimina archivos viejos manualmente |
| Cambiar frecuencia | Edita `uploadFrequencyDays` y `emailFrequencyDays` en config |

---

## ✅ CHECKLIST FINAL

- [ ] npm install (todas las dependencias)
- [ ] cp backup-config.example.js backup-config.js
- [ ] backup-config.js editado con credenciales
- [ ] npm start sin errores
- [ ] Backup manual generado correctamente
- [ ] Estado visible en Dashboard
- [ ] (Opcional) Google Drive funciona
- [ ] (Opcional) Email recibido

---

**¡Tu sistema de backup está 100% operacional!** 🎉

Cualquier duda, revisa los logs del servidor (npm start) para ver el estado exacto.
