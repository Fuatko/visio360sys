import { NextResponse } from 'next/server';
import { adminClient, api, callerOrg } from '@/lib/parasut-server';
import { normalizeName } from '@/lib/crm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Bilinmeyen sütun hatasında o sütunu atıp yeniden dener (kurulum farklarına dayanıklı) */
async function insertFlexible(admin: any, table: string, row: any, select = 'id') {
  const r = { ...row };
  for (let i = 0; i < 8; i++) {
    const res = await admin.from(table).insert(r).select(select).single();
    if (!res.error) return res;
    const m = /column "?([a-z_]+)"? .*does not exist|Could not find the '([a-z_]+)' column/i.exec(res.error.message);
    const col = m?.[1] || m?.[2];
    if (!col || !(col in r)) return res;
    delete r[col];
  }
  return { data: null, error: { message: 'Kayıt oluşturulamadı' } };
}

export async function POST(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const b = await request.json().catch(() => ({}));
  const admin = adminClient();
  const orgId = who.orgId;

  // ------------------------- Ürün kataloğu -------------------------
  if (b.action === 'products') {
    const { data: conn } = await admin.from('parasut_connections').select('*').eq('organization_id', orgId).maybeSingle();
    if (!conn?.refresh_token || !conn.company_id) return NextResponse.json({ error: 'Paraşüt bağlı değil.' }, { status: 400 });
    const items: any[] = [];
    for (let page = 1; page <= 40; page++) {
      const j = await api(admin, conn as any, `/${conn.company_id}/products`, { 'page[size]': '25', 'page[number]': String(page), include: 'category' });
      const inc = new Map<string, any>((j.included || []).map((x: any) => [`${x.type}:${x.id}`, x]));
      for (const x of j.data || []) {
        const a = x.attributes || {}; const cr = x.relationships?.category?.data; const cat = cr ? inc.get(`${cr.type}:${cr.id}`)?.attributes?.name : null;
        items.push({ pid: String(x.id), name: a.name, code: a.code || null, unit: a.unit || null, price: num(a.list_price) ?? 0, cost: num(a.buying_price),
          currency: a.currency === 'TRL' || !a.currency ? 'TRY' : a.currency, vat: num(a.vat_rate) ?? 20, archived: !!a.archived, category: cat || null });
      }
      if (page >= (Number(j.meta?.total_pages) || 1)) break;
    }
    const { data: existing } = await admin.from('products').select('*').eq('organization_id', orgId);
    let created = 0, updated = 0; const errors: string[] = [];
    for (const it of items) {
      if (!it.name) continue;
      const ex = (existing || []).find((p: any) => (p.parasut_product_id && p.parasut_product_id === it.pid) || (it.code && p.code === it.code) || normalizeName(p.name) === normalizeName(it.name));
      const row: any = { name: it.name, code: it.code, unit: it.unit || 'adet', price: it.price, currency: it.currency, tax_rate: it.vat, status: it.archived ? 'inactive' : 'active', category: it.category, cost_price: it.cost, parasut_product_id: it.pid };
      if (ex) {
        const patch: any = { parasut_product_id: it.pid };
        Object.entries(row).forEach(([k, v]) => { if (v !== null && v !== '' && (ex[k] === null || ex[k] === undefined || ex[k] === '' || ex[k] === 0) && k in ex) patch[k] = v; });
        let { error } = await admin.from('products').update(patch).eq('id', ex.id);
        if (error) { delete patch.parasut_product_id; ({ error } = await admin.from('products').update(patch).eq('id', ex.id)); }
        if (error) errors.push(`${it.name}: ${error.message}`); else updated++;
      } else {
        const r = await insertFlexible(admin, 'products', { organization_id: orgId, ...row });
        if (r.error) errors.push(`${it.name}: ${r.error.message}`); else created++;
      }
    }
    return NextResponse.json({ ok: true, found: items.length, created, updated, errors: errors.slice(0, 20) });
  }

  // ------------------- Faturadan sipariş oluştur -------------------
  if (b.action === 'orders') {
    let q = admin.from('parasut_documents').select('*').eq('organization_id', orgId).eq('kind', 'sales_invoice').not('customer_id', 'is', null).is('order_id', null).gt('net_total_try', 0).order('issue_date');
    if (Array.isArray(b.ids) && b.ids.length) q = q.in('id', b.ids.slice(0, 500));
    const { data: docs, error: dErr } = await q.limit(500);
    if (dErr) return NextResponse.json({ error: /order_id/.test(dErr.message) ? 'parasut-mutabakat.sql dosyası Supabase\'de çalıştırılmamış.' : dErr.message }, { status: 400 });
    const ids = (docs || []).map((d: any) => d.id);
    const { data: lines } = ids.length ? await admin.from('parasut_document_lines').select('*').in('document_id', ids) : { data: [] as any[] };
    const { data: custs } = await admin.from('customers').select('id, assigned_to').eq('organization_id', orgId);
    const owner = new Map<string, string | null>((custs || []).map((c: any) => [c.id, c.assigned_to]));
    const { data: prods0 } = await admin.from('products').select('*').eq('organization_id', orgId);
    const prods: any[] = prods0 || [];

    const productFor = async (l: any, category: string | null) => {
      const name = l?.product_name || (category ? `${category} (Paraşüt)` : 'Hizmet (Paraşüt)');
      let p = prods.find(x => (l?.product_parasut_id && x.parasut_product_id === l.product_parasut_id) || (l?.product_code && x.code === l.product_code) || normalizeName(x.name) === normalizeName(name));
      if (p) return p.id;
      const r = await insertFlexible(admin, 'products', { organization_id: orgId, name, code: l?.product_code || null, unit: 'adet', price: Number(l?.unit_price) || 0, currency: 'TRY', tax_rate: Number(l?.vat_rate) || 20, status: 'active', category, parasut_product_id: l?.product_parasut_id || null }, '*');
      if (r.error) return null;
      prods.push(r.data); return r.data.id;
    };

    let created = 0, items = 0; const errors: string[] = [];
    for (const d of docs || []) {
      try {
        const rate = d.currency && d.currency !== 'TRY' ? Number(d.exchange_rate) || 1 : 1;
        const gross = d.gross_total != null ? Number(d.gross_total) * rate : Number(d.net_total_try) * 1.2;
        const o = await insertFlexible(admin, 'orders', {
          organization_id: orgId, order_number: `P-${d.doc_no || String(d.parasut_id)}`, customer_id: d.customer_id, status: 'delivered',
          order_date: d.issue_date, delivery_date: d.issue_date, subtotal: Number(d.net_total_try), tax_total: Math.round((gross - Number(d.net_total_try)) * 100) / 100,
          discount: 0, total: Math.round(gross * 100) / 100, currency: 'TRY', exchange_rate: 1, sales_person_id: owner.get(d.customer_id) || null,
          notes: `Paraşüt faturası ${d.doc_no || ''}'den oluşturuldu${d.category ? ' · ' + d.category : ''}`, parasut_document_id: d.id,
        });
        if (o.error) throw new Error(o.error.message);
        const ls = (lines || []).filter((l: any) => l.document_id === d.id);
        const src = ls.length ? ls : [{ product_name: null, description: d.description || d.category || 'Hizmet', quantity: 1, unit_price: Number(d.net_total_try), vat_rate: 20, net_total_try: Number(d.net_total_try) }];
        for (const l of src) {
          const pid = await productFor(l, d.category || null);
          const qty = Number(l.quantity) || 1; const net = Number(l.net_total_try ?? (qty * Number(l.unit_price))) || 0;
          const r = await insertFlexible(admin, 'order_items', { organization_id: orgId, order_id: o.data.id, product_id: pid, description: l.description || l.product_name || null,
            quantity: qty, unit_price: Math.round((net / qty) * 100) / 100, discount: 0, tax_rate: Number(l.vat_rate) || 20, total: Math.round(net * 100) / 100 });
          if (!r.error) items++;
        }
        await admin.from('parasut_documents').update({ order_id: o.data.id, order_linked_at: new Date().toISOString(), order_linked_by: who.userId }).eq('id', d.id);
        created++;
      } catch (e: any) { errors.push(`${d.doc_no || d.id}: ${e.message}`); }
    }
    return NextResponse.json({ ok: true, created, items, errors: errors.slice(0, 20), remaining: Math.max(0, (docs || []).length - created - errors.length) });
  }

  return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 });
}
