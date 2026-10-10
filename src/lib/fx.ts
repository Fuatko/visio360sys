// Döviz: TCMB kurları, para birimi gösterimi, çevrim
import { formatMoney } from '@/lib/utils';

export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
export const SYMBOL: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
export const CUR_LABEL: Record<string, string> = { TRY: '₺ Türk lirası', USD: '$ ABD doları', EUR: '€ Euro', GBP: '£ İngiliz sterlini' };

export const money = (v: number, cur?: string | null) => `${SYMBOL[cur || 'TRY'] || (cur ? cur + ' ' : '₺')}${formatMoney(Number(v) || 0)}`;

export interface FxRates { date: string; rates: Record<string, { buy: number; sell: number; banknoteSell: number | null }> }

const cache: Record<string, Promise<FxRates | null>> = {};
export function getRates(date?: string): Promise<FxRates | null> {
  const key = date || 'today';
  if (!cache[key]) {
    cache[key] = fetch(`/api/fx${date ? `?date=${date}` : ''}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  }
  return cache[key];
}

// 1 birim dövizin TL karşılığı (TCMB döviz satış)
export const toTry = (rates: FxRates | null, cur?: string | null) => (!cur || cur === 'TRY' ? 1 : rates?.rates[cur]?.sell || 0);

// Fiyatı bir para biriminden diğerine çevir (TL üzerinden çapraz)
export function convert(amount: number, from: string | null | undefined, to: string | null | undefined, rates: FxRates | null, docRate?: number) {
  const f = from || 'TRY', t = to || 'TRY';
  if (f === t) return amount;
  const fromTry = f === 'TRY' ? 1 : toTry(rates, f);
  const toTryRate = t === 'TRY' ? 1 : (docRate || toTry(rates, t));
  if (!fromTry || !toTryRate) return amount;
  return Math.round(amount * fromTry / toTryRate * 100) / 100;
}
