import { NextResponse } from 'next/server';
import { adminClient, api, callerOrg } from '@/lib/parasut-server';
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
  const { data: conn } = await admin.from('parasut_connections').select('*').eq('organization_id', who.orgId).maybeSingle();
  if (!conn?.refresh_token) return NextResponse.json({ connected: false, documents: [] });

  const tax = String((cu as any).tax_number || '').replace(/\D/g, '');
  const names = new Set([normalizeName((cu as any).name || ''), normalizeName((cu as any).legal_name || '')].filter(Boolean));
  const [sales, bills] = await Promise.all([
    admin.from('parasut_documents').select('*').eq('organization_id', who.orgId).eq('kind', 'sales_invoice').eq('customer_id', id).limit(2000),
    admin.from('parasut_documents').select('*').eq('organization_id', who.orgId).eq('kind', 'purchase_bill').limit(5000),
  ]);
  // Paraşüt'teki cari kart(lar)ı ve Paraşüt'ün kendi hesapladığı bakiye (tüm geçmiş dahil, canlı)
  let contacts: any[] = []; let contactErr: string | null = null;
  if (conn.company_id) {
    try {
      const q: Record<string, string> = { 'page[size]': '10' };
      if (tax) q['filter[tax_number]'] = tax; else q['filter[name]'] = (cu as any).name;
      const j = await api(admin, conn as any, `/${conn.company_id}/contacts`, q);
      contacts = (j.data || []).map((x: any) => {
        const a = x.attributes || {};
        return { id: String(x.id), name: a.name, account_type: a.account_type || null, balance: a.balance ?? null, trl_balance: a.trl_balance ?? null,
          usd_balance: a.usd_balance ?? null, eur_balance: a.eur_balance ?? null, gbp_balance: a.gbp_balance ?? null };
      });
    } catch (e: any) { contactErr = e.message; }
  }
  const cids = new Set(contacts.map(c => c.id));
  const myBills = (bills.data || []).filter((d: any) => (d.contact_parasut_id && cids.has(String(d.contact_parasut_id))) || (tax && String(d.tax_number || '') === tax) || (names.has(normalizeName(d.contact_name || '')) && (!tax || !d.tax_number)));
  return NextResponse.json({ connected: true, sync_from: conn.sync_from, contacts, contact_error: contactErr, documents: [...(sales.data || []), ...myBills] });
}
