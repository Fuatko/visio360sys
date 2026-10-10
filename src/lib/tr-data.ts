// Türkiye sabit listeleri: 81 il ve sektörler

export const ILLER = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın',
  'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa',
  'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir',
  'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir',
  'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kilis', 'Kocaeli', 'Konya', 'Kütahya',
  'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye',
  'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Şanlıurfa', 'Şırnak',
  'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak',
];

export const SEKTORLER = [
  'Otomotiv ve Yan Sanayi', 'Makine ve Ekipman', 'Metal ve Demir-Çelik', 'Elektrik-Elektronik', 'Enerji ve Yenilenebilir Enerji',
  'Kimya ve Plastik', 'İlaç ve Medikal', 'Sağlık Hizmetleri', 'Gıda ve İçecek', 'Tarım ve Hayvancılık',
  'Tekstil ve Hazır Giyim', 'Deri ve Ayakkabı', 'Mobilya ve Orman Ürünleri', 'Kâğıt ve Ambalaj', 'Cam, Seramik ve Çimento',
  'İnşaat ve Gayrimenkul', 'Yapı Malzemeleri', 'Lojistik ve Taşımacılık', 'Denizcilik', 'Havacılık ve Savunma',
  'Perakende', 'Toptan Ticaret ve Distribütörlük', 'E-ticaret', 'Bilişim ve Yazılım', 'Telekomünikasyon',
  'Finans ve Bankacılık', 'Sigorta', 'Holding', 'Turizm ve Otelcilik', 'Yiyecek-İçecek Hizmetleri (Restoran, Catering)',
  'Eğitim', 'Medya ve Reklam', 'Danışmanlık ve Profesyonel Hizmetler', 'Kamu ve Belediye', 'Sivil Toplum / Vakıf',
  'Madencilik', 'Kozmetik ve Kişisel Bakım', 'Beyaz Eşya ve Dayanıklı Tüketim', 'Akü ve Batarya', 'Diğer',
];

// Eski kayıtlardaki kısa sektör adları da seçilebilsin
export const sectorOptions = (current?: string | null) => {
  const list = [...SEKTORLER];
  if (current && !list.includes(current)) list.unshift(current);
  return list;
};
