'use client';

// Teklif karşılaştırma: satırlar = kalemler, sütunlar = tedarikçiler; en düşük işaretli; kalem bazında veya toptan ödül
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import { Card, Button } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { RfqStatusBadge } from '@/components/procure/RequestBits';
import { createClient } from '@/lib/supabase';
import { PROCURE_SQL_1B, fmtDateTime, procError, termAdjusted, tl, unitNet, useProcure } from '@/lib/procure';
import { AlertTriangle, ArrowLeft, Award, CheckCircle2, Printer, TrendingDown } from 'lucide-react';

export default function ComparePage() {
  return (
    <div>
      <Header title="Teklif Karşılaştırma" subtitle="Satınalma" />
      <ProcureGate>{p => <Compare p={p} />}</ProcureGate>
    </div>
  );
}

const fmtU = (v: number | null | undefined) => (v == null ? '—' : `₺${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function Compare({ p }: { p: ReturnType<typeof useProcure> }) {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [d, setD] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  const [sel, setSel] = useState<Record<string, string>>({});   // rfq_line_id → rfq_vendor_id
  const [reason, setReason] = useState('');
  const [single, setSingle] = useState('');
  const [adjust, setAdjust] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await supabase.from('proc_rfqs').select('*').eq('id', id).maybeSingle();
    if (r.error) { setMissing(/relation|does not exist/i.test(r.error.message)); return; }
    if (!r.data) { setD({ notFound: true }); return; }
    const [ls, vs, aw, pol] = await Promise.all([
      supabase.from('proc_rfq_lines').select('*').eq('rfq_id', id).order('sort'),
      supabase.from('proc_rfq_vendors').select('*, customer:vendor_id(name)').eq('rfq_id', id).order('created_at'),
      supabase.from('proc_rfq_awards').select('*').eq('rfq_id', id),
      supabase.from('proc_policies').select('payment_term_monthly_rate_pct').maybeSingle(),
    ]);
    const rvIds = (vs.data || []).map((v: any) => v.id);
    const qs = rvIds.length ? (await supabase.from('proc_quotes').select('*').in('rfq_vendor_id', rvIds).eq('is_current', true)).data || [] : [];
    const qls = qs.length ? (await supabase.from('proc_quote_lines').select('*').in('quote_id', qs.map((q: any) => q.id))).data || [] : [];
    const profs = (vs.data || []).length ? (await supabase.from('proc_vendor_profiles').select('customer_id, score, grade, status').in('customer_id', (vs.data || []).map((v: any) => v.vendor_id))).data || [] : [];
    const cols = (vs.data || []).map((v: any) => ({ ...v, quote: qs.find((q: any) => q.rfq_vendor_id === v.id), prof: profs.find((x: any) => x.customer_id === v.vendor_id) }))
      .filter((v: any) => v.quote && !v.declined);
    setD({ r: r.data, lines: ls.data || [], cols, declined: (vs.data || []).filter((v: any) => v.declined), noQuote: (vs.data || []).filter((v: any) => !v.declined && !qs.find((q: any) => q.rfq_vendor_id === v.id)),
      qls, awards: aw.data || [], rate: pol.data?.payment_term_monthly_rate_pct ? Number(pol.data.payment_term_monthly_rate_pct) : null });
    setSel(Object.fromEntries((aw.data || []).map((a: any) => [a.rfq_line_id, a.rfq_vendor_id])));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Kalem × tedarikçi fiyat tablosu (vade düzeltmesi açıksa bugünkü değer)
  const grid = useMemo(() => {
    if (!d?.cols) return null;
    const cell = (lineId: string, col: any) => {
      const ql = d.qls.find((x: any) => x.quote_id === col.quote.id && x.rfq_line_id === lineId);
      if (!ql || !ql.can_supply || ql.unit_price == null) return { ql, unit: null as number | null, cmp: null as number | null };
      const u = unitNet(ql)!;
      return { ql, unit: u, cmp: adjust ? termAdjusted(u, col.quote.payment_term_days, d.rate) : u };
    };
    const rows = d.lines.map((l: any) => {
      const cells = d.cols.map((c: any) => cell(l.id, c));
      const vals = cells.map((c: any) => c.cmp).filter((v: any) => v != null) as number[];
      const nominal = cells.map((c: any) => c.unit).filter((v: any) => v != null) as number[];
      // low/high: ekranda karşılaştırılan (vade düzeltmeli olabilir); lowNominal: gerekçe kuralı (sunucu nominal fiyata bakar)
      return { l, cells, low: vals.length ? Math.min(...vals) : null, high: vals.length ? Math.max(...vals) : null,
        lowNominal: nominal.length ? Math.min(...nominal) : null, highNominal: nominal.length ? Math.max(...nominal) : null };
    });
    return rows;
  }, [d, adjust]);

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1B} /></div>;
  if (!d || !grid) return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;
  if (d.notFound) return <div className="p-6"><Card className="p-6 text-center text-sm">RFQ bulunamadı.</Card></div>;
  const r = d.r;
  const canAward = (p.hasRole('buyer') || p.isAdmin) && ['sent', 'closed'].includes(r.status);
  const valid = d.cols.filter((c: any) => Number(c.quote.total_net) > 0).length;
  const insufficient = valid < r.min_quotes_required;

  // Seçimin özeti
  const chosen = grid.map((g: any) => {
    const vi = d.cols.findIndex((c: any) => c.id === sel[g.l.id]);
    const c = vi >= 0 ? g.cells[vi] : null;
    return { g, c, vi };
  });
  const awardTotal = chosen.reduce((s: number, x: any) => s + (x.c?.unit != null ? x.c.unit * Number(x.g.l.quantity) : 0), 0);
  const baseTotal = chosen.reduce((s: number, x: any) => s + (x.c?.unit != null ? x.g.highNominal * Number(x.g.l.quantity) : 0), 0);
  const notLowest = chosen.some((x: any) => x.c?.unit != null && x.c.unit > x.g.lowNominal + 1e-9);
  const pickAll = (vi: number) => setSel(Object.fromEntries(grid.filter((g: any) => g.cells[vi].unit != null).map((g: any) => [g.l.id, d.cols[vi].id])));
  const pickLowest = () => setSel(Object.fromEntries(grid.filter((g: any) => g.low != null).map((g: any) => [g.l.id, d.cols[g.cells.findIndex((c: any) => c.cmp === g.low)].id])));

  const submit = async () => {
    setBusy(true); setMsg('');
    const awards = Object.entries(sel).map(([rfq_line_id, rfq_vendor_id]) => ({ rfq_line_id, rfq_vendor_id }));
    const { data, error } = await supabase.rpc('proc_rfq_award', { p_rfq: r.id, p_awards: awards, p_reason: reason || null, p_single_source_reason: single || null });
    setBusy(false);
    if (error) { setMsg(procError(error, PROCURE_SQL_1B)); return; }
    setMsg(data?.status === 'pending_award' ? 'Ödül kaydedildi; yetersiz teklif nedeniyle satınalma yöneticisi onayına gönderildi.' : 'Ödül verildi.');
    load();
  };

  return (
    <div className="space-y-3 p-3 sm:p-6">
      <Link href={`/procure/rfq/${r.id}`} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><ArrowLeft className="h-3.5 w-3.5" />{r.rfq_no}</Link>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">{r.rfq_no} · son tarih {fmtDateTime(r.deadline)}</p><h2 className="font-semibold text-slate-900">{r.title}</h2>
          <p className={`text-xs ${insufficient ? 'text-amber-700' : 'text-slate-500'}`}>{valid} geçerli teklif · asgari {r.min_quotes_required}{insufficient ? ' — yetersiz: tek kaynak gerekçesi ve satınalma yöneticisi onayı gerekir' : ''}</p></div>
        <RfqStatusBadge status={r.status} />
        {d.rate ? <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={adjust} onChange={e => setAdjust(e.target.checked)} />Vade düzeltilmiş fiyat (aylık %{d.rate})</label> : null}
        {['awarded', 'pending_award'].includes(r.status) && <a href={`/procure/rfq/${r.id}/print`} target="_blank" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700"><Printer className="h-3.5 w-3.5" />Karar tutanağı (PDF)</a>}
      </Card>

      {d.cols.length === 0 ? <Card className="p-8 text-center text-sm text-slate-500">Henüz teklif yok.</Card> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-slate-50 align-top text-left text-xs text-slate-600">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Kalem</th>
                {d.cols.map((c: any, vi: number) => (
                  <th key={c.id} className="min-w-[170px] px-3 py-2">
                    <p className="font-semibold text-slate-800">{c.customer?.name}</p>
                    <p className="font-normal">{c.prof?.grade ? `Not ${c.prof.grade}${c.prof.score != null ? ` (${Number(c.prof.score)})` : ''}` : 'Puan yok'} · teslim {c.quote.delivery_days ?? '—'} gün · vade {c.quote.payment_term_days ?? '—'} gün</p>
                    <p className="font-normal">{c.quote.version}. sürüm{c.quote.is_manual ? ' · elle' : ''}{c.quote.valid_until ? ` · geçerli ${new Date(c.quote.valid_until).toLocaleDateString('tr-TR')}` : ''}</p>
                    {canAward && <button onClick={() => pickAll(vi)} className="mt-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-normal text-slate-700 hover:bg-slate-100">Toptan bu tedarikçi</button>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grid.map((g: any) => (
                <tr key={g.l.id}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top"><p className="text-slate-800">{g.l.description}</p><p className="text-xs text-slate-500">{Number(g.l.quantity).toLocaleString('tr-TR')} {g.l.unit}</p></td>
                  {g.cells.map((c: any, vi: number) => {
                    const col = d.cols[vi]; const isLow = c.cmp != null && c.cmp === g.low; const picked = sel[g.l.id] === col.id;
                    return (
                      <td key={col.id} onClick={() => canAward && c.unit != null && setSel(s => ({ ...s, [g.l.id]: col.id }))}
                        className={`px-3 py-2 align-top ${isLow ? 'bg-emerald-50' : ''} ${picked ? 'ring-2 ring-inset ring-[#1B3A5C]' : ''} ${canAward && c.unit != null ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                        {c.unit == null ? <span className="text-xs text-slate-400">{c.ql && !c.ql.can_supply ? 'Veremiyor' : 'Fiyat yok'}{c.ql?.alternative_note ? ` · ${c.ql.alternative_note}` : ''}</span> : (
                          <>
                            <p className="font-medium text-slate-900">{fmtU(c.unit)} <span className="text-[11px] font-normal text-slate-500">/ birim</span></p>
                            <p className="text-xs text-slate-600">{tl(c.unit * Number(g.l.quantity))}{c.ql.discount_pct > 0 ? ` · %${Number(c.ql.discount_pct)} isk.` : ''} · KDV %{Number(c.ql.vat_rate)}</p>
                            {adjust && <p className="text-[11px] text-slate-500">vade düzeltilmiş {fmtU(c.cmp)}</p>}
                            {c.ql.brand_model && <p className="text-[11px] text-slate-500">{c.ql.brand_model}</p>}
                            {isLow && <p className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700"><TrendingDown className="h-3 w-3" />en düşük</p>}
                            {picked && <p className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-[#1B3A5C]"><Award className="h-3 w-3" />seçildi</p>}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="bg-slate-50 font-medium">
                <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-xs text-slate-600">Toplam (KDV hariç)</td>
                {d.cols.map((c: any) => <td key={c.id} className="px-3 py-2">{tl(c.quote.total_net)}<span className="block text-[11px] font-normal text-slate-500">KDV {tl(c.quote.total_vat)}</span></td>)}
              </tr>
            </tbody>
          </table>
          {(d.declined.length > 0 || d.noQuote.length > 0) && <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{d.declined.length > 0 && `Teklif vermeyen: ${d.declined.map((v: any) => v.customer?.name + (v.decline_reason ? ` (${v.decline_reason})` : '')).join(', ')}. `}{d.noQuote.length > 0 && `Yanıt yok: ${d.noQuote.map((v: any) => v.customer?.name).join(', ')}.`}</p>}
        </Card>
      )}

      {d.cols.length > 0 && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-slate-800">Ödül</p>
            {canAward && <Button size="sm" variant="secondary" onClick={pickLowest}><TrendingDown className="h-3.5 w-3.5" />Her kalemde en düşüğü seç</Button>}
            <div className="ml-auto text-right text-sm">
              <p>Ödül toplamı <b>{tl(awardTotal)}</b> <span className="text-xs text-slate-500">KDV hariç</span></p>
              <p className="text-xs text-emerald-700">Tasarruf (en yüksek teklife göre): {tl(baseTotal - awardTotal)}{baseTotal > 0 ? ` · %${Math.round(((baseTotal - awardTotal) / baseTotal) * 100)}` : ''}</p>
            </div>
          </div>
          {r.status === 'awarded' && <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Sonuçlandı · {fmtDateTime(r.awarded_at)}{r.award_reason ? ` · gerekçe: ${r.award_reason}` : ''}</p>}
          {r.status === 'pending_award' && <p className="flex items-center gap-1.5 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />Satınalma yöneticisi onayı bekleniyor{r.single_source_reason ? ` · tek kaynak gerekçesi: ${r.single_source_reason}` : ''}</p>}
          {canAward && (
            <>
              {notLowest && <label className="block text-xs text-slate-700">En düşük fiyat dışında seçim var — gerekçe (zorunlu)<textarea className="mt-1 w-full rounded-lg border border-amber-300 p-2 text-sm" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Örn. teslim süresi, kalite, önceki performans" /></label>}
              {insufficient && <label className="block text-xs text-slate-700">Tek kaynak / yetersiz teklif gerekçesi (zorunlu; satınalma yöneticisi onayına gider)<textarea className="mt-1 w-full rounded-lg border border-amber-300 p-2 text-sm" rows={2} value={single} onChange={e => setSingle(e.target.value)} placeholder="Örn. tek yetkili distribütör, piyasada başka tedarikçi yok" /></label>}
              <div className="flex items-center gap-2">
                <Button disabled={busy || Object.keys(sel).length === 0 || (notLowest && !reason.trim()) || (insufficient && !single.trim())} onClick={submit}><Award className="h-4 w-4" />Ödülü kaydet</Button>
                <span className="text-xs text-slate-500">{Object.keys(sel).length}/{d.lines.length} kalem seçildi · hücreye tıklayarak kalem bazında seçin</span>
              </div>
            </>
          )}
          {msg && <p className={`rounded-lg px-3 py-2 text-sm ${/verildi|kaydedildi/.test(msg) ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{msg}</p>}
        </Card>
      )}
    </div>
  );
}
