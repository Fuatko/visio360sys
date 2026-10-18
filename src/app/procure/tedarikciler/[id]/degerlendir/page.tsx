'use client';

// Tedarikçi değerlendirme formu (ISO 9001 md. 8.4): otomatik veriler öneri puanı olarak gelir, değerlendiren onaylar/düzeltir
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Card, Button } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { createClient } from '@/lib/supabase';
import { DECISION_LABEL, DEFAULT_EVAL_WEIGHTS, EVAL_CRITERIA, GRADE_CLS, PROCURE_SQL_1D, fmtDate, gradeOf, procError, tl } from '@/lib/procure';
import { ArrowLeft, Save, Sparkles } from 'lucide-react';

export default function EvaluatePage() {
  return (
    <div>
      <Header title="Tedarikçi Değerlendirme" subtitle="Satınalma" />
      <ProcureGate>{p => (p.hasRole('buyer') || p.isAdmin) ? <Form /> : <div className="p-6"><Card className="p-6 text-center text-sm text-slate-600">Değerlendirme satınalma uzmanı / yöneticisi içindir.</Card></div>}</ProcureGate>
    </div>
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function Form() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [vendor, setVendor] = useState<any>(null);
  const [period, setPeriod] = useState({ from: iso(new Date(Date.now() - 365 * 864e5)), to: iso(new Date()), kind: 'periodic' });
  const [metrics, setMetrics] = useState<any>(null);
  const [rows, setRows] = useState<{ key: string; label: string; hint: string; weight: number; auto: number | null; score: number | null; note: string }[]>([]);
  const [decision, setDecision] = useState<'approve' | 'conditional' | 'block' | ''>('');
  const [note, setNote] = useState('');
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [v, pol, last] = await Promise.all([
        supabase.from('proc_vendor_profiles').select('*, customer:customer_id(name, tax_number)').eq('customer_id', id).maybeSingle(),
        supabase.from('proc_policies').select('vendor_eval_weights').maybeSingle(),
        supabase.from('proc_vendor_evaluations').select('period_end').eq('vendor_id', id).order('created_at', { ascending: false }).limit(1),
      ]);
      if (last.error && /relation|does not exist/i.test(last.error.message)) { setMissing(true); return; }
      setVendor(v.data);
      const w = { ...DEFAULT_EVAL_WEIGHTS, ...(pol.data?.vendor_eval_weights || {}) };
      if (last.data?.[0]?.period_end) setPeriod(p => ({ ...p, from: last.data![0].period_end, kind: 'periodic' }));
      else setPeriod(p => ({ ...p, kind: 'initial' }));
      setRows(EVAL_CRITERIA.map(c => ({ key: c.key, label: c.label, hint: c.hint, weight: Number(w[c.key]) || 0, auto: null, score: null, note: '' })));
    })();
  }, [id]);

  useEffect(() => {
    if (!rows.length) return;
    supabase.rpc('proc_vendor_metrics', { p_vendor: id, p_from: period.from, p_to: period.to }).then(({ data }) => {
      setMetrics(data);
      const s = data?.suggested || {};
      setRows(rs => rs.map(r => ({ ...r, auto: s[r.key] ?? null, score: r.score ?? s[r.key] ?? null })));
    });
  }, [period.from, period.to, rows.length]);

  const calc = useMemo(() => {
    const scored = rows.filter(r => r.score != null && r.weight > 0);
    const w = scored.reduce((a, r) => a + r.weight, 0);
    if (!w) return null;
    const score = Math.round((scored.reduce((a, r) => a + r.weight * (r.score! / 5), 0) / w) * 1000) / 10;
    const grade = gradeOf(score);
    return { score, grade, suggested: grade === 'D' ? 'block' : grade === 'C' ? 'conditional' : 'approve' };
  }, [rows]);
  useEffect(() => { if (calc && !decision) setDecision(calc.suggested as any); }, [calc?.suggested]);

  const save = async () => {
    setErr(''); setBusy(true);
    const { error } = await supabase.rpc('proc_vendor_evaluate', { p_vendor: id, p: {
      period_start: period.from, period_end: period.to, kind: period.kind, decision, action_note: note,
      criteria: rows.map(r => ({ key: r.key, label: r.label, weight: r.weight, score: r.score, auto_score: r.auto, note: r.note })),
    } });
    setBusy(false);
    if (error) { setErr(procError(error, PROCURE_SQL_1D)); return; }
    router.push(`/procure/tedarikciler/${id}`);
  };

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1D} /></div>;
  if (!vendor) return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;
  const inp = 'h-9 rounded-lg border border-slate-200 px-2 text-sm';
  const m = metrics || {};
  return (
    <div className="mx-auto max-w-4xl space-y-3 p-3 sm:p-6">
      <Link href={`/procure/tedarikciler/${id}`} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><ArrowLeft className="h-3.5 w-3.5" />{vendor.customer?.name}</Link>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">Değerlendirilen</p><p className="font-semibold text-slate-900">{vendor.customer?.name}</p><p className="text-xs text-slate-500">Son değerlendirme: {vendor.grade ? `${vendor.grade} (${Number(vendor.score)})` : 'yok'} · sonraki {fmtDate(vendor.next_evaluation_due) || '—'}</p></div>
        <label className="text-xs text-slate-600">Dönem başı<input type="date" className={`${inp} block`} value={period.from} onChange={e => setPeriod({ ...period, from: e.target.value })} /></label>
        <label className="text-xs text-slate-600">Dönem sonu<input type="date" className={`${inp} block`} value={period.to} onChange={e => setPeriod({ ...period, to: e.target.value })} /></label>
        <label className="text-xs text-slate-600">Tür<select className={`${inp} block`} value={period.kind} onChange={e => setPeriod({ ...period, kind: e.target.value })}><option value="initial">İlk değerlendirme</option><option value="periodic">Periyodik</option><option value="order">Sipariş sonrası</option></select></label>
      </Card>

      <Card className="p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Sparkles className="h-4 w-4 text-[#10B981]" />Dönemin otomatik verileri</p>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Zamanında teslim</dt><dd>{m.orders_completed ? `%${m.on_time_pct} (${m.on_time}/${m.orders_completed} sipariş)` : 'veri yok'}</dd></div>
          <div><dt className="text-xs text-slate-500">Red oranı</dt><dd>{m.reject_pct != null ? `%${m.reject_pct} (${Number(m.qty_rejected)} / ${Number(m.qty_received) + Number(m.qty_rejected)})` : 'veri yok'}</dd></div>
          <div><dt className="text-xs text-slate-500">Uygunsuzluk</dt><dd>{m.issues ?? 0} kayıt{m.major_issues ? ` · ${m.major_issues} büyük/kritik` : ''}</dd></div>
          <div><dt className="text-xs text-slate-500">Hizmet puanı</dt><dd>{m.service_avg != null ? `${m.service_avg}/5 (${m.service_n} onay)` : 'veri yok'}</dd></div>
          <div><dt className="text-xs text-slate-500">RFQ fiyat sırası</dt><dd>{m.rfqs ? `ortalama ${m.price_rank_avg}. (${m.rfqs} RFQ)` : 'veri yok'}</dd></div>
          <div><dt className="text-xs text-slate-500">Belgeler / harcama</dt><dd>{m.docs ?? 0} belge{m.docs_expired ? `, ${m.docs_expired} süresi dolmuş` : ''} · {tl(m.spend)}</dd></div>
        </dl>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-3 py-2">Kriter</th><th className="px-3 py-2 text-right">Ağırlık</th><th className="px-3 py-2">Öneri</th><th className="px-3 py-2">Puan (1–5)</th><th className="px-3 py-2">Not</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((r, i) => (
            <tr key={r.key}>
              <td className="px-3 py-2"><p className="text-slate-800">{r.label}</p><p className="text-[11px] text-slate-500">{r.hint}</p></td>
              <td className="px-3 py-2 text-right">%{r.weight}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{r.auto ?? 'veri yok'}</td>
              <td className="px-3 py-2"><div className="flex gap-1">{[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setRows(rs => rs.map((x, k) => k === i ? { ...x, score: x.score === n ? null : n } : x))}
                  className={`h-8 w-8 rounded-lg border text-sm ${r.score === n ? 'border-[#1B3A5C] bg-[#1B3A5C] text-white' : 'border-slate-200 text-slate-600'}`}>{n}</button>
              ))}</div></td>
              <td className="px-3 py-2"><input className={`${inp} w-full`} value={r.note} onChange={e => setRows(rs => rs.map((x, k) => k === i ? { ...x, note: e.target.value } : x))} /></td>
            </tr>
          ))}</tbody>
        </table>
        <p className="px-3 py-2 text-[11px] text-slate-500">Puanı boş kriter hesaba katılmaz (ağırlıklar yeniden dağıtılır). Not: A ≥ 85 · B 70–84 · C 50–69 · D &lt; 50.</p>
      </Card>

      <Card className="space-y-3 p-4">
        {calc ? <p className="flex items-center gap-2 text-sm">Puan <b className="text-lg">{calc.score}</b><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${GRADE_CLS[calc.grade]}`}>{calc.grade}</span><span className="text-slate-500">öneri: {DECISION_LABEL[calc.suggested]}</span></p> : <p className="text-sm text-slate-500">En az bir kritere puan verin.</p>}
        <div className="flex flex-wrap gap-2">{(['approve', 'conditional', 'block'] as const).map(k => (
          <button key={k} onClick={() => setDecision(k)} className={`rounded-lg border px-3 py-2 text-sm ${decision === k ? 'border-[#1B3A5C] bg-[#1B3A5C] text-white' : 'border-slate-200 text-slate-700'}`}>{DECISION_LABEL[k]}</button>
        ))}</div>
        <label className="block text-xs text-slate-600">{decision === 'conditional' ? 'Beklenen düzeltici faaliyet (zorunlu; uygunsuzluk kaydı açılır)' : calc && decision && decision !== calc.suggested ? 'Önerilenden farklı karar — gerekçe (zorunlu)' : 'Not'}
          <textarea className="w-full rounded-lg border border-slate-200 p-2 text-sm" rows={2} value={note} onChange={e => setNote(e.target.value)} /></label>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <Button disabled={busy || !calc || !decision} onClick={save}><Save className="h-4 w-4" />Değerlendirmeyi kaydet</Button>
      </Card>
    </div>
  );
}
