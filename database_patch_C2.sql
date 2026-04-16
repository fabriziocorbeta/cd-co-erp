-- =============================================================================
-- CD & Co ERP — Patch C-2: Server-Side Aggregation + Performance Indexes
-- =============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Propósito:
--   1. dashboard_stats() — suma ingresos/gastos/patrimonio EN el servidor,
--      evitando transmitir 50K filas al celular para calcularlas localmente.
--   2. Índices críticos para queries frecuentes de txs (user_id + date/cat/account).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN: dashboard_stats
-- Calcula KPIs del dashboard en el servidor y retorna un único JSONB.
-- Parámetros:
--   p_user_id   — UUID del usuario (filtro principal RLS-aware)
--   p_fx_rate   — Tipo de cambio PYG/USD del cliente (default 7500)
--                 El cliente pasa FX.sell en tiempo real para conversión exacta.
-- Retorna JSONB con:
--   patrimonio_neto      — saldo total de cuentas en ₲ (USD × fx_rate)
--   month_income         — ingresos del mes actual en ₲
--   month_expense        — gastos del mes actual en ₲
--   prev_month_income    — ingresos del mes anterior en ₲
--   prev_month_expense   — gastos del mes anterior en ₲
--   computed_at          — timestamp del cálculo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dashboard_stats(
  p_user_id UUID,
  p_fx_rate  NUMERIC DEFAULT 7500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_patrimonio   NUMERIC := 0;
  v_month_inc    NUMERIC := 0;
  v_month_exp    NUMERIC := 0;
  v_prev_inc     NUMERIC := 0;
  v_prev_exp     NUMERIC := 0;
  v_curr_month   TEXT;
  v_prev_month   TEXT;
BEGIN
  -- Ventanas de tiempo: mes actual y mes anterior (formato YYYY-MM)
  v_curr_month := to_char(CURRENT_DATE, 'YYYY-MM');
  v_prev_month := to_char(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM');

  -- ── Patrimonio Neto: saldo de cuentas bancarias/caja ────────────────────
  -- `balance` es la fuente de verdad mantenida por el cliente en cada operación.
  -- USD × p_fx_rate para unificar en PYG.
  SELECT COALESCE(SUM(
    CASE
      WHEN cur = '$' OR cur = 'USD' THEN balance * p_fx_rate
      ELSE balance
    END
  ), 0)
  INTO v_patrimonio
  FROM accounts
  WHERE user_id = p_user_id;

  -- ── Ingresos del mes actual ──────────────────────────────────────────────
  -- Excluir ajustes de saldo (contienen 'ajuste' en desc) para no distorsionar.
  SELECT COALESCE(SUM(
    CASE
      WHEN cur = '$' OR cur = 'USD' THEN ABS(amount) * p_fx_rate
      ELSE ABS(amount)
    END
  ), 0)
  INTO v_month_inc
  FROM txs
  WHERE user_id = p_user_id
    AND type    = 'income'
    AND to_char(date, 'YYYY-MM') = v_curr_month
    AND (desc IS NULL OR desc NOT ILIKE '%ajuste%');

  -- ── Gastos del mes actual ────────────────────────────────────────────────
  SELECT COALESCE(SUM(
    CASE
      WHEN cur = '$' OR cur = 'USD' THEN ABS(amount) * p_fx_rate
      ELSE ABS(amount)
    END
  ), 0)
  INTO v_month_exp
  FROM txs
  WHERE user_id = p_user_id
    AND type    = 'expense'
    AND to_char(date, 'YYYY-MM') = v_curr_month
    AND (desc IS NULL OR desc NOT ILIKE '%ajuste%');

  -- ── Ingresos del mes anterior (para variación %) ─────────────────────────
  SELECT COALESCE(SUM(
    CASE
      WHEN cur = '$' OR cur = 'USD' THEN ABS(amount) * p_fx_rate
      ELSE ABS(amount)
    END
  ), 0)
  INTO v_prev_inc
  FROM txs
  WHERE user_id = p_user_id
    AND type    = 'income'
    AND to_char(date, 'YYYY-MM') = v_prev_month
    AND (desc IS NULL OR desc NOT ILIKE '%ajuste%');

  -- ── Gastos del mes anterior ──────────────────────────────────────────────
  SELECT COALESCE(SUM(
    CASE
      WHEN cur = '$' OR cur = 'USD' THEN ABS(amount) * p_fx_rate
      ELSE ABS(amount)
    END
  ), 0)
  INTO v_prev_exp
  FROM txs
  WHERE user_id = p_user_id
    AND type    = 'expense'
    AND to_char(date, 'YYYY-MM') = v_prev_month
    AND (desc IS NULL OR desc NOT ILIKE '%ajuste%');

  RETURN jsonb_build_object(
    'patrimonio_neto',   v_patrimonio,
    'month_income',      v_month_inc,
    'month_expense',     v_month_exp,
    'prev_month_income', v_prev_inc,
    'prev_month_expense',v_prev_exp,
    'computed_at',       NOW()
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PERMISOS
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION dashboard_stats(UUID, NUMERIC) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÍNDICES CRÍTICOS — resuelven los table scans de las queries más frecuentes
--
-- Antes de los índices: cada query de txs hace sequential scan sobre TODOS los
-- registros del usuario. Con 50K txs = 50K filas leídas por query.
-- Después: index scan sobre las filas exactas del usuario × filtro.
-- ─────────────────────────────────────────────────────────────────────────────

-- idx 1: Queries por fecha (dashboard, charts, filtros de período)
--        Orden DESC para que las queries "ORDER BY date DESC" usen el índice directamente.
CREATE INDEX IF NOT EXISTS idx_txs_user_date
  ON txs(user_id, date DESC);

-- idx 2: Queries por categoría (donut de gastos, filtro de categoría en movimientos)
CREATE INDEX IF NOT EXISTS idx_txs_user_cat
  ON txs(user_id, cat);

-- idx 3: Queries por cuenta (recomputeBalances, filtros de cuenta en movimientos)
CREATE INDEX IF NOT EXISTS idx_txs_user_account
  ON txs(user_id, account_id);

-- idx 4 (bonus): Queries por tipo (income vs expense — dashboard_stats, filtros)
CREATE INDEX IF NOT EXISTS idx_txs_user_type
  ON txs(user_id, type);

-- idx 5 (bonus): accounts por user — lookup rápido para patrimonio
CREATE INDEX IF NOT EXISTS idx_accounts_user
  ON accounts(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN: ejecutar para confirmar índices y función
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT indexname, tablename FROM pg_indexes
-- WHERE tablename IN ('txs','accounts') AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_name = 'dashboard_stats' AND routine_schema = 'public';
--
-- -- Test rápido (reemplazar UUID real):
-- SELECT dashboard_stats('TU-USER-UUID-AQUI', 7500);
