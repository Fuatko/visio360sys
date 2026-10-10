'use client';

import { useState } from 'react';
import { Card, Button, Badge, Modal, Input, Select, Textarea } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { SUPPLIER_MODELS, n } from '@/lib/suppliers';
import { periodRange, currentPeriods, periodLabel, inRange } from '@/lib/periods';
import { Plus, Factory, Target, AlertTriangle, ExternalLink, Trash2 } from 'lucide-react';

interface Props { supabase: any; suppliers: any[]; targets: any[]; pos: any[]; receivables: any[]; opps: any[]; onChanged: () => void }
const tl = (v: number) => `₺${formatMoney(Math.round(v))}`;
const EMPTY = { name: '', tax_no: '', model: 'reseller', our_level: '', territory: '', product_groups: '', contract_start: '', contract_end: '', certifications: '',
  payment_term_days: '', credit_limit: '', default_discount_pct: '', commission_rate: '', deal_reg_required: false, deal_reg_protection_days: '', min_margin_pct: '',
  min_resale_note: '', contact_name: '', contact_phone: '', contact_email: '', portal_url: '', notes: '', is_active: true };

export default function SupplierCards({ supabase, suppliers, targets, pos, receivables, opps, onChanged }: Props) {
  const cp = currentPeriods();
  const [form, setForm] = useState<any | null>(null);
  const [tForm, setTForm] = useState<any | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);

  const purchases = (sid: string, period: string) => pos.filter(p => p.supplier_id === sid && p.status !== 'cancelled' && inRange(p.order_date, periodRange(period))).reduce((s, p) => s + n(p.subtotal), 0);

  const save = async () => {
    if (!form.name.trim()) { alert('Firma adı girin.'); return; }
    const { id, created_at, organization_id, ...rest } = form;
    const payload: any = {};
    Object.entries(rest).forEach(([k, v]) => { payload[k] = v === '' ? null : v; });
    const { error } = id ? await supabase.from('suppliers').update(payload).eq('id', id) : await supabase.from('suppliers').insert([payload]);
    if (error) { alert(error.message); return; }
    setForm(null); onChanged();
  };
  const saveTarget = async () => {
    if (!periodRange(tForm.period) || !(n(tForm.target_amount) > 0)) { alert('Geçerli dönem (2026, 2026-Q4) ve tutar girin.'); return; }
    const { error } = await supabase.from('supplier_targets').upsert([{ supplier_id: tForm.supplier_id, period: tForm.period, target_amount: n(tForm.target_amount), basis: tForm.basis, reward_note: tForm.reward_note || null }], { onConflict: 'supplier_id,period' });
    if (error) { alert(error.message); return; }
    setTForm(null); onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Bayisi, iş ortağı veya yetkili servisi olduğunuz firmalar ve size uyguladıkları kurallar.</p>
        <Button onClick={() => setForm({ ...EMPTY })}><Plus className="h-4 w-4" />Ana firma ekle</Button>
      </div>
      {suppliers.length === 0 && <Card className="p-8 text-center text-sm text-slate-500"><Factory className="mx-auto mb-2 h-10 w-10 text-slate-300" />Henüz ana firma yok. Bayisi veya iş ortağı olduğunuz markaları ekleyin.</Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        {suppliers.map(s => {
          const tgts = targets.filter(t => t.supplier_id === s.id).sort((a, b) => b.period.localeCompare(a.period));
          const curT = tgts.find(t => t.period === cp.year) || tgts.find(t => t.period === cp.quarter) || tgts[0];
          const achieved = curT ? (curT.basis === 'sales'
            ? opps.filter(o => o.supplier_id === s.id && o.stage === 'Kazanıldı' && inRange((o.closed_at || o.expected_close || '').slice(0, 10), periodRange(curT.period))).reduce((a, o) => a + n(o.value), 0)
            : purchases(s.id, curT.period)) : 0;
          const pct = curT ? achieved / n(curT.target_amount) * 100 : 0;
          const rec = receivables.filter(r => r.supplier_id === s.id && ['expected', 'invoiced'].includes(r.status)).reduce((a, r) => a + n(r.amount), 0);
          const openOpps = opps.filter(o => o.supplier_id === s.id && !['Kazanıldı', 'Kaybedildi'].includes(o.stage));
          const missingReg = s.deal_reg_required ? openOpps.filter(o => o.supplier_reg_status !== 'approved').length : 0;
          const expiring = openOpps.filter(o => o.supplier_reg_until && o.supplier_reg_until >= today && o.supplier_reg_until <= new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)).length;
          return (
            <Card key={s.id} className={`p-4 ${s.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <button onClick={() => setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? ''])) })} className="text-left text-lg font-semibold hover:text-indigo-700">{s.name}</button>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <Badge variant="primary">{SUPPLIER_MODELS[s.model]?.label}</Badge>
                    {s.our_level && <Badge variant="success">{s.our_level}</Badge>}
                    {s.deal_reg_required && <Badge variant="warning">Fırsat kaydı zorunlu</Badge>}
                  </div>
                </div>
                {s.portal_url && <a href={s.portal_url} target="_blank" rel="noopener" className="text-xs text-indigo-600"><ExternalLink className="h-4 w-4" /></a>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <span>Vade: <b>{s.payment_term_days != null && s.payment_term_days !== '' ? `${s.payment_term_days} gün` : '-'}</b></span>
                <span>Alış iskontosu: <b>{s.default_discount_pct ? `%${n(s.default_discount_pct)}` : '-'}</b></span>
                {s.commission_rate ? <span>Komisyon: <b>%{n(s.commission_rate)}</b></span> : null}
                {s.min_margin_pct ? <span>Marj alt sınırı: <b>%{n(s.min_margin_pct)}</b></span> : null}
                {s.territory && <span className="col-span-2">Yetki: {s.territory}{s.product_groups ? ` · ${s.product_groups}` : ''}</span>}
                <span className={`col-span-2 ${s.contract_end && s.contract_end < soon ? 'font-semibold text-red-600' : ''}`}>Sözleşme: {s.contract_end ? `${formatDate(s.contract_end)} tarihinde bitiyor` : '-'}</span>
              </div>
              <div className="mt-3 rounded-lg bg-slate-50 p-2">
                {curT ? (
                  <>
                    <div className="flex justify-between text-xs"><span className="flex items-center gap-1"><Target className="h-3 w-3" />{periodLabel(curT.period)} {curT.basis === 'sales' ? 'satış' : 'alım'} hedefi</span><span>{tl(achieved)} / {tl(n(curT.target_amount))} · <b>%{Math.round(pct)}</b></span></div>
                    <div className="mt-1 h-1.5 rounded bg-slate-200"><div className={`h-1.5 rounded ${pct >= 100 ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                    {pct < 100 && <p className="mt-1 text-[11px] text-slate-500">Hedefe {tl(n(curT.target_amount) - achieved)} kaldı{curT.reward_note ? ` → ${curT.reward_note}` : ''}</p>}
                  </>
                ) : <p className="text-xs text-slate-400">Ana firmanın size koyduğu hedef girilmemiş.</p>}
                <button onClick={() => setTForm({ supplier_id: s.id, period: cp.year, target_amount: '', basis: 'purchases', reward_note: '' })} className="mt-1 text-[11px] text-indigo-600">+ Hedef gir</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <span>Bu yıl alım: <b>{tl(purchases(s.id, cp.year))}</b></span>
                <span>Bekleyen alacak: <b className="text-green-700">{tl(rec)}</b></span>
                <span>Açık fırsat: <b>{openOpps.length}</b></span>
              </div>
              {(missingReg > 0 || expiring > 0) && (
                <p className="mt-2 flex items-center gap-1 rounded bg-amber-50 p-1.5 text-xs text-amber-800"><AlertTriangle className="h-3 w-3" />
                  {missingReg > 0 && `${missingReg} fırsat ana firmaya kaydedilmemiş/onaysız. `}{expiring > 0 && `${expiring} kaydın koruması 14 gün içinde bitiyor.`}</p>
              )}
            </Card>
          );
        })}
      </div>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? form.name : 'Ana firma'} size="xl"
        footer={<>{form?.id && <Button variant="ghost" onClick={async () => { if (confirm('Silinsin mi? (Satın alma kaydı varsa silinemez, pasifleştirin.)')) { const { error } = await supabase.from('suppliers').delete().eq('id', form.id); if (error) alert(error.message); else { setForm(null); onChanged(); } } }}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
          <Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2"><Input label="Firma adı *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <Input label="Vergi no" value={form.tax_no} onChange={e => setForm({ ...form, tax_no: e.target.value })} />
              <Select label="Çalışma modeli" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} options={Object.entries(SUPPLIER_MODELS).map(([value, v]) => ({ value, label: v.label }))} />
              <Input label="Seviyemiz (ör. Gold Partner)" value={form.our_level} onChange={e => setForm({ ...form, our_level: e.target.value })} />
              <Input label="Portal / B2B adresi" value={form.portal_url} onChange={e => setForm({ ...form, portal_url: e.target.value })} />
            </div>
            <p className="-mt-2 text-xs text-slate-500">{SUPPLIER_MODELS[form.model]?.hint}</p>
            <p className="text-xs font-semibold uppercase text-slate-400">Yetki ve sözleşme</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Yetkili bölge" value={form.territory} onChange={e => setForm({ ...form, territory: e.target.value })} />
              <Input label="Yetkili ürün grupları" value={form.product_groups} onChange={e => setForm({ ...form, product_groups: e.target.value })} />
              <Input label="Sertifikalar" value={form.certifications} onChange={e => setForm({ ...form, certifications: e.target.value })} />
              <Input label="Sözleşme başlangıcı" type="date" value={form.contract_start} onChange={e => setForm({ ...form, contract_start: e.target.value })} />
              <Input label="Sözleşme bitişi" type="date" value={form.contract_end} onChange={e => setForm({ ...form, contract_end: e.target.value })} />
            </div>
            <p className="text-xs font-semibold uppercase text-slate-400">Ticari koşullar (bize uygulanan)</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <Input label="Vade (gün)" type="number" value={form.payment_term_days} onChange={e => setForm({ ...form, payment_term_days: e.target.value })} />
              <Input label="Kredi limiti (₺)" type="number" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} />
              <Input label="Alış iskontomuz %" type="number" value={form.default_discount_pct} onChange={e => setForm({ ...form, default_discount_pct: e.target.value })} />
              <Input label="Komisyon oranımız %" type="number" value={form.commission_rate} onChange={e => setForm({ ...form, commission_rate: e.target.value })} />
            </div>
            <p className="text-xs font-semibold uppercase text-slate-400">Satış kuralları</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={!!form.deal_reg_required} onChange={e => setForm({ ...form, deal_reg_required: e.target.checked })} />Teklif öncesi fırsat kaydı zorunlu</label>
              <Input label="Koruma süresi (gün)" type="number" value={form.deal_reg_protection_days} onChange={e => setForm({ ...form, deal_reg_protection_days: e.target.value })} />
              <Input label="Bu markada marj alt sınırımız %" type="number" value={form.min_margin_pct} onChange={e => setForm({ ...form, min_margin_pct: e.target.value })} />
            </div>
            <Input label="Asgari satış fiyatı / kampanya kuralları" value={form.min_resale_note} onChange={e => setForm({ ...form, min_resale_note: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Kanal yöneticisi" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
              <Input label="Telefon" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
              <Input label="E-posta" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
            </div>
            <Textarea label="Notlar" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active !== false} onChange={e => setForm({ ...form, is_active: e.target.checked })} />Aktif</label>
          </div>
        )}
      </Modal>
      <Modal isOpen={!!tForm} onClose={() => setTForm(null)} title="Ana firmanın hedefi"
        footer={<><Button variant="secondary" onClick={() => setTForm(null)}>İptal</Button><Button onClick={saveTarget}>Kaydet</Button></>}>
        {tForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Dönem (2026, 2026-Q4)" value={tForm.period} onChange={e => setTForm({ ...tForm, period: e.target.value })} />
              <Input label="Hedef tutar (₺, KDV hariç)" type="number" value={tForm.target_amount} onChange={e => setTForm({ ...tForm, target_amount: e.target.value })} />
            </div>
            <Select label="Hedef neye göre" value={tForm.basis} onChange={e => setTForm({ ...tForm, basis: e.target.value })} options={[{ value: 'purchases', label: 'Bizim alımlarımız (satın alma siparişleri)' }, { value: 'sales', label: 'Kazanılan satışlarımız (fırsatlar)' }]} />
            <Input label="Ulaşınca kazanacağımız (ör. %2 ciro primi, Gold seviye)" value={tForm.reward_note} onChange={e => setTForm({ ...tForm, reward_note: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
