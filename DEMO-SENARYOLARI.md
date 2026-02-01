# 🎯 Satış Pro - Demo Sunum Senaryoları

## 📅 6 Aylık Veri Hikayesi (2025-08 → 2026-01)

| Ay | Hikaye | Satış | Tahsilat | John Durumu |
|----|--------|-------|----------|-------------|
| **Ağustos 2025** | Sağlıklı başlangıç | Normal | %95 | ✅ İyi |
| **Eylül 2025** | Büyüme | Artıyor | %90 | ✅ İyi |
| **Ekim 2025** | Zirve + İlk uyarılar | Rekor | %80 | ⚠️ Uyarı |
| **Kasım 2025** | Risk oluşuyor | Yüksek | %60 | 🔴 HARD STOP |
| **Aralık 2025** | Yıl sonu krizi | Çok yüksek | %55 | 🔴 HARD STOP |
| **Ocak 2026** | Sistem devrede | Rekor | %50 | 🔴 HARD STOP |

---

## 🎬 Demo Sunum Akışı (5-7 Dakika)

### 🎯 Sahne 1: CEO Görünümü (1.5 dk)

**Giriş:** `ceo@demo.local` ile giriş yap

**Göster:**
1. Dashboard'a git
2. Son 6 aylık trend grafiğini göster
3. "CEO-01 | Company Performance Overview" görünümünü seç

**KPI'lar:**
- 📈 **Bookings:** Ağustos'tan Ocak'a sürekli ARTIŞ
- 📉 **Collections Ratio:** %95 → %50 DÜŞÜŞ
- 🔴 **Hard Stop Rate:** Kasım'dan itibaren ARTIŞ

**Sunum Cümlesi:**
> *"Bakın, satışlar harika görünüyor - her ay rekor. Ama nakit akışı bozulmuş. Geleneksel Excel raporlarında bunu fark etmek 3 ay alırdı. Sistem Kasım'da uyarı veriyor, Ocak'ta artık HARD STOP devrede."*

---

### 🎯 Sahne 2: Sales Director - Takım Ligi (1 dk)

**Geçiş:** `sd@demo.local` ile giriş yap (veya kurum değiştir)

**Göster:**
1. Analytics > Satış Analitik
2. "SD-01 | Team Performance League" görünümünü seç
3. Ayşe vs John karşılaştırması

**Karşılaştırma Tablosu:**

| Temsilci | Satış | Tahsilat | Prim | Durum |
|----------|-------|----------|------|-------|
| Ayşe | %120 | %92 | 58K ✅ | Yıldız |
| John | %133 | %50 | 0 ❌ | HARD STOP |

**Sunum Cümlesi:**
> *"Eskiden John kahramandı - satış şampiyonu. Excel'de sadece satış rakamlarını görürdük. Şimdi sistem gerçeği gösteriyor: Satış iyi ama nakit nerede?"*

---

### 🎯 Sahne 3: Finance - Aging & Payout (1 dk)

**Geçiş:** `finance@demo.local` ile giriş yap

**Göster:**
1. Analytics > Tahsilat Analitik
2. "FIN-02 | Aging Analysis" görünümünü seç
3. Kasım-Aralık döneminde şişen aging
4. "FIN-03 | Commission Payout List" ile Ocak ödemelerini göster

**Aging Dağılımı (Ocak 2026):**
| Bucket | Tutar | Oran |
|--------|-------|------|
| 0-30 gün | 450K | 35% |
| 31-60 gün | 320K | 25% |
| 61-90 gün | 280K | 22% |
| **90+ gün** | **230K** | **18%** |

**Sunum Cümlesi:**
> *"Finans artık satışla kavga etmiyor. Sistem konuşuyor. John'un 60K baz primi var ama tahsilat %50. Payout listesinde 0 TL yazıyor - tartışılacak bir şey yok."*

---

### 🎯 Sahne 4: Account Manager - Riskli Müşteriler (1 dk)

**Geçiş:** `mehmet@demo.local` ile giriş yap

**Göster:**
1. Analytics > Müşteri Takip
2. "AM-02 | My Overdue Customers" görünümünü seç
3. Nordic Retail'in 2 aydır overdue olduğunu göster
4. Follow-up task'larını göster

**Riskli Müşteri Özeti:**
| Müşteri | Vadesi Geçmiş | Gün | Son İletişim |
|---------|--------------|-----|--------------|
| Nordic Retail | €600K | 75 gün | 10 gün önce |
| Gamma Lojistik | ₺275K | 90 gün | 5 gün önce |

**Sunum Cümlesi:**
> *"Risk satıştan ÖNCE görülüyor, sonra değil. Nordic Retail Ekim'de sorun vermeye başladı. Sistem bunu AM'e gösterdi. Satış kapandıktan sonra 'sürpriz' yok."*

---

### 🎯 Sahne 5: Commission Drill-down (1.5 dk)

**Geçiş:** `salesops@demo.local` ile giriş yap

**Göster:**
1. Prim Yönetimi (Bonus) sayfasına git
2. Sonuçlar tabına geç
3. Ayşe'nin satırına tıkla → detay drawer aç

**Ayşe Drill-down:**
```
Satış Hedefi: ₺1,000,000
Gerçekleşen: ₺1,200,000 (120%)
Sales Score: 1.4

Faturalanan: ₺1,200,000
Tahsil Edilen: ₺1,100,000 (91.7%)
Collections Score: 0.8

Çarpan: (1.4 × 0.6) + (0.8 × 0.4) = 1.16
Baz Prim: ₺50,000
Kazanılan: ₺50,000 × 1.16 = ₺58,000 ✅
```

4. John'un satırına tıkla → detay drawer aç

**John Drill-down:**
```
Satış Hedefi: €600,000
Gerçekleşen: €800,000 (133%) ⭐ REKOR!
Sales Score: 1.4

Faturalanan: €800,000
Tahsil Edilen: €400,000 (50%) ❌ KRİTİK!
Collections Score: 0.0

🔴 HARD STOP: Tahsilat < %70
Çarpan: 0 (HARD STOP override)
Baz Prim: €60,000
Kazanılan: €0 ❌
```

**Sunum Cümlesi:**
> *"Prim tartışması değil, VERİ konuşuyor. John satışta şampiyon ama sistem diyor ki: 'Önce parayı topla.' Audit snapshot'ta her hesaplama kaydediliyor - KVKK uyumlu, tartışmasız."*

---

### 🎯 Kapanış (30 sn)

**Özet Göster:**
- 📊 **30+ Modül** - Tam entegre CRM + Prim sistemi
- 🔐 **Multi-Tenant** - KVKK uyumlu veri izolasyonu
- 👁️ **18 Hazır Görünüm** - Her role özel dashboard
- ⚡ **HARD STOP** - Otomatik risk yönetimi
- 📈 **6 Aylık Trend** - Geçmişi analiz, geleceği öngör

**Kapanış Cümlesi:**
> *"Satış Pro ile satış büyürken nakit kontrolden çıkmıyor. Sistem riski erken görüyor, harekete geçiriyor. Excel'den SaaS'a geçiş: Veri konuşuyor, kavga bitiyor."*

---

## 🔑 Demo Giriş Bilgileri

| E-posta | Rol | Şifre | Ne Gösterir? |
|---------|-----|-------|--------------|
| `ceo@demo.local` | CEO | Demo123! | Şirket özeti, trend |
| `sd@demo.local` | Sales Director | Demo123! | Takım performansı |
| `finance@demo.local` | Finance | Demo123! | Aging, payout |
| `salesops@demo.local` | Sales Ops | Demo123! | KPI, hesaplama |
| `mehmet@demo.local` | Account Manager | Demo123! | Riskli müşteriler |
| `ayse@demo.local` | Rep (Başarılı) | Demo123! | İyi performans |
| `john@demo.local` | Rep (HARD STOP) | Demo123! | Sorunlu durum |

---

## 📊 Demo Veri Özeti

| Metrik | Değer |
|--------|-------|
| Zaman aralığı | 6 ay (2025-08 → 2026-01) |
| Kullanıcılar | 12 (8 farklı rol) |
| Müşteriler | 10 |
| Prim sonuçları | 24 (6 ay × 4 rep) |
| HARD STOP vakası | 3 (Kasım, Aralık, Ocak - John) |
| Tahsilatlar | 15+ fatura |
| Fırsatlar | 16+ |

---

## 💡 Demo İpuçları

1. **CEO görünümüyle başla** - Büyük resmi göster
2. **Trend grafiğine odaklan** - Satış ↑ ama Nakit ↓
3. **John hikayesini anlat** - Kahramandan HARD STOP'a
4. **Drill-down göster** - Şeffaf hesaplama
5. **"Sistem konuşuyor" mesajını ver** - Kavga bitiyor

---

## 🚀 Hızlı Demo Checklist

- [ ] Tüm SQL'ler çalıştırıldı mı?
- [ ] Auth kullanıcıları oluşturuldu mu?
- [ ] CEO-01 görünümü aktif mi?
- [ ] 6 aylık trend verileri görünüyor mu?
- [ ] John'un HARD STOP'u gösteriliyor mu?
- [ ] Drill-down çalışıyor mu?

---

## 📁 SQL Çalıştırma Sırası

```bash
# 1. Temel şema
supabase-schema.sql

# 2. Multi-tenant
multi-tenant-schema.sql

# 3. Saved Views
saved-views-schema.sql

# 4. Temel demo verisi
demo-data-comprehensive.sql

# 5. 6 aylık trend
demo-data-6month-trend.sql
```
