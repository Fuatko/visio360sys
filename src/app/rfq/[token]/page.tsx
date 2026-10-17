'use client';

// Tedarikçi teklif sayfası — giriş yok. Yalnızca bu tedarikçiye ait bilgi gösterilir; son tarihe kadar teklif güncellenebilir.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { AlertTriangle, CheckCircle2, Clock, FileText, Paperclip, Send, XCircle } from 'lucide-react';

// "1.250,50" → 1250.5 · "1250.50" → 1250.5 · "1.250" → 1250 (Türkçe binlik)
const n = (v: any) => {
  let t = String(v ?? '').trim().replace(/\s/g, '');
  if (t === '') return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const x = Number(t); return isFinite(x) ? x : NaN;
};
const tl = (v: number) => `₺${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fdt = (d?: string | null) => (d ? new Date(d).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }) : '-');
const inp = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] outline-none focus:border-[#1B3A5C] disabled:bg-slate-50';

type Line = { rfq_line_id: string; price: string; discount: string; vat: string; brand: string; alt: string; can: boolean };

export default function PublicRfqPage() {
  const { token } = useParams<{ token: string }>();
  const supabase = createClient();
  const [r, setR] = useState<any>(undefined);
  const [lines, setLines] = useState<Line[]>([]);
  const [h, setH] = useState({ name: '', delivery: '', payment: '', valid: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [decline, setDecline] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (track = true) => {
    const { data, error } = await supabase.rpc('proc_public_rfq_get', { p_token: token, p_track: track });
    if (error || !data) { setR(null); return; }
    setR(data);
    const q = data.quote;
    setLines((data.lines || []).map((l: any) => {
      const ql = q?.lines?.find((x: any) => x.rfq_line_id === l.id);
      return { rfq_line_id: l.id, price: ql?.unit_price != null ? String(ql.unit_price).replace('.', ',') : '', discount: ql?.discount_pct ? String(ql.discount_pct) : '',
        vat: ql?.vat_rate != null ? String(Number(ql.vat_rate)) : '20', brand: ql?.brand_model || '', alt: ql?.alternative_note || '', can: ql ? ql.can_supply : true };
    }));
    if (q) setH({ name: q.submitted_by_name || '', delivery: q.delivery_days != null ? String(q.delivery_days) : '', payment: q.payment_term_days != null ? String(q.payment_term_days) : '', valid: q.valid_until || '', notes: q.notes || '' });
  };
  useEffect(() => { load(); }, [token]);

  const totals = useMemo(() => {
    if (!r) return { net: 0, vat: 0 };
    return lines.reduce((t, l) => {
      const rl = r.lines.find((x: any) => x.id === l.rfq_line_id); const p = n(l.price);
      if (!l.can || !rl || !isFinite(p) || l.price === '') return t;
      const net = Number(rl.quantity) * p * (1 - (n(l.discount) || 0) / 100);
      return { net: t.net + net, vat: t.vat + net * (n(l.vat) || 0) / 100 };
    }, { net: 0, vat: 0 });
  }, [lines, r]);

  if (r === undefined) return <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] text-sm text-slate-500">Yükleniyor…</div>;
  if (r === null) return <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] p-6 text-center text-sm text-slate-600"><div><AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />Bu teklif bağlantısı geçersiz veya artık kullanılmıyor.</div></div>;
  const open = r.open;
  const set = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    setErr(''); setDone('');
    if (!h.name.trim()) { setErr('Teklifi gönderen kişinin adını yazın.'); return; }
    const bad = lines.find(l => l.can && l.price !== '' && (!isFinite(n(l.price)) || n(l.price) < 0));
    if (bad) { setErr('Birim fiyatları sayı olarak girin (örn. 1.250,50).'); return; }
    if (!lines.some(l => l.can && l.price !== '')) { setErr('En az bir kalem için fiyat girin.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('proc_public_rfq_submit', { p_token: token, payload: {
      submitted_by_name: h.name, delivery_days: h.delivery || null, payment_term_days: h.payment || null, valid_until: h.valid || null, notes: h.notes || null,
      lines: lines.map(l => ({ rfq_line_id: l.rfq_line_id, unit_price: l.can && l.price !== '' ? n(l.price) : null, discount_pct: n(l.discount) || 0, vat_rate: n(l.vat) || 0, brand_model: l.brand || null, alternative_note: l.alt || null, can_supply: l.can && l.price !== '' })),
    } });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone('Teklifiniz alındı. Son tarihe kadar bu sayfadan güncelleyebilirsiniz.'); load(false);
  };
  const sendDecline = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('proc_public_rfq_decline', { p_token: token, p_reason: decline || null });
    setBusy(false); setDecline(null);
    if (error) setErr(error.message); else load(false);
  };
  const upload = async (file: File) => {
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/procure/rfq-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, name: file.name, size: file.size, type: file.type }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Yükleme başarısız');
      const up = await supabase.storage.from('procure-files').uploadToSignedUrl(j.path, j.signedToken, file, { contentType: file.type });
      if (up.error) throw new Error(up.error.message);
      const { error } = await supabase.rpc('proc_public_rfq_attach', { p_token: token, p_path: j.path, p_name: file.name, p_mime: file.type, p_size: file.size });
      if (error) throw new Error(error.message);
      await load(false);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] pb-28">
      <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">{r.org_name} · teklif talebi</p>
          <h1 className="text-lg font-semibold text-[#1B3A5C]">{r.title}</h1>
          <p className="text-xs text-slate-500">{r.rfq_no} · Sayın {r.vendor_name}</p>
          <p className={`mt-2 flex items-center gap-1.5 text-sm ${open ? 'text-slate-700' : 'text-rose-700'}`}><Clock className="h-4 w-4" />Son teklif tarihi: <b>{fdt(r.deadline)}</b>{!open && ' · teklif alımı kapandı'}</p>
          {(r.delivery_terms || r.payment_terms) && <p className="mt-1 text-sm text-slate-600">{r.delivery_terms && <>Teslim: {r.delivery_terms}. </>}{r.payment_terms && <>Ödeme: {r.payment_terms}.</>}</p>}
          {r.notes_to_vendors && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm text-slate-700">{r.notes_to_vendors}</p>}
          {r.quote && <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Teklifiniz alındı ({r.quote.version}. sürüm, {fdt(r.quote.submitted_at)}). {open ? 'Son tarihe kadar güncelleyebilirsiniz.' : ''}</p>}
          {r.declined && <p className="mt-2 flex items-center gap-1.5 text-sm text-rose-700"><XCircle className="h-4 w-4" />Teklif vermeyeceğinizi bildirdiniz.{open ? ' Fikrinizi değiştirirseniz aşağıdan teklif gönderebilirsiniz.' : ''}</p>}
        </div>

        <p className="px-1 text-xs text-slate-500">Fiyatları Türk lirası, <b>KDV hariç birim fiyat</b> olarak girin. Veremediğiniz kalemde “Veremiyorum” işaretleyin; muadil ürün önerinizi not olarak yazabilirsiniz.</p>
        {r.lines.map((l: any, i: number) => {
          const v = lines[i]; if (!v) return null;
          const p = n(v.price);
          return (
            <div key={l.id} className={`rounded-xl border border-slate-200 bg-white p-3 ${v.can ? '' : 'opacity-70'}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><p className="font-medium text-slate-900">{i + 1}. {l.description}</p><p className="text-sm text-slate-500">{Number(l.quantity).toLocaleString('tr-TR')} {l.unit}{l.spec_note ? ` · ${l.spec_note}` : ''}</p></div>
                <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600"><input type="checkbox" disabled={!open} checked={!v.can} onChange={e => set(i, { can: !e.target.checked })} />Veremiyorum</label>
              </div>
              {v.can && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="col-span-2 text-xs text-slate-600 sm:col-span-1">Birim fiyat (₺)<input disabled={!open} inputMode="decimal" className={inp} value={v.price} onChange={e => set(i, { price: e.target.value })} placeholder="0,00" /></label>
                  <label className="text-xs text-slate-600">İskonto %<input disabled={!open} inputMode="decimal" className={inp} value={v.discount} onChange={e => set(i, { discount: e.target.value })} placeholder="0" /></label>
                  <label className="text-xs text-slate-600">KDV %<select disabled={!open} className={inp} value={v.vat} onChange={e => set(i, { vat: e.target.value })}>{['0', '1', '10', '20'].map(x => <option key={x}>{x}</option>)}</select></label>
                  <label className="col-span-2 text-xs text-slate-600 sm:col-span-1">Marka / model<input disabled={!open} className={inp} value={v.brand} onChange={e => set(i, { brand: e.target.value })} /></label>
                </div>
              )}
              <input disabled={!open} className={`${inp} mt-2 h-9 text-sm`} value={v.alt} onChange={e => set(i, { alt: e.target.value })} placeholder="Not / muadil öneri (opsiyonel)" />
              {v.can && v.price !== '' && isFinite(p) && <p className="mt-1 text-right text-xs text-slate-600">Kalem toplamı {tl(Number(l.quantity) * p * (1 - (n(v.discount) || 0) / 100))} + KDV</p>}
            </div>
          );
        })}

        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="col-span-2 text-xs text-slate-600">Adınız soyadınız *<input disabled={!open} className={inp} value={h.name} onChange={e => setH({ ...h, name: e.target.value })} /></label>
            <label className="text-xs text-slate-600">Teslim süresi (gün)<input disabled={!open} inputMode="numeric" className={inp} value={h.delivery} onChange={e => setH({ ...h, delivery: e.target.value.replace(/\D/g, '') })} /></label>
            <label className="text-xs text-slate-600">Vade (gün)<input disabled={!open} inputMode="numeric" className={inp} value={h.payment} onChange={e => setH({ ...h, payment: e.target.value.replace(/\D/g, '') })} /></label>
            <label className="col-span-2 text-xs text-slate-600">Teklif geçerlilik tarihi<input disabled={!open} type="date" className={inp} value={h.valid} onChange={e => setH({ ...h, valid: e.target.value })} /></label>
            <label className="col-span-2 text-xs text-slate-600">Not<input disabled={!open} className={inp} value={h.notes} onChange={e => setH({ ...h, notes: e.target.value })} /></label>
          </div>
          <div>
            <p className="text-xs text-slate-600">Teklif dosyası (PDF vb., en fazla 5 dosya, 15 MB)</p>
            <ul className="mt-1 space-y-0.5">{(r.files || []).map((f: any, i: number) => <li key={i} className="flex items-center gap-1.5 text-sm text-slate-700"><FileText className="h-3.5 w-3.5 text-slate-400" />{f.file_name}</li>)}</ul>
            {open && <button disabled={busy} onClick={() => fileRef.current?.click()} className="mt-1 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"><Paperclip className="h-4 w-4" />Dosya ekle</button>}
            <input ref={fileRef} type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
          </div>
        </div>
        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
        {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>}
        {open && !r.declined && (decline === null
          ? <button onClick={() => setDecline('')} className="text-sm text-slate-500 underline">Bu talebe teklif vermeyeceğim</button>
          : <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"><input className={inp} value={decline} onChange={e => setDecline(e.target.value)} placeholder="Neden? (opsiyonel)" /><div className="flex gap-2"><button disabled={busy} onClick={sendDecline} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white">Teklif vermeyeceğimi bildir</button><button onClick={() => setDecline(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Vazgeç</button></div></div>)}
        <p className="pt-2 text-center text-[11px] text-slate-400">Bu sayfa yalnızca size özeldir; diğer tedarikçilerin teklifleri görüntülenmez. Inspira360 Procure</p>
      </div>
      {open && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1 text-sm"><p>Toplam <b>{tl(totals.net)}</b> <span className="text-xs text-slate-500">KDV hariç</span></p><p className="text-xs text-slate-500">KDV {tl(totals.vat)} · genel toplam {tl(totals.net + totals.vat)}</p></div>
            <button disabled={busy} onClick={submit} className="flex h-11 items-center gap-1.5 rounded-xl bg-[#1B3A5C] px-5 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{r.quote ? 'Teklifi güncelle' : 'Teklifi gönder'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
