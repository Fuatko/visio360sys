-- =====================================================================
-- INSPIRA360 PROCURE — FAZ 0: ALTYAPI
--   1. Modül lisansı: organizations.enabled_modules, org_has_module(), my_enabled_modules()
--   2. Masraf merkezleri (proc_cost_centers)
--   3. Procure rolleri (proc_members) + proc_has_role(), proc_my_roles(), proc_my_cost_centers()
--   4. Satınalma politikası (proc_policies, kurum başına tek satır)
--   5. Satınalma kategorileri (proc_categories)
--   6. RLS, şirket ayrımı, lisans koşulu, bayi portalı engeli, değişiklik kaydı
-- Önkoşul: sirket-ayrimi-rls.sql (current_org_id, set_organization_id).
-- iso-uyum.sql (log_change) ve bayi-portali.sql (is_dealer_user) varsa kullanılır.
-- Tek seferde çalıştırılır. Tekrar çalıştırmak güvenlidir. Revenue tablolarına dokunmaz.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MODÜL LİSANSI
-- ---------------------------------------------------------------------
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS enabled_modules text[] NOT NULL DEFAULT '{revenue}';

-- Yalnızca bilinen modüller, tekrarsız; değiştirmeyi yalnızca süper admin yapabilir
-- (SQL Editor / service_role oturumunda auth.uid() boştur, izin verilir).
CREATE OR REPLACE FUNCTION public.org_modules_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.enabled_modules := ARRAY(
    SELECT DISTINCT m FROM unnest(COALESCE(NEW.enabled_modules, '{}'::text[])) AS m
    WHERE m IN ('revenue','procure') ORDER BY m);
  IF TG_OP = 'UPDATE' AND NEW.enabled_modules IS DISTINCT FROM OLD.enabled_modules
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin') THEN
    RAISE EXCEPTION 'Kurum modüllerini yalnızca süper admin değiştirebilir.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_org_modules_guard ON public.organizations;
CREATE TRIGGER trg_org_modules_guard BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.org_modules_guard();

-- Oturumdaki kullanıcının kurumunda modül açık mı?
CREATE OR REPLACE FUNCTION public.org_has_module(p text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT p = ANY(o.enabled_modules) FROM public.organizations o
                   WHERE o.id = public.current_org_id()), false);
$$;

-- Arayüz için: kurumun etkin modülleri
CREATE OR REPLACE FUNCTION public.my_enabled_modules()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT o.enabled_modules FROM public.organizations o
                   WHERE o.id = public.current_org_id()), '{}'::text[]);
$$;
GRANT EXECUTE ON FUNCTION public.org_has_module(text), public.my_enabled_modules() TO authenticated;

-- ---------------------------------------------------------------------
-- 2. MASRAF MERKEZLERİ (Kampüs → Kademe → Birim)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_cost_centers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  code             text,
  name             text NOT NULL,
  parent_id        uuid REFERENCES public.proc_cost_centers(id) ON DELETE RESTRICT,
  kind             text NOT NULL DEFAULT 'unit' CHECK (kind IN ('campus','level','department','unit')),
  manager_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active        boolean NOT NULL DEFAULT true,
  sort             int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS proc_cost_centers_code_uq
  ON public.proc_cost_centers (organization_id, lower(code)) WHERE code IS NOT NULL AND code <> '';
CREATE INDEX IF NOT EXISTS proc_cost_centers_parent_idx ON public.proc_cost_centers (organization_id, parent_id);

-- Üst birim aynı kurumdan olmalı, ağaçta döngü olamaz
CREATE OR REPLACE FUNCTION public.proc_tree_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cur uuid := NEW.parent_id; v_org uuid; v_depth int := 0;
BEGIN
  NEW.updated_at := now();
  -- trg_set_org'dan önce çalışır (tetikleyiciler ada göre sıralanır)
  NEW.organization_id := COALESCE(NEW.organization_id, public.current_org_id());
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id = NEW.id THEN RAISE EXCEPTION 'Bir kayıt kendisinin üstü olamaz.'; END IF;
  EXECUTE format('SELECT organization_id FROM public.%I WHERE id = $1', TG_TABLE_NAME) INTO v_org USING NEW.parent_id;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Üst kayıt bulunamadı.'; END IF;
  WHILE v_cur IS NOT NULL AND v_depth < 50 LOOP
    IF v_cur = NEW.id THEN RAISE EXCEPTION 'Döngüsel üst bağlantı kurulamaz.'; END IF;
    EXECUTE format('SELECT parent_id FROM public.%I WHERE id = $1', TG_TABLE_NAME) INTO v_cur USING v_cur;
    v_depth := v_depth + 1;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proc_tree_guard ON public.proc_cost_centers;
CREATE TRIGGER trg_proc_tree_guard BEFORE INSERT OR UPDATE ON public.proc_cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.proc_tree_guard();

-- ---------------------------------------------------------------------
-- 3. PROCURE ROLLERİ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  roles            text[] NOT NULL DEFAULT '{requester}',
  cost_center_ids  uuid[] NOT NULL DEFAULT '{}',
  approval_limit   numeric(15,2),
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proc_members_roles_chk
    CHECK (roles <@ ARRAY['requester','approver','buyer','receiver','finance','procure_admin']::text[])
);
CREATE UNIQUE INDEX IF NOT EXISTS proc_members_user_uq ON public.proc_members (organization_id, user_id);

-- Üye, kurumun kullanıcısı olmalı
CREATE OR REPLACE FUNCTION public.proc_members_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.organization_id := COALESCE(NEW.organization_id, public.current_org_id());
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.user_id AND u.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Kullanıcı bu kuruma ait değil.';
  END IF;
  NEW.roles := ARRAY(SELECT DISTINCT r FROM unnest(NEW.roles) AS r ORDER BY r);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proc_members_guard ON public.proc_members;
CREATE TRIGGER trg_proc_members_guard BEFORE INSERT OR UPDATE ON public.proc_members
  FOR EACH ROW EXECUTE FUNCTION public.proc_members_guard();

-- Kurum admin'i (users.role admin/org_admin/super_admin veya is_org_admin) otomatik procure_admin sayılır
CREATE OR REPLACE FUNCTION public.proc_is_org_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u
                 WHERE u.id = auth.uid() AND u.organization_id = public.current_org_id()
                   AND (u.role IN ('admin','org_admin','super_admin') OR COALESCE(u.is_org_admin, false)));
$$;

CREATE OR REPLACE FUNCTION public.proc_has_role(p_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (p_role = 'procure_admin' AND public.proc_is_org_admin())
      OR EXISTS (SELECT 1 FROM public.proc_members m
                 WHERE m.user_id = auth.uid() AND m.organization_id = public.current_org_id()
                   AND m.is_active AND p_role = ANY(m.roles));
$$;

-- Arayüz için: oturumdaki kullanıcının Procure rolleri
CREATE OR REPLACE FUNCTION public.proc_my_roles()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ARRAY(SELECT DISTINCT r FROM (
    SELECT unnest(m.roles) AS r FROM public.proc_members m
     WHERE m.user_id = auth.uid() AND m.organization_id = public.current_org_id() AND m.is_active
    UNION ALL
    SELECT 'procure_admin' WHERE public.proc_is_org_admin()
  ) x ORDER BY r);
$$;

-- Kullanıcının sorumlu olduğu masraf merkezleri (atandıkları + yönettikleri, alt birimleriyle)
CREATE OR REPLACE FUNCTION public.proc_my_cost_centers()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE roots AS (
    SELECT unnest(m.cost_center_ids) AS id FROM public.proc_members m
     WHERE m.user_id = auth.uid() AND m.organization_id = public.current_org_id() AND m.is_active
    UNION
    SELECT c.id FROM public.proc_cost_centers c
     WHERE c.manager_user_id = auth.uid() AND c.organization_id = public.current_org_id()
  ), tree AS (
    SELECT c.id FROM public.proc_cost_centers c JOIN roots r ON r.id = c.id
     WHERE c.organization_id = public.current_org_id()
    UNION
    SELECT c.id FROM public.proc_cost_centers c JOIN tree t ON c.parent_id = t.id
  )
  SELECT COALESCE(array_agg(id), '{}'::uuid[]) FROM tree;
$$;
GRANT EXECUTE ON FUNCTION public.proc_is_org_admin(), public.proc_has_role(text), public.proc_my_roles(),
                          public.proc_my_cost_centers() TO authenticated;

-- ---------------------------------------------------------------------
-- 4. SATINALMA POLİTİKASI (kurum başına tek satır)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_policies (
  organization_id                       uuid PRIMARY KEY,
  id                                    uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),  -- değişiklik kaydı için
  fiscal_year_start_month               int NOT NULL DEFAULT 9 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  three_quote_threshold                 numeric(15,2),          -- KDV hariç; boşsa kural kapalı
  single_source_requires_justification  boolean NOT NULL DEFAULT true,
  budget_check                          text NOT NULL DEFAULT 'warn' CHECK (budget_check IN ('off','warn','block')),
  invoice_price_tolerance_pct           numeric(6,2) NOT NULL DEFAULT 2 CHECK (invoice_price_tolerance_pct >= 0),
  invoice_qty_tolerance_pct             numeric(6,2) NOT NULL DEFAULT 0 CHECK (invoice_qty_tolerance_pct >= 0),
  default_payment_term_days             int CHECK (default_payment_term_days IS NULL OR default_payment_term_days >= 0),
  require_receipt_photo                 boolean NOT NULL DEFAULT false,
  vendor_reevaluation_months            int NOT NULL DEFAULT 12 CHECK (vendor_reevaluation_months BETWEEN 1 AND 60),
  approved_vendor_list_required         boolean NOT NULL DEFAULT false,
  setup_progress                        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- sihirbaz: {"policy":"done","cost_centers":"skipped",...}
  created_at                            timestamptz NOT NULL DEFAULT now(),
  updated_at                            timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.proc_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_proc_policies_touch ON public.proc_policies;
CREATE TRIGGER trg_proc_policies_touch BEFORE UPDATE ON public.proc_policies
  FOR EACH ROW EXECUTE FUNCTION public.proc_touch_updated_at();

-- ---------------------------------------------------------------------
-- 5. SATINALMA KATEGORİLERİ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proc_categories (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid,
  code                   text,
  name                   text NOT NULL,
  parent_id              uuid REFERENCES public.proc_categories(id) ON DELETE RESTRICT,
  kind                   text NOT NULL DEFAULT 'goods' CHECK (kind IN ('goods','service','capex')),
  parasut_category       text,      -- Paraşüt gider kategorisi (bütçe gerçekleşeni için)
  default_receiver_role  text CHECK (default_receiver_role IS NULL OR default_receiver_role IN
                           ('requester','approver','buyer','receiver','finance','procure_admin')),
  is_active              boolean NOT NULL DEFAULT true,
  sort                   int NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS proc_categories_code_uq
  ON public.proc_categories (organization_id, lower(code)) WHERE code IS NOT NULL AND code <> '';
DROP TRIGGER IF EXISTS trg_proc_tree_guard ON public.proc_categories;
CREATE TRIGGER trg_proc_tree_guard BEFORE INSERT OR UPDATE ON public.proc_categories
  FOR EACH ROW EXECUTE FUNCTION public.proc_tree_guard();

-- ---------------------------------------------------------------------
-- 6. RLS, şirket ayrımı, lisans, bayi engeli, yazma yetkisi, değişiklik kaydı
-- ---------------------------------------------------------------------
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['proc_cost_centers','proc_members','proc_policies','proc_categories'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_org ON public.%I', tbl);
    EXECUTE format('CREATE TRIGGER trg_set_org BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_organization_id()', tbl);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Kurum ayrımı
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON public.%I', tbl);
    EXECUTE format('CREATE POLICY org_isolation ON public.%I FOR ALL TO authenticated
                    USING (organization_id = public.current_org_id()) WITH CHECK (organization_id = public.current_org_id())', tbl);

    -- Lisans: Procure modülü kapalı kurum veriye erişemez
    EXECUTE format('DROP POLICY IF EXISTS proc_module ON public.%I', tbl);
    EXECUTE format('CREATE POLICY proc_module ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
                    USING ((SELECT public.org_has_module(''procure''))) WITH CHECK ((SELECT public.org_has_module(''procure'')))', tbl);

    -- Kurulum verisini herkes okur, yalnızca procure_admin yazar
    EXECUTE format('DROP POLICY IF EXISTS proc_admin_insert ON public.%I', tbl);
    EXECUTE format('CREATE POLICY proc_admin_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
                    WITH CHECK ((SELECT public.proc_has_role(''procure_admin'')))', tbl);
    EXECUTE format('DROP POLICY IF EXISTS proc_admin_update ON public.%I', tbl);
    EXECUTE format('CREATE POLICY proc_admin_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
                    USING ((SELECT public.proc_has_role(''procure_admin''))) WITH CHECK ((SELECT public.proc_has_role(''procure_admin'')))', tbl);
    EXECUTE format('DROP POLICY IF EXISTS proc_admin_delete ON public.%I', tbl);
    EXECUTE format('CREATE POLICY proc_admin_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
                    USING ((SELECT public.proc_has_role(''procure_admin'')))', tbl);

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

-- Satınalma belge numaraları (TLP/TTF/SAS/MKB...) mevcut next_document_number() ve
-- document_sequences ile üretilir (fatura-modulu.sql); burada ek şema gerekmez.

NOTIFY pgrst, 'reload schema';

SELECT 'Procure Faz 0 altyapısı kuruldu' AS durum,
       (SELECT count(*) FROM public.organizations WHERE 'procure' = ANY(enabled_modules)) AS procure_lisansli_kurum;
