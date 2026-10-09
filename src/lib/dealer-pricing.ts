// Bayi fiyatlandırma motoru
// Fiyat: bayinin fiyat listesindeki fiyat → yoksa ürünün liste fiyatı
// İskonto: eşleşen en spesifik kural → yoksa bayinin temel iskontosu
//   Spesifiklik: bayi (8) > ürün (4) > kategori (2) > seviye (1); eşitlikte en yüksek iskonto

export interface DealerInfo {
  id: string;
  name?: string;
  customer_type?: string | null;
  dealer_level?: string | null;
  price_list_id?: string | null;
  base_discount?: number | null;
  payment_term_days?: number | null;
  credit_limit?: number | null;
}

export interface ProductInfo { id: string; name?: string; price?: number | null; category?: string | null; tax_rate?: number | null }
export interface PriceListItem { price_list_id: string; product_id: string; price: number }
export interface DiscountRule {
  id: string;
  name?: string | null;
  dealer_id?: string | null;
  dealer_level?: string | null;
  product_id?: string | null;
  product_category?: string | null;
  max_payment_term_days?: number | null;
  min_quantity?: number | null;
  discount_pct: number;
  valid_from?: string | null;
  valid_to?: string | null;
  is_active?: boolean | null;
}

export interface PriceResult {
  listPrice: number;          // iskonto öncesi birim fiyat
  priceSource: 'price_list' | 'product';
  discountPct: number;
  ruleId: string | null;
  explanation: string;        // kullanıcıya gösterilecek açıklama
}

export const PAYMENT_TERMS = [
  { days: 0, label: 'Peşin' },
  { days: 15, label: '15 gün' },
  { days: 30, label: '30 gün' },
  { days: 45, label: '45 gün' },
  { days: 60, label: '60 gün' },
  { days: 90, label: '90 gün' },
  { days: 120, label: '120 gün' },
];

export const DEALER_LEVELS = ['Platin', 'Altın', 'Gümüş', 'Bronz'];

export const termLabel = (d: number | null | undefined) =>
  d === null || d === undefined ? '-' : d === 0 ? 'Peşin' : `${d} gün`;

export const isDealer = (c: any) => c?.customer_type === 'dealer';

export function ruleDescription(r: DiscountRule, productName?: string, dealerName?: string): string {
  const parts: string[] = [];
  if (r.dealer_id) parts.push(dealerName ? `Bayi: ${dealerName}` : 'Bayiye özel');
  if (r.dealer_level) parts.push(`Seviye: ${r.dealer_level}`);
  if (r.product_id) parts.push(productName ? `Ürün: ${productName}` : 'Ürüne özel');
  if (r.product_category) parts.push(`Kategori: ${r.product_category}`);
  if (r.max_payment_term_days !== null && r.max_payment_term_days !== undefined)
    parts.push(r.max_payment_term_days === 0 ? 'Peşin' : `≤ ${r.max_payment_term_days} gün vade`);
  if (Number(r.min_quantity) > 0) parts.push(`min ${r.min_quantity} adet`);
  return parts.length ? parts.join(' · ') : 'Tüm bayiler';
}

export function resolveDealerPrice(args: {
  dealer: DealerInfo;
  product: ProductInfo;
  quantity: number;
  termDays: number;
  priceListItems: PriceListItem[];
  rules: DiscountRule[];
  date?: string; // YYYY-MM-DD
}): PriceResult {
  const { dealer, product, quantity, termDays, priceListItems, rules } = args;
  const date = args.date || new Date().toISOString().split('T')[0];

  const listItem = dealer.price_list_id
    ? priceListItems.find(i => i.price_list_id === dealer.price_list_id && i.product_id === product.id)
    : undefined;
  const listPrice = listItem ? Number(listItem.price) : Number(product.price) || 0;
  const priceSource = listItem ? 'price_list' : 'product';

  let best: { rule: DiscountRule; score: number } | null = null;
  for (const r of rules) {
    if (r.is_active === false) continue;
    if (r.dealer_id && r.dealer_id !== dealer.id) continue;
    if (r.dealer_level && r.dealer_level !== (dealer.dealer_level || '')) continue;
    if (r.product_id && r.product_id !== product.id) continue;
    if (r.product_category && r.product_category !== (product.category || '')) continue;
    if (r.max_payment_term_days !== null && r.max_payment_term_days !== undefined && termDays > Number(r.max_payment_term_days)) continue;
    if (Number(r.min_quantity) > 0 && quantity < Number(r.min_quantity)) continue;
    if (r.valid_from && date < r.valid_from) continue;
    if (r.valid_to && date > r.valid_to) continue;

    const score = (r.dealer_id ? 8 : 0) + (r.product_id ? 4 : 0) + (r.product_category ? 2 : 0) + (r.dealer_level ? 1 : 0);
    if (!best || score > best.score || (score === best.score && Number(r.discount_pct) > Number(best.rule.discount_pct))) {
      best = { rule: r, score };
    }
  }

  const priceNote = priceSource === 'price_list' ? 'bayi fiyat listesi' : 'ürün liste fiyatı';
  if (best) {
    return {
      listPrice, priceSource,
      discountPct: Number(best.rule.discount_pct),
      ruleId: best.rule.id,
      explanation: `${priceNote}; %${Number(best.rule.discount_pct)} iskonto (${best.rule.name || ruleDescription(best.rule)})`,
    };
  }
  const base = Number(dealer.base_discount) || 0;
  return {
    listPrice, priceSource, discountPct: base, ruleId: null,
    explanation: base > 0 ? `${priceNote}; bayinin temel iskontosu %${base}` : `${priceNote}; iskonto kuralı yok`,
  };
}
