-- =====================================================================
-- INSPIRA360 PROCURE — FAZ 1c: SİPARİŞ (SAS-), TEDARİKÇİ SİPARİŞ ONAYI /po/[token], MAL KABUL / HİZMET ONAYI (MKB-), UYGUNSUZLUK
--   1. proc_orders, proc_order_lines — RFQ ödülünden tek tıkla (tedarikçi başına ayrı sipariş)
--   2. Sipariş onayı: yetki matrisindeki 'order' kuralları (kural yoksa onay gerekmez); revizyon
--   3. Bütçe: talebin ön taahhüdü sipariş tutarıyla değişir (02'deki proc_budget_usage siparişi okur)
--   4. Tedarikçi sipariş onayı: proc_public_po_get / proc_public_po_ack (anon, SECURITY DEFINER, hız sınırı)
--   5. Mal kabul / hizmet onayı: proc_receipts, proc_receipt_lines (kısmi teslim, red adet + neden, irsaliye, fotoğraf)
--   6. Uygunsuzluk: proc_vendor_issues (kök neden, düzeltici faaliyet, etkinlik kontrolü)
--   7. RLS, değişiklik kaydı
-- Önkoşul: 01, 02 (bu sürüm), 03. Tek seferde çalıştırılır; tekrar çalıştırmak güvenlidir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Dış sayfalar için hız sınırı kaydı (yalnızca SECURITY DEFINER fonksiyonlar yazar/okur)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_public_attempts (
  id        bigserial PRIMARY KEY,
  kind      text NOT NULL,
  token     uuid NOT NULL,
  ip        text,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proc_public_attempts_idx ON public.proc_public_attempts (kind, token, at DESC);
ALTER TABLE public.proc_public_attempts ENABLE ROW LEVEL SECURITY;   -- politika yok: doğrudan erişim kapalı
REVOKE ALL ON public.proc_public_attempts FROM anon, authenticated;

-- Saatte p_max denemeden fazlasını reddeder; denemeyi kaydeder. Eski kayıtlar (7 gün) temizlenir.
CREATE OR REPLACE FUNCTION public.proc_rate_limit(p_kind text, p_token uuid, p_max int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ip text := COALESCE(public.request_meta(), '{}'::jsonb) ->> 'ip';
BEGIN
  IF (SELECT count(*) FROM public.proc_public_attempts WHERE kind = p_kind AND token = p_token AND at > now() - interval '1 hour') >= p_max
     OR (v_ip IS NOT NULL AND (SELECT count(*) FROM public.proc_public_attempts WHERE kind = p_kind AND ip = v_ip AND at > now() - interval '1 hour') >= p_max * 5) THEN
    RAISE EXCEPTION 'Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.';
  END IF;
  INSERT INTO public.proc_public_attempts (kind, token, ip) VALUES (p_kind, p_token, v_ip);
  DELETE FROM public.proc_public_attempts WHERE at < now() - interval '7 days';
END $$;
REVOKE EXECUTE ON FUNCTION public.proc_rate_limit(text, uuid, int) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. SİPARİŞ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid,
  order_no              text,
  vendor_id             uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  rfq_id                uuid REFERENCES public.proc_rfqs(id) ON DELETE SET NULL,
  request_ids           uuid[] NOT NULL DEFAULT '{}',
  cost_center_id        uuid REFERENCES public.proc_cost_centers(id) ON DELETE SET NULL,
  category_id           uuid REFERENCES public.proc_categories(id) ON DELETE SET NULL,
  budget_line_id        uuid REFERENCES public.proc_budgets(id) ON DELETE SET NULL,
  buyer_id              uuid DEFAULT auth.uid(),
  order_date            date NOT NULL DEFAULT current_date,
  expected_date         date,
  delivery_address      text,
  payment_term_days     int CHECK (payment_term_days IS NULL OR payment_term_days >= 0),
  currency              text NOT NULL DEFAULT 'TRY',
  subtotal              numeric(15,2) NOT NULL DEFAULT 0,     -- KDV hariç
  vat_total             numeric(15,2) NOT NULL DEFAULT 0,
  total                 numeric(15,2) NOT NULL DEFAULT 0,
  invoiced_net          numeric(15,2) NOT NULL DEFAULT 0,     -- fatura eşleştirme (Faz 1d) doldurur
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','sent','acknowledged',
                          'partially_received','received','invoiced','closed','cancelled')),
  approval_round        int NOT NULL DEFAULT 0,
  approved_at           timestamptz,
  rejection_reason      text,
  share_token           uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  sent_at               timestamptz,
  first_viewed_at       timestamptz,
  view_count            int NOT NULL DEFAULT 0,
  acknowledged_at       timestamptz,
  acknowledged_by_name  text,
  ack_expected_date     date,
  ack_note              text,
  revision              int NOT NULL DEFAULT 0,
  revision_reason       text,
  notes                 text,
  terms                 text,
  cancel_reason         text,
  closed_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS proc_orders_no_uq ON public.proc_orders (organization_id, order_no) WHERE order_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS proc_orders_status_idx ON public.proc_orders (organization_id, status, expected_date);
CREATE INDEX IF NOT EXISTS proc_orders_rfq_idx ON public.proc_orders (rfq_id);

CREATE TABLE IF NOT EXISTS public.proc_order_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid,
  order_id          uuid NOT NULL REFERENCES public.proc_orders(id) ON DELETE CASCADE,
  request_line_id   uuid REFERENCES public.proc_request_lines(id) ON DELETE SET NULL,
  rfq_line_id       uuid REFERENCES public.proc_rfq_lines(id) ON DELETE SET NULL,
  product_id        uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description       text NOT NULL,
  quantity          numeric(12,2) NOT NULL CHECK (quantity > 0),
  unit              text NOT NULL DEFAULT 'Adet',
  unit_price        numeric(15,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_pct      numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  vat_rate          numeric(5,2) NOT NULL DEFAULT 20 CHECK (vat_rate BETWEEN 0 AND 100),
  line_total        numeric(15,2) GENERATED ALWAYS AS (round(quantity * unit_price * (1 - discount_pct / 100), 2)) STORED,
  brand_model       text,
  is_service        boolean NOT NULL DEFAULT false,
  asset_tag_required boolean NOT NULL DEFAULT false,   -- demirbaş (capex) kalemi: Faz 2'de demirbaş kaydı
  received_qty      numeric(12,2) NOT NULL DEFAULT 0,   -- onaylanan mal kabullerden (tetikleyici)
  rejected_qty      numeric(12,2) NOT NULL DEFAULT 0,
  invoiced_qty      numeric(12,2) NOT NULL DEFAULT 0,
  sort              int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS proc_order_lines_order_idx ON public.proc_order_lines (order_id, sort);

-- Sipariş toplamları kalemlerden
CREATE OR REPLACE FUNCTION public.proc_order_total_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
  UPDATE public.proc_orders o SET subtotal = x.net, vat_total = x.vat, total = x.net + x.vat
    FROM (SELECT COALESCE(sum(line_total), 0) AS net, COALESCE(sum(round(line_total * vat_rate / 100, 2)), 0) AS vat
            FROM public.proc_order_lines WHERE order_id = v_id) x
   WHERE o.id = v_id;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_proc_order_total ON public.proc_order_lines;
CREATE TRIGGER trg_proc_order_total AFTER INSERT OR UPDATE OR DELETE ON public.proc_order_lines FOR EACH ROW EXECUTE FUNCTION public.proc_order_total_trg();

-- Durum/onay/tedarikçi onayı alanları yalnızca iş akışı fonksiyonlarıyla; onaylanmış sipariş kilitli (değişiklik = revizyon)
CREATE OR REPLACE FUNCTION public.proc_orders_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  -- İş akışı fonksiyonu, SQL Editor veya kalem toplamı tetikleyicisi (iç içe tetikleyici) serbest
  IF current_setting('proc.rpc', true) = '1' OR auth.uid() IS NULL OR pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'Sipariş yalnızca RFQ ödülünden oluşturulur.'; END IF;
  IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Onaya gönderilmiş sipariş değiştirilemez; revizyon açın.'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.order_no IS DISTINCT FROM OLD.order_no OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.total IS DISTINCT FROM OLD.total OR NEW.share_token IS DISTINCT FROM OLD.share_token
     OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.revision IS DISTINCT FROM OLD.revision OR NEW.invoiced_net IS DISTINCT FROM OLD.invoiced_net OR NEW.budget_line_id IS DISTINCT FROM OLD.budget_line_id THEN
    RAISE EXCEPTION 'Sipariş durumu yalnızca onaya gönder / gönder / iptal / revizyon işlemleriyle değişir.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proc_orders_guard ON public.proc_orders;
CREATE TRIGGER trg_proc_orders_guard BEFORE INSERT OR UPDATE ON public.proc_orders FOR EACH ROW EXECUTE FUNCTION public.proc_orders_guard();

CREATE OR REPLACE FUNCTION public.proc_order_lines_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  IF current_setting('proc.rpc', true) = '1' OR auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT status INTO v_status FROM public.proc_orders WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  IF v_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Onaya gönderilmiş siparişin kalemleri değiştirilemez; revizyon açın.'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.received_qty IS DISTINCT FROM OLD.received_qty OR NEW.rejected_qty IS DISTINCT FROM OLD.rejected_qty OR NEW.invoiced_qty IS DISTINCT FROM OLD.invoiced_qty) THEN
    RAISE EXCEPTION 'Teslim ve fatura miktarları yalnızca mal kabul / eşleştirme ile değişir.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_proc_order_lines_guard ON public.proc_order_lines;
CREATE TRIGGER trg_proc_order_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.proc_order_lines FOR EACH ROW EXECUTE FUNCTION public.proc_order_lines_guard();

-- ---------------------------------------------------------------------
-- 2. GÖRÜNÜRLÜK
-- ---------------------------------------------------------------------
-- Teslim alabilir mi: satınalma/yönetici; teslim alan rolü (birimi yoksa tüm kurum, varsa kendi birimleri)
CREATE OR REPLACE FUNCTION public.proc_can_receive(p_cc uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.proc_is_buyer()
      OR (public.proc_has_role('receiver') AND (COALESCE(array_length(public.proc_my_cost_centers(), 1), 0) = 0 OR p_cc = ANY(public.proc_my_cost_centers())));
$$;
CREATE OR REPLACE FUNCTION public.proc_order_visible(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.proc_orders o WHERE o.id = p_id AND o.organization_id = public.current_org_id() AND (
           public.proc_is_buyer() OR public.proc_has_role('finance') OR public.proc_can_receive(o.cost_center_id)
        OR EXISTS (SELECT 1 FROM public.proc_requests r WHERE r.id = ANY(o.request_ids) AND r.requester_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.proc_approvals a WHERE a.subject_type = 'order' AND a.subject_id = o.id
                     AND (a.approver_user_id = auth.uid() OR a.decided_by = auth.uid() OR a.approver_user_id = ANY(public.proc_delegators())
                          OR (a.approver_user_id IS NULL AND a.approver_role IS NOT NULL AND public.proc_has_role(a.approver_role))))));
$$;
GRANT EXECUTE ON FUNCTION public.proc_can_receive(uuid), public.proc_order_visible(uuid) TO authenticated;

-- 02'deki genel onay altyapısı için: sipariş onay durumu ve karar
CREATE OR REPLACE FUNCTION public.proc_order_approval_state(p_id uuid)
RETURNS TABLE (ok boolean, owner uuid, amount numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.status = 'pending_approval', o.buyer_id, o.subtotal FROM public.proc_orders o WHERE o.id = p_id;
$$;
REVOKE EXECUTE ON FUNCTION public.proc_order_approval_state(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. İŞ AKIŞI
-- ---------------------------------------------------------------------
-- Onaya gönder: matristeki 'order' kurallarından adımlar; kural yoksa doğrudan onaylanır
CREATE OR REPLACE FUNCTION public.proc_order_submit(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; rule record; v_kind text; v_round int; v_step int; v_n int := 0; v_first uuid; v_prev_user uuid; v_prev_role text;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Satınalma uzmanı yetkisi gerekir.'; END IF;
  SELECT * INTO o FROM public.proc_orders WHERE id = p_id AND organization_id = public.current_org_id() FOR UPDATE;
  IF o.id IS NULL OR o.status <> 'draft' THEN RAISE EXCEPTION 'Yalnızca taslak sipariş onaya gönderilir.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proc_order_lines WHERE order_id = o.id) THEN RAISE EXCEPTION 'Siparişte kalem yok.'; END IF;
  IF o.order_no IS NULL THEN UPDATE public.proc_orders SET order_no = public.next_document_number('proc_order', 'SAS') WHERE id = o.id; END IF;
  SELECT kind INTO v_kind FROM public.proc_categories WHERE id = o.category_id;
  v_round := o.approval_round + 1;
  FOR v_step IN
    SELECT DISTINCT ar.step_no FROM public.proc_approval_rules ar
     WHERE ar.organization_id = o.organization_id AND ar.is_active AND ar.applies_to = 'order'
       AND (ar.min_amount = 0 OR o.subtotal > ar.min_amount) AND (ar.max_amount IS NULL OR o.subtotal <= ar.max_amount)
       AND (ar.category_id IS NULL OR ar.category_id IN (SELECT id FROM public.proc_cat_ancestors(o.category_id)))
       AND (ar.category_kind IS NULL OR ar.category_kind = v_kind)
       AND (ar.cost_center_id IS NULL OR ar.cost_center_id IN (SELECT id FROM public.proc_cc_ancestors(o.cost_center_id)))
     ORDER BY 1
  LOOP
    SELECT ar.* INTO rule FROM public.proc_approval_rules ar
     WHERE ar.organization_id = o.organization_id AND ar.is_active AND ar.applies_to = 'order' AND ar.step_no = v_step
       AND (ar.min_amount = 0 OR o.subtotal > ar.min_amount) AND (ar.max_amount IS NULL OR o.subtotal <= ar.max_amount)
       AND (ar.category_id IS NULL OR ar.category_id IN (SELECT id FROM public.proc_cat_ancestors(o.category_id)))
       AND (ar.category_kind IS NULL OR ar.category_kind = v_kind)
       AND (ar.cost_center_id IS NULL OR ar.cost_center_id IN (SELECT id FROM public.proc_cc_ancestors(o.cost_center_id)))
     ORDER BY (ar.cost_center_id IS NOT NULL)::int * 2 + (ar.category_id IS NOT NULL)::int * 2 + (ar.category_kind IS NOT NULL)::int DESC, ar.min_amount DESC, ar.created_at
     LIMIT 1;
    v_n := v_n + 1;
    PERFORM public.proc_add_subject_step('order', o.id, o.organization_id, v_round, rule.step_no, rule.id, rule.approver_kind, rule.approver_role,
                                         rule.approver_user_id, rule.approver_label, o.cost_center_id, o.buyer_id, o.subtotal);
  END LOOP;

  IF v_n = 0 THEN
    UPDATE public.proc_orders SET status = 'approved', approved_at = now(), approval_round = v_round, rejection_reason = NULL WHERE id = o.id;
    RETURN jsonb_build_object('status', 'approved');
  END IF;
  FOR rule IN SELECT * FROM public.proc_approvals WHERE subject_type = 'order' AND subject_id = o.id AND round = v_round ORDER BY step_no LOOP
    IF v_prev_user IS NOT NULL AND rule.approver_user_id = v_prev_user
       OR (v_prev_user IS NULL AND rule.approver_user_id IS NULL AND v_prev_role IS NOT NULL AND rule.approver_role = v_prev_role) THEN
      UPDATE public.proc_approvals SET status = 'skipped', decided_at = now(), note = 'Önceki adımla aynı onaycı' WHERE id = rule.id;
    ELSIF v_first IS NULL THEN v_first := rule.id;
    END IF;
    v_prev_user := rule.approver_user_id; v_prev_role := rule.approver_role;
  END LOOP;
  UPDATE public.proc_orders SET status = 'pending_approval', approval_round = v_round, rejection_reason = NULL WHERE id = o.id;
  SELECT * INTO o FROM public.proc_orders WHERE id = o.id;
  PERFORM public.proc_notify_approvers(v_first, 'Onay bekleyen sipariş: ' || o.order_no,
    (SELECT name FROM public.customers WHERE id = o.vendor_id) || ' · ₺' || public.proc_fmt_tl(o.subtotal) || ' (KDV hariç)');
  RETURN jsonb_build_object('status', 'pending_approval');
END $$;

-- 02/proc_approval_decide buraya yönlendirir
CREATE OR REPLACE FUNCTION public.proc_order_approval_decide(p_approval uuid, p_approve boolean, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; o record; v_from uuid; v_next uuid;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  SELECT * INTO a FROM public.proc_approvals WHERE id = p_approval FOR UPDATE;
  SELECT * INTO o FROM public.proc_orders WHERE id = a.subject_id FOR UPDATE;
  IF a.approver_user_id IS NOT NULL AND a.approver_user_id <> auth.uid() THEN v_from := a.approver_user_id;
  ELSIF a.approver_user_id IS NULL AND NOT public.proc_user_has_role(auth.uid(), a.approver_role, o.subtotal) THEN
    SELECT d INTO v_from FROM unnest(public.proc_delegators()) d WHERE public.proc_user_has_role(d, a.approver_role, o.subtotal) LIMIT 1;
  END IF;
  IF NOT p_approve THEN
    IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Red gerekçesi zorunlu.'; END IF;
    UPDATE public.proc_approvals SET status = 'rejected', decided_at = now(), decided_by = auth.uid(), delegated_from = v_from, note = left(trim(p_note), 1000) WHERE id = a.id;
    UPDATE public.proc_approvals SET status = 'skipped', decided_at = now(), note = 'Sipariş reddedildi'
     WHERE subject_type = 'order' AND subject_id = o.id AND round = a.round AND status = 'pending';
    UPDATE public.proc_orders SET status = 'draft', rejection_reason = left(trim(p_note), 1000) WHERE id = o.id;
    PERFORM public.proc_notify(o.buyer_id, 'Sipariş reddedildi: ' || o.order_no, trim(p_note), 'error', 'proc_order', o.id, '/procure/siparisler/' || o.id);
    RETURN jsonb_build_object('status', 'draft');
  END IF;
  UPDATE public.proc_approvals SET status = 'approved', decided_at = now(), decided_by = auth.uid(), delegated_from = v_from,
         note = NULLIF(left(trim(COALESCE(p_note, '')), 1000), '') WHERE id = a.id;
  SELECT id INTO v_next FROM public.proc_approvals WHERE subject_type = 'order' AND subject_id = o.id AND round = a.round AND status = 'pending' ORDER BY step_no LIMIT 1;
  IF v_next IS NOT NULL THEN
    PERFORM public.proc_notify_approvers(v_next, 'Onay bekleyen sipariş: ' || o.order_no, '₺' || public.proc_fmt_tl(o.subtotal) || ' · önceki adım: ' || a.approver_label);
    RETURN jsonb_build_object('status', 'pending_approval');
  END IF;
  UPDATE public.proc_orders SET status = 'approved', approved_at = now() WHERE id = o.id;
  PERFORM public.proc_notify(o.buyer_id, 'Sipariş onaylandı: ' || o.order_no, 'Tedarikçiye gönderebilirsiniz.', 'success', 'proc_order', o.id, '/procure/siparisler/' || o.id);
  RETURN jsonb_build_object('status', 'approved');
END $$;
REVOKE EXECUTE ON FUNCTION public.proc_order_approval_decide(uuid, boolean, text) FROM PUBLIC, anon, authenticated;

-- RFQ ödülünden sipariş: kalem bazında ödülde tedarikçi başına ayrı sipariş; ardından onaya gönderilir
CREATE OR REPLACE FUNCTION public.proc_order_from_rfq(p_rfq uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f record; v record; v_id uuid; v_ids uuid[] := '{}'; v_cc uuid; v_line uuid; v_kind text; v_fy text; r uuid; v_addr text; v_res jsonb; v_out jsonb := '[]'::jsonb;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Satınalma uzmanı yetkisi gerekir.'; END IF;
  SELECT * INTO f FROM public.proc_rfqs WHERE id = p_rfq AND organization_id = public.current_org_id() FOR UPDATE;
  IF f.id IS NULL OR f.status <> 'awarded' THEN RAISE EXCEPTION 'Sipariş yalnızca sonuçlanmış (ödül verilmiş) RFQ''dan oluşturulur.'; END IF;
  IF EXISTS (SELECT 1 FROM public.proc_orders WHERE rfq_id = f.id AND status <> 'cancelled') THEN RAISE EXCEPTION 'Bu RFQ için sipariş zaten oluşturulmuş.'; END IF;
  SELECT r2.cost_center_id, r2.budget_line_id INTO v_cc, v_line FROM public.proc_requests r2 WHERE r2.id = ANY(f.request_ids) ORDER BY r2.created_at LIMIT 1;
  SELECT kind INTO v_kind FROM public.proc_categories WHERE id = f.category_id;
  v_fy := public.proc_fiscal_year(current_date);
  v_line := COALESCE(v_line, public.proc_find_budget(v_cc, f.category_id, v_fy));
  IF to_regclass('public.quote_letterhead') IS NOT NULL THEN
    EXECUTE 'SELECT address FROM public.quote_letterhead WHERE organization_id = $1' INTO v_addr USING f.organization_id;
  END IF;

  FOR v IN SELECT a.rfq_vendor_id, rv.vendor_id, max(q.payment_term_days) AS pay, max(q.delivery_days) AS days
             FROM public.proc_rfq_awards a JOIN public.proc_rfq_vendors rv ON rv.id = a.rfq_vendor_id JOIN public.proc_quotes q ON q.id = a.quote_id
            WHERE a.rfq_id = f.id GROUP BY a.rfq_vendor_id, rv.vendor_id ORDER BY rv.vendor_id LOOP
    INSERT INTO public.proc_orders (organization_id, vendor_id, rfq_id, request_ids, cost_center_id, category_id, budget_line_id, buyer_id,
                                    expected_date, delivery_address, payment_term_days, terms, status)
    VALUES (f.organization_id, v.vendor_id, f.id, f.request_ids, v_cc, f.category_id, v_line, auth.uid(),
            current_date + COALESCE(v.days, 7), v_addr, v.pay, NULLIF(concat_ws(E'\n', f.delivery_terms, f.payment_terms), ''), 'draft')
    RETURNING id INTO v_id;
    INSERT INTO public.proc_order_lines (organization_id, order_id, request_line_id, rfq_line_id, description, quantity, unit, unit_price, discount_pct,
                                         vat_rate, brand_model, is_service, asset_tag_required, sort)
    SELECT f.organization_id, v_id, rl.request_line_id, rl.id, rl.description, rl.quantity, rl.unit, ql.unit_price, ql.discount_pct, ql.vat_rate,
           ql.brand_model, COALESCE(v_kind = 'service', false), COALESCE(v_kind = 'capex', false), rl.sort
      FROM public.proc_rfq_awards a JOIN public.proc_rfq_lines rl ON rl.id = a.rfq_line_id JOIN public.proc_quote_lines ql ON ql.id = a.quote_line_id
     WHERE a.rfq_id = f.id AND a.rfq_vendor_id = v.rfq_vendor_id;
    v_ids := v_ids || v_id;
  END LOOP;
  IF array_length(v_ids, 1) IS NULL THEN RAISE EXCEPTION 'RFQ''da ödül kalemi yok.'; END IF;
  FOREACH r IN ARRAY f.request_ids LOOP
    UPDATE public.proc_requests SET status = 'ordered' WHERE id = r AND status IN ('approved','sourcing');
  END LOOP;
  -- Her sipariş onaya gönderilir (kural yoksa doğrudan onaylanır)
  FOREACH v_id IN ARRAY v_ids LOOP
    v_res := public.proc_order_submit(v_id);
    v_out := v_out || jsonb_build_object('id', v_id, 'order_no', (SELECT order_no FROM public.proc_orders WHERE id = v_id), 'status', v_res ->> 'status');
  END LOOP;
  FOREACH r IN ARRAY f.request_ids LOOP
    PERFORM public.proc_event(r, 'comment', 'Sipariş oluşturuldu: ' || (SELECT string_agg(x ->> 'order_no', ', ') FROM jsonb_array_elements(v_out) x));
  END LOOP;
  RETURN v_out;
END $$;

-- Tedarikçiye gönder (onaylı sipariş): bağlantı/WhatsApp ekrandan paylaşılır
CREATE OR REPLACE FUNCTION public.proc_order_send(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Satınalma uzmanı yetkisi gerekir.'; END IF;
  UPDATE public.proc_orders SET status = 'sent', sent_at = now() WHERE id = p_id AND organization_id = public.current_org_id() AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Yalnızca onaylanmış sipariş gönderilir.'; END IF;
END $$;

-- Revizyon: teslim alınmamış, gönderilmiş/onaylı siparişi taslağa döndürür (önceki hali değişiklik kaydında kalır)
CREATE OR REPLACE FUNCTION public.proc_order_revise(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Satınalma uzmanı yetkisi gerekir.'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Revizyon gerekçesi zorunlu.'; END IF;
  SELECT * INTO o FROM public.proc_orders WHERE id = p_id AND organization_id = public.current_org_id() FOR UPDATE;
  IF o.id IS NULL OR o.status NOT IN ('pending_approval','approved','sent','acknowledged') THEN RAISE EXCEPTION 'Bu aşamadaki sipariş revize edilemez.'; END IF;
  IF EXISTS (SELECT 1 FROM public.proc_receipts WHERE order_id = o.id AND status = 'confirmed') THEN RAISE EXCEPTION 'Teslim alınmış sipariş revize edilemez.'; END IF;
  UPDATE public.proc_approvals SET status = 'skipped', decided_at = now(), note = 'Sipariş revize edildi'
   WHERE subject_type = 'order' AND subject_id = o.id AND status = 'pending';
  UPDATE public.proc_orders SET status = 'draft', revision = revision + 1, revision_reason = left(trim(p_reason), 1000),
         acknowledged_at = NULL, acknowledged_by_name = NULL, ack_expected_date = NULL, ack_note = NULL, approved_at = NULL
   WHERE id = o.id;
  IF o.status IN ('sent','acknowledged') THEN
    PERFORM public.proc_notify(o.buyer_id, 'Sipariş revize edildi: ' || o.order_no, 'Tedarikçiye revizyonu yeniden gönderin.', 'info', 'proc_order', o.id, '/procure/siparisler/' || o.id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.proc_order_cancel(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; r uuid;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Satınalma uzmanı yetkisi gerekir.'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'İptal gerekçesi zorunlu.'; END IF;
  SELECT * INTO o FROM public.proc_orders WHERE id = p_id AND organization_id = public.current_org_id() FOR UPDATE;
  IF o.id IS NULL OR o.status IN ('partially_received','received','invoiced','closed','cancelled') THEN RAISE EXCEPTION 'Bu aşamadaki sipariş iptal edilemez.'; END IF;
  UPDATE public.proc_approvals SET status = 'skipped', decided_at = now(), note = 'Sipariş iptal edildi'
   WHERE subject_type = 'order' AND subject_id = o.id AND status = 'pending';
  UPDATE public.proc_orders SET status = 'cancelled', cancel_reason = left(trim(p_reason), 1000), closed_at = now() WHERE id = o.id;
  -- Talepler, başka açık siparişi yoksa teklif toplama aşamasına döner (yeniden sipariş verilebilir)
  FOREACH r IN ARRAY o.request_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.proc_orders x WHERE x.id <> o.id AND r = ANY(x.request_ids) AND x.status <> 'cancelled') THEN
      UPDATE public.proc_requests SET status = 'sourcing' WHERE id = r AND status = 'ordered';
    END IF;
    PERFORM public.proc_event(r, 'comment', COALESCE(o.order_no, 'Sipariş') || ' iptal edildi: ' || trim(p_reason));
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.proc_order_submit(uuid), public.proc_order_from_rfq(uuid), public.proc_order_send(uuid),
  public.proc_order_revise(uuid, text), public.proc_order_cancel(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. TEDARİKÇİ SİPARİŞ SAYFASI /po/[token] — giriş yok; yalnızca bu siparişin bilgisi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proc_public_po_get(p_token uuid, p_track boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_lh jsonb; v_org text;
BEGIN
  SELECT * INTO o FROM public.proc_orders WHERE share_token = p_token;
  IF o.id IS NULL OR o.status IN ('draft','pending_approval','approved') THEN RETURN NULL; END IF;
  IF p_track THEN
    PERFORM public.proc_rate_limit('po_view', p_token, 120);
    UPDATE public.proc_orders SET first_viewed_at = COALESCE(first_viewed_at, now()), view_count = view_count + 1 WHERE id = o.id;
  END IF;
  SELECT name INTO v_org FROM public.organizations WHERE id = o.organization_id;
  IF to_regclass('public.quote_letterhead') IS NOT NULL THEN
    EXECUTE 'SELECT to_jsonb(l) - ''organization_id'' - ''iban'' - ''bank_name'' - ''standard_terms'' - ''logo_path'' FROM public.quote_letterhead l WHERE organization_id = $1'
      INTO v_lh USING o.organization_id;
  END IF;
  RETURN jsonb_build_object(
    'org_name', COALESCE(v_lh ->> 'legal_name', v_org), 'org_contact', v_lh,
    'vendor_name', (SELECT name FROM public.customers WHERE id = o.vendor_id),
    'order_no', o.order_no, 'revision', o.revision, 'order_date', o.order_date, 'expected_date', o.expected_date,
    'delivery_address', o.delivery_address, 'payment_term_days', o.payment_term_days, 'terms', o.terms, 'notes', o.notes,
    'subtotal', o.subtotal, 'vat_total', o.vat_total, 'total', o.total, 'status', o.status,
    'cancelled', o.status = 'cancelled', 'can_ack', o.status = 'sent',
    'acknowledged_at', o.acknowledged_at, 'acknowledged_by_name', o.acknowledged_by_name, 'ack_expected_date', o.ack_expected_date, 'ack_note', o.ack_note,
    'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity, 'unit', l.unit, 'unit_price', l.unit_price,
                 'discount_pct', l.discount_pct, 'vat_rate', l.vat_rate, 'line_total', l.line_total, 'brand_model', l.brand_model, 'received_qty', l.received_qty) ORDER BY l.sort)
                 FROM public.proc_order_lines l WHERE l.order_id = o.id), '[]'::jsonb));
END $$;

-- "Siparişi onaylıyorum" + tahmini teslim tarihi. Bir kez onaylanır; hız sınırı uygulanır.
CREATE OR REPLACE FUNCTION public.proc_public_po_ack(p_token uuid, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_name text := left(NULLIF(trim(payload ->> 'name'), ''), 120); v_date date;
BEGIN
  SELECT * INTO o FROM public.proc_orders WHERE share_token = p_token FOR UPDATE;
  IF o.id IS NULL OR o.status IN ('draft','pending_approval','approved') THEN RAISE EXCEPTION 'Bağlantı geçersiz.'; END IF;
  PERFORM public.proc_rate_limit('po_ack', p_token, 10);
  IF o.status <> 'sent' THEN RAISE EXCEPTION 'Bu sipariş artık onaylanamaz (durum: %).', o.status; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Onaylayan kişinin adını yazın.'; END IF;
  BEGIN v_date := NULLIF(payload ->> 'expected_date', '')::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Teslim tarihi geçersiz.'; END;
  IF v_date IS NULL THEN RAISE EXCEPTION 'Tahmini teslim tarihini girin.'; END IF;
  IF v_date < o.order_date THEN RAISE EXCEPTION 'Teslim tarihi sipariş tarihinden önce olamaz.'; END IF;
  PERFORM set_config('proc.rpc', '1', true);
  UPDATE public.proc_orders SET status = 'acknowledged', acknowledged_at = now(), acknowledged_by_name = v_name, ack_expected_date = v_date,
         ack_note = left(NULLIF(trim(payload ->> 'note'), ''), 1000) WHERE id = o.id;
  PERFORM public.proc_notify(o.buyer_id, 'Tedarikçi siparişi onayladı: ' || o.order_no,
    (SELECT name FROM public.customers WHERE id = o.vendor_id) || ' · teslim ' || to_char(v_date, 'DD.MM.YYYY') || ' · ' || v_name, 'success', 'proc_order', o.id, '/procure/siparisler/' || o.id);
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.proc_public_po_get(uuid, boolean), public.proc_public_po_ack(uuid, jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. MAL KABUL / HİZMET ONAYI — MKB-YYYY-0001
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_receipts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid,
  receipt_no        text,
  order_id          uuid NOT NULL REFERENCES public.proc_orders(id) ON DELETE RESTRICT,
  received_by       uuid DEFAULT auth.uid(),
  received_at       timestamptz NOT NULL DEFAULT now(),
  kind              text NOT NULL DEFAULT 'goods' CHECK (kind IN ('goods','service')),
  delivery_note_no  text,                -- irsaliye no
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','rejected')),
  notes             text,
  quality_ok        boolean NOT NULL DEFAULT true,
  nonconformity     text,
  service_result    text CHECK (service_result IS NULL OR service_result IN ('done','partial','not_done')),
  service_rating    int CHECK (service_rating IS NULL OR service_rating BETWEEN 1 AND 5),
  confirmed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS proc_receipts_no_uq ON public.proc_receipts (organization_id, receipt_no) WHERE receipt_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS proc_receipts_order_idx ON public.proc_receipts (order_id, received_at);

CREATE TABLE IF NOT EXISTS public.proc_receipt_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid,
  receipt_id          uuid NOT NULL REFERENCES public.proc_receipts(id) ON DELETE CASCADE,
  order_line_id       uuid NOT NULL REFERENCES public.proc_order_lines(id) ON DELETE RESTRICT,
  qty_received        numeric(12,2) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  qty_rejected        numeric(12,2) NOT NULL DEFAULT 0 CHECK (qty_rejected >= 0),
  reject_reason       text,
  asset_tag_required  boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS proc_receipt_lines_r_idx ON public.proc_receipt_lines (receipt_id);

-- ---------------------------------------------------------------------
-- 6. UYGUNSUZLUK (ISO 9001 md. 8.4 / 10.2) — complaints deseni
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_vendor_issues (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid,
  vendor_id            uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id             uuid REFERENCES public.proc_orders(id) ON DELETE SET NULL,
  receipt_id           uuid REFERENCES public.proc_receipts(id) ON DELETE SET NULL,
  source               text NOT NULL DEFAULT 'manual' CHECK (source IN ('receipt','service','manual','audit')),
  severity             text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor','major','critical')),
  title                text NOT NULL,
  description          text,
  root_cause           text,
  corrective_action    text,
  action_owner         text,
  action_due           date,
  effectiveness_check  text,
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open','action','verification','closed')),
  opened_by            uuid DEFAULT auth.uid(),
  closed_by            uuid,
  closed_at            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proc_vendor_issues_idx ON public.proc_vendor_issues (organization_id, vendor_id, status);

CREATE OR REPLACE FUNCTION public.proc_vendor_issues_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'closed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'closed') THEN
    IF coalesce(trim(NEW.effectiveness_check), '') = '' THEN RAISE EXCEPTION 'Kapatmak için etkinlik kontrolü sonucunu yazın.'; END IF;
    NEW.closed_at := now(); NEW.closed_by := auth.uid();
  ELSIF NEW.status <> 'closed' THEN
    NEW.closed_at := NULL; NEW.closed_by := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proc_vendor_issues ON public.proc_vendor_issues;
CREATE TRIGGER trg_proc_vendor_issues BEFORE INSERT OR UPDATE ON public.proc_vendor_issues FOR EACH ROW EXECUTE FUNCTION public.proc_vendor_issues_trg();

-- ---------------------------------------------------------------------
-- 5b. Mal kabul iş akışı: taslak (fotoğraf eklenir) → onay (miktarlar siparişe işlenir)
-- ---------------------------------------------------------------------
-- p: {kind, delivery_note_no, notes, quality_ok, nonconformity, service_result, service_rating,
--     lines: [{order_line_id, qty_received, qty_rejected, reject_reason}]}
CREATE OR REPLACE FUNCTION public.proc_receipt_create(p_order uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_id uuid; l jsonb; ol record; v_rec numeric; v_rej numeric; v_n int := 0;
BEGIN
  SELECT * INTO o FROM public.proc_orders WHERE id = p_order AND organization_id = public.current_org_id() FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı.'; END IF;
  IF NOT public.proc_can_receive(o.cost_center_id) THEN RAISE EXCEPTION 'Bu siparişi teslim alma yetkiniz yok.'; END IF;
  IF o.status NOT IN ('approved','sent','acknowledged','partially_received') THEN RAISE EXCEPTION 'Bu sipariş teslim alınacak aşamada değil.'; END IF;
  IF jsonb_typeof(p -> 'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Kalem miktarları eksik.'; END IF;
  IF COALESCE(p ->> 'kind', 'goods') = 'service' AND NULLIF(p ->> 'service_rating', '') IS NULL THEN RAISE EXCEPTION 'Hizmet için 1–5 arası değerlendirme verin.'; END IF;
  INSERT INTO public.proc_receipts (organization_id, order_id, kind, delivery_note_no, notes, quality_ok, nonconformity, service_result, service_rating)
  VALUES (o.organization_id, o.id, COALESCE(NULLIF(p ->> 'kind', ''), 'goods'), left(NULLIF(trim(p ->> 'delivery_note_no'), ''), 60), left(p ->> 'notes', 2000),
          COALESCE((p ->> 'quality_ok')::boolean, true), left(NULLIF(trim(p ->> 'nonconformity'), ''), 2000),
          NULLIF(p ->> 'service_result', ''), NULLIF(p ->> 'service_rating', '')::int)
  RETURNING id INTO v_id;
  FOR l IN SELECT * FROM jsonb_array_elements(p -> 'lines') LOOP
    SELECT * INTO ol FROM public.proc_order_lines WHERE id = NULLIF(l ->> 'order_line_id', '')::uuid AND order_id = o.id;
    IF ol.id IS NULL THEN RAISE EXCEPTION 'Kalem bu siparişe ait değil.'; END IF;
    v_rec := COALESCE(NULLIF(l ->> 'qty_received', '')::numeric, 0); v_rej := COALESCE(NULLIF(l ->> 'qty_rejected', '')::numeric, 0);
    IF v_rec < 0 OR v_rej < 0 THEN RAISE EXCEPTION 'Miktar negatif olamaz.'; END IF;
    IF v_rec + v_rej = 0 THEN CONTINUE; END IF;
    IF v_rec > ol.quantity - ol.received_qty THEN
      RAISE EXCEPTION '"%" için kalan miktar %; daha fazlası kabul edilemez.', ol.description, ol.quantity - ol.received_qty;
    END IF;
    IF v_rej > 0 AND coalesce(trim(l ->> 'reject_reason'), '') = '' THEN RAISE EXCEPTION '"%" için red nedeni yazın.', ol.description; END IF;
    INSERT INTO public.proc_receipt_lines (organization_id, receipt_id, order_line_id, qty_received, qty_rejected, reject_reason, asset_tag_required)
    VALUES (o.organization_id, v_id, ol.id, v_rec, v_rej, left(NULLIF(trim(l ->> 'reject_reason'), ''), 500), ol.asset_tag_required);
    v_n := v_n + 1;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'En az bir kalem için gelen veya reddedilen miktar girin.'; END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.proc_receipt_confirm(p_receipt uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rc record; o record; v_photo boolean; v_rej numeric; v_all boolean; v_any boolean; v_vendor text; v_issue uuid; r uuid; v_status text; v_sev text;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  SELECT * INTO rc FROM public.proc_receipts WHERE id = p_receipt AND organization_id = public.current_org_id() FOR UPDATE;
  IF rc.id IS NULL OR rc.status <> 'draft' THEN RAISE EXCEPTION 'Mal kabul taslağı bulunamadı.'; END IF;
  SELECT * INTO o FROM public.proc_orders WHERE id = rc.order_id FOR UPDATE;
  IF NOT public.proc_can_receive(o.cost_center_id) THEN RAISE EXCEPTION 'Bu siparişi teslim alma yetkiniz yok.'; END IF;
  SELECT require_receipt_photo INTO v_photo FROM public.proc_policies WHERE organization_id = o.organization_id;
  IF COALESCE(v_photo, false) AND NOT EXISTS (SELECT 1 FROM public.proc_attachments WHERE owner_type = 'receipt' AND owner_id = rc.id) THEN
    RAISE EXCEPTION 'Kurum politikası: mal kabulde en az bir fotoğraf zorunlu.';
  END IF;
  -- Aynı anda iki kabul fazla miktar işlemesin diye kalan miktar yeniden denetlenir
  IF EXISTS (SELECT 1 FROM public.proc_receipt_lines x JOIN public.proc_order_lines ol ON ol.id = x.order_line_id
              WHERE x.receipt_id = rc.id AND x.qty_received > ol.quantity - ol.received_qty) THEN
    RAISE EXCEPTION 'Bu arada başka bir kabul işlendi; kalan miktarı aşan kalem var. Taslağı silip yeniden girin.';
  END IF;
  UPDATE public.proc_order_lines ol SET received_qty = ol.received_qty + x.qty_received, rejected_qty = ol.rejected_qty + x.qty_rejected
    FROM public.proc_receipt_lines x WHERE x.receipt_id = rc.id AND x.order_line_id = ol.id;
  UPDATE public.proc_receipts SET status = 'confirmed', confirmed_at = now(),
         receipt_no = COALESCE(receipt_no, public.next_document_number('proc_receipt', 'MKB')) WHERE id = rc.id;
  SELECT bool_and(received_qty >= quantity), bool_or(received_qty > 0) INTO v_all, v_any FROM public.proc_order_lines WHERE order_id = o.id;
  v_status := CASE WHEN v_all THEN 'received' WHEN v_any THEN 'partially_received' ELSE o.status END;
  UPDATE public.proc_orders SET status = v_status WHERE id = o.id;
  IF v_all THEN
    FOREACH r IN ARRAY o.request_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.proc_orders x WHERE r = ANY(x.request_ids) AND x.status NOT IN ('received','invoiced','closed','cancelled')) THEN
        UPDATE public.proc_requests SET status = 'received' WHERE id = r AND status = 'ordered';
      END IF;
    END LOOP;
  END IF;
  FOREACH r IN ARRAY o.request_ids LOOP
    PERFORM public.proc_event(r, 'comment', (SELECT receipt_no FROM public.proc_receipts WHERE id = rc.id) || ' ile teslim alındı (' || o.order_no || CASE WHEN v_all THEN ', tamamı)' ELSE ', kısmi)' END);
  END LOOP;

  -- Red / kalite sorunu / eksik hizmet → uygunsuzluk kaydı (düzeltici faaliyet için)
  SELECT COALESCE(sum(qty_rejected), 0) INTO v_rej FROM public.proc_receipt_lines WHERE receipt_id = rc.id;
  IF v_rej > 0 OR NOT rc.quality_ok OR rc.service_result IN ('partial','not_done') OR rc.service_rating <= 2 THEN
    v_sev := CASE WHEN rc.service_result = 'not_done' OR v_rej > 0 AND NOT rc.quality_ok THEN 'major' ELSE 'minor' END;
    INSERT INTO public.proc_vendor_issues (organization_id, vendor_id, order_id, receipt_id, source, severity, title, description)
    VALUES (o.organization_id, o.vendor_id, o.id, rc.id, CASE WHEN rc.kind = 'service' THEN 'service' ELSE 'receipt' END, v_sev,
            o.order_no || ' teslimatında uygunsuzluk',
            concat_ws(E'\n',
              (SELECT string_agg(ol.description || ': ' || x.qty_rejected || ' ' || ol.unit || ' red — ' || COALESCE(x.reject_reason, ''), E'\n')
                 FROM public.proc_receipt_lines x JOIN public.proc_order_lines ol ON ol.id = x.order_line_id WHERE x.receipt_id = rc.id AND x.qty_rejected > 0),
              CASE WHEN NOT rc.quality_ok THEN 'Kalite: ' || COALESCE(rc.nonconformity, 'uygun değil') END,
              CASE rc.service_result WHEN 'partial' THEN 'Hizmet kısmen yapıldı' WHEN 'not_done' THEN 'Hizmet yapılmadı' END,
              CASE WHEN rc.service_rating <= 2 THEN 'Hizmet puanı ' || rc.service_rating || '/5' END))
    RETURNING id INTO v_issue;
    SELECT name INTO v_vendor FROM public.customers WHERE id = o.vendor_id;
    PERFORM public.proc_notify(o.buyer_id, 'Uygunsuzluk: ' || v_vendor, o.order_no || ' teslimatında red/uygunsuzluk kaydedildi.', 'warning', 'proc_order', o.id, '/procure/siparisler/' || o.id);
  ELSE
    PERFORM public.proc_notify(o.buyer_id, 'Teslim alındı: ' || o.order_no, CASE WHEN v_all THEN 'Tamamı teslim alındı.' ELSE 'Kısmi teslim.' END, 'info', 'proc_order', o.id, '/procure/siparisler/' || o.id);
  END IF;
  RETURN jsonb_build_object('status', v_status, 'receipt_no', (SELECT receipt_no FROM public.proc_receipts WHERE id = rc.id), 'issue_id', v_issue);
END $$;

-- Taslak kabulü vazgeç (fotoğraflar dahil silinir)
CREATE OR REPLACE FUNCTION public.proc_receipt_discard(p_receipt uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rc record;
BEGIN
  SELECT * INTO rc FROM public.proc_receipts WHERE id = p_receipt AND organization_id = public.current_org_id();
  IF rc.id IS NULL OR rc.status <> 'draft' THEN RAISE EXCEPTION 'Yalnızca taslak kabul silinebilir.'; END IF;
  IF rc.received_by <> auth.uid() AND NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Bu taslağı silme yetkiniz yok.'; END IF;
  DELETE FROM public.proc_attachments WHERE owner_type = 'receipt' AND owner_id = rc.id;
  DELETE FROM public.proc_receipts WHERE id = rc.id;
END $$;

GRANT EXECUTE ON FUNCTION public.proc_receipt_create(uuid, jsonb), public.proc_receipt_confirm(uuid), public.proc_receipt_discard(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['proc_orders','proc_order_lines','proc_receipts','proc_receipt_lines','proc_vendor_issues'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_org ON public.%I', tbl);
    EXECUTE format('CREATE TRIGGER trg_set_org BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_organization_id()', tbl);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON public.%I', tbl);
    EXECUTE format('CREATE POLICY org_isolation ON public.%I FOR ALL TO authenticated
                    USING (organization_id = public.current_org_id()) WITH CHECK (organization_id = public.current_org_id())', tbl);
    EXECUTE format('DROP POLICY IF EXISTS proc_module ON public.%I', tbl);
    EXECUTE format('CREATE POLICY proc_module ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
                    USING ((SELECT public.org_has_module(''procure''))) WITH CHECK ((SELECT public.org_has_module(''procure'')))', tbl);
    EXECUTE format('DROP POLICY IF EXISTS proc_sel ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS proc_ins ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS proc_upd ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS proc_del ON public.%I', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_dealer_user') THEN
      EXECUTE format('DROP POLICY IF EXISTS deny_dealer_portal ON public.%I', tbl);
      EXECUTE format('CREATE POLICY deny_dealer_portal ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
                      USING (NOT (SELECT public.is_dealer_user())) WITH CHECK (NOT (SELECT public.is_dealer_user()))', tbl);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_change') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_change_log ON public.%I', tbl);
      EXECUTE format('CREATE TRIGGER trg_change_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_change()', tbl);
    END IF;
  END LOOP;
END $$;

-- Sipariş: görünürlük proc_order_visible; satınalma yalnızca taslağı düzenler (tetikleyici); ekleme/silme yalnızca fonksiyonlarla
CREATE POLICY proc_sel ON public.proc_orders AS RESTRICTIVE FOR SELECT TO authenticated USING (public.proc_order_visible(id));
CREATE POLICY proc_ins ON public.proc_orders AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY proc_upd ON public.proc_orders AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.proc_is_buyer())) WITH CHECK ((SELECT public.proc_is_buyer()));
CREATE POLICY proc_del ON public.proc_orders AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE POLICY proc_sel ON public.proc_order_lines AS RESTRICTIVE FOR SELECT TO authenticated USING (public.proc_order_visible(order_id));
CREATE POLICY proc_ins ON public.proc_order_lines AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.proc_is_buyer()));
CREATE POLICY proc_upd ON public.proc_order_lines AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.proc_is_buyer())) WITH CHECK ((SELECT public.proc_is_buyer()));
CREATE POLICY proc_del ON public.proc_order_lines AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.proc_is_buyer()));

-- Mal kabul: siparişi gören görür; yazma yalnızca fonksiyonlarla
CREATE POLICY proc_sel ON public.proc_receipts AS RESTRICTIVE FOR SELECT TO authenticated USING (public.proc_order_visible(order_id));
CREATE POLICY proc_sel ON public.proc_receipt_lines AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.proc_order_visible((SELECT r.order_id FROM public.proc_receipts r WHERE r.id = receipt_id)));
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['proc_receipts','proc_receipt_lines'] LOOP
    EXECUTE format('CREATE POLICY proc_ins ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false)', tbl);
    EXECUTE format('CREATE POLICY proc_upd ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (false)', tbl);
    EXECUTE format('CREATE POLICY proc_del ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (false)', tbl);
  END LOOP;
END $$;

-- Uygunsuzluk: satınalma, mali işler, yönetici, teslim alan görür; satınalma/teslim alan açar; satınalma/yönetici yönetir
CREATE POLICY proc_sel ON public.proc_vendor_issues AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.proc_is_buyer()) OR (SELECT public.proc_has_role('finance')) OR (SELECT public.proc_has_role('receiver')) OR (SELECT public.proc_has_role('approver')));
CREATE POLICY proc_ins ON public.proc_vendor_issues AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.proc_is_buyer()) OR (SELECT public.proc_has_role('receiver')));
CREATE POLICY proc_upd ON public.proc_vendor_issues AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.proc_is_buyer())) WITH CHECK ((SELECT public.proc_is_buyer()));
CREATE POLICY proc_del ON public.proc_vendor_issues AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.proc_has_role('procure_admin')));

NOTIFY pgrst, 'reload schema';

SELECT 'Procure Faz 1c (sipariş, tedarikçi onayı, mal kabul, uygunsuzluk) kuruldu' AS durum;
