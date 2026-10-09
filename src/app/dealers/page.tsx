'use client';

import Header from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Store, Tags, Percent, Target, RefreshCw, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import DealerPerformance from '@/components/dealers/DealerPerformance';
import PriceLists from '@/components/dealers/PriceLists';
import DiscountRules from '@/components/dealers/DiscountRules';
import DealerTargets from '@/components/dealers/DealerTargets';

type Tab = 'performance' | 'prices' | 'rules' | 'targets';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'performance', label: 'Bayi Performansı', icon: Store },
  { key: 'prices', label: 'Fiyat Listeleri', icon: Tags },
  { key: 'rules', label: 'İskonto Kuralları', icon: Percent },
  { key: 'targets', label: 'Hedefler', icon: Target },
];

export default function DealersPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('performance');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dealers, setDealers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [targets, setTargets] = useState<any[]>([]);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [priceItems, setPriceItems] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setError(null);
    const [d, pl, pli, r, t, p] = await Promise.all([
      supabase.from('customers').select('id, name, customer_type, dealer_code, dealer_level, region, credit_limit, payment_term_days, price_list_id, base_discount, dealer_since').eq('customer_type', 'dealer').order('name'),
      supabase.from('price_lists').select('*').order('name'),
      supabase.from('price_list_items').select('*'),
      supabase.from('dealer_discount_rules').select('*').order('created_at', { ascending: false }),
      supabase.from('dealer_targets').select('*'),
      supabase.from('products').select('id, name, price, category').order('name'),
    ]);
    const firstErr = [d, pl, pli, r, t].find(x => x.error)?.error;
    if (firstErr) {
      setError(firstErr.message);
      setLoading(false);
      return;
    }
    const dl = d.data || [];
    setDealers(dl); setPriceLists(pl.data || []); setPriceItems(pli.data || []);
    setRules(r.data || []); setTargets(t.data || []); setProducts(p.data || []);

    const ids = dl.map((x: any) => x.id);
    if (ids.length) {
      const [o, inv, c] = await Promise.all([
        supabase.from('orders').select('id, customer_id, order_date, created_at, subtotal, discount, total, status').in('customer_id', ids),
        supabase.from('invoices').select('customer_id, issue_date, subtotal, discount_amount, status').in('customer_id', ids),
        supabase.from('collections').select('customer_id, amount, status, due_date, payment_date').in('customer_id', ids),
      ]);
      setOrders(o.data || []); setInvoices(inv.data || []); setCollections(c.data || []);
    } else {
      setOrders([]); setInvoices([]); setCollections([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <div><Header title="Bayi Yönetimi" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;
  }

  return (
    <div>
      <Header title="Bayi Yönetimi" subtitle="Bayiye özel fiyat listeleri, vade/iskonto kuralları, kredi limiti ve hedefler" />
      <div className="space-y-4 p-6">
        {error ? (
          <Card className="flex items-start gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Bayi verileri okunamadı</p>
              <p className="mt-1">{error}</p>
              <p className="mt-1">Bayi SQL kurulumu (bayi-yonetimi.sql) Supabase'de çalıştırıldı mı?</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => { setLoading(true); fetchData(); }}><RefreshCw className="h-3 w-3" />Tekrar dene</Button>
            </div>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm ${tab === t.key ? 'border-indigo-600 font-medium text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  <t.icon className="h-4 w-4" />{t.label}
                </button>
              ))}
            </div>

            {tab === 'performance' && <DealerPerformance dealers={dealers} orders={orders} invoices={invoices} collections={collections} targets={targets} priceLists={priceLists} />}
            {tab === 'prices' && <PriceLists supabase={supabase} priceLists={priceLists} items={priceItems} products={products} dealers={dealers} onChanged={fetchData} />}
            {tab === 'rules' && <DiscountRules supabase={supabase} rules={rules} dealers={dealers} products={products} priceListItems={priceItems} onChanged={fetchData} />}
            {tab === 'targets' && <DealerTargets supabase={supabase} targets={targets} dealers={dealers} orders={orders} onChanged={fetchData} />}
          </>
        )}
      </div>
    </div>
  );
}
