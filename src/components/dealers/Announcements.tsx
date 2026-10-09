'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Input, Select, Textarea, Modal, Badge } from '@/components/ui';
import { FileField, FileLink } from '@/components/portal/common';
import { formatDate } from '@/lib/utils';
import { ANNOUNCEMENT_CATEGORIES } from '@/lib/portal';
import { DEALER_LEVELS } from '@/lib/dealer-pricing';
import { useAuth } from '@/lib/auth-context';
import { Plus, Pin, Trash2, Pencil } from 'lucide-react';

interface Props { supabase: any; dealers: any[] }

export default function Announcements({ supabase, dealers }: Props) {
  const { profile } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [reads, setReads] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState(0);
  const [form, setForm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [a, r, u] = await Promise.all([
      supabase.from('portal_announcements').select('*').order('publish_at', { ascending: false }),
      supabase.from('portal_announcement_reads').select('announcement_id, dealer_id'),
      supabase.from('dealer_users').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ]);
    setItems(a.data || []); setReads(r.data || []); setActiveUsers(u.count || 0);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title.trim()) { alert('Başlık girin.'); return; }
    setBusy(true);
    const payload = { title: form.title, body: form.body || null, category: form.category, link_url: form.link_url || null,
      target_level: form.target_level || null, target_dealer_id: form.target_dealer_id || null, is_pinned: !!form.is_pinned,
      publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : new Date().toISOString(),
      expires_at: form.expires_at ? new Date(form.expires_at + 'T23:59:59').toISOString() : null };
    const q = form.id ? supabase.from('portal_announcements').update(payload).eq('id', form.id) : supabase.from('portal_announcements').insert([payload]);
    const { error } = await q;
    setBusy(false);
    if (error) { alert(error.message); return; }
    setForm(null); load();
  };
  const remove = async (id: string) => {
    if (!confirm('Duyuru silinsin mi?')) return;
    await supabase.from('portal_announcements').delete().eq('id', id); load();
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Duyurular & Doküman Paylaşımı</h3>
        <Button size="sm" onClick={() => setForm({ title: '', body: '', category: 'Duyuru', link_url: '', target_level: '', target_dealer_id: '', is_pinned: false, publish_at: '', expires_at: '' })}><Plus className="h-3 w-3" />Yeni duyuru</Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-slate-500">Henüz duyuru yok. Kampanya, fiyat değişikliği, teknik bülten veya katalog paylaşın.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Başlık</th><th>Hedef</th><th>Yayın</th><th>Okunma</th><th /></tr></thead>
          <tbody>
            {items.map(a => {
              const rc = reads.filter(r => r.announcement_id === a.id);
              const dealersRead = new Set(rc.map(r => r.dealer_id)).size;
              return (
                <tr key={a.id} className="border-b">
                  <td className="py-2"><p className="flex items-center gap-1 font-medium">{a.is_pinned && <Pin className="h-3 w-3 text-amber-500" />}{a.title}</p>
                    <p className="text-xs text-slate-400"><Badge>{a.category}</Badge> <FileLink supabase={supabase} value={a.link_url} /></p></td>
                  <td className="text-xs">{a.target_dealer_id ? dealers.find(d => d.id === a.target_dealer_id)?.name : a.target_level ? `${a.target_level} bayiler` : 'Tüm bayiler'}</td>
                  <td className="text-xs">{formatDate(a.publish_at)}{a.expires_at ? ` – ${formatDate(a.expires_at)}` : ''}</td>
                  <td className="text-xs">{rc.length} kişi · {dealersRead} bayi{activeUsers ? <span className="text-slate-400"> / {activeUsers} aktif kullanıcı</span> : null}</td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => setForm({ ...a, publish_at: a.publish_at?.slice(0, 10), expires_at: a.expires_at?.slice(0, 10) || '', target_level: a.target_level || '', target_dealer_id: a.target_dealer_id || '', link_url: a.link_url || '' })} className="mr-2"><Pencil className="h-3 w-3 text-slate-500" /></button>
                    <button onClick={() => remove(a.id)}><Trash2 className="h-3 w-3 text-red-400" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? 'Duyuruyu düzenle' : 'Yeni duyuru'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save} disabled={busy}>Yayınla</Button></>}>
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Input label="Başlık" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <Select label="Kategori" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={ANNOUNCEMENT_CATEGORIES.map(c => ({ value: c, label: c }))} />
            </div>
            <Textarea label="İçerik" rows={6} value={form.body || ''} onChange={e => setForm({ ...form, body: e.target.value })} />
            {profile?.organization_id && <FileField supabase={supabase} dealerId={`shared/${profile.organization_id}`} value={form.link_url} onChange={v => setForm({ ...form, link_url: v })} label="Ek dosya / bağlantı (katalog, fiyat listesi PDF…)" />}
            <div className="grid grid-cols-2 gap-3">
              <Select label="Hedef seviye" value={form.target_level} onChange={e => setForm({ ...form, target_level: e.target.value })} options={[{ value: '', label: 'Tüm seviyeler' }, ...DEALER_LEVELS.map(l => ({ value: l, label: l }))]} />
              <Select label="Sadece bu bayi" value={form.target_dealer_id} onChange={e => setForm({ ...form, target_dealer_id: e.target.value })} options={[{ value: '', label: 'Tüm bayiler' }, ...dealers.map(d => ({ value: d.id, label: d.name }))]} />
              <Input label="Yayın tarihi" type="date" value={form.publish_at || ''} onChange={e => setForm({ ...form, publish_at: e.target.value })} />
              <Input label="Bitiş tarihi" type="date" value={form.expires_at || ''} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.is_pinned} onChange={e => setForm({ ...form, is_pinned: e.target.checked })} />Üste sabitle</label>
          </div>
        )}
      </Modal>
    </Card>
  );
}
