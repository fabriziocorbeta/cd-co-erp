# 💱 Correcciones de Tipo de Cambio y Conversión

## ✅ Problemas Corregidos

### 1. Conversión incorrecta en KPI Cards (Tarjetas de Resumen)
**Problema:** Cuando el usuario cambiaba a USD, las tarjetas mostraban 3.087.900 → $3.087.900,00 (sin dividir por el tipo de cambio)

**Causa:** La lógica de conversión solo funcionaba para productos en USD, no para productos en PYG

**Solución:** 
```javascript
// ❌ ANTES (incorrecto)
return acc + (p.cur === '$' ? convertAmount(cost, '$', cur, fxRate) : cost);

// ✅ DESPUÉS (correcto)
const productCur = p.cur || '₲';
return acc + (productCur === cur ? cost : convertAmount(cost, productCur, cur, fxRate));
```

### 2. Tipo de cambio incorrecto
**Problema:** Se estaba usando `FX.buy` (tasa de compra) en lugar de `FX.sell` (tasa de venta)

**Causa:** Para análisis de rentabilidad, la tasa correcta es la de venta (lo que recibiría al vender dólares)

**Solución:**
```javascript
// ❌ ANTES
const fxRate = (FX && FX.buy) ? FX.buy : 7200;

// ✅ DESPUÉS
const fxRate = (FX && FX.sell) ? FX.sell : 7500;
```

---

## 🔄 Cómo Funciona el Tipo de Cambio Dinámico

### API: dolar.melizeche.com
```
URL: https://dolar.melizeche.com/api/1.0/
Respuesta: {
  "dolarpy": {
    "cambioschaco": {
      "compra": 7450,
      "venta": 7480,
      "variacion": "-0.01%",
      ...
    },
    ...
  }
}
```

### Flujo en la App

```
1. enterApp() → initFx() [auth.js línea 166]
   ↓
2. initFx() [fx.js línea 73-86]
   ├─ Carga tipo de cambio anterior del localStorage
   ├─ Si tiene menos de 30 min, usa el caché
   └─ Si es más antiguo, llama a fetchRate()
   ↓
3. fetchRate() [fx.js línea 7-43]
   ├─ Hace request a dolar.melizeche.com/api/1.0/
   ├─ Extrae cambioschaco.compra → FX.buy
   ├─ Extrae cambioschaco.venta → FX.sell
   ├─ Guarda en localStorage (caché)
   ├─ Actualiza UI con timestamp
   └─ Cada 30 minutos actualiza automáticamente
   ↓
4. renderProfitability() [profitability.js línea 38-39]
   ├─ Usa FX.sell para conversiones
   ├─ Llama a convertAmount() para cada producto
   └─ Muestra valores correctos en USD
```

---

## 🔢 Lógica de Conversión

### Función convertAmount()
```javascript
function convertAmount(amount, fromCur, toCur, fxRate) {
  if (fromCur === toCur) return amount;
  
  // De USD a PYG: multiplicar por tasa de venta
  if (fromCur === '$' && toCur === '₲') 
    return amount * fxRate;  // ej: 100 * 7480 = 748000
  
  // De PYG a USD: dividir por tasa de venta
  if (fromCur === '₲' && toCur === '$') 
    return amount / fxRate;  // ej: 748000 / 7480 = 100
  
  return amount;
}
```

### Ejemplo Práctico

**Producto: Casio EF-316D**
- Precio Compra: 35 USD
- Precio Venta: 60 USD
- Stock: 5 unidades
- FX.sell = 7480

**En PYG:**
- Inversión Total: 35 * 5 = 175 USD × 7480 = **1,309,000 ₲**
- Valor Potencial: 60 * 5 = 300 USD × 7480 = **2,244,000 ₲**
- Ganancia Potencial: 125 USD × 7480 = **935,000 ₲**

**En USD (Después de corrección):**
- Inversión Total: 1,309,000 ÷ 7480 = **$175.00**
- Valor Potencial: 2,244,000 ÷ 7480 = **$300.00**
- Ganancia Potencial: 935,000 ÷ 7480 = **$125.00**

---

## 🔄 Actualización Automática

El sistema actualiza el tipo de cambio **cada 30 minutos** automáticamente:

```javascript
setInterval(()=>{
  if(!FX.manual)fetchRate()
}, 30*60*1000);  // 30 minutos
```

**Fallback en caso de falla:**
- Si falla la API, usa el valor en caché del localStorage
- Si no hay caché, muestra error: "⚠ No se pudo obtener cotización"
- El usuario puede editar manualmente si es necesario

---

## 📊 Archivos Modificados

### profitability.js

**Línea 38-39:** Cambiar `FX.buy` por `FX.sell`
```javascript
const fxRate = (FX && FX.sell) ? FX.sell : 7500;
```

**Línea 57-68:** Corregir lógica de conversión en KPI Cards (Inversión Total y Valor Potencial)

**Línea 212-219:** Corregir lógica de conversión en Category Analysis

### fx.js (sin cambios necesarios)
- Ya está conectado a la API correcta
- Ya obtiene `FX.sell` automáticamente
- Ya actualiza cada 30 minutos

---

## 🧪 Pruebas Recomendadas

1. **Test de conversión USD/PYG**
   - [ ] Abre Rentabilidad en PYG → anota valores
   - [ ] Cambia a USD → verifica que sean correctos (÷ tipo de cambio)
   - [ ] Verifica que sean consistentes con el tipo de cambio mostrado

2. **Test de tipo de cambio dinámico**
   - [ ] Abre Settings/Finanzas
   - [ ] Mira el tipo de cambio mostrado
   - [ ] Compara con https://dolar.melizeche.com/api/1.0/
   - [ ] Verifica que sea "cambioschaco.venta"

3. **Test de actualización automática**
   - [ ] Anota el timestamp del tipo de cambio (ej: 14:32)
   - [ ] Espera a que se actualice (cada 30 min)
   - [ ] Verifica que el timestamp cambio
   - [ ] Verifica que los valores se actualizaron

4. **Test de fallback en caché**
   - [ ] Desconecta internet (modo offline)
   - [ ] Recarga la página
   - [ ] Verifica que sigue mostrando tipo de cambio del caché
   - [ ] Muestra aviso: "⚡ Usando datos en caché"

---

## 📝 Notas Técnicas

- **FX.buy** = Tasa de compra (lo que paga el cambista cuando compra USD)
- **FX.sell** = Tasa de venta (lo que cobra el cambista cuando vende USD) ← **USAMOS ESTA**
- **Rentabilidad** usa FX.sell porque analiza ganancias en venta

---

## 🎯 Impacto en la App

| Sección | Afectado | Corrección |
|---------|----------|-----------|
| KPI Cards - Inversión Total | ✅ SÍ | Usa FX.sell, convierte siempre |
| KPI Cards - Valor Potencial | ✅ SÍ | Usa FX.sell, convierte siempre |
| KPI Cards - Ganancia Potencial | ✅ SÍ | Calculado correctamente |
| Tabla de Productos | ✓ OK | Ya estaba correcto |
| Category Analysis | ✅ SÍ | Usa FX.sell, convierte siempre |
| Conversión de Moneda (FX) | ✓ OK | Ya estaba correcto |

