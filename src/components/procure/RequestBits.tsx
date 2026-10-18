'use client';

// Talep ekranlarının ortak parçaları: durum rozeti, bütçe kutusu
import { AlertTriangle, CheckCircle2, Wallet } from 'lucide-react';
import { BudgetCheck, ORDER_STATUS, OrderStatus, REQUEST_STATUS, RFQ_STATUS, RequestStatus, RfqStatus, VENDOR_STATUS, VendorStatus, tl } from '@/lib/procure';

export function StatusBadge({ status }: { status: string }) {
  const s = REQUEST_STATUS[status as RequestStatus] || { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
}

export function VendorStatusBadge({ status }: { status: string }) {
  const s = VENDOR_STATUS[status as VendorStatus] || VENDOR_STATUS.candidate;
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
}

export function RfqStatusBadge({ status }: { status: string }) {
  const s = RFQ_STATUS[status as RfqStatus] || { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
}

export function OrderStatusBadge({ status }: { status: string }) {
  const s = ORDER_STATUS[status as OrderStatus] || { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
}

// "Bütçe: ₺X kullanılabilir → onaylanırsa ₺Y kalır"
export function BudgetBox({ check, compact }: { check: BudgetCheck | null | undefined; compact?: boolean }) {
  if (!check) return null;
  if (check.mode === 'off') return compact ? null : <p className="text-xs text-slate-400">Bütçe kontrolü kapalı.</p>;
  if (check.status === 'no_budget') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Bu birim/kategori için {check.fiscal_year} bütçesi tanımlı değil.</span>
      </div>
    );
  }
  const bad = check.status === 'insufficient';
  const Icon = bad ? AlertTriangle : CheckCircle2;
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${bad ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
      <p className="flex items-center gap-1.5 font-medium">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        Bütçe: {tl(check.available)} kullanılabilir → onaylanırsa {tl(check.after)} kalır
      </p>
      {!compact && (
        <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] opacity-80">
          <span className="inline-flex items-center gap-1"><Wallet className="h-3 w-3" />{check.fiscal_year} bütçesi {tl(check.amount)}</span>
          <span>Ön taahhüt {tl(check.pre_commitment)}</span>
          <span>Taahhüt {tl(check.commitment)}</span>
          <span>Gerçekleşen {tl(check.actual)}</span>
        </p>
      )}
      {bad && check.mode === 'block' && <p className="mt-1 text-[11px]">Kurum politikası: bütçe aşımını yalnızca mali işler veya satınalma yöneticisi gerekçeyle onaylayabilir.</p>}
    </div>
  );
}
