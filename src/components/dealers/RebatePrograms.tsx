'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Input, Select, Textarea, Modal, Badge } from '@/components/ui';
import { StatusBadge } from '@/components/portal/common';
import { formatMoney, formatDate } from '@/lib/utils';
import { REBATE_PAYOUT_STATUS, n } from '@/lib/portal';
import { DEALER_LEVELS } from '@/lib/dealer-pricing';
import { calcRebate, programAchieved, programAppliesTo, BASIS_LABEL, CALC_MODE_LABEL, PAYOUT_LABEL, RebateProgram } from '@/lib/rebates';
import { Plus, Trash2, Pencil, Calculator, Trophy } from 'lucide-react';

interface Props { supabase: any; dealers: any[]; orders: any[]; invoices: any[]; collections: any[] }
const tl = (v: number) => `₺${formatMoney(v)}`;
const year = new Date().getFullYear();

export default function RebatePrograms({ supabase, dealers, orders, invoices, collections }: Props) {
  const [programs, setPrograms] = useState<RebateProgram[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [form, setForm] = useState<any | null>(null);
  const [pay, setPay] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [p, t, po] = await Promise.all([
      supabase.from('rebate_programs').select('*').order('period_end', { ascending: false }),
      supabase.from('rebate_tiers').select('*'),
      supabase.from('rebate_payouts').select('*'),
    ]);
    setPrograms(p.data || []); setTiers(t.data || []); setPayouts(po.data || []);
    if (!selected && p.data?.[0]) setSelected(p.data[0].id);
  };
  useEffect(() => { load(); }, []);

  const prog = programs.find(p => p.id === selected);
  const progTiers = tiers.filter(t => t.program_id === selected);
  const rows = prog ? dealers.filter(d => programAppliesTo(prog, d)).map(d => {
    const achieved = programAchieved(prog, d.id, { orders, invoices, collections });
    return { d, res: calcRebate(achieved, progTiers, prog.calc_mode), payout: payouts.find(p => p.program_id === prog.id && p.dealer_id === d.id) };
  }).sort((a, b) => b.res.achieved - a.res.achieved) : [];
  const totalRebate = rows.reduce((s, r) => s + r.res.rebate, 0);

  const save = async () => {
    if (!form.name || !form.period_start || !form.period_end) { alert('Ad ve dönem zorunlu.'); return; }
    const ts = (form.tiers as any[]).filter(t => t.threshold !== '' && t.rate_pct !== '');
    if (!ts.length) { alert('En az bir basamak girin.'); return; }
    setBusy(true);
    const payload = { name: form.name, description: form.description || null, period_start: form.period_start, period_end: form.period_end, basis: form.basis,
      calc_mode: form.calc_mode, dealer_level: form.dealer_level || null, dealer_id: form.dealer_id || null, payout_method: form.payout_method, is_active: form.is_active !== false };
    let id = form.id;
    if (id) {
      const { error } = await supabase.from('rebate_programs').update(payload).eq('id', id);
      if (error) { setBusy(false); alert(error.message); return; }
      await supabase.from('rebate_tiers').delete().eq('program_id', id);
    } else {
      const { data, error } = await supabase.from('rebate_programs').insert([payload]).select().single();
      if (error) { setBusy(false); alert(error.message); return; }
      id = data.id;
    }
    const { error: tErr } = await supabase.from('rebate_tiers').insert(ts.map(t => ({ program_id: id, threshold: n(t.threshold), rate_pct: n(t.rate_pct), bonus_amount: n(t.bonus_amount) })));
    setBusy(false);
    if (tErr) { alert(tErr.message); return; }
    setForm(null); setSelected(id); load();
  };

  const accrue = async () => {
    if (!prog) return;
    const rs = rows.filter(r => r.res.rebate > 0 && (!r.payout || r.payout.status === 'accrued'));
    if (!rs.length) { alert('Tahakkuk edilecek prim yok.'); return; }
    if (!confirm(`${rs.length} bayi için toplam ${tl(rs.reduce((s, r) => s + r.res.rebate, 0))} prim tahakkuk edilsin mi? (Daha önce tahakkuk edilenler güncellenir; onaylanan/ödenenler değişmez.)`)) return;
    const { error } = await supabase.from('rebate_payouts').upsert(rs.map(r => ({ program_id: prog.id, dealer_id: r.d.id, achieved_amount: Math.round(r.res.achieved * 100) / 100,
      rate_pct: Math.round(r.res.rate * 100) / 100, rebate_amount: r.res.rebate, status: 'accrued' })), { onConflict: 'program_id,dealer_id' });
    if (error) alert(error.message); else load();
  };

  const savePay = async () => {
    const patch: any = { status: pay.status, reference: pay.reference || null, notes: pay.notes || null };
    if (pay.status === 'paid') patch.paid_at = pay.paid_at || new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('rebate_payouts').update(patch).eq('id', pay.id);
    if (error) alert(error.message); else { setPay(null); load(); }
  };

  const newForm = () => setForm({ name: '', description: '', period_start: `${year}-01-01`, period_end: `${year}-12-31`, basis: 'orders', calc_mode: 'retroactive',
    dealer_level: '', dealer_id: '', payout_method: 'credit_note', is_active: true,
    tiers: [{ threshold: '1000000', rate_pct: '1', bonus_amount: '' }, { threshold: '2500000', rate_pct: '2', bonus_amount: '' }, { threshold: '5000000', rate_pct: '3', bonus_amount: '' }] });

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Card className="p-4 lg:col-span-1">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1 text-sm font-semibold"><Trophy className="h-4 w-4 text-amber-500" />Prim Programları</h3>
          <Button size="sm" variant="secondary" onClick={newForm}><Plus className="h-3 w-3" /></Button>
        </div>
        {programs.length === 0 && <p className="text-xs text-slate-500">Yıllık/çeyreklik basamaklı ciro primi tanımlayın. Bayiler portalda "bir sonraki basamağa ne kaldı" bilgisini anlık görür.</p>}
        {programs.map(p => (
          <button key={p.id} onClick={() => setSelected(p.id)} className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${selected === p.id ? 'bg-amber-50 font-medium text-amber-900' : 'hover:bg-slate-50'}`}>
            {p.name}{!p.is_active && <span className="text-xs text-slate-400"> (pasif)</span>}
            <div className="text-[11px] font-normal text-slate-400">{formatDate(p.period_start)} – {formatDate(p.period_end)}</div>
          </button>
        ))}
      </Card>
      <Card className="p-4 lg:col-span-3">
        {!prog ? <p className="text-sm text-slate-500">Program seçin veya oluşturun.</p> : (
          <>
            <div className="mb-3 flex flex-wrap items-start gap-2">
              <div className="mr-auto">
                <h3 className="font-semibold">{prog.name}</h3>
                <p className="text-xs text-slate-500">{BASIS_LABEL[prog.basis]} · {CALC_MODE_LABEL[prog.calc_mode]} · {PAYOUT_LABEL[prog.payout_method || 'credit_note']} · {prog.dealer_id ? dealers.find(d => d.id === prog.dealer_id)?.name : prog.dealer_level ? `${prog.dealer_level} bayiler` : 'Tüm bayiler'}</p>
                <div className="mt-1 flex flex-wrap gap-1">{[...progTiers].sort((a, b) => n(a.threshold) - n(b.threshold)).map(t => <Badge key={t.id} variant="warning">{tl(n(t.threshold))}+ → %{n(t.rate_pct)}{n(t.bonus_amount) ? ` +${tl(n(t.bonus_amount))}` : ''}</Badge>)}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setForm({ ...prog, dealer_level: prog.dealer_level || '', dealer_id: prog.dealer_id || '', tiers: progTiers.map(t => ({ threshold: String(t.threshold), rate_pct: String(t.rate_pct), bonus_amount: t.bonus_amount ? String(t.bonus_amount) : '' })) })}><Pencil className="h-3 w-3" />Düzenle</Button>
              <Button size="sm" onClick={accrue}><Calculator className="h-3 w-3" />Primleri tahakkuk et</Button>
            </div>
            <p className="mb-2 text-sm">Şu ana kadar hak edilen toplam prim: <b className="text-green-700">{tl(totalRebate)}</b></p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Bayi</th><th className="text-right">Ciro</th><th className="text-right">Oran</th><th className="text-right">Prim</th><th>Sonraki basamak</th><th>Ödeme</th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.d.id} className="border-b">
                      <td className="py-2 font-medium">{r.d.name}<span className="ml-1 text-xs font-normal text-slate-400">{r.d.dealer_level}</span></td>
                      <td className="text-right">{tl(r.res.achieved)}</td>
                      <td className="text-right">%{r.res.rate.toFixed(2)}</td>
                      <td className="text-right font-semibold text-green-700">{tl(r.res.rebate)}</td>
                      <td className="text-xs">{r.res.next ? `${tl(r.res.toNext)} kaldı → %${n(r.res.next.rate_pct)}` : 'En üst basamak'}</td>
                      <td>{r.payout ? <button onClick={() => setPay({ ...r.payout })}><StatusBadge map={REBATE_PAYOUT_STATUS} value={r.payout.status} /></button> : <span className="text-xs text-slate-400">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Ciro primi programı" size="xl"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button>{form?.id && <Button variant="danger" onClick={async () => { if (confirm('Program silinsin mi?')) { await supabase.from('rebate_programs').delete().eq('id', form.id); setForm(null); setSelected(''); load(); } }}>Sil</Button>}<Button onClick={save} disabled={busy}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3"><Input label="Program adı" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={`${year} Yıllık Ciro Primi`} /></div>
              <Input label="Başlangıç" type="date" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} />
              <Input label="Bitiş" type="date" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} />
              <Select label="Ödeme şekli" value={form.payout_method} onChange={e => setForm({ ...form, payout_method: e.target.value })} options={Object.entries(PAYOUT_LABEL).map(([value, label]) => ({ value, label }))} />
              <Select label="Baz" value={form.basis} onChange={e => setForm({ ...form, basis: e.target.value })} options={Object.entries(BASIS_LABEL).map(([value, label]) => ({ value, label }))} />
              <Select label="Hesaplama" value={form.calc_mode} onChange={e => setForm({ ...form, calc_mode: e.target.value })} options={Object.entries(CALC_MODE_LABEL).map(([value, label]) => ({ value, label }))} />
              <Select label="Seviye" value={form.dealer_level} onChange={e => setForm({ ...form, dealer_level: e.target.value })} options={[{ value: '', label: 'Tüm seviyeler' }, ...DEALER_LEVELS.map(l => ({ value: l, label: l }))]} />
              <div className="sm:col-span-3"><Select label="Sadece bu bayi" value={form.dealer_id} onChange={e => setForm({ ...form, dealer_id: e.target.value })} options={[{ value: '', label: 'Kapsamdaki tüm bayiler' }, ...dealers.map(d => ({ value: d.id, label: d.name }))]} /></div>
            </div>
            <Textarea label="Açıklama (bayiler görür)" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div>
              <p className="mb-1 text-sm font-medium">Basamaklar</p>
              {(form.tiers as any[]).map((t, i) => (
                <div key={i} className="mb-1 flex items-center gap-2 text-sm">
                  <input type="number" value={t.threshold} onChange={e => { const ts = [...form.tiers]; ts[i] = { ...t, threshold: e.target.value }; setForm({ ...form, tiers: ts }); }} placeholder="Ciro eşiği ₺" className="h-8 w-40 rounded border px-2" />
                  <span>ve üzeri →</span>
                  <input type="number" value={t.rate_pct} onChange={e => { const ts = [...form.tiers]; ts[i] = { ...t, rate_pct: e.target.value }; setForm({ ...form, tiers: ts }); }} placeholder="%" className="h-8 w-20 rounded border px-2" /><span>%</span>
                  <input type="number" value={t.bonus_amount} onChange={e => { const ts = [...form.tiers]; ts[i] = { ...t, bonus_amount: e.target.value }; setForm({ ...form, tiers: ts }); }} placeholder="+ sabit bonus ₺" className="h-8 w-32 rounded border px-2" />
                  <button onClick={() => setForm({ ...form, tiers: form.tiers.filter((_: any, k: number) => k !== i) })}><Trash2 className="h-3 w-3 text-red-400" /></button>
                </div>
              ))}
              <button onClick={() => setForm({ ...form, tiers: [...form.tiers, { threshold: '', rate_pct: '', bonus_amount: '' }] })} className="text-xs text-indigo-600">+ Basamak ekle</button>
              <p className="mt-1 text-[11px] text-slate-400">Geriye dönük: 2,6M ciroda %2 basamağındaysa 2,6M × %2. Kademeli: 1M–2,5M arası %1, 2,5M üstü %2.</p>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active !== false} onChange={e => setForm({ ...form, is_active: e.target.checked })} />Aktif (bayiler portalda görür)</label>
          </div>
        )}
      </Modal>
      <Modal isOpen={!!pay} onClose={() => setPay(null)} title="Prim ödemesi"
        footer={<><Button variant="secondary" onClick={() => setPay(null)}>İptal</Button><Button onClick={savePay}>Kaydet</Button></>}>
        {pay && (
          <div className="space-y-3">
            <p className="text-sm">Tutar: <b>{tl(n(pay.rebate_amount))}</b> (ciro {tl(n(pay.achieved_amount))}, %{n(pay.rate_pct)})</p>
            <Select label="Durum" value={pay.status} onChange={e => setPay({ ...pay, status: e.target.value })} options={Object.entries(REBATE_PAYOUT_STATUS).map(([value, v]) => ({ value, label: v.label }))} />
            <Input label="Referans (fiyat farkı fatura no / dekont)" value={pay.reference || ''} onChange={e => setPay({ ...pay, reference: e.target.value })} />
            {pay.status === 'paid' && <Input label="Ödeme tarihi" type="date" value={pay.paid_at || ''} onChange={e => setPay({ ...pay, paid_at: e.target.value })} />}
            <Textarea label="Not" value={pay.notes || ''} onChange={e => setPay({ ...pay, notes: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
