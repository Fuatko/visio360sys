// Fatura işlemleri: siparişten taslak fatura, faturayı kesme, iptal
import { nextDocumentNumber } from '@/lib/doc-number';

type Supa = any;

export const DEFAULT_PAYMENT_TERM_DAYS = 30;

export const INVOICE_STATUS: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  draft: { label: 'Taslak', variant: 'default' },
  issued: { label: 'Kesildi', variant: 'info' },
  partially_paid: { label: 'Kısmi Ödendi', variant: 'warning' },
  paid: { label: 'Ödendi', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'danger' },
};

export interface InvoiceLine {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number; // satır iskontosu %
  tax_rate: number; // KDV %
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const addDays = (date: string | Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

/** Toplamlar: KDV, satır ve genel iskonto düşüldükten sonraki matrah üzerinden hesaplanır. */
export function calcInvoiceTotals(lines: InvoiceLine[], generalDiscountPct: number) {
  const g = Math.min(Math.max(Number(generalDiscountPct) || 0, 0), 100) / 100;
  let subtotal = 0;
  let tax = 0;
  const lineTotals = lines.map(l => {
    const lt = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * (1 - (Number(l.discount) || 0) / 100);
    subtotal += lt;
    tax += lt * (1 - g) * ((Number(l.tax_rate) || 0) / 100);
    return round2(lt);
  });
  const discountAmount = round2(subtotal * g);
  subtotal = round2(subtotal);
  const taxTotal = round2(tax);
  const netTotal = round2(subtotal - discountAmount);
  return { subtotal, discountAmount, netTotal, taxTotal, total: round2(netTotal + taxTotal), lineTotals };
}

/** Taslak fatura oluşturur (numara kesilirken atanır). */
export async function createDraftInvoice(
  supabase: Supa,
  header: { customer_id: string; sales_person_id?: string | null; order_id?: string | null; issue_date?: string; due_date?: string; discount?: number; notes?: string },
  lines: InvoiceLine[],
) {
  if (!header.customer_id) throw new Error('Müşteri seçilmelidir');
  if (!lines.length) throw new Error('En az bir fatura kalemi gereklidir');

  const t = calcInvoiceTotals(lines, header.discount || 0);
  const issueDate = header.issue_date || new Date().toISOString().split('T')[0];

  const { data: inv, error } = await supabase.from('invoices').insert([{
    customer_id: header.customer_id,
    sales_person_id: header.sales_person_id || null,
    order_id: header.order_id || null,
    issue_date: issueDate,
    due_date: header.due_date || addDays(issueDate, DEFAULT_PAYMENT_TERM_DAYS),
    subtotal: t.subtotal,
    discount: header.discount || 0,
    discount_amount: t.discountAmount,
    tax_total: t.taxTotal,
    total: t.total,
    notes: header.notes || null,
    status: 'draft',
  }]).select().single();
  if (error) throw error;

  const { error: iErr } = await supabase.from('invoice_items').insert(lines.map((l, i) => ({
    invoice_id: inv.id,
    product_id: l.product_id || null,
    description: l.description || null,
    quantity: l.quantity,
    unit_price: l.unit_price,
    discount: l.discount || 0,
    tax_rate: l.tax_rate,
    line_total: t.lineTotals[i],
    sort_order: i,
  })));
  if (iErr) {
    await supabase.from('invoices').delete().eq('id', inv.id);
    throw iErr;
  }
  return inv;
}

/** Siparişten taslak fatura oluşturur. Aynı sipariş için iptal edilmemiş fatura varsa onu döndürür. */
export async function createInvoiceFromOrder(supabase: Supa, orderId: string) {
  const { data: existing } = await supabase
    .from('invoices').select('id, invoice_number, status')
    .eq('order_id', orderId).neq('status', 'cancelled').limit(1);
  if (existing && existing.length > 0) return { invoice: existing[0], created: false };

  const { data: order, error: oErr } = await supabase.from('orders').select('*').eq('id', orderId).single();
  if (oErr) throw oErr;
  const { data: items, error: iErr } = await supabase
    .from('order_items').select('*, product:product_id(name)').eq('order_id', orderId);
  if (iErr) throw iErr;

  const lines: InvoiceLine[] = (items || []).map((it: any) => ({
    product_id: it.product_id || null,
    description: it.description || it.product?.name || '',
    quantity: Number(it.quantity) || 1,
    unit_price: Number(it.unit_price) || 0,
    discount: Number(it.discount) || 0,
    tax_rate: it.tax_rate != null ? Number(it.tax_rate) : 20,
  }));

  let termDays: number = DEFAULT_PAYMENT_TERM_DAYS;
  if (order.payment_term_days !== null && order.payment_term_days !== undefined) {
    termDays = Number(order.payment_term_days);
  } else if (order.customer_id) {
    const { data: cust } = await supabase.from('customers').select('payment_term_days').eq('id', order.customer_id).single();
    if (cust?.payment_term_days !== null && cust?.payment_term_days !== undefined) termDays = Number(cust.payment_term_days);
  }
  const issueDate = new Date().toISOString().split('T')[0];

  const invoice = await createDraftInvoice(supabase, {
    issue_date: issueDate,
    due_date: addDays(issueDate, termDays),
    customer_id: order.customer_id,
    sales_person_id: order.sales_person_id,
    order_id: order.id,
    discount: Number(order.discount) || 0,
    notes: `${order.order_number || 'Sipariş'} numaralı siparişten oluşturuldu.`,
  }, lines);
  return { invoice, created: true };
}

/**
 * Faturayı keser: sıralı numara atanır, fatura kilitlenir ve vade tarihli
 * tahsilat (alacak) kaydı otomatik oluşturulur.
 */
export async function issueInvoice(supabase: Supa, invoice: any) {
  if (invoice.status !== 'draft') throw new Error('Sadece taslak fatura kesilebilir');
  const number = await nextDocumentNumber(supabase, 'invoice');
  const today = new Date().toISOString().split('T')[0];

  const { data: issued, error } = await supabase.from('invoices').update({
    invoice_number: number,
    status: 'issued',
    issued_at: new Date().toISOString(),
    issue_date: invoice.issue_date || today,
  }).eq('id', invoice.id).eq('status', 'draft').select().single();
  if (error) throw error;

  const { error: cErr } = await supabase.from('collections').insert([{
    invoice_id: issued.id,
    invoice_no: number,
    customer_id: issued.customer_id,
    sales_person_id: issued.sales_person_id || null,
    amount: issued.total,
    due_date: issued.due_date,
    status: 'Bekliyor',
    notes: `${number} numaralı fatura alacağı`,
  }]);
  if (cErr) {
    throw new Error(`Fatura ${number} numarasıyla kesildi ancak tahsilat kaydı oluşturulamadı: ${cErr.message}. Tahsilat sayfasından elle ekleyebilirsiniz.`);
  }
  return issued;
}

/** Faturayı iptal eder. Ödemesi alınmış fatura iptal edilemez (önce iade/düzeltme gerekir). */
export async function cancelInvoice(supabase: Supa, invoice: any, reason: string) {
  if (invoice.status === 'cancelled') return;
  if (invoice.status !== 'draft' && !reason?.trim()) throw new Error('İptal nedeni zorunludur');
  if (Number(invoice.paid_amount) > 0) {
    throw new Error('Ödemesi alınmış fatura iptal edilemez. Önce ilgili tahsilatı düzeltin veya iade faturası düzenleyin.');
  }
  if (invoice.status === 'draft') {
    const { error } = await supabase.from('invoices').delete().eq('id', invoice.id);
    if (error) throw error;
    return;
  }
  // Ödenmemiş alacak kayıtlarını kaldır
  await supabase.from('collections').delete().eq('invoice_id', invoice.id).neq('status', 'Ödendi');
  const { error } = await supabase.from('invoices').update({
    status: 'cancelled',
    cancel_reason: reason.trim(),
    cancelled_at: new Date().toISOString(),
  }).eq('id', invoice.id);
  if (error) throw error;
}
