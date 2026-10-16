// Beyaz alan / çapraz satış analizi
// Müşteri × kategori matrisi: kim neyi alıyor, kim neyi almıyor, kim eskiden alıp bıraktı, kime teklif verildi.
// Kaynak: Paraşüt satış faturaları (fatura kategorisi) — Paraşüt faturası olmayan müşterilerde yazılımdaki siparişler (ürün kategorisi).
// Öneri: benzer müşterilerin (aynı sektör, yoksa tüm aktif müşteriler) bu kategoriyi alma oranı × alanların ortalama yıllık alımı.

const n = (v: any) => Number(v) || 0;
const safe = async (q: any) => { try { const r = await q; return r.error ? [] : r.data || []; } catch { return []; } };
const day = (d: any) => String(d || '').slice(0, 10);

export const MARK_LABEL: Record<string, string> = {
  buying: 'Alıyor', opportunity: 'Fırsat', competitor: 'Rakipten alıyor', no_need: 'İhtiyaç yok', not_now: 'Şimdi değil',
};
export const UNCATEGORIZED = 'Kategorisiz';

export type WSCell = {
  rev12: number;            // son 12 ay KDV hariç
  revAll: number;           // tüm zamanlar
  last: string | null;      // son alım tarihi
  count: number;            // fatura / sipariş sayısı
  byYear: Record<number, number>;  // takvim yılı bazında KDV hariç
  products: string[];       // alınan ürün / hizmet adları
  quoted: { id: string; no: string; date: string } | null;  // son 12 ayda verilen, siparişe dönmemiş teklif
  supply?: { buy12: number; buyAll: number; count: number; last: string | null; resale12: number; resaleTo: string[] };  // bu firmadan bu kategoride alışlarımız (ana firma / tedarikçi)
};
export type WSState = 'buying' | 'supplier' | 'remapped' | 'lapsed' | 'quoted' | 'opportunity' | 'competitor' | 'no_need' | 'not_now' | 'suggested' | 'empty';
export type WSSuggestion = {
  customer_id: string; customer: string; assigned_to: string | null; offering: string;
  est: number; score: number; reason: string; state: WSState;
};
export type WSData = {
  ready: boolean;                       // SQL kurulmuş mu (işaretleme için)
  offerings: string[];                  // görünen kategoriler
  allOfferings: { name: string; hidden: boolean; merge_into: string | null; rev12: number; buyers: number }[];
  customers: any[];
  cells: Record<string, Record<string, WSCell>>;
  marks: Record<string, Record<string, any>>;
  stats: Record<string, { buyers: number; avg: number; penetration: number }>;
  unmatchedSupply: Record<string, { buy12: number; count: number; cats: string[] }>;  // satış kategorisine eşleşmeyen alışlar
  suggestions: WSSuggestion[];
  stateOf: (customerId: string, offering: string) => WSState;
};

const emptyCell = (): WSCell => ({ rev12: 0, revAll: 0, last: null, count: 0, byYear: {}, products: [], quoted: null });
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export async function loadWhitespace(supabase: any, opts: { customerId?: string } = {}): Promise<WSData> {
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const [custs, docs, prods, orders, quotes, marksRes, offRes] = await Promise.all([
    safe(supabase.from('customers').select('id, name, status, segment, sector, assigned_to, customer_type, merged_into, phone, is_key_account').order('name').limit(10000)),
    safe(supabase.from('parasut_documents').select('id, customer_id, doc_no, issue_date, net_total_try, category, contact_parasut_id').eq('kind', 'sales_invoice').not('customer_id', 'is', null).limit(10000)),
    safe(supabase.from('products').select('id, name, category').limit(10000)),
    safe(supabase.from('orders').select('id, customer_id, order_date, created_at, status, quote_id').neq('status', 'cancelled').limit(10000)),
    safe(supabase.from('quotes').select('id, customer_id, quote_number, revision, status, created_at, sent_at').gte('created_at', yearAgo).limit(5000)),
    supabase.from('whitespace_marks').select('*').limit(10000),
    safe(supabase.from('whitespace_offerings').select('*')),
  ]);
  const [buys, catMap, taxRows] = await Promise.all([
    safe(supabase.from('parasut_documents').select('id, customer_id, tax_number, contact_parasut_id, contact_name, issue_date, net_total_try, category').eq('kind', 'purchase_bill').limit(10000)),
    safe(supabase.from('parasut_category_map').select('purchase_category, business_line')),
    safe(supabase.from('customers').select('id, name, legal_name, tax_number, merged_into').limit(10000)),
  ]);
  const ready = !marksRes.error;

  // Kategori birleştirme / gizleme
  const offSet: Record<string, any> = {}; offRes.forEach((o: any) => { offSet[o.name] = o; });
  const canon = (raw: any) => { let k = String(raw || '').trim() || UNCATEGORIZED; for (let i = 0; i < 3 && offSet[k]?.merge_into; i++) k = offSet[k].merge_into; return k; };

  // Müşteri × kategori değerlendirmeleri; "remap": bu müşterideki X kategorisini Y olarak say (ör. SJ Lisesi HİZMET → Danışmanlık)
  const marks: Record<string, Record<string, any>> = {};
  (ready ? marksRes.data || [] : []).forEach((m: any) => { (marks[m.customer_id] ||= {})[m.offering] = m; });
  const remapOf = (cust: string, off: string) => { const m = marks[cust]?.[off]; return m?.status === 'remap' && m.remap_to ? canon(m.remap_to) : off; };

  const prodById = new Map<string, any>(prods.map((p: any) => [p.id, p]));
  const cells: Record<string, Record<string, WSCell>> = {};
  const cell = (c: string, o: string) => ((cells[c] ||= {})[remapOf(c, o)] ||= emptyCell());
  const addSale = (cust: string, off: string, date: string, amount: number, product?: string | null) => {
    const x = cell(cust, off);
    x.revAll += amount; if (date >= yearAgo) x.rev12 += amount;
    const y = Number(date.slice(0, 4)); if (y) x.byYear[y] = (x.byYear[y] || 0) + amount;
    x.count += 1; if (!x.last || date > x.last) x.last = date;
    if (product && !x.products.includes(product) && x.products.length < 12) x.products.push(product);
  };

  // 1) Paraşüt satış faturaları — fatura kategorisi esas
  const parasutCust = new Set<string>(docs.map((d: any) => String(d.customer_id)));
  const docOff = new Map<string, string>();
    // Fatura kalemleri (ürün adları + kategorisi boş faturalarda kategori tahmini için)
  const linesByDoc = new Map<string, string[]>();
  if (docs.length) {
    const ids = docs.map((d: any) => d.id);
    for (let i = 0; i < ids.length; i += 200) {
      const lines = await safe(supabase.from('parasut_document_lines').select('document_id, product_name, description').in('document_id', ids.slice(i, i + 200)));
      lines.forEach((l: any) => {
        const name = String(l.product_name || l.description || '').trim(); if (!name) return;
        (linesByDoc.get(l.document_id) || linesByDoc.set(l.document_id, []).get(l.document_id)!).push(name);
      });
    }
  }
  // Kategorisi boş faturada: kalem adı bilinen bir kategori adını içeriyorsa (ör. "Danışmanlık Hizmeti" → Danışmanlık) ya da katalogdaki ürünse o kategori
  const low = (v: string) => v.toLocaleLowerCase('tr-TR');
  const known = [...new Set<string>([...docs.filter((d: any) => String(d.category || '').trim()).map((d: any) => canon(d.category)), ...prods.filter((p: any) => p.category).map((p: any) => canon(p.category))])].filter(k => k !== UNCATEGORIZED);
  const prodByName = new Map<string, any>(prods.map((p: any) => [low(String(p.name || '')), p]));
  const infer = (docId: string) => {
    for (const t of linesByDoc.get(docId) || []) {
      const lt = low(t);
      const p = prodByName.get(lt); if (p?.category) return canon(p.category);
      const k = known.find(k => { const lk = low(k); const stem = lk.split(/\s+/)[0]; return lt.includes(lk) || (stem.length >= 5 && lt.includes(stem)); });
      if (k) return k;
    }
    return null;
  };
  docs.forEach((d: any) => {
    const off = String(d.category || '').trim() ? canon(d.category) : infer(d.id) || UNCATEGORIZED;
    docOff.set(d.id, off);
    if (n(d.net_total_try) > 0) addSale(d.customer_id, off, day(d.issue_date), n(d.net_total_try));
    (linesByDoc.get(d.id) || []).forEach(name => { const x = cell(d.customer_id, off); if (!x.products.includes(name) && x.products.length < 12) x.products.push(name); });
  });

  // 2) Paraşüt faturası olmayan müşterilerde yazılım siparişleri — ürün kategorisi esas
  const ownOrders = orders.filter((o: any) => o.customer_id && !parasutCust.has(String(o.customer_id)));
  const orderedQuotes = new Set<string>(orders.map((o: any) => o.quote_id).filter(Boolean));
  const ownById = new Map<string, any>(ownOrders.map((o: any) => [o.id, o]));
  if (ownOrders.length) {
    const ids = ownOrders.map((o: any) => o.id);
    for (let i = 0; i < ids.length; i += 150) {
      const its = await safe(supabase.from('order_items').select('order_id, product_id, quantity, unit_price, discount, total').in('order_id', ids.slice(i, i + 150)));
      its.forEach((it: any) => {
        const o = ownById.get(it.order_id); if (!o) return;
        const p = prodById.get(it.product_id);
        const amt = it.total != null ? n(it.total) : n(it.quantity) * n(it.unit_price) * (1 - n(it.discount) / 100);
        addSale(o.customer_id, canon(p?.category), day(o.order_date || o.created_at), amt, p?.name);
      });
    }
  }

  // 3) Son 12 ayda verilmiş, siparişe dönmemiş teklifler
  const openQuotes = quotes.filter((q: any) => q.customer_id && !['revised', 'rejected', 'cancelled', 'expired'].includes(q.status) && !orderedQuotes.has(q.id));
  const oqById = new Map<string, any>(openQuotes.map((q: any) => [q.id, q]));
  if (openQuotes.length) {
    const ids = openQuotes.map((q: any) => q.id);
    for (let i = 0; i < ids.length; i += 150) {
      const its = await safe(supabase.from('quote_items').select('quote_id, product_id').in('quote_id', ids.slice(i, i + 150)));
      its.forEach((it: any) => {
        const q = oqById.get(it.quote_id); const p = prodById.get(it.product_id); if (!q || !p) return;
        const x = cell(q.customer_id, canon(p.category));
        const date = day(q.sent_at || q.created_at);
        if (!x.quoted || date > x.quoted.date) x.quoted = { id: q.id, no: `${q.quote_number}${q.revision ? ` Rev.${q.revision}` : ''}`, date };
      });
    }
  }

  // Analize giren müşteriler: birleştirilmemiş, pasif olmayan; satışı olan veya aktif durumda olanlar
  const customers = custs.filter((c: any) => !c.merged_into && c.status !== 'Pasif' && (cells[c.id] || ['Aktif', 'VIP'].includes(c.status)));

  // Kategori listesi: veriden + aktif ürün kategorilerinden
  const offNames = new Set<string>();
  Object.values(cells).forEach(r => Object.keys(r).forEach(o => offNames.add(o)));
  prods.forEach((p: any) => { if (p.category) offNames.add(canon(p.category)); });
  Object.values(marks).forEach(r => Object.values(r).forEach((m: any) => {
    if (m.status === 'buying' || m.status === 'opportunity') offNames.add(canon(m.offering));
    if (m.status === 'remap') { offNames.add(m.offering); if (m.remap_to) offNames.add(canon(m.remap_to)); }
  }));
  const allOfferings = [...offNames, ...offRes.filter((o: any) => o.merge_into || o.hidden).map((o: any) => o.name)]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map(name => {
      const buyers = customers.filter((c: any) => n(cells[c.id]?.[name]?.rev12) > 0);
      return { name, hidden: !!offSet[name]?.hidden, merge_into: offSet[name]?.merge_into || null, rev12: buyers.reduce((a: number, c: any) => a + cells[c.id][name].rev12, 0), buyers: buyers.length };
    })
    .sort((a, b) => b.rev12 - a.rev12 || a.name.localeCompare(b.name, 'tr'));
  const offerings = allOfferings.filter(o => !o.hidden && !o.merge_into).map(o => o.name);

  // Ana firma / tedarikçi: bu firmadan satış kategorilerimizde yaptığımız alışlar (ör. ERACOM'dan Teknik Servis parçası)
  // Satış kategorisine eşleme: İş Kolları ekranındaki gider kategorisi eşlemesi, yoksa ad benzerliği ("Teknik Servis Alışları" → "Teknik Servis")
  const mapOf = new Map<string, string>(catMap.map((m: any) => [String(m.purchase_category), String(m.business_line)]));
  const byTax = new Map<string, string>();
  taxRows.forEach((c: any) => { const t = String(c.tax_number || '').replace(/\D/g, ''); if (t && !byTax.has(t)) byTax.set(t, c.id); });
  const sellOffs = offerings.filter(o => o !== UNCATEGORIZED);
  const sellByLow = new Map<string, string>(sellOffs.map(o => [low(o), o]));
  const supplyOff = (cat: string) => {
    if (!cat) return null;
    const mapped = mapOf.get(cat) || [...mapOf.entries()].find(([k]) => low(k) === low(cat))?.[1];
    if (mapped) { const k = sellByLow.get(low(canon(mapped))) || sellByLow.get(low(mapped)); if (k) return k; }
    const k = sellByLow.get(low(canon(cat))) || sellByLow.get(low(cat)); if (k) return k;
    const lc = low(cat); return sellOffs.find(o => lc.includes(low(o)) || low(o).includes(lc)) || null;
  };
  // Firmaya ait alış faturaları (müşteri eşleşmesi veya vergi no)
  // Eşleşme sırası: kayıtlı müşteri → vergi no → aynı Paraşüt carisi (satış faturalarından) → firma adı
  const byContact = new Map<string, string>();
  docs.forEach((d: any) => { if (d.contact_parasut_id && d.customer_id) byContact.set(String(d.contact_parasut_id), d.customer_id); });
  const STOP = new Set(['özel', 'ozel', 'türk', 'turk', 'türkiye', 'istanbul', 'anadolu', 'yeni', 'grup', 'group', 'sanayi', 'ticaret', 'bilişim', 'teknoloji', 'hizmetleri', 'ltd', 'şti', 'a.ş.', 'aş']);
  const key = (v: any) => low(String(v || '')).replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w));
  const byWord = new Map<string, string | null>();
  taxRows.filter((c: any) => !c.merged_into).forEach((c: any) => {
    const w = key(c.name)[0]; if (!w) return;
    byWord.set(w, byWord.has(w) && byWord.get(w) !== c.id ? null : c.id);   // aynı kelimeyle birden fazla müşteri varsa belirsiz
  });
  const byFullName = new Map<string, string>();
  taxRows.forEach((c: any) => { [c.name, c.legal_name].forEach(nm => { const k = key(nm).join(' '); if (k) byFullName.set(k, c.id); }); });
  const custOfBuy = (b: any) => b.customer_id || byTax.get(String(b.tax_number || '').replace(/\D/g, ''))
    || (b.contact_parasut_id && byContact.get(String(b.contact_parasut_id)))
    || byFullName.get(key(b.contact_name).join(' ')) || (key(b.contact_name)[0] && byWord.get(key(b.contact_name)[0])) || null;
  const cand = buys.map((b: any) => ({ b, cust: custOfBuy(b) })).filter((x: any) => x.cust && n(x.b.net_total_try) > 0);
  // Bu alımlarla kesilen satış faturaları (İş Kolları & Bayi İşleri eşleştirmesi) — kategori bulunamazsa satış faturasının kategorisi kullanılır
  const linkMap = new Map<string, string[]>();
  const candIds = cand.map((x: any) => x.b.id);
  for (let i = 0; i < candIds.length; i += 200) {
    const links = await safe(supabase.from('parasut_doc_links').select('purchase_doc_id, sales_doc_id').in('purchase_doc_id', candIds.slice(i, i + 200)));
    links.forEach((l: any) => (linkMap.get(l.purchase_doc_id) || linkMap.set(l.purchase_doc_id, []).get(l.purchase_doc_id)!).push(l.sales_doc_id));
  }
  const salesById = new Map<string, any>(docs.map((d: any) => [d.id, d]));
  const custName = new Map<string, string>(custs.map((c: any) => [c.id, c.name]));
  const unmatchedSupply: WSData['unmatchedSupply'] = {};
  cand.forEach(({ b, cust }: any) => {
    const cat = String(b.category || '').trim();
    const linked = (linkMap.get(b.id) || []).map(id => salesById.get(id)).filter(Boolean);
    const off = supplyOff(cat) || (linked.length ? sellByLow.get(low(docOff.get(linked[0].id) || '')) || null : null);
    const amt = n(b.net_total_try); const d = day(b.issue_date);
    if (!off) {
      const u = (unmatchedSupply[cust] ||= { buy12: 0, count: 0, cats: [] });
      u.count++; if (d >= yearAgo) u.buy12 += amt; const cn = cat || 'Kategorisiz'; if (!u.cats.includes(cn) && u.cats.length < 6) u.cats.push(cn);
      return;
    }
    const x = cell(cust, off); const sp = (x.supply ||= { buy12: 0, buyAll: 0, count: 0, last: null, resale12: 0, resaleTo: [] });
    sp.buyAll += amt; sp.count++; if (d >= yearAgo) sp.buy12 += amt; if (!sp.last || d > sp.last) sp.last = d;
    linked.forEach((sd: any) => {
      if (day(sd.issue_date) >= yearAgo) sp.resale12 += n(sd.net_total_try);
      const nm = custName.get(sd.customer_id); if (nm && !sp.resaleTo.includes(nm) && sp.resaleTo.length < 5) sp.resaleTo.push(nm);
    });
  });

  // Kategori istatistikleri
  const stats: WSData['stats'] = {};
  offerings.forEach(o => {
    const vals = customers.map((c: any) => n(cells[c.id]?.[o]?.rev12)).filter(v => v > 0);
    stats[o] = { buyers: vals.length, avg: median(vals), penetration: customers.length ? vals.length / customers.length : 0 };
  });

  const stateOf = (cid: string, o: string): WSState => {
    const x = cells[cid]?.[o]; const m = marks[cid]?.[o];
    if (x && x.rev12 > 0) return 'buying';
    if (m?.status === 'remap') return 'remapped';
    if (m?.status === 'buying') return 'buying';
    if (x?.supply && x.supply.buyAll > 0) return 'supplier';
    if (m && m.status !== 'opportunity') return m.status;
    if (m?.status === 'opportunity') return 'opportunity';
    if (x?.quoted) return 'quoted';
    if (x && x.revAll > 0) return 'lapsed';
    return 'empty';
  };

  // Öneriler
  const suggestions: WSSuggestion[] = [];
  const scope = opts.customerId ? custs.filter((c: any) => c.id === opts.customerId) : customers;
  scope.forEach((c: any) => {
    offerings.forEach(o => {
      if (o === UNCATEGORIZED) return;
      const st = stateOf(c.id, o);
      if (['buying', 'supplier', 'remapped', 'competitor', 'no_need', 'not_now'].includes(st)) return;
      const x = cells[c.id]?.[o]; const m = marks[c.id]?.[o]; const s = stats[o];
      const peers = c.sector ? customers.filter((p: any) => p.id !== c.id && p.sector === c.sector) : [];
      const usePeers = peers.length >= 2;
      const pool = usePeers ? peers : customers.filter((p: any) => p.id !== c.id);
      const buyers = pool.filter((p: any) => n(cells[p.id]?.[o]?.rev12) > 0);
      const pen = pool.length ? buyers.length / pool.length : 0;
      const avg = median(buyers.map((p: any) => cells[p.id][o].rev12)) || s?.avg || 0;
      let est = n(m?.est_value) || avg; let likelihood = pen; let reason = '';
      if (st === 'opportunity') { likelihood = 0.9; reason = `Fırsat olarak işaretlendi${m?.note ? ': ' + m.note : ''}`; }
      else if (st === 'lapsed') { est = n(m?.est_value) || avg || x!.revAll; likelihood = 0.7; reason = `Eskiden alıyordu (son alım ${x!.last ? new Date(x!.last).toLocaleDateString('tr-TR') : '-'}), son 12 ayda almadı`; }
      else if (st === 'quoted') { likelihood = Math.max(0.5, pen); reason = `${x!.quoted!.no} teklifi verildi, henüz siparişe dönmedi`; }
      else {
        if (!buyers.length) return;
        reason = `Benzer müşterilerin ${buyers.length}/${pool.length} kadarı bu kategoriyi alıyor${usePeers ? ` (aynı sektör: ${c.sector})` : ''}`;
      }
      if (est <= 0) return;
      suggestions.push({ customer_id: c.id, customer: c.name, assigned_to: c.assigned_to || null, offering: o, est, score: est * likelihood, reason, state: st === 'empty' ? 'suggested' : st });
    });
  });
  suggestions.sort((a, b) => b.score - a.score);

  return { ready, offerings, allOfferings, customers, cells, marks, stats, unmatchedSupply, suggestions, stateOf };
}

/** Müşteri × kategori değerlendirmesini kaydeder (null = işareti kaldır) */
export async function saveMark(supabase: any, customerId: string, offering: string, patch: { status: string; remap_to?: string | null; competitor?: string | null; est_value?: number | null; note?: string | null; opportunity_id?: string | null } | null) {
  if (!patch) {
    const { error } = await supabase.from('whitespace_marks').delete().eq('customer_id', customerId).eq('offering', offering);
    if (error) throw new Error(error.message); return;
  }
  const { data: ex } = await supabase.from('whitespace_marks').select('id').eq('customer_id', customerId).eq('offering', offering).maybeSingle();
  const row = { customer_id: customerId, offering, ...patch, updated_at: new Date().toISOString() };
  const { error } = ex ? await supabase.from('whitespace_marks').update(row).eq('id', ex.id) : await supabase.from('whitespace_marks').insert([row]);
  if (error) throw new Error(/remap_to|status_check|check constraint/i.test(error.message) ? 'Önce kategori-duzelt.sql dosyasını Supabase\'de çalıştırın.' : error.message);
}

/** Çapraz satış önerisinden fırsat açar ve işaretler */
export async function createCrossSellOpportunity(supabase: any, s: { customer_id: string; offering: string; est: number; reason?: string; assigned_to?: string | null }) {
  const close = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  const base: any = { title: `${s.offering} — çapraz satış`, customer_id: s.customer_id, value: Math.round(s.est), stage: 'Keşif', probability: 20, expected_close: close, notes: s.reason ? `Beyaz alan analizinden: ${s.reason}` : 'Beyaz alan analizinden', assigned_to: s.assigned_to || null };
  let { data, error } = await supabase.from('opportunities').insert([base]).select().single();
  if (error && /probability|expected_close/i.test(error.message)) {
    const { probability, expected_close, ...rest } = base;
    ({ data, error } = await supabase.from('opportunities').insert([rest]).select().single());
  }
  if (error) throw new Error(error.message);
  try { await saveMark(supabase, s.customer_id, s.offering, { status: 'opportunity', est_value: Math.round(s.est), opportunity_id: data.id }); } catch { /* SQL kurulmamış olabilir */ }
  return data;
}
