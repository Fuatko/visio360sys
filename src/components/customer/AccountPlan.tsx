'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Button } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { UNCATEGORIZED } from '@/lib/whitespace';
import { STATE } from '@/components/whitespace/WhitespaceUI';
import MoneyInput from '@/components/MoneyInput';
import {
  loadPlanContext, savePlan, suggestPlan, progress, yearRevenue, templateActions, normalize, currentQuarter,
  QUARTER_LABEL, RISK_LABEL, type Plan, type PlanAction, type Risk,
} from '@/lib/account-plans';
import { ClipboardList, Save, Plus, Trash2, AlertTriangle, Users, Target, Lightbulb, CheckCircle2, Circle, Loader2, Wand2 } from 'lucide-react';

const n = (v: any) => Number(v) || 0;
const tl = (v: any) => `₺${formatMoney(Math.round(n(v)))}`;
const pctTxt = (v: number | null) => (v === null ? '—' : `%${Math.round(v * 100)}`);
const ROLE: Record<string, string> = { decision_maker: 'Karar verici', champion: 'Destekçi', influencer: 'Etkileyici', user: 'Kullanıcı', blocker: 'Engelleyici', gatekeeper: 'Kapı bekçisi' };
const STATE_CLS = { ahead: 'text-emerald-700', on_track: 'text-slate-800', behind: 'text-rose-600', none: 'text-slate-800' };
const STATE_TXT = { ahead: 'Hedefin önünde', on_track: 'Hedefe uygun', behind: 'Hedefin gerisinde', none: 'Hedef girilmedi' };

export default function AccountPlan({ supabase, customer }: { supabase: any; customer: any }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof loadPlanContext>> | null>(null);
  const [p, setP] = useState<Plan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const c = await loadPlanContext(supabase, customer.id, year);
    setCtx(c); setP(c.plan ? normalize(c.plan) : null); setDirty(false);
  }, [customer.id, year]);
  useEffect(() => { load(); }, [load]);

  const set = (patch: Partial<Plan>) => { setP(x => (x ? { ...x, ...patch } : x)); setDirty(true); };

  const create = async () => {
    if (!ctx) return;
    setBusy(true); setErr(null);
    try {
      const saved = await savePlan(supabase, suggestPlan(ctx.ws, customer.id, year, customer.assigned_to || null));
      const tpl = templateActions(year).filter(a => year > thisYear || (year === thisYear && a.quarter >= currentQuarter()));
      if (tpl.length) await supabase.from('account_plan_actions').insert(tpl.map(a => ({ ...a, plan_id: saved.id, owner_id: saved.owner_id, due_date: a.due_date < new Date().toISOString().slice(0, 10) ? null : a.due_date })));
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!p) return;
    setBusy(true); setErr(null);
    try { setP(await savePlan(supabase, p)); setDirty(false); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const k = useMemo(() => {
    if (!ctx) return null;
    const actual = yearRevenue(ctx.ws, customer.id, year); const prev = yearRevenue(ctx.ws, customer.id, year - 1);
    const pr = progress(p?.revenue_target, actual, year);
    const pipe = ctx.openOpps.reduce((a: number, o: any) => a + n(o.value), 0);
    const weighted = ctx.openOpps.reduce((a: number, o: any) => a + n(o.value) * n(o.probability ?? 30) / 100, 0);
    return { actual, prev, pr, pipe, weighted };
  }, [ctx, p?.revenue_target, year]);

  if (!ctx || !k) return <Card className="p-6 text-sm text-slate-500">Yükleniyor…</Card>;

  const years = [...new Set([thisYear - 1, thisYear, thisYear + 1, ...ctx.years])].sort();
  const yearBar = (
    <div className="flex rounded-lg border bg-white p-0.5 text-sm">
      {years.map(y => <button key={y} onClick={() => { if (dirty && !confirm('Kaydedilmemiş değişiklikler var. Yine de yıl değiştirilsin mi?')) return; setYear(y); }} className={`rounded-md px-3 py-1 ${y === year ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{y}{ctx.years.includes(y) && y !== year ? ' •' : ''}</button>)}
    </div>
  );

  if (!ctx.ready) return <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" />Yıllık hesap planı için <b>hesap-plani.sql</b> dosyasını Supabase'de çalıştırın.</Card>;

  if (!p) return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3"><p className="flex items-center gap-1.5 font-semibold"><ClipboardList className="h-5 w-5 text-indigo-600" />{year} hesap planı</p><span className="flex-1" />{yearBar}</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">{year - 1} ciro</p><p className="text-lg font-bold">{tl(k.prev)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">{year} gerçekleşen</p><p className="text-lg font-bold">{tl(k.actual)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Açık fırsatlar</p><p className="text-lg font-bold">{tl(k.pipe)}</p></div>
      </div>
      <p className="mt-4 max-w-2xl text-sm text-slate-600">Bu müşteri için {year} planı yok. Plan oluşturulduğunda geçen yılın cirosu ve beyaz alan önerilerinden hedefler önerilir, her çeyreğe bir örnek aksiyon eklenir. Hepsini sonra değiştirebilirsiniz.</p>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <Button className="mt-4" disabled={busy} onClick={create}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}{year} planını oluştur</Button>
    </Card>
  );

  // Kategori satırları: plandakiler + verisi olanlar
  const offs = [...new Set([...p.category_targets.map(c => c.offering), ...ctx.ws.offerings.filter(o => o !== UNCATEGORIZED && (n(ctx.ws.cells[customer.id]?.[o]?.byYear[year]) || n(ctx.ws.cells[customer.id]?.[o]?.byYear[year - 1])))])];
  const catSum = p.category_targets.reduce((a, c) => a + n(c.target), 0);
  const setCat = (o: string, patch: any) => {
    const ex = p.category_targets.find(c => c.offering === o);
    set({ category_targets: ex ? p.category_targets.map(c => (c.offering === o ? { ...c, ...patch } : c)) : [...p.category_targets, { offering: o, target: null, ...patch }] });
  };
  const addSuggestions = () => {
    const add = ctx.ws.suggestions.filter(s => s.customer_id === customer.id && !p.category_targets.some(c => c.offering === s.offering && n(c.target)));
    if (!add.length) { alert('Eklenecek yeni çapraz satış önerisi yok.'); return; }
    set({ category_targets: [...p.category_targets.filter(c => !add.some(s => s.offering === c.offering)), ...add.map(s => ({ offering: s.offering, target: Math.round(s.est / 1000) * 1000, note: 'Çapraz satış hedefi' }))] });
  };
  const owner = ctx.team.find((t: any) => t.id === p.owner_id);
  const dm = ctx.contacts.filter((c: any) => c.buying_role === 'decision_maker');
  const keyContacts = ctx.contacts.filter((c: any) => c.is_primary || ['decision_maker', 'champion', 'blocker', 'influencer'].includes(c.buying_role));
  const daysAgo = (d?: string) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : null);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-1.5 font-semibold"><ClipboardList className="h-5 w-5 text-indigo-600" />{year} hesap planı</p>
          {yearBar}
          <select value={p.owner_id || ''} onChange={e => set({ owner_id: e.target.value || null })} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
            <option value="">Plan sahibi seçin</option>{ctx.team.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={p.status} onChange={e => set({ status: e.target.value as any })} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
            <option value="draft">Taslak</option><option value="active">Aktif</option><option value="closed">Kapandı</option>
          </select>
          <span className="flex-1" />
          {p.updated_at && !dirty && <span className="text-[11px] text-slate-400">Son kayıt {new Date(p.updated_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>}
          <Button size="sm" disabled={busy || !dirty} onClick={save}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{dirty ? 'Kaydet' : 'Kaydedildi'}</Button>
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div><p className="text-[11px] text-slate-500">Yıllık ciro hedefi (KDV hariç)</p>
            <MoneyInput value={p.revenue_target} onChange={v => set({ revenue_target: v })} className="mt-0.5 w-full rounded-lg border px-2 py-1 text-lg font-bold" />
            {catSum > 0 && Math.abs(catSum - n(p.revenue_target)) > 1 && <button onClick={() => set({ revenue_target: catSum })} className="text-[10px] text-indigo-600">Kategori toplamı {tl(catSum)} — eşitle</button>}</div>
          <div><p className="text-[11px] text-slate-500">Gerçekleşen ({year})</p><p className="text-lg font-bold">{tl(k.actual)}</p>
            <div className="mt-1 h-1.5 rounded bg-slate-100"><div className={`h-1.5 rounded ${k.pr.state === 'behind' ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (k.pr.pct || 0) * 100)}%` }} /></div>
            <p className="text-[10px] text-slate-400">{pctTxt(k.pr.pct)} · beklenen {pctTxt(k.pr.expected)}</p></div>
          <div><p className="text-[11px] text-slate-500">Yıl sonu tahmini</p><p className={`text-lg font-bold ${STATE_CLS[k.pr.state]}`}>{tl(k.pr.projection)}</p><p className={`text-[10px] ${STATE_CLS[k.pr.state]}`}>{STATE_TXT[k.pr.state]}</p></div>
          <div><p className="text-[11px] text-slate-500">{year - 1} ciro</p><p className="text-lg font-bold">{tl(k.prev)}</p>{k.prev > 0 && n(p.revenue_target) > 0 && <p className="text-[10px] text-slate-400">Hedef büyüme %{Math.round((n(p.revenue_target) / k.prev - 1) * 100)}</p>}</div>
          <div><p className="text-[11px] text-slate-500">Hedefe kalan</p><p className="text-lg font-bold">{tl(k.pr.gap)}</p>
            <p className="text-[10px] text-slate-400">Açık fırsat {tl(k.pipe)} · ağırlıklı {tl(k.weighted)}{k.pr.gap > 0 && k.weighted < k.pr.gap ? <span className="text-rose-600"> · fırsatlar açığı kapatmıyor</span> : null}</p></div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Target className="h-4 w-4 text-indigo-600" />Kategori bazında büyüme hedefleri</p>
              <span className="flex-1" />
              <Button size="sm" variant="secondary" onClick={addSuggestions}><Lightbulb className="h-3.5 w-3.5" />Çapraz satış önerilerini ekle</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Kategori</th><th className="px-2 py-2 font-medium">Durum</th><th className="px-2 py-2 text-right font-medium">{year - 1}</th>
                  <th className="px-2 py-2 text-right font-medium">{year} gerçekleşen</th><th className="px-2 py-2 text-right font-medium">Hedef</th><th className="px-2 py-2 text-right font-medium">%</th><th className="px-2 py-2 font-medium">Not</th><th /></tr></thead>
                <tbody>
                  {offs.length === 0 && <tr><td colSpan={8} className="px-4 py-4 text-sm text-slate-500">Henüz kategori yok. Çapraz satış önerilerini ekleyebilir veya beyaz alan ekranından değerlendirme girebilirsiniz.</td></tr>}
                  {offs.map(o => {
                    const c = ctx.ws.cells[customer.id]?.[o]; const t = p.category_targets.find(x => x.offering === o);
                    const act = n(c?.byYear[year]); const st = ctx.ws.stateOf(customer.id, o);
                    return (
                      <tr key={o} className="border-b last:border-0">
                        <td className="px-4 py-2 font-medium">{o}</td>
                        <td className="px-2 py-2"><span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATE[st === 'empty' ? 'suggested' : st].cls}`}>{STATE[st === 'empty' ? 'suggested' : st].label}</span></td>
                        <td className="px-2 py-2 text-right text-slate-500">{tl(c?.byYear[year - 1])}</td>
                        <td className="px-2 py-2 text-right">{tl(act)}</td>
                        <td className="px-2 py-1 text-right"><MoneyInput value={t?.target ?? null} onChange={v => setCat(o, { target: v })} className="w-32 rounded border px-2 py-1 text-right text-sm" /></td>
                        <td className={`px-2 py-2 text-right text-xs ${n(t?.target) && act / n(t?.target) < progress(1, 0, year).expected * 0.85 ? 'text-rose-600' : 'text-slate-600'}`}>{n(t?.target) ? `%${Math.round(act / n(t?.target) * 100)}` : '—'}</td>
                        <td className="px-2 py-1"><input value={t?.note || ''} onChange={e => setCat(o, { note: e.target.value })} className="w-full min-w-[140px] rounded border px-2 py-1 text-xs" placeholder="Nasıl büyüyeceğiz?" /></td>
                        <td className="px-2">{t && <button title="Hedefi kaldır" onClick={() => set({ category_targets: p.category_targets.filter(x => x.offering !== o) })} className="text-slate-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {offs.length > 0 && <tfoot><tr className="border-t bg-slate-50 text-sm font-semibold"><td className="px-4 py-2" colSpan={2}>Toplam</td>
                  <td className="px-2 py-2 text-right">{tl(k.prev)}</td><td className="px-2 py-2 text-right">{tl(k.actual)}</td><td className="px-2 py-2 text-right">{tl(catSum)}</td><td colSpan={3} /></tr></tfoot>}
              </table>
            </div>
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold">Strateji</p>
            <div className="grid gap-3 md:grid-cols-3">
              {([['customer_priorities', 'Müşterinin bu yılki öncelikleri', 'Ör. yeni şube açılışları, maliyet azaltma, KVKK uyumu…'],
                 ['our_strategy', 'Stratejimiz / değer önerimiz', 'Ör. danışmanlıkta süreç iyileştirme fazına geçiş, teknik serviste SLA paketi…'],
                 ['relationship_goal', 'İlişki hedefi', 'Ör. genel müdürle çeyrekte bir görüşme, satın almada yeni irtibat…']] as [keyof Plan, string, string][]).map(([f, l, ph]) => (
                <label key={f} className="text-xs font-medium text-slate-600">{l}
                  <textarea value={(p[f] as string) || ''} onChange={e => set({ [f]: e.target.value } as any)} rows={5} placeholder={ph} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal" /></label>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2"><p className="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" />Riskler</p><span className="flex-1" />
              <Button size="sm" variant="secondary" onClick={() => set({ risks: [...p.risks, { text: '', level: 'medium', mitigation: '' }] })}><Plus className="h-3.5 w-3.5" />Risk ekle</Button></div>
            {p.risks.length === 0 ? <p className="text-xs text-slate-500">Risk girilmedi. Ör. bütçe kesintisi, rakip teklifi, karar vericinin değişmesi, ödeme gecikmesi.</p> : (
              <div className="space-y-2">{p.risks.map((r, i) => {
                const upd = (patch: Partial<Risk>) => set({ risks: p.risks.map((x, k2) => (k2 === i ? { ...x, ...patch } : x)) });
                return (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1fr_110px_1fr_28px]">
                    <input value={r.text} onChange={e => upd({ text: e.target.value })} placeholder="Risk" className="rounded border px-2 py-1.5 text-sm" />
                    <select value={r.level} onChange={e => upd({ level: e.target.value as any })} className={`rounded border px-2 py-1.5 text-sm ${r.level === 'high' ? 'text-rose-700' : r.level === 'medium' ? 'text-amber-700' : 'text-slate-600'}`}>
                      {Object.entries(RISK_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <input value={r.mitigation || ''} onChange={e => upd({ mitigation: e.target.value })} placeholder="Önlem" className="rounded border px-2 py-1.5 text-sm" />
                    <button onClick={() => set({ risks: p.risks.filter((_, k2) => k2 !== i) })} className="text-slate-300 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>);
              })}</div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4 text-indigo-600" />Kilit kişiler</p>
            {dm.length === 0 && <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800">Karar verici tanımlı değil. Kişiler sekmesinden satın alma rolünü işaretleyin.</p>}
            <div className="mt-2 space-y-2">{keyContacts.slice(0, 8).map((c: any) => {
              const d = daysAgo(ctx.lastTouch[c.id]);
              return (
                <div key={c.id} className="text-sm">
                  <p className="font-medium">{c.full_name} <span className="text-xs font-normal text-slate-500">{[c.title, ROLE[c.buying_role]].filter(Boolean).join(' · ')}</span></p>
                  <p className={`text-[11px] ${d === null || d > 90 ? 'text-amber-700' : 'text-slate-400'}`}>{d === null ? 'Kayıtlı görüşme yok' : `Son görüşme ${d} gün önce`}</p>
                </div>);
            })}
              {keyContacts.length === 0 && <p className="text-xs text-slate-500">Kilit kişi yok.</p>}</div>
          </Card>
          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Target className="h-4 w-4 text-indigo-600" />Açık fırsatlar</p>
            <div className="mt-2 space-y-1.5">{ctx.openOpps.length === 0 ? <p className="text-xs text-slate-500">Açık fırsat yok. Hedefe kalan tutar için fırsat açmayı düşünün.</p> : ctx.openOpps.slice(0, 8).map((o: any) => (
              <div key={o.id} className="flex items-center justify-between gap-2 text-sm"><Link href="/opportunities" className="min-w-0 truncate hover:text-indigo-700">{o.title}</Link><span className="shrink-0 text-xs text-slate-500">{tl(o.value)} · {o.stage}</span></div>))}</div>
          </Card>
          {owner && <p className="px-1 text-[11px] text-slate-400">Plan sahibi: {owner.name}</p>}
        </div>
      </div>

      <Actions supabase={supabase} plan={p} year={year} actions={ctx.actions} team={ctx.team} offerings={offs} onChanged={load} />
    </div>
  );
}

/** Çeyrek bazında aksiyon panosu — değişiklikler anında kaydedilir */
function Actions({ supabase, plan, year, actions, team, offerings, onChanged }: { supabase: any; plan: Plan; year: number; actions: PlanAction[]; team: any[]; offerings: string[]; onChanged: () => void }) {
  const [adding, setAdding] = useState<number | null>(null);
  const [f, setF] = useState({ title: '', due_date: '', owner_id: plan.owner_id || '', offering: '' });
  const today = new Date().toISOString().slice(0, 10);
  const cq = year === new Date().getFullYear() ? currentQuarter() : 0;
  const toggle = async (a: PlanAction) => {
    const done = a.status !== 'done';
    await supabase.from('account_plan_actions').update({ status: done ? 'done' : 'open', done_at: done ? new Date().toISOString() : null }).eq('id', a.id);
    onChanged();
  };
  const remove = async (a: PlanAction) => { if (!confirm(`"${a.title}" silinsin mi?`)) return; await supabase.from('account_plan_actions').delete().eq('id', a.id); onChanged(); };
  const add = async (q: number) => {
    if (!f.title.trim()) return;
    const { error } = await supabase.from('account_plan_actions').insert([{ plan_id: plan.id, quarter: q, title: f.title.trim(), due_date: f.due_date || null, owner_id: f.owner_id || null, offering: f.offering || null }]);
    if (error) { alert(error.message); return; }
    setAdding(null); setF({ title: '', due_date: '', owner_id: plan.owner_id || '', offering: '' }); onChanged();
  };
  const done = actions.filter(a => a.status === 'done').length;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-indigo-600" />Çeyrek aksiyon planı</p>
        <span className="text-xs text-slate-500">{done}/{actions.filter(a => a.status !== 'cancelled').length} tamamlandı · tarihi gelen aksiyonlar Akıllı Hatırlatmalar'a düşer</span>
      </div>
      <div className="grid gap-px bg-slate-100 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map(q => {
          const list = actions.filter(a => a.quarter === q && a.status !== 'cancelled');
          return (
            <div key={q} className={`bg-white p-3 ${q === cq ? 'ring-2 ring-inset ring-indigo-200' : ''}`}>
              <p className={`mb-2 text-xs font-semibold ${q === cq ? 'text-indigo-700' : 'text-slate-500'}`}>{QUARTER_LABEL[q - 1]}{q === cq ? ' · şu an' : ''}</p>
              <div className="space-y-1.5">{list.map(a => {
                const late = a.status === 'open' && a.due_date && a.due_date < today;
                return (
                  <div key={a.id} className="group flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm">
                    <button onClick={() => toggle(a)} className="mt-0.5 shrink-0">{a.status === 'done' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}</button>
                    <div className="min-w-0 flex-1">
                      <p className={a.status === 'done' ? 'text-slate-400 line-through' : ''}>{a.title}</p>
                      <p className={`text-[11px] ${late ? 'text-rose-600' : 'text-slate-400'}`}>{[a.due_date && new Date(a.due_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), team.find(t => t.id === a.owner_id)?.name, a.offering].filter(Boolean).join(' · ') || 'Tarih yok'}{late ? ' · gecikti' : ''}</p>
                    </div>
                    <button onClick={() => remove(a)} className="shrink-0 text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>);
              })}</div>
              {adding === q ? (
                <div className="mt-2 space-y-1.5 rounded-md border bg-slate-50 p-2">
                  <input autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} onKeyDown={e => e.key === 'Enter' && add(q)} placeholder="Aksiyon" className="w-full rounded border px-2 py-1 text-sm" />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input type="date" value={f.due_date} min={`${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`} onChange={e => setF({ ...f, due_date: e.target.value })} className="rounded border px-2 py-1 text-xs" />
                    <select value={f.owner_id} onChange={e => setF({ ...f, owner_id: e.target.value })} className="rounded border px-1 py-1 text-xs"><option value="">Sorumlu</option>{team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                  </div>
                  {offerings.length > 0 && <select value={f.offering} onChange={e => setF({ ...f, offering: e.target.value })} className="w-full rounded border px-1 py-1 text-xs"><option value="">Kategori (opsiyonel)</option>{offerings.map(o => <option key={o} value={o}>{o}</option>)}</select>}
                  <div className="flex justify-end gap-1.5"><Button size="sm" variant="secondary" onClick={() => setAdding(null)}>Vazgeç</Button><Button size="sm" onClick={() => add(q)}>Ekle</Button></div>
                </div>
              ) : <button onClick={() => { setAdding(q); setF({ title: '', due_date: '', owner_id: plan.owner_id || '', offering: '' }); }} className="mt-2 flex items-center gap-1 text-xs text-indigo-600"><Plus className="h-3 w-3" />Aksiyon ekle</button>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
