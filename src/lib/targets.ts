// Hedefler iki tabloda tutulmuş olabilir (eski "targets" ve Hedef Yönetimi ekranının yazdığı "sales_targets").
// Panolar ikisini birleştirerek okur; aynı kişi + dönem iki tabloda varsa sales_targets esas alınır.
export async function loadTargets(supabase: any): Promise<any[]> {
  const [a, b] = await Promise.all([
    supabase.from('sales_targets').select('*'),
    supabase.from('targets').select('*'),
  ]);
  const st = (a.error ? [] : a.data || []).map((t: any) => ({ ...t, period: t.period || (t.target_month ? String(t.target_month).slice(0, 7) : null), sales_person_id: t.sales_person_id || t.rep_id || null, sales_target: t.sales_target ?? t.target_amount ?? 0 }));
  const keys = new Set(st.map((t: any) => `${t.sales_person_id}|${t.period}`));
  const old = (b.error ? [] : b.data || []).filter((t: any) => !keys.has(`${t.sales_person_id}|${t.period}`));
  return [...st, ...old];
}
