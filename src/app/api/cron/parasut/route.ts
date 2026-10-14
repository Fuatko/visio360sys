import { NextResponse } from 'next/server';
import { adminClient, parasutEnv, syncOrg } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Gece eşitlemesi: otomatik eşitleme açık tüm şirketler, son 60 gün (iptal/ödeme durumu değişiklikleri için)
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (parasutEnv().missing.length) return NextResponse.json({ skipped: 'eksik ayar' });
  const admin = adminClient();
  const { data: conns } = await admin.from('parasut_connections').select('organization_id, sync_from').eq('auto_sync', true).not('company_id', 'is', null).not('refresh_token', 'is', null);
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const out: any[] = [];
  for (const c of conns || []) {
    try { const r = await syncOrg(admin, c.organization_id, since > c.sync_from ? since : c.sync_from); out.push({ org: c.organization_id, counts: r.counts, errors: r.errors.length }); }
    catch (e: any) { out.push({ org: c.organization_id, error: e.message }); }
  }
  return NextResponse.json({ ok: true, results: out });
}
