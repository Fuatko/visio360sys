'use client';

import { useEffect, useState, useCallback } from 'react';
import { calcRebate, RebateProgram, RebateResult } from '@/lib/rebates';
import { orderNetAmount } from '@/lib/sales-flow';

export interface ProgramProgress { program: RebateProgram; tiers: any[]; result: RebateResult; payout: any | null }

// Bayinin siparişleri, faturaları, hedefleri ve prim programlarındaki ilerlemesi
export function usePortalSales(supabase: any, dealerId: string) {
  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [targets, setTargets] = useState<any[]>([]);
  const [programs, setPrograms] = useState<ProgramProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [o, i, t, p, tr, po] = await Promise.all([
      supabase.rpc('portal_orders'),
      supabase.rpc('portal_invoices'),
      supabase.rpc('portal_targets'),
      supabase.from('rebate_programs').select('*').order('period_end', { ascending: false }),
      supabase.from('rebate_tiers').select('*'),
      supabase.from('rebate_payouts').select('*'),
    ]);
    const err = [o, i, t, p].find((x: any) => x.error)?.error;
    if (err) setError(err.message);
    const ords = (o.data || []).map((x: any) => ({ ...x, customer_id: dealerId }));
    const invs = (i.data || []).map((x: any) => ({ ...x, customer_id: dealerId }));
    setOrders(ords); setInvoices(invs); setTargets(t.data || []);

    const progs: ProgramProgress[] = [];
    for (const prog of (p.data || []) as RebateProgram[]) {
      const tiers = (tr.data || []).filter((x: any) => x.program_id === prog.id);
      let achieved = 0;
      if (prog.basis === 'collections') {
        const { data: stmt } = await supabase.rpc('portal_statement', { p_from: prog.period_start, p_to: prog.period_end });
        achieved = (stmt?.lines || []).reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
      } else if (prog.basis === 'invoices') {
        achieved = invs.filter((x: any) => x.status !== 'cancelled' && x.issue_date >= prog.period_start && x.issue_date <= prog.period_end)
          .reduce((s: number, x: any) => s + (Number(x.subtotal) || 0) - (Number(x.discount_amount) || 0), 0);
      } else {
        achieved = ords.filter((x: any) => x.status !== 'cancelled' && (x.order_date || '').slice(0, 10) >= prog.period_start && (x.order_date || '').slice(0, 10) <= prog.period_end)
          .reduce((s: number, x: any) => s + orderNetAmount(x), 0);
      }
      progs.push({ program: prog, tiers, result: calcRebate(achieved, tiers, prog.calc_mode), payout: (po.data || []).find((x: any) => x.program_id === prog.id) || null });
    }
    setPrograms(progs);
    setLoading(false);
  }, [dealerId]);

  useEffect(() => { load(); }, [load]);
  return { orders, invoices, targets, programs, loading, error, reload: load };
}
