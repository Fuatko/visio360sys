-- =============================================
-- SALES_TEAM TABLOSUNA PHOTO_URL SÜTUNU EKLEME
-- =============================================

-- Photo URL sütunu ekle
ALTER TABLE sales_team ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Kontrol
SELECT id, name, photo_url, region FROM sales_team LIMIT 5;
