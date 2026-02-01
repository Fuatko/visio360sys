-- =============================================
-- SADECE RLS POLİCY DÜZELTMESİ
-- Bu SQL mevcut tabloları bozmadan sadece izinleri düzeltir
-- =============================================

-- Mevcut policy'leri temizle
DROP POLICY IF EXISTS "Allow all access" ON sales_team;
DROP POLICY IF EXISTS "Allow all access" ON customers;
DROP POLICY IF EXISTS "Allow all access" ON opportunities;
DROP POLICY IF EXISTS "Allow all access" ON collections;
DROP POLICY IF EXISTS "Allow all access" ON targets;
DROP POLICY IF EXISTS "Allow all access" ON bonus_tiers_sales;
DROP POLICY IF EXISTS "Allow all access" ON bonus_tiers_collection;
DROP POLICY IF EXISTS "Allow all access" ON fixed_bonuses;
DROP POLICY IF EXISTS "Allow all access" ON crm_activities;
DROP POLICY IF EXISTS "Allow all access" ON crm_tasks;
DROP POLICY IF EXISTS "Allow all access" ON crm_notes;
DROP POLICY IF EXISTS "Allow all access" ON swot_analyses;

DROP POLICY IF EXISTS "Allow read access" ON sales_team;
DROP POLICY IF EXISTS "Allow read access" ON customers;
DROP POLICY IF EXISTS "Allow read access" ON opportunities;
DROP POLICY IF EXISTS "Allow read access" ON collections;
DROP POLICY IF EXISTS "Allow read access" ON targets;
DROP POLICY IF EXISTS "Allow read access" ON bonus_tiers_sales;
DROP POLICY IF EXISTS "Allow read access" ON bonus_tiers_collection;
DROP POLICY IF EXISTS "Allow read access" ON fixed_bonuses;
DROP POLICY IF EXISTS "Allow read access" ON crm_activities;
DROP POLICY IF EXISTS "Allow read access" ON crm_tasks;
DROP POLICY IF EXISTS "Allow read access" ON crm_notes;
DROP POLICY IF EXISTS "Allow read access" ON swot_analyses;

DROP POLICY IF EXISTS "Allow write access" ON sales_team;
DROP POLICY IF EXISTS "Allow write access" ON customers;
DROP POLICY IF EXISTS "Allow write access" ON opportunities;
DROP POLICY IF EXISTS "Allow write access" ON collections;
DROP POLICY IF EXISTS "Allow write access" ON targets;
DROP POLICY IF EXISTS "Allow write access" ON bonus_tiers_sales;
DROP POLICY IF EXISTS "Allow write access" ON bonus_tiers_collection;
DROP POLICY IF EXISTS "Allow write access" ON fixed_bonuses;
DROP POLICY IF EXISTS "Allow write access" ON crm_activities;
DROP POLICY IF EXISTS "Allow write access" ON crm_tasks;
DROP POLICY IF EXISTS "Allow write access" ON crm_notes;
DROP POLICY IF EXISTS "Allow write access" ON swot_analyses;

-- HERKES İÇİN TAM ERİŞİM (anon dahil)
CREATE POLICY "Allow all access" ON sales_team FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON opportunities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON collections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON targets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON bonus_tiers_sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON bonus_tiers_collection FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON fixed_bonuses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON crm_activities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON crm_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON crm_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON swot_analyses FOR ALL USING (true) WITH CHECK (true);
