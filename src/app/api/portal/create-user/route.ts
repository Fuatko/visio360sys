import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Şirket personeli, davet edilmiş bir bayi kullanıcısı için şifreli hesap açar
// (e-posta onayı gerekmeden). SUPABASE_SERVICE_ROLE_KEY gerekir.
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return NextResponse.json({ error: 'NO_SERVICE_KEY' }, { status: 501 });
  }

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 401 });

  let body: { dealer_user_id?: string; password?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 }); }
  const { dealer_user_id, password } = body;
  if (!dealer_user_id || !password || password.length < 8) {
    return NextResponse.json({ error: 'Şifre en az 8 karakter olmalı' }, { status: 400 });
  }

  // İsteği yapan kişinin yetkisiyle: bu bayi kullanıcısını görebiliyor mu? (RLS şirket kontrolü yapar)
  const asStaff = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: me } = await asStaff.auth.getUser(token);
  if (!me?.user) return NextResponse.json({ error: 'Oturum geçersiz' }, { status: 401 });
  const { data: isDealer } = await asStaff.rpc('is_dealer_user');
  if (isDealer) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  const { data: du, error: duErr } = await asStaff.from('dealer_users').select('id, email, full_name, status, auth_user_id').eq('id', dealer_user_id).single();
  if (duErr || !du) return NextResponse.json({ error: 'Bayi kullanıcısı bulunamadı veya yetkiniz yok' }, { status: 404 });
  if (du.auth_user_id) return NextResponse.json({ error: 'Bu kullanıcının hesabı zaten var' }, { status: 409 });

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: du.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: du.full_name, dealer_portal: true },
  });
  if (cErr || !created?.user) {
    const msg = cErr?.message?.includes('already') ? 'Bu e-postayla zaten bir hesap var. Kullanıcı mevcut şifresiyle giriş yapınca otomatik bağlanır.' : (cErr?.message || 'Hesap açılamadı');
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { error: uErr } = await admin.from('dealer_users').update({ auth_user_id: created.user.id, status: 'active' }).eq('id', du.id);
  if (uErr) return NextResponse.json({ error: 'Hesap açıldı ama bağlanamadı: ' + uErr.message }, { status: 500 });
  // Otomatik açılmış boş personel profili varsa kaldır
  await admin.from('users').delete().eq('id', created.user.id).is('organization_id', null);

  return NextResponse.json({ ok: true });
}
