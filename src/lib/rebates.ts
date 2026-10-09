// Ciro primi (rebate) hesaplama
//  retroactive: ulaşılan basamağın oranı tüm ciroya uygulanır (Türkiye'de yaygın "ciro primi")
//  incremental: her basamak sadece kendi aralığındaki ciroya uygulanır (vergi dilimi gibi)

export interface RebateTier { id?: string; threshold: number; rate_pct: number; bonus_amount?: number }
export interface RebateProgram {
  id: string;
  name: string;
  description?: string | null;
  period_start: string;
  period_end: string;
  basis: 'orders' | 'invoices' | 'collections';
  calc_mode: 'retroactive' | 'incremental';
  dealer_level?: string | null;
  dealer_id?: string | null;
  payout_method?: string | null;
  is_active?: boolean;
}

export const BASIS_LABEL: Record<string, string> = {
  orders: 'Sipariş tutarı (KDV hariç)',
  invoices: 'Fatura tutarı (KDV hariç)',
  collections: 'Tahsilat tutarı',
};
export const CALC_MODE_LABEL: Record<string, string> = {
  retroactive: 'Geriye dönük (ulaşılan oran tüm ciroya)',
  incremental: 'Kademeli (her dilim kendi oranıyla)',
};
export const PAYOUT_LABEL: Record<string, string> = {
  credit_note: 'Fiyat farkı faturası / cari mahsup',
  cash: 'Nakit ödeme',
  goods: 'Mal fazlası',
};

const n = (v: any) => Number(v) || 0;

export interface RebateResult {
  achieved: number;
  rate: number;              // efektif oran (%)
  rebate: number;            // hak edilen prim
  current: RebateTier | null;
  next: RebateTier | null;
  toNext: number;            // bir sonraki basamağa kalan ciro
  nextRebate: number;        // bir sonraki basamağa ulaşınca hak edilecek prim
}

function computeAt(achieved: number, tiers: RebateTier[], mode: string): { rebate: number; current: RebateTier | null } {
  const sorted = [...tiers].sort((a, b) => n(a.threshold) - n(b.threshold));
  const reached = sorted.filter(t => achieved >= n(t.threshold));
  const current = reached.length ? reached[reached.length - 1] : null;
  if (!current) return { rebate: 0, current: null };
  let rebate = 0;
  if (mode === 'incremental') {
    sorted.forEach((t, i) => {
      const from = n(t.threshold);
      const to = i + 1 < sorted.length ? n(sorted[i + 1].threshold) : Infinity;
      if (achieved > from) rebate += (Math.min(achieved, to) - from) * n(t.rate_pct) / 100;
    });
  } else {
    rebate = achieved * n(current.rate_pct) / 100;
  }
  rebate += n(current.bonus_amount);
  return { rebate: Math.round(rebate * 100) / 100, current };
}

export function calcRebate(achieved: number, tiers: RebateTier[], mode: string): RebateResult {
  const sorted = [...tiers].sort((a, b) => n(a.threshold) - n(b.threshold));
  const { rebate, current } = computeAt(achieved, sorted, mode);
  const next = sorted.find(t => n(t.threshold) > achieved) || null;
  const nextRebate = next ? computeAt(n(next.threshold), sorted, mode).rebate : 0;
  return {
    achieved,
    rate: achieved > 0 ? rebate / achieved * 100 : 0,
    rebate,
    current,
    next,
    toNext: next ? n(next.threshold) - achieved : 0,
    nextRebate,
  };
}

const inPeriod = (d: string | null | undefined, p: RebateProgram) =>
  !!d && d.slice(0, 10) >= p.period_start && d.slice(0, 10) <= p.period_end;

// Programın baz cirosu
export function programAchieved(p: RebateProgram, dealerId: string, data: { orders?: any[]; invoices?: any[]; collections?: any[] }): number {
  if (p.basis === 'invoices') {
    return (data.invoices || []).filter(i => i.customer_id === dealerId && !['draft', 'cancelled'].includes(i.status) && inPeriod(i.issue_date, p))
      .reduce((s, i) => s + n(i.subtotal) - n(i.discount_amount), 0);
  }
  if (p.basis === 'collections') {
    return (data.collections || []).filter(c => c.customer_id === dealerId && ['Ödendi', 'paid'].includes(c.status) && inPeriod(c.payment_date, p))
      .reduce((s, c) => s + n(c.amount), 0);
  }
  return (data.orders || []).filter(o => o.customer_id === dealerId && !['cancelled', 'İptal'].includes(o.status) && inPeriod(o.order_date || o.created_at, p))
    .reduce((s, o) => s + (n(o.subtotal) * (1 - Math.min(Math.max(n(o.discount), 0), 100) / 100)), 0);
}

export function programAppliesTo(p: RebateProgram, dealer: { id: string; dealer_level?: string | null }) {
  return (!p.dealer_id || p.dealer_id === dealer.id) && (!p.dealer_level || p.dealer_level === dealer.dealer_level);
}
