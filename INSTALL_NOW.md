# 🚀 INSTALAR AHORA — Backup System v2.0

## ⚡ QUICK START (5 minutos)

### 1️⃣ Instalar 3 librerías
```bash
npm install node-cron @google-cloud/storage nodemailer
```

### 2️⃣ Crear archivo de config
```bash
cp backup-config.example.js backup-config.js
```

### 3️⃣ Reiniciar servidor
```bash
# En tu terminal de npm start
Ctrl+C
npm start
```

### 4️⃣ Probar en el Dashboard
- Abrir app → Configuración ⚙️
- Buscar "Seguridad & Respaldos"
- Click "💾 Generar Backup Ahora"
- Esperar 10 segundos → "✅ Backup completado"

---

## 📁 ARCHIVOS CREADOS/MODIFICADOS

### ✅ CREADOS (Nuevos)
```
backup.js                    (Core - reescrito completamente)
backup-config.example.js     (Plantilla de configuración)
backup-config.js             (TU configuración - crear)
backup-integrations.js       (Google Drive + Email)
js/backup-ui.js              (UI - reescrito)

DOCUMENTACIÓN:
DEBUG_REPORT.md              (Explicación técnica)
BACKUP_COMPLETE_GUIDE.md     (Guía paso a paso)
INSTALL_NOW.md               (Este archivo)
```

### ✅ MODIFICADOS (Ya tenías)
```
simple-server.js             (Ya tenía endpoints - sin cambios)
index.html                   (Ya tenía panel - sin cambios)
.gitignore                   (Agrega: backup-config.js)
```

---

## 🎯 ARCHIVOS POR REVISAR AHORA

### 1. **DEBUG_REPORT.md** ← LEE ESTO PRIMERO
   - Explica qué estaba mal
   - Qué se arregló
   - Por qué funciona ahora

### 2. **BACKUP_COMPLETE_GUIDE.md** ← SEGUIR ESTO
   - Instalación detallada
   - Google Cloud setup paso a paso
   - Gmail App Password instrucciones
   - Troubleshooting completo

### 3. **backup-config.example.js** ← REFERENCIA
   - Comentarios explicando cada opción
   - Valores de ejemplo
   - Links a consolas

---

## ⚙️ CONFIGURACIÓN MÍNIMA

Edita `backup-config.js`:

```javascript
module.exports = {
  googleDrive: {
    enabled: false  // Cambiar a true después
  },
  email: {
    enabled: false  // Cambiar a true después
  },
  retention: {
    localDays: 30,
    minBackups: 5
  }
};
```

Esto genera backups locales automáticamente cada 24h.

---

## ✨ OPCIONALES DESPUÉS (Google Drive + Email)

Una vez que funcione el backup local, puedes agregar:

### Google Drive
- Requiere: Google Cloud Project + Service Account JSON
- Tiempo: 10 minutos
- Beneficio: Backup semanal en la nube

### Email
- Requiere: Gmail 2FA + App Password
- Tiempo: 5 minutos
- Beneficio: Recibe backup semanalmente en email

**Guía completa en:** `BACKUP_COMPLETE_GUIDE.md`

---

## ✅ CHECKLIST

- [ ] `npm install node-cron @google-cloud/storage nodemailer`
- [ ] `cp backup-config.example.js backup-config.js`
- [ ] `npm start` (reiniciar servidor)
- [ ] Ir a Configuración → Seguridad & Respaldos
- [ ] Click "💾 Generar Backup Ahora"
- [ ] Ver "✅ Backup completado exitosamente"
- [ ] Verificar que aparece fecha/hora en el panel
- [ ] Ver archivo en `backups/` folder

---

## 📞 SI ALGO FALLA

1. Abre **DEBUG_REPORT.md** → Sección "Troubleshooting"
2. Revisa los **logs de npm start** (consola del servidor)
3. Abre **F12** → Consola del navegador (para ver logs del Dashboard)

---

## 🎉 ¡LISTO!

Una vez confirmado que funciona, puedes:

1. Opcionalmente: Configurar Google Drive (BACKUP_COMPLETE_GUIDE.md)
2. Opcionalmente: Configurar Email (BACKUP_COMPLETE_GUIDE.md)
3. Dormir tranquilo sabiendo que tus datos se respaldan automáticamente cada 24h

**Tiempo total: 5 minutos para lo básico**

