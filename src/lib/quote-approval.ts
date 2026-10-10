// Teklif onay kuralları: toplam iskonto, brüt marj ve tutar sınırı

export interface QuotePolicy { max_discount_pct: number | null; min_margin_pct: number | null; max_total_without_approval: number | null }
export const DEFAULT_POLICY: QuotePolicy = { max_discount_pct: 15, min_margin_pct: 20, max_total_without_approval: null };

const n = (v: any) => Number(v) || 0;

export interface QuoteEvaluation {
  listTotal: number;          // iskontosuz satır toplamı (KDV hariç)
  netTotal: number;           // tüm iskontolar sonrası (KDV hariç)
  effectiveDiscount: number;  // %
  costTotal: number | null;   // maliyeti bilinen kalemlerin maliyeti
  marginPct: number | null;   // brüt marj % (maliyeti bilinmeyen kalem varsa null)
  missingCost: number;        // maliyeti girilmemiş kalem sayısı
  reasons: string[];          // onay gerektiren nedenler
}

export function evaluateQuote(
  items: { product_id?: string | null; quantity: any; unit_price: any; discount?: any }[],
  generalDiscountPct: any,
  products: { id: string; cost_price?: any }[],
  total: any,
  policy: QuotePolicy | null,
): QuoteEvaluation {
  const p = policy || DEFAULT_POLICY;
  const gd = Math.min(Math.max(n(generalDiscountPct), 0), 100) / 100;
  let listTotal = 0, lineNet = 0, cost = 0, missing = 0;
  items.forEach(i => {
    const list = n(i.quantity) * n(i.unit_price);
    listTotal += list;
    lineNet += list * (1 - n(i.discount) / 100);
    const pr = products.find(x => x.id === i.product_id);
    if (pr && pr.cost_price !== null && pr.cost_price !== undefined && pr.cost_price !== '') cost += n(pr.cost_price) * n(i.quantity);
    else missing++;
  });
  const netTotal = lineNet * (1 - gd);
  const effectiveDiscount = listTotal > 0 ? (1 - netTotal / listTotal) * 100 : 0;
  const marginPct = missing === 0 && netTotal > 0 ? (netTotal - cost) / netTotal * 100 : null;

  const reasons: string[] = [];
  if (p.max_discount_pct !== null && effectiveDiscount > n(p.max_discount_pct) + 0.001)
    reasons.push(`Toplam iskonto %${effectiveDiscount.toFixed(1)} (sınır %${n(p.max_discount_pct)})`);
  if (p.min_margin_pct !== null && marginPct !== null && marginPct < n(p.min_margin_pct))
    reasons.push(`Brüt marj %${marginPct.toFixed(1)} (alt sınır %${n(p.min_margin_pct)})`);
  if (p.max_total_without_approval !== null && p.max_total_without_approval !== undefined && n(total) > n(p.max_total_without_approval))
    reasons.push(`Tutar onay sınırını (₺${n(p.max_total_without_approval).toLocaleString('tr-TR')}) aşıyor`);

  return { listTotal, netTotal, effectiveDiscount, costTotal: missing === items.length ? null : cost, marginPct, missingCost: missing, reasons };
}

export const APPROVAL_STATUS: Record<string, { label: string; variant: 'default' | 'warning' | 'success' | 'danger' }> = {
  not_required: { label: '', variant: 'default' },
  pending: { label: 'Yönetici onayı bekliyor', variant: 'warning' },
  approved: { label: 'Yönetici onaylı', variant: 'success' },
  rejected: { label: 'Onay reddedildi', variant: 'danger' },
};

export const CUSTOMER_RESPONSE: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' }> = {
  accepted: { label: 'Müşteri online kabul etti', variant: 'success' },
  rejected: { label: 'Müşteri reddetti', variant: 'danger' },
  revision_requested: { label: 'Müşteri revizyon istedi', variant: 'warning' },
};
