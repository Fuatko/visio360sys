'use client';

import Header from '@/components/Header';
import SalesFilter from '@/components/SalesFilter';
import { Card, CardBody, Button, Badge, Modal, Input, Select, EmptyState } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { Target, Plus, Edit2, Trash2, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface TargetData {
  id: string;
  sales_person_id: string | null;
  period: string;
  sales_target: number;
  collection_target: number;
  achieved_sales: number;
  achieved_collection: number;
  sales_team?: { name: string; region: string } | null;
}

interface SalesPerson {
  id: string;
  name: string;
  region: string;
}

export default function TargetsPage() {
  const [targets, setTargets] = useState<TargetData[]>([]);
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterPerson, setFilterPerson] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TargetData | null>(null);
  const [formData, setFormData] = useState({
    sales_person_id: '', period: '', sales_target: 0, collection_target: 0,
    achieved_sales: 0, achieved_collection: 0,
  });

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [targetRes, teamRes] = await Promise.all([
        supabase.from('targets').select('*').order('period', { ascending: false }),
        supabase.from('sales_team').select('id, name, region').eq('status', 'active'),
      ]);
      setTargets(targetRes.data || []);
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

  const openModal = (target?: TargetData) => {
    if (target) {
      setEditingTarget(target);
      setFormData({
        sales_person_id: target.sales_person_id || '', period: target.period || '',
        sales_target: target.sales_target || 0, collection_target: target.collection_target || 0,
        achieved_sales: target.achieved_sales || 0, achieved_collection: target.achieved_collection || 0,
      });
    } else {
      setEditingTarget(null);
      const currentPeriod = new Date().toISOString().slice(0, 7);
      setFormData({ sales_person_id: '', period: currentPeriod, sales_target: 0, collection_target: 0, achieved_sales: 0, achieved_collection: 0 });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.sales_person_id || !formData.period) { alert('Satışçı ve dönem zorunludur'); return; }
    setSaving(true);
    try {
      if (editingTarget) {
        await supabase.from('targets').update(formData).eq('id', editingTarget.id);
      } else {
        await supabase.from('targets').insert([formData]);
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
    await supabase.from('targets').delete().eq('id', id);
    fetchData();
  };

  // Unique periods
  const periods = [...new Set(targets.map(t => t.period))].sort().reverse();

  // Filtreleme
  const filtered = targets.filter(t => {
    const matchPeriod = !filterPeriod || t.period === filterPeriod;
    const matchPerson = !filterPerson || t.sales_person_id === filterPerson;
    const matchRegion = !filterRegion || (t.sales_team?.region === filterRegion);
    return matchPeriod && matchPerson && matchRegion;
  });

  const totalSalesTarget = filtered.reduce((s, t) => s + (t.sales_target || 0), 0);
  const totalSalesAchieved = filtered.reduce((s, t) => s + (t.achieved_sales || 0), 0);
  const totalCollTarget = filtered.reduce((s, t) => s + (t.collection_target || 0), 0);
  const totalCollAchieved = filtered.reduce((s, t) => s + (t.achieved_collection || 0), 0);

  const getAssignedName = (id: string | null) => {
    if (!id) return '-';
    const person = salesTeam.find(s => s.id === id);
    return person?.name || '-';
  };

  const calculatePercent = (achieved: number, target: number) => {
    if (!target) return 0;
    return Math.round((achieved / target) * 100);
  };

  if (loading) {
    return <div><Header title="Hedef Yönetimi" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;
  }

  return (
    <div>
      <Header title="Hedef Yönetimi" />
      <div className="p-6">
        {/* Bölge ve Kişi Filtresi */}
        <SalesFilter onFilterChange={handleFilterChange} />

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="">Tüm Dönemler</option>
            {periods.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
            <Button onClick={() => openModal()}><Plus className="h-4 w-4" />Yeni Hedef</Button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-slate-500 mb-1">Satış Hedefi</p>
            <p className="text-2xl font-bold">₺{formatMoney(totalSalesTarget)}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-sm text-green-600">₺{formatMoney(totalSalesAchieved)}</span>
              <span className="text-xs text-slate-400">({calculatePercent(totalSalesAchieved, totalSalesTarget)}%)</span>
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 mb-1">Tahsilat Hedefi</p>
            <p className="text-2xl font-bold">₺{formatMoney(totalCollTarget)}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-sm text-green-600">₺{formatMoney(totalCollAchieved)}</span>
              <span className="text-xs text-slate-400">({calculatePercent(totalCollAchieved, totalCollTarget)}%)</span>
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 mb-1">Satış Performansı</p>
            <div className="flex items-center gap-2">
              {calculatePercent(totalSalesAchieved, totalSalesTarget) >= 100 ? (
                <TrendingUp className="h-6 w-6 text-green-600" />
              ) : (
                <TrendingDown className="h-6 w-6 text-red-600" />
              )}
              <p className="text-2xl font-bold">{calculatePercent(totalSalesAchieved, totalSalesTarget)}%</p>
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 mb-1">Tahsilat Performansı</p>
            <div className="flex items-center gap-2">
              {calculatePercent(totalCollAchieved, totalCollTarget) >= 100 ? (
                <TrendingUp className="h-6 w-6 text-green-600" />
              ) : (
                <TrendingDown className="h-6 w-6 text-red-600" />
              )}
              <p className="text-2xl font-bold">{calculatePercent(totalCollAchieved, totalCollTarget)}%</p>
            </div>
          </Card>
        </div>

        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium">Dönem</th>
                  <th className="px-4 py-3 text-left font-medium">Satışçı</th>
                  <th className="px-4 py-3 text-right font-medium">Satış Hedefi</th>
                  <th className="px-4 py-3 text-right font-medium">Gerçekleşen</th>
                  <th className="px-4 py-3 text-center font-medium">%</th>
                  <th className="px-4 py-3 text-right font-medium">Tahsilat Hedefi</th>
                  <th className="px-4 py-3 text-right font-medium">Gerçekleşen</th>
                  <th className="px-4 py-3 text-center font-medium">%</th>
                  <th className="px-4 py-3 text-right font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const salesPercent = calculatePercent(t.achieved_sales, t.sales_target);
                  const collPercent = calculatePercent(t.achieved_collection, t.collection_target);
                  return (
                    <tr key={t.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{t.period}</td>
                      <td className="px-4 py-3">{getAssignedName(t.sales_person_id)}</td>
                      <td className="px-4 py-3 text-right">₺{formatMoney(t.sales_target || 0)}</td>
                      <td className="px-4 py-3 text-right text-green-600">₺{formatMoney(t.achieved_sales || 0)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={salesPercent >= 100 ? 'success' : salesPercent >= 70 ? 'warning' : 'danger'}>
                          {salesPercent}%
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">₺{formatMoney(t.collection_target || 0)}</td>
                      <td className="px-4 py-3 text-right text-green-600">₺{formatMoney(t.achieved_collection || 0)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={collPercent >= 100 ? 'success' : collPercent >= 70 ? 'warning' : 'danger'}>
                          {collPercent}%
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openModal(t)}><Edit2 className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Target className="h-16 w-16" />} title="Hedef bulunamadı" description="Seçilen filtrelere uygun hedef yok" action={<Button onClick={() => openModal()}><Plus className="h-4 w-4" />Ekle</Button>} />
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingTarget ? 'Düzenle' : 'Yeni Hedef'}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button><Button onClick={handleSave} disabled={saving}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Satışçı *" value={formData.sales_person_id} onChange={(e) => setFormData({ ...formData, sales_person_id: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...salesTeam.map(s => ({ value: s.id, label: s.name }))]} />
            <Input label="Dönem (YYYY-AA) *" value={formData.period} onChange={(e) => setFormData({ ...formData, period: e.target.value })} placeholder="2025-02" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Satış Hedefi (₺)" type="number" value={formData.sales_target} onChange={(e) => setFormData({ ...formData, sales_target: Number(e.target.value) })} />
            <Input label="Tahsilat Hedefi (₺)" type="number" value={formData.collection_target} onChange={(e) => setFormData({ ...formData, collection_target: Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Gerçekleşen Satış (₺)" type="number" value={formData.achieved_sales} onChange={(e) => setFormData({ ...formData, achieved_sales: Number(e.target.value) })} />
            <Input label="Gerçekleşen Tahsilat (₺)" type="number" value={formData.achieved_collection} onChange={(e) => setFormData({ ...formData, achieved_collection: Number(e.target.value) })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
