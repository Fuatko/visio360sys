-- =====================================================
-- SATIŞ PRO - TAM KAPSAMLI DEMO VERİSİ
-- Tüm roller, iş akışları, HARD STOP örneği dahil
-- =====================================================

-- ÖNEMLİ: Bu script'i çalıştırmadan önce:
-- 1. multi-tenant-schema.sql çalıştırılmış olmalı
-- 2. saved-views-schema.sql çalıştırılmış olmalı

-- =====================================================
-- 1) DEMO KURUM
-- =====================================================
INSERT INTO organizations (id, name, slug, subscription_plan, max_users, is_active)
VALUES (
  'org_demo_001',
  'Demo Şirketi A.Ş.',
  'demo-sirketi',
  'enterprise',
  50,
  true
) ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- 2) BÖLGELER (Regions)
-- =====================================================
-- Sales team tablosunda region sütunu var, ayrı tablo yok
-- Bölgeler: Türkiye, EU

-- =====================================================
-- 3) SATIŞ EKİBİ (Sales Team) - Tüm Roller
-- =====================================================

-- CEO
INSERT INTO sales_team (id, name, email, phone, department, region, is_active, photo_url, organization_id)
VALUES (
  'st_ceo_001',
  'Elif Aydın',
  'ceo@demo.local',
  '+90 532 001 0001',
  'Yönetim',
  'Genel',
  true,
  null,
  'org_demo_001'
);

-- Sales Director
INSERT INTO sales_team (id, name, email, phone, department, region, is_active, photo_url, organization_id)
VALUES (
  'st_sd_001',
  'Mert Demir',
  'sd@demo.local',
  '+90 532 002 0001',
  'Satış',
  'Genel',
  true,
  null,
  'org_demo_001'
);

-- Finance Manager
INSERT INTO sales_team (id, name, email, phone, department, region, is_active, photo_url, organization_id)
VALUES (
  'st_fin_001',
  'Zeynep Kara',
  'finance@demo.local',
  '+90 532 003 0001',
  'Finans',
  'Genel',
  true,
  null,
  'org_demo_001'
);

-- Sales Ops
INSERT INTO sales_team (id, name, email, phone, department, region, is_active, photo_url, organization_id)
VALUES (
  'st_ops_001',
  'Can Yıldız',
  'salesops@demo.local',
  '+90 532 004 0001',
  'Satış Operasyon',
  'Genel',
  true,
  null,
  'org_demo_001'
);

-- TR-SMB Team Manager
INSERT INTO sales_team (id, name, email, phone, department, region, is_active, photo_url, organization_id)
VALUES (
  'st_mgr_tr_001',
  'Ali Öztürk',
  'manager.tr@demo.local',
  '+90 532 005 0001',
  'Satış',
  'Türkiye',
  true,
  null,
  'org_demo_001'
);

-- EU-Enterprise Team Manager
INSERT INTO sales_team (id, name, email, phone, department, region, is_active, photo_url, organization_id)
VALUES (
  'st_mgr_eu_001',
  'Hans Weber',
  'manager.eu@demo.local',
  '+49 170 001 0001',
  'Satış',
  'EU',
  true,
  null,
  'org_demo_001'
);

-- TR Sales Rep 1 - Ayşe (Başarılı temsilci)
INSERT INTO sales_team (id, name, email, phone, department, region, is_active, photo_url, organization_id)
VALUES (
  'st_rep_tr_001',
  'Ayşe Yılmaz',
  'ayse@demo.local',
  '+90 532 006 0001',
  'Satış',
  'Türkiye',
  true,
  null,
  'org_demo_001'
);

-- TR Sales Rep 2 - Burak
INSERT INTO sales_team (id, name, email, phone, department, region, is_active, photo_url, organization_id)
VALUES (
  'st_rep_tr_002',
  'Burak Çelik',
  'burak@demo.local',
  '+90 532 006 0002',
  'Satış',
  'Türkiye',
  true,
  null,
  'org_demo_001'
);

-- EU Sales Rep 1 - John (HARD STOP örneği)
INSERT INTO sales_team (id, name, email, phone, department, region, is_active, photo_url, organization_id)
VALUES (
  'st_rep_eu_001',
  'John Smith',
  'john@demo.local',
  '+49 170 002 0001',
  'Satış',
  'EU',
  true,
  null,
  'org_demo_001'
);

-- EU Sales Rep 2 - Maria
INSERT INTO sales_team (id, name, email, phone, department, region, is_active, photo_url, organization_id)
VALUES (
  'st_rep_eu_002',
  'Maria Schmidt',
  'maria@demo.local',
  '+49 170 002 0002',
  'Satış',
  'EU',
  true,
  null,
  'org_demo_001'
);

-- Account Manager TR
INSERT INTO sales_team (id, name, email, phone, department, region, is_active, photo_url, organization_id)
VALUES (
  'st_am_tr_001',
  'Mehmet Aksoy',
  'mehmet@demo.local',
  '+90 532 007 0001',
  'Müşteri Yönetimi',
  'Türkiye',
  true,
  null,
  'org_demo_001'
);

-- Account Manager EU
INSERT INTO sales_team (id, name, email, phone, department, region, is_active, photo_url, organization_id)
VALUES (
  'st_am_eu_001',
  'Anna Müller',
  'anna@demo.local',
  '+49 170 003 0001',
  'Müşteri Yönetimi',
  'EU',
  true,
  null,
  'org_demo_001'
);

-- =====================================================
-- 4) KULLANICILAR (Users) - Auth için
-- =====================================================
-- NOT: Şifreler Supabase Auth üzerinden ayarlanmalı
-- Demo şifresi: Demo123!

-- CEO
INSERT INTO users (id, email, name, role, is_active, organization_id, is_org_admin)
VALUES (
  'usr_ceo_001',
  'ceo@demo.local',
  'Elif Aydın',
  'ceo',
  true,
  'org_demo_001',
  false
);

-- Sales Director
INSERT INTO users (id, email, name, role, is_active, organization_id, is_org_admin)
VALUES (
  'usr_sd_001',
  'sd@demo.local',
  'Mert Demir',
  'sales_director',
  true,
  'org_demo_001',
  false
);

-- Finance
INSERT INTO users (id, email, name, role, is_active, organization_id, is_org_admin)
VALUES (
  'usr_fin_001',
  'finance@demo.local',
  'Zeynep Kara',
  'finance',
  true,
  'org_demo_001',
  false
);

-- Sales Ops
INSERT INTO users (id, email, name, role, is_active, organization_id, is_org_admin)
VALUES (
  'usr_ops_001',
  'salesops@demo.local',
  'Can Yıldız',
  'sales_ops',
  true,
  'org_demo_001',
  true  -- Org admin yetkisi
);

-- Manager TR
INSERT INTO users (id, email, name, role, is_active, organization_id, is_org_admin)
VALUES (
  'usr_mgr_tr_001',
  'manager.tr@demo.local',
  'Ali Öztürk',
  'manager',
  true,
  'org_demo_001',
  false
);

-- Manager EU
INSERT INTO users (id, email, name, role, is_active, organization_id, is_org_admin)
VALUES (
  'usr_mgr_eu_001',
  'manager.eu@demo.local',
  'Hans Weber',
  'manager',
  true,
  'org_demo_001',
  false
);

-- Rep TR - Ayşe
INSERT INTO users (id, email, name, role, is_active, organization_id, is_org_admin)
VALUES (
  'usr_rep_tr_001',
  'ayse@demo.local',
  'Ayşe Yılmaz',
  'user',
  true,
  'org_demo_001',
  false
);

-- Rep TR - Burak
INSERT INTO users (id, email, name, role, is_active, organization_id, is_org_admin)
VALUES (
  'usr_rep_tr_002',
  'burak@demo.local',
  'Burak Çelik',
  'user',
  true,
  'org_demo_001',
  false
);

-- Rep EU - John (HARD STOP)
INSERT INTO users (id, email, name, role, is_active, organization_id, is_org_admin)
VALUES (
  'usr_rep_eu_001',
  'john@demo.local',
  'John Smith',
  'user',
  true,
  'org_demo_001',
  false
);

-- Rep EU - Maria
INSERT INTO users (id, email, name, role, is_active, organization_id, is_org_admin)
VALUES (
  'usr_rep_eu_002',
  'maria@demo.local',
  'Maria Schmidt',
  'user',
  true,
  'org_demo_001',
  false
);

-- Account Manager TR
INSERT INTO users (id, email, name, role, is_active, organization_id, is_org_admin)
VALUES (
  'usr_am_tr_001',
  'mehmet@demo.local',
  'Mehmet Aksoy',
  'account_manager',
  true,
  'org_demo_001',
  false
);

-- Account Manager EU
INSERT INTO users (id, email, name, role, is_active, organization_id, is_org_admin)
VALUES (
  'usr_am_eu_001',
  'anna@demo.local',
  'Anna Müller',
  'account_manager',
  true,
  'org_demo_001',
  false
);

-- =====================================================
-- 5) MÜŞTERİLER (Customers)
-- =====================================================

-- TR Müşteriler
INSERT INTO customers (id, name, email, phone, address, segment, region, status, organization_id)
VALUES 
  ('cust_tr_001', 'Delta Eğitim A.Ş.', 'info@delta.com.tr', '+90 212 111 0001', 'İstanbul, Türkiye', 'SMB', 'Türkiye', 'Aktif', 'org_demo_001'),
  ('cust_tr_002', 'Alfa Teknoloji Ltd.', 'info@alfa.com.tr', '+90 212 111 0002', 'Ankara, Türkiye', 'SMB', 'Türkiye', 'Aktif', 'org_demo_001'),
  ('cust_tr_003', 'Beta Holding A.Ş.', 'info@beta.com.tr', '+90 212 111 0003', 'İzmir, Türkiye', 'Enterprise', 'Türkiye', 'Aktif', 'org_demo_001'),
  ('cust_tr_004', 'Gamma Lojistik', 'info@gamma.com.tr', '+90 212 111 0004', 'Bursa, Türkiye', 'SMB', 'Türkiye', 'Riskli', 'org_demo_001'),
  ('cust_tr_005', 'Epsilon Sağlık', 'info@epsilon.com.tr', '+90 212 111 0005', 'Antalya, Türkiye', 'Mid-Market', 'Türkiye', 'Aktif', 'org_demo_001');

-- EU Müşteriler
INSERT INTO customers (id, name, email, phone, address, segment, region, status, organization_id)
VALUES 
  ('cust_eu_001', 'Nordic Retail GmbH', 'info@nordic.de', '+49 30 222 0001', 'Berlin, Germany', 'Enterprise', 'EU', 'Riskli', 'org_demo_001'),
  ('cust_eu_002', 'Alpine Solutions AG', 'info@alpine.ch', '+41 44 333 0001', 'Zürich, Switzerland', 'Enterprise', 'EU', 'Aktif', 'org_demo_001'),
  ('cust_eu_003', 'Mediterranean Trade SRL', 'info@medtrade.it', '+39 06 444 0001', 'Roma, Italy', 'Mid-Market', 'EU', 'Aktif', 'org_demo_001'),
  ('cust_eu_004', 'Baltic Tech OÜ', 'info@baltic.ee', '+372 5 555 0001', 'Tallinn, Estonia', 'SMB', 'EU', 'Aktif', 'org_demo_001'),
  ('cust_eu_005', 'Iberian Systems S.L.', 'info@iberian.es', '+34 91 666 0001', 'Madrid, Spain', 'Mid-Market', 'EU', 'Pasif', 'org_demo_001');

-- =====================================================
-- 6) ÜRÜNLER (Products)
-- =====================================================
INSERT INTO products (id, name, code, description, category, unit_price, currency, is_active, organization_id)
VALUES 
  ('prod_001', 'Temel Lisans Paketi', 'LIC-BASIC', 'Temel kullanıcı lisansı (10 kullanıcı)', 'Lisans', 50000, 'TRY', true, 'org_demo_001'),
  ('prod_002', 'Profesyonel Lisans Paketi', 'LIC-PRO', 'Profesyonel kullanıcı lisansı (50 kullanıcı)', 'Lisans', 200000, 'TRY', true, 'org_demo_001'),
  ('prod_003', 'Enterprise Lisans Paketi', 'LIC-ENT', 'Kurumsal lisans (sınırsız kullanıcı)', 'Lisans', 500000, 'TRY', true, 'org_demo_001'),
  ('prod_004', 'Yıllık Destek Paketi', 'SUP-ANNUAL', '12 ay teknik destek', 'Destek', 75000, 'TRY', true, 'org_demo_001'),
  ('prod_005', 'Eğitim Paketi', 'TRN-STD', 'Standart kullanıcı eğitimi (2 gün)', 'Hizmet', 25000, 'TRY', true, 'org_demo_001'),
  ('prod_006', 'Özel Entegrasyon', 'INT-CUSTOM', 'Özel API entegrasyonu', 'Hizmet', 150000, 'TRY', true, 'org_demo_001'),
  ('prod_007', 'EU Enterprise License', 'LIC-EU-ENT', 'European enterprise license', 'License', 50000, 'EUR', true, 'org_demo_001'),
  ('prod_008', 'EU Support Package', 'SUP-EU-PRE', 'Premium EU support (24/7)', 'Support', 15000, 'EUR', true, 'org_demo_001');

-- =====================================================
-- 7) SATIŞ HEDEFLERİ (Sales Targets) - 2026 Q1
-- =====================================================

-- Ocak 2026
INSERT INTO sales_targets (id, rep_id, target_month, target_amount, actual_amount, organization_id)
VALUES 
  ('tgt_ayse_2026_01', 'st_rep_tr_001', '2026-01-01', 1000000, 1200000, 'org_demo_001'),
  ('tgt_burak_2026_01', 'st_rep_tr_002', '2026-01-01', 800000, 650000, 'org_demo_001'),
  ('tgt_john_2026_01', 'st_rep_eu_001', '2026-01-01', 600000, 800000, 'org_demo_001'),
  ('tgt_maria_2026_01', 'st_rep_eu_002', '2026-01-01', 500000, 480000, 'org_demo_001');

-- Şubat 2026
INSERT INTO sales_targets (id, rep_id, target_month, target_amount, actual_amount, organization_id)
VALUES 
  ('tgt_ayse_2026_02', 'st_rep_tr_001', '2026-02-01', 1100000, 950000, 'org_demo_001'),
  ('tgt_burak_2026_02', 'st_rep_tr_002', '2026-02-01', 850000, 720000, 'org_demo_001'),
  ('tgt_john_2026_02', 'st_rep_eu_001', '2026-02-01', 650000, 550000, 'org_demo_001'),
  ('tgt_maria_2026_02', 'st_rep_eu_002', '2026-02-01', 550000, 610000, 'org_demo_001');

-- =====================================================
-- 8) FIRSATLAR (Opportunities)
-- =====================================================

-- Kazanılmış Fırsatlar
INSERT INTO opportunities (id, title, customer_id, value, stage, probability, expected_close_date, sales_rep_id, notes, organization_id, created_at)
VALUES 
  ('opp_001', 'Delta Eğitim - 200 Kullanıcı Lisans', 'cust_tr_001', 1200000, 'Kazanıldı', 100, '2026-01-20', 'st_rep_tr_001', '200 kullanıcı lisansı + destek paketi', 'org_demo_001', '2026-01-06'),
  ('opp_002', 'Nordic Retail - Enterprise Paket', 'cust_eu_001', 800000, 'Kazanıldı', 100, '2026-01-25', 'st_rep_eu_001', 'Enterprise paket + onboarding', 'org_demo_001', '2026-01-08'),
  ('opp_003', 'Alfa Teknoloji - Pro Lisans', 'cust_tr_002', 450000, 'Kazanıldı', 100, '2026-01-15', 'st_rep_tr_002', 'Profesyonel paket + eğitim', 'org_demo_001', '2026-01-03'),
  ('opp_004', 'Alpine Solutions - EU Enterprise', 'cust_eu_002', 650000, 'Kazanıldı', 100, '2026-02-10', 'st_rep_eu_002', 'EU enterprise license + premium support', 'org_demo_001', '2026-01-20');

-- Açık Fırsatlar (Pipeline)
INSERT INTO opportunities (id, title, customer_id, value, stage, probability, expected_close_date, sales_rep_id, notes, organization_id, created_at)
VALUES 
  ('opp_005', 'Beta Holding - Kurumsal Dönüşüm', 'cust_tr_003', 2500000, 'Müzakere', 75, '2026-03-15', 'st_rep_tr_001', 'Tam kurumsal dönüşüm projesi', 'org_demo_001', '2026-01-25'),
  ('opp_006', 'Mediterranean Trade - Mid-Market', 'cust_eu_003', 380000, 'Teklif', 50, '2026-03-20', 'st_rep_eu_002', 'Yeni pazar genişlemesi', 'org_demo_001', '2026-02-01'),
  ('opp_007', 'Gamma Lojistik - Yenileme', 'cust_tr_004', 320000, 'Görüşme', 30, '2026-04-01', 'st_rep_tr_002', 'Mevcut sözleşme yenileme', 'org_demo_001', '2026-02-05'),
  ('opp_008', 'Baltic Tech - SMB Paketi', 'cust_eu_004', 180000, 'Yeni', 20, '2026-04-15', 'st_rep_eu_001', 'Yeni müşteri adayı', 'org_demo_001', '2026-02-10'),
  ('opp_009', 'Epsilon Sağlık - Sağlık Modülü', 'cust_tr_005', 850000, 'Teklif', 60, '2026-03-25', 'st_rep_tr_001', 'Özel sağlık sektörü çözümü', 'org_demo_001', '2026-02-08');

-- Kaybedilmiş Fırsatlar
INSERT INTO opportunities (id, title, customer_id, value, stage, probability, expected_close_date, sales_rep_id, notes, organization_id, created_at)
VALUES 
  ('opp_010', 'Iberian Systems - İptal', 'cust_eu_005', 420000, 'Kaybedildi', 0, '2026-02-01', 'st_rep_eu_001', 'Bütçe kısıtlaması nedeniyle iptal', 'org_demo_001', '2025-12-15');

-- =====================================================
-- 9) TAHSİLATLAR (Collections)
-- =====================================================

-- Delta Eğitim faturaları
INSERT INTO collections (id, customer_id, invoice_number, amount, issue_date, due_date, status, paid_date, paid_amount, sales_rep_id, organization_id)
VALUES 
  ('col_001', 'cust_tr_001', 'INV-2026-0001', 1200000, '2026-01-20', '2026-02-19', 'Kısmi Ödeme', '2026-02-10', 1100000, 'st_rep_tr_001', 'org_demo_001'),
  ('col_002', 'cust_tr_001', 'INV-2026-0015', 100000, '2026-02-01', '2026-03-03', 'Açık', NULL, 0, 'st_rep_tr_001', 'org_demo_001');

-- Nordic Retail faturaları (HARD STOP örneği - düşük tahsilat)
INSERT INTO collections (id, customer_id, invoice_number, amount, issue_date, due_date, status, paid_date, paid_amount, sales_rep_id, organization_id)
VALUES 
  ('col_003', 'cust_eu_001', 'INV-2026-0002', 800000, '2026-01-26', '2026-03-12', 'Kısmi Ödeme', '2026-02-28', 400000, 'st_rep_eu_001', 'org_demo_001'),
  ('col_004', 'cust_eu_001', 'INV-2026-0016', 200000, '2026-02-15', '2026-04-01', 'Vadesi Geçmiş', NULL, 0, 'st_rep_eu_001', 'org_demo_001');

-- Alfa Teknoloji
INSERT INTO collections (id, customer_id, invoice_number, amount, issue_date, due_date, status, paid_date, paid_amount, sales_rep_id, organization_id)
VALUES 
  ('col_005', 'cust_tr_002', 'INV-2026-0003', 450000, '2026-01-15', '2026-02-14', 'Tamamlandı', '2026-02-12', 450000, 'st_rep_tr_002', 'org_demo_001');

-- Alpine Solutions
INSERT INTO collections (id, customer_id, invoice_number, amount, issue_date, due_date, status, paid_date, paid_amount, sales_rep_id, organization_id)
VALUES 
  ('col_006', 'cust_eu_002', 'INV-2026-0004', 650000, '2026-02-10', '2026-03-27', 'Açık', NULL, 0, 'st_rep_eu_002', 'org_demo_001');

-- Gamma Lojistik (Riskli müşteri - vadesi geçmiş)
INSERT INTO collections (id, customer_id, invoice_number, amount, issue_date, due_date, status, paid_date, paid_amount, sales_rep_id, organization_id)
VALUES 
  ('col_007', 'cust_tr_004', 'INV-2025-0098', 180000, '2025-11-15', '2025-12-15', 'Vadesi Geçmiş', NULL, 0, 'st_rep_tr_002', 'org_demo_001'),
  ('col_008', 'cust_tr_004', 'INV-2025-0112', 95000, '2025-12-20', '2026-01-19', 'Vadesi Geçmiş', NULL, 0, 'st_rep_tr_002', 'org_demo_001');

-- Mediterranean Trade
INSERT INTO collections (id, customer_id, invoice_number, amount, issue_date, due_date, status, paid_date, paid_amount, sales_rep_id, organization_id)
VALUES 
  ('col_009', 'cust_eu_003', 'INV-2026-0005', 220000, '2026-01-28', '2026-02-27', 'Tamamlandı', '2026-02-25', 220000, 'st_rep_eu_002', 'org_demo_001');

-- =====================================================
-- 10) CRM AKTİVİTELERİ (Activities)
-- =====================================================

INSERT INTO crm_activities (id, customer_id, rep_id, type, subject, notes, activity_date, organization_id)
VALUES 
  -- Delta Eğitim aktiviteleri
  ('act_001', 'cust_tr_001', 'st_rep_tr_001', 'Arama', 'İhtiyaç analizi görüşmesi', 'Okul kampüsü için 200 kullanıcı lisans + destek ihtiyacı belirlendi.', '2026-01-07', 'org_demo_001'),
  ('act_002', 'cust_tr_001', 'st_rep_tr_001', 'Toplantı', 'Teklif sunumu', 'Detaylı teklif sunuldu, olumlu geri dönüş.', '2026-01-12', 'org_demo_001'),
  ('act_003', 'cust_tr_001', 'st_am_tr_001', 'Arama', 'Tahsilat takibi', 'Kalan 100K için ödeme planı görüşüldü.', '2026-02-15', 'org_demo_001'),
  
  -- Nordic Retail aktiviteleri
  ('act_004', 'cust_eu_001', 'st_rep_eu_001', 'Toplantı', 'Teklif sunumu', 'Enterprise paket + 1 yıllık sözleşme konuşuldu.', '2026-01-10', 'org_demo_001'),
  ('act_005', 'cust_eu_001', 'st_rep_eu_001', 'E-posta', 'Tahsilat hatırlatma', 'Vadesi geçen fatura için hatırlatma gönderildi.', '2026-03-15', 'org_demo_001'),
  ('act_006', 'cust_eu_001', 'st_am_eu_001', 'Arama', 'CFO ile görüşme', 'Ödeme takvimi için CFO ile görüşme yapıldı.', '2026-03-20', 'org_demo_001'),
  
  -- Beta Holding
  ('act_007', 'cust_tr_003', 'st_rep_tr_001', 'Toplantı', 'Keşif toplantısı', 'Kurumsal dönüşüm ihtiyaçları belirlendi.', '2026-01-28', 'org_demo_001'),
  ('act_008', 'cust_tr_003', 'st_rep_tr_001', 'Demo', 'Ürün demosu', 'C-level ekibe demo yapıldı.', '2026-02-05', 'org_demo_001'),
  
  -- Gamma Lojistik (Riskli)
  ('act_009', 'cust_tr_004', 'st_am_tr_001', 'Arama', 'Tahsilat görüşmesi', 'Finansal zorluklar yaşadıklarını belirttiler.', '2026-01-20', 'org_demo_001'),
  ('act_010', 'cust_tr_004', 'st_am_tr_001', 'E-posta', 'Ödeme planı teklifi', 'Taksitli ödeme planı önerisi gönderildi.', '2026-02-01', 'org_demo_001');

-- =====================================================
-- 11) CRM GÖREVLERİ (Tasks)
-- =====================================================

INSERT INTO crm_tasks (id, customer_id, assigned_to, title, description, due_date, priority, status, organization_id)
VALUES 
  -- Yüksek öncelikli görevler
  ('task_001', 'cust_tr_001', 'st_am_tr_001', 'Takip: Kalan ödeme', 'Delta Eğitim kalan 100K TL için takip', '2026-03-01', 'Yüksek', 'Beklemede', 'org_demo_001'),
  ('task_002', 'cust_eu_001', 'st_rep_eu_001', 'Tahsilat planı: CFO ile ödeme takvimi', 'Nordic Retail vadesi geçmiş 400K EUR için plan', '2026-03-25', 'Kritik', 'Beklemede', 'org_demo_001'),
  ('task_003', 'cust_tr_003', 'st_rep_tr_001', 'Teklif hazırla: Beta Holding', '2.5M TL kurumsal dönüşüm teklifi hazırla', '2026-02-28', 'Yüksek', 'Devam Ediyor', 'org_demo_001'),
  
  -- Normal görevler
  ('task_004', 'cust_eu_002', 'st_rep_eu_002', 'Sözleşme takibi', 'Alpine Solutions sözleşme imzası takibi', '2026-03-15', 'Normal', 'Beklemede', 'org_demo_001'),
  ('task_005', 'cust_tr_004', 'st_am_tr_001', 'Ödeme planı onayı', 'Gamma Lojistik taksit planı onayı al', '2026-03-10', 'Yüksek', 'Beklemede', 'org_demo_001'),
  ('task_006', 'cust_eu_003', 'st_rep_eu_002', 'Demo ayarla', 'Mediterranean Trade için ürün demosu ayarla', '2026-03-05', 'Normal', 'Tamamlandı', 'org_demo_001');

-- =====================================================
-- 12) PRİM KONFİGÜRASYONU (Commission Config)
-- =====================================================

INSERT INTO commission_configs (id, name, is_active, config_json, organization_id)
VALUES (
  'cfg_2026_v1',
  '2026 Prim Kuralları v1',
  true,
  '{
    "effective_from": "2026-01-01",
    "sales_weight": 0.6,
    "collections_weight": 0.4,
    "hard_stop_threshold": 0.70,
    "payment_delay_months": 1
  }',
  'org_demo_001'
);

-- =====================================================
-- 13) PRİM EŞIK DEĞERLERİ (Score Thresholds)
-- =====================================================

-- Satış Skorları
INSERT INTO sales_score_thresholds (id, min_ratio, max_ratio, score, organization_id)
VALUES 
  ('sst_001', 0.00, 0.69, 0.0, 'org_demo_001'),
  ('sst_002', 0.70, 0.89, 0.6, 'org_demo_001'),
  ('sst_003', 0.90, 0.99, 0.85, 'org_demo_001'),
  ('sst_004', 1.00, 1.09, 1.0, 'org_demo_001'),
  ('sst_005', 1.10, 1.19, 1.2, 'org_demo_001'),
  ('sst_006', 1.20, 999.99, 1.4, 'org_demo_001');

-- Tahsilat Skorları
INSERT INTO collections_score_thresholds (id, min_ratio, max_ratio, score, organization_id)
VALUES 
  ('cst_001', 0.00, 0.69, 0.0, 'org_demo_001'),
  ('cst_002', 0.70, 0.84, 0.5, 'org_demo_001'),
  ('cst_003', 0.85, 0.94, 0.8, 'org_demo_001'),
  ('cst_004', 0.95, 0.99, 1.0, 'org_demo_001'),
  ('cst_005', 1.00, 999.99, 1.2, 'org_demo_001');

-- =====================================================
-- 14) KPI INPUTS - Ocak 2026
-- =====================================================

INSERT INTO commission_kpi_inputs (id, rep_id, period_year, period_month, sales_target, actual_sales, invoiced_amount, collected_amount, base_commission, notes, organization_id)
VALUES 
  -- Ayşe - Başarılı (Hedef aşımı + iyi tahsilat)
  ('kpi_ayse_2026_01', 'st_rep_tr_001', 2026, 1, 1000000, 1200000, 1200000, 1100000, 50000, 'Hedef aşıldı, tahsilat güçlü', 'org_demo_001'),
  
  -- Burak - Orta performans
  ('kpi_burak_2026_01', 'st_rep_tr_002', 2026, 1, 800000, 650000, 450000, 450000, 35000, 'Hedefin altında kaldı', 'org_demo_001'),
  
  -- John - HARD STOP (Satış iyi ama tahsilat %50)
  ('kpi_john_2026_01', 'st_rep_eu_001', 2026, 1, 600000, 800000, 800000, 400000, 60000, 'Satış iyi ama tahsilat kritik düşük!', 'org_demo_001'),
  
  -- Maria - Normal performans
  ('kpi_maria_2026_01', 'st_rep_eu_002', 2026, 1, 500000, 480000, 220000, 220000, 30000, 'Hedefe yakın', 'org_demo_001');

-- =====================================================
-- 15) PRİM SONUÇLARI - Ocak 2026 (Commission Results)
-- =====================================================

INSERT INTO commission_results (id, rep_id, period_year, period_month, sales_target, actual_sales, sales_attainment_ratio, invoiced_amount, collected_amount, collection_ratio, sales_score, collections_score, total_multiplier, base_commission, earned_commission, hard_stop, status, calculated_at, calculated_by, organization_id)
VALUES 
  -- Ayşe: Satış %120, Tahsilat %91.7 → Çarpan 1.04 → 52K prim
  ('res_ayse_2026_01', 'st_rep_tr_001', 2026, 1, 
   1000000, 1200000, 1.20,  -- Satış: hedefin %120'si
   1200000, 1100000, 0.917, -- Tahsilat: %91.7
   1.4,   -- Sales score (1.2+ = 1.4)
   0.8,   -- Collections score (%85-94 = 0.8)
   1.04,  -- (1.4 × 0.6) + (0.8 × 0.4) = 0.84 + 0.32 = 1.16? Hayır: (1.4*0.6)+(0.8*0.4) = 0.84+0.32 = 1.16
   50000, 58000, -- 50K × 1.16 = 58K
   false, 'approved', NOW(), 'usr_ops_001', 'org_demo_001'),
   
  -- Burak: Satış %81.25, Tahsilat %100 → Çarpan 0.6 → 21K prim
  ('res_burak_2026_01', 'st_rep_tr_002', 2026, 1,
   800000, 650000, 0.8125, -- Satış: hedefin %81.25'i
   450000, 450000, 1.0,    -- Tahsilat: %100
   0.6,   -- Sales score (%70-89 = 0.6)
   1.2,   -- Collections score (%100+ = 1.2)
   0.84,  -- (0.6 × 0.6) + (1.2 × 0.4) = 0.36 + 0.48 = 0.84
   35000, 29400, -- 35K × 0.84 = 29.4K
   false, 'approved', NOW(), 'usr_ops_001', 'org_demo_001'),
   
  -- John: Satış %133, Tahsilat %50 → HARD STOP → 0 prim
  ('res_john_2026_01', 'st_rep_eu_001', 2026, 1,
   600000, 800000, 1.333,  -- Satış: hedefin %133'ü (çok iyi!)
   800000, 400000, 0.50,   -- Tahsilat: sadece %50 (HARD STOP!)
   1.4,   -- Sales score (1.2+ = 1.4)
   0.0,   -- Collections score (%0-69 = 0.0) + HARD STOP
   0.0,   -- HARD STOP: Çarpan = 0
   60000, 0, -- 60K × 0 = 0 (HARD STOP!)
   true, 'approved', NOW(), 'usr_ops_001', 'org_demo_001'),
   
  -- Maria: Satış %96, Tahsilat %100 → Çarpan 0.99 → 29.7K prim
  ('res_maria_2026_01', 'st_rep_eu_002', 2026, 1,
   500000, 480000, 0.96,   -- Satış: hedefin %96'sı
   220000, 220000, 1.0,    -- Tahsilat: %100
   0.85,  -- Sales score (%90-99 = 0.85)
   1.2,   -- Collections score (%100+ = 1.2)
   0.99,  -- (0.85 × 0.6) + (1.2 × 0.4) = 0.51 + 0.48 = 0.99
   30000, 29700, -- 30K × 0.99 = 29.7K
   false, 'approved', NOW(), 'usr_ops_001', 'org_demo_001');

-- =====================================================
-- 16) LEADS (Potansiyel Müşteriler)
-- =====================================================

INSERT INTO leads (id, company_name, contact_name, contact_email, contact_phone, source, status, assigned_to, notes, organization_id)
VALUES 
  ('lead_001', 'Zeta Yazılım', 'Ahmet Koç', 'ahmet@zeta.com.tr', '+90 533 100 0001', 'Web Sitesi', 'Yeni', 'st_rep_tr_001', 'İletişim formundan geldi, demo talep etti', 'org_demo_001'),
  ('lead_002', 'Theta Mühendislik', 'Fatma Öz', 'fatma@theta.com.tr', '+90 533 100 0002', 'Referans', 'İletişimde', 'st_rep_tr_002', 'Delta Eğitim referansıyla geldi', 'org_demo_001'),
  ('lead_003', 'Kappa Solutions', 'Peter Brown', 'peter@kappa.co.uk', '+44 20 100 0001', 'Fuar', 'Nitelikli', 'st_rep_eu_001', 'CeBIT fuarından tanıştık', 'org_demo_001'),
  ('lead_004', 'Lambda Tech', 'Sophie Martin', 'sophie@lambda.fr', '+33 1 100 0001', 'LinkedIn', 'Yeni', 'st_rep_eu_002', 'LinkedIn üzerinden ilgilendi', 'org_demo_001');

-- =====================================================
-- 17) SÖZLEŞMELER (Contracts)
-- =====================================================

INSERT INTO contracts (id, customer_id, title, contract_number, start_date, end_date, value, status, notes, organization_id)
VALUES 
  ('con_001', 'cust_tr_001', 'Delta Eğitim - Yıllık Lisans', 'CTR-2026-0001', '2026-01-20', '2027-01-19', 1200000, 'Aktif', '200 kullanıcı + destek', 'org_demo_001'),
  ('con_002', 'cust_eu_001', 'Nordic Retail - Enterprise', 'CTR-2026-0002', '2026-01-25', '2027-01-24', 800000, 'Aktif', 'Enterprise paket', 'org_demo_001'),
  ('con_003', 'cust_tr_002', 'Alfa Teknoloji - Pro Lisans', 'CTR-2026-0003', '2026-01-15', '2027-01-14', 450000, 'Aktif', 'Profesyonel paket', 'org_demo_001'),
  ('con_004', 'cust_tr_004', 'Gamma Lojistik - Yenileme', 'CTR-2025-0098', '2025-06-01', '2026-05-31', 275000, 'Sona Eriyor', 'Yenileme bekleniyor', 'org_demo_001');

-- =====================================================
-- 18) TAKVİM ETKİNLİKLERİ (Calendar Events)
-- =====================================================

INSERT INTO calendar_events (id, title, description, start_date, end_date, event_type, location, attendees, created_by, organization_id)
VALUES 
  ('evt_001', 'Beta Holding - Final Sunum', 'Kurumsal dönüşüm final sunumu', '2026-03-10 10:00:00', '2026-03-10 12:00:00', 'Toplantı', 'Beta Holding Merkez Ofis', 'Ayşe Yılmaz, Ali Öztürk', 'st_rep_tr_001', 'org_demo_001'),
  ('evt_002', 'Q1 Satış Değerlendirme', 'Çeyrek sonu performans değerlendirmesi', '2026-04-01 14:00:00', '2026-04-01 16:00:00', 'İç Toplantı', 'Konferans Odası A', 'Tüm Satış Ekibi', 'st_sd_001', 'org_demo_001'),
  ('evt_003', 'Nordic Retail - Tahsilat Toplantısı', 'CFO ile ödeme planı görüşmesi', '2026-03-25 15:00:00', '2026-03-25 16:00:00', 'Video Konferans', 'Zoom', 'John Smith, Anna Müller', 'st_rep_eu_001', 'org_demo_001'),
  ('evt_004', 'Epsilon Sağlık - Demo', 'Sağlık modülü demosu', '2026-03-08 11:00:00', '2026-03-08 13:00:00', 'Demo', 'Epsilon Sağlık Ofis', 'Ayşe Yılmaz', 'st_rep_tr_001', 'org_demo_001');

-- =====================================================
-- 19) BİLDİRİMLER (Notifications)
-- =====================================================

INSERT INTO notifications (id, user_id, title, message, type, is_read, link, organization_id)
VALUES 
  -- John için HARD STOP bildirimi
  ('notif_001', 'usr_rep_eu_001', 'PRİM UYARISI: Hard Stop Uygulandı', 'Ocak 2026 döneminde tahsilat oranınız %50 ile %70 eşiğinin altında kaldığı için priminiz 0 olarak hesaplandı.', 'error', false, '/bonus', 'org_demo_001'),
  
  -- Ayşe için başarı bildirimi
  ('notif_002', 'usr_rep_tr_001', 'Tebrikler! Hedef Aşıldı', 'Ocak 2026 döneminde satış hedefinizi %120 oranında aştınız!', 'success', false, '/performance', 'org_demo_001'),
  
  -- Mehmet için tahsilat uyarısı
  ('notif_003', 'usr_am_tr_001', 'Tahsilat Takibi Gerekli', 'Gamma Lojistik müşterinizde 275K TL vadesi geçmiş bakiye bulunmaktadır.', 'warning', false, '/collections', 'org_demo_001'),
  
  -- Can için KPI input hatırlatması
  ('notif_004', 'usr_ops_001', 'KPI Girişi Hatırlatma', 'Şubat 2026 dönemi KPI girişleri henüz tamamlanmadı.', 'info', false, '/bonus', 'org_demo_001');

-- =====================================================
-- 20) AUDIT LOG
-- =====================================================

INSERT INTO audit_logs (id, organization_id, user_id, action, table_name, record_id, old_data, new_data, created_at)
VALUES 
  ('log_001', 'org_demo_001', 'usr_ops_001', 'CREATE', 'commission_configs', 'cfg_2026_v1', NULL, '{"name": "2026 Prim Kuralları v1"}', '2026-01-01 09:00:00'),
  ('log_002', 'org_demo_001', 'usr_ops_001', 'CREATE', 'commission_results', 'res_john_2026_01', NULL, '{"hard_stop": true, "earned_commission": 0}', '2026-02-01 10:15:00'),
  ('log_003', 'org_demo_001', 'usr_rep_tr_001', 'CREATE', 'opportunities', 'opp_001', NULL, '{"title": "Delta Eğitim - 200 Kullanıcı Lisans", "value": 1200000}', '2026-01-06 14:30:00'),
  ('log_004', 'org_demo_001', 'usr_rep_tr_001', 'UPDATE', 'opportunities', 'opp_001', '{"stage": "Müzakere"}', '{"stage": "Kazanıldı"}', '2026-01-18 16:45:00');

-- =====================================================
-- ÖZET: DEMO VERİ İSTATİSTİKLERİ
-- =====================================================
-- Kullanıcılar: 12 (CEO, SD, Finance, SalesOps, 2 Manager, 4 Rep, 2 AM)
-- Müşteriler: 10 (5 TR, 5 EU)
-- Ürünler: 8
-- Fırsatlar: 10 (4 kazanılmış, 5 açık, 1 kaybedilmiş)
-- Tahsilatlar: 9 fatura
-- Aktiviteler: 10
-- Görevler: 6
-- KPI Inputs: 4 (Ocak 2026)
-- Prim Sonuçları: 4 (1 HARD STOP dahil)
-- Leads: 4
-- Sözleşmeler: 4
-- Takvim: 4
-- Bildirimler: 4
-- =====================================================

-- =====================================================
-- DEMO GİRİŞ BİLGİLERİ
-- =====================================================
-- E-posta                  Rol              Şifre
-- --------------------------------------------------------
-- ceo@demo.local          CEO              Demo123!
-- sd@demo.local           Sales Director   Demo123!
-- finance@demo.local      Finance          Demo123!
-- salesops@demo.local     Sales Ops        Demo123!
-- manager.tr@demo.local   Manager (TR)     Demo123!
-- manager.eu@demo.local   Manager (EU)     Demo123!
-- ayse@demo.local         Rep (TR) ✓       Demo123!
-- burak@demo.local        Rep (TR)         Demo123!
-- john@demo.local         Rep (EU) ⚠️      Demo123!
-- maria@demo.local        Rep (EU)         Demo123!
-- mehmet@demo.local       AM (TR)          Demo123!
-- anna@demo.local         AM (EU)          Demo123!
-- =====================================================

-- ✓ Ayşe: Başarılı temsilci örneği (hedef aşımı, iyi tahsilat)
-- ⚠️ John: HARD STOP örneği (satış iyi ama tahsilat %50)
