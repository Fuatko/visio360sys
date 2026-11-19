-- =====================================================================
-- Teklif özelleştirme: teklife özel hitap adı, dikkatine, kabul eden,
-- imzalayan ve ticari koşullar. Müşteri kartını değiştirmez.
--   quotes.customer_title      "Sayın" satırındaki ad / takma ad (boşsa müşteri unvanı)
--   quotes.attention_to        Dikkatine: yetkili kişi
--   quotes.acceptor_title      "Teklifi kabul eden" firma adı (boşsa customer_title)
--   quotes.signer_name/_title  Teklifi veren imzacı (boşsa antetteki imzacı)
--   quotes.delivery_terms      Teslim süresi / şekli
--   quotes.warranty_terms      Garanti
--   quotes.extra_terms         Bu teklife özel şartlar / opsiyon notu
--   quotes.hide_standard_terms Antetteki genel şartları bu teklifte gösterme
--   customers.quote_names      Müşterinin tekliflerde kullanılan alternatif adları
--   public_quote_doc(token)    Online teklif sayfası için (giriş gerektirmez)
-- Tekrar çalıştırılabilir.
-- =====================================================================

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS customer_title text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS attention_to text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS acceptor_title text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS signer_name text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS signer_title text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS delivery_terms text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS warranty_terms text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS extra_terms text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS hide_standard_terms boolean NOT NULL DEFAULT false;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS quote_names text[] NOT NULL DEFAULT '{}';

-- Online teklif sayfası: yalnızca müşteriye gönderilmiş tekliflerin belge bilgileri
CREATE OR REPLACE FUNCTION public.public_quote_doc(p_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'customer_title', q.customer_title, 'attention_to', q.attention_to, 'acceptor_title', q.acceptor_title,
    'signer_name', q.signer_name, 'signer_title', q.signer_title,
    'delivery_terms', q.delivery_terms, 'warranty_terms', q.warranty_terms, 'extra_terms', q.extra_terms,
    'hide_standard_terms', q.hide_standard_terms)
  FROM public.quotes q
  WHERE p_token IS NOT NULL AND q.share_token = p_token AND q.status NOT IN ('draft', 'reviewed');
$$;
REVOKE ALL ON FUNCTION public.public_quote_doc(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_quote_doc(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
SELECT 'Teklif özelleştirme alanları kuruldu' AS durum;
