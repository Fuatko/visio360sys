import { NextResponse } from 'next/server';
import { adminClient, callerOrg } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';

// Bağlantıyı kaldırır (anahtarlar silinir); eşitlenmiş belgeler isteğe bağlı silinir
export async function POST(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  if (!who.isAdmin) return NextResponse.json({ error: 'Yalnızca yönetici' }, { status: 403 });
  const { purge } = await request.json().catch(() => ({}));
  const admin = adminClient();
  await admin.from('parasut_connections').delete().eq('organization_id', who.orgId);
  if (purge) await admin.from('parasut_documents').delete().eq('organization_id', who.orgId);
  return NextResponse.json({ ok: true });
}
