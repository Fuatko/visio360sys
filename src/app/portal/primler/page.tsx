'use client';

import { usePortal, PortalTitle } from '@/components/portal/PortalShell';
import { usePortalSales } from '@/components/portal/usePortalSales';
import { Bar, StatusBadge } from '@/components/portal/common';
import { formatMoney, formatDate } from '@/lib/utils';
import { n, REBATE_PAYOUT_STATUS } from '@/lib/portal';
import { BASIS_LABEL, CALC_MODE_LABEL, PAYOUT_LABEL } from '@/lib/rebates';
import { periodRange, periodLabel, inRange } from '@/lib/periods';
import { orderNetAmount } from '@/lib/sales-flow';
import { Target, Trophy, CheckCircle2 } from 'lucide-react';

const tl = (v: number) => `₺${formatMoney(v)}`;

export default function PortalRebates() {
  const { supabase, me } = usePortal();
  const { orders, targets, programs, loading } = usePortalSales(supabase, me.dealer.id);
  const active = orders.filter(o => o.status !== 'cancelled');
  const salesIn = (p: string) => active.filter(o => inRange(o.order_date, periodRange(p))).reduce((s, o) => s + orderNetAmount(o), 0);

  if (loading) return <p className="text-sm text-slate-500">Yükleniyor…</p>;

  return (
    <div className="space-y-5">
      <PortalTitle title="Hedef & Ciro Primi" subtitle="Hedeflerinizi, prim basamaklarını ve hak ettiğiniz primi anlık takip edin." />

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-indigo-600" />Satış hedeflerim</h2>
        {targets.length === 0 ? <p className="text-sm text-slate-500">Size tanımlı hedef yok.</p> : (
          <div className="space-y-3">
            {targets.map((t: any) => {
              const a = salesIn(t.period);
              const pct = n(t.target_amount) > 0 ? a / n(t.target_amount) * 100 : 0;
              return (
                <div key={t.period}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{periodLabel(t.period)}</span>
                    <span>{tl(a)} / {tl(n(t.target_amount))} · <b className={pct >= 100 ? 'text-green-700' : ''}>%{Math.round(pct)}</b></span></div>
                  <Bar pct={pct} />
                  {pct < 100 && <p className="mt-0.5 text-xs text-slate-500">Hedefe {tl(n(t.target_amount) - a)} kaldı (KDV hariç sipariş).</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {programs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Size tanımlı ciro primi programı yok.</div>
      ) : programs.map(({ program, tiers, result, payout }) => {
        const sorted = [...tiers].sort((a, b) => n(a.threshold) - n(b.threshold));
        const maxT = Math.max(...sorted.map(t => n(t.threshold)), 1);
        return (
          <div key={program.id} className="rounded-xl border border-amber-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-amber-500" />{program.name}</h2>
                <p className="text-xs text-slate-500">{formatDate(program.period_start)} – {formatDate(program.period_end)} · {BASIS_LABEL[program.basis]} · {CALC_MODE_LABEL[program.calc_mode]}</p>
                {program.description && <p className="mt-1 text-sm text-slate-600">{program.description}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Hak edilen prim</p>
                <p className="text-2xl font-bold text-green-700">{tl(result.rebate)}</p>
                <p className="text-xs text-slate-400">Ödeme: {PAYOUT_LABEL[program.payout_method || 'credit_note']}</p>
              </div>
            </div>
            <div className="relative mb-1 mt-4">
              <Bar pct={result.achieved / maxT * 100} tone="bg-amber-500" />
              {sorted.map(t => (
                <div key={t.id} className="absolute -top-1 h-4 w-0.5 bg-slate-500" style={{ left: `${Math.min(100, n(t.threshold) / maxT * 100)}%` }} />
              ))}
            </div>
            <p className="mb-3 text-sm">Gerçekleşen: <b>{tl(result.achieved)}</b>
              {result.next ? <> · Sonraki basamağa <b className="text-amber-700">{tl(result.toNext)}</b> kaldı → prim <b>{tl(result.nextRebate)}</b> olur (+{tl(result.nextRebate - result.rebate)})</> : ' · En üst basamaktasınız'}</p>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-1">Basamak (ciro)</th><th className="text-right">Prim oranı</th><th className="text-right">Ek bonus</th><th /></tr></thead>
              <tbody>
                {sorted.map(t => {
                  const reached = result.achieved >= n(t.threshold);
                  return (
                    <tr key={t.id} className={`border-b ${result.current?.id === t.id ? 'bg-amber-50 font-medium' : ''}`}>
                      <td className="py-1.5">{tl(n(t.threshold))} ve üzeri</td>
                      <td className="text-right">%{n(t.rate_pct)}</td>
                      <td className="text-right">{n(t.bonus_amount) ? tl(n(t.bonus_amount)) : '-'}</td>
                      <td className="w-8 text-right">{reached && <CheckCircle2 className="ml-auto h-4 w-4 text-green-600" />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {payout && (
              <p className="mt-2 text-sm">Kesinleşen prim: <b>{tl(n(payout.rebate_amount))}</b> <StatusBadge map={REBATE_PAYOUT_STATUS} value={payout.status} />
                {payout.reference ? <span className="text-xs text-slate-500"> · {payout.reference}</span> : null}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
