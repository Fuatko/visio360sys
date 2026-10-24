'use client';

import { useState } from 'react';
import { ILLER, sectorOptions, BOLGE_GENEL, COGRAFI_BOLGELER, UNVAN_CALISAN, UNVAN_ORTAK } from '@/lib/tr-data';

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

// Bölge: genel seçenekler, 7 coğrafi bölge ve 81 il
export function RegionSelect({ label = 'Bölge', value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  const known = [...BOLGE_GENEL, ...COGRAFI_BOLGELER, ...ILLER];
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select value={value || ''} onChange={e => onChange(e.target.value)} className={cls}>
        <option value="">Seçiniz</option>
        {value && !known.includes(value) && <option value={value}>{value}</option>}
        <optgroup label="Genel">{BOLGE_GENEL.map(b => <option key={b} value={b}>{b}</option>)}</optgroup>
        <optgroup label="Coğrafi bölgeler">{COGRAFI_BOLGELER.map(b => <option key={b} value={b}>{b}</option>)}</optgroup>
        <optgroup label="İller">{ILLER.map(il => <option key={il} value={il}>{il}</option>)}</optgroup>
      </select>
    </div>
  );
}

// Unvan: çalışan / iş ortağı için öneri listesi; listede yoksa "Diğer" ile serbest yazılır
export function TitleSelect({ label = 'Unvan', value, onChange, partner = false }: { label?: string; value: string; onChange: (v: string) => void; partner?: boolean }) {
  const primary = partner ? UNVAN_ORTAK : UNVAN_CALISAN;
  const secondary = partner ? UNVAN_CALISAN : UNVAN_ORTAK;
  const known = [...primary, ...secondary];
  const [custom, setCustom] = useState(false);
  const isCustom = custom || (!!value && !known.includes(value));
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select value={isCustom ? '__other' : value || ''} onChange={e => { const v = e.target.value; setCustom(v === '__other'); onChange(v === '__other' ? (known.includes(value) ? '' : value) : v); }} className={cls}>
        <option value="">Seçiniz</option>
        <optgroup label={partner ? 'İş ortağı unvanları' : 'Çalışan unvanları'}>{primary.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>
        <optgroup label={partner ? 'Çalışan unvanları' : 'İş ortağı unvanları'}>{secondary.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>
        <option value="__other">Diğer (yazın)</option>
      </select>
      {isCustom && <input autoFocus={custom} value={value} onChange={e => onChange(e.target.value)} placeholder="Unvanı yazın" className={`${cls} mt-1`} />}
    </div>
  );
}
