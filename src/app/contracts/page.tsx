'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, EmptyState, Textarea } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { FileSignature, Plus, Edit2, Trash2, RefreshCw, Search, AlertTriangle, Clock, CheckCircle, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface Contract {
  id: string;
  contract_number: string;
  customer_id: string;
  customer?: { name: string };
  title: string;
  contract_type: string;
  value: number;
  currency: string;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  renewal_period: number;
  status: string;
  terms: string;
  notes: string;
  created_at: string;
}

interface Customer {
  id: string;
  name: string;
}

const contractTypes = [
  { value: 'sales', label: 'Satış Sözleşmesi' },
  { value: 'service', label: 'Hizmet Sözleşmesi' },
  { value: 'maintenance', label: 'Bakım Sözleşmesi' },
  { value: 'license', label: 'Lisans Sözleşmesi' },
  { value: 'subscription', label: 'Abonelik Sözleşmesi' },
  { value: 'partnership', label: 'İş Ortaklığı' },
  { value: 'nda', label: 'Gizlilik Sözleşmesi' },
  { value: 'other', label: 'Diğer' },
];

const statusConfig: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  draft: { label: 'Taslak', variant: 'default' },
  pending: { label: 'Onay Bekliyor', variant: 'warning' },
  active: { label: 'Aktif', variant: 'success' },
  expiring: { label: 'Sona Eriyor', variant: 'warning' },
  expired: { label: 'Sona Erdi', variant: 'danger' },
  cancelled: { label: 'İptal', variant: 'danger' },
  renewed: { label: 'Yenilendi', variant: 'info' },
};

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  const [formData, setFormData] = useState({
    customer_id: '',
    title: '',
    contract_type: 'service',
    value: 0,
    currency: 'TRY',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    auto_renew: false,
    renewal_period: 12,
    status: 'draft',
    terms: '',
    notes: '',
  });

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [contractsRes, customersRes] = await Promise.all([
        supabase.from('contracts').select('*, customer:customers(name)').order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name').order('name'),
      ]);
      
      setContracts(contractsRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (err: any) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const generateContractNumber = () => {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `SZL-${year}-${random}`;
  };

  const openModal = (contract?: Contract) => {
    if (contract) {
      setEditingContract(contract);
      setFormData({
        customer_id: contract.customer_id || '',
        title: contract.title || '',
        contract_type: contract.contract_type || 'service',
        value: contract.value || 0,
        currency: contract.currency || 'TRY',
        start_date: contract.start_date?.split('T')[0] || '',
        end_date: contract.end_date?.split('T')[0] || '',
        auto_renew: contract.auto_renew || false,
        renewal_period: contract.renewal_period || 12,
        status: contract.status || 'draft',
        terms: contract.terms || '',
        notes: contract.notes || '',
      });
    } else {
      setEditingContract(null);
      setFormData({
        customer_id: '',
        title: '',
        contract_type: 'service',
        value: 0,
        currency: 'TRY',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        auto_renew: false,
        renewal_period: 12,
        status: 'draft',
        terms: '',
        notes: '',
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.customer_id || !formData.title) {
      alert('Müşteri ve sözleşme başlığı zorunludur');
      return;
    }

    setSaving(true);
    try {
      const contractData = {
        ...formData,
        contract_number: editingContract?.contract_number || generateContractNumber(),
      };

      if (editingContract) {
        await supabase.from('contracts').update(contractData).eq('id', editingContract.id);
      } else {
        await supabase.from('contracts').insert([contractData]);
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
    if (!confirm('Bu sözleşmeyi silmek istediğinize emin misiniz?')) return;
    try {
      await supabase.from('contracts').delete().eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  // Bitiş tarihine kalan gün
  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const today = new Date();
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // Filtreleme
  const filteredContracts = contracts.filter(c => {
    const matchSearch = c.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       c.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       c.contract_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !filterStatus || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // İstatistikler
  const totalContracts = contracts.length;
  const activeContracts = contracts.filter(c => c.status === 'active');
  const expiringContracts = contracts.filter(c => {
    const days = getDaysRemaining(c.end_date);
    return days > 0 && days <= 30 && c.status === 'active';
  });
  const totalValue = activeContracts.reduce((sum, c) => sum + (c.value || 0), 0);

  if (loading) {
    return (
      <div>
        <Header title="Sözleşme Yönetimi" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Sözleşme Yönetimi" />
      
      <div className="p-6">
        {/* Uyarı Banner */}
        {expiringContracts.length > 0 && (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardBody className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800">
                  {expiringContracts.length} sözleşme 30 gün içinde sona erecek!
                </p>
                <p className="text-sm text-amber-600">
                  Yenileme işlemlerini planlamayı unutmayın.
                </p>
              </div>
            </CardBody>
          </Card>
        )}

        {/* İstatistik Kartları */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <FileSignature className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalContracts}</p>
                <p className="text-xs text-slate-500">Toplam Sözleşme</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{activeContracts.length}</p>
                <p className="text-xs text-slate-500">Aktif</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{expiringContracts.length}</p>
                <p className="text-xs text-slate-500">Sona Eriyor</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg">
                <Calendar className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">₺{formatMoney(totalValue)}</p>
                <p className="text-xs text-slate-500">Aktif Değer</p>
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
                placeholder="Sözleşme ara..."
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
            <Button variant="secondary" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => openModal()}>
              <Plus className="h-4 w-4" /> Yeni Sözleşme
            </Button>
          </div>
        </div>

        {/* Sözleşme Tablosu */}
        {filteredContracts.length > 0 ? (
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium">Sözleşme No</th>
                      <th className="px-4 py-3 text-left font-medium">Müşteri</th>
                      <th className="px-4 py-3 text-left font-medium">Başlık</th>
                      <th className="px-4 py-3 text-center font-medium">Tür</th>
                      <th className="px-4 py-3 text-right font-medium">Değer</th>
                      <th className="px-4 py-3 text-center font-medium">Bitiş</th>
                      <th className="px-4 py-3 text-center font-medium">Durum</th>
                      <th className="px-4 py-3 text-right font-medium">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContracts.map((contract) => {
                      const daysRemaining = getDaysRemaining(contract.end_date);
                      const isExpiring = daysRemaining > 0 && daysRemaining <= 30;
                      
                      return (
                        <tr key={contract.id} className="border-b hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                              {contract.contract_number}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium">{contract.customer?.name}</td>
                          <td className="px-4 py-3">
                            <p className="text-slate-900">{contract.title}</p>
                            {contract.auto_renew && (
                              <span className="text-xs text-emerald-600">🔄 Otomatik Yenileme</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="default">
                              {contractTypes.find(t => t.value === contract.contract_type)?.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            ₺{formatMoney(contract.value)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div>
                              <p className="text-xs text-slate-500">{formatDate(contract.end_date)}</p>
                              {isExpiring && (
                                <span className="text-xs text-amber-600 font-medium">
                                  {daysRemaining} gün kaldı
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={statusConfig[contract.status]?.variant || 'default'}>
                              {statusConfig[contract.status]?.label || contract.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openModal(contract)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(contract.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        ) : (
          <EmptyState
            icon={<FileSignature className="h-16 w-16" />}
            title="Sözleşme bulunamadı"
            description="Müşterilerinizle sözleşmelerinizi yönetin"
            action={<Button onClick={() => openModal()}><Plus className="h-4 w-4" /> Sözleşme Ekle</Button>}
          />
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingContract ? 'Sözleşme Düzenle' : 'Yeni Sözleşme'}
        
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
            <Select
              label="Müşteri *"
              value={formData.customer_id}
              onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
              options={[
                { value: '', label: 'Seçiniz' },
                ...customers.map(c => ({ value: c.id, label: c.name }))
              ]}
            />
            <Select
              label="Sözleşme Türü"
              value={formData.contract_type}
              onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
              options={contractTypes}
            />
          </div>

          <Input
            label="Sözleşme Başlığı *"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Örn: Yıllık Bakım ve Destek Sözleşmesi"
          />

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Sözleşme Değeri"
              type="number"
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
            />
            <Select
              label="Para Birimi"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              options={[
                { value: 'TRY', label: '₺ TRY' },
                { value: 'USD', label: '$ USD' },
                { value: 'EUR', label: '€ EUR' },
              ]}
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
          </div>

          <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
            <input
              type="checkbox"
              id="autoRenew"
              checked={formData.auto_renew}
              onChange={(e) => setFormData({ ...formData, auto_renew: e.target.checked })}
              className="rounded border-slate-300"
            />
            <label htmlFor="autoRenew" className="text-sm text-slate-600 flex-1">
              Otomatik yenileme aktif
            </label>
            {formData.auto_renew && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">Her</span>
                <input
                  type="number"
                  value={formData.renewal_period}
                  onChange={(e) => setFormData({ ...formData, renewal_period: parseInt(e.target.value) || 12 })}
                  className="w-16 px-2 py-1 rounded border border-slate-200 text-sm"
                />
                <span className="text-sm text-slate-600">ay</span>
              </div>
            )}
          </div>

          <Textarea
            label="Sözleşme Koşulları"
            value={formData.terms}
            onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
            rows={3}
            placeholder="Önemli sözleşme maddeleri..."
          />

          <Textarea
            label="Notlar"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
          />
        </div>
      </Modal>
    </div>
  );
}
