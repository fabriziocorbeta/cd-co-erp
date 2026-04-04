# 🔄 FUEL TRANSACTION MIGRATION

Sincroniza todas las transacciones históricas de combustible desde `transactions` a `fuel_logs` para mantener consistencia entre contabilidad y flota.

---

## 📋 ¿Por qué?

Anteriormente, los combustibles se registraban solo en **Movimientos (transactions)**. Ahora con el módulo de **Flota**, necesitamos que:
- Todo combustible esté en `fuel_logs` (para análisis de consumo)
- La contabilidad siga siendo consistente (`is_settled = true`)
- El histórico esté disponible para cálculos de previsión

---

## 🚀 EJECUTAR LA MIGRACIÓN

### Paso 1: Obtén tu user_id

En la consola del navegador (F12), cuando estés logueado:
```javascript
const token = localStorage.getItem('sb-auth-token');
const decoded = JSON.parse(atob(token.split('.')[1]));
console.log('User ID:', decoded.sub);
```

### Paso 2: Ejecuta el script

```bash
node migrate-fuel-transactions.js <user_id> [starting_km]
```

**Ejemplo:**
```bash
node migrate-fuel-transactions.js 550e8400-e29b-41d4-a716-446655440000 105000
```

### Paso 3: Verifica los resultados

En Supabase Console → Data Editor → **fuel_logs**:
- Deberías ver nuevos registros con `is_settled = true`
- El Kia Sportage tendrá historial completo
- Fechas ordenadas de antiguo a reciente

---

## ⚙️ ¿Qué hace exactamente?

1. **Busca** todas las transacciones con categoría/descripción que incluya:
   - Combustible
   - Nafta
   - Diésel
   - Transporte (relacionado a combustible)
   - Gasolina
   - Gas

2. **Por cada transacción:**
   - Crea un registro en `fuel_logs`
   - Asigna al **Kia Sportage** (vehículo principal)
   - Genera kilometraje **retrocediendo lógicamente**:
     - Punto inicial: 105.000 km (hoy)
     - Retrocede ~100-200 km por cada transacción (hacia atrás en tiempo)
   - Calcula litros estimados: `monto ÷ 9.5 ₲/L`
   - Marca como **`is_settled = true`** (no duplica en contabilidad)

3. **Resultado:**
   - Todos los combustibles históricos están sincronizados
   - La flota tiene datos para análisis de 6+ meses
   - No hay conflictos contables (ambos registros están conciliados)

---

## 📊 Ejemplo de transformación

**Antes (solo en transactions):**
```
2025-12-15 | Nafta | ₲342.50 | Sin detalle
2026-01-10 | Combustible | ₲380.00 | Sin odómetro
```

**Después (en fuel_logs):**
```
2025-12-15 | 36.1L | 5200km | ₲342.50 | is_settled: true
2026-01-10 | 40.0L | 5050km | ₲380.00 | is_settled: true
```

---

## 🛑 Advertencia ante nuevos combustibles

A partir de ahora, cuando el usuario intente crear una **transacción** con categoría "Combustible", el sistema:

1. Valida con: `GET /api/validate/fuel-transaction?category=Combustible`
2. Recibe advertencia: "⚠️ Esta transacción es COMBUSTIBLE. Usa el módulo de FLOTA en lugar de Movimientos"
3. Ofrece redirigirse al módulo de Flota automáticamente

**Endpoint:**
```bash
GET /api/validate/fuel-transaction?category=Combustible&description=Nafta
```

**Respuesta:**
```json
{
  "success": true,
  "isFuelTransaction": true,
  "warning": "⚠️ Esta transacción parece ser COMBUSTIBLE...",
  "recommendation": "redirect-to-fleet"
}
```

---

## 🔗 Integración con Frontend

En `js/transactions.js`, antes de guardar una transacción con categoría "Combustible":

```javascript
// (Pseudocódigo - implementar en transactions.js)
if (category.toLowerCase().includes('combustible')) {
  const validation = await fetch('/api/validate/fuel-transaction?category=' + category);
  const result = await validation.json();

  if (result.isFuelTransaction) {
    const redirect = confirm(result.warning + '\n\n¿Ir al módulo de Flota?');
    if (redirect) {
      window.location.href = '#fleet'; // o navegar a flota
      return;
    }
  }
}
```

---

## 📝 Notas importantes

- **No es destructivo**: La migración solo crea nuevos fuel_logs, no modifica ni elimina transacciones
- **Reversible**: Si hay error, simplemente elimina los fuel_logs creados en Data Editor
- **Sin duplicados**: Los fuel_logs están marcados como `is_settled = true`, así que no crean nuevas transacciones contables
- **Km lógicos**: El kilometraje es estimado (hacia atrás) porque no tenemos datos exactos del odómetro histórico
- **Una sola ejecución**: Ejecuta el script UNA sola vez. Ejecutarlo dos veces creará duplicados

---

## ✅ Checklist de completitud

- [ ] Ejecuté el script con mi user_id
- [ ] El script mostró "✨ MIGRACIÓN COMPLETADA"
- [ ] Verifiqué en Supabase que hay nuevos fuel_logs
- [ ] Todos los fuel_logs migrantes tienen `is_settled = true`
- [ ] El Kia Sportage ahora tiene historial completo
- [ ] Las categorías de Combustible están ahora en Flota, no en Movimientos

---

**¿Necesitas ayuda?**
- Revisa los logs del script para errores específicos
- Verifica que el Kia Sportage esté creado (ejecuta `node scripts/seed-fleet-data.js` si falta)
- Asegúrate de tener variables de entorno configuradas (.env.local)
