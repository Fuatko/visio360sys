'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { periodRange, periodLabel, inRange } from '@/lib/periods';
import { Plug } from 'lucide-react';

const tl = (v: number) => `${v < 0 ? '-' : ''}₺${formatMoney(Math.abs(Math.round(v || 0)))}`;
const n = (v: any) => Number(v) || 0;

// Paraşüt'ten gelen resmî belgelerle (fatura bazlı) kâr / zarar — sipariş bazlı tabloyu doğrulamak için
export default function ParasutPnl({ supabase, period, taxRate, orderRevenue }: { supabase: any; period: string; taxRate: number; orderRevenue: number }) {
  const [docs, setDocs] = useState<any[] | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    (async () => {
      const s = await supabase.rpc('parasut_status');
      setConnected(!!s.data?.connected);
      const { data } = await supabase.from('parasut_documents').select('kind, issue_date, net_total_try, category, customer_id, contact_name').limit(20000);
      setDocs(data || []);
    })();
  }, []);
  const r = periodRange(period);
  const p = useMemo(() => {
    const ds = (docs || []).filter(d => inRange(d.issue_date, r));
    const sum = (k: string) => ds.filter(d => d.kind === k).reduce((a, d) => a + n(d.net_total_try), 0);
    const sales = sum('sales_invoice'), bills = sum('purchase_bill'), salary = sum('salary'), tax = sum('tax'), bank = sum('bank_fee');
    const cats: Record<string, number> = {};
    ds.filter(d => d.kind === 'purchase_bill').forEach(d => { const k = d.category || 'Kategorisiz'; cats[k] = (cats[k] || 0) + n(d.net_total_try); });
    const top: Record<string, number> = {};
    ds.filter(d => d.kind === 'sales_invoice').forEach(d => { const k = d.contact_name || '-'; top[k] = (top[k] || 0) + n(d.net_total_try); });
    const ebt = sales - bills - salary - tax - bank;
    const ctax = Math.max(0, ebt) * taxRate / 100;
    return { sales, bills, salary, tax, bank, ebt, ctax, net: ebt - ctax, cats: Object.entries(cats).sort((a, b) => b[1] - a[1]), top: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 8), count: ds.length };
  }, [docs, period, taxRate]);

  if (docs === null) return <Card className="p-6 text-sm text-slate-500">Yükleniyor…</Card>;
  if (!docs.length) return (
    <Card className="p-6 text-sm text-slate-600">
      <p className="mb-1 flex items-center gap-2 font-semibold"><Plug className="h-4 w-4 text-orange-500" />Paraşüt verisi yok</p>
      {connected ? 'Paraşüt bağlı ama henüz eşitleme yapılmamış.' : 'Fatura bazlı kâr/zarar için Paraşüt hesabınızı bağlayın.'} <Link href="/integrations" className="text-indigo-600">Entegrasyonlar →</Link>
    </Card>
  );
  const Line = ({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: string }) => (
    <div className={`flex items-baseline justify-between border-b py-2 ${strong ? 'font-semibold' : ''}`}><span className={strong ? '' : 'pl-4 text-slate-600'}>{label}</span><span className={tone || (value < 0 && strong ? 'text-red-600' : '')}>{tl(value)}</span></div>
  );
  const diff = orderRevenue ? (p.sales - orderRevenue) / orderRevenue : null;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card className="p-5">
        <h3 className="mb-2 font-semibold">Fatura bazlı kâr / zarar — {periodLabel(period)} <span className="text-xs font-normal text-slate-500">(Paraşüt, KDV hariç, {p.count} belge)</span></h3>
        <Line label="Satış faturaları (iadeler düşülmüş)" value={p.sales} strong />
        <Line label="Alış faturaları (mal + hizmet + giderler)" value={-p.bills} />
        <Line label="Maaşlar" value={-p.salary} />
        <Line label="Vergi / SGK ödemeleri" value={-p.tax} />
        <Line label="Banka masrafları" value={-p.bank} />
        <Line label="Vergi öncesi kâr" value={p.ebt} strong />
        <Line label={`Kurumlar vergisi (tahmini %${taxRate})`} value={-p.ctax} />
        <div className={`mt-2 flex items-baseline justify-between rounded-lg p-3 text-lg font-bold ${p.net >= 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}><span>Net kâr</span><span>{tl(p.net)} <span className="text-sm font-normal">({p.sales ? `%${(p.net / p.sales * 100).toFixed(1)}` : '-'})</span></span></div>
        {diff !== null && Math.abs(diff) > 0.05 && <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">Faturalanan satış, aynı dönemdeki sipariş tutarından %{Math.abs(Math.round(diff * 100))} {diff > 0 ? 'fazla' : 'az'} ({tl(orderRevenue)}). Faturası kesilmemiş siparişleri veya sistemde siparişi olmayan faturaları kontrol edin.</p>}
        <p className="mt-3 text-[11px] text-slate-500">Bu tablo muhasebedeki resmî belgelerden hesaplanır. "Kâr / zarar" sekmesi ise siparişlerden ve ürün maliyetlerinden hesaplanır; ikisini karşılaştırmak fatura ve maliyet kayıtlarındaki eksikleri gösterir. Kesin vergi için mali müşavirinizin hesabı esastır.</p>
      </Card>
      <div className="space-y-4">
        <Card className="p-4"><p className="mb-2 text-sm font-semibold">Alış kategorileri</p>
          {p.cats.length === 0 ? <p className="text-xs text-slate-400">Yok</p> : p.cats.slice(0, 10).map(([k, v]) => <div key={k} className="flex justify-between border-b py-1 text-sm"><span>{k}</span><span>{tl(v)}</span></div>)}</Card>
        <Card className="p-4"><p className="mb-2 text-sm font-semibold">En çok faturalanan müşteriler</p>
          {p.top.map(([k, v]) => <div key={k} className="flex justify-between border-b py-1 text-sm"><span className="truncate pr-2">{k}</span><span>{tl(v)}</span></div>)}</Card>
      </div>
    </div>
  );
}
