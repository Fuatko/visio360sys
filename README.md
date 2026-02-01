# SatışPro - Kurumsal Satış Yönetim Sistemi

Modern, hızlı ve güvenli Next.js + Supabase + Vercel tabanlı satış yönetim sistemi.

## 🚀 Özellikler

- **Dashboard**: Genel bakış, KPI'lar, grafikler
- **Satış Ekibi**: Ekip yönetimi (CRUD)
- **Müşteriler**: Müşteri veritabanı
- **CRM**: Aktiviteler, görevler, notlar
- **Fırsatlar**: Satış pipeline yönetimi
- **Tahsilat**: Tahsilat takibi
- **Hedef Yönetimi**: Satış ve tahsilat hedefleri
- **Prim Yönetimi**: Kademeli prim sistemi
- **Performans**: Performans raporları
- **SWOT Analizi**: Kişisel SWOT analizleri
- **Raporlar**: Detaylı raporlar ve Excel export
- **AI Asistan**: Yapay zeka destekli öneriler

## 📦 Teknolojiler

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Hosting**: Vercel
- **Icons**: Lucide React
- **Charts**: Recharts

## 🛠 Kurulum

### 1. Supabase Projesi Oluştur

1. [supabase.com](https://supabase.com) adresine git
2. Yeni proje oluştur
3. SQL Editor'e git
4. `supabase-schema.sql` dosyasındaki SQL'i çalıştır

### 2. Ortam Değişkenlerini Ayarla

`.env.local.example` dosyasını `.env.local` olarak kopyala ve düzenle:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR...
```

### 3. Bağımlılıkları Kur ve Çalıştır

```bash
npm install
npm run dev
```

## 🌐 Vercel'e Deploy

1. Projeyi GitHub'a push et
2. vercel.com'da "Import Project"
3. Environment Variables ekle
4. Deploy!

## 📞 Destek

MFK Danışmanlık - © 2024
