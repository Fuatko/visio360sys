-- =====================================================
-- SATIŞ PRO - 6 AYLIK TREND DEMO VERİSİ
-- Dönem: 2025-08 → 2026-01
-- Hikaye: Sağlıklı → Uyarı → Kriz → HARD STOP
-- =====================================================

-- ÖNEMLİ: Bu script demo-data-comprehensive.sql'den SONRA çalıştırılmalı
-- Mevcut Ocak 2026 verilerini korur, önceki 5 ayı ekler

-- =====================================================
-- SATIŞ HEDEFLERİ (Sales Targets) - 6 Ay
-- =====================================================

-- Ağustos 2025 (Sağlıklı Başlangıç)
INSERT INTO sales_targets (id, rep_id, target_month, target_amount, actual_amount, organization_id)
VALUES 
  ('tgt_ayse_2025_08', 'st_rep_tr_001', '2025-08-01', 900000, 920000, 'org_demo_001'),
  ('tgt_burak_2025_08', 'st_rep_tr_002', '2025-08-01', 700000, 680000, 'org_demo_001'),
  ('tgt_john_2025_08', 'st_rep_eu_001', '2025-08-01', 500000, 520000, 'org_demo_001'),
  ('tgt_maria_2025_08', 'st_rep_eu_002', '2025-08-01', 450000, 440000, 'org_demo_001');

-- Eylül 2025 (Büyüme)
INSERT INTO sales_targets (id, rep_id, target_month, target_amount, actual_amount, organization_id)
VALUES 
  ('tgt_ayse_2025_09', 'st_rep_tr_001', '2025-09-01', 950000, 1050000, 'org_demo_001'),
  ('tgt_burak_2025_09', 'st_rep_tr_002', '2025-09-01', 750000, 720000, 'org_demo_001'),
  ('tgt_john_2025_09', 'st_rep_eu_001', '2025-09-01', 520000, 580000, 'org_demo_001'),
  ('tgt_maria_2025_09', 'st_rep_eu_002', '2025-09-01', 470000, 490000, 'org_demo_001');

-- Ekim 2025 (Zirve + İlk Uyarılar)
INSERT INTO sales_targets (id, rep_id, target_month, target_amount, actual_amount, organization_id)
VALUES 
  ('tgt_ayse_2025_10', 'st_rep_tr_001', '2025-10-01', 1000000, 1150000, 'org_demo_001'),
  ('tgt_burak_2025_10', 'st_rep_tr_002', '2025-10-01', 780000, 750000, 'org_demo_001'),
  ('tgt_john_2025_10', 'st_rep_eu_001', '2025-10-01', 550000, 680000, 'org_demo_001'),
  ('tgt_maria_2025_10', 'st_rep_eu_002', '2025-10-01', 490000, 510000, 'org_demo_001');

-- Kasım 2025 (Risk Oluşuyor)
INSERT INTO sales_targets (id, rep_id, target_month, target_amount, actual_amount, organization_id)
VALUES 
  ('tgt_ayse_2025_11', 'st_rep_tr_001', '2025-11-01', 1050000, 1100000, 'org_demo_001'),
  ('tgt_burak_2025_11', 'st_rep_tr_002', '2025-11-01', 800000, 680000, 'org_demo_001'),
  ('tgt_john_2025_11', 'st_rep_eu_001', '2025-11-01', 580000, 750000, 'org_demo_001'),
  ('tgt_maria_2025_11', 'st_rep_eu_002', '2025-11-01', 510000, 480000, 'org_demo_001');

-- Aralık 2025 (Yıl Sonu Baskısı)
INSERT INTO sales_targets (id, rep_id, target_month, target_amount, actual_amount, organization_id)
VALUES 
  ('tgt_ayse_2025_12', 'st_rep_tr_001', '2025-12-01', 1100000, 1080000, 'org_demo_001'),
  ('tgt_burak_2025_12', 'st_rep_tr_002', '2025-12-01', 850000, 620000, 'org_demo_001'),
  ('tgt_john_2025_12', 'st_rep_eu_001', '2025-12-01', 600000, 820000, 'org_demo_001'),
  ('tgt_maria_2025_12', 'st_rep_eu_002', '2025-12-01', 530000, 550000, 'org_demo_001');

-- =====================================================
-- KPI INPUTS - 6 Ay (Trend Hikayesi)
-- =====================================================

-- ========== AĞUSTOS 2025 (Sağlıklı) ==========
INSERT INTO commission_kpi_inputs (id, rep_id, period_year, period_month, sales_target, actual_sales, invoiced_amount, collected_amount, base_commission, notes, organization_id)
VALUES 
  -- Ayşe: İstikrarlı başlangıç
  ('kpi_ayse_2025_08', 'st_rep_tr_001', 2025, 8, 900000, 920000, 900000, 855000, 42000, 'Sağlıklı başlangıç', 'org_demo_001'),
  -- Burak: Normal
  ('kpi_burak_2025_08', 'st_rep_tr_002', 2025, 8, 700000, 680000, 650000, 617500, 32000, 'Hedefin biraz altında', 'org_demo_001'),
  -- John: Başlangıçta iyi
  ('kpi_john_2025_08', 'st_rep_eu_001', 2025, 8, 500000, 520000, 500000, 475000, 45000, 'İyi başlangıç, tahsilat sağlıklı', 'org_demo_001'),
  -- Maria: Normal
  ('kpi_maria_2025_08', 'st_rep_eu_002', 2025, 8, 450000, 440000, 420000, 399000, 28000, 'Stabil performans', 'org_demo_001');

-- ========== EYLÜL 2025 (Büyüme) ==========
INSERT INTO commission_kpi_inputs (id, rep_id, period_year, period_month, sales_target, actual_sales, invoiced_amount, collected_amount, base_commission, notes, organization_id)
VALUES 
  -- Ayşe: Hedef aşımı
  ('kpi_ayse_2025_09', 'st_rep_tr_001', 2025, 9, 950000, 1050000, 1000000, 920000, 45000, 'Güçlü ay', 'org_demo_001'),
  -- Burak: Gelişiyor
  ('kpi_burak_2025_09', 'st_rep_tr_002', 2025, 9, 750000, 720000, 700000, 665000, 34000, 'İyileşme var', 'org_demo_001'),
  -- John: Satış artıyor, tahsilat hala iyi
  ('kpi_john_2025_09', 'st_rep_eu_001', 2025, 9, 520000, 580000, 560000, 504000, 48000, 'Satış yükselişte, tahsilat %90', 'org_demo_001'),
  -- Maria: İstikrarlı
  ('kpi_maria_2025_09', 'st_rep_eu_002', 2025, 9, 470000, 490000, 470000, 446500, 30000, 'İyi ay', 'org_demo_001');

-- ========== EKİM 2025 (Zirve + İlk Uyarılar) ==========
INSERT INTO commission_kpi_inputs (id, rep_id, period_year, period_month, sales_target, actual_sales, invoiced_amount, collected_amount, base_commission, notes, organization_id)
VALUES 
  -- Ayşe: Zirve performans
  ('kpi_ayse_2025_10', 'st_rep_tr_001', 2025, 10, 1000000, 1150000, 1100000, 990000, 50000, 'Rekor ay!', 'org_demo_001'),
  -- Burak: Stabil
  ('kpi_burak_2025_10', 'st_rep_tr_002', 2025, 10, 780000, 750000, 720000, 648000, 35000, 'Hedef yakın', 'org_demo_001'),
  -- John: Satış patlıyor AMA tahsilat düşmeye başlıyor (%80)
  ('kpi_john_2025_10', 'st_rep_eu_001', 2025, 10, 550000, 680000, 650000, 520000, 52000, '⚠️ Satış yüksek ama tahsilat %80 düştü', 'org_demo_001'),
  -- Maria: Normal
  ('kpi_maria_2025_10', 'st_rep_eu_002', 2025, 10, 490000, 510000, 490000, 441000, 31000, 'Stabil devam', 'org_demo_001');

-- ========== KASIM 2025 (Risk Oluşuyor) ==========
INSERT INTO commission_kpi_inputs (id, rep_id, period_year, period_month, sales_target, actual_sales, invoiced_amount, collected_amount, base_commission, notes, organization_id)
VALUES 
  -- Ayşe: Hala güçlü
  ('kpi_ayse_2025_11', 'st_rep_tr_001', 2025, 11, 1050000, 1100000, 1050000, 892500, 48000, 'Güçlü devam', 'org_demo_001'),
  -- Burak: Düşüş var
  ('kpi_burak_2025_11', 'st_rep_tr_002', 2025, 11, 800000, 680000, 650000, 552500, 33000, 'Hedefin altında', 'org_demo_001'),
  -- John: UYARI! Tahsilat kritik düşük (%60) - HARD STOP riski
  ('kpi_john_2025_11', 'st_rep_eu_001', 2025, 11, 580000, 750000, 720000, 432000, 55000, '🚨 KRİTİK: Satış çok iyi ama tahsilat %60!', 'org_demo_001'),
  -- Maria: Hafif düşüş
  ('kpi_maria_2025_11', 'st_rep_eu_002', 2025, 11, 510000, 480000, 460000, 391000, 29000, 'Hafif düşüş', 'org_demo_001');

-- ========== ARALIK 2025 (Yıl Sonu Krizi) ==========
INSERT INTO commission_kpi_inputs (id, rep_id, period_year, period_month, sales_target, actual_sales, invoiced_amount, collected_amount, base_commission, notes, organization_id)
VALUES 
  -- Ayşe: Yıl sonu güçlü kapanış
  ('kpi_ayse_2025_12', 'st_rep_tr_001', 2025, 12, 1100000, 1080000, 1050000, 892500, 47000, 'Güçlü kapanış', 'org_demo_001'),
  -- Burak: Zor ay
  ('kpi_burak_2025_12', 'st_rep_tr_002', 2025, 12, 850000, 620000, 600000, 510000, 30000, 'Zor dönem', 'org_demo_001'),
  -- John: HARD STOP! Tahsilat %55
  ('kpi_john_2025_12', 'st_rep_eu_001', 2025, 12, 600000, 820000, 780000, 429000, 58000, '🔴 HARD STOP: Tahsilat %55, satış rekor', 'org_demo_001'),
  -- Maria: Toparlanma
  ('kpi_maria_2025_12', 'st_rep_eu_002', 2025, 12, 530000, 550000, 530000, 450500, 32000, 'Yıl sonu toparlanma', 'org_demo_001');

-- =====================================================
-- PRİM SONUÇLARI (Commission Results) - 6 Ay
-- =====================================================

-- ========== AĞUSTOS 2025 ==========
INSERT INTO commission_results (id, rep_id, period_year, period_month, sales_target, actual_sales, sales_attainment_ratio, invoiced_amount, collected_amount, collection_ratio, sales_score, collections_score, total_multiplier, base_commission, earned_commission, hard_stop, status, calculated_at, calculated_by, organization_id)
VALUES 
  -- Ayşe: %102 satış, %95 tahsilat → 1.02 çarpan
  ('res_ayse_2025_08', 'st_rep_tr_001', 2025, 8, 900000, 920000, 1.02, 900000, 855000, 0.95, 1.0, 1.0, 1.0, 42000, 42000, false, 'approved', '2025-09-01', 'usr_ops_001', 'org_demo_001'),
  -- Burak: %97 satış, %95 tahsilat
  ('res_burak_2025_08', 'st_rep_tr_002', 2025, 8, 700000, 680000, 0.97, 650000, 617500, 0.95, 0.85, 1.0, 0.91, 32000, 29120, false, 'approved', '2025-09-01', 'usr_ops_001', 'org_demo_001'),
  -- John: %104 satış, %95 tahsilat (iyi başlangıç!)
  ('res_john_2025_08', 'st_rep_eu_001', 2025, 8, 500000, 520000, 1.04, 500000, 475000, 0.95, 1.0, 1.0, 1.0, 45000, 45000, false, 'approved', '2025-09-01', 'usr_ops_001', 'org_demo_001'),
  -- Maria: %98 satış, %95 tahsilat
  ('res_maria_2025_08', 'st_rep_eu_002', 2025, 8, 450000, 440000, 0.98, 420000, 399000, 0.95, 0.85, 1.0, 0.91, 28000, 25480, false, 'approved', '2025-09-01', 'usr_ops_001', 'org_demo_001');

-- ========== EYLÜL 2025 ==========
INSERT INTO commission_results (id, rep_id, period_year, period_month, sales_target, actual_sales, sales_attainment_ratio, invoiced_amount, collected_amount, collection_ratio, sales_score, collections_score, total_multiplier, base_commission, earned_commission, hard_stop, status, calculated_at, calculated_by, organization_id)
VALUES 
  -- Ayşe: %110 satış, %92 tahsilat → güçlü
  ('res_ayse_2025_09', 'st_rep_tr_001', 2025, 9, 950000, 1050000, 1.10, 1000000, 920000, 0.92, 1.2, 0.8, 1.04, 45000, 46800, false, 'approved', '2025-10-01', 'usr_ops_001', 'org_demo_001'),
  -- Burak: %96 satış, %95 tahsilat
  ('res_burak_2025_09', 'st_rep_tr_002', 2025, 9, 750000, 720000, 0.96, 700000, 665000, 0.95, 0.85, 1.0, 0.91, 34000, 30940, false, 'approved', '2025-10-01', 'usr_ops_001', 'org_demo_001'),
  -- John: %111 satış, %90 tahsilat (hala iyi)
  ('res_john_2025_09', 'st_rep_eu_001', 2025, 9, 520000, 580000, 1.11, 560000, 504000, 0.90, 1.2, 0.8, 1.04, 48000, 49920, false, 'approved', '2025-10-01', 'usr_ops_001', 'org_demo_001'),
  -- Maria: %104 satış, %95 tahsilat
  ('res_maria_2025_09', 'st_rep_eu_002', 2025, 9, 470000, 490000, 1.04, 470000, 446500, 0.95, 1.0, 1.0, 1.0, 30000, 30000, false, 'approved', '2025-10-01', 'usr_ops_001', 'org_demo_001');

-- ========== EKİM 2025 (İlk Uyarılar) ==========
INSERT INTO commission_results (id, rep_id, period_year, period_month, sales_target, actual_sales, sales_attainment_ratio, invoiced_amount, collected_amount, collection_ratio, sales_score, collections_score, total_multiplier, base_commission, earned_commission, hard_stop, status, calculated_at, calculated_by, organization_id)
VALUES 
  -- Ayşe: %115 satış, %90 tahsilat → rekor
  ('res_ayse_2025_10', 'st_rep_tr_001', 2025, 10, 1000000, 1150000, 1.15, 1100000, 990000, 0.90, 1.2, 0.8, 1.04, 50000, 52000, false, 'approved', '2025-11-01', 'usr_ops_001', 'org_demo_001'),
  -- Burak: %96 satış, %90 tahsilat
  ('res_burak_2025_10', 'st_rep_tr_002', 2025, 10, 780000, 750000, 0.96, 720000, 648000, 0.90, 0.85, 0.8, 0.83, 35000, 29050, false, 'approved', '2025-11-01', 'usr_ops_001', 'org_demo_001'),
  -- John: %123 satış AMA tahsilat %80'e düştü ⚠️
  ('res_john_2025_10', 'st_rep_eu_001', 2025, 10, 550000, 680000, 1.23, 650000, 520000, 0.80, 1.4, 0.5, 0.92, 52000, 47840, false, 'approved', '2025-11-01', 'usr_ops_001', 'org_demo_001'),
  -- Maria: %104 satış, %90 tahsilat
  ('res_maria_2025_10', 'st_rep_eu_002', 2025, 10, 490000, 510000, 1.04, 490000, 441000, 0.90, 1.0, 0.8, 0.92, 31000, 28520, false, 'approved', '2025-11-01', 'usr_ops_001', 'org_demo_001');

-- ========== KASIM 2025 (Risk!) ==========
INSERT INTO commission_results (id, rep_id, period_year, period_month, sales_target, actual_sales, sales_attainment_ratio, invoiced_amount, collected_amount, collection_ratio, sales_score, collections_score, total_multiplier, base_commission, earned_commission, hard_stop, status, calculated_at, calculated_by, organization_id)
VALUES 
  -- Ayşe: %105 satış, %85 tahsilat
  ('res_ayse_2025_11', 'st_rep_tr_001', 2025, 11, 1050000, 1100000, 1.05, 1050000, 892500, 0.85, 1.0, 0.8, 0.92, 48000, 44160, false, 'approved', '2025-12-01', 'usr_ops_001', 'org_demo_001'),
  -- Burak: %85 satış, %85 tahsilat
  ('res_burak_2025_11', 'st_rep_tr_002', 2025, 11, 800000, 680000, 0.85, 650000, 552500, 0.85, 0.6, 0.8, 0.68, 33000, 22440, false, 'approved', '2025-12-01', 'usr_ops_001', 'org_demo_001'),
  -- John: %129 satış AMA tahsilat %60 → HARD STOP! 🔴
  ('res_john_2025_11', 'st_rep_eu_001', 2025, 11, 580000, 750000, 1.29, 720000, 432000, 0.60, 1.4, 0.0, 0.0, 55000, 0, true, 'approved', '2025-12-01', 'usr_ops_001', 'org_demo_001'),
  -- Maria: %94 satış, %85 tahsilat
  ('res_maria_2025_11', 'st_rep_eu_002', 2025, 11, 510000, 480000, 0.94, 460000, 391000, 0.85, 0.85, 0.8, 0.83, 29000, 24070, false, 'approved', '2025-12-01', 'usr_ops_001', 'org_demo_001');

-- ========== ARALIK 2025 (Kriz Devam) ==========
INSERT INTO commission_results (id, rep_id, period_year, period_month, sales_target, actual_sales, sales_attainment_ratio, invoiced_amount, collected_amount, collection_ratio, sales_score, collections_score, total_multiplier, base_commission, earned_commission, hard_stop, status, calculated_at, calculated_by, organization_id)
VALUES 
  -- Ayşe: %98 satış, %85 tahsilat
  ('res_ayse_2025_12', 'st_rep_tr_001', 2025, 12, 1100000, 1080000, 0.98, 1050000, 892500, 0.85, 0.85, 0.8, 0.83, 47000, 39010, false, 'approved', '2026-01-01', 'usr_ops_001', 'org_demo_001'),
  -- Burak: %73 satış, %85 tahsilat
  ('res_burak_2025_12', 'st_rep_tr_002', 2025, 12, 850000, 620000, 0.73, 600000, 510000, 0.85, 0.6, 0.8, 0.68, 30000, 20400, false, 'approved', '2026-01-01', 'usr_ops_001', 'org_demo_001'),
  -- John: %137 satış AMA tahsilat %55 → HARD STOP DEVAM! 🔴🔴
  ('res_john_2025_12', 'st_rep_eu_001', 2025, 12, 600000, 820000, 1.37, 780000, 429000, 0.55, 1.4, 0.0, 0.0, 58000, 0, true, 'approved', '2026-01-01', 'usr_ops_001', 'org_demo_001'),
  -- Maria: %104 satış, %85 tahsilat
  ('res_maria_2025_12', 'st_rep_eu_002', 2025, 12, 530000, 550000, 1.04, 530000, 450500, 0.85, 1.0, 0.8, 0.92, 32000, 29440, false, 'approved', '2026-01-01', 'usr_ops_001', 'org_demo_001');

-- =====================================================
-- TAHSİLATLAR (Collections) - Trend İçin
-- =====================================================

-- John'un Nordic Retail ile büyüyen tahsilat sorunu
INSERT INTO collections (id, customer_id, invoice_number, amount, issue_date, due_date, status, paid_date, paid_amount, sales_rep_id, organization_id)
VALUES 
  -- Ekim: Gecikmeye başlıyor
  ('col_trend_001', 'cust_eu_001', 'INV-2025-0050', 320000, '2025-10-15', '2025-11-14', 'Kısmi Ödeme', '2025-12-10', 256000, 'st_rep_eu_001', 'org_demo_001'),
  -- Kasım: Daha kötü
  ('col_trend_002', 'cust_eu_001', 'INV-2025-0075', 400000, '2025-11-20', '2025-12-20', 'Kısmi Ödeme', '2026-01-15', 240000, 'st_rep_eu_001', 'org_demo_001'),
  -- Aralık: Vadesi geçmiş birikti
  ('col_trend_003', 'cust_eu_001', 'INV-2025-0098', 380000, '2025-12-15', '2026-01-14', 'Vadesi Geçmiş', NULL, 0, 'st_rep_eu_001', 'org_demo_001');

-- Ayşe'nin istikrarlı tahsilatları
INSERT INTO collections (id, customer_id, invoice_number, amount, issue_date, due_date, status, paid_date, paid_amount, sales_rep_id, organization_id)
VALUES 
  ('col_trend_004', 'cust_tr_001', 'INV-2025-0045', 450000, '2025-09-10', '2025-10-10', 'Tamamlandı', '2025-10-08', 450000, 'st_rep_tr_001', 'org_demo_001'),
  ('col_trend_005', 'cust_tr_001', 'INV-2025-0062', 520000, '2025-10-20', '2025-11-19', 'Tamamlandı', '2025-11-18', 520000, 'st_rep_tr_001', 'org_demo_001'),
  ('col_trend_006', 'cust_tr_003', 'INV-2025-0078', 680000, '2025-11-05', '2025-12-05', 'Tamamlandı', '2025-12-03', 680000, 'st_rep_tr_001', 'org_demo_001');

-- =====================================================
-- KAZANILMIŞ FIRSATLAR (Won Deals) - Trend
-- =====================================================

INSERT INTO opportunities (id, title, customer_id, value, stage, probability, expected_close_date, sales_rep_id, notes, organization_id, created_at)
VALUES 
  -- John'un yüksek satışları (ama tahsilat sorunu)
  ('opp_trend_001', 'Nordic Retail - Q3 Genişleme', 'cust_eu_001', 320000, 'Kazanıldı', 100, '2025-10-15', 'st_rep_eu_001', 'Büyük genişleme paketi', 'org_demo_001', '2025-09-01'),
  ('opp_trend_002', 'Nordic Retail - Ek Lisans', 'cust_eu_001', 400000, 'Kazanıldı', 100, '2025-11-20', 'st_rep_eu_001', 'Ek 100 kullanıcı', 'org_demo_001', '2025-10-15'),
  ('opp_trend_003', 'Nordic Retail - Q4 Upgrade', 'cust_eu_001', 380000, 'Kazanıldı', 100, '2025-12-15', 'st_rep_eu_001', 'Enterprise upgrade', 'org_demo_001', '2025-11-20'),
  
  -- Ayşe'nin dengeli satışları
  ('opp_trend_004', 'Delta Eğitim - Yaz Kampanyası', 'cust_tr_001', 450000, 'Kazanıldı', 100, '2025-09-10', 'st_rep_tr_001', 'Yaz dönemi paketi', 'org_demo_001', '2025-08-15'),
  ('opp_trend_005', 'Beta Holding - Pilot', 'cust_tr_003', 520000, 'Kazanıldı', 100, '2025-10-20', 'st_rep_tr_001', 'Pilot proje', 'org_demo_001', '2025-09-25'),
  ('opp_trend_006', 'Beta Holding - Genişleme', 'cust_tr_003', 680000, 'Kazanıldı', 100, '2025-11-05', 'st_rep_tr_001', 'Pilot sonrası genişleme', 'org_demo_001', '2025-10-20');

-- =====================================================
-- EK BİLDİRİMLER (Trend için)
-- =====================================================

INSERT INTO notifications (id, user_id, title, message, type, is_read, link, organization_id, created_at)
VALUES 
  -- Kasım uyarısı
  ('notif_trend_001', 'usr_rep_eu_001', '⚠️ Tahsilat Uyarısı', 'Kasım 2025 tahsilat oranınız %60 ile kritik seviyede. HARD STOP riski!', 'warning', true, '/collections', 'org_demo_001', '2025-12-01'),
  -- Aralık HARD STOP
  ('notif_trend_002', 'usr_rep_eu_001', '🔴 HARD STOP Uygulandı', 'Aralık 2025 döneminde tahsilat oranınız %55. Priminiz: 0 TL', 'error', true, '/bonus', 'org_demo_001', '2026-01-01'),
  -- Sales Director bilgilendirme
  ('notif_trend_003', 'usr_sd_001', '📊 Kasım Raporu: HARD STOP Tespit', 'John Smith Kasım ayında HARD STOP durumuna düştü. Tahsilat: %60', 'warning', true, '/analytics/commissions', 'org_demo_001', '2025-12-01'),
  -- Finance bilgilendirme
  ('notif_trend_004', 'usr_fin_001', '💰 Aralık Prim Raporu Hazır', 'Aralık 2025 prim hesaplaması tamamlandı. 1 HARD STOP tespit edildi.', 'info', true, '/bonus', 'org_demo_001', '2026-01-02');

-- =====================================================
-- CRM AKTİVİTELERİ (Trend için)
-- =====================================================

INSERT INTO crm_activities (id, customer_id, rep_id, type, subject, notes, activity_date, organization_id)
VALUES 
  -- Nordic Retail tahsilat takibi
  ('act_trend_001', 'cust_eu_001', 'st_rep_eu_001', 'Arama', 'Ekim faturası takibi', 'Ödeme gecikeceğini belirttiler.', '2025-11-20', 'org_demo_001'),
  ('act_trend_002', 'cust_eu_001', 'st_rep_eu_001', 'E-posta', 'Kasım faturası hatırlatma', 'Resmi hatırlatma gönderildi.', '2025-12-21', 'org_demo_001'),
  ('act_trend_003', 'cust_eu_001', 'st_am_eu_001', 'Toplantı', 'CFO ile acil görüşme', 'Nakit akış sorunu yaşadıklarını belirttiler.', '2026-01-10', 'org_demo_001'),
  
  -- Ayşe'nin düzenli takipleri
  ('act_trend_004', 'cust_tr_003', 'st_rep_tr_001', 'Toplantı', 'Beta Holding Q4 planlama', 'Genişleme projesi konuşuldu.', '2025-10-15', 'org_demo_001'),
  ('act_trend_005', 'cust_tr_003', 'st_rep_tr_001', 'Demo', 'Yeni modül tanıtımı', 'C-level ekibe demo yapıldı.', '2025-11-25', 'org_demo_001');

-- =====================================================
-- ÖZET: 6 AYLIK TREND HİKAYESİ
-- =====================================================
-- 
-- AY        | GENEL DURUM              | JOHN DURUMU
-- -------------------------------------------------------
-- 2025-08   | Sağlıklı başlangıç       | İyi (Satış %104, Tahsilat %95)
-- 2025-09   | Büyüme                   | İyi (Satış %111, Tahsilat %90)
-- 2025-10   | Zirve + İlk uyarılar     | ⚠️ (Satış %123, Tahsilat %80)
-- 2025-11   | Risk oluşuyor            | 🔴 HARD STOP (Satış %129, Tahsilat %60)
-- 2025-12   | Yıl sonu krizi           | 🔴🔴 HARD STOP (Satış %137, Tahsilat %55)
-- 2026-01   | Sistem devrede           | 🔴🔴🔴 HARD STOP (Satış %133, Tahsilat %50)
-- 
-- CEO-01 Dashboard'da görülecek:
-- ✅ Bookings: Ağustos'tan Ocak'a sürekli artış
-- ❌ Collections Ratio: %95 → %50 düşüş (John etkisi)
-- ❌ Hard Stop Rate: Kasım'dan itibaren artış
-- 
-- "Satış büyürken nakit bozulmuş. Sistem bunu otomatik yakalıyor."
-- =====================================================
