'use client';

// Inspira360 Procure — Kurulum sihirbazı (danışman bu ekranla kurulumu yapar)
import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/Header';
import { Card, Button } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import PolicyStep from '@/components/procure/setup/PolicyStep';
import CostCentersStep, { OrgUser } from '@/components/procure/setup/CostCentersStep';
import CategoriesStep from '@/components/procure/setup/CategoriesStep';
import MembersStep, { Member } from '@/components/procure/setup/MembersStep';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Category, CostCenter, DEFAULT_POLICY, ProcPolicy, SETUP_STEPS, isMissingSchema } from '@/lib/procure';
import { Check, ChevronLeft, ChevronRight, Clock, SkipForward } from 'lucide-react';

type Data = { policy: ProcPolicy; hasPolicy: boolean; ccs: CostCenter[]; cats: Category[]; members: Member[]; users: OrgUser[]; missing: boolean };

export default function ProcureSetupPage() {
  return (
    <div>
      <Header title="Satınalma Kurulum Sihirbazı" subtitle="Inspira360 Procure" />
      <ProcureGate role="procure_admin">{() => <Wizard />}</ProcureGate>
    </div>
  );
}

function Wizard() {
  const supabase = createClient();
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [d, setD] = useState<Data | null>(null);
  const [step, setStep] = useState(0);
  const [stepPicked, setStepPicked] = useState(false);

  const load = useCallback(async () => {
    const [pol, cc, cat, mem, us] = await Promise.all([
      supabase.from('proc_policies').select('*').maybeSingle(),
      supabase.from('proc_cost_centers').select('*').order('sort').order('name'),
      supabase.from('proc_categories').select('*').order('sort').order('name'),
      supabase.from('proc_members').select('*'),
      orgId ? supabase.from('users').select('*').eq('organization_id', orgId) : Promise.resolve({ data: [], error: null }),
    ]);
    const users: OrgUser[] = ((us.data || []) as any[])
      .map(u => ({ id: u.id, name: u.name || u.full_name || u.email, email: u.email, role: u.role, is_org_admin: u.is_org_admin }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
    setD({
      policy: { ...DEFAULT_POLICY, ...(pol.data || {}) }, hasPolicy: !!pol.data,
      ccs: cc.data || [], cats: cat.data || [], members: mem.data || [], users,
      missing: [pol.error, cc.error, cat.error, mem.error].some(isMissingSchema),
    });
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const progress = d?.policy.setup_progress || {};
  const finished = SETUP_STEPS.filter(s => progress[s.key]).length;
  const pct = Math.round((finished / SETUP_STEPS.length) * 100);

  // İlk açılışta tamamlanmamış ilk adıma git
  useEffect(() => {
    if (!d || stepPicked) return;
    const i = SETUP_STEPS.findIndex(s => !progress[s.key]);
    setStep(i < 0 ? 0 : i); setStepPicked(true);
  }, [d]);

  const mark = async (key: string, status: 'done' | 'skipped') => {
    if (!d) return;
    const next = { ...progress, [key]: status };
    const { error } = d.hasPolicy
      ? await supabase.from('proc_policies').update({ setup_progress: next }).eq('organization_id', orgId)
      : await supabase.from('proc_policies').insert({ organization_id: orgId, setup_progress: next });
    if (error) { alert(error.message); return; }
    await load();
    setStep(s => Math.min(s + 1, SETUP_STEPS.length - 1));
  };

  if (!d) return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;
  if (d.missing) return <div className="p-6"><SqlMissingCard /></div>;

  const cur = SETUP_STEPS[step];
  const phase = 'phase' in cur ? cur.phase : null;
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-800">Kurulum ilerlemesi</span>
          <span className="text-slate-600">{finished}/{SETUP_STEPS.length} adım · %{pct}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#10B981] transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {SETUP_STEPS.map((s, i) => {
            const st = progress[s.key];
            return (
              <button key={s.key} onClick={() => setStep(i)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${i === step ? 'border-[#1B3A5C] bg-[#1B3A5C] text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${st === 'done' ? 'bg-emerald-500 text-white' : st === 'skipped' ? 'bg-slate-300 text-white' : i === step ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                  {st === 'done' ? <Check className="h-3 w-3" /> : st === 'skipped' ? <SkipForward className="h-2.5 w-2.5" /> : i + 1}
                </span>
                {s.title}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="mb-4">
          <p className="text-xs text-slate-500">Adım {step + 1} / {SETUP_STEPS.length}{progress[cur.key] === 'skipped' ? ' · atlandı' : progress[cur.key] === 'done' ? ' · tamamlandı' : ''}</p>
          <h2 className="text-base font-semibold text-slate-900">{cur.title}</h2>
          <p className="text-sm text-slate-500">{cur.desc}</p>
        </div>

        {cur.key === 'policy' && <PolicyStep policy={d.policy} orgId={orgId} onSaved={async () => { await load(); setStep(1); }} />}
        {cur.key === 'cost_centers' && <CostCentersStep rows={d.ccs} users={d.users} onChange={load} />}
        {cur.key === 'categories' && <CategoriesStep rows={d.cats} onChange={load} />}
        {cur.key === 'members' && <MembersStep users={d.users} members={d.members} costCenters={d.ccs} orgId={orgId} onChange={load} />}
        {phase && (
          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>Bu adım <b>{phase}</b> ile açılacak (talep–onay, tedarikçi ve bütçe tabloları henüz kurulmadı). Şimdilik atlayabilirsiniz; adım açıldığında buradan devam edilir.</div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft className="h-4 w-4" />Geri</Button>
          <div className="ml-auto flex gap-2">
            {!progress[cur.key] && <Button variant="secondary" size="sm" onClick={() => mark(cur.key, 'skipped')}><SkipForward className="h-3.5 w-3.5" />Atla</Button>}
            {cur.key !== 'policy' && !phase && <Button size="sm" onClick={() => mark(cur.key, 'done')}><Check className="h-3.5 w-3.5" />Tamamlandı, devam</Button>}
            {cur.key === 'policy' && step < SETUP_STEPS.length - 1 && <Button variant="secondary" size="sm" onClick={() => setStep(step + 1)}>İleri<ChevronRight className="h-4 w-4" /></Button>}
          </div>
        </div>
      </Card>
    </div>
  );
}
