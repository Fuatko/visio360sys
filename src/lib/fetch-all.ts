// Supabase/PostgREST bir sorguda en fazla ~1000 satır döndürür; büyük tabloları sayfa sayfa okur.
// make: her çağrıda YENİ bir sorgu döndüren fonksiyon (sorgu nesnesi tekrar kullanılamaz). Hata olursa [] döner.
export async function fetchAll(make: () => any, opts: { page?: number; max?: number } = {}): Promise<any[]> {
  const page = opts.page ?? 1000; const max = opts.max ?? 50000;
  const out: any[] = [];
  try {
    for (let from = 0; from < max; from += page) {
      const { data, error } = await make().range(from, from + page - 1);
      if (error) return out.length ? out : [];
      out.push(...(data || []));
      if (!data || data.length < page) break;
    }
  } catch { /* ağ hatası: okunabilen kadarı */ }
  return out;
}
