'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Badge, Modal, Input, Select, Textarea } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { COMPLAINT_STATUS, SEVERITY, COMPLAINT_CATEGORIES, COMPLAINT_CHANNELS } from '@/lib/customer-health';
import { printHtml, escapeHtml } from '@/lib/print';
import { Plus, Printer } from 'lucide-react';

interface Props { supabase: any; complaints: any[]; customers: any[]; team: any[]; prefill: any | null; clearPrefill: () => void; onChanged: () => void }
const EMPTY = { customer_id: '', received_date: new Date().toISOString().slice(0, 10), channel: 'Telefon', category: COMPLAINT_CATEGORIES[0], severity: 'medium',
  subject: '', description: '', immediate_action: '', root_cause: '', corrective_action: '', responsible_id: '', due_date: '', status: 'open', effectiveness_check: '', customer_informed: false, survey_id: '' };
const STEPS = ['open', 'investigating', 'action', 'verification', 'closed'];

export default function ComplaintsTab({ supabase, complaints, customers, team, prefill, clearPrefill, onChanged }: Props) {
  const [form, setForm] = useState<any | null>(null);
  const [filter, setFilter] = useState('active');
  useEffect(() => { if (prefill) { setForm({ ...EMPTY, ...prefill }); clearPrefill(); } }, [prefill]);

  const cname = (id: string) => customers.find(c => c.id === id)?.name || '-';
  const tname = (id: string) => team.find(t => t.id === id)?.name || '-';
  const today = new Date().toISOString().slice(0, 10);
  const active = complaints.filter(c => !['closed', 'rejected'].includes(c.status));
  const overdue = active.filter(c => c.due_date && c.due_date < today);
  const closed = complaints.filter(c => c.status === 'closed' && c.closed_at);
  const avgDays = closed.length ? Math.round(closed.reduce((s, c) => s + (new Date(c.closed_at).getTime() - new Date(c.received_date).getTime()) / 864e5, 0) / closed.length) : null;
  const byCat: Record<string, number> = {};
  complaints.forEach(c => { byCat[c.category || 'Diğer'] = (byCat[c.category || 'Diğer'] || 0) + 1; });

  const save = async () => {
    if (!form.subject.trim()) { alert('Konu girin.'); return; }
    if (form.status === 'closed' && (!form.root_cause || !form.corrective_action || !form.effectiveness_check)) {
      alert('ISO 10.2 gereği kapatmadan önce kök neden, düzeltici faaliyet ve etkinlik doğrulaması girilmelidir.'); return;
    }
    const { id, complaint_no, created_at, closed_at, created_by, organization_id, ...rest } = form;
    const payload: any = {};
    Object.entries(rest).forEach(([k, v]) => { payload[k] = v === '' ? null : v; });
    const { error } = id ? await supabase.from('complaints').update(payload).eq('id', id) : await supabase.from('complaints').insert([payload]);
    if (error) { alert(error.message); return; }
    setForm(null); onChanged();
  };

  const print = (c: any) => {
    const r = (l: string, v: any) => `<tr><td style="width:30%"><b>${l}</b></td><td>${escapeHtml(v || '-')}</td></tr>`;
    printHtml(`DÖF ${c.complaint_no}`, `<h1>Müşteri Şikâyeti ve Düzeltici Faaliyet Formu</h1><p>ISO 9001:2015 madde 10.2 · ${escapeHtml(c.complaint_no || '')}</p>
      <table>${r('Müşteri', cname(c.customer_id))}${r('Alınma tarihi', formatDate(c.received_date))}${r('Kanal', c.channel)}${r('Kategori', c.category)}${r('Önem', SEVERITY[c.severity]?.label)}
      ${r('Konu', c.subject)}${r('Açıklama', c.description)}${r('Anlık düzeltme', c.immediate_action)}${r('Kök neden', c.root_cause)}${r('Düzeltici faaliyet', c.corrective_action)}
      ${r('Sorumlu', tname(c.responsible_id))}${r('Hedef tarih', c.due_date ? formatDate(c.due_date) : '')}${r('Etkinlik doğrulaması', c.effectiveness_check)}
      ${r('Müşteri bilgilendirildi', c.customer_informed ? 'Evet' : 'Hayır')}${r('Durum', COMPLAINT_STATUS[c.status]?.label)}${r('Kapanış', c.closed_at ? formatDate(c.closed_at) : '')}</table>`);
  };

  const list = complaints.filter(c => filter === 'active' ? !['closed', 'rejected'].includes(c.status) : !filter || c.status === filter)
    .sort((a, b) => (b.received_date || '').localeCompare(a.received_date || ''));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><p className="text-2xl font-bold text-red-600">{active.length}</p><p className="text-xs text-slate-500">Açık şikâyet</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold text-amber-600">{overdue.length}</p><p className="text-xs text-slate-500">Hedef tarihi geçen</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold">{avgDays === null ? '-' : `${avgDays} gün`}</p><p className="text-xs text-slate-500">Ortalama kapanış süresi</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">En sık kategoriler</p><p className="text-sm">{Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`).join(', ') || '-'}</p></Card>
      </div>
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Şikâyet & Düzeltici Faaliyet (DÖF)</h3>
          <select value={filter} onChange={e => setFilter(e.target.value)} className="h-8 rounded-lg border px-2 text-sm">
            <option value="active">Açık olanlar</option><option value="">Tümü</option>{Object.entries(COMPLAINT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <Button size="sm" onClick={() => setForm({ ...EMPTY })}><Plus className="h-3 w-3" />Şikâyet kaydet</Button>
        </div>
        {list.length === 0 ? <p className="text-sm text-slate-500">Kayıt yok.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">No / Konu</th><th>Müşteri</th><th>Önem</th><th>Sorumlu / Hedef</th><th>Aşama</th><th /></tr></thead>
            <tbody>{list.map(c => (
              <tr key={c.id} className="cursor-pointer border-b hover:bg-slate-50" onClick={() => setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])) })}>
                <td className="py-2"><p className="font-medium">{c.subject}</p><p className="text-xs text-slate-400">{c.complaint_no} · {formatDate(c.received_date)} · {c.category}</p></td>
                <td>{cname(c.customer_id)}</td><td><Badge variant={SEVERITY[c.severity]?.variant}>{SEVERITY[c.severity]?.label}</Badge></td>
                <td className="text-xs">{tname(c.responsible_id)}<p className={c.due_date && c.due_date < today && !['closed', 'rejected'].includes(c.status) ? 'font-semibold text-red-600' : 'text-slate-400'}>{c.due_date ? formatDate(c.due_date) : '-'}</p></td>
                <td><Badge variant={COMPLAINT_STATUS[c.status]?.variant}>{COMPLAINT_STATUS[c.status]?.label}</Badge></td>
                <td className="text-right"><button onClick={e => { e.stopPropagation(); print(c); }}><Printer className="h-4 w-4 text-slate-400" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? `Şikâyet ${form.complaint_no}` : 'Yeni şikâyet'} size="xl"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">{STEPS.map((s, i) => (
              <button key={s} type="button" onClick={() => setForm({ ...form, status: s })}
                className={`rounded-full px-3 py-1 text-xs ${form.status === s ? 'bg-indigo-600 text-white' : STEPS.indexOf(form.status) > i ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}. {COMPLAINT_STATUS[s].label}</button>
            ))}</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="Müşteri" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} options={[{ value: '', label: 'Seçin' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
              <Input label="Alınma tarihi" type="date" value={form.received_date} onChange={e => setForm({ ...form, received_date: e.target.value })} />
              <Select label="Kanal" value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} options={COMPLAINT_CHANNELS.map(c => ({ value: c, label: c }))} />
              <Select label="Kategori" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={COMPLAINT_CATEGORIES.map(c => ({ value: c, label: c }))} />
              <Select label="Önem" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} options={Object.entries(SEVERITY).map(([value, v]) => ({ value, label: v.label }))} />
              <Select label="Sorumlu" value={form.responsible_id} onChange={e => setForm({ ...form, responsible_id: e.target.value })} options={[{ value: '', label: 'Seçin' }, ...team.map(t => ({ value: t.id, label: t.name }))]} />
            </div>
            <Input label="Konu *" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
            <Textarea label="Şikâyetin açıklaması" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Textarea label="Anlık düzeltme (ne yapıldı?)" value={form.immediate_action} onChange={e => setForm({ ...form, immediate_action: e.target.value })} />
              <Textarea label="Kök neden (5 Neden)" value={form.root_cause} onChange={e => setForm({ ...form, root_cause: e.target.value })} />
              <Textarea label="Düzeltici faaliyet (tekrarı nasıl önleyeceğiz?)" value={form.corrective_action} onChange={e => setForm({ ...form, corrective_action: e.target.value })} />
              <Textarea label="Etkinlik doğrulaması (işe yaradı mı?)" value={form.effectiveness_check} onChange={e => setForm({ ...form, effectiveness_check: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-48"><Input label="Hedef tarih" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={!!form.customer_informed} onChange={e => setForm({ ...form, customer_informed: e.target.checked })} />Müşteriye sonuç bildirildi</label>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
