'use client';

import { useEffect, useState } from 'react';
import { usePortal, PortalTitle, Catalog } from '@/components/portal/PortalShell';
import { StatusBadge, FileField, FileLink } from '@/components/portal/common';
import TicketThread from '@/components/portal/TicketThread';
import { Modal, Button, Input, Select, Textarea } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/utils';
import { TICKET_TYPE, TICKET_STATUS, RESOLUTION_TYPE, PRIORITY } from '@/lib/portal';
import { Plus } from 'lucide-react';

export default function PortalTickets() {
  const { supabase, me, loadCatalog, refreshCounts } = usePortal();
  const [tickets, setTickets] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [form, setForm] = useState<any | null>(null);
  const [view, setView] = useState<any | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => supabase.from('dealer_tickets').select('*').order('updated_at', { ascending: false }).then(({ data }: any) => setTickets(data || []));
  useEffect(() => { load(); loadCatalog().then(setCatalog); }, []);

  const pname = (id: string) => catalog?.products.find(p => p.id === id)?.name || '';

  const save = async () => {
    if (!form.subject.trim()) { alert('Konu girin.'); return; }
    if (['warranty', 'return'].includes(form.ticket_type) && !form.product_id) { alert('Garanti/iade için ürün seçin.'); return; }
    setBusy(true);
    const payload: any = { dealer_id: me.dealer.id };
    Object.entries(form).forEach(([k, v]) => { payload[k] = v === '' ? null : v; });
    const { error } = await supabase.from('dealer_tickets').insert([payload]);
    setBusy(false);
    if (error) { alert(error.message); return; }
    setForm(null); load();
  };

  const close = async (t: any) => {
    const { error } = await supabase.rpc('portal_ticket_close', { p_id: t.id });
    if (error) alert(error.message); else { setView(null); load(); refreshCounts(); }
  };

  const list = tickets.filter(t => !filter || t.ticket_type === filter);
  const isRma = form && ['warranty', 'return'].includes(form.ticket_type);

  return (
    <div className="space-y-4">
      <PortalTitle title="Garanti, İade & Destek" subtitle="Arızalı ürün, iade, teknik soru veya özel fiyat taleplerinizi buradan açın ve yazışın."
        action={<Button onClick={() => setForm({ ticket_type: 'warranty', subject: '', description: '', product_id: '', serial_no: '', quantity: '1', invoice_no: '', purchase_date: '', priority: 'normal', attachment_url: '' })}><Plus className="h-4 w-4" />Yeni talep</Button>} />
      <div className="flex flex-wrap gap-2">
        {[['', 'Tümü'], ...Object.entries(TICKET_TYPE)].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs ${filter === k ? 'bg-indigo-600 text-white' : 'border bg-white'}`}>{l}</button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-slate-50 text-left text-xs"><th className="px-4 py-2">Talep</th><th>Tür</th><th>Ürün / Seri no</th><th>Durum</th><th>Son işlem</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">Talep yok.</td></tr>}
            {list.map(t => (
              <tr key={t.id} onClick={() => setView(t)} className="cursor-pointer border-b hover:bg-slate-50">
                <td className="px-4 py-2"><p className="font-medium">{t.subject}</p><p className="text-xs text-slate-400">#{t.id.slice(0, 8)} · {formatDate(t.created_at)}</p></td>
                <td className="text-xs">{TICKET_TYPE[t.ticket_type]}</td>
                <td className="text-xs">{pname(t.product_id)}{t.serial_no ? ` · ${t.serial_no}` : ''}</td>
                <td><StatusBadge map={TICKET_STATUS} value={t.status} /></td>
                <td className="text-xs text-slate-500">{formatDateTime(t.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Yeni Talep" size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save} disabled={busy}>Gönder</Button></>}>
        {form && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Talep türü" value={form.ticket_type} onChange={e => setForm({ ...form, ticket_type: e.target.value })} options={Object.entries(TICKET_TYPE).map(([value, label]) => ({ value, label }))} />
              <Select label="Öncelik" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} options={Object.entries(PRIORITY).map(([value, v]) => ({ value, label: v.label }))} />
            </div>
            <Input label="Konu" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label={isRma ? 'Ürün *' : 'Ürün'} value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}
                options={[{ value: '', label: 'Seçin' }, ...(catalog?.products || []).map(p => ({ value: p.id, label: p.name }))]} />
              {isRma && <Input label="Seri numarası" value={form.serial_no} onChange={e => setForm({ ...form, serial_no: e.target.value })} />}
            </div>
            {isRma && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="Adet" type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
                <Input label="Fatura no" value={form.invoice_no} onChange={e => setForm({ ...form, invoice_no: e.target.value })} />
                <Input label="Satış / montaj tarihi" type="date" value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} />
              </div>
            )}
            <Textarea label={isRma ? 'Arıza / iade nedeni (belirti, ölçüm değerleri)' : 'Açıklama'} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <FileField supabase={supabase} dealerId={me.dealer.id} value={form.attachment_url} onChange={v => setForm({ ...form, attachment_url: v })} label="Fotoğraf / test raporu" />
          </div>
        )}
      </Modal>

      <Modal isOpen={!!view} onClose={() => setView(null)} title={view?.subject || ''} size="lg"
        footer={view && !['closed'].includes(view.status) ? <Button variant="secondary" onClick={() => close(view)}>Talebi kapat</Button> : undefined}>
        {view && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2"><StatusBadge map={TICKET_STATUS} value={view.status} /><StatusBadge map={PRIORITY} value={view.priority} /><span className="text-xs text-slate-500">{TICKET_TYPE[view.ticket_type]}</span></div>
            <div className="grid grid-cols-2 gap-1 text-xs text-slate-600">
              {view.product_id && <span>Ürün: {pname(view.product_id)}</span>}
              {view.serial_no && <span>Seri no: {view.serial_no}</span>}
              {view.quantity && <span>Adet: {view.quantity}</span>}
              {view.invoice_no && <span>Fatura: {view.invoice_no}</span>}
            </div>
            {view.description && <p className="whitespace-pre-wrap rounded bg-slate-50 p-2">{view.description}</p>}
            <FileLink supabase={supabase} value={view.attachment_url} />
            {view.resolution_type && (
              <div className="rounded border border-green-200 bg-green-50 p-2 text-green-900">
                <b>Sonuç: {RESOLUTION_TYPE[view.resolution_type] || view.resolution_type}</b>{view.resolution_note && <p>{view.resolution_note}</p>}
              </div>
            )}
            <TicketThread supabase={supabase} ticket={view} mode="dealer" dealerId={me.dealer.id} onPosted={() => { load(); refreshCounts(); }} />
          </div>
        )}
      </Modal>
    </div>
  );
}
