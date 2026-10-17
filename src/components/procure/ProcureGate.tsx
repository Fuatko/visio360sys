'use client';

// /procure/* sayfalarının ortak kapısı: SQL kurulu mu, kurumda Procure lisansı var mı, rol yeterli mi
import { ReactNode } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { Card } from '@/components/ui';
import { PROCURE_SQL, ProcRole, roleLabel, useProcure } from '@/lib/procure';

export function SqlMissingCard({ file = PROCURE_SQL, children }: { file?: string; children?: ReactNode }) {
  return (
    <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{children || <>Satınalma modülü için <b>{file}</b> dosyasını Supabase'de çalıştırın.</>}</span>
    </Card>
  );
}

export default function ProcureGate({ children, role }: { children: (p: ReturnType<typeof useProcure>) => ReactNode; role?: ProcRole }) {
  const p = useProcure();
  if (p.loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;
  }
  if (!p.schemaReady) return <div className="p-6"><SqlMissingCard /></div>;
  if (!p.licensed) {
    return (
      <div className="p-6">
        <Card className="mx-auto max-w-lg p-8 text-center">
          <Lock className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="font-semibold text-slate-800">Bu modül kurumunuzda etkin değil</p>
          <p className="mt-1 text-sm text-slate-500">Inspira360 Procure (satınalma) lisansı için yöneticinizle görüşün.</p>
        </Card>
      </div>
    );
  }
  if (role && !p.hasRole(role)) {
    return (
      <div className="p-6">
        <Card className="mx-auto max-w-lg p-8 text-center">
          <Lock className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="font-semibold text-slate-800">Bu ekran için yetkiniz yok</p>
          <p className="mt-1 text-sm text-slate-500">Gerekli satınalma rolü: {roleLabel(role)}.</p>
        </Card>
      </div>
    );
  }
  return <>{children(p)}</>;
}
