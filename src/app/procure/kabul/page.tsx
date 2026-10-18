'use client';

// Mobil mal kabul / hizmet onayı: bana gelen teslimatlar → kalem başına gelen ve reddedilen adet, irsaliye, fotoğraf
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { OrderStatusBadge } from '@/components/procure/RequestBits';
import { createClient } from '@/lib/supabase';
import { PROCURE_SQL_1C, RECEIVABLE, fmtDate, procError, uploadProcFile } from '@/lib/procure';
import { AlertCircle, ArrowLeft, Camera, CheckCircle2, PackageCheck, Star, Trash2, X } from 'lucide-react';

export default function ReceiptPage() {
  return (
    <div>
      <Header title="Mal Kabul" subtitle="Satınalma" />
      <ProcureGate>{p => (p.hasRole('receiver') || p.hasRole('buyer') || p.isAdmin)
        ? <Receive />
        : <div className="p-6"><Card className="p-6 text-center text-sm text-slate-600">Mal kabul için “Teslim alan” rolü gerekir.</Card></div>}
      </ProcureGate>
    </div>
  );
}

type L = { id: string; description: string; unit: string; remaining: number; received: string; rejected: string; reason: string; showReject: boolean; asset: boolean };

function Receive() {
  const supabase = createClient();
  const [orders, setOrders] = useState<any[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [sel, setSel] = useState<any>(null);
  const [lines, setLines] = useState<L[]>([]);
  const [h, setH] = useState({ note_no: '', notes: '', quality_ok: true, nonconformity: '', service_result: 'done' as 'done' | 'partial' | 'not_done', rating: 0 });
  const [photos, setPhotos] = useState<File[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<any>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const loadOrders = async () => {
    const { data, error } = await supabase.from('proc_orders').select('id, order_no, status, expected_date, ack_expected_date, cost_center_id, vendor:vendor_id(name), lines:proc_order_lines(id, quantity, received_qty)')
      .in('status', RECEIVABLE).order('expected_date', { ascending: true, nullsFirst: false });
    if (error) { setMissing(/relation|does not exist/i.test(error.message)); setOrders([]); return; }
    setOrders(data || []);
    return data || [];
  };
  useEffect(() => {
    loadOrders().then(list => {
      const id = new URLSearchParams(window.location.search).get('siparis');
      if (id && list) { const o = list.find((x: any) => x.id === id); if (o) open(o.id); }
    });
  }, []);

  const open = async (orderId: string) => {
    setErr(''); setDone(null); setPhotos([]); setDraftId(null);
    const [o, ls] = await Promise.all([
      supabase.from('proc_orders').select('*, vendor:vendor_id(name)').eq('id', orderId).maybeSingle(),
      supabase.from('proc_order_lines').select('*').eq('order_id', orderId).order('sort'),
    ]);
    if (!o.data) return;
    const service = (ls.data || []).length > 0 && (ls.data || []).every((l: any) => l.is_service);
    setSel({ ...o.data, service });
    setLines((ls.data || []).map((l: any) => { const rem = Math.max(Number(l.quantity) - Number(l.received_qty), 0);
      return { id: l.id, description: l.description, unit: l.unit, remaining: rem, received: rem ? String(rem) : '0', rejected: '', reason: '', showReject: false, asset: l.asset_tag_required }; }));
    setH({ note_no: '', notes: '', quality_ok: true, nonconformity: '', service_result: 'done', rating: 0 });
    window.scrollTo({ top: 0 });
  };
  const setL = (i: number, patch: Partial<L>) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const num = (v: string) => { const x = Number(String(v).replace(',', '.')); return isFinite(x) && x >= 0 ? x : NaN; };

  const serviceResult = (r: 'done' | 'partial' | 'not_done') => {
    setH(x => ({ ...x, service_result: r }));
    setLines(ls => ls.map(l => r === 'done' ? { ...l, received: String(l.remaining), rejected: '', showReject: false }
      : r === 'not_done' ? { ...l, received: '0', rejected: String(l.remaining), reason: 'Hizmet yapılmadı', showReject: true } : l));
  };

  const submit = async () => {
    setErr('');
    if (sel.service && !h.rating) { setErr('Hizmet için 1–5 yıldız verin.'); return; }
    const bad = lines.find(l => isNaN(num(l.received)) || (l.rejected && isNaN(num(l.rejected))));
    if (bad) { setErr(`"${bad.description}" için miktarı sayı olarak girin.`); return; }
    const over = lines.find(l => num(l.received) > l.remaining);
    if (over) { setErr(`"${over.description}" için kalan miktar ${over.remaining}; daha fazlası kabul edilemez.`); return; }
    const noReason = lines.find(l => num(l.rejected || '0') > 0 && !l.reason.trim());
    if (noReason) { setErr(`"${noReason.description}" için red nedeni yazın.`); return; }
    if (!h.quality_ok && !h.nonconformity.trim()) { setErr('Kalite uygunsuzluğunu kısaca yazın.'); return; }
    setBusy(true);
    try {
      let id = draftId;
      if (!id) {
        const { data, error } = await supabase.rpc('proc_receipt_create', { p_order: sel.id, p: {
          kind: sel.service ? 'service' : 'goods', delivery_note_no: h.note_no, notes: h.notes, quality_ok: h.quality_ok, nonconformity: h.nonconformity,
          service_result: sel.service ? h.service_result : null, service_rating: sel.service ? h.rating : null,
          lines: lines.map(l => ({ order_line_id: l.id, qty_received: num(l.received), qty_rejected: num(l.rejected || '0') || 0, reject_reason: l.reason })),
        } });
        if (error) throw error;
        id = data as string; setDraftId(id);
      }
      for (const f of photos) await uploadProcFile(supabase, f, `receipt/${id}`, { type: 'receipt', id: id! });
      setPhotos([]);
      const { data: res, error: e2 } = await supabase.rpc('proc_receipt_confirm', { p_receipt: id });
      if (e2) throw e2;
      setDone(res); setDraftId(null); setSel(null); loadOrders();
    } catch (e: any) { setErr(procError(e, PROCURE_SQL_1C)); } finally { setBusy(false); }
  };
  const discard = async () => { if (draftId) await supabase.rpc('proc_receipt_discard', { p_receipt: draftId }); setDraftId(null); setSel(null); };

  if (missing) return <div className="p-4"><SqlMissingCard file={PROCURE_SQL_1C} /></div>;
  const big = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#1B3A5C]';
  const today = new Date().toISOString().slice(0, 10);

  if (sel) return (
    <div className="mx-auto max-w-xl space-y-3 p-3 pb-28 sm:p-6">
      <button onClick={() => (draftId ? discard() : setSel(null))} className="inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="h-4 w-4" />Teslimatlar</button>
      <Card className="p-3"><p className="text-xs text-slate-500">{sel.order_no} · {sel.service ? 'hizmet onayı' : 'mal kabul'}</p><p className="font-semibold text-slate-900">{sel.vendor?.name}</p></Card>

      {sel.service && (
        <Card className="space-y-2 p-3">
          <p className="text-sm font-semibold text-slate-800">Hizmet yapıldı mı?</p>
          <div className="grid grid-cols-3 gap-2">{([['done', 'Yapıldı'], ['partial', 'Kısmen'], ['not_done', 'Yapılmadı']] as const).map(([k, t]) => (
            <button key={k} onClick={() => serviceResult(k)} className={`h-11 rounded-xl border text-sm font-medium ${h.service_result === k ? 'border-[#1B3A5C] bg-[#1B3A5C] text-white' : 'border-slate-200 text-slate-700'}`}>{t}</button>
          ))}</div>
          <p className="pt-1 text-sm font-semibold text-slate-800">Değerlendirme</p>
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setH({ ...h, rating: n })} aria-label={`${n} yıldız`} className="p-1"><Star className={`h-8 w-8 ${n <= h.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} /></button>)}</div>
        </Card>
      )}

      {lines.map((l, i) => (
        <Card key={l.id} className={`space-y-2 p-3 ${l.remaining === 0 ? 'opacity-50' : ''}`}>
          <p className="font-medium text-slate-900">{l.description}</p>
          <p className="text-xs text-slate-500">Kalan {l.remaining.toLocaleString('tr-TR')} {l.unit}{l.asset ? ' · demirbaş: Faz 2\'de demirbaş kaydı açılacak' : ''}</p>
          {l.remaining > 0 && <>
            <label className="block text-xs text-slate-600">Gelen (kabul edilen) adet<input inputMode="decimal" className={big} value={l.received} onChange={e => setL(i, { received: e.target.value })} /></label>
            {!l.showReject ? <button onClick={() => setL(i, { showReject: true })} className="text-sm text-rose-600">+ Red / hasarlı var</button> : (
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <label className="text-xs text-slate-600">Red adet<input inputMode="decimal" className={big} value={l.rejected} onChange={e => setL(i, { rejected: e.target.value })} /></label>
                <label className="text-xs text-slate-600">Neden<input className={big} value={l.reason} onChange={e => setL(i, { reason: e.target.value })} placeholder="Kırık, eksik, yanlış ürün…" /></label>
              </div>
            )}
          </>}
        </Card>
      ))}

      <Card className="space-y-3 p-3">
        {!sel.service && <label className="block text-xs text-slate-600">İrsaliye no<input className={big} value={h.note_no} onChange={e => setH({ ...h, note_no: e.target.value })} /></label>}
        <div>
          <p className="text-xs text-slate-600">Kalite</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button onClick={() => setH({ ...h, quality_ok: true })} className={`h-11 rounded-xl border text-sm ${h.quality_ok ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 text-slate-700'}`}>Uygun</button>
            <button onClick={() => setH({ ...h, quality_ok: false })} className={`h-11 rounded-xl border text-sm ${!h.quality_ok ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-200 text-slate-700'}`}>Uygun değil</button>
          </div>
          {!h.quality_ok && <input className={`${big} mt-2`} value={h.nonconformity} onChange={e => setH({ ...h, nonconformity: e.target.value })} placeholder="Uygunsuzluk açıklaması" />}
        </div>
        <label className="block text-xs text-slate-600">Not<input className={big} value={h.notes} onChange={e => setH({ ...h, notes: e.target.value })} /></label>
        <div>
          <button onClick={() => camRef.current?.click()} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm text-slate-700"><Camera className="h-4 w-4" />Fotoğraf çek</button>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPhotos(x => [...x, f]); }} />
          {photos.map((f, i) => <div key={i} className="mt-1 flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1 text-xs"><span className="flex-1 truncate">{f.name}</span><button onClick={() => setPhotos(x => x.filter((_, k) => k !== i))} aria-label="Kaldır"><X className="h-3.5 w-3.5" /></button></div>)}
        </div>
      </Card>

      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
      {draftId && <p className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Taslak kaydedildi; eksik olanı tamamlayıp tekrar onaylayın.<button onClick={discard} className="inline-flex items-center gap-1 text-rose-700"><Trash2 className="h-3.5 w-3.5" />Vazgeç</button></p>}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:left-56">
        <div className="mx-auto max-w-xl"><button disabled={busy} onClick={submit} className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-[#10B981] text-base font-semibold text-white disabled:opacity-50"><PackageCheck className="h-5 w-5" />{busy ? 'Kaydediliyor…' : sel.service ? 'Hizmeti onayla' : 'Teslim aldım'}</button></div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-xl space-y-3 p-3 sm:p-6">
      {done && <Card className="flex items-start gap-2 border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{done.receipt_no} kaydedildi · {done.status === 'received' ? 'sipariş tamamen teslim alındı' : 'kısmi teslim'}.{done.issue_id ? ' Red/uygunsuzluk satınalmaya bildirildi.' : ''}</span></Card>}
      <p className="text-sm font-semibold text-slate-800">Bana gelen teslimatlar</p>
      {orders === null ? <p className="text-sm text-slate-400">Yükleniyor…</p> : orders.length === 0 ? (
        <Card className="flex flex-col items-center p-8 text-center text-sm text-slate-500"><PackageCheck className="mb-2 h-8 w-8 text-slate-300" />Teslim alınacak sipariş yok.</Card>
      ) : orders.map(o => {
        const due = o.ack_expected_date || o.expected_date;
        const rem = (o.lines || []).reduce((s: number, l: any) => s + Math.max(Number(l.quantity) - Number(l.received_qty), 0), 0);
        return (
          <button key={o.id} onClick={() => open(o.id)} className="block w-full text-left">
            <Card className="flex items-center gap-3 p-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{o.vendor?.name}</p>
                <p className="text-xs text-slate-500">{o.order_no} · {(o.lines || []).length} kalem · kalan {rem.toLocaleString('tr-TR')}</p>
                <p className={`text-xs ${due && due < today ? 'font-medium text-rose-600' : 'text-slate-500'}`}>{due && due < today && <AlertCircle className="mr-0.5 inline h-3 w-3" />}Teslim {fmtDate(due) || '—'}</p>
              </div>
              <OrderStatusBadge status={o.status} />
            </Card>
          </button>
        );
      })}
      <p className="text-center text-xs text-slate-400"><Link href="/procure/siparisler" className="underline">Tüm siparişler</Link></p>
    </div>
  );
}
