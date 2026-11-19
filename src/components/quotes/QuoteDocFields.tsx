'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FileSignature, BookmarkPlus, Check, Download, Stamp } from 'lucide-react';
import { QuoteDoc, VALIDITY_DAYS, dateAfter } from '@/lib/quote-doc';

const inp = 'mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500';
const area = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500';
const lbl = 'text-sm font-medium text-slate-700';

/** Geçerlilik: tarih + 7/15/30/45/60/90 gün hızlı seçim */
export function ValidityPicker({ value, onChange, from }: { value: string; onChange: (v: string) => void; from?: string | null }) {
  const days = value ? Math.round((new Date(value).getTime() - new Date((from || new Date().toISOString()).slice(0, 10)).getTime()) / 864e5) : null;
  return (
    <div>
      <label className={lbl}>Geçerlilik (opsiyon) tarihi</label>
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

/** Müşteri kartındaki adres bloğu (adres, ilçe / il, vergi bilgisi) */
export const customerAddressBlock = (c: any) => [
  c?.address, [c?.district, c?.city].filter(Boolean).join(' / '),
  (c?.tax_office || c?.tax_number) ? `${c?.tax_office ? `${c.tax_office} V.D.` : ''}${c?.tax_office && c?.tax_number ? ' · ' : ''}${c?.tax_number ? `VKN ${c.tax_number}` : ''}` : '',
].filter(Boolean).join('\n');

/**
 * Teklif belgesi ayarları: müşteri adı / takma ad, ilgili kişi ve görevi, adres, kabul eden, imzalayan,
 * ticari koşullar, genel şartlar, kaşe-imza. Müşteri kartını değiştirmez; yalnızca bu teklifte geçerlidir.
 */
export default function QuoteDocFields({ supabase, customerId, value, onChange, defaultSigner, defaultOpen = false, autoAttention = false }: {
  supabase: any; customerId: string; value: QuoteDoc; onChange: (patch: Partial<QuoteDoc>) => void;
  defaultSigner?: { name?: string; title?: string }; defaultOpen?: boolean; autoAttention?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || !!(value.customer_title || value.attention_to || value.recipient_address || value.acceptor_title || value.signer_name || value.delivery_terms || value.warranty_terms || value.extra_terms || value.standard_terms_override));
  const [cust, setCust] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [lh, setLh] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from('quote_letterhead').select('*').maybeSingle().then((r: any) => setLh(r.data || {}));
  }, []);

  useEffect(() => {
    setCust(null); setContacts([]); setSaved(false);
    if (!customerId) return;
    (async () => {
      let r = await supabase.from('customers').select('name, legal_name, quote_names, address, district, city, tax_office, tax_number').eq('id', customerId).maybeSingle();
      if (r.error) r = await supabase.from('customers').select('*').eq('id', customerId).maybeSingle();
      setCust(r.data || null);
      const c = await supabase.from('customer_contacts').select('full_name, title, is_primary, is_active').eq('customer_id', customerId);
      const list = (c.data || []).filter((x: any) => x.is_active !== false).sort((a: any, b: any) => Number(!!b.is_primary) - Number(!!a.is_primary));
      setContacts(list);
      // Yeni teklifte ilgili kişi boşsa müşterinin ana kişisi önerilir (değiştirilebilir)
      if (autoAttention && list[0] && !value.attention_to) onChange({ attention_to: list[0].full_name, attention_title: value.attention_title || list[0].title || '' });
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
  const pickContact = (name: string) => {
    const c = contacts.find(x => x.full_name === name);
    onChange(c ? { attention_to: name, attention_title: c.title || value.attention_title } : { attention_to: name });
  };
  const shownName = value.customer_title || cust?.legal_name || cust?.name || '';
  const cardAddress = customerAddressBlock(cust);

  return (
    <div className="rounded-lg border border-slate-200">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        <FileSignature className="h-4 w-4 text-indigo-600" />
        <span className="text-sm font-semibold text-slate-700">Teklif belgesi: müşteri, ilgili kişi, adres, şartlar, imza</span>
        <span className="ml-auto truncate text-xs text-slate-400">{[shownName || 'Müşteri kartındaki ad', value.attention_to].filter(Boolean).join(' · ')}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t px-3 pb-3 pt-3">
          <p className="text-xs text-slate-500">Bu alanlar müşteri kartını değiştirmez; yalnızca bu teklifin PDF'inde, online teklif sayfasında ve onay kaydında kullanılır. Boş bırakılanlarda müşteri kartı / antet bilgisi geçer.</p>

          {/* Müşteri bloğu */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teklif verilen</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={lbl}>Kurum adı (teklifte görünecek)</label>
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
                <label className={lbl}>İlgili kişi</label>
                <input list={`qcontacts-${customerId}`} value={value.attention_to} onChange={e => pickContact(e.target.value)}
                  placeholder={contacts[0]?.full_name || 'Sn. Ad Soyad'} className={inp} />
                <datalist id={`qcontacts-${customerId}`}>{contacts.map(c => <option key={c.full_name} value={c.full_name}>{c.title || ''}</option>)}</datalist>
              </div>
              <div>
                <label className={lbl}>Görev tanımı</label>
                <input value={value.attention_title} onChange={e => onChange({ attention_title: e.target.value })} placeholder="Satın Alma Müdürü" className={inp} />
              </div>
              <div className="md:col-span-2">
                <div className="flex items-center gap-2">
                  <label className={lbl}>Adres / fatura bilgileri (bu teklifte)</label>
                  {cardAddress && <button type="button" onClick={() => onChange({ recipient_address: cardAddress })} className="ml-auto flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"><Download className="h-3 w-3" />Müşteri kartındakini getir</button>}
                </div>
                <textarea rows={4} value={value.recipient_address} onChange={e => onChange({ recipient_address: e.target.value })}
                  placeholder={cardAddress || 'Boş bırakılırsa müşteri kartındaki adres ve vergi bilgisi kullanılır'} className={area} />
                <p className="mt-0.5 text-[11px] text-slate-400">Boşsa müşteri kartındaki adres, ilçe/il ve vergi bilgisi yazılır. Doldurursanız teklifte yalnızca bu metin, satır satır görünür.</p>
              </div>
            </div>
          </div>

          {/* Onay ve imza */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Onay ve imza</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className={lbl}>Teklifi kabul eden</label>
                <input list={`qnames-${customerId}`} value={value.acceptor_title} onChange={e => onChange({ acceptor_title: e.target.value })}
                  placeholder={shownName || 'Boşsa kurum adı'} className={inp} />
              </div>
              <div>
                <label className={lbl}>Teklifi veren (imzacı)</label>
                <input value={value.signer_name} onChange={e => onChange({ signer_name: e.target.value })} placeholder={defaultSigner?.name || lh?.signer_name || 'Antetteki imzacı'} className={inp} />
              </div>
              <div>
                <label className={lbl}>Unvanı</label>
                <input value={value.signer_title} onChange={e => onChange({ signer_title: e.target.value })} placeholder={defaultSigner?.title || lh?.signer_title || 'Genel Müdür'} className={inp} />
              </div>
            </div>
            <label className={`flex items-center gap-2 text-sm ${lh?.stamp_path ? 'text-slate-700' : 'text-slate-400'}`}>
              <input type="checkbox" disabled={!lh?.stamp_path} checked={value.show_stamp} onChange={e => onChange({ show_stamp: e.target.checked })} />
              <Stamp className="h-4 w-4" />Kaşe ve imzayı teklife ekle
              {!lh?.stamp_path && <span className="text-[11px]">(önce Kurumsal PDF → Antet bilgileri'nden kaşe-imza görselini yükleyin)</span>}
            </label>
          </div>

          {/* Koşullar */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ticari koşullar</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={lbl}>Teslim süresi / şekli</label>
                <input value={value.delivery_terms} onChange={e => onChange({ delivery_terms: e.target.value })} placeholder="Sipariş onayından itibaren 10 iş günü" className={inp} />
              </div>
              <div>
                <label className={lbl}>Garanti</label>
                <input value={value.warranty_terms} onChange={e => onChange({ warranty_terms: e.target.value })} placeholder="2 yıl üretici garantisi" className={inp} />
              </div>
            </div>
            <div>
              <label className={lbl}>Bu teklife özel şartlar / opsiyon notu</label>
              <textarea rows={2} value={value.extra_terms} onChange={e => onChange({ extra_terms: e.target.value })} placeholder="Fiyatlar stokla sınırlıdır…" className={area} />
            </div>
          </div>

          {/* Genel şartlar */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Genel şartlar</p>
              {lh?.standard_terms && !value.hide_standard_terms && <button type="button" onClick={() => onChange({ standard_terms_override: lh.standard_terms })} className="ml-auto flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"><Download className="h-3 w-3" />Antetteki şartları getirip düzenle</button>}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={value.hide_standard_terms} onChange={e => onChange({ hide_standard_terms: e.target.checked })} />
              Bu teklifte genel şartları hiç gösterme
            </label>
            {!value.hide_standard_terms && (
              <>
                <textarea rows={value.standard_terms_override ? 8 : 3} value={value.standard_terms_override} onChange={e => onChange({ standard_terms_override: e.target.value })}
                  placeholder={lh?.standard_terms ? 'Boş bırakılırsa antetteki standart şartlar aynen kullanılır. Bu teklifte madde eklemek / çıkarmak için yukarıdan "Antetteki şartları getirip düzenle"ye basın.' : 'Bu teklifin genel şartları'} className={area} />
                {value.standard_terms_override && lh?.standard_terms && <button type="button" onClick={() => onChange({ standard_terms_override: '' })} className="text-[11px] text-slate-500 hover:underline">Antetteki standart şartlara geri dön</button>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
