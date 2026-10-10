// Müşteri sağlık skoru: alım sıklığı, alım trendi, ödeme, memnuniyet, şikâyet
import { orderNetAmount } from '@/lib/sales-flow';

const DAY = 864e5;
const n = (v: any) => Number(v) || 0;
const daysSince = (d?: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : null);

export const HEALTH_WEIGHTS = { recency: 25, trend: 25, payment: 20, satisfaction: 20, complaints: 10 };
export const HEALTH_LABELS: Record<string, string> = {
  recency: 'Son temas / alım', trend: 'Alım trendi', payment: 'Ödeme', satisfaction: 'Memnuniyet', complaints: 'Şikâyet',
};

export interface Health {
  score: number;
  level: 'healthy' | 'watch' | 'risk';
  parts: Record<string, number | null>;
  reasons: string[];
  revenue12m: number;
  lastNps: number | null;
}

export const LEVEL = {
  healthy: { label: 'Sağlıklı', cls: 'bg-green-100 text-green-800' },
  watch: { label: 'Dikkat', cls: 'bg-amber-100 text-amber-800' },
  risk: { label: 'Riskli', cls: 'bg-red-100 text-red-700' },
};

export function computeHealth(
  customerId: string,
  data: { orders: any[]; collections: any[]; activities: any[]; surveys: any[]; complaints: any[] },
): Health | null {
  const ords = data.orders.filter(o => o.customer_id === customerId && !['cancelled', 'İptal'].includes(o.status));
  const acts = data.activities.filter(a => a.customer_id === customerId);
  const now = Date.now();
  const dateOf = (o: any) => o.order_date || o.created_at;
  const lastOrder = ords.map(dateOf).filter(Boolean).sort().pop();
  const lastAct = acts.map(a => a.activity_date).filter(Boolean).sort().pop();
  if (!lastOrder && !lastAct) return null;   // hiç geçmişi yok: puanlanmaz

  const parts: Record<string, number | null> = {};
  const reasons: string[] = [];

  // Son temas / alım
  const last = [lastOrder, lastAct].filter(Boolean).sort().pop()!;
  const ds = daysSince(last)!;
  parts.recency = ds <= 30 ? 100 : ds <= 90 ? 70 : ds <= 180 ? 40 : 10;
  if (ds > 90) reasons.push(`${ds} gündür sipariş veya görüşme yok`);

  // Alım trendi: son 180 gün vs önceki 180 gün
  const sum = (from: number, to: number) => ords.filter(o => { const t = new Date(dateOf(o)).getTime(); return t >= from && t < to; }).reduce((s, o) => s + orderNetAmount(o), 0);
  const recent = sum(now - 180 * DAY, now + DAY), prior = sum(now - 360 * DAY, now - 180 * DAY);
  if (prior > 0) {
    const r = recent / prior;
    parts.trend = r >= 1.1 ? 100 : r >= 0.9 ? 75 : r >= 0.6 ? 45 : 15;
    if (r < 0.9) reasons.push(`Alımlar önceki döneme göre %${Math.round((1 - r) * 100)} düştü`);
  } else parts.trend = recent > 0 ? 90 : null;

  // Ödeme
  const open = data.collections.filter(c => c.customer_id === customerId && !['Ödendi', 'paid'].includes(c.status));
  const openSum = open.reduce((s, c) => s + n(c.amount), 0);
  const overdue = open.filter(c => c.due_date && new Date(c.due_date).getTime() < now).reduce((s, c) => s + n(c.amount), 0);
  parts.payment = openSum > 0 ? Math.max(0, 100 - overdue / openSum * 100) : (ords.length ? 100 : null);
  if (overdue > 0) reasons.push(`Vadesi geçmiş alacak ₺${Math.round(overdue).toLocaleString('tr-TR')}`);

  // Memnuniyet (son yanıtlanan anket)
  const sv = data.surveys.filter(s => s.customer_id === customerId && s.responded_at).sort((a, b) => b.responded_at.localeCompare(a.responded_at))[0];
  const lastNps = sv ? n(sv.nps) : null;
  parts.satisfaction = lastNps === null ? null : lastNps >= 9 ? 100 : lastNps >= 7 ? 65 : 20;
  if (lastNps !== null && lastNps <= 6) reasons.push(`Son memnuniyet puanı ${lastNps}/10`);

  // Şikâyet
  const openC = data.complaints.filter(c => c.customer_id === customerId && !['closed', 'rejected'].includes(c.status));
  parts.complaints = openC.length === 0 ? 100 : openC.some(c => ['high', 'critical'].includes(c.severity)) || openC.length > 1 ? 0 : 50;
  if (openC.length) reasons.push(`${openC.length} açık şikâyet`);

  let w = 0, s = 0;
  (Object.keys(HEALTH_WEIGHTS) as (keyof typeof HEALTH_WEIGHTS)[]).forEach(k => { if (parts[k] !== null && parts[k] !== undefined) { w += HEALTH_WEIGHTS[k]; s += (parts[k] as number) * HEALTH_WEIGHTS[k]; } });
  const score = w ? s / w : 0;
  const revenue12m = sum(now - 365 * DAY, now + DAY);
  return { score, level: score >= 70 ? 'healthy' : score >= 45 ? 'watch' : 'risk', parts, reasons, revenue12m, lastNps };
}

// NPS = %Destekçi (9-10) − %Kötüleyen (0-6)
export function npsOf(scores: number[]) {
  if (!scores.length) return null;
  const pro = scores.filter(s => s >= 9).length, det = scores.filter(s => s <= 6).length;
  return { nps: Math.round((pro - det) / scores.length * 100), promoters: pro, passives: scores.length - pro - det, detractors: det, total: scores.length };
}

export const COMPLAINT_STATUS: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  open: { label: 'Açık', variant: 'danger' },
  investigating: { label: 'Kök neden analizi', variant: 'warning' },
  action: { label: 'Düzeltici faaliyet', variant: 'info' },
  verification: { label: 'Etkinlik doğrulama', variant: 'info' },
  closed: { label: 'Kapandı', variant: 'success' },
  rejected: { label: 'Geçersiz', variant: 'default' },
};
export const SEVERITY: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'danger' }> = {
  low: { label: 'Düşük', variant: 'default' }, medium: { label: 'Orta', variant: 'info' }, high: { label: 'Yüksek', variant: 'warning' }, critical: { label: 'Kritik', variant: 'danger' },
};
export const COMPLAINT_CATEGORIES = ['Ürün kalitesi', 'Teslimat / gecikme', 'Fatura / fiyat', 'Hizmet / destek', 'İletişim', 'Sözleşme / taahhüt', 'Diğer'];
export const COMPLAINT_CHANNELS = ['Telefon', 'E-posta', 'Ziyaret', 'Memnuniyet anketi', 'Bayi portalı', 'Sosyal medya', 'Diğer'];
