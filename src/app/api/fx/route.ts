import { NextResponse } from 'next/server';

// TCMB gösterge kurları (döviz alış / satış). ?date=YYYY-MM-DD verilirse o günün (tatilse önceki iş gününün) kuru.
export const revalidate = 3600;

type Rate = { buy: number; sell: number; banknoteSell: number | null };

function parse(xml: string): { date: string; rates: Record<string, Rate> } | null {
  const dm = xml.match(/Tarih="(\d{2})\.(\d{2})\.(\d{4})"/);
  if (!dm) return null;
  const rates: Record<string, Rate> = {};
  const re = /<Currency[^>]*Kod="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const body = m[2];
    const get = (tag: string) => { const x = body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)); return x && x[1].trim() ? Number(x[1].trim()) : null; };
    const unit = get('Unit') || 1;
    const buy = get('ForexBuying'), sell = get('ForexSelling'), bs = get('BanknoteSelling');
    if (buy && sell) rates[m[1]] = { buy: buy / unit, sell: sell / unit, banknoteSell: bs ? bs / unit : null };
  }
  return { date: `${dm[3]}-${dm[2]}-${dm[1]}`, rates };
}

async function fetchXml(url: string) {
  const res = await fetch(url, { next: { revalidate: 3600 }, headers: { 'User-Agent': 'SatisPro/1.0' } });
  if (!res.ok) return null;
  return parse(await res.text());
}

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date');
  try {
    let result = null;
    const today = new Date().toISOString().slice(0, 10);
    if (!date || date >= today) {
      result = await fetchXml('https://www.tcmb.gov.tr/kurlar/today.xml');
    } else {
      // Hafta sonu / tatil: geriye doğru en fazla 10 gün dene
      const d = new Date(date + 'T12:00:00Z');
      for (let i = 0; i < 10 && !result; i++) {
        const y = d.getUTCFullYear(), mo = String(d.getUTCMonth() + 1).padStart(2, '0'), da = String(d.getUTCDate()).padStart(2, '0');
        result = await fetchXml(`https://www.tcmb.gov.tr/kurlar/${y}${mo}/${da}${mo}${y}.xml`);
        d.setUTCDate(d.getUTCDate() - 1);
      }
    }
    if (!result) return NextResponse.json({ error: 'TCMB kuru alınamadı' }, { status: 502 });
    return NextResponse.json({ source: 'TCMB', ...result });
  } catch (e: any) {
    return NextResponse.json({ error: 'TCMB kuru alınamadı: ' + e.message }, { status: 502 });
  }
}
