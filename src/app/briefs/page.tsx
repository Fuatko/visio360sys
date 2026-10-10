'use client';

import Header from '@/components/Header';
import { Card, Button, Input, Textarea, Modal } from '@/components/ui';
import BriefView, { briefToHtml, Brief } from '@/components/briefs/BriefView';
import { formatDate, formatDateTime } from '@/lib/utils';
import { printHtml } from '@/lib/print';
import { createClient } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { Sparkles, Plus, Printer, Settings2, Search, Trash2, Star, Loader2, AlertTriangle } from 'lucide-react';
import { CitySelect, SectorSelect } from '@/components/TrSelects';

const EMPTY = { company_name: '', website: '', sector: '', city: '', revenue: '', employees: '', contact_name: '', contact_title: '', meeting_goal: '', meeting_date: '', notes: '',
  customer_id: '', lead_id: '', opportunity_id: '' };
const STEPS = ['Web sitesi ve haberler taranıyor…', 'Finansal büyüklük ve sektör inceleniyor…', 'SWOT analizi hazırlanıyor…', 'Sorular ve itiraz cevapları yazılıyor…', 'Ürünlerinizle eşleştiriliyor…'];

export default function BriefsPage() {
  const supabase = createClient();
  const [briefs, setBriefs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [q, setQ] = useState('');
  const [tableMissing, setTableMissing] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from('account_briefs').select('id, company_name, website, meeting_date, created_at, status, rating, customer_id, lead_id').order('created_at', { ascending: false });
    if (error) { setTableMissing(true); return; }
    setBriefs(data || []);
  };
  const open = async (id: string) => {
    const { data } = await supabase.from('account_briefs').select('*').eq('id', id).single();
    setSelected(data);
  };

  useEffect(() => {
    load();
    supabase.from('org_sales_profile').select('*').maybeSingle().then(({ data }: any) => setProfile(data));
    // Lead / müşteri / fırsat kartından gelindiyse formu doldur
    (async () => {
      const p = new URLSearchParams(window.location.search);
      const f: any = { ...EMPTY };
      if (p.get('id')) { open(p.get('id')!); return; }
      if (p.get('lead')) {
        const { data: l } = await supabase.from('leads').select('*').eq('id', p.get('lead')).maybeSingle();
        if (l) Object.assign(f, { lead_id: l.id, company_name: l.company_name || '', contact_name: l.contact_name || '', contact_title: l.contact_title || '', website: l.website || '', notes: l.notes || '' });
      } else if (p.get('customer') || p.get('opportunity')) {
        let custId = p.get('customer');
        if (p.get('opportunity')) {
          const { data: o } = await supabase.from('opportunities').select('id, title, customer_id, notes').eq('id', p.get('opportunity')).maybeSingle();
          if (o) { f.opportunity_id = o.id; custId = o.customer_id; f.meeting_goal = o.title; f.notes = o.notes || ''; }
        }
        if (custId) {
          const { data: c } = await supabase.from('customers').select('*').eq('id', custId).maybeSingle();
          if (c) Object.assign(f, { customer_id: c.id, company_name: c.name || '', website: c.website || '', sector: c.industry || c.sector || '', city: c.city || '', contact_name: c.contact_name || c.contact_person || '', contact_title: c.contact_title || '' });
        }
      }
      if (f.company_name) setForm(f);
    })();
  }, []);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 15000);
    return () => clearInterval(t);
  }, [busy]);

  const generate = async () => {
    if (!form.company_name.trim()) { alert('Firma adı girin.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload: any = {};
      Object.entries(form).forEach(([k, v]) => { if (v !== '') payload[k] = v; });
      const res = await fetch('/api/ai/brief', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 501) { alert('Yapay zekâ anahtarı tanımlı değil. Vercel › Settings › Environment Variables bölümüne ANTHROPIC_API_KEY ekleyip yeniden yayınlayın.'); return; }
      if (!res.ok) { alert('Hazırlanamadı: ' + (j.error || res.statusText)); if (j.id) { load(); } return; }
      setForm(null); await load(); await open(j.id);
    } catch (e: any) {
      alert('Bağlantı hatası: ' + e.message + '\nAraştırma uzun sürmüş olabilir; birkaç dakika sonra listeyi yenileyin.');
      load();
    } finally { setBusy(false); }
  };

  const saveProfile = async () => {
    const payload = { company_summary: profile?.company_summary || null, value_proposition: profile?.value_proposition || null, target_segments: profile?.target_segments || null,
      differentiators: profile?.differentiators || null, references_text: profile?.references_text || null, pricing_notes: profile?.pricing_notes || null, updated_at: new Date().toISOString() };
    const { data, error } = profile?.id
      ? await supabase.from('org_sales_profile').update(payload).eq('id', profile.id).select().single()
      : await supabase.from('org_sales_profile').insert([payload]).select().single();
    if (error) { alert(error.message); return; }
    setProfile(data); setProfileOpen(false);
  };

  const saveOutcome = async (patch: any) => {
    const { error } = await supabase.from('account_briefs').update(patch).eq('id', selected.id);
    if (error) alert(error.message); else { setSelected({ ...selected, ...patch }); load(); }
  };
  const remove = async () => {
    if (!confirm('Hazırlık dosyası silinsin mi?')) return;
    await supabase.from('account_briefs').delete().eq('id', selected.id);
    setSelected(null); load();
  };

  const list = briefs.filter(b => !q || b.company_name.toLowerCase().includes(q.toLowerCase()));
  const pf = (k: string, l: string, ph = '') => <Textarea label={l} rows={2} placeholder={ph} value={profile?.[k] || ''} onChange={e => setProfile({ ...(profile || {}), [k]: e.target.value })} />;

  return (
    <div>
      <Header title="Görüşme Hazırlık" subtitle="Yapay zekâ müşteriyi araştırır: SWOT, görüşme stratejisi, sorular, itiraz cevapları" />
      <div className="space-y-4 p-6">
        {tableMissing && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /><b>satis-zekasi.sql</b> dosyasını Supabase'de çalıştırın.</Card>}
        {!profile?.value_proposition && !tableMissing && (
          <Card className="flex flex-wrap items-center gap-2 border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
            <Sparkles className="h-4 w-4" />Daha isabetli dosyalar için önce <b>satış profilinizi</b> doldurun (değer önerisi, referanslar, farkınız).
            <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setProfileOpen(true)}>Profili doldur</Button>
          </Card>
        )}
        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="p-3 lg:col-span-1">
            <div className="mb-2 flex gap-2">
              <Button className="flex-1" onClick={() => setForm({ ...EMPTY })}><Plus className="h-4 w-4" />Yeni hazırlık</Button>
              <Button variant="secondary" onClick={() => setProfileOpen(true)} title="Satış profilimiz"><Settings2 className="h-4 w-4" /></Button>
            </div>
            <div className="relative mb-2"><Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Firma ara" className="h-9 w-full rounded-lg border pl-8 text-sm" /></div>
            <div className="max-h-[65vh] space-y-1 overflow-y-auto">
              {list.length === 0 && <p className="p-2 text-xs text-slate-500">Henüz hazırlık dosyası yok.</p>}
              {list.map(b => (
                <button key={b.id} onClick={() => open(b.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected?.id === b.id ? 'bg-indigo-50 font-medium text-indigo-800' : 'hover:bg-slate-50'}`}>
                  {b.company_name}{b.status === 'failed' && <span className="ml-1 text-xs text-red-500">(hata)</span>}
                  <div className="flex items-center gap-1 text-[11px] font-normal text-slate-400">{b.meeting_date ? `Görüşme ${formatDate(b.meeting_date)}` : formatDate(b.created_at)}{b.rating ? <span className="flex items-center text-amber-500"><Star className="h-3 w-3 fill-amber-400" />{b.rating}</span> : null}</div>
                </button>
              ))}
            </div>
          </Card>

          <div className="lg:col-span-3">
            {!selected ? (
              <Card className="p-8 text-center">
                <Sparkles className="mx-auto mb-3 h-10 w-10 text-indigo-400" />
                <h2 className="text-lg font-semibold">Yeni bir firmayla görüşmeye hazırlıklı gidin</h2>
                <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">Firma adı ve web sitesini girin; sistem internette araştırıp firmanın SWOT'unu, muhtemel sorunlarını, sorulacak soruları, olası itirazlara cevapları ve hangi ürününüzü nasıl konumlayacağınızı hazırlasın. Aday müşteri, müşteri ve fırsat kartlarındaki <b>"Görüşmeye hazırlan"</b> düğmesiyle de açılır.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                <Card className="flex flex-wrap items-center gap-2 p-4">
                  <div className="mr-auto">
                    <h2 className="text-lg font-bold">{selected.company_name}</h2>
                    <p className="text-xs text-slate-500">{selected.website && <a href={selected.website.startsWith('http') ? selected.website : `https://${selected.website}`} target="_blank" rel="noopener" className="text-indigo-600">{selected.website}</a>} · Hazırlandı {formatDateTime(selected.created_at)}{selected.inputs?.contact_name ? ` · Görüşülecek: ${selected.inputs.contact_name}${selected.inputs.contact_title ? ' (' + selected.inputs.contact_title + ')' : ''}` : ''}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(selected.inputs || {}).map(([k, v]) => [k, v ?? ''])) })}><Sparkles className="h-3 w-3" />Yeniden hazırla</Button>
                  {selected.brief && <Button size="sm" variant="secondary" onClick={() => printHtml(`Hazırlık ${selected.company_name}`, briefToHtml(selected.company_name, selected.brief, selected.sources || [], `Hazırlanma: ${formatDateTime(selected.created_at)}`))}><Printer className="h-3 w-3" />Yazdır / PDF</Button>}
                  <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </Card>
                {selected.brief ? <BriefView brief={selected.brief as Brief} sources={selected.sources || []} /> : <Card className="p-4 text-sm text-red-600">{selected.error || 'Dosya hazırlanamadı.'} "Yeniden hazırla" ile tekrar deneyin.</Card>}
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold">Görüşme sonrası</h3>
                  <div className="mb-2 flex items-center gap-1 text-sm">Dosya ne kadar işe yaradı?
                    {[1, 2, 3, 4, 5].map(r => <button key={r} onClick={() => saveOutcome({ rating: r })}><Star className={`h-5 w-5 ${selected.rating >= r ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} /></button>)}
                  </div>
                  <Textarea placeholder="Görüşmede ne öğrendiniz? Sonraki adım?" value={selected.outcome_note || ''} onChange={e => setSelected({ ...selected, outcome_note: e.target.value })} />
                  <Button size="sm" className="mt-2" onClick={() => saveOutcome({ outcome_note: selected.outcome_note })}>Notu kaydet</Button>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={!!form} onClose={() => !busy && setForm(null)} title="Görüşme hazırlığı" size="lg"
        footer={busy ? undefined : <><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={generate}><Sparkles className="h-4 w-4" />Araştır ve hazırla</Button></>}>
        {form && (busy ? (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-indigo-600" />
            <p className="font-medium">{STEPS[step]}</p>
            <p className="mt-1 text-xs text-slate-500">Araştırma genellikle 1–3 dakika sürer. Pencereyi kapatmayın.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Firma adı *" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
              <Input label="Web sitesi" placeholder="ornek.com.tr" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
              <SectorSelect value={form.sector} onChange={v => setForm({ ...form, sector: v })} />
              <CitySelect value={form.city} onChange={v => setForm({ ...form, city: v })} />
              <Input label="Ciro (biliniyorsa)" placeholder="ör. 500 M TL" value={form.revenue} onChange={e => setForm({ ...form, revenue: e.target.value })} />
              <Input label="Çalışan sayısı" value={form.employees} onChange={e => setForm({ ...form, employees: e.target.value })} />
              <Input label="Görüşülecek kişi" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
              <Input label="Unvanı" value={form.contact_title} onChange={e => setForm({ ...form, contact_title: e.target.value })} />
              <Input label="Görüşme tarihi" type="date" value={form.meeting_date} onChange={e => setForm({ ...form, meeting_date: e.target.value })} />
            </div>
            <Input label="Görüşmenin amacı" placeholder="ör. İlk tanışma, ERP ihtiyacını anlamak, teklif sunumu" value={form.meeting_goal} onChange={e => setForm({ ...form, meeting_goal: e.target.value })} />
            <Textarea label="Bildiklerimiz / notlar" placeholder="Referansla geldi, rakip X ile çalışıyor, bütçe dönemi Ocak…" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            <p className="text-xs text-slate-500">Sistem yalnızca kamuya açık iş bilgilerini kullanır; kaynak bulamadığı rakamları uydurmaz ve "tahmini" olarak işaretler.</p>
          </div>
        ))}
      </Modal>

      <Modal isOpen={profileOpen} onClose={() => setProfileOpen(false)} title="Satış profilimiz (yapay zekâ bizi böyle tanır)" size="lg"
        footer={<><Button variant="secondary" onClick={() => setProfileOpen(false)}>İptal</Button><Button onClick={saveProfile}>Kaydet</Button></>}>
        <div className="space-y-3">
          {pf('company_summary', 'Biz kimiz, ne yapıyoruz?', 'ör. KOBİ ve kurumsal firmalara yönetim danışmanlığı ve yazılım…')}
          {pf('value_proposition', 'Müşteriye sağladığımız değer', 'ör. 90 günde ölçülebilir verimlilik artışı…')}
          {pf('target_segments', 'İdeal müşteri profili', 'ör. 50-500 çalışanlı üretim firmaları…')}
          {pf('differentiators', 'Rakiplerden farkımız', '')}
          {pf('references_text', 'Referanslar / başarı hikâyeleri', '')}
          {pf('pricing_notes', 'Fiyatlama yaklaşımı', 'ör. Proje bazlı; rakam vermeden önce keşif toplantısı…')}
          <p className="text-xs text-slate-500">Ürün kataloğunuz ve Rakipler sayfanız da otomatik olarak dikkate alınır.</p>
        </div>
      </Modal>
    </div>
  );
}
