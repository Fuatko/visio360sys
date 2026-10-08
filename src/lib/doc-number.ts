// Sıralı belge numarası: şirket + belge türü + yıl bazında artan (TKL-2026-0001)
// ISO 9001 izlenebilirlik ve fatura mevzuatı sıralı, boşluksuz numara ister.

type Supa = any;

export const DOC_PREFIX = {
  quote: 'TKL',
  order: 'SIP',
  invoice: 'FTR',
} as const;

export type DocType = keyof typeof DOC_PREFIX;

export async function nextDocumentNumber(supabase: Supa, docType: DocType): Promise<string> {
  const prefix = DOC_PREFIX[docType];
  const { data, error } = await supabase.rpc('next_document_number', { p_doc_type: docType, p_prefix: prefix });
  if (!error && data) return data as string;

  // Fatura numarası asla tahmini üretilmez
  if (docType === 'invoice') {
    throw new Error('Fatura numarası alınamadı: ' + (error?.message || 'bilinmeyen hata'));
  }
  // Teklif / sipariş için geçici yedek (numaralandırma kurulmamışsa)
  console.warn('Sıralı numara alınamadı, geçici numara kullanılıyor:', error?.message);
  const year = new Date().getFullYear();
  return `${prefix}-${year}-T${Date.now().toString().slice(-6)}`;
}
