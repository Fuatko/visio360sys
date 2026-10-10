'use client';

import { useState } from 'react';
import { Card, Button, Badge, Modal, Input, Select, Textarea } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { RECEIVABLE_KINDS, RECEIVABLE_STATUS, n } from '@/lib/suppliers';
import { Plus } from 'lucide-react';

interface Props { supabase: any; receivables: any[]; suppliers: any[]; customers: any[]; opps: any[]; onChanged: () => void }
const tl = (v: number) => `₺${formatMoney(v)}`;

export default function SupplierReceivables({ supabase, receivables, suppliers, customers, opps, onChanged }: Props) {
  const [form, setForm] = useState<any | null>(null);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('open');
  const sname = (id: string) => suppliers.find(s => s.id === id)?.name || '-';
  const cname = (id: string) => customers.find(c => c.id === id)?.name || '';

  const save = async () => {
    if (!form.supplier_id || !form.description || !(n(form.amount) > 0)) { alert('Ana firma, açıklama ve tutar zorunlu.'); return; }
    const { id, created_at, organization_id, ...rest } = form;
    const payload: any = {};
    Object.entries(rest).forEach(([k, v]) => { payload[k] = v === '' ? null : v; });
    payload.amount = n(form.amount);
    if (payload.status === 'paid' && !payload.paid_at) payload.paid_at = new Date().toISOString().slice(0, 10);
    const { error } = id ? await supabase.from('supplier_receivables').update(payload).eq('id', id) : await supabase.from('supplier_receivables').insert([payload]);
    if (error) { alert(error.message); return; }
    setForm(null); onChanged();
  };

  const list = receivables.filter(r => (!kind || r.kind === kind) && (status === 'open' ? ['expected', 'invoiced'].includes(r.status) : !status || r.status === status))
    .sort((a, b) => b.income_date.localeCompare(a.income_date));
  const sum = (st: string[]) => receivables.filter(r => st.includes(r.status)).reduce((s, r) => s + n(r.amount), 0);
  const y = String(new Date().getFullYear());

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><p className="text-xl font-bold text-amber-600">{tl(sum(['expected']))}</p><p className="text-xs text-slate-500">Beklenen (henüz faturalanmadı)</p></Card>
        <Card className="p-4"><p className="text-xl font-bold text-blue-600">{tl(sum(['invoiced']))}</p><p className="text-xs text-slate-500">Faturalandı, tahsil bekliyor</p></Card>
        <Card className="p-4"><p className="text-xl font-bold text-green-700">{tl(receivables.filter(r => r.status === 'paid' && (r.paid_at || '').startsWith(y)).reduce((s, r) => s + n(r.amount), 0))}</p><p className="text-xs text-slate-500">Bu yıl tahsil edilen</p></Card>
        <Card className="p-4"><p className="text-xl font-bold text-red-600">{tl(sum(['rejected']))}</p><p className="text-xs text-slate-500">Reddedilen talepler</p></Card>
      </div>
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Ana firmalardan alacaklarımız</h3>
          <select value={kind} onChange={e => setKind(e.target.value)} className="h-8 rounded-lg border px-2 text-sm"><option value="">Tüm türler</option>{Object.entries(RECEIVABLE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="h-8 rounded-lg border px-2 text-sm"><option value="open">Açık olanlar</option><option value="">Tümü</option>{Object.entries(RECEIVABLE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <Button size="sm" onClick={() => setForm({ supplier_id: '', kind: 'commission', description: '', reference: '', amount: '', income_date: new Date().toISOString().slice(0, 10), status: 'expected', invoice_no: '', paid_at: '', opportunity_id: '', customer_id: '', notes: '' })} disabled={!suppliers.length}><Plus className="h-3 w-3" />Alacak ekle</Button>
        </div>
        {list.length === 0 ? <p className="text-sm text-slate-500">Kayıt yok. Aracılık modelinde kazanılan fırsatlar için komisyon alacağı otomatik önerilir.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Açıklama</th><th>Ana firma</th><th>Tür</th><th>Tarih</th><th className="text-right">Tutar (KDV hariç)</th><th>Durum</th></tr></thead>
            <tbody>{list.map(r => (
              <tr key={r.id} className="cursor-pointer border-b hover:bg-slate-50" onClick={() => setForm({ ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? ''])) })}>
                <td className="py-2"><p className="font-medium">{r.description}</p><p className="text-xs text-slate-400">{[r.reference, cname(r.customer_id), r.invoice_no && `Fatura ${r.invoice_no}`].filter(Boolean).join(' · ')}</p></td>
                <td>{sname(r.supplier_id)}</td><td className="text-xs">{RECEIVABLE_KINDS[r.kind]}</td><td className="text-xs">{formatDate(r.income_date)}</td>
                <td className="text-right font-medium">{tl(n(r.amount))}</td><td><Badge variant={RECEIVABLE_STATUS[r.status]?.variant}>{RECEIVABLE_STATUS[r.status]?.label}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Ana firmadan alacak" size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="Ana firma *" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} options={[{ value: '', label: 'Seçin' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} />
              <Select label="Tür" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} options={Object.entries(RECEIVABLE_KINDS).map(([value, label]) => ({ value, label }))} />
              <Select label="Durum" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={Object.entries(RECEIVABLE_STATUS).map(([value, v]) => ({ value, label: v.label }))} />
            </div>
            <Input label="Açıklama *" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="ör. 2026 Q3 ciro primi, X projesi komisyonu, garanti talebi #123" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Tutar (₺, KDV hariç) *" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              <Input label="Gelir tarihi" type="date" value={form.income_date} onChange={e => setForm({ ...form, income_date: e.target.value })} />
              <Input label="Referans / talep no" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
              <Select label="Müşteri" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} options={[{ value: '', label: '-' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
              <Select label="Fırsat" value={form.opportunity_id} onChange={e => setForm({ ...form, opportunity_id: e.target.value })} options={[{ value: '', label: '-' }, ...opps.filter(o => !form.supplier_id || o.supplier_id === form.supplier_id).map(o => ({ value: o.id, label: o.title }))]} />
              <Input label="Kestiğimiz fatura no (Paraşüt)" value={form.invoice_no} onChange={e => setForm({ ...form, invoice_no: e.target.value })} />
            </div>
            {form.status === 'paid' && <Input label="Tahsil tarihi" type="date" value={form.paid_at} onChange={e => setForm({ ...form, paid_at: e.target.value })} />}
            <Textarea label="Not" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
