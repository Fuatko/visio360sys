-- =====================================================
-- SATIŞ PRO - PRODUCTION ALTYAPI KONFİGÜRASYONU
-- 100+ Kullanıcı, Yüksek Erişilebilirlik, Backup
-- =====================================================

-- =====================================================
-- 1) PERFORMANS OPTİMİZASYONLARI
-- =====================================================

-- Kritik sorgular için composite indexler
CREATE INDEX IF NOT EXISTS idx_commission_results_lookup 
  ON commission_results(organization_id, period_year, period_month, rep_id);

CREATE INDEX IF NOT EXISTS idx_collections_lookup 
  ON collections(organization_id, customer_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_opportunities_lookup 
  ON opportunities(organization_id, sales_rep_id, stage, created_at);

CREATE INDEX IF NOT EXISTS idx_sales_targets_lookup 
  ON sales_targets(organization_id, rep_id, target_month);

CREATE INDEX IF NOT EXISTS idx_crm_activities_lookup 
  ON crm_activities(organization_id, customer_id, rep_id, activity_date);

CREATE INDEX IF NOT EXISTS idx_users_auth_lookup 
  ON users(email, organization_id, is_active);

-- Full-text search için (müşteri arama)
CREATE INDEX IF NOT EXISTS idx_customers_search 
  ON customers USING gin(to_tsvector('turkish', name || ' ' || COALESCE(email, '')));

-- =====================================================
-- 2) CONNECTION POOLING AYARLARI
-- Supabase Dashboard > Settings > Database > Connection Pooling
-- =====================================================
-- 
-- Önerilen ayarlar (100+ kullanıcı için):
-- 
-- Pool Mode: Transaction (önerilen)
-- Pool Size: 15-25 (Pro plan için)
-- 
-- Connection string formatı:
-- postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
--
-- NOT: Pooler bağlantısını kullanın, direkt bağlantı değil!

-- =====================================================
-- 3) RATE LIMITING (API Abuse önleme)
-- =====================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  ip_address INET,
  endpoint VARCHAR(255),
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup 
  ON rate_limits(user_id, endpoint, window_start);

-- Rate limit kontrolü fonksiyonu
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_endpoint VARCHAR,
  p_max_requests INTEGER DEFAULT 100,
  p_window_minutes INTEGER DEFAULT 1
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMP WITH TIME ZONE;
BEGIN
  v_window_start := NOW() - (p_window_minutes || ' minutes')::INTERVAL;
  
  SELECT COUNT(*) INTO v_count
  FROM rate_limits
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND window_start > v_window_start;
  
  IF v_count >= p_max_requests THEN
    RETURN FALSE; -- Rate limited
  END IF;
  
  INSERT INTO rate_limits (user_id, endpoint)
  VALUES (p_user_id, p_endpoint);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Eski rate limit kayıtlarını temizle (günlük)
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4) SESSION YÖNETİMİ (Çoklu Cihaz)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  session_token TEXT NOT NULL,
  device_info JSONB DEFAULT '{}',
  ip_address INET,
  location VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);

-- Aktif oturum sayısı limiti (kullanıcı başına max 5 cihaz)
CREATE OR REPLACE FUNCTION limit_user_sessions()
RETURNS TRIGGER AS $$
DECLARE
  v_session_count INTEGER;
  v_max_sessions INTEGER := 5;
BEGIN
  SELECT COUNT(*) INTO v_session_count
  FROM user_sessions
  WHERE user_id = NEW.user_id AND is_active = true;
  
  IF v_session_count >= v_max_sessions THEN
    -- En eski oturumu kapat
    UPDATE user_sessions
    SET is_active = false
    WHERE id = (
      SELECT id FROM user_sessions
      WHERE user_id = NEW.user_id AND is_active = true
      ORDER BY last_activity ASC
      LIMIT 1
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_limit_sessions ON user_sessions;
CREATE TRIGGER trigger_limit_sessions
  BEFORE INSERT ON user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION limit_user_sessions();

-- =====================================================
-- 5) BACKUP & RECOVERY
-- =====================================================

-- Manuel backup için export view'ları
CREATE OR REPLACE VIEW v_backup_organizations AS
SELECT * FROM organizations;

CREATE OR REPLACE VIEW v_backup_users AS
SELECT id, email, name, role, organization_id, is_active, created_at
FROM users;

CREATE OR REPLACE VIEW v_backup_customers AS
SELECT * FROM customers;

CREATE OR REPLACE VIEW v_backup_opportunities AS
SELECT * FROM opportunities;

CREATE OR REPLACE VIEW v_backup_collections AS
SELECT * FROM collections;

CREATE OR REPLACE VIEW v_backup_commission_results AS
SELECT * FROM commission_results;

-- Backup log tablosu
CREATE TABLE IF NOT EXISTS backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'manual'
  status VARCHAR(20) NOT NULL, -- 'started', 'completed', 'failed'
  tables_backed_up TEXT[],
  file_location TEXT,
  file_size_mb DECIMAL(10,2),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_by UUID REFERENCES users(id)
);

-- =====================================================
-- 6) HEALTH CHECK & MONITORING
-- =====================================================

CREATE TABLE IF NOT EXISTS system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type VARCHAR(50) NOT NULL, -- 'database', 'api', 'auth', 'storage'
  status VARCHAR(20) NOT NULL, -- 'healthy', 'degraded', 'down'
  response_time_ms INTEGER,
  details JSONB DEFAULT '{}',
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_health_time ON system_health(checked_at DESC);

-- Sistem metrikleri
CREATE TABLE IF NOT EXISTS system_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(15,4) NOT NULL,
  metric_unit VARCHAR(20),
  tags JSONB DEFAULT '{}',
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_lookup 
  ON system_metrics(metric_name, recorded_at DESC);

-- Aktif kullanıcı sayısı metriği
CREATE OR REPLACE FUNCTION record_active_users_metric()
RETURNS void AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT user_id) INTO v_count
  FROM user_sessions
  WHERE is_active = true
    AND last_activity > NOW() - INTERVAL '15 minutes';
  
  INSERT INTO system_metrics (metric_name, metric_value, metric_unit)
  VALUES ('active_users', v_count, 'count');
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7) ERROR LOGGING
-- =====================================================

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type VARCHAR(50) NOT NULL,
  error_code VARCHAR(20),
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  request_url TEXT,
  request_method VARCHAR(10),
  request_body JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_time ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type, created_at DESC);

-- =====================================================
-- 8) SCHEDULED JOBS (Supabase pg_cron ile)
-- =====================================================
-- 
-- Supabase Dashboard > Database > Extensions > pg_cron'u etkinleştir
-- 
-- Sonra bu job'ları ekle:

-- Her gece 03:00'te eski rate limit kayıtlarını temizle
-- SELECT cron.schedule('cleanup-rate-limits', '0 3 * * *', 'SELECT cleanup_rate_limits()');

-- Her 5 dakikada aktif kullanıcı sayısını kaydet
-- SELECT cron.schedule('record-active-users', '*/5 * * * *', 'SELECT record_active_users_metric()');

-- Her gece 04:00'te süresi geçmiş oturumları kapat
-- SELECT cron.schedule('cleanup-sessions', '0 4 * * *', $$
--   UPDATE user_sessions SET is_active = false WHERE expires_at < NOW()
-- $$);

-- =====================================================
-- 9) DATA RETENTION POLİCY
-- =====================================================

-- Audit logları 1 yıl sakla
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- System metrics 90 gün sakla
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
  DELETE FROM system_metrics WHERE recorded_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Error logs 30 gün sakla
CREATE OR REPLACE FUNCTION cleanup_old_error_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 10) REALTIME SUBSCRIPTIONS (Canlı Bildirimler)
-- =====================================================

-- Realtime için tabloları etkinleştir
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE user_sessions;

-- =====================================================
-- ÖZET: PRODUCTION CHECKLIST
-- =====================================================
-- 
-- ✅ Composite indexler oluşturuldu
-- ✅ Rate limiting sistemi kuruldu
-- ✅ Session yönetimi (çoklu cihaz) eklendi
-- ✅ Backup view'ları hazır
-- ✅ Health check tabloları oluşturuldu
-- ✅ Error logging sistemi kuruldu
-- ✅ Data retention policy tanımlandı
-- ✅ Realtime subscriptions etkinleştirildi
-- 
-- SUPABASE DASHBOARD'DA YAPILACAKLAR:
-- 1. Connection Pooling etkinleştir (Transaction mode)
-- 2. pg_cron extension'ı etkinleştir
-- 3. Scheduled job'ları ekle
-- 4. Point-in-time Recovery'yi etkinleştir
-- 5. Database backups'ı yapılandır
-- =====================================================
