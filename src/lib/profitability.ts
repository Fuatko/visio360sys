// Kârlılık: satış geliri → satılan malın maliyeti → brüt kâr → diğer gelirler → giderler → vergi → net kâr
// Tüm tutarlar KDV hariçtir (KDV gelir/gider değildir).

const n = (v: any) => Number(v) || 0;

export interface PnlInput {
  orders: any[];          // dönemdeki iptal olmayan siparişler
  items: any[];           // bu siparişlerin kalemleri
  products: any[];
  pos: any[];             // satın alma siparişleri (iptal olmayan)
  receivables: any[];     // ana firmalardan alacaklar (dönem, reddedilmemiş)
  expenses: any[];        // dönem giderleri
  partnerCosts: number;   // iş ortağı komisyonlarının şirkete maliyeti
  taxRate: number;        // kurumlar vergisi %
}

export interface Bucket { key: string; revenue: number; cogs: number; otherIncome: number; directExpenses: number }

export interface Pnl {
  revenue: number; cogs: number; gross: number; grossPct: number;
  otherIncome: number; opex: number; partnerCosts: number; expenses: number;
  ebt: number; tax: number; net: number; netPct: number;
  buckets: Record<string, Bucket>;
  missingCostLines: number;
  expenseByCategory: [string, number][];
}

export function computePnl(d: PnlInput): Pnl {
  const prod = new Map(d.products.map(p => [p.id, p]));
  const buckets: Record<string, Bucket> = {};
  const b = (k: string) => (buckets[k] = buckets[k] || { key: k, revenue: 0, cogs: 0, otherIncome: 0, directExpenses: 0 });
  let missingCostLines = 0;

  for (const o of d.orders) {
    const gd = Math.min(Math.max(n(o.discount), 0), 100) / 100;
    const fx = n(o.exchange_rate) > 0 ? n(o.exchange_rate) : 1;   // dövizli siparişin TL karşılığı
    const its = d.items.filter(i => i.order_id === o.id);
    const linkedPos = d.pos.filter(p => p.sales_order_id === o.id);
    const poSuppliers = new Set(linkedPos.map(p => p.supplier_id));
    linkedPos.forEach(p => { b(p.supplier_id).cogs += n(p.subtotal); });

    if (!its.length) { b('own').revenue += n(o.subtotal) * (1 - gd) * fx; continue; }
    for (const i of its) {
      const p: any = prod.get(i.product_id);
      const key = p?.supplier_id || 'own';
      const lineNet = (n(i.total) || n(i.quantity) * n(i.unit_price) * (1 - n(i.discount) / 100)) * (1 - gd) * fx;
      b(key).revenue += lineNet;
      if (p?.supplier_id && poSuppliers.has(p.supplier_id)) continue;   // gerçek alış maliyeti satın almadan geldi
      if (p && p.cost_price !== null && p.cost_price !== undefined && p.cost_price !== '') b(key).cogs += n(p.cost_price) * n(i.quantity);
      else if (p) missingCostLines++;
    }
  }
  for (const r of d.receivables) b(r.supplier_id).otherIncome += n(r.amount);
  for (const e of d.expenses) if (e.supplier_id) b(e.supplier_id).directExpenses += n(e.amount);

  const sum = (k: keyof Bucket) => Object.values(buckets).reduce((s, x) => s + (x[k] as number), 0);
  const revenue = sum('revenue'), cogs = sum('cogs'), otherIncome = sum('otherIncome');
  const expenses = d.expenses.reduce((s, e) => s + n(e.amount), 0);
  const opex = expenses + d.partnerCosts;
  const gross = revenue - cogs;
  const ebt = gross + otherIncome - opex;
  const tax = Math.max(0, ebt) * d.taxRate / 100;
  const net = ebt - tax;
  const cat: Record<string, number> = {};
  d.expenses.forEach(e => { cat[e.category || 'Diğer'] = (cat[e.category || 'Diğer'] || 0) + n(e.amount); });
  return {
    revenue, cogs, gross, grossPct: revenue ? gross / revenue * 100 : 0, otherIncome, opex, partnerCosts: d.partnerCosts, expenses,
    ebt, tax, net, netPct: revenue + otherIncome ? net / (revenue + otherIncome) * 100 : 0,
    buckets, missingCostLines, expenseByCategory: Object.entries(cat).sort((a, b2) => b2[1] - a[1]),
  };
}

// ---- Paraşüt / Excel'den yapıştırılan gider listesini okuma ----
export function parseTrNumber(s: string): number {
  let t = String(s || '').replace(/[₺TLtl\s]/g, '').trim();
  if (!t) return NaN;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  return Number(t);
}
export function parseTrDate(s: string): string | null {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export interface ParsedExpense { expense_date: string; description: string; category: string; amount: number; external_ref: string }

export function parseExpensePaste(text: string, defaultCategory: string): { rows: ParsedExpense[]; bad: number; columns: string } {
  const lines = text.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim());
  if (!lines.length) return { rows: [], bad: 0, columns: '' };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const split = (l: string) => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim());
  const head = split(lines[0]).map(h => h.toLocaleLowerCase('tr'));
  const find = (...keys: string[]) => head.findIndex(h => keys.some(k => h.includes(k)));
  const hasHeader = head.some(h => /tarih|açıklama|tutar|toplam|kategori|tedarikçi/.test(h));
  let iDate = 0, iDesc = 1, iCat = -1, iAmt = 2;
  if (hasHeader) {
    iDate = find('düzenleme tarihi', 'fatura tarihi', 'tarih');
    iDesc = find('açıklama', 'tedarikçi', 'cari', 'firma', 'unvan');
    iCat = find('kategori');
    iAmt = find('ara toplam', 'kdv hariç', 'net tutar', 'matrah');
    if (iAmt < 0) iAmt = find('tutar', 'toplam');
  }
  const body = hasHeader ? lines.slice(1) : lines;
  const rows: ParsedExpense[] = []; let bad = 0;
  for (const l of body) {
    const c = split(l);
    const date = parseTrDate(c[iDate] ?? '');
    const amount = parseTrNumber(c[iAmt] ?? '');
    if (!date || !isFinite(amount) || amount === 0) { bad++; continue; }
    const description = (iDesc >= 0 ? c[iDesc] : '') || 'Gider';
    rows.push({ expense_date: date, description, category: (iCat >= 0 && c[iCat]) || defaultCategory, amount: Math.abs(amount),
      external_ref: `imp:${date}|${description.slice(0, 60)}|${Math.abs(amount).toFixed(2)}` });
  }
  const label = (i: number) => (i >= 0 && hasHeader ? split(lines[0])[i] : i >= 0 ? `${i + 1}. sütun` : '—');
  return { rows, bad, columns: `Tarih: ${label(iDate)} · Açıklama: ${label(iDesc)} · Kategori: ${label(iCat)} · Tutar: ${label(iAmt)}` };
}
