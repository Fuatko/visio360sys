'use client';

import Header from '@/components/Header';
import { Card } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import SupplierCards from '@/components/suppliers/SupplierCards';
import PurchaseOrders from '@/components/suppliers/PurchaseOrders';
import SupplierReceivables from '@/components/suppliers/SupplierReceivables';
import SupplierDeals from '@/components/suppliers/SupplierDeals';

type Tab = 'suppliers' | 'deals' | 'purchases' | 'receivables';

export default function SuppliersPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('suppliers');
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [targets, setTargets] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [opps, setOpps] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  const load = useCallback(async () => {
    const [s, t, p, r, o, pr, c, or] = await Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('supplier_targets').select('*'),
      supabase.from('purchase_orders').select('*').order('order_date', { ascending: false }),
      supabase.from('supplier_receivables').select('*'),
      supabase.from('opportunities').select('*'),
      supabase.from('products').select('*').order('name'),
      supabase.from('customers').select('id, name').order('name'),
      supabase.from('orders').select('id, order_number, customer_id, order_date, status').order('created_at', { ascending: false }).limit(500),
    ]);
    setMissing(!!s.error);
    setSuppliers(s.data || []); setTargets(t.data || []); setPos(p.data || []); setReceivables(r.data || []);
    setOpps(o.data || []); setProducts(pr.data || []); setCustomers(c.data || []); setOrders(or.data || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    try { const t = new URLSearchParams(window.location.search).get('tab') as Tab; if (t) setTab(t); } catch { /* yok say */ }
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const dealWarn = opps.filter(o => o.supplier_id && !['Kazanıldı', 'Kaybedildi'].includes(o.stage) && suppliers.find(s => s.id === o.supplier_id)?.deal_reg_required && o.supplier_reg_status !== 'approved').length;
  const poWarn = pos.filter(p => p.status === 'invoiced' && !p.paid_at && p.due_date && p.due_date < today).length;
  const TABS: [Tab, string, number][] = [['suppliers', 'Ana firmalar', 0], ['deals', 'Fırsat kayıtları', dealWarn], ['purchases', 'Satın alma', poWarn], ['receivables', 'Alacaklarımız (prim, komisyon, garanti)', 0]];

  if (loading) return <div><Header title="Ana Firmalarım" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;

  return (
    <div>
      <Header title="Ana Firmalarım" subtitle="Bayisi, iş ortağı veya yetkili servisi olduğunuz markalar: kurallar, hedefler, satın alma ve alacaklar" />
      <div className="space-y-4 p-6">
        {missing && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /><b>ana-firmalar.sql</b> dosyasını Supabase'de çalıştırın.</Card>}
        <div className="flex flex-wrap gap-1 rounded-xl border bg-white p-1">
          {TABS.map(([k, l, c]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-1.5 text-sm ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {l}{c ? <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{c}</span> : null}
            </button>
          ))}
        </div>
        {tab === 'suppliers' && <SupplierCards supabase={supabase} suppliers={suppliers} targets={targets} pos={pos} receivables={receivables} opps={opps} onChanged={load} />}
        {tab === 'deals' && <SupplierDeals supabase={supabase} opps={opps} suppliers={suppliers} customers={customers} receivables={receivables} onChanged={load} />}
        {tab === 'purchases' && <PurchaseOrders supabase={supabase} pos={pos} suppliers={suppliers} products={products} orders={orders} customers={customers} onChanged={load} />}
        {tab === 'receivables' && <SupplierReceivables supabase={supabase} receivables={receivables} suppliers={suppliers} customers={customers} opps={opps} onChanged={load} />}
      </div>
    </div>
  );
}
