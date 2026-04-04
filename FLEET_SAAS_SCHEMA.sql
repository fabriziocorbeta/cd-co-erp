-- ════════════════════════════════════════════════════════════════════════════════
-- FLEET MANAGEMENT SAAS — DATABASE SCHEMA
-- ════════════════════════════════════════════════════════════════════════════════
-- Para gestión profesional de flotas mixtas (combustibles + eléctricos)
-- Implementado para CD & Co Finanzas SaaS

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. TABLA: VEHICLES (Especificaciones de vehículos)
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Información básica
  vin VARCHAR(17) UNIQUE NOT NULL,  -- Vehicle Identification Number
  plate VARCHAR(20) UNIQUE,          -- Patente/Matrícula
  nickname VARCHAR(100),             -- Apodo para UI (ej: "Hilux Carlos")
  brand VARCHAR(50) NOT NULL,        -- Marca (Toyota, Ford, Tesla, etc)
  model VARCHAR(50) NOT NULL,        -- Modelo
  year INTEGER NOT NULL,             -- Año fabricación

  -- Motor y combustible
  engine_type VARCHAR(20) NOT NULL,  -- Flex, Nafta, Diésel, Híbrido, Eléctrico
  displacement INTEGER,              -- CC (ej: 1600, 2000, etc) - NULL para eléctricos
  fuel_capacity NUMERIC(10,2),       -- Capacidad tanque en litros (NULL para eléctricos)
  battery_capacity NUMERIC(10,2),    -- kWh para híbridos/eléctricos
  electric_only BOOLEAN DEFAULT FALSE, -- Solo para eléctricos puros

  -- Especificaciones de eficiencia esperada
  expected_km_per_liter NUMERIC(10,2),  -- km/L esperado para fuel
  expected_km_per_kwh NUMERIC(10,2),    -- km/kWh esperado para eléctrico
  expected_km_per_liter_electric NUMERIC(10,2), -- km/L gasolina equiv. para híbridos

  -- Mantenimiento
  last_maintenance_date DATE,
  maintenance_interval_km INTEGER DEFAULT 10000,
  next_maintenance_km INTEGER,

  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_engine_type CHECK (engine_type IN ('Flex', 'Nafta', 'Diésel', 'Híbrido', 'Eléctrico')),
  CONSTRAINT valid_capacity CHECK (fuel_capacity > 0 OR battery_capacity > 0)
);

CREATE INDEX idx_vehicles_user_id ON vehicles(user_id);
CREATE INDEX idx_vehicles_plate ON vehicles(plate);
CREATE INDEX idx_vehicles_vin ON vehicles(vin);
CREATE INDEX idx_vehicles_is_active ON vehicles(is_active);

-- RLS para vehicles
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles_own" ON vehicles FOR ALL USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. TABLA ACTUALIZADA: FUEL_LOGS (Con soporte multi-fuel + eléctrico)
-- ════════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS fuel_logs CASCADE;

CREATE TABLE fuel_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,

  -- Datos de carga
  date DATE NOT NULL,
  odometer_reading INTEGER NOT NULL,  -- km acumulados en el vehículo

  -- Combustible (para vehículos a combustión / híbridos)
  liters NUMERIC(10,2),               -- NULL si es solo eléctrico
  fuel_type VARCHAR(20),              -- Nafta, Diésel, Flex (si aplica)

  -- Eléctrico (para híbridos / eléctricos)
  kwh NUMERIC(10,2),                  -- NULL si es solo combustible

  -- Costo
  total_cost INTEGER NOT NULL,        -- En guaraníes
  cost_per_unit NUMERIC(10,2),        -- ₲/L o ₲/kWh

  -- Ubicación y driver
  location VARCHAR(100),
  driver_id UUID,                     -- Para flotas con múltiples conductores

  -- Estado
  is_settled BOOLEAN DEFAULT FALSE,
  settled_at TIMESTAMPTZ,
  settled_by_transaction_id UUID,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_fuel CHECK (liters > 0 OR kwh > 0),
  CONSTRAINT valid_cost CHECK (total_cost > 0)
);

CREATE INDEX idx_fuel_logs_user_id ON fuel_logs(user_id);
CREATE INDEX idx_fuel_logs_vehicle_id ON fuel_logs(vehicle_id);
CREATE INDEX idx_fuel_logs_date ON fuel_logs(date DESC);
CREATE INDEX idx_fuel_logs_is_settled ON fuel_logs(is_settled);
CREATE INDEX idx_fuel_logs_odometer ON fuel_logs(odometer_reading);

-- RLS
ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fuel_logs_own" ON fuel_logs FOR ALL USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. TABLA: MAINTENANCE_ALERTS (Alertas de consumo anómalo)
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE maintenance_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,
  fuel_log_id UUID REFERENCES fuel_logs(id) ON DELETE SET NULL,

  -- Tipo de alerta
  alert_type VARCHAR(50) NOT NULL,  -- consumption_deviation, low_battery, maintenance_due
  severity VARCHAR(20) NOT NULL,    -- info, warning, critical

  -- Detalles
  message TEXT NOT NULL,
  metric_name VARCHAR(50),          -- ej: km/L, km/kWh
  expected_value NUMERIC(10,2),
  actual_value NUMERIC(10,2),
  deviation_percent NUMERIC(10,2),

  -- Seguimiento
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_severity CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT valid_alert_type CHECK (alert_type IN ('consumption_deviation', 'low_battery', 'maintenance_due', 'efficiency_improvement'))
);

CREATE INDEX idx_alerts_user_id ON maintenance_alerts(user_id);
CREATE INDEX idx_alerts_vehicle_id ON maintenance_alerts(vehicle_id);
CREATE INDEX idx_alerts_is_acknowledged ON maintenance_alerts(is_acknowledged);

-- RLS
ALTER TABLE maintenance_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_own" ON maintenance_alerts FOR ALL USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 4. TABLA: FLEET_STATISTICS (Cache de estadísticas para performance)
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE fleet_statistics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,

  -- Período
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Estadísticas combustible
  total_liters NUMERIC(10,2) DEFAULT 0,
  total_kwh NUMERIC(10,2) DEFAULT 0,
  total_cost INTEGER DEFAULT 0,

  -- Eficiencia
  avg_km_per_liter NUMERIC(10,2),
  avg_km_per_kwh NUMERIC(10,2),
  total_km INTEGER,

  -- Análisis
  std_dev_fuel NUMERIC(10,2),           -- Desvío estándar consumo fuel
  std_dev_electric NUMERIC(10,2),       -- Desvío estándar consumo eléctrico
  efficiency_trend VARCHAR(20),         -- improving, stable, declining

  -- Previsión
  forecasted_monthly_cost INTEGER,
  confidence_level VARCHAR(20),         -- low, medium, high

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, vehicle_id, period_start, period_end)
);

CREATE INDEX idx_fleet_stats_user_vehicle ON fleet_statistics(user_id, vehicle_id);
CREATE INDEX idx_fleet_stats_period ON fleet_statistics(period_start, period_end);

-- RLS
ALTER TABLE fleet_statistics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_stats_own" ON fleet_statistics FOR ALL USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 5. TABLA: SETTLE_BATCHES (Para liquidación masiva)
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE settle_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Batch info
  batch_date DATE NOT NULL,
  fuel_log_ids UUID[] NOT NULL,       -- Array de IDs a liquidar

  -- Resultados
  total_logs_processed INTEGER,
  total_cost INTEGER,
  transactions_created INTEGER DEFAULT 0,

  -- Estado
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  error_message TEXT,

  -- Timeline
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX idx_settle_batches_user_id ON settle_batches(user_id);
CREATE INDEX idx_settle_batches_status ON settle_batches(status);
CREATE INDEX idx_settle_batches_date ON settle_batches(batch_date DESC);

-- RLS
ALTER TABLE settle_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settle_batches_own" ON settle_batches FOR ALL USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- INSERTS DE EJEMPLO (para testing)
-- ════════════════════════════════════════════════════════════════════════════════

-- Insertar vehículos de ejemplo
INSERT INTO vehicles (user_id, vin, plate, nickname, brand, model, year, engine_type, displacement, fuel_capacity, expected_km_per_liter) VALUES
  (
    (SELECT id FROM profiles LIMIT 1),
    'WVWZZZ3CZ0E123456',
    'ABC-1234',
    'Hilux Logística',
    'Toyota',
    'Hilux',
    2020,
    'Diésel',
    2800,
    80,
    8.5
  ),
  (
    (SELECT id FROM profiles LIMIT 1),
    'JTEBU5C10D5123456',
    'DEF-5678',
    'Tesla Delivery',
    'Tesla',
    'Model 3',
    2023,
    'Eléctrico',
    NULL,
    75,
    0.25  -- km/kWh equivalente
  ),
  (
    (SELECT id FROM profiles LIMIT 1),
    'WBADT43452G297186',
    'GHI-9012',
    'BMW Híbrido',
    'BMW',
    'X5 Plug-in',
    2022,
    'Híbrido',
    3000,
    65,
    10.2
  )
ON CONFLICT (vin) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════════
-- MIGRACIONES (Para scripts de actualización)
-- ════════════════════════════════════════════════════════════════════════════════

-- Si migrando desde la v1 anterior, ejecutar:
/*
ALTER TABLE fuel_logs ADD COLUMN vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE;
ALTER TABLE fuel_logs ADD COLUMN kwh NUMERIC(10,2);
ALTER TABLE fuel_logs ADD COLUMN fuel_type VARCHAR(20);
ALTER TABLE fuel_logs ADD COLUMN driver_id UUID;
ALTER TABLE fuel_logs ADD COLUMN cost_per_unit NUMERIC(10,2);
ALTER TABLE fuel_logs ADD COLUMN settled_by_transaction_id UUID;
ALTER TABLE fuel_logs DROP COLUMN location;
ALTER TABLE fuel_logs ADD COLUMN location VARCHAR(100);

-- Actualizar registros existentes
UPDATE fuel_logs SET vehicle_id = (SELECT id FROM vehicles LIMIT 1)
WHERE vehicle_id IS NULL;

-- Hacer NOT NULL después de migración
ALTER TABLE fuel_logs ALTER COLUMN vehicle_id SET NOT NULL;
*/

-- ════════════════════════════════════════════════════════════════════════════════
-- FIN SCHEMA
-- ════════════════════════════════════════════════════════════════════════════════
