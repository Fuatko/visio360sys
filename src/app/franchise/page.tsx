'use client';

import Header from '@/components/Header';
import { Card } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Applications from '@/components/franchise/Applications';
import Audits from '@/components/franchise/Audits';
import Royalty from '@/components/franchise/Royalty';
import { OPEN_STAGES } from '@/lib/franchise';

type Tab = 'applications' | 'audits' | 'royalty';

export default function FranchisePage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('applications');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true);
  const [d, setD] = useState<any>({ apps: [], form: null, templates: [], audits: [], actions: [], agreements: [], reports: [], customers: [], team: [] });
  const [me, setMe] = useState<{ id?: string; name?: string } | null>(null);
  const [auditPreset, setAuditPreset] = useState<any | null>(null);
  const [focusDealer, setFocusDealer] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [apps, form, tpl, au, ac, ag, rp, cu, tm, u] = await Promise.all([
      supabase.from('franchise_applications').select('*').order('created_at', { ascending: false }),
      supabase.from('franchise_forms').select('*').maybeSingle(),
      supabase.from('audit_templates').select('*').order('created_at'),
      supabase.from('store_audits').select('*').order('audited_at', { ascending: false }).limit(500),
      supabase.from('store_audit_actions').select('*').order('due_date'),
      supabase.from('royalty_agreements').select('*'),
      supabase.from('royalty_reports').select('*').order('period', { ascending: false }).limit(2000),
      supabase.from('customers').select('id, name, customer_type').order('name'),
      supabase.from('sales_team').select('id, name, email').order('name'),
      supabase.auth.getUser(),
    ]);
    setReady(!apps.error);
    const team = tm.data || [];
    const mine = team.find((x: any) => x.email && x.email.toLowerCase() === (u.data.user?.email || '').toLowerCase());
    setMe(mine ? { id: mine.id, name: mine.name } : { name: u.data.user?.email || '' });
    setD({ apps: apps.data || [], form: form.data || null, templates: tpl.data || [], audits: au.data || [], actions: ac.data || [],
      agreements: ag.data || [], reports: rp.data || [], customers: cu.data || [], team });
    setLoading(false);
  }, []);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const t = q.get('tab') as Tab; if (t) setTab(t);
      if (q.get('branch')) setAuditPreset({ branch_id: q.get('branch'), visit_id: q.get('visit') || undefined });
    } catch { /* yok say */ }
    load();
  }, [load]);

  const dealers = d.customers.filter((c: any) => c.customer_type === 'dealer');
  // Franchise'lar önce, sonra diğer müşteriler (merkeze ait şubeler müşteri kartı olarak da açılabilir)
  const branches = [...dealers, ...d.customers.filter((c: any) => c.customer_type !== 'dealer')];
  const TABS: [Tab, string, number?][] = [
    ['applications', 'Franchise başvuruları', d.apps.filter((a: any) => a.stage === 'new').length],
    ['audits', 'Şube denetimleri', d.actions.filter((a: any) => a.status === 'done').length],
    ['royalty', 'Royalty & ciro', d.reports.filter((r: any) => r.status === 'submitted').length],
  ];

  if (loading) return <div><Header title="Franchise & Şube Ağı" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;

  return (
    <div>
      <Header title="Franchise & Şube Ağı" subtitle="Franchise satışı, şube standartları ve royalty gelirini tek yerden yönetin" />
      <div className="space-y-4 p-6">
        {!ready && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /><b>franchise.sql</b> dosyasını Supabase'de çalıştırın.</Card>}
        <div className="flex flex-wrap gap-1 rounded-xl border bg-white p-1">
          {TABS.map(([k, l, c]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-1.5 text-sm ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {l}{c ? <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{c}</span> : null}
            </button>
          ))}
        </div>
        {tab === 'applications' && <Applications supabase={supabase} apps={d.apps} form={d.form} team={d.team} onChanged={load}
          onOpenRoyalty={id => { setFocusDealer(id); setTab('royalty'); }} />}
        {tab === 'audits' && <Audits supabase={supabase} audits={d.audits} actions={d.actions} templates={d.templates} branches={branches} team={d.team} me={me}
          onChanged={load} preset={auditPreset} clearPreset={() => setAuditPreset(null)} />}
        {tab === 'royalty' && <Royalty supabase={supabase} agreements={d.agreements} reports={d.reports} dealers={dealers} onChanged={load}
          focusDealer={focusDealer} clearFocus={() => setFocusDealer(null)} />}
        {tab === 'applications' && d.apps.filter((a: any) => OPEN_STAGES.includes(a.stage)).length === 0 && !d.form && (
          <p className="text-center text-xs text-slate-400">İpucu: önce başvuru formunu oluşturun, bağlantısını web sitenize ve sosyal medyaya koyun; QR kodu fuar standına basın.</p>
        )}
      </div>
    </div>
  );
}
