'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { parasutCall } from '@/lib/parasut-client';
import { PDoc, openTry, daysSince } from '@/lib/parasut-recon';
import { Wallet } from 'lucide-react';

const tl = (v: any) => `${Number(v) < 0 ? '-' : ''}₺${formatMoney(Math.abs(Math.round(Number(v) || 0)))}`;

/** Müşteri kartında Paraşüt cari durumu: alacağımız, borcumuz, net ve açık faturalar */
export default function ParasutBalance({ customerId }: { customerId: string }) {
  const [d, setD] = useState<{ connected: boolean; documents: PDoc[] } | null>(null);
  useEffect(() => { parasutCall(`/api/parasut/balance?customer_id=${customerId}`).then(setD).catch(() => setD(null)); }, [customerId]);
  if (!d?.connected || !d.documents.length) return null;

  const t = new Date().toISOString().slice(0, 10);
  const open = d.documents.filter(x => Number(x.net_total_try) > 0 && openTry(x) > 0.5)
    .sort((a, b) => String(a.due_date || a.issue_date).localeCompare(String(b.due_date || b.issue_date)));
  const rec = open.filter(x => x.kind === 'sales_invoice'), pay = open.filter(x => x.kind === 'purchase_bill');
  const s = (a: PDoc[]) => a.reduce((x, y) => x + openTry(y), 0);
  const od = (a: PDoc[]) => s(a.filter(x => x.due_date && x.due_date < t));
  const net = s(rec) - s(pay);

  return (
    <Card className="p-4">
      <p className="flex items-center gap-1 text-sm font-semibold"><Wallet className="h-4 w-4 text-indigo-600" />Cari durum (Paraşüt)</p>
      {!open.length ? <p className="mt-1 text-xs text-emerald-700">Açık fatura yok, hesap kapalı.</p> : (<>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div><p className="text-[11px] text-slate-500">Alacağımız</p><p className="font-bold text-emerald-700">{tl(s(rec))}</p>{od(rec) > 0 && <p className="text-[10px] text-red-600">{tl(od(rec))} vadesi geçmiş</p>}</div>
          <div><p className="text-[11px] text-slate-500">Borcumuz</p><p className="font-bold text-amber-700">{tl(s(pay))}</p>{od(pay) > 0 && <p className="text-[10px] text-red-600">{tl(od(pay))} vadesi geçmiş</p>}</div>
        </div>
        {rec.length > 0 && pay.length > 0 && <p className={`mt-2 rounded bg-slate-50 px-2 py-1 text-xs font-medium ${net >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>Net: {tl(net)} {net >= 0 ? '(bize borçlu)' : '(biz borçluyuz)'} · mahsuplaşma yapılabilir</p>}
        <div className="mt-2 space-y-1 text-xs">{open.slice(0, 6).map(x => {
          const late = x.due_date && x.due_date < t;
          return <p key={x.id} className="flex justify-between gap-2"><span className="truncate">{x.kind === 'sales_invoice' ? '↗' : '↙'} {x.doc_no || 'Fatura'} <span className="text-slate-400">vade {x.due_date ? new Date(x.due_date).toLocaleDateString('tr-TR') : '-'}</span>{late && <span className="text-red-600"> · {daysSince(x.due_date)} gün gecikti</span>}</span><span className={x.kind === 'sales_invoice' ? 'text-emerald-700' : 'text-amber-700'}>{tl(openTry(x))}</span></p>;
        })}</div>
        <Link href="/integrations" className="mt-2 block text-xs text-indigo-600">Tüm cari bakiyeler →</Link>
      </>)}
    </Card>
  );
}
