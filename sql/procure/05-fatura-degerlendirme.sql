-- =====================================================================
-- INSPIRA360 PROCURE — FAZ 1d: 3'LÜ FATURA EŞLEŞTİRME, SİPARİŞSİZ FATURALAR, TEDARİKÇİ DEĞERLENDİRME, KPI
--   1. proc_invoice_matches: sipariş ↔ mal kabul ↔ Paraşüt alış faturası (yazma yok; yalnızca okuma)
--      otomatik öneri, tolerans kontrolü, tolerans dışı farkta mali işler onayı, geri alma
--   2. Siparişsiz faturalar: proc_invoice_decisions ("sonradan sipariş oluştur" / "sipariş gerektirmez")
--   3. Taahhüt → gerçekleşen: siparişin invoiced_net / invoiced_qty alanları (bütçe 02'de okunur)
--   4. Tedarikçi değerlendirme (ISO 9001 md. 8.4): otomatik veriler, puan, A–D not, karar
--   5. proc_kpis(): panel ve raporlar
--   7. Yetki sertleştirme: anon yalnızca proc_public_% fonksiyonlarını çağırabilir
-- Önkoşul: 01, 02 (bu sürüm), 03, 04 ve parasut.sql (parasut_documents). Tek seferde çalıştırılır; tekrar çalıştırmak güvenlidir.
-- =====================================================================

ALTER TABLE public.proc_orders ADD COLUMN IF NOT EXISTS is_retroactive boolean NOT NULL DEFAULT false;  -- fatura geldikten sonra açılan sipariş
ALTER TABLE public.proc_vendor_issues DROP CONSTRAINT IF EXISTS proc_vendor_issues_source_check;
ALTER TABLE public.proc_vendor_issues ADD CONSTRAINT proc_vendor_issues_source_check CHECK (source IN ('receipt','service','manual','audit','evaluation'));
-- Değerlendirme kriter ağırlıkları (toplam 100)
ALTER TABLE public.proc_policies ADD COLUMN IF NOT EXISTS vendor_eval_weights jsonb NOT NULL
  DEFAULT '{"quality":30,"on_time":25,"price":15,"communication":15,"compliance":15}'::jsonb;

-- ---------------------------------------------------------------------
-- 1. FATURA EŞLEŞTİRME
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_invoice_matches (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid,
  order_id             uuid NOT NULL REFERENCES public.proc_orders(id) ON DELETE RESTRICT,
  parasut_document_id  uuid NOT NULL REFERENCES public.parasut_documents(id) ON DELETE RESTRICT,
  invoice_net          numeric(15,2) NOT NULL,       -- faturanın KDV hariç TL tutarı
  expected_net         numeric(15,2),                -- kabul edilmiş, faturalanmamış tutar (eşleştirme anında)
  status               text NOT NULL CHECK (status IN ('matched','price_variance','qty_variance','over_invoiced','approved_with_variance','rejected','reversed')),
  variance             jsonb,                        -- {diff, diff_pct, remaining, tol_price, tol_qty, lines:[…]}
  allocation           jsonb,                        -- [{order_line_id, qty}] faturalanan miktar dağılımı (geri alma için)
  matched_by           uuid DEFAULT auth.uid(),
  matched_at           timestamptz NOT NULL DEFAULT now(),
  approved_by          uuid,
  approved_at          timestamptz,
  note                 text
);
-- Bir fatura aynı anda yalnızca bir aktif eşleşmede olabilir
CREATE UNIQUE INDEX IF NOT EXISTS proc_invoice_matches_doc_uq ON public.proc_invoice_matches (parasut_document_id) WHERE status NOT IN ('rejected','reversed');
CREATE INDEX IF NOT EXISTS proc_invoice_matches_order_idx ON public.proc_invoice_matches (order_id);

CREATE TABLE IF NOT EXISTS public.proc_invoice_decisions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid,
  parasut_document_id  uuid NOT NULL UNIQUE REFERENCES public.parasut_documents(id) ON DELETE CASCADE,
  decision             text NOT NULL CHECK (decision IN ('no_order_needed','order_created')),
  reason               text NOT NULL,
  order_id             uuid REFERENCES public.proc_orders(id) ON DELETE SET NULL,
  decided_by           uuid DEFAULT auth.uid(),
  decided_at           timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.proc_is_finance()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.proc_has_role('finance') OR public.proc_has_role('procure_admin');
$$;
GRANT EXECUTE ON FUNCTION public.proc_is_finance() TO authenticated;

-- Procure tedarikçisi mi (cari bağlı veya vergi no eşleşen)? Siparişsiz fatura listesi için
CREATE OR REPLACE FUNCTION public.proc_doc_vendor(p_doc uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT v.customer_id FROM public.parasut_documents d JOIN public.proc_vendor_profiles v ON v.customer_id = d.customer_id WHERE d.id = p_doc),
    (SELECT v.customer_id FROM public.parasut_documents d
       JOIN public.customers c ON c.organization_id = d.organization_id AND NULLIF(regexp_replace(COALESCE(c.tax_number, ''), '\D', '', 'g'), '') = NULLIF(regexp_replace(COALESCE(d.tax_number, ''), '\D', '', 'g'), '')
       JOIN public.proc_vendor_profiles v ON v.customer_id = c.id
      WHERE d.id = p_doc LIMIT 1));
$$;

-- Siparişin açık değerleri: faturalanmamış tutar, kabul edilip faturalanmamış tutar
CREATE OR REPLACE FUNCTION public.proc_order_open_values(p_order uuid, OUT remaining numeric, OUT received_uninvoiced numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(o.subtotal - o.invoiced_net, 0),
         COALESCE((SELECT sum(GREATEST(l.received_qty - l.invoiced_qty, 0) * l.unit_price * (1 - l.discount_pct / 100)) FROM public.proc_order_lines l WHERE l.order_id = o.id), 0)
    FROM public.proc_orders o WHERE o.id = p_order;
$$;

-- Otomatik öneriler: aynı tedarikçi, fatura tarihi ≥ sipariş tarihi, açık sipariş, tutar yakın (±%15 içinde gösterilir)
CREATE OR REPLACE FUNCTION public.proc_invoice_suggestions()
RETURNS TABLE (document_id uuid, doc_no text, issue_date date, contact_name text, invoice_net numeric, order_id uuid, order_no text,
               vendor_name text, expected_net numeric, remaining numeric, diff_pct numeric, within_tolerance boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tol numeric;
BEGIN
  IF NOT (public.proc_is_finance() OR public.proc_is_buyer()) THEN RETURN; END IF;
  SELECT COALESCE(invoice_price_tolerance_pct, 2) INTO v_tol FROM public.proc_policies WHERE organization_id = public.current_org_id();
  v_tol := COALESCE(v_tol, 2);
  RETURN QUERY
  WITH docs AS (
    SELECT d.id, d.doc_no::text, d.issue_date, d.contact_name::text, COALESCE(d.net_total_try, d.net_total, 0)::numeric AS net, d.customer_id,
           NULLIF(regexp_replace(COALESCE(d.tax_number, ''), '\D', '', 'g'), '') AS tax
      FROM public.parasut_documents d
     WHERE d.organization_id = public.current_org_id() AND d.kind = 'purchase_bill' AND d.issue_date >= current_date - 400
       AND NOT EXISTS (SELECT 1 FROM public.proc_invoice_matches m WHERE m.parasut_document_id = d.id AND m.status NOT IN ('rejected','reversed'))
       AND NOT EXISTS (SELECT 1 FROM public.proc_invoice_decisions x WHERE x.parasut_document_id = d.id)
  ), ords AS (
    SELECT o.id, o.order_no::text, o.order_date, o.vendor_id, c.name::text AS vname, NULLIF(regexp_replace(COALESCE(c.tax_number, ''), '\D', '', 'g'), '') AS tax,
           ov.remaining, ov.received_uninvoiced
      FROM public.proc_orders o JOIN public.customers c ON c.id = o.vendor_id
      CROSS JOIN LATERAL public.proc_order_open_values(o.id) ov
     WHERE o.organization_id = public.current_org_id() AND o.status IN ('sent','acknowledged','partially_received','received','invoiced')
       AND ov.remaining > 0
  )
  SELECT d.id, d.doc_no, d.issue_date, d.contact_name, d.net, o.id, o.order_no, o.vname,
         round(o.received_uninvoiced, 2), round(o.remaining, 2),
         round(CASE WHEN o.received_uninvoiced > 0 THEN (d.net - o.received_uninvoiced) / o.received_uninvoiced * 100 END, 2),
         o.received_uninvoiced > 0 AND abs(d.net - o.received_uninvoiced) <= o.received_uninvoiced * v_tol / 100 + 0.01
    FROM docs d JOIN ords o ON (o.vendor_id = d.customer_id OR (d.tax IS NOT NULL AND d.tax = o.tax))
   WHERE d.issue_date >= o.order_date
     AND (abs(d.net - o.received_uninvoiced) <= GREATEST(o.received_uninvoiced, 1) * 0.15 OR abs(d.net - o.remaining) <= GREATEST(o.remaining, 1) * 0.15)
   ORDER BY 12 DESC, abs(d.net - o.received_uninvoiced), d.issue_date DESC;
END $$;

-- Eşleşmeyi uygula: faturalanan miktar dağılımı, invoiced_net, sipariş/talep durumu
CREATE OR REPLACE FUNCTION public.proc_invoice_apply(p_match uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; o record; v_recv numeric; v_f numeric; v_alloc jsonb; v_tol numeric; v_all_recv boolean; r uuid;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  SELECT * INTO m FROM public.proc_invoice_matches WHERE id = p_match FOR UPDATE;
  SELECT * INTO o FROM public.proc_orders WHERE id = m.order_id FOR UPDATE;
  SELECT received_uninvoiced INTO v_recv FROM public.proc_order_open_values(o.id);
  v_f := CASE WHEN v_recv > 0 THEN LEAST(1, m.invoice_net / v_recv) ELSE 0 END;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_line_id', l.id, 'qty', round(GREATEST(l.received_qty - l.invoiced_qty, 0) * v_f, 2))), '[]'::jsonb) INTO v_alloc
    FROM public.proc_order_lines l WHERE l.order_id = o.id AND l.received_qty > l.invoiced_qty;
  UPDATE public.proc_order_lines l SET invoiced_qty = l.invoiced_qty + (a ->> 'qty')::numeric
    FROM jsonb_array_elements(v_alloc) a WHERE l.id = (a ->> 'order_line_id')::uuid;
  UPDATE public.proc_invoice_matches SET allocation = v_alloc WHERE id = m.id;
  SELECT COALESCE(invoice_price_tolerance_pct, 2) INTO v_tol FROM public.proc_policies WHERE organization_id = o.organization_id;
  UPDATE public.proc_orders SET invoiced_net = invoiced_net + m.invoice_net WHERE id = o.id;
  SELECT bool_and(received_qty >= quantity) INTO v_all_recv FROM public.proc_order_lines WHERE order_id = o.id;
  -- Tamamı teslim alınıp faturalandıysa kapanır; tamamı teslim alındıysa "faturalandı"; aksi halde teslim süreci sürer
  UPDATE public.proc_orders SET
    status = CASE WHEN v_all_recv AND invoiced_net >= subtotal * (1 - COALESCE(v_tol, 2) / 100) THEN 'closed' WHEN v_all_recv THEN 'invoiced' ELSE status END,
    closed_at = CASE WHEN v_all_recv AND invoiced_net >= subtotal * (1 - COALESCE(v_tol, 2) / 100) THEN now() ELSE closed_at END
   WHERE id = o.id;
  FOREACH r IN ARRAY o.request_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.proc_orders x WHERE r = ANY(x.request_ids) AND x.status NOT IN ('closed','cancelled')) THEN
      UPDATE public.proc_requests SET status = 'closed', closed_at = now() WHERE id = r AND status IN ('ordered','received');
    END IF;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.proc_invoice_apply(uuid) FROM PUBLIC, anon, authenticated;

-- Eşleştir: tolerans içindeyse uygulanır; dışındaysa mali işler onayı bekler
CREATE OR REPLACE FUNCTION public.proc_invoice_match(p_order uuid, p_doc uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; d record; v_net numeric; v_rem numeric; v_recv numeric; v_tp numeric; v_tq numeric; v_status text; v_id uuid; v_lines jsonb;
        v_all_recv boolean; v_u uuid;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT (public.proc_is_finance() OR public.proc_is_buyer()) THEN RAISE EXCEPTION 'Fatura eşleştirme için mali işler veya satınalma rolü gerekir.'; END IF;
  SELECT * INTO o FROM public.proc_orders WHERE id = p_order AND organization_id = public.current_org_id() FOR UPDATE;
  IF o.id IS NULL OR o.status IN ('draft','pending_approval','approved','cancelled','closed') THEN RAISE EXCEPTION 'Bu sipariş fatura eşleştirmeye açık değil.'; END IF;
  SELECT * INTO d FROM public.parasut_documents WHERE id = p_doc AND organization_id = o.organization_id AND kind = 'purchase_bill';
  IF d.id IS NULL THEN RAISE EXCEPTION 'Paraşüt alış faturası bulunamadı.'; END IF;
  IF EXISTS (SELECT 1 FROM public.proc_invoice_matches WHERE parasut_document_id = d.id AND status NOT IN ('rejected','reversed')) THEN RAISE EXCEPTION 'Bu fatura zaten eşleştirilmiş.'; END IF;
  IF d.customer_id IS DISTINCT FROM o.vendor_id AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.vendor_id
       AND NULLIF(regexp_replace(COALESCE(c.tax_number, ''), '\D', '', 'g'), '') = NULLIF(regexp_replace(COALESCE(d.tax_number, ''), '\D', '', 'g'), '')) THEN
    RAISE EXCEPTION 'Faturanın carisi / vergi numarası siparişin tedarikçisiyle eşleşmiyor.';
  END IF;
  IF d.issue_date < o.order_date THEN RAISE EXCEPTION 'Fatura tarihi sipariş tarihinden önce.'; END IF;
  v_net := COALESCE(d.net_total_try, d.net_total, 0);
  SELECT remaining, received_uninvoiced INTO v_rem, v_recv FROM public.proc_order_open_values(o.id);
  SELECT COALESCE(invoice_price_tolerance_pct, 2), COALESCE(invoice_qty_tolerance_pct, 0) INTO v_tp, v_tq FROM public.proc_policies WHERE organization_id = o.organization_id;
  v_tp := COALESCE(v_tp, 2); v_tq := COALESCE(v_tq, 0);
  SELECT bool_and(received_qty >= quantity) INTO v_all_recv FROM public.proc_order_lines WHERE order_id = o.id;
  -- Tamamı teslim alınmışsa fark fiyattandır; eksik teslimde sipariş kalanını aşan fazla faturalama, aşmayan teslim edilmemiş miktarın faturalanmasıdır
  v_status := CASE
    WHEN v_net <= v_recv * (1 + GREATEST(v_tp, v_tq) / 100) + 0.01 THEN 'matched'
    WHEN v_all_recv THEN 'price_variance'
    WHEN v_net > v_rem * (1 + v_tp / 100) + 0.01 THEN 'over_invoiced'
    ELSE 'qty_variance' END;
  -- Paraşüt kalemleri (varsa) karar ekranında gösterilir; kalemsiz faturada toplam üzerinden eşleşir
  IF to_regclass('public.parasut_document_lines') IS NOT NULL THEN
    EXECUTE 'SELECT COALESCE(jsonb_agg(jsonb_build_object(''description'', COALESCE(description, product_name), ''quantity'', quantity, ''unit_price'', unit_price, ''net'', net_total_try)), ''[]''::jsonb)
               FROM public.parasut_document_lines WHERE document_id = $1' INTO v_lines USING d.id;
  END IF;
  INSERT INTO public.proc_invoice_matches (organization_id, order_id, parasut_document_id, invoice_net, expected_net, status, variance, note)
  VALUES (o.organization_id, o.id, d.id, v_net, round(v_recv, 2), v_status,
          jsonb_build_object('diff', round(v_net - v_recv, 2), 'diff_pct', CASE WHEN v_recv > 0 THEN round((v_net - v_recv) / v_recv * 100, 2) END,
                             'remaining', round(v_rem, 2), 'tol_price', v_tp, 'tol_qty', v_tq, 'lines', COALESCE(v_lines, '[]'::jsonb)),
          NULLIF(left(trim(COALESCE(p_note, '')), 1000), ''))
  RETURNING id INTO v_id;
  IF v_status = 'matched' THEN
    PERFORM public.proc_invoice_apply(v_id);
  ELSE
    FOR v_u IN SELECT * FROM public.proc_role_holders('finance') LOOP
      PERFORM public.proc_notify(v_u, 'Fatura farkı onay bekliyor: ' || o.order_no, COALESCE(d.doc_no, 'Fatura') || ' · ₺' || public.proc_fmt_tl(v_net)
        || ' / beklenen ₺' || public.proc_fmt_tl(v_recv), 'warning', 'proc_order', o.id, '/procure/faturalar');
    END LOOP;
  END IF;
  RETURN jsonb_build_object('id', v_id, 'status', v_status);
END $$;

-- Tolerans dışı farkı mali işler onaylar (gerekçeyle) veya reddeder
CREATE OR REPLACE FUNCTION public.proc_invoice_match_decide(p_match uuid, p_approve boolean, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_finance() THEN RAISE EXCEPTION 'Tolerans dışı farkı yalnızca mali işler veya satınalma yöneticisi onaylayabilir.'; END IF;
  IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Gerekçe zorunlu.'; END IF;
  SELECT * INTO m FROM public.proc_invoice_matches WHERE id = p_match AND organization_id = public.current_org_id() FOR UPDATE;
  IF m.id IS NULL OR m.status NOT IN ('price_variance','qty_variance','over_invoiced') THEN RAISE EXCEPTION 'Onay bekleyen fark bulunamadı.'; END IF;
  UPDATE public.proc_invoice_matches SET status = CASE WHEN p_approve THEN 'approved_with_variance' ELSE 'rejected' END,
         approved_by = auth.uid(), approved_at = now(), note = concat_ws(' · ', note, left(trim(p_note), 1000)) WHERE id = m.id;
  IF p_approve THEN PERFORM public.proc_invoice_apply(m.id); END IF;
  RETURN jsonb_build_object('status', CASE WHEN p_approve THEN 'approved_with_variance' ELSE 'rejected' END);
END $$;

-- Hatalı eşleşmeyi geri al (mali işler / yönetici): faturalanan miktar ve tutar geri düşülür
CREATE OR REPLACE FUNCTION public.proc_invoice_unmatch(p_match uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; o record; r uuid;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_finance() THEN RAISE EXCEPTION 'Eşleşmeyi yalnızca mali işler veya satınalma yöneticisi geri alabilir.'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Gerekçe zorunlu.'; END IF;
  SELECT * INTO m FROM public.proc_invoice_matches WHERE id = p_match AND organization_id = public.current_org_id() FOR UPDATE;
  IF m.id IS NULL OR m.status NOT IN ('matched','approved_with_variance') THEN RAISE EXCEPTION 'Geri alınacak eşleşme bulunamadı.'; END IF;
  SELECT * INTO o FROM public.proc_orders WHERE id = m.order_id FOR UPDATE;
  IF o.is_retroactive THEN RAISE EXCEPTION 'Sonradan açılan siparişin eşleşmesi geri alınamaz; siparişsiz fatura kararını kullanın.'; END IF;
  UPDATE public.proc_order_lines l SET invoiced_qty = GREATEST(l.invoiced_qty - (a ->> 'qty')::numeric, 0)
    FROM jsonb_array_elements(COALESCE(m.allocation, '[]'::jsonb)) a WHERE l.id = (a ->> 'order_line_id')::uuid;
  UPDATE public.proc_orders SET invoiced_net = GREATEST(invoiced_net - m.invoice_net, 0),
         status = CASE WHEN status IN ('closed','invoiced') THEN 'received' ELSE status END, closed_at = NULL WHERE id = o.id;
  UPDATE public.proc_invoice_matches SET status = 'reversed', note = concat_ws(' · ', note, 'Geri alındı: ' || left(trim(p_reason), 500)) WHERE id = m.id;
  FOREACH r IN ARRAY o.request_ids LOOP
    UPDATE public.proc_requests SET status = 'received', closed_at = NULL WHERE id = r AND status = 'closed';
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.proc_invoice_suggestions(), public.proc_invoice_match(uuid, uuid, text),
  public.proc_invoice_match_decide(uuid, boolean, text), public.proc_invoice_unmatch(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. SİPARİŞSİZ FATURALAR (Procure tedarikçilerinden, eşleşmemiş Paraşüt alış faturaları)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proc_unordered_invoices(p_from date DEFAULT NULL)
RETURNS TABLE (document_id uuid, doc_no text, issue_date date, contact_name text, vendor_id uuid, vendor_name text, invoice_net numeric,
               category text, decision text, reason text, order_id uuid, decided_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.proc_is_finance() OR public.proc_is_buyer()) THEN RETURN; END IF;
  RETURN QUERY
  SELECT d.id, d.doc_no::text, d.issue_date, d.contact_name::text, v.vid, c.name::text, COALESCE(d.net_total_try, d.net_total, 0)::numeric, d.category::text,
         x.decision, x.reason, x.order_id, x.decided_at
    FROM public.parasut_documents d
    CROSS JOIN LATERAL (SELECT public.proc_doc_vendor(d.id) AS vid) v
    JOIN public.customers c ON c.id = v.vid
    LEFT JOIN public.proc_invoice_decisions x ON x.parasut_document_id = d.id
   WHERE d.organization_id = public.current_org_id() AND d.kind = 'purchase_bill' AND v.vid IS NOT NULL
     AND d.issue_date >= COALESCE(p_from, current_date - 365)
     AND NOT EXISTS (SELECT 1 FROM public.proc_invoice_matches m JOIN public.proc_orders o ON o.id = m.order_id
                      WHERE m.parasut_document_id = d.id AND m.status NOT IN ('rejected','reversed') AND NOT o.is_retroactive)
   ORDER BY (x.id IS NULL) DESC, d.issue_date DESC;
END $$;

CREATE OR REPLACE FUNCTION public.proc_invoice_no_order(p_doc uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.proc_is_finance() THEN RAISE EXCEPTION 'Bu kararı mali işler veya satınalma yöneticisi verir.'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Gerekçe zorunlu.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parasut_documents WHERE id = p_doc AND organization_id = public.current_org_id() AND kind = 'purchase_bill') THEN RAISE EXCEPTION 'Fatura bulunamadı.'; END IF;
  IF EXISTS (SELECT 1 FROM public.proc_invoice_matches WHERE parasut_document_id = p_doc AND status NOT IN ('rejected','reversed')) THEN RAISE EXCEPTION 'Fatura bir siparişle eşleşmiş.'; END IF;
  INSERT INTO public.proc_invoice_decisions (organization_id, parasut_document_id, decision, reason)
  VALUES (public.current_org_id(), p_doc, 'no_order_needed', left(trim(p_reason), 1000))
  ON CONFLICT (parasut_document_id) DO UPDATE SET decision = 'no_order_needed', reason = EXCLUDED.reason, decided_by = auth.uid(), decided_at = now();
END $$;

-- Sonradan sipariş: faturadan (Paraşüt kalemleri varsa kalem kalem) kapanmış bir sipariş açılır ve eşleştirilir.
-- KPI'da "siparişsiz alım" olarak sayılmaya devam eder (is_retroactive).
CREATE OR REPLACE FUNCTION public.proc_order_from_invoice(p_doc uuid, p_cost_center uuid, p_category uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_vendor uuid; v_id uuid; v_line uuid; v_n int := 0; v_match uuid; v_kind text;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_finance() AND NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Mali işler veya satınalma rolü gerekir.'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Gerekçe zorunlu (neden önceden sipariş açılmadı?).'; END IF;
  SELECT * INTO d FROM public.parasut_documents WHERE id = p_doc AND organization_id = public.current_org_id() AND kind = 'purchase_bill';
  IF d.id IS NULL THEN RAISE EXCEPTION 'Fatura bulunamadı.'; END IF;
  IF EXISTS (SELECT 1 FROM public.proc_invoice_matches WHERE parasut_document_id = d.id AND status NOT IN ('rejected','reversed')) THEN RAISE EXCEPTION 'Fatura zaten eşleşmiş.'; END IF;
  v_vendor := COALESCE(public.proc_doc_vendor(d.id), d.customer_id);
  IF v_vendor IS NULL THEN RAISE EXCEPTION 'Faturanın carisi bağlı değil; önce tedarikçiyi ekleyin.'; END IF;
  SELECT kind INTO v_kind FROM public.proc_categories WHERE id = p_category;
  INSERT INTO public.proc_orders (organization_id, vendor_id, cost_center_id, category_id, budget_line_id, buyer_id, order_date, expected_date, status,
                                  is_retroactive, notes, order_no, approved_at)
  VALUES (d.organization_id, v_vendor, p_cost_center, p_category,
          public.proc_find_budget(p_cost_center, p_category, public.proc_fiscal_year(d.issue_date)), auth.uid(), d.issue_date, d.issue_date, 'draft',
          true, 'Sonradan açıldı (siparişsiz fatura ' || COALESCE(d.doc_no, '') || '): ' || left(trim(p_reason), 500),
          public.next_document_number('proc_order', 'SAS'), now())
  RETURNING id INTO v_id;
  IF to_regclass('public.parasut_document_lines') IS NOT NULL THEN
    EXECUTE 'INSERT INTO public.proc_order_lines (organization_id, order_id, description, quantity, unit_price, discount_pct, vat_rate, received_qty, is_service, sort)
             SELECT $1, $2, COALESCE(NULLIF(description, ''''), product_name, ''Fatura kalemi''), GREATEST(COALESCE(quantity, 1), 0.01),
                    CASE WHEN COALESCE(quantity, 0) > 0 THEN round(net_total_try / quantity, 4) ELSE net_total_try END, 0, COALESCE(vat_rate, 20),
                    GREATEST(COALESCE(quantity, 1), 0.01), $3, row_number() OVER ()
               FROM public.parasut_document_lines WHERE document_id = $4 AND COALESCE(net_total_try, 0) > 0'
      USING d.organization_id, v_id, COALESCE(v_kind = 'service', false), d.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  IF v_n = 0 THEN
    INSERT INTO public.proc_order_lines (organization_id, order_id, description, quantity, unit_price, vat_rate, received_qty, is_service, sort)
    VALUES (d.organization_id, v_id, 'Fatura ' || COALESCE(d.doc_no, '') || COALESCE(' · ' || d.description, ''), 1, COALESCE(d.net_total_try, d.net_total, 0), 20, 1,
            COALESCE(v_kind = 'service', false), 1);
  END IF;
  UPDATE public.proc_orders SET status = 'received' WHERE id = v_id;
  INSERT INTO public.proc_invoice_matches (organization_id, order_id, parasut_document_id, invoice_net, expected_net, status, note)
  VALUES (d.organization_id, v_id, d.id, COALESCE(d.net_total_try, d.net_total, 0), COALESCE(d.net_total_try, d.net_total, 0), 'matched', 'Sonradan sipariş')
  RETURNING id INTO v_match;
  PERFORM public.proc_invoice_apply(v_match);
  -- Kalem yuvarlamasından kalan küçük farkta da kapanır
  UPDATE public.proc_orders SET status = 'closed', closed_at = COALESCE(closed_at, now()) WHERE id = v_id;
  INSERT INTO public.proc_invoice_decisions (organization_id, parasut_document_id, decision, reason, order_id)
  VALUES (d.organization_id, d.id, 'order_created', left(trim(p_reason), 1000), v_id)
  ON CONFLICT (parasut_document_id) DO UPDATE SET decision = 'order_created', reason = EXCLUDED.reason, order_id = v_id, decided_by = auth.uid(), decided_at = now();
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.proc_unordered_invoices(date), public.proc_invoice_no_order(uuid, text), public.proc_order_from_invoice(uuid, uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. TEDARİKÇİ DEĞERLENDİRME (ISO 9001 md. 8.4)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_vendor_evaluations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  vendor_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  kind            text NOT NULL DEFAULT 'periodic' CHECK (kind IN ('initial','periodic','order')),
  criteria        jsonb NOT NULL,     -- [{key, label, weight, score 1–5 | null, auto_score, note}]
  metrics         jsonb,              -- değerlendirme anındaki otomatik veriler
  score           numeric(5,1) NOT NULL,
  grade           text NOT NULL CHECK (grade IN ('A','B','C','D')),
  decision        text NOT NULL CHECK (decision IN ('approve','conditional','block')),
  action_note     text,
  evaluated_by    uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proc_vendor_eval_period_chk CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS proc_vendor_evaluations_idx ON public.proc_vendor_evaluations (organization_id, vendor_id, created_at DESC);

-- Dönemin otomatik verileri ve 1–5 öneri puanları
CREATE OR REPLACE FUNCTION public.proc_vendor_metrics(p_vendor uuid, p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.current_org_id(); v_orders int; v_ontime int; v_rec numeric; v_rej numeric; v_issues int; v_major int; v_svc numeric; v_svc_n int;
        v_rank numeric; v_rfqs int; v_docs int; v_exp int; v_spend numeric; v_q int; v_t int; v_p int; v_c int; v_k int; v_rate numeric; v_rr numeric;
BEGIN
  IF NOT (public.proc_is_buyer() OR public.proc_is_finance()) THEN RETURN NULL; END IF;
  -- Zamanında teslim: dönemde tamamı teslim alınan siparişlerde son kabul tarihi ≤ (tedarikçinin bildirdiği veya istenen) tarih
  SELECT count(*), count(*) FILTER (WHERE x.done <= COALESCE(x.ack_expected_date, x.expected_date)) INTO v_orders, v_ontime
    FROM (SELECT o.id, o.expected_date, o.ack_expected_date, max(r.confirmed_at)::date AS done
            FROM public.proc_orders o JOIN public.proc_receipts r ON r.order_id = o.id AND r.status = 'confirmed'
           WHERE o.organization_id = v_org AND o.vendor_id = p_vendor AND NOT o.is_retroactive AND o.status IN ('received','invoiced','closed')
           GROUP BY o.id HAVING max(r.confirmed_at)::date BETWEEN p_from AND p_to) x;
  SELECT COALESCE(sum(l.qty_received), 0), COALESCE(sum(l.qty_rejected), 0), avg(r.service_rating), count(r.service_rating)
    INTO v_rec, v_rej, v_svc, v_svc_n
    FROM public.proc_receipts r JOIN public.proc_orders o ON o.id = r.order_id LEFT JOIN public.proc_receipt_lines l ON l.receipt_id = r.id
   WHERE o.organization_id = v_org AND o.vendor_id = p_vendor AND r.status = 'confirmed' AND r.confirmed_at::date BETWEEN p_from AND p_to;
  SELECT count(*), count(*) FILTER (WHERE severity IN ('major','critical')) INTO v_issues, v_major
    FROM public.proc_vendor_issues WHERE organization_id = v_org AND vendor_id = p_vendor AND created_at::date BETWEEN p_from AND p_to AND source <> 'evaluation';
  -- Fiyat sıralaması: dönemde sonuçlanan RFQ'larda geçerli teklifler arasında kaçıncı (1 = en düşük)
  SELECT avg(rk), count(*) INTO v_rank, v_rfqs FROM (
    SELECT q.rfq_vendor_id, v.vendor_id, rank() OVER (PARTITION BY v.rfq_id ORDER BY q.total_net) AS rk
      FROM public.proc_quotes q JOIN public.proc_rfq_vendors v ON v.id = q.rfq_vendor_id JOIN public.proc_rfqs f ON f.id = v.rfq_id
     WHERE f.organization_id = v_org AND q.is_current AND NOT v.declined AND q.total_net > 0
       AND f.status IN ('awarded','closed','pending_award') AND COALESCE(f.awarded_at, f.closed_at)::date BETWEEN p_from AND p_to) z
   WHERE z.vendor_id = p_vendor;
  SELECT jsonb_array_length(documents), (SELECT count(*) FROM jsonb_array_elements(documents) e WHERE NULLIF(e ->> 'valid_until', '')::date < current_date)
    INTO v_docs, v_exp FROM public.proc_vendor_profiles WHERE customer_id = p_vendor;
  SELECT COALESCE(sum(subtotal), 0) INTO v_spend FROM public.proc_orders
   WHERE organization_id = v_org AND vendor_id = p_vendor AND status <> 'cancelled' AND order_date BETWEEN p_from AND p_to;

  v_rr := CASE WHEN v_rec + v_rej > 0 THEN v_rej / (v_rec + v_rej) * 100 END;
  v_q := CASE WHEN v_rr IS NULL AND v_issues = 0 THEN NULL
              ELSE GREATEST(1, (CASE WHEN COALESCE(v_rr, 0) = 0 THEN 5 WHEN v_rr < 2 THEN 4 WHEN v_rr < 5 THEN 3 WHEN v_rr < 10 THEN 2 ELSE 1 END) - LEAST(v_major, 2) - CASE WHEN v_issues - v_major >= 2 THEN 1 ELSE 0 END) END;
  v_rate := CASE WHEN v_orders > 0 THEN v_ontime::numeric / v_orders * 100 END;
  v_t := CASE WHEN v_rate IS NULL THEN NULL WHEN v_rate >= 95 THEN 5 WHEN v_rate >= 85 THEN 4 WHEN v_rate >= 70 THEN 3 WHEN v_rate >= 50 THEN 2 ELSE 1 END;
  v_p := CASE WHEN v_rank IS NULL THEN NULL WHEN v_rank <= 1 THEN 5 WHEN v_rank <= 1.5 THEN 4 WHEN v_rank <= 2 THEN 3 WHEN v_rank <= 3 THEN 2 ELSE 1 END;
  v_c := CASE WHEN v_svc IS NULL THEN NULL ELSE GREATEST(1, LEAST(5, round(v_svc)))::int END;
  v_k := CASE WHEN COALESCE(v_docs, 0) = 0 THEN NULL WHEN v_exp = 0 THEN 5 WHEN v_exp = 1 THEN 3 ELSE 1 END;
  RETURN jsonb_build_object(
    'orders_completed', v_orders, 'on_time', v_ontime, 'on_time_pct', round(v_rate, 1),
    'qty_received', v_rec, 'qty_rejected', v_rej, 'reject_pct', round(v_rr, 2), 'issues', v_issues, 'major_issues', v_major,
    'service_avg', round(v_svc, 2), 'service_n', v_svc_n, 'price_rank_avg', round(v_rank, 2), 'rfqs', v_rfqs,
    'docs', COALESCE(v_docs, 0), 'docs_expired', COALESCE(v_exp, 0), 'spend', v_spend,
    'suggested', jsonb_build_object('quality', v_q, 'on_time', v_t, 'price', v_p, 'communication', v_c, 'compliance', v_k));
END $$;
GRANT EXECUTE ON FUNCTION public.proc_vendor_metrics(uuid, date, date) TO authenticated;

-- Değerlendirme kaydı: puan ve not sunucuda hesaplanır; karar profile işlenir; şartlı onay düzeltici faaliyet açar
-- p: {period_start, period_end, kind, criteria:[{key,label,weight,score,auto_score,note}], decision, action_note}
CREATE OR REPLACE FUNCTION public.proc_vendor_evaluate(p_vendor uuid, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.current_org_id(); c jsonb; v_w numeric := 0; v_sum numeric := 0; v_score numeric; v_grade text; v_sugg text; v_dec text := p ->> 'decision';
        v_months int; v_id uuid; v_metrics jsonb; v_from date := NULLIF(p ->> 'period_start', '')::date; v_to date := NULLIF(p ->> 'period_end', '')::date;
BEGIN
  IF NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Değerlendirme için satınalma uzmanı veya yöneticisi rolü gerekir.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proc_vendor_profiles WHERE customer_id = p_vendor AND organization_id = v_org) THEN RAISE EXCEPTION 'Tedarikçi profili bulunamadı.'; END IF;
  IF v_from IS NULL OR v_to IS NULL OR v_to < v_from THEN RAISE EXCEPTION 'Değerlendirme dönemini girin.'; END IF;
  IF v_dec NOT IN ('approve','conditional','block') THEN RAISE EXCEPTION 'Karar seçin (onay / şartlı / blok).'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(COALESCE(p -> 'criteria', '[]'::jsonb)) LOOP
    IF NULLIF(c ->> 'score', '') IS NULL THEN CONTINUE; END IF;
    IF (c ->> 'score')::numeric NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Puanlar 1–5 arasında olmalı.'; END IF;
    v_w := v_w + COALESCE((c ->> 'weight')::numeric, 0);
    v_sum := v_sum + COALESCE((c ->> 'weight')::numeric, 0) * (c ->> 'score')::numeric / 5;
  END LOOP;
  IF v_w <= 0 THEN RAISE EXCEPTION 'En az bir kritere puan verin.'; END IF;
  v_score := round(v_sum / v_w * 100, 1);
  v_grade := CASE WHEN v_score >= 85 THEN 'A' WHEN v_score >= 70 THEN 'B' WHEN v_score >= 50 THEN 'C' ELSE 'D' END;
  v_sugg := CASE v_grade WHEN 'D' THEN 'block' WHEN 'C' THEN 'conditional' ELSE 'approve' END;
  IF v_dec <> v_sugg AND coalesce(trim(p ->> 'action_note'), '') = '' THEN
    RAISE EXCEPTION 'Not % için önerilen karar farklı; kararınızın gerekçesini yazın.', v_grade;
  END IF;
  IF v_dec = 'conditional' AND coalesce(trim(p ->> 'action_note'), '') = '' THEN RAISE EXCEPTION 'Şartlı onayda beklenen düzeltici faaliyeti yazın.'; END IF;
  v_metrics := public.proc_vendor_metrics(p_vendor, v_from, v_to);
  INSERT INTO public.proc_vendor_evaluations (organization_id, vendor_id, period_start, period_end, kind, criteria, metrics, score, grade, decision, action_note)
  VALUES (v_org, p_vendor, v_from, v_to, COALESCE(NULLIF(p ->> 'kind', ''), 'periodic'), p -> 'criteria', v_metrics, v_score, v_grade, v_dec, NULLIF(left(trim(COALESCE(p ->> 'action_note', '')), 2000), ''))
  RETURNING id INTO v_id;
  SELECT vendor_reevaluation_months INTO v_months FROM public.proc_policies WHERE organization_id = v_org;
  UPDATE public.proc_vendor_profiles SET score = v_score, grade = v_grade,
         status = CASE v_dec WHEN 'approve' THEN 'approved' WHEN 'conditional' THEN 'conditional' ELSE 'blocked' END,
         next_evaluation_due = (current_date + make_interval(months => CASE WHEN v_dec = 'conditional' THEN LEAST(COALESCE(v_months, 12), 6) ELSE COALESCE(v_months, 12) END))::date
   WHERE customer_id = p_vendor;
  IF v_dec = 'conditional' THEN
    INSERT INTO public.proc_vendor_issues (organization_id, vendor_id, source, severity, title, description, corrective_action, status)
    VALUES (v_org, p_vendor, 'evaluation', 'major', 'Değerlendirme: şartlı onay (' || v_grade || ', ' || v_score || ')', 'Dönem ' || to_char(v_from, 'DD.MM.YYYY') || '–' || to_char(v_to, 'DD.MM.YYYY'),
            left(trim(p ->> 'action_note'), 2000), 'action');
  END IF;
  RETURN jsonb_build_object('id', v_id, 'score', v_score, 'grade', v_grade, 'suggested', v_sugg);
END $$;
GRANT EXECUTE ON FUNCTION public.proc_vendor_evaluate(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. KPI (panel ve raporlar) — satınalma / mali işler / yönetici
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proc_kpis(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.current_org_id(); j jsonb := '{}'::jsonb; v_fy text; x record;
BEGIN
  IF NOT (public.proc_is_buyer() OR public.proc_is_finance()) THEN RETURN NULL; END IF;
  -- Talep → sipariş süresi (gün) ve onay süresi (gün)
  SELECT round(avg(EXTRACT(epoch FROM o.created_at - rq.sub) / 86400)::numeric, 1) AS v INTO x
    FROM public.proc_orders o CROSS JOIN LATERAL (SELECT min(r.submitted_at) AS sub FROM public.proc_requests r WHERE r.id = ANY(o.request_ids)) rq
   WHERE o.organization_id = v_org AND NOT o.is_retroactive AND o.status <> 'cancelled' AND o.created_at::date BETWEEN p_from AND p_to AND rq.sub IS NOT NULL;
  j := j || jsonb_build_object('request_to_order_days', x.v);
  SELECT round(avg(EXTRACT(epoch FROM approved_at - submitted_at) / 86400)::numeric, 1) AS v, count(*) AS n INTO x
    FROM public.proc_requests WHERE organization_id = v_org AND approved_at::date BETWEEN p_from AND p_to AND submitted_at IS NOT NULL;
  j := j || jsonb_build_object('approval_days', x.v, 'approved_requests', x.n);
  -- Teklif sayısı, 3 teklif kuralına uyum, tasarruf
  SELECT round(avg(vq), 1) AS avg_q, count(*) FILTER (WHERE min_quotes_required >= 3) AS need3, count(*) FILTER (WHERE min_quotes_required >= 3 AND vq >= 3) AS ok3,
         COALESCE(sum(savings_amount), 0) AS sav, COALESCE(sum(savings_base), 0) AS base, count(*) AS n
    INTO x
    FROM (SELECT f.*, (SELECT count(DISTINCT q.rfq_vendor_id) FROM public.proc_quotes q JOIN public.proc_rfq_vendors v ON v.id = q.rfq_vendor_id
                        WHERE v.rfq_id = f.id AND q.is_current AND NOT v.declined AND q.total_net > 0) AS vq
            FROM public.proc_rfqs f WHERE f.organization_id = v_org AND f.status = 'awarded' AND f.awarded_at::date BETWEEN p_from AND p_to) z;
  j := j || jsonb_build_object('awarded_rfqs', x.n, 'avg_quotes', x.avg_q, 'three_quote_required', x.need3, 'three_quote_ok', x.ok3,
    'three_quote_pct', CASE WHEN x.need3 > 0 THEN round(x.ok3::numeric / x.need3 * 100, 1) END,
    'savings', x.sav, 'savings_pct', CASE WHEN x.base > 0 THEN round(x.sav / x.base * 100, 1) END);
  -- Zamanında teslim
  SELECT count(*) AS n, count(*) FILTER (WHERE done <= due) AS ok INTO x FROM (
    SELECT max(r.confirmed_at)::date AS done, COALESCE(o.ack_expected_date, o.expected_date) AS due
      FROM public.proc_orders o JOIN public.proc_receipts r ON r.order_id = o.id AND r.status = 'confirmed'
     WHERE o.organization_id = v_org AND NOT o.is_retroactive AND o.status IN ('received','invoiced','closed')
     GROUP BY o.id, o.ack_expected_date, o.expected_date HAVING max(r.confirmed_at)::date BETWEEN p_from AND p_to) z;
  j := j || jsonb_build_object('deliveries', x.n, 'on_time_pct', CASE WHEN x.n > 0 THEN round(x.ok::numeric / x.n * 100, 1) END);
  -- Siparişsiz alım: Procure tedarikçilerinin dönemdeki alış faturalarından siparişle eşleşmeyen (sonradan sipariş dahil) pay
  IF to_regclass('public.parasut_documents') IS NOT NULL THEN
    SELECT COALESCE(sum(net), 0) AS tot, COALESCE(sum(net) FILTER (WHERE NOT ordered), 0) AS unord, count(*) AS n, count(*) FILTER (WHERE NOT ordered) AS un INTO x FROM (
      SELECT COALESCE(d.net_total_try, d.net_total, 0) AS net,
             EXISTS (SELECT 1 FROM public.proc_invoice_matches m JOIN public.proc_orders o ON o.id = m.order_id
                      WHERE m.parasut_document_id = d.id AND m.status IN ('matched','approved_with_variance') AND NOT o.is_retroactive) AS ordered
        FROM public.parasut_documents d
       WHERE d.organization_id = v_org AND d.kind = 'purchase_bill' AND d.issue_date BETWEEN p_from AND p_to AND public.proc_doc_vendor(d.id) IS NOT NULL) z;
    j := j || jsonb_build_object('vendor_invoices', x.n, 'vendor_invoice_total', x.tot, 'unordered_count', x.un, 'unordered_total', x.unord,
      'unordered_pct', CASE WHEN x.tot > 0 THEN round(x.unord / x.tot * 100, 1) END);
  END IF;
  -- Harcama (sipariş) ve bütçe kullanımı (bugünün bütçe yılı)
  SELECT COALESCE(sum(subtotal), 0) AS s, count(*) AS n INTO x FROM public.proc_orders
   WHERE organization_id = v_org AND status <> 'cancelled' AND order_date BETWEEN p_from AND p_to;
  j := j || jsonb_build_object('order_spend', x.s, 'orders', x.n);
  v_fy := public.proc_fiscal_year(current_date);
  SELECT COALESCE(sum(b.amount), 0) AS amt, COALESCE(sum(b.amount - (u ->> 'available')::numeric), 0) AS used INTO x
    FROM public.proc_budgets b CROSS JOIN LATERAL (SELECT public.proc_budget_usage(b.id) AS u) uu
   WHERE b.organization_id = v_org AND b.fiscal_year = v_fy;
  j := j || jsonb_build_object('fiscal_year', v_fy, 'budget_total', x.amt, 'budget_used', x.used, 'budget_used_pct', CASE WHEN x.amt > 0 THEN round(x.used / x.amt * 100, 1) END);
  -- Tedarikçi sayısı ve not dağılımı
  j := j || jsonb_build_object('vendors', (SELECT jsonb_build_object('total', count(*), 'approved', count(*) FILTER (WHERE status = 'approved'),
      'conditional', count(*) FILTER (WHERE status = 'conditional'), 'blocked', count(*) FILTER (WHERE status = 'blocked'), 'candidate', count(*) FILTER (WHERE status = 'candidate'),
      'A', count(*) FILTER (WHERE grade = 'A'), 'B', count(*) FILTER (WHERE grade = 'B'), 'C', count(*) FILTER (WHERE grade = 'C'), 'D', count(*) FILTER (WHERE grade = 'D'),
      'ungraded', count(*) FILTER (WHERE grade IS NULL))
    FROM public.proc_vendor_profiles WHERE organization_id = v_org));
  RETURN j || jsonb_build_object('from', p_from, 'to', p_to);
END $$;
GRANT EXECUTE ON FUNCTION public.proc_kpis(date, date) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['proc_invoice_matches','proc_invoice_decisions','proc_vendor_evaluations'] LOOP
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
    -- Okuma: satınalma, mali işler, yönetici, onaycı (değerlendirmeler); yazma yalnızca fonksiyonlarla
    EXECUTE format('CREATE POLICY proc_sel ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
                    USING ((SELECT public.proc_is_buyer()) OR (SELECT public.proc_is_finance()) OR (SELECT public.proc_has_role(''approver'')))', tbl);
    EXECUTE format('CREATE POLICY proc_ins ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false)', tbl);
    EXECUTE format('CREATE POLICY proc_upd ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (false)', tbl);
    EXECUTE format('CREATE POLICY proc_del ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (false)', tbl);
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

-- ---------------------------------------------------------------------
-- 7. YETKİ SERTLEŞTİRME — her Procure SQL dosyasının SONUNA eklenir (tekrar çalıştırılabilir)
--   Supabase public şemadaki fonksiyonları varsayılan olarak anon'a (giriş yapmamış) açar.
--   • proc_public_%  → anon + authenticated (tedarikçi sayfaları /rfq, /po; içeride token ve hız sınırı denetimi)
--   • iç fonksiyonlar → yalnızca diğer SECURITY DEFINER fonksiyonların içinden çağrılır; authenticated'a da kapalı
--   • tetikleyici fonksiyonları → kimseye EXECUTE verilmez (tetikleyici olarak çalışır)
--   • diğer proc_% ile org_has_module / my_enabled_modules → yalnızca authenticated
-- ---------------------------------------------------------------------
DO $$
DECLARE
  f record;
  internal text[] := ARRAY['proc_notify','proc_notify_approvers','proc_event','proc_start_approval','proc_add_step','proc_add_subject_step',
                           'proc_role_holders','proc_rate_limit','proc_rfq_save_quote','proc_rfq_award_decide','proc_order_approval_state',
                           'proc_order_approval_decide','proc_invoice_apply'];
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig, p.proname, p.prorettype = 'trigger'::regtype AS is_trigger
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND (p.proname LIKE 'proc\_%' OR p.proname IN ('org_has_module','my_enabled_modules','org_modules_guard')) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    IF f.proname LIKE 'proc\_public\_%' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
    ELSIF f.is_trigger OR f.proname = ANY(internal) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'Procure Faz 1d (fatura eşleştirme, siparişsiz faturalar, tedarikçi değerlendirme, KPI) kuruldu' AS durum;
