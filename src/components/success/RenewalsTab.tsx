'use client';

import { useState } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { RefreshCcw, CheckCircle, XCircle, Target } from 'lucide-react';

interface Props { supabase: any; contracts: any[]; customers: any[]; opportunities: any[]; ready: boolean; onChanged: () => void }
const tl = (v: number) => `₺${formatMoney(Math.round(v))}`;
const n = (v: any) => Number(v) || 0;

export default function RenewalsTab({ supabase, contracts, customers, opportunities, ready, onChanged }: Props) {
  const [horizon, setHorizon] = useState(120);
  const today = new Date().toISOString().slice(0, 10);
  const limit = new Date(Date.now() + horizon * 864e5).toISOString().slice(0, 10);
  const cname = (id: string) => customers.find(c => c.id === id)?.name || '-';
  const days = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 864e5);

  const upcoming = contracts.filter(c => c.end_date && !['cancelled', 'renewed', 'draft'].includes(c.status) && !c.renewal_outcome && c.end_date <= limit)
    .sort((a, b) => a.end_date.localeCompare(b.end_date));
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const decided = contracts.filter(c => c.renewal_outcome && c.end_date >= yearAgo);
  const renewed = decided.filter(c => c.renewal_outcome === 'renewed');
  const rate = decided.length ? renewed.length / decided.length * 100 : null;
  const valueRate = decided.length ? renewed.reduce((s, c) => s + n(c.value), 0) / Math.max(1, decided.reduce((s, c) => s + n(c.value), 0)) * 100 : null;
  const next90 = upcoming.filter(c => days(c.end_date) <= 90).reduce((s, c) => s + n(c.value), 0);

  const openOpp = async (c: any) => {
    const cust = customers.find(x => x.id === c.customer_id);
    const { data, error } = await supabase.from('opportunities').insert([{ title: `Yenileme: ${c.title || c.contract_number}`, customer_id: c.customer_id,
      assigned_to: cust?.assigned_to || null, value: n(c.value), probability: 60, stage: 'Keşif', expected_close: c.end_date,
      notes: `${c.contract_number || ''} sözleşmesinin yenilemesi. Bitiş: ${formatDate(c.end_date)}` }]).select().single();
    if (error) { alert(error.message); return; }
    await supabase.from('contracts').update({ renewal_opportunity_id: data.id }).eq('id', c.id);
    alert('Yenileme fırsatı açıldı; Fırsatlar ve Satış Tahmini ekranlarında görünür.'); onChanged();
  };
  const outcome = async (c: any, o: 'renewed' | 'churned') => {
    if (!confirm(o === 'renewed' ? 'Sözleşme yenilendi olarak işaretlensin mi?' : 'Müşteri yenilemedi (kayıp) olarak işaretlensin mi?')) return;
    const { error } = await supabase.from('contracts').update({ renewal_outcome: o, status: o === 'renewed' ? 'renewed' : 'expired' }).eq('id', c.id);
    if (error) alert(error.message); else onChanged();
  };

  if (!ready) return <Card className="p-4 text-sm text-amber-800">musteri-basarisi.sql kurulduktan sonra yenileme takibi açılır.</Card>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><p className="text-2xl font-bold">{upcoming.length}</p><p className="text-xs text-slate-500">{horizon} gün içinde biten sözleşme</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold text-indigo-700">{tl(next90)}</p><p className="text-xs text-slate-500">90 gün içinde yenilenecek tutar</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold text-green-700">{rate === null ? '-' : `%${Math.round(rate)}`}</p><p className="text-xs text-slate-500">Yenileme oranı (12 ay, adet)</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold text-green-700">{valueRate === null ? '-' : `%${Math.round(valueRate)}`}</p><p className="text-xs text-slate-500">Yenileme oranı (tutar)</p></Card>
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Yaklaşan yenilemeler</h3>
          <select value={horizon} onChange={e => setHorizon(Number(e.target.value))} className="h-8 rounded-lg border px-2 text-sm">{[60, 90, 120, 180, 365].map(d => <option key={d} value={d}>{d} gün</option>)}</select>
        </div>
        {upcoming.length === 0 ? <p className="text-sm text-slate-500">Bu aralıkta biten sözleşme yok. Sözleşmeler sayfasında bitiş tarihi girilen kayıtlar burada izlenir.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Sözleşme</th><th>Müşteri</th><th className="text-right">Tutar</th><th>Bitiş</th><th>Yenileme fırsatı</th><th /></tr></thead>
            <tbody>{upcoming.map(c => {
              const d = days(c.end_date); const opp = opportunities.find(o => o.id === c.renewal_opportunity_id);
              return (
                <tr key={c.id} className="border-b">
                  <td className="py-2"><p className="font-medium">{c.title || '-'}</p><p className="text-xs text-slate-400">{c.contract_number}{c.auto_renew ? ' · otomatik yenileme' : ''}</p></td>
                  <td>{cname(c.customer_id)}</td><td className="text-right">{tl(n(c.value))}</td>
                  <td><span className={d < 0 ? 'font-semibold text-red-600' : d <= 30 ? 'font-semibold text-amber-700' : ''}>{formatDate(c.end_date)}</span><p className="text-xs text-slate-400">{d < 0 ? `${-d} gün geçti` : `${d} gün kaldı`}</p></td>
                  <td>{opp ? <Badge variant="info">{opp.stage}</Badge> : <Button size="sm" variant="secondary" onClick={() => openOpp(c)}><Target className="h-3 w-3" />Fırsat aç</Button>}</td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => outcome(c, 'renewed')} title="Yenilendi"><CheckCircle className="h-4 w-4 text-green-600" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => outcome(c, 'churned')} title="Yenilemedi (kayıp)"><XCircle className="h-4 w-4 text-red-500" /></Button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
        <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400"><RefreshCcw className="h-3 w-3" />İyi uygulama: bitişten 90 gün önce yenileme fırsatı açın; memnuniyet anketiyle riskleri önceden görün.</p>
      </Card>
    </div>
  );
}
