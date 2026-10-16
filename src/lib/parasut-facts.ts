import { fetchAll } from '@/lib/fetch-all';
// Paraşüt satış faturalarını yazılımın sipariş / tahsilat verisine "sanal kayıt" olarak katar.
// Böylece müşteri başarısı, panolar, müşteri kartı ve analizler elle veri girmeden gerçek ciro ve alacakla çalışır.
// Kural: Paraşüt faturası olan müşteride gelir ve alacak Paraşüt'ten gelir (fatura esas alınır);
// Paraşüt faturası olmayan müşteride yazılımdaki sipariş / tahsilat kayıtları aynen kullanılır. Böylece çift sayım olmaz.

const n = (v: any) => Number(v) || 0;

export type ParasutSale = {
  id: string; customer_id: string | null; doc_no?: string | null; issue_date?: string | null; due_date?: string | null;
  currency?: string | null; exchange_rate?: number | null; net_total_try?: number | null; gross_total?: number | null; vat_total?: number | null;
  remaining?: number | null; payment_status?: string | null; category?: string | null;
};

/** Kurumun müşteriye bağlı Paraşüt satış faturaları (tablo yoksa / yetki yoksa boş döner) */
export async function loadParasutSales(supabase: any, customerId?: string): Promise<ParasutSale[]> {
  try {
    return await fetchAll(() => {
      let q = supabase.from('parasut_documents')
        .select('id, customer_id, doc_no, issue_date, due_date, currency, exchange_rate, net_total_try, gross_total, vat_total, remaining, payment_status, category')
        .eq('kind', 'sales_invoice').not('customer_id', 'is', null).order('id');
      if (customerId) q = q.eq('customer_id', customerId);
      return q;
    });
  } catch { return []; }
}

const fxOf = (d: ParasutSale) => (d.currency && d.currency !== 'TRY' ? n(d.exchange_rate) || 1 : 1);
export const grossTryOf = (d: ParasutSale) => (d.gross_total != null ? n(d.gross_total) * fxOf(d) : n(d.net_total_try) * 1.2);
const openOf = (d: ParasutSale) => (d.payment_status === 'paid' ? 0 : Math.min(Math.abs(n(d.remaining)), Math.abs(grossTryOf(d))));

/** Sipariş biçiminde (Teslim edildi) — ciro, alım trendi ve son alım hesapları için */
export function salesAsOrders(docs: ParasutSale[]) {
  return docs.filter(d => n(d.net_total_try) !== 0).map(d => ({
    id: `parasut-${d.id}`, order_number: d.doc_no || 'Paraşüt faturası', customer_id: d.customer_id, status: 'delivered',
    order_date: d.issue_date, created_at: d.issue_date, delivery_date: d.issue_date,
    subtotal: n(d.net_total_try), total_amount: grossTryOf(d), discount: 0, tax_total: grossTryOf(d) - n(d.net_total_try), total: grossTryOf(d),
    currency: 'TRY', exchange_rate: 1, notes: d.category ? `Paraşüt · ${d.category}` : 'Paraşüt', source: 'parasut', readonly: true,
  }));
}

/** Tahsilat biçiminde: ödenen kısım "Ödendi", kalan kısım "Bekliyor" (vade ile) */
export function salesAsCollections(docs: ParasutSale[]) {
  const out: any[] = [];
  docs.forEach(d => {
    const gross = grossTryOf(d); if (gross <= 0) return;
    const open = openOf(d); const paid = gross - open;
    const r = gross > 0 ? Math.min(1, Math.max(0, n(d.net_total_try) / gross)) : 1 / 1.2;   // KDV hariç oranı
    const base = { customer_id: d.customer_id, invoice_number: d.doc_no, source: 'parasut', readonly: true, created_at: d.issue_date };
    if (paid >= 0.5) out.push({ ...base, id: `parasut-p-${d.id}`, amount: paid, amount_net: paid * r, status: 'Ödendi', due_date: d.due_date || d.issue_date, payment_date: d.due_date || d.issue_date, collection_date: d.due_date || d.issue_date });
    if (open >= 0.5) out.push({ ...base, id: `parasut-o-${d.id}`, amount: open, amount_net: open * r, status: (d.due_date || d.issue_date || '9') < new Date().toISOString().slice(0, 10) ? 'Gecikmiş' : 'Bekliyor', due_date: d.due_date || d.issue_date, payment_date: null });
  });
  return out;
}

/** Yazılımdaki sipariş / tahsilat listelerine Paraşüt'ü katar */
export function mergeParasut<O extends { customer_id?: any }, C extends { customer_id?: any }>(orders: O[], collections: C[], docs: ParasutSale[]) {
  if (!docs.length) return { orders, collections, parasutCustomers: new Set<string>() };
  const pc = new Set(docs.map(d => String(d.customer_id)));
  return {
    orders: [...orders.filter(o => !pc.has(String(o.customer_id))), ...salesAsOrders(docs)] as any[],
    collections: [...collections.filter(c => !pc.has(String(c.customer_id))), ...salesAsCollections(docs)] as any[],
    parasutCustomers: pc,
  };
}

/** Ekranlarda müşteri / temsilci adı ile birlikte kullanılacak ortak Paraşüt katmanı */
async function enrich(supabase: any, rows: any[]) {
  if (!rows.length) return rows;
  const { data: cs } = await supabase.from('customers').select('id, name, assigned_to').limit(10000);
  const { data: team } = await supabase.from('sales_team').select('id, name, department');
  const cm = new Map<string, any>((cs || []).map((c: any) => [c.id, c]));
  const tm = new Map<string, any>((team || []).map((t: any) => [t.id, t]));
  return rows.map(r => {
    const c = cm.get(r.customer_id); const t = c?.assigned_to ? tm.get(c.assigned_to) : null;
    return { ...r, customer: c ? { id: c.id, name: c.name } : null, sales_person_id: c?.assigned_to || null, sales_team: t ? { id: t.id, name: t.name } : null, sales_rep: t || null };
  });
}

/** Tahsilat listesine Paraşüt'ü katar (Paraşüt faturası olan müşterilerde Paraşüt esas alınır) */
export async function withParasutCollections(supabase: any, rows: any[] | null) {
  const docs = await loadParasutSales(supabase);
  if (!docs.length) return rows || [];
  const m = mergeParasut([], rows || [], docs);
  const own = m.collections.filter((x: any) => x.source !== 'parasut');
  return [...own, ...(await enrich(supabase, m.collections.filter((x: any) => x.source === 'parasut')))];
}

/** Sipariş listesine Paraşüt'ü katar (ciro hesapları için) */
export async function withParasutOrders(supabase: any, rows: any[] | null) {
  const docs = await loadParasutSales(supabase);
  if (!docs.length) return rows || [];
  const m = mergeParasut(rows || [], [], docs);
  const own = m.orders.filter((x: any) => x.source !== 'parasut');
  return [...own, ...(await enrich(supabase, m.orders.filter((x: any) => x.source === 'parasut')))];
}
