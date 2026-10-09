'use client';

import { useEffect, useState } from 'react';
import { usePortal, PortalTitle } from '@/components/portal/PortalShell';
import { Button, Input, Badge, Modal } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/utils';
import { termLabel } from '@/lib/dealer-pricing';
import { formatMoney } from '@/lib/utils';
import { n } from '@/lib/portal';
import { UserPlus } from 'lucide-react';

export default function PortalAccount() {
  const { supabase, me, reloadMe } = usePortal();
  const [p, setP] = useState({ full_name: me.user.full_name || '', phone: me.user.phone || '', title: me.user.title || '' });
  const [pw, setPw] = useState({ a: '', b: '' });
  const [team, setTeam] = useState<any[]>([]);
  const [invite, setInvite] = useState<any | null>(null);
  const isAdmin = me.user.portal_role === 'admin';

  const loadTeam = () => supabase.from('dealer_users').select('id, email, full_name, title, portal_role, status, last_login_at').order('created_at').then(({ data }: any) => setTeam(data || []));
  useEffect(() => { loadTeam(); }, []);

  const saveProfile = async () => {
    const { error } = await supabase.rpc('portal_update_profile', { p_full_name: p.full_name, p_phone: p.phone, p_title: p.title });
    if (error) alert(error.message); else { await reloadMe(); alert('Kaydedildi.'); }
  };
  const changePw = async () => {
    if (pw.a.length < 8 || pw.a !== pw.b) { alert('Şifre en az 8 karakter olmalı ve iki alan aynı olmalı.'); return; }
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    if (error) alert(error.message); else { setPw({ a: '', b: '' }); alert('Şifreniz değiştirildi.'); }
  };
  const sendInvite = async () => {
    const { error } = await supabase.rpc('portal_invite_user', { p_email: invite.email, p_full_name: invite.full_name, p_role: invite.role });
    if (error) { alert(error.message); return; }
    alert(`Davet oluşturuldu. ${invite.email} adresli kişi ${window.location.origin}/portal/kayit adresinden bu e-postayla kayıt olabilir.`);
    setInvite(null); loadTeam();
  };
  const toggle = async (u: any) => {
    const { error } = await supabase.rpc('portal_set_user_status', { p_id: u.id, p_status: u.status === 'disabled' ? 'active' : 'disabled' });
    if (error) alert(error.message); else loadTeam();
  };

  return (
    <div className="space-y-4">
      <PortalTitle title="Hesabım & Ekibim" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Profil</h2>
          <p className="text-xs text-slate-500">{me.user.email}</p>
          <Input label="Ad soyad" value={p.full_name} onChange={e => setP({ ...p, full_name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Telefon" value={p.phone} onChange={e => setP({ ...p, phone: e.target.value })} />
            <Input label="Görev" value={p.title} onChange={e => setP({ ...p, title: e.target.value })} />
          </div>
          <Button size="sm" onClick={saveProfile}>Kaydet</Button>
          <h2 className="pt-2 text-sm font-semibold">Şifre değiştir</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Yeni şifre" type="password" value={pw.a} onChange={e => setPw({ ...pw, a: e.target.value })} />
            <Input label="Tekrar" type="password" value={pw.b} onChange={e => setPw({ ...pw, b: e.target.value })} />
          </div>
          <Button size="sm" variant="secondary" onClick={changePw}>Şifreyi değiştir</Button>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h2 className="text-sm font-semibold">Ticari koşullarım</h2>
          {[
            ['Bayi', me.dealer.name], ['Bayi kodu', me.dealer.dealer_code || '-'], ['Seviye', me.dealer.dealer_level || '-'], ['Bölge', me.dealer.region || '-'],
            ['Standart vade', termLabel(me.dealer.payment_term_days)], ['Temel iskonto', `%${n(me.dealer.base_discount)}`],
            ['Kredi limiti', me.dealer.credit_limit ? `₺${formatMoney(n(me.dealer.credit_limit))}` : 'Limitsiz'],
            ['Bayilik başlangıcı', me.dealer.dealer_since ? formatDate(me.dealer.dealer_since) : '-'],
          ].map(([k, v]) => <div key={k} className="flex justify-between border-b py-1 last:border-0"><span className="text-slate-500">{k}</span><span className="font-medium">{v}</span></div>)}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Ekibim (portal kullanıcıları)</h2>
          {isAdmin && <Button size="sm" onClick={() => setInvite({ email: '', full_name: '', role: 'user' })}><UserPlus className="h-3 w-3" />Kullanıcı davet et</Button>}
        </div>
        <table className="w-full text-sm">
          <tbody>
            {team.map(u => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="py-2"><p className="font-medium">{u.full_name || u.email}</p><p className="text-xs text-slate-400">{u.email}{u.title ? ` · ${u.title}` : ''}</p></td>
                <td>{u.portal_role === 'admin' ? <Badge variant="primary">Yönetici</Badge> : <Badge>Kullanıcı</Badge>}</td>
                <td>{u.status === 'active' ? <Badge variant="success">Aktif</Badge> : u.status === 'invited' ? <Badge variant="warning">Davetli</Badge> : <Badge variant="danger">Pasif</Badge>}</td>
                <td className="text-xs text-slate-400">{u.last_login_at ? `Son giriş ${formatDateTime(u.last_login_at)}` : ''}</td>
                <td className="text-right">{isAdmin && u.id !== me.user.id && <button onClick={() => toggle(u)} className="text-xs text-slate-500 hover:underline">{u.status === 'disabled' ? 'Aktifleştir' : 'Pasifleştir'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!invite} onClose={() => setInvite(null)} title="Kullanıcı davet et"
        footer={<><Button variant="secondary" onClick={() => setInvite(null)}>İptal</Button><Button onClick={sendInvite}>Davet oluştur</Button></>}>
        {invite && (
          <div className="space-y-3">
            <Input label="E-posta" type="email" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} />
            <Input label="Ad soyad" value={invite.full_name} onChange={e => setInvite({ ...invite, full_name: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={invite.role === 'admin'} onChange={e => setInvite({ ...invite, role: e.target.checked ? 'admin' : 'user' })} />Yönetici yetkisi (ekip davet edebilir)</label>
          </div>
        )}
      </Modal>
    </div>
  );
}
