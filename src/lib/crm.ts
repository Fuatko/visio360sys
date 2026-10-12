// Kurumsal CRM: sözlükler, VKN/TCKN doğrulama, mükerrer kayıt tespiti, kart doluluk skoru

export const SEGMENTS = ['Kurumsal', 'KOBİ', 'Kamu', 'Mikro / şahıs', 'Uluslararası', 'Holding / grup'];
export const ABC = [
  { value: 'A', label: 'A — stratejik (cironun ~%80\'i)' },
  { value: 'B', label: 'B — gelişen' },
  { value: 'C', label: 'C — düşük hacim' },
];
export const EMPLOYEE_BANDS = ['1–9', '10–49', '50–249', '250–999', '1.000+'];
export const REVENUE_BANDS = ['< 10 mn ₺', '10–100 mn ₺', '100 mn – 1 mlr ₺', '1–5 mlr ₺', '> 5 mlr ₺'];
export const E_INVOICE = ['e-Fatura', 'e-Arşiv', 'Kâğıt'];
export const RISK = ['Düşük', 'Orta', 'Yüksek'];
export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'];
export const LANGUAGES = ['Türkçe', 'İngilizce', 'Almanca', 'Arapça', 'Rusça'];
export const INCOTERMS = [
  ['EXW', 'İşyerinde teslim'], ['FCA', 'Taşıyıcıya teslim'], ['CPT', 'Taşıma ödenmiş'], ['CIP', 'Taşıma ve sigorta ödenmiş'],
  ['DAP', 'Belirlenen yerde teslim'], ['DPU', 'Boşaltılmış teslim'], ['DDP', 'Gümrük vergisi ödenmiş'],
  ['FAS', 'Gemi doğrultusunda'], ['FOB', 'Gemide teslim'], ['CFR', 'Masraflar ödenmiş'], ['CIF', 'Masraflar, sigorta, navlun'],
] as const;
// NACE Rev.2 ana bölümleri (TÜİK / SGK)
export const NACE = [
  ['A', 'Tarım, ormancılık, balıkçılık'], ['B', 'Madencilik ve taşocakçılığı'], ['C', 'İmalat'], ['D', 'Elektrik, gaz, buhar'],
  ['E', 'Su temini, atık yönetimi'], ['F', 'İnşaat'], ['G', 'Toptan ve perakende ticaret'], ['H', 'Ulaştırma ve depolama'],
  ['I', 'Konaklama ve yiyecek hizmeti'], ['J', 'Bilgi ve iletişim'], ['K', 'Finans ve sigorta'], ['L', 'Gayrimenkul'],
  ['M', 'Mesleki, bilimsel, teknik faaliyetler'], ['N', 'İdari ve destek hizmetleri'], ['O', 'Kamu yönetimi'], ['P', 'Eğitim'],
  ['Q', 'İnsan sağlığı ve sosyal hizmet'], ['R', 'Kültür, sanat, eğlence'], ['S', 'Diğer hizmetler'],
] as const;

export const BUYING_ROLES: Record<string, { label: string; hint: string; cls: string }> = {
  decision_maker: { label: 'Karar verici', hint: 'Son onayı veren, bütçe sahibi', cls: 'bg-indigo-100 text-indigo-800' },
  champion: { label: 'Destekçi (şampiyon)', hint: 'İçeride bizi savunan', cls: 'bg-green-100 text-green-800' },
  influencer: { label: 'Etkileyici', hint: 'Kararı etkileyen, görüşü sorulan', cls: 'bg-sky-100 text-sky-800' },
  technical: { label: 'Teknik değerlendirici', hint: 'Teknik uygunluğu inceleyen', cls: 'bg-slate-100 text-slate-700' },
  purchasing: { label: 'Satın alma', hint: 'Fiyat ve şartları müzakere eden', cls: 'bg-amber-100 text-amber-800' },
  user: { label: 'Kullanıcı', hint: 'Ürünü kullanacak olan', cls: 'bg-slate-100 text-slate-700' },
  blocker: { label: 'Engelleyici', hint: 'Projeye karşı olan', cls: 'bg-red-100 text-red-800' },
};
export const INFLUENCE: Record<string, string> = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };
export const ATTITUDE: Record<string, { label: string; cls: string }> = {
  supporter: { label: 'Destekliyor', cls: 'text-green-700' }, neutral: { label: 'Nötr', cls: 'text-slate-600' }, opponent: { label: 'Karşı', cls: 'text-red-600' },
};
export const ADDRESS_TYPES: Record<string, string> = { hq: 'Merkez', billing: 'Fatura adresi', shipping: 'Sevk / teslim adresi', branch: 'Şube / tesis', other: 'Diğer' };
export const TEAM_ROLES = ['Hesap yöneticisi', 'Satış destek', 'Teknik destek / servis', 'Finans / tahsilat', 'Yönetici sponsor', 'Bayi / iş ortağı'];
export const CHANNELS = ['Telefon', 'E-posta', 'WhatsApp', 'Yüz yüze', 'Video görüşme'];

// ---------------------------------------------------------------------
// VKN / TCKN / MERSİS / KEP doğrulama
// ---------------------------------------------------------------------
export function validVKN(v: string) {
  if (!/^\d{10}$/.test(v)) return false;
  const d = v.split('').map(Number); let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (d[i] + 10 - (i + 1)) % 10;
    let x = tmp === 0 ? 0 : (tmp * Math.pow(2, 10 - (i + 1))) % 9;
    if (tmp !== 0 && x === 0) x = 9;
    sum += x;
  }
  return (10 - (sum % 10)) % 10 === d[9];
}
export function validTCKN(v: string) {
  if (!/^[1-9]\d{10}$/.test(v)) return false;
  const d = v.split('').map(Number);
  const c10 = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10;
  const c11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return ((c10 + 10) % 10) === d[9] && c11 === d[10];
}
/** Boş: null · Geçerli: {ok:true, kind} · Hatalı: {ok:false, msg} */
export function checkTaxNumber(raw?: string | null): null | { ok: boolean; kind?: 'VKN' | 'TCKN'; msg?: string } {
  const v = String(raw || '').replace(/\D/g, '');
  if (!v) return null;
  if (v.length === 10) return validVKN(v) ? { ok: true, kind: 'VKN' } : { ok: false, msg: 'VKN kontrol hanesi tutmuyor' };
  if (v.length === 11) return validTCKN(v) ? { ok: true, kind: 'TCKN' } : { ok: false, msg: 'TCKN kontrol haneleri tutmuyor' };
  return { ok: false, msg: 'VKN 10, TCKN 11 haneli olmalı' };
}
export const checkMersis = (v?: string | null) => !v || /^\d{16}$/.test(v.replace(/\s/g, ''));
export const checkKep = (v?: string | null) => !v || /^[^\s@]+@[a-z0-9.-]+\.kep\.tr$/i.test(v.trim());

// ---------------------------------------------------------------------
// Mükerrer kayıt tespiti
// ---------------------------------------------------------------------
const LEGAL = new Set(['as', 'anonim', 'sirketi', 'sirket', 'sti', 'ltd', 'limited', 'san', 'sanayi', 'tic', 'ticaret', 've', 'ith', 'ihr', 'ithalat', 'ihracat',
  'paz', 'pazarlama', 'ins', 'insaat', 'muh', 'muhendislik', 'hiz', 'hizmetleri', 'koll', 'kom', 'dis', 'inc', 'gmbh', 'llc', 'co', 'corp', 'ltdsti']);
export function normalizeName(s?: string | null) {
  return String(s || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/a\.?\s?s\./g, ' as ').replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter(t => t.length > 1 && !LEGAL.has(t)).join(' ').trim();
}
const digits10 = (s?: string | null) => String(s || '').replace(/\D/g, '').slice(-10);

export interface DupMatch { id: string; name: string; reason: string; strength: 'kesin' | 'olası' }
export function findDuplicates(c: { id?: string; name?: string; tax_number?: string; phone?: string; email?: string; parent_id?: string | null }, all: any[]): DupMatch[] {
  const n = normalizeName(c.name); const tax = String(c.tax_number || '').replace(/\D/g, ''); const ph = digits10(c.phone);
  const dom = (c.email || '').split('@')[1]?.toLowerCase();
  const generic = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'yandex.com'];
  const out: DupMatch[] = [];
  for (const x of all) {
    if (!x || x.id === c.id || x.merged_into) continue;
    if (c.id && (x.parent_id === c.id || (c.parent_id && (x.id === c.parent_id || x.parent_id === c.parent_id)))) continue;   // aynı grubun şirketleri mükerrer değildir
    if (tax && String(x.tax_number || '').replace(/\D/g, '') === tax) { out.push({ id: x.id, name: x.name, reason: 'Aynı vergi numarası', strength: 'kesin' }); continue; }
    const xn = normalizeName(x.name);
    if (n && xn && n === xn) { out.push({ id: x.id, name: x.name, reason: 'Aynı firma adı', strength: 'kesin' }); continue; }
    if (n.length >= 5 && xn.length >= 5 && (xn.includes(n) || n.includes(xn))) { out.push({ id: x.id, name: x.name, reason: 'Benzer firma adı', strength: 'olası' }); continue; }
    if (ph.length === 10 && digits10(x.phone) === ph) { out.push({ id: x.id, name: x.name, reason: 'Aynı telefon', strength: 'olası' }); continue; }
    if (dom && !generic.includes(dom) && String(x.email || '').toLowerCase().endsWith('@' + dom)) out.push({ id: x.id, name: x.name, reason: 'Aynı e-posta alan adı', strength: 'olası' });
  }
  return out;
}

/** Tüm listede mükerrer grupları (vergi no ve normalize ad) */
export function duplicateGroups(all: any[]) {
  const groups: Record<string, any[]> = {};
  all.filter(x => !x.merged_into).forEach(x => {
    const keys = new Set<string>();
    const tax = String(x.tax_number || '').replace(/\D/g, ''); if (tax) keys.add('v:' + tax);
    const n = normalizeName(x.name); if (n.length >= 3) keys.add('n:' + n);
    keys.forEach(k => { (groups[k] = groups[k] || []).push(x); });
  });
  const seen = new Set<string>();
  return Object.entries(groups).filter(([, v]) => v.length > 1).map(([k, v]) => ({ key: k, reason: k.startsWith('v:') ? 'Aynı vergi numarası' : 'Aynı firma adı', items: v }))
    .filter(g => { const sig = g.items.map(i => i.id).sort().join(); if (seen.has(sig)) return false; seen.add(sig); return true; });
}

// ---------------------------------------------------------------------
// Kart doluluk skoru: kurumsal iş için gerekli bilgiler ne kadar tamam?
// ---------------------------------------------------------------------
export function completeness(c: any, contacts: number, addresses: number) {
  const checks: [string, boolean, number][] = [
    ['Ticari unvan', !!c.legal_name, 1], ['Vergi dairesi ve no', !!(c.tax_office && c.tax_number), 2], ['İl', !!c.city, 1],
    ['Sektör / NACE', !!(c.sector || c.nace_code), 1], ['Segment', !!c.segment, 1], ['Sorumlu', !!c.assigned_to, 1],
    ['En az bir kişi', contacts > 0, 2], ['Karar verici', !!c._hasDecisionMaker, 1], ['Fatura adresi', addresses > 0, 1],
    ['Telefon veya e-posta', !!(c.phone || c.email), 1], ['Sonraki adım', !!c.next_step, 1],
  ];
  const total = checks.reduce((a, x) => a + x[2], 0); const got = checks.reduce((a, x) => a + (x[1] ? x[2] : 0), 0);
  return { pct: Math.round((100 * got) / total), missing: checks.filter(x => !x[1]).map(x => x[0]) };
}
