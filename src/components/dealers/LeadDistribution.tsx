'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Input, Select, Textarea, Modal } from '@/components/ui';
import { StatusBadge } from '@/components/portal/common';
import { formatMoney, formatDateTime } from '@/lib/utils';
import { LEAD_STATUS, n } from '@/lib/portal';
import { Send, Clock } from 'lucide-react';

interface Props { supabase: any; dealers: any[] }
const tl = (v: number) => `₺${formatMoney(v)}`;

export default function LeadDistribution({ supabase, dealers }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);
  const [filter, setFilter] = useState('');

  const load = async () => {
    const [a, l] = await Promise.all([
      supabase.from('dealer_lead_assignments').select('*').order('created_at', { ascending: false }),
      supabase.from('leads').select('id, company_name, contact_name, contact_email, contact_phone, estimated_value, notes, status').order('created_at', { ascending: false }).limit(300),
    ]);
    setItems(a.data || []); setLeads((l.data || []).filter((x: any) => !['converted', 'lost'].includes(x.status)));
  };
  useEffect(() => { load(); }, []);
  const dname = (id: string) => dealers.find(d => d.id === id)?.name || '-';

  const pickLead = (id: string) => {
    const l = leads.find(x => x.id === id);
    setForm({ ...form, lead_id: id, company_name: l?.company_name || '', contact_name: l?.contact_name || '', contact_phone: l?.contact_phone || '',
      contact_email: l?.contact_email || '', estimated_value: l?.estimated_value || '', need: l?.notes || '' });
  };

  const save = async () => {
    if (!form.dealer_id || !form.company_name) { alert('Bayi ve firma zorunlu.'); return; }
    const respond_by = new Date(Date.now() + (n(form.sla_hours) || 48) * 36e5).toISOString();
    const { error } = await supabase.from('dealer_lead_assignments').insert([{ dealer_id: form.dealer_id, lead_id: form.lead_id || null, company_name: form.company_name,
      contact_name: form.contact_name || null, contact_phone: form.contact_phone || null, contact_email: form.contact_email || null, city: form.city || null,
      need: form.need || null, estimated_value: form.estimated_value ? n(form.estimated_value) : null, respond_by }]);
    if (error) { alert(error.message); return; }
    setForm(null); load();
  };

  const expire = async (x: any) => {
    if (!confirm('Lead bu bayiden geri alınsın mı? Ardından başka bayiye yönlendirebilirsiniz.')) return;
    await supabase.from('dealer_lead_assignments').update({ status: 'expired', closed_at: new Date().toISOString() }).eq('id', x.id);
    load();
    setForm({ dealer_id: '', lead_id: x.lead_id || '', company_name: x.company_name, contact_name: x.contact_name || '', contact_phone: x.contact_phone || '',
      contact_email: x.contact_email || '', city: x.city || '', need: x.need || '', estimated_value: x.estimated_value || '', sla_hours: 48 });
  };

  // Bayi bazında yanıt performansı
  const perf = dealers.map(d => {
    const mine = items.filter(i => i.dealer_id === d.id);
    const responded = mine.filter(i => i.responded_at);
    const avgH = responded.length ? responded.reduce((s, i) => s + (new Date(i.responded_at).getTime() - new Date(i.created_at).getTime()) / 36e5, 0) / responded.length : null;
    const won = mine.filter(i => i.status === 'won');
    return { d, total: mine.length, avgH, won: won.length, wonValue: won.reduce((s, i) => s + n(i.outcome_value), 0) };
  }).filter(p => p.total > 0);

  const list = items.filter(i => !filter || i.status === filter);
  const now = new Date();

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Lead Dağıtımı</h3>
          <select value={filter} onChange={e => setFilter(e.target.value)} className="h-8 rounded-lg border px-2 text-sm"><option value="">Tüm durumlar</option>{Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <Button size="sm" onClick={() => setForm({ dealer_id: '', lead_id: '', company_name: '', contact_name: '', contact_phone: '', contact_email: '', city: '', need: '', estimated_value: '', sla_hours: 48 })}><Send className="h-3 w-3" />Bayiye lead gönder</Button>
        </div>
        {list.length === 0 ? <p className="text-sm text-slate-500">Web sitesi, fuar veya çağrı merkezinden gelen talepleri bölgedeki bayiye yönlendirin; yanıt süresini ve sonucunu takip edin.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Firma</th><th>Bayi</th><th>Gönderim</th><th>Durum</th><th className="text-right">Sonuç</th><th /></tr></thead>
            <tbody>
              {list.map(x => {
                const late = x.status === 'assigned' && x.respond_by && new Date(x.respond_by) < now;
                return (
                  <tr key={x.id} className="border-b">
                    <td className="py-2 font-medium">{x.company_name}<p className="text-xs font-normal text-slate-400">{[x.contact_name, x.city].filter(Boolean).join(' · ')}</p></td>
                    <td>{dname(x.dealer_id)}</td>
                    <td className="text-xs">{formatDateTime(x.created_at)}{late && <p className="flex items-center gap-0.5 font-medium text-red-600"><Clock className="h-3 w-3" />Yanıt süresi geçti</p>}</td>
                    <td><StatusBadge map={LEAD_STATUS} value={x.status} />{x.dealer_note && <p className="text-xs text-slate-500">{x.dealer_note}</p>}</td>
                    <td className="text-right">{x.outcome_value ? tl(n(x.outcome_value)) : '-'}</td>
                    <td className="text-right">{['assigned', 'rejected'].includes(x.status) && <button onClick={() => expire(x)} className="text-xs text-indigo-600 hover:underline">Başka bayiye ver</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {perf.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Bayi lead performansı</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-1">Bayi</th><th className="text-right">Gönderilen</th><th className="text-right">Ort. yanıt</th><th className="text-right">Kazanılan</th><th className="text-right">Satış</th></tr></thead>
            <tbody>{perf.map(p => (
              <tr key={p.d.id} className="border-b"><td className="py-1">{p.d.name}</td><td className="text-right">{p.total}</td>
                <td className="text-right">{p.avgH === null ? '-' : `${p.avgH.toFixed(1)} sa`}</td><td className="text-right">{p.won} (%{Math.round(p.won / p.total * 100)})</td><td className="text-right">{tl(p.wonValue)}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Bayiye lead gönder" size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save}>Gönder</Button></>}>
        {form && (
          <div className="space-y-3">
            <Select label="Potansiyel müşterilerden seç (isteğe bağlı)" value={form.lead_id} onChange={e => pickLead(e.target.value)} options={[{ value: '', label: 'Elle gir' }, ...leads.map(l => ({ value: l.id, label: l.company_name }))]} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Firma" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
              <Input label="Şehir" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
              <Input label="Yetkili" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
              <Input label="Telefon" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
              <Input label="E-posta" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
              <Input label="Tahmini değer (₺)" type="number" value={form.estimated_value} onChange={e => setForm({ ...form, estimated_value: e.target.value })} />
            </div>
            <Textarea label="İhtiyaç" value={form.need} onChange={e => setForm({ ...form, need: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Bayi" value={form.dealer_id} onChange={e => setForm({ ...form, dealer_id: e.target.value })}
                options={[{ value: '', label: 'Seçin' }, ...[...dealers].sort((a, b) => Number(!!form.city && (b.region || '').toLocaleLowerCase('tr').includes(form.city.toLocaleLowerCase('tr'))) - Number(!!form.city && (a.region || '').toLocaleLowerCase('tr').includes(form.city.toLocaleLowerCase('tr'))))
                  .map(d => ({ value: d.id, label: `${d.name}${d.region ? ` · ${d.region}` : ''}` }))]} />
              <Input label="Yanıt süresi (saat)" type="number" value={form.sla_hours} onChange={e => setForm({ ...form, sla_hours: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
