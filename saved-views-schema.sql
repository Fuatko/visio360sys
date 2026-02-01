-- =====================================================
-- SAVED VIEWS SYSTEM - ROLE-BASED ANALYTICS VIEWS
-- =====================================================

-- 1) SAVED VIEWS TABLOSU
-- =====================================================
CREATE TABLE IF NOT EXISTS saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  
  -- View Identity
  code VARCHAR(50) NOT NULL, -- CEO-01, SD-02, etc.
  name VARCHAR(255) NOT NULL,
  description TEXT,
  module VARCHAR(50) NOT NULL, -- dashboard, sales, collections, commissions, customers
  
  -- System vs Custom
  is_system BOOLEAN DEFAULT false, -- true = seed view, cannot edit/delete
  is_default BOOLEAN DEFAULT false, -- true = default for role
  
  -- Role Scoping
  audience_role VARCHAR(50) NOT NULL, -- super_admin, ceo, sales_director, finance, sales_ops, account_manager, org_admin, manager, user
  
  -- View Configuration (JSONB)
  filters_json JSONB DEFAULT '{}',
  groupby_json JSONB DEFAULT '[]',
  columns_json JSONB DEFAULT '[]',
  default_sort_json JSONB DEFAULT '{}',
  kpis_json JSONB DEFAULT '[]',
  time_range_json JSONB DEFAULT '{}',
  
  -- Clone tracking
  cloned_from_id UUID REFERENCES saved_views(id),
  
  -- Ownership
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_views_org ON saved_views(organization_id);
CREATE INDEX IF NOT EXISTS idx_saved_views_module ON saved_views(module);
CREATE INDEX IF NOT EXISTS idx_saved_views_role ON saved_views(audience_role);
CREATE INDEX IF NOT EXISTS idx_saved_views_system ON saved_views(is_system);
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_views_code_org ON saved_views(code, organization_id) WHERE is_system = true;

-- RLS
ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm viewları görür" ON saved_views;
CREATE POLICY "Super admin tüm viewları görür" ON saved_views
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "Kullanıcılar kendi rolüne uygun viewları görür" ON saved_views;
CREATE POLICY "Kullanıcılar kendi rolüne uygun viewları görür" ON saved_views
  FOR SELECT USING (
    organization_id = get_user_organization_id()
    AND (
      -- System views for user's role
      (is_system = true AND audience_role IN (
        SELECT role FROM users WHERE id = auth.uid()
        UNION
        SELECT 'all'
      ))
      OR
      -- User's own custom views
      created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Kullanıcılar kendi viewlarını yönetir" ON saved_views;
CREATE POLICY "Kullanıcılar kendi viewlarını yönetir" ON saved_views
  FOR ALL USING (
    created_by = auth.uid() AND is_system = false
  );

-- 2) USER VIEW PREFERENCES (Hangi view aktif)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_view_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  module VARCHAR(50) NOT NULL,
  active_view_id UUID REFERENCES saved_views(id),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, module)
);

-- =====================================================
-- 3) SEED DATA - ALL SYSTEM DEFAULT VIEWS
-- =====================================================

-- Function to seed views for an organization
CREATE OR REPLACE FUNCTION seed_default_views(org_id UUID)
RETURNS void AS $$
BEGIN

-- ========================
-- CEO VIEWS
-- ========================

-- CEO-01 | Company Performance Overview
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'CEO-01',
  'Şirket Performans Özeti',
  'Satış, tahsilat ve prim verilerinin aylık özeti',
  'dashboard',
  true, true, 'ceo',
  '{}',
  '["month"]',
  '["month", "bookings", "forecast", "invoiced", "collected", "collections_ratio", "earned_commission", "hard_stop_rate"]',
  '{"key": "month", "direction": "desc"}',
  '["bookings", "forecast", "invoiced", "collected", "collections_ratio", "earned_commission", "hard_stop_rate"]',
  '{"type": "last_n_months", "value": 6}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- CEO-02 | Region / Country Comparison
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'CEO-02',
  'Bölge Karşılaştırması',
  'Bölge bazlı satış ve tahsilat performansı',
  'sales',
  true, false, 'ceo',
  '{}',
  '["region"]',
  '["region", "bookings_sum", "pipeline_open_sum", "overdue_amount", "avg_days_overdue", "collections_ratio"]',
  '{"key": "bookings_sum", "direction": "desc"}',
  '["bookings_sum", "pipeline_open_sum", "overdue_amount", "avg_days_overdue", "collections_ratio"]',
  '{"type": "last_n_months", "value": 3}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- CEO-03 | Risk & Exposure Dashboard
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'CEO-03',
  'Risk ve Maruziyet Paneli',
  'Riskli ve vadesi geçmiş müşteriler',
  'customers',
  true, false, 'ceo',
  '{"status": ["overdue", "at_risk"]}',
  '["segment", "customer"]',
  '["customer_name", "segment", "overdue_amount", "overdue_invoice_count", "avg_days_overdue", "risk_status", "next_follow_up_date"]',
  '{"key": "overdue_amount", "direction": "desc"}',
  '["overdue_amount", "overdue_invoice_count", "avg_days_overdue", "churn_risk_score"]',
  '{"type": "current"}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- ========================
-- SALES DIRECTOR VIEWS
-- ========================

-- SD-01 | Team Performance League
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'SD-01',
  'Takım Performans Ligi',
  'Takım ve temsilci bazlı performans sıralaması',
  'sales',
  true, true, 'sales_director',
  '{}',
  '["team", "rep"]',
  '["rep_name", "team", "bookings_sum", "win_rate", "avg_deal_size", "pipeline_open_sum", "forecast_sum", "earned_commission_sum", "avg_multiplier"]',
  '{"key": "bookings_sum", "direction": "desc"}',
  '["bookings_sum", "win_rate", "avg_deal_size", "pipeline_open_sum", "forecast_sum", "earned_commission_sum", "avg_multiplier"]',
  '{"type": "current_month"}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- SD-02 | Target Deviation Analysis
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'SD-02',
  'Hedef Sapma Analizi',
  'Hedef ve gerçekleşen satış karşılaştırması',
  'commissions',
  true, false, 'sales_director',
  '{}',
  '["team", "rep"]',
  '["rep_name", "team", "sales_target_sum", "actual_sales_sum", "avg_sales_attainment", "collections_ratio", "hard_stop_count"]',
  '{"key": "avg_sales_attainment", "direction": "desc"}',
  '["sales_target_sum", "actual_sales_sum", "avg_sales_attainment", "collections_ratio", "hard_stop_count"]',
  '{"type": "selected_month"}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- SD-03 | Funnel Stage Conversion
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'SD-03',
  'Satış Hunisi Dönüşüm',
  'Aşama bazlı fırsat dönüşüm oranları',
  'sales',
  true, false, 'sales_director',
  '{}',
  '["stage"]',
  '["stage", "deal_count", "amount_sum", "conversion_to_next_stage"]',
  '{"key": "stage", "direction": "asc"}',
  '["deal_count", "amount_sum", "conversion_to_next_stage"]',
  '{"type": "last_n_days", "value": 30}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- SD-04 | Sales Impact of Risky Customers
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'SD-04',
  'Riskli Müşteri Satış Etkisi',
  'Risk altındaki müşterilerin pipeline etkisi',
  'customers',
  true, false, 'sales_director',
  '{"status": ["overdue", "at_risk"]}',
  '["customer", "rep"]',
  '["customer_name", "rep_name", "overdue_amount", "open_pipeline_sum", "forecast_sum", "last_contact_date"]',
  '{"key": "open_pipeline_sum", "direction": "desc"}',
  '["overdue_amount", "open_pipeline_sum", "forecast_sum"]',
  '{"type": "current"}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- ========================
-- FINANCE VIEWS
-- ========================

-- FIN-01 | Monthly Collections Health
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'FIN-01',
  'Aylık Tahsilat Sağlığı',
  'Tahsilat performansının aylık özeti',
  'collections',
  true, true, 'finance',
  '{}',
  '["month"]',
  '["month", "invoiced_sum", "collected_sum", "collections_ratio", "overdue_amount", "avg_days_to_pay", "dso"]',
  '{"key": "month", "direction": "desc"}',
  '["invoiced_sum", "collected_sum", "collections_ratio", "overdue_amount", "avg_days_to_pay", "dso"]',
  '{"type": "last_n_months", "value": 6}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- FIN-02 | Aging Analysis
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'FIN-02',
  'Yaşlandırma Analizi',
  'Vadesi geçmiş faturaların yaş dağılımı',
  'collections',
  true, false, 'finance',
  '{"status": ["overdue"]}',
  '["aging_bucket"]',
  '["aging_bucket", "invoice_count", "amount_sum", "percent_of_total_overdue"]',
  '{"key": "aging_bucket", "direction": "asc"}',
  '["invoice_count", "amount_sum", "percent_of_total_overdue"]',
  '{"type": "current_month"}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- FIN-03 | Commission Payout List
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'FIN-03',
  'Prim Ödeme Listesi',
  'Aylık prim ödemeleri özeti',
  'commissions',
  true, false, 'finance',
  '{}',
  '["team", "rep"]',
  '["rep_name", "team", "base_commission_sum", "earned_commission_sum", "hard_stop_flag", "payment_status"]',
  '{"key": "earned_commission_sum", "direction": "desc"}',
  '["base_commission_sum", "earned_commission_sum"]',
  '{"type": "selected_month"}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- FIN-04 | Hard Stop Audit
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'FIN-04',
  'Hard Stop Denetimi',
  'Prim kesintisi uygulanan temsilciler',
  'commissions',
  true, false, 'finance',
  '{"hard_stop": true}',
  '["rep", "customer"]',
  '["rep_name", "customer_name", "collections_ratio", "overdue_amount", "invoice_count", "earned_commission"]',
  '{"key": "overdue_amount", "direction": "desc"}',
  '["collections_ratio", "overdue_amount", "invoice_count"]',
  '{"type": "current_month"}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- ========================
-- SALES OPS VIEWS
-- ========================

-- SOPS-01 | Data Quality & Missing Inputs
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'SOPS-01',
  'Veri Kalitesi Kontrolü',
  'Eksik ve hatalı KPI girişleri',
  'commissions',
  true, true, 'sales_ops',
  '{}',
  '["team", "rep"]',
  '["rep_name", "team", "missing_fields_count", "invalid_values_count", "last_updated_at"]',
  '{"key": "missing_fields_count", "direction": "desc"}',
  '["missing_fields_count", "invalid_values_count"]',
  '{"type": "current_month"}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- SOPS-02 | Recalculation Monitoring
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'SOPS-02',
  'Hesaplama İzleme',
  'Prim hesaplama durumu ve geçmişi',
  'commissions',
  true, false, 'sales_ops',
  '{}',
  '["month"]',
  '["month", "processed_count", "failed_count", "last_calculated_at", "last_calculated_by", "config_version"]',
  '{"key": "month", "direction": "desc"}',
  '["processed_count", "failed_count"]',
  '{"type": "last_n_months", "value": 3}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- SOPS-03 | Config Version Impact Analysis
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'SOPS-03',
  'Konfigürasyon Etki Analizi',
  'Farklı ayar versiyonlarının prim etkisi',
  'commissions',
  true, false, 'sales_ops',
  '{}',
  '["config_version", "team"]',
  '["config_version", "team", "earned_commission_sum", "avg_multiplier", "hard_stop_rate"]',
  '{"key": "config_version", "direction": "desc"}',
  '["earned_commission_sum", "avg_multiplier", "hard_stop_rate"]',
  '{"type": "last_n_months", "value": 6}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- ========================
-- ACCOUNT MANAGER VIEWS
-- ========================

-- AM-01 | My Follow-ups (Next 7 Days)
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'AM-01',
  'Takip Listesi (7 Gün)',
  'Önümüzdeki 7 gün içindeki takipler',
  'customers',
  true, true, 'account_manager',
  '{"owner": "me", "follow_up_within_days": 7}',
  '["next_follow_up_date", "customer"]',
  '["customer_name", "next_follow_up_date", "risk_status", "overdue_amount", "last_contact_date", "open_tickets_count"]',
  '{"key": "next_follow_up_date", "direction": "asc"}',
  '["overdue_amount", "open_tickets_count"]',
  '{"type": "next_n_days", "value": 7}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- AM-02 | My Overdue Customers
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'AM-02',
  'Vadesi Geçmiş Müşterilerim',
  'Sorumlu olduğum vadesi geçmiş müşteriler',
  'collections',
  true, false, 'account_manager',
  '{"owner": "me", "status": ["overdue"]}',
  '["customer"]',
  '["customer_name", "overdue_amount", "avg_days_overdue", "overdue_invoice_count", "last_contact_date"]',
  '{"key": "overdue_amount", "direction": "desc"}',
  '["overdue_amount", "avg_days_overdue", "overdue_invoice_count"]',
  '{"type": "current"}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- AM-03 | My Pipeline at Risk
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'AM-03',
  'Riskli Pipeline''ım',
  'Risk altındaki müşterilerimdeki açık fırsatlar',
  'sales',
  true, false, 'account_manager',
  '{"owner": "me", "stage": ["qualified", "proposal", "negotiation"], "customer_risk": true}',
  '["customer", "stage"]',
  '["customer_name", "stage", "pipeline_open_sum", "forecast_sum", "risk_status", "overdue_amount"]',
  '{"key": "forecast_sum", "direction": "desc"}',
  '["pipeline_open_sum", "forecast_sum", "churn_risk_score"]',
  '{"type": "current"}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- ========================
-- ORG ADMIN VIEWS
-- ========================

-- OA-01 | Organization Overview
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'OA-01',
  'Kurum Genel Bakış',
  'Kurumun genel performans özeti',
  'dashboard',
  true, true, 'org_admin',
  '{}',
  '["month"]',
  '["month", "total_sales", "total_collection", "collections_ratio", "customer_count", "opportunity_count", "user_count"]',
  '{"key": "month", "direction": "desc"}',
  '["total_sales", "total_collection", "collections_ratio", "customer_count"]',
  '{"type": "last_n_months", "value": 6}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- ========================
-- MANAGER VIEWS
-- ========================

-- MGR-01 | My Team Performance
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'MGR-01',
  'Takımım Performansı',
  'Yönettiğim takımın performans özeti',
  'sales',
  true, true, 'manager',
  '{"team": "my_team"}',
  '["rep"]',
  '["rep_name", "bookings_sum", "win_rate", "pipeline_open_sum", "collections_ratio", "activity_count"]',
  '{"key": "bookings_sum", "direction": "desc"}',
  '["bookings_sum", "win_rate", "pipeline_open_sum", "collections_ratio"]',
  '{"type": "current_month"}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

-- ========================
-- USER VIEWS
-- ========================

-- USR-01 | My Performance
INSERT INTO saved_views (organization_id, code, name, description, module, is_system, is_default, audience_role, filters_json, groupby_json, columns_json, default_sort_json, kpis_json, time_range_json)
VALUES (
  org_id,
  'USR-01',
  'Performansım',
  'Kendi satış ve tahsilat performansım',
  'dashboard',
  true, true, 'user',
  '{"owner": "me"}',
  '["month"]',
  '["month", "sales_target", "actual_sales", "sales_ratio", "collections_ratio", "earned_commission"]',
  '{"key": "month", "direction": "desc"}',
  '["sales_target", "actual_sales", "sales_ratio", "collections_ratio"]',
  '{"type": "last_n_months", "value": 6}'
) ON CONFLICT (code, organization_id) WHERE is_system = true DO NOTHING;

END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4) TRIGGER: Yeni kurum oluşturulduğunda viewları seed et
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_seed_views_for_new_org()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_default_views(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS seed_views_on_org_create ON organizations;
CREATE TRIGGER seed_views_on_org_create
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_seed_views_for_new_org();

-- =====================================================
-- 5) MEVCUT KURUMLAR İÇİN VİEWLARI SEED ET
-- =====================================================
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    PERFORM seed_default_views(org.id);
  END LOOP;
END;
$$;

-- =====================================================
-- ÖZET: TOPLAM 18 SİSTEM VIEW
-- =====================================================
-- CEO: 3 views (CEO-01, CEO-02, CEO-03)
-- Sales Director: 4 views (SD-01, SD-02, SD-03, SD-04)
-- Finance: 4 views (FIN-01, FIN-02, FIN-03, FIN-04)
-- Sales Ops: 3 views (SOPS-01, SOPS-02, SOPS-03)
-- Account Manager: 3 views (AM-01, AM-02, AM-03)
-- Org Admin: 1 view (OA-01)
-- Manager: 1 view (MGR-01)
-- User: 1 view (USR-01)
-- =====================================================
