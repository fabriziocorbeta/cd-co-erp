-- =====================================================================================
-- CD & Co ERP — SCRIPT DE INICIALIZACIÓN SUPABASE (PostgreSQL + RLS)
-- =====================================================================================
-- Instrucciones:
-- 1. Ve a tu proyecto en Supabase -> "SQL Editor"
-- 2. Pega todo este código y presiona "RUN"
-- 3. Esto desplegará la base estructural y aplicará las políticas de seguridad (RLS).
-- NOTA: Se utiliza `text` para los IDs porque la aplicación cliente genera IDs alfanuméricos (no UUIDs estandarizados).
-- =====================================================================================

-- ══════════════════════════════════════════
-- 1. EXTENSIONES BÁSICAS
-- ══════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════
-- 2. CREACIÓN DE TABLAS
-- ══════════════════════════════════════════

-- TABLA: accounts (Cuentas)
CREATE TABLE IF NOT EXISTS public.accounts (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  type text,
  bank text,
  cur text,
  balance numeric,
  init_balance numeric,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- TABLA: cards (Tarjetas)
CREATE TABLE IF NOT EXISTS public.cards (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  brand text,
  cur text,
  initial_balance numeric,
  closing_date int,
  due_date int,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- TABLA: debts (Deudas)
CREATE TABLE IF NOT EXISTS public.debts (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  "desc" text,
  creditor_id text,
  total numeric,
  paid numeric,
  inst int,
  paid_inst int,
  due_date text,
  cur text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- TABLA: budgets (Presupuestos)
CREATE TABLE IF NOT EXISTS public.budgets (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category text,
  amount numeric,
  cur text,
  month text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- TABLA: subscriptions (Suscripciones)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  icon text,
  "desc" text,
  amount numeric,
  cur text,
  cycle text,
  next_date text,
  active boolean,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- TABLA: products (Inventario / Productos)
CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  sku text,
  category text,
  supplier_id text,
  buy_price numeric,
  sell_price numeric,
  stock int,
  min_stock int,
  "desc" text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- TABLA: txs (Movimientos / Transacciones)
CREATE TABLE IF NOT EXISTS public.txs (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text,
  "desc" text,
  amount numeric,
  cur text,
  cat text,
  date text,
  account_id text,
  _sale_id text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- TABLA: sales (Ventas)
CREATE TABLE IF NOT EXISTS public.sales (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  num int,
  items jsonb,
  total numeric,
  cur text,
  date text,
  client_id text,
  status text,
  notes text,
  method text,
  nro_factura text,
  condicion text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- TABLA: orders (Pedidos)
CREATE TABLE IF NOT EXISTS public.orders (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  num int,
  supplier_id text,
  date text,
  expected_date text,
  items jsonb,
  total numeric,
  status text,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- TABLA: contacts (Contactos)
CREATE TABLE IF NOT EXISTS public.contacts (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  type text,
  phone text,
  email text,
  ruc text,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- TABLA: app_state (Para guardar configuración global como EMPRESA, Modo, etc.)
CREATE TABLE IF NOT EXISTS public.app_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ══════════════════════════════════════════
-- 3. HABILITAR ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.txs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════
-- 4. POLÍTICAS DE SEGURIDAD (CRUD EXCLUSIVO POR USUARIO)
-- ══════════════════════════════════════════

-- Accounts
CREATE POLICY "Users can manage their own accounts." ON public.accounts FOR ALL USING (auth.uid() = user_id);
-- Cards
CREATE POLICY "Users can manage their own cards." ON public.cards FOR ALL USING (auth.uid() = user_id);
-- Debts
CREATE POLICY "Users can manage their own debts." ON public.debts FOR ALL USING (auth.uid() = user_id);
-- Budgets
CREATE POLICY "Users can manage their own budgets." ON public.budgets FOR ALL USING (auth.uid() = user_id);
-- Subscriptions
CREATE POLICY "Users can manage their own subscriptions." ON public.subscriptions FOR ALL USING (auth.uid() = user_id);
-- Products
CREATE POLICY "Users can manage their own products." ON public.products FOR ALL USING (auth.uid() = user_id);
-- Transactions
CREATE POLICY "Users can manage their own txs." ON public.txs FOR ALL USING (auth.uid() = user_id);
-- Sales
CREATE POLICY "Users can manage their own sales." ON public.sales FOR ALL USING (auth.uid() = user_id);
-- Orders
CREATE POLICY "Users can manage their own orders." ON public.orders FOR ALL USING (auth.uid() = user_id);
-- Contacts
CREATE POLICY "Users can manage their own contacts." ON public.contacts FOR ALL USING (auth.uid() = user_id);
-- App State
CREATE POLICY "Users can manage their own app state." ON public.app_state FOR ALL USING (auth.uid() = user_id);

-- FINALIZADO --
