-- =============================================================================
-- CD & Co ERP — HOTFIX EMERGENCIA: RLS Isolation + VIN Constraint
-- =============================================================================
-- Ejecutar EN ORDEN COMPLETO en: Supabase Dashboard → SQL Editor
-- Propósito:
--   1. Eliminar constraint global de VIN que bloquea múltiples usuarios
--   2. Activar Row Level Security en todas las tablas de negocio
--   3. Crear política de aislamiento total por user_id en cada tabla
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1: Fix Flota — eliminar restricción única global del VIN
-- El VIN era UNIQUE a nivel global, bloqueando a un segundo usuario
-- al guardar un vehículo con el mismo VIN que ya existe en otra cuenta.
-- Con RLS activo, el aislamiento por user_id ya garantiza unicidad por cuenta.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_vin_key;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2: Activar RLS en todas las tablas de negocio
-- IF RLS ya estaba activo, este comando es idempotente (no falla).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE metas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE txs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets  ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3: Eliminar políticas previas para evitar conflictos
-- Algunas tablas pueden tener una política genérica "own" o "users"
-- heredada del setup inicial. La eliminamos antes de recrearla correctamente.
-- DROP POLICY IF EXISTS es seguro — no falla si la política no existe.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own"  ON metas;
DROP POLICY IF EXISTS "own"  ON debts;
DROP POLICY IF EXISTS "own"  ON vehicles;
DROP POLICY IF EXISTS "own"  ON txs;
DROP POLICY IF EXISTS "own"  ON accounts;
DROP POLICY IF EXISTS "own"  ON products;
DROP POLICY IF EXISTS "own"  ON sales;
DROP POLICY IF EXISTS "own"  ON orders;
DROP POLICY IF EXISTS "own"  ON budgets;
DROP POLICY IF EXISTS "users" ON metas;
DROP POLICY IF EXISTS "users" ON debts;
DROP POLICY IF EXISTS "users" ON vehicles;
DROP POLICY IF EXISTS "users" ON txs;
DROP POLICY IF EXISTS "users" ON accounts;
DROP POLICY IF EXISTS "users" ON products;
DROP POLICY IF EXISTS "users" ON sales;
DROP POLICY IF EXISTS "users" ON orders;
DROP POLICY IF EXISTS "users" ON budgets;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 4: Crear políticas de aislamiento estricto por user_id
-- Cada usuario autenticado SOLO puede ver y modificar sus propias filas.
-- USING   → filtra SELECT, UPDATE, DELETE (visibilidad)
-- WITH CHECK → filtra INSERT, UPDATE (escritura — previene insertar con otro user_id)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "owner_only" ON metas
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_only" ON debts
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_only" ON vehicles
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_only" ON txs
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_only" ON accounts
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_only" ON products
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_only" ON sales
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_only" ON orders
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_only" ON budgets
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN (ejecutar por separado para confirmar)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('metas','debts','vehicles','txs','accounts','products','sales','orders','budgets');
--
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('metas','debts','vehicles','txs','accounts','products','sales','orders','budgets');
--
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'vehicles'::regclass AND contype = 'u';
-- =============================================================================
