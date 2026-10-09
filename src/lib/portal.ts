// Bayi portalı ve kanal yönetimi ortak tanımları

type V = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'secondary';
export type StatusMap = Record<string, { label: string; variant: V }>;

export const ORDER_STATUS: StatusMap = {
  pending: { label: 'Onay bekliyor', variant: 'warning' },
  confirmed: { label: 'Onaylandı', variant: 'info' },
  processing: { label: 'Hazırlanıyor', variant: 'primary' },
  shipped: { label: 'Kargoda', variant: 'primary' },
  delivered: { label: 'Teslim edildi', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'danger' },
};

export const INVOICE_STATUS: StatusMap = {
  issued: { label: 'Kesildi', variant: 'info' },
  partially_paid: { label: 'Kısmi ödendi', variant: 'warning' },
  paid: { label: 'Ödendi', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'danger' },
};

export const DEAL_STATUS: StatusMap = {
  submitted: { label: 'Onay bekliyor', variant: 'warning' },
  approved: { label: 'Onaylandı – korumada', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  won: { label: 'Kazanıldı', variant: 'primary' },
  lost: { label: 'Kaybedildi', variant: 'default' },
  expired: { label: 'Süresi doldu', variant: 'default' },
  withdrawn: { label: 'Geri çekildi', variant: 'default' },
};

export const MDF_STATUS: StatusMap = {
  submitted: { label: 'Onay bekliyor', variant: 'warning' },
  approved: { label: 'Onaylandı', variant: 'info' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  claimed: { label: 'Harcama bildirildi', variant: 'primary' },
  paid: { label: 'Ödendi', variant: 'success' },
};
// Dönem bütçesinden kullanılan tutar (onaylanan, harcaması bildirilen ve ödenen)
export const mdfUsed = (reqs: any[], period: string) => reqs.filter(r => r.period === period && ['approved', 'claimed', 'paid'].includes(r.status))
  .reduce((s, r) => s + (Number(r.status === 'approved' ? r.approved_amount : (r.claim_amount ?? r.approved_amount)) || 0), 0);
export const MDF_ACTIVITIES = ['Fuar / Etkinlik', 'Dijital reklam', 'Basılı materyal', 'Mağaza görselliği / tabela', 'Bayi eğitimi / lansman', 'Sponsorluk', 'Diğer'];

export const TICKET_TYPE: Record<string, string> = {
  warranty: 'Garanti / Arıza',
  return: 'İade',
  support: 'Teknik destek',
  price: 'Fiyat / Özel fiyat talebi',
  other: 'Diğer',
};
export const TICKET_STATUS: StatusMap = {
  open: { label: 'Açık', variant: 'warning' },
  in_progress: { label: 'İşlemde', variant: 'info' },
  waiting_dealer: { label: 'Sizden bilgi bekleniyor', variant: 'primary' },
  resolved: { label: 'Çözüldü', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  closed: { label: 'Kapandı', variant: 'default' },
};
export const RESOLUTION_TYPE: Record<string, string> = {
  replace: 'Ürün değişimi',
  repair: 'Onarım',
  credit: 'Cariye alacak (iade faturası)',
  refund: 'Para iadesi',
  reject: 'Garanti dışı / ret',
  info: 'Bilgilendirme',
};
export const PRIORITY: StatusMap = {
  low: { label: 'Düşük', variant: 'default' },
  normal: { label: 'Normal', variant: 'info' },
  high: { label: 'Yüksek', variant: 'danger' },
};

export const LEAD_STATUS: StatusMap = {
  assigned: { label: 'Yanıt bekliyor', variant: 'warning' },
  accepted: { label: 'Kabul edildi', variant: 'info' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  contacted: { label: 'Görüşüldü', variant: 'primary' },
  won: { label: 'Kazanıldı', variant: 'success' },
  lost: { label: 'Kaybedildi', variant: 'default' },
  expired: { label: 'Süresi geçti', variant: 'default' },
};

export const PAYMENT_NOTICE_STATUS: StatusMap = {
  submitted: { label: 'Kontrol ediliyor', variant: 'warning' },
  confirmed: { label: 'Onaylandı', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
};
export const PAYMENT_METHODS = ['Havale/EFT', 'Kredi Kartı', 'Çek', 'Senet', 'Nakit'];

export const REBATE_PAYOUT_STATUS: StatusMap = {
  accrued: { label: 'Tahakkuk', variant: 'warning' },
  approved: { label: 'Onaylandı', variant: 'info' },
  paid: { label: 'Ödendi / mahsup edildi', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'danger' },
};

export const ANNOUNCEMENT_CATEGORIES = ['Duyuru', 'Kampanya', 'Fiyat Değişikliği', 'Doküman', 'Teknik Bülten', 'Eğitim'];

export const st = (map: StatusMap, key: string) => map[key] || { label: key, variant: 'default' as V };

export const n = (v: any) => Number(v) || 0;
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const addDaysStr = (d: string, days: number) => {
  const x = new Date(d + 'T00:00:00');
  x.setDate(x.getDate() + days);
  return x.toISOString().slice(0, 10);
};

// ---- Dosya yükleme (Supabase Storage: portal-files/<bayi_id>/...) ----
export const STORAGE_PREFIX = 'storage:';
const BUCKET = 'portal-files';

export async function uploadPortalFile(supabase: any, dealerId: string, file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Dosya 10 MB\'dan büyük olamaz.');
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const path = `${dealerId}/${Date.now()}_${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw new Error('Dosya yüklenemedi: ' + error.message);
  return STORAGE_PREFIX + path;
}

export async function openPortalFile(supabase: any, value: string) {
  if (!value) return;
  if (!value.startsWith(STORAGE_PREFIX)) { window.open(value, '_blank', 'noopener'); return; }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(value.slice(STORAGE_PREFIX.length), 300);
  if (error || !data?.signedUrl) { alert('Dosya açılamadı: ' + (error?.message || '')); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

export const fileLabel = (value: string) =>
  value.startsWith(STORAGE_PREFIX) ? value.split('/').pop()?.replace(/^\d+_/, '') || 'Dosya' : 'Bağlantı';
