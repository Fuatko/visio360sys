\set ON_ERROR_STOP 1
-- Kurum + kullanıcılar (a=admin, t=öğretmen, m=birim müdürü, f=mali işler, d=okul müdürü, b=satınalma, o=başka birim öğretmeni)
INSERT INTO organizations (id, name, slug) VALUES ('00000000-0000-0000-0000-0000000000a1','Pilot Okul','pilot'), ('00000000-0000-0000-0000-0000000000a2','Revenue Firma','rev');
INSERT INTO auth.users (id) SELECT ('00000000-0000-0000-0000-00000000000'||x)::uuid FROM unnest(ARRAY['1','2','3','4','5','6','7','8']) x;
INSERT INTO users (id, email, name, role, organization_id) VALUES
 ('00000000-0000-0000-0000-000000000001','a@o','Admin','admin','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-000000000002','t@o','Öğretmen','user','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-000000000003','m@o','Müdür','user','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-000000000004','f@o','Mali','user','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-000000000005','d@o','Okul Müdürü','user','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-000000000006','b@o','Satınalma','user','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-000000000007','o@o','Diğer','user','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-000000000008','r@o','Rev','admin','00000000-0000-0000-0000-0000000000a2');

-- Lisanssız kurumda admin bile yazamaz
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false); SET ROLE authenticated;
DO $$ BEGIN INSERT INTO proc_cost_centers (name) VALUES ('X'); RAISE EXCEPTION 'TEST FAIL: lisanssız yazabildi'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK lisanssız kurum yazamıyor'; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
UPDATE organizations SET enabled_modules='{revenue,procure}' WHERE slug='pilot';

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false); SET ROLE authenticated;
INSERT INTO proc_cost_centers (id, code, name, kind) VALUES ('00000000-0000-0000-0000-0000000000c1','K1','Kampüs','campus');
INSERT INTO proc_cost_centers (id, code, name, kind, parent_id, manager_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000c2','FEN','Fen Zümresi','unit','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-0000000000c3','BIL','Bilişim','unit','00000000-0000-0000-0000-0000000000c1',NULL);
DO $$ BEGIN UPDATE proc_cost_centers SET parent_id='00000000-0000-0000-0000-0000000000c2' WHERE id='00000000-0000-0000-0000-0000000000c1'; RAISE EXCEPTION 'TEST FAIL döngü'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK döngü engellendi: %', SQLERRM; END $$;
INSERT INTO proc_categories (id, code, name, kind) VALUES ('00000000-0000-0000-0000-0000000000e1','LAB','Laboratuvar Sarf','goods'), ('00000000-0000-0000-0000-0000000000e2','MOB','Mobilya','capex');
INSERT INTO proc_members (user_id, roles, cost_center_ids) VALUES
 ('00000000-0000-0000-0000-000000000002','{requester}','{00000000-0000-0000-0000-0000000000c2}'),
 ('00000000-0000-0000-0000-000000000004','{finance}','{}'), ('00000000-0000-0000-0000-000000000005','{approver}','{}'),
 ('00000000-0000-0000-0000-000000000006','{buyer}','{}'), ('00000000-0000-0000-0000-000000000007','{requester}','{00000000-0000-0000-0000-0000000000c3}');
INSERT INTO proc_approval_rules (name, min_amount, max_amount, category_kind, step_no, approver_kind, approver_role, approver_label) VALUES
 ('a',0,10000,NULL,1,'cost_center_manager',NULL,'Birim müdürü'), ('b',10000,100000,NULL,1,'cost_center_manager',NULL,'Birim müdürü'),
 ('b',10000,100000,NULL,2,'role','finance','Mali İşler'), ('c',100000,NULL,NULL,1,'cost_center_manager',NULL,'Birim müdürü'),
 ('c',100000,NULL,NULL,2,'role','finance','Mali İşler'), ('c',100000,NULL,NULL,3,'role','approver','Okul müdürü'),
 ('d',0,NULL,'capex',4,'role','approver','Yönetim');
INSERT INTO proc_budgets (fiscal_year, cost_center_id, category_id, amount) VALUES (proc_fiscal_year(current_date),'00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000e1',20000);
INSERT INTO proc_policies (organization_id) VALUES ('00000000-0000-0000-0000-0000000000a1');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- Öğretmen talep açar (₺8.000)
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); SET ROLE authenticated;
INSERT INTO proc_requests (id, title, cost_center_id, category_id, status) VALUES ('00000000-0000-0000-0000-0000000000f1','lam+eldiven','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000e1','approved');
SELECT status AS "durum taslak olmalı" FROM proc_requests WHERE id='00000000-0000-0000-0000-0000000000f1';
INSERT INTO proc_request_lines (request_id, description, quantity, unit, est_unit_price) VALUES ('00000000-0000-0000-0000-0000000000f1','lam',30,'Adet',166.67),('00000000-0000-0000-0000-0000000000f1','eldiven',2,'Kutu',1500);
DO $$ BEGIN UPDATE proc_requests SET status='approved' WHERE id='00000000-0000-0000-0000-0000000000f1'; RAISE EXCEPTION 'TEST FAIL durum'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK durum elle değişmiyor'; END $$;
SELECT proc_request_submit('00000000-0000-0000-0000-0000000000f1');
SELECT request_no, status, estimated_total, budget_check_result->>'status' bc, budget_check_result->>'after' after FROM proc_requests;
SELECT step_no, approver_label, approver_user_id IS NOT NULL kisi, status FROM proc_approvals ORDER BY step_no;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- Diğer birim öğretmeni göremez
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000007',false); SET ROLE authenticated;
SELECT count(*) AS "diğer öğretmen görür (0 olmalı)" FROM proc_requests; RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- Müdür kuyruğu ve onay
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false); SET ROLE authenticated;
SELECT count(*) AS "müdür kuyruğu (1)" FROM proc_my_pending_approvals();
SELECT proc_budget_check('00000000-0000-0000-0000-0000000000f1')->>'available' AS kullanilabilir;
SELECT proc_approval_decide((SELECT id FROM proc_approvals LIMIT 1), true, NULL);
SELECT status AS "onaylandı olmalı" FROM proc_requests; RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false); SET ROLE authenticated;
SELECT amount, pre_commitment, available FROM proc_budget_status; RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT count(*) AS bildirim, string_agg(DISTINCT title, ' | ') FROM notifications;

-- ₺150.000 demirbaş, block modu: 3 + yönetim adımı (aynı rol ardışık → atlanır)
UPDATE proc_policies SET budget_check='block';
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); SET ROLE authenticated;
INSERT INTO proc_requests (id, title, cost_center_id, category_id) VALUES ('00000000-0000-0000-0000-0000000000f2','dolap','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000e2');
INSERT INTO proc_request_lines (request_id, description, quantity, est_unit_price) VALUES ('00000000-0000-0000-0000-0000000000f2','dolap',1,150000);
SELECT proc_request_submit('00000000-0000-0000-0000-0000000000f2');
SELECT step_no, approver_label, status, note FROM proc_approvals WHERE subject_id='00000000-0000-0000-0000-0000000000f2' ORDER BY step_no;
SELECT budget_check_result->>'status' FROM proc_requests WHERE id='00000000-0000-0000-0000-0000000000f2';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
-- Bütçe tanımlı değil → no_budget, engellemez; bütçe ekleyip yetersiz yapalım
INSERT INTO proc_budgets (organization_id, fiscal_year, cost_center_id, category_id, amount) VALUES ('00000000-0000-0000-0000-0000000000a1', '2026-2027','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000e2',1000);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false); SET ROLE authenticated;
DO $$ BEGIN PERFORM proc_approval_decide((SELECT id FROM proc_approvals WHERE subject_id='00000000-0000-0000-0000-0000000000f2' AND step_no=1), true, NULL); RAISE EXCEPTION 'TEST FAIL blok'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK blok: %', SQLERRM; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false); SET ROLE authenticated;
SELECT proc_budget_override('00000000-0000-0000-0000-0000000000f2','Yönetim kararı'); RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false); SET ROLE authenticated;
SELECT proc_approval_decide((SELECT id FROM proc_approvals WHERE subject_id='00000000-0000-0000-0000-0000000000f2' AND step_no=1), true, NULL);
-- Sıra mali işlerde; müdür 2. adımı onaylayamaz
DO $$ BEGIN PERFORM proc_approval_decide((SELECT id FROM proc_approvals WHERE subject_id='00000000-0000-0000-0000-0000000000f2' AND step_no=2), true, NULL); RAISE EXCEPTION 'TEST FAIL sıra'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; RAISE NOTICE 'OK sıra: %', SQLERRM; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
-- Mali işler reddeder, öğretmen yeniden gönderir → 2. tur
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false); SET ROLE authenticated;
SELECT proc_approval_decide((SELECT id FROM proc_approvals WHERE subject_id='00000000-0000-0000-0000-0000000000f2' AND step_no=2), false, 'Fiyat yüksek'); RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); SET ROLE authenticated;
UPDATE proc_request_lines SET est_unit_price = 120000 WHERE request_id='00000000-0000-0000-0000-0000000000f2';
SELECT proc_request_submit('00000000-0000-0000-0000-0000000000f2');
SELECT round, count(*) FROM proc_approvals WHERE subject_id='00000000-0000-0000-0000-0000000000f2' GROUP BY 1 ORDER BY 1;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false); SET ROLE authenticated;
SELECT proc_budget_override('00000000-0000-0000-0000-0000000000f2','2. tur: yönetim kararı'); RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
-- Vekâlet: müdür → diğer öğretmen
INSERT INTO proc_delegations (organization_id, from_user_id, to_user_id, end_date) VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000007', current_date + 3);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000007',false); SET ROLE authenticated;
SELECT count(*) AS "vekil kuyruğu (1)" FROM proc_my_pending_approvals();
SELECT proc_approval_decide((SELECT x FROM proc_my_pending_approvals() x LIMIT 1), true, NULL);
SELECT delegated_from IS NOT NULL AS vekaleten FROM proc_approvals WHERE status='approved' AND decided_by='00000000-0000-0000-0000-000000000007';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
-- Fiyatsız talep → submitted, satınalma fiyatlar
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); SET ROLE authenticated;
INSERT INTO proc_requests (id, title, cost_center_id) VALUES ('00000000-0000-0000-0000-0000000000f3','tebeşir','00000000-0000-0000-0000-0000000000c2');
INSERT INTO proc_request_lines (request_id, description, quantity) VALUES ('00000000-0000-0000-0000-0000000000f3','tebeşir',10);
SELECT proc_request_submit('00000000-0000-0000-0000-0000000000f3'); RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false); SET ROLE authenticated;
UPDATE proc_request_lines SET est_unit_price = 50 WHERE request_id='00000000-0000-0000-0000-0000000000f3';
SELECT proc_request_price('00000000-0000-0000-0000-0000000000f3');
SELECT request_no, status, estimated_total FROM proc_requests ORDER BY request_no; RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
-- Revenue kurumu Procure tablolarını göremez
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000008',false); SET ROLE authenticated;
SELECT count(*) AS "revenue kurumu görür (0)" FROM proc_requests; RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT 'TEST 1a TAMAM' AS sonuc;
