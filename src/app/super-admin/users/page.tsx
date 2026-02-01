'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import {
  Users, Plus, Edit2, Trash2, Shield, ShieldCheck, ShieldAlert, User,
  Building2, Search, Filter, Mail, Phone, Calendar, Key, Check, X
} from 'lucide-react';

interface UserWithOrg {
  id: string;
  email: string;
  name: string;
  role: string;
  phone?: string;
  is_active: boolean;
  is_org_admin: boolean;
  organization_id?: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
  created_at: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<UserWithOrg[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithOrg | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOrg, setFilterOrg] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    phone: '',
    role: 'user',
    organization_id: '',
    is_org_admin: false,
    is_active: true,
  });

  const supabase = createClient();
  const { user } = useAuth();
  const router = useRouter();

  // Yetki kontrolü
  useEffect(() => {
    const checkRole = async () => {
      if (!user?.id) return;

      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (data?.role !== 'super_admin') {
        router.push('/');
        return;
      }
      setUserRole(data.role);
    };
    checkRole();
  }, [user?.id]);

  // Verileri yükle
  const fetchData = async () => {
    setLoading(true);
    try {
      // Tüm kullanıcıları al
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select(`
          *,
          organization:organizations(id, name, slug)
        `)
        .order('name');

      if (usersError) throw usersError;
      setUsers(usersData || []);

      // Kurumları al
      const { data: orgsData } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .order('name');

      setOrganizations(orgsData || []);
    } catch (err) {
      console.error('Veri yükleme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userRole === 'super_admin') {
      fetchData();
    }
  }, [userRole]);

  // Kullanıcı kaydet
  const handleSave = async () => {
    if (!editingUser) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: formData.name,
          phone: formData.phone || null,
          role: formData.role,
          organization_id: formData.organization_id || null,
          is_org_admin: formData.is_org_admin,
          is_active: formData.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingUser.id);

      if (error) throw error;

      setShowModal(false);
      setEditingUser(null);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  // Kullanıcı aktif/pasif yap
  const toggleActive = async (targetUser: UserWithOrg) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !targetUser.is_active })
        .eq('id', targetUser.id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  // Kullanıcı sil
  const handleDelete = async (targetUser: UserWithOrg) => {
    if (targetUser.role === 'super_admin') {
      alert('Süper admin silinemez!');
      return;
    }

    if (!confirm(`"${targetUser.name}" kullanıcısını silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', targetUser.id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert('Silme hatası: ' + err.message);
    }
  };

  const openEditModal = (targetUser: UserWithOrg) => {
    setEditingUser(targetUser);
    setFormData({
      email: targetUser.email,
      name: targetUser.name || '',
      phone: targetUser.phone || '',
      role: targetUser.role,
      organization_id: targetUser.organization_id || '',
      is_org_admin: targetUser.is_org_admin,
      is_active: targetUser.is_active,
    });
    setShowModal(true);
  };

  const roleIcons: Record<string, any> = {
    super_admin: ShieldAlert,
    org_admin: ShieldCheck,
    manager: Shield,
    user: User,
  };

  const roleColors: Record<string, string> = {
    super_admin: 'bg-red-100 text-red-700',
    org_admin: 'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    user: 'bg-slate-100 text-slate-700',
  };

  const roleNames: Record<string, string> = {
    super_admin: 'Süper Admin',
    org_admin: 'Kurum Admini',
    manager: 'Yönetici',
    user: 'Kullanıcı',
  };

  // Filtreleme
  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOrg = !filterOrg || u.organization_id === filterOrg;
    const matchesRole = !filterRole || u.role === filterRole;
    return matchesSearch && matchesOrg && matchesRole;
  });

  if (userRole !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800">Erişim Engellendi</h2>
          <p className="text-slate-600 mt-2">Bu sayfaya sadece Süper Admin erişebilir.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header 
        title="Tüm Kullanıcılar" 
        subtitle="Sistemdeki tüm kullanıcıları yönetin (Süper Admin)"
      />

      <div className="p-6">
        {/* Özet Kartlar */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Toplam Kullanıcı</p>
                  <p className="text-2xl font-bold">{users.length}</p>
                </div>
                <Users className="h-10 w-10 text-white/30" />
              </div>
            </CardBody>
          </Card>

          <Card className="bg-gradient-to-br from-red-500 to-rose-600 text-white">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Süper Admin</p>
                  <p className="text-2xl font-bold">{users.filter(u => u.role === 'super_admin').length}</p>
                </div>
                <ShieldAlert className="h-10 w-10 text-white/30" />
              </div>
            </CardBody>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-violet-600 text-white">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Kurum Admini</p>
                  <p className="text-2xl font-bold">{users.filter(u => u.role === 'org_admin' || u.is_org_admin).length}</p>
                </div>
                <ShieldCheck className="h-10 w-10 text-white/30" />
              </div>
            </CardBody>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Aktif Kullanıcı</p>
                  <p className="text-2xl font-bold">{users.filter(u => u.is_active).length}</p>
                </div>
                <Check className="h-10 w-10 text-white/30" />
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Filtreler */}
        <div className="flex flex-wrap gap-3 items-center mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="İsim veya e-posta ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200"
          >
            <option value="">Tüm Kurumlar</option>
            {organizations.map(org => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>

          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200"
          >
            <option value="">Tüm Roller</option>
            <option value="super_admin">Süper Admin</option>
            <option value="org_admin">Kurum Admini</option>
            <option value="manager">Yönetici</option>
            <option value="user">Kullanıcı</option>
          </select>
        </div>

        {/* Kullanıcı Listesi */}
        <Card>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Yükleniyor...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                Kullanıcı bulunamadı
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Kullanıcı</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Kurum</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Rol</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-600">Durum</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Kayıt Tarihi</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((targetUser) => {
                    const RoleIcon = roleIcons[targetUser.role] || User;
                    return (
                      <tr key={targetUser.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                              {targetUser.name?.charAt(0).toUpperCase() || targetUser.email.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{targetUser.name || '-'}</p>
                              <p className="text-xs text-slate-500">{targetUser.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {targetUser.organization ? (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-slate-400" />
                              <span className="text-sm">{targetUser.organization.name}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge className={roleColors[targetUser.role]}>
                              <RoleIcon className="h-3 w-3 mr-1" />
                              {roleNames[targetUser.role]}
                            </Badge>
                            {targetUser.is_org_admin && targetUser.role !== 'org_admin' && (
                              <Badge className="bg-purple-50 text-purple-600 text-xs">OA</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {targetUser.is_active ? (
                            <Badge className="bg-emerald-100 text-emerald-700">Aktif</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700">Pasif</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {new Date(targetUser.created_at).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditModal(targetUser)}
                              title="Düzenle"
                            >
                              <Edit2 className="h-4 w-4 text-amber-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleActive(targetUser)}
                              title={targetUser.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                              disabled={targetUser.role === 'super_admin'}
                            >
                              {targetUser.is_active ? (
                                <X className="h-4 w-4 text-slate-600" />
                              ) : (
                                <Check className="h-4 w-4 text-emerald-600" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(targetUser)}
                              title="Sil"
                              disabled={targetUser.role === 'super_admin'}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Düzenleme Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingUser(null); }}
        title="Kullanıcı Düzenle"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowModal(false); setEditingUser(null); }}>
              İptal
            </Button>
            <Button onClick={handleSave}>
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-posta</label>
            <Input value={formData.email} disabled className="bg-slate-50" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ad Soyad</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Telefon</label>
            <Input
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="0532 123 4567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kurum</label>
            <select
              value={formData.organization_id}
              onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200"
            >
              <option value="">Kurum Yok</option>
              {organizations.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200"
              disabled={editingUser?.role === 'super_admin'}
            >
              <option value="super_admin">Süper Admin</option>
              <option value="org_admin">Kurum Admini</option>
              <option value="manager">Yönetici</option>
              <option value="user">Kullanıcı</option>
            </select>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_org_admin}
                onChange={(e) => setFormData({ ...formData, is_org_admin: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-slate-700">Kurum Admini Yetkisi</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded"
                disabled={editingUser?.role === 'super_admin'}
              />
              <span className="text-sm text-slate-700">Aktif</span>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
