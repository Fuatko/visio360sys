import { NextResponse } from 'next/server';
import { adminClient, authorizeUrl, callerOrg, exchangeCode, exchangePassword, listCompanies, parasutEnv } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';

// Yetkilendirme adresi (Paraşüt'te "izin ver" sayfası)
export async function GET(request: Request) {
  const env = parasutEnv();
  if (env.missing.length) return NextResponse.json({ error: 'Sunucuda eksik ayar: ' + env.missing.join(', ') }, { status: 501 });
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  return NextResponse.json({ url: authorizeUrl() });
}

// Bağlan: Paraşüt yetki kodu VEYA (bir kez kullanılıp saklanmayan) e-posta + şifre
export async function POST(request: Request) {
  const env = parasutEnv();
  if (env.missing.length) return NextResponse.json({ error: 'Sunucuda eksik ayar: ' + env.missing.join(', ') }, { status: 501 });
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  if (!who.isAdmin) return NextResponse.json({ error: 'Paraşüt bağlantısını yalnızca yönetici kurabilir.' }, { status: 403 });
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 }); }
  try {
    const t = body.code ? await exchangeCode(String(body.code)) : body.username && body.password ? await exchangePassword(String(body.username), String(body.password)) : null;
    if (!t) return NextResponse.json({ error: 'Yetki kodu veya e-posta/şifre gerekli.' }, { status: 400 });
    const admin = adminClient();
    const row = { organization_id: who.orgId, ...t, connected_by: who.userId, connected_at: new Date().toISOString() };
    const { error } = await admin.from('parasut_connections').upsert(row, { onConflict: 'organization_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const companies = await listCompanies(admin, { organization_id: who.orgId, company_id: null, ...t }).catch(() => []);
    if (companies.length === 1) await admin.from('parasut_connections').update({ company_id: companies[0].id, company_name: companies[0].name }).eq('organization_id', who.orgId);
    return NextResponse.json({ ok: true, companies });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
