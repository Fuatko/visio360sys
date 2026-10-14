// Tarayıcıdan Paraşüt sunucu uçlarını çağırır (oturum anahtarı + süper adminin seçtiği kurum)
import { createClient } from '@/lib/supabase';

export async function parasutCall(path: string, method = 'GET', body?: any) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  let orgId = ''; try { orgId = localStorage.getItem('selectedOrgId') || ''; } catch { /* yok */ }
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, ...(orgId ? { 'x-org-id': orgId } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Hata ${r.status}`);
  return j;
}
