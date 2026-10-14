import { NextResponse } from 'next/server';
import { adminClient, callerOrg } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';

// Mutabakat verisi: kurumun siparişleri + Paraşüt satış faturaları + müşteri adları
export async function GET(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const admin = adminClient();

  const probe = await admin.from('parasut_documents').select('order_id').limit(1);
  const ready = !probe.error;

  let orders: any = await admin.from('orders').select('id, order_number, customer_id, status, total, order_date, created_at, currency, exchange_rate').eq('organization_id', who.orgId).order('created_at', { ascending: false }).limit(3000);
  if (orders.error && /column/i.test(orders.error.message)) orders = await admin.from('orders').select('id, order_number, customer_id, status, total, order_date, created_at').eq('organization_id', who.orgId).order('created_at', { ascending: false }).limit(3000);

  const [docs, cust, conn] = await Promise.all([
    admin.from('parasut_documents').select('*').eq('organization_id', who.orgId).eq('kind', 'sales_invoice').order('issue_date', { ascending: false }).limit(3000),
    admin.from('customers').select('id, name').eq('organization_id', who.orgId),
    admin.from('parasut_connections').select('sync_from, last_sync_at, refresh_token').eq('organization_id', who.orgId).maybeSingle(),
  ]);
  return NextResponse.json({
    ready, connected: !!conn.data?.refresh_token, sync_from: conn.data?.sync_from || null, last_sync_at: conn.data?.last_sync_at || null,
    orders: orders.data || [], documents: docs.data || [], customers: cust.data || [],
    error: orders.error?.message || docs.error?.message || null,
  });
}

// Bağla / bağlantıyı kaldır: { links: [{ doc_ids: [...], order_id: uuid | null }] }
export async function POST(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { links } = await request.json().catch(() => ({}));
  if (!Array.isArray(links) || !links.length) return NextResponse.json({ error: 'Bağlantı yok' }, { status: 400 });
  const admin = adminClient();
  let n = 0;
  for (const l of links.slice(0, 500)) {
    const ids: string[] = Array.isArray(l.doc_ids) ? l.doc_ids.slice(0, 50) : [];
    if (!ids.length) continue;
    if (l.order_id) {
      const { data: o } = await admin.from('orders').select('id, customer_id').eq('id', l.order_id).eq('organization_id', who.orgId).maybeSingle();
      if (!o) return NextResponse.json({ error: 'Sipariş bu kuruma ait değil' }, { status: 400 });
      // Fatura henüz bir müşteriye bağlı değilse siparişin müşterisine bağla
      await admin.from('parasut_documents').update({ customer_id: o.customer_id }).in('id', ids).eq('organization_id', who.orgId).is('customer_id', null);
    }
    const { error } = await admin.from('parasut_documents')
      .update({ order_id: l.order_id || null, order_linked_by: l.order_id ? who.userId : null, order_linked_at: l.order_id ? new Date().toISOString() : null })
      .in('id', ids).eq('organization_id', who.orgId).eq('kind', 'sales_invoice');
    if (error) return NextResponse.json({ error: /column/i.test(error.message) ? 'parasut-mutabakat.sql dosyası Supabase\'de çalıştırılmamış.' : error.message }, { status: 400 });
    n += ids.length;
  }
  return NextResponse.json({ ok: true, linked: n });
}
