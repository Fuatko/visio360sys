import { NextResponse } from 'next/server';
import { adminClient, callerOrg } from '@/lib/parasut-server';
import { normalizeName } from '@/lib/crm';

export const dynamic = 'force-dynamic';

// Bir müşterinin Paraşüt cari durumu: açık satış faturaları (alacak) + aynı VKN/unvanla alış faturaları (borç)
export async function GET(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const id = new URL(request.url).searchParams.get('customer_id') || '';
  const admin = adminClient();
  const { data: cu } = await admin.from('customers').select('id, name, legal_name, tax_number').eq('id', id).eq('organization_id', who.orgId).maybeSingle();
  if (!cu) return NextResponse.json({ error: 'Müşteri bulunamadı' }, { status: 404 });
  const { data: conn } = await admin.from('parasut_connections').select('refresh_token, sync_from').eq('organization_id', who.orgId).maybeSingle();
  if (!conn?.refresh_token) return NextResponse.json({ connected: false, documents: [] });

  const tax = String((cu as any).tax_number || '').replace(/\D/g, '');
  const names = new Set([normalizeName((cu as any).name || ''), normalizeName((cu as any).legal_name || '')].filter(Boolean));
  const [sales, bills] = await Promise.all([
    admin.from('parasut_documents').select('*').eq('organization_id', who.orgId).eq('kind', 'sales_invoice').eq('customer_id', id).limit(2000),
    admin.from('parasut_documents').select('*').eq('organization_id', who.orgId).eq('kind', 'purchase_bill').limit(5000),
  ]);
  const myBills = (bills.data || []).filter((d: any) => (tax && String(d.tax_number || '') === tax) || (!tax && names.has(normalizeName(d.contact_name || ''))) || (tax && !d.tax_number && names.has(normalizeName(d.contact_name || ''))));
  return NextResponse.json({ connected: true, sync_from: conn.sync_from, documents: [...(sales.data || []), ...myBills] });
}
