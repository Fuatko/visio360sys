/**
 * Teklife özel belge bilgileri: müşteri kartını değiştirmeden yalnızca o teklifte geçerli olan
 * hitap adı, dikkatine, kabul eden, imzalayan ve ticari koşullar.
 * Veritabanı alanları: sql/teklif-ozellestirme.sql
 */
export interface QuoteDoc {
  customer_title: string;      // "Sayın" satırında görünecek ad / takma ad
  attention_to: string;        // Dikkatine: yetkili kişi
  acceptor_title: string;      // "Teklifi kabul eden" firması (boşsa customer_title)
  signer_name: string;         // Teklifi veren imzacı (boşsa antetteki imzacı)
  signer_title: string;
  delivery_terms: string;      // Teslim süresi / şekli
  warranty_terms: string;      // Garanti
  extra_terms: string;         // Bu teklife özel ek şartlar / opsiyon notu
  hide_standard_terms: boolean; // Antetteki genel şartları bu teklifte gösterme
}

export const DOC_KEYS = ['customer_title', 'attention_to', 'acceptor_title', 'signer_name', 'signer_title', 'delivery_terms', 'warranty_terms', 'extra_terms', 'hide_standard_terms'] as const;

export const EMPTY_DOC: QuoteDoc = {
  customer_title: '', attention_to: '', acceptor_title: '', signer_name: '', signer_title: '',
  delivery_terms: '', warranty_terms: '', extra_terms: '', hide_standard_terms: false,
};

/** Kayıttan formdaki değerlere */
export const docFrom = (q: any): QuoteDoc => ({
  customer_title: q?.customer_title || '', attention_to: q?.attention_to || '', acceptor_title: q?.acceptor_title || '',
  signer_name: q?.signer_name || '', signer_title: q?.signer_title || '',
  delivery_terms: q?.delivery_terms || '', warranty_terms: q?.warranty_terms || '', extra_terms: q?.extra_terms || '',
  hide_standard_terms: !!q?.hide_standard_terms,
});

/** Formdan veritabanına (boş metin → null) */
export const docPayload = (d: Partial<QuoteDoc>) => {
  const out: Record<string, any> = {};
  DOC_KEYS.forEach(k => {
    const v = (d as any)[k];
    out[k] = k === 'hide_standard_terms' ? !!v : (typeof v === 'string' && v.trim() ? v.trim() : null);
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
