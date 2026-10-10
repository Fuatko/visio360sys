'use client';

import { useState } from 'react';
import { ILLER, sectorOptions } from '@/lib/tr-data';

const cls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500';

export function CitySelect({ label = 'Şehir', value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select value={value || ''} onChange={e => onChange(e.target.value)} className={cls}>
        <option value="">Seçiniz</option>
        {value && !ILLER.includes(value) && <option value={value}>{value}</option>}
        {ILLER.map(il => <option key={il} value={il}>{il}</option>)}
      </select>
    </div>
  );
}

// Listeden seçilir; "Diğer" seçilirse serbest yazılabilir
export function SectorSelect({ label = 'Sektör', value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  const opts = sectorOptions(value);
  const [custom, setCustom] = useState(false);
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select value={custom ? 'Diğer' : value || ''} onChange={e => { const v = e.target.value; setCustom(v === 'Diğer'); onChange(v === 'Diğer' ? '' : v); }} className={cls}>
        <option value="">Seçiniz</option>
        {opts.map(s => <option key={s} value={s}>{s === 'Diğer' ? 'Diğer (yazın)' : s}</option>)}
      </select>
      {custom && <input autoFocus value={value} onChange={e => onChange(e.target.value)} placeholder="Sektörü yazın" className={`${cls} mt-1`} />}
    </div>
  );
}
