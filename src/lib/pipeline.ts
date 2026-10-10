// Huni disiplini: tahmin kategorileri, kazanma/kayıp nedenleri, durgun fırsat kuralları
import { WON_STAGES, LOST_STAGES } from '@/lib/sales-flow';

export const FORECAST_CATEGORIES = [
  { value: 'commit', label: 'Kesin', hint: 'Bu dönem kapanacağına söz veriyorum', color: 'bg-green-600' },
  { value: 'best_case', label: 'En iyi durum', hint: 'İşler iyi giderse bu dönem kapanır', color: 'bg-blue-500' },
  { value: 'pipeline', label: 'Huni', hint: 'Henüz belirsiz', color: 'bg-slate-400' },
  { value: 'omitted', label: 'Tahmin dışı', hint: 'Bu dönem hesaba katma', color: 'bg-slate-200' },
] as const;
export const fcLabel = (v?: string | null) => FORECAST_CATEGORIES.find(f => f.value === v)?.label || 'Huni';

export const LOSS_REASONS = [
  'Fiyat yüksek bulundu', 'Rakip tercih edildi', 'Bütçe yok / ertelendi', 'İhtiyaç karşılanmadı (ürün uyumu)',
  'Karar verici ikna edilemedi', 'Zamanlama / proje iptal', 'Müşteri yanıt vermedi', 'Mevcut tedarikçide kaldı', 'Diğer',
];
export const WIN_REASONS = [
  'Ürün / çözüm uyumu', 'Fiyat / ticari koşullar', 'İlişki ve güven', 'Referans / tavsiye', 'Hız ve hizmet kalitesi',
  'Teknik üstünlük', 'Rakipten memnuniyetsizlik', 'Diğer',
];

export const isClosed = (stage: string) => WON_STAGES.includes(stage) || LOST_STAGES.includes(stage);
export const isWon = (stage: string) => WON_STAGES.includes(stage);
export const isLost = (stage: string) => LOST_STAGES.includes(stage);

const days = (from?: string | null) => from ? Math.floor((Date.now() - new Date(from).getTime()) / 864e5) : null;

// Durgunluk sinyalleri
export const STALE_RULES = { noActivityDays: 14, stageDays: 30 };
export function staleSignals(o: any, lastActivity?: string | null): string[] {
  if (isClosed(o.stage)) return [];
  const out: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  if (o.expected_close && String(o.expected_close).slice(0, 10) < today) out.push('Kapanış tarihi geçti');
  const sd = days(o.stage_changed_at);
  if (sd !== null && sd > STALE_RULES.stageDays) out.push(`${sd} gündür "${o.stage}" aşamasında`);
  // lastActivity: undefined = bilinmiyor (müşteri yok), null = hiç aktivite yok
  if (lastActivity !== undefined) {
    const ad = days(lastActivity);
    if (ad === null) out.push('Hiç aktivite girilmemiş');
    else if (ad > STALE_RULES.noActivityDays) out.push(`${ad} gündür aktivite yok`);
  }
  if (!o.expected_close) out.push('Kapanış tarihi yok');
  return out;
}
