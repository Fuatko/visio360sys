'use client';

// Siparişler (SAS-): durum, tedarikçi onayı, teslim ilerlemesi, gecikme
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { OrderStatusBadge } from '@/components/procure/RequestBits';
import { createClient } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetch-all';
import { ORDER_STATUS, OrderStatus, PROCURE_SQL_1C, RECEIVABLE, fmtDate, tl } from '@/lib/procure';
import { AlertCircle, Search, ShoppingCart } from 'lucide-react';

export default function OrdersPage() {
  return (
    <div>
      <Header title="Siparişler" subtitle="Satınalma" />
      <ProcureGate>{() => <OrderList />}</ProcureGate>
    </div>
  );
}

function OrderList() {
  const supabase = createClient();
  const [rows, setRows] = useState<any[] | null>(null);
  const [prog, setProg] = useState<Record<string, number>>({});
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const probe = await supabase.from('proc_orders').select('id').limit(1);
      if (probe.error) { setMissing(/relation|does not exist/i.test(probe.error.message)); setRows([]); return; }
      const [os, ls] = await Promise.all([
        fetchAll(() => supabase.from('proc_orders').select('id, order_no, status, subtotal, order_date, expected_date, ack_expected_date, revision, vendor:vendor_id(name)').order('created_at', { ascending: false })),
        fetchAll(() => supabase.from('proc_order_lines').select('order_id, quantity, received_qty')),
      ]);
      const p: Record<string, [number, number]> = {};
      ls.forEach((l: any) => { p[l.order_id] = p[l.order_id] || [0, 0]; p[l.order_id][0] += Number(l.quantity); p[l.order_id][1] += Math.min(Number(l.received_qty), Number(l.quantity)); });
      setProg(Object.fromEntries(Object.entries(p).map(([k, [a, b]]) => [k, a ? Math.round((b / a) * 100) : 0])));
      setRows(os);
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const late = (o: any) => RECEIVABLE.includes(o.status) && (o.ack_expected_date || o.expected_date) && (o.ack_expected_date || o.expected_date) < today;
  const counts = useMemo(() => (rows || []).reduce((m: Record<string, number>, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {}), [rows]);
  const shown = (rows || []).filter(r => (!status || (status === 'late' ? late(r) : r.status === status))
    && (!q || `${r.order_no || ''} ${r.vendor?.name || ''}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))));

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1C} /></div>;
  const lateN = (rows || []).filter(late).length;
  return (
    <div className="space-y-3 p-3 sm:p-6">
      <div className="relative max-w-md"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Sipariş no veya tedarikçi" className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-sm" /></div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setStatus('')} className={`rounded-full border px-2.5 py-1 text-xs ${!status ? 'border-[#1B3A5C] bg-[#1B3A5C] text-white' : 'border-slate-200 bg-white text-slate-600'}`}>Tümü ({rows?.length || 0})</button>
        {lateN > 0 && <button onClick={() => setStatus('late')} className={`rounded-full border px-2.5 py-1 text-xs ${status === 'late' ? 'border-rose-600 bg-rose-600 text-white' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>Geciken ({lateN})</button>}
        {(Object.keys(ORDER_STATUS) as OrderStatus[]).filter(s => counts[s]).map(s => (
          <button key={s} onClick={() => setStatus(s === status ? '' : s)} className={`rounded-full border px-2.5 py-1 text-xs ${status === s ? 'border-[#1B3A5C] bg-[#1B3A5C] text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{ORDER_STATUS[s].label} ({counts[s]})</button>
        ))}
      </div>
      <Card className="overflow-hidden">
        {rows === null ? <p className="p-8 text-center text-sm text-slate-400">Yükleniyor…</p> : shown.length === 0 ? (
          <div className="flex flex-col items-center p-10 text-center text-sm text-slate-500"><ShoppingCart className="mb-2 h-8 w-8 text-slate-300" />Sipariş yok. Sonuçlanan RFQ'dan “Sipariş oluştur” ile başlayın.</div>
        ) : (
          <ul className="divide-y divide-slate-100">{shown.map(o => (
            <li key={o.id}><Link href={`/procure/siparisler/${o.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{o.vendor?.name}</p>
                <p className="text-[11px] text-slate-500">{o.order_no || 'Taslak'}{o.revision ? ` · rev. ${o.revision}` : ''} · {fmtDate(o.order_date)} · teslim {fmtDate(o.ack_expected_date || o.expected_date) || '—'}
                  {late(o) && <span className="ml-1 inline-flex items-center gap-0.5 font-medium text-rose-600"><AlertCircle className="h-3 w-3" />gecikti</span>}</p>
                {prog[o.id] > 0 && <div className="mt-1 h-1 max-w-[160px] overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#10B981]" style={{ width: `${prog[o.id]}%` }} /></div>}
              </div>
              <div className="shrink-0 text-right"><OrderStatusBadge status={o.status} /><p className="mt-1 text-xs font-medium text-slate-700">{tl(o.subtotal)}</p></div>
            </Link></li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}
