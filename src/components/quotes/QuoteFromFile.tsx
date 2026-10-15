'use client';

import { useRef, useState } from 'react';
import { Sparkles, Upload, Loader2, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ACCEPT, uploadQuoteFile } from '@/lib/quote-files';
import { parasutCall } from '@/lib/parasut-client';

const n = (v: any) => Number(v) || 0;
const money = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type ParsedQuote = {
  customer_id: string; subject: string; valid_until: string; notes: string; discount: number; currency: string; payment_term_days: number | null;
  items: { product_id: string; quantity: number; unit_price: number; discount: number; tax_rate: number; description?: string }[];
  file: { path: string; name: string; mime: string; size: number };
};

/** Word / PDF teklifini yapay zekâyla okuyup teklif formunu dolduran akış */
export default function QuoteFromFile({ supabase, customers, products, onApply, onCatalogChanged }: {
  supabase: any; customers: any[]; products: any[];
  onApply: (q: ParsedQuote) => void; onCatalogChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'pick' | 'reading' | 'review'>('pick');
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<ParsedQuote['file'] | null>(null);
  const [d, setD] = useState<any>(null);
  const [cust, setCust] = useState<string>('');           // '' = yeni müşteri oluştur
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => { setStep('pick'); setErr(null); setFile(null); setD(null); setRows([]); setCust(''); };
  const read = async (f?: File) => {
    if (!f) return;
    setErr(null); setStep('reading');
    try {
      const up = await uploadQuoteFile(supabase, f, 'gelen');
      setFile(up);
      const r = await parasutCall('/api/ai/quote-from-file', 'POST', { path: up.path, name: up.name });
      const data = r.data;
      setD(data);
      setCust(data.customer?.matched_customer_id || '');
      setRows(data.items.map((i: any) => ({ ...i, product_id: i.matched_product_id || '__new' })));
      setStep('review');
    } catch (e: any) { setErr(e.message); setStep('pick'); }
    finally { if (input.current) input.current.value = ''; }
  };

  const apply = async () => {
    if (!file || !d) return;
    setBusy(true); setErr(null);
    try {
      // Müşteri yoksa oluştur
      let customerId = cust;
      if (!customerId) {
        const name = String(d.customer?.name || '').trim();
        if (!name) throw new Error('Müşteri adı okunamadı; listeden bir müşteri seçin.');
        const { data, error } = await supabase.from('customers').insert([{ name, legal_name: name, tax_number: d.customer?.tax_number || null, status: 'Potansiyel', notes: `Teklif dosyasından oluşturuldu (${file.name})` }]).select('id').single();
        if (error) {
          const r2 = await supabase.from('customers').insert([{ name, status: 'Potansiyel' }]).select('id').single();
          if (r2.error) throw new Error(r2.error.message);
          customerId = r2.data.id;
        } else customerId = data.id;
      }
      // Katalogda olmayan kalemleri ürün/hizmet olarak ekle
      const items: ParsedQuote['items'] = [];
      let created = 0;
      for (const r of rows) {
        let pid = r.product_id;
        if (pid === '__new') {
          const { data, error } = await supabase.from('products').insert([{ name: r.name.slice(0, 200), description: r.description || null, unit: r.unit || 'adet', price: n(r.unit_price), currency: d.currency || 'TRY', tax_rate: n(r.tax_rate), status: 'active', category: 'Teklif dosyasından' }]).select('id').single();
          if (error) { const r2 = await supabase.from('products').insert([{ name: r.name.slice(0, 200), price: n(r.unit_price), tax_rate: n(r.tax_rate), status: 'active' }]).select('id').single(); if (r2.error) throw new Error(r2.error.message); pid = r2.data.id; }
          else pid = data.id;
          created++;
        }
        items.push({ product_id: pid === '__none' ? '' : pid, quantity: n(r.quantity) || 1, unit_price: n(r.unit_price), discount: n(r.discount_pct), tax_rate: n(r.tax_rate), description: r.description || (r.product_id !== '__new' ? r.name : undefined) });
      }
      if (created) onCatalogChanged?.();
      onApply({
        customer_id: customerId, subject: d.subject || file.name.replace(/\.[^.]+$/, ''),
        valid_until: d.valid_until || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
        notes: d.notes || '', discount: n(d.general_discount_pct), currency: d.currency || 'TRY', payment_term_days: d.payment_term_days ?? null, items, file,
      });
      setOpen(false); reset();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const sub = rows.reduce((a, r) => a + n(r.quantity) * n(r.unit_price) * (1 - n(r.discount_pct) / 100), 0) * (1 - n(d?.general_discount_pct) / 100);
  const docTotal = n(d?.totals?.subtotal);
  const mismatch = docTotal > 0 && Math.abs(docTotal - sub) > Math.max(1, docTotal * 0.01);

  return (
    <>
      <button onClick={() => { reset(); setOpen(true); }} className="flex h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-sm font-medium text-indigo-800 hover:bg-indigo-100">
        <Sparkles className="h-4 w-4" />Word / PDF'ten teklif
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
          <div className="w-full max-w-4xl rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center gap-2"><Sparkles className="h-5 w-5 text-indigo-600" /><p className="font-semibold">Hazır teklif dosyasından teklif oluştur</p><button onClick={() => setOpen(false)} className="ml-auto text-slate-400"><X className="h-5 w-5" /></button></div>
            {err && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}

            {step === 'pick' && (
              <div className="rounded-xl border-2 border-dashed p-8 text-center">
                <Upload className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm text-slate-600">Word (.docx) veya PDF olarak hazırladığınız teklifi seçin. Yapay zekâ müşteriyi, kalemleri, fiyatları, iskontoyu, KDV'yi, ödeme vadesini ve geçerlilik tarihini okur; siz kontrol edip teklife aktarırsınız.</p>
                <button onClick={() => input.current?.click()} className="mt-4 rounded-lg bg-[#1b3a5c] px-4 py-2 text-sm font-medium text-white">Dosya seç</button>
                <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={e => read(e.target.files?.[0])} />
                <p className="mt-3 text-[11px] text-slate-400">Dosya teklife ek olarak da kaydedilir; müşteri online teklif bağlantısından indirebilir.</p>
              </div>)}

            {step === 'reading' && <div className="flex flex-col items-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" />Teklif okunuyor… ({file?.name || 'yükleniyor'})</div>}

            {step === 'review' && d && (
              <div className="space-y-4 text-sm">
                {(d.warnings || []).length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><p className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="h-4 w-4" />Kontrol edin</p>{d.warnings.map((w: string, i: number) => <p key={i}>• {w}</p>)}</div>}
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-xs text-slate-600">Müşteri <span className="text-slate-400">(belgede: {d.customer?.name || '-'}{d.customer?.tax_number ? ` · VKN ${d.customer.tax_number}` : ''})</span>
                    <select value={cust} onChange={e => setCust(e.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm">
                      <option value="">+ Yeni müşteri: {d.customer?.name || '(ad yok)'}</option>
                      {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                  <label className="text-xs text-slate-600">Konu<input value={d.subject || ''} onChange={e => setD({ ...d, subject: e.target.value })} className="mt-1 h-9 w-full rounded border px-2 text-sm" /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-slate-600">Geçerlilik<input type="date" value={d.valid_until || ''} onChange={e => setD({ ...d, valid_until: e.target.value })} className="mt-1 h-9 w-full rounded border px-2 text-sm" /></label>
                    <label className="text-xs text-slate-600">Vade (gün)<input type="number" value={d.payment_term_days ?? ''} onChange={e => setD({ ...d, payment_term_days: e.target.value === '' ? null : Number(e.target.value) })} className="mt-1 h-9 w-full rounded border px-2 text-sm" /></label>
                  </div>
                </div>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-slate-50 text-left text-slate-500"><th className="px-2 py-1.5">Belgedeki kalem</th><th className="px-2">Katalogda</th><th className="px-2 text-right">Miktar</th><th className="px-2 text-right">Birim fiyat ({d.currency})</th><th className="px-2 text-right">İsk.%</th><th className="px-2 text-right">KDV%</th><th className="px-2 text-right">Tutar</th></tr></thead>
                    <tbody>{rows.map((r, i) => {
                      const set = (k: string, v: any) => setRows(rs => rs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
                      return (
                        <tr key={i} className="border-t align-top">
                          <td className="px-2 py-1.5"><input value={r.name} onChange={e => set('name', e.target.value)} className="w-56 rounded border px-1 py-0.5" />{r.description && <p className="mt-0.5 max-w-xs text-[10px] text-slate-500">{r.description}</p>}</td>
                          <td className="px-2 py-1.5"><select value={r.product_id} onChange={e => set('product_id', e.target.value)} className="h-7 w-48 rounded border px-1">
                            <option value="__new">+ Kataloğa yeni ekle</option>{products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                          <td className="px-2 text-right"><input type="number" value={r.quantity} onChange={e => set('quantity', Number(e.target.value))} className="w-16 rounded border px-1 py-0.5 text-right" /></td>
                          <td className="px-2 text-right"><input type="number" value={r.unit_price} onChange={e => set('unit_price', Number(e.target.value))} className="w-24 rounded border px-1 py-0.5 text-right" /></td>
                          <td className="px-2 text-right"><input type="number" value={r.discount_pct} onChange={e => set('discount_pct', Number(e.target.value))} className="w-14 rounded border px-1 py-0.5 text-right" /></td>
                          <td className="px-2 text-right"><input type="number" value={r.tax_rate} onChange={e => set('tax_rate', Number(e.target.value))} className="w-14 rounded border px-1 py-0.5 text-right" /></td>
                          <td className="px-2 py-1.5 text-right font-medium">{money(n(r.quantity) * n(r.unit_price) * (1 - n(r.discount_pct) / 100))}</td>
                        </tr>);
                    })}</tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span>Genel iskonto %<input type="number" value={d.general_discount_pct || 0} onChange={e => setD({ ...d, general_discount_pct: Number(e.target.value) })} className="ml-1 w-14 rounded border px-1 py-0.5 text-right" /></span>
                  <span className="ml-auto">Ara toplam (KDV hariç): <b>{money(sub)} {d.currency}</b></span>
                  {docTotal > 0 && <span className={mismatch ? 'text-amber-700' : 'text-emerald-700'}>{mismatch ? <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> : <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />}Belgedeki ara toplam: {money(docTotal)}</span>}
                </div>
                {d.notes && <label className="block text-xs text-slate-600">Koşullar / notlar<textarea rows={3} value={d.notes} onChange={e => setD({ ...d, notes: e.target.value })} className="mt-1 w-full rounded border px-2 py-1 text-sm" /></label>}
                <div className="flex justify-end gap-2 border-t pt-3">
                  <button onClick={reset} className="rounded-lg border px-4 py-2 text-sm">Başka dosya</button>
                  <button disabled={busy || !rows.length} onClick={apply} className="rounded-lg bg-[#1b3a5c] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Aktarılıyor…' : 'Teklif formuna aktar'}</button>
                </div>
              </div>)}
          </div>
        </div>)}
    </>
  );
}
