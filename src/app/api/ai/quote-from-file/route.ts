import { NextResponse } from 'next/server';
import { adminClient, callerOrg } from '@/lib/parasut-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Word / PDF olarak hazırlanmış bir teklifi okuyup teklif formunu dolduracak yapılandırılmış veriye çevirir.
// Gerekli: ANTHROPIC_API_KEY. Dosya önce istemci tarafından quote-files/<kurum>/... altına yüklenir.
const MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';

const SCHEMA = `{
  "customer": { "name": string, "tax_number": string|null, "matched_customer_id": string|null },
  "subject": string|null,
  "quote_date": "YYYY-MM-DD"|null,
  "valid_until": "YYYY-MM-DD"|null,
  "currency": "TRY"|"USD"|"EUR"|"GBP",
  "payment_term_days": number|null,
  "general_discount_pct": number,
  "items": [ { "name": string, "description": string|null, "quantity": number, "unit": string|null, "unit_price": number, "discount_pct": number, "tax_rate": number, "matched_product_id": string|null } ],
  "totals": { "subtotal": number|null, "tax": number|null, "total": number|null },
  "notes": string|null,
  "warnings": [string]
}`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Yapay zekâ anahtarı (ANTHROPIC_API_KEY) tanımlı değil.' }, { status: 501 });
  const who = await callerOrg(request);
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { path, name } = await request.json().catch(() => ({}));
  if (!path || !String(path).startsWith(`${who.orgId}/`)) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });

  const admin = adminClient();
  const { data: blob, error: dErr } = await admin.storage.from('quote-files').download(path);
  if (dErr || !blob) return NextResponse.json({ error: 'Dosya okunamadı: ' + (dErr?.message || '') }, { status: 400 });
  const buf = Buffer.from(await blob.arrayBuffer());
  const lower = String(name || path).toLowerCase();

  let docBlock: any;
  if (lower.endsWith('.pdf')) {
    docBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } };
  } else if (lower.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer: buf });
    if (!value.trim()) return NextResponse.json({ error: 'Word dosyasında metin bulunamadı' }, { status: 400 });
    docBlock = { type: 'text', text: `TEKLİF DOSYASI METNİ (${name}):\n\n${value.slice(0, 60000)}` };
  } else {
    return NextResponse.json({ error: 'Yalnızca PDF ve .docx (Word) dosyaları okunabilir. Eski .doc dosyasını Word\'de .docx veya PDF olarak kaydedin.' }, { status: 400 });
  }

  const [cu, pr] = await Promise.all([
    admin.from('customers').select('id, name, legal_name, tax_number').eq('organization_id', who.orgId).limit(400),
    admin.from('products').select('id, name, code').eq('organization_id', who.orgId).limit(400),
  ]);
  const customers = (cu.data || []).filter((c: any) => c.name);
  const products = (pr.data || []).filter((p: any) => p.name);

  const prompt = `Ekteki belge bizim firmamızın müşterisine verdiği bir satış teklifidir. Belgeden teklif bilgilerini çıkar ve YALNIZCA aşağıdaki şemaya uyan geçerli bir JSON döndür (açıklama, kod bloğu yok).

Şema:
${SCHEMA}

Kurallar:
- Tutarlar sayı olsun (Türkçe yazımı çevir: "1.250,50" → 1250.5). Birim fiyat KDV HARİÇ olsun; belgede KDV dahil verilmişse KDV'yi ayırıp birim fiyatı hariç hesapla ve warnings'e yaz.
- tax_rate KDV oranıdır (yoksa 20). discount_pct satır iskonto yüzdesidir (yoksa 0). Genel iskonto varsa general_discount_pct'e yaz.
- Belgede tablo yerine metin halinde fiyatlar varsa her fiyatlı kalemi ayrı satır yap; fiyatı olmayan açıklama paragraflarını notes'a koy.
- Ödeme vadesi "30 gün", "peşin" gibi yazıyorsa payment_term_days (peşin=0).
- Teklif veren firma BİZİZ; customer teklifin hitap edildiği / verildiği firmadır.
- matched_customer_id: aşağıdaki müşteri listesinde aynı firma (unvan, kısaltma veya VKN ile) varsa onun id'si, yoksa null.
- matched_product_id: aşağıdaki ürün kataloğunda aynı ürün/hizmet varsa id'si, yoksa null. Emin değilsen null bırak.
- Belgede okunamayan, çelişkili veya toplamı tutmayan bir şey varsa warnings'e Türkçe kısa not yaz.

MÜŞTERİ LİSTESİ (id | ad | unvan | VKN):
${customers.map((c: any) => `${c.id} | ${c.name} | ${c.legal_name || ''} | ${c.tax_number || ''}`).join('\n') || '(boş)'}

ÜRÜN KATALOĞU (id | ad | kod):
${products.map((p: any) => `${p.id} | ${p.name} | ${p.code || ''}`).join('\n') || '(boş)'}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content: [docBlock, { type: 'text', text: prompt }] }] }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: j?.error?.message || `Yapay zekâ servisi hatası (${res.status})` }, { status: 502 });
  const text = (j.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
  let out: any;
  try { out = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { const m = text.match(/\{[\s\S]*\}/); try { out = m ? JSON.parse(m[0]) : null; } catch { out = null; } }
  if (!out || !Array.isArray(out.items)) return NextResponse.json({ error: 'Belgeden teklif bilgisi çıkarılamadı. Dosyanın teklif içerdiğinden emin olun.' }, { status: 422 });

  // Kimlikleri doğrula (uydurma id kabul edilmez)
  const cIds = new Set(customers.map((c: any) => c.id)), pIds = new Set(products.map((p: any) => p.id));
  if (out.customer && !cIds.has(out.customer.matched_customer_id)) out.customer.matched_customer_id = null;
  out.items = out.items.map((i: any) => ({
    name: String(i.name || '').slice(0, 300), description: i.description ? String(i.description).slice(0, 1000) : null,
    quantity: Number(i.quantity) || 1, unit: i.unit || null, unit_price: Number(i.unit_price) || 0,
    discount_pct: Number(i.discount_pct) || 0, tax_rate: i.tax_rate === 0 ? 0 : Number(i.tax_rate) || 20,
    matched_product_id: pIds.has(i.matched_product_id) ? i.matched_product_id : null,
  })).filter((i: any) => i.name);
  return NextResponse.json({ ok: true, data: out });
}
