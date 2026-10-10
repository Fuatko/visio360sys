'use client';

import Header from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import DealerPerformance from '@/components/dealers/DealerPerformance';
import PriceLists from '@/components/dealers/PriceLists';
import DiscountRules from '@/components/dealers/DiscountRules';
import DealerTargets from '@/components/dealers/DealerTargets';
import DealerScorecard from '@/components/dealers/DealerScorecard';
import RebatePrograms from '@/components/dealers/RebatePrograms';
import DealRegistrations from '@/components/dealers/DealRegistrations';
import LeadDistribution from '@/components/dealers/LeadDistribution';
import MdfManagement from '@/components/dealers/MdfManagement';
import SelloutStock from '@/components/dealers/SelloutStock';
import DealerTickets from '@/components/dealers/DealerTickets';
import PaymentNotices from '@/components/dealers/PaymentNotices';
import PortalUsers from '@/components/dealers/PortalUsers';
import Announcements from '@/components/dealers/Announcements';
import Trainings from '@/components/dealers/Trainings';

type Tab = 'performance' | 'scorecard' | 'prices' | 'rules' | 'targets' | 'rebates'
  | 'deals' | 'leads' | 'mdf' | 'sellout' | 'tickets' | 'payments' | 'users' | 'announcements' | 'trainings';

const GROUPS: { title: string; tabs: { key: Tab; label: string; count?: string }[] }[] = [
  { title: 'Ticari', tabs: [
    { key: 'performance', label: 'Performans' }, { key: 'scorecard', label: 'Bayi Karnesi' }, { key: 'prices', label: 'Fiyat Listeleri' },
    { key: 'rules', label: 'İskonto Kuralları' }, { key: 'targets', label: 'Hedefler' }, { key: 'rebates', label: 'Ciro Primi' },
  ] },
  { title: 'Kanal', tabs: [
    { key: 'deals', label: 'Fırsat Kayıtları', count: 'deals' }, { key: 'leads', label: 'Lead Dağıtımı' },
    { key: 'mdf', label: 'Pazarlama Fonu', count: 'mdf' }, { key: 'sellout', label: 'Sell-out & Stok' },
  ] },
  { title: 'Hizmet', tabs: [{ key: 'tickets', label: 'Garanti & Destek', count: 'tickets' }, { key: 'payments', label: 'Ödeme Bildirimleri', count: 'payments' }] },
  { title: 'Portal', tabs: [{ key: 'users', label: 'Portal Kullanıcıları' }, { key: 'announcements', label: 'Duyurular' }, { key: 'trainings', label: 'Eğitimler' }] },
];

export default function DealersPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('performance');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalMissing, setPortalMissing] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [dealers, setDealers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [targets, setTargets] = useState<any[]>([]);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [priceItems, setPriceItems] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
      if (t && GROUPS.some(g => g.tabs.some(x => x.key === t))) setTab(t);
    } catch { /* yok say */ }
  }, []);

  const selectTab = (t: Tab) => {
    setTab(t);
    try { window.history.replaceState(null, '', `/dealers?tab=${t}`); } catch { /* yok say */ }
  };

  const fetchCounts = useCallback(async () => {
    const c = async (table: string, statuses: string[]) => {
      const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).in('status', statuses);
      return error ? -1 : (count || 0);
    };
    const [deals, mdf, tickets, payments] = await Promise.all([
      c('deal_registrations', ['submitted']), c('mdf_requests', ['submitted', 'claimed']),
      c('dealer_tickets', ['open', 'in_progress']), c('dealer_payment_notices', ['submitted']),
    ]);
    setPortalMissing(deals === -1);
    setCounts({ deals: Math.max(deals, 0), mdf: Math.max(mdf, 0), tickets: Math.max(tickets, 0), payments: Math.max(payments, 0) });
  }, []);

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
        supabase.from('orders').select('*').in('customer_id', ids),
        supabase.from('invoices').select('customer_id, issue_date, subtotal, discount_amount, status').in('customer_id', ids),
        supabase.from('collections').select('customer_id, amount, status, due_date, payment_date').in('customer_id', ids),
      ]);
      setOrders(o.data || []); setInvoices(inv.data || []); setCollections(c.data || []);
    } else {
      setOrders([]); setInvoices([]); setCollections([]);
    }
    setLoading(false);
    fetchCounts();
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <div><Header title="Bayi Yönetimi" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;
  }

  return (
    <div>
      <Header title="Bayi Yönetimi" subtitle="Kanal yönetimi: fiyat, iskonto, prim, fırsat kaydı, MDF, sell-out, garanti ve bayi portalı" />
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
            {portalMissing && (
              <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />Kanal ve portal modülleri için <b>bayi-portali.sql</b> dosyasını Supabase'de çalıştırın.
              </Card>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white p-2">
              {GROUPS.map(g => (
                <div key={g.title} className="flex flex-wrap items-center gap-1">
                  <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</span>
                  {g.tabs.map(t => {
                    const c = t.count ? counts[t.count] : 0;
                    return (
                      <button key={t.key} onClick={() => selectTab(t.key)}
                        className={`rounded-lg px-3 py-1.5 text-sm ${tab === t.key ? 'bg-indigo-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                        {t.label}{c ? <span className={`ml-1 rounded-full px-1.5 text-[10px] ${tab === t.key ? 'bg-white text-indigo-700' : 'bg-red-500 text-white'}`}>{c}</span> : null}
                      </button>
                    );
                  })}
                </div>
              ))}
              <a href="/portal" target="_blank" className="ml-auto flex items-center gap-1 self-center px-2 text-xs text-indigo-600"><ExternalLink className="h-3 w-3" />Bayi portalı</a>
            </div>

            {tab === 'performance' && <DealerPerformance dealers={dealers} orders={orders} invoices={invoices} collections={collections} targets={targets} priceLists={priceLists} />}
            {tab === 'scorecard' && <DealerScorecard supabase={supabase} dealers={dealers} orders={orders} collections={collections} targets={targets} onChanged={fetchData} />}
            {tab === 'prices' && <PriceLists supabase={supabase} priceLists={priceLists} items={priceItems} products={products} dealers={dealers} onChanged={fetchData} />}
            {tab === 'rules' && <DiscountRules supabase={supabase} rules={rules} dealers={dealers} products={products} priceListItems={priceItems} onChanged={fetchData} />}
            {tab === 'targets' && <DealerTargets supabase={supabase} targets={targets} dealers={dealers} orders={orders} onChanged={fetchData} />}
            {tab === 'rebates' && <RebatePrograms supabase={supabase} dealers={dealers} orders={orders} invoices={invoices} collections={collections} />}
            {tab === 'deals' && <DealRegistrations supabase={supabase} dealers={dealers} onChanged={fetchCounts} />}
            {tab === 'leads' && <LeadDistribution supabase={supabase} dealers={dealers} />}
            {tab === 'mdf' && <MdfManagement supabase={supabase} dealers={dealers} onChanged={fetchCounts} />}
            {tab === 'sellout' && <SelloutStock supabase={supabase} dealers={dealers} products={products} orders={orders} />}
            {tab === 'tickets' && <DealerTickets supabase={supabase} dealers={dealers} products={products} onChanged={fetchCounts} />}
            {tab === 'payments' && <PaymentNotices supabase={supabase} dealers={dealers} onChanged={fetchCounts} />}
            {tab === 'users' && <PortalUsers supabase={supabase} dealers={dealers} />}
            {tab === 'announcements' && <Announcements supabase={supabase} dealers={dealers} />}
            {tab === 'trainings' && <Trainings supabase={supabase} dealers={dealers} />}
          </>
        )}
      </div>
    </div>
  );
}
