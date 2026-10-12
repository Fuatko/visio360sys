'use client';

import { useState } from 'react';
import { Card, Button, Modal, Input, Select, Textarea } from '@/components/ui';
import { CitySelect } from '@/components/TrSelects';
import { ADDRESS_TYPES, TEAM_ROLES } from '@/lib/crm';
import { Plus, Pencil, Trash2, MapPin, Star, Users, Boxes } from 'lucide-react';

const clean = (o: any) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v ?? '']));
const payloadOf = (f: any, customerId: string) => {
  const { id, created_at, organization_id, ...rest } = f; const p: any = { customer_id: customerId };
  Object.entries(rest).forEach(([k, v]) => { p[k] = v === '' ? null : v; }); return { id, p };
};

// ------------------------------ Adresler ------------------------------
export function Addresses({ supabase, customerId, rows, onChanged }: { supabase: any; customerId: string; rows: any[]; onChanged: () => void }) {
  const [f, setF] = useState<any | null>(null);
  const save = async () => {
    if (!f.address?.trim()) { alert('Adres girin.'); return; }
    const { id, p } = payloadOf(f, customerId);
    if (p.is_default) await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', customerId).eq('address_type', p.address_type);
    const { error } = id ? await supabase.from('customer_addresses').update(p).eq('id', id) : await supabase.from('customer_addresses').insert([p]);
    if (error) { alert(error.message); return; } setF(null); onChanged();
  };
  const del = async (id: string) => { if (!confirm('Adres silinsin mi?')) return; await supabase.from('customer_addresses').delete().eq('id', id); onChanged(); };
  const missingBilling = !rows.some(r => r.address_type === 'billing' || r.address_type === 'hq');
  return (
    <div className="space-y-3">
      <div className="flex items-center"><p className="mr-auto text-sm text-slate-600">Fatura, sevk ve şube adresleri ayrı tutulur; teklif ve siparişte doğru adres seçilir.</p>
        <Button size="sm" onClick={() => setF({ address_type: missingBilling ? 'billing' : 'shipping', label: '', address: '', district: '', city: '', country: 'Türkiye', postal_code: '', contact_name: '', contact_phone: '', is_default: true })}><Plus className="h-3 w-3" />Adres ekle</Button></div>
      {rows.length === 0 ? <Card className="p-6 text-sm text-slate-500">Adres yok.</Card> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map(r => (
          <Card key={r.id} className="p-3 text-sm">
            <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-indigo-500" />
              <div className="flex-1"><p className="font-medium">{ADDRESS_TYPES[r.address_type]}{r.label ? ` · ${r.label}` : ''}{r.is_default && <Star className="ml-1 inline h-3 w-3 fill-amber-400 text-amber-400" />}</p>
                <p className="text-slate-600">{r.address}</p><p className="text-xs text-slate-500">{[r.district, r.city, r.postal_code, r.country !== 'Türkiye' ? r.country : ''].filter(Boolean).join(' / ')}</p>
                {r.contact_name && <p className="text-xs text-slate-500">Teslim alan: {r.contact_name} {r.contact_phone}</p>}</div>
              <button onClick={() => setF(clean(r))}><Pencil className="h-4 w-4 text-slate-400" /></button><button onClick={() => del(r.id)}><Trash2 className="h-4 w-4 text-red-400" /></button></div>
          </Card>))}</div>)}
      <Modal isOpen={!!f} onClose={() => setF(null)} title="Adres" size="lg" footer={<><Button variant="secondary" onClick={() => setF(null)}>İptal</Button><Button onClick={save}>Kaydet</Button></>}>
        {f && <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Adres tipi" value={f.address_type} onChange={e => setF({ ...f, address_type: e.target.value })} options={Object.entries(ADDRESS_TYPES).map(([k, l]) => ({ value: k, label: l }))} />
          <Input label="Etiket" value={f.label} placeholder="Gebze fabrika" onChange={e => setF({ ...f, label: e.target.value })} />
          <div className="sm:col-span-2"><Textarea label="Adres *" rows={2} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></div>
          <CitySelect label="İl" value={f.city} onChange={v => setF({ ...f, city: v })} />
          <Input label="İlçe" value={f.district} onChange={e => setF({ ...f, district: e.target.value })} />
          <Input label="Posta kodu" value={f.postal_code} onChange={e => setF({ ...f, postal_code: e.target.value })} />
          <Input label="Ülke" value={f.country} onChange={e => setF({ ...f, country: e.target.value })} />
          <Input label="Teslim alacak kişi" value={f.contact_name} onChange={e => setF({ ...f, contact_name: e.target.value })} />
          <Input label="Telefonu" value={f.contact_phone} onChange={e => setF({ ...f, contact_phone: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.is_default} onChange={e => setF({ ...f, is_default: e.target.checked })} />Bu tipte varsayılan</label>
        </div>}
      </Modal>
    </div>
  );
}

// ------------------------------ Hesap ekibi ------------------------------
export function AccountTeam({ supabase, customerId, rows, team, ownerId, onChanged }: { supabase: any; customerId: string; rows: any[]; team: any[]; ownerId?: string | null; onChanged: () => void }) {
  const [f, setF] = useState<any | null>(null);
  const pname = (id: string) => team.find(t => t.id === id)?.name || '-';
  const save = async () => {
    if (!f.sales_person_id || !f.role) { alert('Kişi ve rol seçin.'); return; }
    const { error } = await supabase.from('account_team').insert([{ customer_id: customerId, sales_person_id: f.sales_person_id, role: f.role }]);
    if (error) { alert(error.message.includes('duplicate') ? 'Bu kişi bu rolde zaten ekipte.' : error.message); return; } setF(null); onChanged();
  };
  const del = async (id: string) => { await supabase.from('account_team').delete().eq('id', id); onChanged(); };
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center"><p className="mr-auto flex items-center gap-1 text-sm font-semibold"><Users className="h-4 w-4 text-indigo-600" />Hesap ekibi</p>
        <Button size="sm" variant="secondary" onClick={() => setF({ sales_person_id: '', role: TEAM_ROLES[0] })}><Plus className="h-3 w-3" />Ekle</Button></div>
      <p className="mb-2 text-xs text-slate-500">Müşteriye kim hangi konuda bakıyor: satış, teknik destek, tahsilat, yönetici sponsor.</p>
      <div className="space-y-1 text-sm">
        {ownerId && <div className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1"><span className="flex-1 font-medium">{pname(ownerId)}</span><span className="text-xs text-slate-500">Sorumlu (kart sahibi)</span></div>}
        {rows.map(r => <div key={r.id} className="flex items-center gap-2 px-2 py-1"><span className="flex-1">{pname(r.sales_person_id)}</span><span className="text-xs text-slate-500">{r.role}</span><button onClick={() => del(r.id)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></button></div>)}
        {!ownerId && rows.length === 0 && <p className="text-xs text-slate-400">Ekip tanımlı değil.</p>}
      </div>
      {f && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Select value={f.sales_person_id} onChange={e => setF({ ...f, sales_person_id: e.target.value })} options={[{ value: '', label: 'Kişi seçin' }, ...team.map(t => ({ value: t.id, label: t.name }))]} />
        <Select value={f.role} onChange={e => setF({ ...f, role: e.target.value })} options={TEAM_ROLES.map(r => ({ value: r, label: r }))} />
        <Button size="sm" onClick={save}>Ekle</Button></div>}
    </Card>
  );
}

// ------------------------------ Kurulu baz ------------------------------
export function InstalledBase({ supabase, customerId, rows, onChanged }: { supabase: any; customerId: string; rows: any[]; onChanged: () => void }) {
  const [f, setF] = useState<any | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 180 * 864e5).toISOString().slice(0, 10);
  const save = async () => {
    if (!f.product_name?.trim()) { alert('Ürün / sistem adını girin.'); return; }
    const { id, p } = payloadOf(f, customerId);
    ['quantity', 'install_year'].forEach(k => { if (p[k] !== null) p[k] = Number(p[k]); });
    const { error } = id ? await supabase.from('installed_base').update(p).eq('id', id) : await supabase.from('installed_base').insert([p]);
    if (error) { alert(error.message); return; } setF(null); onChanged();
  };
  const del = async (id: string) => { if (!confirm('Silinsin mi?')) return; await supabase.from('installed_base').delete().eq('id', id); onChanged(); };
  return (
    <div className="space-y-3">
      <div className="flex items-center"><p className="mr-auto text-sm text-slate-600">Müşteride kurulu olan bizim ve rakip ürünler. Sözleşme / garanti bitişi yaklaşanlar değişim ve yenileme fırsatıdır.</p>
        <Button size="sm" onClick={() => setF({ product_name: '', brand: '', is_ours: false, quantity: '', install_year: '', contract_end: '', notes: '' })}><Plus className="h-3 w-3" />Ekle</Button></div>
      {rows.length === 0 ? <Card className="p-6 text-sm text-slate-500">Kayıt yok. Örnek: "Rakip X marka PLC, 12 adet, 2017 kurulum, bakım sözleşmesi 2027'de bitiyor".</Card> : (
        <Card className="p-0"><table className="w-full text-sm">
          <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Ürün / sistem</th><th>Marka</th><th className="text-right">Adet</th><th className="text-right">Kurulum</th><th className="pl-4">Sözleşme bitişi</th><th /></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id} className="border-b">
              <td className="px-3 py-2"><p className="font-medium"><Boxes className="mr-1 inline h-3.5 w-3.5 text-slate-400" />{r.product_name}</p>{r.notes && <p className="text-xs text-slate-500">{r.notes}</p>}</td>
              <td>{r.brand || '-'} {r.is_ours ? <span className="rounded bg-indigo-100 px-1 text-[10px] text-indigo-700">bizim</span> : <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-600">rakip</span>}</td>
              <td className="text-right">{r.quantity ?? '-'}</td><td className="text-right">{r.install_year ?? '-'}</td>
              <td className={`pl-4 text-xs ${r.contract_end && r.contract_end < today ? 'text-red-600' : r.contract_end && r.contract_end < soon ? 'font-semibold text-amber-700' : ''}`}>{r.contract_end ? new Date(r.contract_end).toLocaleDateString('tr-TR') : '-'}{r.contract_end && r.contract_end >= today && r.contract_end < soon ? ' · fırsat' : ''}</td>
              <td className="whitespace-nowrap pr-3 text-right"><button onClick={() => setF(clean(r))}><Pencil className="h-4 w-4 text-slate-400" /></button> <button onClick={() => del(r.id)}><Trash2 className="h-4 w-4 text-red-400" /></button></td>
            </tr>))}</tbody></table></Card>)}
      <Modal isOpen={!!f} onClose={() => setF(null)} title="Kurulu ürün / sistem" footer={<><Button variant="secondary" onClick={() => setF(null)}>İptal</Button><Button onClick={save}>Kaydet</Button></>}>
        {f && <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Input label="Ürün / sistem *" value={f.product_name} onChange={e => setF({ ...f, product_name: e.target.value })} /></div>
          <Input label="Marka" value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })} />
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!f.is_ours} onChange={e => setF({ ...f, is_ours: e.target.checked })} />Bizim ürünümüz</label>
          <Input label="Adet" type="number" value={f.quantity} onChange={e => setF({ ...f, quantity: e.target.value })} />
          <Input label="Kurulum yılı" type="number" value={f.install_year} onChange={e => setF({ ...f, install_year: e.target.value })} />
          <Input label="Bakım / lisans / garanti bitişi" type="date" value={f.contract_end} onChange={e => setF({ ...f, contract_end: e.target.value })} />
          <div className="sm:col-span-2"><Textarea label="Not" rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
        </div>}
      </Modal>
    </div>
  );
}
