'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { formatMoney } from '@/lib/utils';
import { loadPlansOverview, yearRevenue } from '@/lib/account-plans';
import { ClipboardList, AlertTriangle, Target, TrendingUp, ListChecks, ArrowRight } from 'lucide-react';

const n = (v: any) => Number(v) || 0;
const tl = (v: any) => `₺${formatMoney(Math.round(n(v)))}`;
const ST = { ahead: ['Önde', 'bg-emerald-50 text-emerald-700 border-emerald-200'], on_track: ['Hedefte', 'bg-slate-50 text-slate-700 border-slate-200'], behind: ['Geride', 'bg-rose-50 text-rose-700 border-rose-200'], none: ['Hedef yok', 'bg-slate-50 text-slate-400 border-slate-200'] } as const;
const STATUS: Record<string, string> = { draft: 'Taslak', active: 'Aktif', closed: 'Kapandı' };

export default function AccountPlansPage() {
  const supabase = createClient();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [d, setD] = useState<Awaited<ReturnType<typeof loadPlansOverview>> | null>(null);
  const [custs, setCusts] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);

  const load = useCallback(async () => {
    setD(null);
    const [o, c, t] = await Promise.all([loadPlansOverview(supabase, year), supabase.from('customers').select('id, name, assigned_to, is_key_account, status, merged_into').order('name'), supabase.from('sales_team').select('id, name').order('name')]);
    setD(o); setCusts(c.data || []); setTeam(t.data || []);
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const sum = useMemo(() => {
    if (!d) return null;
    const target = d.rows.reduce((a, r) => a + n(r.plan.revenue_target), 0);
    const actual = d.rows.reduce((a, r) => a + r.actual, 0);
    return { target, actual, behind: d.rows.filter(r => r.pr.state === 'behind').length, overdue: d.rows.reduce((a, r) => a + r.actOverdue, 0), acts: d.rows.reduce((a, r) => a + r.actTotal, 0), done: d.rows.reduce((a, r) => a + r.actDone, 0) };
  }, [d]);
  const missing = useMemo(() => {
    if (!d) return [];
    const has = new Set(d.rows.map(r => r.plan.customer_id));
    return custs.filter(c => !c.merged_into && c.status !== 'Pasif' && !has.has(c.id))
      .map(c => ({ ...c, prev: yearRevenue(d.ws, c.id, year - 1), cur: yearRevenue(d.ws, c.id, year) }))
      .filter(c => c.prev > 0 || c.cur > 0 || c.is_key_account || c.status === 'VIP')
      .sort((a, b) => (b.prev + b.cur) - (a.prev + a.cur));
  }, [d, custs, year]);
  const name = (id: string) => custs.find(c => c.id === id)?.name || '—';

  return (
    <div>
      <Header title="Yıllık Hesap Planları" />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto max-w-3xl text-sm text-slate-600">Önemli müşterileriniz için yıllık ciro hedefi, kategori büyüme hedefleri, strateji, riskler ve çeyrek aksiyonları. Gerçekleşenler Paraşüt faturalarından ve siparişlerden (KDV hariç) otomatik gelir.</p>
          <div className="flex rounded-lg border bg-white p-0.5 text-sm">
            {[thisYear - 1, thisYear, thisYear + 1].map(y => <button key={y} onClick={() => setYear(y)} className={`rounded-md px-3 py-1 ${y === year ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{y}</button>)}
          </div>
        </div>

        {d && !d.ready && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />Hesap planları için <b>hesap-plani.sql</b> dosyasını Supabase'de çalıştırın.</Card>}

        {sum && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><ClipboardList className="h-3.5 w-3.5" />Plan</p><p className="mt-1 text-xl font-bold">{d!.rows.length}</p><p className="text-[11px] text-slate-400">{missing.length} önemli müşteride plan yok</p></Card>
            <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><Target className="h-3.5 w-3.5" />Planlı müşterilerde hedef</p><p className="mt-1 text-xl font-bold">{tl(sum.target)}</p><p className="text-[11px] text-slate-400">Gerçekleşen {tl(sum.actual)}{sum.target ? ` · %${Math.round(sum.actual / sum.target * 100)}` : ''}</p></Card>
            <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><TrendingUp className="h-3.5 w-3.5" />Hedefin gerisinde</p><p className={`mt-1 text-xl font-bold ${sum.behind ? 'text-rose-600' : ''}`}>{sum.behind}</p><p className="text-[11px] text-slate-400">Yılın geçen kısmına göre</p></Card>
            <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><ListChecks className="h-3.5 w-3.5" />Aksiyonlar</p><p className="mt-1 text-xl font-bold">{sum.done}/{sum.acts}</p><p className={`text-[11px] ${sum.overdue ? 'text-rose-600' : 'text-slate-400'}`}>{sum.overdue ? `${sum.overdue} aksiyon gecikti` : 'Geciken aksiyon yok'}</p></Card>
          </div>
        )}

        <Card className="overflow-hidden">
          <div className="border-b px-4 py-3"><p className="text-sm font-semibold">{year} planları</p></div>
          {!d ? <div className="flex h-32 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div>
            : d.rows.length === 0 ? <p className="p-4 text-sm text-slate-500">{year} için henüz plan yok. Aşağıdaki müşterilerden birinde "Plan oluştur" ile başlayın.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Müşteri</th><th className="px-2 py-2 font-medium">Sahibi</th><th className="px-2 py-2 text-right font-medium">Hedef</th><th className="px-2 py-2 text-right font-medium">Gerçekleşen</th>
                  <th className="px-2 py-2 font-medium">İlerleme</th><th className="px-2 py-2 text-right font-medium">Yıl sonu tahmini</th><th className="px-2 py-2 text-right font-medium">{year - 1}</th><th className="px-2 py-2 text-center font-medium">Aksiyon</th><th /></tr></thead>
                <tbody>{d.rows.sort((a, b) => n(b.plan.revenue_target) - n(a.plan.revenue_target)).map(r => (
                  <tr key={r.plan.id} className="border-b last:border-0">
                    <td className="px-4 py-2"><Link href={`/customers/${r.plan.customer_id}?tab=plan`} className="font-medium hover:text-indigo-700">{name(r.plan.customer_id)}</Link>{r.plan.status !== 'active' && <span className="ml-1 text-[11px] text-slate-400">{STATUS[r.plan.status]}</span>}</td>
                    <td className="px-2 py-2 text-slate-600">{team.find(t => t.id === r.plan.owner_id)?.name || '—'}</td>
                    <td className="px-2 py-2 text-right">{r.plan.revenue_target ? tl(r.plan.revenue_target) : '—'}</td>
                    <td className="px-2 py-2 text-right font-medium">{tl(r.actual)}</td>
                    <td className="px-2 py-2"><div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded bg-slate-100"><div className={`h-1.5 rounded ${r.pr.state === 'behind' ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (r.pr.pct || 0) * 100)}%` }} /></div>
                      <span className={`rounded-full border px-1.5 text-[10px] ${ST[r.pr.state][1]}`}>{r.pr.pct !== null ? `%${Math.round(r.pr.pct * 100)} · ` : ''}{ST[r.pr.state][0]}</span></div></td>
                    <td className="px-2 py-2 text-right">{tl(r.pr.projection)}</td>
                    <td className="px-2 py-2 text-right text-slate-500">{tl(r.prev)}</td>
                    <td className="px-2 py-2 text-center text-xs">{r.actDone}/{r.actTotal}{r.actOverdue ? <span className="block text-rose-600">{r.actOverdue} gecikti</span> : null}</td>
                    <td className="px-3"><Link href={`/customers/${r.plan.customer_id}?tab=plan`} className="text-indigo-600"><ArrowRight className="h-4 w-4" /></Link></td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </Card>

        {d && d.ready && missing.length > 0 && (
          <Card className="overflow-hidden">
            <div className="border-b px-4 py-3"><p className="text-sm font-semibold">Planı olmayan önemli müşteriler</p><p className="text-xs text-slate-500">{year - 1} veya {year} cirosu olan, kilit ya da VIP müşteriler</p></div>
            <div className="divide-y">{missing.slice(0, 12).map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <Link href={`/customers/${c.id}`} className="min-w-0 flex-1 font-medium hover:text-indigo-700">{c.name}</Link>
                <span className="text-xs text-slate-500">{year - 1}: {tl(c.prev)} · {year}: {tl(c.cur)}</span>
                <Link href={`/customers/${c.id}?tab=plan`}><Button size="sm" variant="secondary">Plan oluştur</Button></Link>
              </div>))}</div>
          </Card>
        )}
      </div>
    </div>
  );
}
