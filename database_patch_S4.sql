-- =============================================================================
-- CD & Co ERP — Patch S4: Inventario Híbrido (Físico vs. Tránsito)
-- =============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Propósito: agregar columna stock_transit a la tabla products y crear la
-- función RPC adjust_transit_atomic con bloqueo pesimista, espejando la
-- lógica de adjust_stock_atomic pero sobre la columna stock_transit.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1: Agregar columna stock_transit a products
-- Safe: IF NOT EXISTS evita error si ya fue ejecutado antes.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_transit INT NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2: adjust_transit_atomic
-- Usada por el módulo de INVENTARIO para mover unidades en tránsito.
-- Soporta: 'in' / 'out' / 'set'
-- Retorna JSONB:
--   {ok: true,  new_stock: N}
--   {ok: false, error: 'insufficient_stock', available: N, requested: N}
--   {ok: false, error: 'product_not_found' | 'invalid_type'}
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION adjust_transit_atomic(
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
  v_transit     INTEGER;
  v_new_transit INTEGER;
BEGIN
  -- Bloquear la fila para escritura exclusiva (FOR UPDATE).
  -- Garantiza que dos operaciones concurrentes sobre el mismo producto
  -- no generen condición de carrera en stock_transit.
  SELECT stock_transit INTO v_transit
  FROM products
  WHERE id = p_product_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;

  IF p_type = 'in' THEN
    v_new_transit := v_transit + p_qty;

  ELSIF p_type = 'out' THEN
    IF v_transit < p_qty THEN
      RETURN jsonb_build_object(
        'ok',        false,
        'error',     'insufficient_stock',
        'available', v_transit,
        'requested', p_qty
      );
    END IF;
    v_new_transit := v_transit - p_qty;

  ELSIF p_type = 'set' THEN
    v_new_transit := p_qty;
    IF v_new_transit < 0 THEN v_new_transit := 0; END IF;

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_type');
  END IF;

  UPDATE products
  SET stock_transit = v_new_transit
  WHERE id = p_product_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok',        true,
    'new_stock', v_new_transit
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3: Permisos para usuarios autenticados
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION adjust_transit_atomic(UUID, INTEGER, TEXT, UUID)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN (opcional — ejecutar para confirmar)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'products' AND column_name = 'stock_transit';
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_name = 'adjust_transit_atomic' AND routine_schema = 'public';
-- =============================================================================
