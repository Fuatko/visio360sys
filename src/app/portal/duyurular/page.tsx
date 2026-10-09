'use client';

import { useEffect, useState } from 'react';
import { usePortal, PortalTitle } from '@/components/portal/PortalShell';
import { Badge } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { openPortalFile, fileLabel } from '@/lib/portal';
import { Pin, Paperclip } from 'lucide-react';

export default function PortalAnnouncements() {
  const { supabase, me, refreshCounts } = usePortal();
  const [items, setItems] = useState<any[]>([]);
  const [reads, setReads] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('portal_announcements').select('*').order('is_pinned', { ascending: false }).order('publish_at', { ascending: false }),
      supabase.from('portal_announcement_reads').select('announcement_id').eq('dealer_user_id', me.user.id),
    ]).then(([a, r]: any) => { setItems(a.data || []); setReads(new Set((r.data || []).map((x: any) => x.announcement_id))); });
  }, []);

  const markRead = async (id: string) => {
    setOpen(open === id ? null : id);
    if (reads.has(id)) return;
    await supabase.from('portal_announcement_reads').upsert([{ announcement_id: id, dealer_id: me.dealer.id }], { onConflict: 'announcement_id,dealer_user_id', ignoreDuplicates: true });
    setReads(new Set([...reads, id])); refreshCounts();
  };

  const cats = Array.from(new Set(items.map(i => i.category)));
  const list = items.filter(i => !cat || i.category === cat);

  return (
    <div className="space-y-4">
      <PortalTitle title="Duyurular & Dokümanlar" subtitle="Kampanyalar, fiyat değişiklikleri, teknik bültenler ve dokümanlar" />
      <div className="flex flex-wrap gap-2">
        {['', ...cats].map(c => <button key={c} onClick={() => setCat(c)} className={`rounded-full px-3 py-1 text-xs ${cat === c ? 'bg-indigo-600 text-white' : 'border bg-white'}`}>{c || 'Tümü'}</button>)}
      </div>
      <div className="space-y-2">
        {list.length === 0 && <p className="text-sm text-slate-500">Duyuru yok.</p>}
        {list.map(a => (
          <div key={a.id} className={`rounded-xl border bg-white ${reads.has(a.id) ? 'border-slate-200' : 'border-indigo-300'}`}>
            <button onClick={() => markRead(a.id)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
              {a.is_pinned && <Pin className="h-4 w-4 text-amber-500" />}
              {!reads.has(a.id) && <span className="h-2 w-2 rounded-full bg-indigo-600" />}
              <span className={`flex-1 ${reads.has(a.id) ? '' : 'font-semibold'}`}>{a.title}</span>
              <Badge>{a.category}</Badge>
              <span className="text-xs text-slate-400">{formatDate(a.publish_at)}</span>
            </button>
            {open === a.id && (
              <div className="border-t px-4 py-3 text-sm">
                <p className="whitespace-pre-wrap text-slate-700">{a.body}</p>
                {a.link_url && <button onClick={() => openPortalFile(supabase, a.link_url)} className="mt-2 inline-flex items-center gap-1 text-indigo-600 hover:underline"><Paperclip className="h-3 w-3" />{fileLabel(a.link_url)}</button>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
