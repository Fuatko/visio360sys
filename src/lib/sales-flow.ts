import { nextDocumentNumber } from '@/lib/doc-number';
// Satış akışı: Fırsat → Teklif → Sipariş
// Kazanılan fırsattan veya onaylanan tekliften sipariş oluşturur.

type Supa = any;

export const WON_STAGES = ['Kazanıldı', 'won'];
export const LOST_STAGES = ['Kaybedildi', 'lost'];
export const DEFAULT_TAX_RATE = 20;

const round2 = (n: number) => Math.round(n * 100) / 100;


async function findExistingOrder(supabase: Supa, field: 'opportunity_id' | 'quote_id', id: string) {
  const { data } = await supabase.from('orders').select('id, order_number').eq(field, id).limit(1);
  return data && data.length > 0 ? data[0] : null;
}

/** Tekliften sipariş oluşturur (kalemler, iskonto ve KDV aynen aktarılır). */
export async function createOrderFromQuote(supabase: Supa, quoteId: string) {
  const existing = await findExistingOrder(supabase, 'quote_id', quoteId);
  if (existing) return { order: existing, created: false };

  const { data: quote, error: qErr } = await supabase.from('quotes').select('*').eq('id', quoteId).single();
  if (qErr) throw qErr;
  const { data: qItems, error: iErr } = await supabase.from('quote_items').select('*').eq('quote_id', quoteId);
  if (iErr) throw iErr;

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert([{
      order_number: await nextDocumentNumber(supabase, 'order'),
      customer_id: quote.customer_id,
      sales_person_id: quote.sales_person_id || null,
      subtotal: quote.subtotal || 0,
      discount: quote.discount || 0,
      tax_total: quote.tax_total || 0,
      total: quote.total || 0,
      status: 'confirmed',
      order_date: new Date().toISOString(),
      notes: `${quote.quote_number || 'Teklif'} numaralı tekliften oluşturuldu.${quote.subject ? ' Konu: ' + quote.subject : ''}`,
      quote_id: quote.id,
      opportunity_id: quote.opportunity_id || null,
      payment_term_days: quote.payment_term_days ?? null,
    }])
    .select()
    .single();
  if (oErr) throw oErr;

  if (qItems && qItems.length > 0) {
    const { error } = await supabase.from('order_items').insert(qItems.map((it: any) => ({
      order_id: order.id,
      product_id: it.product_id || null,
      description: it.description || null,
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount: it.discount || 0,
      tax_rate: it.tax_rate ?? DEFAULT_TAX_RATE,
      total: it.total,
    })));
    if (error) {
      // Kalemler eklenemezse yarım sipariş bırakma
      await supabase.from('orders').delete().eq('id', order.id);
      throw error;
    }
  }

  return { order, created: true };
}

/**
 * Kazanılan fırsattan sipariş oluşturur.
 * Fırsata bağlı bir teklif varsa (tercihen onaylanmış olan) o tekliften,
 * yoksa fırsat değerinden tek kalemli bir sipariş oluşturur (KDV hariç değer + %20 KDV).
 */
export async function createOrderFromOpportunity(supabase: Supa, opp: any) {
  const existing = await findExistingOrder(supabase, 'opportunity_id', opp.id);
  if (existing) return { order: existing, created: false, fromQuote: false };

  const { data: linkedQuotes } = await supabase
    .from('quotes')
    .select('id, status, created_at')
    .eq('opportunity_id', opp.id)
    .order('created_at', { ascending: false });

  const quote = (linkedQuotes || []).find((q: any) => q.status === 'approved') || (linkedQuotes || [])[0];
  if (quote) {
    if (quote.status !== 'approved') {
      await supabase.from('quotes').update({ status: 'approved' }).eq('id', quote.id);
    }
    const res = await createOrderFromQuote(supabase, quote.id);
    return { ...res, fromQuote: true };
  }

  const value = Number(opp.value) || 0;
  const tax = round2(value * DEFAULT_TAX_RATE / 100);
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert([{
      order_number: await nextDocumentNumber(supabase, 'order'),
      customer_id: opp.customer_id || null,
      sales_person_id: opp.assigned_to || null,
      subtotal: value,
      discount: 0,
      tax_total: tax,
      total: round2(value + tax),
      status: 'confirmed',
      order_date: new Date().toISOString(),
      notes: `"${opp.title}" fırsatından oluşturuldu.`,
      opportunity_id: opp.id,
    }])
    .select()
    .single();
  if (oErr) throw oErr;

  const { error } = await supabase.from('order_items').insert([{
    order_id: order.id,
    product_id: null,
    description: opp.title,
    quantity: 1,
    unit_price: value,
    discount: 0,
    tax_rate: DEFAULT_TAX_RATE,
    total: value,
  }]);
  if (error) {
    // Kalem eklenemezse yarım sipariş bırakma
    await supabase.from('orders').delete().eq('id', order.id);
    throw error;
  }

  return { order, created: true, fromQuote: false };
}

/** Siparişin KDV hariç net tutarı (satış hedefleri ile karşılaştırma için). */
export function orderNetAmount(o: any): number {
  if (o.subtotal != null) {
    return Number(o.subtotal) * (1 - (Number(o.discount) || 0) / 100);
  }
  return Number(o.total ?? o.total_amount ?? o.grand_total ?? 0);
}
