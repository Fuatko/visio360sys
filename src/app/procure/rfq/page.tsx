'use client';

// Teklif toplama (RFQ) listesi; onaylı taleplerden yeni RFQ (birden fazla talep birleştirilebilir)
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Card, Button, Modal } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { RfqStatusBadge } from '@/components/procure/RequestBits';
import { createClient } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetch-all';
import { PROCURE_SQL_1B, RFQ_STATUS, RfqStatus, fmtDate, fmtDateTime, procError, tl } from '@/lib/procure';
import { FileSearch, Plus } from 'lucide-react';

export default function RfqListPage() {
  return (
    <div>
      <Header title="Teklif Toplama" subtitle="Satınalma" />
      <ProcureGate>{p => (p.hasRole('buyer') || p.hasRole('finance') || p.isAdmin)
        ? <RfqList canEdit={p.hasRole('buyer') || p.isAdmin} />
        : <div className="p-6"><Card className="p-6 text-center text-sm text-slate-600">Teklif toplama satınalma uzmanı ekranıdır.</Card></div>}
      </ProcureGate>
    </div>
  );
}

function RfqList({ canEdit }: { canEdit: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<any[] | null>(null);
  const [stats, setStats] = useState<Record<string, { vendors: number; quotes: number }>>({});
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState('');
  const [pick, setPick] = useState<{ reqs: any[]; sel: Set<string>; title: string } | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const r = await supabase.from('proc_rfqs').select('*').order('created_at', { ascending: false });
    if (r.error) { setMissing(/relation|does not exist/i.test(r.error.message)); setRows([]); return; }
    setRows(r.data || []);
    const [vs, qs] = await Promise.all([
      fetchAll(() => supabase.from('proc_rfq_vendors').select('id, rfq_id')),
      fetchAll(() => supabase.from('proc_quotes').select('rfq_vendor_id').eq('is_current', true)),
    ]);
    const quoted = new Set(qs.map((q: any) => q.rfq_vendor_id));
    const st: Record<string, { vendors: number; quotes: number }> = {};
    vs.forEach((v: any) => { st[v.rfq_id] = st[v.rfq_id] || { vendors: 0, quotes: 0 }; st[v.rfq_id].vendors++; if (quoted.has(v.id)) st[v.rfq_id].quotes++; });
    setStats(st);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = async () => {
    const { data } = await supabase.from('proc_requests').select('id, request_no, title, estimated_total, needed_by, priority').eq('status', 'approved').order('approved_at');
    setPick({ reqs: data || [], sel: new Set(), title: '' });
  };
  const create = async () => {
    if (!pick) return; setErr('');
    const { data, error } = await supabase.rpc('proc_rfq_create', { p_request_ids: [...pick.sel], p_title: pick.title || null });
    if (error) { setErr(procError(error, PROCURE_SQL_1B)); return; }
    router.push(`/procure/rfq/${data}`);
  };

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1B} /></div>;
  const shown = (rows || []).filter(r => !status || r.status === status);
  return (
    <div className="space-y-3 p-3 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <select value={status} onChange={e => setStatus(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm"><option value="">Tüm durumlar</option>{(Object.keys(RFQ_STATUS) as RfqStatus[]).map(k => <option key={k} value={k}>{RFQ_STATUS[k].label}</option>)}</select>
        <div className="flex-1" />
        {canEdit && <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" />Yeni RFQ</Button>}
      </div>
      <Card className="overflow-hidden">
        {rows === null ? <p className="p-8 text-center text-sm text-slate-400">Yükleniyor…</p> : shown.length === 0 ? (
          <div className="flex flex-col items-center p-10 text-center text-sm text-slate-500"><FileSearch className="mb-2 h-8 w-8 text-slate-300" />RFQ yok. Onaylı taleplerden “Yeni RFQ” ile başlayın.</div>
        ) : (
          <ul className="divide-y divide-slate-100">{shown.map(r => {
            const st = stats[r.id] || { vendors: 0, quotes: 0 };
            const late = r.status === 'sent' && r.deadline && new Date(r.deadline) < new Date();
            return (
              <li key={r.id}><Link href={`/procure/rfq/${r.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{r.title}</p>
                  <p className="text-[11px] text-slate-500">{r.rfq_no} · {st.quotes}/{st.vendors} teklif · asgari {r.min_quotes_required}{r.deadline ? ` · son tarih ${fmtDateTime(r.deadline)}` : ''}{late && <span className="text-rose-600"> (geçti)</span>}</p>
                </div>
                <div className="shrink-0 text-right"><RfqStatusBadge status={r.status} /><p className="mt-1 text-xs text-slate-600">{r.award_total != null ? tl(r.award_total) : r.estimated_total != null ? `tahmini ${tl(r.estimated_total)}` : ''}</p></div>
              </Link></li>
            );
          })}</ul>
        )}
      </Card>

      <Modal isOpen={!!pick} onClose={() => setPick(null)} title="Yeni RFQ — onaylı talepleri seçin" size="lg"
        footer={<><Button variant="secondary" onClick={() => setPick(null)}>Vazgeç</Button><Button disabled={!pick?.sel.size} onClick={create}>RFQ oluştur</Button></>}>
        {pick && (pick.reqs.length === 0 ? <p className="text-sm text-slate-500">Teklif toplanacak onaylı talep yok.</p> : (
          <div className="space-y-2">
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{pick.reqs.map(q => (
              <li key={q.id}><label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <input type="checkbox" checked={pick.sel.has(q.id)} onChange={() => setPick(p => { if (!p) return p; const s = new Set(p.sel); if (s.has(q.id)) s.delete(q.id); else s.add(q.id); return { ...p, sel: s }; })} />
                <span className="min-w-0 flex-1 truncate">{q.request_no} · {q.title}</span>
                <span className="text-xs text-slate-500">{q.needed_by ? fmtDate(q.needed_by) : ''}</span><b className="text-xs">{tl(q.estimated_total)}</b>
              </label></li>
            ))}</ul>
            <label className="block text-xs text-slate-600">RFQ başlığı (boşsa ilk talebin başlığı)<input className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" value={pick.title} onChange={e => setPick({ ...pick, title: e.target.value })} /></label>
            <p className="text-[11px] text-slate-500">Seçilen taleplerin kalemleri RFQ'ya kopyalanır, talepler “Teklif toplanıyor” durumuna geçer. Toplam tutar politikadaki 3 teklif eşiğini aşarsa en az 3 teklif istenir.</p>
            {err && <p className="text-sm text-rose-600">{err}</p>}
          </div>
        ))}
      </Modal>
    </div>
  );
}
