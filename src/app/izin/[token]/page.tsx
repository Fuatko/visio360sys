'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

export default function PublicConsentPage() {
  const supabase = createClient();
  const { token } = useParams<{ token: string }>();
  const [cfg, setCfg] = useState<any>(undefined);
  const [f, setF] = useState({ name: '', company: '', email: '', phone: '', EPOSTA: true, MESAJ: false, ARAMA: false, trader: true, kvkk: false });
  const [showKvkk, setShowKvkk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(String(token))) { setCfg(null); return; }
    supabase.rpc('public_consent_form', { p_token: token }).then(({ data, error }: any) => setCfg(error ? null : data));
  }, [token]);

  const submit = async () => {
    const channels = (['EPOSTA', 'MESAJ', 'ARAMA'] as const).filter(c => (f as any)[c]);
    setBusy(true);
    const { error } = await supabase.rpc('public_consent_submit', { p_token: token, p_name: f.name, p_company: f.company || null, p_email: f.email || null, p_phone: f.phone || null, p_channels: channels, p_is_trader: f.trader, p_kvkk: f.kvkk });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setDone(true);
  };

  const shell = (c: React.ReactNode) => <div className="flex min-h-screen items-start justify-center bg-slate-100 p-4 sm:items-center"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">{c}</div></div>;
  if (cfg === undefined) return shell(<div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />);
  if (cfg === null) return shell(<p className="text-center text-sm text-slate-600">Form bulunamadı veya yayından kaldırılmış.</p>);
  if (done) return shell(<div className="py-6 text-center"><CheckCircle2 className="mx-auto mb-2 h-12 w-12 text-green-500" /><h1 className="font-semibold">Teşekkürler!</h1><p className="text-sm text-slate-600">Tercihleriniz kaydedildi. İstediğiniz zaman iletilerdeki ret bağlantısıyla veya bize yazarak iznini geri alabilirsiniz.</p></div>);

  const inp = 'w-full rounded-lg border px-3 py-2 text-sm';
  return shell(
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest text-indigo-500">{cfg.brand}</p>
      <h1 className="text-lg font-bold">Bizden haber almak ister misiniz?</h1>
      <input className={inp} placeholder="Ad soyad *" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <input className={inp} placeholder="Firma" value={f.company} onChange={e => setF({ ...f, company: e.target.value })} />
      <input className={inp} type="email" placeholder="E-posta" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
      <input className={inp} type="tel" placeholder="Cep telefonu" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
      <div className="space-y-1 text-sm">
        <p className="font-medium">Hangi kanallardan?</p>
        {([['EPOSTA', 'E-posta'], ['MESAJ', 'SMS'], ['ARAMA', 'Telefonla arama']] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={(f as any)[k]} onChange={e => setF({ ...f, [k]: e.target.checked })} />{l}</label>
        ))}
        <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={f.trader} onChange={e => setF({ ...f, trader: e.target.checked })} />Kurumsal (şirket adına) iletişim bilgisi veriyorum</label>
      </div>
      {cfg.consent_text && <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">{cfg.consent_text}</p>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.kvkk} onChange={e => setF({ ...f, kvkk: e.target.checked })} />
        <span><button type="button" onClick={() => setShowKvkk(!showKvkk)} className="text-indigo-600 underline">KVKK aydınlatma metnini</button> okudum; yukarıdaki kanallardan ticari ileti almayı onaylıyorum.</span></label>
      {showKvkk && <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded border bg-slate-50 p-2 text-xs text-slate-600"><ShieldCheck className="mb-1 h-4 w-4 text-indigo-600" />{cfg.kvkk_text || 'Aydınlatma metni henüz eklenmemiş.'}</div>}
      <button disabled={busy} onClick={submit} className="w-full rounded-xl bg-indigo-700 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Kaydediliyor…' : 'Onaylıyorum'}</button>
    </div>
  );
}
