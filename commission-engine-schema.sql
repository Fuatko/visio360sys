-- =============================================
-- SALES & COLLECTIONS INCENTIVE ENGINE
-- Complete Database Schema
-- =============================================

-- 1. COMMISSION CONFIGURATION TABLE
CREATE TABLE IF NOT EXISTS commission_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  team_id UUID REFERENCES sales_team(id) ON DELETE SET NULL,
  region TEXT,
  
  -- Weights (must sum to 1.0)
  sales_weight DECIMAL(4,2) NOT NULL DEFAULT 0.60,
  collections_weight DECIMAL(4,2) NOT NULL DEFAULT 0.40,
  
  -- Score caps
  max_sales_score DECIMAL(4,2) NOT NULL DEFAULT 1.40,
  max_collections_score DECIMAL(4,2) NOT NULL DEFAULT 1.20,
  
  -- Hard stop threshold
  collections_hard_stop_threshold DECIMAL(4,2) NOT NULL DEFAULT 0.70,
  
  -- Payment delay (months)
  payment_delay_months INTEGER NOT NULL DEFAULT 0,
  
  -- Validity period
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  
  CONSTRAINT chk_weights_sum CHECK (sales_weight + collections_weight = 1.00),
  CONSTRAINT chk_weights_positive CHECK (sales_weight >= 0 AND collections_weight >= 0)
);

-- 2. SALES SCORE THRESHOLDS
CREATE TABLE IF NOT EXISTS sales_score_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES commission_configs(id) ON DELETE CASCADE,
  min_ratio DECIMAL(5,2) NOT NULL,
  max_ratio DECIMAL(5,2),
  score DECIMAL(4,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. COLLECTIONS SCORE THRESHOLDS
CREATE TABLE IF NOT EXISTS collections_score_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES commission_configs(id) ON DELETE CASCADE,
  min_ratio DECIMAL(5,2) NOT NULL,
  max_ratio DECIMAL(5,2),
  score DECIMAL(4,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. MONTHLY KPI INPUTS
CREATE TABLE IF NOT EXISTS commission_kpi_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id UUID NOT NULL REFERENCES sales_team(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  
  -- Sales KPIs
  sales_target DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (sales_target >= 0),
  actual_sales DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (actual_sales >= 0),
  
  -- Collections KPIs
  invoiced_amount DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (invoiced_amount >= 0),
  collected_amount DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (collected_amount >= 0),
  
  -- Base commission
  base_commission_amount DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (base_commission_amount >= 0),
  
  config_id UUID REFERENCES commission_configs(id),
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  
  CONSTRAINT uq_kpi_rep_period UNIQUE (sales_rep_id, period_year, period_month)
);

-- 5. COMMISSION CALCULATION RESULTS
CREATE TABLE IF NOT EXISTS commission_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_input_id UUID NOT NULL REFERENCES commission_kpi_inputs(id) ON DELETE CASCADE,
  sales_rep_id UUID NOT NULL REFERENCES sales_team(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  
  -- Snapshot of inputs
  sales_target DECIMAL(15,2) NOT NULL,
  actual_sales DECIMAL(15,2) NOT NULL,
  invoiced_amount DECIMAL(15,2) NOT NULL,
  collected_amount DECIMAL(15,2) NOT NULL,
  base_commission_amount DECIMAL(15,2) NOT NULL,
  
  -- Computed ratios
  sales_attainment_ratio DECIMAL(6,4),
  collections_ratio DECIMAL(6,4),
  
  -- Scores
  sales_score DECIMAL(4,2) NOT NULL DEFAULT 0,
  collections_score DECIMAL(4,2) NOT NULL DEFAULT 0,
  
  -- Weights used
  sales_weight DECIMAL(4,2) NOT NULL,
  collections_weight DECIMAL(4,2) NOT NULL,
  
  -- Final calculation
  total_multiplier DECIMAL(6,4) NOT NULL DEFAULT 0,
  earned_commission DECIMAL(15,2) NOT NULL DEFAULT 0,
  
  -- Flags
  hard_stop_triggered BOOLEAN DEFAULT false,
  hard_stop_reason TEXT,
  
  -- Payment info
  calculation_month DATE NOT NULL,
  payment_month DATE NOT NULL,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'approved', 'paid', 'cancelled')),
  
  config_id UUID REFERENCES commission_configs(id),
  
  -- Audit
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  calculated_by UUID,
  
  CONSTRAINT uq_result_rep_period UNIQUE (sales_rep_id, period_year, period_month)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_kpi_period ON commission_kpi_inputs(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_results_period ON commission_results(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_results_payment ON commission_results(payment_month, payment_status);

-- RLS
ALTER TABLE commission_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_score_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections_score_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_kpi_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON commission_configs FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON sales_score_thresholds FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON collections_score_thresholds FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON commission_kpi_inputs FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON commission_results FOR ALL TO authenticated USING (true);

-- =============================================
-- DEFAULT DATA SEED
-- =============================================

-- Insert default global config
INSERT INTO commission_configs (name, sales_weight, collections_weight, max_sales_score, max_collections_score, collections_hard_stop_threshold, payment_delay_months)
VALUES ('Varsayılan Prim Konfigürasyonu', 0.60, 0.40, 1.40, 1.20, 0.70, 0)
ON CONFLICT DO NOTHING;

-- Seed sales thresholds
DO $$
DECLARE
  config_id UUID;
BEGIN
  SELECT id INTO config_id FROM commission_configs WHERE name = 'Varsayılan Prim Konfigürasyonu' LIMIT 1;
  
  IF config_id IS NOT NULL THEN
    -- Clear existing thresholds
    DELETE FROM sales_score_thresholds WHERE config_id = config_id;
    DELETE FROM collections_score_thresholds WHERE config_id = config_id;
    
    -- Sales Score Thresholds
    INSERT INTO sales_score_thresholds (config_id, min_ratio, max_ratio, score) VALUES
      (config_id, 0.00, 0.70, 0.00),
      (config_id, 0.70, 0.90, 0.60),
      (config_id, 0.90, 1.00, 0.85),
      (config_id, 1.00, 1.10, 1.00),
      (config_id, 1.10, 1.20, 1.20),
      (config_id, 1.20, NULL, 1.40);
    
    -- Collections Score Thresholds
    INSERT INTO collections_score_thresholds (config_id, min_ratio, max_ratio, score) VALUES
      (config_id, 0.00, 0.70, 0.00),
      (config_id, 0.70, 0.85, 0.50),
      (config_id, 0.85, 0.95, 0.80),
      (config_id, 0.95, 1.00, 1.00),
      (config_id, 1.00, NULL, 1.20);
  END IF;
END $$;
