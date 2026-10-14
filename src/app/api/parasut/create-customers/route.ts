import { NextResponse } from 'next/server';
import { adminClient, api, callerOrg } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Eşleşmeyen Paraşüt carilerinden müşteri kartı oluşturur ve faturalarını bağlar.
 * Cari bilgileri (unvan, VKN, vergi dairesi, il/ilçe, adres, e-posta, telefon) Paraşüt'ten okunur.
 * Aynı VKN ile zaten bir müşteri varsa yeni kart açılmaz, faturalar o karta bağlanır.
 */
export async function POST(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const body = await request.json().catch(() => ({}));
  const groups: { contact_parasut_id?: string; name?: string; tax?: string; ids: string[] }[] = Array.isArray(body.groups) ? body.groups.slice(0, 200) : [];
  if (!groups.length) return NextResponse.json({ error: 'Cari seçilmedi' }, { status: 400 });

  const admin = adminClient();
  const { data: conn } = await admin.from('parasut_connections').select('*').eq('organization_id', who.orgId).maybeSingle();
  const { data: existing } = await admin.from('customers').select('id, tax_number').eq('organization_id', who.orgId);
  const byTax = new Map<string, string>();
  (existing || []).forEach((c: any) => { const t = String(c.tax_number || '').replace(/\D/g, ''); if (t) byTax.set(t, c.id); });

  let created = 0, linked = 0;
  const errors: string[] = [];
  for (const g of groups) {
    try {
      // Paraşüt'ten cari kartını oku (okunamazsa faturadaki ad/VKN ile devam)
      let a: any = {};
      if (conn?.company_id && g.contact_parasut_id) {
        try { a = (await api(admin, conn, `/${conn.company_id}/contacts/${g.contact_parasut_id}`)).data?.attributes || {}; } catch { a = {}; }
      }
      const name = String(a.name || g.name || '').trim();
      if (!name) { errors.push('Adı olmayan cari atlandı'); continue; }
      const tax = String(a.tax_number || g.tax || '').replace(/\D/g, '');

      let cid = tax ? byTax.get(tax) : undefined;
      if (!cid) {
        const full: any = {
          organization_id: who.orgId, name: a.short_name || name, legal_name: name, status: 'Aktif', customer_type: 'end_customer',
          tax_number: tax || null, tax_office: a.tax_office || null, city: a.city || null, district: a.district || null,
          address: a.address || null, email: a.email || null, phone: a.phone || null,
          notes: 'Paraşüt carisinden oluşturuldu',
        };
        let ins = await admin.from('customers').insert(full).select('id').single();
        if (ins.error && /column/i.test(ins.error.message)) {
          // CRM alanları henüz kurulmamışsa temel alanlarla dene
          ins = await admin.from('customers').insert({ organization_id: who.orgId, name, status: 'Aktif', email: full.email, phone: full.phone, address: full.address, notes: full.notes }).select('id').single();
        }
        if (ins.error) throw new Error(ins.error.message);
        cid = ins.data.id as string;
        if (tax) byTax.set(tax, cid);
        created++;
      }
      const ids = (g.ids || []).slice(0, 1000);
      if (ids.length) {
        const { error } = await admin.from('parasut_documents').update({ customer_id: cid }).in('id', ids).eq('organization_id', who.orgId).eq('kind', 'sales_invoice');
        if (error) throw new Error(error.message);
        linked += ids.length;
      }
    } catch (e: any) { errors.push(`${g.name || 'cari'}: ${e.message}`); }
  }
  return NextResponse.json({ ok: true, created, linked, errors });
}
