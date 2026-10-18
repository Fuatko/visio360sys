'use client';

// Onaylı Tedarikçi Listesi (ISO 9001 md. 8.4 kaydı) — PDF (yazdır) ve Excel (CSV) çıktısı
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetch-all';
import { VENDOR_STATUS, VendorDoc, docExpired, downloadCsv, fmtDate } from '@/lib/procure';
import { Download, Printer } from 'lucide-react';

export default function ApprovedVendorListPrint() {
  const supabase = createClient();
  const [d, setD] = useState<any>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    (async () => {
      const [profs, cats, evals, org, lh] = await Promise.all([
        fetchAll(() => supabase.from('proc_vendor_profiles').select('*, customer:customer_id(name, tax_number, city)')),
        supabase.from('proc_categories').select('id, name'),
        fetchAll(() => supabase.from('proc_vendor_evaluations').select('vendor_id, created_at, score, grade, decision').order('created_at', { ascending: false })),
        supabase.from('organizations').select('name').maybeSingle(),
        supabase.from('quote_letterhead').select('legal_name, accent_color').maybeSingle(),
      ]);
      const lastEval: Record<string, any> = {};
      evals.forEach((e: any) => { if (!lastEval[e.vendor_id]) lastEval[e.vendor_id] = e; });
      const catName = Object.fromEntries((cats.data || []).map((c: any) => [c.id, c.name]));
      setD({ rows: profs.map((p: any) => ({ ...p, cats: (p.category_ids || []).map((x: string) => catName[x]).filter(Boolean), last: lastEval[p.customer_id] }))
        .sort((a: any, b: any) => (a.cats[0] || 'zzz').localeCompare(b.cats[0] || 'zzz', 'tr') || (a.customer?.name || '').localeCompare(b.customer?.name || '', 'tr')),
        org: (lh as any).data?.legal_name || org.data?.name || '', accent: (lh as any).data?.accent_color || '#1B3A5C' });
    })();
  }, []);

  if (!d) return <p className="p-8 text-sm text-slate-500">Hazırlanıyor…</p>;
  const rows = d.rows.filter((r: any) => all || ['approved', 'conditional'].includes(r.status));
  const docState = (r: any) => { const docs: VendorDoc[] = r.documents || []; const exp = docs.filter(docExpired); return { n: docs.length, exp }; };
  const csv = () => downloadCsv(`onayli-tedarikci-listesi-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Kategori', 'Tedarikçi', 'Vergi no', 'Statü', 'Puan', 'Not', 'Son değerlendirme', 'Sonraki değerlendirme', 'Belge sayısı', 'Süresi dolan belgeler'],
    ...rows.map((r: any) => { const s = docState(r); return [r.cats.join(', '), r.customer?.name, r.customer?.tax_number, VENDOR_STATUS[r.status as keyof typeof VENDOR_STATUS]?.label, r.score ?? '', r.grade ?? '', r.last ? fmtDate(r.last.created_at) : '', fmtDate(r.next_evaluation_due), s.n, s.exp.map((x: VendorDoc) => `${x.type} (${fmtDate(x.valid_until)})`).join('; ')]; }),
  ]);
  const th = 'border border-slate-300 bg-slate-100 px-2 py-1 text-left text-[10px] font-semibold';
  const td = 'border border-slate-300 px-2 py-1 align-top text-[10px]';
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{'@page { size: A4 landscape; margin: 12mm; } @media print { .no-print { display: none !important; } }'}</style>
      <div className="no-print mx-auto mb-3 flex max-w-[297mm] flex-wrap items-center justify-end gap-2">
        <label className="mr-auto flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Aday ve bloke tedarikçileri de göster</label>
        <button onClick={csv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"><Download className="h-4 w-4" />Excel (CSV)</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B3A5C] px-4 py-2 text-sm font-medium text-white"><Printer className="h-4 w-4" />Yazdır / PDF</button>
      </div>
      <div className="mx-auto max-w-[297mm] bg-white p-[10mm] text-slate-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <div className="mb-3 flex items-end justify-between border-b-2 pb-2" style={{ borderColor: d.accent }}>
          <div><p className="text-sm font-bold">{d.org}</p><p className="text-base font-bold" style={{ color: d.accent }}>ONAYLI TEDARİKÇİ LİSTESİ</p></div>
          <p className="text-[10px] text-slate-600">ISO 9001:2015 md. 8.4 · Düzenlenme {fmtDate(today)} · {rows.length} tedarikçi</p>
        </div>
        <table className="w-full border-collapse"><thead><tr><th className={th}>Kategori</th><th className={th}>Tedarikçi</th><th className={th}>Vergi no</th><th className={th}>Statü</th><th className={th}>Puan / Not</th><th className={th}>Son değerlendirme</th><th className={th}>Sonraki</th><th className={th}>Belgeler</th></tr></thead>
          <tbody>{rows.map((r: any) => { const s = docState(r); const due = r.next_evaluation_due && r.next_evaluation_due < today; return (
            <tr key={r.customer_id}>
              <td className={td}>{r.cats.join(', ') || '—'}</td><td className={td}>{r.customer?.name}{r.customer?.city ? <span className="block text-slate-500">{r.customer.city}</span> : null}</td>
              <td className={td}>{r.customer?.tax_number || '—'}</td><td className={td}>{VENDOR_STATUS[r.status as keyof typeof VENDOR_STATUS]?.label}</td>
              <td className={td}>{r.score != null ? `${Number(r.score)} · ${r.grade}` : '—'}</td><td className={td}>{r.last ? fmtDate(r.last.created_at) : '—'}</td>
              <td className={`${td} ${due ? 'font-semibold text-rose-600' : ''}`}>{fmtDate(r.next_evaluation_due) || '—'}{due ? ' (geçti)' : ''}</td>
              <td className={td}>{s.n} belge{s.exp.length > 0 && <span className="block font-semibold text-rose-600">Süresi dolan: {s.exp.map((x: VendorDoc) => `${x.type} (${fmtDate(x.valid_until)})`).join(', ')}</span>}</td>
            </tr>
          ); })}</tbody></table>
        <div className="mt-6 grid grid-cols-2 gap-8 text-[10px]"><div className="border-t border-slate-400 pt-1"><p className="font-semibold">Hazırlayan (Satınalma)</p></div><div className="border-t border-slate-400 pt-1"><p className="font-semibold">Onaylayan</p></div></div>
      </div>
    </div>
  );
}
