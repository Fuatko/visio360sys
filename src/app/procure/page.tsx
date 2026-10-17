'use client';

// Inspira360 Procure — rol bazlı satınalma paneli
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Badge } from '@/components/ui';
import ProcureGate from '@/components/procure/ProcureGate';
import { StatusBadge } from '@/components/procure/RequestBits';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { fetchAll } from '@/lib/fetch-all';
import { MONTHS_TR, PROCURE_SQL_1A, SETUP_STEPS, fiscalYearOf, fmtDate, idList, roleLabel, tl, useProcure } from '@/lib/procure';
import { SqlMissingCard } from '@/components/procure/ProcureGate';
import { AlertCircle, ArrowRight, CheckSquare, FilePlus2, PiggyBank, Search, Wand2 } from 'lucide-react';

export default function ProcurePage() {
  return (
    <div>
      <Header title="Satınalma Paneli" subtitle="Inspira360 Procure" />
      <ProcureGate>{p => <Panel p={p} />}</ProcureGate>
    </div>
  );
}

function Panel({ p }: { p: ReturnType<typeof useProcure> }) {
  const supabase = createClient();
  const { user } = useAuth();
  const [s, setS] = useState<any>(null);
  const isBuyer = p.hasRole('buyer') || p.isAdmin;
  const isFin = p.hasRole('finance') || p.isAdmin;
  const canRequest = p.hasRole('requester') || p.hasRole('buyer') || p.isAdmin;

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const pol = await supabase.from('proc_policies').select('*').maybeSingle();
      const start = pol.data?.fiscal_year_start_month || 9;
      const fy = fiscalYearOf(new Date(), start);
      const [mine, pend, open, budget, actual] = await Promise.all([
        supabase.from('proc_requests').select('id, request_no, title, status, estimated_total, created_at, priority').eq('requester_id', user.id).order('created_at', { ascending: false }).limit(6),
        supabase.rpc('proc_my_pending_approvals'),
        isBuyer ? fetchAll(() => supabase.from('proc_requests').select('id, request_no, title, status, estimated_total, needed_by, priority, approved_at, submitted_at').in('status', ['submitted', 'approved']).order('needed_by', { ascending: true, nullsFirst: false })) : Promise.resolve([]),
        isFin ? supabase.from('proc_budget_status').select('*').eq('fiscal_year', fy) : Promise.resolve({ data: [] as any[] }),
        isFin ? supabase.rpc('proc_parasut_actuals', { p_fy: fy }) : Promise.resolve({ data: [] as any[] }),
      ]);
      const pendIds = idList(pend.data);
      const pendReqs = pendIds.length ? await supabase.from('proc_approvals').select('subject_id').in('id', pendIds) : { data: [] as any[] };
      const pendRows = (pendReqs.data || []).length ? (await supabase.from('proc_requests').select('id, request_no, title, estimated_total, priority').in('id', (pendReqs.data || []).map((x: any) => x.subject_id))).data || [] : [];
      const fm = ((new Date().getMonth() + 1 - start + 12) % 12) + 1;
      setS({
        policy: pol.data, fy, start, missing: !!mine.error && /relation|does not exist/i.test(mine.error.message),
        mine: mine.data || [], pend: pendRows, open,
        budget: budget.data || [], monthSpend: ((actual as any).data || []).filter((x: any) => x.fiscal_month === fm).reduce((a: number, x: any) => a + +x.amount, 0),
      });
    })();
  }, [user?.id, isBuyer, isFin]);

  if (!s) return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;
  const progress = s.policy?.setup_progress || {};
  const finished = SETUP_STEPS.filter(x => progress[x.key]).length;
  const pct = Math.round((finished / SETUP_STEPS.length) * 100);
  const bTot = s.budget.reduce((t: any, l: any) => ({ amount: t.amount + +l.amount, avail: t.avail + +l.available }), { amount: 0, avail: 0 });
  const usedPct = bTot.amount ? Math.round(((bTot.amount - bTot.avail) / bTot.amount) * 100) : 0;
  const hot = s.budget.filter((l: any) => +l.amount > 0).map((l: any) => ({ ...l, p: Math.round(((+l.amount - +l.available) / +l.amount) * 100) })).filter((l: any) => l.p >= 80).sort((a: any, b: any) => b.p - a.p).slice(0, 5);
  const toPrice = s.open.filter((r: any) => r.status === 'submitted');
  const toSource = s.open.filter((r: any) => r.status === 'approved');

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-6">
      {s.missing && <SqlMissingCard file={PROCURE_SQL_1A} />}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex flex-wrap gap-1.5">{p.roles.length ? p.roles.map(r => <Badge key={r} variant="primary">{roleLabel(r)}</Badge>) : <span className="text-sm text-slate-500">Satınalma rolünüz yok; yöneticinizden rol isteyin.</span>}</div>
        {canRequest && <Link href="/procure/talep/yeni" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#1B3A5C] px-5 text-base font-semibold text-white shadow-sm"><FilePlus2 className="h-5 w-5" />Yeni talep</Link>}
      </div>

      {s.pend.length > 0 && (
        <Card className="border-amber-200 p-4">
          <div className="mb-2 flex items-center justify-between"><p className="flex items-center gap-1.5 font-semibold text-slate-800"><CheckSquare className="h-4 w-4 text-amber-600" />Onayınızı bekleyen {s.pend.length} talep</p><Link href="/procure/onaylar" className="text-sm text-blue-700">Onaylara git →</Link></div>
          <ul className="divide-y divide-slate-100">{s.pend.slice(0, 5).map((r: any) => (
            <li key={r.id}><Link href={`/procure/talepler/${r.id}`} className="flex items-center gap-2 py-2 text-sm">{r.priority === 'urgent' && <AlertCircle className="h-3.5 w-3.5 text-rose-500" />}<span className="flex-1 truncate">{r.request_no} · {r.title}</span><b>{tl(r.estimated_total)}</b></Link></li>
          ))}</ul>
        </Card>
      )}

      {canRequest && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between"><p className="font-semibold text-slate-800">Taleplerim</p><Link href="/procure/talepler" className="text-sm text-blue-700">Tümü →</Link></div>
          {s.mine.length === 0 ? <p className="text-sm text-slate-500">Henüz talebiniz yok. “Yeni talep” ile başlayın.</p> : (
            <ul className="divide-y divide-slate-100">{s.mine.map((r: any) => (
              <li key={r.id}><Link href={`/procure/talepler/${r.id}`} className="flex items-center gap-2 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{r.request_no || 'Taslak'} · {r.title}</span><span className="hidden text-slate-600 sm:inline">{r.estimated_total != null ? tl(r.estimated_total) : ''}</span><StatusBadge status={r.status} /></Link></li>
            ))}</ul>
          )}
        </Card>
      )}

      {isBuyer && (
        <Card className="p-4">
          <p className="mb-2 flex items-center gap-1.5 font-semibold text-slate-800"><Search className="h-4 w-4" />Açık talepler</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Fiyatlandırılacak ({toPrice.length})</p>
              {toPrice.length === 0 ? <p className="text-xs text-slate-400">Yok.</p> : <ul className="space-y-1">{toPrice.slice(0, 6).map((r: any) => <li key={r.id}><Link href={`/procure/talepler/${r.id}`} className="block truncate text-sm text-slate-700 hover:text-blue-700">{r.request_no} · {r.title}</Link></li>)}</ul>}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Kaynak bulunacak — onaylı ({toSource.length})</p>
              {toSource.length === 0 ? <p className="text-xs text-slate-400">Yok.</p> : <ul className="space-y-1">{toSource.slice(0, 6).map((r: any) => <li key={r.id}><Link href={`/procure/talepler/${r.id}`} className="flex gap-2 text-sm text-slate-700 hover:text-blue-700"><span className="min-w-0 flex-1 truncate">{r.request_no} · {r.title}</span><span className="shrink-0 text-xs text-slate-400">{r.needed_by ? fmtDate(r.needed_by) : ''}</span></Link></li>)}</ul>}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Teklif toplama (RFQ), sipariş ve teslimat takibi sonraki fazda bu bölüme eklenecek.</p>
        </Card>
      )}

      {isFin && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><PiggyBank className="h-3.5 w-3.5" />{s.fy} bütçesi</p><p className="mt-1 text-xl font-bold text-slate-800">{tl(bTot.amount)}</p><p className="text-[11px] text-slate-400">Kalan {tl(bTot.avail)} · kullanım %{usedPct}</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500">Bu ay harcama ({MONTHS_TR[new Date().getMonth()]})</p><p className="mt-1 text-xl font-bold text-slate-800">{tl(s.monthSpend)}</p><p className="text-[11px] text-slate-400">Paraşüt'te kategorisi eşlenmiş alış faturaları</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500">%80'i geçen bütçe satırı</p><p className={`mt-1 text-xl font-bold ${hot.length ? 'text-amber-600' : 'text-slate-800'}`}>{hot.length}</p><Link href="/procure/butce" className="text-[11px] text-blue-700">Bütçe ekranı →</Link></Card>
        </div>
      )}

      {p.isAdmin && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1B3A5C]/10 text-[#1B3A5C]"><Wand2 className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">Kurulum sihirbazı</p>
              <p className="text-sm text-slate-500">{finished}/{SETUP_STEPS.length} adım tamamlandı veya atlandı · %{pct} · bütçe yılı başlangıcı {MONTHS_TR[s.start - 1]}</p>
              <div className="mt-2 h-2 max-w-md overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#10B981]" style={{ width: `${pct}%` }} /></div>
            </div>
            <Link href="/procure/setup" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{pct < 100 ? 'Kuruluma devam et' : 'Kurulumu düzenle'}<ArrowRight className="h-4 w-4" /></Link>
          </div>
        </Card>
      )}
    </div>
  );
}
