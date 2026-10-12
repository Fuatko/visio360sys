'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Input, Select, Textarea } from '@/components/ui';
import { CitySelect, SectorSelect } from '@/components/TrSelects';
import { SEGMENTS, ABC, EMPLOYEE_BANDS, REVENUE_BANDS, E_INVOICE, RISK, CURRENCIES, LANGUAGES, INCOTERMS, NACE, checkTaxNumber, checkMersis, checkKep } from '@/lib/crm';
import { PAYMENT_TERMS } from '@/lib/dealer-pricing';
import { CheckCircle2, AlertTriangle, ShieldAlert, Save, X } from 'lucide-react';

const FIELDS = ['name', 'legal_name', 'tax_office', 'tax_number', 'mersis_no', 'trade_registry_no', 'kep_address', 'e_invoice_type', 'website', 'linkedin', 'email', 'phone',
  'city', 'district', 'country', 'sector', 'nace_code', 'segment', 'abc_class', 'is_key_account', 'employee_band', 'revenue_band', 'annual_potential', 'currency',
  'incoterm', 'payment_term_days', 'credit_limit', 'risk_class', 'order_block', 'order_block_reason', 'preferred_language', 'parent_id', 'payer_id', 'tags', 'status', 'assigned_to', 'notes'];

export default function CompanyInfo({ customer, others, team, onSave }: { customer: any; others: any[]; team: any[]; onSave: (patch: any) => Promise<boolean> }) {
  const init = () => Object.fromEntries(FIELDS.map(k => [k, k === 'tags' ? (customer.tags || []).join(', ') : customer[k] ?? (k === 'is_key_account' || k === 'order_block' ? false : '')]));
  const [f, setF] = useState<any>(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(init()); }, [customer]);
  const dirty = (() => { const i: any = init(); return FIELDS.some(k => String(f[k] ?? '') !== String(i[k] ?? '')); })();
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const tx = checkTaxNumber(f.tax_number);

  const save = async () => {
    if (!f.name?.trim()) { alert('Firma adı boş olamaz.'); return; }
    if (tx && !tx.ok && !confirm(`Vergi numarası hatalı görünüyor (${tx.msg}). Yine de kaydedilsin mi?`)) return;
    if (!checkMersis(f.mersis_no)) { alert('MERSİS numarası 16 haneli olmalı.'); return; }
    if (!checkKep(f.kep_address)) { alert('KEP adresi ...@xxx.kep.tr biçiminde olmalı.'); return; }
    if (f.order_block && !f.order_block_reason?.trim()) { alert('Sipariş blokajı için neden yazın.'); return; }
    const patch: any = {};
    FIELDS.forEach(k => { const v = f[k]; patch[k] = v === '' ? null : v; });
    patch.tags = String(f.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean);
    ['annual_potential', 'credit_limit', 'payment_term_days'].forEach(k => { if (patch[k] !== null) patch[k] = Number(patch[k]); });
    setBusy(true); const ok = await onSave(patch); setBusy(false);
    if (!ok) return;
  };

  const sec = (title: string, hint: string, children: React.ReactNode) => (
    <Card className="p-4">
      <p className="text-sm font-semibold">{title}</p><p className="mb-3 text-xs text-slate-500">{hint}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </Card>
  );
  const opts = (xs: readonly string[]) => [{ value: '', label: '-' }, ...xs.map(x => ({ value: x, label: x }))];
  const cands = others.filter(o => o.id !== customer.id);

  return (
    <div className="space-y-4">
      {sec('Kimlik ve yasal bilgiler', 'Fatura, sözleşme ve resmî yazışma için', <>
        <Input label="Kısa ad *" value={f.name} onChange={e => set('name', e.target.value)} />
        <div className="sm:col-span-2"><Input label="Ticari unvan" value={f.legal_name} onChange={e => set('legal_name', e.target.value)} /></div>
        <Input label="Vergi dairesi" value={f.tax_office} onChange={e => set('tax_office', e.target.value)} />
        <div><Input label="VKN / TCKN" value={f.tax_number} inputMode="numeric" onChange={e => set('tax_number', e.target.value)} />
          {tx && <p className={`mt-1 flex items-center gap-1 text-[11px] ${tx.ok ? 'text-green-700' : 'text-red-600'}`}>{tx.ok ? <><CheckCircle2 className="h-3 w-3" />Geçerli {tx.kind}</> : <><AlertTriangle className="h-3 w-3" />{tx.msg}</>}</p>}</div>
        <Select label="e-Belge" value={f.e_invoice_type} onChange={e => set('e_invoice_type', e.target.value)} options={opts(E_INVOICE)} />
        <Input label="MERSİS no" value={f.mersis_no} inputMode="numeric" onChange={e => set('mersis_no', e.target.value)} />
        <Input label="Ticaret sicil no" value={f.trade_registry_no} onChange={e => set('trade_registry_no', e.target.value)} />
        <Input label="KEP adresi" value={f.kep_address} placeholder="firma@hs01.kep.tr" onChange={e => set('kep_address', e.target.value)} />
      </>)}

      {sec('İletişim ve konum', 'Genel iletişim; kişiler ve adresler kendi sekmelerinde', <>
        <Input label="Genel telefon" value={f.phone} onChange={e => set('phone', e.target.value)} />
        <Input label="Genel e-posta" value={f.email} onChange={e => set('email', e.target.value)} />
        <Input label="Web sitesi" value={f.website} onChange={e => set('website', e.target.value)} />
        <CitySelect label="İl" value={f.city} onChange={v => set('city', v)} />
        <Input label="İlçe" value={f.district} onChange={e => set('district', e.target.value)} />
        <Input label="Ülke" value={f.country} onChange={e => set('country', e.target.value)} />
        <Input label="LinkedIn" value={f.linkedin} onChange={e => set('linkedin', e.target.value)} />
        <Select label="Yazışma dili" value={f.preferred_language} onChange={e => set('preferred_language', e.target.value)} options={opts(LANGUAGES)} />
      </>)}

      {sec('Sınıflandırma', 'Segmentasyon, önceliklendirme ve raporlama için', <>
        <SectorSelect value={f.sector} onChange={v => set('sector', v)} />
        <Select label="NACE faaliyet bölümü" value={String(f.nace_code || '').slice(0, 1)} onChange={e => set('nace_code', e.target.value)}
          options={[{ value: '', label: '-' }, ...NACE.map(([k, l]) => ({ value: k, label: `${k} — ${l}` }))]} />
        <Select label="Segment" value={f.segment} onChange={e => set('segment', e.target.value)} options={opts(SEGMENTS)} />
        <Select label="ABC sınıfı" value={f.abc_class} onChange={e => set('abc_class', e.target.value)} options={[{ value: '', label: '-' }, ...ABC]} />
        <Select label="Çalışan sayısı" value={f.employee_band} onChange={e => set('employee_band', e.target.value)} options={opts(EMPLOYEE_BANDS)} />
        <Select label="Yıllık ciro" value={f.revenue_band} onChange={e => set('revenue_band', e.target.value)} options={opts(REVENUE_BANDS)} />
        <div><Input label="Yıllık alım potansiyeli (₺)" type="number" value={f.annual_potential} onChange={e => set('annual_potential', e.target.value)} />
          <p className="mt-1 text-[11px] text-slate-500">Müşterinin bu kategoride yılda toplam ne kadar harcadığı; cüzdan payınızı hesaplar.</p></div>
        <Select label="Durum" value={f.status} onChange={e => set('status', e.target.value)} options={[{ value: 'Potansiyel', label: 'Potansiyel' }, { value: 'Aktif', label: 'Aktif' }, { value: 'VIP', label: 'VIP' }, { value: 'Pasif', label: 'Pasif' }]} />
        <Select label="Sorumlu" value={f.assigned_to} onChange={e => set('assigned_to', e.target.value)} options={[{ value: '', label: '-' }, ...team.map(t => ({ value: t.id, label: t.name }))]} />
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!f.is_key_account} onChange={e => set('is_key_account', e.target.checked)} />★ Kilit müşteri (key account)</label>
        <div className="sm:col-span-2"><Input label="Etiketler (virgülle)" value={f.tags} placeholder="ihracatçı, teşvik, rakip-X kullanıcısı" onChange={e => set('tags', e.target.value)} /></div>
      </>)}

      {sec('Ticari koşullar ve risk', 'Teklif ve siparişte varsayılan olarak kullanılır', <>
        <Select label="Para birimi" value={f.currency} onChange={e => set('currency', e.target.value)} options={opts(CURRENCIES)} />
        <Select label="Standart vade" value={String(f.payment_term_days ?? '')} onChange={e => set('payment_term_days', e.target.value)} options={[{ value: '', label: '-' }, ...PAYMENT_TERMS.map(t => ({ value: String(t.days), label: t.label }))]} />
        <Input label="Kredi limiti (₺)" type="number" value={f.credit_limit} onChange={e => set('credit_limit', e.target.value)} />
        <Select label="Teslim şekli (Incoterms 2020)" value={f.incoterm} onChange={e => set('incoterm', e.target.value)} options={[{ value: '', label: '-' }, ...INCOTERMS.map(([k, l]) => ({ value: k, label: `${k} — ${l}` }))]} />
        <Select label="Risk sınıfı" value={f.risk_class} onChange={e => set('risk_class', e.target.value)} options={opts(RISK)} />
        <div />
        <div className={`rounded-lg border p-3 sm:col-span-2 lg:col-span-3 ${f.order_block ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!f.order_block} onChange={e => set('order_block', e.target.checked)} /><ShieldAlert className="h-4 w-4 text-red-600" />Sipariş blokajı</label>
          <p className="mt-1 text-xs text-slate-500">Açıkken bu müşteriye (ve ödeyen hesabı bu olan firmalara) sipariş açılamaz: hukuki takip, ödeme sorunu, kredi limiti aşımı gibi durumlar için.</p>
          {f.order_block && <div className="mt-2"><Input label="Blokaj nedeni *" value={f.order_block_reason} onChange={e => set('order_block_reason', e.target.value)} /></div>}
        </div>
      </>)}

      {sec('Firma hiyerarşisi', 'Grup şirketleri, holding ve merkezden ödeme yapan yapılar', <>
        <Select label="Üst firma (grup / holding)" value={f.parent_id} onChange={e => set('parent_id', e.target.value)} options={[{ value: '', label: '-' }, ...cands.map(o => ({ value: o.id, label: o.name }))]} />
        <Select label="Ödeyen hesap (fatura / tahsilat muhatabı)" value={f.payer_id} onChange={e => set('payer_id', e.target.value)} options={[{ value: '', label: 'Kendisi' }, ...cands.map(o => ({ value: o.id, label: o.name }))]} />
      </>)}

      <Card className="p-4"><Textarea label="Genel notlar" rows={3} value={f.notes} onChange={e => set('notes', e.target.value)} /></Card>

      {dirty && (
        <div className="sticky bottom-4 z-20 flex items-center justify-end gap-2 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur">
          <span className="mr-auto text-sm text-slate-600">Kaydedilmemiş değişiklikler var</span>
          <Button variant="secondary" onClick={() => setF(init())}><X className="h-4 w-4" />Vazgeç</Button>
          <Button disabled={busy} onClick={save}><Save className="h-4 w-4" />{busy ? 'Kaydediliyor…' : 'Kaydet'}</Button>
        </div>
      )}
    </div>
  );
}
