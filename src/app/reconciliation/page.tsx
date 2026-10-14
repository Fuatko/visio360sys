'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Button, Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { parasutCall } from '@/lib/parasut-client';
import { PDoc, ROrder, grossTry, orderTry, orderDate, sameAmount, suggest, daysSince } from '@/lib/parasut-recon';
import { Scale, Sparkles, Unlink, AlertTriangle, CheckCircle2, FileWarning, PackageX, Loader2 } from 'lucide-react';

const tl = (v: any) => `${Number(v) < 0 ? '-' : ''}₺${formatMoney(Math.abs(Math.round(Number(v) || 0)))}`;
const dt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('tr-TR') : '-');
const BILLABLE = ['confirmed', 'processing', 'shipped', 'delivered', 'completed'];
const ST: Record<string, string> = { pending: 'Bekliyor', confirmed: 'Onaylandı', processing: 'Hazırlanıyor', shipped: 'Kargoda', delivered: 'Teslim edildi', completed: 'Tamamlandı', cancelled: 'İptal' };
type Tab = 'unbilled' | 'orphan' | 'diff' | 'matched';

export default function ReconciliationPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('unbilled');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await parasutCall('/api/parasut/reconcile')); setErr(null); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const link = async (links: { doc_ids: string[]; order_id: string | null }[], key: string, text: string) => {
    setBusy(key); setMsg(null);
    try { await parasutCall('/api/parasut/reconcile', 'POST', { links }); setMsg(text); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const v = useMemo(() => {
    if (!data) return null;
    const docs: PDoc[] = data.documents || [];
    const from = data.sync_from || '0000';
    const orders: ROrder[] = (data.orders || []).filter((o: ROrder) => o.status !== 'cancelled');
    const cname = new Map<string, string>((data.customers || []).map((c: any) => [c.id, c.name]));
    const byOrder = new Map<string, PDoc[]>();
    docs.forEach(d => { if (d.order_id) byOrder.set(d.order_id, [...(byOrder.get(d.order_id) || []), d]); });
    // Paraşüt eşitleme başlangıcından önceki siparişler kontrol dışı (faturaları sistemde yok)
    const inScope = orders.filter(o => orderDate(o) >= from);
    const unbilled = inScope.filter(o => !byOrder.has(o.id) && BILLABLE.includes(String(o.status || '')))
      .sort((a, b) => orderDate(a).localeCompare(orderDate(b)));
    const pending = inScope.filter(o => !byOrder.has(o.id) && !BILLABLE.includes(String(o.status || ''))).length;
    const orphan = docs.filter(d => !d.order_id && Number(d.net_total_try) > 0);
    const matched = orders.filter(o => byOrder.has(o.id)).map(o => {
      const ds = byOrder.get(o.id)!; const inv = ds.reduce((a, d) => a + grossTry(d), 0);
      return { o, ds, inv, diff: inv - orderTry(o) };
    });
    const diff = matched.filter(m => !sameAmount(m.inv, orderTry(m.o)));
    const sugg = suggest(inScope, docs);
    const total = inScope.filter(o => BILLABLE.includes(String(o.status || ''))).length;
    return { docs, orders, inScope, unbilled, pending, orphan, matched, diff, sugg, cname, total };
  }, [data]);

  if (err && !data) return <div><Header title="Sipariş–Fatura Mutabakatı" /><div className="p-6"><Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</Card></div></div>;
  if (!data || !v) return <div><Header title="Sipariş–Fatura Mutabakatı" /><div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></div></div>;

  const docName = (d: PDoc) => d.doc_no || d.id.slice(0, 8);
  const orderLabel = (o: ROrder) => `${o.order_number || o.id.slice(0, 8)} · ${dt(orderDate(o))} · ${tl(orderTry(o))}`;
  const freeDocsFor = (cid?: string | null) => v.docs.filter(d => !d.order_id && d.customer_id === cid && Number(d.net_total_try) > 0);
  const linkedIds = new Set(v.matched.map(m => m.o.id));
  const freeOrdersFor = (cid?: string | null) => v.orders.filter(o => o.customer_id === cid && !linkedIds.has(o.id));
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const coverage = v.total ? Math.round(100 * (v.total - v.unbilled.length) / v.total) : 100;

  const TABS: [Tab, string, number, any][] = [
    ['unbilled', 'Faturası kesilmemiş siparişler', v.unbilled.length, PackageX],
    ['orphan', 'Siparişsiz faturalar', v.orphan.length, FileWarning],
    ['diff', 'Tutar farkı', v.diff.length, AlertTriangle],
    ['matched', 'Eşleşmiş', v.matched.length, CheckCircle2],
  ];

  return (
    <div>
      <Header title="Sipariş–Fatura Mutabakatı" subtitle="Yazılımdaki siparişler ile Paraşüt'te kesilen faturaların karşılaştırması" />
      <div className="space-y-4 p-4 md:p-6">
        {!data.connected && <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Paraşüt bağlı değil. <Link href="/integrations" className="font-medium underline">Entegrasyonlar</Link> sayfasından bağlayın.</Card>}
        {!data.ready && <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Siparişe bağlama için <b>parasut-mutabakat.sql</b> dosyasını Supabase SQL Editor'de çalıştırın. O zamana kadar karşılaştırma yalnızca görüntülenir.</Card>}
        {err && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</Card>}
        {msg && <Card className="border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</Card>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className={`p-4 ${v.unbilled.length ? 'border-red-200' : ''}`}><p className="text-xs text-slate-500">Faturası kesilmemiş sipariş</p><p className={`text-xl font-bold ${v.unbilled.length ? 'text-red-600' : ''}`}>{tl(sum(v.unbilled.map(orderTry)))}</p><p className="text-xs text-slate-400">{v.unbilled.length} sipariş · olası gelir kaçağı</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500">Siparişsiz fatura</p><p className="text-xl font-bold">{tl(sum(v.orphan.map(grossTry)))}</p><p className="text-xs text-slate-400">{v.orphan.length} fatura · sisteme girilmemiş satış</p></Card>
          <Card className={`p-4 ${v.diff.length ? 'border-amber-200' : ''}`}><p className="text-xs text-slate-500">Tutar farkı</p><p className={`text-xl font-bold ${v.diff.length ? 'text-amber-600' : ''}`}>{tl(sum(v.diff.map(m => m.diff)))}</p><p className="text-xs text-slate-400">{v.diff.length} sipariş · fatura ≠ sipariş</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500">Faturalanma oranı</p><p className="text-xl font-bold text-indigo-700">%{coverage}</p><p className="text-xs text-slate-400">{v.total} faturalanabilir sipariş{v.pending ? ` · ${v.pending} onay bekliyor` : ''}</p></Card>
        </div>

        {data.ready && v.sugg.length > 0 && (
          <Card className="border-indigo-200 bg-indigo-50/40 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <p className="text-sm font-semibold text-indigo-900">{v.sugg.length} eşleşme önerisi</p>
              <p className="text-xs text-indigo-700">Aynı müşteri, yakın tarih ve aynı tutar (KDV dahil, %1 tolerans)</p>
              <Button size="sm" className="ml-auto" disabled={!!busy} onClick={() => link(v.sugg.map(s => ({ doc_ids: s.doc_ids, order_id: s.order_id })), 'all', `${v.sugg.length} sipariş faturasıyla eşleştirildi.`)}>{busy === 'all' ? 'Eşleştiriliyor…' : 'Tümünü onayla'}</Button>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Sipariş</th><th>Müşteri</th><th>Paraşüt fatura(lar)ı</th><th className="text-right">Fark</th><th className="pl-4">Neden</th><th></th></tr></thead>
              <tbody>{v.sugg.map(s => {
                const o = v.orders.find(x => x.id === s.order_id)!; const ds = v.docs.filter(d => s.doc_ids.includes(d.id));
                return (<tr key={s.order_id} className="border-t border-indigo-100">
                  <td className="py-1.5 font-mono text-xs">{orderLabel(o)}</td><td>{v.cname.get(o.customer_id || '') || '-'}</td>
                  <td className="font-mono text-xs">{ds.map(d => `${docName(d)} (${dt(d.issue_date)}, ${tl(grossTry(d))})`).join(' + ')}</td>
                  <td className="text-right text-xs">{Math.abs(s.diff) < 1 ? '—' : tl(s.diff)}</td><td className="pl-4 text-xs text-slate-500">{s.reason}</td>
                  <td className="pl-2 text-right"><button className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50" disabled={!!busy} onClick={() => link([{ doc_ids: s.doc_ids, order_id: s.order_id }], s.order_id, 'Eşleştirildi.')}>Onayla</button></td></tr>);
              })}</tbody></table></div>
          </Card>
        )}

        <div className="flex flex-wrap gap-1 rounded-lg border bg-white p-0.5 text-sm">
          {TABS.map(([k, l, c, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><Icon className="h-3.5 w-3.5" />{l} <span className={tab === k ? 'text-indigo-200' : 'text-slate-400'}>{c}</span></button>))}
        </div>

        <Card className="overflow-x-auto p-0">
          {tab === 'unbilled' && (v.unbilled.length === 0 ? <p className="p-4 text-sm text-slate-500">Onaylanmış tüm siparişlerin faturası Paraşüt'te kesilmiş. 👍</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Sipariş</th><th>Müşteri</th><th>Tarih</th><th>Durum</th><th className="text-right">Bekleyen gün</th><th className="text-right">Tutar (KDV dahil)</th><th className="pl-4">Paraşüt faturası bağla</th></tr></thead>
              <tbody>{v.unbilled.map(o => {
                const age = daysSince(orderDate(o)); const free = freeDocsFor(o.customer_id);
                return (<tr key={o.id} className="border-b">
                  <td className="px-3 py-1.5 font-mono text-xs"><Link href="/orders" className="text-indigo-700 hover:underline">{o.order_number || o.id.slice(0, 8)}</Link></td>
                  <td>{o.customer_id ? <Link href={`/customers/${o.customer_id}`} className="hover:underline">{v.cname.get(o.customer_id) || '-'}</Link> : '-'}</td>
                  <td className="text-xs">{dt(orderDate(o))}</td><td className="text-xs">{ST[String(o.status)] || o.status}</td>
                  <td className={`text-right text-xs font-medium ${age > 30 ? 'text-red-600' : age > 7 ? 'text-amber-600' : 'text-slate-500'}`}>{age}</td>
                  <td className="text-right font-medium">{tl(orderTry(o))}</td>
                  <td className="pl-4">{data.ready && free.length ? (
                    <select className="h-8 w-64 rounded border px-2 text-xs" defaultValue="" disabled={!!busy} onChange={e => e.target.value && link([{ doc_ids: [e.target.value], order_id: o.id }], o.id, 'Fatura siparişe bağlandı.')}>
                      <option value="">Fatura seçin…</option>{free.map(d => <option key={d.id} value={d.id}>{docName(d)} · {dt(d.issue_date)} · {tl(grossTry(d))}</option>)}</select>
                  ) : <span className="text-xs text-slate-400">{free.length ? '' : 'Bu müşteriye boşta fatura yok'}</span>}</td></tr>);
              })}</tbody>
            </table>))}

          {tab === 'orphan' && (v.orphan.length === 0 ? <p className="p-4 text-sm text-slate-500">Paraşüt'teki tüm satış faturaları bir siparişe bağlı.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Tarih</th><th>Fatura no</th><th>Müşteri</th><th className="text-right">Tutar (KDV dahil)</th><th className="pl-4">Siparişe bağla</th></tr></thead>
              <tbody>{v.orphan.map(d => {
                const free = freeOrdersFor(d.customer_id);
                return (<tr key={d.id} className="border-b">
                  <td className="px-3 py-1.5 text-xs">{dt(d.issue_date)}</td><td className="font-mono text-xs">{docName(d)}</td>
                  <td>{d.customer_id ? <Link href={`/customers/${d.customer_id}`} className="hover:underline">{v.cname.get(d.customer_id) || d.contact_name}</Link> : <span>{d.contact_name} <span className="text-[10px] text-amber-600">müşteri eşleşmedi</span></span>}</td>
                  <td className="text-right font-medium">{tl(grossTry(d))}</td>
                  <td className="pl-4">{data.ready && free.length ? (
                    <select className="h-8 w-72 rounded border px-2 text-xs" defaultValue="" disabled={!!busy} onChange={e => e.target.value && link([{ doc_ids: [d.id], order_id: e.target.value }], d.id, 'Fatura siparişe bağlandı.')}>
                      <option value="">Sipariş seçin…</option>{free.map(o => <option key={o.id} value={o.id}>{orderLabel(o)}</option>)}</select>
                  ) : <span className="text-xs text-slate-400">{d.customer_id ? 'Bu müşterinin açık siparişi yok' : 'Önce Entegrasyonlar → Eşleştir'}</span>}</td></tr>);
              })}</tbody>
            </table>))}

          {(tab === 'diff' || tab === 'matched') && ((tab === 'diff' ? v.diff : v.matched).length === 0 ? <p className="p-4 text-sm text-slate-500">{tab === 'diff' ? 'Tutar farkı olan sipariş yok. 👍' : 'Henüz eşleşmiş sipariş yok.'}</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Sipariş</th><th>Müşteri</th><th className="text-right">Sipariş</th><th>Paraşüt fatura(lar)ı</th><th className="text-right">Fatura toplamı</th><th className="text-right">Fark</th><th></th></tr></thead>
              <tbody>{(tab === 'diff' ? v.diff : v.matched).map(m => (
                <tr key={m.o.id} className="border-b">
                  <td className="px-3 py-1.5 font-mono text-xs">{m.o.order_number || m.o.id.slice(0, 8)}<span className="block text-[10px] text-slate-400">{dt(orderDate(m.o))}</span></td>
                  <td>{v.cname.get(m.o.customer_id || '') || '-'}</td>
                  <td className="text-right">{tl(orderTry(m.o))}</td>
                  <td className="font-mono text-xs">{m.ds.map(docName).join(', ')}</td>
                  <td className="text-right">{tl(m.inv)}</td>
                  <td className={`text-right text-xs font-medium ${sameAmount(m.inv, orderTry(m.o)) ? 'text-emerald-600' : m.diff < 0 ? 'text-red-600' : 'text-amber-600'}`}>{sameAmount(m.inv, orderTry(m.o)) ? 'Tutuyor' : `${tl(m.diff)}${m.diff < 0 ? ' eksik' : ' fazla'}`}</td>
                  <td className="px-3 text-right">{data.ready && <button title="Bağlantıyı kaldır" className="text-slate-400 hover:text-red-600 disabled:opacity-50" disabled={!!busy} onClick={() => link([{ doc_ids: m.ds.map(d => d.id), order_id: null }], m.o.id, 'Bağlantı kaldırıldı.')}><Unlink className="h-4 w-4" /></button>}</td></tr>))}</tbody>
            </table>))}
        </Card>

        <p className="flex items-start gap-2 text-xs text-slate-500"><Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Karşılaştırma Paraşüt eşitleme başlangıcından ({dt(data.sync_from)}) sonraki siparişleri kapsar; tutarlar KDV dahil TL'dir, döviz siparişler kayıtlı kurla çevrilir. "Bekliyor" durumundaki siparişler onaylanana kadar listeye girmez. Paraşüt'e hiçbir şey yazılmaz.</p>
      </div>
    </div>
  );
}
