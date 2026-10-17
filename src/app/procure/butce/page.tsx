'use client';

// Bütçe — eğitim yılı (Eylül–Ağustos) bazında masraf merkezi × kategori
import Header from '@/components/Header';
import { Card } from '@/components/ui';
import ProcureGate from '@/components/procure/ProcureGate';
import BudgetBoard from '@/components/procure/BudgetBoard';

export default function BudgetPage() {
  return (
    <div>
      <Header title="Bütçe" subtitle="Satınalma" />
      <ProcureGate>{p => (p.hasRole('finance') || p.isAdmin || p.hasRole('buyer') || p.hasRole('approver'))
        ? <div className="p-3 sm:p-6"><BudgetBoard canEdit={p.hasRole('finance') || p.isAdmin} /></div>
        : <div className="p-6"><Card className="p-6 text-center text-sm text-slate-600">Bütçe ekranı mali işler, satınalma ve onaycı rolleri içindir.</Card></div>}
      </ProcureGate>
    </div>
  );
}
