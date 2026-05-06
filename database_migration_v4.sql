-- =============================================================================
-- CD & Co ERP — MIGRACIÓN COMPLETA v4
-- Ejecutar en orden estricto en: Supabase Dashboard → SQL Editor
--
-- FASES:
--   1. Seguridad: RLS estricto + eliminación de constraints globales
--   2. Flota: vehicles, fuel_logs, maintenance_alerts, fleet_statistics, settle_batches
--   3. Préstamos + Stock en tránsito: prestamos, cuotas_prestamos, products.stock_transit
--   4. RPCs: adjust_transit_atomic, registrar_pago_cuota, get_user_cards_v1
-- =============================================================================


-- =============================================================================
-- FASE 1: SEGURIDAD — RLS ESTRICTO E ISOLAMIENTO POR USUARIO
-- =============================================================================

-- Eliminar constraint global de VIN (bloquea múltiples usuarios con mismo VIN)
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_vin_key;

-- Habilitar RLS en todas las tablas de negocio (idempotente)
ALTER TABLE metas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE txs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets  ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas previas (seguro: no falla si no existen)
DROP POLICY IF EXISTS "own"        ON metas;
DROP POLICY IF EXISTS "own"        ON debts;
DROP POLICY IF EXISTS "own"        ON vehicles;
DROP POLICY IF EXISTS "own"        ON txs;
DROP POLICY IF EXISTS "own"        ON accounts;
DROP POLICY IF EXISTS "own"        ON products;
DROP POLICY IF EXISTS "own"        ON sales;
DROP POLICY IF EXISTS "own"        ON orders;
DROP POLICY IF EXISTS "own"        ON budgets;
DROP POLICY IF EXISTS "users"      ON metas;
DROP POLICY IF EXISTS "users"      ON debts;
DROP POLICY IF EXISTS "users"      ON vehicles;
DROP POLICY IF EXISTS "users"      ON txs;
DROP POLICY IF EXISTS "users"      ON accounts;
DROP POLICY IF EXISTS "users"      ON products;
DROP POLICY IF EXISTS "users"      ON sales;
DROP POLICY IF EXISTS "users"      ON orders;
DROP POLICY IF EXISTS "users"      ON budgets;
DROP POLICY IF EXISTS "owner_only" ON metas;
DROP POLICY IF EXISTS "owner_only" ON debts;
DROP POLICY IF EXISTS "owner_only" ON vehicles;
DROP POLICY IF EXISTS "owner_only" ON txs;
DROP POLICY IF EXISTS "owner_only" ON accounts;
DROP POLICY IF EXISTS "owner_only" ON products;
DROP POLICY IF EXISTS "owner_only" ON sales;
DROP POLICY IF EXISTS "owner_only" ON orders;
DROP POLICY IF EXISTS "owner_only" ON budgets;
DROP POLICY IF EXISTS "vehicles_own" ON vehicles;

-- Crear políticas owner_only estrictas
CREATE POLICY "owner_only" ON metas    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_only" ON debts    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_only" ON vehicles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_only" ON txs      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_only" ON accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_only" ON products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_only" ON sales    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_only" ON orders   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_only" ON budgets  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- =============================================================================
-- FASE 2: ESQUEMA DE FLOTA (Fleet SaaS Enterprise)
-- =============================================================================

-- Tabla: vehicles
CREATE TABLE IF NOT EXISTS vehicles (
  id                              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                         UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  vin                             VARCHAR(17),
  plate                           VARCHAR(20),
  nickname                        VARCHAR(100),
  brand                           VARCHAR(50)  NOT NULL,
  model                           VARCHAR(50)  NOT NULL,
  year                            INTEGER      NOT NULL,
  engine_type                     VARCHAR(20)  NOT NULL,
  displacement                    INTEGER,
  fuel_capacity                   NUMERIC(10,2),
  battery_capacity                NUMERIC(10,2),
  electric_only                   BOOLEAN      DEFAULT FALSE,
  expected_km_per_liter           NUMERIC(10,2),
  expected_km_per_kwh             NUMERIC(10,2),
  expected_km_per_liter_electric  NUMERIC(10,2),
  last_maintenance_date           DATE,
  maintenance_interval_km         INTEGER      DEFAULT 10000,
  next_maintenance_km             INTEGER,
  is_active                       BOOLEAN      DEFAULT TRUE,
  notes                           TEXT,
  created_at                      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ  DEFAULT NOW(),
  CONSTRAINT valid_engine_type CHECK (engine_type IN ('Flex', 'Nafta', 'Diésel', 'Híbrido', 'Eléctrico'))
);

CREATE INDEX IF NOT EXISTS idx_vehicles_user_id  ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate    ON vehicles(plate);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_active ON vehicles(is_active);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_only" ON vehicles;
CREATE POLICY "owner_only" ON vehicles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tabla: fuel_logs (multi-combustible + eléctrico)
CREATE TABLE IF NOT EXISTS fuel_logs (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID         REFERENCES profiles(id)  ON DELETE CASCADE NOT NULL,
  vehicle_id       UUID         REFERENCES vehicles(id)  ON DELETE CASCADE NOT NULL,
  date             DATE         NOT NULL,
  odometer_reading INTEGER      NOT NULL,
  liters           NUMERIC(10,2),
  fuel_type        VARCHAR(20),
  kwh              NUMERIC(10,2),
  total_cost       NUMERIC(12,2) NOT NULL,
  cost_per_unit    NUMERIC(10,2),
  location         VARCHAR(100),
  is_settled       BOOLEAN      DEFAULT FALSE,
  settled_by_transaction_id UUID,
  notes            TEXT,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_logs_user_id    ON fuel_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_vehicle_id ON fuel_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_date       ON fuel_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_is_settled ON fuel_logs(is_settled);

ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_only" ON fuel_logs;
CREATE POLICY "owner_only" ON fuel_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tabla: maintenance_alerts
CREATE TABLE IF NOT EXISTS maintenance_alerts (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        REFERENCES profiles(id)  ON DELETE CASCADE NOT NULL,
  vehicle_id       UUID        REFERENCES vehicles(id)  ON DELETE CASCADE NOT NULL,
  alert_type       VARCHAR(50) NOT NULL,
  severity         VARCHAR(20) NOT NULL DEFAULT 'medium',
  message          TEXT        NOT NULL,
  triggered_at_km  INTEGER,
  triggered_at_date DATE,
  is_acknowledged  BOOLEAN     DEFAULT FALSE,
  acknowledged_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_id        ON maintenance_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_vehicle_id     ON maintenance_alerts(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_alerts_is_acknowledged ON maintenance_alerts(is_acknowledged);

ALTER TABLE maintenance_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_only" ON maintenance_alerts;
CREATE POLICY "owner_only" ON maintenance_alerts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tabla: fleet_statistics (caché analítico)
CREATE TABLE IF NOT EXISTS fleet_statistics (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        REFERENCES profiles(id)  ON DELETE CASCADE NOT NULL,
  vehicle_id            UUID        REFERENCES vehicles(id)  ON DELETE CASCADE NOT NULL,
  period_start          DATE        NOT NULL,
  period_end            DATE        NOT NULL,
  total_km              NUMERIC(10,2) DEFAULT 0,
  total_fuel_cost       NUMERIC(12,2) DEFAULT 0,
  total_liters          NUMERIC(10,2) DEFAULT 0,
  total_kwh             NUMERIC(10,2) DEFAULT 0,
  avg_km_per_liter      NUMERIC(10,2),
  avg_km_per_kwh        NUMERIC(10,2),
  avg_cost_per_km       NUMERIC(10,4),
  fuel_log_count        INTEGER       DEFAULT 0,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fleet_stats_unique UNIQUE (user_id, vehicle_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_fleet_stats_user_vehicle ON fleet_statistics(user_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_stats_period       ON fleet_statistics(period_start, period_end);

ALTER TABLE fleet_statistics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_only" ON fleet_statistics;
CREATE POLICY "owner_only" ON fleet_statistics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tabla: settle_batches (liquidación masiva de gastos de flota)
CREATE TABLE IF NOT EXISTS settle_batches (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  batch_date    DATE        NOT NULL,
  vehicle_ids   UUID[]      NOT NULL DEFAULT '{}',
  total_amount  NUMERIC(12,2) DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  tx_id         UUID,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_batch_status CHECK (status IN ('pending', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_settle_batches_user_id ON settle_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_settle_batches_status  ON settle_batches(status);
CREATE INDEX IF NOT EXISTS idx_settle_batches_date    ON settle_batches(batch_date DESC);

ALTER TABLE settle_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_only" ON settle_batches;
CREATE POLICY "owner_only" ON settle_batches FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- =============================================================================
-- FASE 3: PRÉSTAMOS Y STOCK EN TRÁNSITO
-- =============================================================================

-- Stock en tránsito en tabla products
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_transit INT NOT NULL DEFAULT 0;

-- Tabla: prestamos (cabecera)
CREATE TABLE IF NOT EXISTS prestamos (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  descripcion     TEXT,
  capital         NUMERIC(14,2) NOT NULL,
  tasa_mensual    NUMERIC(6,4)  NOT NULL,
  cuotas_total    INTEGER       NOT NULL,
  sistema         VARCHAR(20)   NOT NULL,
  fecha_inicio    DATE          NOT NULL,
  estado          VARCHAR(20)   NOT NULL DEFAULT 'activo',
  cuotas_pagadas  INTEGER       NOT NULL DEFAULT 0,
  acreedor        TEXT,
  moneda          VARCHAR(5)    NOT NULL DEFAULT '$',
  notas           TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW(),
  CONSTRAINT valid_sistema CHECK (sistema IN ('frances', 'aleman')),
  CONSTRAINT valid_estado_prestamo CHECK (estado IN ('activo', 'cancelado', 'mora'))
);

CREATE INDEX IF NOT EXISTS idx_prestamos_user_id ON prestamos(user_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_estado  ON prestamos(user_id, estado);

ALTER TABLE prestamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_only" ON prestamos;
CREATE POLICY "owner_only" ON prestamos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tabla: cuotas_prestamos (detalle mensual)
CREATE TABLE IF NOT EXISTS cuotas_prestamos (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        REFERENCES profiles(id)  ON DELETE CASCADE NOT NULL,
  prestamo_id       UUID        REFERENCES prestamos(id) ON DELETE CASCADE NOT NULL,
  num_cuota         INTEGER     NOT NULL,
  fecha_vencimiento DATE        NOT NULL,
  saldo_inicial     NUMERIC(14,2) NOT NULL,
  amortizacion      NUMERIC(14,2) NOT NULL,
  intereses         NUMERIC(14,2) NOT NULL,
  cuota_total       NUMERIC(14,2) NOT NULL,
  saldo_final       NUMERIC(14,2) NOT NULL,
  estado            VARCHAR(20)   NOT NULL DEFAULT 'pendiente',
  fecha_pago        DATE,
  tx_id             UUID,
  created_at        TIMESTAMPTZ   DEFAULT NOW(),
  CONSTRAINT valid_estado_cuota CHECK (estado IN ('pendiente', 'pagada', 'mora')),
  CONSTRAINT cuota_unique UNIQUE (prestamo_id, num_cuota)
);

CREATE INDEX IF NOT EXISTS idx_cuotas_user_id     ON cuotas_prestamos(user_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_prestamo_id ON cuotas_prestamos(prestamo_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_num         ON cuotas_prestamos(prestamo_id, num_cuota);
CREATE INDEX IF NOT EXISTS idx_cuotas_estado      ON cuotas_prestamos(user_id, estado);

ALTER TABLE cuotas_prestamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_only" ON cuotas_prestamos;
CREATE POLICY "owner_only" ON cuotas_prestamos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- =============================================================================
-- FASE 4: FUNCIONES RPC (PL/pgSQL)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 1: adjust_transit_atomic
-- Modifica stock_transit con bloqueo pesimista (FOR UPDATE).
-- Tipos: 'in' (agrega), 'out' (resta), 'set' (establece exacto).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION adjust_transit_atomic(
  p_product_id UUID,
  p_qty        INTEGER,
  p_type       TEXT,
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product  products%ROWTYPE;
  v_new_qty  INTEGER;
BEGIN
  -- Bloqueo pesimista: ningún otro proceso puede modificar esta fila hasta COMMIT
  SELECT * INTO v_product
  FROM products
  WHERE id = p_product_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;

  IF p_type = 'in' THEN
    v_new_qty := v_product.stock_transit + p_qty;
  ELSIF p_type = 'out' THEN
    v_new_qty := v_product.stock_transit - p_qty;
    IF v_new_qty < 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_stock', 'current', v_product.stock_transit);
    END IF;
  ELSIF p_type = 'set' THEN
    v_new_qty := p_qty;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_type');
  END IF;

  UPDATE products
  SET stock_transit = v_new_qty,
      updated_at    = NOW()
  WHERE id = p_product_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok',            true,
    'product_id',    p_product_id,
    'type',          p_type,
    'prev_qty',      v_product.stock_transit,
    'new_qty',       v_new_qty
  );
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_transit_atomic(UUID, INTEGER, TEXT, UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 2: registrar_pago_cuota
-- Pago atómico de cuota: marca cuota pagada + actualiza cabecera + detecta cancelación.
-- Bloqueo en prestamo para prevenir pagos duplicados concurrentes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION registrar_pago_cuota(
  p_cuota_id    UUID,
  p_prestamo_id UUID,
  p_fecha_pago  DATE,
  p_tx_id       UUID,
  p_user_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prestamo   prestamos%ROWTYPE;
  v_cuota      cuotas_prestamos%ROWTYPE;
  v_nuevo_pagadas INTEGER;
  v_nuevo_estado  TEXT;
BEGIN
  -- Bloqueo en cabecera primero (previene race conditions en cuotas_pagadas)
  SELECT * INTO v_prestamo
  FROM prestamos
  WHERE id = p_prestamo_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'prestamo_not_found');
  END IF;

  -- Verificar cuota
  SELECT * INTO v_cuota
  FROM cuotas_prestamos
  WHERE id = p_cuota_id AND prestamo_id = p_prestamo_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cuota_not_found');
  END IF;

  IF v_cuota.estado = 'pagada' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cuota_already_paid');
  END IF;

  -- Marcar cuota como pagada
  UPDATE cuotas_prestamos
  SET estado      = 'pagada',
      fecha_pago  = p_fecha_pago,
      tx_id       = p_tx_id
  WHERE id = p_cuota_id;

  -- Actualizar cabecera
  v_nuevo_pagadas := v_prestamo.cuotas_pagadas + 1;
  v_nuevo_estado  := CASE
    WHEN v_nuevo_pagadas >= v_prestamo.cuotas_total THEN 'cancelado'
    ELSE v_prestamo.estado
  END;

  UPDATE prestamos
  SET cuotas_pagadas = v_nuevo_pagadas,
      estado         = v_nuevo_estado,
      updated_at     = NOW()
  WHERE id = p_prestamo_id;

  RETURN jsonb_build_object(
    'ok',            true,
    'cuota_id',      p_cuota_id,
    'num_cuota',     v_cuota.num_cuota,
    'cuotas_pagadas', v_nuevo_pagadas,
    'cuotas_total',  v_prestamo.cuotas_total,
    'estado_prestamo', v_nuevo_estado
  );
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_pago_cuota(UUID, UUID, DATE, UUID, UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 3: get_user_cards_v1
-- Lista tarjetas del usuario con used_amount calculado en SQL.
-- used_amount = SUM(txs expense contra esa cuenta) - SUM(pagos de tarjeta)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_cards_v1(p_user_id UUID)
RETURNS TABLE (
  id              TEXT,
  name            TEXT,
  brand           TEXT,
  cur             TEXT,
  initial_balance NUMERIC,
  closing_date    INT,
  due_date        INT,
  notes           TEXT,
  used_amount     NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id::TEXT,
    c.name,
    c.brand,
    c.cur,
    c.initial_balance,
    c.closing_date,
    c.due_date,
    c.notes,
    COALESCE(
      (SELECT SUM(ABS(t.amount))
       FROM txs t
       WHERE t.account_id = c.id::TEXT
         AND t.user_id    = p_user_id
         AND t.type       = 'expense'),
      0
    ) -
    COALESCE(
      (SELECT SUM(ABS(t.amount))
       FROM txs t
       WHERE t.account_id = c.id::TEXT
         AND t.user_id    = p_user_id
         AND t.type       = 'income'
         AND t.cat        = 'Pago Tarjeta'),
      0
    ) AS used_amount
  FROM cards c
  WHERE c.user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_cards_v1(UUID) TO authenticated;


-- =============================================================================
-- VERIFICACIÓN (ejecutar por separado)
-- =============================================================================
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('metas','debts','vehicles','txs','accounts','products',
--                     'sales','orders','budgets','fuel_logs','fleet_statistics',
--                     'maintenance_alerts','settle_batches','prestamos','cuotas_prestamos');
--
-- SELECT proname FROM pg_proc
-- WHERE proname IN ('adjust_transit_atomic','registrar_pago_cuota','get_user_cards_v1');
-- =============================================================================
