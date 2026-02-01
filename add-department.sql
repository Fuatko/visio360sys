-- =============================================
-- SALES_TEAM TABLOSUNA DEPARTMENT (BİRİM) EKLEME
-- =============================================

-- Birim sütunu ekle
ALTER TABLE sales_team ADD COLUMN IF NOT EXISTS department TEXT;

-- Mevcut verileri güncelle (örnek birimler)
UPDATE sales_team SET department = 'Kurumsal Satış' WHERE region IN ('İstanbul Anadolu', 'İstanbul Avrupa');
UPDATE sales_team SET department = 'KOBİ Satış' WHERE region IN ('Ankara', 'İzmir');
UPDATE sales_team SET department = 'Bölge Satış' WHERE region IN ('Bursa', 'Antalya');

-- Boş kalanları varsayılan birime ata
UPDATE sales_team SET department = 'Genel Satış' WHERE department IS NULL;

-- Kontrol
SELECT id, name, department, region FROM sales_team ORDER BY department, region;
