-- =============================================
-- YENİ MODÜLLER İÇİN VERİTABANI ŞEMASI
-- =============================================

-- 1. ÜRÜN/HİZMET KATALOĞU
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  unit TEXT DEFAULT 'Adet',
  unit_price DECIMAL(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'TRY',
  tax_rate DECIMAL(5,2) DEFAULT 20,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TEKLİF YÖNETİMİ
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT UNIQUE,
  customer_id UUID REFERENCES customers(id),
  sales_person_id UUID REFERENCES sales_team(id),
  opportunity_id UUID REFERENCES opportunities(id),
  title TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  subtotal DECIMAL(15,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  discount_amount DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'TRY',
  valid_until DATE,
  notes TEXT,
  terms TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2b. TEKLİF KALEMLERİ
CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  description TEXT,
  quantity DECIMAL(15,2) DEFAULT 1,
  unit TEXT DEFAULT 'Adet',
  unit_price DECIMAL(15,2) DEFAULT 0,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 20,
  total_price DECIMAL(15,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SİPARİŞ YÖNETİMİ
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE,
  quote_id UUID REFERENCES quotes(id),
  customer_id UUID REFERENCES customers(id),
  sales_person_id UUID REFERENCES sales_team(id),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'in_progress', 'shipped', 'delivered', 'cancelled')),
  subtotal DECIMAL(15,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  discount_amount DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'TRY',
  order_date DATE DEFAULT CURRENT_DATE,
  delivery_date DATE,
  shipping_address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3b. SİPARİŞ KALEMLERİ
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  description TEXT,
  quantity DECIMAL(15,2) DEFAULT 1,
  unit TEXT DEFAULT 'Adet',
  unit_price DECIMAL(15,2) DEFAULT 0,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 20,
  total_price DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TAKVİM / ZİYARET PLANLAMA
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT DEFAULT 'meeting' CHECK (event_type IN ('meeting', 'visit', 'call', 'task', 'reminder', 'other')),
  sales_person_id UUID REFERENCES sales_team(id),
  customer_id UUID REFERENCES customers(id),
  opportunity_id UUID REFERENCES opportunities(id),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT false,
  location TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  reminder_minutes INTEGER DEFAULT 30,
  color TEXT DEFAULT '#3B82F6',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BİLDİRİM SİSTEMİ
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error', 'reminder')),
  related_type TEXT,
  related_id UUID,
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. LEAD (POTANSİYEL MÜŞTERİ) YÖNETİMİ
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT,
  contact_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT CHECK (source IN ('website', 'referral', 'cold_call', 'trade_show', 'social_media', 'advertisement', 'other')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'unqualified', 'converted')),
  sales_person_id UUID REFERENCES sales_team(id),
  industry TEXT,
  company_size TEXT,
  estimated_value DECIMAL(15,2),
  notes TEXT,
  converted_customer_id UUID REFERENCES customers(id),
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. SÖZLEŞME YÖNETİMİ
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number TEXT UNIQUE,
  customer_id UUID REFERENCES customers(id),
  sales_person_id UUID REFERENCES sales_team(id),
  title TEXT NOT NULL,
  type TEXT DEFAULT 'service' CHECK (type IN ('service', 'product', 'maintenance', 'subscription', 'other')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'active', 'expired', 'terminated', 'renewed')),
  start_date DATE,
  end_date DATE,
  value DECIMAL(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'TRY',
  payment_terms TEXT,
  auto_renewal BOOLEAN DEFAULT false,
  renewal_reminder_days INTEGER DEFAULT 30,
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. DÖKÜMAN YÖNETİMİ
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_url TEXT,
  file_type TEXT,
  file_size INTEGER,
  category TEXT CHECK (category IN ('quote', 'contract', 'invoice', 'presentation', 'report', 'other')),
  related_type TEXT,
  related_id UUID,
  uploaded_by UUID,
  description TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. RAKİP ANALİZİ
CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  website TEXT,
  description TEXT,
  strengths TEXT,
  weaknesses TEXT,
  market_position TEXT,
  price_level TEXT CHECK (price_level IN ('low', 'medium', 'high', 'premium')),
  main_products TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9b. RAKİP-FIRSAT İLİŞKİSİ
CREATE TABLE IF NOT EXISTS opportunity_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  threat_level TEXT CHECK (threat_level IN ('low', 'medium', 'high')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. KAMPANYA YÖNETİMİ
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('discount', 'bundle', 'seasonal', 'clearance', 'loyalty', 'other')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  start_date DATE,
  end_date DATE,
  budget DECIMAL(15,2),
  target_revenue DECIMAL(15,2),
  actual_revenue DECIMAL(15,2) DEFAULT 0,
  discount_percent DECIMAL(5,2),
  discount_amount DECIMAL(15,2),
  applicable_products UUID[],
  terms TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. AUDIT LOG (Değişiklik Takibi)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_email TEXT,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS POLİCYLERİ
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Tüm tablolar için authenticated kullanıcılara okuma izni
CREATE POLICY "Allow read for authenticated" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON quote_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON calendar_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON competitors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON opportunity_competitors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON audit_logs FOR SELECT TO authenticated USING (true);

-- Tüm tablolar için authenticated kullanıcılara yazma izni
CREATE POLICY "Allow all for authenticated" ON products FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON quotes FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON quote_items FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON orders FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON order_items FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON calendar_events FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON notifications FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON leads FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON contracts FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON documents FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON competitors FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON opportunity_competitors FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON campaigns FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON audit_logs FOR ALL TO authenticated USING (true);

-- Otomatik teklif/sipariş numarası oluşturma fonksiyonları
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quote_number IS NULL THEN
    NEW.quote_number := 'TKL-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('quote_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'SIP-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('order_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contract_number IS NULL THEN
    NEW.contract_number := 'SZL-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('contract_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sequence'ler oluştur
CREATE SEQUENCE IF NOT EXISTS quote_seq START 1;
CREATE SEQUENCE IF NOT EXISTS order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS contract_seq START 1;

-- Trigger'lar
DROP TRIGGER IF EXISTS set_quote_number ON quotes;
CREATE TRIGGER set_quote_number BEFORE INSERT ON quotes FOR EACH ROW EXECUTE FUNCTION generate_quote_number();

DROP TRIGGER IF EXISTS set_order_number ON orders;
CREATE TRIGGER set_order_number BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION generate_order_number();

DROP TRIGGER IF EXISTS set_contract_number ON contracts;
CREATE TRIGGER set_contract_number BEFORE INSERT ON contracts FOR EACH ROW EXECUTE FUNCTION generate_contract_number();
