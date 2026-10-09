'use client';

import { Card, Badge, EmptyState } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { Store, AlertTriangle } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { orderNetAmount } from '@/lib/sales-flow';
import { periodRange, currentPeriods, periodLabel, inRange } from '@/lib/periods';
import { termLabel } from '@/lib/dealer-pricing';

interface Props {
  dealers: any[];
  orders: any[];
  invoices: any[];
  collections: any[];
  targets: any[];
  priceLists: any[];
}

const n = (v: any) => Number(v) || 0;
const tl = (v: number) => `₺${formatMoney(v)}`;
const isPaid = (c: any) => ['Ödendi', 'paid'].includes(c.status);

export default function DealerPerformance({ dealers, orders, invoices, collections, targets, priceLists }: Props) {
  const router = useRouter();
  const cp = currentPeriods();
  const [period, setPeriod] = useState(cp.quarter);
  const [region, setRegion] = useState('');
  const [level, setLevel] = useState('');
  const range = periodRange(period);
  const today = new Date().toISOString().slice(0, 10);

  const regions = Array.from(new Set(dealers.map(d => d.region).filter(Boolean))).sort();
  const levels = Array.from(new Set(dealers.map(d => d.dealer_level).filter(Boolean))).sort();

  const rows = useMemo(() => dealers
    .filter(d => (!region || d.region === region) && (!level || d.dealer_level === level))
    .map(d => {
      const dOrders = orders.filter(o => o.customer_id === d.id && !['cancelled', 'İptal'].includes(o.status));
      const sellIn = dOrders.filter(o => inRange(o.order_date || o.created_at, range)).reduce((s, o) => s + orderNetAmount(o), 0);
      const invoiced = invoices.filter(i => i.customer_id === d.id && !['draft', 'cancelled'].includes(i.status) && inRange(i.issue_date, range))
        .reduce((s, i) => s + n(i.subtotal) - n(i.discount_amount), 0);
      const dColl = collections.filter(c => c.customer_id === d.id);
      const collected = dColl.filter(c => isPaid(c) && inRange(c.payment_date, range)).reduce((s, c) => s + n(c.amount), 0);
      const open = dColl.filter(c => !isPaid(c)).reduce((s, c) => s + n(c.amount), 0);
      const overdue = dColl.filter(c => !isPaid(c) && c.due_date && c.due_date < today).reduce((s, c) => s + n(c.amount), 0);
      const target = targets.find(t => t.dealer_id === d.id && t.period === period);
      const achievement = target && n(target.target_amount) > 0 ? sellIn / n(target.target_amount) * 100 : null;
      const limit = d.credit_limit !== null && d.credit_limit !== undefined ? n(d.credit_limit) : null;
      const creditUse = limit && limit > 0 ? open / limit * 100 : null;
      return { d, sellIn, invoiced, collected, open, overdue, target: target ? n(target.target_amount) : null, achievement, limit, creditUse };
    })
    .sort((a, b) => b.sellIn - a.sellIn), [dealers, orders, invoices, collections, targets, period, region, level]);

  const tot = rows.reduce((t, r) => ({
    sellIn: t.sellIn + r.sellIn, invoiced: t.invoiced + r.invoiced, collected: t.collected + r.collected,
    open: t.open + r.open, overdue: t.overdue + r.overdue, target: t.target + (r.target || 0),
  }), { sellIn: 0, invoiced: 0, collected: 0, open: 0, overdue: 0, target: 0 });

  const byRegion = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach(r => { const k = r.d.region || 'Bölge yok'; m[k] = (m[k] || 0) + r.sellIn; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  if (!dealers.length) {
    return (
      <Card>
        <EmptyState icon={<Store className="h-14 w-14" />} title="Henüz bayi yok"
          description="Müşteriler sayfasında yeni kayıt açarken türünü 'Bayi' seçin; seviye, bölge, vade, fiyat listesi ve kredi limitini girin."
          action={<button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={() => router.push('/customers')}>Bayi Ekle</button>} />
      </Card>
    );
  }

  const periodOptions = [
    { v: cp.month, l: `Bu ay (${periodLabel(cp.month)})` },
    { v: cp.quarter, l: `Bu çeyrek (${periodLabel(cp.quarter)})` },
    { v: cp.year, l: `Bu yıl (${cp.year})` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={period} onChange={e => setPeriod(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
          {periodOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <select value={region} onChange={e => setRegion(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
          <option value="">Tüm Bölgeler</option>{regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={level} onChange={e => setLevel(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
          <option value="">Tüm Seviyeler</option>{levels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card className="p-4"><p className="text-2xl font-bold">{rows.length}</p><p className="text-xs text-slate-500">Bayi</p></Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-blue-600">{tl(tot.sellIn)}</p>
          <p className="text-xs text-slate-500">Bayi siparişleri (KDV hariç)</p>
          {tot.target > 0 && <p className="mt-1 text-[11px] text-slate-400">Hedef {tl(tot.target)} · %{Math.round(tot.sellIn / tot.target * 100)}</p>}
        </Card>
        <Card className="p-4"><p className="text-2xl font-bold text-green-600">{tl(tot.collected)}</p><p className="text-xs text-slate-500">Dönem tahsilatı</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold text-amber-600">{tl(tot.open)}</p><p className="text-xs text-slate-500">Açık alacak (toplam)</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold text-red-600">{tl(tot.overdue)}</p><p className="text-xs text-slate-500">Vadesi geçen</p></Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs">
                <th className="px-4 py-2 font-medium">Bayi</th>
                <th className="px-3 py-2 font-medium">Koşullar</th>
                <th className="px-3 py-2 text-right font-medium">Sipariş</th>
                <th className="px-3 py-2 font-medium">Hedef</th>
                <th className="px-3 py-2 text-right font-medium">Faturalanan</th>
                <th className="px-3 py-2 text-right font-medium">Tahsilat</th>
                <th className="px-3 py-2 text-right font-medium">Açık Alacak</th>
                <th className="px-3 py-2 font-medium">Kredi Kullanımı</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.d.id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.d.name}</div>
                    <div className="text-xs text-slate-500">{[r.d.dealer_code, r.d.dealer_level, r.d.region].filter(Boolean).join(' · ') || '-'}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {termLabel(r.d.payment_term_days)}{n(r.d.base_discount) > 0 ? ` · %${n(r.d.base_discount)}` : ''}
                    <div className="text-slate-400">{priceLists.find(p => p.id === r.d.price_list_id)?.name || 'Ürün fiyatı'}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{tl(r.sellIn)}</td>
                  <td className="min-w-[140px] px-3 py-2">
                    {r.target ? (
                      <>
                        <div className="flex justify-between text-xs"><span>{tl(r.target)}</span><span className={r.achievement! >= 100 ? 'font-semibold text-green-700' : r.achievement! >= 70 ? 'text-amber-700' : 'text-red-600'}>%{Math.round(r.achievement!)}</span></div>
                        <div className="mt-1 h-1.5 rounded bg-slate-200"><div className={`h-1.5 rounded ${r.achievement! >= 100 ? 'bg-green-500' : r.achievement! >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, r.achievement!)}%` }} /></div>
                      </>
                    ) : <span className="text-xs text-slate-400">Hedef yok</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{tl(r.invoiced)}</td>
                  <td className="px-3 py-2 text-right text-green-700">{tl(r.collected)}</td>
                  <td className="px-3 py-2 text-right">
                    {tl(r.open)}
                    {r.overdue > 0 && <div className="flex items-center justify-end gap-1 text-[11px] text-red-600"><AlertTriangle className="h-3 w-3" />{tl(r.overdue)} vadesi geçti</div>}
                  </td>
                  <td className="min-w-[130px] px-3 py-2">
                    {r.creditUse !== null ? (
                      <>
                        <div className="flex justify-between text-xs"><span>{tl(r.limit!)}</span><span className={r.creditUse > 100 ? 'font-semibold text-red-600' : r.creditUse > 80 ? 'text-amber-700' : 'text-slate-600'}>%{Math.round(r.creditUse)}</span></div>
                        <div className="mt-1 h-1.5 rounded bg-slate-200"><div className={`h-1.5 rounded ${r.creditUse > 100 ? 'bg-red-500' : r.creditUse > 80 ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, r.creditUse)}%` }} /></div>
                        {r.creditUse > 100 && <Badge variant="danger" className="mt-1">Limit aşıldı</Badge>}
                      </>
                    ) : <span className="text-xs text-slate-400">Limitsiz</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {byRegion.length > 1 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Bölgelere Göre Bayi Siparişleri — {periodLabel(period)}</h3>
          <div className="space-y-1.5">
            {byRegion.map(([reg, v]) => (
              <div key={reg} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate text-slate-600">{reg}</span>
                <div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded bg-indigo-500" style={{ width: `${tot.sellIn > 0 ? v / tot.sellIn * 100 : 0}%` }} /></div>
                <span className="w-32 shrink-0 text-right font-medium">{tl(v)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
