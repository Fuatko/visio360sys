'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { CheckCircle2, XCircle, MessageSquare, Printer, Phone, Mail, Clock, FileText, AlertTriangle } from 'lucide-react';

const n = (v: any) => Number(v) || 0;
const SYM: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
let CUR = 'TRY';
const tl = (v: number) => (SYM[CUR] || CUR + ' ') + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fd = (d?: string | null) => (d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '-');

export default function PublicQuotePage() {
  const supabase = createClient();
  const { token } = useParams<{ token: string }>();
  const [q, setQ] = useState<any>(undefined);
  const [fxInfo, setFxInfo] = useState<any>(null);
  const [mode, setMode] = useState<'accepted' | 'rejected' | 'revision_requested' | null>(null);
  const [form, setForm] = useState({ name: '', title: '', note: '', agree: false });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const viewId = useRef<string | null>(null);
  const printed = useRef(false);

  // Okuma takibi: yalnızca sekme görünürken geçen süre ve en fazla kaydırma oranı
  useEffect(() => {
    if (!q?.view_id) return;
    viewId.current = q.view_id;
    let secs = 0, scroll = 0, lastSent = '';
    const measure = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - window.innerHeight;
      const pct = max <= 0 ? 100 : Math.round(((window.scrollY || el.scrollTop) / max) * 100);
      scroll = Math.max(scroll, Math.min(100, pct));
    };
    const send = (beacon = false) => {
      const key = `${secs}|${scroll}|${printed.current}`;
      if (key === lastSent || !viewId.current) return;
      lastSent = key;
      const body = { p_token: token, p_view_id: viewId.current, p_seconds: secs, p_scroll: scroll, p_printed: printed.current };
      if (beacon) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key2 = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        try {
          fetch(`${url}/rest/v1/rpc/public_quote_engage`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', apikey: key2!, Authorization: `Bearer ${key2}` }, body: JSON.stringify(body) });
        } catch { /* sayfa kapanıyor */ }
      } else supabase.rpc('public_quote_engage', body).then(() => {});
    };
    measure();
    const tick = setInterval(() => { if (document.visibilityState === 'visible') secs += 1; }, 1000);
    const flush = setInterval(() => send(), 15000);
    const first = setTimeout(() => send(), 5000);
    const onHide = () => { if (document.visibilityState === 'hidden') send(true); };
    const onPageHide = () => send(true);
    const onPrint = () => { printed.current = true; send(); };
    window.addEventListener('scroll', measure, { passive: true });
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeprint', onPrint);
    return () => {
      clearInterval(tick); clearInterval(flush); clearTimeout(first);
      window.removeEventListener('scroll', measure);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeprint', onPrint);
    };
  }, [q?.view_id]);

  const load = async (track: boolean) => {
    const { data, error } = await supabase.rpc('public_quote_get', { p_token: token, p_track: track });
    if (!error && data) {
      const { data: c } = await supabase.rpc('public_quote_currency', { p_token: token });
      if (c) { CUR = c.currency || 'TRY'; setFxInfo(c); }
    }
    setQ(error ? null : data && !data.view_id && viewId.current ? { ...data, view_id: viewId.current } : data);
  };
  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get('preview') === '1';
    if (/^[0-9a-f-]{36}$/i.test(String(token))) load(!preview); else setQ(null);
  }, [token]);

  const submit = async () => {
    if (!mode) return;
    if (!form.name.trim()) { alert('Lütfen adınızı ve soyadınızı yazın.'); return; }
    if (mode === 'accepted' && !form.agree) { alert('Kabul için onay kutusunu işaretleyin.'); return; }
    if (mode !== 'accepted' && !form.note.trim()) { alert('Lütfen kısa bir açıklama yazın.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('public_quote_respond', { p_token: token, p_response: mode, p_name: form.name, p_title: form.title || null, p_note: form.note || null });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setDone(mode); setMode(null); load(false);
  };

  if (q === undefined) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" /></div>;
  if (q === null) return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow">
        <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <h1 className="text-lg font-semibold">Teklif bulunamadı</h1>
        <p className="mt-1 text-sm text-slate-500">Bağlantı hatalı olabilir veya teklif yayından kaldırılmış olabilir. Lütfen size teklif gönderen kişiyle iletişime geçin.</p>
      </div>
    </div>
  );

  const items: any[] = q.items || [];
  const lineSum = items.reduce((s, i) => s + n(i.total || n(i.quantity) * n(i.unit_price) * (1 - n(i.discount) / 100)), 0);
  const generalDisc = n(q.discount);
  const canRespond = q.status === 'sent' && !q.customer_response;
  const no = `${q.quote_number}${q.revision ? ` Rev.${q.revision}` : ''}`;

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl px-4">
        {q.newer_token && (
          <a href={`/q/${q.newer_token}`} className="mb-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
            <AlertTriangle className="h-4 w-4" />Bu teklifin güncellenmiş bir sürümü var. Güncel teklifi görmek için tıklayın.
          </a>
        )}
        {q.status === 'expired' && !q.customer_response && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 print:hidden"><Clock className="h-4 w-4" />Bu teklifin geçerlilik süresi {fd(q.valid_until)} tarihinde doldu. Güncel teklif için temsilcinizle görüşün.</div>
        )}
        {(done || q.customer_response) && (
          <div className={`mb-4 flex items-center gap-2 rounded-xl border p-4 text-sm print:hidden ${(done || q.customer_response) === 'accepted' ? 'border-green-300 bg-green-50 text-green-900' : 'border-slate-300 bg-white text-slate-800'}`}>
            <CheckCircle2 className="h-5 w-5" />
            {(done || q.customer_response) === 'accepted' ? `Teklif ${q.customer_signer_name || ''} tarafından ${fd(q.customer_response_at)} tarihinde kabul edildi. Teşekkür ederiz!`
              : (done || q.customer_response) === 'rejected' ? 'Yanıtınız iletildi. Değerlendirmeniz için teşekkür ederiz.'
              : 'Revizyon talebiniz iletildi; temsilcimiz en kısa sürede güncel teklifle dönecek.'}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-indigo-700 to-indigo-900 px-6 py-5 text-white print:bg-none print:text-black">
            <div>
              <p className="text-xs uppercase tracking-widest text-indigo-200 print:text-slate-500">{q.organization}</p>
              <h1 className="mt-1 text-2xl font-bold">Teklif</h1>
              <p className="text-sm text-indigo-100 print:text-slate-600">{q.subject}</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-mono">{no}</p>
              <p className="text-indigo-200 print:text-slate-600">Tarih: {fd(q.sent_at || q.created_at)}</p>
              <p className="text-indigo-200 print:text-slate-600">Geçerlilik: {fd(q.valid_until)}</p>
            </div>
          </div>

          <div className="space-y-5 p-6">
            <div className="flex flex-wrap justify-between gap-4 text-sm">
              <div><p className="text-xs text-slate-500">Sayın</p><p className="text-base font-semibold">{q.customer}</p></div>
              {q.sales_rep && (
                <div className="text-right">
                  <p className="text-xs text-slate-500">Temsilciniz</p>
                  <p className="font-medium">{q.sales_rep.name}</p>
                  {q.sales_rep.phone && <a href={`tel:${q.sales_rep.phone}`} className="flex items-center justify-end gap-1 text-indigo-600"><Phone className="h-3 w-3" />{q.sales_rep.phone}</a>}
                  {q.sales_rep.email && <a href={`mailto:${q.sales_rep.email}`} className="flex items-center justify-end gap-1 text-indigo-600"><Mail className="h-3 w-3" />{q.sales_rep.email}</a>}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b-2 text-left text-xs uppercase text-slate-500"><th className="py-2">Ürün / Hizmet</th><th className="text-right">Miktar</th><th className="text-right">Birim fiyat</th><th className="text-right">İsk.</th><th className="text-right">KDV</th><th className="text-right">Tutar</th></tr></thead>
                <tbody>
                  {items.map((i, k) => (
                    <tr key={k} className="border-b">
                      <td className="py-2"><p className="font-medium">{i.name}</p>{i.description && i.description !== i.name && <p className="text-xs text-slate-500">{i.description}</p>}</td>
                      <td className="text-right">{n(i.quantity)} {i.unit || ''}</td>
                      <td className="text-right">{tl(n(i.unit_price))}</td>
                      <td className="text-right">{n(i.discount) ? `%${n(i.discount)}` : '-'}</td>
                      <td className="text-right">%{n(i.tax_rate)}</td>
                      <td className="text-right font-medium">{tl(n(i.total || n(i.quantity) * n(i.unit_price) * (1 - n(i.discount) / 100)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Ara toplam</span><span>{tl(lineSum)}</span></div>
              {generalDisc > 0 && <div className="flex justify-between"><span className="text-slate-500">Genel iskonto (%{generalDisc})</span><span>-{tl(lineSum * generalDisc / 100)}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">KDV</span><span>{tl(n(q.tax_total))}</span></div>
              <div className="flex justify-between border-t pt-1 text-lg font-bold"><span>Genel toplam</span><span>{tl(n(q.total))}</span></div>
              {fxInfo && fxInfo.currency !== 'TRY' && <p className="text-right text-xs text-slate-500">TL karşılığı ≈ ₺{(n(q.total) * n(fxInfo.exchange_rate)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (1 {fxInfo.currency} = ₺{n(fxInfo.exchange_rate).toLocaleString('tr-TR', { maximumFractionDigits: 4 })}, {fxInfo.rate_note || 'TCMB'}{fxInfo.rate_date ? ' ' + fd(fxInfo.rate_date) : ''})</p>}
              {q.payment_term_days !== null && q.payment_term_days !== undefined && <p className="text-right text-xs text-slate-500">Ödeme: {n(q.payment_term_days) === 0 ? 'Peşin' : `${q.payment_term_days} gün vadeli`}</p>}
            </div>

            {q.notes && <div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="mb-1 text-xs font-semibold uppercase text-slate-500">Koşullar ve notlar</p><p className="whitespace-pre-wrap">{q.notes}</p></div>}

            {canRespond && !done && (
              <div className="space-y-3 border-t pt-5 print:hidden">
                {!mode ? (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setMode('accepted')} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700"><CheckCircle2 className="h-5 w-5" />Teklifi kabul ediyorum</button>
                    <button onClick={() => setMode('revision_requested')} className="flex items-center gap-2 rounded-xl border px-4 py-3 hover:bg-slate-50"><MessageSquare className="h-4 w-4" />Revizyon iste</button>
                    <button onClick={() => setMode('rejected')} className="flex items-center gap-2 rounded-xl border px-4 py-3 text-red-600 hover:bg-red-50"><XCircle className="h-4 w-4" />Reddet</button>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
                    <p className="font-semibold">{mode === 'accepted' ? 'Online kabul' : mode === 'rejected' ? 'Teklifi reddet' : 'Revizyon talebi'}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ad soyad *" className="rounded-lg border px-3 py-2 text-sm" />
                      <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Unvan" className="rounded-lg border px-3 py-2 text-sm" />
                    </div>
                    <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={3} className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder={mode === 'accepted' ? 'Not (isteğe bağlı): teslim adresi, sipariş no vb.' : mode === 'rejected' ? 'Kısaca nedenini paylaşır mısınız? *' : 'Neyin değişmesini istersiniz? *'} />
                    {mode === 'accepted' && (
                      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={form.agree} onChange={e => setForm({ ...form, agree: e.target.checked })} />
                        <span>{no} numaralı, {tl(n(q.total))} tutarlı teklifi ve koşullarını okudum; şirketim adına kabul etmeye yetkiliyim.</span></label>
                    )}
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={submit} className={`rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50 ${mode === 'accepted' ? 'bg-green-600' : mode === 'rejected' ? 'bg-red-600' : 'bg-indigo-600'}`}>{busy ? 'Gönderiliyor…' : 'Gönder'}</button>
                      <button onClick={() => setMode(null)} className="rounded-lg border px-4 py-2">Vazgeç</button>
                    </div>
                    <p className="text-[11px] text-slate-400">Yanıtınız tarih, saat ve bağlantı bilgisiyle birlikte kayıt altına alınır.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex justify-between text-xs text-slate-400 print:hidden">
          <span>Satış Pro ile gönderildi</span>
          <button onClick={() => window.print()} className="flex items-center gap-1 hover:text-slate-600"><Printer className="h-3 w-3" />Yazdır / PDF</button>
        </div>
      </div>
    </div>
  );
}
