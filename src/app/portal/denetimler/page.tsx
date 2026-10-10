'use client';

import { useEffect, useState } from 'react';
import { usePortal, PortalTitle } from '@/components/portal/PortalShell';
import { Kpi } from '@/components/portal/common';
import { Badge, Button, Modal, Textarea } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { GRADE } from '@/lib/franchise';
import { signedPortalUrls } from '@/lib/portal';
import { Check, X, Minus, AlertTriangle } from 'lucide-react';

export default function PortalAudits() {
  const { supabase, refreshCounts } = usePortal();
  const [data, setData] = useState<any | null>(null);
  const [view, setView] = useState<any | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [close, setClose] = useState<any | null>(null);
  const load = () => supabase.rpc('portal_audits').then(({ data, error }: any) => setData(error ? { audits: [], actions: [] } : data));
  useEffect(() => { load(); }, []);

  const openAudit = async (a: any) => {
    setView(a);
    const ph = (a.answers || []).flatMap((x: any) => x.photos || []);
    if (ph.length) setUrls(await signedPortalUrls(supabase, ph));
  };
  const done = async () => {
    if (!close.note?.trim()) { alert('Yaptığınız düzeltmeyi kısaca yazın.'); return; }
    const { error } = await supabase.rpc('portal_audit_action_done', { p_id: close.id, p_note: close.note });
    if (error) { alert(error.message); return; }
    setClose(null); load(); refreshCounts();
  };

  if (!data) return <div className="flex h-60 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" /></div>;
  const audits: any[] = data.audits || [], actions: any[] = data.actions || [];
  const today = new Date().toISOString().slice(0, 10);
  const open = actions.filter(a => a.status === 'open');
  const last = audits[0];

  return (
    <div className="space-y-4">
      <PortalTitle title="Denetim & Standartlar" subtitle="Merkez denetim sonuçlarınız ve kapatmanız gereken düzeltici faaliyetler" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Son denetim puanı" value={last ? `%${last.score} · ${last.grade}` : '-'} sub={last ? formatDate(last.audited_at) : undefined} tone={last?.grade === 'D' ? 'red' : 'green'} />
        <Kpi label="Açık düzeltici faaliyet" value={String(open.length)} tone={open.length ? 'amber' : 'slate'} />
        <Kpi label="Termini geçen" value={String(open.filter(a => a.due_date < today).length)} tone="red" />
      </div>

      {open.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-2 text-sm font-semibold">Kapatmanız gereken faaliyetler</p>
          <div className="space-y-2">{open.map(a => (
            <div key={a.id} className={`flex flex-wrap items-start gap-2 rounded-lg border p-3 ${a.due_date < today ? 'border-red-200 bg-red-50' : ''}`}>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{a.item_text}{a.critical && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">KRİTİK</span>}</p>
                <p className="text-xs text-slate-600">{a.description}</p>
                <p className={`text-xs ${a.due_date < today ? 'font-semibold text-red-600' : 'text-slate-500'}`}>Termin: {formatDate(a.due_date)}</p></div>
              <Button size="sm" onClick={() => setClose({ id: a.id, note: '' })}>Düzelttim</Button>
            </div>
          ))}</div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-4">
        <p className="mb-2 text-sm font-semibold">Denetim geçmişi</p>
        {audits.length === 0 ? <p className="text-sm text-slate-500">Henüz paylaşılan denetim yok.</p> : audits.map(a => (
          <button key={a.id} onClick={() => openAudit(a)} className="flex w-full items-center gap-3 border-b py-2 text-left text-sm last:border-0 hover:bg-slate-50">
            <span className={`w-10 rounded text-center text-sm font-bold ${GRADE[a.grade]?.cls || ''}`}>{a.grade}</span>
            <span className="flex-1"><b>%{a.score}</b> · {a.template_name}<span className="block text-xs text-slate-500">{formatDate(a.audited_at)} · {a.auditor_name || ''}</span></span>
            {a.critical_fail && <Badge variant="danger">Kritik bulgu</Badge>}
          </button>
        ))}
        {actions.filter(a => a.status !== 'open').length > 0 && <p className="mt-2 text-xs text-slate-500">{actions.filter(a => a.status === 'verified').length} faaliyet merkez tarafından doğrulandı, {actions.filter(a => a.status === 'done').length} faaliyet doğrulama bekliyor.</p>}
      </div>

      <Modal isOpen={!!view} onClose={() => setView(null)} size="lg" title={view ? `Denetim · ${formatDate(view.audited_at)}` : ''}>
        {view && (
          <div className="space-y-3">
            <div className="flex items-center gap-3"><span className={`rounded-lg px-3 py-1 font-semibold ${GRADE[view.grade]?.cls}`}>{GRADE[view.grade]?.label}</span><span className="text-2xl font-bold">%{view.score}</span>
              {view.critical_fail && <span className="flex items-center gap-1 text-sm text-red-600"><AlertTriangle className="h-4 w-4" />Kritik bulgu</span>}</div>
            {view.summary && <p className="rounded-lg bg-slate-50 p-3 text-sm">{view.summary}</p>}
            {(view.answers || []).map((x: any) => (
              <div key={x.item_id} className="flex items-start gap-2 border-b pb-2 text-sm">
                {x.result === 'ok' ? <Check className="h-4 w-4 text-green-600" /> : x.result === 'fail' ? <X className="h-4 w-4 text-red-600" /> : <Minus className="h-4 w-4 text-slate-400" />}
                <div className="flex-1"><p>{x.text}</p>{x.note && <p className="text-xs text-slate-600">{x.note}</p>}
                  <div className="mt-1 flex gap-1">{(x.photos || []).map((p: string) => urls[p] && <a key={p} href={urls[p]} target="_blank" rel="noreferrer"><img src={urls[p]} alt="" className="h-14 w-14 rounded object-cover" /></a>)}</div></div>
              </div>
            ))}
          </div>
        )}
      </Modal>
      <Modal isOpen={!!close} onClose={() => setClose(null)} title="Düzeltici faaliyeti kapat"
        footer={<><Button variant="secondary" onClick={() => setClose(null)}>İptal</Button><Button onClick={done}>Gönder</Button></>}>
        {close && <Textarea label="Ne yaptınız?" rows={3} value={close.note} onChange={e => setClose({ ...close, note: e.target.value })} placeholder="Buzdolabı termostatı değiştirildi, ısı kayıt çizelgesi başlatıldı…" />}
      </Modal>
    </div>
  );
}
