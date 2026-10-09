'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Input, Select, Modal, Badge } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { UserPlus, KeyRound, Copy, ExternalLink } from 'lucide-react';

interface Props { supabase: any; dealers: any[] }

export default function PortalUsers({ supabase, dealers }: Props) {
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);
  const [pwFor, setPwFor] = useState<any | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => supabase.from('dealer_users').select('*').order('created_at', { ascending: false }).then(({ data }: any) => setUsers(data || []));
  useEffect(() => { load(); }, []);

  const dname = (id: string) => dealers.find(d => d.id === id)?.name || '-';
  const portalUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const inviteText = (u: any) =>
    `Merhaba ${u.full_name || ''},\n\n${dname(u.dealer_id)} adına bayi portalımıza erişiminiz tanımlandı.\n` +
    `Kayıt: ${portalUrl}/portal/kayit (bu e-posta ile: ${u.email})\nGiriş: ${portalUrl}/login\n\n` +
    `Portaldan size özel fiyatlarla sipariş verebilir, cari ekstrenizi, prim durumunuzu görebilir; fırsat kaydı, garanti ve destek taleplerinizi iletebilirsiniz.`;

  const save = async () => {
    if (!form.dealer_id || !form.email) { alert('Bayi ve e-posta zorunlu.'); return; }
    setBusy(true);
    const { data, error } = await supabase.from('dealer_users').insert([{ dealer_id: form.dealer_id, email: form.email, full_name: form.full_name || null,
      phone: form.phone || null, title: form.title || null, portal_role: form.portal_role }]).select().single();
    if (error) { setBusy(false); alert('Hata: ' + error.message); return; }
    if (form.password) await createAccount(data, form.password);
    setBusy(false);
    setForm(null); load();
    if (!form.password) {
      try { await navigator.clipboard.writeText(inviteText(data)); alert('Davet oluşturuldu. Davet metni panoya kopyalandı; bayiye e-posta veya WhatsApp ile iletin.'); }
      catch { alert('Davet oluşturuldu. Satırdaki "Davet metni" ile kopyalayabilirsiniz.'); }
    }
  };

  const createAccount = async (u: any, password: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/portal/create-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ dealer_user_id: u.id, password }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 501) {
      alert('Doğrudan şifreli hesap açmak için sunucuda SUPABASE_SERVICE_ROLE_KEY tanımlı değil.\nDavet yine de oluşturuldu: bayi /portal/kayit adresinden bu e-postayla kendi şifresini belirleyerek kayıt olabilir.');
      return false;
    }
    if (!res.ok) { alert('Hesap açılamadı: ' + (j.error || res.statusText)); return false; }
    alert(`Hesap açıldı. Giriş: ${portalUrl}/login\nE-posta: ${u.email}\nŞifre: (belirlediğiniz geçici şifre)`);
    return true;
  };

  const setStatus = async (u: any, status: string) => {
    const { error } = await supabase.from('dealer_users').update({ status: status === 'active' && !u.auth_user_id ? 'invited' : status }).eq('id', u.id);
    if (error) alert(error.message); else load();
  };

  const list = users.filter(u => !filter || u.dealer_id === filter);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Bayi Portalı Kullanıcıları</h3>
        <a href="/portal/kayit" target="_blank" className="inline-flex items-center gap-1 text-xs text-indigo-600"><ExternalLink className="h-3 w-3" />Kayıt sayfası</a>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-sm">
          <option value="">Tüm bayiler</option>{dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <Button size="sm" onClick={() => setForm({ dealer_id: filter || '', email: '', full_name: '', phone: '', title: '', portal_role: 'admin', password: '' })}><UserPlus className="h-3 w-3" />Kullanıcı ekle</Button>
      </div>
      <p className="mb-3 text-xs text-slate-500">Bayi kullanıcıları sadece kendi bayilerinin verisini görür; şirket ekranlarına ve diğer bayilere erişemez (veritabanı seviyesinde kilitli).</p>
      {list.length === 0 ? <p className="text-sm text-slate-500">Henüz portal kullanıcısı yok.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Kullanıcı</th><th>Bayi</th><th>Rol</th><th>Durum</th><th>Son giriş</th><th /></tr></thead>
            <tbody>
              {list.map(u => (
                <tr key={u.id} className="border-b">
                  <td className="py-2"><p className="font-medium">{u.full_name || '-'}</p><p className="text-xs text-slate-400">{u.email}{u.title ? ` · ${u.title}` : ''}</p></td>
                  <td>{dname(u.dealer_id)}</td>
                  <td>{u.portal_role === 'admin' ? <Badge variant="primary">Bayi yöneticisi</Badge> : <Badge>Kullanıcı</Badge>}</td>
                  <td>{u.status === 'active' ? <Badge variant="success">Aktif</Badge> : u.status === 'invited' ? <Badge variant="warning">Davetli</Badge> : <Badge variant="danger">Pasif</Badge>}</td>
                  <td className="text-xs text-slate-500">{u.last_login_at ? formatDateTime(u.last_login_at) : '-'}</td>
                  <td className="space-x-2 whitespace-nowrap text-right text-xs">
                    {u.status === 'invited' && <>
                      <button onClick={() => { navigator.clipboard?.writeText(inviteText(u)); alert('Davet metni kopyalandı.'); }} className="inline-flex items-center gap-0.5 text-indigo-600"><Copy className="h-3 w-3" />Davet metni</button>
                      <button onClick={() => setPwFor({ u, password: '' })} className="inline-flex items-center gap-0.5 text-indigo-600"><KeyRound className="h-3 w-3" />Şifreyle aç</button>
                    </>}
                    {u.status === 'disabled'
                      ? <button onClick={() => setStatus(u, 'active')} className="text-green-700">Aktifleştir</button>
                      : <button onClick={() => setStatus(u, 'disabled')} className="text-red-600">Erişimi durdur</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Portal kullanıcısı ekle"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save} disabled={busy}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-3">
            <Select label="Bayi" value={form.dealer_id} onChange={e => setForm({ ...form, dealer_id: e.target.value })} options={[{ value: '', label: 'Seçin' }, ...dealers.map(d => ({ value: d.id, label: d.name }))]} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="E-posta" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <Input label="Ad soyad" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
              <Input label="Telefon" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              <Input label="Görev" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <Select label="Rol" value={form.portal_role} onChange={e => setForm({ ...form, portal_role: e.target.value })}
              options={[{ value: 'admin', label: 'Bayi yöneticisi (kendi ekibini davet eder)' }, { value: 'user', label: 'Kullanıcı' }]} />
            <Input label="Geçici şifre (isteğe bağlı)" type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <p className="text-xs text-slate-500">Şifre girerseniz hesap hemen açılır. Boş bırakırsanız bayi, davet metnindeki bağlantıdan kendi şifresiyle kayıt olur.</p>
          </div>
        )}
      </Modal>
      <Modal isOpen={!!pwFor} onClose={() => setPwFor(null)} title="Şifreyle hesap aç"
        footer={<><Button variant="secondary" onClick={() => setPwFor(null)}>İptal</Button><Button disabled={busy} onClick={async () => { setBusy(true); const ok = await createAccount(pwFor.u, pwFor.password); setBusy(false); if (ok) { setPwFor(null); load(); } }}>Hesabı aç</Button></>}>
        {pwFor && <Input label={`${pwFor.u.email} için geçici şifre (en az 8)`} value={pwFor.password} onChange={e => setPwFor({ ...pwFor, password: e.target.value })} />}
      </Modal>
    </Card>
  );
}
