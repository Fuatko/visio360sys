import { NextResponse } from 'next/server';
import { adminClient, callerOrg, syncOrg } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { from } = await request.json().catch(() => ({}));
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) return NextResponse.json({ error: 'Tarih biçimi YYYY-AA-GG olmalı' }, { status: 400 });
  try { return NextResponse.json(await syncOrg(adminClient(), who.orgId, from)); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
