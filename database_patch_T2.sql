-- =============================================================================
-- CD & Co ERP — Patch T-2: Módulo de Préstamos y Amortizaciones
-- =============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Propósito: Crear las tablas prestamos (cabecera) y cuotas_prestamos (detalle
-- mes a mes), con RLS, índices y la función RPC registrar_pago_cuota que
-- atomiza el pago: marca la cuota como pagada y actualiza cuotas_pagadas
-- en la cabecera del préstamo.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA 1: prestamos
-- Cabecera del crédito. Almacena los parámetros del préstamo y su estado.
--
-- id             — text, generado por el script (prefijo 'prs-')
-- creditor_id    — ref. blanda a contacts.id (el prestamista / banco)
-- capital        — monto original del préstamo
-- tasa_mensual   — tasa mensual en decimal (ej. 0.02 = 2%)
-- cuotas_total   — número total de cuotas
-- sistema        — 'frances' (cuota constante) | 'aleman' (amortización constante)
-- fecha_inicio   — YYYY-MM-DD (fecha de vencimiento de la cuota 1)
-- moneda         — '$' (USD) | '₲' (PYG)
-- estado         — activo | cancelado | mora
-- cuotas_pagadas — contador incremental (actualizado por RPC)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prestamos (
  id              text PRIMARY KEY,
  user_id         uuid NOT NULL DEFAULT auth.uid()
                    REFERENCES auth.users(id) ON DELETE CASCADE,

  descripcion     text NOT NULL,
  creditor_id     text,                    -- ref. blanda a contacts.id

  capital         numeric(14,2) NOT NULL,
  tasa_mensual    numeric(10,8) NOT NULL,
  cuotas_total    int NOT NULL,
  sistema         text NOT NULL
                    CONSTRAINT chk_prestamos_sistema
                    CHECK (sistema IN ('frances', 'aleman')),

  fecha_inicio    text NOT NULL,           -- YYYY-MM-DD
  moneda          text NOT NULL DEFAULT '$',

  estado          text NOT NULL DEFAULT 'activo'
                    CONSTRAINT chk_prestamos_estado
                    CHECK (estado IN ('activo', 'cancelado', 'mora')),

  cuotas_pagadas  int NOT NULL DEFAULT 0,
  notas           text,
  created_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA 2: cuotas_prestamos
-- Detalle mes a mes generado por calcularSistemaFrances / calcularSistemaAleman.
-- Un registro por cuota. Se inserta masivamente al crear el préstamo.
--
-- prestamo_id       — ref. blanda a prestamos.id
-- num_cuota         — número de cuota (1-based)
-- fecha_vencimiento — YYYY-MM-DD
-- saldo_inicial     — saldo al inicio del período
-- amortizacion      — capital amortizado en esta cuota
-- intereses         — intereses devengados
-- cuota_total       — amortizacion + intereses
-- saldo_final       — saldo al cierre del período
-- estado            — pendiente | pagada | mora
-- fecha_pago        — YYYY-MM-DD cuando se efectuó el pago
-- tx_id             — ref. blanda a txs.id (el gasto registrado en finanzas)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cuotas_prestamos (
  id                text PRIMARY KEY,
  user_id           uuid NOT NULL DEFAULT auth.uid()
                      REFERENCES auth.users(id) ON DELETE CASCADE,

  prestamo_id       text NOT NULL,
  num_cuota         int NOT NULL,
  fecha_vencimiento text NOT NULL,         -- YYYY-MM-DD

  saldo_inicial     numeric(14,2) NOT NULL,
  amortizacion      numeric(14,2) NOT NULL,
  intereses         numeric(14,2) NOT NULL,
  cuota_total       numeric(14,2) NOT NULL,
  saldo_final       numeric(14,2) NOT NULL,

  estado            text NOT NULL DEFAULT 'pendiente'
                      CONSTRAINT chk_cuotas_estado
                      CHECK (estado IN ('pendiente', 'pagada', 'mora')),

  fecha_pago        text,                  -- YYYY-MM-DD si ya se pagó
  tx_id             text,                  -- ref. blanda a txs.id
  created_at        timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.prestamos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuotas_prestamos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_only" ON public.prestamos
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "owner_only" ON public.cuotas_prestamos
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ÍNDICES
-- ─────────────────────────────────────────────────────────────────────────────

-- prestamos: listar por usuario + estado
CREATE INDEX IF NOT EXISTS idx_prestamos_user_estado
  ON public.prestamos(user_id, estado);

-- cuotas_prestamos: lookup por préstamo (carga completa del plan)
CREATE INDEX IF NOT EXISTS idx_cuotas_prestamo_id
  ON public.cuotas_prestamos(user_id, prestamo_id, num_cuota);

-- cuotas_prestamos: cuotas próximas a vencer (dashboard alertas)
CREATE INDEX IF NOT EXISTS idx_cuotas_vencimiento
  ON public.cuotas_prestamos(user_id, estado, fecha_vencimiento);

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN RPC: registrar_pago_cuota
-- Atomiza en una transacción:
--   1. Marca la cuota como 'pagada', registra fecha_pago y tx_id
--   2. Incrementa cuotas_pagadas en la cabecera del préstamo
--   3. Si cuotas_pagadas = cuotas_total → marca el préstamo como 'cancelado'
-- Retorna JSONB: { ok, cuotas_pagadas, estado_prestamo }
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION registrar_pago_cuota(
  p_cuota_id   text,
  p_prestamo_id text,
  p_fecha_pago text,       -- YYYY-MM-DD
  p_tx_id      text,       -- ref. a txs.id (puede ser NULL)
  p_user_id    uuid
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pagadas       int;
  v_total         int;
  v_estado_nuevo  text;
BEGIN
  -- Bloquear cabecera para evitar doble pago concurrente
  SELECT cuotas_pagadas, cuotas_total
  INTO v_pagadas, v_total
  FROM public.prestamos
  WHERE id = p_prestamo_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'prestamo_not_found');
  END IF;

  -- Verificar que la cuota pertenece al préstamo y está pendiente
  UPDATE public.cuotas_prestamos
  SET estado     = 'pagada',
      fecha_pago = p_fecha_pago,
      tx_id      = p_tx_id
  WHERE id          = p_cuota_id
    AND prestamo_id = p_prestamo_id
    AND user_id     = p_user_id
    AND estado      = 'pendiente';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cuota_not_found_or_already_paid');
  END IF;

  -- Incrementar contador y determinar nuevo estado del préstamo
  v_pagadas := v_pagadas + 1;
  v_estado_nuevo := CASE WHEN v_pagadas >= v_total THEN 'cancelado' ELSE 'activo' END;

  UPDATE public.prestamos
  SET cuotas_pagadas = v_pagadas,
      estado         = v_estado_nuevo
  WHERE id = p_prestamo_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok',              true,
    'cuotas_pagadas',  v_pagadas,
    'estado_prestamo', v_estado_nuevo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_pago_cuota(text, text, text, text, uuid)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN (ejecutar por separado)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('prestamos', 'cuotas_prestamos');
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_name = 'registrar_pago_cuota' AND routine_schema = 'public';
-- =============================================================================
