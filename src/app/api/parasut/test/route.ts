import { NextResponse } from 'next/server';
import { adminClient, api, callerOrg } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';

// Bağlantı testi: firma bilgisini ve son 1 satış faturasını okur
export async function POST(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const admin = adminClient();
  const { data: c } = await admin.from('parasut_connections').select('*').eq('organization_id', who.orgId).maybeSingle();
  if (!c?.refresh_token) return NextResponse.json({ error: 'Paraşüt bağlı değil' }, { status: 400 });
  try {
    const me = await api(admin, c, '/me');
    const out: any = { ok: true, user: me?.data?.attributes?.email || me?.data?.attributes?.name || 'bağlı' };
    if (c.company_id) {
      const inv = await api(admin, c, `/${c.company_id}/sales_invoices`, { sort: '-issue_date', 'page[size]': '1' });
      out.invoices_total = inv?.meta?.total_count ?? null;
      const a = inv?.data?.[0]?.attributes;
      out.last_invoice = a ? { issue_date: a.issue_date, net_total: a.net_total, currency: a.currency } : null;
    }
    return NextResponse.json(out);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
