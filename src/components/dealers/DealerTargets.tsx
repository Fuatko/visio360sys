'use client';

import { Card, Button, Input, Select, Modal } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { Plus, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { orderNetAmount } from '@/lib/sales-flow';
import { periodRange, currentPeriods, periodLabel, inRange } from '@/lib/periods';

interface Props {
  supabase: any;
  targets: any[];
  dealers: any[];
  orders: any[];
  onChanged: () => void;
}

const n = (v: any) => Number(v) || 0;

export default function DealerTargets({ supabase, targets, dealers, orders, onChanged }: Props) {
  const cp = currentPeriods();
  const [form, setForm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState('');

  const periods = Array.from(new Set(targets.map(t => t.period))).sort().reverse();
  const dealerName = (id: string) => dealers.find(d => d.id === id)?.name || '-';

  const actual = (dealerId: string, period: string) => {
    const r = periodRange(period);
    return orders.filter(o => o.customer_id === dealerId && !['cancelled', 'İptal'].includes(o.status) && inRange(o.order_date || o.created_at, r))
      .reduce((s, o) => s + orderNetAmount(o), 0);
  };

  const save = async () => {
    if (!form?.dealer_ids?.length || !periodRange(form.period) || !(n(form.target_amount) > 0)) {
      alert('Bayi, geçerli dönem (2026-10, 2026-Q4 veya 2026) ve hedef tutarı girin.'); return;
    }
    setBusy(true);
    const rows = form.dealer_ids.map((id: string) => ({ dealer_id: id, period: form.period.toUpperCase().replace('-q', '-Q'), target_amount: n(form.target_amount), notes: form.notes || null }));
    const { error } = await supabase.from('dealer_targets').upsert(rows, { onConflict: 'dealer_id,period' });
    setBusy(false);
    if (error) { alert('Hata: ' + error.message); return; }
    setForm(null); onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm('Hedef silinsin mi?')) return;
    const { error } = await supabase.from('dealer_targets').delete().eq('id', id);
    if (error) { alert('Hata: ' + error.message); return; }
    onChanged();
  };

  const list = targets.filter(t => !filterPeriod || t.period === filterPeriod)
    .sort((a, b) => (b.period || '').localeCompare(a.period || '') || dealerName(a.dealer_id).localeCompare(dealerName(b.dealer_id)));

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto flex items-center gap-1 text-sm font-semibold"><Target className="h-4 w-4 text-indigo-600" />Bayi Hedefleri</h3>
        <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-sm">
          <option value="">Tüm dönemler</option>{periods.map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}
        </select>
        <Button size="sm" onClick={() => setForm({ dealer_ids: [], period: cp.quarter, target_amount: 0, notes: '' })}><Plus className="h-3 w-3" />Hedef Ekle</Button>
      </div>
      {list.length === 0 ? <p className="text-sm text-slate-500">Henüz hedef yok. Bayilere aylık, çeyreklik veya yıllık sipariş hedefi (KDV hariç) tanımlayın.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500">
            <th className="py-2">Bayi</th><th className="py-2">Dönem</th><th className="py-2 text-right">Hedef</th><th className="py-2 text-right">Gerçekleşen</th><th className="py-2">Oran</th><th />
          </tr></thead>
          <tbody>
            {list.map(t => {
              const a = actual(t.dealer_id, t.period);
              const pct = n(t.target_amount) > 0 ? a / n(t.target_amount) * 100 : 0;
              return (
                <tr key={t.id} className="border-b">
                  <td className="py-2 font-medium">{dealerName(t.dealer_id)}</td>
                  <td className="py-2">{periodLabel(t.period)}</td>
                  <td className="py-2 text-right">₺{formatMoney(n(t.target_amount))}</td>
                  <td className="py-2 text-right">₺{formatMoney(a)}</td>
                  <td className="min-w-[120px] py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded bg-slate-200"><div className={`h-1.5 rounded ${pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                      <span className="w-10 text-right text-xs">%{Math.round(pct)}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right"><Button variant="ghost" size="sm" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Bayi Hedefi" size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save} disabled={busy}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs font-medium text-slate-600">Bayiler (birden çok seçebilirsiniz; aynı hedef her birine yazılır)</label>
              <div className="mt-1 max-h-48 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
                {dealers.map(d => (
                  <label key={d.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={form.dealer_ids.includes(d.id)}
                      onChange={e => setForm({ ...form, dealer_ids: e.target.checked ? [...form.dealer_ids, d.id] : form.dealer_ids.filter((x: string) => x !== d.id) })} />
                    {d.name}<span className="text-xs text-slate-400">{[d.dealer_level, d.region].filter(Boolean).join(' · ')}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Select label="Dönem" value={[cp.month, cp.quarter, cp.year].includes(form.period) ? form.period : ''}
                  onChange={e => e.target.value && setForm({ ...form, period: e.target.value })}
                  options={[{ value: cp.month, label: `Bu ay (${periodLabel(cp.month)})` }, { value: cp.quarter, label: `Bu çeyrek (${periodLabel(cp.quarter)})` }, { value: cp.year, label: `Bu yıl (${cp.year})` }, { value: '', label: 'Diğer…' }]} />
                <input value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} placeholder="2027-Q1"
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs" />
              </div>
              <Input label="Hedef (₺, KDV hariç sipariş)" type="number" value={form.target_amount} onChange={e => setForm({ ...form, target_amount: e.target.value })} />
            </div>
            <Input label="Not" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            <p className="text-[11px] text-slate-400">Aynı bayi ve dönem için mevcut hedef varsa güncellenir.</p>
          </div>
        )}
      </Modal>
    </Card>
  );
}
