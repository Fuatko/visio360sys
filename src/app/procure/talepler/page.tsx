'use client';

// Talepler: Benim taleplerim / Birimimin / Tümü (role göre), durum filtreleri
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { StatusBadge } from '@/components/procure/RequestBits';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { fetchAll } from '@/lib/fetch-all';
import { PROCURE_SQL_1A, REQUEST_STATUS, RequestStatus, fmtDate, tl } from '@/lib/procure';
import { AlertCircle, ClipboardList, Plus, Search } from 'lucide-react';

type Scope = 'mine' | 'unit' | 'all';

export default function RequestsPage() {
  return (
    <div>
      <Header title="Talepler" subtitle="Satınalma" />
      <ProcureGate>{p => <RequestList seeAll={p.hasRole('buyer') || p.hasRole('finance') || p.isAdmin} />}</ProcureGate>
    </div>
  );
}

function RequestList({ seeAll }: { seeAll: boolean }) {
  const supabase = createClient();
  const { user } = useAuth();
  const [rows, setRows] = useState<any[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [myCcs, setMyCcs] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [ccNames, setCcNames] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<Scope>('mine');
  const [status, setStatus] = useState<string>('');
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const probe = await supabase.from('proc_requests').select('id').limit(1);
      if (probe.error) { setMissing(/relation|does not exist/i.test(probe.error.message)); setRows([]); return; }
      const [list, mine, cc, us] = await Promise.all([
        fetchAll(() => supabase.from('proc_requests').select('id, request_no, title, status, priority, estimated_total, needed_by, created_at, submitted_at, requester_id, cost_center_id').order('created_at', { ascending: false })),
        supabase.rpc('proc_my_cost_centers'),
        supabase.from('proc_cost_centers').select('id, name'),
        supabase.from('users').select('id, name, full_name, email'),
      ]);
      setRows(list); setMyCcs(Array.isArray(mine.data) ? mine.data : []);
      setCcNames(Object.fromEntries((cc.data || []).map((c: any) => [c.id, c.name])));
      setNames(Object.fromEntries((us.data || []).map((u: any) => [u.id, u.name || u.full_name || u.email])));
      if (seeAll) setScope('all'); else if ((Array.isArray(mine.data) ? mine.data : []).length) setScope('unit');
    })();
  }, []);

  const scoped = useMemo(() => (rows || []).filter(r =>
    scope === 'mine' ? r.requester_id === user?.id : scope === 'unit' ? myCcs.includes(r.cost_center_id) || r.requester_id === user?.id : true), [rows, scope, myCcs, user?.id]);
  const counts = useMemo(() => scoped.reduce((m: Record<string, number>, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {}), [scoped]);
  const shown = scoped.filter(r => (!status || r.status === status) && (!q || `${r.request_no || ''} ${r.title}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))));

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1A} /></div>;
  const tabs: { k: Scope; label: string; show: boolean }[] = [
    { k: 'mine', label: 'Benim taleplerim', show: true },
    { k: 'unit', label: 'Birimimin', show: myCcs.length > 0 },
    { k: 'all', label: 'Tümü', show: seeAll },
  ];
  return (
    <div className="space-y-3 p-3 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {tabs.filter(t => t.show).map(t => (
            <button key={t.k} onClick={() => setScope(t.k)} className={`rounded-md px-3 py-1.5 text-sm ${scope === t.k ? 'bg-[#1B3A5C] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{t.label}</button>
          ))}
        </div>
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="No veya başlık ara" className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-sm" />
        </div>
        <Link href="/procure/talep/yeni" className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#1B3A5C] px-3 text-sm font-medium text-white"><Plus className="h-4 w-4" />Yeni talep</Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setStatus('')} className={`rounded-full border px-2.5 py-1 text-xs ${!status ? 'border-[#1B3A5C] bg-[#1B3A5C] text-white' : 'border-slate-200 bg-white text-slate-600'}`}>Tümü ({scoped.length})</button>
        {(Object.keys(REQUEST_STATUS) as RequestStatus[]).filter(s => counts[s]).map(s => (
          <button key={s} onClick={() => setStatus(s === status ? '' : s)} className={`rounded-full border px-2.5 py-1 text-xs ${status === s ? 'border-[#1B3A5C] bg-[#1B3A5C] text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{REQUEST_STATUS[s].label} ({counts[s]})</button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {rows === null ? <div className="p-8 text-center text-sm text-slate-400">Yükleniyor…</div>
          : shown.length === 0 ? <div className="flex flex-col items-center p-10 text-center text-sm text-slate-500"><ClipboardList className="mb-2 h-8 w-8 text-slate-300" />Bu görünümde talep yok.</div>
          : <ul className="divide-y divide-slate-100">
              {shown.map(r => (
                <li key={r.id}>
                  <Link href={`/procure/talepler/${r.id}`} className="flex items-start gap-3 px-3 py-3 hover:bg-slate-50 sm:px-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                        {r.priority === 'urgent' && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />}
                        <span className="truncate">{r.title}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {r.request_no || 'Taslak'} · {names[r.requester_id] || '—'} · {ccNames[r.cost_center_id] || 'birim yok'} · {fmtDate(r.submitted_at || r.created_at)}
                        {r.needed_by && <> · gerekli: {fmtDate(r.needed_by)}</>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge status={r.status} />
                      <p className="mt-1 text-xs font-medium text-slate-700">{r.estimated_total != null ? tl(r.estimated_total) : '—'}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>}
      </Card>
    </div>
  );
}
