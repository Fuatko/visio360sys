'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePortal, PortalTitle } from '@/components/portal/PortalShell';
import { usePortalSales } from '@/components/portal/usePortalSales';
import { Kpi, Bar, StatusBadge } from '@/components/portal/common';
import { formatMoney, formatDate } from '@/lib/utils';
import { ORDER_STATUS, n } from '@/lib/portal';
import { currentPeriods, periodRange, periodLabel, inRange } from '@/lib/periods';
import { orderNetAmount } from '@/lib/sales-flow';
import { termLabel } from '@/lib/dealer-pricing';
import { ShoppingCart, ShieldCheck, LifeBuoy, Wallet, Trophy, Phone, Mail, Bell, ArrowRight } from 'lucide-react';

const tl = (v: number) => `₺${formatMoney(v)}`;

export default function PortalHome() {
  const { supabase, me, counts } = usePortal();
  const router = useRouter();
  const { orders, targets, programs, loading } = usePortalSales(supabase, me.dealer.id);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const cp = currentPeriods();

  useEffect(() => {
    supabase.from('portal_announcements').select('id, title, category, publish_at, is_pinned')
      .order('is_pinned', { ascending: false }).order('publish_at', { ascending: false }).limit(4)
      .then(({ data }: any) => setAnnouncements(data || []));
  }, []);

  const active = orders.filter(o => o.status !== 'cancelled');
  const sales = (p: string) => active.filter(o => inRange(o.order_date, periodRange(p))).reduce((s, o) => s + orderNetAmount(o), 0);
  const qSales = sales(cp.quarter);
  const qTarget = targets.find((t: any) => t.period === cp.quarter) || targets.find((t: any) => t.period === cp.year);
  const qTargetSales = qTarget ? sales(qTarget.period) : 0;
  const limit = me.dealer.credit_limit;
  const available = limit !== null && limit !== undefined ? n(limit) - n(me.open_balance) : null;
  const activePrograms = programs.filter(p => p.program.period_end >= new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-5">
      <PortalTitle title={`Hoş geldiniz, ${me.user.full_name?.split(' ')[0] || me.dealer.name}`}
        subtitle={`${me.dealer.dealer_level ? me.dealer.dealer_level + ' bayi · ' : ''}Standart vade: ${termLabel(me.dealer.payment_term_days)}`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={`Siparişlerim · ${periodLabel(cp.quarter)}`} value={tl(qSales)} tone="blue"
          sub={qTarget ? `Hedef ${tl(n(qTarget.target_amount))} · %${Math.round(qTargetSales / Math.max(1, n(qTarget.target_amount)) * 100)}` : undefined}
          onClick={() => router.push('/portal/primler')} />
        <Kpi label="Açık bakiye" value={tl(n(me.open_balance))} tone="amber" onClick={() => router.push('/portal/finans')} />
        <Kpi label="Vadesi geçen" value={tl(n(me.overdue))} tone={n(me.overdue) > 0 ? 'red' : 'green'} onClick={() => router.push('/portal/finans')} />
        <Kpi label="Kullanılabilir kredi" value={available === null ? 'Limitsiz' : tl(available)} tone={available !== null && available < 0 ? 'red' : 'green'}
          sub={limit ? `Limit ${tl(n(limit))}` : undefined} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: '/portal/siparis-ver', icon: ShoppingCart, label: 'Sipariş ver', d: 'Size özel fiyatlarla' },
          { href: '/portal/firsatlar', icon: ShieldCheck, label: 'Fırsat kaydet', d: 'Projenizi koruma altına alın' },
          { href: '/portal/talepler', icon: LifeBuoy, label: 'Garanti / destek', d: 'Seri numarasıyla talep açın' },
          { href: '/portal/finans', icon: Wallet, label: 'Ödeme bildir', d: 'Havale, çek, kart' },
        ].map(a => (
          <Link key={a.href} href={a.href} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300 hover:shadow-sm">
            <div className="rounded-lg bg-indigo-50 p-2"><a.icon className="h-5 w-5 text-indigo-600" /></div>
            <div><p className="text-sm font-medium">{a.label}</p><p className="text-xs text-slate-500">{a.d}</p></div>
          </Link>
        ))}
      </div>

      {activePrograms.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900"><Trophy className="h-4 w-4" />Ciro primi durumunuz</h2>
          <div className="space-y-4">
            {activePrograms.map(({ program, result, tiers }) => {
              const maxT = Math.max(...tiers.map((t: any) => n(t.threshold)), 1);
              return (
                <div key={program.id}>
                  <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-medium">{program.name}</span>
                    <span className="text-slate-600">Ciro {tl(result.achieved)} · Hak edilen prim <b className="text-green-700">{tl(result.rebate)}</b></span>
                  </div>
                  <Bar pct={result.achieved / maxT * 100} tone="bg-amber-500" />
                  <p className="mt-1 text-xs text-slate-600">
                    {result.next
                      ? <>Bir sonraki basamağa <b>{tl(result.toNext)}</b> kaldı → prim oranınız %{n(result.next.rate_pct)} olur, priminiz <b>{tl(result.nextRebate)}</b>'ye çıkar.</>
                      : 'En üst basamaktasınız. Tebrikler!'}
                    <span className="text-slate-400"> · Dönem sonu {formatDate(program.period_end)}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Son siparişlerim</h2>
            <Link href="/portal/siparisler" className="flex items-center gap-1 text-xs text-indigo-600">Tümü<ArrowRight className="h-3 w-3" /></Link>
          </div>
          {loading ? <p className="text-sm text-slate-400">Yükleniyor…</p> : orders.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz siparişiniz yok. <Link href="/portal/siparis-ver" className="text-indigo-600">İlk siparişinizi verin</Link></p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {orders.slice(0, 6).map(o => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{o.order_number}</td>
                    <td className="py-2 text-slate-500">{o.order_date ? formatDate(o.order_date) : '-'}</td>
                    <td className="py-2"><StatusBadge map={ORDER_STATUS} value={o.status} /></td>
                    <td className="py-2 text-right">{tl(n(o.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1 text-sm font-semibold"><Bell className="h-4 w-4" />Duyurular{counts.announcements ? <span className="rounded-full bg-amber-400 px-1.5 text-[10px]">{counts.announcements} yeni</span> : null}</h2>
              <Link href="/portal/duyurular" className="text-xs text-indigo-600">Tümü</Link>
            </div>
            {announcements.length === 0 ? <p className="text-xs text-slate-500">Duyuru yok.</p> : announcements.map(a => (
              <Link key={a.id} href="/portal/duyurular" className="block border-b py-1.5 text-sm last:border-0 hover:text-indigo-700">
                {a.title}<span className="block text-[11px] text-slate-400">{a.category} · {formatDate(a.publish_at)}</span>
              </Link>
            ))}
          </div>
          {me.sales_rep && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <h2 className="mb-1 text-sm font-semibold">Bölge / bayi sorumlunuz</h2>
              <p className="font-medium">{me.sales_rep.name}</p>
              {me.sales_rep.phone && <a href={`tel:${me.sales_rep.phone}`} className="flex items-center gap-1 text-indigo-600"><Phone className="h-3 w-3" />{me.sales_rep.phone}</a>}
              {me.sales_rep.email && <a href={`mailto:${me.sales_rep.email}`} className="flex items-center gap-1 text-indigo-600"><Mail className="h-3 w-3" />{me.sales_rep.email}</a>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
