'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePortal, PortalTitle } from '@/components/portal/PortalShell';
import { StatusBadge } from '@/components/portal/common';
import { formatMoney, formatDate } from '@/lib/utils';
import { ORDER_STATUS, n } from '@/lib/portal';
import { termLabel } from '@/lib/dealer-pricing';
import { ChevronDown, ChevronRight, RotateCcw, Truck } from 'lucide-react';

const tl = (v: number) => `₺${formatMoney(v)}`;
const STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

export default function PortalOrders() {
  const { supabase } = usePortal();
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    supabase.rpc('portal_orders').then(({ data, error }: any) => {
      if (error) alert(error.message);
      setOrders(data || []); setLoading(false);
    });
  }, []);

  const reorder = (o: any) => {
    const cart: Record<string, number> = {};
    (o.items || []).forEach((i: any) => { if (i.product_id) cart[i.product_id] = n(i.quantity); });
    try { sessionStorage.setItem('portal_reorder', JSON.stringify(cart)); } catch { /* yok say */ }
    router.push('/portal/siparis-ver');
  };

  const list = orders.filter(o => !filter || o.status === filter);

  return (
    <div>
      <PortalTitle title="Siparişlerim" subtitle="Durum takibi, kalem detayları ve tek tıkla tekrar sipariş"
        action={<select value={filter} onChange={e => setFilter(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
          <option value="">Tüm durumlar</option>{Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>} />
      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? <p className="p-4 text-sm text-slate-400">Yükleniyor…</p> : list.length === 0 ? <p className="p-4 text-sm text-slate-500">Sipariş yok.</p> : list.map(o => {
          const step = STEPS.indexOf(o.status);
          return (
            <div key={o.id} className="border-b last:border-0">
              <button onClick={() => setOpen(open === o.id ? null : o.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50">
                {open === o.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="w-32 font-medium">{o.order_number}</span>
                <span className="w-24 text-slate-500">{o.order_date ? formatDate(o.order_date) : '-'}</span>
                <StatusBadge map={ORDER_STATUS} value={o.status} />
                <span className="text-xs text-slate-400">{termLabel(o.payment_term_days)}{o.source === 'portal' ? ' · Portal' : ''}</span>
                <span className="ml-auto font-semibold">{tl(n(o.total))}</span>
              </button>
              {open === o.id && (
                <div className="space-y-3 bg-slate-50 px-4 py-3">
                  {o.status !== 'cancelled' && (
                    <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
                      {STEPS.map((s, i) => (
                        <div key={s} className="flex items-center gap-1">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 ${i <= step ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{ORDER_STATUS[s].label}</span>
                          {i < STEPS.length - 1 && <span className={`h-0.5 w-4 ${i < step ? 'bg-indigo-600' : 'bg-slate-200'}`} />}
                        </div>
                      ))}
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-500"><th>Ürün</th><th className="text-right">Miktar</th><th className="text-right">Birim</th><th className="text-right">İsk.</th><th className="text-right">Tutar</th></tr></thead>
                    <tbody>
                      {(o.items || []).map((i: any, k: number) => (
                        <tr key={k} className="border-t">
                          <td className="py-1">{i.product_name || '-'}</td>
                          <td className="py-1 text-right">{n(i.quantity)}</td>
                          <td className="py-1 text-right">{tl(n(i.unit_price))}</td>
                          <td className="py-1 text-right">%{n(i.discount)}</td>
                          <td className="py-1 text-right">{tl(n(i.total))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-slate-500">KDV hariç {tl(n(o.subtotal))} · KDV {tl(n(o.tax_total))}
                      {o.delivery_date && <span className="ml-2 inline-flex items-center gap-1"><Truck className="h-3 w-3" />{formatDate(o.delivery_date)}</span>}</span>
                    <button onClick={() => reorder(o)} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-slate-100"><RotateCcw className="h-3 w-3" />Tekrar sipariş ver</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
