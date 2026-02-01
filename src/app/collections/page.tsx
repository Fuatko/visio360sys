'use client';

import Header from '@/components/Header';
import SalesFilter from '@/components/SalesFilter';
import { Card, CardBody, Button, Badge, Modal, Input, Select, EmptyState } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { Wallet, Plus, Edit2, Trash2, RefreshCw, Building2, Calendar, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface Collection {
  id: string;
  customer_id: string | null;
  sales_person_id: string | null;
  amount: number;
  due_date: string;
  status: string;
  payment_date: string | null;
  invoice_no: string;
  notes: string;
  customer?: { name: string } | null;
  sales_team?: { name: string; region: string } | null;
}

interface Customer {
  id: string;
  name: string;
}

interface SalesPerson {
  id: string;
  name: string;
  region: string;
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterPerson, setFilterPerson] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingColl, setEditingColl] = useState<Collection | null>(null);
  const [formData, setFormData] = useState({
    customer_id: '', sales_person_id: '', amount: 0, due_date: '', status: 'Bekliyor',
    payment_date: '', invoice_no: '', notes: '',
  });

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [collRes, custRes, teamRes] = await Promise.all([
        supabase.from('collections').select('*, customer:customer_id(name), sales_team:sales_person_id(name, region)').order('due_date', { ascending: true }),
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('sales_team').select('id, name, region').eq('status', 'active'),
      ]);
      setCollections(collRes.data || []);
      setCustomers(custRes.data || []);
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

  const openModal = (coll?: Collection) => {
    if (coll) {
      setEditingColl(coll);
      setFormData({
        customer_id: coll.customer_id || '', sales_person_id: coll.sales_person_id || '',
        amount: coll.amount || 0, due_date: coll.due_date || '', status: coll.status || 'Bekliyor',
        payment_date: coll.payment_date || '', invoice_no: coll.invoice_no || '', notes: coll.notes || '',
      });
    } else {
      setEditingColl(null);
      setFormData({ customer_id: '', sales_person_id: '', amount: 0, due_date: '', status: 'Bekliyor', payment_date: '', invoice_no: '', notes: '' });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.amount) { alert('Tutar zorunludur'); return; }
    setSaving(true);
    try {
      const dataToSave = { 
        ...formData, 
        customer_id: formData.customer_id || null, 
        sales_person_id: formData.sales_person_id || null,
        payment_date: formData.payment_date || null 
      };
      if (editingColl) {
        await supabase.from('collections').update(dataToSave).eq('id', editingColl.id);
      } else {
        await supabase.from('collections').insert([dataToSave]);
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
    await supabase.from('collections').delete().eq('id', id);
    fetchData();
  };

  // Filtreleme
  const filtered = collections.filter(c => {
    const matchStatus = !filterStatus || c.status === filterStatus;
    const matchPerson = !filterPerson || c.sales_person_id === filterPerson;
    const matchRegion = !filterRegion || (c.sales_team?.region === filterRegion);
    return matchStatus && matchPerson && matchRegion;
  });

  const totalAmount = filtered.reduce((s, c) => s + (c.amount || 0), 0);
  const paidAmount = filtered.filter(c => c.status === 'Ödendi').reduce((s, c) => s + (c.amount || 0), 0);
  const pendingAmount = filtered.filter(c => c.status === 'Bekliyor').reduce((s, c) => s + (c.amount || 0), 0);
  const overdueAmount = filtered.filter(c => c.status === 'Gecikmiş').reduce((s, c) => s + (c.amount || 0), 0);

  const statusColors: Record<string, 'success' | 'warning' | 'danger'> = {
    'Ödendi': 'success',
    'Bekliyor': 'warning',
    'Gecikmiş': 'danger',
  };

  const getAssignedName = (id: string | null) => {
    if (!id) return '-';
    const person = salesTeam.find(s => s.id === id);
    return person?.name || '-';
  };

  if (loading) {
    return <div><Header title="Tahsilatlar" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;
  }

  return (
    <div>
      <Header title="Tahsilatlar" />
      <div className="p-6">
        {/* Bölge ve Kişi Filtresi */}
        <SalesFilter onFilterChange={handleFilterChange} />

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="">Tüm Durumlar</option>
            <option value="Ödendi">Ödendi</option>
            <option value="Bekliyor">Bekliyor</option>
            <option value="Gecikmiş">Gecikmiş</option>
          </select>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
            <Button onClick={() => openModal()}><Plus className="h-4 w-4" />Yeni Tahsilat</Button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4"><p className="text-2xl font-bold">₺{formatMoney(totalAmount)}</p><p className="text-xs text-slate-500">Toplam</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-green-600">₺{formatMoney(paidAmount)}</p><p className="text-xs text-slate-500">Ödenen</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-amber-600">₺{formatMoney(pendingAmount)}</p><p className="text-xs text-slate-500">Bekleyen</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-red-600">₺{formatMoney(overdueAmount)}</p><p className="text-xs text-slate-500">Gecikmiş</p></Card>
        </div>

        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium">Fatura No</th>
                  <th className="px-4 py-3 text-left font-medium">Müşteri</th>
                  <th className="px-4 py-3 text-left font-medium">Sorumlu</th>
                  <th className="px-4 py-3 text-right font-medium">Tutar</th>
                  <th className="px-4 py-3 text-left font-medium">Vade</th>
                  <th className="px-4 py-3 text-left font-medium">Durum</th>
                  <th className="px-4 py-3 text-right font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{c.invoice_no || '-'}</td>
                    <td className="px-4 py-3">{c.customer?.name || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{getAssignedName(c.sales_person_id)}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">₺{formatMoney(c.amount || 0)}</td>
                    <td className="px-4 py-3">{c.due_date ? new Date(c.due_date).toLocaleDateString('tr-TR') : '-'}</td>
                    <td className="px-4 py-3"><Badge variant={statusColors[c.status] || 'info'}>{c.status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openModal(c)}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Wallet className="h-16 w-16" />} title="Tahsilat bulunamadı" description="Seçilen filtrelere uygun tahsilat yok" action={<Button onClick={() => openModal()}><Plus className="h-4 w-4" />Ekle</Button>} />
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingColl ? 'Düzenle' : 'Yeni Tahsilat'}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button><Button onClick={handleSave} disabled={saving}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button></>}>
        <div className="space-y-4">
          <Input label="Fatura No" value={formData.invoice_no} onChange={(e) => setFormData({ ...formData, invoice_no: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Müşteri" value={formData.customer_id} onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
            <Select label="Sorumlu" value={formData.sales_person_id} onChange={(e) => setFormData({ ...formData, sales_person_id: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...salesTeam.map(s => ({ value: s.id, label: s.name }))]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Tutar (₺) *" type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })} />
            <Select label="Durum" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={[{ value: 'Bekliyor', label: 'Bekliyor' }, { value: 'Ödendi', label: 'Ödendi' }, { value: 'Gecikmiş', label: 'Gecikmiş' }]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Vade Tarihi" type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
            <Input label="Ödeme Tarihi" type="date" value={formData.payment_date} onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
