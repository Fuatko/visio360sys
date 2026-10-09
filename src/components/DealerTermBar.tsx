'use client';

import { formatMoney } from '@/lib/utils';
import { PAYMENT_TERMS } from '@/lib/dealer-pricing';
import { Store, RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  termDays: number;
  onTermChange: (days: number) => void;
  dealer: { name?: string; dealer_level?: string | null } | null;
  credit?: { limit: number | null; open: number; after: number; exceeded: boolean; available: number | null } | null;
  onReapply?: () => void;
}

export default function DealerTermBar({ termDays, onTermChange, dealer, credit, onReapply }: Props) {
  const known = PAYMENT_TERMS.some(t => t.days === termDays);
  return (
    <div className={`space-y-2 rounded-lg border p-3 text-sm ${dealer ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-slate-600">Ödeme vadesi</label>
        <select value={known ? String(termDays) : 'custom'} onChange={(e) => e.target.value !== 'custom' && onTermChange(Number(e.target.value))}
          className="h-8 rounded border border-slate-200 bg-white px-2 text-sm">
          {PAYMENT_TERMS.map(t => <option key={t.days} value={t.days}>{t.label}</option>)}
          {!known && <option value="custom">{termDays} gün</option>}
        </select>
        <input type="number" min={0} value={termDays} onChange={(e) => onTermChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="h-8 w-20 rounded border border-slate-200 bg-white px-2 text-sm" title="Gün" />
        {dealer && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-800">
            <Store className="h-3.5 w-3.5" />Bayi{dealer.dealer_level ? ` · ${dealer.dealer_level}` : ''} — fiyat ve iskonto bayi kurallarına göre uygulanır
          </span>
        )}
        {dealer && onReapply && (
          <button type="button" onClick={onReapply} className="ml-auto flex items-center gap-1 text-xs text-indigo-600 hover:underline">
            <RefreshCw className="h-3 w-3" />Bayi fiyatlarını yeniden uygula
          </button>
        )}
      </div>
      {credit && credit.limit !== null && (
        <div className={`flex items-center gap-2 text-xs ${credit.exceeded ? 'text-red-700' : 'text-slate-600'}`}>
          {credit.exceeded && <AlertTriangle className="h-3.5 w-3.5" />}
          Kredi limiti ₺{formatMoney(credit.limit)} · açık alacak ₺{formatMoney(credit.open)} · bu belgeyle ₺{formatMoney(credit.after)}
          {credit.exceeded ? ' — LİMİT AŞILIYOR' : ` · kalan ₺${formatMoney(credit.limit - credit.after)}`}
        </div>
      )}
    </div>
  );
}
