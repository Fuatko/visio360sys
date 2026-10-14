import { NextResponse } from 'next/server';
import { adminClient, callerOrg, parasutEnv } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';

// Bağlantı durumu (anahtarlar hariç) + eşitlenmiş belgeler + kurumun müşterileri (eşleştirme için)
export async function GET(request: Request) {
  const env = parasutEnv();
  if (env.missing.includes('SUPABASE_SERVICE_ROLE_KEY')) return NextResponse.json({ error: 'Sunucuda eksik ayar: SUPABASE_SERVICE_ROLE_KEY' }, { status: 501 });
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const admin = adminClient();
  const [c, d, cu, org] = await Promise.all([
    admin.from('parasut_connections').select('company_id, company_name, connected_at, sync_from, auto_sync, last_sync_at, last_sync, refresh_token').eq('organization_id', who.orgId).maybeSingle(),
    admin.from('parasut_documents').select('*').eq('organization_id', who.orgId).order('issue_date', { ascending: false }).limit(3000),
    admin.from('customers').select('id, name, tax_number, merged_into').eq('organization_id', who.orgId).order('name'),
    admin.from('organizations').select('name').eq('id', who.orgId).maybeSingle(),
  ]);
  if (c.error && /relation|does not exist/i.test(c.error.message)) return NextResponse.json({ error: 'parasut.sql dosyası Supabase\'de çalıştırılmamış.' }, { status: 400 });
  const { refresh_token, ...rest } = (c.data || {}) as any;
  return NextResponse.json({
    org_name: org.data?.name || null, is_admin: who.isAdmin, missing_env: env.missing,
    status: c.data ? { ...rest, connected: !!refresh_token } : { connected: false },
    documents: d.data || [], customers: (cu.data || []).filter((x: any) => !x.merged_into),
  });
}
