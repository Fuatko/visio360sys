'use client';

// Sipariş ve teklif formları için bayi fiyatlandırma verisi ve yardımcıları
import { useEffect, useState, useCallback } from 'react';
import { resolveDealerPrice, DealerInfo, ProductInfo, PriceListItem, DiscountRule, PriceResult, isDealer } from '@/lib/dealer-pricing';

export function useDealerPricing(supabase: any) {
  const [dealers, setDealers] = useState<Record<string, DealerInfo>>({});
  const [products, setProducts] = useState<Record<string, ProductInfo>>({});
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [rules, setRules] = useState<DiscountRule[]>([]);
  const [receivables, setReceivables] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const [cRes, pRes, iRes, rRes, colRes] = await Promise.all([
      supabase.from('customers').select('id, name, customer_type, dealer_level, price_list_id, base_discount, payment_term_days, credit_limit'),
      supabase.from('products').select('id, name, price, category, tax_rate'),
      supabase.from('price_list_items').select('price_list_id, product_id, price'),
      supabase.from('dealer_discount_rules').select('*').eq('is_active', true),
      supabase.from('collections').select('customer_id, amount, status'),
    ]);
    const d: Record<string, DealerInfo> = {};
    (cRes.data || []).forEach((c: any) => { d[c.id] = c; });
    const p: Record<string, ProductInfo> = {};
    (pRes.data || []).forEach((x: any) => { p[x.id] = x; });
    const rec: Record<string, number> = {};
    (colRes.data || []).forEach((c: any) => {
      if (!c.customer_id || ['Ödendi', 'paid'].includes(c.status)) return;
      rec[c.customer_id] = (rec[c.customer_id] || 0) + (Number(c.amount) || 0);
    });
    setDealers(d); setProducts(p); setItems(iRes.data || []); setRules(rRes.data || []); setReceivables(rec);
    setReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sayfa açılışında bir kez yükle
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  /** Müşteri bayi ise kartını döndürür, değilse null */
  const getDealer = (customerId: string | null | undefined): DealerInfo | null => {
    const c = customerId ? dealers[customerId] : null;
    return c && isDealer(c) ? c : null;
  };

  /** Müşterinin standart vadesi (bayi olmasa da tanımlıysa) */
  const defaultTerm = (customerId: string | null | undefined): number | null => {
    const c = customerId ? dealers[customerId] : null;
    return c && c.payment_term_days !== null && c.payment_term_days !== undefined ? Number(c.payment_term_days) : null;
  };

  /** Bayi için fiyat ve iskonto; bayi değilse null */
  const priceFor = (customerId: string, productId: string, quantity: number, termDays: number): PriceResult | null => {
    const dealer = getDealer(customerId);
    const product = products[productId];
    if (!dealer || !product) return null;
    return resolveDealerPrice({ dealer, product, quantity, termDays, priceListItems: items, rules });
  };

  /** Kredi limiti kontrolü: eklenecek tutarla limit aşılıyor mu? */
  const creditCheck = (customerId: string, addAmount: number) => {
    const c = customerId ? dealers[customerId] : null;
    const limit = c?.credit_limit !== null && c?.credit_limit !== undefined ? Number(c.credit_limit) : null;
    const open = receivables[customerId] || 0;
    return { limit, open, after: open + addAmount, exceeded: limit !== null && open + addAmount > limit, available: limit === null ? null : limit - open };
  };

  return { ready, reload: load, getDealer, defaultTerm, priceFor, creditCheck };
}
