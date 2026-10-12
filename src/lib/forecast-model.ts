// Model tahmini: şirketin kendi geçmişinden öğrenen istatistiksel satış tahmini
//  - Aşama bazlı kazanma oranı (haftalık huni fotoğraflarından, kapanan fırsatların sonucuna göre)
//  - Temsilci etkisi (geçmiş kazanma oranı / şirket ortalaması)
//  - Kayma oranı (tahmini kapanış tarihinden sonra kapanan fırsatların payı)
//  - Durgunluk cezası
//  - Monte Carlo ile %80 güven aralığı (P10–P90)
// Az veri olduğunda temsilcinin girdiği olasılığa / varsayılanlara doğru "büzülür" (Bayes yaklaşımı).

import { isClosed, isWon } from '@/lib/pipeline';

export const STAGE_PRIOR: Record<string, number> = { 'Keşif': 0.15, 'Teklif': 0.35, 'Müzakere': 0.55, 'Kapanış': 0.75 };
const K_STAGE = 8, K_REP = 10, K_SLIP = 10, SLIP_PRIOR = 0.3;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const n = (v: any) => Number(v) || 0;
const d10 = (v: any) => (v ? String(v).slice(0, 10) : '');

export interface ModelStats {
  stage: Record<string, { p: number; wins: number; total: number }>;
  rep: Record<string, { factor: number; wins: number; total: number }>;
  orgWinRate: number; slipRate: number; slipSample: number; closedSample: number; snapshotSample: number;
}

export function learn(opps: any[], snapshots: any[], now = new Date()): ModelStats {
  const byId = new Map(opps.map(o => [o.id, o]));
  const yearAgo = new Date(now.getTime() - 365 * 864e5).toISOString().slice(0, 10);
  const closed = opps.filter(o => isClosed(o.stage) && d10(o.closed_at || o.expected_close) >= yearAgo);
  const orgWins = closed.filter(o => isWon(o.stage)).length;
  const orgWinRate = closed.length ? orgWins / closed.length : 0.3;

  // Aşama → sonuç (her fırsat, geçtiği her aşama için bir kez sayılır)
  const seen = new Map<string, Set<string>>();
  snapshots.forEach(s => {
    const o = byId.get(s.opportunity_id); if (!o || !isClosed(o.stage) || isClosed(s.stage)) return;
    if (!seen.has(s.stage)) seen.set(s.stage, new Set()); seen.get(s.stage)!.add(s.opportunity_id);
  });
  const stage: ModelStats['stage'] = {};
  const stageNames = Array.from(new Set([...Object.keys(STAGE_PRIOR), ...seen.keys()]));
  stageNames.forEach(st => {
    const ids = Array.from(seen.get(st) || []); const wins = ids.filter(id => isWon(byId.get(id)!.stage)).length;
    const prior = STAGE_PRIOR[st] ?? orgWinRate;
    stage[st] = { p: (wins + K_STAGE * prior) / (ids.length + K_STAGE), wins, total: ids.length };
  });

  // Temsilci etkisi
  const rep: ModelStats['rep'] = {};
  Array.from(new Set(closed.map(o => o.assigned_to || ''))).forEach(id => {
    const mine = closed.filter(o => (o.assigned_to || '') === id); const w = mine.filter(o => isWon(o.stage)).length;
    const rate = (w + K_REP * orgWinRate) / (mine.length + K_REP);
    rep[id] = { factor: clamp(orgWinRate ? rate / orgWinRate : 1, 0.6, 1.4), wins: w, total: mine.length };
  });

  // Kayma: ilk görüldüğü tahmini kapanış tarihinden sonra kazanılan fırsatlar
  const firstClose = new Map<string, string>();
  [...snapshots].sort((a, b) => d10(a.snapshot_date).localeCompare(d10(b.snapshot_date))).forEach(s => {
    if (s.expected_close && !firstClose.has(s.opportunity_id)) firstClose.set(s.opportunity_id, d10(s.expected_close));
  });
  let slipped = 0, slipN = 0;
  firstClose.forEach((fc, id) => {
    const o = byId.get(id); if (!o || !isWon(o.stage) || !o.closed_at) return;
    slipN++; if (d10(o.closed_at).slice(0, 7) > fc.slice(0, 7)) slipped++;
  });
  const slipRate = (slipped + K_SLIP * SLIP_PRIOR) / (slipN + K_SLIP);

  return { stage, rep, orgWinRate, slipRate, slipSample: slipN, closedSample: closed.length, snapshotSample: snapshots.length };
}

export interface DealScore { id: string; value: number; repProb: number; modelProb: number; reasons: string[] }

/** Bu dönem kapanması beklenen açık fırsatlar için model olasılığı (dönem içinde kazanılma) */
export function scoreDeals(open: any[], stats: ModelStats, staleIds: Set<string>, rangeEnd: string, today = new Date().toISOString().slice(0, 10)): DealScore[] {
  return open.filter(o => o.forecast_category !== 'omitted').map(o => {
    const reasons: string[] = [];
    const st = stats.stage[o.stage]; const base = st ? st.p : (STAGE_PRIOR[o.stage] ?? stats.orgWinRate);
    const repF = stats.rep[o.assigned_to || '']?.factor ?? 1;
    if (repF < 0.9) reasons.push('temsilcinin geçmiş kazanma oranı düşük'); if (repF > 1.1) reasons.push('temsilcinin geçmiş kazanma oranı yüksek');
    let inPeriod = 1 - stats.slipRate;
    const ec = d10(o.expected_close);
    if (ec && ec < today) { inPeriod *= 0.5; reasons.push('kapanış tarihi geçmiş'); }
    else if (ec && rangeEnd && daysBetween(ec, rangeEnd) <= 7) { inPeriod *= 0.85; reasons.push('dönem sonuna çok yakın'); }
    let p = base * repF * inPeriod;
    if (staleIds.has(o.id)) { p *= 0.7; reasons.push('durgun (aktivite/aşama ilerlemiyor)'); }
    if (o.forecast_category === 'commit') p = Math.max(p, Math.min(0.9, base * 1.15));   // temsilci taahhüdü bir sinyaldir
    return { id: o.id, value: n(o.value), repProb: n(o.probability) / 100, modelProb: clamp(p, 0.02, 0.95), reasons };
  });
}

const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5);

/** Monte Carlo: kazanılan + açık fırsatların olası sonuç dağılımı */
export function simulate(deals: DealScore[], alreadyWon: number, runs = 4000, seed = 42) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = new Float64Array(runs);
  for (let r = 0; r < runs; r++) { let v = alreadyWon; for (const d of deals) if (rnd() < d.modelProb) v += d.value; out[r] = v; }
  out.sort();
  const q = (x: number) => out[Math.min(runs - 1, Math.floor(x * runs))];
  const expected = alreadyWon + deals.reduce((a, d) => a + d.value * d.modelProb, 0);
  return { expected, p10: q(0.1), p50: q(0.5), p90: q(0.9) };
}

/** Hedefe ulaşma olasılığı */
export function hitProbability(deals: DealScore[], alreadyWon: number, target: number, runs = 4000) {
  if (target <= 0) return null;
  let hit = 0; let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let r = 0; r < runs; r++) { let v = alreadyWon; for (const d of deals) if (rnd() < d.modelProb) v += d.value; if (v >= target) hit++; }
  return hit / runs;
}

/** Tahmin isabeti: 1 − |tahmin − gerçekleşen| / gerçekleşen  (0–1) ve sapma yönü */
export function accuracy(forecast: number, actual: number) {
  if (actual <= 0 && forecast <= 0) return { acc: 1, bias: 0 };
  const base = Math.max(actual, 1);
  return { acc: clamp(1 - Math.abs(forecast - actual) / base, 0, 1), bias: clamp((forecast - actual) / base, -1, 1) };
}

/** Haftanın pazartesi günü (YYYY-MM-DD) */
export function weekStart(d = new Date()) {
  const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
