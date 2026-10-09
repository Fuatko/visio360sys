'use client';

import { Badge } from '@/components/ui';
import { Paperclip, Upload, X } from 'lucide-react';
import { useState } from 'react';
import { StatusMap, st, uploadPortalFile, openPortalFile, fileLabel } from '@/lib/portal';

export function StatusBadge({ map, value }: { map: StatusMap; value: string }) {
  const s = st(map, value);
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function FileLink({ supabase, value }: { supabase: any; value?: string | null }) {
  if (!value) return null;
  return (
    <button type="button" onClick={() => openPortalFile(supabase, value)} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
      <Paperclip className="h-3 w-3" />{fileLabel(value)}
    </button>
  );
}

// Dosya yükle veya bağlantı yapıştır
export function FileField({ supabase, dealerId, value, onChange, label = 'Belge / fotoğraf' }:
  { supabase: any; dealerId: string; value: string; onChange: (v: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const onFile = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try { onChange(await uploadPortalFile(supabase, dealerId, f)); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <FileLink supabase={supabase} value={value} />
          <button type="button" onClick={() => onChange('')} className="ml-auto text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
            <Upload className="h-4 w-4" />{busy ? 'Yükleniyor…' : 'Dosya seç'}
            <input type="file" className="hidden" disabled={busy} onChange={e => onFile(e.target.files?.[0])} accept="image/*,.pdf,.xlsx,.xls,.doc,.docx" />
          </label>
          <span className="text-xs text-slate-400">veya</span>
          <input placeholder="https://… bağlantı" onBlur={e => e.target.value && onChange(e.target.value)}
            className="h-9 flex-1 rounded-lg border border-slate-200 px-2 text-sm" />
        </div>
      )}
    </div>
  );
}

export function Kpi({ label, value, sub, tone = 'slate', onClick }: { label: string; value: string; sub?: string; tone?: string; onClick?: () => void }) {
  const tones: Record<string, string> = {
    slate: 'text-slate-800', blue: 'text-blue-600', green: 'text-green-600', amber: 'text-amber-600', red: 'text-red-600', indigo: 'text-indigo-600',
  };
  return (
    <div onClick={onClick} className={`rounded-xl border border-slate-200 bg-white p-4 ${onClick ? 'cursor-pointer hover:border-blue-300 hover:shadow-sm' : ''}`}>
      <p className={`text-xl font-bold ${tones[tone] || tones.slate}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
      {sub && <p className="mt-1 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

export function Bar({ pct, tone }: { pct: number; tone?: string }) {
  const color = tone || (pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-blue-500');
  return <div className="h-2 rounded bg-slate-100"><div className={`h-2 rounded ${color}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={`border-b-2 px-3 py-2 text-sm ${value === t.key ? 'border-blue-600 font-medium text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          {t.label}{t.count ? <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
