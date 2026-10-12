'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { periodRange, periodLabel, inRange } from '@/lib/periods';
import { accuracy } from '@/lib/forecast-model';
import { isWon } from '@/lib/pipeline';
import { Target } from 'lucide-react';

const tl = (v: number) => `₺${formatMoney(Math.round(v || 0))}`;
const n = (v: any) => Number(v) || 0;
const pct = (v: number | null) => (v === null ? '-' : `%${Math.round(v * 100)}`);
const accTone = (v: number | null) => (v === null ? '' : v >= 0.85 ? 'text-green-700' : v >= 0.7 ? 'text-amber-700' : 'text-red-600');

export default function ForecastAccuracy({ subs, opps, team }: { subs: any[]; opps: any[]; team: any[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const pname = (id: string) => team.find(t => t.id === id)?.name || 'Atanmamış';

  const rows = useMemo(() => {
    const periods = Array.from(new Set(subs.map(s => s.period))).filter(p => { const r = periodRange(p); return r && r[1] < today; }).sort().reverse();
    const out: any[] = [];
    periods.forEach(p => {
      const r = periodRange(p)!;
      const ps = subs.filter(s => s.period === p && s.week_start <= r[1]);
      Array.from(new Set(ps.map(s => s.sales_person_id))).forEach(rep => {
        const final = ps.filter(s => s.sales_person_id === rep).sort((a, b) => b.week_start.localeCompare(a.week_start))[0];
        const first = ps.filter(s => s.sales_person_id === rep).sort((a, b) => a.week_start.localeCompare(b.week_start))[0];
        const actual = opps.filter(o => (o.assigned_to || '') === rep && isWon(o.stage) && inRange(String(o.closed_at || o.expected_close || '').slice(0, 10), r)).reduce((a, o) => a + n(o.value), 0);
        const call = n(final.manager_commit ?? final.commit_amount);
        out.push({ period: p, rep, call, repCall: n(final.commit_amount), first: n(first.manager_commit ?? first.commit_amount), system: n(final.system_commit), model: n(final.model_expected), actual,
          acc: accuracy(call, actual), accFirst: accuracy(n(first.manager_commit ?? first.commit_amount), actual), accModel: final.model_expected !== null ? accuracy(n(final.model_expected), actual) : null,
          accSystem: final.system_commit !== null ? accuracy(n(final.system_commit), actual) : null, weeks: ps.filter(s => s.sales_person_id === rep).length });
      });
    });
    return out;
  }, [subs, opps]);

  const reps = useMemo(() => {
    const ids = Array.from(new Set(rows.map(r => r.rep)));
    return ids.map(id => {
      const mine = rows.filter(r => r.rep === id);
      const avg = (f: (r: any) => number | null) => { const v = mine.map(f).filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      return { id, n: mine.length, acc: avg(r => r.acc.acc), bias: avg(r => r.acc.bias), model: avg(r => r.accModel?.acc ?? null) };
    }).sort((a, b) => (b.acc ?? 0) - (a.acc ?? 0));
  }, [rows]);

  const teamAvg = (key: 'acc' | 'accModel' | 'accSystem') => {
    const v = rows.map(r => (key === 'acc' ? r.acc.acc : r[key]?.acc ?? null)).filter((x: any) => x !== null) as number[];
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  if (rows.length === 0) return (
    <Card className="p-6 text-sm text-slate-600">
      <p className="mb-1 flex items-center gap-2 font-semibold"><Target className="h-4 w-4 text-indigo-600" />Tahmin isabeti burada ölçülecek</p>
      Temsilciler "Tahmin çağrısı" sekmesinden haftalık tahmin gönderdikçe, dönem kapandığında her tahmin gerçekleşenle karşılaştırılır: kim iyimser, kim temkinli, model mi temsilci mi daha isabetli — hepsi burada görünür.
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-slate-500">Ekip tahmini isabeti (son gönderim)</p><p className={`text-2xl font-bold ${accTone(teamAvg('acc'))}`}>{pct(teamAvg('acc'))}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Model isabeti</p><p className={`text-2xl font-bold ${accTone(teamAvg('accModel'))}`}>{pct(teamAvg('accModel'))}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Sistem (kategori) isabeti</p><p className={`text-2xl font-bold ${accTone(teamAvg('accSystem'))}`}>{pct(teamAvg('accSystem'))}</p></Card>
      </div>

      <Card className="p-4">
        <p className="mb-2 text-sm font-semibold">Temsilci bazında tahmin karnesi</p>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Temsilci</th><th className="text-right">Dönem</th><th className="text-right">Ort. isabet</th><th className="text-right">Model isabeti</th><th className="pl-4">Eğilim</th></tr></thead>
          <tbody>{reps.map(r => (
            <tr key={r.id} className="border-b">
              <td className="py-1.5 font-medium">{pname(r.id)}</td><td className="text-right">{r.n}</td>
              <td className={`text-right font-semibold ${accTone(r.acc)}`}>{pct(r.acc)}</td><td className={`text-right ${accTone(r.model)}`}>{pct(r.model)}</td>
              <td className="pl-4 text-xs">{r.bias === null ? '-' : Math.abs(r.bias) < 0.1 ? 'Dengeli' : r.bias > 0 ? `İyimser (ortalama +%${Math.round(r.bias * 100)})` : `Temkinli (ortalama −%${Math.round(-r.bias * 100)})`}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-sm font-semibold">Dönem detayları</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Dönem</th><th>Temsilci</th><th className="text-right">İlk tahmin</th><th className="text-right">Son tahmin</th><th className="text-right">Model</th><th className="text-right">Gerçekleşen</th><th className="text-right">İsabet</th><th className="text-right">Model isabeti</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.period + r.rep} className="border-b">
                <td className="py-1.5">{periodLabel(r.period)}</td><td>{pname(r.rep)}<span className="text-[11px] text-slate-400"> · {r.weeks} hafta</span></td>
                <td className="text-right text-slate-500">{tl(r.first)}</td><td className="text-right">{tl(r.call)}</td><td className="text-right text-emerald-700">{tl(r.model)}</td>
                <td className="text-right font-semibold">{tl(r.actual)}</td>
                <td className={`text-right font-semibold ${accTone(r.acc.acc)}`}>{pct(r.acc.acc)}</td><td className={`text-right ${accTone(r.accModel?.acc ?? null)}`}>{pct(r.accModel?.acc ?? null)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">İsabet = 1 − |tahmin − gerçekleşen| / gerçekleşen. Son tahmin, dönem bitmeden önceki son haftalık gönderimdir (yönetici düzeltmesi varsa o).</p>
      </Card>
    </div>
  );
}
