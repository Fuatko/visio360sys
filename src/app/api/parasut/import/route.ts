import { NextResponse } from 'next/server';
import { adminClient, api, callerOrg } from '@/lib/parasut-server';
import { normalizeName } from '@/lib/crm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Gider carisi sayılan kategoriler (kira, yemek, yakıt vb.) — bunlar firmaya rol vermez
const EXPENSE = /(yemek|yak[ıi]t|konaklama|u[çc]u[şs]|spor|kira|ara[çc]|ofis|k[ıi]rtasiye|telefon|internet|elektrik|su |do[ğg]algaz|aidat|vergi|sgk|maa[şs]|banka|muhasebe|kargo|otopark|ula[şs][ıi]m|seyahat|e[ğg]lence|temizlik)/i;

/** Paraşüt carileri + hareket özetleri + yazılımdaki karşılıkları + önerilen atama */
export async function GET(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const admin = adminClient();
  const { data: conn } = await admin.from('parasut_connections').select('*').eq('organization_id', who.orgId).maybeSingle();
  if (!conn?.refresh_token || !conn.company_id) return NextResponse.json({ error: 'Paraşüt bağlı değil.' }, { status: 400 });

  // 1) Paraşüt'teki tüm cariler
  const contacts: any[] = [];
  for (let page = 1; page <= 60; page++) {
    const j = await api(admin, conn as any, `/${conn.company_id}/contacts`, { 'page[size]': '25', 'page[number]': String(page), sort: 'name' });
    for (const x of j.data || []) {
      const a = x.attributes || {};
      if (a.archived) continue;
      contacts.push({ id: String(x.id), name: a.name, short_name: a.short_name || null, tax_number: String(a.tax_number || '').replace(/\D/g, '') || null, tax_office: a.tax_office || null,
        city: a.city || null, district: a.district || null, address: a.address || null, email: a.email || null, phone: a.phone || null,
        account_type: a.account_type || null, contact_type: a.contact_type || null, balance: Number(a.trl_balance ?? a.balance) || 0 });
    }
    if (page >= (Number(j.meta?.total_pages) || 1)) break;
  }

  // 2) Eşitlenmiş belgelerden hareket özeti
  const { data: docs } = await admin.from('parasut_documents').select('kind, contact_parasut_id, contact_name, tax_number, issue_date, net_total_try, category')
    .eq('organization_id', who.orgId).in('kind', ['sales_invoice', 'purchase_bill']).limit(10000);
  const act = new Map<string, any>();
  (docs || []).forEach((d: any) => {
    const k = d.contact_parasut_id ? String(d.contact_parasut_id) : null; if (!k) return;
    const s = act.get(k) || { sales: 0, ns: 0, buys: 0, nb: 0, last: null as string | null, buyCats: {} as Record<string, number>, saleCats: {} as Record<string, number> };
    const v = Number(d.net_total_try) || 0;
    if (d.kind === 'sales_invoice') { s.sales += v; s.ns++; s.saleCats[d.category || 'Kategorisiz'] = (s.saleCats[d.category || 'Kategorisiz'] || 0) + v; }
    else { s.buys += v; s.nb++; s.buyCats[d.category || 'Kategorisiz'] = (s.buyCats[d.category || 'Kategorisiz'] || 0) + v; }
    if (!s.last || String(d.issue_date) > s.last) s.last = d.issue_date;
    act.set(k, s);
  });

  // 3) Yazılımdaki mevcut kayıtlar
  const [cu, su, team] = await Promise.all([
    admin.from('customers').select('*').eq('organization_id', who.orgId),
    admin.from('suppliers').select('id, name, tax_no').eq('organization_id', who.orgId),
    admin.from('sales_team').select('id, name').eq('organization_id', who.orgId).order('name'),
  ]);
  const customers = (cu.data || []).filter((c: any) => !c.merged_into);
  const rolesReady = customers.length === 0 ? !(await admin.from('customers').select('relation_roles').limit(1)).error : 'relation_roles' in (customers[0] || {});
  const findCust = (c: any) => customers.find((x: any) => (c.tax_number && String(x.tax_number || '').replace(/\D/g, '') === c.tax_number) || normalizeName(x.name) === normalizeName(c.name) || (x.legal_name && normalizeName(x.legal_name) === normalizeName(c.name)));
  const findSup = (c: any) => (su.data || []).find((x: any) => (c.tax_number && String(x.tax_no || '').replace(/\D/g, '') === c.tax_number) || normalizeName(x.name) === normalizeName(c.name));

  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const rows = contacts.map(c => {
    const s = act.get(c.id) || { sales: 0, ns: 0, buys: 0, nb: 0, last: null, buyCats: {}, saleCats: {} };
    const ex = findCust(c); const sup = findSup(c);
    const bizBuy = Object.entries(s.buyCats).filter(([k]) => !EXPENSE.test(k)).reduce((a, [, v]) => a + (v as number), 0);
    const roles: string[] = [];
    if (s.ns) roles.push(s.buys && bizBuy ? 'partner' : 'customer');
    if (bizBuy > 0) roles.push('principal');
    else if (s.nb) roles.push('supplier');
    const expenseOnly = !s.ns && s.nb > 0 && bizBuy === 0;
    const active = !!s.last && s.last >= yearAgo;
    const reason = expenseOnly ? 'Yalnızca gider faturası (' + Object.keys(s.buyCats).join(', ') + ')'
      : s.ns && bizBuy ? 'Hem satış yapıyorsunuz hem iş alışı var' : s.ns ? 'Satış faturası var' : bizBuy ? 'İş alışı var (' + Object.keys(s.buyCats).filter(k => !EXPENSE.test(k)).join(', ') + ')' : 'Bu dönemde hareket yok';
    return {
      ...c, activity: { sales: s.sales, ns: s.ns, buys: s.buys, nb: s.nb, last: s.last, saleCats: s.saleCats, buyCats: s.buyCats },
      existing: ex ? { id: ex.id, name: ex.name, roles: ex.relation_roles || [], status: ex.status } : null, supplier: sup ? { id: sup.id, name: sup.name } : null,
      suggest: { import: !expenseOnly && (s.ns > 0 || bizBuy > 0), roles: Array.from(new Set([...(ex?.relation_roles || []), ...roles])), status: active ? (s.sales > 0 ? 'Aktif' : 'Aktif') : (s.ns || s.nb ? 'Pasif' : 'Potansiyel'), reason },
    };
  }).sort((a, b) => (b.activity.sales + b.activity.buys) - (a.activity.sales + a.activity.buys));

  return NextResponse.json({ rows, roles_ready: rolesReady, team: team.error ? [] : team.data || [], sync_from: conn.sync_from });
}

/** Seçilen carileri müşteri kartı / ana firma olarak oluştur veya güncelle, faturalarını bağla */
export async function POST(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const b = await request.json().catch(() => ({}));
  const items: any[] = Array.isArray(b.items) ? b.items.slice(0, 1000) : [];
  const owner: string | null = b.assigned_to || null;
  const admin = adminClient();
  const probe = await admin.from('customers').select('relation_roles').limit(1);
  const rolesReady = !probe.error;
  const sp = await admin.from('customers').select('supplier_id').limit(1);
  const supLinkReady = !sp.error;

  let created = 0, updated = 0, principals = 0, linked = 0; const errors: string[] = [];
  for (const it of items) {
    try {
      const c = it.contact || {};
      const roles: string[] = Array.isArray(it.roles) ? it.roles : [];
      const isCompany = c.contact_type !== 'person';
      const base: any = {
        legal_name: c.name, tax_number: c.tax_number || null, tax_office: c.tax_office || null, city: c.city || null, district: c.district || null,
        email: c.email || null, phone: c.phone || null, address: c.address || null,
      };
      let id: string = it.existing_id || '';
      if (id) {
        // Mevcut kartta yalnızca boş alanları doldur, rolleri birleştir
        const { data: cur } = await admin.from('customers').select('*').eq('id', id).eq('organization_id', who.orgId).maybeSingle();
        if (!cur) throw new Error('Kart bulunamadı');
        const patch: any = {};
        Object.entries(base).forEach(([k, v]) => { if (v && !(cur as any)[k] && k in (cur as any)) patch[k] = v; });
        if (rolesReady) patch.relation_roles = Array.from(new Set([...((cur as any).relation_roles || []), ...roles]));
        if (it.status && (cur as any).status !== 'VIP') patch.status = it.status;
        if (owner && !(cur as any).assigned_to) patch.assigned_to = owner;
        if (Object.keys(patch).length) {
          let { error } = await admin.from('customers').update(patch).eq('id', id);
          if (error && /check|status/i.test(error.message)) { delete patch.status; ({ error } = await admin.from('customers').update(patch).eq('id', id)); }
          if (error) throw new Error(error.message);
        }
        updated++;
      } else {
        const row: any = { organization_id: who.orgId, name: c.short_name || c.name, status: it.status || 'Aktif', customer_type: 'end_customer', assigned_to: owner,
          notes: `Paraşüt'ten aktarıldı${isCompany ? '' : ' (şahıs)'}`, ...base };
        if (rolesReady) row.relation_roles = roles;
        let ins = await admin.from('customers').insert(row).select('id').single();
        if (ins.error && /column/i.test(ins.error.message)) {
          ins = await admin.from('customers').insert({ organization_id: who.orgId, name: row.name, status: row.status, email: row.email, phone: row.phone, address: row.address, notes: row.notes, assigned_to: owner }).select('id').single();
        }
        if (ins.error && /check|status/i.test(ins.error.message)) {
          // Durum değeri kabul edilmezse varsayılan durumla dene
          ins = await admin.from('customers').insert({ ...row, status: 'Aktif' }).select('id').single();
        }
        if (ins.error) throw new Error(ins.error.message);
        id = ins.data.id; created++;
      }
      // Ana firma → Ana Firmalarım kaydı
      if (roles.includes('principal')) {
        let sid = it.supplier_id || null;
        if (!sid) {
          const { data: s, error } = await admin.from('suppliers').insert({ organization_id: who.orgId, name: c.short_name || c.name, tax_no: c.tax_number || null, model: roles.includes('partner') ? 'mixed' : 'reseller', is_active: true, contact_email: c.email || null, contact_phone: c.phone || null }).select('id').single();
          if (!error) { sid = s.id; principals++; }
        }
        if (sid && supLinkReady) await admin.from('customers').update({ supplier_id: sid }).eq('id', id);
      }
      // Bu carinin satış faturalarını karta bağla (elle yapılmış eşleşmeye dokunma)
      const { data: up } = await admin.from('parasut_documents').update({ customer_id: id }).eq('organization_id', who.orgId).eq('kind', 'sales_invoice').eq('contact_parasut_id', c.id).is('customer_id', null).select('id');
      linked += (up || []).length;
      // Kartta toplam satış (KDV hariç, eşitlenen dönem)
      const { data: tot } = await admin.from('parasut_documents').select('net_total_try').eq('organization_id', who.orgId).eq('kind', 'sales_invoice').eq('customer_id', id);
      const ts = (tot || []).reduce((a: number, d: any) => a + (Number(d.net_total_try) || 0), 0);
      if (ts) await admin.from('customers').update({ total_sales: Math.round(ts) }).eq('id', id);
    } catch (e: any) { errors.push(`${it.contact?.name || 'cari'}: ${e.message}`); }
  }
  return NextResponse.json({ ok: true, created, updated, principals, linked, errors });
}
