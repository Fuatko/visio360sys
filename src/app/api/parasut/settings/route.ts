import { NextResponse } from 'next/server';
import { adminClient, callerOrg } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  if (!who.isAdmin) return NextResponse.json({ error: 'Yalnızca yönetici' }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const patch: any = {};
  if (b.sync_from && /^\d{4}-\d{2}-\d{2}$/.test(b.sync_from)) patch.sync_from = b.sync_from;
  if (typeof b.auto_sync === 'boolean') patch.auto_sync = b.auto_sync;
  const { error } = await adminClient().from('parasut_connections').update(patch).eq('organization_id', who.orgId);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
