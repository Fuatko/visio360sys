'use client';

import { useState } from 'react';
import { Card, Button, Modal, Input, Select, Textarea } from '@/components/ui';
import { BUYING_ROLES, INFLUENCE, ATTITUDE, CHANNELS } from '@/lib/crm';
import { Plus, Phone, Mail, Star, UserX, Pencil, AlertTriangle, Network } from 'lucide-react';

const EMPTY = { full_name: '', title: '', department: '', email: '', phone: '', mobile: '', buying_role: '', influence: '', attitude: '', reports_to: '', preferred_channel: '', is_primary: false, is_active: true, notes: '' };

export default function Contacts({ supabase, customerId, contacts, consents, onChanged }: { supabase: any; customerId: string; contacts: any[]; consents: any[]; onChanged: () => void }) {
  const [form, setForm] = useState<any | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const active = contacts.filter(c => c.is_active !== false);
  const byId = (id?: string) => contacts.find(c => c.id === id);

  const save = async () => {
    if (!form.full_name.trim()) { alert('Ad soyad girin.'); return; }
    const { id, created_at, organization_id, ...rest } = form;
    const payload: any = { customer_id: customerId };
    Object.entries(rest).forEach(([k, v]) => { payload[k] = v === '' ? null : v; });
    if (payload.reports_to === id) payload.reports_to = null;
    if (payload.is_primary) await supabase.from('customer_contacts').update({ is_primary: false }).eq('customer_id', customerId).neq('id', id || '00000000-0000-0000-0000-000000000000');
    const { error } = id ? await supabase.from('customer_contacts').update(payload).eq('id', id) : await supabase.from('customer_contacts').insert([payload]);
    if (error) { alert(error.message); return; }
    setForm(null); onChanged();
  };
  const consentOf = (c: any) => consents.filter(x => [c.email, c.phone, c.mobile].filter(Boolean).map((v: string) => v.toLowerCase().replace(/\s/g, '')).includes(String(x.recipient).toLowerCase().replace(/\s/g, '')));

  // Satın alma merkezi analizi
  const hasDM = active.some(c => c.buying_role === 'decision_maker');
  const hasChampion = active.some(c => c.buying_role === 'champion');
  const blockers = active.filter(c => c.buying_role === 'blocker' || c.attitude === 'opponent');
  const warnings = [!hasDM && 'Karar verici tanımlı değil', !hasChampion && 'İçeride destekçi (şampiyon) yok', blockers.length > 0 && `${blockers.length} karşı / engelleyici kişi var`,
    active.length === 1 && 'Tek kişiye bağımlısınız: o kişi ayrılırsa ilişki kopar'].filter(Boolean) as string[];

  const Person = ({ c }: { c: any }) => (
    <div className={`rounded-lg border bg-white p-3 text-sm ${c.is_active === false ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{c.is_primary && <Star className="mr-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" />}{c.full_name}{c.is_active === false && <span className="ml-1 text-xs text-slate-500">(ayrıldı)</span>}</p>
          <p className="text-xs text-slate-500">{[c.title, c.department].filter(Boolean).join(' · ')}</p>
        </div>
        <button onClick={() => setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])) })}><Pencil className="h-4 w-4 text-slate-400" /></button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {c.buying_role && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${BUYING_ROLES[c.buying_role]?.cls}`}>{BUYING_ROLES[c.buying_role]?.label}</span>}
        {c.influence && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">Etki: {INFLUENCE[c.influence]}</span>}
        {c.attitude && <span className={`text-[10px] font-medium ${ATTITUDE[c.attitude]?.cls}`}>● {ATTITUDE[c.attitude]?.label}</span>}
      </div>
      <div className="mt-2 space-y-0.5 text-xs">
        {(c.mobile || c.phone) && <a href={`tel:${c.mobile || c.phone}`} className="flex items-center gap-1 text-indigo-600"><Phone className="h-3 w-3" />{c.mobile || c.phone}</a>}
        {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-indigo-600"><Mail className="h-3 w-3" />{c.email}</a>}
        {byId(c.reports_to) && <p className="text-slate-500">Bağlı olduğu: {byId(c.reports_to)!.full_name}</p>}
        {consentOf(c).length > 0 && <p className="text-slate-500">İzin: {consentOf(c).map((x: any) => `${x.channel === 'EPOSTA' ? 'E-posta' : x.channel === 'MESAJ' ? 'SMS' : 'Arama'} ${x.status === 'ONAY' ? '✓' : '✗'}`).join(' · ')}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {warnings.length > 0 && active.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-4 w-4" />Satın alma merkezi analizi</p>
          <ul className="ml-5 list-disc text-xs">{warnings.map(w => <li key={w}>{w}</li>)}</ul>
        </Card>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-white p-0.5 text-sm">
          <button onClick={() => setView('list')} className={`rounded-md px-3 py-1 ${view === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>Kişiler ({active.length})</button>
          <button onClick={() => setView('map')} className={`flex items-center gap-1 rounded-md px-3 py-1 ${view === 'map' ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}><Network className="h-3.5 w-3.5" />Karar haritası</button>
        </div>
        <Button size="sm" className="ml-auto" onClick={() => setForm({ ...EMPTY, is_primary: contacts.length === 0 })}><Plus className="h-3 w-3" />Kişi ekle</Button>
      </div>

      {contacts.length === 0 ? <Card className="p-6 text-sm text-slate-500">Henüz kişi yok. Kurumsal satışta karar tek kişiyle verilmez: satın almacı, teknik sorumlu ve karar vericiyi ayrı ayrı ekleyin.</Card>
        : view === 'list' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[...contacts].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || Number(b.is_active !== false) - Number(a.is_active !== false)).map(c => <Person key={c.id} c={c} />)}</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(BUYING_ROLES).map(([k, r]) => {
              const people = active.filter(c => c.buying_role === k);
              return (
                <Card key={k} className={`p-3 ${people.length === 0 && ['decision_maker', 'champion'].includes(k) ? 'border-dashed border-amber-300' : ''}`}>
                  <p className="text-xs font-semibold">{r.label} <span className="font-normal text-slate-400">· {r.hint}</span></p>
                  <div className="mt-2 space-y-2">{people.length ? people.map(c => <Person key={c.id} c={c} />) : <p className="text-xs text-slate-400">Kimse yok</p>}</div>
                </Card>
              );
            })}
            {active.filter(c => !c.buying_role).length > 0 && <Card className="p-3"><p className="text-xs font-semibold">Rolü belirsiz</p><div className="mt-2 space-y-2">{active.filter(c => !c.buying_role).map(c => <Person key={c.id} c={c} />)}</div></Card>}
          </div>
        )}

      <Modal isOpen={!!form} onClose={() => setForm(null)} size="lg" title={form?.id ? form.full_name : 'Yeni kişi'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Ad soyad *" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
              <Input label="Unvan" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              <Input label="Departman" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
              <Input label="E-posta" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <Input label="Cep telefonu" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} />
              <Input label="Sabit telefon / dahili" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <p className="pt-1 text-xs font-semibold text-slate-600">Satın alma sürecindeki yeri</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="Rol" value={form.buying_role} onChange={e => setForm({ ...form, buying_role: e.target.value })} options={[{ value: '', label: '-' }, ...Object.entries(BUYING_ROLES).map(([k, r]) => ({ value: k, label: r.label }))]} />
              <Select label="Karara etkisi" value={form.influence} onChange={e => setForm({ ...form, influence: e.target.value })} options={[{ value: '', label: '-' }, ...Object.entries(INFLUENCE).map(([k, l]) => ({ value: k, label: l }))]} />
              <Select label="Bize bakışı" value={form.attitude} onChange={e => setForm({ ...form, attitude: e.target.value })} options={[{ value: '', label: '-' }, ...Object.entries(ATTITUDE).map(([k, a]) => ({ value: k, label: a.label }))]} />
              <Select label="Bağlı olduğu kişi" value={form.reports_to} onChange={e => setForm({ ...form, reports_to: e.target.value })} options={[{ value: '', label: '-' }, ...contacts.filter(c => c.id !== form.id).map(c => ({ value: c.id, label: c.full_name }))]} />
              <Select label="Tercih ettiği kanal" value={form.preferred_channel} onChange={e => setForm({ ...form, preferred_channel: e.target.value })} options={[{ value: '', label: '-' }, ...CHANNELS.map(c => ({ value: c, label: c }))]} />
            </div>
            <Textarea label="Not" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Teknik detay sever, kararlarını veriyle verir…" />
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.is_primary} onChange={e => setForm({ ...form, is_primary: e.target.checked })} />Ana irtibat kişisi</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active === false} onChange={e => setForm({ ...form, is_active: !e.target.checked })} /><UserX className="h-4 w-4 text-slate-400" />Firmadan ayrıldı</label>
            </div>
            <p className="text-[11px] text-slate-500">Ticari ileti (e-posta/SMS) izinleri "İletişim İzinleri" modülünden yönetilir; kişinin e-posta/telefonu ile eşleşen izinler kartta görünür.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

