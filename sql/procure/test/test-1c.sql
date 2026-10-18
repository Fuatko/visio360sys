\set ON_ERROR_STOP 1
-- Faz 1c: test-1a ve test-1b'den sonra çalışır (aynı veri)
INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-000000000009');
INSERT INTO users (id, email, name, role, organization_id) VALUES ('00000000-0000-0000-0000-000000000009','k@o','Lab Sorumlusu','user','00000000-0000-0000-0000-0000000000a1');
INSERT INTO proc_members (organization_id, user_id, roles, cost_center_ids) VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000009','{receiver}','{00000000-0000-0000-0000-0000000000c2}');
INSERT INTO proc_approval_rules (organization_id, name, min_amount, step_no, approver_kind, approver_role, approver_label, applies_to)
VALUES ('00000000-0000-0000-0000-0000000000a1','Sipariş 3.000 üzeri',3000,1,'role','finance','Mali İşler','order');
SELECT id AS rfq FROM proc_rfqs WHERE rfq_no='TTF-2026-0001' \gset

-- Satınalma: ödülden tek tıkla sipariş (2 tedarikçi → 2 sipariş)
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false); SET ROLE authenticated;
SELECT jsonb_array_length(proc_order_from_rfq(:'rfq')) AS "sipariş sayısı (2)";
DO $$ BEGIN PERFORM proc_order_from_rfq((SELECT id FROM proc_rfqs WHERE rfq_no='TTF-2026-0001')); RAISE EXCEPTION 'TEST FAIL çift'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK çift sipariş engellendi'; END $$;
SELECT o.order_no, c.name, o.subtotal, o.status, (SELECT count(*) FROM proc_order_lines WHERE order_id=o.id) kalem FROM proc_orders o JOIN customers c ON c.id=o.vendor_id ORDER BY o.order_no;
SELECT status AS "talep ordered" FROM proc_requests WHERE id='00000000-0000-0000-0000-0000000000f1';
DO $$ BEGIN UPDATE proc_orders SET notes='x' WHERE status='approved'; RAISE EXCEPTION 'TEST FAIL kilit'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK onaylı sipariş kilitli: %', SQLERRM; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false); SET ROLE authenticated;
SELECT pre_commitment AS "ön taahhüt (onay bekleyen 4200)", commitment AS "taahhüt (onaylı 2660)", available FROM proc_budget_status WHERE amount=20000;
DO $$ BEGIN IF (SELECT pre_commitment FROM proc_budget_status WHERE amount=20000) <> 4200 OR (SELECT commitment FROM proc_budget_status WHERE amount=20000) <> 2660 THEN RAISE EXCEPTION 'TEST FAIL bütçe 1'; END IF; RAISE NOTICE 'OK bütçe: talep ön taahhüdü sipariş tutarına döndü'; END $$;
RESET ROLE;

-- Mali işler sipariş onayı (satınalma kendi siparişini onaylayamaz)
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false); SET ROLE authenticated;
SELECT count(*) AS "satınalma kuyruğu (0)" FROM proc_my_pending_approvals(); RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false); SET ROLE authenticated;
SELECT proc_approval_decide((SELECT x FROM proc_my_pending_approvals() x JOIN proc_approvals a ON a.id=x WHERE a.subject_type='order'), true, NULL);
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false); SET ROLE authenticated;
DO $$ BEGIN IF (SELECT pre_commitment FROM proc_budget_status WHERE amount=20000) <> 0 OR (SELECT commitment FROM proc_budget_status WHERE amount=20000) <> 6860 THEN RAISE EXCEPTION 'TEST FAIL bütçe 2'; END IF; RAISE NOTICE 'OK bütçe: onaylı siparişler taahhütte (6.860)'; END $$;
RESET ROLE;

-- Gönder, tedarikçi linkten onaylar
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false); SET ROLE authenticated;
SELECT proc_order_send(id) FROM proc_orders WHERE status='approved';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT o.share_token AS tok, o.id AS lab_order FROM proc_orders o JOIN customers c ON c.id=o.vendor_id WHERE c.name='Lab Market' \gset
SELECT o.id AS bilim_order FROM proc_orders o JOIN customers c ON c.id=o.vendor_id WHERE c.name='Bilim AŞ' \gset
SET ROLE anon;
SELECT p->>'order_no' no, p->>'can_ack' onaylanabilir, jsonb_array_length(p->'lines') kalem, p->>'total' toplam FROM proc_public_po_get(:'tok') p;
DO $$ BEGIN PERFORM 1 FROM proc_orders; RAISE EXCEPTION 'TEST FAIL anon'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon sipariş tablosunu okuyamaz'; END $$;
DO $$ BEGIN PERFORM proc_public_po_ack((SELECT NULL::uuid), '{}'); EXCEPTION WHEN others THEN RAISE NOTICE 'OK geçersiz bağlantı: %', SQLERRM; END $$;
SELECT proc_public_po_ack(:'tok', '{"name":"Ali","expected_date":"2026-12-01","note":"Kargo ile"}');
SELECT p->>'can_ack' AS "tekrar onay (false)", p->>'acknowledged_by_name' FROM proc_public_po_get(:'tok', false) p;
RESET ROLE;
-- Hız sınırı: aynı bağlantıyla saatte 120'den fazla görüntüleme reddedilir
SELECT set_config('test.tok', o.share_token::text, false) FROM proc_orders o JOIN customers c ON c.id=o.vendor_id WHERE c.name='Bilim AŞ';
SET ROLE anon;
DO $$ DECLARE i int; t uuid := current_setting('test.tok')::uuid;
BEGIN
  FOR i IN 1..130 LOOP PERFORM proc_public_po_get(t); END LOOP;
  RAISE EXCEPTION 'TEST FAIL hız sınırı';
EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK hız sınırı: %', SQLERRM; END $$;
RESET ROLE;

-- Mal kabul (teslim alan, Fen birimi): kısmi + red → uygunsuzluk
SELECT id AS lam FROM proc_order_lines WHERE order_id=:'lab_order' \gset
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000009',false); SET ROLE authenticated;
SELECT count(*) AS "teslim alanın gördüğü sipariş (2)" FROM proc_orders;
DO $$ BEGIN PERFORM proc_receipt_create((SELECT order_id FROM proc_order_lines WHERE description='lam'), jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('order_line_id',(SELECT id FROM proc_order_lines WHERE description='lam'),'qty_received',31))));
  RAISE EXCEPTION 'TEST FAIL fazla'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK fazla kabul: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM proc_receipt_create((SELECT order_id FROM proc_order_lines WHERE description='lam'), jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('order_line_id',(SELECT id FROM proc_order_lines WHERE description='lam'),'qty_received',5,'qty_rejected',1))));
  RAISE EXCEPTION 'TEST FAIL neden'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK red nedeni zorunlu: %', SQLERRM; END $$;
SELECT proc_receipt_create(:'lab_order', jsonb_build_object('delivery_note_no','IRS-1','lines', jsonb_build_array(jsonb_build_object('order_line_id',:'lam','qty_received',20,'qty_rejected',2,'reject_reason','Kırık geldi')))) AS rc1 \gset
SELECT proc_receipt_confirm(:'rc1');
SELECT status, (SELECT received_qty FROM proc_order_lines WHERE id=:'lam') alinan FROM proc_orders WHERE id=:'lab_order';
SELECT proc_receipt_create(:'lab_order', jsonb_build_object('delivery_note_no','IRS-2','lines', jsonb_build_array(jsonb_build_object('order_line_id',:'lam','qty_received',10)))) AS rc2 \gset
SELECT proc_receipt_confirm(:'rc2')->>'status' AS "lab tamamlandı";
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
-- Politika: fotoğraf zorunlu
UPDATE proc_policies SET require_receipt_photo = true;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000009',false); SET ROLE authenticated;
SELECT proc_receipt_create(:'bilim_order', jsonb_build_object('lines', (SELECT jsonb_agg(jsonb_build_object('order_line_id', id, 'qty_received', quantity)) FROM proc_order_lines WHERE order_id=:'bilim_order'))) AS rc3 \gset
DO $$ BEGIN PERFORM proc_receipt_confirm((SELECT id FROM proc_receipts WHERE status='draft')); RAISE EXCEPTION 'TEST FAIL foto'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK fotoğraf zorunlu: %', SQLERRM; END $$;
INSERT INTO proc_attachments (owner_type, owner_id, storage_path, file_name) VALUES ('receipt', :'rc3', '00000000-0000-0000-0000-0000000000a1/receipt/x.jpg', 'x.jpg');
SELECT proc_receipt_confirm(:'rc3')->>'receipt_no' AS mkb;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT status AS "talep received" FROM proc_requests WHERE id='00000000-0000-0000-0000-0000000000f1';
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false); SET ROLE authenticated;
DO $$ BEGIN IF (SELECT commitment FROM proc_budget_status WHERE amount=20000) <> 6860 THEN RAISE EXCEPTION 'TEST FAIL bütçe 3'; END IF; RAISE NOTICE 'OK bütçe: teslim alındı, faturalanana kadar taahhüt sürer'; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT receipt_no, status FROM proc_receipts ORDER BY receipt_no;
SELECT severity, source, left(description, 40) FROM proc_vendor_issues;

-- Uygunsuzluk kapanışı: etkinlik kontrolü zorunlu
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false); SET ROLE authenticated;
DO $$ BEGIN UPDATE proc_vendor_issues SET status='closed'; RAISE EXCEPTION 'TEST FAIL etkinlik'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK etkinlik kontrolü zorunlu'; END $$;
UPDATE proc_vendor_issues SET root_cause='Ambalaj', corrective_action='Köpüklü ambalaj', effectiveness_check='Sonraki 2 teslimat sorunsuz', status='closed';
SELECT status, closed_at IS NOT NULL kapandi FROM proc_vendor_issues;

-- Revizyon ve iptal (TTF-0002 → sipariş 450 ₺, kural altı → doğrudan onay)
SELECT (proc_order_from_rfq((SELECT id FROM proc_rfqs WHERE rfq_no='TTF-2026-0002'))->0->>'id') AS o3 \gset
SELECT proc_order_send(:'o3');
SELECT proc_order_revise(:'o3', 'Teslim adresi değişti');
SELECT status, revision FROM proc_orders WHERE id=:'o3';
UPDATE proc_orders SET delivery_address='Yeni kampüs' WHERE id=:'o3';
SELECT proc_order_submit(:'o3')->>'status' AS "yeniden onay";
SELECT proc_order_cancel(:'o3', 'Vazgeçildi');
SELECT status AS "talep sourcing'e döndü" FROM proc_requests WHERE id='00000000-0000-0000-0000-0000000000f3';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- Görünürlük
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); SET ROLE authenticated;
SELECT count(*) AS "talep eden kendi siparişlerini görür (2)" FROM proc_orders; RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000007',false); SET ROLE authenticated;
SELECT count(*) AS "başka birim (0)" FROM proc_orders; RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000008',false); SET ROLE authenticated;
SELECT count(*) AS "Revenue kurumu (0)" FROM proc_orders; RESET ROLE;
SELECT 'TEST 1c TAMAM' AS sonuc;
