import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Müşterinin online teklif sayfası için: paylaşılan teklif dosyaları.
 *   GET ?token=<share_token>            → dosya listesi
 *   GET ?token=<share_token>&id=<ek id>  → indirme (imzalı adrese yönlendirir, indirme sayılır, temsilciye bildirim)
 */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const token = u.searchParams.get('token') || '';
  const id = u.searchParams.get('id') || '';
  if (!UUID.test(token)) return NextResponse.json({ files: [] });
  const admin = adminClient();
  const { data: q } = await admin.from('quotes').select('id, organization_id, status, quote_number').eq('share_token', token).maybeSingle();
  if (!q || ['draft', 'reviewed'].includes(q.status)) return NextResponse.json({ files: [] });

  if (!id) {
    const { data } = await admin.from('quote_attachments').select('id, file_name, mime_type, size_bytes, kind').eq('quote_id', q.id).eq('share_with_customer', true).order('created_at');
    return NextResponse.json({ files: data || [] });
  }
  if (!UUID.test(id)) return NextResponse.json({ error: 'Geçersiz dosya' }, { status: 400 });
  const { data: f } = await admin.from('quote_attachments').select('*').eq('id', id).eq('quote_id', q.id).eq('share_with_customer', true).maybeSingle();
  if (!f) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 });
  const { data: signed, error } = await admin.storage.from('quote-files').createSignedUrl(f.storage_path, 120, { download: f.file_name });
  if (error || !signed) return NextResponse.json({ error: 'Dosya açılamadı' }, { status: 500 });
  const ua = request.headers.get('user-agent') || '';
  if (!/(bot|crawl|spider|preview|headless|safelinks|python|curl)/i.test(ua)) {
    await admin.from('quote_attachments').update({ download_count: (f.download_count || 0) + 1, last_downloaded_at: new Date().toISOString() }).eq('id', f.id);
    if (!f.download_count) {
      try { await admin.rpc('quote_notify', { p_org: q.organization_id, p_quote: q.id, p_type: 'info', p_title: `Teklif dosyası indirildi: ${q.quote_number}`, p_message: `Müşteri "${f.file_name}" dosyasını indirdi.` }); } catch { /* bildirim tablosu yoksa geç */ }
    }
  }
  return NextResponse.redirect(signed.signedUrl, 302);
}
