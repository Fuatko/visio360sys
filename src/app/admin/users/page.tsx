'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, EmptyState } from '@/components/ui';
import { Users, Plus, Edit2, Trash2, RefreshCw, Shield, UserCheck, UserX, Mail, Key } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_sign_in?: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'user',
  });

  const supabase = createClient();
  const { user: currentUser } = useAuth();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      console.error('Kullanıcılar yüklenirken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const openModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        full_name: user.full_name || '',
        password: '',
        role: user.role || 'user',
      });
    } else {
      setEditingUser(null);
      setFormData({ email: '', full_name: '', password: '', role: 'user' });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.email) {
      alert('E-posta zorunludur');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        // Mevcut kullanıcıyı güncelle
        const { error } = await supabase
          .from('users')
          .update({
            full_name: formData.full_name,
            role: formData.role,
          })
          .eq('id', editingUser.id);

        if (error) throw error;
        alert('Kullanıcı güncellendi');
      } else {
        // Yeni kullanıcı oluştur
        if (!formData.password || formData.password.length < 6) {
          alert('Şifre en az 6 karakter olmalıdır');
          setSaving(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.full_name,
              role: formData.role,
            }
          }
        });

        if (error) throw error;

        // Public users tablosuna da ekle
        if (data.user) {
          await supabase.from('users').upsert({
            id: data.user.id,
            email: formData.email,
            full_name: formData.full_name,
            role: formData.role,
            is_active: true,
          });
        }

        alert('Kullanıcı oluşturuldu. E-posta doğrulama linki gönderildi.');
      }

      setModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleUserStatus = async (user: User) => {
    if (user.id === currentUser?.id) {
      alert('Kendi hesabınızı devre dışı bırakamazsınız');
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !user.is_active })
        .eq('id', user.id);

      if (error) throw error;
      fetchUsers();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const handleDelete = async (user: User) => {
    if (user.id === currentUser?.id) {
      alert('Kendi hesabınızı silemezsiniz');
      return;
    }

    if (!confirm(`"${user.email}" kullanıcısını silmek istediğinize emin misiniz?`)) return;

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id);

      if (error) throw error;
      fetchUsers();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const roleLabels: Record<string, { label: string; color: 'danger' | 'warning' | 'info' | 'success' }> = {
    super_admin: { label: 'Süper Admin', color: 'danger' },
    admin: { label: 'Admin', color: 'warning' },
    manager: { label: 'Yönetici', color: 'info' },
    user: { label: 'Kullanıcı', color: 'success' },
  };

  if (loading) {
    return (
      <div>
        <Header title="Kullanıcı Yönetimi" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Kullanıcı Yönetimi" />
      <div className="p-6">
        {/* Özet Kartları */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{users.length}</p>
                <p className="text-xs text-slate-500">Toplam Kullanıcı</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{users.filter(u => u.is_active).length}</p>
                <p className="text-xs text-slate-500">Aktif</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <UserX className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{users.filter(u => !u.is_active).length}</p>
                <p className="text-xs text-slate-500">Pasif</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Shield className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{users.filter(u => u.role === 'admin' || u.role === 'super_admin').length}</p>
                <p className="text-xs text-slate-500">Admin</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Kullanıcılar</h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchUsers}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => openModal()}>
              <Plus className="h-4 w-4" /> Yeni Kullanıcı
            </Button>
          </div>
        </div>

        {/* Kullanıcı Listesi */}
        {users.length > 0 ? (
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium">Kullanıcı</th>
                      <th className="px-4 py-3 text-left font-medium">E-posta</th>
                      <th className="px-4 py-3 text-left font-medium">Rol</th>
                      <th className="px-4 py-3 text-left font-medium">Durum</th>
                      <th className="px-4 py-3 text-left font-medium">Kayıt Tarihi</th>
                      <th className="px-4 py-3 text-right font-medium">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium">
                              {(user.full_name || user.email).charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium">{user.full_name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{user.email}</td>
                        <td className="px-4 py-3">
                          <Badge variant={roleLabels[user.role]?.color || 'info'}>
                            {roleLabels[user.role]?.label || user.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleUserStatus(user)}
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              user.is_active 
                                ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                          >
                            {user.is_active ? '✓ Aktif' : '✗ Pasif'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {new Date(user.created_at).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openModal(user)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            {user.id !== currentUser?.id && (
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(user)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        ) : (
          <EmptyState 
            icon={<Users className="h-16 w-16" />} 
            title="Kullanıcı bulunamadı" 
            action={<Button onClick={() => openModal()}><Plus className="h-4 w-4" />Ekle</Button>} 
          />
        )}

        {/* Rol Açıklamaları */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle><Shield className="h-4 w-4" /> Rol Yetkileri</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-3 bg-red-50 rounded-lg">
                <Badge variant="danger" className="mb-2">Süper Admin</Badge>
                <p className="text-xs text-slate-600">Tüm sistem yetkilerine sahip. Kullanıcı yönetimi yapabilir.</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg">
                <Badge variant="warning" className="mb-2">Admin</Badge>
                <p className="text-xs text-slate-600">Tüm verileri görüntüleyebilir ve düzenleyebilir.</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <Badge variant="info" className="mb-2">Yönetici</Badge>
                <p className="text-xs text-slate-600">Ekibinin verilerini görüntüleyebilir ve düzenleyebilir.</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <Badge variant="success" className="mb-2">Kullanıcı</Badge>
                <p className="text-xs text-slate-600">Sadece kendi verilerini görüntüleyebilir.</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Modal */}
      <Modal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        title={editingUser ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input 
            label="Ad Soyad" 
            value={formData.full_name} 
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} 
          />
          <Input 
            label="E-posta *" 
            type="email"
            value={formData.email} 
            onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
            disabled={!!editingUser}
          />
          {!editingUser && (
            <Input 
              label="Şifre *" 
              type="password"
              value={formData.password} 
              onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
              placeholder="En az 6 karakter"
            />
          )}
          <Select 
            label="Rol" 
            value={formData.role} 
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            options={[
              { value: 'user', label: 'Kullanıcı' },
              { value: 'manager', label: 'Yönetici' },
              { value: 'admin', label: 'Admin' },
              { value: 'super_admin', label: 'Süper Admin' },
            ]} 
          />
        </div>
      </Modal>
    </div>
  );
}
