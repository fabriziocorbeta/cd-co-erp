-- =============================================================================
-- CD & Co ERP — Patch C-1: Atomic Stock Operations (Race Condition Fix)
-- =============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Propósito: implementar bloqueo pesimista (SELECT ... FOR UPDATE) para que
-- dos ventas concurrentes del mismo producto no puedan sobrevenderse.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN 1: deduct_stock_atomic
-- Usada por el módulo de VENTAS. Descuenta qty unidades de un producto.
-- Retorna JSONB:
--   {ok: true,  new_stock: N}
--   {ok: false, error: 'insufficient_stock', available: N, requested: N}
--   {ok: false, error: 'product_not_found'}
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION deduct_stock_atomic(
  p_product_id UUID,
  p_qty        INTEGER,
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock     INTEGER;
  v_new_stock INTEGER;
BEGIN
  -- 1. Bloquear la fila para escritura exclusiva.
  --    Si otra transacción tiene el lock, esta espera hasta liberarse.
  --    RLS se aplica también (user_id garantiza aislamiento entre usuarios).
  SELECT stock INTO v_stock
  FROM products
  WHERE id = p_product_id
    AND user_id = p_user_id
  FOR UPDATE;

  -- 2. Producto no encontrado
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'product_not_found'
    );
  END IF;

  -- 3. Validar stock suficiente DENTRO de la transacción bloqueada
  IF v_stock < p_qty THEN
    RETURN jsonb_build_object(
      'ok',        false,
      'error',     'insufficient_stock',
      'available', v_stock,
      'requested', p_qty
    );
  END IF;

  -- 4. Descontar stock — atómico, sin race condition posible
  v_new_stock := v_stock - p_qty;

  UPDATE products
  SET stock = v_new_stock
  WHERE id = p_product_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok',        true,
    'new_stock', v_new_stock
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN 2: adjust_stock_atomic
-- Usada por el módulo de INVENTARIO. Soporta: in / out / set.
-- Retorna JSONB:
--   {ok: true,  new_stock: N}
--   {ok: false, error: 'insufficient_stock', available: N, requested: N}
--   {ok: false, error: 'product_not_found' | 'invalid_type'}
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION adjust_stock_atomic(
  p_product_id UUID,
  p_qty        INTEGER,
  p_type       TEXT,     -- 'in' | 'out' | 'set'
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock     INTEGER;
  v_new_stock INTEGER;
BEGIN
  SELECT stock INTO v_stock
  FROM products
  WHERE id = p_product_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;

  IF p_type = 'in' THEN
    v_new_stock := v_stock + p_qty;

  ELSIF p_type = 'out' THEN
    IF v_stock < p_qty THEN
      RETURN jsonb_build_object(
        'ok',        false,
        'error',     'insufficient_stock',
        'available', v_stock,
        'requested', p_qty
      );
    END IF;
    v_new_stock := v_stock - p_qty;

  ELSIF p_type = 'set' THEN
    v_new_stock := p_qty;  -- valor absoluto — no puede ser negativo
    IF v_new_stock < 0 THEN v_new_stock := 0; END IF;

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_type');
  END IF;

  UPDATE products
  SET stock = v_new_stock
  WHERE id = p_product_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok',        true,
    'new_stock', v_new_stock
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PERMISOS: permitir que usuarios autenticados ejecuten las funciones
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION deduct_stock_atomic(UUID, INTEGER, UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_stock_atomic(UUID, INTEGER, TEXT, UUID)  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÍNDICE: acelerar el FOR UPDATE lookup (si no existe ya)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_id_user
  ON products(id, user_id);

-- =============================================================================
-- VERIFICACIÓN: ejecutar para confirmar que las funciones existen
-- =============================================================================
-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_name IN ('deduct_stock_atomic', 'adjust_stock_atomic')
--   AND routine_schema = 'public';
