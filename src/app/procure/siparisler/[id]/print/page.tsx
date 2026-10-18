'use client';

// Kurumsal A4 satınalma siparişi (teklif antetiyle ortak) — "PDF olarak kaydet" ile indirilir
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { fmtDate, fmtDateTime, loadPeople, peopleMap } from '@/lib/procure';
import { Printer } from 'lucide-react';

const fmtU = (v: number) => `₺${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function OrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [d, setD] = useState<any>(undefined);

  useEffect(() => {
    (async () => {
      const o = await supabase.from('proc_orders').select('*, vendor:vendor_id(name, tax_number, tax_office, address, city, phone, email)').eq('id', id).maybeSingle();
      if (!o.data) { setD(null); return; }
      const [ls, lh, org, apps, people, reqs] = await Promise.all([
        supabase.from('proc_order_lines').select('*').eq('order_id', id).order('sort'),
        supabase.from('quote_letterhead').select('*').maybeSingle(),
        supabase.from('organizations').select('name').eq('id', o.data.organization_id).maybeSingle(),
        supabase.from('proc_approvals').select('*').eq('subject_type', 'order').eq('subject_id', id).eq('round', o.data.approval_round).eq('status', 'approved').order('step_no'),
        loadPeople(supabase),
        supabase.from('proc_requests').select('request_no').in('id', o.data.request_ids || []),
      ]);
      let logo: string | null = null;
      if ((lh as any).data?.logo_path) { const { data } = await supabase.storage.from('quote-files').createSignedUrl((lh as any).data.logo_path, 3600); logo = data?.signedUrl || null; }
      setD({ o: o.data, lines: ls.data || [], lh: (lh as any).data || {}, logo, org: org.data?.name || '', apps: apps.data || [], names: peopleMap(people), reqs: reqs.data || [] });
    })();
  }, [id]);

  if (d === undefined) return <p className="p-8 text-sm text-slate-500">Hazırlanıyor…</p>;
  if (d === null) return <p className="p-8 text-sm text-slate-500">Sipariş bulunamadı veya görme yetkiniz yok.</p>;
  const { o, lh } = d;
  const accent = lh.accent_color || '#1B3A5C';
  const vatGroups = d.lines.reduce((m: Record<string, number>, l: any) => ({ ...m, [Number(l.vat_rate)]: (m[Number(l.vat_rate)] || 0) + Number(l.line_total) * Number(l.vat_rate) / 100 }), {});
  const th = 'border-b-2 px-2 py-1.5 text-left text-[11px] font-semibold';
  const td = 'border-b border-slate-200 px-2 py-1.5 align-top text-[11px]';

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{'@page { size: A4; margin: 14mm; } @media print { .no-print { display: none !important; } }'}</style>
      <div className="no-print mx-auto mb-3 flex max-w-[210mm] justify-end"><button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B3A5C] px-4 py-2 text-sm font-medium text-white"><Printer className="h-4 w-4" />Yazdır / PDF olarak kaydet</button></div>
      <div className="mx-auto max-w-[210mm] bg-white p-[12mm] text-slate-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b-2 pb-3" style={{ borderColor: accent }}>
          <div>{d.logo && <img src={d.logo} alt="" className="mb-1 h-12 object-contain" />}<p className="text-sm font-bold">{lh.legal_name || d.org}</p>
            <p className="max-w-[90mm] text-[11px] text-slate-600">{[lh.address, lh.phone, lh.email, lh.tax_office && `VD ${lh.tax_office}`, lh.tax_number && `VKN ${lh.tax_number}`].filter(Boolean).join(' · ')}</p></div>
          <div className="text-right"><p className="text-lg font-bold" style={{ color: accent }}>SATINALMA SİPARİŞİ</p>
            <p className="text-sm font-semibold">{o.order_no}{o.revision ? ` · Rev. ${o.revision}` : ''}</p><p className="text-[11px] text-slate-600">Tarih {fmtDate(o.order_date)}</p></div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 text-[11px]">
          <div className="rounded border border-slate-200 p-2"><p className="mb-0.5 font-semibold" style={{ color: accent }}>TEDARİKÇİ</p><p className="font-semibold">{o.vendor?.name}</p>
            <p>{[o.vendor?.address, o.vendor?.city].filter(Boolean).join(', ')}</p><p>{[o.vendor?.tax_office && `VD ${o.vendor.tax_office}`, o.vendor?.tax_number && `VKN/TCKN ${o.vendor.tax_number}`].filter(Boolean).join(' · ')}</p><p>{[o.vendor?.phone, o.vendor?.email].filter(Boolean).join(' · ')}</p></div>
          <div className="rounded border border-slate-200 p-2"><p className="mb-0.5 font-semibold" style={{ color: accent }}>TESLİMAT</p><p>{o.delivery_address || '—'}</p>
            <p>İstenen teslim tarihi: <b>{fmtDate(o.expected_date) || '—'}</b></p><p>Ödeme: {o.payment_term_days != null ? `${o.payment_term_days} gün vade` : '—'}</p><p>İlgili talepler: {d.reqs.map((r: any) => r.request_no).join(', ') || '—'}</p></div>
        </div>
        <table className="mt-3 w-full border-collapse"><thead><tr style={{ borderColor: accent }}><th className={th}>#</th><th className={th}>Açıklama</th><th className={`${th} text-right`}>Miktar</th><th className={`${th} text-right`}>Birim fiyat</th><th className={`${th} text-right`}>İsk.</th><th className={`${th} text-right`}>KDV</th><th className={`${th} text-right`}>Tutar</th></tr></thead>
          <tbody>{d.lines.map((l: any, i: number) => (
            <tr key={l.id}><td className={td}>{i + 1}</td><td className={td}>{l.description}{l.brand_model ? <span className="block text-slate-500">{l.brand_model}</span> : null}</td>
              <td className={`${td} text-right`}>{Number(l.quantity).toLocaleString('tr-TR')} {l.unit}</td><td className={`${td} text-right`}>{fmtU(l.unit_price)}</td>
              <td className={`${td} text-right`}>{Number(l.discount_pct) ? `%${Number(l.discount_pct)}` : '—'}</td><td className={`${td} text-right`}>%{Number(l.vat_rate)}</td><td className={`${td} text-right`}>{fmtU(l.line_total)}</td></tr>
          ))}</tbody></table>
        <div className="mt-2 flex justify-end"><table className="text-[11px]"><tbody>
          <tr><td className="px-2 py-0.5 text-right text-slate-600">Ara toplam (KDV hariç)</td><td className="px-2 py-0.5 text-right">{fmtU(o.subtotal)}</td></tr>
          {Object.entries(vatGroups).map(([r, v]) => <tr key={r}><td className="px-2 py-0.5 text-right text-slate-600">KDV %{r}</td><td className="px-2 py-0.5 text-right">{fmtU(v as number)}</td></tr>)}
          <tr className="font-bold"><td className="border-t px-2 py-1 text-right" style={{ color: accent }}>GENEL TOPLAM</td><td className="border-t px-2 py-1 text-right">{fmtU(o.total)}</td></tr>
        </tbody></table></div>
        {(o.terms || o.notes) && <div className="mt-3 text-[11px]"><p className="font-semibold" style={{ color: accent }}>ŞARTLAR VE NOTLAR</p>{o.terms && <p className="whitespace-pre-wrap">{o.terms}</p>}{o.notes && <p className="whitespace-pre-wrap">{o.notes}</p>}</div>}
        <p className="mt-2 text-[10px] text-slate-500">Faturada sipariş numarasının ({o.order_no}) belirtilmesi ve irsaliyenin teslimatta ibraz edilmesi rica olunur. Siparişi onaylamak için size iletilen bağlantıyı kullanabilirsiniz.</p>
        <div className="mt-8 grid grid-cols-2 gap-8 text-[11px]">
          <div className="border-t border-slate-400 pt-1"><p className="font-semibold">Hazırlayan (Satınalma)</p><p>{d.names[o.buyer_id] || '—'}</p></div>
          <div className="border-t border-slate-400 pt-1"><p className="font-semibold">Onaylayan</p>{d.apps.length ? d.apps.map((a: any) => <p key={a.id}>{d.names[a.decided_by] || '—'} ({a.approver_label}) · {fmtDateTime(a.decided_at)}</p>) : <p>{lh.signer_name ? `${lh.signer_name}${lh.signer_title ? ` · ${lh.signer_title}` : ''}` : '—'}</p>}</div>
        </div>
        {o.acknowledged_at && <p className="mt-4 text-[10px] text-slate-600">Tedarikçi onayı: {o.acknowledged_by_name} · {fmtDateTime(o.acknowledged_at)} · tahmini teslim {fmtDate(o.ack_expected_date)}</p>}
        <p className="mt-6 text-center text-[10px] text-slate-400">Inspira360 Procure · {o.order_no}</p>
      </div>
    </div>
  );
}
