import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Görüşme Hazırlık Dosyası: Claude + web arama ile müşteri araştırması
// Gerekli: ANTHROPIC_API_KEY (Vercel ortam değişkeni). İsteğe bağlı: AI_MODEL
const MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 40);

type Json = Record<string, any>;

const SCHEMA = `{
  "company_overview": "3-5 cümle: ne yapar, hangi pazarlarda, ölçeği",
  "key_facts": [{"label": "Kuruluş / Ciro / Çalışan / Merkez / Ortaklık yapısı ...", "value": "..."}],
  "recent_news": [{"title": "...", "date": "YYYY-MM veya bilinmiyor", "summary": "1 cümle", "url": "..."}],
  "swot": {"strengths": ["..."], "weaknesses": ["..."], "opportunities": ["..."], "threats": ["..."]},
  "likely_pain_points": [{"pain": "...", "evidence": "neden böyle düşünüyoruz"}],
  "decision_makers": [{"name": "...", "title": "...", "note": "yaklaşım önerisi"}],
  "meeting_strategy": {"objective": "bu görüşmenin gerçekçi hedefi", "opening": "ilk 60 saniyede söylenecek açılış", "agenda": ["..."], "tone": "üslup önerisi"},
  "discovery_questions": [{"question": "...", "why": "bu soru neyi ortaya çıkarır"}],
  "objections": [{"objection": "müşterinin muhtemel itirazı", "response": "önerilen cevap"}],
  "our_fit": [{"product": "bizim ürün/hizmetimizin adı", "pitch": "bu müşteriye nasıl konumlanır"}],
  "competitive_angle": "rakiplerimize karşı nasıl ayrışırız",
  "red_flags": ["dikkat edilmesi gereken riskler"],
  "next_steps": ["görüşme sonrası önerilen adımlar"],
  "confidence_note": "hangi bilgiler kaynakla doğrulandı, hangileri tahmin"
}`;

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

function extractJson(text: string): Json | null {
  const tagged = text.match(/<brief_json>([\s\S]*?)<\/brief_json>/);
  const raw = tagged ? tagged[1] : (text.match(/```json\s*([\s\S]*?)```/)?.[1] ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  try { return JSON.parse(raw.trim()); } catch { return null; }
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

  const system = `Sen deneyimli bir B2B satış stratejisti ve kurumsal araştırma analistisin. Türkçe yazarsın.
Görevin: satış temsilcisinin bir firmayla yapacağı görüşmeye hazırlık dosyası hazırlamak.
Kurallar:
- Önce web aramasıyla firmayı araştır: resmi web sitesi, faaliyet alanı, ürünler, ölçek (ciro, çalışan), son 12-18 ay haberleri, yatırımlar, ihracat, yöneticiler, KAP/Borsa İstanbul açıklamaları (halka açıksa), sektör dinamikleri.
- Bulamadığın bilgiyi UYDURMA. Rakamları sadece kaynakta görürsen yaz; tahminse "tahmini" de. Kişi isimlerini sadece kaynakta görürsen ver.
- Kişisel/özel hayata ilişkin bilgi toplama; yalnızca iş bağlamında kamuya açık bilgileri kullan.
- SWOT'u müşterinin kendi işi açısından yap (bizim açımızdan değil).
- Sorular açık uçlu, keşif odaklı olsun (durum, sorun, etki, karar süreci, bütçe, zamanlama).
- İtiraz cevapları bizim ürün ve değer önerimize dayansın; abartılı vaat verme, fiyat uydurma.
- Bizim ürünlerimizden bu müşteriye gerçekten uyanları seç; uymuyorsa açıkça söyle.
- Çıktının sonunda yalnızca <brief_json>...</brief_json> etiketleri arasında, aşağıdaki şemaya uyan geçerli JSON ver. JSON dışında açıklama gerekmez.
Şema:
${SCHEMA}`;

  const userMsg = `Hazırlık dosyası istenen firma:
${JSON.stringify({
    firma: company, web_sitesi: input.website || null, sektor: input.sector || null, ciro: input.revenue || null, calisan: input.employees || null,
    sehir: input.city || null, gorusulecek_kisi: input.contact_name || null, kisinin_unvani: input.contact_title || null,
    gorusme_amaci: input.meeting_goal || null, gorusme_tarihi: input.meeting_date || null, temsilcinin_notlari: input.notes || null,
  }, null, 2)}

CRM'imizdeki geçmiş:
${JSON.stringify(crm, null, 2)}

Bizim şirketimiz:
${JSON.stringify(ourContext, null, 2)}`;

  const messages: Json[] = [{ role: 'user', content: userMsg }];
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: Number(process.env.AI_MAX_SEARCHES || 6),
    user_location: { type: 'approximate', country: 'TR', timezone: 'Europe/Istanbul' } }];

  const sources = new Map<string, string>();
  let text = '';
  try {
    for (let turn = 0; turn < 4; turn++) {
      const resp = await callClaude(apiKey, { model: MODEL, max_tokens: 12000, system, tools, messages });
      for (const b of resp.content || []) {
        if (b.type === 'text') {
          text += b.text;
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

  const brief = extractJson(text);
  const srcList = Array.from(sources.entries()).slice(0, 25).map(([u, t]) => ({ url: u, title: t }));
  const row = {
    company_name: company, website: input.website || null, customer_id: input.customer_id || null, lead_id: input.lead_id || null,
    opportunity_id: input.opportunity_id || null, meeting_date: input.meeting_date || null,
    inputs: input, brief, sources: srcList, model: MODEL,
    status: brief ? 'ready' : 'failed', error: brief ? null : 'Yapay zekâ çıktısı okunamadı',
  };
  const { data: saved, error } = await db.from('account_briefs').insert([row]).select().single();
  if (error) return NextResponse.json({ error: 'Kaydedilemedi: ' + error.message, brief }, { status: 500 });
  if (!brief) return NextResponse.json({ error: 'Yapay zekâ çıktısı okunamadı, lütfen tekrar deneyin.', id: saved.id }, { status: 502 });
  return NextResponse.json({ id: saved.id });
}
