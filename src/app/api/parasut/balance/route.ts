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
      // Aynı firma Paraşüt'te birden fazla cari olarak açılmış olabilir (müşteri carisi + tedarikçi carisi): VKN ve ad ile ara, birleştir
      const seen = new Map<string, any>();
      const add = (j: any) => (j.data || []).forEach((x: any) => seen.set(String(x.id), x));
      if (tax) add(await find({ 'filter[tax_number]': tax }));
      const word = normalizeName((cu as any).name || '').split(' ').find(w => w.length >= 3) || '';
      for (const nm of [word, (cu as any).name, (cu as any).legal_name].filter(Boolean)) {
        try { add(await find({ 'filter[name]': String(nm).slice(0, 60) })); } catch { /* ad filtresi desteklenmezse geç */ }
      }
      const firstTok = word;
      contacts = Array.from(seen.values()).filter((x: any) => {
        const a = x.attributes || {}; const t = String(a.tax_number || '').replace(/\D/g, '');
        return (tax && t === tax) || (!!firstTok && normalizeName(a.name || '').split(' ').includes(firstTok)) || names.has(normalizeName(a.name || ''));
      }).slice(0, 5).map((x: any) => {
        const a = x.attributes || {};
        return { id: String(x.id), name: a.name, tax_number: a.tax_number || null, account_type: a.account_type || null, balance: a.balance ?? null, trl_balance: a.trl_balance ?? null,
          usd_balance: a.usd_balance ?? null, eur_balance: a.eur_balance ?? null, gbp_balance: a.gbp_balance ?? null };
      });
    } catch (e: any) { contactErr = e.message; }
  }
  const cids = new Set(contacts.map(c => c.id));

  // Bu carinin Paraşüt'teki TÜM açık faturaları (tarih sınırı yok), canlı
  const live: any[] = []; const liveErr: string[] = []; const recent: any[] = []; const raw: Record<string, number> = {}; const all: any[] = [];
  if (conn.company_id && contacts.length) {
    const kinds = [
      { kind: 'sales_invoice', path: 'sales_invoices', rel: 'contact', filter: 'filter[contact_id]' },
      { kind: 'purchase_bill', path: 'purchase_bills', rel: 'supplier', filter: 'filter[supplier_id]' },
    ];
    for (const c of contacts) for (const k of kinds) {
      try {
        for (let page = 1; page <= 4; page++) {
          const j = await api(admin, conn as any, `/${conn.company_id}/${k.path}`, { [k.filter]: c.id, include: `${k.rel},category`, sort: '-issue_date', 'page[size]': '25', 'page[number]': String(page) });
          raw[k.kind] = (raw[k.kind] || 0) + (j.data || []).length;
          const inc = new Map<string, any>((j.included || []).map((x: any) => [`${x.type}:${x.id}`, x]));
          for (const d of j.data || []) {
            const a = d.attributes || {};
            const relId = d.relationships?.[k.rel]?.data?.id;
            if (relId !== undefined && relId !== null && String(relId) !== c.id) continue;   // filtre desteklenmese de doğru cari
            const remRaw = a.remaining_in_trl ?? a.remaining;
            // Kalan alanı gelmezse ödenmemiş belgede toplam tutar açık sayılır
            const rem0 = remRaw != null ? Number(remRaw) || 0 : (a.payment_status && a.payment_status !== 'paid' ? Number(a.gross_total ?? a.total) || 0 : 0);
            if (recent.filter(r => r.contact_id === c.id && r.kind === k.kind).length < 8) recent.push({ contact_id: c.id, kind: k.kind, issue_date: String(a.issue_date || '').slice(0, 10), doc_no: [a.invoice_series, a.invoice_id ?? a.invoice_no].filter(Boolean).join('') || a.description || null, item_type: a.item_type || null, payment_status: a.payment_status || null, gross: Number(a.gross_total ?? a.total) || 0, remaining: rem0, currency: a.currency || null });
            if (['cancelled', 'canceled', 'estimate'].includes(String(a.item_type))) continue;
            {
              const cr = d.relationships?.category?.data; const cat = cr ? inc.get(`${cr.type}:${cr.id}`)?.attributes?.name : null;
              const cur = a.currency === 'TRL' || !a.currency ? 'TRY' : a.currency; const rate = Number(a.exchange_rate) || 1; const sg = a.item_type === 'refund' ? -1 : 1;
              const net = a.total_vat != null ? (Number(a.net_total ?? a.total) || 0) - Number(a.total_vat) : (Number(a.gross_total) || Number(a.net_total) || 0);   // KDV hariç
              all.push({ kind: k.kind, contact_id: c.id, issue_date: String(a.issue_date || '').slice(0, 10) || null, category: cat || null,
                net_try: sg * net * (cur === 'TRY' ? 1 : rate), open_try: a.payment_status === 'paid' ? 0 : Math.abs(rem0) });
            }
            const rem = rem0;
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
  return NextResponse.json({ connected: true, sync_from: conn.sync_from, contacts, contact_error: contactErr, live, recent, raw, all, live_ok: !!contacts.length && liveErr.length === 0, live_errors: liveErr, documents: [...(sales.data || []), ...myBills] });
}
