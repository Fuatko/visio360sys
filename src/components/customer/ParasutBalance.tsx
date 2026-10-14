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
  const [d, setD] = useState<{ connected: boolean; documents: PDoc[]; contacts?: any[]; contact_error?: string | null; sync_from?: string; live?: PDoc[]; live_ok?: boolean; live_errors?: string[]; recent?: any[]; raw?: Record<string, number> } | null>(null);
  useEffect(() => { parasutCall(`/api/parasut/balance?customer_id=${customerId}`).then(setD).catch(() => setD(null)); }, [customerId]);
  if (!d?.connected) return null;
  const pc = (d.contacts || []).filter(c => c.trl_balance !== null || c.balance !== null);
  const pBal = pc.reduce((a, c) => a + (Number(c.trl_balance ?? c.balance) || 0), 0);

  const t = new Date().toISOString().slice(0, 10);
  const useLive = !!d.live_ok;
  const liveNos = new Set((d.live || []).map(x => `${x.kind}:${x.doc_no}`));
  const merged = useLive ? [...(d.live || []), ...d.documents.filter(x => !liveNos.has(`${x.kind}:${x.doc_no}`))] : d.documents;
  const open = merged.filter(x => Number(x.net_total_try) > 0 && openTry(x) > 0.5)
    .sort((a, b) => String(a.due_date || a.issue_date).localeCompare(String(b.due_date || b.issue_date)));
  const rec = open.filter(x => x.kind === 'sales_invoice'), pay = open.filter(x => x.kind === 'purchase_bill');
  const s = (a: PDoc[]) => a.reduce((x, y) => x + openTry(y), 0);
  const od = (a: PDoc[]) => s(a.filter(x => x.due_date && x.due_date < t));
  const net = s(rec) - s(pay);
  // Paraşüt bakiyesinin yönünü açık faturalardan çıkar (Paraşüt yalnızca sayı gönderir)
  const dir: 'same' | 'flip' | null = useLive && Math.abs(pBal) >= 0.5 ? (Math.abs(net - pBal) <= Math.max(1, Math.abs(pBal) * 0.01) ? 'same' : Math.abs(net + pBal) <= Math.max(1, Math.abs(pBal) * 0.01) ? 'flip' : null) : null;
  const signed = dir === 'flip' ? -pBal : pBal;

  return (
    <Card className="p-4">
      <p className="flex items-center gap-1 text-sm font-semibold"><Wallet className="h-4 w-4 text-indigo-600" />Cari durum (Paraşüt)</p>
      {pc.length > 0 && (
        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-[11px] text-slate-500">Paraşüt cari bakiyesi (tüm geçmiş, canlı)</p>
          <p className={`text-lg font-bold ${Math.abs(pBal) < 0.5 || !dir ? 'text-slate-700' : signed > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{tl(Math.abs(pBal))}</p>
          <p className="text-[11px] text-slate-500">{Math.abs(pBal) < 0.5 ? 'Hesap kapalı' : dir ? (signed > 0 ? 'Bize borçlu (alacağımız)' : 'Biz borçluyuz (ödememiz gereken)') : 'Paraşüt\'te görünen bakiye; ayrıntısı aşağıdaki açık faturalarda'}</p>
          {pc.length > 1 && <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">{pc.map(c => <p key={c.id} className="flex justify-between gap-2"><span className="truncate">{c.name}{c.account_type === 'supplier' ? ' (tedarikçi)' : c.account_type === 'customer' ? ' (müşteri)' : ''}</span><span>{tl(c.trl_balance ?? c.balance)}</span></p>)}</div>}
        </div>
      )}
      {!pc.length && !d.contact_error && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">Paraşüt'te bu VKN veya unvanla cari bulunamadı. Kartın Firma bilgileri sekmesindeki vergi numarasını Paraşüt'tekiyle karşılaştırın.</p>}
      {d.contact_error && <p className="mt-1 text-[10px] text-slate-400">Paraşüt carisi okunamadı: {d.contact_error}</p>}
      {!useLive && d.live_errors?.length ? <p className="mt-1 text-[10px] text-slate-400">Açık faturalar Paraşüt'ten canlı okunamadı, eşitlenen veriler gösteriliyor: {d.live_errors.join(' | ')}</p> : null}
      {!open.length ? <p className="mt-2 text-xs text-slate-500">{useLive ? 'Paraşüt\'te bu cariye ait açık (ödenmemiş) satış veya alış faturası yok.' : `${d.sync_from ? new Date(d.sync_from).toLocaleDateString('tr-TR') + ' sonrası eşitlenen' : 'Eşitlenen'} faturalarda açık kalem yok.`}</p> : (<>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div><p className="text-[11px] text-slate-500">Alacağımız</p><p className="font-bold text-emerald-700">{tl(s(rec))}</p>{od(rec) > 0 && <p className="text-[10px] text-red-600">{tl(od(rec))} vadesi geçmiş</p>}</div>
          <div><p className="text-[11px] text-slate-500">Borcumuz</p><p className="font-bold text-amber-700">{tl(s(pay))}</p>{od(pay) > 0 && <p className="text-[10px] text-red-600">{tl(od(pay))} vadesi geçmiş</p>}</div>
        </div>
        {rec.length > 0 && pay.length > 0 && <p className={`mt-2 rounded bg-slate-50 px-2 py-1 text-xs font-medium ${net >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>Net: {tl(net)} {net >= 0 ? '(bize borçlu)' : '(biz borçluyuz)'} · mahsuplaşma yapılabilir</p>}
        <div className="mt-2 space-y-1 text-xs">{open.slice(0, 12).map(x => {
          const late = x.due_date && x.due_date < t;
          return <p key={x.id} className="flex justify-between gap-2"><span className="truncate">{x.kind === 'sales_invoice' ? '↗' : '↙'} {x.doc_no || 'Fatura'} <span className="text-slate-400">vade {x.due_date ? new Date(x.due_date).toLocaleDateString('tr-TR') : '-'}</span>{late && <span className="text-red-600"> · {daysSince(x.due_date)} gün gecikti</span>}</span><span className={x.kind === 'sales_invoice' ? 'text-emerald-700' : 'text-amber-700'}>{tl(openTry(x))}</span></p>;
        })}</div>
        </>)}
      {(d.recent?.length || 0) > 0 && (
        <details className="mt-2 text-[11px]">
          <summary className="cursor-pointer text-slate-500">Paraşüt'teki son faturalar (ayrıntı)</summary>
          <div className="mt-1 space-y-2">{(d.contacts || []).map(c => {
            const rs = (d.recent || []).filter(r => r.contact_id === c.id);
            return (<div key={c.id}>
              <p className="font-medium text-slate-700">{c.name} <span className="font-normal text-slate-400">{c.account_type === 'supplier' ? 'tedarikçi' : c.account_type === 'customer' ? 'müşteri' : c.account_type || ''}{c.tax_number ? ' · VKN ' + c.tax_number : ''} · bakiye {tl(c.trl_balance ?? c.balance)}</span></p>
              {rs.length === 0 ? <p className="text-slate-400">Fatura yok</p> : rs.map((r, i) => (
                <p key={i} className="flex justify-between gap-2 text-slate-600"><span className="truncate">{r.kind === 'sales_invoice' ? '↗ Satış' : '↙ Alış'} {r.doc_no || ''} {r.issue_date ? new Date(r.issue_date).toLocaleDateString('tr-TR') : ''} <span className="text-slate-400">{r.item_type || ''} · {r.payment_status || '-'}</span></span><span>{tl(r.gross)}{Math.abs(r.remaining) >= 0.5 ? <span className="text-red-600"> (kalan {tl(r.remaining)})</span> : null}</span></p>))}
            </div>);
          })}</div>
        </details>
      )}
      {d.raw && <p className="mt-1 text-[10px] text-slate-400">Paraşüt'ten okunan: {d.raw.sales_invoice || 0} satış, {d.raw.purchase_bill || 0} alış belgesi · {(d.contacts || []).length} cari</p>}
      <Link href="/integrations" className="mt-2 block text-xs text-indigo-600">Tüm cari bakiyeler →</Link>
    </Card>
  );
}
