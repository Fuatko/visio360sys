'use client';

import { useEffect, useState } from 'react';

const fmt = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '' : Math.round(v).toLocaleString('tr-TR'));

/** Binlik ayraçlı tutar girişi (2.096.000). Yalnızca rakamlar okunur; boş = null */
export default function MoneyInput({ value, onChange, className = '', placeholder }: { value: number | null | undefined; onChange: (v: number | null) => void; className?: string; placeholder?: string }) {
  const [text, setText] = useState(fmt(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(fmt(value)); }, [value, focus]);
  return (
    <input inputMode="numeric" value={text} placeholder={placeholder} className={className}
      onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); setText(fmt(value)); }}
      onChange={e => {
        const digits = e.target.value.replace(/[^\d]/g, '');
        const v = digits ? Number(digits) : null;
        setText(digits ? Number(digits).toLocaleString('tr-TR') : '');
        onChange(v);
      }} />
  );
}
