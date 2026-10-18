'use client';

// Satınalma KPI'ları: süreler, teklif disiplini, tasarruf, zamanında teslim, siparişsiz alım, bütçe, tedarikçi notları
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Button } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { createClient } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetch-all';
import { PROCURE_SQL_1D, downloadCsv, fiscalYearOf, tl } from '@/lib/procure';
import { Download } from 'lucide-react';

export default function ReportsPage() {
  return (
    <div>
      <Header title="Satınalma Raporları" subtitle="Satınalma" />
      <ProcureGate>{p => (p.hasRole('finance') || p.hasRole('buyer') || p.isAdmin) ? <Reports /> : <div className="p-6"><Card className="p-6 text-center text-sm text-slate-600">Raporlar mali işler, satınalma ve yönetici içindir.</Card></div>}</ProcureGate>
    </div>
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const pct = (v: any) => (v == null ? '—' : `%${Number(v).toLocaleString('tr-TR')}`);
const num = (v: any, unit = '') => (v == null ? '—' : `${Number(v).toLocaleString('tr-TR')}${unit}`);

function Reports() {
  const supabase = createClient();
  const [startMonth, setStartMonth] = useState(9);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [k, setK] = useState<any>(null);
  const [vendors, setVendors] = useState<any[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    supabase.from('proc_policies').select('fiscal_year_start_month').maybeSingle().then(({ data }) => {
      const m = data?.fiscal_year_start_month || 9; setStartMonth(m);
      const fy = fiscalYearOf(new Date(), m); setRange({ from: `${fy.slice(0, 4)}-${String(m).padStart(2, '0')}-01`, to: iso(new Date()) });
    });
  }, []);
  useEffect(() => {
    if (!range) return;
    (async () => {
      const { data, error } = await supabase.rpc('proc_kpis', { p_from: range.from, p_to: range.to });
      if (error) { setMissing(/does not exist|Could not find/i.test(error.message)); return; }
      setK(data);
      const os = await fetchAll(() => supabase.from('proc_orders').select('vendor_id, subtotal, is_retroactive, vendor:vendor_id(name)').neq('status', 'cancelled').gte('order_date', range.from).lte('order_date', range.to));
      const m = new Map<string, any>();
      os.forEach((o: any) => { const x = m.get(o.vendor_id) || { name: o.vendor?.name, spend: 0, orders: 0, retro: 0 }; x.spend += Number(o.subtotal); x.orders++; if (o.is_retroactive) x.retro++; m.set(o.vendor_id, x); });
      setVendors([...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.spend - a.spend));
    })();
  }, [range?.from, range?.to]);

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1D} /></div>;
  if (!range || !k) return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;
  const fy = fiscalYearOf(new Date(), startMonth);
  const presets = [
    { label: `${fy} bütçe yılı`, from: `${fy.slice(0, 4)}-${String(startMonth).padStart(2, '0')}-01`, to: iso(new Date()) },
    { label: 'Son 90 gün', from: iso(new Date(Date.now() - 90 * 864e5)), to: iso(new Date()) },
    { label: 'Son 12 ay', from: iso(new Date(Date.now() - 365 * 864e5)), to: iso(new Date()) },
  ];
  const v = k.vendors || {};
  const tiles: [string, string, string?][] = [
    ['Talep → sipariş süresi', num(k.request_to_order_days, ' gün'), 'Talebin gönderilmesinden siparişe'],
    ['Onay süresi', num(k.approval_days, ' gün'), `${k.approved_requests || 0} onaylı talep`],
    ['Ortalama teklif sayısı', num(k.avg_quotes), `${k.awarded_rfqs || 0} sonuçlanan RFQ`],
    ['3 teklif kuralına uyum', pct(k.three_quote_pct), `${k.three_quote_ok || 0}/${k.three_quote_required || 0} RFQ`],
    ['Tasarruf', tl(k.savings), k.savings_pct != null ? `en yüksek teklife göre ${pct(k.savings_pct)}` : undefined],
    ['Zamanında teslim', pct(k.on_time_pct), `${k.deliveries || 0} tamamlanan sipariş`],
    ['Siparişsiz alım', pct(k.unordered_pct), `${tl(k.unordered_total)} / ${tl(k.vendor_invoice_total)} · ${k.unordered_count || 0} fatura`],
    ['Bütçe kullanımı', pct(k.budget_used_pct), `${k.fiscal_year}: ${tl(k.budget_used)} / ${tl(k.budget_total)}`],
    ['Sipariş harcaması', tl(k.order_spend), `${k.orders || 0} sipariş (KDV hariç)`],
  ];
  const csv = () => downloadCsv(`satinalma-kpi-${range.from}-${range.to}.csv`, [['Gösterge', 'Değer', 'Açıklama'], ...tiles.map(t => [t[0], t[1], t[2] || '']),
    ['Tedarikçi (toplam)', v.total, `Onaylı ${v.approved}, şartlı ${v.conditional}, bloke ${v.blocked}, aday ${v.candidate}`], ['Not dağılımı', `A ${v.A} · B ${v.B} · C ${v.C} · D ${v.D}`, `notsuz ${v.ungraded}`],
    [], ['Tedarikçi', 'Harcama (KDV hariç)', 'Sipariş', 'Sonradan sipariş'], ...vendors.map(x => [x.name, Math.round(x.spend), x.orders, x.retro])]);

  return (
    <div className="space-y-3 p-3 sm:p-6">
      <div className="flex flex-wrap items-end gap-2">
        {presets.map(p => <button key={p.label} onClick={() => setRange({ from: p.from, to: p.to })} className={`rounded-full border px-3 py-1 text-xs ${range.from === p.from && range.to === p.to ? 'border-[#1B3A5C] bg-[#1B3A5C] text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{p.label}</button>)}
        <label className="text-xs text-slate-600">Başlangıç<input type="date" className="block h-8 rounded-lg border border-slate-200 px-2 text-sm" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></label>
        <label className="text-xs text-slate-600">Bitiş<input type="date" className="block h-8 rounded-lg border border-slate-200 px-2 text-sm" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></label>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={csv}><Download className="h-3.5 w-3.5" />CSV</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([t, val, sub]) => <Card key={t} className="p-4"><p className="text-xs text-slate-500">{t}</p><p className="mt-1 text-2xl font-bold text-slate-800">{val}</p>{sub && <p className="text-[11px] text-slate-500">{sub}</p>}</Card>)}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-slate-800">Tedarikçiler ve not dağılımı</p>
          <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">
            {[['Toplam', v.total], ['Onaylı', v.approved], ['Şartlı onaylı', v.conditional], ['Bloke', v.blocked], ['Aday', v.candidate]].map(([a, b]) => <tr key={a as string}><td className="py-1.5 text-slate-600">{a}</td><td className="py-1.5 text-right font-medium">{b ?? 0}</td></tr>)}
            <tr><td className="py-1.5 text-slate-600">Notlar</td><td className="py-1.5 text-right font-medium">A {v.A ?? 0} · B {v.B ?? 0} · C {v.C ?? 0} · D {v.D ?? 0} · notsuz {v.ungraded ?? 0}</td></tr>
          </tbody></table>
          <Link href="/procure/tedarikciler/onayli-liste/print" target="_blank" className="mt-2 inline-block text-xs text-blue-700">Onaylı Tedarikçi Listesi →</Link>
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-slate-800">Tedarikçi bazında harcama</p>
          {vendors.length === 0 ? <p className="text-xs text-slate-400">Bu aralıkta sipariş yok.</p> : (
            <table className="w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Tedarikçi</th><th className="py-1 text-right">Harcama</th><th className="py-1 text-right">Sipariş</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{vendors.slice(0, 10).map(x => <tr key={x.id}><td className="py-1.5"><Link href={`/procure/tedarikciler/${x.id}`} className="hover:text-blue-700">{x.name}</Link>{x.retro > 0 && <span className="ml-1 text-[11px] text-amber-700">({x.retro} sonradan)</span>}</td><td className="py-1.5 text-right">{tl(x.spend)}</td><td className="py-1.5 text-right">{x.orders}</td></tr>)}</tbody></table>
          )}
        </Card>
      </div>
      <p className="text-[11px] text-slate-400">Siparişsiz alım: Procure tedarikçilerinin aralıktaki Paraşüt alış faturalarından bir siparişle eşleşmeyenlerin (sonradan açılan siparişler dahil) tutar payı. Tasarruf: ödül verilen kalemlerde en yüksek geçerli teklif ile ödül arasındaki fark.</p>
    </div>
  );
}
