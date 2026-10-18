// Akıllı hatırlatmalar — mevcut veriden kurallarla üretilir, ayrıca bir şey girmeniz gerekmez.
// Tahsilat (Paraşüt dahil), teklif okunma takibi, sonraki adım tarihleri, fırsat kapanış tarihleri,
// tekrar alım döngüsü, temassız kalan müşteriler, sözleşme / kurulu baz yenilemeleri ve çapraz satış önerileri.
// "Tamamlandı" ve "Ertele" kullanıcıya özel saklanır (reminder_states).

import { loadParasutSales, mergeParasut } from '@/lib/parasut-facts';
import { loadWhitespace } from '@/lib/whitespace';
import { progress, yearRevenue } from '@/lib/account-plans';
import { loadProcureReminders } from '@/lib/procure-reminders';

const n = (v: any) => Number(v) || 0;
const safe = async (q: any) => { try { const r = await q; return r.error ? [] : r.data || []; } catch { return []; } };
const day = (d: any) => String(d || '').slice(0, 10);
const addDays = (d: string, k: number) => new Date(new Date(d).getTime() + k * 864e5).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 864e5);
const trDate = (d: string) => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
const money = (v: number) => '₺' + Math.round(v).toLocaleString('tr-TR');
const PAID = ['Ödendi', 'paid', 'Tahsil edildi', 'collected'];
const CLOSED_OPP = ['Kazanıldı', 'Kaybedildi', 'won', 'lost', 'Won', 'Lost'];

export type ReminderKind =
  | 'overdue' | 'due_soon' | 'quote_hot' | 'quote_revision' | 'quote_unopened' | 'quote_expiring'
  | 'next_step' | 'opp_close' | 'repeat' | 'silent' | 'renewal' | 'crosssell' | 'plan_action' | 'plan_behind'
  // Procure (yalnızca Procure lisanslı kurumda üretilir)
  | 'proc_approval_waiting' | 'proc_rfq_deadline' | 'proc_late_delivery' | 'proc_unmatched_invoice' | 'proc_vendor_doc_expiring'
  | 'proc_vendor_reevaluation' | 'proc_budget_80';

export type Reminder = {
  key: string; kind: ReminderKind; priority: 1 | 2 | 3; due: string;
  customer_id: string | null; customer: string; assigned_to: string | null; phone?: string | null;
  title: string; detail: string; href: string; amount?: number;
};

export const KIND_LABEL: Record<ReminderKind, string> = {
  overdue: 'Vadesi geçen alacak', due_soon: 'Vadesi yaklaşan alacak', quote_hot: 'Sıcak teklif', quote_revision: 'Revizyon talebi',
  quote_unopened: 'Açılmayan teklif', quote_expiring: 'Süresi dolan teklif', next_step: 'Sonraki adım', opp_close: 'Fırsat kapanışı',
  repeat: 'Tekrar alım zamanı', silent: 'Temassız müşteri', renewal: 'Yenileme', crosssell: 'Çapraz satış', plan_action: 'Hesap planı aksiyonu', plan_behind: 'Plan hedefi',
  proc_approval_waiting: 'Bekleyen onay (satınalma)', proc_rfq_deadline: 'Teklif son tarihi', proc_late_delivery: 'Geciken teslimat',
  proc_unmatched_invoice: 'Fatura eşleştirme', proc_vendor_doc_expiring: 'Tedarikçi belgesi', proc_vendor_reevaluation: 'Tedarikçi değerlendirme', proc_budget_80: 'Bütçe %80',
};

export async function loadReminders(supabase: any, opts: { customerId?: string; crossSell?: boolean } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const recent = addDays(today, -400);
  const cid = opts.customerId;
  const byC = (q: any) => (cid ? q.eq('customer_id', cid) : q);

  const [custs, ownCols, ownOrders, acts, visits, quotes, opps, contracts, base, statesRes] = await Promise.all([
    safe(cid ? supabase.from('customers').select('*').eq('id', cid) : supabase.from('customers').select('*').limit(10000)),
    safe(byC(supabase.from('collections').select('*')).limit(10000)),
    safe(byC(supabase.from('orders').select('id, customer_id, order_date, created_at, status, subtotal, total')).neq('status', 'cancelled').limit(10000)),
    safe(byC(supabase.from('crm_activities').select('customer_id, activity_date')).gte('activity_date', recent).limit(20000)),
    safe(byC(supabase.from('field_visits').select('customer_id, check_in_at')).limit(10000)),
    safe(byC(supabase.from('quotes').select('*')).gte('created_at', addDays(today, -180)).limit(3000)),
    safe(byC(supabase.from('opportunities').select('*')).limit(5000)),
    safe(byC(supabase.from('contracts').select('*')).limit(5000)),
    safe(byC(supabase.from('installed_base').select('*')).not('contract_end', 'is', null).limit(5000)),
    supabase.from('reminder_states').select('rkey, status, snooze_until'),
  ]);
  const ready = !statesRes.error;
  const docs = await loadParasutSales(supabase, cid);
  const { orders, collections } = mergeParasut(ownOrders, ownCols, docs);

  const C = new Map<string, any>(custs.map((c: any) => [c.id, c]));
  const live = (id: any) => { const c = C.get(id); return c && !c.merged_into && c.status !== 'Pasif' ? c : null; };
  const out: Reminder[] = [];
  const push = (r: Omit<Reminder, 'customer' | 'assigned_to' | 'phone'>) => {
    const c = r.customer_id ? live(r.customer_id) : null;
    if (r.customer_id && !c) return;
    out.push({ ...r, customer: c?.name || '', assigned_to: c?.assigned_to || null, phone: c?.phone || null });
  };

  // 1) Tahsilat — müşteri başına tek hatırlatma
  const overdue = new Map<string, { sum: number; oldest: string; cnt: number }>();
  const soon = new Map<string, { sum: number; first: string; cnt: number }>();
  collections.forEach((x: any) => {
    if (!x.customer_id || PAID.includes(x.status) || !x.due_date) return;
    const due = day(x.due_date); const amt = n(x.amount); if (amt < 1) return;
    if (due < today) { const o = overdue.get(x.customer_id) || { sum: 0, oldest: due, cnt: 0 }; o.sum += amt; o.cnt++; if (due < o.oldest) o.oldest = due; overdue.set(x.customer_id, o); }
    else if (due <= addDays(today, 7)) { const o = soon.get(x.customer_id) || { sum: 0, first: due, cnt: 0 }; o.sum += amt; o.cnt++; if (due < o.first) o.first = due; soon.set(x.customer_id, o); }
  });
  overdue.forEach((o, id) => {
    const late = diffDays(today, o.oldest);
    push({ key: `overdue:${id}:${o.oldest}`, kind: 'overdue', priority: 1, due: o.oldest, customer_id: id, amount: o.sum,
      title: `${money(o.sum)} vadesi geçmiş alacak`, detail: `${o.cnt} belge · en eskisi ${late} gün gecikmede (${trDate(o.oldest)}). Tahsilat için arayın.`, href: `/customers/${id}` });
  });
  soon.forEach((o, id) => push({ key: `due_soon:${id}:${o.first}`, kind: 'due_soon', priority: 2, due: o.first, customer_id: id, amount: o.sum,
    title: `${money(o.sum)} tahsilatın vadesi yaklaşıyor`, detail: `${o.cnt} belge · ilk vade ${trDate(o.first)}. Ödeme planını teyit edin.`, href: `/customers/${id}` }));

  // 2) Teklifler
  quotes.forEach((q: any) => {
    if (!q.customer_id || ['revised', 'rejected', 'cancelled', 'expired', 'approved', 'accepted', 'converted'].includes(q.status)) return;
    const no = `${q.quote_number}${q.revision ? ` Rev.${q.revision}` : ''}`;
    const href = '/quotes';
    if (q.customer_response === 'revision_requested') {
      push({ key: `quote_revision:${q.id}`, kind: 'quote_revision', priority: 1, due: day(q.customer_response_at || q.updated_at || today), customer_id: q.customer_id, amount: n(q.total),
        title: `${no} için revizyon istendi`, detail: q.customer_note ? `Müşteri notu: ${q.customer_note}` : 'Müşteri online teklif sayfasından revizyon talep etti.', href });
      return;
    }
    if (q.status !== 'sent' || q.customer_response) return;
    const lastView = q.last_viewed_at ? new Date(q.last_viewed_at).getTime() : 0;
    const vc = n(q.view_count);
    if (lastView && now - lastView < 48 * 3600e3 && (vc >= 2 || n(q.read_seconds) >= 120)) {
      push({ key: `quote_hot:${q.id}:${day(q.last_viewed_at)}`, kind: 'quote_hot', priority: 1, due: day(q.last_viewed_at), customer_id: q.customer_id, amount: n(q.total),
        title: `${no} teklifine yeniden bakıldı`, detail: `${vc} açılış${q.read_seconds ? ` · ${Math.round(n(q.read_seconds) / 60)} dk okuma` : ''}. Karar aşamasında olabilir, şimdi arayın.`, href });
    } else if (q.sent_at && !q.first_viewed_at && vc === 0 && day(q.sent_at) <= addDays(today, -3) && (!q.valid_until || day(q.valid_until) >= today)) {
      push({ key: `quote_unopened:${q.id}`, kind: 'quote_unopened', priority: 2, due: addDays(day(q.sent_at), 3), customer_id: q.customer_id, amount: n(q.total),
        title: `${no} teklifi henüz açılmadı`, detail: `${diffDays(today, day(q.sent_at))} gün önce gönderildi. Doğru kişiye ulaştığını teyit edin.`, href });
    }
    if (q.valid_until && day(q.valid_until) >= today && day(q.valid_until) <= addDays(today, 3)) {
      push({ key: `quote_expiring:${q.id}`, kind: 'quote_expiring', priority: 2, due: day(q.valid_until), customer_id: q.customer_id, amount: n(q.total),
        title: `${no} teklifinin süresi ${trDate(day(q.valid_until))} doluyor`, detail: 'Yanıt gelmedi. Karar tarihini sorun veya süreyi uzatın.', href });
    }
  });

  // 3) Sonraki adım (müşteri kartındaki)
  custs.forEach((c: any) => {
    if (!c.next_step || !c.next_step_date || !live(c.id)) return;
    const d = day(c.next_step_date); if (d > addDays(today, 1)) return;
    push({ key: `next_step:${c.id}:${d}:${String(c.next_step).slice(0, 40)}`, kind: 'next_step', priority: d <= today ? 1 : 2, due: d, customer_id: c.id,
      title: c.next_step, detail: d < today ? `${diffDays(today, d)} gün gecikti (${trDate(d)})` : d === today ? 'Bugün yapılacak' : 'Yarın yapılacak', href: `/customers/${c.id}` });
  });

  // 4) Fırsat kapanış tarihi geçti
  opps.forEach((o: any) => {
    if (CLOSED_OPP.includes(o.stage) || o.closed_at) return;
    const ec = day(o.expected_close || o.expected_close_date); if (!ec || ec > addDays(today, 3)) return;
    push({ key: `opp_close:${o.id}:${ec}`, kind: 'opp_close', priority: ec < today ? 1 : 2, due: ec, customer_id: o.customer_id || null, amount: n(o.value),
      title: `"${o.title}" fırsatının kapanış tarihi ${ec < today ? 'geçti' : 'yaklaşıyor'}`, detail: `${o.stage || 'Aşama yok'} · beklenen kapanış ${trDate(ec)}. Aşamayı ve tarihi güncelleyin.`, href: '/opportunities' });
  });

  // 5) Tekrar alım döngüsü + 6) temassız müşteri
  const sales = new Map<string, string[]>();
  const rev12 = new Map<string, number>();
  orders.forEach((o: any) => {
    if (!o.customer_id) return; const d = day(o.order_date || o.created_at); if (!d) return;
    (sales.get(o.customer_id) || sales.set(o.customer_id, []).get(o.customer_id)!).push(d);
    if (d >= addDays(today, -365)) rev12.set(o.customer_id, (rev12.get(o.customer_id) || 0) + n(o.subtotal || o.total));
  });
  sales.forEach((dates, id) => {
    const u = [...new Set(dates)].sort(); if (u.length < 3) return;
    const gaps = u.slice(1).map((d, i) => diffDays(d, u[i])).filter(g => g > 0).sort((a, b) => a - b);
    if (gaps.length < 2) return;
    const med = gaps[Math.floor(gaps.length / 2)]; const last = u[u.length - 1]; const since = diffDays(today, last);
    if (med < 7 || since < Math.max(med * 1.5, med + 14) || since > 400) return;
    push({ key: `repeat:${id}:${last}`, kind: 'repeat', priority: 2, due: addDays(last, med), customer_id: id,
      title: 'Tekrar alım zamanı geçti', detail: `Genelde ~${med} günde bir alım yapıyor; son alım ${since} gün önce (${trDate(last)}). İhtiyacı sorun.`, href: `/customers/${id}` });
  });
  const touch = new Map<string, string>();
  const t = (id: any, d: any) => { if (!id || !d) return; const x = day(d); if (x > (touch.get(id) || '')) touch.set(id, x); };
  acts.forEach((a: any) => t(a.customer_id, a.activity_date)); visits.forEach((v: any) => t(v.customer_id, v.check_in_at));
  quotes.forEach((q: any) => t(q.customer_id, q.sent_at));
  custs.forEach((c: any) => {
    if (!live(c.id) || c.customer_type === 'dealer') return;
    const active = (rev12.get(c.id) || 0) > 0 || ['Aktif', 'VIP'].includes(c.status); if (!active) return;
    const last = touch.get(c.id); const limit = c.is_key_account || c.status === 'VIP' ? 21 : 45;
    if (last && diffDays(today, last) < limit) return;
    if (!last && !(rev12.get(c.id) || 0)) return;
    push({ key: `silent:${c.id}:${last || 'none'}`, kind: 'silent', priority: 3, due: last ? addDays(last, limit) : today, customer_id: c.id,
      title: last ? `${diffDays(today, last)} gündür temas yok` : 'Kayıtlı temas yok',
      detail: last ? `Son temas ${trDate(last)}. ${c.is_key_account ? 'Kilit müşteri; ' : ''}kısa bir arama veya ziyaret planlayın.` : 'Bu müşteriyle görüşmeleriniz yazılıma girilmemiş. Bir sonraki temasınızı kaydedin, takip başlasın.', href: `/customers/${c.id}` });
  });

  // 7) Sözleşme ve kurulu baz yenilemeleri
  contracts.forEach((k: any) => {
    const end = day(k.end_date); if (!end || ['cancelled', 'terminated', 'draft', 'renewed'].includes(k.status) || k.renewal_outcome) return;
    if (end < addDays(today, -15) || end > addDays(today, 60)) return;
    push({ key: `renewal:c:${k.id}:${end}`, kind: 'renewal', priority: end <= addDays(today, 30) ? 1 : 2, due: end, customer_id: k.customer_id || null, amount: n(k.value || k.amount),
      title: `Sözleşme ${end < today ? 'süresi doldu' : `${diffDays(end, today)} gün içinde bitiyor`}: ${k.title || k.contract_number || 'Sözleşme'}`, detail: `Bitiş ${trDate(end)}. Yenileme görüşmesini başlatın.`, href: '/contracts' });
  });
  base.forEach((b: any) => {
    const end = day(b.contract_end); if (!end || end < addDays(today, -15) || end > addDays(today, 90)) return;
    push({ key: `renewal:b:${b.id}:${end}`, kind: 'renewal', priority: 3, due: end, customer_id: b.customer_id,
      title: `${b.product_name}${b.brand ? ` (${b.brand})` : ''} bakım/lisans bitişi ${trDate(end)}`, detail: b.is_ours ? 'Sizin kurulumunuz: yenileme teklifi hazırlayın.' : 'Rakip ürün: değişim fırsatı olabilir.', href: `/customers/${b.customer_id}` });
  });

  // 8) Yıllık hesap planı aksiyonları (tarihi gelen / geçen)
  const year = new Date().getFullYear();
  const plans = await safe(byC(supabase.from('account_plans').select('id, customer_id, year, revenue_target, status, owner_id')).eq('year', year));
  const activePlans = plans.filter((p: any) => p.status !== 'closed');
  if (activePlans.length) {
    const pacts = await safe(supabase.from('account_plan_actions').select('*').in('plan_id', activePlans.map((p: any) => p.id)).eq('status', 'open').not('due_date', 'is', null).lte('due_date', addDays(today, 3)));
    pacts.forEach((a: any) => {
      const pl = activePlans.find((p: any) => p.id === a.plan_id); if (!pl) return;
      const d = day(a.due_date);
      push({ key: `plan_action:${a.id}:${d}`, kind: 'plan_action', priority: d < today ? 1 : 2, due: d, customer_id: pl.customer_id,
        title: a.title, detail: `${year} hesap planı · ${a.quarter}. çeyrek${a.offering ? ` · ${a.offering}` : ''}${d < today ? ` · ${diffDays(today, d)} gün gecikti` : ''}. Tamamlandıysa plan ekranında işaretleyin.`, href: `/customers/${pl.customer_id}?tab=plan` });
    });
  }

  // 9) Çapraz satış + plan hedefi gerisinde (beyaz alan analizi gerektirir: liste ekranı ve müşteri kartı)
  if (opts.crossSell || cid) {
    try {
      const ws = await loadWhitespace(supabase, cid ? { customerId: cid } : {});
      const month = today.slice(0, 7);
      activePlans.forEach((pl: any) => {
        if (!Number(pl.revenue_target)) return;
        const actual = yearRevenue(ws, pl.customer_id, year); const pr = progress(pl.revenue_target, actual, year);
        if (pr.state !== 'behind' || pr.expected < 0.15) return;
        push({ key: `plan_behind:${pl.id}:${month}`, kind: 'plan_behind', priority: 2, due: today, customer_id: pl.customer_id, amount: pr.gap,
          title: `Plan hedefinin gerisinde: %${Math.round((pr.pct || 0) * 100)} (beklenen %${Math.round(pr.expected * 100)})`,
          detail: `Gerçekleşen ${money(actual)} / hedef ${money(Number(pl.revenue_target))}. Yıl sonu tahmini ${money(pr.projection)}. Plan aksiyonlarını ve açık fırsatları gözden geçirin.`, href: `/customers/${pl.customer_id}?tab=plan` });
      });
      const seen = new Set<string>();
      ws.suggestions.filter(s => s.state !== 'opportunity').forEach(s => {
        if (seen.has(s.customer_id)) return; seen.add(s.customer_id);
        push({ key: `crosssell:${s.customer_id}:${s.offering}`, kind: 'crosssell', priority: 3, due: today, customer_id: s.customer_id, amount: s.est,
          title: `${s.offering} — çapraz satış fırsatı`, detail: `${s.reason}. Tahmini yıllık ${money(s.est)}.`, href: '/whitespace' });
      });
    } catch { /* analiz yüklenemezse atla */ }
  }

  // 10) Satınalma (Procure lisansı yoksa hiçbir şey eklenmez; müşteri kartında gösterilmez)
  if (!cid) { try { out.push(...(await loadProcureReminders(supabase))); } catch { /* Procure tabloları yoksa atla */ } }

  // Kullanıcının kapattığı / ertelediği hatırlatmalar
  const st = new Map<string, any>((ready ? statesRes.data || [] : []).map((s: any) => [s.rkey, s]));
  const hidden: Reminder[] = [];
  const visible = out.filter(r => {
    const s = st.get(r.key); if (!s) return true;
    if (s.status === 'done' || (s.status === 'snoozed' && s.snooze_until && new Date(s.snooze_until).getTime() > now)) { hidden.push(r); return false; }
    return true;
  });
  visible.sort((a, b) => a.priority - b.priority || a.due.localeCompare(b.due) || n(b.amount) - n(a.amount));
  return { ready, reminders: visible, hiddenCount: hidden.length };
}

export async function setReminderState(supabase: any, key: string, status: 'done' | 'snoozed', snoozeDays?: number) {
  await supabase.from('reminder_states').delete().eq('rkey', key);
  const row: any = { rkey: key, status, snooze_until: status === 'snoozed' ? new Date(Date.now() + (snoozeDays || 1) * 864e5).toISOString() : null };
  const { error } = await supabase.from('reminder_states').insert([row]);
  if (error) throw new Error(/relation|does not exist/i.test(error.message) ? 'Önce capraz-satis-hatirlatma.sql dosyasını Supabase\'de çalıştırın.' : error.message);
}
