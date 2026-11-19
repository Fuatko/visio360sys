'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FileSignature, BookmarkPlus, Check } from 'lucide-react';
import { QuoteDoc, VALIDITY_DAYS, dateAfter } from '@/lib/quote-doc';

const inp = 'mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500';
const area = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500';

/** Geçerlilik: tarih + 7/15/30/45/60/90 gün hızlı seçim */
export function ValidityPicker({ value, onChange, from }: { value: string; onChange: (v: string) => void; from?: string | null }) {
  const days = value ? Math.round((new Date(value).getTime() - new Date((from || new Date().toISOString()).slice(0, 10)).getTime()) / 864e5) : null;
  return (
    <div>
      <label className="text-sm font-medium text-slate-700">Geçerlilik (opsiyon) tarihi</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} className={inp} />
      <div className="mt-1 flex flex-wrap gap-1">
        {VALIDITY_DAYS.map(d => (
          <button key={d} type="button" onClick={() => onChange(dateAfter(d, from))}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${days === d ? 'border-indigo-500 bg-indigo-50 font-medium text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{d} gün</button>
        ))}
      </div>
    </div>
  );
}

/**
 * Teklif belgesi ayarları: hitap adı / takma ad, dikkatine, kabul eden, imzalayan, ticari koşullar.
 * Müşteri kartını değiştirmez; yalnızca bu teklifte geçerlidir.
 */
export default function QuoteDocFields({ supabase, customerId, value, onChange, defaultSigner, defaultOpen = false }: {
  supabase: any; customerId: string; value: QuoteDoc; onChange: (patch: Partial<QuoteDoc>) => void;
  defaultSigner?: { name?: string; title?: string }; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || !!(value.customer_title || value.attention_to || value.acceptor_title || value.signer_name || value.delivery_terms || value.warranty_terms || value.extra_terms));
  const [cust, setCust] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCust(null); setContacts([]); setSaved(false);
    if (!customerId) return;
    (async () => {
      let r = await supabase.from('customers').select('name, legal_name, quote_names').eq('id', customerId).maybeSingle();
      if (r.error) r = await supabase.from('customers').select('name, legal_name').eq('id', customerId).maybeSingle();
      setCust(r.data || null);
      const c = await supabase.from('customer_contacts').select('full_name, title, is_primary, is_active').eq('customer_id', customerId);
      setContacts((c.data || []).filter((x: any) => x.is_active !== false).sort((a: any, b: any) => Number(!!b.is_primary) - Number(!!a.is_primary)));
    })();
  }, [customerId]);

  const names = Array.from(new Set([cust?.legal_name, cust?.name, ...(Array.isArray(cust?.quote_names) ? cust.quote_names : [])].filter(Boolean))) as string[];
  const canSaveName = !!customerId && !!value.customer_title.trim() && !names.includes(value.customer_title.trim()) && Array.isArray(cust?.quote_names);
  const saveName = async () => {
    const list = Array.from(new Set([...(cust?.quote_names || []), value.customer_title.trim()]));
    const { error } = await supabase.from('customers').update({ quote_names: list }).eq('id', customerId);
    if (error) { alert(error.message); return; }
    setCust({ ...cust, quote_names: list }); setSaved(true);
  };
  const shownName = value.customer_title || cust?.legal_name || cust?.name || '';

  return (
    <div className="rounded-lg border border-slate-200">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        <FileSignature className="h-4 w-4 text-indigo-600" />
        <span className="text-sm font-semibold text-slate-700">Teklif belgesi: hitap, onay ve koşullar</span>
        <span className="ml-auto truncate text-xs text-slate-400">{shownName ? `Sayın: ${shownName}` : 'Müşteri kartındaki ad kullanılır'}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 pb-3 pt-3">
          <p className="text-xs text-slate-500">Bu alanlar müşteri kartını değiştirmez; yalnızca bu teklifin PDF'inde, online teklif sayfasında ve onay kaydında kullanılır. Boş bırakılanlarda müşteri kartı / antet bilgisi geçer.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Teklifte görünecek ad (Sayın)</label>
              <input list={`qnames-${customerId}`} value={value.customer_title} onChange={e => { onChange({ customer_title: e.target.value }); setSaved(false); }}
                placeholder={cust?.legal_name || cust?.name || 'Müşteri kartındaki ad'} className={inp} />
              <datalist id={`qnames-${customerId}`}>{names.map(n => <option key={n} value={n} />)}</datalist>
              <div className="mt-1 flex min-h-[18px] items-center gap-2 text-[11px] text-slate-500">
                {names.length > 1 && <span>Kayıtlı adlar listeden seçilebilir.</span>}
                {canSaveName && !saved && <button type="button" onClick={saveName} className="flex items-center gap-1 text-indigo-600 hover:underline"><BookmarkPlus className="h-3 w-3" />Bu adı müşterinin teklif adlarına kaydet</button>}
                {saved && <span className="flex items-center gap-1 text-green-700"><Check className="h-3 w-3" />Kaydedildi</span>}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Dikkatine (yetkili)</label>
              <input list={`qcontacts-${customerId}`} value={value.attention_to} onChange={e => onChange({ attention_to: e.target.value })}
                placeholder={contacts[0] ? `${contacts[0].full_name}${contacts[0].title ? ' – ' + contacts[0].title : ''}` : 'Ad Soyad – Unvan'} className={inp} />
              <datalist id={`qcontacts-${customerId}`}>{contacts.map(c => <option key={c.full_name} value={c.title ? `${c.full_name} – ${c.title}` : c.full_name} />)}</datalist>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Teklifi kabul eden (onay bloğu)</label>
              <input list={`qnames-${customerId}`} value={value.acceptor_title} onChange={e => onChange({ acceptor_title: e.target.value })}
                placeholder={shownName || 'Boşsa "Sayın" satırındaki ad'} className={inp} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium text-slate-700">Teklifi veren (imza)</label>
                <input value={value.signer_name} onChange={e => onChange({ signer_name: e.target.value })} placeholder={defaultSigner?.name || 'Antetteki imzacı'} className={inp} />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Unvanı</label>
                <input value={value.signer_title} onChange={e => onChange({ signer_title: e.target.value })} placeholder={defaultSigner?.title || 'Genel Müdür'} className={inp} />
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Teslim süresi / şekli</label>
              <input value={value.delivery_terms} onChange={e => onChange({ delivery_terms: e.target.value })} placeholder="Sipariş onayından itibaren 10 iş günü" className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Garanti</label>
              <input value={value.warranty_terms} onChange={e => onChange({ warranty_terms: e.target.value })} placeholder="2 yıl üretici garantisi" className={inp} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Bu teklife özel şartlar / opsiyon notu</label>
            <textarea rows={2} value={value.extra_terms} onChange={e => onChange({ extra_terms: e.target.value })} placeholder="Fiyatlar stokla sınırlıdır; kur farkı ödeme günündeki TCMB satış kuru ile hesaplanır…" className={area} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={value.hide_standard_terms} onChange={e => onChange({ hide_standard_terms: e.target.checked })} />
            Antetteki standart genel şartları bu teklifte gösterme
          </label>
        </div>
      )}
    </div>
  );
}
