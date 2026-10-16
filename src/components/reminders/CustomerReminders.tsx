'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { loadReminders, type Reminder } from '@/lib/reminders';
import ReminderList from './ReminderList';
import { BellRing } from 'lucide-react';

/** Müşteri kartında bu müşteriye ait açık hatırlatmalar */
export default function CustomerReminders({ supabase, customerId }: { supabase: any; customerId: string }) {
  const [items, setItems] = useState<Reminder[] | null>(null);
  const load = useCallback(async () => { const r = await loadReminders(supabase, { customerId }); setItems(r.reminders); }, [customerId]);
  useEffect(() => { load(); }, [load]);
  if (!items || items.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-1.5 border-b px-4 py-2.5">
        <BellRing className="h-4 w-4 text-indigo-600" /><p className="text-sm font-semibold">Hatırlatmalar</p>
        <span className="rounded-full bg-rose-50 px-1.5 text-[11px] font-semibold text-rose-600">{items.length}</span>
        <Link href="/reminders" className="ml-auto text-xs text-indigo-600">Tümü →</Link>
      </div>
      <ReminderList supabase={supabase} items={items.slice(0, 5)} onChanged={load} compact showCustomer={false} />
    </Card>
  );
}
