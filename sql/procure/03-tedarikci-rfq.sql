-- =====================================================================
-- INSPIRA360 PROCURE — FAZ 1b: TEDARİKÇİ PROFİLİ + BELGELER, TEKLİF TOPLAMA (RFQ), KARŞILAŞTIRMA + ÖDÜL
--   0. Bildirimler: Procure lisanslı kurumda kişiye özel (RLS); kurum içi kişi listesi proc_org_people()
--   1. Tedarikçi profili (cari kart + proc_vendor_profiles), proc_vendor_upsert()
--   2. RFQ: proc_rfqs, proc_rfq_lines, proc_rfq_vendors (share_token), proc_quotes (+ sürümler), proc_quote_lines, proc_rfq_awards
--   3. İş akışı: RFQ oluştur / gönder / kapat / iptal, elle teklif, ödül (3 teklif kuralı + ek onay)
--   4. Tedarikçi sayfası /rfq/[token]: proc_public_rfq_get / _submit / _decline / _attach (anon, SECURITY DEFINER)
--   5. RLS, değişiklik kaydı
-- Önkoşul: 01-altyapi.sql ve 02-talep-onay-butce.sql (bu sürümü). Tek seferde çalıştırılır; tekrar çalıştırmak güvenlidir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0a. BİLDİRİMLER — Procure lisanslı kurumda herkes yalnızca kendine yazılan ve kurum geneli (user_id boş)
--     bildirimleri görür. Revenue kurumlarında mevcut davranış aynen kalır.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE NOTICE 'notifications tablosu yok, atlandı'; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id') THEN
    RAISE NOTICE 'notifications.user_id yok, atlandı'; RETURN;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notifications'::regclass) THEN
    RAISE NOTICE 'notifications için RLS kapalı; mevcut davranışı bozmamak için dokunulmadı'; RETURN;
  END IF;
  DROP POLICY IF EXISTS proc_own_notifications_sel ON public.notifications;
  DROP POLICY IF EXISTS proc_own_notifications_upd ON public.notifications;
  DROP POLICY IF EXISTS proc_own_notifications_del ON public.notifications;
  CREATE POLICY proc_own_notifications_sel ON public.notifications AS RESTRICTIVE FOR SELECT TO authenticated
    USING (NOT (SELECT public.org_has_module('procure')) OR user_id IS NULL OR user_id = auth.uid());
  CREATE POLICY proc_own_notifications_upd ON public.notifications AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (NOT (SELECT public.org_has_module('procure')) OR user_id IS NULL OR user_id = auth.uid());
  CREATE POLICY proc_own_notifications_del ON public.notifications AS RESTRICTIVE FOR DELETE TO authenticated
    USING (NOT (SELECT public.org_has_module('procure')) OR user_id IS NULL OR user_id = auth.uid());
END $$;

-- ---------------------------------------------------------------------
-- 0b. Kurum içi kişi listesi (yalnızca id, ad soyad, e-posta) — Procure ekranlarında isim gösterimi için
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proc_org_people()
RETURNS TABLE (id uuid, name text, email text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, COALESCE(NULLIF(trim(to_jsonb(u) ->> 'name'), ''), NULLIF(trim(to_jsonb(u) ->> 'full_name'), ''), u.email)::text, u.email::text
    FROM public.users u
   WHERE public.current_org_id() IS NOT NULL AND u.organization_id = public.current_org_id()
   ORDER BY 2;
$$;
GRANT EXECUTE ON FUNCTION public.proc_org_people() TO authenticated;

-- Politikaya vade düzeltmesi oranı (aylık %, karşılaştırmada opsiyonel)
ALTER TABLE public.proc_policies ADD COLUMN IF NOT EXISTS payment_term_monthly_rate_pct numeric(6,3)
  CHECK (payment_term_monthly_rate_pct IS NULL OR payment_term_monthly_rate_pct >= 0);

-- ---------------------------------------------------------------------
-- 1. TEDARİKÇİ PROFİLİ (ana kayıt = cari kart; relation_roles içinde 'supplier')
-- ---------------------------------------------------------------------
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS relation_roles text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tax_number text;

CREATE TABLE IF NOT EXISTS public.proc_vendor_profiles (
  customer_id          uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  id                   uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),   -- değişiklik kaydı için
  organization_id      uuid,
  status               text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','approved','conditional','blocked')),
  category_ids         uuid[] NOT NULL DEFAULT '{}',
  approved_at          timestamptz,
  approved_by          uuid,
  next_evaluation_due  date,
  documents            jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{type, label, valid_until, attachment_id, file_name}]
  bank_iban            text,
  contact_name         text,
  contact_email        text,
  contact_phone        text,
  notes                text,
  score                numeric(5,1),
  grade                text CHECK (grade IS NULL OR grade IN ('A','B','C','D')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proc_vendor_profiles_org_idx ON public.proc_vendor_profiles (organization_id, status);

-- Onaylanınca onaylayan ve tarih; ilk onayda yeniden değerlendirme tarihi politikadan
CREATE OR REPLACE FUNCTION public.proc_vendor_profiles_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_months int;
BEGIN
  NEW.updated_at := now();
  SELECT organization_id INTO v_org FROM public.customers WHERE id = NEW.customer_id;
  NEW.organization_id := COALESCE(NEW.organization_id, v_org, public.current_org_id());
  IF v_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Cari kart bu kuruma ait değil.'; END IF;
  NEW.bank_iban := NULLIF(upper(regexp_replace(COALESCE(NEW.bank_iban, ''), '\s', '', 'g')), '');
  IF NEW.status IN ('approved','conditional') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.approved_at := now(); NEW.approved_by := auth.uid();
    IF NEW.next_evaluation_due IS NULL THEN
      SELECT vendor_reevaluation_months INTO v_months FROM public.proc_policies WHERE organization_id = NEW.organization_id;
      NEW.next_evaluation_due := (current_date + make_interval(months => COALESCE(v_months, 12)))::date;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proc_vendor_profiles ON public.proc_vendor_profiles;
CREATE TRIGGER trg_proc_vendor_profiles BEFORE INSERT OR UPDATE ON public.proc_vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.proc_vendor_profiles_trg();

-- Tedarikçi ekle / güncelle: vergi no ile mevcut cariyi bulur, yoksa açar; 'supplier' rolünü ekler; profili açar
-- p: {customer_id?, name, tax_number?, email?, phone?, contact_name?, iban?, status?, category_ids?, notes?}
CREATE OR REPLACE FUNCTION public.proc_vendor_upsert(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.current_org_id(); v_id uuid; v_tax text; v_name text := NULLIF(trim(p ->> 'name'), '');
BEGIN
  IF NOT (public.proc_has_role('buyer') OR public.proc_has_role('procure_admin')) THEN
    RAISE EXCEPTION 'Tedarikçi eklemek için satınalma uzmanı veya yöneticisi rolü gerekir.';
  END IF;
  IF NOT public.org_has_module('procure') THEN RAISE EXCEPTION 'Satınalma modülü etkin değil.'; END IF;
  v_tax := NULLIF(regexp_replace(COALESCE(p ->> 'tax_number', ''), '\D', '', 'g'), '');
  IF v_tax IS NOT NULL AND length(v_tax) NOT IN (10, 11) THEN RAISE EXCEPTION 'Vergi no 10, TC kimlik no 11 haneli olmalı: %', v_tax; END IF;

  IF NULLIF(p ->> 'customer_id', '') IS NOT NULL THEN
    SELECT id INTO v_id FROM public.customers WHERE id = (p ->> 'customer_id')::uuid AND organization_id = v_org;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Cari kart bulunamadı.'; END IF;
  ELSIF v_tax IS NOT NULL THEN
    SELECT id INTO v_id FROM public.customers WHERE organization_id = v_org AND regexp_replace(COALESCE(tax_number, ''), '\D', '', 'g') = v_tax
     ORDER BY created_at LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    IF v_name IS NULL THEN RAISE EXCEPTION 'Tedarikçi adı gerekli.'; END IF;
    INSERT INTO public.customers (organization_id, name, tax_number, email, phone, relation_roles)
    VALUES (v_org, left(v_name, 200), v_tax, NULLIF(trim(p ->> 'email'), ''), NULLIF(trim(p ->> 'phone'), ''), '{supplier}')
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.customers SET relation_roles = CASE WHEN 'supplier' = ANY(relation_roles) THEN relation_roles ELSE array_append(relation_roles, 'supplier') END,
           tax_number = COALESCE(tax_number, v_tax)
     WHERE id = v_id;
  END IF;

  INSERT INTO public.proc_vendor_profiles (customer_id, organization_id, status, category_ids, contact_name, contact_email, contact_phone, bank_iban, notes)
  VALUES (v_id, v_org, COALESCE(NULLIF(p ->> 'status', ''), 'candidate'),
          COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(p -> 'category_ids') x), '{}'),
          NULLIF(trim(p ->> 'contact_name'), ''), NULLIF(lower(trim(p ->> 'email')), ''), NULLIF(trim(p ->> 'phone'), ''),
          NULLIF(p ->> 'iban', ''), NULLIF(p ->> 'notes', ''))
  ON CONFLICT (customer_id) DO UPDATE SET
    status        = COALESCE(NULLIF(p ->> 'status', ''), proc_vendor_profiles.status),
    category_ids  = CASE WHEN p ? 'category_ids' THEN EXCLUDED.category_ids ELSE proc_vendor_profiles.category_ids END,
    contact_name  = COALESCE(EXCLUDED.contact_name, proc_vendor_profiles.contact_name),
    contact_email = COALESCE(EXCLUDED.contact_email, proc_vendor_profiles.contact_email),
    contact_phone = COALESCE(EXCLUDED.contact_phone, proc_vendor_profiles.contact_phone),
    bank_iban     = COALESCE(EXCLUDED.bank_iban, proc_vendor_profiles.bank_iban),
    notes         = COALESCE(EXCLUDED.notes, proc_vendor_profiles.notes);
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.proc_vendor_upsert(jsonb) TO authenticated;

-- Paraşüt'te son 12 ayda alış faturası olan cariler (tedarikçi havuzuna aktarım önerisi)
CREATE OR REPLACE FUNCTION public.proc_parasut_supplier_candidates()
RETURNS TABLE (customer_id uuid, name text, tax_number text, bills int, total numeric, last_date date, is_vendor boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF to_regclass('public.parasut_documents') IS NULL OR NOT (public.proc_has_role('buyer') OR public.proc_has_role('procure_admin')) THEN RETURN; END IF;
  RETURN QUERY EXECUTE
    'SELECT d.customer_id, COALESCE(max(c.name), max(d.contact_name))::text, COALESCE(max(c.tax_number), max(d.tax_number))::text,
            count(*)::int, sum(COALESCE(d.net_total_try, d.net_total, 0))::numeric, max(d.issue_date),
            bool_or(v.customer_id IS NOT NULL)
       FROM public.parasut_documents d
       LEFT JOIN public.customers c ON c.id = d.customer_id
       LEFT JOIN public.proc_vendor_profiles v ON v.customer_id = d.customer_id
      WHERE d.organization_id = public.current_org_id() AND d.kind = ''purchase_bill''
        AND d.issue_date >= current_date - interval ''12 months''
      GROUP BY d.customer_id, CASE WHEN d.customer_id IS NULL THEN COALESCE(NULLIF(d.tax_number, ''''), d.contact_name) END
      ORDER BY 5 DESC';
END $$;
GRANT EXECUTE ON FUNCTION public.proc_parasut_supplier_candidates() TO authenticated;

-- ---------------------------------------------------------------------
-- 2. TEKLİF TOPLAMA (RFQ) — TTF-YYYY-0001
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_rfqs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid,
  rfq_no                text,
  request_ids           uuid[] NOT NULL DEFAULT '{}',
  category_id           uuid REFERENCES public.proc_categories(id) ON DELETE SET NULL,
  title                 text NOT NULL,
  buyer_id              uuid DEFAULT auth.uid(),
  deadline              timestamptz,
  delivery_terms        text,
  payment_terms         text,
  notes_to_vendors      text,
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','closed','pending_award','awarded','cancelled')),
  estimated_total       numeric(15,2),        -- bağlı taleplerin tahmini toplamı (KDV hariç)
  min_quotes_required   int NOT NULL DEFAULT 1 CHECK (min_quotes_required BETWEEN 1 AND 10),
  single_source_reason  text,
  award_reason          text,                 -- en düşük fiyat dışı seçim gerekçesi
  awarded_by            uuid,
  awarded_at            timestamptz,
  award_total           numeric(15,2),
  savings_base          numeric(15,2),
  savings_amount        numeric(15,2),
  cancel_reason         text,
  sent_at               timestamptz,
  closed_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS proc_rfqs_no_uq ON public.proc_rfqs (organization_id, rfq_no) WHERE rfq_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.proc_rfq_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  rfq_id           uuid NOT NULL REFERENCES public.proc_rfqs(id) ON DELETE CASCADE,
  request_line_id  uuid REFERENCES public.proc_request_lines(id) ON DELETE SET NULL,
  description      text NOT NULL,
  quantity         numeric(12,2) NOT NULL CHECK (quantity > 0),
  unit             text NOT NULL DEFAULT 'Adet',
  spec_note        text,
  sort             int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS proc_rfq_lines_rfq_idx ON public.proc_rfq_lines (rfq_id, sort);

CREATE TABLE IF NOT EXISTS public.proc_rfq_vendors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  rfq_id           uuid NOT NULL REFERENCES public.proc_rfqs(id) ON DELETE CASCADE,
  vendor_id        uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  share_token      uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  sent_at          timestamptz,
  first_viewed_at  timestamptz,
  last_viewed_at   timestamptz,
  view_count       int NOT NULL DEFAULT 0,
  responded_at     timestamptz,
  declined         boolean NOT NULL DEFAULT false,
  decline_reason   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, vendor_id)
);

-- Her gönderim yeni sürüm; geçerli olan is_current
CREATE TABLE IF NOT EXISTS public.proc_quotes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid,
  rfq_vendor_id      uuid NOT NULL REFERENCES public.proc_rfq_vendors(id) ON DELETE CASCADE,
  version            int NOT NULL DEFAULT 1,
  is_current         boolean NOT NULL DEFAULT true,
  currency           text NOT NULL DEFAULT 'TRY',
  valid_until        date,
  delivery_days      int CHECK (delivery_days IS NULL OR delivery_days >= 0),
  payment_term_days  int CHECK (payment_term_days IS NULL OR payment_term_days >= 0),
  notes              text,
  total_net          numeric(15,2) NOT NULL DEFAULT 0,
  total_vat          numeric(15,2) NOT NULL DEFAULT 0,
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  submitted_by_name  text,
  meta               jsonb,
  is_manual          boolean NOT NULL DEFAULT false,
  entered_by         uuid
);
CREATE INDEX IF NOT EXISTS proc_quotes_rv_idx ON public.proc_quotes (rfq_vendor_id, version DESC);

CREATE TABLE IF NOT EXISTS public.proc_quote_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid,
  quote_id          uuid NOT NULL REFERENCES public.proc_quotes(id) ON DELETE CASCADE,
  rfq_line_id       uuid NOT NULL REFERENCES public.proc_rfq_lines(id) ON DELETE CASCADE,
  unit_price        numeric(15,4),
  discount_pct      numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  vat_rate          numeric(5,2) NOT NULL DEFAULT 20 CHECK (vat_rate BETWEEN 0 AND 100),
  line_total        numeric(15,2),          -- KDV hariç, iskonto düşülmüş
  brand_model       text,
  alternative_note  text,
  can_supply        boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS proc_quote_lines_q_idx ON public.proc_quote_lines (quote_id);

CREATE TABLE IF NOT EXISTS public.proc_rfq_awards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  rfq_id           uuid NOT NULL REFERENCES public.proc_rfqs(id) ON DELETE CASCADE,
  rfq_line_id      uuid NOT NULL REFERENCES public.proc_rfq_lines(id) ON DELETE CASCADE,
  rfq_vendor_id    uuid NOT NULL REFERENCES public.proc_rfq_vendors(id) ON DELETE CASCADE,
  quote_id         uuid NOT NULL REFERENCES public.proc_quotes(id) ON DELETE CASCADE,
  quote_line_id    uuid NOT NULL REFERENCES public.proc_quote_lines(id) ON DELETE CASCADE,
  quantity         numeric(12,2) NOT NULL,
  unit_net         numeric(15,4) NOT NULL,     -- iskonto sonrası birim fiyat, KDV hariç
  line_total       numeric(15,2) NOT NULL,
  is_lowest        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, rfq_line_id)
);

-- ---------------------------------------------------------------------
-- 2b. Görünürlük ve korumalar
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proc_rfq_visible(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.proc_has_role('buyer') OR public.proc_has_role('finance') OR public.proc_has_role('procure_admin')
      OR EXISTS (SELECT 1 FROM public.proc_approvals a WHERE a.subject_type = 'rfq' AND a.subject_id = p_id
                   AND (a.approver_user_id = auth.uid() OR a.decided_by = auth.uid() OR a.approver_user_id = ANY(public.proc_delegators())
                        OR (a.approver_user_id IS NULL AND a.approver_role IS NOT NULL AND public.proc_has_role(a.approver_role))));
$$;
CREATE OR REPLACE FUNCTION public.proc_is_buyer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.proc_has_role('buyer') OR public.proc_has_role('procure_admin');
$$;
GRANT EXECUTE ON FUNCTION public.proc_rfq_visible(uuid), public.proc_is_buyer() TO authenticated;

-- RFQ: durum ve ödül alanları yalnızca iş akışı fonksiyonlarıyla değişir
CREATE OR REPLACE FUNCTION public.proc_rfqs_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF current_setting('proc.rpc', true) = '1' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'RFQ yalnızca onaylı taleplerden oluşturulur.'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.rfq_no IS DISTINCT FROM OLD.rfq_no OR NEW.request_ids IS DISTINCT FROM OLD.request_ids
     OR NEW.awarded_by IS DISTINCT FROM OLD.awarded_by OR NEW.awarded_at IS DISTINCT FROM OLD.awarded_at
     OR NEW.award_total IS DISTINCT FROM OLD.award_total OR NEW.savings_amount IS DISTINCT FROM OLD.savings_amount
     OR NEW.min_quotes_required IS DISTINCT FROM OLD.min_quotes_required OR NEW.award_reason IS DISTINCT FROM OLD.award_reason
     OR NEW.single_source_reason IS DISTINCT FROM OLD.single_source_reason THEN
    RAISE EXCEPTION 'RFQ durumu yalnızca gönder/kapat/ödül/iptal işlemleriyle değişir.';
  END IF;
  IF OLD.status NOT IN ('draft','sent') THEN RAISE EXCEPTION 'Kapanmış RFQ düzenlenemez.'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proc_rfqs_guard ON public.proc_rfqs;
CREATE TRIGGER trg_proc_rfqs_guard BEFORE INSERT OR UPDATE ON public.proc_rfqs FOR EACH ROW EXECUTE FUNCTION public.proc_rfqs_guard();

-- Gönderilmiş RFQ'nun kalemleri kilitlidir (ISO: tedarikçiler aynı şartnameye teklif verir)
CREATE OR REPLACE FUNCTION public.proc_rfq_lines_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  IF current_setting('proc.rpc', true) = '1' OR auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT status INTO v_status FROM public.proc_rfqs WHERE id = COALESCE(NEW.rfq_id, OLD.rfq_id);
  IF v_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Gönderilmiş RFQ''nun kalemleri değiştirilemez.'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_proc_rfq_lines_guard ON public.proc_rfq_lines;
CREATE TRIGGER trg_proc_rfq_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.proc_rfq_lines FOR EACH ROW EXECUTE FUNCTION public.proc_rfq_lines_guard();

-- Davet edilen tedarikçi: aynı kurumun carisi; "onaylı tedarikçi listesi zorunlu" ise yalnızca onaylı/şartlı
CREATE OR REPLACE FUNCTION public.proc_rfq_vendors_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rfq record; v_req boolean; v_st text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.proc_quotes WHERE rfq_vendor_id = OLD.id) THEN RAISE EXCEPTION 'Teklif vermiş tedarikçi RFQ''dan çıkarılamaz.'; END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO v_rfq FROM public.proc_rfqs WHERE id = NEW.rfq_id;
  NEW.organization_id := v_rfq.organization_id;
  IF TG_OP = 'INSERT' THEN
    IF v_rfq.status NOT IN ('draft','sent') THEN RAISE EXCEPTION 'Kapanmış RFQ''ya tedarikçi eklenemez.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = NEW.vendor_id AND organization_id = v_rfq.organization_id) THEN
      RAISE EXCEPTION 'Tedarikçi bulunamadı.';
    END IF;
    SELECT approved_vendor_list_required INTO v_req FROM public.proc_policies WHERE organization_id = v_rfq.organization_id;
    SELECT status INTO v_st FROM public.proc_vendor_profiles WHERE customer_id = NEW.vendor_id;
    IF v_st = 'blocked' THEN RAISE EXCEPTION 'Bu tedarikçi bloke edilmiş.'; END IF;
    IF COALESCE(v_req, false) AND COALESCE(v_st, '') NOT IN ('approved','conditional') THEN
      RAISE EXCEPTION 'Kurum politikası: yalnızca onaylı veya şartlı onaylı tedarikçiler davet edilebilir.';
    END IF;
    IF v_rfq.status = 'sent' THEN NEW.sent_at := now(); END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proc_rfq_vendors_guard ON public.proc_rfq_vendors;
CREATE TRIGGER trg_proc_rfq_vendors_guard BEFORE INSERT OR UPDATE OR DELETE ON public.proc_rfq_vendors FOR EACH ROW EXECUTE FUNCTION public.proc_rfq_vendors_guard();

-- ---------------------------------------------------------------------
-- 3. İŞ AKIŞI
-- ---------------------------------------------------------------------
-- Onaylı taleplerden RFQ oluştur (birden fazla talep birleştirilebilir)
CREATE OR REPLACE FUNCTION public.proc_rfq_create(p_request_ids uuid[], p_title text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.current_org_id(); v_id uuid; v_no text; v_sum numeric; v_n int; v_pol record; v_title text; v_cat uuid; r record;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Satınalma uzmanı yetkisi gerekir.'; END IF;
  IF COALESCE(array_length(p_request_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'En az bir onaylı talep seçin.'; END IF;
  SELECT count(*), sum(COALESCE(estimated_total, 0)), (array_agg(title ORDER BY created_at))[1], (array_agg(category_id ORDER BY created_at))[1]
    INTO v_n, v_sum, v_title, v_cat
    FROM public.proc_requests WHERE id = ANY(p_request_ids) AND organization_id = v_org AND status = 'approved';
  IF v_n <> array_length(p_request_ids, 1) THEN RAISE EXCEPTION 'Seçilen taleplerin hepsi onaylı olmalı (teklif toplamada olmayan).'; END IF;
  SELECT * INTO v_pol FROM public.proc_policies WHERE organization_id = v_org;
  v_no := public.next_document_number('proc_rfq', 'TTF');
  INSERT INTO public.proc_rfqs (organization_id, rfq_no, request_ids, category_id, title, buyer_id, deadline, payment_terms, status, estimated_total, min_quotes_required)
  VALUES (v_org, v_no, p_request_ids, v_cat, COALESCE(NULLIF(trim(p_title), ''), v_title || CASE WHEN v_n > 1 THEN ' +' || (v_n - 1) || ' talep' ELSE '' END),
          auth.uid(), date_trunc('day', now()) + interval '7 days 17 hours',
          CASE WHEN v_pol.default_payment_term_days IS NOT NULL THEN v_pol.default_payment_term_days || ' gün vade' END, 'draft', v_sum,
          CASE WHEN v_pol.three_quote_threshold IS NOT NULL AND v_sum > v_pol.three_quote_threshold THEN 3 ELSE 1 END)
  RETURNING id INTO v_id;
  INSERT INTO public.proc_rfq_lines (organization_id, rfq_id, request_line_id, description, quantity, unit, spec_note, sort)
  SELECT v_org, v_id, l.id, l.description, l.quantity, l.unit, l.spec_note, row_number() OVER (ORDER BY r2.created_at, l.sort)
    FROM public.proc_request_lines l JOIN public.proc_requests r2 ON r2.id = l.request_id WHERE l.request_id = ANY(p_request_ids);
  FOR r IN SELECT id FROM public.proc_requests WHERE id = ANY(p_request_ids) LOOP
    UPDATE public.proc_requests SET status = 'sourcing' WHERE id = r.id;
    PERFORM public.proc_event(r.id, 'comment', 'Teklif toplama başladı: ' || v_no);
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.proc_rfq_send(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f record;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Satınalma uzmanı yetkisi gerekir.'; END IF;
  SELECT * INTO f FROM public.proc_rfqs WHERE id = p_id AND organization_id = public.current_org_id() FOR UPDATE;
  IF f.id IS NULL OR f.status <> 'draft' THEN RAISE EXCEPTION 'RFQ taslak değil.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proc_rfq_lines WHERE rfq_id = p_id) THEN RAISE EXCEPTION 'RFQ''da kalem yok.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proc_rfq_vendors WHERE rfq_id = p_id) THEN RAISE EXCEPTION 'En az bir tedarikçi ekleyin.'; END IF;
  IF f.deadline IS NULL OR f.deadline <= now() THEN RAISE EXCEPTION 'Son teklif tarihi ileri bir tarih olmalı.'; END IF;
  UPDATE public.proc_rfqs SET status = 'sent', sent_at = now() WHERE id = p_id;
  UPDATE public.proc_rfq_vendors SET sent_at = COALESCE(sent_at, now()) WHERE rfq_id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.proc_rfq_close(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Satınalma uzmanı yetkisi gerekir.'; END IF;
  UPDATE public.proc_rfqs SET status = 'closed', closed_at = now() WHERE id = p_id AND organization_id = public.current_org_id() AND status = 'sent';
  IF NOT FOUND THEN RAISE EXCEPTION 'Yalnızca gönderilmiş RFQ kapatılabilir.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.proc_rfq_cancel(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f record; r uuid;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Satınalma uzmanı yetkisi gerekir.'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'İptal gerekçesi zorunlu.'; END IF;
  SELECT * INTO f FROM public.proc_rfqs WHERE id = p_id AND organization_id = public.current_org_id() FOR UPDATE;
  IF f.id IS NULL OR f.status IN ('awarded','cancelled') THEN RAISE EXCEPTION 'Bu RFQ iptal edilemez.'; END IF;
  UPDATE public.proc_approvals SET status = 'skipped', decided_at = now(), note = 'RFQ iptal edildi'
   WHERE subject_type = 'rfq' AND subject_id = p_id AND status = 'pending';
  UPDATE public.proc_rfqs SET status = 'cancelled', cancel_reason = left(trim(p_reason), 1000), closed_at = now() WHERE id = p_id;
  -- Talepler (başka açık RFQ'da değilse) yeniden "onaylı"ya döner
  FOREACH r IN ARRAY f.request_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.proc_rfqs x WHERE x.id <> p_id AND r = ANY(x.request_ids) AND x.status NOT IN ('cancelled')) THEN
      UPDATE public.proc_requests SET status = 'approved' WHERE id = r AND status = 'sourcing';
      PERFORM public.proc_event(r, 'comment', f.rfq_no || ' iptal edildi: ' || trim(p_reason));
    END IF;
  END LOOP;
END $$;

-- Teklifi kaydet (tedarikçi linkten veya satınalma elle). p: {valid_until, delivery_days, payment_term_days, notes,
--   submitted_by_name, lines: [{rfq_line_id, unit_price, discount_pct, vat_rate, brand_model, alternative_note, can_supply}]}
CREATE OR REPLACE FUNCTION public.proc_rfq_save_quote(p_rv uuid, p jsonb, p_manual boolean, p_meta jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rv record; f record; v_q uuid; v_ver int; l jsonb; rl record; v_price numeric; v_disc numeric; v_vat numeric; v_tot numeric;
        v_net numeric := 0; v_vatsum numeric := 0; v_n int := 0;
BEGIN
  SELECT * INTO rv FROM public.proc_rfq_vendors WHERE id = p_rv;
  SELECT * INTO f FROM public.proc_rfqs WHERE id = rv.rfq_id;
  IF COALESCE(p ->> 'currency', 'TRY') <> 'TRY' THEN RAISE EXCEPTION 'Teklifler Türk lirası (KDV hariç) olarak girilmelidir.'; END IF;
  IF jsonb_typeof(p -> 'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Kalem fiyatları eksik.'; END IF;
  SELECT COALESCE(max(version), 0) + 1 INTO v_ver FROM public.proc_quotes WHERE rfq_vendor_id = rv.id;
  UPDATE public.proc_quotes SET is_current = false WHERE rfq_vendor_id = rv.id AND is_current;
  INSERT INTO public.proc_quotes (organization_id, rfq_vendor_id, version, is_current, currency, valid_until, delivery_days, payment_term_days,
                                  notes, submitted_by_name, meta, is_manual, entered_by)
  VALUES (f.organization_id, rv.id, v_ver, true, 'TRY', NULLIF(p ->> 'valid_until', '')::date, NULLIF(p ->> 'delivery_days', '')::int,
          NULLIF(p ->> 'payment_term_days', '')::int, left(p ->> 'notes', 2000), left(NULLIF(trim(p ->> 'submitted_by_name'), ''), 120),
          p_meta, p_manual, CASE WHEN p_manual THEN auth.uid() END)
  RETURNING id INTO v_q;
  FOR l IN SELECT * FROM jsonb_array_elements(p -> 'lines') LOOP
    SELECT * INTO rl FROM public.proc_rfq_lines WHERE id = NULLIF(l ->> 'rfq_line_id', '')::uuid AND rfq_id = f.id;
    IF rl.id IS NULL THEN CONTINUE; END IF;
    v_price := NULLIF(l ->> 'unit_price', '')::numeric;
    IF COALESCE((l ->> 'can_supply')::boolean, true) IS FALSE OR v_price IS NULL THEN
      INSERT INTO public.proc_quote_lines (organization_id, quote_id, rfq_line_id, can_supply, alternative_note, brand_model)
      VALUES (f.organization_id, v_q, rl.id, false, left(l ->> 'alternative_note', 500), left(l ->> 'brand_model', 200));
      CONTINUE;
    END IF;
    IF v_price < 0 THEN RAISE EXCEPTION 'Birim fiyat negatif olamaz.'; END IF;
    v_disc := LEAST(GREATEST(COALESCE(NULLIF(l ->> 'discount_pct', '')::numeric, 0), 0), 100);
    v_vat := LEAST(GREATEST(COALESCE(NULLIF(l ->> 'vat_rate', '')::numeric, 20), 0), 100);
    v_tot := round(rl.quantity * v_price * (1 - v_disc / 100), 2);
    INSERT INTO public.proc_quote_lines (organization_id, quote_id, rfq_line_id, unit_price, discount_pct, vat_rate, line_total, brand_model, alternative_note, can_supply)
    VALUES (f.organization_id, v_q, rl.id, v_price, v_disc, v_vat, v_tot, left(l ->> 'brand_model', 200), left(l ->> 'alternative_note', 500), true);
    v_net := v_net + v_tot; v_vatsum := v_vatsum + round(v_tot * v_vat / 100, 2); v_n := v_n + 1;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'En az bir kalem için fiyat girin.'; END IF;
  UPDATE public.proc_quotes SET total_net = v_net, total_vat = v_vatsum WHERE id = v_q;
  UPDATE public.proc_rfq_vendors SET responded_at = now(), declined = false, decline_reason = NULL WHERE id = rv.id;
  RETURN v_q;
END $$;
REVOKE EXECUTE ON FUNCTION public.proc_rfq_save_quote(uuid, jsonb, boolean, jsonb) FROM PUBLIC, anon, authenticated;

-- Telefonla / e-postayla gelen teklifi satınalma elle girer
CREATE OR REPLACE FUNCTION public.proc_rfq_manual_quote(p_rfq_vendor uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rv record; f record;
BEGIN
  IF NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Satınalma uzmanı yetkisi gerekir.'; END IF;
  SELECT * INTO rv FROM public.proc_rfq_vendors WHERE id = p_rfq_vendor AND organization_id = public.current_org_id();
  SELECT * INTO f FROM public.proc_rfqs WHERE id = rv.rfq_id;
  IF rv.id IS NULL OR f.status NOT IN ('sent','closed') THEN RAISE EXCEPTION 'Teklif yalnızca gönderilmiş/kapanmış RFQ''ya girilebilir.'; END IF;
  RETURN public.proc_rfq_save_quote(rv.id, p || jsonb_build_object('submitted_by_name',
    COALESCE(NULLIF(p ->> 'submitted_by_name', ''), 'Elle giriş: ' || (SELECT name FROM public.proc_org_people() WHERE id = auth.uid()))),
    true, jsonb_build_object('manual', true, 'at', now()));
END $$;

-- Ödül. p_awards: [{rfq_line_id, rfq_vendor_id}] — kalem bazında veya toptan.
-- En düşük fiyat dışında seçim → p_reason zorunlu. Geçerli teklif < asgari → tek kaynak gerekçesi + satınalma yöneticisi onayı.
CREATE OR REPLACE FUNCTION public.proc_rfq_award(p_rfq uuid, p_awards jsonb, p_reason text DEFAULT NULL, p_single_source_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f record; pol record; a jsonb; ql record; v_low numeric; v_high numeric; v_unit numeric; v_valid int;
        v_total numeric := 0; v_base numeric := 0; v_notlow boolean := false; v_insufficient boolean; v_holders uuid[]; v_round int; v_app uuid; v_n int := 0; r uuid;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT public.proc_is_buyer() THEN RAISE EXCEPTION 'Satınalma uzmanı yetkisi gerekir.'; END IF;
  SELECT * INTO f FROM public.proc_rfqs WHERE id = p_rfq AND organization_id = public.current_org_id() FOR UPDATE;
  IF f.id IS NULL OR f.status NOT IN ('sent','closed') THEN RAISE EXCEPTION 'Ödül yalnızca gönderilmiş veya kapanmış RFQ''da verilebilir.'; END IF;
  SELECT * INTO pol FROM public.proc_policies WHERE organization_id = f.organization_id;

  -- Geçerli teklif: tedarikçinin güncel sürümü, reddetmemiş, en az bir fiyatlı kalem
  SELECT count(DISTINCT q.rfq_vendor_id) INTO v_valid
    FROM public.proc_quotes q JOIN public.proc_rfq_vendors v ON v.id = q.rfq_vendor_id
   WHERE v.rfq_id = f.id AND q.is_current AND NOT v.declined AND q.total_net > 0;

  DELETE FROM public.proc_rfq_awards WHERE rfq_id = f.id;
  FOR a IN SELECT * FROM jsonb_array_elements(COALESCE(p_awards, '[]'::jsonb)) LOOP
    SELECT l.*, q.id AS q_id, rl.quantity AS qty INTO ql
      FROM public.proc_quote_lines l JOIN public.proc_quotes q ON q.id = l.quote_id
      JOIN public.proc_rfq_vendors v ON v.id = q.rfq_vendor_id JOIN public.proc_rfq_lines rl ON rl.id = l.rfq_line_id
     WHERE v.id = (a ->> 'rfq_vendor_id')::uuid AND v.rfq_id = f.id AND q.is_current AND NOT v.declined
       AND l.rfq_line_id = (a ->> 'rfq_line_id')::uuid AND l.can_supply AND l.unit_price IS NOT NULL;
    IF ql.id IS NULL THEN RAISE EXCEPTION 'Seçilen tedarikçinin bu kalem için geçerli teklifi yok.'; END IF;
    v_unit := ql.unit_price * (1 - ql.discount_pct / 100);
    SELECT min(l.unit_price * (1 - l.discount_pct / 100)), max(l.unit_price * (1 - l.discount_pct / 100)) INTO v_low, v_high
      FROM public.proc_quote_lines l JOIN public.proc_quotes q ON q.id = l.quote_id JOIN public.proc_rfq_vendors v ON v.id = q.rfq_vendor_id
     WHERE v.rfq_id = f.id AND q.is_current AND NOT v.declined AND l.rfq_line_id = ql.rfq_line_id AND l.can_supply AND l.unit_price IS NOT NULL;
    INSERT INTO public.proc_rfq_awards (organization_id, rfq_id, rfq_line_id, rfq_vendor_id, quote_id, quote_line_id, quantity, unit_net, line_total, is_lowest)
    VALUES (f.organization_id, f.id, ql.rfq_line_id, (a ->> 'rfq_vendor_id')::uuid, ql.q_id, ql.id, ql.qty, round(v_unit, 4), round(ql.qty * v_unit, 2), v_unit <= v_low);
    v_total := v_total + round(ql.qty * v_unit, 2);
    v_base := v_base + round(ql.qty * v_high, 2);
    v_notlow := v_notlow OR v_unit > v_low;
    v_n := v_n + 1;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'En az bir kalem için tedarikçi seçin.'; END IF;
  IF v_notlow AND coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'En düşük fiyat dışında bir teklif seçildi; gerekçe zorunlu.'; END IF;
  v_insufficient := v_valid < f.min_quotes_required;
  IF v_insufficient AND COALESCE(pol.single_source_requires_justification, true) AND coalesce(trim(p_single_source_reason), '') = '' THEN
    RAISE EXCEPTION 'Geçerli teklif sayısı (%) asgari sayının (%) altında; tek kaynak / yetersiz teklif gerekçesi zorunlu.', v_valid, f.min_quotes_required;
  END IF;

  UPDATE public.proc_rfqs SET award_reason = NULLIF(trim(COALESCE(p_reason, '')), ''), single_source_reason = NULLIF(trim(COALESCE(p_single_source_reason, '')), ''),
         awarded_by = auth.uid(), award_total = v_total, savings_base = v_base, savings_amount = v_base - v_total,
         closed_at = COALESCE(closed_at, now()), status = CASE WHEN v_insufficient THEN 'pending_award' ELSE 'awarded' END,
         awarded_at = CASE WHEN v_insufficient THEN NULL ELSE now() END
   WHERE id = f.id;

  IF v_insufficient THEN
    -- Ek onay: satınalma yöneticisi (ödülü veren dışında)
    SELECT array_agg(h) INTO v_holders FROM public.proc_role_holders('procure_admin') h WHERE h <> auth.uid();
    IF COALESCE(array_length(v_holders, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Yetersiz teklifle ödül için başka bir satınalma yöneticisinin onayı gerekir; kurumda tanımlı değil.';
    END IF;
    SELECT COALESCE(max(round), 0) + 1 INTO v_round FROM public.proc_approvals WHERE subject_type = 'rfq' AND subject_id = f.id;
    INSERT INTO public.proc_approvals (organization_id, subject_type, subject_id, round, step_no, approver_user_id, approver_role, approver_label)
    VALUES (f.organization_id, 'rfq', f.id, v_round, 1, CASE WHEN array_length(v_holders, 1) = 1 THEN v_holders[1] END,
            CASE WHEN array_length(v_holders, 1) > 1 THEN 'procure_admin' END, 'Satınalma yöneticisi (yetersiz teklif)')
    RETURNING id INTO v_app;
    PERFORM public.proc_notify_approvers(v_app, 'Ödül onayı bekliyor: ' || f.rfq_no,
      f.title || ' · ' || v_valid || ' geçerli teklif (asgari ' || f.min_quotes_required || ') · ₺' || public.proc_fmt_tl(v_total));
    RETURN jsonb_build_object('status', 'pending_award', 'valid_quotes', v_valid);
  END IF;
  FOREACH r IN ARRAY f.request_ids LOOP PERFORM public.proc_event(r, 'comment', f.rfq_no || ' sonuçlandı: ₺' || public.proc_fmt_tl(v_total) || ' (KDV hariç)'); END LOOP;
  RETURN jsonb_build_object('status', 'awarded', 'valid_quotes', v_valid);
END $$;

-- proc_approval_decide (02) RFQ ödül onayını buraya yönlendirir
CREATE OR REPLACE FUNCTION public.proc_rfq_award_decide(p_approval uuid, p_approve boolean, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; f record; v_from uuid; r uuid;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  SELECT * INTO a FROM public.proc_approvals WHERE id = p_approval FOR UPDATE;
  SELECT * INTO f FROM public.proc_rfqs WHERE id = a.subject_id FOR UPDATE;
  IF a.approver_user_id IS NOT NULL AND a.approver_user_id <> auth.uid() THEN v_from := a.approver_user_id; END IF;
  IF NOT p_approve THEN
    IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Red gerekçesi zorunlu.'; END IF;
    UPDATE public.proc_approvals SET status = 'rejected', decided_at = now(), decided_by = auth.uid(), delegated_from = v_from, note = left(trim(p_note), 1000) WHERE id = a.id;
    UPDATE public.proc_rfqs SET status = 'closed', awarded_by = NULL, award_total = NULL, savings_base = NULL, savings_amount = NULL WHERE id = f.id;
    DELETE FROM public.proc_rfq_awards WHERE rfq_id = f.id;
    PERFORM public.proc_notify(f.awarded_by, 'Ödül reddedildi: ' || f.rfq_no, trim(p_note), 'error', 'proc_rfq', f.id, '/procure/rfq/' || f.id);
    RETURN jsonb_build_object('status', 'closed');
  END IF;
  UPDATE public.proc_approvals SET status = 'approved', decided_at = now(), decided_by = auth.uid(), delegated_from = v_from,
         note = NULLIF(left(trim(COALESCE(p_note, '')), 1000), '') WHERE id = a.id;
  UPDATE public.proc_rfqs SET status = 'awarded', awarded_at = now() WHERE id = f.id;
  PERFORM public.proc_notify(f.awarded_by, 'Ödül onaylandı: ' || f.rfq_no, f.title, 'success', 'proc_rfq', f.id, '/procure/rfq/' || f.id);
  FOREACH r IN ARRAY f.request_ids LOOP PERFORM public.proc_event(r, 'comment', f.rfq_no || ' sonuçlandı (yetersiz teklif onaylı): ₺' || public.proc_fmt_tl(f.award_total)); END LOOP;
  RETURN jsonb_build_object('status', 'awarded');
END $$;
REVOKE EXECUTE ON FUNCTION public.proc_rfq_award_decide(uuid, boolean, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.proc_rfq_create(uuid[], text), public.proc_rfq_send(uuid), public.proc_rfq_close(uuid),
  public.proc_rfq_cancel(uuid, text), public.proc_rfq_manual_quote(uuid, jsonb), public.proc_rfq_award(uuid, jsonb, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. TEDARİKÇİ SAYFASI /rfq/[token] — giriş yok; başka tedarikçilere ait hiçbir bilgi dönmez
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proc_public_rfq_get(p_token uuid, p_track boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rv record; f record; v_org text; v_vendor text; v_q record; v_lh jsonb;
BEGIN
  SELECT * INTO rv FROM public.proc_rfq_vendors WHERE share_token = p_token;
  IF rv.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO f FROM public.proc_rfqs WHERE id = rv.rfq_id;
  IF f.status IN ('draft','cancelled') THEN RETURN NULL; END IF;
  IF p_track THEN
    UPDATE public.proc_rfq_vendors SET first_viewed_at = COALESCE(first_viewed_at, now()), last_viewed_at = now(), view_count = view_count + 1 WHERE id = rv.id;
  END IF;
  SELECT name INTO v_org FROM public.organizations WHERE id = f.organization_id;
  SELECT name INTO v_vendor FROM public.customers WHERE id = rv.vendor_id;
  IF to_regclass('public.quote_letterhead') IS NOT NULL THEN
    EXECUTE 'SELECT to_jsonb(l) - ''organization_id'' - ''iban'' - ''bank_name'' - ''standard_terms'' FROM public.quote_letterhead l WHERE organization_id = $1'
      INTO v_lh USING f.organization_id;
  END IF;
  SELECT * INTO v_q FROM public.proc_quotes WHERE rfq_vendor_id = rv.id AND is_current;
  RETURN jsonb_build_object(
    'org_name', COALESCE(v_lh ->> 'legal_name', v_org), 'org_contact', v_lh, 'vendor_name', v_vendor,
    'rfq_no', f.rfq_no, 'title', f.title, 'deadline', f.deadline, 'delivery_terms', f.delivery_terms,
    'payment_terms', f.payment_terms, 'notes_to_vendors', f.notes_to_vendors,
    'open', f.status = 'sent' AND (f.deadline IS NULL OR f.deadline > now()) AND NOT rv.declined,
    'declined', rv.declined, 'decline_reason', rv.decline_reason, 'status', f.status,
    'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'description', l.description, 'quantity', l.quantity, 'unit', l.unit, 'spec_note', l.spec_note) ORDER BY l.sort)
                         FROM public.proc_rfq_lines l WHERE l.rfq_id = f.id), '[]'::jsonb),
    'quote', CASE WHEN v_q.id IS NULL THEN NULL ELSE jsonb_build_object(
       'version', v_q.version, 'submitted_at', v_q.submitted_at, 'submitted_by_name', v_q.submitted_by_name, 'valid_until', v_q.valid_until,
       'delivery_days', v_q.delivery_days, 'payment_term_days', v_q.payment_term_days, 'notes', v_q.notes,
       'total_net', v_q.total_net, 'total_vat', v_q.total_vat,
       'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('rfq_line_id', ql.rfq_line_id, 'unit_price', ql.unit_price, 'discount_pct', ql.discount_pct,
                 'vat_rate', ql.vat_rate, 'line_total', ql.line_total, 'brand_model', ql.brand_model, 'alternative_note', ql.alternative_note, 'can_supply', ql.can_supply))
                 FROM public.proc_quote_lines ql WHERE ql.quote_id = v_q.id), '[]'::jsonb)) END,
    'files', COALESCE((SELECT jsonb_agg(jsonb_build_object('file_name', x.file_name, 'size', x.size, 'created_at', x.created_at) ORDER BY x.created_at)
                         FROM public.proc_attachments x WHERE x.owner_type = 'quote' AND x.owner_id = rv.id), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.proc_public_rfq_submit(p_token uuid, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rv record; f record; v_meta jsonb := COALESCE(public.request_meta(), '{}'::jsonb); v_q uuid; v_name text := left(NULLIF(trim(payload ->> 'submitted_by_name'), ''), 120);
BEGIN
  SELECT * INTO rv FROM public.proc_rfq_vendors WHERE share_token = p_token;
  IF rv.id IS NULL THEN RAISE EXCEPTION 'Bağlantı geçersiz.'; END IF;
  SELECT * INTO f FROM public.proc_rfqs WHERE id = rv.rfq_id FOR UPDATE;
  IF f.status <> 'sent' OR (f.deadline IS NOT NULL AND f.deadline <= now()) THEN RAISE EXCEPTION 'Teklif süresi doldu; teklif artık değiştirilemez.'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Teklifi gönderen kişinin adını yazın.'; END IF;
  -- Kötüye kullanım sınırı: aynı bağlantıdan saatte en fazla 20 gönderim
  IF (SELECT count(*) FROM public.proc_quotes WHERE rfq_vendor_id = rv.id AND submitted_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Çok fazla gönderim yapıldı. Lütfen daha sonra tekrar deneyin.';
  END IF;
  v_q := public.proc_rfq_save_quote(rv.id, payload || jsonb_build_object('submitted_by_name', v_name), false, v_meta || jsonb_build_object('at', now()));
  PERFORM public.proc_notify(f.buyer_id, 'Teklif geldi: ' || f.rfq_no, (SELECT name FROM public.customers WHERE id = rv.vendor_id) || ' · ₺'
          || public.proc_fmt_tl((SELECT total_net FROM public.proc_quotes WHERE id = v_q)) || ' (KDV hariç)', 'success', 'proc_rfq', f.id, '/procure/rfq/' || f.id);
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.proc_public_rfq_decline(p_token uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rv record; f record;
BEGIN
  SELECT * INTO rv FROM public.proc_rfq_vendors WHERE share_token = p_token;
  IF rv.id IS NULL THEN RAISE EXCEPTION 'Bağlantı geçersiz.'; END IF;
  SELECT * INTO f FROM public.proc_rfqs WHERE id = rv.rfq_id;
  IF f.status <> 'sent' OR (f.deadline IS NOT NULL AND f.deadline <= now()) THEN RAISE EXCEPTION 'Teklif süresi doldu.'; END IF;
  UPDATE public.proc_rfq_vendors SET declined = true, decline_reason = left(NULLIF(trim(p_reason), ''), 500), responded_at = now() WHERE id = rv.id;
  UPDATE public.proc_quotes SET is_current = false WHERE rfq_vendor_id = rv.id AND is_current;
  PERFORM public.proc_notify(f.buyer_id, 'Teklif vermeyecek: ' || f.rfq_no, (SELECT name FROM public.customers WHERE id = rv.vendor_id)
          || COALESCE(' · ' || NULLIF(trim(p_reason), ''), ''), 'warning', 'proc_rfq', f.id, '/procure/rfq/' || f.id);
  RETURN jsonb_build_object('ok', true);
END $$;

-- Tedarikçinin yüklediği PDF teklif (yükleme /api/procure/rfq-upload üzerinden imzalı adresle yapılır)
CREATE OR REPLACE FUNCTION public.proc_public_rfq_attach(p_token uuid, p_path text, p_name text, p_mime text, p_size bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rv record; f record;
BEGIN
  SELECT * INTO rv FROM public.proc_rfq_vendors WHERE share_token = p_token;
  IF rv.id IS NULL THEN RAISE EXCEPTION 'Bağlantı geçersiz.'; END IF;
  SELECT * INTO f FROM public.proc_rfqs WHERE id = rv.rfq_id;
  IF f.status <> 'sent' OR (f.deadline IS NOT NULL AND f.deadline <= now()) THEN RAISE EXCEPTION 'Teklif süresi doldu.'; END IF;
  IF p_path NOT LIKE f.organization_id || '/rfq/' || f.id || '/' || rv.id || '/%' OR p_path LIKE '%..%' THEN RAISE EXCEPTION 'Geçersiz dosya yolu.'; END IF;
  IF COALESCE(p_size, 0) > 15 * 1024 * 1024 THEN RAISE EXCEPTION 'Dosya 15 MB''tan büyük olamaz.'; END IF;
  IF (SELECT count(*) FROM public.proc_attachments WHERE owner_type = 'quote' AND owner_id = rv.id) >= 5 THEN RAISE EXCEPTION 'En fazla 5 dosya eklenebilir.'; END IF;
  INSERT INTO public.proc_attachments (organization_id, owner_type, owner_id, storage_path, file_name, mime, size, created_by)
  VALUES (f.organization_id, 'quote', rv.id, p_path, left(p_name, 200), left(p_mime, 100), p_size, NULL);
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.proc_public_rfq_get(uuid, boolean), public.proc_public_rfq_submit(uuid, jsonb),
  public.proc_public_rfq_decline(uuid, text), public.proc_public_rfq_attach(uuid, text, text, text, bigint) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['proc_vendor_profiles','proc_rfqs','proc_rfq_lines','proc_rfq_vendors','proc_quotes','proc_quote_lines','proc_rfq_awards'] LOOP
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
-- Profilin kurumu cari karttan alınır (trg_proc_vendor_profiles); genel kurum tetikleyicisine gerek yok
DROP TRIGGER IF EXISTS trg_set_org ON public.proc_vendor_profiles;

-- Tedarikçi profili: satınalma, mali işler, yönetici, onaycı ve teslim alan okur; satınalma/yönetici yazar
CREATE POLICY proc_sel ON public.proc_vendor_profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.proc_is_buyer()) OR (SELECT public.proc_has_role('finance')) OR (SELECT public.proc_has_role('approver')) OR (SELECT public.proc_has_role('receiver')));
CREATE POLICY proc_ins ON public.proc_vendor_profiles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.proc_is_buyer()));
CREATE POLICY proc_upd ON public.proc_vendor_profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.proc_is_buyer())) WITH CHECK ((SELECT public.proc_is_buyer()));
CREATE POLICY proc_del ON public.proc_vendor_profiles AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.proc_has_role('procure_admin')));

-- RFQ ve alt tabloları: görünürlük proc_rfq_visible; yazma satınalma (durum/kilit tetikleyicilerle)
CREATE POLICY proc_sel ON public.proc_rfqs AS RESTRICTIVE FOR SELECT TO authenticated USING (public.proc_rfq_visible(id));
CREATE POLICY proc_ins ON public.proc_rfqs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY proc_upd ON public.proc_rfqs AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.proc_is_buyer())) WITH CHECK ((SELECT public.proc_is_buyer()));
CREATE POLICY proc_del ON public.proc_rfqs AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE POLICY proc_sel ON public.proc_rfq_lines AS RESTRICTIVE FOR SELECT TO authenticated USING (public.proc_rfq_visible(rfq_id));
CREATE POLICY proc_ins ON public.proc_rfq_lines AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.proc_is_buyer()));
CREATE POLICY proc_upd ON public.proc_rfq_lines AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.proc_is_buyer())) WITH CHECK ((SELECT public.proc_is_buyer()));
CREATE POLICY proc_del ON public.proc_rfq_lines AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.proc_is_buyer()));

CREATE POLICY proc_sel ON public.proc_rfq_vendors AS RESTRICTIVE FOR SELECT TO authenticated USING (public.proc_rfq_visible(rfq_id));
CREATE POLICY proc_ins ON public.proc_rfq_vendors AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.proc_is_buyer()));
CREATE POLICY proc_upd ON public.proc_rfq_vendors AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.proc_is_buyer())) WITH CHECK ((SELECT public.proc_is_buyer()));
CREATE POLICY proc_del ON public.proc_rfq_vendors AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.proc_is_buyer()));

-- Teklifler ve ödül: okunur; yalnızca iş akışı fonksiyonları yazar
CREATE POLICY proc_sel ON public.proc_quotes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.proc_rfq_visible((SELECT v.rfq_id FROM public.proc_rfq_vendors v WHERE v.id = rfq_vendor_id)));
CREATE POLICY proc_sel ON public.proc_quote_lines AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.proc_rfq_visible((SELECT v.rfq_id FROM public.proc_quotes q JOIN public.proc_rfq_vendors v ON v.id = q.rfq_vendor_id WHERE q.id = quote_id)));
CREATE POLICY proc_sel ON public.proc_rfq_awards AS RESTRICTIVE FOR SELECT TO authenticated USING (public.proc_rfq_visible(rfq_id));
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['proc_quotes','proc_quote_lines','proc_rfq_awards'] LOOP
    EXECUTE format('CREATE POLICY proc_ins ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false)', tbl);
    EXECUTE format('CREATE POLICY proc_upd ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (false)', tbl);
    EXECUTE format('CREATE POLICY proc_del ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (false)', tbl);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'Procure Faz 1b (tedarikçi, RFQ, karşılaştırma, ödül) kuruldu' AS durum;
