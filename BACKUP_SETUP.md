# 💾 CD & Co — Sistema de Backup Automático

## 📋 Descripción General

Sistema de backup automático que exporta todas las tablas de Supabase cada 24 horas en formato JSON. Permite:

✅ **Backup automático diario** a las 00:00 (medianoche)
✅ **Trigger manual** desde el Dashboard
✅ **Almacenamiento local seguro** en `/backups` con organización por fecha
✅ **Limpieza automática** de backups con más de 30 días
✅ **Metadata tracking** con timestamp y estadísticas

---

## 🚀 Instalación

### 1. Instalar dependencia

```bash
npm install node-cron
```

**¿Por qué solo node-cron?**
- `fs/promises`: Nativa en Node.js ✅
- `path`: Nativa en Node.js ✅
- `http`: Nativa en Node.js ✅
- `node-cron`: Necesario para programar tareas 📦

### 2. Verificar que `simple-server.js` esté actualizado

El servidor debe tener:
- Require de `backup.js` (línea 5)
- Función `handleApiRequest()` (línea 43)
- Inicialización de scheduler en `server.listen()` (línea 159)

```javascript
const backup = require('./backup');
// ...
backup.initBackupScheduler(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY);
```

### 3. Verificar que `.env.local` tiene credenciales de Supabase

```bash
cat .env.local
# Debe contener:
# SUPABASE_URL=https://xxxxx.supabase.co
# SUPABASE_ANON_KEY=eyJhbGc...
```

---

## 📁 Estructura de archivos

```
cdco/
├── backup.js                 ← Módulo de backup (NUEVO)
├── js/
│   └── backup-ui.js          ← UI del Dashboard (NUEVO)
├── simple-server.js          ← Servidor actualizado ✅
├── index.html                ← Con sección de backup ✅
├── backups/                  ← Se crea automáticamente
│   ├── backup-27-03-2026-00-00-00.json
│   ├── backup-26-03-2026-00-00-00.json
│   └── backup-metadata.json  ← Último backup info
```

---

## 🔄 Cómo funciona

### Automático (24h)

1. **Programación**: Cron ejecuta a las **00:00 (medianoche)**
2. **Exportación**: Descarga todas las tablas desde Supabase vía REST API
3. **Guardado**: Crea archivo JSON con fecha/hora: `backup-27-03-2026-00-00-00.json`
4. **Metadata**: Actualiza `backup-metadata.json` con timestamp y estadísticas
5. **Limpieza**: Elimina backups con >30 días

### Manual

1. Usuario hace click en **"💾 Generar Backup Ahora"** en Configuración
2. Frontend hace `POST /api/backup/now`
3. Servidor ejecuta backup inmediato
4. Respuesta: `{success: true, file: "backup-...", metadata: {...}}`
5. Dashboard actualiza status automáticamente

---

## 📊 Tablas incluidas en backup

```
✓ products          (Inventario)
✓ sales            (Ventas)
✓ transactions     (Movimientos financieros)
✓ orders           (Pedidos)
✓ contacts         (Clientes/Proveedores)
✓ cards            (Tarjetas crédito)
✓ debts            (Deudas)
✓ accounts         (Cuentas bancarias)
✓ receivables      (A cobrar)
✓ budgets          (Presupuestos)
✓ subscriptions    (Suscripciones)
✓ goals            (Metas)
```

**Total: 12 tablas**

---

## 🔌 Endpoints API

### GET `/api/backup/status`

**Obtiene el estado del último backup**

```bash
curl http://localhost:3000/api/backup/status
```

**Response:**
```json
{
  "lastBackup": "2026-03-27T00:00:00.000Z",
  "lastBackupFile": "backup-27-03-2026-00-00-00.json",
  "status": "success",
  "tableCount": 12,
  "totalRecords": 1542
}
```

### POST `/api/backup/now`

**Fuerza un backup inmediato**

```bash
curl -X POST http://localhost:3000/api/backup/now
```

**Response (éxito):**
```json
{
  "success": true,
  "file": "backup-27-03-2026-10-45-23.json",
  "metadata": {
    "lastBackup": "2026-03-27T10:45:23.456Z",
    "lastBackupFile": "backup-27-03-2026-10-45-23.json",
    "status": "success",
    "tableCount": 12,
    "totalRecords": 1542
  }
}
```

---

## 🖥️ Dashboard Integration

### Sección en Configuración

Aparece un nuevo panel **"🔐 Seguridad & Respaldos"** que muestra:

- **✅ Último backup**: Fecha y hora exacta
- **📦 Total de registros**: Cantidad de datos respaldados
- **📋 Tablas**: Cantidad de tablas incluidas
- **💾 Botón**: "Generar Backup Ahora" para trigger manual

### Auto-actualización

El status se actualiza automáticamente cada 5 minutos en el Dashboard.

---

## 💾 Estructura del archivo de backup

```json
{
  "timestamp": "2026-03-27T00:00:00.000Z",
  "version": "1.0",
  "tables": {
    "products": {
      "count": 45,
      "data": [
        {
          "id": "uuid",
          "user_id": "uuid",
          "name": "Rolex Submariner",
          "sku": "ROL-001",
          ...
        },
        ...
      ]
    },
    "sales": {
      "count": 156,
      "data": [...]
    },
    ...
  }
}
```

---

## 🔒 Seguridad

- ✅ Los backups se guardan **localmente** en la carpeta `/backups`
- ✅ Nunca se suben a Internet
- ✅ Usa la **REST API de Supabase** (autenticada con API key)
- ✅ Se limpia automáticamente cada 30 días
- ✅ El archivo `backup-metadata.json` es público (solo metadata, sin datos sensibles)

---

## 📋 Troubleshooting

### Error: "node-cron no instalado"

```bash
npm install node-cron
npm list node-cron  # Verificar instalación
```

### Supabase no configurado

Revisa `.env.local`:
```bash
cat .env.local
```

Debe contener credenciales válidas.

### No aparece el status en Dashboard

1. Abre consola (F12)
2. Ejecuta en consola: `getBackupStatus()`
3. Verifica que `/api/backup/status` responda

### Carpeta `/backups` no existe

Se crea automáticamente en el primer backup.

---

## 📈 Logs del servidor

Cuando el servidor inicia, verás:

```
✅ [Backup] Directorio de backups verificado
🔄 [Backup] Haciendo backup inicial...
📥 Descargando products...
📥 Descargando sales...
...
✅ [Backup] Guardado: backup-27-03-2026-00-00-00.json
✅ [Backup] Metadata actualizado
✅ [Backup] Scheduler iniciado - backup diario a las 00:00
```

---

## 🎯 Plan de mantenimiento

| Tarea | Frecuencia | Automático |
|-------|-----------|-----------|
| Backup completo | Cada 24h | ✅ Sí |
| Backup manual | On-demand | Manual |
| Limpieza (>30 días) | Cada backup | ✅ Sí |
| Metadata update | Cada backup | ✅ Sí |

---

## 📞 Soporte

**Problema**: Los backups no se generan
**Solución**: Verifica que Supabase está configurado en `.env.local`

**Problema**: El dashboard no muestra estado
**Solución**: Espera a que se genere el primer backup (automático al iniciar servidor)

**Problema**: Carpeta `/backups` se llena demasiado
**Solución**: Aumenta el tiempo de limpieza en `backup.js` (línea 175: cambiar `30` por otro número de días)

---

**¡Listo! Tu sistema de backup está 100% operacional.** 🎉

Para reiniciar: `npm start` o `node simple-server.js`
