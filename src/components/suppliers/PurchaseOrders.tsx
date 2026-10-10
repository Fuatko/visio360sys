'use client';

import { useState } from 'react';
import { Card, Button, Badge, Modal, Input, Select, Textarea } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { PO_STATUS, n } from '@/lib/suppliers';
import { printHtml, escapeHtml } from '@/lib/print';
import { Plus, Trash2, Printer } from 'lucide-react';

interface Props { supabase: any; pos: any[]; suppliers: any[]; products: any[]; orders: any[]; customers: any[]; openId?: string | null; onChanged: () => void }
const tl = (v: number) => `₺${formatMoney(v)}`;
const r2 = (v: number) => Math.round(v * 100) / 100;

export default function PurchaseOrders({ supabase, pos, suppliers, products, orders, customers, onChanged }: Props) {
  const [form, setForm] = useState<any | null>(null);
  const [filter, setFilter] = useState('');
  const [sup, setSup] = useState('');
  const sname = (id: string) => suppliers.find(s => s.id === id)?.name || '-';
  const ord = (id: string) => orders.find(o => o.id === id);
  const today = new Date().toISOString().slice(0, 10);

  const open = async (po?: any) => {
    if (!po) { setForm({ supplier_id: sup || '', sales_order_id: '', order_date: today, expected_date: '', status: 'draft', supplier_invoice_no: '', supplier_invoice_date: '', due_date: '', paid_at: '', notes: '', items: [{ product_id: '', description: '', quantity: 1, unit_cost: 0, discount: 0, tax_rate: 20 }] }); return; }
    const { data } = await supabase.from('purchase_order_items').select('*').eq('po_id', po.id);
    setForm({ ...Object.fromEntries(Object.entries(po).map(([k, v]) => [k, v ?? ''])), items: data || [] });
  };

  const setItem = (i: number, patch: any) => {
    const items = [...form.items]; items[i] = { ...items[i], ...patch };
    if (patch.product_id) {
      const p = products.find(x => x.id === patch.product_id);
      const s = suppliers.find(x => x.id === form.supplier_id);
      if (p) items[i] = { ...items[i], description: p.name, unit_cost: n(p.cost_price) || r2(n(p.price) * (1 - n(s?.default_discount_pct) / 100)), tax_rate: n(p.tax_rate ?? 20) };
    }
    setForm({ ...form, items });
  };
  const lineTotal = (i: any) => r2(n(i.quantity) * n(i.unit_cost) * (1 - n(i.discount) / 100));
  const sub = form ? form.items.reduce((s: number, i: any) => s + lineTotal(i), 0) : 0;
  const tax = form ? form.items.reduce((s: number, i: any) => s + lineTotal(i) * n(i.tax_rate) / 100, 0) : 0;

  const save = async () => {
    if (!form.supplier_id) { alert('Ana firma seçin.'); return; }
    const items = form.items.filter((i: any) => i.product_id || i.description);
    if (!items.length) { alert('En az bir kalem girin.'); return; }
    const { items: _, id, po_number, created_at, created_by, organization_id, subtotal, tax_total, total, ...rest } = form;
    const payload: any = {};
    Object.entries(rest).forEach(([k, v]) => { payload[k] = v === '' ? null : v; });
    if (!payload.due_date && payload.supplier_invoice_date) {
      const s = suppliers.find(x => x.id === form.supplier_id);
      if (s?.payment_term_days) { const d = new Date(payload.supplier_invoice_date); d.setDate(d.getDate() + n(s.payment_term_days)); payload.due_date = d.toISOString().slice(0, 10); }
    }
    let poId = id;
    if (id) {
      const { error } = await supabase.from('purchase_orders').update(payload).eq('id', id);
      if (error) { alert(error.message); return; }
      await supabase.from('purchase_order_items').delete().eq('po_id', id);
    } else {
      const { data, error } = await supabase.from('purchase_orders').insert([payload]).select().single();
      if (error) { alert(error.message); return; }
      poId = data.id;
    }
    const { error: iErr } = await supabase.from('purchase_order_items').insert(items.map((i: any) => ({ po_id: poId, product_id: i.product_id || null, description: i.description || null,
      quantity: n(i.quantity), unit_cost: n(i.unit_cost), discount: n(i.discount), tax_rate: n(i.tax_rate), total: lineTotal(i) })));
    if (iErr) { alert('Kalemler kaydedilemedi: ' + iErr.message); return; }
    setForm(null); onChanged();
  };

  const print = async (po: any) => {
    const { data: items } = await supabase.from('purchase_order_items').select('*').eq('po_id', po.id);
    printHtml(`Satın alma ${po.po_number}`, `<h1>Satın Alma Siparişi</h1><p><b>${escapeHtml(po.po_number)}</b> · ${escapeHtml(formatDate(po.order_date))}<br/>Tedarikçi: <b>${escapeHtml(sname(po.supplier_id))}</b>${po.expected_date ? ' · İstenen teslim: ' + escapeHtml(formatDate(po.expected_date)) : ''}</p>
      <table><thead><tr><th>Ürün / açıklama</th><th class="r">Miktar</th><th class="r">Birim</th><th class="r">İsk.</th><th class="r">Tutar</th></tr></thead><tbody>
      ${(items || []).map((i: any) => `<tr><td>${escapeHtml(i.description || '')}</td><td class="r">${n(i.quantity)}</td><td class="r">${tl(n(i.unit_cost))}</td><td class="r">%${n(i.discount)}</td><td class="r">${tl(n(i.total))}</td></tr>`).join('')}
      <tr><td colspan="4">Ara toplam</td><td class="r">${tl(n(po.subtotal))}</td></tr><tr><td colspan="4">KDV</td><td class="r">${tl(n(po.tax_total))}</td></tr><tr><td colspan="4"><b>Toplam</b></td><td class="r"><b>${tl(n(po.total))}</b></td></tr></tbody></table>
      ${po.notes ? `<p>${escapeHtml(po.notes)}</p>` : ''}`);
  };

  const list = pos.filter(p => (!filter || p.status === filter) && (!sup || p.supplier_id === sup));
  const unpaid = pos.filter(p => p.status === 'invoiced' && !p.paid_at);
  const overdue = unpaid.filter(p => p.due_date && p.due_date < today);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Satın alma siparişleri</h3>
        <span className="text-xs text-slate-500">Ödenecek: <b>{tl(unpaid.reduce((s, p) => s + n(p.total), 0))}</b>{overdue.length ? <span className="text-red-600"> · {overdue.length} vadesi geçmiş</span> : ''}</span>
        <select value={sup} onChange={e => setSup(e.target.value)} className="h-8 rounded-lg border px-2 text-sm"><option value="">Tüm ana firmalar</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="h-8 rounded-lg border px-2 text-sm"><option value="">Tüm durumlar</option>{Object.entries(PO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <Button size="sm" onClick={() => open()} disabled={!suppliers.length}><Plus className="h-3 w-3" />Satın alma</Button>
      </div>
      {list.length === 0 ? <p className="text-sm text-slate-500">Kayıt yok. Siparişler sayfasındaki "Ana firmaya sipariş" düğmesiyle müşteri siparişinden otomatik de oluşturabilirsiniz.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">No</th><th>Ana firma</th><th>Bağlı müşteri siparişi</th><th>Tarih</th><th className="text-right">KDV hariç</th><th>Durum</th><th>Vade</th><th /></tr></thead>
          <tbody>{list.map(p => {
            const o = ord(p.sales_order_id);
            return (
              <tr key={p.id} className="cursor-pointer border-b hover:bg-slate-50" onClick={() => open(p)}>
                <td className="py-2 font-mono text-xs">{p.po_number}</td><td>{sname(p.supplier_id)}</td>
                <td className="text-xs">{o ? `${o.order_number} · ${customers.find(c => c.id === o.customer_id)?.name || ''}` : '-'}</td>
                <td className="text-xs">{formatDate(p.order_date)}</td><td className="text-right">{tl(n(p.subtotal))}</td>
                <td><Badge variant={PO_STATUS[p.status]?.variant}>{PO_STATUS[p.status]?.label}</Badge>{p.paid_at && <span className="ml-1 text-[10px] text-green-700">ödendi</span>}</td>
                <td className={`text-xs ${p.due_date && p.due_date < today && !p.paid_at ? 'font-semibold text-red-600' : ''}`}>{p.due_date ? formatDate(p.due_date) : '-'}</td>
                <td className="text-right"><button onClick={e => { e.stopPropagation(); print(p); }}><Printer className="h-4 w-4 text-slate-400" /></button></td>
              </tr>
            );
          })}</tbody>
        </table>
      )}

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.po_number ? `Satın alma ${form.po_number}` : 'Yeni satın alma siparişi'} size="xl"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-4">
              <Select label="Ana firma *" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} options={[{ value: '', label: 'Seçin' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} />
              <Select label="Bağlı müşteri siparişi" value={form.sales_order_id} onChange={e => setForm({ ...form, sales_order_id: e.target.value })}
                options={[{ value: '', label: 'Yok (stok için)' }, ...orders.map(o => ({ value: o.id, label: `${o.order_number} · ${customers.find(c => c.id === o.customer_id)?.name || ''}` }))]} />
              <Input label="Sipariş tarihi" type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} />
              <Select label="Durum" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={Object.entries(PO_STATUS).map(([value, v]) => ({ value, label: v.label }))} />
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th>Ürün</th><th>Açıklama</th><th className="w-20">Miktar</th><th className="w-28">Birim maliyet</th><th className="w-16">İsk.%</th><th className="w-16">KDV%</th><th className="w-28 text-right">Tutar</th><th /></tr></thead>
              <tbody>{form.items.map((i: any, k: number) => (
                <tr key={k}>
                  <td className="pr-1"><select value={i.product_id || ''} onChange={e => setItem(k, { product_id: e.target.value })} className="h-8 w-40 rounded border px-1 text-xs">
                    <option value="">—</option>{[...products].sort((a, b) => Number(b.supplier_id === form.supplier_id) - Number(a.supplier_id === form.supplier_id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                  <td className="pr-1"><input value={i.description || ''} onChange={e => setItem(k, { description: e.target.value })} className="h-8 w-full rounded border px-1 text-xs" /></td>
                  <td className="pr-1"><input type="number" value={i.quantity} onChange={e => setItem(k, { quantity: e.target.value })} className="h-8 w-full rounded border px-1 text-right text-xs" /></td>
                  <td className="pr-1"><input type="number" value={i.unit_cost} onChange={e => setItem(k, { unit_cost: e.target.value })} className="h-8 w-full rounded border px-1 text-right text-xs" /></td>
                  <td className="pr-1"><input type="number" value={i.discount} onChange={e => setItem(k, { discount: e.target.value })} className="h-8 w-full rounded border px-1 text-right text-xs" /></td>
                  <td className="pr-1"><input type="number" value={i.tax_rate} onChange={e => setItem(k, { tax_rate: e.target.value })} className="h-8 w-full rounded border px-1 text-right text-xs" /></td>
                  <td className="text-right">{tl(lineTotal(i))}</td>
                  <td><button onClick={() => setForm({ ...form, items: form.items.filter((_: any, x: number) => x !== k) })}><Trash2 className="h-3 w-3 text-red-400" /></button></td>
                </tr>
              ))}</tbody>
            </table>
            <button onClick={() => setForm({ ...form, items: [...form.items, { product_id: '', description: '', quantity: 1, unit_cost: 0, discount: 0, tax_rate: 20 }] })} className="text-xs text-indigo-600">+ Kalem</button>
            <div className="text-right text-sm">KDV hariç <b>{tl(sub)}</b> · KDV {tl(tax)} · Toplam <b>{tl(sub + tax)}</b></div>
            <p className="text-xs font-semibold uppercase text-slate-400">Alış faturası ve ödeme (Paraşüt'teki kayıtla eşleştirmek için)</p>
            <div className="grid gap-3 sm:grid-cols-5">
              <Input label="İstenen teslim" type="date" value={form.expected_date} onChange={e => setForm({ ...form, expected_date: e.target.value })} />
              <Input label="Alış fatura no" value={form.supplier_invoice_no} onChange={e => setForm({ ...form, supplier_invoice_no: e.target.value })} />
              <Input label="Fatura tarihi" type="date" value={form.supplier_invoice_date} onChange={e => setForm({ ...form, supplier_invoice_date: e.target.value })} />
              <Input label="Vade (boşsa otomatik)" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
              <Input label="Ödeme tarihi" type="date" value={form.paid_at} onChange={e => setForm({ ...form, paid_at: e.target.value })} />
            </div>
            <Textarea label="Not" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        )}
      </Modal>
    </Card>
  );
}
