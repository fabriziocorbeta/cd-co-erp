# Informe de Auditoría Técnica - CD & Co ERP

Este informe detalla los hallazgos de la auditoría técnica realizada sobre el repositorio del ERP, identificando puntos críticos, ineficiencias y áreas de mejora estructural sin modificar el código actual.

## 1. Origen de los bugs recurrentes en el flujo de pedidos 'sobre pedido'

El manejo de inventario y pedidos a proveedores presenta problemas estructurales de concurrencia e inconsistencia de estados:

*   **Condiciones de Carrera (Race Conditions) en Recepción:** Cuando se recibe un pedido en `js/orders.js` (`confirmReceive`), el sistema actualiza el stock local sumando la cantidad recibida y luego hace un volcado completo de la fila del producto a Supabase (`sbSaveProduct`). Este patrón de *Read-Modify-Write* en el cliente sobreescribe cualquier cambio concurrente (como una venta realizada por otro usuario al mismo tiempo), perdiendo datos de stock. A diferencia de `js/inventory.js`, que usa el RPC atómico `adjust_stock_atomic`, aquí no se garantiza la atomicidad.
*   **Ausencia de Estado 'Sobre Pedido' (Backorder) para Ventas:** El sistema de ventas bloquea explícitamente cualquier transacción si no hay stock físico suficiente (`if(p.stock < l.qty) toast(...)`). Esto obliga a los usuarios a usar flujos alternativos no estandarizados (como crear el pedido al proveedor primero y esperar) para ventas 'sobre pedido', lo que desacopla la venta real de la orden de compra y genera discrepancias entre lo cobrado, lo facturado y el stock en tránsito.
*   **Sincronización Frágil de Transacciones:** Los pedidos generan transacciones automáticas (`S.txs`) basadas en el estado de pago. Si un pedido cambia de estado o su monto se actualiza, la lógica de actualización busca la transacción por `orderId` y la sobrescribe. Si la transacción ya había sido modificada manualmente (por ejemplo, para ajustar una diferencia cambiaria), esos cambios se pierden.

## 2. Ineficiencias en la arquitectura de la base de datos

El esquema actual (basado en Supabase/PostgreSQL) tiene ineficiencias que afectarán el rendimiento a mediano plazo:

*   **Uso Excesivo de JSONB para Relaciones Core:** Las tablas `sales` y `orders` almacenan el detalle de los productos vendidos/comprados (`items`) en un único campo JSONB. Esto hace extremadamente costoso, lento y complejo realizar consultas analíticas básicas (ej. "¿Cuántas unidades del producto X se vendieron este mes?"), ya que requiere deserializar el JSON en cada consulta en lugar de usar un simple `JOIN` en una tabla de `sale_items`.
*   **Tipos de Datos Subóptimos:** Se utilizan campos de texto (`text`) como llaves primarias (IDs) en lugar de UUIDs estandarizados en PostgreSQL, lo que afecta negativamente la indexación y el rendimiento de los JOINs y búsquedas.
*   **Falta de Normalización en Transacciones:** En la tabla `txs` (Transacciones), referencias como `_sale_id` o vinculaciones a cuentas se guardan como texto, y hay datos redundantes.

## 3. Obstáculos técnicos para una futura migración fuera de Shopify

El acoplamiento con Shopify es actualmente demasiado estrecho y está distribuido por múltiples capas de la aplicación:

*   **Acoplamiento en el Frontend:** La lógica de negocio del frontend (`js/sales.js` y `js/inventory.js`) tiene llamadas a funciones (`pushSkusToShopify`, `syncShopify`) inyectadas de manera estática y fuertemente tipada para Shopify. No existe una capa de abstracción o interfaz (ej. `SyncService`) que permita conectar múltiples canales de venta.
*   **Lógica de Sincronización Específica (Serverless):** Los endpoints en `/api/shopify_sync.js` y `/api/webhooks/shopify-product.js` están diseñados en torno a la estructura de la API de Shopify (variantes, `inventory_item_id`, `location_id`).
*   **Mapeo de Productos Directo:** El ERP mapea productos a la tienda basándose directamente en el campo `sku`. Si otra plataforma (como WooCommerce o VTEX) requiere mapeos de ID compuestos o variaciones diferentes, el modelo de datos actual no tiene una tabla de mapeo relacional (`channel_product_mappings`), sino que asume que el SKU del ERP es el identificador universal en la web.

## 4. Áreas donde la lógica actual es frágil o difícil de escalar

El diseño actual prioriza el desarrollo rápido ("Time to Market"), pero acarrea deuda técnica que dificulta su escalabilidad:

*   **Estado Global en Memoria (In-Memory SWR):** La aplicación descarga colecciones completas a memoria (`S.products`, `S.sales`, `S.orders`, `S.txs`) y las renderiza iterando todo el array en el navegador. Esto funcionará bien con cientos de registros, pero la aplicación colapsará o será inusable por consumo de RAM y CPU cuando haya decenas de miles de registros.
*   **Falta de Paginación:** Relacionado al punto anterior, no existe paginación del lado del servidor ni del lado del cliente para las tablas principales.
*   **Reglas de Negocio en el Cliente:** Lógicas críticas como el cálculo de impuestos (IVA 5%, 10%, Exento), validación de disponibilidad de stock y cálculo de márgenes operan en el navegador (`js/sales.js`). Esto expone al sistema a inconsistencias si dos clientes tienen versiones cacheadas distintas o si la conexión a internet falla a la mitad del proceso.
*   **Procesamiento Síncrono de Operaciones Complejas:** Acciones como importar inventario, sincronizar con la tienda online o asignar SKUs ejecutan bucles masivos sobre la base de datos en tiempo real (ej. `assign-shopify-skus.js` y la función de webhook), exponiendo al sistema a timeouts en Vercel Functions (límite típico de 10 o 60 segundos).
