-- =============================================
-- SUPER ADMIN TANIMLAMA
-- Bu SQL'i demo-data.sql'den ÖNCE çalıştırın
-- =============================================

-- profiles tablosuna super_admin rolü ekle
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles 
ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('super_admin', 'admin', 'manager', 'user'));

-- Mevcut admin kullanıcınızı super_admin yap
-- (E-posta adresinizi güncelleyin)
UPDATE profiles 
SET role = 'super_admin' 
WHERE email = 'admin@vizioteknoloji.com';

-- Veya tüm mevcut adminleri super_admin yap
UPDATE profiles 
SET role = 'super_admin' 
WHERE role = 'admin';

-- =============================================
-- ROL AÇIKLAMALARI
-- =============================================
-- super_admin: Tüm yetkilere sahip (siz - Fuat)
-- admin: Satış Direktörü (ekip yönetimi, raporlar)
-- manager: Satış Müdürü (kendi ekibini görür)
-- user: Satış Uzmanı (sadece kendi verilerini görür)
