'use client';

// 3'lü eşleştirme (sipariş ↔ mal kabul ↔ Paraşüt alış faturası) ve siparişsiz faturalar. Paraşüt'e yazma yapılmaz.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Button, Modal } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { createClient } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetch-all';
import { CostCenter, Category, MATCH_STATUS, PROCURE_SQL_1D, fmtDate, fmtDateTime, loadPeople, peopleMap, procError, tl } from '@/lib/procure';
import { AlertTriangle, CheckCircle2, FileQuestion, Link2, Receipt, Undo2 } from 'lucide-react';

type Tab = 'suggest' | 'variance' | 'unordered' | 'history';

export default function InvoicesPage() {
  return (
    <div>
      <Header title="Fatura Eşleştirme" subtitle="Satınalma" />
      <ProcureGate>{p => (p.hasRole('finance') || p.hasRole('buyer') || p.isAdmin)
        ? <Invoices isFinance={p.hasRole('finance') || p.isAdmin} />
        : <div className="p-6"><Card className="p-6 text-center text-sm text-slate-600">Fatura eşleştirme mali işler ve satınalma ekranıdır.</Card></div>}
      </ProcureGate>
    </div>
  );
}

function Invoices({ isFinance }: { isFinance: boolean }) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('suggest');
  const [sugg, setSugg] = useState<any[] | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [unordered, setUnordered] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [ccs, setCcs] = useState<CostCenter[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<{ doc: any; order_id: string; note: string } | null>(null);
  const [decide, setDecide] = useState<{ m: any; approve: boolean; note: string } | null>(null);
  const [undo, setUndo] = useState<{ m: any; note: string } | null>(null);
  const [noOrder, setNoOrder] = useState<{ doc: any; note: string } | null>(null);
  const [retro, setRetro] = useState<{ doc: any; cc: string; cat: string; note: string } | null>(null);

  const load = useCallback(async () => {
    const s = await supabase.rpc('proc_invoice_suggestions');
    if (s.error) { if (/does not exist|Could not find/i.test(s.error.message)) setMissing(true); else setMsg(s.error.message); setSugg([]); return; }
    const [m, u, o, cc, ct, people] = await Promise.all([
      fetchAll(() => supabase.from('proc_invoice_matches').select('*, order:order_id(order_no, vendor:vendor_id(name)), doc:parasut_document_id(doc_no, issue_date, contact_name)').order('matched_at', { ascending: false })),
      supabase.rpc('proc_unordered_invoices', { p_from: null }),
      supabase.from('proc_orders').select('id, order_no, subtotal, invoiced_net, order_date, vendor_id, vendor:vendor_id(name)').in('status', ['sent', 'acknowledged', 'partially_received', 'received', 'invoiced']).order('order_date', { ascending: false }),
      supabase.from('proc_cost_centers').select('*').eq('is_active', true).order('name'),
      supabase.from('proc_categories').select('*').eq('is_active', true).order('name'),
      loadPeople(supabase),
    ]);
    setSugg(s.data || []); setMatches(m); setUnordered(u.data || []); setOrders(o.data || []); setCcs(cc.data || []); setCats(ct.data || []); setNames(peopleMap(people));
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => PromiseLike<{ data?: any; error: any }>, ok: string) => {
    setBusy(true); setMsg('');
    const { data, error } = await fn();
    setBusy(false);
    if (error) { setMsg(procError(error, PROCURE_SQL_1D)); return false; }
    const st = data?.status;
    setMsg(st && st !== 'matched' && MATCH_STATUS[st] ? `Fatura bağlandı ancak tolerans dışında: ${MATCH_STATUS[st].label}. Mali işler onayı bekliyor.` : ok);
    await load(); return true;
  };

  const variance = matches.filter(m => ['price_variance', 'qty_variance', 'over_invoiced'].includes(m.status));
  const open = unordered.filter(u => !u.decision);
  const docsForManual = useMemo(() => {
    const seen = new Set<string>(); const out: any[] = [];
    (sugg || []).forEach(s => { if (!seen.has(s.document_id)) { seen.add(s.document_id); out.push({ id: s.document_id, doc_no: s.doc_no, issue_date: s.issue_date, contact_name: s.contact_name, net: s.invoice_net }); } });
    open.forEach(u => { if (!seen.has(u.document_id)) { seen.add(u.document_id); out.push({ id: u.document_id, doc_no: u.doc_no, issue_date: u.issue_date, contact_name: u.vendor_name, net: u.invoice_net, vendor_id: u.vendor_id }); } });
    return out;
  }, [sugg, open]);

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1D} /></div>;
  if (sugg === null) return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;
  const tabs: { k: Tab; label: string; n?: number }[] = [
    { k: 'suggest', label: 'Önerilen eşleşmeler', n: sugg.length }, { k: 'variance', label: 'Fark onayı', n: variance.length },
    { k: 'unordered', label: 'Siparişsiz faturalar', n: open.length }, { k: 'history', label: 'Eşleşme geçmişi' },
  ];
  const inp = 'h-9 w-full rounded-lg border border-slate-200 px-2 text-sm';

  return (
    <div className="space-y-3 p-3 sm:p-6">
      <p className="text-sm text-slate-600">Paraşüt senkronundan gelen alış faturaları siparişle ve mal kabulle karşılaştırılır. Tolerans içindeki fark otomatik eşleşir; dışındaki fark mali işler onayına düşer. Paraşüt'e kayıt yazılmaz.</p>
      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
        {tabs.map(t => <button key={t.k} onClick={() => setTab(t.k)} className={`rounded-md px-3 py-1.5 ${tab === t.k ? 'bg-[#1B3A5C] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{t.label}{t.n ? ` (${t.n})` : ''}</button>)}
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${/bağlandı|kaydedildi|oluşturuldu|alındı|onaylandı|reddedildi/i.test(msg) && !/tolerans dışında/.test(msg) ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{msg}</p>}

      {tab === 'suggest' && (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5"><p className="text-sm font-semibold text-slate-800">Aynı tedarikçi, fatura tarihi sipariş sonrası, tutar yakın</p><Button size="sm" variant="secondary" onClick={() => setManual({ doc: null, order_id: '', note: '' })}><Link2 className="h-3.5 w-3.5" />Elle eşleştir</Button></div>
          {sugg.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Önerilecek eşleşme yok. Paraşüt senkronu (gece 01:30) yeni alış faturası getirdiğinde burada görünür.</p> : (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-3 py-2">Fatura</th><th className="px-3 py-2">Sipariş</th><th className="px-3 py-2 text-right">Fatura (KDV hariç)</th><th className="px-3 py-2 text-right">Kabul edilmiş, faturalanmamış</th><th className="px-3 py-2 text-right">Fark</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">{sugg.map((s, i) => (
                <tr key={i}>
                  <td className="px-3 py-2"><p className="text-slate-800">{s.doc_no || '—'}</p><p className="text-[11px] text-slate-500">{s.contact_name} · {fmtDate(s.issue_date)}</p></td>
                  <td className="px-3 py-2"><Link href={`/procure/siparisler/${s.order_id}`} className="text-blue-700 hover:underline">{s.order_no}</Link><p className="text-[11px] text-slate-500">{s.vendor_name} · kalan {tl(s.remaining)}</p></td>
                  <td className="px-3 py-2 text-right">{tl(s.invoice_net)}</td>
                  <td className="px-3 py-2 text-right">{tl(s.expected_net)}</td>
                  <td className={`px-3 py-2 text-right text-xs ${s.within_tolerance ? 'text-emerald-700' : 'text-amber-700'}`}>{s.diff_pct != null ? `%${Number(s.diff_pct).toLocaleString('tr-TR')}` : '—'}<span className="block">{s.within_tolerance ? 'tolerans içinde' : 'tolerans dışı'}</span></td>
                  <td className="px-3 py-2 text-right"><Button size="sm" disabled={busy} onClick={() => run(() => supabase.rpc('proc_invoice_match', { p_order: s.order_id, p_doc: s.document_id, p_note: null }), 'Fatura siparişe bağlandı.')}>Eşleştir</Button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'variance' && (
        <Card className="overflow-hidden">
          {variance.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Onay bekleyen fark yok.</p> : (
            <ul className="divide-y divide-slate-100">{variance.map(m => (
              <li key={m.id} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${MATCH_STATUS[m.status].cls}`}>{MATCH_STATUS[m.status].label}</span>
                  <span className="flex-1 text-slate-800">{m.doc?.doc_no} → <Link href={`/procure/siparisler/${m.order_id}`} className="text-blue-700">{m.order?.order_no}</Link> · {m.order?.vendor?.name}</span>
                  <span className="text-xs text-slate-500">{names[m.matched_by] || ''} · {fmtDateTime(m.matched_at)}</span>
                </div>
                <p className="text-xs text-slate-600">Fatura {tl(m.invoice_net)} · kabul edilmiş/faturalanmamış {tl(m.expected_net)} · fark {tl(m.variance?.diff)}{m.variance?.diff_pct != null ? ` (%${m.variance.diff_pct})` : ''} · siparişte kalan {tl(m.variance?.remaining)} · tolerans fiyat %{m.variance?.tol_price}, miktar %{m.variance?.tol_qty}</p>
                {(m.variance?.lines || []).length > 0 && <p className="text-[11px] text-slate-500">Fatura kalemleri: {(m.variance.lines as any[]).map(l => `${l.description} ${Number(l.quantity || 0).toLocaleString('tr-TR')} × ${tl(l.unit_price)}`).join(' · ')}</p>}
                {m.note && <p className="text-xs text-slate-600">Not: {m.note}</p>}
                {isFinance ? (
                  <div className="flex gap-2 pt-1"><Button size="sm" onClick={() => setDecide({ m, approve: true, note: '' })}><CheckCircle2 className="h-3.5 w-3.5" />Farkı onayla</Button><Button size="sm" variant="secondary" onClick={() => setDecide({ m, approve: false, note: '' })}>Reddet (fatura iade/düzeltme)</Button></div>
                ) : <p className="text-xs text-amber-700">Mali işler onayı bekleniyor.</p>}
              </li>
            ))}</ul>
          )}
        </Card>
      )}

      {tab === 'unordered' && (
        <Card className="overflow-x-auto">
          <p className="border-b border-slate-100 px-4 py-2.5 text-xs text-slate-600">Procure tedarikçilerinden gelen ama hiçbir siparişle eşleşmeyen alış faturaları (son 12 ay). Satınalma disiplinini ölçer: “sonradan sipariş” de siparişsiz alım sayılır.</p>
          {unordered.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Siparişsiz fatura yok.</p> : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-3 py-2">Fatura</th><th className="px-3 py-2">Tedarikçi</th><th className="px-3 py-2 text-right">Tutar (KDV hariç)</th><th className="px-3 py-2">Karar</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{unordered.map(u => (
                <tr key={u.document_id} className={u.decision ? 'text-slate-500' : ''}>
                  <td className="px-3 py-2">{u.doc_no || '—'}<p className="text-[11px] text-slate-500">{fmtDate(u.issue_date)}{u.category ? ` · ${u.category}` : ''}</p></td>
                  <td className="px-3 py-2"><Link href={`/procure/tedarikciler/${u.vendor_id}`} className="hover:text-blue-700">{u.vendor_name}</Link></td>
                  <td className="px-3 py-2 text-right">{tl(u.invoice_net)}</td>
                  <td className="px-3 py-2">{u.decision ? <span className="text-xs">{u.decision === 'order_created' ? <>Sonradan sipariş {u.order_id && <Link href={`/procure/siparisler/${u.order_id}`} className="text-blue-700">aç</Link>}</> : 'Sipariş gerektirmez'} · {u.reason}</span> : (
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setManual({ doc: { id: u.document_id, doc_no: u.doc_no, vendor_id: u.vendor_id, net: u.invoice_net }, order_id: '', note: '' })}><Link2 className="h-3 w-3" />Siparişe bağla</Button>
                      <Button size="sm" variant="secondary" onClick={() => setRetro({ doc: u, cc: '', cat: '', note: '' })}><Receipt className="h-3 w-3" />Sonradan sipariş</Button>
                      {isFinance && <Button size="sm" variant="ghost" onClick={() => setNoOrder({ doc: u, note: '' })}><FileQuestion className="h-3 w-3" />Sipariş gerektirmez</Button>}
                    </div>
                  )}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'history' && (
        <Card className="overflow-x-auto">
          {matches.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Henüz eşleşme yok.</p> : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-3 py-2">Fatura</th><th className="px-3 py-2">Sipariş</th><th className="px-3 py-2 text-right">Tutar</th><th className="px-3 py-2">Durum</th><th className="px-3 py-2">Kim / ne zaman</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">{matches.map(m => (
                <tr key={m.id}>
                  <td className="px-3 py-2">{m.doc?.doc_no || '—'}<p className="text-[11px] text-slate-500">{fmtDate(m.doc?.issue_date)}</p></td>
                  <td className="px-3 py-2"><Link href={`/procure/siparisler/${m.order_id}`} className="text-blue-700">{m.order?.order_no}</Link><p className="text-[11px] text-slate-500">{m.order?.vendor?.name}</p></td>
                  <td className="px-3 py-2 text-right">{tl(m.invoice_net)}</td>
                  <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-[11px] ${MATCH_STATUS[m.status]?.cls}`}>{MATCH_STATUS[m.status]?.label}</span>{m.note && <p className="mt-0.5 max-w-xs truncate text-[11px] text-slate-500" title={m.note}>{m.note}</p>}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{names[m.matched_by] || '—'} · {fmtDateTime(m.matched_at)}{m.approved_by && <span className="block">Onay: {names[m.approved_by]} · {fmtDateTime(m.approved_at)}</span>}</td>
                  <td className="px-3 py-2 text-right">{isFinance && ['matched', 'approved_with_variance'].includes(m.status) && <button title="Eşleşmeyi geri al" className="text-slate-400 hover:text-rose-600" onClick={() => setUndo({ m, note: '' })}><Undo2 className="h-4 w-4" /></button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      )}

      <Modal isOpen={!!manual} onClose={() => setManual(null)} title="Elle eşleştir"
        footer={<><Button variant="secondary" onClick={() => setManual(null)}>Vazgeç</Button><Button disabled={busy || !manual?.doc || !manual?.order_id} onClick={async () => { if (manual && await run(() => supabase.rpc('proc_invoice_match', { p_order: manual.order_id, p_doc: manual.doc.id, p_note: manual.note || null }), 'Fatura siparişe bağlandı.')) setManual(null); }}>Eşleştir</Button></>}>
        {manual && (
          <div className="space-y-2">
            <label className="block text-xs text-slate-600">Paraşüt alış faturası<select className={inp} value={manual.doc?.id || ''} onChange={e => setManual({ ...manual, doc: docsForManual.find(x => x.id === e.target.value) || null })}>
              <option value="">— seçin</option>{docsForManual.map(x => <option key={x.id} value={x.id}>{x.doc_no || '—'} · {x.contact_name} · {fmtDate(x.issue_date)} · {tl(x.net)}</option>)}</select></label>
            <label className="block text-xs text-slate-600">Sipariş<select className={inp} value={manual.order_id} onChange={e => setManual({ ...manual, order_id: e.target.value })}>
              <option value="">— seçin</option>{orders.filter(o => !manual.doc?.vendor_id || o.vendor_id === manual.doc.vendor_id).map(o => <option key={o.id} value={o.id}>{o.order_no} · {o.vendor?.name} · kalan {tl(Number(o.subtotal) - Number(o.invoiced_net))}</option>)}</select></label>
            <label className="block text-xs text-slate-600">Not<input className={inp} value={manual.note} onChange={e => setManual({ ...manual, note: e.target.value })} /></label>
            <p className="text-[11px] text-slate-500">Tedarikçi (cari veya vergi no) ve tarih (fatura ≥ sipariş) kontrol edilir; tolerans dışı fark mali işler onayına düşer.</p>
          </div>
        )}
      </Modal>
      <Modal isOpen={!!decide} onClose={() => setDecide(null)} title={decide?.approve ? 'Farkı onayla' : 'Eşleşmeyi reddet'}
        footer={<><Button variant="secondary" onClick={() => setDecide(null)}>Vazgeç</Button><Button variant={decide?.approve ? 'primary' : 'danger'} disabled={busy || !decide?.note.trim()} onClick={async () => { if (decide && await run(() => supabase.rpc('proc_invoice_match_decide', { p_match: decide.m.id, p_approve: decide.approve, p_note: decide.note }), decide.approve ? 'Fark onaylandı, fatura siparişe işlendi.' : 'Eşleşme reddedildi; fatura yeniden eşleştirilebilir.')) setDecide(null); }}>{decide?.approve ? 'Onayla' : 'Reddet'}</Button></>}>
        <textarea autoFocus className="w-full rounded-lg border border-slate-200 p-2 text-sm" rows={3} value={decide?.note || ''} onChange={e => setDecide(d => d && { ...d, note: e.target.value })} placeholder="Gerekçe (zorunlu, kayda geçer)" />
      </Modal>
      <Modal isOpen={!!undo} onClose={() => setUndo(null)} title="Eşleşmeyi geri al"
        footer={<><Button variant="secondary" onClick={() => setUndo(null)}>Vazgeç</Button><Button variant="danger" disabled={busy || !undo?.note.trim()} onClick={async () => { if (undo && await run(() => supabase.rpc('proc_invoice_unmatch', { p_match: undo.m.id, p_reason: undo.note }), 'Eşleşme geri alındı.')) setUndo(null); }}>Geri al</Button></>}>
        <p className="mb-2 text-xs text-slate-500">Faturalanan tutar ve miktar siparişten düşülür, sipariş yeniden açılır.</p>
        <textarea autoFocus className="w-full rounded-lg border border-slate-200 p-2 text-sm" rows={3} value={undo?.note || ''} onChange={e => setUndo(d => d && { ...d, note: e.target.value })} placeholder="Gerekçe (zorunlu)" />
      </Modal>
      <Modal isOpen={!!noOrder} onClose={() => setNoOrder(null)} title="Sipariş gerektirmez"
        footer={<><Button variant="secondary" onClick={() => setNoOrder(null)}>Vazgeç</Button><Button disabled={busy || !noOrder?.note.trim()} onClick={async () => { if (noOrder && await run(() => supabase.rpc('proc_invoice_no_order', { p_doc: noOrder.doc.document_id, p_reason: noOrder.note }), 'Karar kaydedildi.')) setNoOrder(null); }}>Kaydet</Button></>}>
        <p className="mb-2 text-xs text-slate-500">{noOrder?.doc.doc_no} · {noOrder?.doc.vendor_name} · {tl(noOrder?.doc.invoice_net)}. Fatura siparişsiz alım olarak raporlarda kalır.</p>
        <textarea autoFocus className="w-full rounded-lg border border-slate-200 p-2 text-sm" rows={3} value={noOrder?.note || ''} onChange={e => setNoOrder(d => d && { ...d, note: e.target.value })} placeholder="Gerekçe (ör. abonelik, kasa harcaması, sözleşmeli hizmet)" />
      </Modal>
      <Modal isOpen={!!retro} onClose={() => setRetro(null)} title="Sonradan sipariş oluştur"
        footer={<><Button variant="secondary" onClick={() => setRetro(null)}>Vazgeç</Button><Button disabled={busy || !retro?.note.trim() || !retro?.cc} onClick={async () => { if (retro && await run(() => supabase.rpc('proc_order_from_invoice', { p_doc: retro.doc.document_id, p_cost_center: retro.cc, p_category: retro.cat || null, p_reason: retro.note }), 'Sonradan sipariş oluşturuldu ve fatura eşleştirildi.')) setRetro(null); }}>Oluştur</Button></>}>
        {retro && (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Fatura kalemlerinden kapanmış bir sipariş açılır ve bütçeye işlenir. Raporlarda siparişsiz alım olarak sayılmaya devam eder.</p>
            <label className="block text-xs text-slate-600">Birim (bütçe için) *<select className={inp} value={retro.cc} onChange={e => setRetro({ ...retro, cc: e.target.value })}><option value="">— seçin</option>{ccs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="block text-xs text-slate-600">Kategori<select className={inp} value={retro.cat} onChange={e => setRetro({ ...retro, cat: e.target.value })}><option value="">—</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <textarea className="w-full rounded-lg border border-slate-200 p-2 text-sm" rows={2} value={retro.note} onChange={e => setRetro({ ...retro, note: e.target.value })} placeholder="Neden önceden sipariş açılmadı? (zorunlu)" />
          </div>
        )}
      </Modal>
    </div>
  );
}
