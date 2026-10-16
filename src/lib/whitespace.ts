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
};
export type WSState = 'buying' | 'remapped' | 'lapsed' | 'quoted' | 'opportunity' | 'competitor' | 'no_need' | 'not_now' | 'suggested' | 'empty';
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
  suggestions: WSSuggestion[];
  stateOf: (customerId: string, offering: string) => WSState;
};

const emptyCell = (): WSCell => ({ rev12: 0, revAll: 0, last: null, count: 0, byYear: {}, products: [], quoted: null });
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export async function loadWhitespace(supabase: any, opts: { customerId?: string } = {}): Promise<WSData> {
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const [custs, docs, prods, orders, quotes, marksRes, offRes] = await Promise.all([
    safe(supabase.from('customers').select('id, name, status, segment, sector, assigned_to, customer_type, merged_into, phone, is_key_account').order('name').limit(10000)),
    safe(supabase.from('parasut_documents').select('id, customer_id, doc_no, issue_date, net_total_try, category').eq('kind', 'sales_invoice').not('customer_id', 'is', null).limit(10000)),
    safe(supabase.from('products').select('id, name, category').limit(10000)),
    safe(supabase.from('orders').select('id, customer_id, order_date, created_at, status, quote_id').neq('status', 'cancelled').limit(10000)),
    safe(supabase.from('quotes').select('id, customer_id, quote_number, revision, status, created_at, sent_at').gte('created_at', yearAgo).limit(5000)),
    supabase.from('whitespace_marks').select('*').limit(10000),
    safe(supabase.from('whitespace_offerings').select('*')),
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
      if (['buying', 'remapped', 'competitor', 'no_need', 'not_now'].includes(st)) return;
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

  return { ready, offerings, allOfferings, customers, cells, marks, stats, suggestions, stateOf };
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
