-- =====================================================
-- SATIŞ PRO - MULTI-TENANT (ÇOK KURUMLU) YAPI
-- KVKK Uyumlu Veri İzolasyonu
-- =====================================================

-- 1) ORGANIZATIONS (KURUMLAR) TABLOSU
-- =====================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL, -- URL-friendly isim (örn: mfk-danismanlik)
  logo_url TEXT,
  domain VARCHAR(255), -- Özel domain (opsiyonel)
  settings JSONB DEFAULT '{}', -- Kurum ayarları
  subscription_plan VARCHAR(50) DEFAULT 'basic', -- basic, pro, enterprise
  subscription_expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  max_users INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2) USERS TABLOSUNU GÜNCELLE (organization_id ekle)
-- =====================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_org_admin BOOLEAN DEFAULT false;

-- Role enum güncelle
-- super_admin: Tüm sistemi yönetir (Siz)
-- org_admin: Kendi kurumunu yönetir
-- manager: Kendi takımını görür
-- user: Sadece kendi verilerini görür

-- 3) TÜM TABLOLARA organization_id EKLE
-- =====================================================

-- Sales Team
ALTER TABLE sales_team ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Opportunities
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Collections
ALTER TABLE collections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Sales Targets
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- CRM Activities
ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- CRM Tasks
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Products
ALTER TABLE products ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Calendar Events
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Competitors
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Commission configs
ALTER TABLE commission_configs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Commission KPI inputs
ALTER TABLE commission_kpi_inputs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Commission results
ALTER TABLE commission_results ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- SWOT analyses
ALTER TABLE swot_analyses ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- 4) İNDEXLER (Performans için)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_team_org ON sales_team(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_org ON opportunities(organization_id);
CREATE INDEX IF NOT EXISTS idx_collections_org ON collections(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_targets_org ON sales_targets(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_org ON crm_activities(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_quotes_org ON quotes(organization_id);
CREATE INDEX IF NOT EXISTS idx_orders_org ON orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_contracts_org ON contracts(organization_id);

-- 5) RLS POLİTİKALARI (KVKK UYUMLU VERİ İZOLASYONU)
-- =====================================================

-- Yardımcı fonksiyon: Kullanıcının organization_id'sini al
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Yardımcı fonksiyon: Kullanıcı super_admin mi?
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'super_admin'
  )
$$ LANGUAGE SQL SECURITY DEFINER;

-- Yardımcı fonksiyon: Kullanıcı org_admin mi?
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND (role = 'org_admin' OR is_org_admin = true)
  )
$$ LANGUAGE SQL SECURITY DEFINER;

-- ORGANIZATIONS RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm kurumları görür" ON organizations;
CREATE POLICY "Super admin tüm kurumları görür" ON organizations
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurumlarını görür" ON organizations;
CREATE POLICY "Kullanıcılar kendi kurumlarını görür" ON organizations
  FOR SELECT USING (id = get_user_organization_id());

-- USERS RLS (Güncelleme)
DROP POLICY IF EXISTS "Super admin tüm kullanıcıları görür" ON users;
CREATE POLICY "Super admin tüm kullanıcıları görür" ON users
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Org admin kendi kurum kullanıcılarını görür" ON users;
CREATE POLICY "Org admin kendi kurum kullanıcılarını görür" ON users
  FOR ALL USING (
    is_org_admin() AND organization_id = get_user_organization_id()
  );

DROP POLICY IF EXISTS "Kullanıcılar kendilerini görür" ON users;
CREATE POLICY "Kullanıcılar kendilerini görür" ON users
  FOR SELECT USING (id = auth.uid());

-- SALES_TEAM RLS
ALTER TABLE sales_team ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm ekipleri görür" ON sales_team;
CREATE POLICY "Super admin tüm ekipleri görür" ON sales_team
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum ekibini görür" ON sales_team;
CREATE POLICY "Kullanıcılar kendi kurum ekibini görür" ON sales_team
  FOR ALL USING (organization_id = get_user_organization_id());

-- CUSTOMERS RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm müşterileri görür" ON customers;
CREATE POLICY "Super admin tüm müşterileri görür" ON customers
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum müşterilerini görür" ON customers;
CREATE POLICY "Kullanıcılar kendi kurum müşterilerini görür" ON customers
  FOR ALL USING (organization_id = get_user_organization_id());

-- OPPORTUNITIES RLS
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm fırsatları görür" ON opportunities;
CREATE POLICY "Super admin tüm fırsatları görür" ON opportunities
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum fırsatlarını görür" ON opportunities;
CREATE POLICY "Kullanıcılar kendi kurum fırsatlarını görür" ON opportunities
  FOR ALL USING (organization_id = get_user_organization_id());

-- COLLECTIONS RLS
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm tahsilatları görür" ON collections;
CREATE POLICY "Super admin tüm tahsilatları görür" ON collections
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum tahsilatlarını görür" ON collections;
CREATE POLICY "Kullanıcılar kendi kurum tahsilatlarını görür" ON collections
  FOR ALL USING (organization_id = get_user_organization_id());

-- SALES_TARGETS RLS
ALTER TABLE sales_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm hedefleri görür" ON sales_targets;
CREATE POLICY "Super admin tüm hedefleri görür" ON sales_targets
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum hedeflerini görür" ON sales_targets;
CREATE POLICY "Kullanıcılar kendi kurum hedeflerini görür" ON sales_targets
  FOR ALL USING (organization_id = get_user_organization_id());

-- CRM_ACTIVITIES RLS
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm aktiviteleri görür" ON crm_activities;
CREATE POLICY "Super admin tüm aktiviteleri görür" ON crm_activities
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum aktivitelerini görür" ON crm_activities;
CREATE POLICY "Kullanıcılar kendi kurum aktivitelerini görür" ON crm_activities
  FOR ALL USING (organization_id = get_user_organization_id());

-- PRODUCTS RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm ürünleri görür" ON products;
CREATE POLICY "Super admin tüm ürünleri görür" ON products
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum ürünlerini görür" ON products;
CREATE POLICY "Kullanıcılar kendi kurum ürünlerini görür" ON products
  FOR ALL USING (organization_id = get_user_organization_id());

-- QUOTES RLS
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm teklifleri görür" ON quotes;
CREATE POLICY "Super admin tüm teklifleri görür" ON quotes
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum tekliflerini görür" ON quotes;
CREATE POLICY "Kullanıcılar kendi kurum tekliflerini görür" ON quotes
  FOR ALL USING (organization_id = get_user_organization_id());

-- ORDERS RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm siparişleri görür" ON orders;
CREATE POLICY "Super admin tüm siparişleri görür" ON orders
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum siparişlerini görür" ON orders;
CREATE POLICY "Kullanıcılar kendi kurum siparişlerini görür" ON orders
  FOR ALL USING (organization_id = get_user_organization_id());

-- LEADS RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm leadleri görür" ON leads;
CREATE POLICY "Super admin tüm leadleri görür" ON leads
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum leadlerini görür" ON leads;
CREATE POLICY "Kullanıcılar kendi kurum leadlerini görür" ON leads
  FOR ALL USING (organization_id = get_user_organization_id());

-- CONTRACTS RLS
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm sözleşmeleri görür" ON contracts;
CREATE POLICY "Super admin tüm sözleşmeleri görür" ON contracts
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum sözleşmelerini görür" ON contracts;
CREATE POLICY "Kullanıcılar kendi kurum sözleşmelerini görür" ON contracts
  FOR ALL USING (organization_id = get_user_organization_id());

-- CALENDAR_EVENTS RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm etkinlikleri görür" ON calendar_events;
CREATE POLICY "Super admin tüm etkinlikleri görür" ON calendar_events
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum etkinliklerini görür" ON calendar_events;
CREATE POLICY "Kullanıcılar kendi kurum etkinliklerini görür" ON calendar_events
  FOR ALL USING (organization_id = get_user_organization_id());

-- CAMPAIGNS RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm kampanyaları görür" ON campaigns;
CREATE POLICY "Super admin tüm kampanyaları görür" ON campaigns
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum kampanyalarını görür" ON campaigns;
CREATE POLICY "Kullanıcılar kendi kurum kampanyalarını görür" ON campaigns
  FOR ALL USING (organization_id = get_user_organization_id());

-- COMPETITORS RLS
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm rakipleri görür" ON competitors;
CREATE POLICY "Super admin tüm rakipleri görür" ON competitors
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum rakiplerini görür" ON competitors;
CREATE POLICY "Kullanıcılar kendi kurum rakiplerini görür" ON competitors
  FOR ALL USING (organization_id = get_user_organization_id());

-- NOTIFICATIONS RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm bildirimleri görür" ON notifications;
CREATE POLICY "Super admin tüm bildirimleri görür" ON notifications
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi bildirimlerini görür" ON notifications;
CREATE POLICY "Kullanıcılar kendi bildirimlerini görür" ON notifications
  FOR SELECT USING (
    user_id = auth.uid() OR 
    (organization_id = get_user_organization_id() AND user_id IS NULL)
  );

-- COMMISSION_CONFIGS RLS
ALTER TABLE commission_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm prim ayarlarını görür" ON commission_configs;
CREATE POLICY "Super admin tüm prim ayarlarını görür" ON commission_configs
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Org admin kendi kurum prim ayarlarını görür" ON commission_configs;
CREATE POLICY "Org admin kendi kurum prim ayarlarını görür" ON commission_configs
  FOR ALL USING (
    is_org_admin() AND organization_id = get_user_organization_id()
  );

-- COMMISSION_KPI_INPUTS RLS
ALTER TABLE commission_kpi_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm KPI inputlarını görür" ON commission_kpi_inputs;
CREATE POLICY "Super admin tüm KPI inputlarını görür" ON commission_kpi_inputs
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum KPI inputlarını görür" ON commission_kpi_inputs;
CREATE POLICY "Kullanıcılar kendi kurum KPI inputlarını görür" ON commission_kpi_inputs
  FOR ALL USING (organization_id = get_user_organization_id());

-- COMMISSION_RESULTS RLS
ALTER TABLE commission_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm prim sonuçlarını görür" ON commission_results;
CREATE POLICY "Super admin tüm prim sonuçlarını görür" ON commission_results
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Kullanıcılar kendi kurum prim sonuçlarını görür" ON commission_results;
CREATE POLICY "Kullanıcılar kendi kurum prim sonuçlarını görür" ON commission_results
  FOR ALL USING (organization_id = get_user_organization_id());

-- 6) AUDIT LOG TABLOSU (KVKK İÇİN)
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, VIEW, EXPORT
  table_name VARCHAR(100) NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at);

-- Audit log RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin tüm logları görür" ON audit_logs;
CREATE POLICY "Super admin tüm logları görür" ON audit_logs
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "Org admin kendi kurum loglarını görür" ON audit_logs;
CREATE POLICY "Org admin kendi kurum loglarını görür" ON audit_logs
  FOR SELECT USING (
    is_org_admin() AND organization_id = get_user_organization_id()
  );

-- 7) ÖRNEK VERİ (İLK KURUM VE SÜPER ADMİN)
-- =====================================================

-- İlk kurum oluştur
INSERT INTO organizations (id, name, slug, subscription_plan, max_users)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'MFK Danışmanlık',
  'mfk-danismanlik',
  'enterprise',
  100
) ON CONFLICT (slug) DO NOTHING;

-- Mevcut verileri bu kuruma bağla (eğer organization_id null ise)
UPDATE users SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE sales_team SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE customers SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE opportunities SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE collections SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE sales_targets SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE crm_activities SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE products SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE quotes SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE orders SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE leads SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE contracts SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE calendar_events SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE campaigns SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE competitors SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE notifications SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE commission_configs SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE commission_kpi_inputs SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE commission_results SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;

-- 8) TRİGGER: Yeni kayıtlara otomatik organization_id ekle
-- =====================================================
CREATE OR REPLACE FUNCTION set_organization_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := get_user_organization_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Her tabloya trigger ekle
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN 
    SELECT unnest(ARRAY[
      'sales_team', 'customers', 'opportunities', 'collections', 'sales_targets',
      'crm_activities', 'crm_tasks', 'products', 'quotes', 'orders', 'leads',
      'contracts', 'calendar_events', 'campaigns', 'competitors', 'notifications',
      'commission_configs', 'commission_kpi_inputs', 'commission_results', 'swot_analyses'
    ])
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS set_org_id_%I ON %I;
      CREATE TRIGGER set_org_id_%I
        BEFORE INSERT ON %I
        FOR EACH ROW
        EXECUTE FUNCTION set_organization_id();
    ', t, t, t, t);
  END LOOP;
END;
$$;

-- =====================================================
-- ÖZET: ROL HİYERARŞİSİ
-- =====================================================
-- super_admin: Tüm kurumları ve verileri yönetir
-- org_admin: Kendi kurumunun tüm verilerini yönetir
-- manager: Kendi takımının verilerini görür
-- user: Sadece kendi verilerini görür
-- =====================================================
