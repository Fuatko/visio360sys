-- =====================================================================
-- INSPIRA360 PROCURE — FAZ 1a: TALEP, ONAY MATRİSİ + VEKÂLET, BÜTÇE + BÜTÇE KONTROLÜ
--   1. Eğitim/bütçe yılı yardımcıları
--   2. Talep (proc_requests, proc_request_lines, proc_request_events) + ortak ekler (proc_attachments)
--      + özel depo "procure-files"
--   3. Onay: proc_approval_rules, proc_approvals, proc_delegations
--   4. Bütçe: proc_budgets, proc_budget_revisions, proc_budget_status (view)
--   5. Bildirim: proc_notify()
--   6. İş akışı RPC'leri: gönder, fiyatlandır, onayla/reddet, bütçe aşımı onayı, iptal, yorum
--   7. RLS (kurum + lisans + bayi engeli + rol/satır görünürlüğü), değişiklik kaydı
-- Önkoşul: sql/procure/01-altyapi.sql, fatura-modulu.sql (next_document_number). Paraşüt tabloları varsa
-- bütçe gerçekleşeni için kullanılır. Tek seferde çalıştırılır; tekrar çalıştırmak güvenlidir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. BÜTÇE YILI (başlangıç ayı politikadan; okul: Eylül → "2026-2027", takvim yılı: "2026")
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proc_fy_start_month()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT fiscal_year_start_month FROM public.proc_policies WHERE organization_id = public.current_org_id()), 9);
$$;

CREATE OR REPLACE FUNCTION public.proc_fiscal_year(d date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT public.proc_fy_start_month() AS m),
       y AS (SELECT EXTRACT(YEAR FROM d)::int - CASE WHEN EXTRACT(MONTH FROM d)::int < s.m THEN 1 ELSE 0 END AS y, s.m FROM s)
  SELECT CASE WHEN m = 1 THEN y::text ELSE y || '-' || (y + 1) END FROM y;
$$;

-- Bütçe ayı: 1 = bütçe yılının ilk ayı (okulda Eylül)
CREATE OR REPLACE FUNCTION public.proc_fiscal_month(d date)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ((EXTRACT(MONTH FROM d)::int - public.proc_fy_start_month() + 12) % 12) + 1;
$$;

-- Bütçe yılının ilk ve son günü
CREATE OR REPLACE FUNCTION public.proc_fiscal_range(p_fy text, OUT start_date date, OUT end_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT make_date(left(p_fy, 4)::int, public.proc_fy_start_month(), 1),
         (make_date(left(p_fy, 4)::int, public.proc_fy_start_month(), 1) + interval '12 months' - interval '1 day')::date;
$$;
GRANT EXECUTE ON FUNCTION public.proc_fy_start_month(), public.proc_fiscal_year(date), public.proc_fiscal_month(date),
                          public.proc_fiscal_range(text) TO authenticated;

-- Ağaç yardımcıları: kaydın kendisi + üstleri (derinlik 0 = kendisi)
CREATE OR REPLACE FUNCTION public.proc_cc_ancestors(p_id uuid)
RETURNS TABLE (id uuid, depth int, manager_user_id uuid, name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE t AS (
    SELECT c.id, c.parent_id, 0 AS depth, c.manager_user_id, c.name FROM public.proc_cost_centers c
     WHERE c.id = p_id AND c.organization_id = public.current_org_id()
    UNION ALL
    SELECT c.id, c.parent_id, t.depth + 1, c.manager_user_id, c.name FROM public.proc_cost_centers c JOIN t ON c.id = t.parent_id
     WHERE t.depth < 50
  ) SELECT id, depth, manager_user_id, name FROM t;
$$;
CREATE OR REPLACE FUNCTION public.proc_cat_ancestors(p_id uuid)
RETURNS TABLE (id uuid, depth int) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE t AS (
    SELECT c.id, c.parent_id, 0 AS depth FROM public.proc_categories c
     WHERE c.id = p_id AND c.organization_id = public.current_org_id()
    UNION ALL
    SELECT c.id, c.parent_id, t.depth + 1 FROM public.proc_categories c JOIN t ON c.id = t.parent_id WHERE t.depth < 50
  ) SELECT id, depth FROM t;
$$;
CREATE OR REPLACE FUNCTION public.proc_cat_descendants(p_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE t AS (
    SELECT c.id FROM public.proc_categories c WHERE c.id = p_id AND c.organization_id = public.current_org_id()
    UNION
    SELECT c.id FROM public.proc_categories c JOIN t ON c.parent_id = t.id
  ) SELECT id FROM t;
$$;

-- ---------------------------------------------------------------------
-- 2. TALEP
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_budgets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  fiscal_year      text NOT NULL CHECK (fiscal_year ~ '^\d{4}(-\d{4})?$'),
  cost_center_id   uuid REFERENCES public.proc_cost_centers(id) ON DELETE RESTRICT,  -- boş = tüm kurum
  category_id      uuid REFERENCES public.proc_categories(id) ON DELETE RESTRICT,    -- boş = tüm kategoriler
  amount           numeric(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),             -- yıllık, KDV hariç, TRY
  monthly_split    jsonb,                                                             -- 12 değer; boşsa eşit
  notes            text,
  locked           boolean NOT NULL DEFAULT false,
  created_by       uuid DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS proc_budgets_line_uq ON public.proc_budgets (organization_id, fiscal_year,
  COALESCE(cost_center_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS public.proc_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid,
  request_no             text,
  requester_id           uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  cost_center_id         uuid REFERENCES public.proc_cost_centers(id) ON DELETE RESTRICT,
  category_id            uuid REFERENCES public.proc_categories(id) ON DELETE RESTRICT,
  title                  text NOT NULL,
  justification          text,
  needed_by              date,
  priority               text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  status                 text NOT NULL DEFAULT 'draft' CHECK (status IN
                           ('draft','submitted','in_approval','approved','rejected','cancelled','sourcing','ordered','received','closed')),
  estimated_total        numeric(15,2),          -- KDV hariç, kalemlerden
  budget_line_id         uuid REFERENCES public.proc_budgets(id) ON DELETE SET NULL,
  budget_check_result    jsonb,                  -- {available, after, status, ...}
  budget_override_by     uuid,
  budget_override_reason text,
  budget_override_at     timestamptz,
  suggested_vendor_id    uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  approval_round         int NOT NULL DEFAULT 0,
  rejection_reason       text,
  cancel_reason          text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  submitted_at           timestamptz,
  approved_at            timestamptz,
  closed_at              timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS proc_requests_no_uq ON public.proc_requests (organization_id, request_no) WHERE request_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS proc_requests_status_idx ON public.proc_requests (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS proc_requests_requester_idx ON public.proc_requests (requester_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.proc_request_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid,
  request_id        uuid NOT NULL REFERENCES public.proc_requests(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description       text NOT NULL,
  quantity          numeric(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit              text NOT NULL DEFAULT 'Adet',
  est_unit_price    numeric(15,2) CHECK (est_unit_price IS NULL OR est_unit_price >= 0),
  est_total         numeric(15,2) GENERATED ALWAYS AS (round(quantity * est_unit_price, 2)) STORED,
  spec_note         text,
  attachment_count  int NOT NULL DEFAULT 0,
  sort              int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proc_request_lines_req_idx ON public.proc_request_lines (request_id, sort);

-- Zaman çizelgesi + yorum akışı (kim, ne zaman, ne yaptı)
CREATE TABLE IF NOT EXISTS public.proc_request_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  request_id       uuid NOT NULL REFERENCES public.proc_requests(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('created','submitted','priced','step_approved','step_rejected','step_skipped',
                                                 'approved','rejected','budget_override','cancelled','comment')),
  message          text,
  actor_id         uuid DEFAULT auth.uid(),
  actor_name       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proc_request_events_req_idx ON public.proc_request_events (request_id, created_at);

-- Tüm Procure belgeleri için ortak ekler (depo: procure-files/<kurum>/<klasör>/<ts>-<ad>)
CREATE TABLE IF NOT EXISTS public.proc_attachments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  owner_type       text NOT NULL CHECK (owner_type IN ('request','request_line','rfq','quote','order','receipt','vendor',
                                                       'contract','audit','cert','asset')),
  owner_id         uuid NOT NULL,
  storage_path     text NOT NULL,
  file_name        text NOT NULL,
  mime             text,
  size             bigint,
  created_by       uuid DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proc_attachments_owner_idx ON public.proc_attachments (owner_type, owner_id);

INSERT INTO storage.buckets (id, name, public) VALUES ('procure-files', 'procure-files', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS procure_files_rw ON storage.objects;
CREATE POLICY procure_files_rw ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'procure-files' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.org_has_module('procure'))
  WITH CHECK (bucket_id = 'procure-files' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.org_has_module('procure'));

-- ---------------------------------------------------------------------
-- 3. ONAY MATRİSİ, ONAY ADIMLARI, VEKÂLET
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_approval_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid,
  name              text NOT NULL,
  min_amount        numeric(15,2) NOT NULL DEFAULT 0 CHECK (min_amount >= 0),  -- bu tutarın ÜSTÜ (0 ise sıfır dahil)
  max_amount        numeric(15,2),                                              -- bu tutar DAHİL; boş = üst sınırsız
  category_id       uuid REFERENCES public.proc_categories(id) ON DELETE CASCADE,     -- boş = tümü
  category_kind     text CHECK (category_kind IS NULL OR category_kind IN ('goods','service','capex')),
  cost_center_id    uuid REFERENCES public.proc_cost_centers(id) ON DELETE CASCADE,   -- boş = tümü (alt birimler dahil)
  step_no           int NOT NULL DEFAULT 1 CHECK (step_no BETWEEN 1 AND 20),
  approver_kind     text NOT NULL CHECK (approver_kind IN ('cost_center_manager','role','user')),
  approver_role     text CHECK (approver_role IS NULL OR approver_role IN ('requester','approver','buyer','receiver','finance','procure_admin')),
  approver_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_label    text,                    -- ekranda görünen ad: "Mali İşler", "Okul Müdürü"
  applies_to        text NOT NULL DEFAULT 'request' CHECK (applies_to IN ('request','order','contract','payment_certificate')),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proc_rules_band_chk CHECK (max_amount IS NULL OR max_amount >= min_amount),
  CONSTRAINT proc_rules_target_chk CHECK (
    (approver_kind = 'role' AND approver_role IS NOT NULL) OR (approver_kind = 'user' AND approver_user_id IS NOT NULL)
    OR approver_kind = 'cost_center_manager')
);

CREATE TABLE IF NOT EXISTS public.proc_approvals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid,
  subject_type      text NOT NULL CHECK (subject_type IN ('request','order','contract','payment_certificate')),
  subject_id        uuid NOT NULL,
  round             int NOT NULL DEFAULT 1,
  step_no           int NOT NULL,
  rule_id           uuid REFERENCES public.proc_approval_rules(id) ON DELETE SET NULL,
  approver_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- çözümlenen kişi; boşsa rolün herhangi bir sahibi
  approver_role     text,
  approver_label    text,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','skipped')),
  decided_at        timestamptz,
  decided_by        uuid,
  delegated_from    uuid,                    -- vekâleten verildiyse asıl onaycı
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proc_approvals_subject_idx ON public.proc_approvals (subject_type, subject_id, round, step_no);
CREATE INDEX IF NOT EXISTS proc_approvals_pending_idx ON public.proc_approvals (organization_id, status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.proc_delegations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  from_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date       date NOT NULL DEFAULT current_date,
  end_date         date NOT NULL,
  note             text,
  created_by       uuid DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proc_delegations_dates_chk CHECK (end_date >= start_date),
  CONSTRAINT proc_delegations_self_chk CHECK (from_user_id <> to_user_id)
);

-- ---------------------------------------------------------------------
-- 4. BÜTÇE REVİZYONLARI
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_budget_revisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  budget_id        uuid NOT NULL REFERENCES public.proc_budgets(id) ON DELETE CASCADE,
  old_amount       numeric(15,2),
  new_amount       numeric(15,2),
  reason           text,
  changed_by       uuid DEFAULT auth.uid(),
  changed_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proc_budget_revisions_idx ON public.proc_budget_revisions (budget_id, changed_at DESC);

-- Tutar değişince revizyon izi; kilitli bütçe yalnızca gerekçeyle (proc_budget_revise) değişir
CREATE OR REPLACE FUNCTION public.proc_budgets_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reason text := NULLIF(current_setting('proc.revision_reason', true), '');
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.amount IS DISTINCT FROM OLD.amount THEN
    IF OLD.locked AND v_reason IS NULL THEN
      RAISE EXCEPTION 'Kilitli bütçenin tutarı yalnızca gerekçeli revizyonla değiştirilebilir.';
    END IF;
    INSERT INTO public.proc_budget_revisions (organization_id, budget_id, old_amount, new_amount, reason)
    VALUES (NEW.organization_id, NEW.id, OLD.amount, NEW.amount, v_reason);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proc_budgets ON public.proc_budgets;
CREATE TRIGGER trg_proc_budgets BEFORE UPDATE ON public.proc_budgets
  FOR EACH ROW EXECUTE FUNCTION public.proc_budgets_trg();

CREATE OR REPLACE FUNCTION public.proc_budget_revise(p_budget uuid, p_amount numeric, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.proc_has_role('finance') OR public.proc_has_role('procure_admin')) THEN
    RAISE EXCEPTION 'Bütçe revizyonu için mali işler veya satınalma yöneticisi rolü gerekir.';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Revizyon gerekçesi zorunlu.'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'Geçersiz tutar.'; END IF;
  PERFORM set_config('proc.revision_reason', left(trim(p_reason), 500), true);
  UPDATE public.proc_budgets SET amount = p_amount
   WHERE id = p_budget AND organization_id = public.current_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Bütçe satırı bulunamadı.'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.proc_budget_revise(uuid, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4b. BÜTÇE HESABI
--   kullanılabilir = bütçe − ön taahhüt (onaylı, siparişe dönmemiş talep) − taahhüt (sipariş; Faz 1c)
--                    − gerçekleşen (eşleşmiş fatura; Faz 1d) − [tüm kurum satırında] Paraşüt kategori gerçekleşeni
-- ---------------------------------------------------------------------
-- Paraşüt alış faturaları → Procure kategorisi (proc_categories.parasut_category eşlemesi), bütçe ayı bazında
CREATE OR REPLACE FUNCTION public.proc_parasut_actuals(p_fy text)
RETURNS TABLE (category_id uuid, fiscal_month int, amount numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF to_regclass('public.parasut_documents') IS NULL THEN RETURN; END IF;
  SELECT * INTO r FROM public.proc_fiscal_range(p_fy);
  RETURN QUERY EXECUTE
    'SELECT c.id, public.proc_fiscal_month(d.issue_date), sum(COALESCE(d.net_total_try, d.net_total, 0))::numeric
       FROM public.parasut_documents d
       JOIN public.proc_categories c ON c.organization_id = d.organization_id
        AND c.parasut_category IS NOT NULL AND lower(trim(c.parasut_category)) = lower(trim(d.category))
      WHERE d.organization_id = public.current_org_id() AND d.kind = ''purchase_bill''
        AND d.issue_date BETWEEN $1 AND $2
      GROUP BY 1, 2'
    USING r.start_date, r.end_date;
END $$;
GRANT EXECUTE ON FUNCTION public.proc_parasut_actuals(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.proc_budget_usage(p_budget uuid, p_exclude_request uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; v_pre numeric := 0; v_commit numeric := 0; v_actual numeric := 0;
BEGIN
  SELECT * INTO b FROM public.proc_budgets WHERE id = p_budget AND organization_id = public.current_org_id();
  IF b.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(sum(estimated_total), 0) INTO v_pre FROM public.proc_requests
   WHERE budget_line_id = b.id AND status IN ('approved','sourcing')
     AND (p_exclude_request IS NULL OR id <> p_exclude_request);

  -- Masraf merkezi belli olmayan Paraşüt alışları yalnızca tüm kurum (masraf merkezi boş) satırına düşer
  IF b.cost_center_id IS NULL THEN
    SELECT COALESCE(sum(a.amount), 0) INTO v_actual FROM public.proc_parasut_actuals(b.fiscal_year) a
     WHERE b.category_id IS NULL OR a.category_id IN (SELECT public.proc_cat_descendants(b.category_id));
  END IF;

  RETURN jsonb_build_object('budget_line_id', b.id, 'fiscal_year', b.fiscal_year, 'amount', b.amount,
    'pre_commitment', v_pre, 'commitment', v_commit, 'actual', v_actual,
    'available', b.amount - v_pre - v_commit - v_actual);
END $$;

-- Talebe uyan bütçe satırı: en yakın masraf merkezi (kendisi → üstleri → tüm kurum), en özel kategori
CREATE OR REPLACE FUNCTION public.proc_find_budget(p_cc uuid, p_cat uuid, p_fy text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cc AS (SELECT id, depth FROM public.proc_cc_ancestors(p_cc) UNION ALL SELECT NULL::uuid, 1000),
       cat AS (SELECT id, depth FROM public.proc_cat_ancestors(p_cat) UNION ALL SELECT NULL::uuid, 1000)
  SELECT b.id FROM public.proc_budgets b
    JOIN cc ON b.cost_center_id IS NOT DISTINCT FROM cc.id
    JOIN cat ON b.category_id IS NOT DISTINCT FROM cat.id
   WHERE b.organization_id = public.current_org_id() AND b.fiscal_year = p_fy
   ORDER BY cc.depth, cat.depth LIMIT 1;
$$;

CREATE OR REPLACE VIEW public.proc_budget_status WITH (security_invoker = true) AS
SELECT b.id, b.organization_id, b.fiscal_year, b.cost_center_id, b.category_id, b.amount, b.monthly_split, b.locked, b.notes,
       COALESCE((u ->> 'pre_commitment')::numeric, 0) AS pre_commitment,
       COALESCE((u ->> 'commitment')::numeric, 0)     AS commitment,
       COALESCE((u ->> 'actual')::numeric, 0)         AS actual,
       COALESCE((u ->> 'available')::numeric, b.amount) AS available
  FROM public.proc_budgets b
  CROSS JOIN LATERAL (SELECT public.proc_budget_usage(b.id) AS u) x;
GRANT SELECT ON public.proc_budget_status TO authenticated;

-- ---------------------------------------------------------------------
-- 5. ROL / GÖRÜNÜRLÜK YARDIMCILARI
-- ---------------------------------------------------------------------
-- Bugün geçerli vekâletle benim adıma onay verebileceğim kişiler
CREATE OR REPLACE FUNCTION public.proc_delegators()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT from_user_id), '{}'::uuid[]) FROM public.proc_delegations
   WHERE to_user_id = auth.uid() AND organization_id = public.current_org_id()
     AND current_date BETWEEN start_date AND end_date;
$$;

-- Kullanıcı bu rolü taşıyor mu (onay limiti uygunsa)? procure_admin için kurum admin'i de sayılır
CREATE OR REPLACE FUNCTION public.proc_user_has_role(p_user uuid, p_role text, p_amount numeric DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.proc_members m
                  WHERE m.user_id = p_user AND m.organization_id = public.current_org_id() AND m.is_active
                    AND p_role = ANY(m.roles)
                    AND (p_amount IS NULL OR m.approval_limit IS NULL OR m.approval_limit >= p_amount))
      OR (p_role = 'procure_admin' AND EXISTS (SELECT 1 FROM public.users u
                  WHERE u.id = p_user AND u.organization_id = public.current_org_id()
                    AND (u.role IN ('admin','org_admin','super_admin') OR COALESCE(u.is_org_admin, false))));
$$;

-- Rol sahipleri (bildirim ve tek kişiye çözümleme için)
CREATE OR REPLACE FUNCTION public.proc_role_holders(p_role text, p_amount numeric DEFAULT NULL)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id FROM public.proc_members m
   WHERE m.organization_id = public.current_org_id() AND m.is_active AND p_role = ANY(m.roles)
     AND (p_amount IS NULL OR m.approval_limit IS NULL OR m.approval_limit >= p_amount)
  UNION
  SELECT u.id FROM public.users u
   WHERE p_role = 'procure_admin' AND u.organization_id = public.current_org_id()
     AND (u.role IN ('admin','org_admin','super_admin') OR COALESCE(u.is_org_admin, false));
$$;

-- Onay adımını oturumdaki kullanıcı verebilir mi? (sıradaki adım + kişi/rol/vekâlet)
CREATE OR REPLACE FUNCTION public.proc_can_decide(p_approval uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; v_amount numeric; v_status text; v_me uuid := auth.uid(); v_dels uuid[] := public.proc_delegators(); v_u uuid; v_req uuid;
BEGIN
  SELECT * INTO a FROM public.proc_approvals WHERE id = p_approval AND organization_id = public.current_org_id();
  IF a.id IS NULL OR a.status <> 'pending' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.proc_approvals x WHERE x.subject_type = a.subject_type AND x.subject_id = a.subject_id
               AND x.round = a.round AND x.status = 'pending' AND x.step_no < a.step_no) THEN RETURN false; END IF;
  IF a.subject_type = 'request' THEN
    SELECT estimated_total, status, requester_id INTO v_amount, v_status, v_req FROM public.proc_requests WHERE id = a.subject_id;
    IF v_status IS DISTINCT FROM 'in_approval' THEN RETURN false; END IF;
    -- Rol adımında talep eden kendi talebini onaylayamaz
    IF a.approver_user_id IS NULL AND v_req = v_me THEN RETURN false; END IF;
  END IF;
  IF a.approver_user_id IS NOT NULL THEN
    RETURN a.approver_user_id = v_me OR a.approver_user_id = ANY(v_dels);
  END IF;
  IF a.approver_role IS NULL THEN RETURN false; END IF;
  IF public.proc_user_has_role(v_me, a.approver_role, v_amount) THEN RETURN true; END IF;
  FOREACH v_u IN ARRAY v_dels LOOP
    IF public.proc_user_has_role(v_u, a.approver_role, v_amount) THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;

-- Talebi görebilir mi? Talep eden, birimin sorumlusu/üyesi, satınalma/mali işler/yönetici, onay adımındaki kişi
CREATE OR REPLACE FUNCTION public.proc_request_visible(p_id uuid, p_requester uuid, p_cc uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_requester = auth.uid()
      OR public.proc_has_role('buyer') OR public.proc_has_role('finance') OR public.proc_has_role('procure_admin')
      OR (p_cc IS NOT NULL AND p_cc = ANY(public.proc_my_cost_centers()))
      OR EXISTS (SELECT 1 FROM public.proc_approvals a
                  WHERE a.subject_type = 'request' AND a.subject_id = p_id
                    AND (a.approver_user_id = auth.uid() OR a.decided_by = auth.uid()
                         OR a.approver_user_id = ANY(public.proc_delegators())
                         OR (a.approver_user_id IS NULL AND a.approver_role IS NOT NULL AND public.proc_has_role(a.approver_role))));
$$;
CREATE OR REPLACE FUNCTION public.proc_can_see_request(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT public.proc_request_visible(r.id, r.requester_id, r.cost_center_id) FROM public.proc_requests r
                    WHERE r.id = p_id AND r.organization_id = public.current_org_id()), false);
$$;
-- Talep (ve kalemleri) düzenlenebilir mi? Talep eden: taslak/reddedilmiş; satınalma/yönetici: taslak/fiyatlandırılacak
CREATE OR REPLACE FUNCTION public.proc_request_editable(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (r.requester_id = auth.uid() AND r.status IN ('draft','rejected'))
                       OR ((public.proc_has_role('buyer') OR public.proc_has_role('procure_admin')) AND r.status IN ('draft','submitted'))
                     FROM public.proc_requests r WHERE r.id = p_id AND r.organization_id = public.current_org_id()), false);
$$;
CREATE OR REPLACE FUNCTION public.proc_can_see_owner(p_type text, p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_type
    WHEN 'request' THEN public.proc_can_see_request(p_id)
    WHEN 'request_line' THEN public.proc_can_see_request((SELECT request_id FROM public.proc_request_lines WHERE id = p_id))
    ELSE public.proc_has_role('buyer') OR public.proc_has_role('finance') OR public.proc_has_role('procure_admin') OR public.proc_has_role('receiver')
  END;
$$;
GRANT EXECUTE ON FUNCTION public.proc_delegators(), public.proc_user_has_role(uuid, text, numeric), public.proc_can_decide(uuid),
  public.proc_request_visible(uuid, uuid, uuid), public.proc_can_see_request(uuid), public.proc_request_editable(uuid),
  public.proc_can_see_owner(text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.proc_role_holders(text, numeric) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. TETİKLEYİCİLER
-- ---------------------------------------------------------------------
-- Talep tahmini toplamı kalemlerden (hiç fiyat yoksa boş = "fiyatlandırılacak")
CREATE OR REPLACE FUNCTION public.proc_request_total_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := COALESCE(NEW.request_id, OLD.request_id);
BEGIN
  UPDATE public.proc_requests r SET estimated_total = (
    SELECT CASE WHEN count(l.est_unit_price) = 0 THEN NULL ELSE sum(COALESCE(l.est_total, 0)) END
      FROM public.proc_request_lines l WHERE l.request_id = v_id)
   WHERE r.id = v_id;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_proc_request_total ON public.proc_request_lines;
CREATE TRIGGER trg_proc_request_total AFTER INSERT OR UPDATE OR DELETE ON public.proc_request_lines
  FOR EACH ROW EXECUTE FUNCTION public.proc_request_total_trg();

-- Durum, numara, onay ve bütçe alanları yalnızca iş akışı fonksiyonlarıyla değişir
CREATE OR REPLACE FUNCTION public.proc_requests_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_rpc boolean := current_setting('proc.rpc', true) = '1';
BEGIN
  NEW.updated_at := now();
  IF v_rpc OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'draft'; NEW.request_no := NULL; NEW.requester_id := auth.uid(); NEW.approval_round := 0;
    NEW.budget_line_id := NULL; NEW.budget_check_result := NULL; NEW.budget_override_by := NULL;
    NEW.budget_override_reason := NULL; NEW.budget_override_at := NULL;
    NEW.submitted_at := NULL; NEW.approved_at := NULL; NEW.closed_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.request_no IS DISTINCT FROM OLD.request_no
     OR NEW.requester_id IS DISTINCT FROM OLD.requester_id OR NEW.approval_round IS DISTINCT FROM OLD.approval_round
     OR NEW.budget_line_id IS DISTINCT FROM OLD.budget_line_id OR NEW.budget_check_result IS DISTINCT FROM OLD.budget_check_result
     OR NEW.budget_override_by IS DISTINCT FROM OLD.budget_override_by OR NEW.budget_override_reason IS DISTINCT FROM OLD.budget_override_reason
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    -- Kalem toplamı tetikleyicisinin güncellemesi dışında bu alanlara dokunulamaz
    RAISE EXCEPTION 'Talebin durumu yalnızca gönder/onayla/reddet/iptal işlemleriyle değişir.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proc_requests_guard ON public.proc_requests;
CREATE TRIGGER trg_proc_requests_guard BEFORE INSERT OR UPDATE ON public.proc_requests
  FOR EACH ROW EXECUTE FUNCTION public.proc_requests_guard();

-- Ek sayısı
CREATE OR REPLACE FUNCTION public.proc_attachment_count_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type text := COALESCE(NEW.owner_type, OLD.owner_type); v_id uuid := COALESCE(NEW.owner_id, OLD.owner_id);
BEGIN
  IF v_type = 'request_line' THEN
    UPDATE public.proc_request_lines SET attachment_count = (SELECT count(*) FROM public.proc_attachments
      WHERE owner_type = 'request_line' AND owner_id = v_id) WHERE id = v_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_proc_attachment_count ON public.proc_attachments;
CREATE TRIGGER trg_proc_attachment_count AFTER INSERT OR DELETE ON public.proc_attachments
  FOR EACH ROW EXECUTE FUNCTION public.proc_attachment_count_trg();

-- ---------------------------------------------------------------------
-- 7. BİLDİRİM
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proc_notify(p_user uuid, p_title text, p_message text, p_type text,
                                             p_related_type text, p_related_id uuid, p_link text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.current_org_id();
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  BEGIN
    EXECUTE 'INSERT INTO public.notifications (organization_id, user_id, title, message, type, related_type, related_id, link)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
      USING v_org, p_user, left(p_title, 200), left(p_message, 500), COALESCE(p_type, 'info'), p_related_type, p_related_id, p_link;
  EXCEPTION WHEN others THEN
    BEGIN
      EXECUTE 'INSERT INTO public.notifications (organization_id, user_id, title, message, type, related_type, related_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7)'
        USING v_org, p_user, left(p_title, 200), left(p_message, 500), COALESCE(p_type, 'info'), p_related_type, p_related_id;
    EXCEPTION WHEN others THEN NULL;
    END;
  END;
END $$;
REVOKE EXECUTE ON FUNCTION public.proc_notify(uuid, text, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;

-- Onay adımının kişilerine (kişi, rol sahipleri ve vekilleri) bildirim
CREATE OR REPLACE FUNCTION public.proc_notify_approvers(p_approval uuid, p_title text, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; v_u uuid; v_amount numeric;
BEGIN
  SELECT * INTO a FROM public.proc_approvals WHERE id = p_approval;
  IF a.id IS NULL THEN RETURN; END IF;
  SELECT estimated_total INTO v_amount FROM public.proc_requests WHERE id = a.subject_id;
  FOR v_u IN
    SELECT x FROM (
      SELECT a.approver_user_id AS x WHERE a.approver_user_id IS NOT NULL
      UNION SELECT h FROM public.proc_role_holders(a.approver_role, v_amount) h WHERE a.approver_user_id IS NULL AND a.approver_role IS NOT NULL
    ) s
  LOOP
    PERFORM public.proc_notify(v_u, p_title, p_message, 'warning', 'proc_request', a.subject_id, '/procure/onaylar');
    PERFORM public.proc_notify(d.to_user_id, p_title || ' (vekâleten)', p_message, 'warning', 'proc_request', a.subject_id, '/procure/onaylar')
       FROM public.proc_delegations d
      WHERE d.from_user_id = v_u AND d.organization_id = a.organization_id AND current_date BETWEEN d.start_date AND d.end_date;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.proc_notify_approvers(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.proc_event(p_request uuid, p_kind text, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.proc_request_events (organization_id, request_id, kind, message, actor_id, actor_name)
  VALUES (public.current_org_id(), p_request, p_kind, left(p_message, 2000), auth.uid(),
          (SELECT COALESCE(u.name, u.email) FROM public.users u WHERE u.id = auth.uid()));
END $$;
REVOKE EXECUTE ON FUNCTION public.proc_event(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. BÜTÇE KONTROLÜ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proc_budget_check(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_fy text; v_line uuid; u jsonb; v_after numeric; v_mode text;
BEGIN
  SELECT * INTO r FROM public.proc_requests WHERE id = p_request AND organization_id = public.current_org_id();
  IF r.id IS NULL OR NOT public.proc_request_visible(r.id, r.requester_id, r.cost_center_id) THEN RETURN NULL; END IF;
  SELECT budget_check INTO v_mode FROM public.proc_policies WHERE organization_id = r.organization_id;
  v_mode := COALESCE(v_mode, 'warn');
  v_fy := public.proc_fiscal_year(COALESCE(r.submitted_at, now())::date);
  -- Onaylanmış talep satırına bağlı kalır; aksi halde güncel eşleşme aranır
  v_line := CASE WHEN r.status IN ('approved','sourcing','ordered','received','closed') THEN r.budget_line_id
                 ELSE public.proc_find_budget(r.cost_center_id, r.category_id, v_fy) END;
  IF v_line IS NULL THEN
    RETURN jsonb_build_object('status', 'no_budget', 'mode', v_mode, 'fiscal_year', v_fy, 'request_amount', r.estimated_total);
  END IF;
  u := public.proc_budget_usage(v_line, r.id);
  v_after := (u ->> 'available')::numeric - COALESCE(r.estimated_total, 0);
  RETURN u || jsonb_build_object('request_amount', r.estimated_total, 'after', v_after, 'mode', v_mode,
    'status', CASE WHEN v_after >= 0 THEN 'ok' ELSE 'insufficient' END);
END $$;
GRANT EXECUTE ON FUNCTION public.proc_budget_check(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 9. ONAY ADIMLARINI ÜRET (yetki matrisi)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proc_start_approval(p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; rule record; v_amount numeric; v_kind text; v_round int; v_check jsonb;
  v_prev_user uuid; v_prev_role text; v_first uuid; v_n int := 0; v_step int;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  SELECT * INTO r FROM public.proc_requests WHERE id = p_request FOR UPDATE;
  v_amount := COALESCE(r.estimated_total, 0);
  SELECT kind INTO v_kind FROM public.proc_categories WHERE id = r.category_id;
  v_round := r.approval_round + 1;

  -- Eşleşen kurallar: her adım için en özel kural (birim + kategori > yalnız biri > genel)
  FOR v_step IN
    SELECT DISTINCT ar.step_no FROM public.proc_approval_rules ar
     WHERE ar.organization_id = r.organization_id AND ar.is_active AND ar.applies_to = 'request'
       AND (ar.min_amount = 0 OR v_amount > ar.min_amount) AND (ar.max_amount IS NULL OR v_amount <= ar.max_amount)
       AND (ar.category_id IS NULL OR ar.category_id IN (SELECT id FROM public.proc_cat_ancestors(r.category_id)))
       AND (ar.category_kind IS NULL OR ar.category_kind = v_kind)
       AND (ar.cost_center_id IS NULL OR ar.cost_center_id IN (SELECT id FROM public.proc_cc_ancestors(r.cost_center_id)))
     ORDER BY 1
  LOOP
    SELECT ar.* INTO rule FROM public.proc_approval_rules ar
     WHERE ar.organization_id = r.organization_id AND ar.is_active AND ar.applies_to = 'request' AND ar.step_no = v_step
       AND (ar.min_amount = 0 OR v_amount > ar.min_amount) AND (ar.max_amount IS NULL OR v_amount <= ar.max_amount)
       AND (ar.category_id IS NULL OR ar.category_id IN (SELECT id FROM public.proc_cat_ancestors(r.category_id)))
       AND (ar.category_kind IS NULL OR ar.category_kind = v_kind)
       AND (ar.cost_center_id IS NULL OR ar.cost_center_id IN (SELECT id FROM public.proc_cc_ancestors(r.cost_center_id)))
     ORDER BY (ar.cost_center_id IS NOT NULL)::int * 2 + (ar.category_id IS NOT NULL)::int * 2 + (ar.category_kind IS NOT NULL)::int DESC,
              ar.min_amount DESC, ar.created_at
     LIMIT 1;
    v_n := v_n + 1;
    PERFORM public.proc_add_step(r.id, r.organization_id, v_round, rule.step_no, rule.id, rule.approver_kind, rule.approver_role,
                                 rule.approver_user_id, rule.approver_label, r.cost_center_id, r.requester_id, v_amount);
  END LOOP;

  -- Matriste eşleşen kural yoksa: birim sorumlusu (yoksa satınalma yöneticisi) tek adım
  IF v_n = 0 THEN
    PERFORM public.proc_add_step(r.id, r.organization_id, v_round, 1, NULL, 'cost_center_manager', NULL, NULL, NULL,
                                 r.cost_center_id, r.requester_id, v_amount);
  END IF;

  -- Aynı kişi/rol ardışık iki adımda çıkarsa sonraki adım atlanır
  FOR rule IN SELECT * FROM public.proc_approvals WHERE subject_type = 'request' AND subject_id = r.id AND round = v_round ORDER BY step_no LOOP
    IF v_prev_user IS NOT NULL AND rule.approver_user_id = v_prev_user
       OR (v_prev_user IS NULL AND rule.approver_user_id IS NULL AND v_prev_role IS NOT NULL AND rule.approver_role = v_prev_role) THEN
      UPDATE public.proc_approvals SET status = 'skipped', decided_at = now(), note = 'Önceki adımla aynı onaycı' WHERE id = rule.id;
    ELSIF v_first IS NULL THEN
      v_first := rule.id;
    END IF;
    v_prev_user := rule.approver_user_id; v_prev_role := rule.approver_role;
  END LOOP;

  v_check := public.proc_budget_check(r.id);
  UPDATE public.proc_requests SET status = 'in_approval', approval_round = v_round, submitted_at = now(),
         rejection_reason = NULL, budget_line_id = (v_check ->> 'budget_line_id')::uuid, budget_check_result = v_check,
         budget_override_by = NULL, budget_override_reason = NULL, budget_override_at = NULL
   WHERE id = r.id;

  IF v_first IS NOT NULL THEN
    PERFORM public.proc_notify_approvers(v_first, 'Onay bekleyen talep: ' || COALESCE(r.request_no, r.title),
      r.title || ' · ₺' || to_char(v_amount, 'FM999G999G999G990') || ' (KDV hariç)');
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.proc_start_approval(uuid) FROM PUBLIC, anon, authenticated;

-- Tek onay adımı: onaycıyı çözümle ve ekle
CREATE OR REPLACE FUNCTION public.proc_add_step(p_request uuid, p_org uuid, p_round int, p_step int, p_rule uuid, p_kind text,
  p_role text, p_user uuid, p_label text, p_cc uuid, p_requester uuid, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_role text; v_label text := p_label; v_cc text; v_holders uuid[];
BEGIN
  IF p_kind = 'user' THEN
    v_user := p_user;
    v_label := COALESCE(v_label, (SELECT COALESCE(u.name, u.email) FROM public.users u WHERE u.id = p_user));
  ELSIF p_kind = 'cost_center_manager' THEN
    -- En yakın birim sorumlusu; talep eden kendisi sorumluysa bir üst birime çıkılır
    SELECT a.manager_user_id, a.name INTO v_user, v_cc FROM public.proc_cc_ancestors(p_cc) a
     WHERE a.manager_user_id IS NOT NULL AND a.manager_user_id <> p_requester ORDER BY a.depth LIMIT 1;
    IF v_user IS NULL THEN
      v_role := 'procure_admin';
      v_label := COALESCE(v_label, 'Satınalma yöneticisi (birim sorumlusu tanımlı değil)');
    ELSE
      v_label := COALESCE(v_label, 'Birim sorumlusu') || ' · ' || v_cc;
    END IF;
  ELSE
    v_role := p_role;
    v_label := COALESCE(NULLIF(v_label, ''), CASE p_role WHEN 'approver' THEN 'Onaycı' WHEN 'finance' THEN 'Mali İşler'
      WHEN 'procure_admin' THEN 'Satınalma yöneticisi' WHEN 'buyer' THEN 'Satınalma uzmanı' WHEN 'receiver' THEN 'Teslim alan' ELSE p_role END);
    -- Talep eden kendi talebini onaylamaz
    SELECT array_agg(h) INTO v_holders FROM public.proc_role_holders(p_role, p_amount) h WHERE h <> p_requester;
    IF COALESCE(array_length(v_holders, 1), 0) = 1 THEN v_user := v_holders[1]; v_role := NULL; END IF;
    IF COALESCE(array_length(v_holders, 1), 0) = 0 THEN
      v_role := 'procure_admin';
      v_label := v_label || ' (rol sahibi yok → satınalma yöneticisi)';
    END IF;
  END IF;
  INSERT INTO public.proc_approvals (organization_id, subject_type, subject_id, round, step_no, rule_id, approver_user_id, approver_role, approver_label)
  VALUES (p_org, 'request', p_request, p_round, p_step, p_rule, v_user, CASE WHEN v_user IS NULL THEN v_role END, v_label);
END $$;
REVOKE EXECUTE ON FUNCTION public.proc_add_step(uuid, uuid, int, int, uuid, text, text, uuid, text, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. İŞ AKIŞI (istemcinin çağırdığı fonksiyonlar)
-- ---------------------------------------------------------------------
-- Gönder: numara alır; tutar varsa onaya, yoksa satınalmaya "fiyatlandırılacak" olarak düşer
CREATE OR REPLACE FUNCTION public.proc_request_submit(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_no text; v_u uuid;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  SELECT * INTO r FROM public.proc_requests WHERE id = p_id AND organization_id = public.current_org_id() FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;
  IF NOT public.org_has_module('procure') THEN RAISE EXCEPTION 'Satınalma modülü etkin değil.'; END IF;
  IF r.requester_id <> auth.uid() AND NOT (public.proc_has_role('buyer') OR public.proc_has_role('procure_admin')) THEN
    RAISE EXCEPTION 'Bu talebi gönderme yetkiniz yok.';
  END IF;
  IF r.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Talep zaten gönderilmiş.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proc_request_lines WHERE request_id = r.id) THEN RAISE EXCEPTION 'En az bir kalem ekleyin.'; END IF;
  IF r.cost_center_id IS NULL THEN RAISE EXCEPTION 'Birim (masraf merkezi) seçin.'; END IF;

  IF r.request_no IS NULL THEN
    v_no := public.next_document_number('proc_request', 'TLP');
    UPDATE public.proc_requests SET request_no = v_no WHERE id = r.id;
  END IF;
  PERFORM public.proc_event(r.id, 'submitted', CASE WHEN r.status = 'rejected' THEN 'Düzeltilip yeniden gönderildi' ELSE 'Talep gönderildi' END);

  IF r.estimated_total IS NULL OR r.estimated_total = 0 THEN
    UPDATE public.proc_requests SET status = 'submitted', submitted_at = now(), rejection_reason = NULL WHERE id = r.id;
    FOR v_u IN SELECT * FROM public.proc_role_holders('buyer') LOOP
      PERFORM public.proc_notify(v_u, 'Fiyatlandırılacak talep: ' || COALESCE(v_no, r.request_no), r.title, 'info', 'proc_request', r.id, '/procure/talepler/' || r.id);
    END LOOP;
    RETURN jsonb_build_object('status', 'submitted');
  END IF;
  PERFORM public.proc_start_approval(r.id);
  RETURN jsonb_build_object('status', 'in_approval');
END $$;

-- Satınalma uzmanı tahmini fiyatları girdikten sonra onaya gönderir
CREATE OR REPLACE FUNCTION public.proc_request_price(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT (public.proc_has_role('buyer') OR public.proc_has_role('procure_admin')) THEN RAISE EXCEPTION 'Satınalma uzmanı yetkisi gerekir.'; END IF;
  SELECT * INTO r FROM public.proc_requests WHERE id = p_id AND organization_id = public.current_org_id() FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'submitted' THEN RAISE EXCEPTION 'Talep fiyatlandırma aşamasında değil.'; END IF;
  IF COALESCE(r.estimated_total, 0) <= 0 THEN RAISE EXCEPTION 'Önce kalemlere tahmini birim fiyat girin.'; END IF;
  PERFORM public.proc_event(r.id, 'priced', 'Tahmini tutar girildi: ₺' || to_char(r.estimated_total, 'FM999G999G999G990'));
  PERFORM public.proc_start_approval(r.id);
  RETURN jsonb_build_object('status', 'in_approval');
END $$;

-- Onayla / reddet (tek dokunuş). Bütçe "engelle" modunda yetersizse önce bütçe aşımı onayı gerekir
CREATE OR REPLACE FUNCTION public.proc_approval_decide(p_approval uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; r record; v_check jsonb; v_next record; v_from uuid; v_me uuid := auth.uid(); v_u uuid;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  SELECT * INTO a FROM public.proc_approvals WHERE id = p_approval AND organization_id = public.current_org_id() FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Onay adımı bulunamadı.'; END IF;
  IF NOT public.proc_can_decide(a.id) THEN RAISE EXCEPTION 'Bu adımı onaylama yetkiniz yok veya sıra sizde değil.'; END IF;
  SELECT * INTO r FROM public.proc_requests WHERE id = a.subject_id FOR UPDATE;

  -- Vekâleten mi?
  IF a.approver_user_id IS NOT NULL AND a.approver_user_id <> v_me THEN v_from := a.approver_user_id;
  ELSIF a.approver_user_id IS NULL AND NOT public.proc_user_has_role(v_me, a.approver_role, r.estimated_total) THEN
    SELECT d INTO v_from FROM unnest(public.proc_delegators()) d WHERE public.proc_user_has_role(d, a.approver_role, r.estimated_total) LIMIT 1;
  END IF;

  IF NOT p_approve THEN
    IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Red gerekçesi zorunlu.'; END IF;
    UPDATE public.proc_approvals SET status = 'rejected', decided_at = now(), decided_by = v_me, delegated_from = v_from, note = left(trim(p_note), 1000) WHERE id = a.id;
    UPDATE public.proc_approvals SET status = 'skipped', decided_at = now(), note = 'Talep reddedildi'
     WHERE subject_type = 'request' AND subject_id = r.id AND round = a.round AND status = 'pending';
    UPDATE public.proc_requests SET status = 'rejected', rejection_reason = left(trim(p_note), 1000) WHERE id = r.id;
    PERFORM public.proc_event(r.id, 'rejected', a.approver_label || ' reddetti: ' || trim(p_note));
    PERFORM public.proc_notify(r.requester_id, 'Talebiniz reddedildi: ' || r.request_no, trim(p_note), 'error', 'proc_request', r.id, '/procure/talepler/' || r.id);
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  v_check := public.proc_budget_check(r.id);
  IF v_check ->> 'mode' = 'block' AND v_check ->> 'status' = 'insufficient' AND r.budget_override_by IS NULL THEN
    RAISE EXCEPTION 'Bütçe yetersiz: kullanılabilir ₺%, talep ₺%. Mali işler veya satınalma yöneticisi önce "bütçe aşımını onayla" demeli.',
      to_char((v_check ->> 'available')::numeric, 'FM999G999G999G990'), to_char(COALESCE(r.estimated_total, 0), 'FM999G999G999G990');
  END IF;

  UPDATE public.proc_approvals SET status = 'approved', decided_at = now(), decided_by = v_me, delegated_from = v_from,
         note = NULLIF(left(trim(COALESCE(p_note, '')), 1000), '') WHERE id = a.id;
  PERFORM public.proc_event(r.id, 'step_approved', a.approver_label || ' onayladı' || CASE WHEN v_from IS NOT NULL THEN ' (vekâleten)' ELSE '' END
                                                  || COALESCE(': ' || NULLIF(trim(COALESCE(p_note, '')), ''), ''));
  UPDATE public.proc_requests SET budget_check_result = v_check WHERE id = r.id;

  SELECT * INTO v_next FROM public.proc_approvals
   WHERE subject_type = 'request' AND subject_id = r.id AND round = a.round AND status = 'pending' ORDER BY step_no LIMIT 1;
  IF v_next.id IS NOT NULL THEN
    PERFORM public.proc_notify_approvers(v_next.id, 'Onay bekleyen talep: ' || r.request_no,
      r.title || ' · ₺' || to_char(COALESCE(r.estimated_total, 0), 'FM999G999G999G990') || ' · önceki adım: ' || a.approver_label);
    RETURN jsonb_build_object('status', 'in_approval');
  END IF;

  UPDATE public.proc_requests SET status = 'approved', approved_at = now(), budget_line_id = COALESCE((v_check ->> 'budget_line_id')::uuid, budget_line_id)
   WHERE id = r.id;
  PERFORM public.proc_event(r.id, 'approved', 'Talep onaylandı');
  PERFORM public.proc_notify(r.requester_id, 'Talebiniz onaylandı: ' || r.request_no, r.title, 'success', 'proc_request', r.id, '/procure/talepler/' || r.id);
  FOR v_u IN SELECT * FROM public.proc_role_holders('buyer') LOOP
    PERFORM public.proc_notify(v_u, 'Kaynak bulunacak talep: ' || r.request_no, r.title, 'info', 'proc_request', r.id, '/procure/talepler/' || r.id);
  END LOOP;
  RETURN jsonb_build_object('status', 'approved');
END $$;

-- Bütçe aşımını onayla (yalnızca mali işler / satınalma yöneticisi; gerekçe zorunlu ve loglanır)
CREATE OR REPLACE FUNCTION public.proc_budget_override(p_request uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_a uuid;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  IF NOT (public.proc_has_role('finance') OR public.proc_has_role('procure_admin')) THEN
    RAISE EXCEPTION 'Bütçe aşımını yalnızca mali işler veya satınalma yöneticisi onaylayabilir.';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Gerekçe zorunlu.'; END IF;
  SELECT * INTO r FROM public.proc_requests WHERE id = p_request AND organization_id = public.current_org_id() FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'in_approval' THEN RAISE EXCEPTION 'Talep onay aşamasında değil.'; END IF;
  UPDATE public.proc_requests SET budget_override_by = auth.uid(), budget_override_reason = left(trim(p_reason), 1000), budget_override_at = now()
   WHERE id = r.id;
  PERFORM public.proc_event(r.id, 'budget_override', 'Bütçe aşımı onaylandı: ' || trim(p_reason));
  SELECT id INTO v_a FROM public.proc_approvals WHERE subject_type = 'request' AND subject_id = r.id AND round = r.approval_round AND status = 'pending'
   ORDER BY step_no LIMIT 1;
  IF v_a IS NOT NULL THEN PERFORM public.proc_notify_approvers(v_a, 'Bütçe aşımı onaylandı: ' || r.request_no, 'Talep onayınızı bekliyor.'); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.proc_request_cancel(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  PERFORM set_config('proc.rpc', '1', true);
  SELECT * INTO r FROM public.proc_requests WHERE id = p_id AND organization_id = public.current_org_id() FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;
  IF r.requester_id <> auth.uid() AND NOT (public.proc_has_role('buyer') OR public.proc_has_role('procure_admin')) THEN
    RAISE EXCEPTION 'Bu talebi iptal etme yetkiniz yok.';
  END IF;
  IF r.status IN ('ordered','received','closed','cancelled') THEN RAISE EXCEPTION 'Bu aşamadaki talep iptal edilemez.'; END IF;
  IF coalesce(trim(p_reason), '') = '' AND r.status <> 'draft' THEN RAISE EXCEPTION 'İptal gerekçesi zorunlu.'; END IF;
  UPDATE public.proc_approvals SET status = 'skipped', decided_at = now(), note = 'Talep iptal edildi'
   WHERE subject_type = 'request' AND subject_id = r.id AND status = 'pending';
  UPDATE public.proc_requests SET status = 'cancelled', cancel_reason = NULLIF(left(trim(COALESCE(p_reason, '')), 1000), ''), closed_at = now()
   WHERE id = r.id;
  PERFORM public.proc_event(r.id, 'cancelled', COALESCE('İptal: ' || NULLIF(trim(COALESCE(p_reason, '')), ''), 'İptal edildi'));
END $$;

CREATE OR REPLACE FUNCTION public.proc_request_comment(p_id uuid, p_text text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_a uuid;
BEGIN
  SELECT * INTO r FROM public.proc_requests WHERE id = p_id AND organization_id = public.current_org_id();
  IF r.id IS NULL OR NOT public.proc_request_visible(r.id, r.requester_id, r.cost_center_id) THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;
  IF coalesce(trim(p_text), '') = '' THEN RETURN; END IF;
  PERFORM public.proc_event(r.id, 'comment', trim(p_text));
  IF r.requester_id <> auth.uid() THEN
    PERFORM public.proc_notify(r.requester_id, 'Talebinize yorum: ' || COALESCE(r.request_no, r.title), left(trim(p_text), 300), 'info', 'proc_request', r.id, '/procure/talepler/' || r.id);
  ELSE
    SELECT id INTO v_a FROM public.proc_approvals WHERE subject_type = 'request' AND subject_id = r.id AND round = r.approval_round AND status = 'pending'
     ORDER BY step_no LIMIT 1;
    IF v_a IS NOT NULL THEN PERFORM public.proc_notify_approvers(v_a, 'Talep sahibinden yorum: ' || COALESCE(r.request_no, r.title), left(trim(p_text), 300)); END IF;
  END IF;
END $$;

-- Onay kuyruğum: sırası bende olan adımlar
CREATE OR REPLACE FUNCTION public.proc_my_pending_approvals()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id FROM public.proc_approvals a
   WHERE a.organization_id = public.current_org_id() AND a.status = 'pending' AND public.proc_can_decide(a.id);
$$;

GRANT EXECUTE ON FUNCTION public.proc_request_submit(uuid), public.proc_request_price(uuid), public.proc_approval_decide(uuid, boolean, text),
  public.proc_budget_override(uuid, text), public.proc_request_cancel(uuid, text), public.proc_request_comment(uuid, text),
  public.proc_my_pending_approvals() TO authenticated;

-- ---------------------------------------------------------------------
-- 11. RLS
-- ---------------------------------------------------------------------
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['proc_requests','proc_request_lines','proc_request_events','proc_attachments','proc_approval_rules',
                             'proc_approvals','proc_delegations','proc_budgets','proc_budget_revisions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_org ON public.%I', tbl);
    EXECUTE format('CREATE TRIGGER trg_set_org BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_organization_id()', tbl);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON public.%I', tbl);
    EXECUTE format('CREATE POLICY org_isolation ON public.%I FOR ALL TO authenticated
                    USING (organization_id = public.current_org_id()) WITH CHECK (organization_id = public.current_org_id())', tbl);
    EXECUTE format('DROP POLICY IF EXISTS proc_module ON public.%I', tbl);
    EXECUTE format('CREATE POLICY proc_module ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
                    USING ((SELECT public.org_has_module(''procure''))) WITH CHECK ((SELECT public.org_has_module(''procure'')))', tbl);
    -- Önceki çalıştırmadan kalan rol politikaları temizlenir, aşağıda yeniden kurulur
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
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_change') AND tbl NOT IN ('proc_request_events','proc_budget_revisions') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_change_log ON public.%I', tbl);
      EXECUTE format('CREATE TRIGGER trg_change_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_change()', tbl);
    END IF;
  END LOOP;
END $$;

-- Talepler: satır görünürlüğü (talep eden + birimi + satınalma/mali işler/yönetici + onaycılar)
CREATE POLICY proc_sel ON public.proc_requests AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.proc_request_visible(id, requester_id, cost_center_id));
CREATE POLICY proc_ins ON public.proc_requests AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND ((SELECT public.proc_has_role('requester')) OR (SELECT public.proc_has_role('buyer'))
              OR (SELECT public.proc_has_role('procure_admin'))));
CREATE POLICY proc_upd ON public.proc_requests AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.proc_request_editable(id)) WITH CHECK (true);
CREATE POLICY proc_del ON public.proc_requests AS RESTRICTIVE FOR DELETE TO authenticated
  USING (requester_id = auth.uid() AND status = 'draft' AND request_no IS NULL);

-- Kalemler: talebe bağlı
CREATE POLICY proc_sel ON public.proc_request_lines AS RESTRICTIVE FOR SELECT TO authenticated USING (public.proc_can_see_request(request_id));
CREATE POLICY proc_ins ON public.proc_request_lines AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.proc_request_editable(request_id));
CREATE POLICY proc_upd ON public.proc_request_lines AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.proc_request_editable(request_id)) WITH CHECK (public.proc_request_editable(request_id));
CREATE POLICY proc_del ON public.proc_request_lines AS RESTRICTIVE FOR DELETE TO authenticated USING (public.proc_request_editable(request_id));

-- Zaman çizelgesi ve onay adımları: okunur; yalnızca iş akışı fonksiyonları yazar
CREATE POLICY proc_sel ON public.proc_request_events AS RESTRICTIVE FOR SELECT TO authenticated USING (public.proc_can_see_request(request_id));
CREATE POLICY proc_ins ON public.proc_request_events AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY proc_upd ON public.proc_request_events AS RESTRICTIVE FOR UPDATE TO authenticated USING (false);
CREATE POLICY proc_del ON public.proc_request_events AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE POLICY proc_sel ON public.proc_approvals AS RESTRICTIVE FOR SELECT TO authenticated
  USING (subject_type <> 'request' OR public.proc_can_see_request(subject_id));
CREATE POLICY proc_ins ON public.proc_approvals AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY proc_upd ON public.proc_approvals AS RESTRICTIVE FOR UPDATE TO authenticated USING (false);
CREATE POLICY proc_del ON public.proc_approvals AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- Ekler: kaydı gören görür ve ekler; ekleyen veya yönetici siler
CREATE POLICY proc_sel ON public.proc_attachments AS RESTRICTIVE FOR SELECT TO authenticated USING (public.proc_can_see_owner(owner_type, owner_id));
CREATE POLICY proc_ins ON public.proc_attachments AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.proc_can_see_owner(owner_type, owner_id)
              AND split_part(storage_path, '/', 1) = public.current_org_id()::text);
CREATE POLICY proc_upd ON public.proc_attachments AS RESTRICTIVE FOR UPDATE TO authenticated USING (false);
CREATE POLICY proc_del ON public.proc_attachments AS RESTRICTIVE FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR (SELECT public.proc_has_role('procure_admin')));

-- Yetki matrisi: herkes okur, satınalma yöneticisi yazar
CREATE POLICY proc_ins ON public.proc_approval_rules AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.proc_has_role('procure_admin')));
CREATE POLICY proc_upd ON public.proc_approval_rules AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.proc_has_role('procure_admin'))) WITH CHECK ((SELECT public.proc_has_role('procure_admin')));
CREATE POLICY proc_del ON public.proc_approval_rules AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.proc_has_role('procure_admin')));

-- Vekâlet: kendi vekâletim (veren/alan) veya yönetici
CREATE POLICY proc_sel ON public.proc_delegations AS RESTRICTIVE FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid() OR (SELECT public.proc_has_role('procure_admin')));
CREATE POLICY proc_ins ON public.proc_delegations AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (from_user_id = auth.uid() OR (SELECT public.proc_has_role('procure_admin')));
CREATE POLICY proc_upd ON public.proc_delegations AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (from_user_id = auth.uid() OR (SELECT public.proc_has_role('procure_admin')))
  WITH CHECK (from_user_id = auth.uid() OR (SELECT public.proc_has_role('procure_admin')));
CREATE POLICY proc_del ON public.proc_delegations AS RESTRICTIVE FOR DELETE TO authenticated
  USING (from_user_id = auth.uid() OR (SELECT public.proc_has_role('procure_admin')));

-- Bütçe: mali işler/yönetici/satınalma/onaycı ve birim sorumluları okur; mali işler/yönetici yazar
CREATE POLICY proc_sel ON public.proc_budgets AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.proc_has_role('finance')) OR (SELECT public.proc_has_role('procure_admin')) OR (SELECT public.proc_has_role('buyer'))
         OR (SELECT public.proc_has_role('approver')) OR cost_center_id = ANY((SELECT public.proc_my_cost_centers())));
CREATE POLICY proc_ins ON public.proc_budgets AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.proc_has_role('finance')) OR (SELECT public.proc_has_role('procure_admin')));
CREATE POLICY proc_upd ON public.proc_budgets AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.proc_has_role('finance')) OR (SELECT public.proc_has_role('procure_admin')))
  WITH CHECK ((SELECT public.proc_has_role('finance')) OR (SELECT public.proc_has_role('procure_admin')));
CREATE POLICY proc_del ON public.proc_budgets AS RESTRICTIVE FOR DELETE TO authenticated
  USING (((SELECT public.proc_has_role('finance')) OR (SELECT public.proc_has_role('procure_admin'))) AND NOT locked);

CREATE POLICY proc_sel ON public.proc_budget_revisions AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.proc_has_role('finance')) OR (SELECT public.proc_has_role('procure_admin')));
CREATE POLICY proc_ins ON public.proc_budget_revisions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY proc_upd ON public.proc_budget_revisions AS RESTRICTIVE FOR UPDATE TO authenticated USING (false);
CREATE POLICY proc_del ON public.proc_budget_revisions AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

NOTIFY pgrst, 'reload schema';

SELECT 'Procure Faz 1a (talep, onay, bütçe) kuruldu' AS durum;
