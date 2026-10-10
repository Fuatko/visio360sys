'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { ILLER } from '@/lib/tr-data';
import { TIMELINES, SOURCES } from '@/lib/franchise';
import { CheckCircle2, ShieldCheck, Store } from 'lucide-react';

const BUDGETS: [string, string][] = [['', 'Seçin'], ['1000000', '1 milyon ₺ altı'], ['2000000', '1 – 3 milyon ₺'], ['4000000', '3 – 5 milyon ₺'], ['7500000', '5 – 10 milyon ₺'], ['12000000', '10 milyon ₺ üzeri']];

export default function FranchiseApplyPage() {
  const supabase = createClient();
  const { token } = useParams<{ token: string }>();
  const [cfg, setCfg] = useState<any>(undefined);
  const [f, setF] = useState<any>({ full_name: '', phone: '', email: '', city: '', district: '', company_name: '', occupation: '', investment_budget: '',
    has_location: false, location_address: '', location_sqm: '', experience: '', timeline: '', source: '', message: '', kvkk_accepted: false, marketing_consent: false, website: '' });
  const [showKvkk, setShowKvkk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(String(token))) { setCfg(null); return; }
    supabase.rpc('public_franchise_form', { p_token: token }).then(({ data, error }: any) => setCfg(error ? null : data));
  }, [token]);

  const submit = async () => {
    if (f.website) { setDone(true); return; }   // bot tuzağı
    if (!f.full_name.trim()) { alert('Ad soyad gerekli.'); return; }
    if (!f.phone.trim() && !f.email.trim()) { alert('Telefon veya e-posta gerekli.'); return; }
    if (!f.city) { alert('Şehir seçin.'); return; }
    if (!f.kvkk_accepted) { alert('KVKK aydınlatma metnini onaylayın.'); return; }
    setBusy(true);
    const { website, ...p } = f;
    const { error } = await supabase.rpc('public_franchise_apply', { p_token: token, p });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setDone(true);
  };

  const shell = (c: React.ReactNode) => <div className="min-h-screen bg-gradient-to-b from-slate-100 to-white px-4 py-8"><div className="mx-auto w-full max-w-xl">{c}</div></div>;
  if (cfg === undefined) return shell(<div className="mx-auto mt-20 h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />);
  if (cfg === null) return shell(<div className="rounded-2xl bg-white p-8 text-center shadow"><p className="text-sm text-slate-600">Başvuru formu bulunamadı veya şu an başvuru kabul edilmiyor.</p></div>);
  if (done) return shell(
    <div className="rounded-2xl bg-white p-8 text-center shadow">
      <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-green-500" />
      <h1 className="text-xl font-bold">Başvurunuz alındı</h1>
      <p className="mt-2 text-sm text-slate-600">{cfg.brand} franchise ekibi başvurunuzu inceleyip en kısa sürede sizinle iletişime geçecek. İlginiz için teşekkür ederiz.</p>
    </div>);

  const inp = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500';
  const lbl = 'mb-1 block text-xs font-medium text-slate-600';
  return shell(
    <div className="overflow-hidden rounded-2xl bg-white shadow">
      <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 px-6 py-6 text-white">
        <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-indigo-200"><Store className="h-4 w-4" />Franchise başvurusu</p>
        <h1 className="mt-1 text-2xl font-bold">{cfg.brand}</h1>
        {cfg.intro && <p className="mt-2 whitespace-pre-wrap text-sm text-indigo-100">{cfg.intro}</p>}
        {cfg.franchise_fee && <p className="mt-2 text-xs text-indigo-200">Franchise giriş bedeli: ₺{Number(cfg.franchise_fee).toLocaleString('tr-TR')}</p>}
      </div>
      <div className="space-y-5 p-6">
        <section className="space-y-3">
          <p className="text-sm font-semibold">İletişim bilgileriniz</p>
          <div><label className={lbl}>Ad soyad *</label><input className={inp} value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} autoComplete="name" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={lbl}>Cep telefonu *</label><input className={inp} type="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} autoComplete="tel" placeholder="05xx xxx xx xx" /></div>
            <div><label className={lbl}>E-posta</label><input className={inp} type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoComplete="email" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={lbl}>Şube açmak istediğiniz şehir *</label>
              <select className={inp} value={f.city} onChange={e => setF({ ...f, city: e.target.value })}><option value="">Seçin</option>{ILLER.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className={lbl}>İlçe / semt</label><input className={inp} value={f.district} onChange={e => setF({ ...f, district: e.target.value })} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={lbl}>Şirket (varsa)</label><input className={inp} value={f.company_name} onChange={e => setF({ ...f, company_name: e.target.value })} /></div>
            <div><label className={lbl}>Mesleğiniz / şu anki işiniz</label><input className={inp} value={f.occupation} onChange={e => setF({ ...f, occupation: e.target.value })} /></div>
          </div>
        </section>

        <section className="space-y-3 border-t pt-4">
          <p className="text-sm font-semibold">Yatırım planınız</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={lbl}>Ayırabileceğiniz yatırım bütçesi</label>
              <select className={inp} value={f.investment_budget} onChange={e => setF({ ...f, investment_budget: e.target.value })}>{BUDGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label className={lbl}>Ne zaman açmayı planlıyorsunuz?</label>
              <select className={inp} value={f.timeline} onChange={e => setF({ ...f, timeline: e.target.value })}><option value="">Seçin</option>{TIMELINES.map(t => <option key={t} value={t}>{t} içinde</option>)}</select></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.has_location} onChange={e => setF({ ...f, has_location: e.target.checked })} />Hazır bir lokasyonum (dükkân) var</label>
          {f.has_location && <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2"><label className={lbl}>Lokasyon adresi</label><input className={inp} value={f.location_address} onChange={e => setF({ ...f, location_address: e.target.value })} /></div>
            <div><label className={lbl}>Alan (m²)</label><input className={inp} type="number" value={f.location_sqm} onChange={e => setF({ ...f, location_sqm: e.target.value })} /></div>
          </div>}
          <div><label className={lbl}>Yiyecek-içecek veya perakende deneyiminiz</label><textarea className={inp} rows={2} value={f.experience} onChange={e => setF({ ...f, experience: e.target.value })} placeholder="Yoksa boş bırakabilirsiniz" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={lbl}>Bizi nereden duydunuz?</label>
              <select className={inp} value={f.source} onChange={e => setF({ ...f, source: e.target.value })}><option value="">Seçin</option>{SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <div><label className={lbl}>Eklemek istedikleriniz</label><textarea className={inp} rows={3} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} /></div>
          <input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />
        </section>

        <section className="space-y-2 border-t pt-4 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.kvkk_accepted} onChange={e => setF({ ...f, kvkk_accepted: e.target.checked })} />
            <span><button type="button" onClick={() => setShowKvkk(!showKvkk)} className="text-indigo-600 underline">KVKK aydınlatma metnini</button> okudum; başvurumun değerlendirilmesi için bilgilerimin işlenmesini kabul ediyorum. *</span></label>
          {showKvkk && <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded border bg-slate-50 p-3 text-xs text-slate-600"><ShieldCheck className="mb-1 h-4 w-4 text-indigo-600" />{cfg.kvkk_text || 'Aydınlatma metni henüz eklenmemiş.'}</div>}
          <label className="flex items-start gap-2 text-slate-600"><input type="checkbox" className="mt-1" checked={f.marketing_consent} onChange={e => setF({ ...f, marketing_consent: e.target.checked })} />
            <span>Kampanya ve yeni franchise fırsatları hakkında e-posta ve SMS almak istiyorum (isteğe bağlı).</span></label>
        </section>

        <button disabled={busy} onClick={submit} className="w-full rounded-xl bg-indigo-700 py-3 font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">{busy ? 'Gönderiliyor…' : 'Başvurumu gönder'}</button>
        <p className="text-center text-[11px] text-slate-400">Başvurunuz tarih ve bağlantı bilgisiyle kayıt altına alınır.</p>
      </div>
    </div>
  );
}
