'use client';

// Tedarikçi sipariş sayfası — giriş yok. Siparişi görür, "Siparişi onaylıyorum + tahmini teslim tarihi" ile onaylar.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { AlertTriangle, CheckCircle2, Printer, XCircle } from 'lucide-react';

const money = (v: any) => `₺${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fd = (d?: string | null) => (d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');
const fdt = (d?: string | null) => (d ? new Date(d).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }) : '—');
const inp = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] outline-none focus:border-[#1B3A5C]';

export default function PublicPoPage() {
  const { token } = useParams<{ token: string }>();
  const supabase = createClient();
  const [o, setO] = useState<any>(undefined);
  const [f, setF] = useState({ name: '', expected_date: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async (track = true) => {
    const { data, error } = await supabase.rpc('proc_public_po_get', { p_token: token, p_track: track });
    if (error) { setErr(error.message); setO(null); return; }
    setO(data || null);
    if (data && !f.expected_date) setF(x => ({ ...x, expected_date: data.expected_date || '' }));
  };
  useEffect(() => { load(); }, [token]);

  const ack = async () => {
    setErr('');
    if (!f.name.trim()) { setErr('Onaylayan kişinin adını yazın.'); return; }
    if (!f.expected_date) { setErr('Tahmini teslim tarihini girin.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('proc_public_po_ack', { p_token: token, payload: f });
    setBusy(false);
    if (error) setErr(error.message); else load(false);
  };

  if (o === undefined) return <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] text-sm text-slate-500">Yükleniyor…</div>;
  if (o === null) return <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] p-6 text-center text-sm text-slate-600"><div><AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />{err || 'Bu sipariş bağlantısı geçersiz veya artık kullanılmıyor.'}</div></div>;

  return (
    <div className="min-h-screen bg-[#F4F7FB] pb-10 print:bg-white">
      <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div><p className="text-xs text-slate-500">{o.org_name} · satınalma siparişi</p><h1 className="text-lg font-semibold text-[#1B3A5C]">{o.order_no}{o.revision ? ` · Rev. ${o.revision}` : ''}</h1><p className="text-sm text-slate-600">Sayın {o.vendor_name}</p></div>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 print:hidden"><Printer className="h-4 w-4" />Yazdır</button>
          </div>
          <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-slate-500">Sipariş tarihi: </dt><dd className="inline">{fd(o.order_date)}</dd></div>
            <div><dt className="inline text-slate-500">İstenen teslim: </dt><dd className="inline font-medium">{fd(o.expected_date)}</dd></div>
            <div><dt className="inline text-slate-500">Ödeme: </dt><dd className="inline">{o.payment_term_days != null ? `${o.payment_term_days} gün vade` : '—'}</dd></div>
            <div className="sm:col-span-2"><dt className="inline text-slate-500">Teslim adresi: </dt><dd className="inline">{o.delivery_address || '—'}</dd></div>
          </dl>
          {o.cancelled && <p className="mt-2 flex items-center gap-1.5 text-sm text-rose-700"><XCircle className="h-4 w-4" />Bu sipariş iptal edilmiştir.</p>}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-3 py-2">Kalem</th><th className="px-3 py-2 text-right">Miktar</th><th className="px-3 py-2 text-right">Birim fiyat</th><th className="px-3 py-2 text-right">Tutar</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{o.lines.map((l: any, i: number) => (
              <tr key={i}><td className="px-3 py-2">{l.description}{l.brand_model && <span className="block text-xs text-slate-500">{l.brand_model}</span>}</td>
                <td className="px-3 py-2 text-right">{Number(l.quantity).toLocaleString('tr-TR')} {l.unit}{Number(l.received_qty) > 0 && <span className="block text-[11px] text-emerald-700">{Number(l.received_qty).toLocaleString('tr-TR')} teslim alındı</span>}</td>
                <td className="px-3 py-2 text-right">{money(l.unit_price)}{Number(l.discount_pct) > 0 && <span className="block text-[11px] text-slate-500">%{Number(l.discount_pct)} isk.</span>}</td>
                <td className="px-3 py-2 text-right">{money(l.line_total)}<span className="block text-[11px] text-slate-500">KDV %{Number(l.vat_rate)}</span></td></tr>
            ))}</tbody>
            <tfoot className="border-t bg-slate-50"><tr><td colSpan={3} className="px-3 py-2 text-right text-slate-600">Ara toplam · KDV · Genel toplam</td><td className="px-3 py-2 text-right font-semibold">{money(o.subtotal)} · {money(o.vat_total)} · {money(o.total)}</td></tr></tfoot>
          </table>
        </div>
        {(o.terms || o.notes) && <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700"><p className="mb-1 text-xs font-semibold text-slate-500">Şartlar ve notlar</p>{o.terms && <p className="whitespace-pre-wrap">{o.terms}</p>}{o.notes && <p className="whitespace-pre-wrap">{o.notes}</p>}</div>}

        {o.acknowledged_at ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>Siparişi onayladınız: <b>{o.acknowledged_by_name}</b> · {fdt(o.acknowledged_at)}<br />Tahmini teslim tarihi: <b>{fd(o.ack_expected_date)}</b>{o.ack_note ? <><br />Not: {o.ack_note}</> : null}</div></div>
        ) : o.can_ack ? (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
            <p className="font-semibold text-slate-900">Siparişi onaylıyorum</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-600">Adınız soyadınız *<input className={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
              <label className="text-xs text-slate-600">Tahmini teslim tarihi *<input type="date" className={inp} value={f.expected_date} onChange={e => setF({ ...f, expected_date: e.target.value })} /></label>
              <label className="text-xs text-slate-600 sm:col-span-2">Not (opsiyonel)<input className={inp} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="Örn. iki parti halinde teslim" /></label>
            </div>
            {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
            <button disabled={busy} onClick={ack} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#1B3A5C] text-sm font-semibold text-white disabled:opacity-50 sm:w-auto sm:px-6"><CheckCircle2 className="h-4 w-4" />Siparişi onaylıyorum</button>
          </div>
        ) : null}
        <p className="text-center text-[11px] text-slate-400">Bu sayfa yalnızca size özeldir. Faturada sipariş numarasını belirtiniz. Inspira360 Procure</p>
      </div>
    </div>
  );
}
