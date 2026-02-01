-- =============================================
-- SATIŞ PRO - SUPABASE DATABASE SCHEMA
-- RLS Düzeltilmiş Versiyon (Anon erişimi açık)
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

-- Satış Ekibi
CREATE TABLE IF NOT EXISTS sales_team (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    title VARCHAR(100),
    region VARCHAR(100),
    avatar VARCHAR(10) DEFAULT '👤',
    start_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Müşteriler
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    sector VARCHAR(100),
    size VARCHAR(50),
    status VARCHAR(20) DEFAULT 'Potansiyel',
    assigned_to UUID REFERENCES sales_team(id) ON DELETE SET NULL,
    total_sales DECIMAL(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fırsatlar
CREATE TABLE IF NOT EXISTS opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES sales_team(id) ON DELETE SET NULL,
    value DECIMAL(15,2) DEFAULT 0,
    probability INTEGER DEFAULT 50,
    stage VARCHAR(50) DEFAULT 'Keşif',
    expected_close DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tahsilat
CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    sales_person_id UUID REFERENCES sales_team(id) ON DELETE SET NULL,
    amount DECIMAL(15,2) NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    method VARCHAR(50) DEFAULT 'Havale',
    invoice_no VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Hedefler
CREATE TABLE IF NOT EXISTS targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sales_person_id UUID REFERENCES sales_team(id) ON DELETE CASCADE,
    period VARCHAR(20) NOT NULL,
    sales_target DECIMAL(15,2) DEFAULT 0,
    collection_target DECIMAL(15,2) DEFAULT 0,
    unit_target INTEGER DEFAULT 0,
    new_customer_target INTEGER DEFAULT 0,
    achieved_sales DECIMAL(15,2) DEFAULT 0,
    achieved_collection DECIMAL(15,2) DEFAULT 0,
    achieved_units INTEGER DEFAULT 0,
    achieved_new_customers INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prim Kuralları - Satış Kademeleri
CREATE TABLE IF NOT EXISTS bonus_tiers_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    min_rate INTEGER NOT NULL,
    max_rate INTEGER NOT NULL,
    bonus_rate DECIMAL(5,2) NOT NULL,
    description VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prim Kuralları - Tahsilat Kademeleri
CREATE TABLE IF NOT EXISTS bonus_tiers_collection (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    min_rate INTEGER NOT NULL,
    max_rate INTEGER NOT NULL,
    bonus_rate DECIMAL(5,2) NOT NULL,
    description VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sabit Primler
CREATE TABLE IF NOT EXISTS fixed_bonuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bonus_key VARCHAR(50) NOT NULL,
    bonus_name VARCHAR(100),
    amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Aktiviteler
CREATE TABLE IF NOT EXISTS crm_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES sales_team(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Görevler
CREATE TABLE IF NOT EXISTS crm_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES sales_team(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    due_date DATE,
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Notlar
CREATE TABLE IF NOT EXISTS crm_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES sales_team(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SWOT Analizleri
CREATE TABLE IF NOT EXISTS swot_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sales_person_id UUID REFERENCES sales_team(id) ON DELETE CASCADE,
    category VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY - ANON ERİŞİMİ AÇIK
-- =============================================

-- RLS'yi etkinleştir
ALTER TABLE sales_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_tiers_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_tiers_collection ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE swot_analyses ENABLE ROW LEVEL SECURITY;

-- Mevcut policy'leri temizle
DROP POLICY IF EXISTS "Allow all access" ON sales_team;
DROP POLICY IF EXISTS "Allow all access" ON customers;
DROP POLICY IF EXISTS "Allow all access" ON opportunities;
DROP POLICY IF EXISTS "Allow all access" ON collections;
DROP POLICY IF EXISTS "Allow all access" ON targets;
DROP POLICY IF EXISTS "Allow all access" ON bonus_tiers_sales;
DROP POLICY IF EXISTS "Allow all access" ON bonus_tiers_collection;
DROP POLICY IF EXISTS "Allow all access" ON fixed_bonuses;
DROP POLICY IF EXISTS "Allow all access" ON crm_activities;
DROP POLICY IF EXISTS "Allow all access" ON crm_tasks;
DROP POLICY IF EXISTS "Allow all access" ON crm_notes;
DROP POLICY IF EXISTS "Allow all access" ON swot_analyses;

DROP POLICY IF EXISTS "Allow read access" ON sales_team;
DROP POLICY IF EXISTS "Allow read access" ON customers;
DROP POLICY IF EXISTS "Allow read access" ON opportunities;
DROP POLICY IF EXISTS "Allow read access" ON collections;
DROP POLICY IF EXISTS "Allow read access" ON targets;
DROP POLICY IF EXISTS "Allow read access" ON bonus_tiers_sales;
DROP POLICY IF EXISTS "Allow read access" ON bonus_tiers_collection;
DROP POLICY IF EXISTS "Allow read access" ON fixed_bonuses;
DROP POLICY IF EXISTS "Allow read access" ON crm_activities;
DROP POLICY IF EXISTS "Allow read access" ON crm_tasks;
DROP POLICY IF EXISTS "Allow read access" ON crm_notes;
DROP POLICY IF EXISTS "Allow read access" ON swot_analyses;

DROP POLICY IF EXISTS "Allow write access" ON sales_team;
DROP POLICY IF EXISTS "Allow write access" ON customers;
DROP POLICY IF EXISTS "Allow write access" ON opportunities;
DROP POLICY IF EXISTS "Allow write access" ON collections;
DROP POLICY IF EXISTS "Allow write access" ON targets;
DROP POLICY IF EXISTS "Allow write access" ON bonus_tiers_sales;
DROP POLICY IF EXISTS "Allow write access" ON bonus_tiers_collection;
DROP POLICY IF EXISTS "Allow write access" ON fixed_bonuses;
DROP POLICY IF EXISTS "Allow write access" ON crm_activities;
DROP POLICY IF EXISTS "Allow write access" ON crm_tasks;
DROP POLICY IF EXISTS "Allow write access" ON crm_notes;
DROP POLICY IF EXISTS "Allow write access" ON swot_analyses;

-- HERKES İÇİN TAM ERİŞİM (anon dahil)
CREATE POLICY "Allow all access" ON sales_team FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON opportunities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON collections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON targets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON bonus_tiers_sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON bonus_tiers_collection FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON fixed_bonuses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON crm_activities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON crm_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON crm_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON swot_analyses FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- Başlangıç Verileri (varsa atla)
-- =============================================

INSERT INTO bonus_tiers_sales (min_rate, max_rate, bonus_rate, description) 
SELECT 0, 80, 0, '%80 altı - Prim yok'
WHERE NOT EXISTS (SELECT 1 FROM bonus_tiers_sales LIMIT 1);

INSERT INTO bonus_tiers_sales (min_rate, max_rate, bonus_rate, description) 
SELECT 80, 100, 3, '%80-100 arası - %3 prim'
WHERE NOT EXISTS (SELECT 1 FROM bonus_tiers_sales WHERE min_rate = 80);

INSERT INTO bonus_tiers_sales (min_rate, max_rate, bonus_rate, description) 
SELECT 100, 110, 5, '%100-110 arası - %5 prim'
WHERE NOT EXISTS (SELECT 1 FROM bonus_tiers_sales WHERE min_rate = 100);

INSERT INTO bonus_tiers_sales (min_rate, max_rate, bonus_rate, description) 
SELECT 110, 120, 7, '%110-120 arası - %7 prim'
WHERE NOT EXISTS (SELECT 1 FROM bonus_tiers_sales WHERE min_rate = 110);

INSERT INTO bonus_tiers_sales (min_rate, max_rate, bonus_rate, description) 
SELECT 120, 999, 10, '%120 üzeri - %10 prim'
WHERE NOT EXISTS (SELECT 1 FROM bonus_tiers_sales WHERE min_rate = 120);

INSERT INTO bonus_tiers_collection (min_rate, max_rate, bonus_rate, description) 
SELECT 0, 80, 0, '%80 altı - Prim yok'
WHERE NOT EXISTS (SELECT 1 FROM bonus_tiers_collection LIMIT 1);

INSERT INTO bonus_tiers_collection (min_rate, max_rate, bonus_rate, description) 
SELECT 80, 100, 2, '%80-100 arası - %2 prim'
WHERE NOT EXISTS (SELECT 1 FROM bonus_tiers_collection WHERE min_rate = 80);

INSERT INTO bonus_tiers_collection (min_rate, max_rate, bonus_rate, description) 
SELECT 100, 110, 3.5, '%100-110 arası - %3.5 prim'
WHERE NOT EXISTS (SELECT 1 FROM bonus_tiers_collection WHERE min_rate = 100);

INSERT INTO bonus_tiers_collection (min_rate, max_rate, bonus_rate, description) 
SELECT 110, 120, 5, '%110-120 arası - %5 prim'
WHERE NOT EXISTS (SELECT 1 FROM bonus_tiers_collection WHERE min_rate = 110);

INSERT INTO bonus_tiers_collection (min_rate, max_rate, bonus_rate, description) 
SELECT 120, 999, 7, '%120 üzeri - %7 prim'
WHERE NOT EXISTS (SELECT 1 FROM bonus_tiers_collection WHERE min_rate = 120);

INSERT INTO fixed_bonuses (bonus_key, bonus_name, amount) 
SELECT 'new_customer', 'Yeni Müşteri Primi', 500
WHERE NOT EXISTS (SELECT 1 FROM fixed_bonuses WHERE bonus_key = 'new_customer');

INSERT INTO fixed_bonuses (bonus_key, bonus_name, amount) 
SELECT 'perfect_collection', 'Tam Tahsilat Primi', 2000
WHERE NOT EXISTS (SELECT 1 FROM fixed_bonuses WHERE bonus_key = 'perfect_collection');

INSERT INTO fixed_bonuses (bonus_key, bonus_name, amount) 
SELECT 'quarterly_champion', 'Çeyrek Şampiyonu', 5000
WHERE NOT EXISTS (SELECT 1 FROM fixed_bonuses WHERE bonus_key = 'quarterly_champion');

INSERT INTO fixed_bonuses (bonus_key, bonus_name, amount) 
SELECT 'yearly_champion', 'Yıl Şampiyonu', 25000
WHERE NOT EXISTS (SELECT 1 FROM fixed_bonuses WHERE bonus_key = 'yearly_champion');

INSERT INTO fixed_bonuses (bonus_key, bonus_name, amount) 
SELECT 'team_target', 'Takım Hedefi Primi', 3000
WHERE NOT EXISTS (SELECT 1 FROM fixed_bonuses WHERE bonus_key = 'team_target');
