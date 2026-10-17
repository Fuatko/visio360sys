import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 15 * 1024 * 1024;
const OK_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp)|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|vnd\.ms-excel))$/;
const safe = (s: string) => s.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-80);

/**
 * Tedarikçi teklif sayfası (/rfq/[token]) için imzalı yükleme adresi.
 *   POST { token, name, size, type } → { path, signedToken }  — yükleme istemciden uploadToSignedUrl ile yapılır,
 *   ardından proc_public_rfq_attach RPC'si kaydı oluşturur. Yol: procure-files/<kurum>/rfq/<rfq>/<davet>/<ts>-<ad>
 */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 }); }
  const token = String(body?.token || ''), name = String(body?.name || 'teklif.pdf'), size = Number(body?.size) || 0, type = String(body?.type || '');
  if (!UUID.test(token)) return NextResponse.json({ error: 'Bağlantı geçersiz' }, { status: 400 });
  if (size <= 0 || size > MAX) return NextResponse.json({ error: 'Dosya 15 MB\'tan büyük olamaz' }, { status: 400 });
  if (!OK_TYPES.test(type)) return NextResponse.json({ error: 'Yalnızca PDF, görsel, Word veya Excel dosyası yüklenebilir' }, { status: 400 });

  const admin = adminClient();
  const { data: rv } = await admin.from('proc_rfq_vendors').select('id, rfq_id, declined, rfq:rfq_id(organization_id, status, deadline)').eq('share_token', token).maybeSingle();
  const rfq: any = (rv as any)?.rfq;
  if (!rv || !rfq) return NextResponse.json({ error: 'Bağlantı geçersiz' }, { status: 404 });
  if (rfq.status !== 'sent' || (rfq.deadline && new Date(rfq.deadline) <= new Date()) || rv.declined) return NextResponse.json({ error: 'Teklif süresi doldu' }, { status: 400 });
  const { count } = await admin.from('proc_attachments').select('id', { count: 'exact', head: true }).eq('owner_type', 'quote').eq('owner_id', rv.id);
  if ((count || 0) >= 5) return NextResponse.json({ error: 'En fazla 5 dosya eklenebilir' }, { status: 400 });

  const path = `${rfq.organization_id}/rfq/${rv.rfq_id}/${rv.id}/${Date.now()}-${safe(name)}`;
  const { data, error } = await admin.storage.from('procure-files').createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: 'Yükleme adresi oluşturulamadı' }, { status: 500 });
  return NextResponse.json({ path, signedToken: data.token });
}
