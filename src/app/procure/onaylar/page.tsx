'use client';

// Onay kuyruğu — mobilde tek dokunuşla onay/red; vekâlet (izindeyken onayları devretme)
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Button, Modal } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { BudgetBox } from '@/components/procure/RequestBits';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { BudgetCheck, PROCURE_SQL_1A, fmtDate, idList, loadPeople, peopleMap, procError, tl } from '@/lib/procure';
import { AlertCircle, Check, CheckCircle2, ChevronRight, Trash2, UserRoundCog, X } from 'lucide-react';

export default function ApprovalsPage() {
  return (
    <div>
      <Header title="Onaylarım" subtitle="Satınalma" />
      <ProcureGate>{p => <Queue isAdmin={p.isAdmin} />}</ProcureGate>
    </div>
  );
}

type Item = { a: any; r: any; check: BudgetCheck | null; rfq?: any; order?: any };

function Queue({ isAdmin }: { isAdmin: boolean }) {
  const supabase = createClient();
  const { user } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [ccNames, setCcNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [reject, setReject] = useState<{ id: string; note: string } | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const ids = await supabase.rpc('proc_my_pending_approvals');
    if (ids.error) { if (/does not exist|Could not find/i.test(ids.error.message)) setMissing(true); else setErr(ids.error.message); setItems([]); return; }
    const list = idList(ids.data);
    const [apps, us, cc] = await Promise.all([
      list.length ? supabase.from('proc_approvals').select('*').in('id', list) : Promise.resolve({ data: [] as any[] }),
      loadPeople(supabase),
      supabase.from('proc_cost_centers').select('id, name'),
    ]);
    setNames(peopleMap(us));
    setCcNames(Object.fromEntries((cc.data || []).map((c: any) => [c.id, c.name])));
    const reqIds = [...new Set((apps.data || []).filter((a: any) => a.subject_type === 'request').map((a: any) => a.subject_id))] as string[];
    const rfqIds = [...new Set((apps.data || []).filter((a: any) => a.subject_type === 'rfq').map((a: any) => a.subject_id))] as string[];
    const rfqs = rfqIds.length ? (await supabase.from('proc_rfqs').select('*').in('id', rfqIds)).data || [] : [];
    const orderIds = [...new Set((apps.data || []).filter((a: any) => a.subject_type === 'order').map((a: any) => a.subject_id))] as string[];
    const orders = orderIds.length ? (await supabase.from('proc_orders').select('*, vendor:vendor_id(name)').in('id', orderIds)).data || [] : [];
    const reqs = reqIds.length ? await supabase.from('proc_requests').select('*').in('id', reqIds) : { data: [] as any[] };
    const checks = await Promise.all(reqIds.map(id => supabase.rpc('proc_budget_check', { p_request: id })));
    const checkOf = Object.fromEntries(reqIds.map((id, i) => [id, checks[i].data || null]));
    setItems((apps.data || []).map((a: any) => a.subject_type === 'order'
        ? { a, r: { id: a.subject_id, created_at: a.created_at }, check: null, order: orders.find((o: any) => o.id === a.subject_id) }
        : a.subject_type === 'rfq'
        ? { a, r: { id: a.subject_id, created_at: a.created_at }, check: null, rfq: rfqs.find((f: any) => f.id === a.subject_id) }
        : { a, r: (reqs.data || []).find((r: any) => r.id === a.subject_id), check: checkOf[a.subject_id] })
      .filter((x: Item) => x.rfq || x.order || x.r?.title).sort((x: Item, y: Item) => (x.r.priority === 'urgent' ? 0 : 1) - (y.r.priority === 'urgent' ? 0 : 1) || String(x.a.created_at).localeCompare(String(y.a.created_at))));
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (approvalId: string, approve: boolean, note?: string) => {
    setBusy(approvalId); setErr('');
    const { error } = await supabase.rpc('proc_approval_decide', { p_approval: approvalId, p_approve: approve, p_note: note || null });
    setBusy(null);
    if (error) { setErr(procError(error)); return false; }
    setDone(d => ({ ...d, [approvalId]: approve ? 'Onaylandı' : 'Reddedildi' }));
    return true;
  };

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1A} /></div>;
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-6">
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
      {items === null ? <div className="p-8 text-center text-sm text-slate-400">Yükleniyor…</div>
        : items.length === 0 ? (
          <Card className="flex flex-col items-center p-10 text-center text-sm text-slate-500"><CheckCircle2 className="mb-2 h-8 w-8 text-emerald-400" />Bekleyen onayınız yok.</Card>
        ) : items.map(({ a, r, check, rfq, order }) => order ? (
          <Card key={a.id} className={`p-4 ${done[a.id] ? 'opacity-60' : ''}`}>
            <Link href={`/procure/siparisler/${order.id}`} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">{order.order_no} · Sipariş onayı · {a.approver_label}</p>
                <p className="truncate font-semibold text-slate-900">{order.vendor?.name}</p>
                <p className="text-xs text-slate-500">Satınalma: {names[order.buyer_id] || '—'} · teslim {fmtDate(order.expected_date) || '—'}</p>
              </div>
              <div className="shrink-0 text-right"><p className="text-lg font-bold text-slate-900">{tl(order.subtotal)}</p><p className="text-[11px] text-slate-400">KDV hariç</p></div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
            </Link>
            {done[a.id] ? <p className="mt-3 text-sm font-medium text-slate-600">{done[a.id]}</p> : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button disabled={!!busy} onClick={() => decide(a.id, true)} className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-5 w-5" />Onayla</button>
                <button disabled={!!busy} onClick={() => setReject({ id: a.id, note: '' })} className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white text-sm font-semibold text-rose-700 disabled:opacity-50"><X className="h-5 w-5" />Reddet</button>
              </div>
            )}
          </Card>
        ) : rfq ? (
          <Card key={a.id} className={`p-4 ${done[a.id] ? 'opacity-60' : ''}`}>
            <Link href={`/procure/rfq/${rfq.id}/karsilastir`} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">{rfq.rfq_no} · Teklif ödülü · {a.approver_label}</p>
                <p className="truncate font-semibold text-slate-900">{rfq.title}</p>
                <p className="text-xs text-slate-500">Satınalma: {names[rfq.awarded_by] || '—'} · asgari {rfq.min_quotes_required} teklif gerekiyordu</p>
              </div>
              <div className="shrink-0 text-right"><p className="text-lg font-bold text-slate-900">{tl(rfq.award_total)}</p><p className="text-[11px] text-slate-400">KDV hariç</p></div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
            </Link>
            {rfq.single_source_reason && <p className="mt-2 text-sm text-slate-700">Tek kaynak gerekçesi: “{rfq.single_source_reason}”</p>}
            {rfq.award_reason && <p className="mt-1 text-sm text-slate-700">Seçim gerekçesi: “{rfq.award_reason}”</p>}
            {done[a.id] ? <p className="mt-3 text-sm font-medium text-slate-600">{done[a.id]}</p> : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button disabled={!!busy} onClick={() => decide(a.id, true)} className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-5 w-5" />Onayla</button>
                <button disabled={!!busy} onClick={() => setReject({ id: a.id, note: '' })} className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white text-sm font-semibold text-rose-700 disabled:opacity-50"><X className="h-5 w-5" />Reddet</button>
              </div>
            )}
          </Card>
        ) : (
          <Card key={a.id} className={`p-4 ${done[a.id] ? 'opacity-60' : ''}`}>
            <Link href={`/procure/talepler/${r.id}`} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">{r.request_no} · {a.approver_label}{a.approver_user_id && a.approver_user_id !== user?.id ? ` · vekâleten (${names[a.approver_user_id] || ''})` : ''}</p>
                <p className="flex items-center gap-1.5 font-semibold text-slate-900">{r.priority === 'urgent' && <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />}<span className="truncate">{r.title}</span></p>
                <p className="text-xs text-slate-500">{names[r.requester_id] || '—'} · {ccNames[r.cost_center_id] || '—'}{r.needed_by ? ` · gerekli: ${fmtDate(r.needed_by)}` : ''}</p>
              </div>
              <div className="shrink-0 text-right"><p className="text-lg font-bold text-slate-900">{tl(r.estimated_total)}</p><p className="text-[11px] text-slate-400">KDV hariç</p></div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
            </Link>
            {r.justification && <p className="mt-2 text-sm text-slate-600">“{r.justification}”</p>}
            <div className="mt-2"><BudgetBox check={check} compact /></div>
            {done[a.id] ? <p className="mt-3 text-sm font-medium text-slate-600">{done[a.id]}</p> : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button disabled={!!busy} onClick={() => decide(a.id, true)} className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-5 w-5" />Onayla</button>
                <button disabled={!!busy} onClick={() => setReject({ id: a.id, note: '' })} className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white text-sm font-semibold text-rose-700 disabled:opacity-50"><X className="h-5 w-5" />Reddet</button>
              </div>
            )}
          </Card>
        ))}

      <Delegations isAdmin={isAdmin} names={names} />

      <Modal isOpen={!!reject} onClose={() => setReject(null)} title="Reddet"
        footer={<><Button variant="secondary" onClick={() => setReject(null)}>Vazgeç</Button><Button variant="danger" disabled={!!busy || !reject?.note.trim()} onClick={async () => { if (reject && await decide(reject.id, false, reject.note)) setReject(null); }}>Reddet</Button></>}>
        <textarea autoFocus className="w-full rounded-lg border border-slate-200 p-2 text-sm" rows={3} value={reject?.note || ''} onChange={e => setReject(x => x && { ...x, note: e.target.value })} placeholder="Red gerekçesi (zorunlu)" />
      </Modal>
    </div>
  );
}

// Vekâlet: izindeyken onaylarımı başkasına devret (yönetici herkesinkini görür)
function Delegations({ isAdmin, names }: { isAdmin: boolean; names: Record<string, string> }) {
  const supabase = createClient();
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({ from: '', to: '', start: new Date().toISOString().slice(0, 10), end: '', note: '' });
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    const [d, u] = await Promise.all([
      supabase.from('proc_delegations').select('*').gte('end_date', new Date().toISOString().slice(0, 10)).order('start_date'),
      loadPeople(supabase),
    ]);
    setRows(d.data || []);
    setUsers(u.map(x => ({ id: x.id, name: x.name })).sort((a, b) => a.name.localeCompare(b.name, 'tr')));
  };
  useEffect(() => { load(); }, [profile?.organization_id]);

  const save = async () => {
    setErr('');
    const { error } = await supabase.from('proc_delegations').insert({ from_user_id: isAdmin && f.from ? f.from : user?.id, to_user_id: f.to, start_date: f.start, end_date: f.end, note: f.note || null });
    if (error) { setErr(procError(error)); return; }
    setOpen(false); setF({ ...f, to: '', end: '', note: '' }); load();
  };
  const nm = (id: string) => names[id] || users.find(u => u.id === id)?.name || '—';
  const inp = 'h-9 w-full rounded-lg border border-slate-200 px-2 text-sm';

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><UserRoundCog className="h-4 w-4" />Vekâlet</p>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Vekil ata</Button>
      </div>
      <p className="mb-2 text-xs text-slate-500">İzindeyken onaylarınız belirlediğiniz tarihler arasında vekilinize düşer; vekil onayları "vekâleten" olarak kaydedilir.</p>
      {rows.length === 0 ? <p className="text-xs text-slate-400">Etkin veya planlanmış vekâlet yok.</p> : (
        <ul className="space-y-1">{rows.map(r => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1"><b>{nm(r.from_user_id)}</b> → {nm(r.to_user_id)} · {fmtDate(r.start_date)}–{fmtDate(r.end_date)}{r.note ? ` · ${r.note}` : ''}</span>
            {(r.from_user_id === user?.id || isAdmin) && <button aria-label="Vekâleti sil" className="text-slate-300 hover:text-rose-600" onClick={async () => { await supabase.from('proc_delegations').delete().eq('id', r.id); load(); }}><Trash2 className="h-3.5 w-3.5" /></button>}
          </li>
        ))}</ul>
      )}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Vekil ata"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button><Button disabled={!f.to || !f.end} onClick={save}>Kaydet</Button></>}>
        <div className="space-y-2">
          {isAdmin && <label className="block text-xs text-slate-600">Kimin adına<select className={inp} value={f.from} onChange={e => setF({ ...f, from: e.target.value })}><option value="">Kendim</option>{users.filter(u => u.id !== user?.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
          <label className="block text-xs text-slate-600">Vekil<select className={inp} value={f.to} onChange={e => setF({ ...f, to: e.target.value })}><option value="">— seçin</option>{users.filter(u => u.id !== (f.from || user?.id)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600">Başlangıç<input type="date" className={inp} value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /></label>
            <label className="text-xs text-slate-600">Bitiş<input type="date" className={inp} value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></label>
          </div>
          <label className="block text-xs text-slate-600">Not<input className={inp} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="Örn. yıllık izin" /></label>
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
      </Modal>
    </Card>
  );
}
