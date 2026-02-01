'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import {
  Building2, Plus, Edit2, Trash2, Users, Settings, Shield, Check, X,
  Globe, Calendar, CreditCard, BarChart3, Eye, Search, MoreVertical,
  AlertTriangle, CheckCircle, Clock, TrendingUp
} from 'lucide-react';
import { formatMoney } from '@/lib/utils';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  domain?: string;
  settings: Record<string, any>;
  subscription_plan: 'basic' | 'pro' | 'enterprise';
  subscription_expires_at?: string;
  is_active: boolean;
  max_users: number;
  created_at: string;
  user_count?: number;
}

interface OrgStats {
  total_users: number;
  total_customers: number;
  total_sales: number;
  total_opportunities: number;
}

export default function SuperAdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [selectedOrgStats, setSelectedOrgStats] = useState<OrgStats | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    domain: '',
    subscription_plan: 'basic' as 'basic' | 'pro' | 'enterprise',
    max_users: 10,
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

  // Kurumları yükle
  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const { data: orgs, error } = await supabase
        .from('organizations')
        .select('*')
        .order('name');

      if (error) throw error;

      // Her kurum için kullanıcı sayısını al
      const orgsWithCounts = await Promise.all(
        (orgs || []).map(async (org) => {
          const { count } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', org.id);
          
          return { ...org, user_count: count || 0 };
        })
      );

      setOrganizations(orgsWithCounts);
    } catch (err) {
      console.error('Kurumlar yüklenirken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userRole === 'super_admin') {
      fetchOrganizations();
    }
  }, [userRole]);

  // Kurum istatistiklerini getir
  const fetchOrgStats = async (org: Organization) => {
    setSelectedOrg(org);
    setShowStatsModal(true);

    try {
      // Kullanıcı sayısı
      const { count: userCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id);

      // Müşteri sayısı
      const { count: customerCount } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id);

      // Toplam satış
      const { data: salesData } = await supabase
        .from('sales_targets')
        .select('actual_amount')
        .eq('organization_id', org.id);
      
      const totalSales = (salesData || []).reduce((sum, s) => sum + (s.actual_amount || 0), 0);

      // Fırsat sayısı
      const { count: oppCount } = await supabase
        .from('opportunities')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id);

      setSelectedOrgStats({
        total_users: userCount || 0,
        total_customers: customerCount || 0,
        total_sales: totalSales,
        total_opportunities: oppCount || 0,
      });
    } catch (err) {
      console.error('İstatistik hatası:', err);
    }
  };

  // Slug oluştur
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Kurum kaydet
  const handleSave = async () => {
    try {
      const slug = formData.slug || generateSlug(formData.name);

      if (editingOrg) {
        // Güncelle
        const { error } = await supabase
          .from('organizations')
          .update({
            name: formData.name,
            slug,
            domain: formData.domain || null,
            subscription_plan: formData.subscription_plan,
            max_users: formData.max_users,
            is_active: formData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingOrg.id);

        if (error) throw error;
      } else {
        // Yeni ekle
        const { error } = await supabase
          .from('organizations')
          .insert({
            name: formData.name,
            slug,
            domain: formData.domain || null,
            subscription_plan: formData.subscription_plan,
            max_users: formData.max_users,
            is_active: formData.is_active,
          });

        if (error) throw error;
      }

      setShowModal(false);
      setEditingOrg(null);
      resetForm();
      fetchOrganizations();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  // Kurum sil
  const handleDelete = async (org: Organization) => {
    if (!confirm(`"${org.name}" kurumunu silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz ve kuruma ait TÜM VERİLER silinecektir!`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', org.id);

      if (error) throw error;
      fetchOrganizations();
    } catch (err: any) {
      alert('Silme hatası: ' + err.message);
    }
  };

  // Kurum aktif/pasif yap
  const toggleActive = async (org: Organization) => {
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ is_active: !org.is_active })
        .eq('id', org.id);

      if (error) throw error;
      fetchOrganizations();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      domain: '',
      subscription_plan: 'basic',
      max_users: 10,
      is_active: true,
    });
  };

  const openEditModal = (org: Organization) => {
    setEditingOrg(org);
    setFormData({
      name: org.name,
      slug: org.slug,
      domain: org.domain || '',
      subscription_plan: org.subscription_plan,
      max_users: org.max_users,
      is_active: org.is_active,
    });
    setShowModal(true);
  };

  const planColors: Record<string, string> = {
    basic: 'bg-slate-100 text-slate-700',
    pro: 'bg-blue-100 text-blue-700',
    enterprise: 'bg-purple-100 text-purple-700',
  };

  const planNames: Record<string, string> = {
    basic: 'Temel',
    pro: 'Profesyonel',
    enterprise: 'Kurumsal',
  };

  const filteredOrgs = organizations.filter(org =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        title="Kurum Yönetimi" 
        subtitle="Tüm kurumları yönetin (Süper Admin)"
      />

      <div className="p-6">
        {/* Özet Kartlar */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Toplam Kurum</p>
                  <p className="text-2xl font-bold">{organizations.length}</p>
                </div>
                <Building2 className="h-10 w-10 text-white/30" />
              </div>
            </CardBody>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Aktif Kurum</p>
                  <p className="text-2xl font-bold">{organizations.filter(o => o.is_active).length}</p>
                </div>
                <CheckCircle className="h-10 w-10 text-white/30" />
              </div>
            </CardBody>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Toplam Kullanıcı</p>
                  <p className="text-2xl font-bold">{organizations.reduce((s, o) => s + (o.user_count || 0), 0)}</p>
                </div>
                <Users className="h-10 w-10 text-white/30" />
              </div>
            </CardBody>
          </Card>

          <Card className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Enterprise</p>
                  <p className="text-2xl font-bold">{organizations.filter(o => o.subscription_plan === 'enterprise').length}</p>
                </div>
                <CreditCard className="h-10 w-10 text-white/30" />
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Aksiyon Bar */}
        <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Kurum ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <Button onClick={() => { resetForm(); setEditingOrg(null); setShowModal(true); }}>
            <Plus className="h-4 w-4" /> Yeni Kurum
          </Button>
        </div>

        {/* Kurum Listesi */}
        <Card>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Yükleniyor...</div>
            ) : filteredOrgs.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                Kurum bulunamadı
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Kurum</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Plan</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-600">Kullanıcı</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-600">Durum</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Oluşturulma</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrgs.map((org) => (
                    <tr key={org.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                            {org.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{org.name}</p>
                            <p className="text-xs text-slate-500">{org.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={planColors[org.subscription_plan]}>
                          {planNames[org.subscription_plan]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm">
                          {org.user_count || 0} / {org.max_users}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {org.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-700">Aktif</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700">Pasif</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {new Date(org.created_at).toLocaleDateString('tr-TR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => fetchOrgStats(org)}
                            title="İstatistikler"
                          >
                            <BarChart3 className="h-4 w-4 text-indigo-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(org)}
                            title="Düzenle"
                          >
                            <Edit2 className="h-4 w-4 text-amber-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActive(org)}
                            title={org.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                          >
                            {org.is_active ? (
                              <X className="h-4 w-4 text-slate-600" />
                            ) : (
                              <Check className="h-4 w-4 text-emerald-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(org)}
                            title="Sil"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Kurum Ekle/Düzenle Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingOrg(null); }}
        title={editingOrg ? 'Kurum Düzenle' : 'Yeni Kurum Ekle'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowModal(false); setEditingOrg(null); }}>
              İptal
            </Button>
            <Button onClick={handleSave}>
              {editingOrg ? 'Güncelle' : 'Kaydet'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kurum Adı *</label>
            <Input
              value={formData.name}
              onChange={(e) => {
                setFormData({ 
                  ...formData, 
                  name: e.target.value,
                  slug: formData.slug || generateSlug(e.target.value)
                });
              }}
              placeholder="Örn: ABC Holding"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">URL Slug *</label>
            <Input
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              placeholder="Örn: abc-holding"
            />
            <p className="text-xs text-slate-500 mt-1">URL'de kullanılacak benzersiz isim</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Domain (Opsiyonel)</label>
            <Input
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              placeholder="Örn: abc.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Abonelik Planı</label>
              <select
                value={formData.subscription_plan}
                onChange={(e) => setFormData({ ...formData, subscription_plan: e.target.value as any })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200"
              >
                <option value="basic">Temel</option>
                <option value="pro">Profesyonel</option>
                <option value="enterprise">Kurumsal</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max Kullanıcı</label>
              <Input
                type="number"
                value={formData.max_users}
                onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) || 10 })}
                min={1}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="is_active" className="text-sm text-slate-700">Aktif</label>
          </div>
        </div>
      </Modal>

      {/* İstatistik Modal */}
      <Modal
        isOpen={showStatsModal}
        onClose={() => { setShowStatsModal(false); setSelectedOrgStats(null); }}
        title={`${selectedOrg?.name} - İstatistikler`}
      >
        {selectedOrgStats ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-indigo-600">Kullanıcı</p>
              <p className="text-2xl font-bold text-indigo-700">{selectedOrgStats.total_users}</p>
            </div>
            <div className="p-4 bg-emerald-50 rounded-lg">
              <p className="text-sm text-emerald-600">Müşteri</p>
              <p className="text-2xl font-bold text-emerald-700">{selectedOrgStats.total_customers}</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg">
              <p className="text-sm text-amber-600">Toplam Satış</p>
              <p className="text-2xl font-bold text-amber-700">₺{formatMoney(selectedOrgStats.total_sales)}</p>
            </div>
            <div className="p-4 bg-violet-50 rounded-lg">
              <p className="text-sm text-violet-600">Fırsat</p>
              <p className="text-2xl font-bold text-violet-700">{selectedOrgStats.total_opportunities}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">Yükleniyor...</div>
        )}
      </Modal>
    </div>
  );
}
