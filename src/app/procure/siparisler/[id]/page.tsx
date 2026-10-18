'use client';

// Sipariş detayı: kalemler + teslim durumu, onay adımları, tedarikçiye gönder (bağlantı/WhatsApp), tedarikçi onayı,
// mal kabuller, uygunsuzluklar, revizyon/iptal, taslakta düzenleme
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import { Card, Button, Modal } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import IssuePanel from '@/components/procure/IssuePanel';
import { OrderStatusBadge } from '@/components/procure/RequestBits';
import { createClient } from '@/lib/supabase';
import {
  APPROVAL_STATUS, PROCURE_SQL_1C, RECEIVABLE, fmtDate, fmtDateTime, loadPeople, openProcFile, orderLink, peopleMap, procError, tl, useProcure, waNumber,
} from '@/lib/procure';
import { ArrowLeft, Ban, CheckCircle2, Copy, ExternalLink, History, MessageCircle, PackageCheck, PencilLine, Printer, Save, Send } from 'lucide-react';

export default function OrderDetailPage() {
  return (
    <div>
      <Header title="Sipariş" subtitle="Satınalma" />
      <ProcureGate>{p => <OrderDetail p={p} />}</ProcureGate>
    </div>
  );
}

function OrderDetail({ p }: { p: ReturnType<typeof useProcure> }) {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const isBuyer = p.hasRole('buyer') || p.isAdmin;
  const [d, setD] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [reason, setReason] = useState<{ kind: 'revise' | 'cancel'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const o = await supabase.from('proc_orders').select('*, vendor:vendor_id(id, name, phone, email, tax_number)').eq('id', id).maybeSingle();
    if (o.error) { setMissing(/relation|does not exist/i.test(o.error.message)); if (!/relation|does not exist/i.test(o.error.message)) setMsg(o.error.message); return; }
    if (!o.data) { setD({ notFound: true }); return; }
    const [ls, apps, rcs, reqs, prof, people, org] = await Promise.all([
      supabase.from('proc_order_lines').select('*').eq('order_id', id).order('sort'),
      supabase.from('proc_approvals').select('*').eq('subject_type', 'order').eq('subject_id', id).order('round', { ascending: false }).order('step_no'),
      supabase.from('proc_receipts').select('*, lines:proc_receipt_lines(*)').eq('order_id', id).order('received_at'),
      supabase.from('proc_requests').select('id, request_no, title').in('id', o.data.request_ids || []),
      supabase.from('proc_vendor_profiles').select('contact_name, contact_phone, contact_email').eq('customer_id', o.data.vendor_id).maybeSingle(),
      loadPeople(supabase),
      supabase.from('organizations').select('name').eq('id', o.data.organization_id).maybeSingle(),
    ]);
    const rcIds = (rcs.data || []).map((r: any) => r.id);
    const atts = rcIds.length ? (await supabase.from('proc_attachments').select('*').eq('owner_type', 'receipt').in('owner_id', rcIds)).data || [] : [];
    setD({ o: o.data, lines: ls.data || [], apps: apps.data || [], receipts: (rcs.data || []).filter((r: any) => r.status === 'confirmed'), reqs: reqs.data || [],
      prof: prof.data, names: peopleMap(people), org: org.data?.name || '', atts });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => PromiseLike<{ error: any }>, ok?: string) => {
    setBusy(true); setMsg('');
    const { error } = await fn();
    setBusy(false);
    if (error) { setMsg(procError(error, PROCURE_SQL_1C)); return false; }
    if (ok) setMsg(ok); await load(); return true;
  };

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1C} /></div>;
  if (!d) return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;
  if (d.notFound) return <div className="p-6"><Card className="p-6 text-center text-sm text-slate-600">Sipariş bulunamadı veya görme yetkiniz yok. <Link href="/procure/siparisler" className="text-blue-700 underline">Siparişlere dön</Link></Card></div>;
  const o = d.o;
  const round = o.approval_round;
  const cur = d.apps.filter((a: any) => a.round === round);
  const phone = waNumber(d.prof?.contact_phone || o.vendor?.phone);
  const link = orderLink(o.share_token);
  const wa = `Merhaba ${d.prof?.contact_name || o.vendor?.name}, ${d.org} adına ${o.order_no}${o.revision ? ` (rev. ${o.revision})` : ''} numaralı siparişimiz ektedir. Siparişi görüntüleyip onaylamak ve tahmini teslim tarihini bildirmek için:\n${link}`;
  const canReceive = RECEIVABLE.includes(o.status) && (isBuyer || p.hasRole('receiver'));

  const saveEdit = async () => {
    setBusy(true); setMsg('');
    try {
      const h = await supabase.from('proc_orders').update({ expected_date: edit.expected_date || null, delivery_address: edit.delivery_address || null, payment_term_days: edit.payment_term_days === '' ? null : Number(edit.payment_term_days), notes: edit.notes || null, terms: edit.terms || null }).eq('id', o.id);
      if (h.error) throw h.error;
      for (const l of edit.lines) {
        const x = await supabase.from('proc_order_lines').update({ quantity: Number(l.quantity), unit_price: Number(l.unit_price), discount_pct: Number(l.discount_pct) || 0 }).eq('id', l.id);
        if (x.error) throw x.error;
      }
      setEdit(null); await load();
    } catch (e: any) { setMsg(procError(e, PROCURE_SQL_1C)); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-3 p-3 sm:p-6">
      <Link href="/procure/siparisler" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><ArrowLeft className="h-3.5 w-3.5" />Siparişler</Link>
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">{o.order_no || 'Taslak'}{o.revision ? ` · revizyon ${o.revision}` : ''} · {fmtDate(o.order_date)} · satınalma: {d.names[o.buyer_id] || '—'}</p>
            <h2 className="text-base font-semibold text-slate-900"><Link href={`/procure/tedarikciler/${o.vendor_id}`} className="hover:text-blue-700">{o.vendor?.name}</Link></h2>
            <p className="mt-1 text-xs text-slate-500">Talepler: {d.reqs.map((q: any) => <Link key={q.id} href={`/procure/talepler/${q.id}`} className="mr-2 text-blue-700 hover:underline">{q.request_no}</Link>)}
              {o.rfq_id && <Link href={`/procure/rfq/${o.rfq_id}/karsilastir`} className="text-blue-700 hover:underline">karşılaştırma</Link>}</p>
          </div>
          <OrderStatusBadge status={o.status} />
        </div>
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-slate-500">Beklenen teslim: </dt><dd className="inline">{fmtDate(o.expected_date) || '—'}</dd></div>
          <div><dt className="inline text-slate-500">Vade: </dt><dd className="inline">{o.payment_term_days != null ? `${o.payment_term_days} gün` : '—'}</dd></div>
          <div className="sm:col-span-2"><dt className="inline text-slate-500">Teslim adresi: </dt><dd className="inline">{o.delivery_address || '—'}</dd></div>
          {o.rejection_reason && o.status === 'draft' && <div className="text-rose-700 sm:col-span-2">Onayda reddedildi: {o.rejection_reason}</div>}
          {o.revision_reason && <div className="text-slate-600 sm:col-span-2">Son revizyon gerekçesi: {o.revision_reason}</div>}
          {o.cancel_reason && <div className="text-slate-600 sm:col-span-2">İptal gerekçesi: {o.cancel_reason}</div>}
        </dl>
        {o.acknowledged_at && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Tedarikçi onayladı: {o.acknowledged_by_name} · {fmtDateTime(o.acknowledged_at)} · tahmini teslim <b className="mx-1">{fmtDate(o.ack_expected_date)}</b>{o.ack_note ? ` · “${o.ack_note}”` : ''}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {isBuyer && o.status === 'draft' && !edit && <Button size="sm" variant="secondary" onClick={() => setEdit({ ...o, payment_term_days: o.payment_term_days ?? '', lines: d.lines.map((l: any) => ({ ...l })) })}><PencilLine className="h-3.5 w-3.5" />Düzenle</Button>}
          {isBuyer && o.status === 'draft' && !edit && <Button size="sm" disabled={busy} onClick={() => run(() => supabase.rpc('proc_order_submit', { p_id: o.id }), 'Sipariş onaya gönderildi.')}><Send className="h-3.5 w-3.5" />Onaya gönder</Button>}
          {isBuyer && o.status === 'approved' && <Button size="sm" disabled={busy} onClick={() => run(() => supabase.rpc('proc_order_send', { p_id: o.id }), 'Sipariş gönderildi olarak işaretlendi. Bağlantıyı tedarikçiye iletin.')}><Send className="h-3.5 w-3.5" />Tedarikçiye gönder</Button>}
          {o.order_no && <a href={`/procure/siparisler/${o.id}/print`} target="_blank" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700"><Printer className="h-3.5 w-3.5" />Sipariş PDF</a>}
          {canReceive && <Link href={`/procure/kabul?siparis=${o.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-[#10B981] px-3 py-1.5 text-xs font-medium text-white"><PackageCheck className="h-3.5 w-3.5" />Teslim al</Link>}
          {isBuyer && ['pending_approval', 'approved', 'sent', 'acknowledged'].includes(o.status) && d.receipts.length === 0 && <Button size="sm" variant="ghost" onClick={() => setReason({ kind: 'revise', text: '' })}><History className="h-3.5 w-3.5" />Revize et</Button>}
          {isBuyer && ['draft', 'pending_approval', 'approved', 'sent', 'acknowledged'].includes(o.status) && <Button size="sm" variant="ghost" onClick={() => setReason({ kind: 'cancel', text: '' })}><Ban className="h-3.5 w-3.5" />İptal</Button>}
        </div>
        {['sent', 'acknowledged', 'partially_received'].includes(o.status) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700"><Copy className="h-3 w-3" />{copied ? 'Kopyalandı' : 'Bağlantıyı kopyala'}</button>
            <a href={`https://wa.me/${phone}?text=${encodeURIComponent(wa)}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs text-emerald-700"><MessageCircle className="h-3 w-3" />WhatsApp{!phone && ' (numara yok)'}</a>
            <a href={`/po/${o.share_token}`} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700"><ExternalLink className="h-3 w-3" />Tedarikçi sayfası{o.view_count ? ` (${o.view_count} görüntüleme)` : ''}</a>
          </div>
        )}
        {msg && <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${/gönderildi|işaretlendi|kaydedildi|revize|iptal edildi/i.test(msg) ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{msg}</p>}
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-3 py-2">Kalem</th><th className="px-3 py-2 text-right">Miktar</th><th className="px-3 py-2 text-right">Birim fiyat</th><th className="px-3 py-2 text-right">Tutar</th><th className="px-3 py-2">Teslim</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{(edit ? edit.lines : d.lines).map((l: any, i: number) => (
            <tr key={l.id}>
              <td className="px-3 py-2"><p className="text-slate-800">{l.description}</p><p className="text-[11px] text-slate-500">{[l.brand_model, l.is_service && 'hizmet', l.asset_tag_required && 'demirbaş (Faz 2 kaydı)'].filter(Boolean).join(' · ')}</p></td>
              <td className="px-3 py-2 text-right">{edit ? <input type="number" className="h-8 w-20 rounded border px-1 text-right" value={l.quantity} onChange={e => setEdit({ ...edit, lines: edit.lines.map((x: any, k: number) => k === i ? { ...x, quantity: e.target.value } : x) })} /> : `${Number(l.quantity).toLocaleString('tr-TR')} ${l.unit}`}</td>
              <td className="px-3 py-2 text-right">{edit ? <input type="number" step="0.01" className="h-8 w-24 rounded border px-1 text-right" value={l.unit_price} onChange={e => setEdit({ ...edit, lines: edit.lines.map((x: any, k: number) => k === i ? { ...x, unit_price: e.target.value } : x) })} /> : <>{tl(l.unit_price)}{Number(l.discount_pct) > 0 && <span className="block text-[11px] text-slate-500">%{Number(l.discount_pct)} isk.</span>}</>}</td>
              <td className="px-3 py-2 text-right">{edit ? '—' : tl(l.line_total)}<span className="block text-[11px] text-slate-500">KDV %{Number(l.vat_rate)}</span></td>
              <td className="px-3 py-2 text-xs">{Number(l.received_qty) > 0 || Number(l.rejected_qty) > 0 ? <><span className={Number(l.received_qty) >= Number(l.quantity) ? 'text-emerald-700' : 'text-teal-700'}>{Number(l.received_qty).toLocaleString('tr-TR')}/{Number(l.quantity).toLocaleString('tr-TR')} alındı</span>{Number(l.rejected_qty) > 0 && <span className="block text-rose-600">{Number(l.rejected_qty).toLocaleString('tr-TR')} red</span>}</> : <span className="text-slate-400">—</span>}</td>
            </tr>
          ))}</tbody>
          <tfoot className="border-t bg-slate-50 text-sm"><tr><td colSpan={3} className="px-3 py-2 text-right text-slate-600">Ara toplam / KDV / Genel toplam</td><td className="px-3 py-2 text-right font-semibold" colSpan={2}>{tl(o.subtotal)} · {tl(o.vat_total)} · {tl(o.total)}</td></tr></tfoot>
        </table>
        {edit && (
          <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2">
            <label className="text-xs text-slate-600">Beklenen teslim<input type="date" className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" value={edit.expected_date || ''} onChange={e => setEdit({ ...edit, expected_date: e.target.value })} /></label>
            <label className="text-xs text-slate-600">Vade (gün)<input type="number" className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" value={edit.payment_term_days} onChange={e => setEdit({ ...edit, payment_term_days: e.target.value })} /></label>
            <label className="text-xs text-slate-600 sm:col-span-2">Teslim adresi<input className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" value={edit.delivery_address || ''} onChange={e => setEdit({ ...edit, delivery_address: e.target.value })} /></label>
            <label className="text-xs text-slate-600 sm:col-span-2">Şartlar<textarea className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" rows={2} value={edit.terms || ''} onChange={e => setEdit({ ...edit, terms: e.target.value })} /></label>
            <label className="text-xs text-slate-600 sm:col-span-2">Not<input className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" value={edit.notes || ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></label>
            <div className="flex justify-end gap-2 sm:col-span-2"><Button size="sm" variant="secondary" onClick={() => setEdit(null)}>Vazgeç</Button><Button size="sm" disabled={busy} onClick={saveEdit}><Save className="h-3.5 w-3.5" />Kaydet</Button></div>
          </div>
        )}
      </Card>

      {cur.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-slate-800">Sipariş onayı{round > 1 ? ` · ${round}. tur` : ''}</p>
          <ol className="space-y-1.5">{cur.map((a: any) => (
            <li key={a.id} className="flex items-start gap-2 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px]">{a.step_no}</span>
              <span className="flex-1">{a.approver_label}{a.approver_user_id && <span className="text-slate-500"> · {d.names[a.approver_user_id]}</span>}
                {a.decided_at && a.status !== 'pending' && <span className="block text-[11px] text-slate-500">{d.names[a.decided_by] || ''}{a.delegated_from ? ' (vekâleten)' : ''} · {fmtDateTime(a.decided_at)}{a.note ? ` · “${a.note}”` : ''}</span>}</span>
              <span className={`text-xs ${APPROVAL_STATUS[a.status]?.cls}`}>{APPROVAL_STATUS[a.status]?.label}</span>
            </li>
          ))}</ol>
        </Card>
      )}

      <Card className="p-4">
        <p className="mb-2 text-sm font-semibold text-slate-800">Mal kabuller ({d.receipts.length})</p>
        {d.receipts.length === 0 ? <p className="text-xs text-slate-400">Henüz teslim alınmadı.</p> : (
          <ul className="divide-y divide-slate-100">{d.receipts.map((r: any) => (
            <li key={r.id} className="py-2 text-sm">
              <p className="text-slate-800">{r.receipt_no} · {fmtDateTime(r.confirmed_at || r.received_at)} · {d.names[r.received_by] || '—'}{r.delivery_note_no ? ` · irsaliye ${r.delivery_note_no}` : ''}</p>
              <p className="text-xs text-slate-600">{r.lines.map((x: any) => { const l = d.lines.find((y: any) => y.id === x.order_line_id); return `${l?.description}: ${Number(x.qty_received).toLocaleString('tr-TR')}${Number(x.qty_rejected) ? ` (+${Number(x.qty_rejected).toLocaleString('tr-TR')} red: ${x.reject_reason})` : ''}`; }).join(' · ')}</p>
              {r.kind === 'service' && <p className="text-xs text-slate-600">Hizmet: {{ done: 'yapıldı', partial: 'kısmen', not_done: 'yapılmadı' }[r.service_result as string] || '—'} · puan {r.service_rating}/5</p>}
              {!r.quality_ok && <p className="text-xs text-rose-600">Kalite uygunsuz: {r.nonconformity}</p>}
              <div className="mt-1 flex flex-wrap gap-1">{d.atts.filter((a: any) => a.owner_id === r.id).map((a: any) => <button key={a.id} onClick={() => openProcFile(supabase, a.storage_path, a.file_name).catch(e => setMsg(e.message))} className="rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-blue-700">{a.file_name}</button>)}</div>
            </li>
          ))}</ul>
        )}
      </Card>

      <IssuePanel vendorId={o.vendor_id} orderId={o.id} canManage={isBuyer} canOpen={isBuyer || p.hasRole('receiver')} />

      <Modal isOpen={!!reason} onClose={() => setReason(null)} title={reason?.kind === 'revise' ? 'Siparişi revize et' : 'Siparişi iptal et'}
        footer={<><Button variant="secondary" onClick={() => setReason(null)}>Vazgeç</Button><Button variant={reason?.kind === 'cancel' ? 'danger' : 'primary'} disabled={busy || !reason?.text.trim()}
          onClick={async () => { if (reason && await run(() => supabase.rpc(reason.kind === 'revise' ? 'proc_order_revise' : 'proc_order_cancel', { p_id: o.id, p_reason: reason.text }), reason.kind === 'revise' ? 'Sipariş revize edildi; düzenleyip yeniden onaya gönderin.' : 'Sipariş iptal edildi.')) setReason(null); }}>{reason?.kind === 'revise' ? 'Revize et' : 'İptal et'}</Button></>}>
        <p className="mb-2 text-xs text-slate-500">{reason?.kind === 'revise' ? 'Sipariş taslağa döner, revizyon numarası artar; önceki hali değişiklik geçmişinde kalır. Tedarikçi yeni hali yeniden onaylamalıdır.' : 'Bağlı talepler (başka açık siparişi yoksa) teklif toplama aşamasına döner.'}</p>
        <textarea autoFocus className="w-full rounded-lg border border-slate-200 p-2 text-sm" rows={3} value={reason?.text || ''} onChange={e => setReason(r => r && { ...r, text: e.target.value })} placeholder="Gerekçe (zorunlu)" />
      </Modal>
    </div>
  );
}
