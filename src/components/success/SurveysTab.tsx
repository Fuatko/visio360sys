'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Badge, Modal, Input } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { npsOf } from '@/lib/customer-health';
import { Send, Copy, MessageCircle, Mail, AlertTriangle, Check } from 'lucide-react';

interface Props { supabase: any; surveys: any[]; customers: any[]; preselect: string[] | null; clearPreselect: () => void; onComplaint: (s: any) => void; onChanged: () => void }

export default function SurveysTab({ supabase, surveys, customers, preselect, clearPreselect, onComplaint, onChanged }: Props) {
  const [form, setForm] = useState<any | null>(null);
  const [created, setCreated] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const openForm = (ids: string[] = []) => setForm({ ids, contact_name: '', contact_email: '', survey_type: 'periodic' });
  useEffect(() => { if (preselect) { openForm(preselect); clearPreselect(); } }, [preselect]);

  const cname = (id: string) => customers.find(c => c.id === id)?.name || '-';
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString();
  const answered = surveys.filter(s => s.responded_at);
  const recent = answered.filter(s => s.responded_at >= yearAgo);
  const nps = npsOf(recent.map(s => Number(s.nps)));
  const avg = (k: string) => { const v = recent.map(s => s[k]).filter((x: any) => x); return v.length ? (v.reduce((a: number, b: number) => a + b, 0) / v.length).toFixed(1) : '-'; };
  const rr = surveys.length ? Math.round(answered.length / surveys.length * 100) : null;
  const url = (t: string) => `${window.location.origin}/s/${t}`;

  const create = async () => {
    if (!form.ids.length) { alert('En az bir müşteri seçin.'); return; }
    const { data, error } = await supabase.from('customer_surveys').insert(form.ids.map((id: string) => ({ customer_id: id, survey_type: form.survey_type,
      contact_name: form.ids.length === 1 ? form.contact_name || null : null, contact_email: form.ids.length === 1 ? form.contact_email || null : null }))).select();
    if (error) { alert(error.message); return; }
    setForm(null); setCreated(data); onChanged();
  };
  const msg = (s: any) => `Merhaba${s.contact_name ? ' ' + s.contact_name : ''}, hizmetimizi geliştirmek için 1 dakikalık memnuniyet anketimize katılır mısınız? ${url(s.token)}`;
  const followed = async (s: any) => { await supabase.from('customer_surveys').update({ followed_up: !s.followed_up }).eq('id', s.id); onChanged(); };

  const list = answered.filter(s => !q || cname(s.customer_id).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.responded_at.localeCompare(a.responded_at));
  const pending = surveys.filter(s => !s.responded_at);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <Card className="p-4"><p className={`text-3xl font-bold ${nps && nps.nps >= 30 ? 'text-green-700' : nps && nps.nps >= 0 ? 'text-amber-600' : 'text-red-600'}`}>{nps ? nps.nps : '-'}</p><p className="text-xs text-slate-500">NPS (son 12 ay, −100…+100)</p></Card>
        <Card className="p-4"><p className="text-sm"><span className="text-green-700">{nps?.promoters || 0} destekçi</span> · <span className="text-slate-500">{nps?.passives || 0} pasif</span> · <span className="text-red-600">{nps?.detractors || 0} kötüleyen</span></p><p className="text-xs text-slate-500">Dağılım</p></Card>
        <Card className="p-4"><p className="text-sm">Kalite <b>{avg('score_quality')}</b> · Hizmet <b>{avg('score_service')}</b> · Değer <b>{avg('score_value')}</b></p><p className="text-xs text-slate-500">Memnuniyet ortalaması (1–5)</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold">{rr === null ? '-' : `%${rr}`}</p><p className="text-xs text-slate-500">Yanıt oranı ({pending.length} bekleyen)</p></Card>
        <Card className="flex items-center justify-center p-4"><Button onClick={() => openForm()}><Send className="h-4 w-4" />Anket gönder</Button></Card>
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Yanıtlar</h3>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Müşteri ara" className="h-8 rounded-lg border px-2 text-sm" />
        </div>
        {list.length === 0 ? <p className="text-sm text-slate-500">Henüz yanıt yok. Anket bağlantısını müşterilerinize WhatsApp veya e-postayla gönderin.</p> : list.map(s => {
          const det = Number(s.nps) <= 6;
          return (
            <div key={s.id} className="flex flex-wrap items-start gap-3 border-b py-2 text-sm">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-white ${Number(s.nps) >= 9 ? 'bg-green-600' : Number(s.nps) >= 7 ? 'bg-amber-500' : 'bg-red-500'}`}>{s.nps}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{cname(s.customer_id)} <span className="text-xs font-normal text-slate-400">· {s.respondent_name || 'İsimsiz'} · {formatDate(s.responded_at)}</span></p>
                <p className="text-xs text-slate-500">Kalite {s.score_quality || '-'} · Hizmet {s.score_service || '-'} · Değer {s.score_value || '-'}</p>
                {s.comment && <p className="mt-0.5 text-slate-700">“{s.comment}”</p>}
              </div>
              {det && (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => onComplaint(s)}><AlertTriangle className="h-3 w-3 text-red-500" />Şikâyet/DÖF aç</Button>
                  <Button size="sm" variant={s.followed_up ? 'success' : 'ghost'} onClick={() => followed(s)}><Check className="h-3 w-3" />{s.followed_up ? 'Arandı' : 'Arandı olarak işaretle'}</Button>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Memnuniyet anketi gönder"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={create}>Bağlantıları oluştur</Button></>}>
        {form && (
          <div className="space-y-3 text-sm">
            <div className="max-h-56 space-y-1 overflow-auto rounded border p-2">
              {customers.map(c => (
                <label key={c.id} className="flex items-center gap-2"><input type="checkbox" checked={form.ids.includes(c.id)}
                  onChange={e => setForm({ ...form, ids: e.target.checked ? [...form.ids, c.id] : form.ids.filter((x: string) => x !== c.id) })} />{c.name}</label>
              ))}
            </div>
            {form.ids.length === 1 && <div className="grid grid-cols-2 gap-2">
              <Input label="Kişi (isteğe bağlı)" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
              <Input label="E-posta" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
            </div>}
            <select value={form.survey_type} onChange={e => setForm({ ...form, survey_type: e.target.value })} className="h-9 w-full rounded-lg border px-2">
              <option value="periodic">Dönemsel memnuniyet</option><option value="after_delivery">Teslimat / proje sonrası</option><option value="after_support">Destek sonrası</option>
            </select>
            <p className="text-xs text-slate-500">Her müşteri için tek kullanımlık bağlantı oluşur. Yanıtlar NPS'e ve müşteri sağlık skoruna yansır (ISO 9001 · 9.1.2).</p>
          </div>
        )}
      </Modal>
      <Modal isOpen={!!created} onClose={() => setCreated(null)} title="Anket bağlantıları" size="lg">
        {created && (
          <div className="space-y-2 text-sm">
            {created.map(s => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 border-b py-2">
                <span className="mr-auto font-medium">{cname(s.customer_id)}</span>
                <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(url(s.token)); alert('Kopyalandı'); }}><Copy className="h-3 w-3" />Bağlantı</Button>
                <a target="_blank" rel="noopener" href={`https://wa.me/?text=${encodeURIComponent(msg(s))}`} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs text-white"><MessageCircle className="h-3 w-3" />WhatsApp</a>
                <a href={`mailto:${s.contact_email || ''}?subject=${encodeURIComponent('Memnuniyet anketi')}&body=${encodeURIComponent(msg(s))}`} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"><Mail className="h-3 w-3" />E-posta</a>
              </div>
            ))}
            {pending.length > created.length && <p className="text-xs text-slate-400">Yanıt bekleyen diğer anketler: {pending.length - created.length}</p>}
            <Badge variant="info">Bağlantılar giriş gerektirmez; müşteri telefondan 1 dakikada doldurur.</Badge>
          </div>
        )}
      </Modal>
    </div>
  );
}
