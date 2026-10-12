'use client';

import { useMemo, useState } from 'react';
import { Card, Button, Input, Select, Textarea } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { Phone, Mail, Users, MapPinned, Target, FileSignature, Eye, ShoppingCart, Receipt, Wallet, AlertTriangle, Smile, ScrollText, Sparkles, StickyNote, Plus, Building2 } from 'lucide-react';

const tl = (v: any) => `₺${formatMoney(Math.round(Number(v) || 0))}`;
export interface TLData { activities: any[]; visits: any[]; opps: any[]; quotes: any[]; orders: any[]; invoices: any[]; collections: any[]; complaints: any[]; surveys: any[]; contracts: any[]; briefs: any[] }
type Ev = { at: string; kind: string; icon: any; tone: string; title: string; detail?: string; href?: string };

const KINDS: Record<string, string> = { activity: 'Temaslar', sales: 'Fırsat & teklif', order: 'Sipariş & finans', service: 'Hizmet & memnuniyet' };
const TYPES = ['Telefon', 'Email', 'Toplantı', 'Ziyaret', 'Demo', 'WhatsApp', 'Not'];

export default function Timeline({ data, contacts, team, me, onAddActivity }: {
  data: TLData; contacts: any[]; team: any[]; me: string | null;
  onAddActivity: (a: any) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState<any | null>(null);
  const cname = (id?: string) => contacts.find(c => c.id === id)?.full_name;
  const pname = (id?: string) => team.find(t => t.id === id)?.name;

  const events = useMemo(() => {
    const ev: (Ev & { group: string })[] = [];
    const push = (group: string, e: Ev) => { if (e.at) ev.push({ ...e, group }); };
    data.activities.forEach(a => push('activity', { at: a.activity_date || a.created_at, kind: a.type, icon: a.type === 'Email' ? Mail : a.type === 'Toplantı' ? Users : a.type === 'Ziyaret' ? Building2 : a.type === 'Not' ? StickyNote : Phone, tone: 'bg-sky-500',
      title: `${a.type || 'Aktivite'}: ${a.title || ''}`, detail: [cname(a.contact_id) && `Kişi: ${cname(a.contact_id)}`, a.description, pname(a.sales_person_id), a.next_step && `→ ${a.next_step}`].filter(Boolean).join(' · ') }));
    data.visits.forEach(v => push('activity', { at: v.check_in_at || v.planned_date, kind: 'Ziyaret', icon: MapPinned, tone: 'bg-teal-500',
      title: `Saha ziyareti${v.purpose ? ': ' + v.purpose : ''}`, detail: [v.status === 'completed' ? v.outcome : v.status === 'planned' ? 'Planlandı' : v.status, v.next_step && `→ ${v.next_step}`].filter(Boolean).join(' · '), href: '/visits' }));
    data.opps.forEach(o => {
      push('sales', { at: o.created_at, kind: 'Fırsat', icon: Target, tone: 'bg-indigo-500', title: `Fırsat açıldı: ${o.title}`, detail: tl(o.value), href: '/opportunities' });
      if (o.closed_at) push('sales', { at: o.closed_at, kind: 'Fırsat', icon: Target, tone: ['Kazanıldı', 'won'].includes(o.stage) ? 'bg-green-600' : 'bg-red-500',
        title: `${['Kazanıldı', 'won'].includes(o.stage) ? 'Kazanıldı' : 'Kaybedildi'}: ${o.title}`, detail: [tl(o.value), o.close_reason].filter(Boolean).join(' · '), href: '/opportunities' });
    });
    data.quotes.forEach(q => {
      push('sales', { at: q.sent_at || q.created_at, kind: 'Teklif', icon: FileSignature, tone: 'bg-violet-500', title: `Teklif ${q.sent_at ? 'gönderildi' : 'hazırlandı'}: ${q.quote_number}`, detail: [q.subject, tl(q.total)].filter(Boolean).join(' · '), href: '/quotes' });
      if (q.first_viewed_at) push('sales', { at: q.first_viewed_at, kind: 'Teklif', icon: Eye, tone: 'bg-violet-400', title: `Müşteri teklifi açtı: ${q.quote_number}`, detail: `${q.view_count || 1} açılış${q.read_seconds ? ` · ${Math.round(q.read_seconds / 60)} dk okuma` : ''}`, href: '/quotes' });
      if (q.customer_response_at) push('sales', { at: q.customer_response_at, kind: 'Teklif', icon: FileSignature, tone: q.customer_response === 'accepted' ? 'bg-green-600' : 'bg-amber-500',
        title: `Teklif ${q.customer_response === 'accepted' ? 'kabul edildi' : q.customer_response === 'rejected' ? 'reddedildi' : 'için revizyon istendi'}: ${q.quote_number}`, detail: q.customer_signer_name, href: '/quotes' });
    });
    data.orders.forEach(o => push('order', { at: o.order_date || o.created_at, kind: 'Sipariş', icon: ShoppingCart, tone: 'bg-emerald-600', title: `Sipariş: ${o.order_number}`, detail: tl(o.total), href: '/orders' }));
    data.invoices.forEach(f => push('order', { at: f.issue_date, kind: 'Fatura', icon: Receipt, tone: 'bg-slate-500', title: `Fatura: ${f.invoice_number || ''}`, detail: tl(f.total), href: '/invoices' }));
    data.collections.filter(c => ['Ödendi', 'paid'].includes(c.status) && c.payment_date).forEach(c => push('order', { at: c.payment_date, kind: 'Tahsilat', icon: Wallet, tone: 'bg-green-500', title: 'Tahsilat alındı', detail: `${tl(c.amount)}${c.invoice_no ? ' · ' + c.invoice_no : ''}`, href: '/collections' }));
    data.complaints.forEach(c => push('service', { at: c.received_date, kind: 'Şikâyet', icon: AlertTriangle, tone: 'bg-red-500', title: `Şikâyet: ${c.subject}`, detail: c.complaint_no, href: '/customer-success?tab=complaints' }));
    data.surveys.filter(s => s.answered_at).forEach(s => push('service', { at: s.answered_at, kind: 'Anket', icon: Smile, tone: Number(s.nps) >= 9 ? 'bg-green-500' : Number(s.nps) >= 7 ? 'bg-amber-400' : 'bg-red-500', title: `Memnuniyet anketi: NPS ${s.nps ?? '-'}`, detail: s.comment, href: '/customer-success?tab=surveys' }));
    data.contracts.forEach(c => { push('service', { at: c.start_date, kind: 'Sözleşme', icon: ScrollText, tone: 'bg-slate-600', title: `Sözleşme başladı: ${c.title || ''}`, detail: c.value ? tl(c.value) : '', href: '/contracts' });
      if (c.end_date) push('service', { at: c.end_date, kind: 'Sözleşme', icon: ScrollText, tone: 'bg-amber-500', title: `Sözleşme bitişi: ${c.title || ''}`, href: '/customer-success?tab=renewals' }); });
    data.briefs.forEach(b => push('sales', { at: b.created_at, kind: 'AI', icon: Sparkles, tone: 'bg-fuchsia-500', title: 'Görüşme hazırlığı (AI) oluşturuldu', href: '/briefs' }));
    return ev.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [data, contacts]);

  const today = new Date().toISOString().slice(0, 10);
  const list = events.filter(e => !filter || e.group === filter);
  const upcoming = list.filter(e => String(e.at).slice(0, 10) > today);
  const past = list.filter(e => String(e.at).slice(0, 10) <= today);

  const save = async () => {
    if (!form.title.trim()) { alert('Konu girin.'); return; }
    if (await onAddActivity(form)) setForm(null);
  };

  const Item = ({ e }: { e: Ev }) => (
    <div className="relative flex gap-3 pb-4">
      <div className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${e.tone} text-white`}><e.icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {e.href ? <a href={e.href} className="text-sm font-medium hover:underline">{e.title}</a> : <p className="text-sm font-medium">{e.title}</p>}
          <span className="text-xs text-slate-400">{new Date(e.at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
        {e.detail && <p className="text-xs text-slate-600">{e.detail}</p>}
      </div>
    </div>
  );

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Zaman çizelgesi</h3>
        {[['', 'Tümü'], ...Object.entries(KINDS)].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs ${filter === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>
        ))}
        <Button size="sm" onClick={() => setForm({ type: 'Telefon', title: '', description: '', contact_id: contacts.find(c => c.is_primary)?.id || '', activity_date: today, sales_person_id: me || '', next_step: '', next_step_date: '' })}><Plus className="h-3 w-3" />Temas kaydet</Button>
      </div>

      {form && (
        <div className="mb-4 space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Select label="Tip" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} options={TYPES.map(t => ({ value: t, label: t }))} />
            <div className="sm:col-span-2"><Input label="Konu *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <Input label="Tarih" type="date" value={form.activity_date} onChange={e => setForm({ ...form, activity_date: e.target.value })} />
            <Select label="Görüşülen kişi" value={form.contact_id} onChange={e => setForm({ ...form, contact_id: e.target.value })} options={[{ value: '', label: '-' }, ...contacts.filter(c => c.is_active !== false).map(c => ({ value: c.id, label: `${c.full_name}${c.title ? ' · ' + c.title : ''}` }))]} />
            <Select label="Temsilci" value={form.sales_person_id} onChange={e => setForm({ ...form, sales_person_id: e.target.value })} options={[{ value: '', label: '-' }, ...team.map(t => ({ value: t.id, label: t.name }))]} />
            <Input label="Sonraki adım" value={form.next_step} placeholder="Revize teklif gönder" onChange={e => setForm({ ...form, next_step: e.target.value })} />
            <Input label="Sonraki adım tarihi" type="date" value={form.next_step_date} onChange={e => setForm({ ...form, next_step_date: e.target.value })} />
          </div>
          <Textarea label="Notlar" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div className="flex gap-2"><Button size="sm" onClick={save}>Kaydet</Button><Button size="sm" variant="secondary" onClick={() => setForm(null)}>Vazgeç</Button>
            {!form.next_step && <span className="self-center text-xs text-amber-700">İpucu: her temas bir sonraki adımla bitmeli.</span>}</div>
        </div>
      )}

      {list.length === 0 ? <p className="text-sm text-slate-500">Henüz kayıt yok.</p> : (
        <div className="relative">
          <div className="absolute bottom-0 left-4 top-0 w-px bg-slate-200" />
          {upcoming.length > 0 && <><p className="mb-2 ml-11 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Yaklaşan</p>{upcoming.slice(-10).map((e, i) => <Item key={'u' + i} e={e} />)}</>}
          {past.slice(0, 120).map((e, i) => <Item key={i} e={e} />)}
        </div>
      )}
    </Card>
  );
}
