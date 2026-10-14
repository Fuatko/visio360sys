// Paraşüt API v4 — yalnızca sunucuda kullanılır (anahtarlar ortam değişkenlerinden okunur, koda yazılmaz)
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { normalizeName } from '@/lib/crm';

const API = 'https://api.parasut.com';
export const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

export function parasutEnv() {
  const clientId = process.env.PARASUT_CLIENT_ID, clientSecret = process.env.PARASUT_CLIENT_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [!clientId && 'PARASUT_CLIENT_ID', !clientSecret && 'PARASUT_CLIENT_SECRET', !service && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean) as string[];
  if (service && serviceKeyKind(service) === 'public') missing.push('SUPABASE_SERVICE_ROLE_KEY (girilen değer herkese açık anon/publishable anahtar; service_role / secret anahtar olmalı)');
  return { clientId: clientId || '', clientSecret: clientSecret || '', url: url || '', anon: anon || '', service: service || '', missing };
}
/** Anahtar türü: JWT ise role alanına, yeni formatta önekine bakar */
export function serviceKeyKind(k: string): 'service' | 'public' | 'unknown' {
  if (k.startsWith('sb_secret_')) return 'service';
  if (k.startsWith('sb_publishable_')) return 'public';
  try { const role = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role; return role === 'service_role' ? 'service' : role === 'anon' ? 'public' : 'unknown'; }
  catch { return 'unknown'; }
}
export const adminClient = () => { const e = parasutEnv(); return createClient(e.url, e.service, { auth: { persistSession: false } }); };
export const authorizeUrl = () =>
  `${API}/oauth/authorize?client_id=${encodeURIComponent(parasutEnv().clientId)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code`;

/** İsteği yapan personelin şirketi ve rolü (bayi kullanıcıları reddedilir).
 *  Süper admin, üst menüden seçtiği kurum adına işlem yapar (x-org-id başlığı). */
export async function callerOrg(request: Request): Promise<{ orgId: string; userId: string; isAdmin: boolean } | { error: string; status: number }> {
  const e = parasutEnv();
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Oturum bulunamadı', status: 401 };
  const asUser = createClient(e.url, e.anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: me } = await asUser.auth.getUser(token);
  if (!me?.user) return { error: 'Oturum geçersiz', status: 401 };
  const { data: isDealer } = await asUser.rpc('is_dealer_user');
  if (isDealer) return { error: 'Yetkisiz', status: 403 };
  const admin = adminClient();
  const { data: prof, error: pErr } = await admin.from('users').select('organization_id, role, is_org_admin').eq('id', me.user.id).maybeSingle();
  if (pErr) return { error: 'Sunucu veritabanına bağlanamadı. Vercel\'deki SUPABASE_SERVICE_ROLE_KEY değerini kontrol edin. (' + pErr.message + ')', status: 500 };
  if (!prof) return { error: 'Kullanıcı profili bulunamadı', status: 403 };
  const wanted = (request.headers.get('x-org-id') || '').trim();
  if (prof.role === 'super_admin') {
    const orgId = wanted || prof.organization_id;
    if (!orgId) return { error: 'Üst menüden bir kurum seçin.', status: 400 };
    const { data: org } = await admin.from('organizations').select('id').eq('id', orgId).maybeSingle();
    if (!org) return { error: 'Seçilen kurum bulunamadı. Üst menüden kurumu yeniden seçin.', status: 400 };
    return { orgId, userId: me.user.id, isAdmin: true };
  }
  if (!prof.organization_id) return { error: 'Kullanıcınız bir kuruma bağlı değil.', status: 403 };
  return { orgId: prof.organization_id, userId: me.user.id, isAdmin: ['admin', 'manager'].includes(prof.role) || !!prof.is_org_admin };
}

// ------------------------------ Token ------------------------------
async function tokenRequest(params: Record<string, string>) {
  const e = parasutEnv();
  const body = new URLSearchParams({ client_id: e.clientId, client_secret: e.clientSecret, redirect_uri: REDIRECT_URI, ...params });
  const r = await fetch(`${API}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Paraşüt yetkilendirme hatası (${r.status}): ${j.error_description || j.error || 'bilinmeyen'}`);
  return { access_token: j.access_token as string, refresh_token: j.refresh_token as string, expires_at: new Date(Date.now() + (Number(j.expires_in) || 7200) * 1000 - 60_000).toISOString() };
}
export const exchangeCode = (code: string) => tokenRequest({ grant_type: 'authorization_code', code: code.trim() });
export const exchangePassword = (username: string, password: string) => tokenRequest({ grant_type: 'password', username: username.trim(), password });

export interface Conn { organization_id: string; company_id: string | null; access_token: string; refresh_token: string; expires_at: string; sync_from?: string }

/** Süresi dolmuşsa yeniler ve kaydeder */
export async function freshToken(admin: SupabaseClient, c: Conn): Promise<string> {
  if (c.access_token && new Date(c.expires_at).getTime() > Date.now()) return c.access_token;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: c.refresh_token });
  await admin.from('parasut_connections').update(t).eq('organization_id', c.organization_id);
  Object.assign(c, t);
  return t.access_token;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export async function api(admin: SupabaseClient, c: Conn, path: string, query: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams(query).toString();
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = await freshToken(admin, c);
    const r = await fetch(`${API}/v4${path}${qs ? '?' + qs : ''}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue; }               // hız sınırı
    if (r.status === 401 && attempt === 0) { c.expires_at = new Date(0).toISOString(); continue; }   // token iptal → yenile
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Paraşüt API ${r.status} ${path}: ${j?.errors?.[0]?.detail || j?.errors?.[0]?.title || j?.error || 'hata'}`);
    return j;
  }
  throw new Error('Paraşüt hız sınırı aşıldı, biraz sonra tekrar deneyin.');
}

/** Kullanıcının erişebildiği Paraşüt firmaları */
export async function listCompanies(admin: SupabaseClient, c: Conn) {
  const j = await api(admin, c, '/me', { include: 'companies' });
  const inc = (j.included || []).filter((x: any) => x.type === 'companies');
  return inc.map((x: any) => ({ id: String(x.id), name: x.attributes?.name || x.attributes?.legal_name || `Firma ${x.id}` }));
}

// ------------------------------ Eşitleme ------------------------------
type Kind = 'sales_invoice' | 'purchase_bill' | 'salary' | 'tax' | 'bank_fee';
const SOURCES: { kind: Kind; path: string; include: string; contactRel?: string; keep: (t?: string) => number }[] = [
  { kind: 'sales_invoice', path: 'sales_invoices', include: 'contact', contactRel: 'contact', keep: t => (t === 'refund' ? -1 : ['invoice', 'export', 'recurring_invoice', undefined, null, ''].includes(t as any) ? 1 : 0) },
  { kind: 'purchase_bill', path: 'purchase_bills', include: 'supplier,category', contactRel: 'supplier', keep: t => (t === 'refund' ? -1 : ['cancelled', 'canceled', 'estimate'].includes(String(t)) ? 0 : 1) },   // gider faturasının tüm türleri (e-fatura, gider pusulası vb.)
  { kind: 'salary', path: 'salaries', include: 'employee,category', contactRel: 'employee', keep: () => 1 },
  { kind: 'tax', path: 'taxes', include: 'category', keep: () => 1 },
  { kind: 'bank_fee', path: 'bank_fees', include: 'category', keep: () => 1 },
];
const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));

export async function syncOrg(admin: SupabaseClient, orgId: string, fromOverride?: string) {
  const { data: c } = await admin.from('parasut_connections').select('*').eq('organization_id', orgId).maybeSingle();
  if (!c?.refresh_token) throw new Error('Paraşüt bağlı değil.');
  if (!c.company_id) throw new Error('Paraşüt firması seçilmemiş.');
  const from = fromOverride || c.sync_from;
  const started = Date.now();
  const result: Record<string, any> = { from, counts: {} as Record<string, number>, errors: [] as string[] };

  // Müşteri eşleştirmesi için VKN ve normalize ad haritası
  const { data: custs } = await admin.from('customers').select('id, name, tax_number, merged_into').eq('organization_id', orgId);
  const byTax = new Map<string, string>(), byName = new Map<string, string>();
  (custs || []).filter((x: any) => !x.merged_into).forEach((x: any) => {
    const t = String(x.tax_number || '').replace(/\D/g, ''); if (t) byTax.set(t, x.id);
    const n = normalizeName(x.name); if (n) byName.set(n, x.id);
  });

  for (const src of SOURCES) {
    let page = 1, n = 0, done = false;
    try {
      while (!done && page <= 200 && Date.now() - started < 240_000) {
        const j = await api(admin, c, `/${c.company_id}/${src.path}`, { sort: '-issue_date', 'page[size]': '25', 'page[number]': String(page), include: src.include });
        const inc = new Map<string, any>((j.included || []).map((x: any) => [`${x.type}:${x.id}`, x]));
        const rows: any[] = [];
        for (const d of j.data || []) {
          const a = d.attributes || {};
          const issue = String(a.issue_date || '').slice(0, 10);
          if (issue && issue < from) { done = true; break; }
          const sign = src.keep(a.item_type);
          if (!sign) { const k = `${src.kind}:${a.item_type}`; result.skipped_types = { ...(result.skipped_types || {}), [k]: ((result.skipped_types || {})[k] || 0) + 1 }; continue; }
          const relRef = src.contactRel ? d.relationships?.[src.contactRel]?.data : null;
          const contact = relRef ? inc.get(`${relRef.type}:${relRef.id}`) : null;
          const catRef = d.relationships?.category?.data; const cat = catRef ? inc.get(`${catRef.type}:${catRef.id}`) : null;
          const tax = String(contact?.attributes?.tax_number || '').replace(/\D/g, '');
          const cur = a.currency === 'TRL' || !a.currency ? 'TRY' : a.currency;
          const rate = num(a.exchange_rate) || 1;
          const net = num(a.net_total ?? a.net_amount ?? a.total ?? a.amount);
          rows.push({
            organization_id: orgId, kind: src.kind, parasut_id: String(d.id),
            doc_no: [a.invoice_series, a.invoice_id ?? a.invoice_no].filter(Boolean).join('') || a.invoice_no || null,
            description: a.description || null, item_type: a.item_type || null, issue_date: issue || null, due_date: String(a.due_date || '').slice(0, 10) || null,
            contact_parasut_id: relRef?.id ? String(relRef.id) : null, contact_name: contact?.attributes?.name || null, tax_number: tax || null,
            category: cat?.attributes?.name || null, currency: cur, exchange_rate: rate,
            net_total: net === null ? null : sign * net, vat_total: num(a.total_vat) === null ? null : sign * Number(a.total_vat),
            gross_total: num(a.gross_total ?? a.total) === null ? null : sign * Number(a.gross_total ?? a.total),
            net_total_try: net === null ? null : sign * net * (cur === 'TRY' ? 1 : rate),
            remaining: num(a.remaining_in_trl ?? a.remaining), payment_status: a.payment_status || null, synced_at: new Date().toISOString(),
          });
        }
        if (rows.length) {
          const { error } = await admin.from('parasut_documents').upsert(rows, { onConflict: 'organization_id,kind,parasut_id' });
          if (error) throw new Error('Kayıt hatası: ' + error.message);
          n += rows.length;
        }
        const totalPages = Number(j.meta?.total_pages) || 1;
        if (page >= totalPages || !(j.data || []).length) done = true;
        page++;
        await sleep(250);
      }
    } catch (err: any) {
      // Maaş/vergi/banka masrafı uçları her Paraşüt hesabında listelenemiyor (404): sessizce atla
      if (src.kind !== 'sales_invoice' && src.kind !== 'purchase_bill' && /API 404/.test(err.message)) { result.skipped = [...(result.skipped || []), src.kind]; }
      else result.errors.push(`${src.path}: ${err.message}`);
    }
    result.counts[src.kind] = n;
  }
  // Müşteri eşleştirmesi: yalnızca henüz eşleşmemiş satış faturaları (elle yapılan eşleştirme korunur)
  try {
    const { data: un } = await admin.from('parasut_documents').select('id, tax_number, contact_name').eq('organization_id', orgId).eq('kind', 'sales_invoice').is('customer_id', null).limit(5000);
    const groups = new Map<string, string[]>();
    (un || []).forEach((d: any) => {
      const cid = byTax.get(String(d.tax_number || '')) || byName.get(normalizeName(d.contact_name));
      if (cid) groups.set(cid, [...(groups.get(cid) || []), d.id]);
    });
    let matched = 0;
    for (const [cid, ids] of groups) {
      for (let i = 0; i < ids.length; i += 200) { await admin.from('parasut_documents').update({ customer_id: cid }).in('id', ids.slice(i, i + 200)); }
      matched += ids.length;
    }
    result.matched = matched;
  } catch (err: any) { result.errors.push('eşleştirme: ' + err.message); }
  result.seconds = Math.round((Date.now() - started) / 1000);
  await admin.from('parasut_connections').update({ last_sync_at: new Date().toISOString(), last_sync: result }).eq('organization_id', orgId);
  return result;
}
