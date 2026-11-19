-- =====================================================================
-- Teklif özelleştirme: teklife özel kurum adı, ilgili kişi, adres, kabul eden,
-- imzalayan ve ticari koşullar. Müşteri kartını değiştirmez.
--   quotes.customer_title      Teklifte görünecek kurum adı / takma ad (boşsa müşteri unvanı)
--   quotes.attention_to        İlgili kişi (müşteri adının altında)
--   quotes.attention_title     İlgili kişinin görev tanımı
--   quotes.recipient_address   Bu teklifte müşteri adres / fatura bloğu (boşsa müşteri kartı)
--   quotes.standard_terms_override  Bu teklifin genel şartları (boşsa antetteki)
--   quotes.show_stamp          Kaşe + imza görselini teklife bas
--   quote_letterhead.bank_accounts  Birden fazla banka hesabı [{bank_name, branch, currency, iban}]
--   quote_letterhead.stamp_path     Kaşe + imza görseli
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
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS attention_title text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS recipient_address text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS standard_terms_override text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS show_stamp boolean NOT NULL DEFAULT false;

-- Antet: çoklu banka + kaşe-imza (mevcut tekli banka bilgisi listeye taşınır)
ALTER TABLE public.quote_letterhead ADD COLUMN IF NOT EXISTS bank_accounts jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.quote_letterhead ADD COLUMN IF NOT EXISTS stamp_path text;
UPDATE public.quote_letterhead
   SET bank_accounts = jsonb_build_array(jsonb_build_object('bank_name', COALESCE(bank_name, ''), 'iban', iban))
 WHERE bank_accounts = '[]'::jsonb AND COALESCE(iban, '') <> '';

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS quote_names text[] NOT NULL DEFAULT '{}';

-- Online teklif sayfası: yalnızca müşteriye gönderilmiş tekliflerin belge bilgileri
CREATE OR REPLACE FUNCTION public.public_quote_doc(p_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'customer_title', q.customer_title, 'attention_to', q.attention_to, 'attention_title', q.attention_title,
    'recipient_address', q.recipient_address, 'acceptor_title', q.acceptor_title,
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
