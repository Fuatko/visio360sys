'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Input, Select, Textarea, Modal, Badge } from '@/components/ui';
import { DEALER_LEVELS } from '@/lib/dealer-pricing';
import { Plus, Pencil, Trash2 } from 'lucide-react';

interface Props { supabase: any; dealers: any[] }

export default function Trainings({ supabase, dealers }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [comps, setComps] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);
  const [matrix, setMatrix] = useState<any | null>(null);

  const load = async () => {
    const [t, c] = await Promise.all([
      supabase.from('dealer_trainings').select('*').order('created_at', { ascending: false }),
      supabase.from('dealer_training_completions').select('training_id, dealer_id, completed_at'),
    ]);
    setItems(t.data || []); setComps(c.data || []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title.trim()) return;
    const payload = { title: form.title, description: form.description || null, category: form.category || null, content_url: form.content_url || null,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null, is_required: !!form.is_required, required_level: form.required_level || null,
      is_certification: !!form.is_certification, valid_months: form.valid_months ? Number(form.valid_months) : null, is_active: form.is_active !== false };
    const { error } = form.id ? await supabase.from('dealer_trainings').update(payload).eq('id', form.id) : await supabase.from('dealer_trainings').insert([payload]);
    if (error) { alert(error.message); return; }
    setForm(null); load();
  };

  const dealersDone = (tid: string) => new Set(comps.filter(c => c.training_id === tid).map(c => c.dealer_id));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Bayi Eğitimleri & Sertifikalar</h3>
        <Button size="sm" onClick={() => setForm({ title: '', description: '', category: '', content_url: '', duration_minutes: '', is_required: false, required_level: '', is_certification: false, valid_months: '', is_active: true })}><Plus className="h-3 w-3" />Eğitim ekle</Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-slate-500">Ürün eğitimi, montaj/servis eğitimi, satış teknikleri… Video/LMS bağlantısı ekleyerek yayınlayın.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Eğitim</th><th>Kapsam</th><th>Tamamlayan bayi</th><th /></tr></thead>
          <tbody>
            {items.map(t => {
              const target = dealers.filter(d => !t.required_level || d.dealer_level === t.required_level);
              const done = dealersDone(t.id);
              return (
                <tr key={t.id} className="border-b">
                  <td className="py-2"><p className="font-medium">{t.title}{!t.is_active && <span className="ml-1 text-xs text-slate-400">(pasif)</span>}</p>
                    <div className="flex gap-1">{t.is_required && <Badge variant="danger">Zorunlu</Badge>}{t.is_certification && <Badge variant="primary">Sertifika{t.valid_months ? ` · ${t.valid_months} ay` : ''}</Badge>}{t.category && <Badge>{t.category}</Badge>}</div></td>
                  <td className="text-xs">{t.required_level ? `${t.required_level} bayiler` : 'Tüm bayiler'}</td>
                  <td><button onClick={() => setMatrix(t)} className="text-xs text-indigo-600 hover:underline">{target.filter(d => done.has(d.id)).length} / {target.length}</button></td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => setForm({ ...t, required_level: t.required_level || '', valid_months: t.valid_months ?? '', duration_minutes: t.duration_minutes ?? '' })} className="mr-2"><Pencil className="h-3 w-3 text-slate-500" /></button>
                    <button onClick={async () => { if (confirm('Silinsin mi?')) { await supabase.from('dealer_trainings').delete().eq('id', t.id); load(); } }}><Trash2 className="h-3 w-3 text-red-400" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Eğitim" size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-3">
            <Input label="Başlık" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <Textarea label="Açıklama" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-cols-3 gap-3">
              <Input label="Kategori" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} />
              <Input label="Süre (dk)" type="number" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} />
              <Select label="Hangi seviye" value={form.required_level} onChange={e => setForm({ ...form, required_level: e.target.value })} options={[{ value: '', label: 'Tümü' }, ...DEALER_LEVELS.map(l => ({ value: l, label: l }))]} />
            </div>
            <Input label="İçerik bağlantısı (YouTube, LMS, PDF)" value={form.content_url || ''} onChange={e => setForm({ ...form, content_url: e.target.value })} />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!form.is_required} onChange={e => setForm({ ...form, is_required: e.target.checked })} />Zorunlu</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!form.is_certification} onChange={e => setForm({ ...form, is_certification: e.target.checked })} />Sertifika verir</label>
              {form.is_certification && <span className="flex items-center gap-1">Geçerlilik <input type="number" value={form.valid_months} onChange={e => setForm({ ...form, valid_months: e.target.value })} className="h-8 w-16 rounded border px-1" /> ay</span>}
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.is_active !== false} onChange={e => setForm({ ...form, is_active: e.target.checked })} />Yayında</label>
            </div>
          </div>
        )}
      </Modal>
      <Modal isOpen={!!matrix} onClose={() => setMatrix(null)} title={matrix?.title || ''}>
        {matrix && (
          <div className="space-y-1 text-sm">
            {dealers.filter(d => !matrix.required_level || d.dealer_level === matrix.required_level).map(d => {
              const c = comps.filter(x => x.training_id === matrix.id && x.dealer_id === d.id);
              return <div key={d.id} className="flex justify-between border-b py-1"><span>{d.name}</span>{c.length ? <Badge variant="success">{c.length} kişi</Badge> : <Badge variant="warning">Tamamlanmadı</Badge>}</div>;
            })}
          </div>
        )}
      </Modal>
    </Card>
  );
}
