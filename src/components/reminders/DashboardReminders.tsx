'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { loadReminders, type Reminder } from '@/lib/reminders';
import ReminderList from './ReminderList';
import { BellRing, CheckCircle2 } from 'lucide-react';

/** Dashboard: öncelikli hatırlatmalar (kişisel panelde yalnızca kendi müşterileri) */
export default function DashboardReminders({ supabase, mineOnly = false }: { supabase: any; mineOnly?: boolean }) {
  const [items, setItems] = useState<Reminder[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [r, u, tm] = await Promise.all([loadReminders(supabase), supabase.auth.getUser(), supabase.from('sales_team').select('id, email')]);
    const mine = (tm.data || []).find((x: any) => x.email && x.email.toLowerCase() === (u.data.user?.email || '').toLowerCase());
    setMe(mine?.id || null);
    setItems(mineOnly && mine ? r.reminders.filter(x => x.assigned_to === mine.id) : r.reminders);
  }, [mineOnly]);
  useEffect(() => { load(); }, [load]);
  if (!items) return null;
  const p1 = items.filter(r => r.priority === 1).length;
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <BellRing className="h-4 w-4 text-indigo-600" /><p className="text-sm font-semibold">Akıllı hatırlatmalar</p>
        {items.length > 0 && <span className="text-xs text-slate-500">{items.length} bekleyen{p1 ? ` · ${p1} acil` : ''}</span>}
        <Link href="/reminders" className="ml-auto text-xs text-indigo-600">Tümünü gör →</Link>
      </div>
      {items.length === 0 ? <p className="flex items-center gap-2 p-4 text-sm text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-500" />Bekleyen hatırlatma yok.</p>
        : <ReminderList supabase={supabase} items={items.slice(0, 6)} me={me} onChanged={load} />}
    </Card>
  );
}
