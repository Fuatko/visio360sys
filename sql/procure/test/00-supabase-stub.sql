-- Supabase benzeri asgari ortam: yalnızca yerel testler için (run.sh). Canlıda çalıştırmayın.
-- Supabase benzeri asgari ortam (yalnızca yerel test)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase gibi: public şemada oluşturulan her fonksiyon varsayılan olarak anon/authenticated'a açık
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE SCHEMA storage; GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, slug text, subscription_plan text DEFAULT 'basic', settings jsonb DEFAULT '{}', is_active boolean DEFAULT true, max_users int DEFAULT 10, created_at timestamptz DEFAULT now(), updated_at timestamptz);
CREATE TABLE public.users (id uuid PRIMARY KEY, email text, name text, full_name text, role text DEFAULT 'user', is_org_admin boolean DEFAULT false, organization_id uuid, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now());
CREATE TABLE public.dealer_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_user_id uuid, dealer_id uuid, organization_id uuid, status text, email text);
CREATE TABLE public.customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, name text, tax_number text, tax_office text, email text, phone text, address text, city text, relation_roles text[] DEFAULT '{customer}', customer_type text, status text, created_at timestamptz DEFAULT now());
CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, name text, unit text, price numeric);
CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, user_id uuid, title text NOT NULL, message text, type text DEFAULT 'info', related_type text, related_id uuid, link text, is_read boolean DEFAULT false, is_dismissed boolean DEFAULT false, created_at timestamptz DEFAULT now());
CREATE TABLE public.parasut_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, kind text, parasut_id text, doc_no text, description text, issue_date date, contact_name text, tax_number text, customer_id uuid, category text, currency text, net_total numeric, vat_total numeric, gross_total numeric, net_total_try numeric);
CREATE TABLE public.parasut_document_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, document_id uuid NOT NULL REFERENCES public.parasut_documents(id) ON DELETE CASCADE, parasut_detail_id text, description text, product_name text, quantity numeric, unit_price numeric, discount_pct numeric, vat_rate numeric, net_total_try numeric);
CREATE TABLE public.quote_letterhead (organization_id uuid PRIMARY KEY, legal_name text, address text, phone text, email text, tax_office text, tax_number text, logo_path text, signer_name text, signer_title text, accent_color text);

-- sirket-ayrimi-rls.sql + bayi-portali.sql
CREATE FUNCTION public.is_dealer_user() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.dealer_users WHERE auth_user_id = auth.uid()) $$;
CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid() AND NOT EXISTS (SELECT 1 FROM public.dealer_users d WHERE d.auth_user_id = auth.uid()) $$;
CREATE FUNCTION public.set_organization_id() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NEW.organization_id IS NULL THEN NEW.organization_id := public.current_org_id(); END IF; RETURN NEW; END $$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin') $$;
CREATE FUNCTION public.request_meta() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('ip', NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for') $$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_admin ON public.organizations FOR ALL USING (public.is_super_admin());
CREATE POLICY org_read ON public.organizations FOR SELECT USING (id = public.current_org_id());
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY self ON public.users FOR SELECT USING (id = auth.uid());
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['customers','products','parasut_documents','parasut_document_lines','quote_letterhead'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY org_isolation ON public.%I FOR ALL TO authenticated USING (organization_id = public.current_org_id()) WITH CHECK (organization_id = public.current_org_id())', t);
END LOOP; END $$;
CREATE TRIGGER trg_set_org BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
-- multi-tenant-schema.sql: bildirimler kurum bazlı
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Kullanıcılar kendi bildirimlerini görür" ON public.notifications FOR ALL USING (organization_id = public.current_org_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- iso-uyum.sql
CREATE TABLE public.change_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, table_name text, record_id uuid, action text, changed_fields text[], old_data jsonb, new_data jsonb, changed_by uuid, changed_at timestamptz DEFAULT now());
CREATE FUNCTION public.log_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END; v_new jsonb := CASE WHEN TG_OP IN ('UPDATE','INSERT') THEN to_jsonb(NEW) END;
BEGIN
  INSERT INTO public.change_log (organization_id, table_name, record_id, action, old_data, new_data, changed_by)
  VALUES (COALESCE((v_new->>'organization_id')::uuid, (v_old->>'organization_id')::uuid), TG_TABLE_NAME, COALESCE((v_new->>'id')::uuid, (v_old->>'id')::uuid), TG_OP, v_old, v_new, auth.uid());
  RETURN COALESCE(NEW, OLD);
END $$;
-- fatura-modulu.sql
CREATE TABLE public.document_sequences (organization_id uuid NOT NULL, doc_type text NOT NULL, year int NOT NULL, last_number int NOT NULL DEFAULT 0, PRIMARY KEY (organization_id, doc_type, year));
CREATE FUNCTION public.next_document_number(p_doc_type text, p_prefix text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.current_org_id(); v_year int := EXTRACT(YEAR FROM now())::int; v_num int;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'Kullanıcının şirketi tanımlı değil'; END IF;
  INSERT INTO public.document_sequences VALUES (v_org, p_doc_type, v_year, 1)
  ON CONFLICT (organization_id, doc_type, year) DO UPDATE SET last_number = public.document_sequences.last_number + 1 RETURNING last_number INTO v_num;
  RETURN p_prefix || '-' || v_year || '-' || lpad(v_num::text, 4, '0');
END $$;
GRANT EXECUTE ON FUNCTION public.next_document_number(text, text) TO authenticated;
