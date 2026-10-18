'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Modal, Button } from '@/components/ui';
import { setReminderState, KIND_LABEL, type Reminder, type ReminderKind } from '@/lib/reminders';
import { Wallet, CalendarClock, Flame, MailX, Hourglass, CalendarCheck, Target, Repeat, PhoneOff, RefreshCcw, Lightbulb, MessageSquareWarning,
  Check, AlarmClock, Phone, PenLine, ChevronDown, ClipboardList, TrendingDown, CheckSquare, FileSearch, Truck, Receipt, FileWarning, ClipboardCheck, PiggyBank } from 'lucide-react';

export const KIND_ICON: Record<ReminderKind, { icon: any; cls: string }> = {
  overdue: { icon: Wallet, cls: 'bg-rose-50 text-rose-600' },
  due_soon: { icon: CalendarClock, cls: 'bg-amber-50 text-amber-600' },
  quote_hot: { icon: Flame, cls: 'bg-orange-50 text-orange-600' },
  quote_revision: { icon: MessageSquareWarning, cls: 'bg-orange-50 text-orange-600' },
  quote_unopened: { icon: MailX, cls: 'bg-slate-100 text-slate-600' },
  quote_expiring: { icon: Hourglass, cls: 'bg-amber-50 text-amber-600' },
  next_step: { icon: CalendarCheck, cls: 'bg-indigo-50 text-indigo-600' },
  opp_close: { icon: Target, cls: 'bg-indigo-50 text-indigo-600' },
  repeat: { icon: Repeat, cls: 'bg-emerald-50 text-emerald-600' },
  silent: { icon: PhoneOff, cls: 'bg-slate-100 text-slate-600' },
  renewal: { icon: RefreshCcw, cls: 'bg-sky-50 text-sky-600' },
  crosssell: { icon: Lightbulb, cls: 'bg-violet-50 text-violet-600' },
  plan_action: { icon: ClipboardList, cls: 'bg-indigo-50 text-indigo-600' },
  plan_behind: { icon: TrendingDown, cls: 'bg-rose-50 text-rose-600' },
  proc_approval_waiting: { icon: CheckSquare, cls: 'bg-amber-50 text-amber-600' },
  proc_rfq_deadline: { icon: FileSearch, cls: 'bg-sky-50 text-sky-600' },
  proc_late_delivery: { icon: Truck, cls: 'bg-rose-50 text-rose-600' },
  proc_unmatched_invoice: { icon: Receipt, cls: 'bg-indigo-50 text-indigo-600' },
  proc_vendor_doc_expiring: { icon: FileWarning, cls: 'bg-amber-50 text-amber-600' },
  proc_vendor_reevaluation: { icon: ClipboardCheck, cls: 'bg-teal-50 text-teal-600' },
  proc_budget_80: { icon: PiggyBank, cls: 'bg-rose-50 text-rose-600' },
};
const PRI = { 1: 'border-l-rose-500', 2: 'border-l-amber-400', 3: 'border-l-slate-300' } as const;
const TYPES = ['Telefon', 'Email', 'Toplantı', 'Ziyaret', 'WhatsApp', 'Not'];

export function dueLabel(d: string) {
  const today = new Date().toISOString().slice(0, 10);
  const diff = Math.round((new Date(d).getTime() - new Date(today).getTime()) / 864e5);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff < 0) return `${-diff} gün önce`;
  return `${diff} gün sonra`;
}

/** Hatırlatma listesi: temas kaydet, ertele, tamamlandı */
export default function ReminderList({ supabase, items, me, onChanged, compact = false, showCustomer = true }: {
  supabase: any; items: Reminder[]; me?: string | null; onChanged: () => void; compact?: boolean; showCustomer?: boolean;
}) {
  const [log, setLog] = useState<Reminder | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const act = async (r: Reminder, status: 'done' | 'snoozed', days?: number) => {
    setMenu(null);
    try { await setReminderState(supabase, r.key, status, days); onChanged(); } catch (e: any) { alert(e.message); }
  };

  return (
    <>
      <div className="divide-y">
        {items.map(r => {
          const K = KIND_ICON[r.kind]; const Icon = K.icon;
          return (
            <div key={r.key} className={`flex flex-wrap items-start gap-3 border-l-4 px-4 ${compact ? 'py-2' : 'py-3'} ${PRI[r.priority]}`}>
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${K.cls}`}><Icon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">
                  {showCustomer && r.customer && <><Link href={`/customers/${r.customer_id}`} className="hover:text-indigo-700">{r.customer}</Link><span className="text-slate-300"> · </span></>}
                  <Link href={r.href} className="hover:text-indigo-700">{r.title}</Link>
                </p>
                {!compact && <p className="text-xs text-slate-500">{r.detail}</p>}
                <p className="mt-0.5 text-[11px] text-slate-400">{KIND_LABEL[r.kind]} · {dueLabel(r.due)}</p>
              </div>
              <div className={`flex shrink-0 items-center gap-1 ${compact ? 'w-full justify-end pl-11' : ''}`}>
                {r.phone && <a href={`tel:${r.phone}`} title={r.phone} className="flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50"><Phone className="h-3.5 w-3.5" /></a>}
                {r.customer_id && <button title="Temas kaydet" onClick={() => setLog(r)} className="flex h-8 items-center gap-1 rounded-lg border px-2 text-xs text-slate-600 hover:bg-slate-50"><PenLine className="h-3.5 w-3.5" />{!compact && 'Temas kaydet'}</button>}
                <div className="relative">
                  <button title="Ertele" onClick={() => setMenu(menu === r.key ? null : r.key)} className="flex h-8 items-center gap-0.5 rounded-lg border px-2 text-xs text-slate-600 hover:bg-slate-50"><AlarmClock className="h-3.5 w-3.5" /><ChevronDown className="h-3 w-3" /></button>
                  {menu === r.key && (
                    <div className="absolute right-0 top-9 z-20 w-32 rounded-lg border bg-white py-1 text-xs shadow-lg">
                      {[[1, 'Yarın'], [3, '3 gün sonra'], [7, '1 hafta sonra'], [30, '1 ay sonra']].map(([d, l]) => (
                        <button key={d} onClick={() => act(r, 'snoozed', d as number)} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">{l}</button>))}
                    </div>
                  )}
                </div>
                <button title="Tamamlandı" onClick={() => act(r, 'done')} className="flex h-8 w-8 items-center justify-center rounded-lg border text-emerald-600 hover:bg-emerald-50"><Check className="h-4 w-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
      {log && <LogActivity supabase={supabase} r={log} me={me} onClose={() => setLog(null)} onSaved={async () => { try { await setReminderState(supabase, log.key, 'done'); } catch { /* SQL yoksa yalnızca aktivite kaydedilir */ } setLog(null); onChanged(); }} />}
    </>
  );
}

/** Hatırlatmadan temas kaydı: CRM aktivitesi + sonraki adım, ardından hatırlatma kapanır */
function LogActivity({ supabase, r, me, onClose, onSaved }: { supabase: any; r: Reminder; me?: string | null; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ type: 'Telefon', title: `${KIND_LABEL[r.kind]}: ${r.title}`, description: '', next_step: '', next_step_date: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const base: any = { customer_id: r.customer_id, type: f.type, title: f.title, description: f.description || null, activity_date: today, sales_person_id: me || r.assigned_to || null };
    let { error } = await supabase.from('crm_activities').insert([{ ...base, next_step: f.next_step || null, next_step_date: f.next_step_date || null }]);
    if (error && /next_step/i.test(error.message)) ({ error } = await supabase.from('crm_activities').insert([base]));
    if (!error && f.next_step) await supabase.from('customers').update({ next_step: f.next_step, next_step_date: f.next_step_date || null }).eq('id', r.customer_id);
    setBusy(false);
    if (error) { alert(error.message); return; }
    onSaved();
  };
  return (
    <Modal isOpen onClose={onClose} title={`Temas kaydet · ${r.customer}`} footer={<div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Vazgeç</Button><Button size="sm" disabled={busy || !f.title.trim()} onClick={save}>Kaydet ve hatırlatmayı kapat</Button></div>}>
      <div className="space-y-3 text-sm">
        <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{r.detail}</p>
        <div className="flex flex-wrap gap-1.5">{TYPES.map(t => <button key={t} onClick={() => setF({ ...f, type: t })} className={`rounded-full border px-3 py-1 text-xs ${f.type === t ? 'border-indigo-600 bg-indigo-600 text-white' : 'hover:bg-slate-50'}`}>{t}</button>)}</div>
        <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} className="w-full rounded-lg border px-3 py-2" placeholder="Başlık" />
        <textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} rows={3} className="w-full rounded-lg border px-3 py-2" placeholder="Ne konuşuldu? Sonuç ne?" />
        <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
          <input value={f.next_step} onChange={e => setF({ ...f, next_step: e.target.value })} className="rounded-lg border px-3 py-2" placeholder="Sonraki adım (ör. revize teklif gönder)" />
          <input type="date" value={f.next_step_date} onChange={e => setF({ ...f, next_step_date: e.target.value })} className="rounded-lg border px-3 py-2" />
        </div>
        <p className="text-[11px] text-slate-400">Sonraki adımın tarihi geldiğinde yeniden hatırlatılır.</p>
      </div>
    </Modal>
  );
}
