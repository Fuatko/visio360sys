'use client';

import Header from '@/components/Header';
import SalesFilter from '@/components/SalesFilter';
import { Card, CardBody, Button, Badge, Modal, Input, Select, Textarea, EmptyState } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { Building2, Plus, Edit2, Trash2, Mail, Phone, User, RefreshCw, Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface Customer {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  sector: string;
  size: string;
  status: string;
  assigned_to: string | null;
  total_sales: number;
  notes: string;
  sales_team?: { name: string; region: string } | null;
}

interface SalesPerson {
  id: string;
  name: string;
  region: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterPerson, setFilterPerson] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({
    name: '', contact_person: '', email: '', phone: '', address: '',
    sector: '', size: '', status: 'Potansiyel', assigned_to: '', total_sales: 0, notes: '',
  });

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [customersRes, teamRes] = await Promise.all([
        supabase.from('customers').select('*, sales_team:assigned_to(name, region)').order('created_at', { ascending: false }),
        supabase.from('sales_team').select('id, name, region').eq('status', 'active'),
      ]);
      setCustomers(customersRes.data || []);
      setSalesTeam(teamRes.data || []);
    } catch (err: any) {
      console.error('Hata:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleFilterChange = (filters: { region: string; department: string; repId: string }) => {
    setFilterRegion(filters.region);
    setFilterPerson(filters.repId);
  };

  const openModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name, contact_person: customer.contact_person || '',
        email: customer.email || '', phone: customer.phone || '',
        address: customer.address || '', sector: customer.sector || '',
        size: customer.size || '', status: customer.status || 'Potansiyel',
        assigned_to: customer.assigned_to || '', total_sales: customer.total_sales || 0,
        notes: customer.notes || '',
      });
    } else {
      setEditingCustomer(null);
      setFormData({ name: '', contact_person: '', email: '', phone: '', address: '',
        sector: '', size: '', status: 'Potansiyel', assigned_to: '', total_sales: 0, notes: '' });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) { alert('Firma adı zorunludur'); return; }
    setSaving(true);
    try {
      const dataToSave = { ...formData, assigned_to: formData.assigned_to || null };
      if (editingCustomer) {
        await supabase.from('customers').update(dataToSave).eq('id', editingCustomer.id);
      } else {
        await supabase.from('customers').insert([dataToSave]);
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
    if (!confirm('Silmek istediğinize emin misiniz?')) return;
    await supabase.from('customers').delete().eq('id', id);
    fetchData();
  };

  // Filtreleme
  const filtered = customers.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !filterStatus || c.status === filterStatus;
    const matchPerson = !filterPerson || c.assigned_to === filterPerson;
    const matchRegion = !filterRegion || (c.sales_team?.region === filterRegion);
    return matchSearch && matchStatus && matchPerson && matchRegion;
  });

  const getAssignedName = (id: string | null) => {
    if (!id) return '-';
    const person = salesTeam.find(s => s.id === id);
    return person?.name || '-';
  };

  if (loading) {
    return <div><Header title="Müşteriler" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;
  }

  return (
    <div>
      <Header title="Müşteriler" />
      <div className="p-6">
        {/* Bölge ve Kişi Filtresi */}
        <SalesFilter onFilterChange={handleFilterChange} />

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Ara..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-64 rounded-lg border border-slate-200 pl-10 pr-4 text-sm outline-none focus:border-blue-500" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
              <option value="">Tüm Durumlar</option>
              <option value="VIP">VIP</option>
              <option value="Aktif">Aktif</option>
              <option value="Potansiyel">Potansiyel</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
            <Button onClick={() => openModal()}><Plus className="h-4 w-4" />Yeni Müşteri</Button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4"><p className="text-2xl font-bold">{filtered.length}</p><p className="text-xs text-slate-500">Toplam</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-amber-600">{filtered.filter(c => c.status === 'VIP').length}</p><p className="text-xs text-slate-500">VIP</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-green-600">{filtered.filter(c => c.status === 'Aktif').length}</p><p className="text-xs text-slate-500">Aktif</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-blue-600">₺{formatMoney(filtered.reduce((s, c) => s + (c.total_sales || 0), 0))}</p><p className="text-xs text-slate-500">Toplam Satış</p></Card>
        </div>

        {filtered.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <Card key={c.id}>
                <CardBody>
                  <div className="mb-3 flex items-start justify-between">
                    <div><h3 className="font-semibold">{c.name}</h3><p className="text-xs text-slate-500">{c.sector}</p></div>
                    <Badge variant={c.status === 'VIP' ? 'warning' : c.status === 'Aktif' ? 'success' : 'info'}>{c.status}</Badge>
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    {c.contact_person && <div className="flex items-center gap-2"><User className="h-4 w-4 text-slate-400" />{c.contact_person}</div>}
                    {c.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" />{c.email}</div>}
                    {c.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" />{c.phone}</div>}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    Sorumlu: {getAssignedName(c.assigned_to)}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3">
                    <p className="text-lg font-bold text-blue-600">₺{formatMoney(c.total_sales || 0)}</p>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openModal(c)}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Building2 className="h-16 w-16" />} title="Müşteri bulunamadı" description="Seçilen filtrelere uygun müşteri yok" action={<Button onClick={() => openModal()}><Plus className="h-4 w-4" />Ekle</Button>} />
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingCustomer ? 'Düzenle' : 'Yeni Müşteri'}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button><Button onClick={handleSave} disabled={saving}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button></>}>
        <div className="space-y-4">
          <Input label="Firma Adı *" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Yetkili" value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} />
            <Select label="Durum" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={[{ value: 'Potansiyel', label: 'Potansiyel' }, { value: 'Aktif', label: 'Aktif' }, { value: 'VIP', label: 'VIP' }]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="E-posta" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            <Input label="Telefon" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Sektör" value={formData.sector} onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, { value: 'Teknoloji', label: 'Teknoloji' }, { value: 'Üretim', label: 'Üretim' }, { value: 'Perakende', label: 'Perakende' }, { value: 'Finans', label: 'Finans' }, { value: 'Holding', label: 'Holding' }, { value: 'Savunma', label: 'Savunma' }, { value: 'Telekom', label: 'Telekom' }, { value: 'Otomotiv', label: 'Otomotiv' }, { value: 'Turizm', label: 'Turizm' }, { value: 'Gıda', label: 'Gıda' }, { value: 'Eğitim', label: 'Eğitim' }]} />
            <Select label="Sorumlu" value={formData.assigned_to} onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...salesTeam.map(s => ({ value: s.id, label: s.name }))]} />
          </div>
          <Input label="Toplam Satış (₺)" type="number" value={formData.total_sales} onChange={(e) => setFormData({ ...formData, total_sales: Number(e.target.value) })} />
        </div>
      </Modal>
    </div>
  );
}
