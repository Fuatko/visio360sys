// Akıllı hatırlatmalara Procure türleri (§9) — yalnızca kurumda Procure modülü açıksa üretilir.
// Kim neyi görürse (RLS) onun hatırlatması çıkar: onaycıya bekleyen onay, satınalmaya RFQ ve gecikme, mali işlere fatura ve bütçe.
import type { Reminder } from '@/lib/reminders';

const safe = async (q: any) => { try { const r = await q; return r.error ? [] : r.data || []; } catch { return []; } };
const addDays = (d: string, k: number) => new Date(new Date(d).getTime() + k * 864e5).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 864e5);
const money = (v: number) => '₺' + Math.round(v).toLocaleString('tr-TR');
const trDate = (d: string) => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

// İki iş günü önceki an (hafta sonu atlanır)
function businessDaysAgo(n: number) {
  const d = new Date(); let k = n;
  while (k > 0) { d.setDate(d.getDate() - 1); const w = d.getDay(); if (w !== 0 && w !== 6) k--; }
  return d.toISOString();
}

export async function loadProcureReminders(supabase: any): Promise<Reminder[]> {
  const mods = await supabase.rpc('my_enabled_modules');
  if (mods.error || !Array.isArray(mods.data) || !mods.data.includes('procure')) return [];
  const today = new Date().toISOString().slice(0, 10);
  const out: Reminder[] = [];
  const add = (r: Omit<Reminder, 'customer' | 'assigned_to' | 'customer_id'>) => out.push({ ...r, customer_id: null, customer: '', assigned_to: null });

  const [pendIds, rfqs, orders, profiles, budgets, sugg, matches, unordered] = await Promise.all([
    safe(supabase.rpc('proc_my_pending_approvals')),
    safe(supabase.from('proc_rfqs').select('id, rfq_no, title, deadline').eq('status', 'sent').lte('deadline', new Date(Date.now() + 2 * 864e5).toISOString())),
    safe(supabase.from('proc_orders').select('id, order_no, expected_date, ack_expected_date, vendor:vendor_id(name)').in('status', ['approved', 'sent', 'acknowledged', 'partially_received'])),
    safe(supabase.from('proc_vendor_profiles').select('customer_id, documents, next_evaluation_due, status, customer:customer_id(name)').neq('status', 'blocked')),
    safe(supabase.from('proc_budget_status').select('*')),
    safe(supabase.rpc('proc_invoice_suggestions')),
    safe(supabase.from('proc_invoice_matches').select('id').in('status', ['price_variance', 'qty_variance', 'over_invoiced'])),
    safe(supabase.rpc('proc_unordered_invoices', { p_from: addDays(today, -90) })),
  ]);

  // Onayımı bekleyen ve 2 iş gününden uzun süredir bekleyen adımlar
  const ids = (pendIds as any[]).map(x => (typeof x === 'string' ? x : Object.values(x || {})[0])) as string[];
  if (ids.length) {
    const limit = businessDaysAgo(2);
    const apps = await safe(supabase.from('proc_approvals').select('id, subject_type, subject_id, approver_label, created_at').in('id', ids).lt('created_at', limit));
    apps.forEach((a: any) => {
      const d = String(a.created_at).slice(0, 10);
      add({ key: `proc_approval_waiting:${a.id}`, kind: 'proc_approval_waiting', priority: 1, due: d,
        title: `Onayınızı bekleyen ${{ request: 'talep', order: 'sipariş', rfq: 'teklif ödülü' }[a.subject_type as string] || 'kayıt'} (${diffDays(today, d)} gündür)`,
        detail: `${a.approver_label} adımı ${trDate(d)} tarihinden beri sizde. Onaylayın veya gerekçeyle reddedin.`, href: '/procure/onaylar' });
    });
  }
  // RFQ son tarihi yaklaştı / geçti
  rfqs.forEach((f: any) => {
    const d = String(f.deadline).slice(0, 10); const past = new Date(f.deadline) < new Date();
    add({ key: `proc_rfq_deadline:${f.id}:${d}`, kind: 'proc_rfq_deadline', priority: past ? 1 : 2, due: d,
      title: `${f.rfq_no} ${past ? 'son teklif tarihi geçti' : 'son teklif tarihi yaklaşıyor'}`,
      detail: past ? `${f.title}: teklif alımını kapatıp karşılaştırın ve ödül verin.` : `${f.title}: ${trDate(d)}. Yanıt vermeyen tedarikçileri hatırlatın.`, href: `/procure/rfq/${f.id}` });
  });
  // Gecikmiş teslimat
  orders.forEach((o: any) => {
    const due = o.ack_expected_date || o.expected_date; if (!due || due >= today) return;
    add({ key: `proc_late_delivery:${o.id}:${due}`, kind: 'proc_late_delivery', priority: 1, due,
      title: `${o.order_no} teslimatı ${diffDays(today, due)} gün gecikti`, detail: `${o.vendor?.name || 'Tedarikçi'} · beklenen ${trDate(due)}. Tedarikçiyi arayın veya teslim alındıysa mal kabul girin.`, href: `/procure/siparisler/${o.id}` });
  });
  // Fatura eşleştirme bekleyenler (tek özet)
  const pendingDocs = new Set((sugg as any[]).map(s => s.document_id)).size;
  if (pendingDocs || matches.length || (unordered as any[]).some(u => !u.decision)) {
    const open = (unordered as any[]).filter(u => !u.decision);
    add({ key: `proc_unmatched_invoice:${today}`, kind: 'proc_unmatched_invoice', priority: matches.length ? 1 : 2, due: today,
      title: [pendingDocs && `${pendingDocs} fatura eşleşme bekliyor`, matches.length && `${matches.length} fatura farkı onay bekliyor`, open.length && `${open.length} siparişsiz fatura`].filter(Boolean).join(' · '),
      detail: open.length ? `Son 90 günde siparişsiz ${money(open.reduce((s, u) => s + Number(u.invoice_net), 0))} alış faturası var; sonradan sipariş açın veya "sipariş gerektirmez" kararı verin.` : 'Paraşüt alış faturalarını siparişlerle eşleştirin.', href: '/procure/faturalar' });
  }
  // Tedarikçi belgesi süresi doluyor (30 gün) ve yeniden değerlendirme zamanı
  profiles.forEach((p: any) => {
    const name = p.customer?.name || 'Tedarikçi';
    const soon = (p.documents || []).filter((d: any) => d.valid_until && d.valid_until <= addDays(today, 30));
    if (soon.length) {
      const first = soon.map((d: any) => d.valid_until).sort()[0];
      add({ key: `proc_vendor_doc_expiring:${p.customer_id}:${first}`, kind: 'proc_vendor_doc_expiring', priority: first < today ? 1 : 2, due: first,
        title: `${name}: ${soon.length} belge ${first < today ? 'süresi doldu' : 'süresi doluyor'}`, detail: soon.map((d: any) => `${d.type} (${trDate(d.valid_until)})`).join(', ') + '. Güncel belgeyi isteyin.', href: `/procure/tedarikciler/${p.customer_id}` });
    }
    if (p.next_evaluation_due && p.next_evaluation_due <= addDays(today, 30) && ['approved', 'conditional'].includes(p.status)) {
      add({ key: `proc_vendor_reevaluation:${p.customer_id}:${p.next_evaluation_due}`, kind: 'proc_vendor_reevaluation', priority: p.next_evaluation_due < today ? 1 : 3, due: p.next_evaluation_due,
        title: `${name} yeniden değerlendirme ${p.next_evaluation_due < today ? 'zamanı geçti' : 'zamanı yaklaşıyor'}`, detail: `ISO 9001 md. 8.4: ${trDate(p.next_evaluation_due)}. Form otomatik verilerle dolu gelir.`, href: `/procure/tedarikciler/${p.customer_id}/degerlendir` });
    }
  });
  // Bütçe satırı %80'i geçti (bugünün bütçe yılı)
  const fyNow = budgets.length ? budgets.map((b: any) => b.fiscal_year).sort().pop() : null;
  budgets.filter((b: any) => b.fiscal_year === fyNow && Number(b.amount) > 0).forEach((b: any) => {
    const used = (Number(b.amount) - Number(b.available)) / Number(b.amount);
    if (used < 0.8) return;
    add({ key: `proc_budget_80:${b.id}:${Math.floor(used * 10)}`, kind: 'proc_budget_80', priority: used >= 1 ? 1 : 2, due: today,
      title: `Bütçe kullanımı %${Math.round(used * 100)}`, detail: `${b.fiscal_year} bütçe satırı: ${money(Number(b.amount))} bütçe, ${money(Number(b.available))} kullanılabilir. Ek bütçe veya aktarım gerekebilir.`, href: '/procure/butce' });
  });
  return out;
}
