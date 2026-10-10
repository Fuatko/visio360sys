'use client';

import Header from '@/components/Header';
import { Card, Badge } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { currentPeriods, periodRange, periodLabel, inRange } from '@/lib/periods';
import { FORECAST_CATEGORIES, fcLabel, isClosed, isWon, isLost, staleSignals } from '@/lib/pipeline';
import { AlertTriangle, TrendingUp, TrendingDown, Gauge, Trophy, XCircle, Clock, ArrowRight } from 'lucide-react';

type Tab = 'forecast' | 'changes' | 'stale' | 'winloss';
const tl = (v: number) => `₺${formatMoney(Math.round(v))}`;
const n = (v: any) => Number(v) || 0;
const d10 = (v: any) => (v ? String(v).slice(0, 10) : '');

function nextQuarter() {
  const d = new Date(); const q = Math.ceil((d.getMonth() + 1) / 3);
  return q === 4 ? `${d.getFullYear() + 1}-Q1` : `${d.getFullYear()}-Q${q + 1}`;
}

export default function ForecastPage() {
  const supabase = createClient();
  const cp = currentPeriods();
  const [tab, setTab] = useState<Tab>('forecast');
  const [period, setPeriod] = useState(cp.quarter);
  const [opps, setOpps] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [lastAct, setLastAct] = useState<Record<string, string>>({});
  const [prevSnap, setPrevSnap] = useState<any[]>([]);
  const [prevDate, setPrevDate] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [o, t, c, comp, act] = await Promise.all([
      supabase.from('opportunities').select('*'),
      supabase.from('sales_team').select('id, name, region'),
      supabase.from('customers').select('id, name'),
      supabase.from('competitors').select('id, name'),
      supabase.from('crm_activities').select('customer_id, activity_date').order('activity_date', { ascending: false }).limit(3000),
    ]);
    setOpps(o.data || []); setTeam(t.data || []); setCustomers(c.data || []); setCompetitors(comp.data || []);
    const la: Record<string, string> = {};
    (act.data || []).forEach((a: any) => { if (a.customer_id && !la[a.customer_id]) la[a.customer_id] = a.activity_date; });
    setLastAct(la);
    // Bu haftanın fotoğrafını al, önceki haftayla karşılaştır
    const snap = await supabase.rpc('take_pipeline_snapshot');
    if (snap.error) { setMissing(true); setLoading(false); return; }
    const thisWeek = (() => { const x = new Date(); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x.toISOString().slice(0, 10); })();
    const { data: dates } = await supabase.from('pipeline_snapshots').select('snapshot_date').lt('snapshot_date', thisWeek).order('snapshot_date', { ascending: false }).limit(1);
    const pd = dates?.[0]?.snapshot_date || null;
    setPrevDate(pd);
    if (pd) {
      const { data } = await supabase.from('pipeline_snapshots').select('*').eq('snapshot_date', pd);
      setPrevSnap(data || []);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const range = periodRange(period);
  const pname = (id: string) => team.find(t => t.id === id)?.name || 'Atanmamış';
  const cname = (id: string) => customers.find(c => c.id === id)?.name || '';

  const setCategory = async (id: string, v: string) => {
    setOpps(os => os.map(o => o.id === id ? { ...o, forecast_category: v } : o));
    const { error } = await supabase.from('opportunities').update({ forecast_category: v }).eq('id', id);
    if (error) alert(error.message);
  };

  // ---- Tahmin ----
  const inPeriodOpen = opps.filter(o => !isClosed(o.stage) && inRange(d10(o.expected_close), range));
  const wonInPeriod = opps.filter(o => isWon(o.stage) && inRange(d10(o.closed_at || o.expected_close), range));
  const sum = (xs: any[]) => xs.reduce((s, o) => s + n(o.value), 0);
  const byCat = (cat: string) => inPeriodOpen.filter(o => (o.forecast_category || 'pipeline') === cat);
  const won = sum(wonInPeriod), commit = sum(byCat('commit')), best = sum(byCat('best_case')), pipe = sum(byCat('pipeline'));
  const weighted = inPeriodOpen.filter(o => o.forecast_category !== 'omitted').reduce((s, o) => s + n(o.value) * n(o.probability) / 100, 0);

  const reps = useMemo(() => {
    const ids = Array.from(new Set([...inPeriodOpen, ...wonInPeriod].map(o => o.assigned_to || '')));
    return ids.map(id => {
      const mine = (xs: any[]) => xs.filter(o => (o.assigned_to || '') === id);
      const open = mine(inPeriodOpen);
      return { id, won: sum(mine(wonInPeriod)), commit: sum(open.filter(o => o.forecast_category === 'commit')),
        best: sum(open.filter(o => o.forecast_category === 'best_case')), pipe: sum(open.filter(o => (o.forecast_category || 'pipeline') === 'pipeline')),
        weighted: open.filter(o => o.forecast_category !== 'omitted').reduce((s, o) => s + n(o.value) * n(o.probability) / 100, 0) };
    }).sort((a, b) => (b.won + b.commit) - (a.won + a.commit));
  }, [opps, period]);

  // ---- Haftalık değişim ----
  const changes = useMemo(() => {
    if (!prevDate) return null;
    const prev = new Map(prevSnap.map(s => [s.opportunity_id, s]));
    const out = { added: [] as any[], won: [] as any[], lost: [] as any[], up: [] as any[], down: [] as any[], pushed: [] as any[], pulled: [] as any[], recat: [] as any[] };
    opps.forEach(o => {
      const p = prev.get(o.id);
      if (!p) { if (!isClosed(o.stage)) out.added.push({ o, delta: n(o.value) }); return; }
      const wasOpen = !isClosed(p.stage);
      if (wasOpen && isWon(o.stage)) out.won.push({ o, delta: n(o.value) });
      else if (wasOpen && isLost(o.stage)) out.lost.push({ o, delta: n(p.value) });
      else if (!isClosed(o.stage)) {
        const dv = n(o.value) - n(p.value);
        if (dv > 0) out.up.push({ o, delta: dv }); else if (dv < 0) out.down.push({ o, delta: dv });
        if (p.expected_close && o.expected_close && d10(o.expected_close) > d10(p.expected_close)) out.pushed.push({ o, from: p.expected_close });
        if (p.expected_close && o.expected_close && d10(o.expected_close) < d10(p.expected_close)) out.pulled.push({ o, from: p.expected_close });
        if ((p.forecast_category || 'pipeline') !== (o.forecast_category || 'pipeline')) out.recat.push({ o, from: p.forecast_category });
      }
    });
    const prevOpen = prevSnap.filter(s => !isClosed(s.stage)).reduce((a, s) => a + n(s.value), 0);
    const nowOpen = opps.filter(o => !isClosed(o.stage)).reduce((a, o) => a + n(o.value), 0);
    return { ...out, prevOpen, nowOpen };
  }, [opps, prevSnap, prevDate]);

  // ---- Durgun ----
  const stale = opps.map(o => ({ o, sig: staleSignals(o, o.customer_id ? (lastAct[o.customer_id] ?? null) : undefined) })).filter(x => x.sig.length)
    .sort((a, b) => n(b.o.value) - n(a.o.value));

  // ---- Kazanma / kaybetme ----
  const closed = opps.filter(o => isClosed(o.stage) && inRange(d10(o.closed_at || o.expected_close), range));
  const wonC = closed.filter(o => isWon(o.stage)), lostC = closed.filter(o => isLost(o.stage));
  const winRate = closed.length ? wonC.length / closed.length * 100 : null;
  const winRateVal = sum(closed) ? sum(wonC) / sum(closed) * 100 : null;
  const cycle = (xs: any[]) => { const v = xs.filter(o => o.created_at && o.closed_at); return v.length ? v.reduce((s, o) => s + (new Date(o.closed_at).getTime() - new Date(o.created_at).getTime()) / 864e5, 0) / v.length : null; };
  const group = (xs: any[], key: (o: any) => string) => {
    const m: Record<string, { c: number; v: number }> = {};
    xs.forEach(o => { const k = key(o) || 'Belirtilmemiş'; m[k] = m[k] || { c: 0, v: 0 }; m[k].c++; m[k].v += n(o.value); });
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v);
  };
  const lossReasons = group(lostC, o => o.close_reason), winReasons = group(wonC, o => o.close_reason);
  const lostTo = group(lostC.filter(o => o.close_competitor_id), o => competitors.find(c => c.id === o.close_competitor_id)?.name || '');

  const Bars = ({ rows, tone }: { rows: [string, { c: number; v: number }][]; tone: string }) => {
    const max = Math.max(...rows.map(r => r[1].v), 1);
    return rows.length === 0 ? <p className="text-xs text-slate-400">Veri yok</p> : (
      <div className="space-y-1.5">{rows.map(([k, r]) => (
        <div key={k} className="text-sm"><div className="flex justify-between"><span>{k}</span><span className="text-slate-500">{r.c} · {tl(r.v)}</span></div>
          <div className="h-1.5 rounded bg-slate-100"><div className={`h-1.5 rounded ${tone}`} style={{ width: `${r.v / max * 100}%` }} /></div></div>
      ))}</div>
    );
  };

  const Row = ({ o, extra }: { o: any; extra?: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
      <div className="min-w-0"><p className="truncate font-medium">{o.title}</p><p className="text-xs text-slate-500">{cname(o.customer_id)} · {pname(o.assigned_to)}</p></div>
      <div className="text-right text-xs">{extra}</div>
    </div>
  );

  if (loading) return <div><Header title="Satış Tahmini & Huni" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;

  return (
    <div>
      <Header title="Satış Tahmini & Huni" subtitle="Tahmin kategorileri, haftalık değişim, durgun fırsatlar ve kazanma/kaybetme analizi" />
      <div className="space-y-4 p-6">
        {missing && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /><b>satis-zekasi.sql</b> dosyasını Supabase'de çalıştırın.</Card>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-white p-1">
            {([['forecast', 'Tahmin'], ['changes', 'Bu hafta ne değişti?'], ['stale', `Durgun fırsatlar (${stale.length})`], ['winloss', 'Kazanma / Kaybetme']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 text-sm ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>
            ))}
          </div>
          {(tab === 'forecast' || tab === 'winloss') && (
            <select value={period} onChange={e => setPeriod(e.target.value)} className="ml-auto h-9 rounded-lg border px-2 text-sm">
              {[cp.month, cp.quarter, nextQuarter(), cp.year].map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}
            </select>
          )}
        </div>

        {tab === 'forecast' && (
          <>
            <div className="grid gap-3 md:grid-cols-5">
              <Card className="p-4"><p className="text-xs text-slate-500">Kazanılan</p><p className="text-xl font-bold text-green-700">{tl(won)}</p></Card>
              <Card className="border-green-300 p-4"><p className="text-xs text-slate-500">Tahmin (Kazanılan + Kesin)</p><p className="text-xl font-bold">{tl(won + commit)}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">En iyi senaryo (+ En iyi durum)</p><p className="text-xl font-bold text-blue-700">{tl(won + commit + best)}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Huni (belirsiz)</p><p className="text-xl font-bold text-slate-600">{tl(pipe)}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Olasılık ağırlıklı (açık)</p><p className="text-xl font-bold text-indigo-700">{tl(weighted)}</p><p className="text-[11px] text-slate-400">Kontrol için: temsilci tahmini vs olasılık</p></Card>
            </div>
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Temsilci bazında — {periodLabel(period)}</h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Temsilci</th><th className="text-right">Kazanılan</th><th className="text-right">Kesin</th><th className="text-right">Tahmin</th><th className="text-right">En iyi durum</th><th className="text-right">Huni</th><th className="text-right">Ağırlıklı</th></tr></thead>
                <tbody>
                  {reps.length === 0 && <tr><td colSpan={7} className="py-3 text-slate-500">Bu dönemde kapanış tarihli fırsat yok.</td></tr>}
                  {reps.map(r => (
                    <tr key={r.id} className="border-b"><td className="py-1.5 font-medium">{pname(r.id)}</td><td className="text-right text-green-700">{tl(r.won)}</td><td className="text-right">{tl(r.commit)}</td>
                      <td className="text-right font-semibold">{tl(r.won + r.commit)}</td><td className="text-right text-blue-700">{tl(r.best)}</td><td className="text-right text-slate-500">{tl(r.pipe)}</td>
                      <td className={`text-right ${Math.abs(r.weighted - (r.won + r.commit)) > (r.won + r.commit) * 0.3 ? 'text-amber-700' : ''}`}>{tl(r.weighted)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Bu dönem kapanması beklenen fırsatlar — kategoriyi buradan güncelleyin</h3>
              {inPeriodOpen.length === 0 ? <p className="text-sm text-slate-500">Fırsat yok.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Fırsat</th><th>Temsilci</th><th>Kapanış</th><th className="text-right">Değer</th><th className="text-right">Olasılık</th><th>Kategori</th></tr></thead>
                  <tbody>{[...inPeriodOpen].sort((a, b) => n(b.value) - n(a.value)).map(o => (
                    <tr key={o.id} className="border-b"><td className="py-1.5"><p className="font-medium">{o.title}</p><p className="text-xs text-slate-500">{cname(o.customer_id)} · {o.stage}</p></td>
                      <td className="text-xs">{pname(o.assigned_to)}</td><td className="text-xs">{formatDate(o.expected_close)}</td>
                      <td className="text-right">{tl(n(o.value))}</td><td className="text-right">%{n(o.probability)}</td>
                      <td><select value={o.forecast_category || 'pipeline'} onChange={e => setCategory(o.id, e.target.value)} className="h-8 rounded border px-1 text-xs">
                        {FORECAST_CATEGORIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></td></tr>
                  ))}</tbody>
                </table>
              )}
            </Card>
          </>
        )}

        {tab === 'changes' && (
          !changes ? <Card className="p-6 text-sm text-slate-500">Huni fotoğrafı her hafta bu sayfa açıldığında otomatik alınır. Gelecek hafta "geçen haftadan beri ne değişti" burada görünecek.</Card> : (
            <>
              <Card className="p-4">
                <p className="text-sm text-slate-500">{formatDate(prevDate!)} haftasından bugüne açık huni</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold">
                  <span>{tl(changes.prevOpen)}</span><ArrowRight className="h-4 w-4 text-slate-400" /><span>{tl(changes.nowOpen)}</span>
                  <Badge variant={changes.nowOpen >= changes.prevOpen ? 'success' : 'danger'}>{changes.nowOpen >= changes.prevOpen ? '+' : ''}{tl(changes.nowOpen - changes.prevOpen)}</Badge>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  {[['Yeni', changes.added, 'text-blue-700', 1], ['Değer arttı', changes.up, 'text-green-700', 1], ['Değer azaldı', changes.down, 'text-red-600', 1],
                    ['Kazanıldı', changes.won, 'text-green-700', 1], ['Kaybedildi', changes.lost, 'text-red-600', 1], ['Tarihi ertelendi', changes.pushed, 'text-amber-700', 0]].map(([l, xs, c, money]: any) => (
                    <div key={l} className="rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-500">{l}</p><p className={`font-semibold ${c}`}>{xs.length}{money ? ` · ${tl(xs.reduce((s: number, x: any) => s + Math.abs(n(x.delta)), 0))}` : ''}</p></div>
                  ))}
                </div>
              </Card>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4"><h3 className="mb-1 flex items-center gap-1 text-sm font-semibold"><Clock className="h-4 w-4 text-amber-600" />Kapanış tarihi ileri atılanlar</h3>
                  {changes.pushed.length === 0 ? <p className="text-xs text-slate-400">Yok</p> : changes.pushed.map((x: any) => <Row key={x.o.id} o={x.o} extra={<>{formatDate(x.from)} → <b>{formatDate(x.o.expected_close)}</b></>} />)}</Card>
                <Card className="p-4"><h3 className="mb-1 flex items-center gap-1 text-sm font-semibold"><Gauge className="h-4 w-4 text-indigo-600" />Kategorisi değişenler</h3>
                  {changes.recat.length === 0 ? <p className="text-xs text-slate-400">Yok</p> : changes.recat.map((x: any) => <Row key={x.o.id} o={x.o} extra={<>{fcLabel(x.from)} → <b>{fcLabel(x.o.forecast_category)}</b></>} />)}</Card>
                <Card className="p-4"><h3 className="mb-1 flex items-center gap-1 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-green-600" />Yeni ve büyüyen</h3>
                  {[...changes.added, ...changes.up].length === 0 ? <p className="text-xs text-slate-400">Yok</p> : [...changes.added, ...changes.up].map((x: any) => <Row key={x.o.id} o={x.o} extra={<span className="text-green-700">+{tl(x.delta)}</span>} />)}</Card>
                <Card className="p-4"><h3 className="mb-1 flex items-center gap-1 text-sm font-semibold"><TrendingDown className="h-4 w-4 text-red-600" />Küçülen ve kaybedilen</h3>
                  {[...changes.down, ...changes.lost].length === 0 ? <p className="text-xs text-slate-400">Yok</p> : [...changes.down, ...changes.lost].map((x: any) => <Row key={x.o.id} o={x.o} extra={<span className="text-red-600">{isLost(x.o.stage) ? 'Kaybedildi ' : ''}{tl(-Math.abs(x.delta))}</span>} />)}</Card>
              </div>
            </>
          )
        )}

        {tab === 'stale' && (
          <Card className="p-4">
            <p className="mb-3 text-xs text-slate-500">Kurallar: kapanış tarihi geçmiş, {30} günden uzun aynı aşamada, {14} günden uzun müşteriyle aktivite yok veya kapanış tarihi girilmemiş.</p>
            {stale.length === 0 ? <p className="text-sm text-green-700">Tüm açık fırsatlar güncel. 👏</p> : stale.map(({ o, sig }) => (
              <div key={o.id} className="flex flex-wrap items-start justify-between gap-2 border-b py-2 text-sm">
                <div><p className="font-medium">{o.title} <span className="text-xs font-normal text-slate-500">· {cname(o.customer_id)} · {pname(o.assigned_to)}</span></p>
                  <div className="mt-0.5 flex flex-wrap gap-1">{sig.map(s => <span key={s} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">{s}</span>)}</div></div>
                <div className="text-right"><p className="font-semibold">{tl(n(o.value))}</p><Link href="/opportunities" className="text-xs text-indigo-600">Fırsata git</Link>
                  {o.customer_id && <> · <Link href={`/briefs?opportunity=${o.id}`} className="text-xs text-indigo-600">Hazırlan</Link></>}</div>
              </div>
            ))}
          </Card>
        )}

        {tab === 'winloss' && (
          <>
            <div className="grid gap-3 md:grid-cols-5">
              <Card className="p-4"><p className="text-xs text-slate-500">Kazanma oranı (adet)</p><p className="text-xl font-bold">{winRate === null ? '-' : `%${Math.round(winRate)}`}</p><p className="text-[11px] text-slate-400">{wonC.length} kazanıldı / {lostC.length} kaybedildi</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Kazanma oranı (tutar)</p><p className="text-xl font-bold">{winRateVal === null ? '-' : `%${Math.round(winRateVal)}`}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Ort. kazanılan büyüklük</p><p className="text-xl font-bold text-green-700">{wonC.length ? tl(sum(wonC) / wonC.length) : '-'}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Ort. kaybedilen büyüklük</p><p className="text-xl font-bold text-red-600">{lostC.length ? tl(sum(lostC) / lostC.length) : '-'}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Ort. satış döngüsü</p><p className="text-xl font-bold">{cycle(wonC) === null ? '-' : `${Math.round(cycle(wonC)!)} gün`}</p></Card>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="p-4"><h3 className="mb-2 flex items-center gap-1 text-sm font-semibold"><XCircle className="h-4 w-4 text-red-500" />Kayıp nedenleri</h3><Bars rows={lossReasons} tone="bg-red-400" /></Card>
              <Card className="p-4"><h3 className="mb-2 flex items-center gap-1 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" />Kaybettiğimiz rakipler</h3><Bars rows={lostTo} tone="bg-amber-400" /></Card>
              <Card className="p-4"><h3 className="mb-2 flex items-center gap-1 text-sm font-semibold"><Trophy className="h-4 w-4 text-green-600" />Kazanma nedenleri</h3><Bars rows={winReasons} tone="bg-green-500" /></Card>
            </div>
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Kapanan fırsatlar — {periodLabel(period)}</h3>
              {closed.length === 0 ? <p className="text-sm text-slate-500">Bu dönemde kapanan fırsat yok.</p> : closed.map(o => (
                <Row key={o.id} o={o} extra={<><Badge variant={isWon(o.stage) ? 'success' : 'danger'}>{o.stage}</Badge> <b>{tl(n(o.value))}</b><span className="block text-slate-500">{o.close_reason || 'neden girilmemiş'}{o.close_note ? ` — ${o.close_note}` : ''}</span></>} />
              ))}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
