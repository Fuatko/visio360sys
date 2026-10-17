\set ON_ERROR_STOP 1
\set B '''00000000-0000-0000-0000-000000000006'''
-- Satınalma: tedarikçiler
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false); SET ROLE authenticated;
SELECT proc_vendor_upsert('{"name":"Lab Market","tax_number":"1234567890","email":"a@lab","status":"approved"}') IS NOT NULL AS v1;
SELECT proc_vendor_upsert('{"name":"Bilim AŞ","tax_number":"2234567890","status":"approved"}') IS NOT NULL AS v2;
SELECT proc_vendor_upsert('{"name":"Ucuz Ltd","tax_number":"3234567890"}') IS NOT NULL AS v3;
SELECT proc_vendor_upsert('{"name":"Aynı vergi no","tax_number":"1234567890","phone":"555"}') = (SELECT id FROM customers WHERE tax_number='1234567890') AS "vergi no ile eşleşti";
SELECT name, relation_roles, p.status, next_evaluation_due IS NOT NULL AS deg_tarihi FROM customers c JOIN proc_vendor_profiles p ON p.customer_id=c.id ORDER BY name;
DO $$ BEGIN PERFORM proc_vendor_upsert('{"name":"X","tax_number":"12"}'); RAISE EXCEPTION 'TEST FAIL vkn'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK vkn: %', SQLERRM; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
UPDATE proc_policies SET three_quote_threshold = 5000, approved_vendor_list_required = true, budget_check='warn';

-- RFQ: onaylı talep (f1, ₺8.000 > 5.000 eşik → asgari 3 teklif)
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false); SET ROLE authenticated;
SELECT proc_rfq_create(ARRAY['00000000-0000-0000-0000-0000000000f1']::uuid[], NULL) AS rfq \gset
SELECT rfq_no, status, min_quotes_required, (SELECT count(*) FROM proc_rfq_lines WHERE rfq_id=:'rfq') kalem FROM proc_rfqs;
SELECT status AS "talep sourcing" FROM proc_requests WHERE id='00000000-0000-0000-0000-0000000000f1';
INSERT INTO proc_rfq_vendors (rfq_id, vendor_id) SELECT :'rfq', id FROM customers WHERE tax_number IN ('1234567890','2234567890');
DO $$ BEGIN INSERT INTO proc_rfq_vendors (rfq_id, vendor_id) SELECT (SELECT id FROM proc_rfqs LIMIT 1), id FROM customers WHERE tax_number='3234567890'; RAISE EXCEPTION 'TEST FAIL onaylı liste'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK onaylı liste: %', SQLERRM; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
UPDATE proc_policies SET approved_vendor_list_required = false;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false); SET ROLE authenticated;
INSERT INTO proc_rfq_vendors (rfq_id, vendor_id) SELECT :'rfq', id FROM customers WHERE tax_number='3234567890';
SELECT proc_rfq_send(:'rfq');
DO $$ BEGIN UPDATE proc_rfq_lines SET quantity = 99; RAISE EXCEPTION 'TEST FAIL kilit'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK kilit: %', SQLERRM; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- Tedarikçiler linkten (anon)
SELECT v.share_token AS t1 FROM proc_rfq_vendors v JOIN customers c ON c.id=v.vendor_id WHERE c.tax_number='1234567890' \gset
SELECT v.share_token AS t2 FROM proc_rfq_vendors v JOIN customers c ON c.id=v.vendor_id WHERE c.tax_number='2234567890' \gset
SELECT v.id AS rv3 FROM proc_rfq_vendors v JOIN customers c ON c.id=v.vendor_id WHERE c.tax_number='3234567890' \gset
SELECT l.id AS l1 FROM proc_rfq_lines l WHERE description='lam' \gset
SELECT l.id AS l2 FROM proc_rfq_lines l WHERE description='eldiven' \gset
SET ROLE anon;
SELECT p->>'vendor_name' vendor, p->>'open' acik, jsonb_array_length(p->'lines') kalem, p ? 'quote' FROM proc_public_rfq_get(:'t1') p;
DO $$ BEGIN PERFORM 1 FROM proc_quotes; RAISE EXCEPTION 'TEST FAIL anon tablo'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon tabloları okuyamaz'; END $$;
SELECT proc_public_rfq_submit(:'t1', jsonb_build_object('submitted_by_name','Ali','delivery_days',5,'payment_term_days',30,'lines', jsonb_build_array(
  jsonb_build_object('rfq_line_id',:'l1','unit_price',150,'vat_rate',20), jsonb_build_object('rfq_line_id',:'l2','unit_price',1600))));
SELECT proc_public_rfq_submit(:'t1', jsonb_build_object('submitted_by_name','Ali','lines', jsonb_build_array(
  jsonb_build_object('rfq_line_id',:'l1','unit_price',140), jsonb_build_object('rfq_line_id',:'l2','unit_price',1600))));
SELECT proc_public_rfq_submit(:'t2', jsonb_build_object('submitted_by_name','Ayşe','lines', jsonb_build_array(
  jsonb_build_object('rfq_line_id',:'l1','unit_price',160), jsonb_build_object('rfq_line_id',:'l2','unit_price',1400,'discount_pct',5))));
SELECT (p->'quote'->>'version') AS "t1 sürüm 2", p->'quote'->>'total_net' net FROM proc_public_rfq_get(:'t1', false) p;
RESET ROLE;
-- Satınalma 3. teklifi elle girer, karşılaştırma
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false); SET ROLE authenticated;
SELECT proc_rfq_manual_quote(:'rv3', jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('rfq_line_id',:'l1','unit_price',145), jsonb_build_object('rfq_line_id',:'l2','can_supply',false)))) IS NOT NULL AS elle;
SELECT c.name, q.version, q.is_current, q.total_net, q.is_manual FROM proc_quotes q JOIN proc_rfq_vendors v ON v.id=q.rfq_vendor_id JOIN customers c ON c.id=v.vendor_id ORDER BY c.name, q.version;
-- Toptan Bilim AŞ: lamda en düşük değil → gerekçe ister
SELECT id AS rvb FROM proc_rfq_vendors WHERE vendor_id=(SELECT id FROM customers WHERE tax_number='2234567890') \gset
SELECT id AS rva FROM proc_rfq_vendors WHERE vendor_id=(SELECT id FROM customers WHERE tax_number='1234567890') \gset
DO $$ BEGIN PERFORM proc_rfq_award((SELECT id FROM proc_rfqs LIMIT 1), (SELECT jsonb_agg(jsonb_build_object('rfq_line_id', l.id, 'rfq_vendor_id', v.id)) FROM proc_rfq_lines l, proc_rfq_vendors v WHERE v.vendor_id=(SELECT id FROM customers WHERE tax_number='2234567890')), NULL, NULL);
  RAISE EXCEPTION 'TEST FAIL gerekçe'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK gerekçe: %', SQLERRM; END $$;
-- Kalem bazında: lam → Lab Market (140), eldiven → Bilim (1330)
SELECT proc_rfq_award(:'rfq', jsonb_build_array(jsonb_build_object('rfq_line_id',:'l1','rfq_vendor_id',:'rva'), jsonb_build_object('rfq_line_id',:'l2','rfq_vendor_id',:'rvb')), NULL, NULL);
SELECT status, award_total, savings_base, savings_amount FROM proc_rfqs;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE anon; SELECT p->>'open' AS "ödülden sonra açık (false)" FROM proc_public_rfq_get(:'t1', false) p;
DO $$ BEGIN PERFORM proc_public_rfq_submit((SELECT NULL::uuid)); EXCEPTION WHEN others THEN RAISE NOTICE 'OK kapalı/geçersiz bağlantı reddedildi'; END $$;
RESET ROLE;

-- Yetersiz teklif → ek onay (f3, ₺500 > eşik 100)
UPDATE proc_policies SET three_quote_threshold = 100;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false); SET ROLE authenticated;
SELECT proc_approval_decide((SELECT x FROM proc_my_pending_approvals() x JOIN proc_approvals a ON a.id=x WHERE a.subject_id='00000000-0000-0000-0000-0000000000f3'), true, NULL);
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false); SET ROLE authenticated;
SELECT proc_rfq_create(ARRAY['00000000-0000-0000-0000-0000000000f3']::uuid[], 'Tebeşir') AS rfq2 \gset
INSERT INTO proc_rfq_vendors (rfq_id, vendor_id) SELECT :'rfq2', id FROM customers WHERE tax_number='3234567890' RETURNING id AS rv2 \gset
SELECT proc_rfq_send(:'rfq2');
SELECT proc_rfq_manual_quote(:'rv2', jsonb_build_object('lines', (SELECT jsonb_agg(jsonb_build_object('rfq_line_id', id, 'unit_price', 45)) FROM proc_rfq_lines WHERE rfq_id=:'rfq2'))) IS NOT NULL;
DO $$ BEGIN PERFORM proc_rfq_award((SELECT id FROM proc_rfqs WHERE title='Tebeşir'), (SELECT jsonb_agg(jsonb_build_object('rfq_line_id', l.id, 'rfq_vendor_id', v.id)) FROM proc_rfq_lines l JOIN proc_rfq_vendors v ON v.rfq_id=l.rfq_id WHERE l.rfq_id=(SELECT id FROM proc_rfqs WHERE title='Tebeşir')), NULL, NULL);
  RAISE EXCEPTION 'TEST FAIL tek kaynak'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK tek kaynak: %', SQLERRM; END $$;
SELECT proc_rfq_award(:'rfq2', (SELECT jsonb_agg(jsonb_build_object('rfq_line_id', l.id, 'rfq_vendor_id', :'rv2')) FROM proc_rfq_lines l WHERE l.rfq_id=:'rfq2'), NULL, 'Tek yetkili bayi');
SELECT count(*) AS "satınalma kendi ödülünü onaylayamaz (0)" FROM proc_my_pending_approvals();
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false); SET ROLE authenticated;
SELECT proc_approval_decide((SELECT x FROM proc_my_pending_approvals() x), true, 'Uygun');
SELECT rfq_no, status, single_source_reason FROM proc_rfqs ORDER BY rfq_no;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- Bildirim RLS ve kişi listesi
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); SET ROLE authenticated;
SELECT count(*) AS "öğretmenin gördüğü", count(*) FILTER (WHERE user_id <> '00000000-0000-0000-0000-000000000002') AS "başkasına ait (0)" FROM notifications;
SELECT count(*) AS "kişi listesi (7)" FROM proc_org_people();
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
INSERT INTO notifications (organization_id, user_id, title) VALUES ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', 'rev-x'), ('00000000-0000-0000-0000-0000000000a2', NULL, 'rev-genel');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000008',false); SET ROLE authenticated;
SELECT count(*) AS "Revenue kurumu eski davranış (2)" FROM notifications;
RESET ROLE;
SELECT 'TEST 1b TAMAM' AS sonuc;
