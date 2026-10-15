'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Printer, Settings2, X, Upload, Loader2 } from 'lucide-react';
import { orgIdOf } from '@/lib/quote-files';

const n = (v: any) => Number(v) || 0;
const SYM: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
const fd = (d?: string | null) => (d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '-');

const FIELDS: [string, string, boolean?][] = [
  ['legal_name', 'Resmi unvan'], ['address', 'Adres', true], ['phone', 'Telefon'], ['email', 'E-posta'], ['website', 'Web sitesi'],
  ['tax_office', 'Vergi dairesi'], ['tax_number', 'Vergi no'], ['mersis_no', 'MERSİS no'], ['bank_name', 'Banka'], ['iban', 'IBAN'],
  ['signer_name', 'İmza yetkilisi'], ['signer_title', 'Unvanı'], ['standard_terms', 'Standart teklif koşulları (her teklifin altına eklenir)', true],
];

/** Kurumsal A4 teklif belgesi: antetli, kalem tablosu, KDV dökümü, koşullar, imza alanı — "PDF olarak kaydet" ile indirilir */
export default function QuotePrintPage() {
  const supabase = createClient();
  const { id } = useParams<{ id: string }>();
  const [q, setQ] = useState<any>(undefined);
  const [items, setItems] = useState<any[]>([]);
  const [lh, setLh] = useState<any>({});
  const [lhReady, setLhReady] = useState(true);
  const [logo, setLogo] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data: quote } = await supabase.from('quotes').select('*, customer:customer_id(*)').eq('id', id).maybeSingle();
    if (!quote) { setQ(null); return; }
    const [it, rep, l] = await Promise.all([
      supabase.from('quote_items').select('*, product:product_id(name, unit, description, code)').eq('quote_id', id),
      quote.sales_person_id ? supabase.from('sales_team').select('name, email, phone, title').eq('id', quote.sales_person_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('quote_letterhead').select('*').maybeSingle(),
    ]);
    setLhReady(!(l as any).error);
    const letter = (l as any).data || {};
    setLh(letter);
    if (letter.logo_path) { const { data } = await supabase.storage.from('quote-files').createSignedUrl(letter.logo_path, 3600); setLogo(data?.signedUrl || null); }
    const { data: org } = await supabase.from('organizations').select('name').eq('id', quote.organization_id).maybeSingle();
    setOrgName(org?.name || '');
    setItems(it.data || []);
    setQ({ ...quote, rep: (rep as any).data });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const saveLh = async () => {
    setBusy(true);
    const { id: _i, updated_at, ...rest } = lh;
    const { error } = await supabase.from('quote_letterhead').upsert({ ...rest, organization_id: await orgIdOf(supabase), updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) alert(error.message); else { setEdit(false); load(); }
  };
  const uploadLogo = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const path = `${await orgIdOf(supabase)}/antet/logo-${Date.now()}.${(f.name.split('.').pop() || 'png').toLowerCase()}`;
      const { error } = await supabase.storage.from('quote-files').upload(path, f, { contentType: f.type });
      if (error) throw error;
      setLh({ ...lh, logo_path: path });
      const { data } = await supabase.storage.from('quote-files').createSignedUrl(path, 3600); setLogo(data?.signedUrl || null);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  if (q === undefined) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></div>;
  if (q === null) return <div className="p-10 text-center text-sm text-slate-500">Teklif bulunamadı.</div>;

  const cur = q.currency || 'TRY';
  const money = (v: number) => `${SYM[cur] || cur + ' '}${n(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lineNet = (i: any) => n(i.total) || n(i.quantity) * n(i.unit_price) * (1 - n(i.discount) / 100);
  const gross = items.reduce((a, i) => a + n(i.quantity) * n(i.unit_price), 0);
  const lineDisc = gross - items.reduce((a, i) => a + lineNet(i), 0);
  const sub = items.reduce((a, i) => a + lineNet(i), 0);
  const genDisc = n(q.discount_amount) || sub * n(q.discount) / 100;
  const vat: Record<string, number> = {};
  items.forEach(i => { const r = String(n(i.tax_rate)); vat[r] = (vat[r] || 0) + lineNet(i) * (1 - (sub ? genDisc / sub : 0)) * n(i.tax_rate) / 100; });
  const vatTotal = Object.values(vat).reduce((a, b) => a + b, 0);
  const total = n(q.total) || sub - genDisc + vatTotal;
  const accent = lh.accent_color || '#1B3A5C';
  const c = q.customer || {};
  const no = `${q.quote_number || ''}${q.revision ? ` Rev.${q.revision}` : ''}`;
  const company = lh.legal_name || orgName;

  return (
    <div className="min-h-screen bg-slate-200 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm 12mm; } @media print { .sheet { box-shadow: none !important; width: auto !important; min-height: 0 !important; padding: 0 !important; } }`}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 px-2 print:hidden">
        <p className="text-sm text-slate-600">Kurumsal teklif belgesi · yazdırma penceresinde <b>“PDF olarak kaydet”</b> seçin</p>
        <button onClick={() => setEdit(true)} className="ml-auto flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"><Settings2 className="h-4 w-4" />Antet bilgileri</button>
        <button onClick={() => window.print()} className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: accent }}><Printer className="h-4 w-4" />PDF indir / Yazdır</button>
      </div>
      {!lhReady && <p className="mx-auto mb-3 max-w-[210mm] rounded bg-amber-50 p-2 text-xs text-amber-800 print:hidden">Antet ve logo için teklif-dosya.sql dosyasını Supabase'de çalıştırın.</p>}
      {lhReady && !lh.legal_name && <p className="mx-auto mb-3 max-w-[210mm] rounded bg-indigo-50 p-2 text-xs text-indigo-900 print:hidden">İlk kullanım: <b>Antet bilgileri</b>nden unvan, adres, vergi bilgileri, IBAN, logo ve standart koşullarınızı bir kez girin; tüm tekliflerde kullanılır.</p>}

      <div className="sheet mx-auto w-[210mm] min-h-[297mm] bg-white p-[14mm] text-[12px] leading-relaxed text-slate-800 shadow-lg">
        {/* Antet */}
        <div className="flex items-start justify-between gap-6 border-b-2 pb-4" style={{ borderColor: accent }}>
          <div className="flex items-center gap-4">
            {logo && <img src={logo} alt="" className="max-h-16 max-w-[160px] object-contain" />}
            <div>
              <p className="text-[15px] font-bold" style={{ color: accent }}>{company}</p>
              {lh.address && <p className="whitespace-pre-line text-[10.5px] text-slate-500">{lh.address}</p>}
              <p className="text-[10.5px] text-slate-500">{[lh.phone, lh.email, lh.website].filter(Boolean).join(' · ')}</p>
              {(lh.tax_office || lh.tax_number) && <p className="text-[10.5px] text-slate-500">{lh.tax_office ? `${lh.tax_office} V.D.` : ''} {lh.tax_number ? `VKN ${lh.tax_number}` : ''}{lh.mersis_no ? ` · MERSİS ${lh.mersis_no}` : ''}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[22px] font-bold tracking-wide" style={{ color: accent }}>TEKLİF</p>
            <table className="ml-auto text-[11px]"><tbody>
              <tr><td className="pr-3 text-slate-500">Teklif no</td><td className="font-mono font-semibold">{no}</td></tr>
              <tr><td className="pr-3 text-slate-500">Tarih</td><td>{fd(q.sent_at || q.created_at)}</td></tr>
              <tr><td className="pr-3 text-slate-500">Geçerlilik</td><td>{fd(q.valid_until)}</td></tr>
            </tbody></table>
          </div>
        </div>

        {/* Müşteri ve temsilci */}
        <div className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sayın</p>
            <p className="text-[13px] font-semibold">{c.legal_name || c.name}</p>
            {c.address && <p className="whitespace-pre-line text-[11px] text-slate-600">{c.address}</p>}
            {(c.district || c.city) && <p className="text-[11px] text-slate-600">{[c.district, c.city].filter(Boolean).join(' / ')}</p>}
            {(c.tax_office || c.tax_number) && <p className="text-[11px] text-slate-600">{c.tax_office ? `${c.tax_office} V.D. · ` : ''}{c.tax_number ? `VKN ${c.tax_number}` : ''}</p>}
          </div>
          {q.rep && (
            <div className="text-right">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Müşteri temsilciniz</p>
              <p className="font-semibold">{q.rep.name}</p>
              <p className="text-[11px] text-slate-600">{[q.rep.phone, q.rep.email].filter(Boolean).join(' · ')}</p>
            </div>)}
        </div>

        {q.subject && <p className="mt-5 text-[13px]"><span className="text-slate-500">Konu: </span><b>{q.subject}</b></p>}

        {/* Kalemler */}
        <table className="mt-4 w-full border-collapse text-[11px]">
          <thead><tr className="text-left text-white" style={{ background: accent }}>
            <th className="px-2 py-1.5">#</th><th className="px-2">Ürün / Hizmet</th><th className="px-2 text-right">Miktar</th><th className="px-2 text-right">Birim fiyat</th><th className="px-2 text-right">İsk.</th><th className="px-2 text-right">KDV</th><th className="px-2 text-right">Tutar</th>
          </tr></thead>
          <tbody>{items.map((i, k) => (
            <tr key={i.id || k} className="border-b border-slate-200 align-top" style={{ breakInside: 'avoid' }}>
              <td className="px-2 py-1.5 text-slate-400">{k + 1}</td>
              <td className="px-2 py-1.5"><p className="font-medium">{i.product?.name || i.description || '-'}</p>{i.description && i.description !== i.product?.name && <p className="text-[10px] text-slate-500">{i.description}</p>}{i.product?.code && <p className="text-[10px] text-slate-400">Kod: {i.product.code}</p>}</td>
              <td className="px-2 py-1.5 text-right">{n(i.quantity).toLocaleString('tr-TR')} {i.product?.unit || ''}</td>
              <td className="px-2 py-1.5 text-right">{money(n(i.unit_price))}</td>
              <td className="px-2 py-1.5 text-right">{n(i.discount) ? `%${n(i.discount)}` : '-'}</td>
              <td className="px-2 py-1.5 text-right">%{n(i.tax_rate)}</td>
              <td className="px-2 py-1.5 text-right font-medium">{money(lineNet(i))}</td>
            </tr>))}</tbody>
        </table>

        {/* Toplamlar */}
        <div className="mt-3 flex justify-end" style={{ breakInside: 'avoid' }}>
          <table className="w-72 text-[11.5px]"><tbody>
            {lineDisc > 0.005 && <tr><td className="py-0.5 text-slate-500">Brüt tutar</td><td className="text-right">{money(gross)}</td></tr>}
            {lineDisc > 0.005 && <tr><td className="py-0.5 text-slate-500">Satır iskontoları</td><td className="text-right">-{money(lineDisc)}</td></tr>}
            <tr><td className="py-0.5 text-slate-500">Ara toplam</td><td className="text-right">{money(sub)}</td></tr>
            {genDisc > 0.005 && <tr><td className="py-0.5 text-slate-500">Genel iskonto{n(q.discount) ? ` (%${n(q.discount)})` : ''}</td><td className="text-right">-{money(genDisc)}</td></tr>}
            {genDisc > 0.005 && <tr><td className="py-0.5 text-slate-500">KDV matrahı</td><td className="text-right">{money(sub - genDisc)}</td></tr>}
            {Object.entries(vat).sort().map(([r, v]) => <tr key={r}><td className="py-0.5 text-slate-500">KDV %{r}</td><td className="text-right">{money(v)}</td></tr>)}
            <tr className="border-t-2" style={{ borderColor: accent }}><td className="pt-1 text-[13px] font-bold" style={{ color: accent }}>GENEL TOPLAM</td><td className="pt-1 text-right text-[13px] font-bold" style={{ color: accent }}>{money(total)}</td></tr>
            {cur !== 'TRY' && n(q.exchange_rate) > 0 && <tr><td colSpan={2} className="pt-1 text-right text-[10px] text-slate-500">TL karşılığı ≈ ₺{(total * n(q.exchange_rate)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (1 {cur} = ₺{n(q.exchange_rate).toLocaleString('tr-TR', { maximumFractionDigits: 4 })}{q.rate_date ? `, ${fd(q.rate_date)}` : ''})</td></tr>}
          </tbody></table>
        </div>

        {/* Koşullar */}
        <div className="mt-6 space-y-3 text-[11px]" style={{ breakInside: 'avoid' }}>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>Ticari koşullar</p>
            <ul className="list-disc space-y-0.5 pl-4 text-slate-700">
              <li>Teklif {fd(q.valid_until)} tarihine kadar geçerlidir.</li>
              {q.payment_term_days !== null && q.payment_term_days !== undefined && <li>Ödeme: {n(q.payment_term_days) === 0 ? 'peşin' : `fatura tarihinden itibaren ${q.payment_term_days} gün vadeli`}.</li>}
              <li>Fiyatlar {cur === 'TRY' ? 'Türk Lirası' : cur} cinsindendir; KDV ayrıca gösterilmiştir.</li>
              {lh.iban && <li>Banka: {lh.bank_name ? `${lh.bank_name} · ` : ''}IBAN {lh.iban} · {company}</li>}
            </ul>
          </div>
          {q.notes && <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>Notlar</p><p className="whitespace-pre-wrap text-slate-700">{q.notes}</p></div>}
          {lh.standard_terms && <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>Genel şartlar</p><p className="whitespace-pre-wrap text-[10.5px] text-slate-600">{lh.standard_terms}</p></div>}
        </div>

        {/* İmza */}
        <div className="mt-10 grid grid-cols-2 gap-10 text-[11px]" style={{ breakInside: 'avoid' }}>
          <div><p className="text-slate-500">Teklifi veren</p><p className="mt-1 font-semibold">{company}</p><p>{lh.signer_name || q.rep?.name || ''}</p><p className="text-slate-500">{lh.signer_title || q.rep?.title || ''}</p><div className="mt-10 border-t border-slate-300 pt-1 text-[10px] text-slate-400">Kaşe / İmza</div></div>
          <div><p className="text-slate-500">Teklifi kabul eden</p><p className="mt-1 font-semibold">{c.legal_name || c.name}</p><p className="text-slate-500">Ad soyad / unvan / tarih</p><div className="mt-[52px] border-t border-slate-300 pt-1 text-[10px] text-slate-400">Kaşe / İmza</div></div>
        </div>
        {q.share_token && ['sent', 'accepted', 'expired'].includes(q.status) && <p className="mt-8 text-center text-[9.5px] text-slate-400">Bu teklifi online görüntülemek ve onaylamak için: {typeof window !== 'undefined' ? window.location.origin : ''}/q/{q.share_token}</p>}
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6 print:hidden">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center"><p className="font-semibold">Teklif anteti ve standart koşullar</p><button onClick={() => setEdit(false)} className="ml-auto text-slate-400"><X className="h-5 w-5" /></button></div>
            <div className="mb-3 flex items-center gap-3">
              {logo ? <img src={logo} alt="" className="h-12 max-w-[140px] rounded border object-contain p-1" /> : <div className="flex h-12 w-28 items-center justify-center rounded border text-[10px] text-slate-400">logo yok</div>}
              <button disabled={busy} onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs"><Upload className="h-3.5 w-3.5" />Logo yükle</button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={e => uploadLogo(e.target.files?.[0])} />
              <label className="ml-auto flex items-center gap-2 text-xs">Vurgu rengi <input type="color" value={lh.accent_color || '#1B3A5C'} onChange={e => setLh({ ...lh, accent_color: e.target.value })} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">{FIELDS.map(([k, l, wide]) => (
              <label key={k} className={`text-xs text-slate-600 ${wide ? 'col-span-2' : ''}`}>{l}
                {wide ? <textarea rows={k === 'standard_terms' ? 5 : 2} value={lh[k] || ''} onChange={e => setLh({ ...lh, [k]: e.target.value })} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
                  : <input value={lh[k] || ''} onChange={e => setLh({ ...lh, [k]: e.target.value })} className="mt-1 h-9 w-full rounded border px-2 text-sm" />}
              </label>))}</div>
            <div className="mt-4 flex justify-end gap-2"><button onClick={() => setEdit(false)} className="rounded-lg border px-4 py-2 text-sm">Vazgeç</button><button disabled={busy} onClick={saveLh} className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: accent }}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></div>
          </div>
        </div>)}
    </div>
  );
}
