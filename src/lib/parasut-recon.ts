// Paraşüt belgeleri üzerinde hesaplamalar: cari bakiyeler ve sipariş–fatura mutabakatı.
import { normalizeName } from '@/lib/crm';

export type PDoc = {
  id: string; kind: string; doc_no?: string | null; issue_date?: string | null; due_date?: string | null;
  contact_name?: string | null; tax_number?: string | null; customer_id?: string | null; order_id?: string | null;
  currency?: string | null; exchange_rate?: number | null; net_total_try?: number | null; gross_total?: number | null;
  remaining?: number | null; payment_status?: string | null;
};

const n = (v: any) => Number(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);
/** Belgenin KDV dahil TL tutarı */
export const grossTry = (d: PDoc) => n(d.gross_total) * ((d.currency && d.currency !== 'TRY') ? (n(d.exchange_rate) || 1) : 1);
/** Açık (ödenmemiş) kalan tutar, TL */
export const openTry = (d: PDoc) => {
  if (d.payment_status === 'paid') return 0;
  const r = Math.abs(n(d.remaining));
  return r;
};
export const contactKey = (d: { tax_number?: string | null; contact_name?: string | null }) => String(d.tax_number || '').replace(/\D/g, '') || 'ad:' + normalizeName(d.contact_name || '');

export type Balance = {
  key: string; name: string; tax: string | null; customer_id: string | null;
  receivable: number; receivableOverdue: number; payable: number; payableOverdue: number; net: number;
  salesCount: number; billCount: number; oldestOverdue: string | null;
};

/** Cari bazında alacak (açık satış faturaları) ve borç (açık alış faturaları) */
export function balances(docs: PDoc[]): Balance[] {
  const t = today();
  const m = new Map<string, Balance>();
  for (const d of docs) {
    if (d.kind !== 'sales_invoice' && d.kind !== 'purchase_bill') continue;
    const k = contactKey(d);
    const b = m.get(k) || { key: k, name: d.contact_name || '-', tax: d.tax_number || null, customer_id: null, receivable: 0, receivableOverdue: 0, payable: 0, payableOverdue: 0, net: 0, salesCount: 0, billCount: 0, oldestOverdue: null };
    if (!b.customer_id && d.customer_id) b.customer_id = d.customer_id;
    const open = n(d.net_total_try) < 0 ? 0 : openTry(d);   // iade belgeleri bakiyeye katılmaz
    const overdue = open > 0 && !!d.due_date && d.due_date < t;
    if (d.kind === 'sales_invoice') { b.salesCount++; b.receivable += open; if (overdue) b.receivableOverdue += open; }
    else { b.billCount++; b.payable += open; if (overdue) b.payableOverdue += open; }
    if (overdue && (!b.oldestOverdue || d.due_date! < b.oldestOverdue)) b.oldestOverdue = d.due_date!;
    m.set(k, b);
  }
  return Array.from(m.values()).map(b => ({ ...b, net: b.receivable - b.payable }))
    .filter(b => b.receivable > 0.5 || b.payable > 0.5)
    .sort((a, b) => (b.receivable + b.payable) - (a.receivable + a.payable));
}

export const daysSince = (date?: string | null) => (date ? Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000) : 0);

// ---------------------------- Mutabakat ----------------------------
export type ROrder = { id: string; order_number?: string | null; customer_id?: string | null; status?: string | null; total?: number | null; order_date?: string | null; created_at?: string | null; currency?: string | null; exchange_rate?: number | null };
export const orderTry = (o: ROrder) => n(o.total) * ((o.currency && o.currency !== 'TRY') ? (n(o.exchange_rate) || 1) : 1);
export const orderDate = (o: ROrder) => String(o.order_date || o.created_at || '').slice(0, 10);

/** %1 veya ₺5'ten küçük farklar eşit sayılır */
export const sameAmount = (a: number, b: number) => Math.abs(a - b) <= Math.max(5, Math.abs(a) * 0.01);

export type Suggestion = { order_id: string; doc_ids: string[]; diff: number; reason: string };

/**
 * Bağlanmamış siparişler için fatura önerisi:
 * aynı müşteri, sipariş tarihinden 15 gün önce ile 120 gün sonrası arasında kesilmiş, bağlanmamış satış faturası;
 * önce tek faturada tutar eşleşmesi, yoksa tarih sırasıyla ardışık faturaların toplamı (kısmi faturalama).
 */
export function suggest(orders: ROrder[], docs: PDoc[]): Suggestion[] {
  const free = docs.filter(d => d.kind === 'sales_invoice' && !d.order_id && d.customer_id && n(d.net_total_try) > 0);
  const used = new Set<string>();
  const linkedOrders = new Set(docs.filter(d => d.order_id).map(d => d.order_id!));
  const out: Suggestion[] = [];
  const open = orders.filter(o => o.status !== 'cancelled' && !linkedOrders.has(o.id) && o.customer_id)
    .sort((a, b) => orderDate(a).localeCompare(orderDate(b)));
  for (const o of open) {
    const od = orderDate(o); if (!od) continue;
    const lo = new Date(new Date(od).getTime() - 15 * 86_400_000).toISOString().slice(0, 10);
    const hi = new Date(new Date(od).getTime() + 120 * 86_400_000).toISOString().slice(0, 10);
    const cands = free.filter(d => !used.has(d.id) && d.customer_id === o.customer_id && (d.issue_date || '') >= lo && (d.issue_date || '') <= hi)
      .sort((a, b) => String(a.issue_date).localeCompare(String(b.issue_date)));
    const target = orderTry(o);
    if (!target || !cands.length) continue;
    const single = cands.filter(d => sameAmount(grossTry(d), target))
      .sort((a, b) => Math.abs(daysSince(a.issue_date) - daysSince(od)) - Math.abs(daysSince(b.issue_date) - daysSince(od)))[0];
    if (single) { used.add(single.id); out.push({ order_id: o.id, doc_ids: [single.id], diff: grossTry(single) - target, reason: 'Tutar ve müşteri tutuyor' }); continue; }
    // Kısmi faturalama: ardışık faturaların toplamı
    for (let i = 0; i < cands.length; i++) {
      let sum = 0; const ids: string[] = [];
      for (let j = i; j < cands.length && j < i + 6; j++) {
        sum += grossTry(cands[j]); ids.push(cands[j].id);
        if (ids.length > 1 && sameAmount(sum, target)) { ids.forEach(x => used.add(x)); out.push({ order_id: o.id, doc_ids: [...ids], diff: sum - target, reason: `${ids.length} faturanın toplamı tutuyor (kısmi faturalama)` }); i = cands.length; break; }
        if (sum > target * 1.01) break;
      }
    }
  }
  return out;
}
