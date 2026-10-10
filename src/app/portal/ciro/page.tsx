'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePortal, PortalTitle } from '@/components/portal/PortalShell';
import { FileField, FileLink, Kpi } from '@/components/portal/common';
import { Badge, Button, Input, Modal, Textarea } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { ROYALTY_STATUS, royaltyPreview, monthLabel, lastMonths } from '@/lib/franchise';
import { Plus, AlertTriangle } from 'lucide-react';

const tl = (v: any) => `₺${formatMoney(Number(v) || 0)}`;

export default function PortalRoyalty() {
  const { supabase, me, refreshCounts } = usePortal();
  const [data, setData] = useState<any | null>(null);
  const [form, setForm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => supabase.rpc('portal_royalty').then(({ data, error }: any) => setData(error ? { agreement: null, reports: [] } : data));
  useEffect(() => { load(); }, []);

  const months = useMemo(() => lastMonths(6), []);
  if (!data) return <div className="flex h-60 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" /></div>;
  const ag = data.agreement;
  const reports: any[] = data.reports || [];
  const byPeriod = (p: string) => reports.find(r => String(r.period).slice(0, 10) === p);
  const missing = months.filter(p => !byPeriod(p) || byPeriod(p).status === 'rejected');
  const yearTotal = reports.filter(r => String(r.period).startsWith(String(new Date().getFullYear())) && r.status !== 'rejected');

  const submit = async () => {
    if (form.gross === '' || Number(form.gross) < 0) { alert('Aylık cironuzu girin.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('portal_royalty_submit', { p_period: form.period, p_gross: Number(form.gross), p_note: form.note || null, p_attachment: form.attachment || null });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setForm(null); load(); refreshCounts();
  };
  const preview = form ? royaltyPreview(Number(form.gross) || 0, ag) : null;

  if (!ag) return <><PortalTitle title="Ciro Bildirimi & Royalty" /><p className="text-sm text-slate-500">Tanımlı bir royalty anlaşmanız bulunmuyor.</p></>;
  return (
    <div className="space-y-4">
      <PortalTitle title="Ciro Bildirimi & Royalty" subtitle={`Royalty %${Number(ag.royalty_pct)}${Number(ag.marketing_pct) ? ` · Reklam fonu %${Number(ag.marketing_pct)}` : ''}${Number(ag.min_royalty) ? ` · Aylık asgari ${tl(ag.min_royalty)}` : ''}${Number(ag.fixed_fee) ? ` · Sabit ${tl(ag.fixed_fee)}` : ''} · Ödeme: sonraki ayın ${ag.due_day}'i`}
        action={<Button onClick={() => setForm({ period: missing[0] || months[0], gross: '', note: '', attachment: '' })}><Plus className="h-4 w-4" />Ciro bildir</Button>} />
      {missing.length > 0 && missing[0] === months[0] && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" />{monthLabel(months[0])} cirosunu henüz bildirmediniz.</div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={`${new Date().getFullYear()} toplam ciro`} value={tl(yearTotal.reduce((s, r) => s + Number(r.gross_sales), 0))} />
        <Kpi label="Bu yıl royalty + fon" value={tl(yearTotal.reduce((s, r) => s + Number(r.total_amount || 0), 0))} tone="indigo" />
        <Kpi label="Onay bekleyen bildirim" value={String(reports.filter(r => r.status === 'submitted').length)} tone="amber" />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Dönem</th><th className="text-right">Ciro</th><th className="text-right">Royalty</th><th className="text-right">Reklam fonu</th><th className="text-right">Toplam</th><th className="px-3">Vade</th><th>Durum</th><th /></tr></thead>
          <tbody>
            {Array.from(new Set([...months, ...reports.map(r => String(r.period).slice(0, 10))])).sort().reverse().map(p => {
              const r = byPeriod(p);
              return (
                <tr key={p} className="border-b">
                  <td className="px-3 py-2 font-medium">{monthLabel(p)}</td>
                  {r ? <>
                    <td className="text-right">{tl(r.gross_sales)}</td><td className="text-right">{tl(r.royalty_amount)}</td><td className="text-right">{tl(r.marketing_amount)}</td>
                    <td className="text-right font-semibold">{tl(r.total_amount)}</td><td className="px-3 text-xs">{r.due_date ? new Date(r.due_date).toLocaleDateString('tr-TR') : '-'}</td>
                    <td><Badge variant={ROYALTY_STATUS[r.status]?.variant}>{ROYALTY_STATUS[r.status]?.label}</Badge>{r.review_note && <p className="text-[11px] text-red-600">{r.review_note}</p>}{r.attachment_url && <div><FileLink supabase={supabase} value={r.attachment_url} /></div>}</td>
                    <td className="pr-3 text-right">{['submitted', 'rejected'].includes(r.status) && <button className="text-xs text-indigo-600" onClick={() => setForm({ period: p, gross: String(r.gross_sales), note: r.note || '', attachment: r.attachment_url || '' })}>Düzelt</button>}</td>
                  </> : <><td colSpan={5} className="text-xs text-red-600">Bildirilmedi</td><td /><td className="pr-3 text-right"><button className="text-xs text-indigo-600" onClick={() => setForm({ period: p, gross: '', note: '', attachment: '' })}>Bildir</button></td></>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Onaylanan tutarlar cari hesabınıza işlenir; "Finans & Cari Hesap" ekranından ekstrenizi görebilirsiniz.</p>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Aylık ciro bildirimi"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button disabled={busy} onClick={submit}>{busy ? 'Gönderiliyor…' : 'Bildir'}</Button></>}>
        {form && (
          <div className="space-y-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Dönem</label>
              <select className="w-full rounded-lg border px-3 py-2 text-sm" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })}>
                {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></div>
            <Input label={`Aylık ciro (₺, ${ag.basis === 'gross' ? 'KDV dahil' : 'KDV hariç'})`} type="number" value={form.gross} onChange={e => setForm({ ...form, gross: e.target.value })} />
            <FileField supabase={supabase} dealerId={me.dealer.id} value={form.attachment} onChange={v => setForm({ ...form, attachment: v })} label="Z raporu / POS özeti (önerilir)" />
            <Textarea label="Not" rows={2} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            {preview && Number(form.gross) > 0 && <div className="rounded-lg bg-indigo-50 p-3 text-sm">Royalty {tl(preview.royalty)}{preview.minAdj > 0 ? ' (asgari tutara tamamlandı)' : ''}{preview.marketing ? ` · Reklam fonu ${tl(preview.marketing)}` : ''}{preview.fixed ? ` · Sabit ${tl(preview.fixed)}` : ''}<br /><b>Ödenecek toplam: {tl(preview.total)}</b></div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
