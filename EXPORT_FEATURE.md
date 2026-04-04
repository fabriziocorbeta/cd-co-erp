# 📥 Funcionalidad de Exportación a CSV/Excel

## ¿Qué es?

Dos nuevos botones elegantes que permiten descargar automáticamente los datos del Inventario y Rentabilidad en formato CSV, compatible 100% con Excel y Google Sheets.

---

## Dónde encontrarlo

### 1️⃣ **Inventario** (Pestaña "Inventario")
- Botón: **📥 Exportar CSV**
- Ubicación: Barra de herramientas, junto al filtro de categorías
- Datos exportados: SKU, Producto, Categoría, Variante, Nº Serial, Precios, Margen %, Stock, Descripción

### 2️⃣ **Rentabilidad** (Pestaña "Análisis de Rentabilidad")
- Botón: **📥 Exportar CSV**
- Ubicación: Barra superior derecha, junto a los toggles USD/PYG
- Datos exportados: SKU, Producto, Categoría, Precios, Margen %, Stock, Valor Total, Ganancia Potencial

---

## Cómo funciona

### Click → Descarga automática
```
Usuario hace click en "📥 Exportar CSV"
        ↓
Sistema recopila todos los datos de S.products (desde Supabase)
        ↓
Genera archivo CSV con BOM UTF-8 (para Excel reconozca caracteres especiales)
        ↓
Archivo se descarga automáticamente: Inventario_27-03-2026.csv
        ↓
Usuario abre en Excel/Google Sheets
```

### Características técnicas
- ✅ Datos en tiempo real desde Supabase (no caché)
- ✅ Nombres de archivo con fecha (Inventario_27-03-2026.csv)
- ✅ BOM UTF-8 para que Excel lea correctamente caracteres acentuados (₲, á, é, etc.)
- ✅ Escapado de comillas y saltos de línea
- ✅ Compatibilidad total: Excel 2013+, Google Sheets, LibreOffice
- ✅ Notificación visual con toast cuando descarga
- ✅ Validación: avisa si no hay productos para exportar

---

## Funciones JavaScript

### En `config.js`:

```javascript
// Función genérica para cualquier CSV
exportToCSV(filename, headers, rows)

// Específica para Inventario
exportInventoryCSV()

// Específica para Rentabilidad
exportProfitabilityCSV()
```

---

## Ejemplo: Qué se exporta

### Inventario
```
SKU,Producto,Categoría,Variante,Nº Serial,Precio Compra,Precio Venta,Margen %,Stock,Stock Mínimo,Descripción,Moneda
"CAS-001","Casio EF-316D","Relojes","","","35","60","71","5","2","Acero inoxidable","₲"
"CAS-002","Casio LTP-1302","Relojes","Dama","","28","50","78","2","3","Correa metálica","₲"
```

### Rentabilidad
```
SKU,Producto,Categoría,Precio Compra,Precio Venta,Margen %,Stock,Valor Compra Total,Valor Venta Total,Ganancia Potencial
"CAS-001","Casio EF-316D","Relojes","35","60","71","5","175","300","125"
"CAS-002","Casio LTP-1302","Relojes","28","50","78","2","56","100","44"
```

---

## Casos de uso

### 1. Sincronizar con contabilidad
```
Exporte Inventario → Envíe a contador para cuadre de stock
```

### 2. Análisis financiero
```
Exporte Rentabilidad → Abra en Google Sheets → Cree gráficos
```

### 3. Reporte periódico
```
Exporte cada viernes → Archive en carpeta de Reportes
```

### 4. Compartir con equipo
```
Exporte → Envíe por email → Equipo lo abre sin app
```

---

## Notas importantes

- Los datos exportados siempre son **en tiempo real desde Supabase**
- Si no hay productos, mostrará error: "❌ No hay productos para exportar"
- El formato es UTF-8 con BOM, asegura compatibilidad con Excel en todas las plataformas
- Los archivos se descargan en la carpeta "Descargas" (configurable por navegador)
- Los nombres incluyen fecha en formato DD-MM-YYYY para organización automática

---

## Requisitos previos

- ✅ Navegador moderno (Chrome, Firefox, Safari, Edge)
- ✅ JavaScript habilitado
- ✅ Al menos 1 producto en el inventario
- ✅ Excel, Google Sheets o LibreOffice para abrir archivos CSV

---

*Funcionalidad agregada: Marzo 2026*
