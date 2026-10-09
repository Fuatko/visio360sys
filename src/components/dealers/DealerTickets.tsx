'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Select, Textarea, Modal } from '@/components/ui';
import { StatusBadge, FileLink } from '@/components/portal/common';
import TicketThread from '@/components/portal/TicketThread';
import { formatDate, formatDateTime } from '@/lib/utils';
import { TICKET_TYPE, TICKET_STATUS, RESOLUTION_TYPE, PRIORITY } from '@/lib/portal';

interface Props { supabase: any; dealers: any[]; products: any[]; onChanged?: () => void }

export default function DealerTickets({ supabase, dealers, products, onChanged }: Props) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [status, setStatus] = useState('open_all');
  const [type, setType] = useState('');
  const [view, setView] = useState<any | null>(null);

  const load = () => supabase.from('dealer_tickets').select('*').order('updated_at', { ascending: false }).then(({ data }: any) => setTickets(data || []));
  useEffect(() => { load(); }, []);
  const dname = (id: string) => dealers.find(d => d.id === id)?.name || '-';
  const pname = (id: string) => products.find(p => p.id === id)?.name || '';

  const save = async () => {
    const patch: any = { status: view.status, resolution_type: view.resolution_type || null, resolution_note: view.resolution_note || null, priority: view.priority, updated_at: new Date().toISOString() };
    if (['resolved', 'rejected'].includes(view.status) && !view.resolved_at) patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from('dealer_tickets').update(patch).eq('id', view.id);
    if (error) alert(error.message); else { setView(null); load(); onChanged?.(); }
  };

  const openSet = ['open', 'in_progress', 'waiting_dealer'];
  const list = tickets.filter(t => (status === 'open_all' ? openSet.includes(t.status) : !status || t.status === status) && (!type || t.ticket_type === type));
  // Garanti istatistiği: ürün bazında arıza adedi (son 12 ay)
  const since = new Date(Date.now() - 365 * 864e5).toISOString();
  const byProduct: Record<string, number> = {};
  tickets.filter(t => t.ticket_type === 'warranty' && t.created_at >= since && t.product_id).forEach(t => { byProduct[t.product_id] = (byProduct[t.product_id] || 0) + (Number(t.quantity) || 1); });
  const avgHours = (() => {
    const r = tickets.filter(t => t.resolved_at);
    return r.length ? r.reduce((s, t) => s + (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 36e5, 0) / r.length : null;
  })();

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Garanti, İade & Destek Talepleri</h3>
          {avgHours !== null && <span className="text-xs text-slate-500">Ort. çözüm süresi: <b>{avgHours < 48 ? `${avgHours.toFixed(1)} saat` : `${(avgHours / 24).toFixed(1)} gün`}</b></span>}
          <select value={type} onChange={e => setType(e.target.value)} className="h-8 rounded-lg border px-2 text-sm"><option value="">Tüm türler</option>{Object.entries(TICKET_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="h-8 rounded-lg border px-2 text-sm">
            <option value="open_all">Açık olanlar</option><option value="">Tümü</option>{Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {list.length === 0 ? <p className="text-sm text-slate-500">Talep yok.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Talep</th><th>Bayi</th><th>Tür</th><th>Ürün / Seri</th><th>Öncelik</th><th>Durum</th><th>Güncelleme</th></tr></thead>
            <tbody>
              {list.map(t => (
                <tr key={t.id} onClick={() => setView({ ...t })} className="cursor-pointer border-b hover:bg-slate-50">
                  <td className="py-2 font-medium">{t.subject}<p className="text-xs font-normal text-slate-400">#{t.id.slice(0, 8)} · {formatDate(t.created_at)}</p></td>
                  <td>{dname(t.dealer_id)}</td><td className="text-xs">{TICKET_TYPE[t.ticket_type]}</td>
                  <td className="text-xs">{pname(t.product_id)}{t.serial_no ? ` · ${t.serial_no}` : ''}</td>
                  <td><StatusBadge map={PRIORITY} value={t.priority} /></td><td><StatusBadge map={TICKET_STATUS} value={t.status} /></td>
                  <td className="text-xs text-slate-500">{formatDateTime(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {Object.keys(byProduct).length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Son 12 ay garanti/arıza adedi (ürün bazında)</h3>
          {Object.entries(byProduct).sort((a, b) => b[1] - a[1]).map(([pid, c]) => <div key={pid} className="flex justify-between border-b py-1 text-sm"><span>{pname(pid) || '-'}</span><b>{c}</b></div>)}
        </Card>
      )}
      <Modal isOpen={!!view} onClose={() => setView(null)} title={view ? `${view.subject} – ${dname(view.dealer_id)}` : ''} size="xl"
        footer={<><Button variant="secondary" onClick={() => setView(null)}>Kapat</Button><Button onClick={save}>Durumu kaydet</Button></>}>
        {view && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-1 rounded bg-slate-50 p-2 text-xs">
                <span>Tür: {TICKET_TYPE[view.ticket_type]}</span><span>Ürün: {pname(view.product_id) || '-'}</span>
                <span>Seri no: {view.serial_no || '-'}</span><span>Adet: {view.quantity || '-'}</span>
                <span>Fatura: {view.invoice_no || '-'}</span><span>Satış tarihi: {view.purchase_date ? formatDate(view.purchase_date) : '-'}</span>
              </div>
              {view.description && <p className="whitespace-pre-wrap">{view.description}</p>}
              <FileLink supabase={supabase} value={view.attachment_url} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Durum" value={view.status} onChange={e => setView({ ...view, status: e.target.value })} options={Object.entries(TICKET_STATUS).map(([value, v]) => ({ value, label: v.label }))} />
                <Select label="Öncelik" value={view.priority} onChange={e => setView({ ...view, priority: e.target.value })} options={Object.entries(PRIORITY).map(([value, v]) => ({ value, label: v.label }))} />
              </div>
              <Select label="Çözüm" value={view.resolution_type || ''} onChange={e => setView({ ...view, resolution_type: e.target.value })} options={[{ value: '', label: '-' }, ...Object.entries(RESOLUTION_TYPE).map(([value, label]) => ({ value, label }))]} />
              <Textarea label="Çözüm açıklaması (bayi görür)" value={view.resolution_note || ''} onChange={e => setView({ ...view, resolution_note: e.target.value })} />
            </div>
            <TicketThread supabase={supabase} ticket={view} mode="staff" dealerId={view.dealer_id} onPosted={load} />
          </div>
        )}
      </Modal>
    </div>
  );
}
