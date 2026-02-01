'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, EmptyState, Textarea, ProgressBar } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { Megaphone, Plus, Edit2, Trash2, RefreshCw, Search, Calendar, Target, TrendingUp, Play, Pause, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface Campaign {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  start_date: string;
  end_date: string;
  budget: number;
  target_revenue: number;
  actual_revenue: number;
  discount_percent: number;
  discount_amount: number;
  terms: string;
  created_at: string;
}

const campaignTypes = [
  { value: 'discount', label: 'İndirim Kampanyası' },
  { value: 'bundle', label: 'Paket Kampanya' },
  { value: 'seasonal', label: 'Sezonluk Kampanya' },
  { value: 'clearance', label: 'Stok Eritme' },
  { value: 'loyalty', label: 'Sadakat Programı' },
  { value: 'referral', label: 'Referans Kampanyası' },
  { value: 'launch', label: 'Lansman' },
  { value: 'other', label: 'Diğer' },
];

const statusConfig: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger'; icon: any }> = {
  draft: { label: 'Taslak', variant: 'default', icon: null },
  active: { label: 'Aktif', variant: 'success', icon: Play },
  paused: { label: 'Duraklatıldı', variant: 'warning', icon: Pause },
  completed: { label: 'Tamamlandı', variant: 'info', icon: CheckCircle },
  cancelled: { label: 'İptal', variant: 'danger', icon: null },
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'discount',
    status: 'draft',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    budget: 0,
    target_revenue: 0,
    actual_revenue: 0,
    discount_percent: 0,
    discount_amount: 0,
    terms: '',
  });

  const supabase = createClient();

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setCampaigns(data || []);
    } catch (err: any) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCampaigns(); }, []);

  const openModal = (campaign?: Campaign) => {
    if (campaign) {
      setEditingCampaign(campaign);
      setFormData({
        name: campaign.name || '',
        description: campaign.description || '',
        type: campaign.type || 'discount',
        status: campaign.status || 'draft',
        start_date: campaign.start_date?.split('T')[0] || '',
        end_date: campaign.end_date?.split('T')[0] || '',
        budget: campaign.budget || 0,
        target_revenue: campaign.target_revenue || 0,
        actual_revenue: campaign.actual_revenue || 0,
        discount_percent: campaign.discount_percent || 0,
        discount_amount: campaign.discount_amount || 0,
        terms: campaign.terms || '',
      });
    } else {
      setEditingCampaign(null);
      setFormData({
        name: '',
        description: '',
        type: 'discount',
        status: 'draft',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        budget: 0,
        target_revenue: 0,
        actual_revenue: 0,
        discount_percent: 0,
        discount_amount: 0,
        terms: '',
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert('Kampanya adı zorunludur');
      return;
    }

    setSaving(true);
    try {
      if (editingCampaign) {
        await supabase.from('campaigns').update(formData).eq('id', editingCampaign.id);
      } else {
        await supabase.from('campaigns').insert([formData]);
      }
      setModalOpen(false);
      fetchCampaigns();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu kampanyayı silmek istediğinize emin misiniz?')) return;
    try {
      await supabase.from('campaigns').delete().eq('id', id);
      fetchCampaigns();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await supabase.from('campaigns').update({ status }).eq('id', id);
      fetchCampaigns();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  // Kalan gün hesaplama
  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const today = new Date();
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Filtreleme
  const filteredCampaigns = campaigns.filter(c => {
    const matchSearch = c.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !filterStatus || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // İstatistikler
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const totalBudget = campaigns.filter(c => c.status === 'active').reduce((sum, c) => sum + (c.budget || 0), 0);
  const totalRevenue = campaigns.reduce((sum, c) => sum + (c.actual_revenue || 0), 0);

  if (loading) {
    return (
      <div>
        <Header title="Kampanya Yönetimi" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Kampanya Yönetimi" />
      
      <div className="p-6">
        {/* İstatistik Kartları */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Megaphone className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalCampaigns}</p>
                <p className="text-xs text-slate-500">Toplam Kampanya</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Play className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{activeCampaigns}</p>
                <p className="text-xs text-slate-500">Aktif</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Target className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">₺{formatMoney(totalBudget)}</p>
                <p className="text-xs text-slate-500">Aktif Bütçe</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">₺{formatMoney(totalRevenue)}</p>
                <p className="text-xs text-slate-500">Toplam Gelir</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-3 flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Kampanya ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
            >
              <option value="">Tüm Durumlar</option>
              {Object.entries(statusConfig).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchCampaigns}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => openModal()}>
              <Plus className="h-4 w-4" /> Yeni Kampanya
            </Button>
          </div>
        </div>

        {/* Kampanya Kartları */}
        {filteredCampaigns.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCampaigns.map((campaign) => {
              const status = statusConfig[campaign.status] || statusConfig.draft;
              const type = campaignTypes.find(t => t.value === campaign.type);
              const daysRemaining = getDaysRemaining(campaign.end_date);
              const progress = campaign.target_revenue > 0 
                ? Math.min(Math.round((campaign.actual_revenue / campaign.target_revenue) * 100), 100) 
                : 0;
              
              return (
                <Card key={campaign.id} className="overflow-hidden">
                  <div className={`px-4 py-3 ${campaign.status === 'active' ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-slate-400 to-slate-500'}`}>
                    <div className="flex items-center justify-between">
                      <Badge variant="default" className="bg-white/20 text-white">
                        {type?.label || campaign.type}
                      </Badge>
                      <Badge variant={status.variant}>
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                  
                  <CardBody className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-slate-900">{campaign.name}</h3>
                      {campaign.description && (
                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">{campaign.description}</p>
                      )}
                    </div>

                    {/* Tarih Bilgileri */}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}
                      </span>
                      {campaign.status === 'active' && daysRemaining > 0 && (
                        <span className={`font-medium ${daysRemaining <= 7 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {daysRemaining} gün kaldı
                        </span>
                      )}
                    </div>

                    {/* İndirim Bilgisi */}
                    {(campaign.discount_percent > 0 || campaign.discount_amount > 0) && (
                      <div className="p-2 bg-rose-50 rounded-lg text-center">
                        <span className="text-lg font-bold text-rose-600">
                          {campaign.discount_percent > 0 ? `%${campaign.discount_percent}` : `₺${formatMoney(campaign.discount_amount)}`}
                        </span>
                        <span className="text-sm text-rose-500 ml-1">İndirim</span>
                      </div>
                    )}

                    {/* Hedef Progress */}
                    {campaign.target_revenue > 0 && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">Hedef Gelir</span>
                          <span className="font-medium">₺{formatMoney(campaign.actual_revenue)} / ₺{formatMoney(campaign.target_revenue)}</span>
                        </div>
                        <ProgressBar 
                          value={progress} 
                          max={100} 
                          color={progress >= 100 ? 'green' : progress >= 50 ? 'blue' : 'orange'} 
                          showLabel={false} 
                        />
                      </div>
                    )}

                    {/* Aksiyon Butonları */}
                    <div className="flex gap-2 border-t pt-3">
                      {campaign.status === 'draft' && (
                        <Button variant="primary" size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => updateStatus(campaign.id, 'active')}>
                          <Play className="h-3 w-3" /> Başlat
                        </Button>
                      )}
                      {campaign.status === 'active' && (
                        <Button variant="secondary" size="sm" className="flex-1 bg-amber-100 text-amber-700 hover:bg-amber-200" onClick={() => updateStatus(campaign.id, 'paused')}>
                          <Pause className="h-3 w-3" /> Duraklat
                        </Button>
                      )}
                      {campaign.status === 'paused' && (
                        <Button variant="primary" size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => updateStatus(campaign.id, 'active')}>
                          <Play className="h-3 w-3" /> Devam
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openModal(campaign)}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(campaign.id)}>
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
            icon={<Megaphone className="h-16 w-16" />}
            title="Kampanya bulunamadı"
            description="Satış kampanyalarınızı oluşturun ve yönetin"
            action={<Button onClick={() => openModal()}><Plus className="h-4 w-4" /> Kampanya Oluştur</Button>}
          />
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCampaign ? 'Kampanya Düzenle' : 'Yeni Kampanya'}
        
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
              label="Kampanya Adı *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Yılsonu İndirim Kampanyası"
            />
            <Select
              label="Kampanya Tipi"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              options={campaignTypes}
            />
          </div>

          <Textarea
            label="Açıklama"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Kampanya detayları..."
            rows={2}
          />

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Başlangıç Tarihi"
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            />
            <Input
              label="Bitiş Tarihi"
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            />
            <Select
              label="Durum"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={Object.entries(statusConfig).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="İndirim Oranı (%)"
              type="number"
              value={formData.discount_percent}
              onChange={(e) => setFormData({ ...formData, discount_percent: parseFloat(e.target.value) || 0 })}
            />
            <Input
              label="İndirim Tutarı (₺)"
              type="number"
              value={formData.discount_amount}
              onChange={(e) => setFormData({ ...formData, discount_amount: parseFloat(e.target.value) || 0 })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Bütçe (₺)"
              type="number"
              value={formData.budget}
              onChange={(e) => setFormData({ ...formData, budget: parseFloat(e.target.value) || 0 })}
            />
            <Input
              label="Hedef Gelir (₺)"
              type="number"
              value={formData.target_revenue}
              onChange={(e) => setFormData({ ...formData, target_revenue: parseFloat(e.target.value) || 0 })}
            />
            <Input
              label="Gerçekleşen Gelir (₺)"
              type="number"
              value={formData.actual_revenue}
              onChange={(e) => setFormData({ ...formData, actual_revenue: parseFloat(e.target.value) || 0 })}
            />
          </div>

          <Textarea
            label="Kampanya Koşulları"
            value={formData.terms}
            onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
            placeholder="Kampanya şartları ve koşulları..."
            rows={3}
          />
        </div>
      </Modal>
    </div>
  );
}
