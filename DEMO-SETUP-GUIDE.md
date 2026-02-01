# 🎯 Satış Pro - Demo Kurulum Rehberi

Bu rehber, tam kapsamlı demo ortamını kurmanız için adım adım talimatlar içerir.

## 📋 Ön Gereksinimler

1. Supabase projesi oluşturulmuş olmalı
2. Temel şemalar çalıştırılmış olmalı:
   - `supabase-schema.sql`
   - `multi-tenant-schema.sql`
   - `saved-views-schema.sql`

## 🚀 Kurulum Adımları

### Adım 1: Demo Verisini Yükle

Supabase SQL Editor'de çalıştır:
```sql
-- demo-data-comprehensive.sql içeriğini çalıştır
```

### Adım 2: Auth Kullanıcılarını Oluştur

Supabase Dashboard > Authentication > Users bölümünden veya SQL ile:

```sql
-- ÖNEMLİ: Bu işlem Supabase Auth API üzerinden yapılmalı
-- Aşağıdaki kullanıcıları manuel olarak ekleyin:

-- 1. Supabase Dashboard'a gidin
-- 2. Authentication > Users
-- 3. "Add User" ile her kullanıcıyı ekleyin
-- 4. E-posta ve şifre: Demo123!
```

### Demo Kullanıcı Listesi

| E-posta | Rol | Şifre | Açıklama |
|---------|-----|-------|----------|
| `ceo@demo.local` | CEO | Demo123! | Tüm şirketi görür |
| `sd@demo.local` | Sales Director | Demo123! | Tüm satış ekibini yönetir |
| `finance@demo.local` | Finance | Demo123! | Finans & prim onayları |
| `salesops@demo.local` | Sales Ops | Demo123! | KPI girişi & hesaplama |
| `manager.tr@demo.local` | Manager | Demo123! | TR takımı yöneticisi |
| `manager.eu@demo.local` | Manager | Demo123! | EU takımı yöneticisi |
| `ayse@demo.local` | Rep | Demo123! | ✅ Başarılı temsilci |
| `burak@demo.local` | Rep | Demo123! | Orta performans |
| `john@demo.local` | Rep | Demo123! | ⚠️ HARD STOP örneği |
| `maria@demo.local` | Rep | Demo123! | Normal performans |
| `mehmet@demo.local` | Account Manager | Demo123! | TR müşteri yöneticisi |
| `anna@demo.local` | Account Manager | Demo123! | EU müşteri yöneticisi |

### Adım 3: Users Tablosunu Auth ile Eşleştir

Auth'da kullanıcı oluşturduktan sonra, `users` tablosundaki ID'leri güncelleyin:

```sql
-- Auth'dan gelen user ID'lerini users tablosuna eşleştir
-- Örnek (auth.users'dan ID'leri alarak):

UPDATE users 
SET id = (SELECT id FROM auth.users WHERE email = 'ceo@demo.local')
WHERE email = 'ceo@demo.local';

UPDATE users 
SET id = (SELECT id FROM auth.users WHERE email = 'sd@demo.local')
WHERE email = 'sd@demo.local';

-- ... diğer kullanıcılar için de aynı işlem
```

**Alternatif: Toplu Güncelleme**
```sql
DO $$
DECLARE
  user_record RECORD;
  auth_id UUID;
BEGIN
  FOR user_record IN SELECT email FROM users WHERE email LIKE '%@demo.local' LOOP
    SELECT id INTO auth_id FROM auth.users WHERE email = user_record.email;
    IF auth_id IS NOT NULL THEN
      UPDATE users SET id = auth_id WHERE email = user_record.email;
    END IF;
  END LOOP;
END;
$$;
```

## 🎭 Demo Senaryoları

### Senaryo 1: CEO Görünümü
1. `ceo@demo.local` ile giriş yap
2. Dashboard'da tüm şirket performansını gör
3. Analytics > Commissions'da HARD STOP durumunu incele
4. Saved Views'dan "CEO-01 | Company Performance Overview" seç

### Senaryo 2: HARD STOP Örneği
1. `john@demo.local` ile giriş yap
2. Bildirimler'de HARD STOP uyarısını gör
3. Prim panelinde 0 TL kazanç durumunu incele
4. Collections'da %50 tahsilat oranını gör

### Senaryo 3: Başarılı Temsilci
1. `ayse@demo.local` ile giriş yap
2. Dashboard'da hedef aşımını (%120) gör
3. Prim panelinde 58K TL kazanç durumunu incele
4. Opportunities'de kazanılmış fırsatları gör

### Senaryo 4: Finans Onay Süreci
1. `finance@demo.local` ile giriş yap
2. Analytics > Commissions'a git
3. FIN-03 görünümünü seç (Prim Ödeme Listesi)
4. HARD STOP olan temsilciyi tespit et
5. Onay durumlarını incele

### Senaryo 5: Sales Ops KPI Girişi
1. `salesops@demo.local` ile giriş yap
2. Prim Yönetimi > KPI Inputs'a git
3. Eksik/hatalı girişleri kontrol et
4. Hesaplamayı çalıştır
5. Sonuçları incele ve onayla

### Senaryo 6: Account Manager Takibi
1. `mehmet@demo.local` ile giriş yap
2. "AM-02 | My Overdue Customers" görünümünü seç
3. Gamma Lojistik'in 275K vadesi geçmiş bakiyesini gör
4. Tasks'da tahsilat görevlerini takip et

## 📊 Demo Veri Özeti

| Veri Tipi | Adet | Not |
|-----------|------|-----|
| Kullanıcılar | 12 | 8 farklı rol |
| Müşteriler | 10 | 5 TR, 5 EU |
| Fırsatlar | 10 | 4 kazanılmış, 5 açık, 1 kaybedilmiş |
| Tahsilatlar | 9 | 2 vadesi geçmiş |
| KPI Inputs | 4 | Ocak 2026 |
| Prim Sonuçları | 4 | 1 HARD STOP |
| Aktiviteler | 10 | CRM aktiviteleri |
| Görevler | 6 | Farklı öncelikler |

## 🔑 Önemli Test Noktaları

### HARD STOP Mekanizması
- **John Smith**: Satış %133 (mükemmel), Tahsilat %50 (kritik düşük)
- Sonuç: Tüm prim = 0 TL (60K TL kaybetti)
- Threshold: %70 altı = HARD STOP

### Başarılı Performans
- **Ayşe Yılmaz**: Satış %120, Tahsilat %91.7
- Sonuç: 50K × 1.16 = 58K TL prim

### Riskli Müşteri
- **Gamma Lojistik**: 275K vadesi geçmiş (90+ gün)
- Status: "Riskli"
- Takip: Mehmet Aksoy (Account Manager)

## 🛠️ Sorun Giderme

### Users tablosu boş görünüyor
```sql
-- RLS politikalarını kontrol et
SELECT * FROM users; -- authenticated olarak
```

### Auth ID eşleşmiyor
```sql
-- Auth ve users tablosunu karşılaştır
SELECT 
  u.email as users_email, 
  u.id as users_id,
  a.id as auth_id
FROM users u
LEFT JOIN auth.users a ON u.email = a.email
WHERE u.email LIKE '%@demo.local';
```

### Demo verileri görünmüyor
```sql
-- Organization ID kontrolü
SELECT organization_id FROM sales_team LIMIT 1;
-- 'org_demo_001' olmalı
```

## 📞 Destek

Sorularınız için: [Destek kanalınız]
