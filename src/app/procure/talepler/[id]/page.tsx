'use client';

// Talep detayı: kalemler, ekler, onay adımları, bütçe kutusu, zaman çizelgesi ve yorum akışı
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import { Card, Button, Modal } from '@/components/ui';
import MoneyInput from '@/components/MoneyInput';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { BudgetBox, StatusBadge } from '@/components/procure/RequestBits';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import {
  APPROVAL_STATUS, BudgetCheck, Category, CostCenter, PROCURE_SQL_1A, UNITS, fmtDate, fmtDateTime, idList, openProcFile, procError, tl,
  uploadProcFile, useProcure,
} from '@/lib/procure';
import { AlertCircle, ArrowLeft, Ban, Camera, Check, ChevronDown, Edit2, MessageSquare, Paperclip, Plus, Send, ShieldAlert, Trash2, X } from 'lucide-react';

type Line = { id?: string; description: string; quantity: number; unit: string; est_unit_price: number | null; est_total?: number | null; spec_note?: string | null; product_id?: string | null };

export default function RequestDetailPage() {
  return (
    <div>
      <Header title="Talep" subtitle="Satınalma" />
      <ProcureGate>{p => <Detail p={p} />}</ProcureGate>
    </div>
  );
}

function Detail({ p }: { p: ReturnType<typeof useProcure> }) {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const { user } = useAuth();
  const [d, setD] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ lines: Line[]; justification: string; needed_by: string; cost_center_id: string; category_id: string; priority: string } | null>(null);
  const [reject, setReject] = useState<{ approvalId: string; note: string } | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  const [cancel, setCancel] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [oldRounds, setOldRounds] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const h = new URLSearchParams(window.location.search).get('hata'); if (h) setMsg(h); }, []);

  const load = useCallback(async () => {
    const r = await supabase.from('proc_requests').select('*').eq('id', id).maybeSingle();
    if (r.error) { setMissing(/relation|does not exist/i.test(r.error.message)); if (!/relation|does not exist/i.test(r.error.message)) setMsg(r.error.message); return; }
    if (!r.data) { setD({ notFound: true }); return; }
    const [lines, apps, evs, atts, check, mine, editable, ccs, cats, us] = await Promise.all([
      supabase.from('proc_request_lines').select('*').eq('request_id', id).order('sort'),
      supabase.from('proc_approvals').select('*').eq('subject_type', 'request').eq('subject_id', id).order('round', { ascending: false }).order('step_no'),
      supabase.from('proc_request_events').select('*').eq('request_id', id).order('created_at'),
      supabase.from('proc_attachments').select('*').eq('owner_type', 'request').eq('owner_id', id).order('created_at'),
      supabase.rpc('proc_budget_check', { p_request: id }),
      supabase.rpc('proc_my_pending_approvals'),
      supabase.rpc('proc_request_editable', { p_id: id }),
      supabase.from('proc_cost_centers').select('*').order('name'),
      supabase.from('proc_categories').select('*').order('name'),
      supabase.from('users').select('id, name, full_name, email'),
    ]);
    setD({
      r: r.data, lines: lines.data || [], apps: apps.data || [], evs: evs.data || [], atts: atts.data || [],
      check: (check.data || null) as BudgetCheck | null, myPending: idList(mine.data), editable: editable.data === true,
      ccs: (ccs.data || []) as CostCenter[], cats: (cats.data || []) as Category[],
      names: Object.fromEntries((us.data || []).map((u: any) => [u.id, u.name || u.full_name || u.email])),
    });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => PromiseLike<{ error: any }>, ok?: string) => {
    setBusy(true); setMsg('');
    const { error } = await fn();
    setBusy(false);
    if (error) { setMsg(procError(error)); return false; }
    if (ok) setMsg(ok);
    await load(); return true;
  };

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1A} /></div>;
  if (!d) return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;
  if (d.notFound) return <div className="p-6"><Card className="p-6 text-center text-sm text-slate-600">Talep bulunamadı veya görme yetkiniz yok. <Link href="/procure/talepler" className="text-blue-700 underline">Taleplere dön</Link></Card></div>;

  const r = d.r;
  const isMine = r.requester_id === user?.id;
  const round = r.approval_round;
  const curApps = d.apps.filter((a: any) => a.round === round);
  const prevApps = d.apps.filter((a: any) => a.round !== round);
  const myStep = curApps.find((a: any) => d.myPending.includes(a.id));
  const canSubmit = d.editable && ['draft', 'rejected'].includes(r.status);
  const canPrice = r.status === 'submitted' && (p.hasRole('buyer') || p.isAdmin);
  const canCancel = (isMine || p.hasRole('buyer') || p.isAdmin) && !['ordered', 'received', 'closed', 'cancelled'].includes(r.status);
  const canOverride = r.status === 'in_approval' && (p.hasRole('finance') || p.isAdmin) && d.check?.status === 'insufficient' && d.check?.mode === 'block' && !r.budget_override_by;
  const ccName = (x: string) => d.ccs.find((c: CostCenter) => c.id === x)?.name || '—';
  const catName = (x: string) => d.cats.find((c: Category) => c.id === x)?.name || '—';

  const startEdit = () => setEdit({
    lines: d.lines.map((l: any) => ({ ...l })), justification: r.justification || '', needed_by: r.needed_by || '',
    cost_center_id: r.cost_center_id || '', category_id: r.category_id || '', priority: r.priority,
  });
  const saveEdit = async () => {
    if (!edit) return false;
    const valid = edit.lines.filter(l => l.description.trim() && l.quantity > 0);
    if (!valid.length) { setMsg('En az bir kalem gerekli.'); return false; }
    setBusy(true); setMsg('');
    try {
      const up = await supabase.from('proc_requests').update({ justification: edit.justification.trim() || null, needed_by: edit.needed_by || null,
        cost_center_id: edit.cost_center_id || null, category_id: edit.category_id || null, priority: edit.priority }).eq('id', r.id);
      if (up.error) throw up.error;
      const keep = new Set(valid.filter(l => l.id).map(l => l.id));
      const del = d.lines.filter((l: any) => !keep.has(l.id)).map((l: any) => l.id);
      if (del.length) { const x = await supabase.from('proc_request_lines').delete().in('id', del); if (x.error) throw x.error; }
      for (const [i, l] of valid.entries()) {
        const row = { description: l.description.trim(), quantity: l.quantity, unit: l.unit, est_unit_price: l.est_unit_price, spec_note: l.spec_note || null, sort: i };
        const x = l.id ? await supabase.from('proc_request_lines').update(row).eq('id', l.id) : await supabase.from('proc_request_lines').insert({ ...row, request_id: r.id });
        if (x.error) throw x.error;
      }
      setEdit(null); await load(); return true;
    } catch (e: any) { setMsg(procError(e)); return false; } finally { setBusy(false); }
  };

  const addFile = async (f: File) => {
    setBusy(true); setMsg('');
    try { await uploadProcFile(supabase, f, `request/${r.id}`, { type: 'request', id: r.id }); await load(); }
    catch (e: any) { setMsg(procError(e)); } finally { setBusy(false); }
  };

  const setL = (i: number, patch: Partial<Line>) => setEdit(e => e && ({ ...e, lines: e.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }));
  const inp = 'h-9 w-full rounded-lg border border-slate-200 px-2 text-sm';

  return (
    <div className="mx-auto max-w-4xl space-y-3 p-3 sm:p-6">
      <Link href="/procure/talepler" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><ArrowLeft className="h-3.5 w-3.5" />Talepler</Link>

      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">{r.request_no || 'Taslak (numara gönderimde verilir)'}</p>
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-slate-900">{r.priority === 'urgent' && <AlertCircle className="h-4 w-4 text-rose-500" />}{r.title}</h2>
          </div>
          <StatusBadge status={r.status} />
        </div>
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-slate-500">Talep eden: </dt><dd className="inline text-slate-800">{d.names[r.requester_id] || '—'}</dd></div>
          <div><dt className="inline text-slate-500">Birim: </dt><dd className="inline text-slate-800">{ccName(r.cost_center_id)}</dd></div>
          <div><dt className="inline text-slate-500">Kategori: </dt><dd className="inline text-slate-800">{r.category_id ? catName(r.category_id) : '—'}</dd></div>
          <div><dt className="inline text-slate-500">Ne zamana: </dt><dd className="inline text-slate-800">{fmtDate(r.needed_by) || '—'}</dd></div>
          <div className="sm:col-span-2"><dt className="inline text-slate-500">Gerekçe: </dt><dd className="inline text-slate-800">{r.justification || '—'}</dd></div>
          {r.rejection_reason && r.status === 'rejected' && <div className="sm:col-span-2 text-rose-700"><dt className="inline">Red gerekçesi: </dt><dd className="inline">{r.rejection_reason}</dd></div>}
          {r.budget_override_reason && <div className="sm:col-span-2 text-amber-800"><dt className="inline">Bütçe aşımı onayı: </dt><dd className="inline">{r.budget_override_reason} ({d.names[r.budget_override_by] || ''})</dd></div>}
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          {canSubmit && !edit && <Button size="sm" disabled={busy} onClick={() => run(() => supabase.rpc('proc_request_submit', { p_id: r.id }), 'Talep gönderildi.')}><Send className="h-3.5 w-3.5" />{r.status === 'rejected' ? 'Yeniden gönder' : 'Gönder'}</Button>}
          {d.editable && !edit && <Button size="sm" variant="secondary" onClick={startEdit}><Edit2 className="h-3.5 w-3.5" />{canPrice ? 'Fiyatları gir' : 'Düzenle'}</Button>}
          {canPrice && !edit && <Button size="sm" disabled={busy || !r.estimated_total} onClick={() => run(() => supabase.rpc('proc_request_price', { p_id: r.id }), 'Onaya gönderildi.')}><Send className="h-3.5 w-3.5" />Onaya gönder</Button>}
          {canCancel && !edit && <Button size="sm" variant="ghost" onClick={() => setCancel('')}><Ban className="h-3.5 w-3.5" />İptal et</Button>}
          {r.status === 'draft' && isMine && !r.request_no && !edit && <Button size="sm" variant="ghost" onClick={async () => { if (confirm('Taslak silinsin mi?')) { const x = await supabase.from('proc_requests').delete().eq('id', r.id); if (x.error) setMsg(x.error.message); else window.location.href = '/procure/talepler'; } }}><Trash2 className="h-3.5 w-3.5" />Sil</Button>}
        </div>
        {msg && <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${/gönderildi|onaylandı|Kaydedildi/.test(msg) ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{msg}</p>}
      </Card>

      {/* Sıradaki onay benimse: tek dokunuş */}
      {myStep && (
        <Card className="border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-semibold text-slate-900">Onayınız bekleniyor · {myStep.approver_label}</p>
          <div className="mt-2"><BudgetBox check={d.check} /></div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
            <button disabled={busy} onClick={() => run(() => supabase.rpc('proc_approval_decide', { p_approval: myStep.id, p_approve: true, p_note: null }), 'Talep onaylandı.')} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4" />Onayla</button>
            <button disabled={busy} onClick={() => setReject({ approvalId: myStep.id, note: '' })} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white px-6 text-sm font-semibold text-rose-700 disabled:opacity-50"><X className="h-4 w-4" />Reddet</button>
          </div>
        </Card>
      )}

      {r.status !== 'draft' && !myStep && d.check && <BudgetBox check={d.check} />}
      {canOverride && (
        <Card className="flex flex-wrap items-center gap-2 border-rose-200 p-3 text-sm">
          <ShieldAlert className="h-4 w-4 text-rose-600" /><span className="flex-1 text-slate-700">Bütçe yetersiz ve politika "engelle". Onay zincirinin devam etmesi için bütçe aşımını onaylayın.</span>
          <Button size="sm" variant="danger" onClick={() => setOverride('')}>Bütçe aşımını onayla</Button>
        </Card>
      )}

      {/* Kalemler */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <p className="text-sm font-semibold text-slate-800">Kalemler</p>
          <p className="text-sm text-slate-700">Tahmini toplam: <b>{r.estimated_total != null ? tl(r.estimated_total) : 'fiyatlandırılacak'}</b> <span className="text-xs text-slate-400">KDV hariç</span></p>
        </div>
        {!edit ? (
          <ul className="divide-y divide-slate-100">
            {d.lines.map((l: any) => (
              <li key={l.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1"><p className="text-slate-800">{l.description}</p>{l.spec_note && <p className="text-xs text-slate-500">{l.spec_note}</p>}</div>
                <div className="shrink-0 text-right text-slate-600">{Number(l.quantity).toLocaleString('tr-TR')} {l.unit}{l.est_unit_price != null && <> × {tl(l.est_unit_price)}</>}<p className="font-medium text-slate-800">{l.est_total != null ? tl(l.est_total) : '—'}</p></div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3 p-3">
            {edit.lines.map((l, i) => (
              <div key={l.id || i} className="space-y-1.5 rounded-lg border border-slate-200 p-2">
                <div className="flex gap-2">
                  <input className={inp} value={l.description} onChange={e => setL(i, { description: e.target.value })} placeholder="Ne lazım" />
                  <button onClick={() => setEdit({ ...edit, lines: edit.lines.filter((_, k) => k !== i) })} className="rounded p-1 text-slate-400 hover:text-rose-600" aria-label="Sil"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input className={inp} type="number" min={0} value={l.quantity} onChange={e => setL(i, { quantity: Number(e.target.value) })} />
                  <select className={inp} value={l.unit} onChange={e => setL(i, { unit: e.target.value })}>{[...new Set([l.unit, ...UNITS])].map(u => <option key={u}>{u}</option>)}</select>
                  <div className="flex items-center gap-1"><span className="text-xs text-slate-400">₺/birim</span><MoneyInput className={inp} value={l.est_unit_price} onChange={v => setL(i, { est_unit_price: v })} /></div>
                </div>
                <input className={inp} value={l.spec_note || ''} onChange={e => setL(i, { spec_note: e.target.value })} placeholder="Teknik not / marka-model tercihi (opsiyonel)" />
              </div>
            ))}
            <button onClick={() => setEdit({ ...edit, lines: [...edit.lines, { description: '', quantity: 1, unit: 'Adet', est_unit_price: null }] })} className="flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-sm text-slate-600"><Plus className="h-4 w-4" />Kalem ekle</button>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-600">Birim<select className={inp} value={edit.cost_center_id} onChange={e => setEdit({ ...edit, cost_center_id: e.target.value })}><option value="">—</option>{d.ccs.filter((c: CostCenter) => c.is_active).map((c: CostCenter) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="text-xs text-slate-600">Kategori<select className={inp} value={edit.category_id} onChange={e => setEdit({ ...edit, category_id: e.target.value })}><option value="">—</option>{d.cats.filter((c: Category) => c.is_active).map((c: Category) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="text-xs text-slate-600">Ne zamana<input type="date" className={inp} value={edit.needed_by} onChange={e => setEdit({ ...edit, needed_by: e.target.value })} /></label>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={edit.priority === 'urgent'} onChange={e => setEdit({ ...edit, priority: e.target.checked ? 'urgent' : 'normal' })} />Acil</label>
              <label className="text-xs text-slate-600 sm:col-span-2">Gerekçe<textarea className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" rows={2} value={edit.justification} onChange={e => setEdit({ ...edit, justification: e.target.value })} /></label>
            </div>
            <div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setEdit(null)}>Vazgeç</Button><Button size="sm" disabled={busy} onClick={saveEdit}>Kaydet</Button></div>
          </div>
        )}
      </Card>

      {/* Onay adımları */}
      {d.apps.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-slate-800">Onay adımları{round > 1 ? ` · ${round}. tur` : ''}</p>
          <ol className="space-y-2">
            {curApps.map((a: any) => <ApprovalRow key={a.id} a={a} names={d.names} active={a.status === 'pending' && a.id === curApps.find((x: any) => x.status === 'pending')?.id} />)}
          </ol>
          {prevApps.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <button onClick={() => setOldRounds(!oldRounds)} className="flex items-center gap-1 text-xs text-slate-500"><ChevronDown className={`h-3.5 w-3.5 transition-transform ${oldRounds ? 'rotate-180' : ''}`} />Önceki turlar ({prevApps.length} adım)</button>
              {oldRounds && <ol className="mt-2 space-y-2 opacity-70">{prevApps.map((a: any) => <ApprovalRow key={a.id} a={a} names={d.names} showRound />)}</ol>}
            </div>
          )}
        </Card>
      )}

      {/* Ekler */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Ekler ({d.atts.length})</p>
          {!['cancelled', 'closed'].includes(r.status) && (
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => camRef.current?.click()}><Camera className="h-3.5 w-3.5" />Fotoğraf</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}><Paperclip className="h-3.5 w-3.5" />Dosya</Button>
            </div>
          )}
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addFile(f); }} />
          <input ref={fileRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addFile(f); }} />
        </div>
        {d.atts.length === 0 ? <p className="text-xs text-slate-400">Ek yok.</p> : (
          <ul className="space-y-1">{d.atts.map((a: any) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <Paperclip className="h-3.5 w-3.5 text-slate-400" />
              <button className="min-w-0 flex-1 truncate text-left text-blue-700 hover:underline" onClick={() => openProcFile(supabase, a.storage_path, a.file_name).catch(e => setMsg(e.message))}>{a.file_name}</button>
              <span className="text-[11px] text-slate-400">{d.names[a.created_by] || ''} · {fmtDate(a.created_at)}</span>
              {(a.created_by === user?.id || p.isAdmin) && <button aria-label="Eki sil" className="text-slate-300 hover:text-rose-600" onClick={async () => { if (!confirm('Ek silinsin mi?')) return; await supabase.storage.from('procure-files').remove([a.storage_path]); await run(() => supabase.from('proc_attachments').delete().eq('id', a.id)); }}><X className="h-3.5 w-3.5" /></button>}
            </li>
          ))}</ul>
        )}
      </Card>

      {/* Zaman çizelgesi + yorumlar */}
      <Card className="p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><MessageSquare className="h-4 w-4" />Geçmiş ve yorumlar</p>
        <ol className="space-y-2 border-l-2 border-slate-100 pl-3">
          <li className="text-xs text-slate-500"><span className="font-medium text-slate-700">{d.names[r.requester_id] || '—'}</span> talebi oluşturdu · {fmtDateTime(r.created_at)}</li>
          {d.evs.map((e: any) => (
            <li key={e.id} className={`text-xs ${e.kind === 'comment' ? 'rounded-lg bg-slate-50 p-2 text-slate-800' : 'text-slate-500'}`}>
              <span className="font-medium text-slate-700">{e.actor_name || 'Sistem'}</span> · {fmtDateTime(e.created_at)}
              <p className={e.kind === 'comment' ? 'mt-0.5 whitespace-pre-wrap text-sm' : ''}>{e.message}</p>
            </li>
          ))}
        </ol>
        {r.status !== 'draft' && (
          <div className="mt-3 flex gap-2">
            <input className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm" value={comment} onChange={e => setComment(e.target.value)} placeholder="Yorum yazın (talep eden, satınalma, onaycı görür)" />
            <Button disabled={busy || !comment.trim()} onClick={async () => { if (await run(() => supabase.rpc('proc_request_comment', { p_id: r.id, p_text: comment }))) setComment(''); }}><Send className="h-4 w-4" /></Button>
          </div>
        )}
      </Card>

      <Modal isOpen={!!reject} onClose={() => setReject(null)} title="Talebi reddet"
        footer={<><Button variant="secondary" onClick={() => setReject(null)}>Vazgeç</Button><Button variant="danger" disabled={busy || !reject?.note.trim()} onClick={async () => { if (reject && await run(() => supabase.rpc('proc_approval_decide', { p_approval: reject.approvalId, p_approve: false, p_note: reject.note }), 'Talep reddedildi.')) setReject(null); }}>Reddet</Button></>}>
        <textarea autoFocus className="w-full rounded-lg border border-slate-200 p-2 text-sm" rows={3} value={reject?.note || ''} onChange={e => setReject(x => x && { ...x, note: e.target.value })} placeholder="Red gerekçesi (zorunlu) — talep eden düzeltip yeniden gönderebilir" />
      </Modal>
      <Modal isOpen={override !== null} onClose={() => setOverride(null)} title="Bütçe aşımını onayla"
        footer={<><Button variant="secondary" onClick={() => setOverride(null)}>Vazgeç</Button><Button variant="danger" disabled={busy || !override?.trim()} onClick={async () => { if (await run(() => supabase.rpc('proc_budget_override', { p_request: r.id, p_reason: override }), 'Bütçe aşımı onaylandı.')) setOverride(null); }}>Onayla</Button></>}>
        <BudgetBox check={d.check} />
        <textarea autoFocus className="mt-3 w-full rounded-lg border border-slate-200 p-2 text-sm" rows={3} value={override || ''} onChange={e => setOverride(e.target.value)} placeholder="Gerekçe (zorunlu, kayda geçer)" />
      </Modal>
      <Modal isOpen={cancel !== null} onClose={() => setCancel(null)} title="Talebi iptal et"
        footer={<><Button variant="secondary" onClick={() => setCancel(null)}>Vazgeç</Button><Button variant="danger" disabled={busy || (r.status !== 'draft' && !cancel?.trim())} onClick={async () => { if (await run(() => supabase.rpc('proc_request_cancel', { p_id: r.id, p_reason: cancel }))) setCancel(null); }}>İptal et</Button></>}>
        <textarea autoFocus className="w-full rounded-lg border border-slate-200 p-2 text-sm" rows={3} value={cancel || ''} onChange={e => setCancel(e.target.value)} placeholder="İptal gerekçesi" />
      </Modal>
    </div>
  );
}

function ApprovalRow({ a, names, active, showRound }: { a: any; names: Record<string, string>; active?: boolean; showRound?: boolean }) {
  const st = APPROVAL_STATUS[a.status] || { label: a.status, cls: '' };
  const who = a.approver_user_id ? names[a.approver_user_id] : null;
  return (
    <li className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${active ? 'bg-amber-50' : ''}`}>
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium text-slate-600">{a.step_no}</span>
      <div className="min-w-0 flex-1">
        <p className="text-slate-800">{a.approver_label}{who && <span className="text-slate-500"> · {who}</span>}{showRound && <span className="text-xs text-slate-400"> · {a.round}. tur</span>}</p>
        {a.decided_at && a.status !== 'pending' && <p className="text-[11px] text-slate-500">{a.decided_by ? names[a.decided_by] || '' : ''}{a.delegated_from ? ` (vekâleten, asıl: ${names[a.delegated_from] || '—'})` : ''} · {fmtDateTime(a.decided_at)}</p>}
        {a.note && <p className="text-xs text-slate-600">“{a.note}”</p>}
      </div>
      <span className={`shrink-0 text-xs font-medium ${st.cls}`}>{active ? 'Sırada' : st.label}</span>
    </li>
  );
}
