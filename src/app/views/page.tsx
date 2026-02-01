'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import {
  Eye, Star, Lock, Copy, Trash2, Edit2, Plus, Search, Filter,
  LayoutDashboard, TrendingUp, Wallet, Users, Award, ChevronRight,
  Building2, Calendar, BarChart3
} from 'lucide-react';
import Link from 'next/link';

interface SavedView {
  id: string;
  code: string;
  name: string;
  description?: string;
  module: string;
  is_system: boolean;
  is_default: boolean;
  audience_role: string;
  filters_json: Record<string, any>;
  groupby_json: string[];
  columns_json: string[];
  kpis_json: string[];
  created_at: string;
}

// Module info
const MODULE_INFO: Record<string, { label: string; icon: any; href: string; color: string }> = {
  dashboard: { label: 'Dashboard', icon: LayoutDashboard, href: '/', color: 'bg-indigo-100 text-indigo-700' },
  sales: { label: 'Satış Analitik', icon: TrendingUp, href: '/analytics/sales', color: 'bg-emerald-100 text-emerald-700' },
  collections: { label: 'Tahsilat Analitik', icon: Wallet, href: '/analytics/collections', color: 'bg-amber-100 text-amber-700' },
  commissions: { label: 'Prim Analitik', icon: Award, href: '/analytics/commissions', color: 'bg-violet-100 text-violet-700' },
  customers: { label: 'Müşteri Takip', icon: Building2, href: '/analytics/customers', color: 'bg-cyan-100 text-cyan-700' },
};

// Role info
const ROLE_INFO: Record<string, { label: string; color: string }> = {
  ceo: { label: 'CEO', color: 'bg-purple-100 text-purple-700' },
  sales_director: { label: 'Satış Direktörü', color: 'bg-blue-100 text-blue-700' },
  finance: { label: 'Finans', color: 'bg-emerald-100 text-emerald-700' },
  sales_ops: { label: 'Satış Operasyon', color: 'bg-amber-100 text-amber-700' },
  account_manager: { label: 'Hesap Yöneticisi', color: 'bg-cyan-100 text-cyan-700' },
  org_admin: { label: 'Kurum Admini', color: 'bg-indigo-100 text-indigo-700' },
  manager: { label: 'Yönetici', color: 'bg-violet-100 text-violet-700' },
  user: { label: 'Kullanıcı', color: 'bg-slate-100 text-slate-700' },
  super_admin: { label: 'Süper Admin', color: 'bg-red-100 text-red-700' },
};

export default function SavedViewsPage() {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModule, setFilterModule] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('user');
  
  const supabase = createClient();
  const { user } = useAuth();

  // Fetch user role
  useEffect(() => {
    const fetchRole = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      if (data) setUserRole(data.role);
    };
    fetchRole();
  }, [user?.id]);

  // Fetch views
  const fetchViews = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('saved_views')
        .select('*')
        .order('module')
        .order('is_system', { ascending: false })
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      setViews(data || []);
    } catch (err) {
      console.error('Views fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchViews();
    }
  }, [user?.id]);

  // Clone view
  const handleClone = async (view: SavedView) => {
    try {
      const { error } = await supabase
        .from('saved_views')
        .insert({
          code: `CUSTOM-${Date.now()}`,
          name: `${view.name} (Kopya)`,
          description: view.description,
          module: view.module,
          is_system: false,
          is_default: false,
          audience_role: userRole,
          filters_json: view.filters_json,
          groupby_json: view.groupby_json,
          columns_json: view.columns_json,
          default_sort_json: {},
          kpis_json: view.kpis_json,
          time_range_json: {},
          cloned_from_id: view.id,
          created_by: user?.id,
        });

      if (error) throw error;
      fetchViews();
    } catch (err: any) {
      alert('Kopyalama hatası: ' + err.message);
    }
  };

  // Delete view
  const handleDelete = async (view: SavedView) => {
    if (view.is_system) {
      alert('Sistem görünümleri silinemez');
      return;
    }
    if (!confirm(`"${view.name}" görünümünü silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('saved_views')
        .delete()
        .eq('id', view.id);

      if (error) throw error;
      fetchViews();
    } catch (err: any) {
      alert('Silme hatası: ' + err.message);
    }
  };

  // Filter views
  const filteredViews = views.filter(v => {
    const matchesSearch = 
      v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesModule = !filterModule || v.module === filterModule;
    const matchesRole = !filterRole || v.audience_role === filterRole;
    return matchesSearch && matchesModule && matchesRole;
  });

  // Group by module
  const groupedViews: Record<string, SavedView[]> = {};
  filteredViews.forEach(v => {
    if (!groupedViews[v.module]) groupedViews[v.module] = [];
    groupedViews[v.module].push(v);
  });

  // Stats
  const systemViews = views.filter(v => v.is_system);
  const customViews = views.filter(v => !v.is_system);
  const myRoleViews = views.filter(v => v.audience_role === userRole);

  return (
    <div>
      <Header 
        title="Kayıtlı Görünümler" 
        subtitle="Analitik raporlar için hazır görünümler"
      />

      <div className="p-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Toplam Görünüm</p>
                  <p className="text-2xl font-bold">{views.length}</p>
                </div>
                <Eye className="h-10 w-10 text-white/30" />
              </div>
            </CardBody>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Sistem Görünümleri</p>
                  <p className="text-2xl font-bold">{systemViews.length}</p>
                </div>
                <Lock className="h-10 w-10 text-white/30" />
              </div>
            </CardBody>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Özel Görünümlerim</p>
                  <p className="text-2xl font-bold">{customViews.length}</p>
                </div>
                <Star className="h-10 w-10 text-white/30" />
              </div>
            </CardBody>
          </Card>

          <Card className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Rolüme Özel</p>
                  <p className="text-2xl font-bold">{myRoleViews.length}</p>
                </div>
                <Users className="h-10 w-10 text-white/30" />
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Görünüm ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200"
          >
            <option value="">Tüm Modüller</option>
            {Object.entries(MODULE_INFO).map(([key, info]) => (
              <option key={key} value={key}>{info.label}</option>
            ))}
          </select>

          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200"
          >
            <option value="">Tüm Roller</option>
            {Object.entries(ROLE_INFO).map(([key, info]) => (
              <option key={key} value={key}>{info.label}</option>
            ))}
          </select>
        </div>

        {/* Views by Module */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">Yükleniyor...</div>
        ) : Object.keys(groupedViews).length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            Görünüm bulunamadı
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedViews).map(([module, moduleViews]) => {
              const moduleInfo = MODULE_INFO[module] || { 
                label: module, 
                icon: Eye, 
                href: '/', 
                color: 'bg-slate-100 text-slate-700' 
              };
              const Icon = moduleInfo.icon;

              return (
                <Card key={module}>
                  <CardHeader className="flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${moduleInfo.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{moduleInfo.label}</CardTitle>
                        <p className="text-xs text-slate-500">{moduleViews.length} görünüm</p>
                      </div>
                    </div>
                    <Link href={moduleInfo.href}>
                      <Button variant="secondary" size="sm">
                        Modüle Git <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </CardHeader>
                  <CardBody className="p-0">
                    <div className="divide-y divide-slate-100">
                      {moduleViews.map(view => (
                        <div
                          key={view.id}
                          className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-800 truncate">
                                  {view.name}
                                </span>
                                {view.is_system && (
                                  <Lock className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                )}
                                {view.is_default && (
                                  <Star className="h-3 w-3 text-amber-500 fill-amber-500 flex-shrink-0" />
                                )}
                              </div>
                              {view.description && (
                                <p className="text-xs text-slate-500 truncate">{view.description}</p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                                  {view.code}
                                </span>
                                <Badge className={`text-[10px] ${ROLE_INFO[view.audience_role]?.color || 'bg-slate-100 text-slate-600'}`}>
                                  {ROLE_INFO[view.audience_role]?.label || view.audience_role}
                                </Badge>
                                {view.kpis_json && view.kpis_json.length > 0 && (
                                  <span className="text-[10px] text-slate-400">
                                    {view.kpis_json.length} KPI
                                  </span>
                                )}
                                {view.groupby_json && view.groupby_json.length > 0 && (
                                  <span className="text-[10px] text-slate-400">
                                    Gruplama: {view.groupby_json.join(' → ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 ml-4">
                            <Link href={`${moduleInfo.href}?view=${view.id}`}>
                              <Button variant="ghost" size="sm" title="Görüntüle">
                                <Eye className="h-4 w-4 text-indigo-600" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleClone(view)}
                              title="Kopyala"
                            >
                              <Copy className="h-4 w-4 text-slate-500" />
                            </Button>
                            {!view.is_system && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(view)}
                                title="Sil"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}

        {/* Role Legend */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm">Rol Bazlı Görünümler Rehberi</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(ROLE_INFO).map(([role, info]) => {
                const roleViews = views.filter(v => v.audience_role === role && v.is_system);
                return (
                  <div key={role} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={info.color}>{info.label}</Badge>
                      <span className="text-xs text-slate-500">{roleViews.length} sistem görünümü</span>
                    </div>
                    <div className="space-y-1">
                      {roleViews.slice(0, 3).map(v => (
                        <p key={v.id} className="text-xs text-slate-600 truncate">
                          • {v.name}
                        </p>
                      ))}
                      {roleViews.length > 3 && (
                        <p className="text-xs text-slate-400">+{roleViews.length - 3} daha...</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
