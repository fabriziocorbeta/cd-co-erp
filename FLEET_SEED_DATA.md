# 🌱 FLEET SEED DATA — Generar datos de prueba

Este documento explica cómo generar 6 meses de datos de prueba para el módulo de flota.

---

## 📊 ¿Qué se genera?

Al ejecutar el seed data, se crean automáticamente:

### **3 Vehículos:**
| Apodo | Marca | Modelo | Tipo | Esperado | Capacidad |
|-------|-------|--------|------|----------|-----------|
| 🚗 Kia Sportage Personal | Kia | Sportage | Diésel | 8.5 km/L | 70L |
| 🏍️ Moto Entregas | Honda | 150cc | Nafta | 45 km/L | 8L |
| 🚚 Camioneta Logística | Volvo | FH16 | Diésel | 6.5 km/L | 80L |

### **72 Registros de Combustible (6 meses):**
- **Octubre-Noviembre 2025**: Cargas sin liquidar (no tienen transacción contable)
- **Diciembre 2025-Febrero 2026**: Cargas liquidadas (con transacciones creadas)
  - **🎄 Diciembre**: La camioneta consume **+20%** (simula picos por fiestas/tráfico en Asunción)
- **Marzo 2026**: Últimas 4 cargas **PENDIENTES** (listos para liquidación)

### **Totales:**
- 48 cargas liquidadas
- 24 cargas pendientes
- ~₲21.000 de costo total

---

## ⚙️ OPCIÓN 1: Desde Node.js (RECOMENDADO)

### Paso 1: Obtén tu user_id

Abre la consola del navegador en tu app (F12) y ejecuta:

```javascript
// En la consola del navegador (cuando estés logueado)
const token = localStorage.getItem('sb-auth-token');
const decoded = JSON.parse(atob(token.split('.')[1]));
console.log('User ID:', decoded.sub);
```

Copia ese ID.

### Paso 2: Ejecuta el script

En tu terminal, desde la carpeta del proyecto:

```bash
node scripts/seed-fleet-data.js <user_id_aqui>
```

**EJEMPLO:**
```bash
node scripts/seed-fleet-data.js 550e8400-e29b-41d4-a716-446655440000
```

### Paso 3: Verifica el resultado

Deberías ver:
```
🌱 Generando seed data de flota...
✅ ¡Seed data completado exitosamente!

📊 RESUMEN:
   Vehículos creados: 3
   Fuel logs insertados: 72
   Liquidados: 48
   Pendientes: 24
   Costo total: ₲21.098,50
```

---

## 💻 OPCIÓN 2: Desde curl (Terminal)

Si prefieres hacer el request directamente:

```bash
curl -X POST http://localhost:3000/api/fleet/seed \
  -H "Content-Type: application/json" \
  -d '{"user_id":"tu-user-id-aqui"}'
```

---

## 🌐 OPCIÓN 3: Desde el navegador (Consola JavaScript)

En la consola del navegador (F12), mientras el servidor corre en http://localhost:3000:

```javascript
// Reemplaza con tu user_id real
const userId = '550e8400-e29b-41d4-a716-446655440000';

fetch('/api/fleet/seed', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: userId })
})
.then(r => r.json())
.then(data => {
  if (data.success) {
    console.log('✅ Seed data completado!', data.summary);
  } else {
    console.error('❌ Error:', data.error);
  }
});
```

---

## 🧪 Verifica los datos

### En Supabase Console:

1. Ve a **Data Editor** → **vehicles**
   - Deberías ver 3 vehículos
2. Ve a **Data Editor** → **fuel_logs**
   - Deberías ver 72 registros
3. Ordena por `date` o `is_settled` para explorar

### En tu app:

1. Abre el módulo de Flota
2. Verifica que aparezcan los 3 vehículos
3. Haz click en cada vehículo para ver su historial
4. Nota especial: En diciembre, la camioneta debería mostrar anomalía de consumo (+20%)

---

## 🧠 Características a probar

### 1. **Desviación de Consumo**
- La camioneta en diciembre debería mostrar ~20% más consumo
- El sistema detectará esto como "anomalía" en el histórico
- Se creará una alert de mantenimiento (si está habilitado)

### 2. **Liquidación en Lote**
- Vé a "Cargas Pendientes"
- Selecciona las 4 cargas de marzo
- Haz click en "Liquidar Pendientes"
- Deberían crearse transacciones contables automáticamente

### 3. **Pronóstico Estacional**
- Cada vehículo tendrá datos de 6 meses
- El sistema calculará factores estacionales
- La previsión debería ser más precisa que con un mes de datos

### 4. **Eficiencia Esperada**
- Kia: ~8.5 km/L (8200 km en 6 meses ÷ ~960 L)
- Moto: ~45 km/L (1210 km ÷ ~27 L)
- Camioneta: ~6.5 km/L base (9500 km ÷ ~1460 L, con spike en diciembre)

---

## ❌ Solución de problemas

### Error: "user_id es requerido"
- Verifica que pasaste el user_id correctamente
- El user_id debe ser un UUID válido

### Error: "Request timeout"
- El servidor no está corriendo
- Ejecuta: `npm start`

### No veo los datos en Supabase
- Verifica que tu user_id es correcto
- Los datos están filtrados por `user_id` (Row Level Security)
- Abre Supabase Console con tu usuario logueado

### La moto tiene velocidad muy baja
- Eso es correcto. El odometer sube lentamente porque es una moto (2000-7360 km en 6 meses)
- Promedio: ~7 km/día

---

## 🔧 Personalizar los datos

Si quieres modificar los datos generados, edita `fleet-management.js`:

**Cambiar fechas:**
```javascript
{ date: '2025-10-07', liters: 35.2, odo: 5320, settled: false },
// ↓ ↓ ↓
{ date: '2024-09-07', liters: 35.2, odo: 5320, settled: false },
```

**Cambiar precio de combustible:**
```javascript
cost: parseFloat((log.liters * 9.5).toFixed(2)), // ← 9.5 es el precio
```

**Cambiar nombres de vehículos:**
```javascript
nickname: 'Kia Sportage Personal',
// ↓ ↓ ↓
nickname: 'Mi Kia Verde',
```

Luego vuelve a ejecutar el script.

---

## 📝 Notas

- Los datos se crean con el `user_id` que especifiques
- Ejecutar el script múltiples veces creará duplicados
- Para limpiar, elimina manualmente desde Supabase Console (en Data Editor)
- Los datos son realistas pero simulados (para testing)

---

## 🚀 ¿Qué viene después?

Una vez que tengas los datos:

1. **Prueba el analytics:**
   - Ver desviación de consumo
   - Verificar pronóstico con estacionalidad
   - Analizar eficiencia por vehículo

2. **Prueba la liquidación:**
   - Liquida los pendientes de marzo
   - Verifica que se crean transacciones contables
   - Revisa el balance total

3. **Integra con el dashboard:**
   - Muestra stats de la flota
   - Gráficos de consumo vs. esperado
   - Alertas de mantenimiento por anomalía

4. **Exporta reportes:**
   - PDF con historial de 6 meses
   - Comparativa vehículos
   - Proyección de costos anuales

---

**¿Necesitas ayuda?** Revisa la documentación en `FLEET_SAAS_ENTERPRISE.md`.
