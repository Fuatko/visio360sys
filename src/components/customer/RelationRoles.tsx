'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { Network } from 'lucide-react';

export const ROLES: { key: string; label: string; hint: string }[] = [
  { key: 'customer', label: 'Müşteri', hint: 'Ona satış yapıyoruz' },
  { key: 'partner', label: 'İş ortağı', hint: 'Birlikte iş yapıyoruz, hakediş / komisyon kesiyoruz' },
  { key: 'principal', label: 'Ana firma', hint: 'Bayisiyiz, ürün/hizmetini satıyoruz' },
  { key: 'supplier', label: 'Tedarikçi', hint: 'Ondan mal / hizmet alıyoruz' },
];

/** Bir firmanın bizimle olan (birden fazla olabilen) ilişki rolleri ve Ana Firmalarım kaydına bağlantı */
export default function RelationRoles({ supabase, customer, docs, onChanged }: { supabase: any; customer: any; docs: any[]; onChanged: () => void }) {
  const ready = Array.isArray(customer.relation_roles);
  const [roles, setRoles] = useState<string[]>(customer.relation_roles || []);
  const [suppliers, setSuppliers] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRoles(customer.relation_roles || []); }, [customer.relation_roles]);
  useEffect(() => { supabase.from('suppliers').select('id, name, tax_no').order('name').then(({ data, error }: any) => setSuppliers(error ? null : data || [])); }, [supabase]);

  if (!ready) return (
    <Card className="p-4"><p className="flex items-center gap-1 text-sm font-semibold"><Network className="h-4 w-4 text-indigo-600" />İlişki rolleri</p>
      <p className="mt-1 text-xs text-amber-700">Bir firmayı aynı anda müşteri, iş ortağı ve ana firma olarak işaretlemek için <b>parasut-matris.sql</b> dosyasını Supabase'de çalıştırın.</p></Card>);

  const hasSales = docs.some(d => d.kind === 'sales_invoice'), hasBuy = docs.some(d => d.kind === 'purchase_bill');
  const suggest = [...(hasSales && !roles.includes('customer') && !roles.includes('partner') ? ['customer'] : []), ...(hasBuy && !roles.includes('principal') && !roles.includes('supplier') ? ['supplier'] : [])];

  const save = async (next: string[]) => {
    setRoles(next); setBusy(true);
    const { error } = await supabase.from('customers').update({ relation_roles: next }).eq('id', customer.id);
    setBusy(false); if (error) alert(error.message); else onChanged();
  };
  const toggle = (k: string) => save(roles.includes(k) ? roles.filter(r => r !== k) : [...roles, k]);
  const linkSupplier = async (sid: string) => {
    setBusy(true);
    let id = sid;
    if (sid === '__new') {
      const { data, error } = await supabase.from('suppliers').insert([{ name: customer.name, tax_no: customer.tax_number || null, model: roles.includes('partner') ? 'mixed' : 'reseller', is_active: true }]).select('id').single();
      if (error) { setBusy(false); alert(error.message); return; }
      id = data.id;
    }
    const { error } = await supabase.from('customers').update({ supplier_id: id || null }).eq('id', customer.id);
    setBusy(false); if (error) alert(error.message); else onChanged();
  };
  const linked = suppliers?.find(x => x.id === customer.supplier_id);
  const guess = suppliers?.find(x => (customer.tax_number && x.tax_no === customer.tax_number) || x.name?.toLocaleLowerCase('tr').includes(String(customer.name || '').toLocaleLowerCase('tr').split(' ')[0]));

  return (
    <Card className="p-4">
      <p className="flex items-center gap-1 text-sm font-semibold"><Network className="h-4 w-4 text-indigo-600" />İlişki rolleri</p>
      <p className="mt-0.5 text-[11px] text-slate-500">Bu firma bizim için ne? Birden fazla seçilebilir.</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{ROLES.map(r => (
        <button key={r.key} title={r.hint} disabled={busy} onClick={() => toggle(r.key)}
          className={`rounded-full border px-2.5 py-1 text-xs ${roles.includes(r.key) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>{r.label}</button>))}</div>
      {suggest.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">Paraşüt'e göre öneri: {suggest.map(k => ROLES.find(r => r.key === k)!.label).join(', ')} <button className="text-indigo-600 hover:underline" onClick={() => save([...roles, ...suggest])}>ekle</button>
          <span className="block text-slate-400">Danışmanlık hakedişi kestiğiniz bir ortaksa "İş ortağı", bayisi olduğunuz firmaysa "Ana firma" seçin.</span></p>)}
      {roles.includes('principal') && suppliers && (
        <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs">
          {linked ? <p>Ana firma kaydı: <Link href="/suppliers" className="font-medium text-indigo-700 hover:underline">{linked.name}</Link> <button className="ml-1 text-slate-400 hover:text-red-600" onClick={() => linkSupplier('')}>kaldır</button></p> : (<>
            <p className="mb-1 text-slate-600">Ana Firmalarım'daki kayda bağlayın (bayilik seviyesi, iskonto, hedefler oradan gelir):</p>
            <select className="h-8 w-full rounded border bg-white px-2" defaultValue="" disabled={busy} onChange={e => e.target.value && linkSupplier(e.target.value)}>
              <option value="">Seçin…</option>
              {guess && <option value={guess.id}>★ {guess.name} (önerilen)</option>}
              {suppliers.filter(x => x.id !== guess?.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              <option value="__new">+ "{customer.name}" için yeni ana firma kaydı aç</option>
            </select></>)}
        </div>)}
      {roles.includes('principal') && <Link href="/business-lines" className="mt-2 block text-xs text-indigo-600">Bayi işleri ve iş kolu kârlılığı →</Link>}
    </Card>
  );
}
