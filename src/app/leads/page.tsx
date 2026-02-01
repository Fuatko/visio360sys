'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, EmptyState, Textarea } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { UserPlus, Plus, Edit2, Trash2, RefreshCw, Search, Phone, Mail, Building2, ArrowRight, Star, TrendingUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  source: string;
  status: string;
  score: number;
  estimated_value: number;
  notes: string;
  assigned_to?: string;
  sales_person?: { name: string };
  created_at: string;
  last_contact?: string;
}

interface SalesPerson {
  id: string;
  name: string;
}

const sources = [
  { value: 'website', label: 'Web Sitesi' },
  { value: 'referral', label: 'Referans' },
  { value: 'social', label: 'Sosyal Medya' },
  { value: 'advertisement', label: 'Reklam' },
  { value: 'cold_call', label: 'Soğuk Arama' },
  { value: 'event', label: 'Etkinlik/Fuar' },
  { value: 'email', label: 'E-posta Kampanyası' },
  { value: 'other', label: 'Diğer' },
];

const statusStages = [
  { value: 'new', label: 'Yeni', color: 'bg-slate-500' },
  { value: 'contacted', label: 'İletişime Geçildi', color: 'bg-blue-500' },
  { value: 'qualified', label: 'Nitelikli', color: 'bg-violet-500' },
  { value: 'proposal', label: 'Teklif Aşaması', color: 'bg-amber-500' },
  { value: 'negotiation', label: 'Müzakere', color: 'bg-orange-500' },
  { value: 'won', label: 'Kazanıldı', color: 'bg-emerald-500' },
  { value: 'lost', label: 'Kaybedildi', color: 'bg-red-500' },
];

const statusConfig: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  new: { label: 'Yeni', variant: 'default' },
  contacted: { label: 'İletişime Geçildi', variant: 'info' },
  qualified: { label: 'Nitelikli', variant: 'info' },
  proposal: { label: 'Teklif', variant: 'warning' },
  negotiation: { label: 'Müzakere', variant: 'warning' },
  won: { label: 'Kazanıldı', variant: 'success' },
  lost: { label: 'Kaybedildi', variant: 'danger' },
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    source: 'website',
    status: 'new',
    score: 50,
    estimated_value: 0,
    notes: '',
    assigned_to: '',
  });

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [leadsRes, teamRes] = await Promise.all([
        supabase.from('leads').select('*, sales_person:sales_team(name)').order('created_at', { ascending: false }),
        supabase.from('sales_team').select('id, name').eq('status', 'active').order('name'),
      ]);
      
      setLeads(leadsRes.data || []);
      setSalesTeam(teamRes.data || []);
    } catch (err: any) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openModal = (lead?: Lead) => {
    if (lead) {
      setEditingLead(lead);
      setFormData({
        company_name: lead.company_name || '',
        contact_name: lead.contact_name || '',
        contact_email: lead.contact_email || '',
        contact_phone: lead.contact_phone || '',
        source: lead.source || 'website',
        status: lead.status || 'new',
        score: lead.score || 50,
        estimated_value: lead.estimated_value || 0,
        notes: lead.notes || '',
        assigned_to: lead.assigned_to || '',
      });
    } else {
      setEditingLead(null);
      setFormData({
        company_name: '',
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        source: 'website',
        status: 'new',
        score: 50,
        estimated_value: 0,
        notes: '',
        assigned_to: '',
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.company_name) {
      alert('Firma adı zorunludur');
      return;
    }

    setSaving(true);
    try {
      if (editingLead) {
        await supabase.from('leads').update(formData).eq('id', editingLead.id);
      } else {
        await supabase.from('leads').insert([formData]);
      }
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu lead\'i silmek istediğinize emin misiniz?')) return;
    try {
      await supabase.from('leads').delete().eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await supabase.from('leads').update({ status, last_contact: new Date().toISOString() }).eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const convertToCustomer = async () => {
    if (!selectedLead) return;
    
    try {
      // Müşteri olarak ekle
      const { error } = await supabase.from('customers').insert([{
        name: selectedLead.company_name,
        contact_person: selectedLead.contact_name,
        email: selectedLead.contact_email,
        phone: selectedLead.contact_phone,
        assigned_to: selectedLead.assigned_to,
        source: selectedLead.source,
        status: 'active',
      }]);

      if (error) throw error;

      // Lead'i kazanıldı olarak işaretle
      await supabase.from('leads').update({ status: 'won' }).eq('id', selectedLead.id);

      setConvertModalOpen(false);
      setSelectedLead(null);
      fetchData();
      alert('Lead başarıyla müşteriye dönüştürüldü!');
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  // Filtreleme
  const filteredLeads = leads.filter(l => {
    const matchSearch = l.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       l.contact_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !filterStatus || l.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // İstatistikler
  const totalLeads = leads.length;
  const newLeads = leads.filter(l => l.status === 'new').length;
  const qualifiedLeads = leads.filter(l => ['qualified', 'proposal', 'negotiation'].includes(l.status)).length;
  const wonLeads = leads.filter(l => l.status === 'won').length;
  const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

  // Score rengi
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 bg-emerald-100';
    if (score >= 60) return 'text-amber-600 bg-amber-100';
    if (score >= 40) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  if (loading) {
    return (
      <div>
        <Header title="Potansiyel Müşteriler (Leads)" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Potansiyel Müşteriler (Leads)" />
      
      <div className="p-6">
        {/* İstatistik Kartları */}
        <div className="mb-6 grid gap-4 md:grid-cols-5">
          <Card className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <UserPlus className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalLeads}</p>
                <p className="text-xs text-slate-500">Toplam Lead</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-slate-50 to-gray-50 border-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-200 rounded-lg">
                <Star className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{newLeads}</p>
                <p className="text-xs text-slate-500">Yeni</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{qualifiedLeads}</p>
                <p className="text-xs text-slate-500">Nitelikli</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Building2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{wonLeads}</p>
                <p className="text-xs text-slate-500">Kazanılan</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">%{conversionRate}</p>
                <p className="text-xs text-slate-500">Dönüşüm</p>
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
                placeholder="Lead ara..."
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
              {statusStages.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => openModal()}>
              <Plus className="h-4 w-4" /> Yeni Lead
            </Button>
          </div>
        </div>

        {/* Lead Tablosu */}
        {filteredLeads.length > 0 ? (
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium">Firma</th>
                      <th className="px-4 py-3 text-left font-medium">İletişim</th>
                      <th className="px-4 py-3 text-center font-medium">Kaynak</th>
                      <th className="px-4 py-3 text-center font-medium">Puan</th>
                      <th className="px-4 py-3 text-center font-medium">Durum</th>
                      <th className="px-4 py-3 text-center font-medium">Atanan</th>
                      <th className="px-4 py-3 text-right font-medium">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{lead.company_name}</p>
                          <p className="text-xs text-slate-500">{formatDate(lead.created_at)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-900">{lead.contact_name || '-'}</p>
                          <div className="flex items-center gap-3 mt-1">
                            {lead.contact_email && (
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {lead.contact_email}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="default">
                            {sources.find(s => s.value === lead.source)?.label || lead.source}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(lead.score)}`}>
                            {lead.score}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={statusConfig[lead.status]?.variant || 'default'}>
                            {statusConfig[lead.status]?.label || lead.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">
                          {lead.sales_person?.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {!['won', 'lost'].includes(lead.status) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setSelectedLead(lead); setConvertModalOpen(true); }}
                                title="Müşteriye Dönüştür"
                              >
                                <ArrowRight className="h-4 w-4 text-emerald-500" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => openModal(lead)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(lead.id)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
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
            icon={<UserPlus className="h-16 w-16" />}
            title="Lead bulunamadı"
            description="Potansiyel müşterilerinizi takip edin"
            action={<Button onClick={() => openModal()}><Plus className="h-4 w-4" /> Lead Ekle</Button>}
          />
        )}
      </div>

      {/* Lead Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingLead ? 'Lead Düzenle' : 'Yeni Lead'}
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
            label="Firma Adı *"
            value={formData.company_name}
            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
            placeholder="ABC Teknoloji Ltd."
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="İletişim Kişisi"
              value={formData.contact_name}
              onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
              placeholder="Ahmet Yılmaz"
            />
            <Input
              label="E-posta"
              type="email"
              value={formData.contact_email}
              onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
              placeholder="ahmet@abc.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Telefon"
              value={formData.contact_phone}
              onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
              placeholder="0532 111 2233"
            />
            <Select
              label="Kaynak"
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              options={sources}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Durum"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={statusStages.map(s => ({ value: s.value, label: s.label }))}
            />
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Lead Puanı (0-100)</label>
              <input
                type="range"
                min="0"
                max="100"
                value={formData.score}
                onChange={(e) => setFormData({ ...formData, score: parseInt(e.target.value) })}
                className="w-full"
              />
              <p className="text-center text-sm font-medium">{formData.score}</p>
            </div>
            <Input
              label="Tahmini Değer (₺)"
              type="number"
              value={formData.estimated_value}
              onChange={(e) => setFormData({ ...formData, estimated_value: parseFloat(e.target.value) || 0 })}
            />
          </div>

          <Select
            label="Atanan Satış Uzmanı"
            value={formData.assigned_to}
            onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
            options={[
              { value: '', label: 'Seçiniz' },
              ...salesTeam.map(s => ({ value: s.id, label: s.name }))
            ]}
          />

          <Textarea
            label="Notlar"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
          />
        </div>
      </Modal>

      {/* Müşteriye Dönüştür Modal */}
      <Modal
        isOpen={convertModalOpen}
        onClose={() => setConvertModalOpen(false)}
        title="Müşteriye Dönüştür"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConvertModalOpen(false)}>İptal</Button>
            <Button onClick={convertToCustomer}>Dönüştür</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-slate-600">
            <strong>{selectedLead?.company_name}</strong> lead'ini müşteriye dönüştürmek istediğinize emin misiniz?
          </p>
          <div className="bg-slate-50 p-4 rounded-lg space-y-2">
            <p><strong>Firma:</strong> {selectedLead?.company_name}</p>
            <p><strong>İletişim:</strong> {selectedLead?.contact_name}</p>
            <p><strong>E-posta:</strong> {selectedLead?.contact_email}</p>
            <p><strong>Telefon:</strong> {selectedLead?.contact_phone}</p>
          </div>
          <p className="text-sm text-slate-500">
            Bu işlem sonucunda lead "Kazanıldı" olarak işaretlenecek ve müşteri listesine eklenecektir.
          </p>
        </div>
      </Modal>
    </div>
  );
}
