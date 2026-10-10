// Ana firmalar (bayisi / iş ortağı olduğumuz firmalar), satın alma ve kârlılık tanımları

export const SUPPLIER_MODELS: Record<string, { label: string; hint: string }> = {
  reseller: { label: 'Bayi (al-sat)', hint: 'Ana firmadan alıp son kullanıcıya biz faturalarız' },
  agent: { label: 'İş ortağı / acente', hint: 'Ana firma faturalar, biz komisyon alırız' },
  service: { label: 'Yetkili servis', hint: 'Parça/işçilik; garanti işleri ana firmaya fatura edilir' },
  mixed: { label: 'Karma', hint: 'Duruma göre al-sat, komisyon ve servis' },
  vendor: { label: 'Tedarikçi', hint: 'Sadece mal/hizmet aldığımız firma' },
};

// Fırsatın satış modeli
export const SALES_MODELS: Record<string, string> = {
  own: 'Kendi ürünüm / hizmetim',
  resale: 'Ana firma ürünü (al-sat)',
  agent: 'Ana firma adına aracılık (komisyon)',
  service: 'Yetkili servis işi',
};

export const REG_STATUS: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' | 'default' }> = {
  pending: { label: 'Kayıt onay bekliyor', variant: 'warning' },
  approved: { label: 'Kayıt onaylı', variant: 'success' },
  rejected: { label: 'Kayıt reddedildi', variant: 'danger' },
};

export const RECEIVABLE_KINDS: Record<string, string> = {
  rebate: 'Ciro primi / hedef primi',
  commission: 'Aracılık komisyonu',
  warranty: 'Garanti işçilik / parça geri talebi',
  mdf: 'Pazarlama desteği (MDF)',
  other: 'Diğer',
};
export const RECEIVABLE_STATUS: Record<string, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' }> = {
  expected: { label: 'Beklenen', variant: 'warning' },
  invoiced: { label: 'Faturalandı', variant: 'info' },
  paid: { label: 'Tahsil edildi', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
};

export const PO_STATUS: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' | 'primary' }> = {
  draft: { label: 'Taslak', variant: 'default' },
  sent: { label: 'Ana firmaya gönderildi', variant: 'info' },
  confirmed: { label: 'Onaylandı', variant: 'primary' },
  received: { label: 'Teslim alındı', variant: 'warning' },
  invoiced: { label: 'Alış faturası geldi', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'danger' },
};

export const EXPENSE_CATEGORIES = [
  'Personel (maaş, SGK)', 'Kira ve aidat', 'Elektrik, su, doğalgaz, internet', 'Yakıt ve ulaşım', 'Seyahat ve konaklama',
  'Pazarlama ve reklam', 'Yazılım ve abonelikler', 'Danışmanlık ve hukuk', 'Muhasebe', 'Banka ve finansman giderleri',
  'Vergi, resim ve harçlar', 'Kırtasiye ve ofis', 'Temsil ve ağırlama', 'Kargo ve lojistik', 'Bakım ve onarım', 'Diğer',
];

export const n = (v: any) => Number(v) || 0;
