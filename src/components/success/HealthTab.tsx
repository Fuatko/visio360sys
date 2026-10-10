'use client';

import { useMemo, useState } from 'react';
import { Card, Button } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { computeHealth, LEVEL, HEALTH_LABELS, HEALTH_WEIGHTS } from '@/lib/customer-health';
import { ListTodo, Send, Info } from 'lucide-react';

interface Props { supabase: any; customers: any[]; data: any; team: any[]; onSurvey: (customerIds: string[]) => void; onChanged: () => void }
const tl = (v: number) => `₺${formatMoney(Math.round(v))}`;

export default function HealthTab({ supabase, customers, data, team, onSurvey, onChanged }: Props) {
  const [level, setLevel] = useState<'' | 'risk' | 'watch' | 'healthy'>('');
  const [onlyMine, setOnlyMine] = useState('');

  const rows = useMemo(() => customers.map(c => ({ c, h: computeHealth(c.id, data) })).filter(r => r.h)
    .sort((a, b) => a.h!.score - b.h!.score), [customers, data]);
  const cnt = (l: string) => rows.filter(r => r.h!.level === l).length;
  const atRisk = rows.filter(r => r.h!.level === 'risk').reduce((s, r) => s + r.h!.revenue12m, 0);
  const list = rows.filter(r => (!level || r.h!.level === level) && (!onlyMine || r.c.assigned_to === onlyMine));

  const createTask = async (r: any) => {
    const due = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const { error } = await supabase.from('crm_tasks').insert([{ customer_id: r.c.id, sales_person_id: r.c.assigned_to || null,
      title: `Müşteri riski: ${r.c.name} ile görüşme`, description: `Sağlık skoru ${Math.round(r.h.score)}. ${r.h.reasons.join('; ')}`,
      due_date: due, priority: r.h.level === 'risk' ? 'Yüksek' : 'Orta', status: 'Bekliyor' }]);
    if (error) alert(error.message); else { alert('Temsilciye 3 gün vadeli görev açıldı (CRM Aktiviteleri).'); onChanged(); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {(['risk', 'watch', 'healthy'] as const).map(l => (
          <button key={l} onClick={() => setLevel(level === l ? '' : l)} className={`rounded-xl border bg-white p-4 text-left ${level === l ? 'ring-2 ring-indigo-400' : ''}`}>
            <p className="text-2xl font-bold">{cnt(l)}</p><p className={`inline-block rounded px-2 text-xs ${LEVEL[l].cls}`}>{LEVEL[l].label}</p>
          </button>
        ))}
        <Card className="p-4"><p className="text-2xl font-bold text-red-600">{tl(atRisk)}</p><p className="text-xs text-slate-500">Riskli müşterilerin son 12 ay cirosu</p></Card>
      </div>
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="mr-auto flex items-center gap-1 text-xs text-slate-500"><Info className="h-3 w-3" />
            Puan: {Object.entries(HEALTH_WEIGHTS).map(([k, w]) => `${HEALTH_LABELS[k]} %${w}`).join(' · ')}. Geçmişi olmayan müşteri puanlanmaz.</p>
          <select value={onlyMine} onChange={e => setOnlyMine(e.target.value)} className="h-8 rounded-lg border px-2 text-sm">
            <option value="">Tüm temsilciler</option>{team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {list.length === 0 ? <p className="text-sm text-slate-500">Puanlanacak müşteri yok.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Müşteri</th><th>Skor</th>
                {Object.keys(HEALTH_WEIGHTS).map(k => <th key={k} className="text-right">{HEALTH_LABELS[k]}</th>)}<th className="text-right">12 ay ciro</th><th>Nedenler</th><th /></tr></thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.c.id} className="border-b align-top">
                    <td className="py-2"><p className="font-medium">{r.c.name}</p><p className="text-xs text-slate-400">{team.find(t => t.id === r.c.assigned_to)?.name || '-'}</p></td>
                    <td className="py-2"><span className={`rounded px-2 py-0.5 text-xs font-bold ${LEVEL[r.h!.level].cls}`}>{Math.round(r.h!.score)}</span></td>
                    {Object.keys(HEALTH_WEIGHTS).map(k => {
                      const v = r.h!.parts[k];
                      return <td key={k} className={`py-2 text-right text-xs ${v === null ? 'text-slate-300' : v >= 70 ? 'text-green-700' : v >= 45 ? 'text-amber-700' : 'text-red-600'}`}>{v === null ? '–' : Math.round(v)}</td>;
                    })}
                    <td className="py-2 text-right">{tl(r.h!.revenue12m)}</td>
                    <td className="max-w-xs py-2 text-xs text-slate-600">{r.h!.reasons.join(' · ') || '-'}</td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {r.h!.level !== 'healthy' && <Button size="sm" variant="ghost" onClick={() => createTask(r)} title="Temsilciye görev aç"><ListTodo className="h-4 w-4 text-indigo-600" /></Button>}
                      <Button size="sm" variant="ghost" onClick={() => onSurvey([r.c.id])} title="Memnuniyet anketi gönder"><Send className="h-4 w-4 text-slate-500" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
