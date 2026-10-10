import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Görüşme Hazırlık Dosyası: Claude + web arama ile müşteri araştırması
// Gerekli: ANTHROPIC_API_KEY (Vercel ortam değişkeni). İsteğe bağlı: AI_MODEL
const MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 40);

type Json = Record<string, any>;

async function callClaude(apiKey: string, body: Json) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Yapay zekâ servisi hatası (${res.status})`);
  return j;
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'NO_AI_KEY' }, { status: 501 });

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 401 });
  const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return NextResponse.json({ error: 'Oturum geçersiz' }, { status: 401 });
  const { data: isDealer } = await db.rpc('is_dealer_user');
  if (isDealer) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });

  let input: Json;
  try { input = await request.json(); } catch { return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 }); }
  const company = String(input.company_name || '').trim();
  if (!company) return NextResponse.json({ error: 'Firma adı gerekli' }, { status: 400 });

  // Günlük kullanım sınırı (maliyet kontrolü)
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from('account_briefs').select('id', { count: 'exact', head: true }).gte('created_at', since);
  if ((count || 0) >= DAILY_LIMIT) return NextResponse.json({ error: `Günlük hazırlık dosyası sınırına (${DAILY_LIMIT}) ulaşıldı.` }, { status: 429 });

  // Bizim şirket bağlamı
  const [profile, products, competitors] = await Promise.all([
    db.from('org_sales_profile').select('*').maybeSingle(),
    db.from('products').select('name, category, description, price, status').limit(80),
    db.from('competitors').select('name, strengths, weaknesses, price_level, main_products').limit(20),
  ]);
  // CRM'deki geçmiş (varsa)
  let crm: Json = {};
  if (input.customer_id) {
    const [c, acts, opps, ords] = await Promise.all([
      db.from('customers').select('*').eq('id', input.customer_id).maybeSingle(),
      db.from('crm_activities').select('type, title, description, activity_date').eq('customer_id', input.customer_id).order('activity_date', { ascending: false }).limit(15),
      db.from('opportunities').select('title, stage, value, expected_close, notes').eq('customer_id', input.customer_id).limit(10),
      db.from('orders').select('order_date, total, status').eq('customer_id', input.customer_id).order('order_date', { ascending: false }).limit(10),
    ]);
    const cust = c.data ? Object.fromEntries(Object.entries(c.data).filter(([k]) => !['id', 'organization_id', 'assigned_to', 'price_list_id'].includes(k))) : null;
    crm = { customer: cust, activities: acts.data, opportunities: opps.data, recent_orders: ords.data };
  } else if (input.lead_id) {
    const { data: l } = await db.from('leads').select('company_name, contact_name, contact_title, source, status, score, estimated_value, notes, last_contact').eq('id', input.lead_id).maybeSingle();
    crm = { lead: l };
  }

  const ourContext = {
    biz: profile.data ? {
      ozet: profile.data.company_summary, deger_onerisi: profile.data.value_proposition, hedef_segment: profile.data.target_segments,
      farkimiz: profile.data.differentiators, referanslar: profile.data.references_text, fiyatlama: profile.data.pricing_notes,
    } : 'Satış profili girilmemiş; ürün listesinden çıkarım yap.',
    urunlerimiz: (products.data || []).filter((p: any) => (p.status || 'active') === 'active').map((p: any) => ({ ad: p.name, kategori: p.category, aciklama: p.description })),
    rakiplerimiz: competitors.data || [],
  };

  const context = `Hazırlık dosyası istenen firma:
${JSON.stringify({
    firma: company, web_sitesi: input.website || null, sektor: input.sector || null, ciro: input.revenue || null, calisan: input.employees || null,
    sehir: input.city || null, gorusulecek_kisi: input.contact_name || null, kisinin_unvani: input.contact_title || null,
    gorusme_amaci: input.meeting_goal || null, gorusme_tarihi: input.meeting_date || null, temsilcinin_notlari: input.notes || null,
  }, null, 2)}

CRM'imizdeki geçmiş:
${JSON.stringify(crm, null, 2)}

Bizim şirketimiz:
${JSON.stringify(ourContext, null, 2)}`;

  const rules = `Kurallar:
- Bulamadığın bilgiyi UYDURMA. Rakamları sadece kaynakta görürsen yaz; tahminse "tahmini" de. Kişi isimlerini sadece kaynakta görürsen ver.
- Yalnızca iş bağlamında kamuya açık bilgileri kullan; kişisel/özel hayat bilgisi toplama.
- Türkçe yaz.`;

  // ---- 1. Aşama: web araştırması (serbest metin notlar) ----
  const researchSystem = `Sen kurumsal araştırma analistisin. Bir satış görüşmesi öncesi firmayı web'de araştırıp olgu notları çıkarırsın.
Araştır: resmi web sitesi, faaliyet alanı ve ürünler, ölçek (ciro, çalışan, tesis), ortaklık yapısı, son 12-18 ay haberleri, yatırımlar, ihracat pazarları,
yöneticiler, KAP/Borsa İstanbul açıklamaları (halka açıksa), sektör dinamikleri ve rakipleri.
Çıktın: madde madde, kaynak URL'leriyle birlikte olgu notları ve sektörel bağlam. Satış önerisi yazma, sadece bul ve not et.
${rules}`;
  const messages: Json[] = [{ role: 'user', content: context + '\n\nBu firmayı araştır ve olgu notlarını çıkar.' }];
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: Number(process.env.AI_MAX_SEARCHES || 6),
    user_location: { type: 'approximate', country: 'TR', timezone: 'Europe/Istanbul' } }];

  const sources = new Map<string, string>();
  let notes = '';
  try {
    for (let turn = 0; turn < 4; turn++) {
      const resp = await callClaude(apiKey, { model: MODEL, max_tokens: 6000, system: researchSystem, tools, messages });
      for (const b of resp.content || []) {
        if (b.type === 'text') {
          notes += b.text;
          (b.citations || []).forEach((c: any) => c.url && sources.set(c.url, c.title || c.url));
        }
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
          b.content.forEach((r: any) => r.url && !sources.has(r.url) && sources.set(r.url, r.title || r.url));
        }
      }
      if (resp.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: resp.content }); continue; }
      break;
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  // ---- 2. Aşama: yapılandırılmış hazırlık dosyası (araç çağrısıyla garanti JSON) ----
  const strategySystem = `Sen deneyimli bir B2B satış stratejistisin. Araştırma notlarını ve bizim şirket bilgimizi kullanarak satış temsilcisi için görüşme hazırlık dosyası hazırlarsın.
- SWOT'u müşterinin kendi işi açısından yap (bizim açımızdan değil).
- Sorular açık uçlu ve keşif odaklı olsun (mevcut durum, sorun, etkisi, karar süreci, bütçe, zamanlama).
- İtiraz cevapları bizim ürün ve değer önerimize dayansın; abartılı vaat verme, fiyat uydurma.
- Ürünlerimizden bu müşteriye gerçekten uyanları seç; uymuyorsa açıkça söyle.
- Haberlerde ve olgularda sadece araştırma notlarındaki bilgileri kullan; URL'leri notlardan al.
${rules}
Sonucu mutlaka save_brief aracını çağırarak ver.`;
  const str = { type: 'string' };
  const strArr = { type: 'array', items: str };
  const obj = (props: Record<string, any>) => ({ type: 'object', properties: props });
  const briefTool = {
    name: 'save_brief',
    description: 'Görüşme hazırlık dosyasını kaydeder.',
    input_schema: {
      type: 'object',
      properties: {
        company_overview: str,
        key_facts: { type: 'array', items: obj({ label: str, value: str }) },
        recent_news: { type: 'array', items: obj({ title: str, date: str, summary: str, url: str }) },
        swot: obj({ strengths: strArr, weaknesses: strArr, opportunities: strArr, threats: strArr }),
        likely_pain_points: { type: 'array', items: obj({ pain: str, evidence: str }) },
        decision_makers: { type: 'array', items: obj({ name: str, title: str, note: str }) },
        meeting_strategy: obj({ objective: str, opening: str, agenda: strArr, tone: str }),
        discovery_questions: { type: 'array', items: obj({ question: str, why: str }) },
        objections: { type: 'array', items: obj({ objection: str, response: str }) },
        our_fit: { type: 'array', items: obj({ product: str, pitch: str }) },
        competitive_angle: str,
        red_flags: strArr,
        next_steps: strArr,
        confidence_note: str,
      },
      required: ['company_overview', 'swot', 'meeting_strategy', 'discovery_questions', 'objections', 'our_fit', 'confidence_note'],
    },
  };

  let brief: Json | null = null;
  let diag = '';
  try {
    const resp = await callClaude(apiKey, {
      model: MODEL, max_tokens: 12000, system: strategySystem,
      tools: [briefTool], tool_choice: { type: 'tool', name: 'save_brief' },
      messages: [{ role: 'user', content: `${context}\n\nARAŞTIRMA NOTLARI:\n${notes || '(web araştırmasında bilgi bulunamadı; genel sektör bilgisine dayan ve bunu güvenilirlik notunda belirt)'}` }],
    });
    const tu = (resp.content || []).find((b: any) => b.type === 'tool_use' && b.name === 'save_brief');
    if (tu?.input && typeof tu.input === 'object') brief = tu.input;
    else diag = `stop_reason=${resp.stop_reason}`;
    if (resp.stop_reason === 'max_tokens') diag = 'Çıktı uzunluk sınırına takıldı';
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
  if (brief && !brief.company_overview && !brief.swot) { diag = diag || 'Boş çıktı'; brief = null; }

  const srcList = Array.from(sources.entries()).slice(0, 25).map(([u, t]) => ({ url: u, title: t }));
  const row = {
    company_name: company, website: input.website || null, customer_id: input.customer_id || null, lead_id: input.lead_id || null,
    opportunity_id: input.opportunity_id || null, meeting_date: input.meeting_date || null,
    inputs: input, brief, sources: srcList, model: MODEL,
    status: brief ? 'ready' : 'failed', error: brief ? null : `Yapay zekâ çıktısı okunamadı (${diag})`,
  };
  const { data: saved, error } = await db.from('account_briefs').insert([row]).select().single();
  if (error) return NextResponse.json({ error: 'Kaydedilemedi: ' + error.message, brief }, { status: 500 });
  if (!brief) return NextResponse.json({ error: `Yapay zekâ çıktısı okunamadı (${diag}), lütfen tekrar deneyin.`, id: saved.id }, { status: 502 });
  return NextResponse.json({ id: saved.id });
}
