'use client';

// Tedarikçi uygunsuzlukları (ISO 9001 · 8.4 / 10.2): kök neden → düzeltici faaliyet → etkinlik kontrolü → kapanış
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Plus } from 'lucide-react';
import { Card, Button, Modal } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { ISSUE_SEVERITY, ISSUE_STATUS, fmtDate, procError } from '@/lib/procure';

const inp = 'h-9 w-full rounded-lg border border-slate-200 px-2 text-sm disabled:bg-slate-50';

export default function IssuePanel({ vendorId, orderId, canManage, canOpen }: { vendorId: string; orderId?: string; canManage: boolean; canOpen: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    let q = supabase.from('proc_vendor_issues').select('*, order:order_id(order_no)').eq('vendor_id', vendorId).order('created_at', { ascending: false });
    if (orderId) q = q.eq('order_id', orderId);
    const { data, error } = await q;
    setRows(error ? [] : data || []);
  }, [vendorId, orderId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setErr('');
    const row = { title: edit.title, description: edit.description || null, severity: edit.severity, root_cause: edit.root_cause || null, corrective_action: edit.corrective_action || null,
      action_owner: edit.action_owner || null, action_due: edit.action_due || null, effectiveness_check: edit.effectiveness_check || null, status: edit.status };
    const { error } = edit.id ? await supabase.from('proc_vendor_issues').update(row).eq('id', edit.id)
      : await supabase.from('proc_vendor_issues').insert({ ...row, vendor_id: vendorId, order_id: orderId || null, source: 'manual' });
    if (error) { setErr(procError(error)); return; }
    setEdit(null); load();
  };

  if (rows === null) return null;
  const open = rows.filter(r => r.status !== 'closed').length;
  const ro = !canManage && !!edit?.id;
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><AlertTriangle className={`h-4 w-4 ${open ? 'text-amber-600' : 'text-slate-400'}`} />Uygunsuzluklar{rows.length ? ` (${open} açık / ${rows.length})` : ''}</p>
        {canOpen && <Button size="sm" variant="secondary" onClick={() => setEdit({ title: '', severity: 'minor', status: 'open' })}><Plus className="h-3.5 w-3.5" />Uygunsuzluk aç</Button>}
      </div>
      {rows.length === 0 ? <p className="text-xs text-slate-400">Kayıt yok. Mal kabulde red, kalite sorunu veya eksik hizmet olursa otomatik açılır.</p> : (
        <ul className="divide-y divide-slate-100">{rows.map(r => (
          <li key={r.id}><button onClick={() => setEdit({ ...r })} className="flex w-full items-start gap-2 py-2 text-left text-sm hover:bg-slate-50">
            <span className={`mt-0.5 shrink-0 rounded-full border px-1.5 text-[10px] font-medium ${ISSUE_SEVERITY[r.severity]?.cls}`}>{ISSUE_SEVERITY[r.severity]?.label}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-slate-800">{r.title}</span><span className="text-[11px] text-slate-500">{fmtDate(r.created_at)}{r.order?.order_no ? ` · ${r.order.order_no}` : ''}{r.action_due ? ` · termin ${fmtDate(r.action_due)}` : ''}</span></span>
            <span className={`shrink-0 text-xs ${r.status === 'closed' ? 'text-emerald-700' : 'text-amber-700'}`}>{ISSUE_STATUS[r.status]}</span>
          </button></li>
        ))}</ul>
      )}
      {!orderId && rows.some(r => r.order_id) && <p className="mt-1 text-[11px] text-slate-400">Sipariş bağlantılı kayıtlar sipariş ekranından da izlenir.</p>}

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Uygunsuzluk' : 'Yeni uygunsuzluk'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Kapat</Button>{(canManage || !edit?.id) && <Button disabled={!edit?.title?.trim()} onClick={save}>Kaydet</Button>}</>}>
        {edit && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-600 sm:col-span-2">Başlık<input disabled={ro} className={inp} value={edit.title || ''} onChange={e => setEdit({ ...edit, title: e.target.value })} /></label>
            <label className="text-xs text-slate-600 sm:col-span-2">Açıklama<textarea disabled={ro} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" rows={3} value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} /></label>
            <label className="text-xs text-slate-600">Önem<select disabled={ro} className={inp} value={edit.severity} onChange={e => setEdit({ ...edit, severity: e.target.value })}>{Object.entries(ISSUE_SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <label className="text-xs text-slate-600">Durum<select disabled={!canManage} className={inp} value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}>{Object.entries(ISSUE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {(canManage || edit.root_cause) && <>
              <label className="text-xs text-slate-600 sm:col-span-2">Kök neden<textarea disabled={!canManage} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" rows={2} value={edit.root_cause || ''} onChange={e => setEdit({ ...edit, root_cause: e.target.value })} /></label>
              <label className="text-xs text-slate-600 sm:col-span-2">Düzeltici faaliyet<textarea disabled={!canManage} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" rows={2} value={edit.corrective_action || ''} onChange={e => setEdit({ ...edit, corrective_action: e.target.value })} /></label>
              <label className="text-xs text-slate-600">Sorumlu<input disabled={!canManage} className={inp} value={edit.action_owner || ''} onChange={e => setEdit({ ...edit, action_owner: e.target.value })} /></label>
              <label className="text-xs text-slate-600">Termin<input disabled={!canManage} type="date" className={inp} value={edit.action_due || ''} onChange={e => setEdit({ ...edit, action_due: e.target.value })} /></label>
              <label className="text-xs text-slate-600 sm:col-span-2">Etkinlik kontrolü (kapatmak için zorunlu)<textarea disabled={!canManage} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" rows={2} value={edit.effectiveness_check || ''} onChange={e => setEdit({ ...edit, effectiveness_check: e.target.value })} /></label>
            </>}
            {edit.order_id && !orderId && <Link href={`/procure/siparisler/${edit.order_id}`} className="text-xs text-blue-700">Siparişe git →</Link>}
            {err && <p className="text-sm text-rose-600 sm:col-span-2">{err}</p>}
          </div>
        )}
      </Modal>
    </Card>
  );
}
