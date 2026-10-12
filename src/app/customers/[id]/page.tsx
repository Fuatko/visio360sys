'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Button, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { formatMoney } from '@/lib/utils';
import { completeness, findDuplicates, NACE } from '@/lib/crm';
import Timeline, { TLData } from '@/components/customer/Timeline';
import CompanyInfo from '@/components/customer/CompanyInfo';
import Contacts from '@/components/customer/Contacts';
import { Addresses, AccountTeam, InstalledBase } from '@/components/customer/Related';
import { ArrowLeft, Star, ShieldAlert, Building2, Sparkles, FileSignature, Target, AlertTriangle, GitMerge, CalendarClock, Network } from 'lucide-react';

type Tab = 'overview' | 'info' | 'contacts' | 'addresses' | 'base';
const tl = (v: any) => `₺${formatMoney(Math.round(Number(v) || 0))}`;
const n = (v: any) => Number(v) || 0;
const safe = async (q: any) => { const r = await q; return r.error ? [] : r.data || []; };

export default function CustomerCardPage() {
  const supabase = createClient();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const [c, setC] = useState<any>(undefined);
  const [all, setAll] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [rel, setRel] = useState<any>({ contacts: [], addresses: [], acct: [], base: [], consents: [] });
  const [tld, setTld] = useState<TLData>({ activities: [], visits: [], opps: [], quotes: [], orders: [], invoices: [], collections: [], complaints: [], surveys: [], contracts: [], briefs: [] });
  const [crmReady, setCrmReady] = useState(true);

  const load = useCallback(async () => {
    const { data: cust, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
    if (error || !cust) { setC(null); return; }
    setC(cust);
    const [allC, tm, u] = await Promise.all([
      supabase.from('customers').select('id, name, tax_number, phone, email, parent_id, merged_into, city').order('name'),
      supabase.from('sales_team').select('id, name, email').order('name'),
      supabase.auth.getUser(),
    ]);
    setAll(allC.data || []); setTeam(tm.data || []);
    const mine = (tm.data || []).find((x: any) => x.email && x.email.toLowerCase() === (u.data.user?.email || '').toLowerCase());
    setMe(mine?.id || null);
    const ct = await supabase.from('customer_contacts').select('*').eq('customer_id', id).order('created_at');
    setCrmReady(!ct.error);
    const [ad, ac, ib, cs] = await Promise.all([
      safe(supabase.from('customer_addresses').select('*').eq('customer_id', id).order('created_at')),
      safe(supabase.from('account_team').select('*').eq('customer_id', id)),
      safe(supabase.from('installed_base').select('*').eq('customer_id', id).order('contract_end')),
      safe(supabase.from('contact_consents').select('recipient, channel, status')),
    ]);
    setRel({ contacts: ct.error ? [] : ct.data || [], addresses: ad, acct: ac, base: ib, consents: cs });
    const [activities, visits, opps, quotes, orders, invoices, collections, complaints, surveys, contracts, briefs] = await Promise.all([
      safe(supabase.from('crm_activities').select('*').eq('customer_id', id).order('activity_date', { ascending: false }).limit(300)),
      safe(supabase.from('field_visits').select('*').eq('customer_id', id)),
      safe(supabase.from('opportunities').select('*').eq('customer_id', id)),
      safe(supabase.from('quotes').select('*').eq('customer_id', id)),
      safe(supabase.from('orders').select('*').eq('customer_id', id)),
      safe(supabase.from('invoices').select('*').eq('customer_id', id)),
      safe(supabase.from('collections').select('*').eq('customer_id', id)),
      safe(supabase.from('complaints').select('*').eq('customer_id', id)),
      safe(supabase.from('customer_surveys').select('*').eq('customer_id', id)),
      safe(supabase.from('contracts').select('*').eq('customer_id', id)),
      safe(supabase.from('account_briefs').select('id, created_at, customer_id').eq('customer_id', id)),
    ]);
    setTld({ activities, visits, opps, quotes, orders, invoices, collections, complaints, surveys, contracts, briefs });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const saveInfo = async (patch: any) => {
    const { error } = await supabase.from('customers').update(patch).eq('id', id);
    if (error) { alert(error.message); return false; }
    await load(); return true;
  };
  const addActivity = async (a: any) => {
    const base: any = { customer_id: id, type: a.type, title: a.title, description: a.description || null, activity_date: a.activity_date, sales_person_id: a.sales_person_id || null };
    const ext = crmReady ? { contact_id: a.contact_id || null, next_step: a.next_step || null, next_step_date: a.next_step_date || null } : {};
    let { error } = await supabase.from('crm_activities').insert([{ ...base, ...ext }]);
    if (error && crmReady) ({ error } = await supabase.from('crm_activities').insert([base]));
    if (error) { alert(error.message); return false; }
    if (a.next_step && crmReady) await supabase.from('customers').update({ next_step: a.next_step, next_step_date: a.next_step_date || null }).eq('id', id);
    await load(); return true;
  };

  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const kpi = useMemo(() => {
    const rev12 = tld.orders.filter(o => o.status !== 'cancelled' && String(o.order_date || o.created_at).slice(0, 10) >= yearAgo).reduce((a, o) => a + n(o.subtotal || o.total), 0);
    const openOpp = tld.opps.filter(o => !['Kazanıldı', 'Kaybedildi', 'won', 'lost'].includes(o.stage));
    const openRec = tld.collections.filter(x => !['Ödendi', 'paid'].includes(x.status)).reduce((a, x) => a + n(x.amount), 0);
    const overdue = tld.collections.filter(x => !['Ödendi', 'paid'].includes(x.status) && x.due_date && x.due_date < new Date().toISOString().slice(0, 10)).reduce((a, x) => a + n(x.amount), 0);
    const lastTouch = [...tld.activities.map(a => a.activity_date), ...tld.visits.filter(v => v.check_in_at).map(v => v.check_in_at)].filter(Boolean).sort().pop();
    return { rev12, openOpp, openOppVal: openOpp.reduce((a, o) => a + n(o.value), 0), openRec, overdue, lastTouch };
  }, [tld]);

  if (c === undefined) return <div><Header title="Müşteri kartı" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;
  if (c === null) return <div><Header title="Müşteri kartı" /><div className="p-6"><Card className="p-6 text-sm">Müşteri bulunamadı. <Link href="/customers" className="text-indigo-600">Listeye dön</Link></Card></div></div>;

  const comp = completeness({ ...c, _hasDecisionMaker: rel.contacts.some((x: any) => x.buying_role === 'decision_maker' && x.is_active !== false) }, rel.contacts.length, rel.addresses.length);
  const dups = findDuplicates(c, all);
  const parent = all.find(x => x.id === c.parent_id); const payer = all.find(x => x.id === c.payer_id);
  const children = all.filter(x => x.parent_id === c.id);
  const share = n(c.annual_potential) > 0 ? Math.min(100, Math.round((kpi.rev12 / n(c.annual_potential)) * 100)) : null;
  const daysSince = kpi.lastTouch ? Math.floor((Date.now() - new Date(kpi.lastTouch).getTime()) / 864e5) : null;
  const pname = (pid?: string) => team.find(t => t.id === pid)?.name;
  const nace = NACE.find(([k]) => k === String(c.nace_code || '').slice(0, 1));

  const merge = async (otherId: string, otherName: string) => {
    if (!confirm(`"${otherName}" kaydı bu karta birleştirilsin mi? Tüm teklif, sipariş, aktivite ve kişiler buraya taşınır; işlem geri alınamaz.`)) return;
    const { data, error } = await supabase.rpc('merge_customers', { p_keep: id, p_remove: otherId });
    if (error) { alert(error.message); return; }
    alert(`Birleştirildi: ${data?.moved ?? 0} kayıt taşındı.${data?.skipped?.length ? ' Bazı kayıtlar taşınamadı, eski kart pasif bırakıldı.' : ''}`);
    load();
  };

  const TABS: [Tab, string, number?][] = [['overview', 'Özet & zaman çizelgesi'], ['info', 'Firma bilgileri'], ['contacts', 'Kişiler', rel.contacts.filter((x: any) => x.is_active !== false).length],
    ['addresses', 'Adresler', rel.addresses.length], ['base', 'Kurulu baz', rel.base.length]];

  return (
    <div>
      <Header title="Müşteri kartı" />
      <div className="space-y-4 p-6">
        {!crmReady && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /><b>crm-kurumsal.sql</b> dosyasını Supabase'de çalıştırın; kişiler, adresler ve kurumsal alanlar açılır.</Card>}

        <Card className="p-5">
          <div className="flex flex-wrap items-start gap-4">
            <button onClick={() => router.push('/customers')} className="mt-1 text-slate-400 hover:text-slate-700"><ArrowLeft className="h-5 w-5" /></button>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-lg font-bold text-indigo-700">{c.name.slice(0, 2).toLocaleUpperCase('tr-TR')}</div>
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold">{c.is_key_account && <Star className="h-5 w-5 fill-amber-400 text-amber-400" />}{c.name}
                {c.abc_class && <span className="rounded bg-slate-800 px-2 text-xs font-semibold text-white">{c.abc_class}</span>}
                <Badge variant={c.status === 'VIP' ? 'warning' : c.status === 'Aktif' ? 'success' : 'info'}>{c.status}</Badge>
                {c.customer_type === 'dealer' && <Badge variant="primary">Bayi</Badge>}</h1>
              <p className="text-sm text-slate-500">{[c.legal_name, c.tax_office && c.tax_number && `${c.tax_office} VD · ${c.tax_number}`].filter(Boolean).join(' · ') || 'Ticari unvan ve vergi bilgisi girilmemiş'}</p>
              <p className="text-xs text-slate-500">{[c.segment, c.sector, nace && `NACE ${nace[0]}`, [c.district, c.city].filter(Boolean).join(' / '), pname(c.assigned_to) && `Sorumlu: ${pname(c.assigned_to)}`].filter(Boolean).join(' · ')}</p>
              {(parent || payer) && <p className="mt-1 flex items-center gap-1 text-xs text-slate-600"><Network className="h-3 w-3" />{parent && <>Grup: <Link href={`/customers/${parent.id}`} className="text-indigo-600">{parent.name}</Link></>}{payer && <> · Ödeyen: <Link href={`/customers/${payer.id}`} className="text-indigo-600">{payer.name}</Link></>}</p>}
              {(c.tags || []).length > 0 && <div className="mt-1 flex flex-wrap gap-1">{c.tags.map((t: string) => <span key={t} className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">#{t}</span>)}</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/briefs?customer=${c.id}`}><Button size="sm" variant="secondary"><Sparkles className="h-3 w-3" />Görüşme hazırlığı</Button></Link>
              <Link href="/opportunities"><Button size="sm" variant="secondary"><Target className="h-3 w-3" />Fırsat</Button></Link>
              <Link href="/quotes"><Button size="sm" variant="secondary"><FileSignature className="h-3 w-3" />Teklif</Button></Link>
            </div>
          </div>
          {c.order_block && <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-800"><ShieldAlert className="h-4 w-4" /><b>Sipariş blokajı:</b> {c.order_block_reason}</div>}
          {crmReady && dups.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
              <p className="flex items-center gap-1 font-medium"><GitMerge className="h-4 w-4" />Bu firmanın başka kaydı olabilir</p>
              {dups.slice(0, 4).map(d => <p key={d.id} className="text-xs"><Link href={`/customers/${d.id}`} className="underline">{d.name}</Link> — {d.reason} · <button className="font-medium text-indigo-700 underline" onClick={() => merge(d.id, d.name)}>bu karta birleştir</button></p>)}
            </div>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div><p className="text-[11px] text-slate-500">Son 12 ay ciro</p><p className="text-lg font-bold">{tl(kpi.rev12)}</p></div>
            <div><p className="text-[11px] text-slate-500">Cüzdan payı</p><p className="text-lg font-bold">{share === null ? '—' : `%${share}`}</p>{share !== null && <div className="h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-indigo-500" style={{ width: `${share}%` }} /></div>}{share === null && <p className="text-[10px] text-slate-400">Potansiyel girilmemiş</p>}</div>
            <div><p className="text-[11px] text-slate-500">Açık fırsat</p><p className="text-lg font-bold">{tl(kpi.openOppVal)}</p><p className="text-[10px] text-slate-400">{kpi.openOpp.length} fırsat</p></div>
            <div><p className="text-[11px] text-slate-500">Açık alacak</p><p className={`text-lg font-bold ${kpi.overdue ? 'text-red-600' : ''}`}>{tl(kpi.openRec)}</p>{kpi.overdue > 0 && <p className="text-[10px] text-red-600">{tl(kpi.overdue)} vadesi geçmiş</p>}</div>
            <div><p className="text-[11px] text-slate-500">Son temas</p><p className={`text-lg font-bold ${daysSince !== null && daysSince > 30 ? 'text-amber-600' : ''}`}>{daysSince === null ? '—' : daysSince === 0 ? 'Bugün' : `${daysSince} gün önce`}</p></div>
            <div><p className="text-[11px] text-slate-500">Kart doluluğu</p><p className={`text-lg font-bold ${comp.pct >= 80 ? 'text-green-700' : comp.pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>%{comp.pct}</p>
              <div className="h-1.5 rounded bg-slate-100"><div className={`h-1.5 rounded ${comp.pct >= 80 ? 'bg-green-500' : comp.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${comp.pct}%` }} /></div></div>
          </div>
        </Card>

        <div className="flex flex-wrap gap-1 rounded-xl border bg-white p-1">
          {TABS.map(([k, l, cnt]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-1.5 text-sm ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}{cnt ? <span className={`ml-1 text-xs ${tab === k ? 'text-indigo-200' : 'text-slate-400'}`}>{cnt}</span> : null}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <Timeline data={tld} contacts={rel.contacts} team={team} me={me} onAddActivity={addActivity} />
            <div className="space-y-4">
              <Card className={`p-4 ${!c.next_step ? 'border-amber-300' : ''}`}>
                <p className="flex items-center gap-1 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-indigo-600" />Sonraki adım</p>
                {c.next_step ? <p className={`mt-1 text-sm ${c.next_step_date && c.next_step_date < new Date().toISOString().slice(0, 10) ? 'text-red-600' : ''}`}>{c.next_step}{c.next_step_date && <span className="block text-xs text-slate-500">{new Date(c.next_step_date).toLocaleDateString('tr-TR')}</span>}</p>
                  : <p className="mt-1 text-xs text-amber-700">Tanımlı değil. Temas kaydederken sonraki adımı girin.</p>}
              </Card>
              {crmReady && <AccountTeam supabase={supabase} customerId={c.id} rows={rel.acct} team={team} ownerId={c.assigned_to} onChanged={load} />}
              {crmReady && rel.contacts.length > 0 && (
                <Card className="p-4">
                  <p className="text-sm font-semibold">Kilit kişiler</p>
                  <div className="mt-2 space-y-1 text-sm">{rel.contacts.filter((x: any) => x.is_active !== false && (x.is_primary || ['decision_maker', 'champion', 'blocker'].includes(x.buying_role))).slice(0, 6).map((x: any) => (
                    <p key={x.id}><span className="font-medium">{x.full_name}</span> <span className="text-xs text-slate-500">{x.title}{x.buying_role === 'decision_maker' ? ' · karar verici' : x.buying_role === 'champion' ? ' · destekçi' : x.buying_role === 'blocker' ? ' · engelleyici' : x.is_primary ? ' · ana irtibat' : ''}</span></p>))}</div>
                  <button className="mt-2 text-xs text-indigo-600" onClick={() => setTab('contacts')}>Tüm kişiler ve karar haritası →</button>
                </Card>
              )}
              {children.length > 0 && (
                <Card className="p-4"><p className="flex items-center gap-1 text-sm font-semibold"><Building2 className="h-4 w-4 text-indigo-600" />Grup şirketleri ({children.length})</p>
                  <div className="mt-2 space-y-1 text-sm">{children.map(x => <Link key={x.id} href={`/customers/${x.id}`} className="block text-indigo-700 hover:underline">{x.name}{x.city ? <span className="text-xs text-slate-400"> · {x.city}</span> : null}</Link>)}</div></Card>
              )}
              {comp.missing.length > 0 && (
                <Card className="p-4"><p className="text-sm font-semibold">Kartı tamamlayın</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-600">{comp.missing.map(m => <li key={m}>• {m}</li>)}</ul>
                  <button className="mt-2 text-xs text-indigo-600" onClick={() => setTab('info')}>Firma bilgilerine git →</button></Card>
              )}
            </div>
          </div>
        )}
        {tab === 'info' && <CompanyInfo customer={c} others={all.filter(x => !x.merged_into)} team={team} onSave={saveInfo} />}
        {tab === 'contacts' && <Contacts supabase={supabase} customerId={c.id} contacts={rel.contacts} consents={rel.consents} onChanged={load} />}
        {tab === 'addresses' && <Addresses supabase={supabase} customerId={c.id} rows={rel.addresses} onChanged={load} />}
        {tab === 'base' && <InstalledBase supabase={supabase} customerId={c.id} rows={rel.base} onChanged={load} />}
      </div>
    </div>
  );
}
