'use client';

import { Card, Button, Input, Select, Modal, Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { Plus, Edit2, Trash2, Percent, Calculator } from 'lucide-react';
import { useState } from 'react';
import { DEALER_LEVELS, PAYMENT_TERMS, ruleDescription, resolveDealerPrice, termLabel } from '@/lib/dealer-pricing';

interface Props {
  supabase: any;
  rules: any[];
  dealers: any[];
  products: any[];
  priceListItems: any[];
  onChanged: () => void;
}

const EMPTY = { id: '', name: '', dealer_id: '', dealer_level: '', product_id: '', product_category: '', max_payment_term_days: '', min_quantity: 0, discount_pct: 0, valid_from: '', valid_to: '', is_active: true, notes: '' };
const n = (v: any) => Number(v) || 0;

export default function DiscountRules({ supabase, rules, dealers, products, priceListItems, onChanged }: Props) {
  const [form, setForm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [calc, setCalc] = useState({ dealer: dealers[0]?.id || '', product: products[0]?.id || '', qty: 1, term: 30 });

  const dealerName = (id: string) => dealers.find(d => d.id === id)?.name;
  const productName = (id: string) => products.find(p => p.id === id)?.name;
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort();
  const levels = Array.from(new Set([...DEALER_LEVELS, ...dealers.map(d => d.dealer_level).filter(Boolean)]));

  const save = async () => {
    if (!form) return;
    if (!(n(form.discount_pct) > 0)) { alert('İskonto oranı girin.'); return; }
    setBusy(true);
    const payload: any = {
      name: form.name || null,
      dealer_id: form.dealer_id || null,
      dealer_level: form.dealer_id ? null : (form.dealer_level || null),
      product_id: form.product_id || null,
      product_category: form.product_id ? null : (form.product_category || null),
      max_payment_term_days: form.max_payment_term_days === '' ? null : Number(form.max_payment_term_days),
      min_quantity: n(form.min_quantity),
      discount_pct: n(form.discount_pct),
      valid_from: form.valid_from || null,
      valid_to: form.valid_to || null,
      is_active: !!form.is_active,
      notes: form.notes || null,
    };
    const { error } = form.id
      ? await supabase.from('dealer_discount_rules').update(payload).eq('id', form.id)
      : await supabase.from('dealer_discount_rules').insert([payload]);
    setBusy(false);
    if (error) { alert('Hata: ' + error.message); return; }
    setForm(null); onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm('Kural silinsin mi?')) return;
    const { error } = await supabase.from('dealer_discount_rules').delete().eq('id', id);
    if (error) { alert('Hata: ' + error.message); return; }
    onChanged();
  };

  const calcDealer = dealers.find(d => d.id === calc.dealer);
  const calcProduct = products.find(p => p.id === calc.product);
  const result = calcDealer && calcProduct
    ? resolveDealerPrice({ dealer: calcDealer, product: calcProduct, quantity: calc.qty, termDays: calc.term, priceListItems, rules })
    : null;
  const net = result ? result.listPrice * (1 - result.discountPct / 100) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1 text-sm font-semibold"><Percent className="h-4 w-4 text-indigo-600" />İskonto Kuralları</h3>
          <Button size="sm" onClick={() => setForm({ ...EMPTY })}><Plus className="h-3 w-3" />Yeni Kural</Button>
        </div>
        {rules.length === 0 ? (
          <p className="text-sm text-slate-500">
            Henüz kural yok. Örnek: "Altın seviye bayilere peşin %12, 30 güne kadar %8" için iki kural tanımlayın.
            Kural uymadığında bayi kartındaki temel iskonto uygulanır.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2">Kural</th><th className="py-2 text-right">İskonto</th><th className="py-2">Geçerlilik</th><th />
              </tr>
            </thead>
            <tbody>
              {[...rules].sort((a, b) => n(b.discount_pct) - n(a.discount_pct)).map(r => (
                <tr key={r.id} className={`border-b ${r.is_active ? '' : 'opacity-50'}`}>
                  <td className="py-2">
                    {r.name && <div className="font-medium">{r.name}</div>}
                    <div className="text-xs text-slate-600">{ruleDescription(r, productName(r.product_id), dealerName(r.dealer_id))}</div>
                  </td>
                  <td className="py-2 text-right font-semibold">%{n(r.discount_pct)}</td>
                  <td className="py-2 text-xs text-slate-500">
                    {r.valid_from || r.valid_to ? `${r.valid_from || '…'} → ${r.valid_to || '…'}` : 'Süresiz'}
                    {!r.is_active && <Badge variant="default" className="ml-1">Pasif</Badge>}
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setForm({ ...EMPTY, ...r, dealer_id: r.dealer_id || '', product_id: r.product_id || '', dealer_level: r.dealer_level || '', product_category: r.product_category || '', max_payment_term_days: r.max_payment_term_days ?? '', valid_from: r.valid_from || '', valid_to: r.valid_to || '', name: r.name || '', notes: r.notes || '' })}><Edit2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          Öncelik: bayiye özel &gt; ürüne özel &gt; kategori &gt; seviye. Aynı öncelikte birden çok kural uyarsa en yüksek iskonto uygulanır.
          Vade sınırı olan kural, sipariş vadesi bu sınırın altındaysa geçerlidir (ör. "≤ 30 gün" kuralı peşin ve 30 günlük siparişte uygulanır).
        </p>
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="flex items-center gap-1 text-sm font-semibold"><Calculator className="h-4 w-4 text-indigo-600" />Fiyat Hesaplayıcı</h3>
        <p className="text-xs text-slate-500">Kuralları kaydetmeden önce/sonra bir bayi için hangi fiyatın çıkacağını kontrol edin.</p>
        <Select label="Bayi" value={calc.dealer} onChange={e => setCalc({ ...calc, dealer: e.target.value })}
          options={dealers.length ? dealers.map(d => ({ value: d.id, label: `${d.name}${d.dealer_level ? ' · ' + d.dealer_level : ''}` })) : [{ value: '', label: 'Bayi yok' }]} />
        <Select label="Ürün" value={calc.product} onChange={e => setCalc({ ...calc, product: e.target.value })}
          options={products.length ? products.map(p => ({ value: p.id, label: p.name })) : [{ value: '', label: 'Ürün yok' }]} />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Miktar" type="number" value={calc.qty} onChange={e => setCalc({ ...calc, qty: parseFloat(e.target.value) || 1 })} />
          <Select label="Vade" value={String(calc.term)} onChange={e => setCalc({ ...calc, term: Number(e.target.value) })}
            options={PAYMENT_TERMS.map(t => ({ value: String(t.days), label: t.label }))} />
        </div>
        {result && (
          <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Birim fiyat</span><span>₺{formatMoney(result.listPrice)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">İskonto</span><span className="text-red-600">%{result.discountPct}</span></div>
            <div className="flex justify-between font-semibold"><span>Net birim fiyat</span><span className="text-indigo-700">₺{formatMoney(net)}</span></div>
            <div className="flex justify-between font-semibold"><span>{calc.qty} adet (KDV hariç)</span><span>₺{formatMoney(net * calc.qty)}</span></div>
            <p className="pt-1 text-[11px] text-slate-500">{result.explanation} · {termLabel(calc.term)}</p>
          </div>
        )}
      </Card>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? 'Kuralı Düzenle' : 'Yeni İskonto Kuralı'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save} disabled={busy}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-3 text-sm">
            <Input label="Kural adı (opsiyonel)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Altın bayi peşin iskontosu" />
            <p className="text-xs text-slate-500">Boş bıraktığınız alan "hepsi" anlamına gelir.</p>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Bayi" value={form.dealer_id} onChange={e => setForm({ ...form, dealer_id: e.target.value })}
                options={[{ value: '', label: 'Tüm bayiler' }, ...dealers.map(d => ({ value: d.id, label: d.name }))]} />
              <div>
                <label className="text-xs font-medium text-slate-600">Bayi seviyesi</label>
                <input list="rule-levels" disabled={!!form.dealer_id} value={form.dealer_level} onChange={e => setForm({ ...form, dealer_level: e.target.value })}
                  placeholder={form.dealer_id ? 'Bayi seçildi' : 'Tüm seviyeler'} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" />
                <datalist id="rule-levels">{levels.map(l => <option key={l} value={l} />)}</datalist>
              </div>
              <Select label="Ürün" value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}
                options={[{ value: '', label: 'Tüm ürünler' }, ...products.map(p => ({ value: p.id, label: p.name }))]} />
              <div>
                <label className="text-xs font-medium text-slate-600">Ürün kategorisi</label>
                <input list="rule-categories" disabled={!!form.product_id} value={form.product_category} onChange={e => setForm({ ...form, product_category: e.target.value })}
                  placeholder={form.product_id ? 'Ürün seçildi' : 'Tüm kategoriler'} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" />
                <datalist id="rule-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <Select label="Vade koşulu" value={String(form.max_payment_term_days)} onChange={e => setForm({ ...form, max_payment_term_days: e.target.value })}
                options={[{ value: '', label: 'Her vade' }, ...PAYMENT_TERMS.map(t => ({ value: String(t.days), label: t.days === 0 ? 'Sadece peşin' : `${t.label}'e kadar` }))]} />
              <Input label="Minimum miktar" type="number" value={form.min_quantity} onChange={e => setForm({ ...form, min_quantity: e.target.value })} />
              <Input label="İskonto (%) *" type="number" value={form.discount_pct} onChange={e => setForm({ ...form, discount_pct: e.target.value })} />
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />Aktif</label>
              </div>
              <Input label="Geçerlilik başlangıcı" type="date" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} />
              <Input label="Geçerlilik bitişi" type="date" value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} />
            </div>
            <Input label="Not" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Kampanya, sözleşme maddesi vb." />
          </div>
        )}
      </Modal>
    </div>
  );
}
