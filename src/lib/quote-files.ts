// Teklif dosyaları (Word / PDF) — Supabase Storage "quote-files/<kurum>/<teklif|tmp>/<dosya>"
export const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword';
export const MAX_MB = 15;

const safe = (s: string) => s.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-80);

export async function orgIdOf(supabase: any): Promise<string> {
  const { data, error } = await supabase.rpc('current_org_id');
  if (error || !data) throw new Error('Kurum bilgisi alınamadı');
  return String(data);
}

/** Dosyayı depoya yükler, depo yolunu döner */
export async function uploadQuoteFile(supabase: any, file: File, folder: string): Promise<{ path: string; name: string; mime: string; size: number }> {
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`Dosya ${MAX_MB} MB'tan büyük olamaz`);
  const org = await orgIdOf(supabase);
  const path = `${org}/${folder}/${Date.now()}-${safe(file.name)}`;
  const { error } = await supabase.storage.from('quote-files').upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(/bucket/i.test(error.message) ? 'teklif-dosya.sql dosyası Supabase\'de çalıştırılmamış.' : error.message);
  return { path, name: file.name, mime: file.type || '', size: file.size };
}

export async function attachToQuote(supabase: any, quoteId: string, f: { path: string; name: string; mime: string; size: number }, kind = 'offer') {
  const { error } = await supabase.from('quote_attachments').insert([{ quote_id: quoteId, file_name: f.name, storage_path: f.path, mime_type: f.mime, size_bytes: f.size, kind }]);
  if (error) throw new Error(error.message);
}

export async function openQuoteFile(supabase: any, path: string, name: string) {
  const { data, error } = await supabase.storage.from('quote-files').createSignedUrl(path, 120, { download: name });
  if (error || !data) throw new Error(error?.message || 'Dosya açılamadı');
  window.open(data.signedUrl, '_blank', 'noopener');
}

export const fmtSize = (b?: number | null) => (!b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
