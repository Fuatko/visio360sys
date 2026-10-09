'use client';

import { useEffect, useState } from 'react';
import { usePortal, PortalTitle } from '@/components/portal/PortalShell';
import { StatusBadge } from '@/components/portal/common';
import { Modal, Button, Input, Textarea } from '@/components/ui';
import { formatMoney, formatDateTime } from '@/lib/utils';
import { LEAD_STATUS, n } from '@/lib/portal';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';

const tl = (v: number) => `₺${formatMoney(v)}`;

export default function PortalLeads() {
  const { supabase, refreshCounts } = usePortal();
  const [leads, setLeads] = useState<any[]>([]);
  const [action, setAction] = useState<{ lead: any; status: string; note: string; value: string } | null>(null);

  const load = () => supabase.from('dealer_lead_assignments').select('*').order('created_at', { ascending: false }).then(({ data }: any) => setLeads(data || []));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!action) return;
    const { error } = await supabase.rpc('portal_lead_respond', { p_id: action.lead.id, p_status: action.status, p_note: action.note || null, p_value: action.value ? n(action.value) : null });
    if (error) { alert(error.message); return; }
    setAction(null); load(); refreshCounts();
  };

  const btn = (lead: any, status: string, label: string, cls: string) => (
    <button onClick={() => setAction({ lead, status, note: '', value: '' })} className={`rounded-lg px-3 py-1 text-xs ${cls}`}>{label}</button>
  );

  return (
    <div className="space-y-4">
      <PortalTitle title="Size Yönlendirilen Lead'ler" subtitle="Bölgenizdeki potansiyel müşteriler. Yanıt süresine dikkat edin; yanıtlanmayan lead başka bayiye yönlendirilebilir." />
      {leads.length === 0 && <p className="text-sm text-slate-500">Size yönlendirilmiş lead yok.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {leads.map(l => {
          const late = l.status === 'assigned' && l.respond_by && new Date(l.respond_by) < new Date();
          return (
            <div key={l.id} className={`rounded-xl border bg-white p-4 ${l.status === 'assigned' ? 'border-amber-300' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{l.company_name}</p><p className="text-sm text-slate-600">{l.contact_name}</p></div>
                <StatusBadge map={LEAD_STATUS} value={l.status} />
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                {l.contact_phone && <a href={`tel:${l.contact_phone}`} className="flex items-center gap-1 text-indigo-600"><Phone className="h-3 w-3" />{l.contact_phone}</a>}
                {l.contact_email && <a href={`mailto:${l.contact_email}`} className="flex items-center gap-1 text-indigo-600"><Mail className="h-3 w-3" />{l.contact_email}</a>}
                {l.city && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{l.city}</p>}
                {l.need && <p className="pt-1 text-sm text-slate-700">{l.need}</p>}
                {l.estimated_value && <p>Tahmini değer: {tl(n(l.estimated_value))}</p>}
                {l.respond_by && l.status === 'assigned' && <p className={`flex items-center gap-1 ${late ? 'font-medium text-red-600' : ''}`}><Clock className="h-3 w-3" />Yanıt süresi: {formatDateTime(l.respond_by)}</p>}
                {l.dealer_note && <p className="rounded bg-slate-50 p-1.5">Notunuz: {l.dealer_note}</p>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {l.status === 'assigned' && <>{btn(l, 'accepted', 'Kabul et', 'bg-indigo-600 text-white')}{btn(l, 'rejected', 'Reddet', 'border text-slate-600')}</>}
                {['accepted', 'contacted'].includes(l.status) && <>
                  {l.status === 'accepted' && btn(l, 'contacted', 'Görüşüldü', 'border text-indigo-700')}
                  {btn(l, 'won', 'Kazanıldı', 'bg-green-600 text-white')}{btn(l, 'lost', 'Kaybedildi', 'border text-red-600')}
                </>}
              </div>
            </div>
          );
        })}
      </div>
      <Modal isOpen={!!action} onClose={() => setAction(null)} title={action ? `${action.lead.company_name} – ${LEAD_STATUS[action.status]?.label}` : ''}
        footer={<><Button variant="secondary" onClick={() => setAction(null)}>İptal</Button><Button onClick={submit}>Kaydet</Button></>}>
        {action && (
          <div className="space-y-3">
            {action.status === 'won' && <Input label="Satış tutarı (₺)" type="number" value={action.value} onChange={e => setAction({ ...action, value: e.target.value })} />}
            <Textarea label={action.status === 'rejected' || action.status === 'lost' ? 'Neden? (zorunlu değil ama faydalı)' : 'Not'} value={action.note} onChange={e => setAction({ ...action, note: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
