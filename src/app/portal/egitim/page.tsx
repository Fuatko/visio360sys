'use client';

import { useEffect, useState } from 'react';
import { usePortal, PortalTitle } from '@/components/portal/PortalShell';
import { Badge } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { printHtml, escapeHtml } from '@/lib/print';
import { GraduationCap, ExternalLink, CheckCircle2, Award, Clock } from 'lucide-react';

export default function PortalTraining() {
  const { supabase, me } = usePortal();
  const [trainings, setTrainings] = useState<any[]>([]);
  const [done, setDone] = useState<any[]>([]);

  const load = async () => {
    const [t, c] = await Promise.all([
      supabase.from('dealer_trainings').select('*').order('is_required', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('dealer_training_completions').select('*'),
    ]);
    setTrainings(t.data || []); setDone(c.data || []);
  };
  useEffect(() => { load(); }, []);

  const mine = (id: string) => done.find(c => c.training_id === id && c.dealer_user_id === me.user.id);
  const teamCount = (id: string) => done.filter(c => c.training_id === id).length;
  const expiry = (t: any, c: any) => {
    if (!t.valid_months || !c) return null;
    const d = new Date(c.completed_at); d.setMonth(d.getMonth() + t.valid_months); return d;
  };

  const complete = async (t: any) => {
    if (!confirm(`"${t.title}" eğitimini tamamladığınızı onaylıyor musunuz?`)) return;
    const { error } = await supabase.from('dealer_training_completions').insert([{ training_id: t.id, dealer_id: me.dealer.id }]);
    if (error) alert(error.message); else load();
  };

  const certificate = (t: any, c: any) => {
    printHtml(`Sertifika ${t.title}`, `
      <div style="border:6px double #4338ca;padding:48px;text-align:center;margin-top:40px">
        <p style="letter-spacing:4px;color:#6366f1">${escapeHtml(me.organization || '')}</p>
        <h1 style="font-size:32px;margin:16px 0">Yetkinlik Sertifikası</h1>
        <p>Bu belge</p>
        <h2 style="font-size:26px;margin:8px 0">${escapeHtml(me.user.full_name || me.user.email)}</h2>
        <p>${escapeHtml(me.dealer.name)}</p>
        <p style="margin-top:16px">adlı katılımcının</p>
        <h3 style="font-size:20px">"${escapeHtml(t.title)}"</h3>
        <p>programını başarıyla tamamladığını belgeler.</p>
        <p style="margin-top:24px">Tarih: ${escapeHtml(formatDate(c.completed_at))}${expiry(t, c) ? ' · Geçerlilik: ' + escapeHtml(formatDate(expiry(t, c)!.toISOString())) : ''}</p>
        <p style="font-size:10px;color:#888">Sertifika no: ${escapeHtml(c.id.slice(0, 8).toUpperCase())}</p>
      </div>`);
  };

  const required = trainings.filter(t => t.is_required && (!t.required_level || t.required_level === me.dealer.dealer_level));
  const reqDone = required.filter(t => mine(t.id)).length;

  return (
    <div className="space-y-4">
      <PortalTitle title="Eğitim & Sertifika" subtitle={required.length ? `Zorunlu eğitimler: ${reqDone}/${required.length} tamamlandı` : 'Ürün, satış ve teknik eğitimler'} />
      {trainings.length === 0 && <p className="text-sm text-slate-500">Yayında eğitim yok.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {trainings.map(t => {
          const c = mine(t.id); const exp = expiry(t, c); const expired = exp && exp < new Date();
          return (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-indigo-50 p-2">{t.is_certification ? <Award className="h-5 w-5 text-indigo-600" /> : <GraduationCap className="h-5 w-5 text-indigo-600" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.title}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {t.is_required && <Badge variant="danger">Zorunlu{t.required_level ? ` (${t.required_level})` : ''}</Badge>}
                    {t.is_certification && <Badge variant="primary">Sertifikalı</Badge>}
                    {t.category && <Badge>{t.category}</Badge>}
                    {t.duration_minutes && <span className="flex items-center gap-0.5 text-xs text-slate-400"><Clock className="h-3 w-3" />{t.duration_minutes} dk</span>}
                  </div>
                  {t.description && <p className="mt-1 text-sm text-slate-600">{t.description}</p>}
                  <p className="mt-1 text-xs text-slate-400">Ekibinizden {teamCount(t.id)} kişi tamamladı</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {t.content_url && <a href={t.content_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50"><ExternalLink className="h-3 w-3" />Eğitime git</a>}
                {c ? (
                  <>
                    <span className={`flex items-center gap-1 text-xs ${expired ? 'text-red-600' : 'text-green-700'}`}><CheckCircle2 className="h-4 w-4" />{formatDate(c.completed_at)}{exp ? ` · ${expired ? 'süresi doldu' : 'geçerli: ' + formatDate(exp.toISOString())}` : ''}</span>
                    {t.is_certification && <button onClick={() => certificate(t, c)} className="text-xs text-indigo-600 hover:underline">Sertifikayı yazdır</button>}
                  </>
                ) : <button onClick={() => complete(t)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white">Tamamladım</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
