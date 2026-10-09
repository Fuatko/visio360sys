'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, Badge } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { n } from '@/lib/portal';
import { periodLabel } from '@/lib/periods';

interface Props { supabase: any; dealers: any[]; products: any[]; orders: any[] }

export default function SelloutStock({ supabase, dealers, products, orders }: Props) {
  const [days, setDays] = useState(90);
  const [sellout, setSellout] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [dealer, setDealer] = useState('');

  useEffect(() => {
    (async () => {
      const [s, st, f] = await Promise.all([
        supabase.from('dealer_sellout').select('dealer_id, product_id, quantity, sale_date, end_customer_city'),
        supabase.from('dealer_stock').select('dealer_id, product_id, quantity, snapshot_date'),
        supabase.from('dealer_forecasts').select('dealer_id, product_id, quantity, period'),
      ]);
      setSellout(s.data || []); setStock(st.data || []); setForecasts(f.data || []);
      const ids = orders.filter(o => !['cancelled', 'İptal'].includes(o.status)).map(o => o.id);
      const all: any[] = [];
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await supabase.from('order_items').select('order_id, product_id, quantity').in('order_id', ids.slice(i, i + 150));
        all.push(...(data || []));
      }
      setItems(all);
    })();
  }, [orders]);

  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const orderMap = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);
  const inDealer = (id: string) => !dealer || id === dealer;

  // Her bayinin her ürün için son sayımı
  const latestStock = useMemo(() => {
    const m = new Map<string, any>();
    stock.forEach(s => { const k = `${s.dealer_id}|${s.product_id}`; const c = m.get(k); if (!c || s.snapshot_date > c.snapshot_date) m.set(k, s); });
    return Array.from(m.values());
  }, [stock]);

  const futurePeriods = Array.from(new Set(forecasts.map(f => f.period))).sort().filter(p => p >= new Date().toISOString().slice(0, 7)).slice(0, 4);

  const rows = products.map(p => {
    const sellIn = items.filter(i => i.product_id === p.id).reduce((s, i) => {
      const o = orderMap.get(i.order_id);
      return o && inDealer(o.customer_id) && (o.order_date || o.created_at || '').slice(0, 10) >= since ? s + n(i.quantity) : s;
    }, 0);
    const sOut = sellout.filter(s => s.product_id === p.id && inDealer(s.dealer_id) && s.sale_date >= since).reduce((s, x) => s + n(x.quantity), 0);
    const chStock = latestStock.filter(s => s.product_id === p.id && inDealer(s.dealer_id)).reduce((s, x) => s + n(x.quantity), 0);
    const weekly = sOut / (days / 7);
    const fc = futurePeriods.map(per => forecasts.filter(f => f.product_id === p.id && f.period === per && inDealer(f.dealer_id)).reduce((s, x) => s + n(x.quantity), 0));
    return { p, sellIn, sOut, chStock, wos: weekly > 0 ? chStock / weekly : null, sellThrough: sellIn > 0 ? sOut / sellIn * 100 : null, fc };
  }).filter(r => r.sellIn || r.sOut || r.chStock || r.fc.some(Boolean));

  const compliance = dealers.map(d => {
    const lastS = sellout.filter(s => s.dealer_id === d.id).map(s => s.sale_date).sort().pop();
    const lastK = stock.filter(s => s.dealer_id === d.id).map(s => s.snapshot_date).sort().pop();
    const fresh = (x?: string) => !!x && x >= new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10);
    return { d, lastS, lastK, ok: fresh(lastS) && fresh(lastK) };
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Sell-in / Sell-out / Kanal Stoğu / Talep Tahmini</h3>
          <select value={dealer} onChange={e => setDealer(e.target.value)} className="h-8 rounded-lg border px-2 text-sm"><option value="">Tüm bayiler</option>{dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="h-8 rounded-lg border px-2 text-sm">
            {[30, 90, 180, 365].map(d => <option key={d} value={d}>Son {d} gün</option>)}
          </select>
        </div>
        {rows.length === 0 ? <p className="text-sm text-slate-500">Bayiler portaldan satış (sell-out), stok ve tahmin bildirdikçe burada ürün bazında kanal görünürlüğü oluşur.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2">Ürün</th><th className="text-right">Sell-in (bize sipariş)</th><th className="text-right">Sell-out (son kullanıcıya)</th><th className="text-right">Sell-through</th>
                <th className="text-right">Kanal stoğu</th><th className="text-right">Kaç hafta yeter</th>
                {futurePeriods.map(p => <th key={p} className="text-right">Tahmin {periodLabel(p)}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.p.id} className="border-b">
                    <td className="py-1.5 font-medium">{r.p.name}</td>
                    <td className="text-right">{r.sellIn}</td><td className="text-right">{r.sOut}</td>
                    <td className="text-right">{r.sellThrough === null ? '-' : `%${Math.round(r.sellThrough)}`}</td>
                    <td className="text-right">{r.chStock}</td>
                    <td className={`text-right ${r.wos !== null && r.wos < 3 ? 'font-semibold text-red-600' : r.wos !== null && r.wos > 16 ? 'text-amber-600' : ''}`}>{r.wos === null ? '-' : r.wos.toFixed(1)}</td>
                    {r.fc.map((v, i) => <td key={i} className="text-right">{v || '-'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-400">Kaç hafta yeter &lt; 3: stok tükenme riski (sevkiyat planlayın) · &gt; 16: kanalda şişkin stok (kampanya / sipariş baskısı yapmayın).</p>
          </div>
        )}
      </Card>
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Raporlama uyumu (son 35 gün)</h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-1">Bayi</th><th>Son satış bildirimi</th><th>Son stok sayımı</th><th /></tr></thead>
          <tbody>{compliance.map(c => (
            <tr key={c.d.id} className="border-b"><td className="py-1">{c.d.name}</td><td>{c.lastS ? formatDate(c.lastS) : '-'}</td><td>{c.lastK ? formatDate(c.lastK) : '-'}</td>
              <td>{c.ok ? <Badge variant="success">Güncel</Badge> : <Badge variant="warning">Eksik</Badge>}</td></tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}
