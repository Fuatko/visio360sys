import { NextResponse } from 'next/server';
import { adminClient, callerOrg } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';

// Satış faturalarını bir müşteri kartına eşleştir (yalnızca aynı kurumun belgeleri ve müşterisi)
export async function POST(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { ids, customer_id } = await request.json().catch(() => ({}));
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: 'Belge seçilmedi' }, { status: 400 });
  const admin = adminClient();
  if (customer_id) {
    const { data: cu } = await admin.from('customers').select('id').eq('id', customer_id).eq('organization_id', who.orgId).maybeSingle();
    if (!cu) return NextResponse.json({ error: 'Müşteri bu kuruma ait değil' }, { status: 400 });
  }
  const { error } = await admin.from('parasut_documents').update({ customer_id: customer_id || null }).in('id', ids.slice(0, 1000)).eq('organization_id', who.orgId).eq('kind', 'sales_invoice');
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
