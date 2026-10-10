'use client';

import Header from '@/components/Header';
import { Card } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import HealthTab from '@/components/success/HealthTab';
import RenewalsTab from '@/components/success/RenewalsTab';
import SurveysTab from '@/components/success/SurveysTab';
import ComplaintsTab from '@/components/success/ComplaintsTab';

type Tab = 'health' | 'renewals' | 'surveys' | 'complaints';

export default function CustomerSuccessPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('health');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true);
  const [customers, setCustomers] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [data, setData] = useState<any>({ orders: [], collections: [], activities: [], surveys: [], complaints: [] });
  const [contracts, setContracts] = useState<any[]>([]);
  const [opps, setOpps] = useState<any[]>([]);
  const [surveyPreselect, setSurveyPreselect] = useState<string[] | null>(null);
  const [complaintPrefill, setComplaintPrefill] = useState<any | null>(null);

  const load = useCallback(async () => {
    const [c, t, o, col, a, s, cp, ct, op] = await Promise.all([
      supabase.from('customers').select('id, name, assigned_to, customer_type').order('name'),
      supabase.from('sales_team').select('id, name').order('name'),
      supabase.from('orders').select('*'),
      supabase.from('collections').select('customer_id, amount, status, due_date'),
      supabase.from('crm_activities').select('customer_id, activity_date').limit(5000),
      supabase.from('customer_surveys').select('*').order('sent_at', { ascending: false }),
      supabase.from('complaints').select('*'),
      supabase.from('contracts').select('*'),
      supabase.from('opportunities').select('id, stage'),
    ]);
    setReady(!s.error && !cp.error);
    setCustomers(c.data || []); setTeam(t.data || []); setContracts(ct.data || []); setOpps(op.data || []);
    setData({ orders: o.data || [], collections: col.data || [], activities: a.data || [], surveys: s.data || [], complaints: cp.data || [] });
    setLoading(false);
  }, []);
  useEffect(() => {
    try { const t = new URLSearchParams(window.location.search).get('tab') as Tab; if (t) setTab(t); } catch { /* yok say */ }
    load();
  }, [load]);

  const TABS: [Tab, string, number?][] = [
    ['health', 'Sağlık skoru'],
    ['renewals', 'Yenilemeler'],
    ['surveys', 'Memnuniyet (NPS)'],
    ['complaints', 'Şikâyet & DÖF', data.complaints.filter((c: any) => !['closed', 'rejected'].includes(c.status)).length],
  ];

  if (loading) return <div><Header title="Müşteri Başarısı" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;

  return (
    <div>
      <Header title="Müşteri Başarısı" subtitle="Müşteriyi kaybetmeden önce görün: sağlık skoru, yenilemeler, memnuniyet ve şikâyet yönetimi" />
      <div className="space-y-4 p-6">
        {!ready && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /><b>musteri-basarisi.sql</b> dosyasını Supabase'de çalıştırın.</Card>}
        <div className="flex flex-wrap gap-1 rounded-xl border bg-white p-1">
          {TABS.map(([k, l, c]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-1.5 text-sm ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {l}{c ? <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{c}</span> : null}
            </button>
          ))}
        </div>
        {tab === 'health' && <HealthTab supabase={supabase} customers={customers} data={data} team={team} onChanged={load}
          onSurvey={ids => { setSurveyPreselect(ids); setTab('surveys'); }} />}
        {tab === 'renewals' && <RenewalsTab supabase={supabase} contracts={contracts} customers={customers} opportunities={opps} ready={ready} onChanged={load} />}
        {tab === 'surveys' && <SurveysTab supabase={supabase} surveys={data.surveys} customers={customers} onChanged={load}
          preselect={surveyPreselect} clearPreselect={() => setSurveyPreselect(null)}
          onComplaint={s => { setComplaintPrefill({ customer_id: s.customer_id, survey_id: s.id, channel: 'Memnuniyet anketi', subject: `Düşük memnuniyet (NPS ${s.nps})`, description: s.comment || '' }); setTab('complaints'); }} />}
        {tab === 'complaints' && <ComplaintsTab supabase={supabase} complaints={data.complaints} customers={customers} team={team} onChanged={load}
          prefill={complaintPrefill} clearPrefill={() => setComplaintPrefill(null)} />}
      </div>
    </div>
  );
}
