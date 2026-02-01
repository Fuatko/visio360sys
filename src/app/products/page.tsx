'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, EmptyState, Textarea } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { Package, Plus, Edit2, Trash2, RefreshCw, Search, Tag, Layers, BarChart3 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface Product {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  price: number;
  currency: string;
  tax_rate: number;
  status: string;
  created_at: string;
}

const categories = [
  'Yazılım',
  'Donanım',
  'Danışmanlık',
  'Eğitim',
  'Destek',
  'Lisans',
  'Bakım',
  'Diğer'
];

const units = [
  { value: 'adet', label: 'Adet' },
  { value: 'saat', label: 'Saat' },
  { value: 'gün', label: 'Gün' },
  { value: 'ay', label: 'Ay' },
  { value: 'yıl', label: 'Yıl' },
  { value: 'paket', label: 'Paket' },
  { value: 'kullanıcı', label: 'Kullanıcı' },
];

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    category: '',
    unit: 'adet',
    price: 0,
    currency: 'TRY',
    tax_rate: 20,
    status: 'active',
  });

  const supabase = createClient();

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const openModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        code: product.code || '',
        name: product.name,
        description: product.description || '',
        category: product.category || '',
        unit: product.unit || 'adet',
        price: product.price || 0,
        currency: product.currency || 'TRY',
        tax_rate: product.tax_rate || 20,
        status: product.status || 'active',
      });
    } else {
      setEditingProduct(null);
      setFormData({
        code: '',
        name: '',
        description: '',
        category: '',
        unit: 'adet',
        price: 0,
        currency: 'TRY',
        tax_rate: 20,
        status: 'active',
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price) {
      alert('Ürün adı ve fiyat zorunludur');
      return;
    }

    setSaving(true);
    try {
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(formData)
          .eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('products')
          .insert([formData]);
        if (error) throw error;
      }
      setModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      fetchProducts();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  // Filtreleme
  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       p.code?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = !filterCategory || p.category === filterCategory;
    return matchSearch && matchCategory;
  });

  // İstatistikler
  const activeProducts = products.filter(p => p.status === 'active').length;
  const totalValue = products.reduce((sum, p) => sum + (p.price || 0), 0);
  const avgPrice = products.length > 0 ? totalValue / products.length : 0;

  if (loading) {
    return (
      <div>
        <Header title="Ürün/Hizmet Kataloğu" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Ürün/Hizmet Kataloğu" />
      
      <div className="p-6">
        {/* İstatistik Kartları */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Package className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{products.length}</p>
                <p className="text-xs text-slate-500">Toplam Ürün</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Layers className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{activeProducts}</p>
                <p className="text-xs text-slate-500">Aktif Ürün</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg">
                <Tag className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{[...new Set(products.map(p => p.category))].length}</p>
                <p className="text-xs text-slate-500">Kategori</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <BarChart3 className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">₺{formatMoney(avgPrice)}</p>
                <p className="text-xs text-slate-500">Ort. Fiyat</p>
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
                placeholder="Ürün ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Tüm Kategoriler</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchProducts}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => openModal()}>
              <Plus className="h-4 w-4" /> Yeni Ürün
            </Button>
          </div>
        </div>

        {/* Ürün Tablosu */}
        {filteredProducts.length > 0 ? (
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium">Kod</th>
                      <th className="px-4 py-3 text-left font-medium">Ürün/Hizmet Adı</th>
                      <th className="px-4 py-3 text-left font-medium">Kategori</th>
                      <th className="px-4 py-3 text-left font-medium">Birim</th>
                      <th className="px-4 py-3 text-right font-medium">Fiyat</th>
                      <th className="px-4 py-3 text-center font-medium">KDV</th>
                      <th className="px-4 py-3 text-center font-medium">Durum</th>
                      <th className="px-4 py-3 text-right font-medium">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                            {product.code || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-slate-900">{product.name}</p>
                            {product.description && (
                              <p className="text-xs text-slate-500 truncate max-w-xs">{product.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="info">{product.category || '-'}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{product.unit}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          ₺{formatMoney(product.price)}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">%{product.tax_rate}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={product.status === 'active' ? 'success' : 'default'}>
                            {product.status === 'active' ? 'Aktif' : 'Pasif'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openModal(product)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(product.id)}>
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
            icon={<Package className="h-16 w-16" />}
            title="Ürün bulunamadı"
            description="Ürün/hizmet kataloğunuza yeni ürünler ekleyin"
            action={<Button onClick={() => openModal()}><Plus className="h-4 w-4" /> Ürün Ekle</Button>}
          />
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingProduct ? 'Ürün Düzenle' : 'Yeni Ürün/Hizmet'}
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
              label="Ürün Kodu"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="PRD-001"
            />
            <Select
              label="Kategori"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              options={[
                { value: '', label: 'Seçiniz' },
                ...categories.map(c => ({ value: c, label: c }))
              ]}
            />
          </div>
          
          <Input
            label="Ürün/Hizmet Adı *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Örn: Kurumsal Yazılım Paketi"
          />
          
          <Textarea
            label="Açıklama"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Ürün/hizmet açıklaması..."
            rows={3}
          />

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Fiyat *"
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
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
              label="Birim"
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              options={units}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="KDV Oranı"
              value={formData.tax_rate.toString()}
              onChange={(e) => setFormData({ ...formData, tax_rate: parseInt(e.target.value) })}
              options={[
                { value: '0', label: '%0' },
                { value: '1', label: '%1' },
                { value: '10', label: '%10' },
                { value: '20', label: '%20' },
              ]}
            />
            <Select
              label="Durum"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={[
                { value: 'active', label: 'Aktif' },
                { value: 'inactive', label: 'Pasif' },
              ]}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
