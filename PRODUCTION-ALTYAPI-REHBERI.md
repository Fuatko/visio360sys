# 🏗️ Satış Pro - Production Altyapı Rehberi

## 📋 İçindekiler
1. [100+ Kullanıcı Desteği](#100-kullanıcı-desteği)
2. [Farklı Lokasyonlardan Erişim](#farklı-lokasyonlardan-erişim)
3. [VISIO360 PDS ile Ortak Auth](#visio360-pds-ile-ortak-auth)
4. [Backup Stratejisi](#backup-stratejisi)
5. [Sistem Çökmeme Garantisi](#sistem-çökmeme-garantisi)
6. [Deployment Checklist](#deployment-checklist)

---

## 🚀 100+ Kullanıcı Desteği

### Supabase Plan Seçimi

| Plan | Bağlantı Limiti | MAU | Önerilen Kullanıcı |
|------|-----------------|-----|-------------------|
| Free | 50 | 50K | 0-10 |
| Pro ($25/ay) | 100 | 100K | 10-100 |
| Team ($599/ay) | 200 | Sınırsız | 100-500 |
| Enterprise | Özel | Sınırsız | 500+ |

**🎯 100+ kullanıcı için: Pro veya Team plan**

### Connection Pooling (KRİTİK!)

Supabase Dashboard > Settings > Database > Connection Pooling:

```
Pool Mode: Transaction (MUTLAKA!)
Pool Size: 25 (Pro için)
```

**Bağlantı String'i:**
```
# Pooler kullan (6543 portu)
postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# DİREKT KULLANMA! (5432 portu)
# postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.supabase.co:5432/postgres
```

### Vercel Scaling

```json
// vercel.json
{
  "functions": {
    "api/**/*": {
      "memory": 1024,
      "maxDuration": 30
    }
  },
  "regions": ["fra1", "iad1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}
```

### Rate Limiting

```typescript
// middleware.ts - API rate limiting
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const rateLimit = new Map<string, { count: number; timestamp: number }>();

export function middleware(request: NextRequest) {
  const ip = request.ip || 'unknown';
  const now = Date.now();
  const windowMs = 60000; // 1 dakika
  const maxRequests = 100;

  const current = rateLimit.get(ip);
  
  if (current) {
    if (now - current.timestamp > windowMs) {
      rateLimit.set(ip, { count: 1, timestamp: now });
    } else if (current.count >= maxRequests) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      );
    } else {
      current.count++;
    }
  } else {
    rateLimit.set(ip, { count: 1, timestamp: now });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
```

---

## 🌍 Farklı Lokasyonlardan Erişim

### Erişim Yöntemleri

```
┌─────────────────────────────────────────────────────────────┐
│                    KULLANICI ERİŞİMİ                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📱 Mobil (iOS/Android)     🌐 Web Browser                  │
│       ↓                          ↓                          │
│  Safari/Chrome              Chrome/Firefox/Edge             │
│       ↓                          ↓                          │
│       └──────────┬───────────────┘                          │
│                  ↓                                          │
│           Vercel Edge Network                               │
│           (Global CDN - 70+ PoP)                           │
│                  ↓                                          │
│    ┌─────────────┴─────────────┐                           │
│    ↓                           ↓                            │
│  Frankfurt (fra1)         Washington (iad1)                │
│  EU kullanıcılar          TR/US kullanıcılar               │
│                  ↓                                          │
│           Supabase (EU-Central)                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### URL Erişim Noktaları

| Ortam | URL | Kullanım |
|-------|-----|----------|
| Production | `https://satispro.vercel.app` | Ana domain |
| Custom Domain | `https://satis.sirketiniz.com` | Kurumsal |
| Preview | `https://satispro-*.vercel.app` | Test |

### Custom Domain Kurulumu

1. Vercel Dashboard > Project > Settings > Domains
2. Domain ekle: `satis.sirketiniz.com`
3. DNS ayarları:
```
CNAME satis.sirketiniz.com → cname.vercel-dns.com
```

### PWA (Progressive Web App) Desteği

```json
// public/manifest.json
{
  "name": "Satış Pro",
  "short_name": "SatışPro",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#4f46e5",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Mobil'de "Ana Ekrana Ekle" → Native app gibi çalışır!**

---

## 🔐 VISIO360 PDS ile Ortak Auth

### Seçenek 1: Aynı Supabase Projesi (ÖNERİLEN)

```
┌─────────────────────────────────────────┐
│         SUPABASE PROJESİ                │
│         (Ortak Auth)                    │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────┐      ┌──────────┐        │
│  │ VISIO360 │      │ Satış Pro│        │
│  │   PDS    │      │          │        │
│  └────┬─────┘      └────┬─────┘        │
│       │                 │              │
│       └────────┬────────┘              │
│                ↓                        │
│         auth.users                      │
│         (TEK TABLO)                     │
│                                         │
│  users tablosu:                         │
│  - email                                │
│  - organization_id                      │
│  - app_access: ['visio360', 'satispro']│
│                                         │
└─────────────────────────────────────────┘
```

**Kurulum:**

1. **VISIO360 PDS'in Supabase projesini kullan**
2. **Satış Pro'yu aynı projeye bağla:**

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://[VISIO360_PROJECT].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[VISIO360_ANON_KEY]
```

3. **Users tablosuna app_access kolonu ekle:**

```sql
-- VISIO360 PDS Supabase'inde çalıştır
ALTER TABLE users ADD COLUMN IF NOT EXISTS app_access TEXT[] DEFAULT ARRAY['visio360'];

-- Satış Pro erişimi ver
UPDATE users SET app_access = array_append(app_access, 'satispro')
WHERE email IN ('user1@company.com', 'user2@company.com');
```

4. **Satış Pro'da erişim kontrolü:**

```typescript
// src/lib/auth-context.tsx
const checkAppAccess = async (userId: string) => {
  const { data } = await supabase
    .from('users')
    .select('app_access')
    .eq('id', userId)
    .single();
  
  return data?.app_access?.includes('satispro') ?? false;
};
```

### Seçenek 2: Ayrı Projeler + SSO

```sql
-- Shared auth service
-- Her iki projede de aynı SMTP ayarları kullan
```

### E-posta Ayarları (SMTP)

Supabase Dashboard > Authentication > Email Templates:

```
SMTP Host: smtp.gmail.com (veya kurumsal)
SMTP Port: 587
SMTP User: noreply@sirketiniz.com
SMTP Pass: [App Password]
Sender Name: Satış Pro
Sender Email: noreply@sirketiniz.com
```

**Gmail için App Password oluştur:**
1. Google Account > Security > 2-Step Verification
2. App passwords > Generate
3. Supabase'e yapıştır

---

## 💾 Backup Stratejisi

### Otomatik Backup (Supabase)

| Plan | Backup Sıklığı | Saklama Süresi | PITR |
|------|----------------|----------------|------|
| Free | Yok | - | ❌ |
| Pro | Günlük | 7 gün | ❌ |
| Team | Günlük | 30 gün | ✅ |
| Enterprise | Özel | Özel | ✅ |

**PITR (Point-in-Time Recovery):** Team plan ile son 7 güne kadar herhangi bir ana dönebilirsiniz.

### Manuel Backup Script

```bash
#!/bin/bash
# backup.sh - Günlük çalıştır (cron)

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/satispro"
PROJECT_REF="your-project-ref"
DB_PASSWORD="your-db-password"

# PostgreSQL dump
PGPASSWORD=$DB_PASSWORD pg_dump \
  -h db.$PROJECT_REF.supabase.co \
  -U postgres \
  -d postgres \
  -F c \
  -f "$BACKUP_DIR/satispro_$DATE.dump"

# S3'e yükle (opsiyonel)
aws s3 cp "$BACKUP_DIR/satispro_$DATE.dump" \
  s3://your-backup-bucket/satispro/

# 30 günden eski backupları sil
find $BACKUP_DIR -name "*.dump" -mtime +30 -delete

echo "Backup completed: satispro_$DATE.dump"
```

### Supabase CLI ile Backup

```bash
# Supabase CLI kur
npm install -g supabase

# Login
supabase login

# Backup al
supabase db dump -f backup.sql --project-ref your-project-ref
```

### Kritik Tabloları Export

```sql
-- Export için view'lar (zaten oluşturuldu)
-- Supabase Dashboard > Table Editor > Export CSV

-- Önemli tablolar:
-- 1. commission_results (Prim verileri)
-- 2. collections (Tahsilat verileri)
-- 3. opportunities (Satış verileri)
-- 4. users (Kullanıcı bilgileri)
-- 5. audit_logs (Denetim izi)
```

---

## 🛡️ Sistem Çökmeme Garantisi

### 1. Database Optimizasyonları

```sql
-- Production'da çalıştır (production-infrastructure.sql)

-- Kritik indexler
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_results_lookup 
  ON commission_results(organization_id, period_year, period_month, rep_id);

-- Vacuum ve Analyze (haftalık)
VACUUM ANALYZE commission_results;
VACUUM ANALYZE collections;
VACUUM ANALYZE opportunities;
```

### 2. Vercel Edge Functions

```typescript
// next.config.ts
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    domains: ['your-supabase-project.supabase.co'],
  },
};
```

### 3. Error Boundary

```typescript
// src/components/ErrorBoundary.tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught:', error, errorInfo);
    // Hata loglama servisine gönder
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-8 text-center">
          <h2 className="text-xl font-bold text-red-600">Bir hata oluştu</h2>
          <p className="text-slate-600 mt-2">Lütfen sayfayı yenileyin.</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg"
          >
            Yenile
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 4. Health Check Endpoint

```typescript
// src/app/api/health/route.ts
import { createClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'unknown',
      auth: 'unknown',
    },
  };

  try {
    const supabase = createClient();
    
    // Database check
    const { error: dbError } = await supabase
      .from('organizations')
      .select('count')
      .limit(1);
    
    checks.services.database = dbError ? 'unhealthy' : 'healthy';
    
    // Auth check
    const { error: authError } = await supabase.auth.getSession();
    checks.services.auth = authError ? 'unhealthy' : 'healthy';
    
    // Overall status
    const allHealthy = Object.values(checks.services).every(s => s === 'healthy');
    checks.status = allHealthy ? 'healthy' : 'degraded';
    
  } catch (error) {
    checks.status = 'unhealthy';
  }

  return NextResponse.json(checks, {
    status: checks.status === 'healthy' ? 200 : 503,
  });
}
```

### 5. Uptime Monitoring

**Ücretsiz Servisler:**
- [UptimeRobot](https://uptimerobot.com) - 5 dakikada bir kontrol
- [Freshping](https://freshping.io) - 1 dakikada bir kontrol
- [Betterstack](https://betterstack.com) - Detaylı monitoring

**Kurulum:**
1. UptimeRobot'a kayıt ol
2. Monitor ekle: `https://satispro.vercel.app/api/health`
3. Alert ayarla: E-posta + SMS

---

## ✅ Deployment Checklist

### Pre-Deployment

- [ ] TypeScript hataları düzeltildi
- [ ] `.env.local` production değerleri ayarlandı
- [ ] Supabase RLS politikaları test edildi
- [ ] Connection Pooling etkinleştirildi
- [ ] SMTP ayarları yapılandırıldı

### Database

- [ ] `production-infrastructure.sql` çalıştırıldı
- [ ] Indexler oluşturuldu
- [ ] Demo verisi yüklendi (opsiyonel)
- [ ] Backup test edildi

### Vercel

- [ ] Environment variables ayarlandı
- [ ] Custom domain yapılandırıldı
- [ ] `vercel.json` eklendi

### Monitoring

- [ ] Health check endpoint çalışıyor
- [ ] UptimeRobot/Freshping kuruldu
- [ ] Error alerting ayarlandı

### Security

- [ ] Rate limiting aktif
- [ ] CORS ayarları doğru
- [ ] API keys güvenli

---

## 📊 Önerilen Mimari (100+ Kullanıcı)

```
┌─────────────────────────────────────────────────────────────────┐
│                        KULLANICILAR                             │
│                    (Türkiye + EU + Uzak)                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      VERCEL EDGE NETWORK                        │
│                   (CDN - 70+ Global PoP)                        │
│                                                                 │
│   Frankfurt ──── Amsterdam ──── London ──── Istanbul            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VERCEL SERVERLESS                            │
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │   fra1      │    │    iad1     │    │   Edge      │        │
│   │  (EU)       │    │   (US)      │    │  Functions  │        │
│   └─────────────┘    └─────────────┘    └─────────────┘        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (EU-Central)                        │
│                                                                 │
│   ┌─────────────────────────────────────────────────────┐      │
│   │              Connection Pooler (PgBouncer)          │      │
│   │              Mode: Transaction                       │      │
│   │              Pool Size: 25                          │      │
│   └───────────────────────┬─────────────────────────────┘      │
│                           │                                     │
│   ┌───────────────────────┼─────────────────────────────┐      │
│   │                       ▼                             │      │
│   │              PostgreSQL 15                          │      │
│   │              ┌─────────────┐                        │      │
│   │              │  VISIO360   │ ← Ortak Auth           │      │
│   │              │  + SatışPro │                        │      │
│   │              └─────────────┘                        │      │
│   │                                                     │      │
│   │   ┌─────────┐  ┌─────────┐  ┌─────────┐           │      │
│   │   │  Auth   │  │ Storage │  │Realtime │           │      │
│   │   └─────────┘  └─────────┘  └─────────┘           │      │
│   └─────────────────────────────────────────────────────┘      │
│                                                                 │
│   Backup: Daily + PITR (Team Plan)                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 💰 Maliyet Tahmini (100 Kullanıcı)

| Servis | Plan | Aylık Maliyet |
|--------|------|---------------|
| Vercel | Pro | $20 |
| Supabase | Pro | $25 |
| Custom Domain | - | $10/yıl |
| UptimeRobot | Free | $0 |
| **TOPLAM** | | **~$45/ay** |

---

## 🆘 Sorun Giderme

### "Too many connections"
```sql
-- Aktif bağlantıları kontrol et
SELECT count(*) FROM pg_stat_activity;

-- Uzun süren sorguları öldür
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE duration > interval '5 minutes';
```

### Yavaş sorgular
```sql
-- Yavaş sorguları bul
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### Disk dolması
```sql
-- Tablo boyutlarını kontrol et
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

---

## 📞 Acil Durum İletişim

| Durum | Aksiyon |
|-------|---------|
| Site erişilemiyor | Vercel Status: status.vercel.com |
| Database yavaş | Supabase Status: status.supabase.com |
| Auth çalışmıyor | Supabase Dashboard > Logs |
| Veri kaybı | Backup'tan restore |

---

*Son güncelleme: Ocak 2026*
