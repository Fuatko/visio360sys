/**
 * Teklife özel belge bilgileri: müşteri kartını değiştirmeden yalnızca o teklifte geçerli olan
 * hitap adı, dikkatine, kabul eden, imzalayan ve ticari koşullar.
 * Veritabanı alanları: sql/teklif-ozellestirme.sql
 */
export interface QuoteDoc {
  customer_title: string;      // "Sayın" satırında görünecek ad / takma ad
  attention_to: string;        // İlgili kişi (müşteri adının altında)
  attention_title: string;     // İlgili kişinin görev tanımı
  recipient_address: string;   // Bu teklifte müşteri adres bloğu (boşsa müşteri kartı: adres, il/ilçe, vergi)
  acceptor_title: string;      // "Teklifi kabul eden" firması (boşsa customer_title)
  signer_name: string;         // Teklifi veren imzacı (boşsa antetteki imzacı)
  signer_title: string;
  delivery_terms: string;      // Teslim süresi / şekli
  warranty_terms: string;      // Garanti
  extra_terms: string;         // Bu teklife özel ek şartlar / opsiyon notu
  hide_standard_terms: boolean; // Antetteki genel şartları bu teklifte gösterme
  standard_terms_override: string; // Bu teklifin genel şartları (boşsa antetteki)
  show_stamp: boolean;         // Teklifi veren bölümüne kaşe + imza görseli
}

export const DOC_KEYS = ['customer_title', 'attention_to', 'attention_title', 'recipient_address', 'standard_terms_override', 'show_stamp', 'acceptor_title', 'signer_name', 'signer_title', 'delivery_terms', 'warranty_terms', 'extra_terms', 'hide_standard_terms'] as const;

export const EMPTY_DOC: QuoteDoc = {
  customer_title: '', attention_to: '', attention_title: '', recipient_address: '', standard_terms_override: '', show_stamp: false, acceptor_title: '', signer_name: '', signer_title: '',
  delivery_terms: '', warranty_terms: '', extra_terms: '', hide_standard_terms: false,
};

/** Kayıttan formdaki değerlere */
export const docFrom = (q: any): QuoteDoc => ({
  customer_title: q?.customer_title || '', attention_to: q?.attention_to || '', attention_title: q?.attention_title || '',
  recipient_address: q?.recipient_address || '', standard_terms_override: q?.standard_terms_override || '', show_stamp: !!q?.show_stamp, acceptor_title: q?.acceptor_title || '',
  signer_name: q?.signer_name || '', signer_title: q?.signer_title || '',
  delivery_terms: q?.delivery_terms || '', warranty_terms: q?.warranty_terms || '', extra_terms: q?.extra_terms || '',
  hide_standard_terms: !!q?.hide_standard_terms,
});

/** Formdan veritabanına (boş metin → null) */
export const docPayload = (d: Partial<QuoteDoc>) => {
  const out: Record<string, any> = {};
  DOC_KEYS.forEach(k => {
    const v = (d as any)[k];
    out[k] = k === 'hide_standard_terms' || k === 'show_stamp' ? !!v : (typeof v === 'string' && v.trim() ? v.replace(/\s+$/, '') : null);
  });
  return out;
};

/** teklif-ozellestirme.sql çalıştırılmadıysa gelen "kolon yok" hatası mı? */
export const isMissingDocCol = (msg?: string) =>
  !!msg && /column|schema cache/i.test(msg) && new RegExp(DOC_KEYS.join('|')).test(msg);

export const withoutDoc = (p: Record<string, any>) => {
  const r = { ...p };
  DOC_KEYS.forEach(k => delete r[k]);
  return r;
};

export const VALIDITY_DAYS = [7, 15, 30, 45, 60, 90];
export const dateAfter = (days: number, from?: string | null) => {
  const base = from ? new Date(from) : new Date();
  return new Date(base.getTime() + days * 864e5).toISOString().slice(0, 10);
};

/** Antet: birden fazla banka hesabı (eski tekli bank_name/iban alanı da desteklenir) */
export interface BankAccount { bank_name: string; branch?: string; currency?: string; iban: string }
export const bankAccounts = (lh: any): BankAccount[] => {
  const list = Array.isArray(lh?.bank_accounts) ? lh.bank_accounts.filter((b: any) => b && (b.iban || b.bank_name)) : [];
  if (list.length) return list;
  return lh?.iban ? [{ bank_name: lh.bank_name || '', iban: lh.iban }] : [];
};
