import { NextResponse } from 'next/server';
import { adminClient, callerOrg } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';

// İş kolu kârlılığı ve bayi işleri verisi: satış + alış belgeleri, bağlantılar, kategori eşlemesi, ana firma rolleri
export async function GET(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const admin = adminClient();
  const [docs, links, map, cust, conn] = await Promise.all([
    admin.from('parasut_documents').select('id, kind, doc_no, issue_date, contact_name, contact_parasut_id, tax_number, customer_id, category, net_total_try, payment_status, remaining, description')
      .eq('organization_id', who.orgId).in('kind', ['sales_invoice', 'purchase_bill']).order('issue_date', { ascending: false }).limit(5000),
    admin.from('parasut_doc_links').select('id, purchase_doc_id, sales_doc_id').eq('organization_id', who.orgId),
    admin.from('parasut_category_map').select('purchase_category, business_line').eq('organization_id', who.orgId),
    admin.from('customers').select('id, name, tax_number, relation_roles').eq('organization_id', who.orgId),
    admin.from('parasut_connections').select('sync_from, last_sync_at').eq('organization_id', who.orgId).maybeSingle(),
  ]);
  return NextResponse.json({
    ready: !links.error && !map.error, documents: docs.data || [], links: links.data || [], map: map.data || [],
    customers: cust.error ? [] : cust.data || [], sync_from: conn.data?.sync_from || null, last_sync_at: conn.data?.last_sync_at || null,
  });
}

// { action: 'link', purchase_doc_id, sales_doc_ids[] } | { action: 'unlink', link_ids[] } | { action: 'map', purchase_category, business_line|null }
export async function POST(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const b = await request.json().catch(() => ({}));
  const admin = adminClient();
  const fail = (e: any) => NextResponse.json({ error: /relation|does not exist/i.test(e.message) ? 'parasut-matris.sql dosyası Supabase\'de çalıştırılmamış.' : e.message }, { status: 400 });

  if (b.action === 'map') {
    if (!b.purchase_category) return NextResponse.json({ error: 'Kategori yok' }, { status: 400 });
    const r = b.business_line
      ? await admin.from('parasut_category_map').upsert({ organization_id: who.orgId, purchase_category: b.purchase_category, business_line: b.business_line })
      : await admin.from('parasut_category_map').delete().eq('organization_id', who.orgId).eq('purchase_category', b.purchase_category);
    return r.error ? fail(r.error) : NextResponse.json({ ok: true });
  }
  if (b.action === 'unlink') {
    const r = await admin.from('parasut_doc_links').delete().in('id', (b.link_ids || []).slice(0, 500)).eq('organization_id', who.orgId);
    return r.error ? fail(r.error) : NextResponse.json({ ok: true });
  }
  if (b.action === 'link') {
    const pairs: { purchase_doc_id: string; sales_doc_id: string }[] = Array.isArray(b.pairs) ? b.pairs.slice(0, 500) : [];
    if (!pairs.length) return NextResponse.json({ error: 'Eşleşme yok' }, { status: 400 });
    const ids = Array.from(new Set(pairs.flatMap(p => [p.purchase_doc_id, p.sales_doc_id])));
    const { data: own } = await admin.from('parasut_documents').select('id').eq('organization_id', who.orgId).in('id', ids);
    if ((own || []).length !== ids.length) return NextResponse.json({ error: 'Belge bu kuruma ait değil' }, { status: 400 });
    const r = await admin.from('parasut_doc_links').upsert(pairs.map(p => ({ ...p, organization_id: who.orgId, created_by: who.userId })), { onConflict: 'purchase_doc_id,sales_doc_id' });
    return r.error ? fail(r.error) : NextResponse.json({ ok: true, linked: pairs.length });
  }
  return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 });
}
