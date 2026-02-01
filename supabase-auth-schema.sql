-- =============================================
-- KULLANICI ROLLERI VE YETKİLENDİRME
-- =============================================

-- Kullanıcı profilleri tablosu
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Yeni kullanıcı kaydolduğunda otomatik profil oluştur
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE 
      WHEN (SELECT COUNT(*) FROM public.profiles) = 0 THEN 'admin'
      ELSE 'user'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Mevcut tablolara user_id ekle
ALTER TABLE sales_team ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE collections ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE targets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE crm_notes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE swot_analyses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- =============================================
-- ROW LEVEL SECURITY POLİTİKALARI
-- =============================================

-- Profiles RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Diğer tablolar için RLS (kullanıcı bazlı)
-- Sales Team
DROP POLICY IF EXISTS "Allow all access" ON sales_team;
ALTER TABLE sales_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own data" ON sales_team
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert own data" ON sales_team
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own data" ON sales_team
  FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can delete own data" ON sales_team
  FOR DELETE USING (user_id = auth.uid() OR user_id IS NULL);

-- Customers
DROP POLICY IF EXISTS "Allow all access" ON customers;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own customers" ON customers
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert customers" ON customers
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own customers" ON customers
  FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can delete own customers" ON customers
  FOR DELETE USING (user_id = auth.uid() OR user_id IS NULL);

-- Opportunities
DROP POLICY IF EXISTS "Allow all access" ON opportunities;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own opportunities" ON opportunities
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert opportunities" ON opportunities
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own opportunities" ON opportunities
  FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can delete own opportunities" ON opportunities
  FOR DELETE USING (user_id = auth.uid() OR user_id IS NULL);

-- Collections
DROP POLICY IF EXISTS "Allow all access" ON collections;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own collections" ON collections
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert collections" ON collections
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own collections" ON collections
  FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can delete own collections" ON collections
  FOR DELETE USING (user_id = auth.uid() OR user_id IS NULL);

-- Targets
DROP POLICY IF EXISTS "Allow all access" ON targets;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own targets" ON targets
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert targets" ON targets
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own targets" ON targets
  FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can delete own targets" ON targets
  FOR DELETE USING (user_id = auth.uid() OR user_id IS NULL);

-- CRM Activities
DROP POLICY IF EXISTS "Allow all access" ON crm_activities;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own activities" ON crm_activities
  FOR ALL USING (user_id = auth.uid() OR user_id IS NULL);

-- CRM Tasks
DROP POLICY IF EXISTS "Allow all access" ON crm_tasks;
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tasks" ON crm_tasks
  FOR ALL USING (user_id = auth.uid() OR user_id IS NULL);

-- CRM Notes
DROP POLICY IF EXISTS "Allow all access" ON crm_notes;
ALTER TABLE crm_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own notes" ON crm_notes
  FOR ALL USING (user_id = auth.uid() OR user_id IS NULL);

-- SWOT
DROP POLICY IF EXISTS "Allow all access" ON swot_analyses;
ALTER TABLE swot_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own swot" ON swot_analyses
  FOR ALL USING (user_id = auth.uid() OR user_id IS NULL);

