'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Input, Textarea, Modal } from '@/components/ui';
import { StatusBadge, FileLink, Bar } from '@/components/portal/common';
import { formatMoney, formatDate } from '@/lib/utils';
import { MDF_STATUS, n, mdfUsed } from '@/lib/portal';
import { periodLabel, currentPeriods, periodRange } from '@/lib/periods';
import { Plus } from 'lucide-react';

interface Props { supabase: any; dealers: any[]; onChanged?: () => void }
const tl = (v: number) => `₺${formatMoney(v)}`;

export default function MdfManagement({ supabase, dealers, onChanged }: Props) {
  const cp = currentPeriods();
  const [allocs, setAllocs] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);
  const [filter, setFilter] = useState('submitted');
  const [allocForm, setAllocForm] = useState<any | null>(null);
  const [act, setAct] = useState<any | null>(null);

  const load = async () => {
    const [a, r] = await Promise.all([
      supabase.from('mdf_allocations').select('*').order('period', { ascending: false }),
      supabase.from('mdf_requests').select('*').order('created_at', { ascending: false }),
    ]);
    setAllocs(a.data || []); setReqs(r.data || []);
  };
  useEffect(() => { load(); }, []);
  const dname = (id: string) => dealers.find(d => d.id === id)?.name || '-';

  const saveAlloc = async () => {
    if (!allocForm.dealer_ids.length || !periodRange(allocForm.period) || !(n(allocForm.amount) > 0)) { alert('Bayi, dönem ve tutar girin.'); return; }
    const { error } = await supabase.from('mdf_allocations').upsert(allocForm.dealer_ids.map((id: string) => ({ dealer_id: id, period: allocForm.period, amount: n(allocForm.amount) })), { onConflict: 'dealer_id,period' });
    if (error) alert(error.message); else { setAllocForm(null); load(); }
  };

  const apply = async (status: string) => {
    const patch: any = { status, review_note: act.review_note || null, reviewed_at: new Date().toISOString() };
    if (status === 'approved') patch.approved_amount = n(act.approved_amount);
    if (status === 'paid') patch.paid_at = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('mdf_requests').update(patch).eq('id', act.r.id);
    if (error) alert(error.message); else { setAct(null); load(); onChanged?.(); }
  };

  const list = reqs.filter(r => !filter || r.status === filter);
  const remaining = (r: any) => {
    const a = allocs.find(x => x.dealer_id === r.dealer_id && x.period === r.period);
    return a ? n(a.amount) - mdfUsed(reqs.filter(x => x.dealer_id === r.dealer_id), r.period) : null;
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Pazarlama Fonu Bütçeleri</h3>
          <Button size="sm" onClick={() => setAllocForm({ dealer_ids: [], period: cp.year, amount: '' })}><Plus className="h-3 w-3" />Bütçe ayır</Button>
        </div>
        {allocs.length === 0 ? <p className="text-sm text-slate-500">Bayilere dönemlik pazarlama bütçesi ayırın (ör. cironun %1'i). Bayi portaldan faaliyet önerir, siz onaylarsınız, harcama belgesiyle ödersiniz.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Bayi</th><th>Dönem</th><th className="text-right">Bütçe</th><th className="w-48">Kullanım</th><th className="text-right">Kalan</th></tr></thead>
            <tbody>
              {allocs.map(a => {
                const used = mdfUsed(reqs.filter(r => r.dealer_id === a.dealer_id), a.period);
                return (
                  <tr key={a.id} className="border-b">
                    <td className="py-1.5">{dname(a.dealer_id)}</td><td>{periodLabel(a.period)}</td><td className="text-right">{tl(n(a.amount))}</td>
                    <td className="px-2"><Bar pct={n(a.amount) ? used / n(a.amount) * 100 : 0} /></td><td className="text-right">{tl(n(a.amount) - used)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap gap-1">
          {[['', 'Tümü'], ...Object.entries(MDF_STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs ${filter === k ? 'bg-indigo-600 text-white' : 'border'}`}>{l}{k ? ` (${reqs.filter(r => r.status === k).length})` : ''}</button>
          ))}
        </div>
        {list.length === 0 ? <p className="text-sm text-slate-500">Talep yok.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Faaliyet</th><th>Bayi</th><th className="text-right">Talep</th><th className="text-right">Onay</th><th className="text-right">Harcama</th><th>Durum</th><th /></tr></thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id} className="border-b align-top">
                  <td className="py-2"><p className="font-medium">{r.title}</p><p className="text-xs text-slate-500">{r.activity_type}{r.planned_date ? ` · ${formatDate(r.planned_date)}` : ''}</p>{r.description && <p className="text-xs text-slate-400">{r.description}</p>}</td>
                  <td className="py-2">{dname(r.dealer_id)}</td>
                  <td className="py-2 text-right">{tl(n(r.requested_amount))}</td>
                  <td className="py-2 text-right">{r.approved_amount != null ? tl(n(r.approved_amount)) : '-'}</td>
                  <td className="py-2 text-right">{r.claim_amount != null ? tl(n(r.claim_amount)) : '-'}<div><FileLink supabase={supabase} value={r.proof_url} /></div></td>
                  <td className="py-2"><StatusBadge map={MDF_STATUS} value={r.status} /></td>
                  <td className="py-2 text-right">{['submitted', 'claimed'].includes(r.status) && <Button size="sm" onClick={() => setAct({ r, approved_amount: r.approved_amount ?? r.requested_amount, review_note: r.review_note || '' })}>İşlem</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal isOpen={!!allocForm} onClose={() => setAllocForm(null)} title="Pazarlama bütçesi ayır"
        footer={<><Button variant="secondary" onClick={() => setAllocForm(null)}>İptal</Button><Button onClick={saveAlloc}>Kaydet</Button></>}>
        {allocForm && (
          <div className="space-y-3 text-sm">
            <div className="max-h-48 space-y-1 overflow-auto rounded border p-2">
              {dealers.map(d => <label key={d.id} className="flex items-center gap-2"><input type="checkbox" checked={allocForm.dealer_ids.includes(d.id)} onChange={e => setAllocForm({ ...allocForm, dealer_ids: e.target.checked ? [...allocForm.dealer_ids, d.id] : allocForm.dealer_ids.filter((x: string) => x !== d.id) })} />{d.name}</label>)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Dönem (2026, 2026-Q4)" value={allocForm.period} onChange={e => setAllocForm({ ...allocForm, period: e.target.value })} />
              <Input label="Tutar (₺, her bayiye)" type="number" value={allocForm.amount} onChange={e => setAllocForm({ ...allocForm, amount: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
      <Modal isOpen={!!act} onClose={() => setAct(null)} title={act?.r.title || ''}
        footer={act && (act.r.status === 'submitted'
          ? <><Button variant="secondary" onClick={() => setAct(null)}>Vazgeç</Button><Button variant="danger" onClick={() => apply('rejected')}>Reddet</Button><Button variant="success" onClick={() => apply('approved')}>Onayla</Button></>
          : <><Button variant="secondary" onClick={() => setAct(null)}>Vazgeç</Button><Button variant="success" onClick={() => apply('paid')}>Ödendi olarak işaretle</Button></>)}>
        {act && (
          <div className="space-y-3 text-sm">
            <p>{dname(act.r.dealer_id)} · talep {tl(n(act.r.requested_amount))}{remaining(act.r) !== null && <> · kalan bütçe <b>{tl(remaining(act.r)!)}</b></>}</p>
            {act.r.status === 'submitted' && <Input label="Onaylanan tutar (₺)" type="number" value={act.approved_amount} onChange={e => setAct({ ...act, approved_amount: e.target.value })} />}
            {act.r.status === 'claimed' && <p>Bildirilen harcama: <b>{tl(n(act.r.claim_amount))}</b> <FileLink supabase={supabase} value={act.r.proof_url} />{act.r.claim_note && <span className="block text-slate-500">{act.r.claim_note}</span>}</p>}
            <Textarea label="Not (bayi görür)" value={act.review_note} onChange={e => setAct({ ...act, review_note: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
