'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { CheckCircle2, Star } from 'lucide-react';

const DIMS: [string, string][] = [['quality', 'Ürün / hizmet kalitesi'], ['service', 'İletişim ve hız'], ['value', 'Fiyat / değer dengesi']];

export default function PublicSurveyPage() {
  const supabase = createClient();
  const { token } = useParams<{ token: string }>();
  const [s, setS] = useState<any>(undefined);
  const [nps, setNps] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(String(token))) { setS(null); return; }
    supabase.rpc('public_survey_get', { p_token: token }).then(({ data, error }: any) => { setS(error ? null : data); if (data?.contact_name) setName(data.contact_name); });
  }, [token]);

  const submit = async () => {
    if (nps === null) { alert('Lütfen 0–10 arası bir puan seçin.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('public_survey_submit', { p_token: token, p_nps: nps, p_quality: scores.quality || 0, p_service: scores.service || 0, p_value: scores.value || 0, p_comment: comment || null, p_name: name || null });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setDone(true);
  };

  const shell = (children: React.ReactNode) => <div className="flex min-h-screen items-start justify-center bg-gradient-to-br from-indigo-50 to-slate-100 p-4 sm:items-center"><div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-lg">{children}</div></div>;

  if (s === undefined) return shell(<div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />);
  if (s === null) return shell(<p className="text-center text-slate-600">Anket bulunamadı. Bağlantıyı kontrol edin.</p>);
  if (done || s.responded) return shell(
    <div className="py-6 text-center">
      <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
      <h1 className="text-lg font-semibold">Teşekkür ederiz!</h1>
      <p className="mt-1 text-sm text-slate-600">Görüşleriniz {s.organization} ekibine iletildi. Hizmetimizi geliştirmek için her yanıtı tek tek değerlendiriyoruz.</p>
    </div>
  );

  return shell(
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-indigo-500">{s.organization}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-800">Görüşleriniz bizim için değerli</h1>
        <p className="text-sm text-slate-500">{s.customer} · yaklaşık 1 dakika</p>
      </div>
      <div>
        <p className="mb-2 font-medium">Bizi ({s.organization}) bir iş arkadaşınıza veya başka bir firmaya tavsiye etme olasılığınız nedir?</p>
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button key={i} onClick={() => setNps(i)}
              className={`h-10 rounded-lg border text-sm font-semibold transition ${nps === i ? (i >= 9 ? 'bg-green-600 text-white' : i >= 7 ? 'bg-amber-500 text-white' : 'bg-red-500 text-white') : 'bg-white hover:bg-slate-50'}`}>{i}</button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>Hiç olası değil</span><span>Kesinlikle tavsiye ederim</span></div>
      </div>
      <div className="space-y-2">
        <p className="font-medium">Aşağıdaki konularda memnuniyetiniz</p>
        {DIMS.map(([k, l]) => (
          <div key={k} className="flex items-center justify-between gap-2 text-sm">
            <span>{l}</span>
            <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map(v => (
              <button key={v} onClick={() => setScores({ ...scores, [k]: v })} aria-label={`${v}`}><Star className={`h-7 w-7 ${(scores[k] || 0) >= v ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} /></button>
            ))}</div>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-1 font-medium">{nps !== null && nps <= 6 ? 'Neyi daha iyi yapabilirdik?' : 'Eklemek istedikleriniz'}</p>
        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="İsteğe bağlı" />
      </div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Adınız (isteğe bağlı)" className="w-full rounded-lg border px-3 py-2 text-sm" />
      <button disabled={busy} onClick={submit} className="w-full rounded-xl bg-indigo-700 py-3 font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">{busy ? 'Gönderiliyor…' : 'Gönder'}</button>
    </div>
  );
}
