'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Button } from '@/components/ui';
import { loadWhitespace, UNCATEGORIZED, type WSData } from '@/lib/whitespace';
import { MarkEditor, Legend, STATE, tl } from '@/components/whitespace/WhitespaceUI';
import { Grid3x3, ExternalLink } from 'lucide-react';

/** Müşteri kartı: bu müşterinin kategori bazında alım durumu ve çapraz satış önerileri */
export default function CrossSell({ supabase, customer }: { supabase: any; customer: any }) {
  const [d, setD] = useState<WSData | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const load = useCallback(async () => { setD(await loadWhitespace(supabase, { customerId: customer.id })); }, [customer.id]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <Card className="p-6 text-sm text-slate-500">Yükleniyor…</Card>;
  const offs = d.offerings.filter(o => o !== UNCATEGORIZED || d.cells[customer.id]?.[o]);
  const order = ['buying', 'quoted', 'opportunity', 'lapsed', 'suggested', 'empty', 'competitor', 'not_now', 'no_need'];
  const rows = offs.map(o => {
    const st = d.stateOf(customer.id, o); const sg = d.suggestions.find(s => s.offering === o);
    return { o, st: st === 'empty' && sg ? 'suggested' as const : st, x: d.cells[customer.id]?.[o], sg, m: d.marks[customer.id]?.[o] };
  }).sort((a, b) => order.indexOf(a.st) - order.indexOf(b.st) || (b.x?.rev12 || 0) - (a.x?.rev12 || 0));
  const buying = rows.filter(r => r.st === 'buying');
  const potential = rows.reduce((a, r) => a + (r.sg?.est || 0), 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Grid3x3 className="h-4 w-4 text-indigo-600" />Beyaz alan / çapraz satış</p>
          <p className="text-xs text-slate-500">{offs.length} kategoriden {buying.length} tanesinde son 12 ayda alım var{potential > 0 ? ` · boş alanların tahmini yıllık potansiyeli ${tl(potential)}` : ''}</p>
        </div>
        <span className="flex-1" /><Legend />
        <Link href="/whitespace"><Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" />Tüm müşteriler</Button></Link>
      </div>
      {offs.length === 0 ? <p className="p-4 text-sm text-slate-500">Henüz kategori yok. Paraşüt fatura kategorileri veya ürün kataloğu kategorileri burada listelenir.</p> : (
        <div className="divide-y">{rows.map(r => (
          <button key={r.o} onClick={() => setEdit(r.o)} className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
            <span className={`w-32 shrink-0 rounded-full border px-2 py-0.5 text-center text-[11px] ${STATE[r.st].cls}`}>{STATE[r.st].label}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.o}</p>
              <p className="truncate text-xs text-slate-500">
                {r.st === 'buying' ? `${r.x!.count} belge · son alım ${r.x!.last ? new Date(r.x!.last).toLocaleDateString('tr-TR') : '-'}${r.x!.products.length ? ' · ' + r.x!.products.slice(0, 4).join(', ') : ''}`
                  : r.sg ? r.sg.reason
                  : r.m ? [r.m.competitor, r.m.note].filter(Boolean).join(' · ') || STATE[r.st].label
                  : 'Bu kategoride alım yok. Değerlendirme girmek için tıklayın.'}
              </p>
            </div>
            <p className="w-32 text-right">{r.st === 'buying' ? <><b>{tl(r.x!.rev12)}</b><span className="block text-[10px] text-slate-400">son 12 ay</span></>
              : r.sg ? <><b className="text-indigo-700">{tl(r.sg.est)}</b><span className="block text-[10px] text-slate-400">tahmini / yıl</span></> : null}</p>
          </button>
        ))}</div>
      )}
      {edit && <MarkEditor supabase={supabase} data={d} customer={customer} offering={edit} onClose={() => setEdit(null)} onSaved={load} />}
    </Card>
  );
}
