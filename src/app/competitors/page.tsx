'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, EmptyState, Textarea } from '@/components/ui';
import { Swords, Plus, Edit2, Trash2, RefreshCw, Search, Globe, TrendingUp, TrendingDown, Minus, Eye } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface Competitor {
  id: string;
  name: string;
  website: string;
  description: string;
  strengths: string;
  weaknesses: string;
  market_position: string;
  price_level: string;
  main_products: string;
  threat_level: string;
  notes: string;
  is_active: boolean;
  created_at: string;
}

const priceLevels = [
  { value: 'low', label: 'Düşük', color: 'text-emerald-600 bg-emerald-50' },
  { value: 'medium', label: 'Orta', color: 'text-amber-600 bg-amber-50' },
  { value: 'high', label: 'Yüksek', color: 'text-orange-600 bg-orange-50' },
  { value: 'premium', label: 'Premium', color: 'text-violet-600 bg-violet-50' },
];

const threatLevels = [
  { value: 'low', label: 'Düşük', icon: TrendingDown, color: 'text-emerald-600 bg-emerald-50' },
  { value: 'medium', label: 'Orta', icon: Minus, color: 'text-amber-600 bg-amber-50' },
  { value: 'high', label: 'Yüksek', icon: TrendingUp, color: 'text-red-600 bg-red-50' },
];

const marketPositions = [
  { value: 'leader', label: 'Pazar Lideri' },
  { value: 'challenger', label: 'Meydan Okuyan' },
  { value: 'follower', label: 'Takipçi' },
  { value: 'nicher', label: 'Niş Oyuncu' },
  { value: 'new', label: 'Yeni Giren' },
];

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    website: '',
    description: '',
    strengths: '',
    weaknesses: '',
    market_position: 'follower',
    price_level: 'medium',
    main_products: '',
    threat_level: 'medium',
    notes: '',
    is_active: true,
  });

  const supabase = createClient();

  const fetchCompetitors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('competitors')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setCompetitors(data || []);
    } catch (err: any) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCompetitors(); }, []);

  const openModal = (competitor?: Competitor) => {
    if (competitor) {
      setEditingCompetitor(competitor);
      setFormData({
        name: competitor.name || '',
        website: competitor.website || '',
        description: competitor.description || '',
        strengths: competitor.strengths || '',
        weaknesses: competitor.weaknesses || '',
        market_position: competitor.market_position || 'follower',
        price_level: competitor.price_level || 'medium',
        main_products: competitor.main_products || '',
        threat_level: competitor.threat_level || 'medium',
        notes: competitor.notes || '',
        is_active: competitor.is_active ?? true,
      });
    } else {
      setEditingCompetitor(null);
      setFormData({
        name: '',
        website: '',
        description: '',
        strengths: '',
        weaknesses: '',
        market_position: 'follower',
        price_level: 'medium',
        main_products: '',
        threat_level: 'medium',
        notes: '',
        is_active: true,
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert('Rakip adı zorunludur');
      return;
    }

    setSaving(true);
    try {
      if (editingCompetitor) {
        await supabase.from('competitors').update(formData).eq('id', editingCompetitor.id);
      } else {
        await supabase.from('competitors').insert([formData]);
      }
      setModalOpen(false);
      fetchCompetitors();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu rakibi silmek istediğinize emin misiniz?')) return;
    try {
      await supabase.from('competitors').delete().eq('id', id);
      fetchCompetitors();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const viewCompetitor = (competitor: Competitor) => {
    setSelectedCompetitor(competitor);
    setDetailModalOpen(true);
  };

  // Filtreleme
  const filteredCompetitors = competitors.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // İstatistikler
  const totalCompetitors = competitors.length;
  const highThreat = competitors.filter(c => c.threat_level === 'high').length;
  const activeCompetitors = competitors.filter(c => c.is_active).length;

  if (loading) {
    return (
      <div>
        <Header title="Rakip Analizi" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Rakip Analizi" />
      
      <div className="p-6">
        {/* İstatistik Kartları */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Swords className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalCompetitors}</p>
                <p className="text-xs text-slate-500">Toplam Rakip</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-red-50 to-rose-50 border-red-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{highThreat}</p>
                <p className="text-xs text-slate-500">Yüksek Tehdit</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Eye className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{activeCompetitors}</p>
                <p className="text-xs text-slate-500">Aktif Takip</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg">
                <Globe className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {competitors.filter(c => c.market_position === 'leader').length}
                </p>
                <p className="text-xs text-slate-500">Pazar Lideri</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rakip ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchCompetitors}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => openModal()}>
              <Plus className="h-4 w-4" /> Rakip Ekle
            </Button>
          </div>
        </div>

        {/* Rakip Kartları */}
        {filteredCompetitors.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCompetitors.map((competitor) => {
              const threat = threatLevels.find(t => t.value === competitor.threat_level);
              const ThreatIcon = threat?.icon || Minus;
              const price = priceLevels.find(p => p.value === competitor.price_level);
              const position = marketPositions.find(p => p.value === competitor.market_position);
              
              return (
                <Card key={competitor.id} className={`overflow-hidden ${!competitor.is_active && 'opacity-60'}`}>
                  <div className={`h-2 ${threat?.value === 'high' ? 'bg-red-500' : threat?.value === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <CardBody className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900">{competitor.name}</h3>
                        {competitor.website && (
                          <a href={competitor.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                            <Globe className="h-3 w-3" /> {competitor.website}
                          </a>
                        )}
                      </div>
                      <div className={`p-1.5 rounded ${threat?.color}`}>
                        <ThreatIcon className="h-4 w-4" />
                      </div>
                    </div>

                    {competitor.description && (
                      <p className="text-sm text-slate-600 line-clamp-2">{competitor.description}</p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="default">{position?.label || competitor.market_position}</Badge>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${price?.color}`}>
                        {price?.label || competitor.price_level} Fiyat
                      </span>
                    </div>

                    {competitor.main_products && (
                      <div>
                        <p className="text-xs text-slate-500">Ürünler:</p>
                        <p className="text-sm text-slate-700 line-clamp-1">{competitor.main_products}</p>
                      </div>
                    )}

                    <div className="flex gap-2 border-t pt-3">
                      <Button variant="secondary" size="sm" className="flex-1" onClick={() => viewCompetitor(competitor)}>
                        <Eye className="h-3 w-3" /> Detay
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openModal(competitor)}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(competitor.id)}>
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Swords className="h-16 w-16" />}
            title="Rakip bulunamadı"
            description="Rakiplerinizi takip etmeye başlayın"
            action={<Button onClick={() => openModal()}><Plus className="h-4 w-4" /> Rakip Ekle</Button>}
          />
        )}
      </div>

      {/* Rakip Ekleme/Düzenleme Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCompetitor ? 'Rakip Düzenle' : 'Yeni Rakip'}
        
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
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Rakip Adı *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="ABC Yazılım"
            />
            <Input
              label="Web Sitesi"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://example.com"
            />
          </div>

          <Textarea
            label="Açıklama"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Rakip hakkında genel bilgi..."
            rows={2}
          />

          <Input
            label="Ana Ürün/Hizmetler"
            value={formData.main_products}
            onChange={(e) => setFormData({ ...formData, main_products: e.target.value })}
            placeholder="ERP, CRM, Muhasebe..."
          />

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Pazar Konumu"
              value={formData.market_position}
              onChange={(e) => setFormData({ ...formData, market_position: e.target.value })}
              options={marketPositions}
            />
            <Select
              label="Fiyat Seviyesi"
              value={formData.price_level}
              onChange={(e) => setFormData({ ...formData, price_level: e.target.value })}
              options={priceLevels}
            />
            <Select
              label="Tehdit Seviyesi"
              value={formData.threat_level}
              onChange={(e) => setFormData({ ...formData, threat_level: e.target.value })}
              options={threatLevels}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Textarea
              label="Güçlü Yönleri"
              value={formData.strengths}
              onChange={(e) => setFormData({ ...formData, strengths: e.target.value })}
              placeholder="- Güçlü marka&#10;- Geniş müşteri ağı..."
              rows={3}
            />
            <Textarea
              label="Zayıf Yönleri"
              value={formData.weaknesses}
              onChange={(e) => setFormData({ ...formData, weaknesses: e.target.value })}
              placeholder="- Yüksek fiyat&#10;- Zayıf destek..."
              rows={3}
            />
          </div>

          <Textarea
            label="Notlar"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-slate-300"
            />
            <label htmlFor="isActive" className="text-sm text-slate-600">Aktif takip</label>
          </div>
        </div>
      </Modal>

      {/* Detay Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={selectedCompetitor?.name || 'Rakip Detay'}
        
        footer={<Button variant="secondary" onClick={() => setDetailModalOpen(false)}>Kapat</Button>}
      >
        {selectedCompetitor && (
          <div className="space-y-6">
            {selectedCompetitor.website && (
              <a href={selectedCompetitor.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                <Globe className="h-4 w-4" /> {selectedCompetitor.website}
              </a>
            )}

            {selectedCompetitor.description && (
              <div>
                <h4 className="text-sm font-medium text-slate-500 mb-1">Açıklama</h4>
                <p className="text-slate-700">{selectedCompetitor.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              <div className="p-4 bg-emerald-50 rounded-lg">
                <h4 className="text-sm font-medium text-emerald-700 mb-2">💪 Güçlü Yönler</h4>
                <p className="text-sm text-slate-700 whitespace-pre-line">{selectedCompetitor.strengths || 'Belirtilmemiş'}</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <h4 className="text-sm font-medium text-red-700 mb-2">⚠️ Zayıf Yönler</h4>
                <p className="text-sm text-slate-700 whitespace-pre-line">{selectedCompetitor.weaknesses || 'Belirtilmemiş'}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Pazar Konumu</p>
                <p className="font-medium">{marketPositions.find(p => p.value === selectedCompetitor.market_position)?.label}</p>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Fiyat Seviyesi</p>
                <p className="font-medium">{priceLevels.find(p => p.value === selectedCompetitor.price_level)?.label}</p>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Tehdit Seviyesi</p>
                <p className="font-medium">{threatLevels.find(t => t.value === selectedCompetitor.threat_level)?.label}</p>
              </div>
            </div>

            {selectedCompetitor.main_products && (
              <div>
                <h4 className="text-sm font-medium text-slate-500 mb-1">Ana Ürün/Hizmetler</h4>
                <p className="text-slate-700">{selectedCompetitor.main_products}</p>
              </div>
            )}

            {selectedCompetitor.notes && (
              <div>
                <h4 className="text-sm font-medium text-slate-500 mb-1">Notlar</h4>
                <p className="text-slate-700">{selectedCompetitor.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
