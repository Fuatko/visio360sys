# 🚀 SatışPro Kurulum Rehberi

## ADIM 1: Supabase Projesi Oluştur

1. **https://supabase.com** adresine git
2. "Start your project" veya "Sign In" tıkla
3. GitHub/Google ile giriş yap
4. "New Project" butonuna tıkla
5. Bilgileri doldur:
   - **Name**: satis-pro
   - **Database Password**: Güçlü bir şifre belirle (not al!)
   - **Region**: Frankfurt (eu-central-1) - Türkiye'ye yakın
6. "Create new project" tıkla
7. 2-3 dakika bekle (veritabanı hazırlanıyor)

---

## ADIM 2: Veritabanı Tablolarını Oluştur

1. Sol menüden **SQL Editor** tıkla
2. "New query" tıkla
3. `supabase-schema.sql` dosyasının içeriğini kopyala
4. Editöre yapıştır
5. **Run** (veya Ctrl+Enter) tıkla
6. "Success" mesajı görünmeli

---

## ADIM 3: API Bilgilerini Al

1. Sol menüden **Settings** (⚙️ dişli simgesi) tıkla
2. **API** sekmesine tıkla
3. Şu bilgileri kopyala:

```
Project URL: https://xxxxxxxx.supabase.co
              ↑ Bu URL'yi kopyala

anon public:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...
              ↑ Bu uzun key'i kopyala
```

---

## ADIM 4: Projeyi Bilgisayarına Kur

1. `satis-pro.zip` dosyasını aç
2. Klasöre gir
3. `.env.local` dosyasını bir metin editörü ile aç (Notepad, VS Code)
4. Şu satırları düzenle:

```
NEXT_PUBLIC_SUPABASE_URL=https://SENIN_PROJE_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=senin_anon_key_buraya
```

5. Dosyayı kaydet

---

## ADIM 5: Çalıştır (Lokal Test)

Komut satırı / Terminal aç:

```bash
cd satis-pro
npm install
npm run dev
```

Tarayıcıda aç: http://localhost:3000

---

## ADIM 6: Vercel'e Deploy Et

### Yöntem A: Vercel CLI (Komut Satırı)

```bash
npm install -g vercel
vercel
```

Sorulara cevap ver, deploy tamamlanır.

### Yöntem B: Vercel Web (Daha Kolay)

1. **https://vercel.com** git, GitHub ile giriş yap
2. Projeyi GitHub'a yükle:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/KULLANICI/satis-pro.git
   git push -u origin main
   ```
3. Vercel'de "Import Project" tıkla
4. GitHub reposunu seç
5. **Environment Variables** ekle:
   - `NEXT_PUBLIC_SUPABASE_URL` = senin URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = senin key
6. "Deploy" tıkla

---

## ✅ Tamamlandı!

Artık şu adresten erişebilirsin:
- Lokal: http://localhost:3000
- Vercel: https://satis-pro-xxx.vercel.app

---

## 🆘 Sorun mu var?

### "npm: command not found"
→ Node.js yükle: https://nodejs.org

### "Module not found"
→ `npm install` komutunu çalıştır

### Supabase bağlantı hatası
→ .env.local dosyasındaki bilgileri kontrol et
→ URL ve KEY doğru kopyalandı mı?

### Vercel build hatası
→ Environment Variables eklendi mi kontrol et
