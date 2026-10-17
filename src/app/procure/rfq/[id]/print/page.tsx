'use client';

// Teklif karşılaştırma ve karar tutanağı (ISO 9001 md. 8.4 kaydı): kim, ne zaman, hangi gerekçeyle — "PDF olarak kaydet" ile indirilir
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { fmtDateTime, loadPeople, peopleMap, tl, unitNet } from '@/lib/procure';
import { Printer } from 'lucide-react';

const fmtU = (v: number | null) => (v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function RfqDecisionPrint() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [d, setD] = useState<any>(undefined);

  useEffect(() => {
    (async () => {
      const r = await supabase.from('proc_rfqs').select('*').eq('id', id).maybeSingle();
      if (!r.data) { setD(null); return; }
      const [ls, vs, aw, reqs, apps, org, lh, people] = await Promise.all([
        supabase.from('proc_rfq_lines').select('*').eq('rfq_id', id).order('sort'),
        supabase.from('proc_rfq_vendors').select('*, customer:vendor_id(name, tax_number)').eq('rfq_id', id).order('created_at'),
        supabase.from('proc_rfq_awards').select('*').eq('rfq_id', id),
        supabase.from('proc_requests').select('request_no, title').in('id', r.data.request_ids || []),
        supabase.from('proc_approvals').select('*').eq('subject_type', 'rfq').eq('subject_id', id).order('round'),
        supabase.from('organizations').select('name').eq('id', r.data.organization_id).maybeSingle(),
        supabase.from('quote_letterhead').select('*').maybeSingle(),
        loadPeople(supabase),
      ]);
      const rvIds = (vs.data || []).map((v: any) => v.id);
      const qs = rvIds.length ? (await supabase.from('proc_quotes').select('*').in('rfq_vendor_id', rvIds).eq('is_current', true)).data || [] : [];
      const qls = qs.length ? (await supabase.from('proc_quote_lines').select('*').in('quote_id', qs.map((q: any) => q.id))).data || [] : [];
      let logo: string | null = null;
      if ((lh as any).data?.logo_path) { const { data } = await supabase.storage.from('quote-files').createSignedUrl((lh as any).data.logo_path, 3600); logo = data?.signedUrl || null; }
      setD({ r: r.data, lines: ls.data || [], vendors: vs.data || [], awards: aw.data || [], reqs: reqs.data || [], apps: apps.data || [], org: org.data?.name || '',
        lh: (lh as any).data || {}, logo, names: peopleMap(people), qs, qls });
    })();
  }, [id]);

  if (d === undefined) return <p className="p-8 text-sm text-slate-500">Hazırlanıyor…</p>;
  if (d === null) return <p className="p-8 text-sm text-slate-500">RFQ bulunamadı veya görme yetkiniz yok.</p>;
  const r = d.r;
  const quoted = d.vendors.filter((v: any) => !v.declined && d.qs.some((q: any) => q.rfq_vendor_id === v.id));
  const cell = (lineId: string, rvId: string) => {
    const q = d.qs.find((x: any) => x.rfq_vendor_id === rvId);
    const ql = q && d.qls.find((x: any) => x.quote_id === q.id && x.rfq_line_id === lineId);
    return ql && ql.can_supply ? unitNet(ql) : null;
  };
  const vName = (rvId: string) => d.vendors.find((v: any) => v.id === rvId)?.customer?.name || '—';
  const approval = d.apps.filter((a: any) => a.status !== 'pending').slice(-1)[0];
  const th = 'border border-slate-300 bg-slate-100 px-2 py-1 text-left text-[11px] font-semibold';
  const td = 'border border-slate-300 px-2 py-1 align-top text-[11px]';

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{'@page { size: A4; margin: 14mm; } @media print { .no-print { display: none !important; } }'}</style>
      <div className="no-print mx-auto mb-3 flex max-w-[210mm] justify-end"><button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B3A5C] px-4 py-2 text-sm font-medium text-white"><Printer className="h-4 w-4" />Yazdır / PDF olarak kaydet</button></div>
      <div className="mx-auto max-w-[210mm] bg-white p-[12mm] text-slate-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b-2 pb-3" style={{ borderColor: d.lh.accent_color || '#1B3A5C' }}>
          <div>{d.logo && <img src={d.logo} alt="" className="mb-1 h-12 object-contain" />}<p className="text-sm font-bold">{d.lh.legal_name || d.org}</p><p className="text-[11px] text-slate-600">{[d.lh.address, d.lh.phone, d.lh.email].filter(Boolean).join(' · ')}</p></div>
          <div className="text-right"><p className="text-base font-bold" style={{ color: d.lh.accent_color || '#1B3A5C' }}>TEKLİF KARŞILAŞTIRMA VE KARAR TUTANAĞI</p><p className="text-[11px] text-slate-600">{r.rfq_no} · Düzenlenme {fmtDateTime(new Date().toISOString())}</p></div>
        </div>

        <table className="mt-3 w-full border-collapse"><tbody>
          <tr><td className={th}>Konu</td><td className={td} colSpan={3}>{r.title}</td></tr>
          <tr><td className={th}>İlgili talepler</td><td className={td} colSpan={3}>{d.reqs.map((q: any) => `${q.request_no} ${q.title}`).join(' · ') || '—'}</td></tr>
          <tr><td className={th}>Gönderim</td><td className={td}>{fmtDateTime(r.sent_at)}</td><td className={th}>Son teklif tarihi</td><td className={td}>{fmtDateTime(r.deadline)}</td></tr>
          <tr><td className={th}>Davet edilen</td><td className={td}>{d.vendors.length} tedarikçi</td><td className={th}>Geçerli teklif / asgari</td><td className={td}>{quoted.length} / {r.min_quotes_required}</td></tr>
          <tr><td className={th}>Teslim şartı</td><td className={td}>{r.delivery_terms || '—'}</td><td className={th}>Ödeme şartı</td><td className={td}>{r.payment_terms || '—'}</td></tr>
        </tbody></table>

        <p className="mt-4 text-xs font-semibold">1. Davet edilen tedarikçiler ve yanıtlar</p>
        <table className="mt-1 w-full border-collapse"><thead><tr><th className={th}>Tedarikçi</th><th className={th}>Yanıt</th><th className={th}>Teklif (KDV hariç)</th><th className={th}>Teslim / vade</th><th className={th}>Gönderen · tarih</th></tr></thead><tbody>
          {d.vendors.map((v: any) => { const q = d.qs.find((x: any) => x.rfq_vendor_id === v.id); return (
            <tr key={v.id}><td className={td}>{v.customer?.name}{v.customer?.tax_number ? ` (${v.customer.tax_number})` : ''}</td>
              <td className={td}>{v.declined ? `Teklif vermedi${v.decline_reason ? `: ${v.decline_reason}` : ''}` : q ? `${q.version}. sürüm${q.is_manual ? ' (elle girildi)' : ''}` : 'Yanıt yok'}</td>
              <td className={`${td} text-right`}>{q && !v.declined ? tl(q.total_net) : '—'}</td><td className={td}>{q ? `${q.delivery_days ?? '—'} gün / ${q.payment_term_days ?? '—'} gün` : '—'}</td>
              <td className={td}>{q ? `${q.submitted_by_name || ''} · ${fmtDateTime(q.submitted_at)}` : '—'}</td></tr>
          ); })}
        </tbody></table>

        <p className="mt-4 text-xs font-semibold">2. Kalem bazında birim fiyatlar (₺, iskonto sonrası, KDV hariç) — * en düşük</p>
        <table className="mt-1 w-full border-collapse"><thead><tr><th className={th}>Kalem</th><th className={th}>Miktar</th>{quoted.map((v: any) => <th key={v.id} className={th}>{v.customer?.name}</th>)}</tr></thead><tbody>
          {d.lines.map((l: any) => { const vals = quoted.map((v: any) => cell(l.id, v.id)); const low = Math.min(...vals.filter((x: any) => x != null) as number[]); return (
            <tr key={l.id}><td className={td}>{l.description}</td><td className={td}>{Number(l.quantity).toLocaleString('tr-TR')} {l.unit}</td>
              {vals.map((x: number | null, i: number) => <td key={i} className={`${td} text-right`}>{fmtU(x)}{x != null && x === low ? ' *' : ''}</td>)}</tr>
          ); })}
        </tbody></table>

        <p className="mt-4 text-xs font-semibold">3. Karar</p>
        <table className="mt-1 w-full border-collapse"><thead><tr><th className={th}>Kalem</th><th className={th}>Seçilen tedarikçi</th><th className={th}>Birim</th><th className={th}>Tutar</th><th className={th}>En düşük mü?</th></tr></thead><tbody>
          {d.awards.length === 0 ? <tr><td className={td} colSpan={5}>Ödül verilmedi.</td></tr> : d.lines.map((l: any) => { const a = d.awards.find((x: any) => x.rfq_line_id === l.id); return a ? (
            <tr key={l.id}><td className={td}>{l.description}</td><td className={td}>{vName(a.rfq_vendor_id)}</td><td className={`${td} text-right`}>{fmtU(Number(a.unit_net))}</td><td className={`${td} text-right`}>{tl(a.line_total)}</td><td className={td}>{a.is_lowest ? 'Evet' : 'Hayır'}</td></tr>
          ) : null; })}
          <tr><td className={th} colSpan={3}>Ödül toplamı (KDV hariç)</td><td className={`${td} text-right font-semibold`}>{tl(r.award_total)}</td><td className={td}>Tasarruf {tl(r.savings_amount)}</td></tr>
        </tbody></table>
        {r.award_reason && <p className="mt-2 text-[11px]"><b>En düşük dışı seçim gerekçesi:</b> {r.award_reason}</p>}
        {r.single_source_reason && <p className="mt-1 text-[11px]"><b>Tek kaynak / yetersiz teklif gerekçesi:</b> {r.single_source_reason}</p>}
        <p className="mt-1 text-[11px] text-slate-600">Tasarruf, seçilen kalemlerde en yüksek geçerli teklif ile ödül tutarı arasındaki farktır.</p>

        <div className="mt-8 grid grid-cols-2 gap-8 text-[11px]">
          <div className="border-t border-slate-400 pt-1"><p className="font-semibold">Kararı veren (Satınalma)</p><p>{d.names[r.awarded_by] || '—'}</p><p className="text-slate-600">{fmtDateTime(r.awarded_at || r.closed_at)}</p></div>
          <div className="border-t border-slate-400 pt-1"><p className="font-semibold">Onaylayan</p>{approval ? <><p>{d.names[approval.decided_by] || '—'}{approval.delegated_from ? ` (vekâleten, asıl: ${d.names[approval.delegated_from] || '—'})` : ''}</p><p className="text-slate-600">{approval.status === 'approved' ? 'Onayladı' : 'Reddetti'} · {fmtDateTime(approval.decided_at)}{approval.note ? ` · ${approval.note}` : ''}</p></> : <p className="text-slate-600">{r.status === 'pending_award' ? 'Onay bekleniyor' : 'Ek onay gerekmedi (asgari teklif sayısı sağlandı)'}</p>}</div>
        </div>
        <p className="mt-6 text-center text-[10px] text-slate-400">Inspira360 Procure ile oluşturulmuştur · {r.rfq_no}</p>
      </div>
    </div>
  );
}
