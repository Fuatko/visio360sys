import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ROLES = ['requester', 'approver', 'buyer', 'receiver', 'finance', 'procure_admin'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Kurulum için kullanıcı + satınalma rolü toplu içe aktarma (yalnızca satınalma yöneticisi).
 *   POST { rows: [{ line, email, name, roles[], cost_center_codes[], approval_limit }] }
 * Kurumda olan kullanıcıya rol atanır; olmayana Supabase davet e-postası gider (şifre üretilmez, paylaşılmaz).
 * SUPABASE_SERVICE_ROLE_KEY yalnızca sunucuda okunur.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return NextResponse.json({ error: 'Sunucuda SUPABASE_SERVICE_ROLE_KEY tanımlı değil.' }, { status: 501 });
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 }); }
  const rows: any[] = Array.isArray(body?.rows) ? body.rows.slice(0, 500) : [];
  if (!rows.length) return NextResponse.json({ error: 'Satır yok' }, { status: 400 });

  // İsteği yapanın kendi yetkisiyle: kurumu ve satınalma yöneticisi olup olmadığı
  const asUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: me } = await asUser.auth.getUser(token);
  if (!me?.user) return NextResponse.json({ error: 'Oturum geçersiz' }, { status: 401 });
  const [{ data: isAdmin }, { data: orgId }] = await Promise.all([asUser.rpc('proc_has_role', { p_role: 'procure_admin' }), asUser.rpc('current_org_id')]);
  if (!isAdmin || !orgId) return NextResponse.json({ error: 'Bu işlem için satınalma yöneticisi yetkisi gerekir.' }, { status: 403 });

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: ccs } = await admin.from('proc_cost_centers').select('id, code').eq('organization_id', orgId);
  const ccBy = new Map((ccs || []).filter((c: any) => c.code).map((c: any) => [String(c.code).toLowerCase(), c.id]));
  const origin = new URL(request.url).origin;
  const results: { line: number; email: string; ok: boolean; message: string }[] = [];

  for (const r of rows) {
    const line = Number(r.line) || 0, email = String(r.email || '').trim().toLowerCase(), name = String(r.name || '').trim();
    const roles = (Array.isArray(r.roles) ? r.roles : []).map((x: string) => String(x).trim()).filter(Boolean);
    const fail = (message: string) => results.push({ line, email, ok: false, message });
    if (!EMAIL.test(email)) { fail('E-posta geçersiz'); continue; }
    const badRole = roles.find((x: string) => !ROLES.includes(x));
    if (badRole) { fail(`Rol "${badRole}" geçersiz (${ROLES.join(', ')})`); continue; }
    const codes = (Array.isArray(r.cost_center_codes) ? r.cost_center_codes : []).map((x: string) => String(x).trim().toLowerCase()).filter(Boolean);
    const badCode = codes.find((c: string) => !ccBy.has(c));
    if (badCode) { fail(`Masraf merkezi kodu "${badCode}" bulunamadı`); continue; }
    const limit = r.approval_limit === '' || r.approval_limit == null ? null : Number(String(r.approval_limit).replace(/\./g, '').replace(',', '.'));
    if (limit != null && (!isFinite(limit) || limit < 0)) { fail('Onay limiti geçersiz'); continue; }

    let userId: string | null = null; let note = '';
    const { data: existing } = await admin.from('users').select('id, organization_id').ilike('email', email).maybeSingle();
    if (existing) {
      if (existing.organization_id && existing.organization_id !== orgId) { fail('Bu e-posta başka bir kuruma kayıtlı'); continue; }
      userId = existing.id;
      if (!existing.organization_id) await admin.from('users').update({ organization_id: orgId }).eq('id', userId);
    } else {
      const inv = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: name, name }, redirectTo: `${origin}/login` });
      if (inv.error || !inv.data?.user) { fail(`Davet gönderilemedi: ${inv.error?.message || 'bilinmeyen hata'}. Kullanıcıyı Kullanıcı Yönetimi'nden ekleyip tekrar deneyin.`); continue; }
      userId = inv.data.user.id; note = 'davet e-postası gönderildi';
      // Kayıt tetikleyicisinin açtığı boş profil kuruma bağlanır (ad sütunu kurulumdan kuruluma değişebilir)
      let up = await admin.from('users').upsert({ id: userId, email, name: name || email, role: 'user', organization_id: orgId, is_active: true }, { onConflict: 'id' });
      if (up.error && /name/i.test(up.error.message)) up = await admin.from('users').upsert({ id: userId, email, full_name: name || email, role: 'user', organization_id: orgId, is_active: true }, { onConflict: 'id' });
      if (up.error) { fail(`Hesap açıldı ama profile bağlanamadı: ${up.error.message}`); continue; }
    }
    const m = await admin.from('proc_members').upsert({ organization_id: orgId, user_id: userId, roles, cost_center_ids: codes.map((c: string) => ccBy.get(c)), approval_limit: limit, is_active: true },
      { onConflict: 'organization_id,user_id' });
    if (m.error) { fail(m.error.message); continue; }
    results.push({ line, email, ok: true, message: note || 'rol atandı' });
  }
  return NextResponse.json({ results });
}
