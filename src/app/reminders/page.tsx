'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import { Card } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { loadReminders, KIND_LABEL, type Reminder, type ReminderKind } from '@/lib/reminders';
import ReminderList, { KIND_ICON } from '@/components/reminders/ReminderList';
import { AlertTriangle, BellRing, CheckCircle2 } from 'lucide-react';

type Range = 'today' | 'week' | 'all';

export default function RemindersPage() {
  const supabase = createClient();
  const [data, setData] = useState<{ ready: boolean; reminders: Reminder[]; hiddenCount: number } | null>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [rep, setRep] = useState<string>('');
  const [range, setRange] = useState<Range>('all');
  const [kind, setKind] = useState<ReminderKind | ''>('');

  const load = useCallback(async () => {
    const [r, tm, u] = await Promise.all([loadReminders(supabase, { crossSell: true }), supabase.from('sales_team').select('id, name, email').order('name'), supabase.auth.getUser()]);
    setData(r); setTeam(tm.data || []);
    const mine = (tm.data || []).find((x: any) => x.email && x.email.toLowerCase() === (u.data.user?.email || '').toLowerCase());
    setMe(mine?.id || null);
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const base = useMemo(() => (data?.reminders || []).filter(r => !rep || r.assigned_to === rep || (!r.customer_id && rep === me)), [data, rep, me]);
  const inRange = (r: Reminder) => range === 'all' || (range === 'today' ? r.due <= today : r.due <= week);
  const list = base.filter(r => inRange(r) && (!kind || r.kind === kind));
  const counts = useMemo(() => {
    const m: Partial<Record<ReminderKind, number>> = {}; base.filter(inRange).forEach(r => { m[r.kind] = (m[r.kind] || 0) + 1; }); return m;
  }, [base, range]);
  const p1 = base.filter(r => r.priority === 1).length;

  return (
    <div>
      <Header title="Akıllı Hatırlatmalar" />
      <div className="space-y-4 p-6">
        {data && !data.ready && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />"Tamamlandı" ve "Ertele" seçimlerinin saklanması için <b>capraz-satis-hatirlatma.sql</b> dosyasını Supabase'de çalıştırın.</Card>}

        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto max-w-3xl text-sm text-slate-600">Tahsilat, teklif okunma, sonraki adımlar, fırsat tarihleri, alım döngüsü, temassız kalan müşteriler, yenilemeler ve çapraz satış önerileri her açılışta verinizden yeniden hesaplanır.</p>
          <select value={rep} onChange={e => setRep(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
            <option value="">Tüm temsilciler</option>
            {me && <option value={me}>Benim müşterilerim</option>}
            {team.filter(t => t.id !== me).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex rounded-lg border bg-white p-0.5 text-sm">
            {([['today', 'Bugün'], ['week', 'Bu hafta'], ['all', 'Tümü']] as [Range, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setRange(k)} className={`rounded-md px-3 py-1 ${range === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <Card className="h-fit p-2">
            <button onClick={() => setKind('')} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${!kind ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'}`}>
              <span className="flex items-center gap-2"><BellRing className="h-4 w-4 text-indigo-600" />Tümü</span><span className="text-xs text-slate-500">{base.filter(inRange).length}</span></button>
            {(Object.keys(KIND_LABEL) as ReminderKind[]).filter(k => counts[k]).map(k => {
              const Icon = KIND_ICON[k].icon;
              return (
                <button key={k} onClick={() => setKind(k)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${kind === k ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'}`}>
                  <span className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded ${KIND_ICON[k].cls}`}><Icon className="h-3.5 w-3.5" /></span>{KIND_LABEL[k]}</span>
                  <span className="text-xs text-slate-500">{counts[k]}</span></button>);
            })}
            {data && data.hiddenCount > 0 && <p className="px-3 pt-2 text-[11px] text-slate-400">{data.hiddenCount} hatırlatma tamamlandı veya ertelendi.</p>}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <p className="text-sm font-semibold">{kind ? KIND_LABEL[kind] : range === 'today' ? 'Bugün yapılacaklar' : range === 'week' ? 'Bu hafta' : 'Tüm hatırlatmalar'}</p>
              <span className="text-xs text-slate-500">{list.length} kayıt</span>
              {p1 > 0 && <span className="ml-auto rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">{p1} acil</span>}
            </div>
            {!data ? <div className="flex h-40 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div>
              : list.length === 0 ? <div className="flex flex-col items-center gap-2 p-10 text-sm text-slate-500"><CheckCircle2 className="h-8 w-8 text-emerald-500" />Bu görünümde bekleyen hatırlatma yok.</div>
              : <ReminderList supabase={supabase} items={list} me={me} onChanged={load} />}
          </Card>
        </div>
      </div>
    </div>
  );
}
