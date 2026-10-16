// Yıllık hesap planı: müşteri × yıl hedefi, kategori büyüme hedefleri, strateji, riskler ve çeyrek aksiyonları.
// Gerçekleşenler beyaz alan motorundan (Paraşüt faturaları + yazılım siparişleri, KDV hariç, takvim yılı) gelir.

import { loadWhitespace, UNCATEGORIZED, type WSData } from '@/lib/whitespace';

const n = (v: any) => Number(v) || 0;
const safe = async (q: any) => { try { const r = await q; return r.error ? [] : r.data || []; } catch { return []; } };

export type CategoryTarget = { offering: string; target: number | null; note?: string };
export type Risk = { text: string; level: 'high' | 'medium' | 'low'; mitigation?: string };
export type Plan = {
  id?: string; customer_id: string; year: number; owner_id: string | null; status: 'draft' | 'active' | 'closed';
  revenue_target: number | null; category_targets: CategoryTarget[]; customer_priorities: string; our_strategy: string;
  relationship_goal: string; risks: Risk[]; notes?: string | null; updated_at?: string;
};
export type PlanAction = {
  id: string; plan_id: string; quarter: number; title: string; offering: string | null; owner_id: string | null;
  due_date: string | null; status: 'open' | 'done' | 'cancelled'; done_at: string | null;
};

export const QUARTER_LABEL = ['1. Çeyrek (Oca–Mar)', '2. Çeyrek (Nis–Haz)', '3. Çeyrek (Tem–Eyl)', '4. Çeyrek (Eki–Ara)'];
export const RISK_LABEL = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' } as const;
export const currentQuarter = () => Math.floor(new Date().getMonth() / 3) + 1;

/** Müşterinin bir yıldaki toplam cirosu (KDV hariç) — tüm kategoriler */
export const yearRevenue = (ws: WSData, customerId: string, year: number) =>
  Object.values(ws.cells[customerId] || {}).reduce((a, c) => a + n(c.byYear[year]), 0);

/** Hedefe göre ilerleme: yılın geçen kısmına göre beklenen, yıl sonu tahmini */
export function progress(target: number | null | undefined, actual: number, year: number) {
  const now = new Date(); const y = now.getFullYear();
  const start = new Date(year, 0, 1).getTime(); const end = new Date(year + 1, 0, 1).getTime();
  const elapsed = year < y ? 1 : year > y ? 0 : Math.min(1, Math.max(0.01, (now.getTime() - start) / (end - start)));
  const projection = year === y ? actual / elapsed : actual;
  const t = n(target);
  const pct = t > 0 ? actual / t : null;
  const expected = elapsed;
  const state: 'none' | 'ahead' | 'on_track' | 'behind' = !t ? 'none' : pct! >= expected * 1.05 ? 'ahead' : pct! >= expected * 0.85 ? 'on_track' : 'behind';
  return { pct, expected, projection, state, gap: Math.max(0, t - actual) };
}

export const emptyPlan = (customerId: string, year: number, ownerId: string | null): Plan => ({
  customer_id: customerId, year, owner_id: ownerId, status: 'active', revenue_target: null, category_targets: [],
  customer_priorities: '', our_strategy: '', relationship_goal: '', risks: [],
});

/** Yeni plan için öneri: geçen yıl + büyüme, beyaz alan önerileri */
export function suggestPlan(ws: WSData, customerId: string, year: number, ownerId: string | null): Plan {
  const p = emptyPlan(customerId, year, ownerId);
  const prev = yearRevenue(ws, customerId, year - 1); const cur = yearRevenue(ws, customerId, year);
  const pr = progress(null, cur, year);
  const base = Math.max(prev, year === new Date().getFullYear() ? pr.projection : cur);
  const cats: CategoryTarget[] = [];
  ws.offerings.filter(o => o !== UNCATEGORIZED).forEach(o => {
    const c = ws.cells[customerId]?.[o];
    const last = n(c?.byYear[year - 1]); const now = n(c?.byYear[year]);
    const sg = ws.suggestions.find(s => s.customer_id === customerId && s.offering === o);
    if (last > 0 || now > 0) cats.push({ offering: o, target: Math.round(Math.max(last * 1.1, now) / 1000) * 1000 });
    else if (sg) cats.push({ offering: o, target: Math.round(sg.est / 1000) * 1000, note: 'Çapraz satış hedefi' });
  });
  p.category_targets = cats;
  const catSum = cats.reduce((a, c) => a + n(c.target), 0);
  p.revenue_target = Math.round(Math.max(base * 1.1, catSum) / 1000) * 1000 || null;
  return p;
}

/** Plan oluşturulurken eklenen örnek aksiyonlar (her çeyrek bir) */
export const templateActions = (year: number) => [
  { quarter: 1, title: 'Yıllık değerlendirme toplantısı: geçen yılın sonuçları ve bu yılın öncelikleri', due_date: `${year}-02-15` },
  { quarter: 2, title: 'Memnuniyet görüşmesi / anket ve açık konuların takibi', due_date: `${year}-05-15` },
  { quarter: 3, title: 'Bütçe dönemi öncesi ihtiyaç görüşmesi (gelecek yıl projeleri)', due_date: `${year}-09-15` },
  { quarter: 4, title: 'Gelecek yıl planı, fiyat ve sözleşme yenileme görüşmesi', due_date: `${year}-11-15` },
];

export async function loadPlanContext(supabase: any, customerId: string, year: number) {
  const [planRes, ws, contacts, acts, opps, team] = await Promise.all([
    supabase.from('account_plans').select('*').eq('customer_id', customerId).order('year', { ascending: false }),
    loadWhitespace(supabase, { customerId }),
    safe(supabase.from('customer_contacts').select('*').eq('customer_id', customerId)),
    safe(supabase.from('crm_activities').select('contact_id, activity_date').eq('customer_id', customerId).limit(3000)),
    safe(supabase.from('opportunities').select('*').eq('customer_id', customerId)),
    safe(supabase.from('sales_team').select('id, name, email').order('name')),
  ]);
  const ready = !planRes.error;
  const plans: any[] = ready ? planRes.data || [] : [];
  const plan = plans.find(p => p.year === year) || null;
  const actions: PlanAction[] = plan ? await safe(supabase.from('account_plan_actions').select('*').eq('plan_id', plan.id).order('due_date', { nullsFirst: false })) : [];
  const lastTouch: Record<string, string> = {};
  acts.forEach((a: any) => { if (a.contact_id && String(a.activity_date || '') > (lastTouch[a.contact_id] || '')) lastTouch[a.contact_id] = String(a.activity_date).slice(0, 10); });
  const openOpps = opps.filter((o: any) => !['Kazanıldı', 'Kaybedildi', 'won', 'lost'].includes(o.stage) && !o.closed_at);
  return { ready, plan: plan as Plan | null, years: plans.map(p => p.year as number), actions, ws, contacts: contacts.filter((c: any) => c.is_active !== false), lastTouch, openOpps, team };
}

export async function savePlan(supabase: any, p: Plan): Promise<Plan> {
  const row: any = {
    customer_id: p.customer_id, year: p.year, owner_id: p.owner_id || null, status: p.status, revenue_target: p.revenue_target,
    category_targets: p.category_targets.filter(c => c.offering), customer_priorities: p.customer_priorities || null, our_strategy: p.our_strategy || null,
    relationship_goal: p.relationship_goal || null, risks: p.risks.filter(r => r.text?.trim()), updated_at: new Date().toISOString(),
  };
  const q = p.id ? supabase.from('account_plans').update(row).eq('id', p.id) : supabase.from('account_plans').insert([row]);
  const { data, error } = await q.select().single();
  if (error) throw new Error(/relation|does not exist/i.test(error.message) ? 'Önce hesap-plani.sql dosyasını Supabase\'de çalıştırın.' : /duplicate|unique/i.test(error.message) ? 'Bu müşteri için bu yılın planı zaten var.' : error.message);
  return normalize(data);
}

export const normalize = (d: any): Plan => ({
  ...d, category_targets: Array.isArray(d.category_targets) ? d.category_targets : [], risks: Array.isArray(d.risks) ? d.risks : [],
  customer_priorities: d.customer_priorities || '', our_strategy: d.our_strategy || '', relationship_goal: d.relationship_goal || '',
});

/** Tüm planlar + gerçekleşenler (liste ekranı ve hatırlatmalar için) */
export async function loadPlansOverview(supabase: any, year: number, ws?: WSData) {
  const [plansRes, w] = await Promise.all([supabase.from('account_plans').select('*').eq('year', year), ws ? Promise.resolve(ws) : loadWhitespace(supabase)]);
  if (plansRes.error) return { ready: false, ws: w, rows: [] as any[], actions: [] as PlanAction[] };
  const plans = (plansRes.data || []).map(normalize);
  const ids = plans.map((p: any) => p.id);
  const actions: PlanAction[] = ids.length ? await safe(supabase.from('account_plan_actions').select('*').in('plan_id', ids)) : [];
  const today = new Date().toISOString().slice(0, 10);
  const rows = plans.map((p: any) => {
    const actual = yearRevenue(w, p.customer_id, year);
    const acts = actions.filter(a => a.plan_id === p.id && a.status !== 'cancelled');
    return {
      plan: p, actual, prev: yearRevenue(w, p.customer_id, year - 1), pr: progress(p.revenue_target, actual, year),
      actTotal: acts.length, actDone: acts.filter(a => a.status === 'done').length,
      actOverdue: acts.filter(a => a.status === 'open' && a.due_date && a.due_date < today).length,
    };
  });
  return { ready: true, ws: w, rows, actions };
}
