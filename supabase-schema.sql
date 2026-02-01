-- =============================================
-- SATIŞ PRO - SUPABASE DATABASE SCHEMA
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

-- Satış Ekibi
CREATE TABLE sales_team (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
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
CREATE TABLE customers (
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
CREATE TABLE opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
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
CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    sales_person_id UUID REFERENCES sales_team(id) ON DELETE SET NULL,
    amount DECIMAL(15,2) NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    method VARCHAR(50) DEFAULT 'Havale',
    invoice_no VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Hedefler
CREATE TABLE targets (
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(sales_person_id, period)
);

-- Prim Kuralları - Satış Kademeleri
CREATE TABLE bonus_tiers_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    min_rate INTEGER NOT NULL,
    max_rate INTEGER NOT NULL,
    bonus_rate DECIMAL(5,2) NOT NULL,
    description VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prim Kuralları - Tahsilat Kademeleri
CREATE TABLE bonus_tiers_collection (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    min_rate INTEGER NOT NULL,
    max_rate INTEGER NOT NULL,
    bonus_rate DECIMAL(5,2) NOT NULL,
    description VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sabit Primler
CREATE TABLE fixed_bonuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(50) UNIQUE NOT NULL,
    value DECIMAL(15,2) NOT NULL,
    description VARCHAR(200),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Aktiviteler
CREATE TABLE crm_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES sales_team(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Görevler
CREATE TABLE crm_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
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
CREATE TABLE crm_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES sales_team(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SWOT Analizleri
CREATE TABLE swot_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sales_person_id UUID REFERENCES sales_team(id) ON DELETE CASCADE,
    date DATE DEFAULT CURRENT_DATE,
    overall_score INTEGER DEFAULT 70,
    strengths TEXT[] DEFAULT '{}',
    weaknesses TEXT[] DEFAULT '{}',
    opportunities TEXT[] DEFAULT '{}',
    threats TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_customers_assigned ON customers(assigned_to);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_opportunities_stage ON opportunities(stage);
CREATE INDEX idx_opportunities_assigned ON opportunities(assigned_to);
CREATE INDEX idx_collections_date ON collections(date);
CREATE INDEX idx_collections_customer ON collections(customer_id);
CREATE INDEX idx_targets_period ON targets(period);
CREATE INDEX idx_crm_activities_customer ON crm_activities(customer_id);
CREATE INDEX idx_crm_tasks_user ON crm_tasks(user_id);
CREATE INDEX idx_crm_tasks_status ON crm_tasks(status);

-- =============================================
-- TRIGGERS FOR updated_at
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sales_team_updated_at BEFORE UPDATE ON sales_team FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_opportunities_updated_at BEFORE UPDATE ON opportunities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_targets_updated_at BEFORE UPDATE ON targets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_crm_tasks_updated_at BEFORE UPDATE ON crm_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_swot_analyses_updated_at BEFORE UPDATE ON swot_analyses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- INITIAL DATA - Prim Kademeleri
-- =============================================

INSERT INTO bonus_tiers_sales (min_rate, max_rate, bonus_rate, description) VALUES
(0, 80, 0, '%80 altı - Prim yok'),
(80, 100, 3, '%80-100 arası - %3 prim'),
(100, 110, 5, '%100-110 arası - %5 prim'),
(110, 120, 7, '%110-120 arası - %7 prim'),
(120, 999, 10, '%120 üzeri - %10 prim');

INSERT INTO bonus_tiers_collection (min_rate, max_rate, bonus_rate, description) VALUES
(0, 80, 0, '%80 altı - Prim yok'),
(80, 100, 2, '%80-100 arası - %2 prim'),
(100, 110, 3.5, '%100-110 arası - %3.5 prim'),
(110, 120, 5, '%110-120 arası - %5 prim'),
(120, 999, 7, '%120 üzeri - %7 prim');

INSERT INTO fixed_bonuses (key, value, description) VALUES
('new_customer', 500, 'Yeni müşteri primi'),
('perfect_collection', 2000, '%100 tahsilat bonusu'),
('quarterly_champion', 5000, 'Çeyrek şampiyonu'),
('yearly_champion', 25000, 'Yıllık şampiyon'),
('team_target', 3000, 'Ekip hedef bonusu');

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE sales_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE swot_analyses ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read all data
CREATE POLICY "Allow read access" ON sales_team FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read access" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read access" ON opportunities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read access" ON collections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read access" ON targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read access" ON crm_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read access" ON crm_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read access" ON crm_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read access" ON swot_analyses FOR SELECT TO authenticated USING (true);

-- Policy: Authenticated users can insert/update/delete
CREATE POLICY "Allow write access" ON sales_team FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow write access" ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow write access" ON opportunities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow write access" ON collections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow write access" ON targets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow write access" ON crm_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow write access" ON crm_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow write access" ON crm_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow write access" ON swot_analyses FOR ALL TO authenticated USING (true) WITH CHECK (true);
