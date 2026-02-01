'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input } from '@/components/ui';
import {
  Eye, Save, Copy, Trash2, Star, Lock, ChevronDown, Check, Filter,
  LayoutGrid, Table, Download, Settings, Plus, X, Search
} from 'lucide-react';

// ============ TYPES ============
export interface SavedView {
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
  default_sort_json: { key: string; direction: 'asc' | 'desc' };
  kpis_json: string[];
  time_range_json: { type: string; value?: number };
  cloned_from_id?: string;
  created_by?: string;
  created_at: string;
}

interface SavedViewsManagerProps {
  module: string; // dashboard, sales, collections, commissions, customers
  currentFilters: Record<string, any>;
  currentGroupBy: string[];
  currentColumns: string[];
  currentSort?: { key: string; direction: 'asc' | 'desc' };
  onApplyView: (view: SavedView) => void;
  onFiltersChange?: (filters: Record<string, any>) => void;
}

// Role display names
const ROLE_NAMES: Record<string, string> = {
  ceo: 'CEO',
  sales_director: 'Satış Direktörü',
  finance: 'Finans',
  sales_ops: 'Satış Operasyon',
  account_manager: 'Hesap Yöneticisi',
  org_admin: 'Kurum Admini',
  manager: 'Yönetici',
  user: 'Kullanıcı',
  super_admin: 'Süper Admin',
};

// Role colors
const ROLE_COLORS: Record<string, string> = {
  ceo: 'bg-purple-100 text-purple-700',
  sales_director: 'bg-blue-100 text-blue-700',
  finance: 'bg-emerald-100 text-emerald-700',
  sales_ops: 'bg-amber-100 text-amber-700',
  account_manager: 'bg-cyan-100 text-cyan-700',
  org_admin: 'bg-indigo-100 text-indigo-700',
  manager: 'bg-violet-100 text-violet-700',
  user: 'bg-slate-100 text-slate-700',
  super_admin: 'bg-red-100 text-red-700',
};

// ============ SAVED VIEWS MANAGER ============
export function SavedViewsManager({
  module,
  currentFilters,
  currentGroupBy,
  currentColumns,
  currentSort,
  onApplyView,
  onFiltersChange,
}: SavedViewsManagerProps) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeView, setActiveView] = useState<SavedView | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [userRole, setUserRole] = useState<string>('user');
  const [searchTerm, setSearchTerm] = useState('');

  // Save modal state
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveAsClone, setSaveAsClone] = useState(false);

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

  // Fetch saved views
  const fetchViews = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('saved_views')
        .select('*')
        .eq('module', module)
        .order('is_system', { ascending: false })
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      setViews(data || []);

      // Set active view (default for role or first system view)
      const defaultView = data?.find(v => v.is_default && v.audience_role === userRole);
      if (defaultView && !activeView) {
        setActiveView(defaultView);
        onApplyView(defaultView);
      }
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
  }, [user?.id, module, userRole]);

  // Apply a view
  const handleSelectView = (view: SavedView) => {
    setActiveView(view);
    onApplyView(view);
    setShowDropdown(false);
  };

  // Clone a system view
  const handleCloneView = async (view: SavedView) => {
    try {
      const { data, error } = await supabase
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
          default_sort_json: view.default_sort_json,
          kpis_json: view.kpis_json,
          time_range_json: view.time_range_json,
          cloned_from_id: view.id,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      fetchViews();
      if (data) handleSelectView(data);
    } catch (err: any) {
      alert('Kopyalama hatası: ' + err.message);
    }
  };

  // Save current view as new
  const handleSaveCurrentView = async () => {
    if (!saveName.trim()) {
      alert('Görünüm adı gerekli');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('saved_views')
        .insert({
          code: `CUSTOM-${Date.now()}`,
          name: saveName,
          description: saveDescription,
          module,
          is_system: false,
          is_default: false,
          audience_role: userRole,
          filters_json: currentFilters,
          groupby_json: currentGroupBy,
          columns_json: currentColumns,
          default_sort_json: currentSort || { key: '', direction: 'desc' },
          kpis_json: [],
          time_range_json: { type: 'current' },
          cloned_from_id: saveAsClone && activeView ? activeView.id : null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      setShowSaveModal(false);
      setSaveName('');
      setSaveDescription('');
      setSaveAsClone(false);
      fetchViews();
      if (data) handleSelectView(data);
    } catch (err: any) {
      alert('Kaydetme hatası: ' + err.message);
    }
  };

  // Delete a custom view
  const handleDeleteView = async (view: SavedView) => {
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
      
      if (activeView?.id === view.id) {
        setActiveView(null);
      }
      fetchViews();
    } catch (err: any) {
      alert('Silme hatası: ' + err.message);
    }
  };

  // Filter views by search
  const filteredViews = views.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group views by role
  const groupedViews: Record<string, SavedView[]> = {};
  filteredViews.forEach(v => {
    const role = v.is_system ? v.audience_role : 'custom';
    if (!groupedViews[role]) groupedViews[role] = [];
    groupedViews[role].push(v);
  });

  return (
    <div className="relative">
      {/* View Selector Button */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors bg-white"
        >
          <Eye className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-medium text-slate-700 max-w-[200px] truncate">
            {activeView ? activeView.name : 'Görünüm Seç'}
          </span>
          {activeView?.is_system && (
            <Lock className="h-3 w-3 text-slate-400" />
          )}
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>

        {/* Save Current View Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowSaveModal(true)}
          title="Mevcut görünümü kaydet"
        >
          <Save className="h-4 w-4" />
        </Button>
      </div>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div className="absolute left-0 top-full mt-2 w-96 rounded-xl border border-slate-200 bg-white shadow-xl z-50 max-h-[500px] overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Görünüm ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Views List */}
          <div className="overflow-auto flex-1 p-2">
            {loading ? (
              <div className="p-4 text-center text-slate-400 text-sm">Yükleniyor...</div>
            ) : Object.keys(groupedViews).length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm">Görünüm bulunamadı</div>
            ) : (
              Object.entries(groupedViews).map(([role, roleViews]) => (
                <div key={role} className="mb-3">
                  {/* Role Header */}
                  <div className="flex items-center gap-2 px-2 py-1 mb-1">
                    <Badge className={`text-xs ${role === 'custom' ? 'bg-slate-100 text-slate-600' : ROLE_COLORS[role] || 'bg-slate-100 text-slate-600'}`}>
                      {role === 'custom' ? 'Özel Görünümlerim' : ROLE_NAMES[role] || role}
                    </Badge>
                    <span className="text-xs text-slate-400">{roleViews.length}</span>
                  </div>

                  {/* Views */}
                  {roleViews.map(view => (
                    <div
                      key={view.id}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                        activeView?.id === view.id
                          ? 'bg-indigo-50 border border-indigo-200'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div
                        className="flex-1 min-w-0"
                        onClick={() => handleSelectView(view)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800 truncate">
                            {view.name}
                          </span>
                          {view.is_default && (
                            <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                          )}
                          {view.is_system && (
                            <Lock className="h-3 w-3 text-slate-400" />
                          )}
                        </div>
                        {view.description && (
                          <p className="text-xs text-slate-500 truncate">{view.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-400 font-mono">{view.code}</span>
                          {view.kpis_json && view.kpis_json.length > 0 && (
                            <span className="text-[10px] text-slate-400">
                              {view.kpis_json.length} KPI
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {activeView?.id === view.id && (
                          <Check className="h-4 w-4 text-indigo-600" />
                        )}
                        {view.is_system && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCloneView(view); }}
                            className="p-1 hover:bg-slate-200 rounded"
                            title="Kopyala"
                          >
                            <Copy className="h-4 w-4 text-slate-500" />
                          </button>
                        )}
                        {!view.is_system && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteView(view); }}
                            className="p-1 hover:bg-red-100 rounded"
                            title="Sil"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-slate-100 bg-slate-50">
            <button
              onClick={() => { setShowDropdown(false); setShowSaveModal(true); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              Yeni Görünüm Kaydet
            </button>
          </div>
        </div>
      )}

      {/* Save Modal */}
      <Modal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="Görünümü Kaydet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowSaveModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSaveCurrentView}>
              <Save className="h-4 w-4" /> Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Görünüm Adı *
            </label>
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Örn: Aylık Performans Raporum"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Açıklama
            </label>
            <textarea
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              placeholder="Bu görünüm ne için kullanılıyor?"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              rows={2}
            />
          </div>

          {activeView && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={saveAsClone}
                onChange={(e) => setSaveAsClone(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-slate-700">
                "{activeView.name}" görünümünün kopyası olarak kaydet
              </span>
            </label>
          )}

          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500 mb-2">Kaydedilecek ayarlar:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <Filter className="h-3 w-3 text-slate-400" />
                <span>{Object.keys(currentFilters).length} filtre</span>
              </div>
              <div className="flex items-center gap-1">
                <LayoutGrid className="h-3 w-3 text-slate-400" />
                <span>{currentGroupBy.length} gruplama</span>
              </div>
              <div className="flex items-center gap-1">
                <Table className="h-3 w-3 text-slate-400" />
                <span>{currentColumns.length} sütun</span>
              </div>
              {currentSort && (
                <div className="flex items-center gap-1">
                  <Settings className="h-3 w-3 text-slate-400" />
                  <span>Sıralama: {currentSort.key}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Click outside to close */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}

// ============ VIEW INFO CARD ============
interface ViewInfoCardProps {
  view: SavedView | null;
}

export function ViewInfoCard({ view }: ViewInfoCardProps) {
  if (!view) return null;

  return (
    <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
      <CardBody className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-slate-800">{view.name}</h3>
              {view.is_system && (
                <Badge className="bg-indigo-100 text-indigo-700 text-xs">
                  <Lock className="h-3 w-3 mr-1" />
                  Sistem
                </Badge>
              )}
              {view.is_default && (
                <Badge className="bg-amber-100 text-amber-700 text-xs">
                  <Star className="h-3 w-3 mr-1" />
                  Varsayılan
                </Badge>
              )}
            </div>
            {view.description && (
              <p className="text-sm text-slate-600">{view.description}</p>
            )}
          </div>
          <Badge className={ROLE_COLORS[view.audience_role] || 'bg-slate-100 text-slate-600'}>
            {ROLE_NAMES[view.audience_role] || view.audience_role}
          </Badge>
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
          <span className="font-mono bg-white/50 px-2 py-1 rounded">{view.code}</span>
          {view.groupby_json && view.groupby_json.length > 0 && (
            <span>Gruplama: {view.groupby_json.join(' → ')}</span>
          )}
          {view.kpis_json && view.kpis_json.length > 0 && (
            <span>{view.kpis_json.length} KPI</span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ============ QUICK VIEW TABS ============
interface QuickViewTabsProps {
  views: SavedView[];
  activeViewId?: string;
  onSelectView: (view: SavedView) => void;
}

export function QuickViewTabs({ views, activeViewId, onSelectView }: QuickViewTabsProps) {
  const defaultViews = views.filter(v => v.is_default || v.is_system).slice(0, 5);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {defaultViews.map(view => (
        <button
          key={view.id}
          onClick={() => onSelectView(view)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
            activeViewId === view.id
              ? 'bg-indigo-100 text-indigo-700 font-medium'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {view.is_default && <Star className="h-3 w-3" />}
          {view.name}
        </button>
      ))}
    </div>
  );
}
