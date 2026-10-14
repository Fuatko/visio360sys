import { NextResponse } from 'next/server';
import { adminClient, api, callerOrg } from '@/lib/parasut-server';
import { normalizeName } from '@/lib/crm';

export const dynamic = 'force-dynamic';

// Bir müşterinin Paraşüt cari durumu: açık satış faturaları (alacak) + aynı VKN/unvanla alış faturaları (borç)
export async function GET(request: Request) {
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const id = new URL(request.url).searchParams.get('customer_id') || '';
  const admin = adminClient();
  const { data: cu } = await admin.from('customers').select('id, name, legal_name, tax_number').eq('id', id).eq('organization_id', who.orgId).maybeSingle();
  if (!cu) return NextResponse.json({ error: 'Müşteri bulunamadı' }, { status: 404 });
  const { data: conn } = await admin.from('parasut_connections').select('*').eq('organization_id', who.orgId).maybeSingle();
  if (!conn?.refresh_token) return NextResponse.json({ connected: false, documents: [] });

  const tax = String((cu as any).tax_number || '').replace(/\D/g, '');
  const names = new Set([normalizeName((cu as any).name || ''), normalizeName((cu as any).legal_name || '')].filter(Boolean));
  const [sales, bills] = await Promise.all([
    admin.from('parasut_documents').select('*').eq('organization_id', who.orgId).eq('kind', 'sales_invoice').eq('customer_id', id).limit(2000),
    admin.from('parasut_documents').select('*').eq('organization_id', who.orgId).eq('kind', 'purchase_bill').limit(5000),
  ]);
  // Paraşüt'teki cari kart(lar)ı ve Paraşüt'ün kendi hesapladığı bakiye (tüm geçmiş dahil, canlı)
  let contacts: any[] = []; let contactErr: string | null = null;
  if (conn.company_id) {
    try {
      const find = (f: Record<string, string>) => api(admin, conn as any, `/${conn.company_id}/contacts`, { 'page[size]': '10', ...f });
      let j: any = tax ? await find({ 'filter[tax_number]': tax }) : { data: [] };
      // VKN ile bulunamazsa unvan / kısa adla dene
      for (const nm of [(cu as any).legal_name, (cu as any).name].filter(Boolean)) {
        if ((j.data || []).length) break;
        j = await find({ 'filter[name]': String(nm).slice(0, 60) });
      }
      contacts = (j.data || []).map((x: any) => {
        const a = x.attributes || {};
        return { id: String(x.id), name: a.name, account_type: a.account_type || null, balance: a.balance ?? null, trl_balance: a.trl_balance ?? null,
          usd_balance: a.usd_balance ?? null, eur_balance: a.eur_balance ?? null, gbp_balance: a.gbp_balance ?? null };
      });
    } catch (e: any) { contactErr = e.message; }
  }
  const cids = new Set(contacts.map(c => c.id));

  // Bu carinin Paraşüt'teki TÜM açık faturaları (tarih sınırı yok), canlı
  const live: any[] = []; const liveErr: string[] = [];
  if (conn.company_id && contacts.length) {
    const kinds = [
      { kind: 'sales_invoice', path: 'sales_invoices', rel: 'contact', filter: 'filter[contact_id]' },
      { kind: 'purchase_bill', path: 'purchase_bills', rel: 'supplier', filter: 'filter[supplier_id]' },
    ];
    for (const c of contacts.slice(0, 3)) for (const k of kinds) {
      try {
        for (let page = 1; page <= 4; page++) {
          const j = await api(admin, conn as any, `/${conn.company_id}/${k.path}`, { [k.filter]: c.id, sort: '-issue_date', 'page[size]': '25', 'page[number]': String(page) });
          for (const d of j.data || []) {
            const a = d.attributes || {};
            if (String(d.relationships?.[k.rel]?.data?.id || '') !== c.id) continue;      // filtre desteklenmese de doğru cari
            if (['cancelled', 'canceled', 'estimate'].includes(String(a.item_type))) continue;
            const rem = Number(a.remaining_in_trl ?? a.remaining) || 0;
            if (a.payment_status === 'paid' || Math.abs(rem) < 0.5) continue;
            live.push({ id: `live-${k.kind}-${d.id}`, kind: k.kind, doc_no: [a.invoice_series, a.invoice_id ?? a.invoice_no].filter(Boolean).join('') || a.invoice_no || a.description || null,
              issue_date: String(a.issue_date || '').slice(0, 10) || null, due_date: String(a.due_date || '').slice(0, 10) || null, item_type: a.item_type || null,
              contact_name: c.name, remaining: Math.abs(rem), net_total_try: a.item_type === 'refund' ? -1 : 1, payment_status: a.payment_status || null });
          }
          if (page >= (Number(j.meta?.total_pages) || 1)) break;
        }
      } catch (e: any) { liveErr.push(`${k.path}: ${e.message}`); }
    }
  }
  const myBills = (bills.data || []).filter((d: any) => (d.contact_parasut_id && cids.has(String(d.contact_parasut_id))) || (tax && String(d.tax_number || '') === tax) || (names.has(normalizeName(d.contact_name || '')) && (!tax || !d.tax_number)));
  return NextResponse.json({ connected: true, sync_from: conn.sync_from, contacts, contact_error: contactErr, live: live, live_ok: !!contacts.length && liveErr.length === 0, live_errors: liveErr, documents: [...(sales.data || []), ...myBills] });
}
