import { NextResponse } from 'next/server';
import { adminClient, callerOrg, listCompanies } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const admin = adminClient();
  const { data: c } = await admin.from('parasut_connections').select('*').eq('organization_id', who.orgId).maybeSingle();
  if (!c?.refresh_token) return NextResponse.json({ error: 'Paraşüt bağlı değil' }, { status: 400 });
  try { return NextResponse.json({ companies: await listCompanies(admin, c) }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}

export async function POST(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  if (!who.isAdmin) return NextResponse.json({ error: 'Yalnızca yönetici' }, { status: 403 });
  const { company_id, company_name } = await request.json().catch(() => ({}));
  if (!company_id) return NextResponse.json({ error: 'Firma seçin' }, { status: 400 });
  const { error } = await adminClient().from('parasut_connections').update({ company_id: String(company_id), company_name: company_name || null }).eq('organization_id', who.orgId);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
