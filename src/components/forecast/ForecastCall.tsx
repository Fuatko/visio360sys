'use client';

import { useMemo, useState } from 'react';
import { Card, Button, Badge, Modal, Input, Textarea } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { periodLabel } from '@/lib/periods';
import { weekStart } from '@/lib/forecast-model';
import { Send, CheckCircle2, Pencil, AlertTriangle, Megaphone } from 'lucide-react';

const tl = (v: number) => `₺${formatMoney(Math.round(v || 0))}`;
const n = (v: any) => Number(v) || 0;

export interface RepFigures { id: string; won: number; commit: number; best: number; model: number; target: number }
interface Props {
  supabase: any; period: string; reps: RepFigures[]; team: any[]; subs: any[]; me: { id?: string; name?: string } | null;
  canApprove: boolean; teamModel: { expected: number; p10: number; p90: number }; target: number; hitProb: number | null; onChanged: () => void;
}

const effCommit = (s: any) => (s ? n(s.manager_commit ?? s.commit_amount) : null);
const effBest = (s: any) => (s ? n(s.manager_best ?? s.best_amount) : null);

export default function ForecastCall({ supabase, period, reps, team, subs, me, canApprove, teamModel, target, hitProb, onChanged }: Props) {
  const wk = weekStart();
  const [form, setForm] = useState<any | null>(null);
  const [review, setReview] = useState<any | null>(null);
  const pname = (id: string) => team.find(t => t.id === id)?.name || 'Atanmamış';

  const periodSubs = subs.filter(s => s.period === period);
  const latest = (rep: string) => periodSubs.filter(s => s.sales_person_id === rep).sort((a, b) => b.week_start.localeCompare(a.week_start))[0] || null;
  // Ekip: tahmini olan herkes + bu dönem fırsatı olan herkes
  const rows = useMemo(() => {
    const ids = Array.from(new Set([...reps.map(r => r.id), ...periodSubs.map(s => s.sales_person_id)])).filter(Boolean);
    return ids.map(id => ({ id, f: reps.find(r => r.id === id) || { id, won: 0, commit: 0, best: 0, model: 0, target: 0 }, s: latest(id) }))
      .sort((a, b) => (b.f.won + b.f.commit) - (a.f.won + a.f.commit));
  }, [reps, subs, period]);

  const thisWeek = rows.filter(r => r.s?.week_start === wk);
  const missing = rows.filter(r => r.s?.week_start !== wk);
  const callCommit = rows.reduce((a, r) => a + (effCommit(r.s) ?? (r.f.won + r.f.commit)), 0);
  const callBest = rows.reduce((a, r) => a + (effBest(r.s) ?? (r.f.won + r.f.commit + r.f.best)), 0);
  const sysCommit = rows.reduce((a, r) => a + r.f.won + r.f.commit, 0);

  // Haftalık gelişim: her hafta için o haftaya kadarki en son gönderimlerin toplamı
  const weeks = Array.from(new Set(periodSubs.map(s => s.week_start))).sort().slice(-8);
  const trend = weeks.map(w => {
    let c = 0, m = 0;
    rows.forEach(r => {
      const s = periodSubs.filter(x => x.sales_person_id === r.id && x.week_start <= w).sort((a, b) => b.week_start.localeCompare(a.week_start))[0];
      if (s) { c += effCommit(s)!; m += n(s.model_expected); }
    });
    return { w, c, m };
  });
  const maxT = Math.max(1, ...trend.map(t => Math.max(t.c, t.m)), target);

  const openForm = (repId: string) => {
    const f = rows.find(r => r.id === repId)?.f || reps.find(r => r.id === repId);
    const s = periodSubs.find(x => x.sales_person_id === repId && x.week_start === wk);
    setForm({ id: s?.id, sales_person_id: repId, commit_amount: String(Math.round(s ? n(s.commit_amount) : (f ? f.won + f.commit : 0))),
      best_amount: String(Math.round(s ? n(s.best_amount) : (f ? f.won + f.commit + f.best : 0))), note: s?.note || '', f });
  };
  const submit = async () => {
    const c = Number(form.commit_amount), b = Number(form.best_amount);
    if (!(c >= 0) || !(b >= 0)) { alert('Tutarları girin.'); return; }
    const f = form.f || { won: 0, commit: 0, best: 0, model: 0 };
    const payload = { period, week_start: wk, sales_person_id: form.sales_person_id, commit_amount: c, best_amount: Math.max(b, c), note: form.note || null,
      submitted_by_name: me?.name || null, system_commit: f.won + f.commit, system_best: f.won + f.commit + f.best, model_expected: Math.round(f.model), won_at_submit: f.won };
    const { error } = form.id ? await supabase.from('forecast_submissions').update(payload).eq('id', form.id) : await supabase.from('forecast_submissions').insert([payload]);
    if (error) { alert(error.message); return; }
    setForm(null); onChanged();
  };
  const approve = async (s: any) => {
    const { error } = await supabase.from('forecast_submissions').update({ status: 'approved', reviewed_by_name: me?.name || null, reviewed_at: new Date().toISOString() }).eq('id', s.id);
    if (error) alert(error.message); else onChanged();
  };
  const saveReview = async () => {
    const { error } = await supabase.from('forecast_submissions').update({ status: 'adjusted', manager_commit: Number(review.manager_commit), manager_best: Math.max(Number(review.manager_best), Number(review.manager_commit)),
      manager_note: review.manager_note || null, reviewed_by_name: me?.name || null, reviewed_at: new Date().toISOString() }).eq('id', review.id);
    if (error) { alert(error.message); return; }
    setReview(null); onChanged();
  };

  const gapTone = (call: number, model: number) => {
    if (!model) return '';
    const g = (call - model) / model;
    return g > 0.25 ? 'text-amber-700' : g < -0.25 ? 'text-sky-700' : 'text-slate-700';
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-indigo-300 p-4"><p className="text-xs text-slate-500">Ekip tahmini (kesin) — {periodLabel(period)}</p><p className="text-2xl font-bold text-indigo-700">{tl(callCommit)}</p>
          <p className="text-[11px] text-slate-500">En iyi senaryo {tl(callBest)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Sistem (kazanılan + kesin kategorisi)</p><p className="text-2xl font-bold">{tl(sysCommit)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Model beklentisi</p><p className="text-2xl font-bold text-emerald-700">{tl(teamModel.expected)}</p>
          <p className="text-[11px] text-slate-500">%80 olasılıkla {tl(teamModel.p10)} – {tl(teamModel.p90)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Hedef</p><p className="text-2xl font-bold">{target ? tl(target) : '—'}</p>
          {hitProb !== null && <p className={`text-[11px] font-medium ${hitProb >= 0.6 ? 'text-green-700' : hitProb >= 0.3 ? 'text-amber-700' : 'text-red-600'}`}>Modele göre hedefe ulaşma olasılığı %{Math.round(hitProb * 100)}</p>}</Card>
      </div>

      {missing.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />Bu hafta tahmin göndermeyen: {missing.map(r => pname(r.id)).join(', ')}
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto flex items-center gap-1 text-sm font-semibold"><Megaphone className="h-4 w-4 text-indigo-600" />Haftalık tahmin çağrısı · {new Date(wk).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} haftası</h3>
          {me?.id && <Button size="sm" onClick={() => openForm(me.id!)}><Send className="h-3 w-3" />Tahminimi gönder</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500">
              <th className="py-2">Temsilci</th><th className="text-right">Kazanılan</th><th className="text-right">Sistem kesin</th><th className="text-right">Model</th>
              <th className="pl-4">Temsilci tahmini</th><th>Yönetici kararı</th><th>Durum</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="py-3 text-slate-500">Bu dönemde fırsat veya tahmin yok.</td></tr>}
              {rows.map(({ id, f, s }) => {
                const stale = s && s.week_start !== wk;
                return (
                  <tr key={id} className="border-b align-top">
                    <td className="py-2 font-medium">{pname(id)}{f.target ? <p className="text-[11px] font-normal text-slate-400">hedef {tl(f.target)}</p> : null}</td>
                    <td className="text-right text-green-700">{tl(f.won)}</td>
                    <td className="text-right">{tl(f.won + f.commit)}</td>
                    <td className="text-right text-emerald-700">{tl(f.model)}</td>
                    <td className="pl-4">{s ? (<>
                      <p className={`font-semibold ${gapTone(n(s.commit_amount), f.model)}`}>{tl(n(s.commit_amount))} <span className="text-xs font-normal text-slate-500">/ en iyi {tl(n(s.best_amount))}</span></p>
                      {s.note && <p className="max-w-xs text-xs text-slate-600">“{s.note}”</p>}
                      <p className={`text-[11px] ${stale ? 'text-amber-700' : 'text-slate-400'}`}>{stale ? 'Geçen haftalardan: ' : ''}{new Date(s.updated_at || s.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </>) : <span className="text-xs text-red-600">Gönderilmedi</span>}</td>
                    <td>{s?.status === 'adjusted' ? (<><p className="font-semibold">{tl(n(s.manager_commit))}</p>{s.manager_note && <p className="max-w-xs text-xs text-slate-600">“{s.manager_note}”</p>}</>) : s?.status === 'approved' ? <span className="text-xs text-slate-500">Onaylandı</span> : '-'}</td>
                    <td>{!s ? <Badge variant="danger">Eksik</Badge> : s.status === 'submitted' ? <Badge variant="warning">Onay bekliyor</Badge> : s.status === 'approved' ? <Badge variant="success">Onaylandı</Badge> : <Badge variant="info">Düzeltildi</Badge>}</td>
                    <td className="whitespace-nowrap text-right">
                      {(me?.id === id || canApprove) && <button title="Tahmin gir / güncelle" onClick={() => openForm(id)} className="mr-2"><Send className="h-4 w-4 text-indigo-500" /></button>}
                      {canApprove && s && s.status === 'submitted' && <>
                        <button title="Onayla" onClick={() => approve(s)} className="mr-2"><CheckCircle2 className="h-4 w-4 text-green-600" /></button>
                        <button title="Düzelt" onClick={() => setReview({ id: s.id, manager_commit: String(Math.round(n(s.commit_amount))), manager_best: String(Math.round(n(s.best_amount))), manager_note: '', rep: pname(id), f, s })}><Pencil className="h-4 w-4 text-slate-500" /></button>
                      </>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Turuncu: temsilci tahmini modelin %25'ten fazla üstünde (iyimser). Mavi: %25'ten fazla altında (temkinli). Ekip tahmini = yönetici kararı, yoksa temsilci tahmini, o da yoksa sistem.</p>
      </Card>

      {trend.length > 0 && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold">Tahmin haftadan haftaya nasıl değişti?</p>
          <div className="space-y-2">
            {trend.map(t => (
              <div key={t.w} className="grid grid-cols-[90px_1fr_120px] items-center gap-3 text-xs">
                <span className="text-slate-500">{new Date(t.w).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                <div className="space-y-1">
                  <div className="h-2.5 rounded bg-indigo-500" style={{ width: `${(t.c / maxT) * 100}%` }} title="Ekip tahmini" />
                  <div className="h-2.5 rounded bg-emerald-400" style={{ width: `${(t.m / maxT) * 100}%` }} title="Model" />
                </div>
                <span className="text-right">{tl(t.c)}<span className="block text-emerald-700">{tl(t.m)}</span></span>
              </div>
            ))}
          </div>
          <p className="mt-2 flex gap-4 text-[11px] text-slate-500"><span><span className="mr-1 inline-block h-2 w-3 rounded bg-indigo-500" />Ekip tahmini</span><span><span className="mr-1 inline-block h-2 w-3 rounded bg-emerald-400" />Model (gönderim anında)</span>{target ? <span>Hedef {tl(target)}</span> : null}</p>
        </Card>
      )}

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form ? `${pname(form.sales_person_id)} · ${periodLabel(period)} tahmini` : ''}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={submit}><Send className="h-4 w-4" />Gönder</Button></>}>
        {form && (
          <div className="space-y-3">
            {form.f && <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
              <div><p className="text-slate-500">Kazanılan</p><p className="font-semibold">{tl(form.f.won)}</p></div>
              <div><p className="text-slate-500">Sistem kesin</p><p className="font-semibold">{tl(form.f.won + form.f.commit)}</p></div>
              <div><p className="text-slate-500">Model</p><p className="font-semibold text-emerald-700">{tl(form.f.model)}</p></div>
            </div>}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Kesin tahminim (₺, kazanılan dahil)" type="number" value={form.commit_amount} onChange={e => setForm({ ...form, commit_amount: e.target.value })} />
              <Input label="En iyi senaryo (₺)" type="number" value={form.best_amount} onChange={e => setForm({ ...form, best_amount: e.target.value })} />
            </div>
            <Textarea label="Gerekçe / riskler" rows={3} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Delta Otomotiv imza bu hafta, Kuzey Plastik bütçe onayı gelecek çeyreğe kayabilir…" />
            <p className="text-xs text-slate-500">Bu haftaki tahmininizi istediğiniz kadar güncelleyebilirsiniz; tutar değişirse yönetici onayı yenilenir.</p>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!review} onClose={() => setReview(null)} title={review ? `${review.rep} tahminini düzelt` : ''}
        footer={<><Button variant="secondary" onClick={() => setReview(null)}>İptal</Button><Button onClick={saveReview}>Kaydet</Button></>}>
        {review && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Temsilci: <b>{tl(n(review.s.commit_amount))}</b> · Sistem: {tl(review.f.won + review.f.commit)} · Model: {tl(review.f.model)}</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Yönetici kesin tahmini (₺)" type="number" value={review.manager_commit} onChange={e => setReview({ ...review, manager_commit: e.target.value })} />
              <Input label="En iyi senaryo (₺)" type="number" value={review.manager_best} onChange={e => setReview({ ...review, manager_best: e.target.value })} />
            </div>
            <Textarea label="Gerekçe" rows={2} value={review.manager_note} onChange={e => setReview({ ...review, manager_note: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
