\set ON_ERROR_STOP 1
-- Faz 1d: test-1a/1b/1c'den sonra (aynı veri)
\set ORG '''00000000-0000-0000-0000-0000000000a1'''
SELECT id AS lab FROM customers WHERE tax_number='1234567890' \gset
SELECT id AS ucuz FROM customers WHERE tax_number='3234567890' \gset
SELECT o.id AS lab_order FROM proc_orders o WHERE o.vendor_id=:'lab' AND status='received' \gset
SELECT o.id AS bilim_order FROM proc_orders o JOIN customers c ON c.id=o.vendor_id WHERE c.tax_number='2234567890' AND o.status='received' \gset
INSERT INTO customers (id, organization_id, name) VALUES ('00000000-0000-0000-0000-0000000000d9', :ORG, 'Tedarikçi olmayan cari');
-- Paraşüt senkronundan gelen alış faturaları
INSERT INTO parasut_documents (id, organization_id, kind, parasut_id, doc_no, issue_date, customer_id, tax_number, contact_name, category, net_total, net_total_try) VALUES
 ('00000000-0000-0000-0000-0000000000b1', :ORG, 'purchase_bill', 'p1', 'LAB-001', current_date, :'lab', '1234567890', 'Lab Market', 'Laboratuvar', 4200, 4200),
 ('00000000-0000-0000-0000-0000000000b2', :ORG, 'purchase_bill', 'p2', 'BLM-001', current_date, NULL, '2234567890', 'Bilim AŞ', 'Laboratuvar', 2800, 2800),
 ('00000000-0000-0000-0000-0000000000b3', :ORG, 'purchase_bill', 'p3', 'UCZ-001', current_date, :'ucuz', '3234567890', 'Ucuz Ltd', 'Kırtasiye', 900, 900),
 ('00000000-0000-0000-0000-0000000000b4', :ORG, 'purchase_bill', 'p4', 'UCZ-002', current_date, :'ucuz', '3234567890', 'Ucuz Ltd', 'Kırtasiye', 1200, 1200),
 ('00000000-0000-0000-0000-0000000000b5', :ORG, 'purchase_bill', 'p5', 'X-001', current_date, '00000000-0000-0000-0000-0000000000d9', NULL, 'Başka', NULL, 500, 500),
 ('00000000-0000-0000-0000-0000000000b6', :ORG, 'purchase_bill', 'p6', 'LAB-000', current_date - 30, :'lab', '1234567890', 'Lab Market', NULL, 100, 100);
INSERT INTO parasut_document_lines (organization_id, document_id, description, quantity, unit_price, vat_rate, net_total_try) VALUES
 (:ORG, '00000000-0000-0000-0000-0000000000b4', 'Fotokopi kağıdı', 10, 100, 20, 1000), (:ORG, '00000000-0000-0000-0000-0000000000b4', 'Kalem', 20, 10, 20, 200);

-- Mali işler: öneriler ve eşleştirme
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false); SET ROLE authenticated;
SELECT doc_no, order_no, invoice_net, expected_net, diff_pct, within_tolerance FROM proc_invoice_suggestions() ORDER BY doc_no;
SELECT set_config('test.lab_order', :'lab_order', false);
DO $$ BEGIN PERFORM proc_invoice_match(current_setting('test.lab_order')::uuid, '00000000-0000-0000-0000-0000000000b6', NULL); RAISE EXCEPTION 'TEST FAIL tarih';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK tarih kontrolü: %', SQLERRM; END $$;
SELECT proc_invoice_match(:'lab_order', '00000000-0000-0000-0000-0000000000b1', NULL)->>'status' AS "LAB-001 (matched)";
SELECT status AS "lab siparişi closed" FROM proc_orders WHERE id=:'lab_order';
DO $$ BEGIN PERFORM proc_invoice_match((SELECT id FROM proc_orders WHERE status='received' LIMIT 1), '00000000-0000-0000-0000-0000000000b6', NULL); RAISE EXCEPTION 'TEST FAIL tedarikçi';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK tedarikçi uyuşmazlığı: %', SQLERRM; END $$;
SELECT proc_invoice_match(:'bilim_order', '00000000-0000-0000-0000-0000000000b2', 'Nakliye eklenmiş')->>'status' AS "BLM-001 vergi no ile, fark (price_variance)";
DO $$ BEGIN PERFORM proc_invoice_match_decide((SELECT id FROM proc_invoice_matches WHERE status='price_variance'), true, ''); RAISE EXCEPTION 'TEST FAIL gerekçe';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK gerekçe zorunlu'; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
-- Satınalma farkı onaylayamaz
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false); SET ROLE authenticated;
DO $$ BEGIN PERFORM proc_invoice_match_decide((SELECT id FROM proc_invoice_matches WHERE status='price_variance'), true, 'x'); RAISE EXCEPTION 'TEST FAIL yetki';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK satınalma farkı onaylayamaz'; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false); SET ROLE authenticated;
SELECT proc_invoice_match_decide((SELECT id FROM proc_invoice_matches WHERE status='price_variance'), true, 'Nakliye bedeli sözleşmeye uygun')->>'status';
SELECT status AS "talep closed" FROM proc_requests WHERE id='00000000-0000-0000-0000-0000000000f1';
DO $$ BEGIN IF (SELECT actual FROM proc_budget_status WHERE amount=20000) <> 7000 OR (SELECT commitment FROM proc_budget_status WHERE amount=20000) <> 0 THEN RAISE EXCEPTION 'TEST FAIL bütçe %', (SELECT row_to_json(b) FROM proc_budget_status b WHERE amount=20000); END IF;
  RAISE NOTICE 'OK bütçe: taahhüt gerçekleşene döndü (7.000)'; END $$;

-- Siparişsiz faturalar
SELECT doc_no, vendor_name, invoice_net, decision FROM proc_unordered_invoices(NULL) ORDER BY doc_no;
SELECT proc_invoice_no_order('00000000-0000-0000-0000-0000000000b3', 'Acil kırtasiye, kasadan');
SELECT proc_order_from_invoice('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000c2', NULL, 'Telefonla verildi') AS retro \gset
SELECT order_no AS "sonradan sipariş" FROM proc_orders WHERE id = :'retro';
SELECT status, is_retroactive, subtotal, (SELECT count(*) FROM proc_order_lines l WHERE l.order_id=o.id) kalem FROM proc_orders o WHERE is_retroactive;
SELECT doc_no, decision FROM proc_unordered_invoices(NULL) ORDER BY doc_no;

-- Geri alma ve yeniden eşleştirme
SELECT proc_invoice_unmatch((SELECT id FROM proc_invoice_matches WHERE parasut_document_id='00000000-0000-0000-0000-0000000000b1' AND status='matched'), 'Yanlış fatura seçildi');
SELECT status AS "lab tekrar received", invoiced_net FROM proc_orders WHERE id=:'lab_order';
SELECT proc_invoice_match(:'lab_order', '00000000-0000-0000-0000-0000000000b1', NULL)->>'status' AS "yeniden eşleşti";

-- KPI
SELECT k->>'unordered_pct' AS "siparişsiz % (2200/9200=23.9)", k->>'savings' tasarruf, k->>'three_quote_pct' uyum, k->>'on_time_pct' zamaninda, k->>'avg_quotes' ort_teklif, k->'vendors'->>'total' tedarikci
  FROM proc_kpis(current_date - 365, current_date) k;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- Değerlendirme (satınalma)
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false); SET ROLE authenticated;
SELECT m->>'on_time_pct' zamaninda, m->>'reject_pct' red, m->>'price_rank_avg' sira, m->'suggested' AS oneri FROM proc_vendor_metrics(:'lab', current_date - 365, current_date) m;
DO $$ BEGIN PERFORM proc_vendor_evaluate((SELECT id FROM customers WHERE tax_number='1234567890'), jsonb_build_object('period_start', current_date - 365, 'period_end', current_date, 'decision', 'approve',
    'criteria', jsonb_build_array(jsonb_build_object('key','quality','weight',30,'score',2), jsonb_build_object('key','on_time','weight',25,'score',5), jsonb_build_object('key','price','weight',15,'score',3))));
  RAISE EXCEPTION 'TEST FAIL karar'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK önerilenden farklı karar gerekçe ister: %', SQLERRM; END $$;
SELECT proc_vendor_evaluate(:'lab', jsonb_build_object('period_start', current_date - 365, 'period_end', current_date, 'decision', 'conditional', 'action_note', 'Ambalaj iyileştirilecek',
    'criteria', jsonb_build_array(jsonb_build_object('key','quality','weight',30,'score',2), jsonb_build_object('key','on_time','weight',25,'score',5), jsonb_build_object('key','price','weight',15,'score',3)))) AS sonuc;
SELECT status, grade, score, next_evaluation_due > current_date AS yeni_tarih FROM proc_vendor_profiles WHERE customer_id=:'lab';
SELECT source, status, corrective_action FROM proc_vendor_issues WHERE source='evaluation';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- Görünürlük
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); SET ROLE authenticated;
SELECT count(*) AS "öğretmen eşleşme görür (0)" FROM proc_invoice_matches;
SELECT proc_kpis(current_date - 30, current_date) IS NULL AS "öğretmene KPI yok";
SELECT count(*) AS "öğretmene siparişsiz fatura yok (0)" FROM proc_unordered_invoices(NULL);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000008',false); SET ROLE authenticated;
SELECT count(*) AS "Revenue kurumu (0)" FROM proc_invoice_matches; RESET ROLE;
SELECT 'TEST 1d TAMAM' AS sonuc;
