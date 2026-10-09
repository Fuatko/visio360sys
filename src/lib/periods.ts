// Dönem yardımcıları: "2026-10" (ay), "2026-Q4" (çeyrek), "2026" (yıl)

export function periodRange(period: string): [string, string] | null {
  const p = (period || '').trim();
  let m = p.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const y = +m[1], mo = +m[2];
    const end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
    return [`${m[1]}-${m[2]}-01`, end];
  }
  m = p.match(/^(\d{4})-Q([1-4])$/i);
  if (m) {
    const y = +m[1], q = +m[2];
    const startMonth = (q - 1) * 3 + 1;
    const end = new Date(Date.UTC(y, startMonth + 2, 0)).toISOString().slice(0, 10);
    return [`${y}-${String(startMonth).padStart(2, '0')}-01`, end];
  }
  m = p.match(/^(\d{4})$/);
  if (m) return [`${m[1]}-01-01`, `${m[1]}-12-31`];
  return null;
}

export function currentPeriods(date = new Date()) {
  const y = date.getFullYear();
  const mo = date.getMonth() + 1;
  return {
    month: `${y}-${String(mo).padStart(2, '0')}`,
    quarter: `${y}-Q${Math.ceil(mo / 3)}`,
    year: `${y}`,
  };
}

export function periodLabel(period: string) {
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  let m = period.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${MONTHS[+m[2] - 1]} ${m[1]}`;
  m = period.match(/^(\d{4})-Q([1-4])$/i);
  if (m) return `${m[1]} ${m[2]}. Çeyrek`;
  return period;
}

export const inRange = (date: string | null | undefined, range: [string, string] | null) =>
  !!date && !!range && date.slice(0, 10) >= range[0] && date.slice(0, 10) <= range[1];
