'use client';

// Kurum modül lisansı (organizations.enabled_modules): revenue, procure
// sql/procure/01-altyapi.sql çalıştırılmamışsa her kurum yalnızca Revenue sayılır (mevcut davranış korunur).
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

export type ModuleKey = 'revenue' | 'procure';
export const MODULES: { key: ModuleKey; label: string; desc: string }[] = [
  { key: 'revenue', label: 'Revenue', desc: 'Satış, teklif, sipariş, bayi, tahsilat' },
  { key: 'procure', label: 'Procure', desc: 'Satınalma: talep, onay, teklif toplama, sipariş, mal kabul' },
];

type State = { modules: ModuleKey[]; ready: boolean; loading: boolean };
const FALLBACK: ModuleKey[] = ['revenue'];

// Oturum başına bir kez sorulur; kurum yönetiminde değişince refreshModules() ile yenilenir
let cache: { uid: string; modules: ModuleKey[]; ready: boolean } | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

async function load(uid: string) {
  const { data, error } = await createClient().rpc('my_enabled_modules');
  cache = error || !Array.isArray(data)
    ? { uid, modules: FALLBACK, ready: false }
    : { uid, modules: data as ModuleKey[], ready: true };
  listeners.forEach(l => l());
}

export function refreshModules() {
  if (!cache) return;
  inflight = load(cache.uid).finally(() => { inflight = null; });
}

export function useModules() {
  const { user } = useAuth();
  const uid = user?.id || '';
  const fresh = cache && cache.uid === uid ? cache : null;
  const [state, setState] = useState<State>(fresh ? { ...fresh, loading: false } : { modules: FALLBACK, ready: false, loading: true });

  useEffect(() => {
    if (!uid) return;
    const sync = () => { if (cache?.uid === uid) setState({ modules: cache.modules, ready: cache.ready, loading: false }); };
    listeners.add(sync);
    if (cache?.uid === uid) sync();
    else if (!inflight) inflight = load(uid).finally(() => { inflight = null; });
    return () => { listeners.delete(sync); };
  }, [uid]);

  return {
    ...state,
    has: (m: ModuleKey) => state.modules.includes(m),
  };
}
