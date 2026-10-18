\set ON_ERROR_STOP 1
-- Yetki sertleştirme: anon (giriş yapmamış) yalnızca proc_public_% fonksiyonlarını çağırabilir
DO $$
DECLARE r record; bad text[] := '{}';
  internal text[] := ARRAY['proc_notify','proc_notify_approvers','proc_event','proc_start_approval','proc_add_step','proc_add_subject_step',
                           'proc_role_holders','proc_rate_limit','proc_rfq_save_quote','proc_rfq_award_decide','proc_order_approval_state',
                           'proc_order_approval_decide','proc_invoice_apply'];
  n_public int := 0; n_auth int := 0; n_closed int := 0;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig, p.proname, p.prorettype = 'trigger'::regtype AS trg
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'proc\_%' LOOP
    IF r.proname LIKE 'proc\_public\_%' THEN
      n_public := n_public + 1;
      IF NOT has_function_privilege('anon', r.sig, 'EXECUTE') THEN bad := bad || ('anon çağıramıyor: ' || r.sig); END IF;
    ELSE
      IF has_function_privilege('anon', r.sig, 'EXECUTE') THEN bad := bad || ('anon çağırabiliyor: ' || r.sig); END IF;
      IF r.trg OR r.proname = ANY(internal) THEN
        n_closed := n_closed + 1;
        IF has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN bad := bad || ('authenticated iç fonksiyonu çağırabiliyor: ' || r.sig); END IF;
      ELSE
        n_auth := n_auth + 1;
        IF NOT has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN bad := bad || ('authenticated çağıramıyor: ' || r.sig); END IF;
      END IF;
    END IF;
  END LOOP;
  IF array_length(bad, 1) > 0 THEN RAISE EXCEPTION 'TEST FAIL yetki: %', array_to_string(bad, ' | '); END IF;
  RAISE NOTICE 'OK yetki: % herkese açık (proc_public_), % yalnızca oturum açmış, % iç/tetikleyici (kapalı)', n_public, n_auth, n_closed;
END $$;
-- Gerçek çağrı denemesi: anon olarak iç ve yönetim fonksiyonları reddedilir
SET ROLE anon;
DO $$
DECLARE fn text; ok int := 0;
BEGIN
  FOREACH fn IN ARRAY ARRAY['SELECT public.proc_kpis(current_date - 30, current_date)', 'SELECT * FROM public.proc_invoice_suggestions()',
    'SELECT public.proc_vendor_metrics(gen_random_uuid(), current_date - 30, current_date)', 'SELECT * FROM public.proc_parasut_supplier_candidates()',
    'SELECT public.proc_has_role(''buyer'')', 'SELECT public.proc_notify(gen_random_uuid(), ''x'', ''x'', ''info'', ''x'', gen_random_uuid(), NULL)',
    'SELECT public.my_enabled_modules()', 'SELECT * FROM public.proc_org_people()'] LOOP
    BEGIN EXECUTE fn; RAISE EXCEPTION 'TEST FAIL anon çağırabildi: %', fn;
    EXCEPTION WHEN insufficient_privilege THEN ok := ok + 1; END;
  END LOOP;
  RAISE NOTICE 'OK anon % yönetim/iç fonksiyon çağrısının tamamı reddedildi', ok;
  PERFORM public.proc_public_rfq_get(gen_random_uuid(), false);
  RAISE NOTICE 'OK anon proc_public_rfq_get çağırabiliyor (geçersiz token → boş)';
END $$;
RESET ROLE;
SELECT 'TEST YETKİ TAMAM' AS sonuc;
