'use client';

import { useEffect, useState } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { n } from '@/lib/portal';
import { currentPeriods, periodRange, inRange, periodLabel } from '@/lib/periods';
import { orderNetAmount } from '@/lib/sales-flow';
import { ArrowUp, ArrowDown, Minus, Info } from 'lucide-react';

interface Props { supabase: any; dealers: any[]; orders: any[]; collections: any[]; targets: any[]; onChanged: () => void }

const WEIGHTS = { target: 30, payment: 25, growth: 15, reporting: 10, training: 10, leads: 10 };
const LABELS: Record<string, string> = { target: 'Hedef', payment: 'Ödeme disiplini', growth: 'Büyüme', reporting: 'Raporlama', training: 'Eğitim', leads: 'Lead yanıtı' };
const LEVEL_ORDER = ['Bronz', 'Gümüş', 'Altın', 'Platin'];
const suggest = (s: number) => s >= 85 ? 'Platin' : s >= 70 ? 'Altın' : s >= 50 ? 'Gümüş' : 'Bronz';
const clamp = (v: number) => Math.max(0, Math.min(100, v));

export default function DealerScorecard({ supabase, dealers, orders, collections, targets, onChanged }: Props) {
  const cp = currentPeriods();
  const [extra, setExtra] = useState<{ sellout: any[]; stock: any[]; trainings: any[]; comps: any[]; leads: any[] } | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('dealer_sellout').select('dealer_id, sale_date'),
      supabase.from('dealer_stock').select('dealer_id, snapshot_date'),
      supabase.from('dealer_trainings').select('id, is_required, required_level, is_active'),
      supabase.from('dealer_training_completions').select('dealer_id, training_id'),
      supabase.from('dealer_lead_assignments').select('dealer_id, created_at, respond_by, responded_at, status'),
    ]).then(([s, st, t, c, l]: any) => setExtra({ sellout: s.data || [], stock: st.data || [], trainings: t.data || [], comps: c.data || [], leads: l.data || [] }));
  }, []);

  if (!extra) return <Card className="p-4 text-sm text-slate-500">Hesaplanıyor…</Card>;

  const today = new Date().toISOString().slice(0, 10);
  const fresh = new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10);
  const q = periodRange(cp.quarter)!;
  const lyQ = [String(+q[0].slice(0, 4) - 1) + q[0].slice(4), String(+q[1].slice(0, 4) - 1) + q[1].slice(4)] as [string, string];
  const qElapsed = Math.max(0.05, (Date.now() - new Date(q[0]).getTime()) / (new Date(q[1]).getTime() - new Date(q[0]).getTime()));
  const lyToDate: [string, string] = [lyQ[0], new Date(new Date(lyQ[0]).getTime() + (new Date(lyQ[1]).getTime() - new Date(lyQ[0]).getTime()) * qElapsed).toISOString().slice(0, 10)];

  const rows = dealers.map(d => {
    const ord = orders.filter(o => o.customer_id === d.id && !['cancelled', 'İptal'].includes(o.status));
    const sales = (r: [string, string]) => ord.filter(o => inRange(o.order_date || o.created_at, r)).reduce((s, o) => s + orderNetAmount(o), 0);
    const qs = sales(q);
    const s: Record<string, number | null> = {};
    const t = targets.find(x => x.dealer_id === d.id && x.period === cp.quarter);
    s.target = t && n(t.target_amount) > 0 ? clamp(qs / (n(t.target_amount) * qElapsed) * 100) : null;   // dönemin geçen kısmına göre
    const col = collections.filter(c => c.customer_id === d.id && !['Ödendi', 'paid'].includes(c.status));
    const open = col.reduce((a, c) => a + n(c.amount), 0);
    const overdue = col.filter(c => c.due_date && c.due_date < today).reduce((a, c) => a + n(c.amount), 0);
    s.payment = open > 0 ? clamp(100 - overdue / open * 100) : (ord.length ? 100 : null);
    const ly = sales(lyToDate);
    s.growth = ly > 0 ? clamp(50 + (qs / ly - 1) * 250) : null;   // %+20 → 100, %0 → 50, %-20 → 0
    const lastS = extra.sellout.some(x => x.dealer_id === d.id && x.sale_date >= fresh);
    const lastK = extra.stock.some(x => x.dealer_id === d.id && x.snapshot_date >= fresh);
    s.reporting = (lastS ? 50 : 0) + (lastK ? 50 : 0);
    const req = extra.trainings.filter(x => x.is_active && x.is_required && (!x.required_level || x.required_level === d.dealer_level));
    s.training = req.length ? req.filter(x => extra.comps.some(c => c.dealer_id === d.id && c.training_id === x.id)).length / req.length * 100 : null;
    const ld = extra.leads.filter(x => x.dealer_id === d.id && x.status !== 'expired');
    s.leads = ld.length ? ld.filter(x => x.responded_at && (!x.respond_by || x.responded_at <= x.respond_by)).length / ld.length * 100 : null;

    let w = 0, sum = 0;
    (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).forEach(k => { if (s[k] !== null) { w += WEIGHTS[k]; sum += (s[k] as number) * WEIGHTS[k]; } });
    const score = w ? sum / w : 0;
    return { d, s, score, sug: suggest(score) };
  }).sort((a, b) => b.score - a.score);

  const applyLevel = async (id: string, level: string) => {
    if (!confirm(`Bayi seviyesi "${level}" olarak güncellensin mi? Seviyeye bağlı iskonto kuralları ve prim programları yeni seviyeye göre uygulanır.`)) return;
    const { error } = await supabase.from('customers').update({ dealer_level: level }).eq('id', id);
    if (error) alert(error.message); else onChanged();
  };

  const cell = (v: number | null) => v === null ? <span className="text-slate-300">–</span>
    : <span className={v >= 80 ? 'text-green-700' : v >= 50 ? 'text-amber-700' : 'text-red-600'}>{Math.round(v)}</span>;

  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Bayi Karnesi — {periodLabel(cp.quarter)}</h3>
      </div>
      <p className="mb-3 flex gap-1 text-xs text-slate-500"><Info className="h-3 w-3 shrink-0" />
        Puan 0–100: {Object.entries(WEIGHTS).map(([k, w]) => `${LABELS[k]} %${w}`).join(' · ')}. Verisi olmayan kriter hesaba katılmaz. Seviye önerisi: 85+ Platin, 70+ Altın, 50+ Gümüş.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500">
            <th className="py-2">Bayi</th>{Object.keys(WEIGHTS).map(k => <th key={k} className="text-right">{LABELS[k]}</th>)}<th className="text-right">Puan</th><th>Seviye</th><th />
          </tr></thead>
          <tbody>
            {rows.map(r => {
              const cur = LEVEL_ORDER.indexOf(r.d.dealer_level || ''); const sug = LEVEL_ORDER.indexOf(r.sug);
              return (
                <tr key={r.d.id} className="border-b">
                  <td className="py-2 font-medium">{r.d.name}</td>
                  {Object.keys(WEIGHTS).map(k => <td key={k} className="text-right">{cell(r.s[k])}</td>)}
                  <td className="text-right"><span className={`rounded px-2 py-0.5 font-bold ${r.score >= 70 ? 'bg-green-50 text-green-700' : r.score >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{Math.round(r.score)}</span></td>
                  <td className="whitespace-nowrap text-xs">
                    {r.d.dealer_level || '-'} {cur === sug ? <Minus className="inline h-3 w-3 text-slate-400" /> : sug > cur ? <ArrowUp className="inline h-3 w-3 text-green-600" /> : <ArrowDown className="inline h-3 w-3 text-red-500" />} <Badge variant={sug > cur ? 'success' : sug < cur ? 'danger' : 'default'}>{r.sug}</Badge>
                  </td>
                  <td className="text-right">{cur !== sug && <Button size="sm" variant="ghost" onClick={() => applyLevel(r.d.id, r.sug)}>Uygula</Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
