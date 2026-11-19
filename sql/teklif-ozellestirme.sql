-- =====================================================================
-- Teklif özelleştirme: müşteri başlığı alanı
--   customer_title: teklifte görünecek özel müşteri adı.
--   Boş bırakılırsa müşteri kartındaki (customers.name / legal_name) kullanılır.
-- =====================================================================

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS customer_title text;

NOTIFY pgrst, 'reload schema';
SELECT 'teklif-ozellestirme uygulandı' AS durum;
