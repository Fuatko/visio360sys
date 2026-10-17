'use client';

// Inspira360 Procure — Satınalma paneli (Faz 0: kurulum durumu ve roller; iş akışı ekranları Faz 1'de)
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Badge } from '@/components/ui';
import ProcureGate from '@/components/procure/ProcureGate';
import { createClient } from '@/lib/supabase';
import { MONTHS_TR, PROC_ROLES, SETUP_STEPS, fiscalYearOf, roleLabel } from '@/lib/procure';
import { formatMoney } from '@/lib/utils';
import { ArrowRight, Building, Clock, Tags, UserCheck, Wand2 } from 'lucide-react';

export default function ProcurePage() {
  return (
    <div>
      <Header title="Satınalma Paneli" subtitle="Inspira360 Procure" />
      <ProcureGate>{p => <Panel roles={p.roles} isAdmin={p.isAdmin} />}</ProcureGate>
    </div>
  );
}

function Panel({ roles, isAdmin }: { roles: string[]; isAdmin: boolean }) {
  const supabase = createClient();
  const [s, setS] = useState<{ policy: any; cc: number; cat: number; mem: number } | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('proc_policies').select('*').maybeSingle(),
      supabase.from('proc_cost_centers').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('proc_categories').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('proc_members').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ]).then(([pol, cc, cat, mem]) => setS({ policy: pol.data, cc: cc.count || 0, cat: cat.count || 0, mem: mem.count || 0 }));
  }, []);

  if (!s) return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;

  const progress = s.policy?.setup_progress || {};
  const finished = SETUP_STEPS.filter(x => progress[x.key]).length;
  const pct = Math.round((finished / SETUP_STEPS.length) * 100);
  const startMonth = s.policy?.fiscal_year_start_month || 9;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Card className="p-4">
        <p className="text-sm text-slate-600">Satınalma rolleriniz</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {roles.length ? roles.map(r => <Badge key={r} variant="primary">{roleLabel(r)}</Badge>) : <span className="text-sm text-slate-400">Henüz satınalma rolünüz yok. Satınalma yöneticinizden rol isteyin.</span>}
        </div>
      </Card>

      {isAdmin && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1B3A5C]/10 text-[#1B3A5C]"><Wand2 className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">Kurulum sihirbazı</p>
              <p className="text-sm text-slate-500">{finished}/{SETUP_STEPS.length} adım tamamlandı veya atlandı · %{pct}</p>
              <div className="mt-2 h-2 max-w-md overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#10B981]" style={{ width: `${pct}%` }} /></div>
            </div>
            <Link href="/procure/setup" className="inline-flex items-center gap-1 rounded-lg bg-[#1B3A5C] px-3 py-2 text-sm font-medium text-white hover:opacity-90">{pct < 100 ? 'Kuruluma devam et' : 'Kurulumu düzenle'}<ArrowRight className="h-4 w-4" /></Link>
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" />Bütçe yılı</p><p className="mt-1 text-xl font-bold text-slate-800">{fiscalYearOf(new Date(), startMonth)}</p><p className="text-[11px] text-slate-400">Başlangıç: {MONTHS_TR[startMonth - 1]}</p></Card>
        <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><Building className="h-3.5 w-3.5" />Masraf merkezi</p><p className="mt-1 text-xl font-bold text-slate-800">{s.cc}</p><p className="text-[11px] text-slate-400">Aktif birim</p></Card>
        <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><Tags className="h-3.5 w-3.5" />Kategori</p><p className="mt-1 text-xl font-bold text-slate-800">{s.cat}</p><p className="text-[11px] text-slate-400">Aktif satınalma kategorisi</p></Card>
        <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><UserCheck className="h-3.5 w-3.5" />Rol atanmış kullanıcı</p><p className="mt-1 text-xl font-bold text-slate-800">{s.mem}</p><p className="text-[11px] text-slate-400">Adminler ayrıca otomatik yöneticidir</p></Card>
      </div>

      {s.policy && (
        <Card className="p-4 text-sm text-slate-700">
          <p className="mb-2 font-semibold text-slate-800">Geçerli politika</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>3 teklif eşiği: {s.policy.three_quote_threshold != null ? `₺${formatMoney(s.policy.three_quote_threshold)} (KDV hariç)` : 'kapalı'}</li>
            <li>Bütçe kontrolü: {{ off: 'kapalı', warn: 'uyar', block: 'engelle' }[s.policy.budget_check as string] || s.policy.budget_check}</li>
            <li>Fatura toleransı: fiyat %{s.policy.invoice_price_tolerance_pct}, miktar %{s.policy.invoice_qty_tolerance_pct}</li>
            <li>Tedarikçi yeniden değerlendirme: {s.policy.vendor_reevaluation_months} ay</li>
          </ul>
        </Card>
      )}

      <Card className="border-dashed p-4 text-sm text-slate-600">
        Talep, onay, teklif toplama, sipariş ve mal kabul ekranları bir sonraki sürümde bu panele eklenecek. Roller: {PROC_ROLES.map(r => r.label).join(', ')}.
      </Card>
    </div>
  );
}
