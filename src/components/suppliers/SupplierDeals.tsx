'use client';

import { useState } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { SALES_MODELS, REG_STATUS, n } from '@/lib/suppliers';
import { AlertTriangle, HandCoins } from 'lucide-react';

interface Props { supabase: any; opps: any[]; suppliers: any[]; customers: any[]; receivables: any[]; onChanged: () => void }
const tl = (v: number) => `₺${formatMoney(Math.round(v))}`;

export default function SupplierDeals({ supabase, opps, suppliers, customers, receivables, onChanged }: Props) {
  const [sup, setSup] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const sname = (id: string) => suppliers.find(s => s.id === id)?.name || '-';
  const cname = (id: string) => customers.find(c => c.id === id)?.name || '-';

  const update = async (o: any, patch: any) => {
    const s = suppliers.find(x => x.id === o.supplier_id);
    if (patch.supplier_reg_status === 'approved' && !o.supplier_reg_until && s?.deal_reg_protection_days) {
      const d = new Date(); d.setDate(d.getDate() + n(s.deal_reg_protection_days)); patch.supplier_reg_until = d.toISOString().slice(0, 10);
    }
    const { error } = await supabase.from('opportunities').update(patch).eq('id', o.id);
    if (error) alert(error.message); else onChanged();
  };
  const createCommission = async (o: any) => {
    const s = suppliers.find(x => x.id === o.supplier_id);
    const amount = n(o.expected_commission) || n(o.value) * n(s?.commission_rate) / 100;
    const { error } = await supabase.from('supplier_receivables').insert([{ supplier_id: o.supplier_id, kind: 'commission', opportunity_id: o.id, customer_id: o.customer_id,
      description: `Komisyon: ${o.title}`, reference: o.supplier_reg_no || null, amount: Math.round(amount * 100) / 100,
      income_date: (o.closed_at || today).slice(0, 10), status: 'expected' }]);
    if (error) alert(error.message); else { alert(`${tl(amount)} komisyon alacağı oluşturuldu (Alacaklar sekmesi).`); onChanged(); }
  };

  const list = opps.filter(o => o.supplier_id && (!sup || o.supplier_id === sup)).sort((a, b) => (a.supplier_reg_until || '9').localeCompare(b.supplier_reg_until || '9'));
  const isOpen = (o: any) => !['Kazanıldı', 'Kaybedildi'].includes(o.stage);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Ana firma ürünlü fırsatlar ve fırsat kayıtları</h3>
        <select value={sup} onChange={e => setSup(e.target.value)} className="h-8 rounded-lg border px-2 text-sm"><option value="">Tüm ana firmalar</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>
      {list.length === 0 ? <p className="text-sm text-slate-500">Fırsatlar sayfasında "Satış modeli" ve "Ana firma" seçilen fırsatlar burada izlenir.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Fırsat</th><th>Ana firma / model</th><th className="text-right">Değer</th><th>Kayıt no</th><th>Kayıt durumu</th><th>Koruma bitişi</th><th /></tr></thead>
            <tbody>{list.map(o => {
              const s = suppliers.find(x => x.id === o.supplier_id);
              const missing = isOpen(o) && s?.deal_reg_required && o.supplier_reg_status !== 'approved';
              const expiring = isOpen(o) && o.supplier_reg_until && o.supplier_reg_until <= in14;
              const hasRec = receivables.some(r => r.opportunity_id === o.id && r.kind === 'commission');
              return (
                <tr key={o.id} className="border-b align-top">
                  <td className="py-2"><p className="font-medium">{o.title}</p><p className="text-xs text-slate-400">{cname(o.customer_id)} · {o.stage}</p>
                    {missing && <p className="flex items-center gap-1 text-[11px] font-medium text-red-600"><AlertTriangle className="h-3 w-3" />Ana firmaya kayıt zorunlu</p>}</td>
                  <td className="py-2 text-xs">{sname(o.supplier_id)}<p className="text-slate-400">{SALES_MODELS[o.sales_model] || ''}</p></td>
                  <td className="py-2 text-right">{tl(n(o.value))}{o.sales_model === 'agent' && <p className="text-[11px] text-green-700">komisyon ≈ {tl(n(o.expected_commission) || n(o.value) * n(s?.commission_rate) / 100)}</p>}</td>
                  <td className="py-2"><input defaultValue={o.supplier_reg_no || ''} onBlur={e => e.target.value !== (o.supplier_reg_no || '') && update(o, { supplier_reg_no: e.target.value || null })} className="h-8 w-28 rounded border px-1 text-xs" placeholder="—" /></td>
                  <td className="py-2"><select value={o.supplier_reg_status || ''} onChange={e => update(o, { supplier_reg_status: e.target.value || null })} className="h-8 rounded border px-1 text-xs">
                    <option value="">Kaydedilmedi</option>{Object.entries(REG_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></td>
                  <td className="py-2"><input type="date" value={o.supplier_reg_until || ''} onChange={e => update(o, { supplier_reg_until: e.target.value || null })} className={`h-8 rounded border px-1 text-xs ${expiring ? 'border-amber-400 bg-amber-50' : ''}`} />
                    {expiring && <p className="text-[10px] text-amber-700">{o.supplier_reg_until < today ? 'Süresi doldu' : 'Yakında bitiyor — uzatma isteyin'}</p>}</td>
                  <td className="py-2 text-right">{o.sales_model === 'agent' && o.stage === 'Kazanıldı' && !hasRec && <Button size="sm" variant="secondary" onClick={() => createCommission(o)}><HandCoins className="h-3 w-3" />Komisyon alacağı</Button>}
                    {hasRec && <Badge variant="success">Alacak kayıtlı</Badge>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
