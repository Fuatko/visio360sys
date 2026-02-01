'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, EmptyState, Textarea } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { FileText, Plus, Edit2, Trash2, RefreshCw, Search, Eye, Send, CheckCircle, XCircle, Download, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  customer?: { name: string };
  subject: string;
  status: string;
  valid_until: string;
  subtotal: number;
  tax_total: number;
  discount: number;
  total: number;
  notes: string;
  created_at: string;
  items?: QuoteItem[];
}

interface QuoteItem {
  id: string;
  product_id: string;
  product?: { name: string; price: number };
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
  total: number;
}

interface Customer {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  tax_rate: number;
  unit: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  draft: { label: 'Taslak', variant: 'default' },
  sent: { label: 'Gönderildi', variant: 'info' },
  approved: { label: 'Onaylandı', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  expired: { label: 'Süresi Doldu', variant: 'warning' },
};

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  const [formData, setFormData] = useState({
    customer_id: '',
    subject: '',
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: '',
    discount: 0,
  });
  
  const [items, setItems] = useState<{
    product_id: string;
    quantity: number;
    unit_price: number;
    discount: number;
    tax_rate: number;
  }[]>([]);

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [quotesRes, customersRes, productsRes] = await Promise.all([
        supabase.from('quotes').select('*, customer:customers(name)').order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('products').select('id, name, price, tax_rate, unit').eq('status', 'active'),
      ]);
      
      setQuotes(quotesRes.data || []);
      setCustomers(customersRes.data || []);
      setProducts(productsRes.data || []);
    } catch (err: any) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const generateQuoteNumber = () => {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `TKL-${year}-${random}`;
  };

  const openModal = () => {
    setFormData({
      customer_id: '',
      subject: '',
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: '',
      discount: 0,
    });
    setItems([{ product_id: '', quantity: 1, unit_price: 0, discount: 0, tax_rate: 20 }]);
    setModalOpen(true);
  };

  const addItem = () => {
    setItems([...items, { product_id: '', quantity: 1, unit_price: 0, discount: 0, tax_rate: 20 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Ürün seçildiğinde fiyat ve KDV otomatik doldur
    if (field === 'product_id') {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].unit_price = product.price;
        newItems[index].tax_rate = product.tax_rate;
      }
    }
    
    setItems(newItems);
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let taxTotal = 0;
    
    items.forEach(item => {
      const lineTotal = item.quantity * item.unit_price * (1 - item.discount / 100);
      const lineTax = lineTotal * (item.tax_rate / 100);
      subtotal += lineTotal;
      taxTotal += lineTax;
    });
    
    const discountAmount = subtotal * (formData.discount / 100);
    const total = subtotal - discountAmount + taxTotal;
    
    return { subtotal, taxTotal, discountAmount, total };
  };

  const handleSave = async () => {
    if (!formData.customer_id || items.length === 0) {
      alert('Müşteri ve en az bir ürün seçmelisiniz');
      return;
    }

    setSaving(true);
    try {
      const { subtotal, taxTotal, total } = calculateTotals();
      
      const quoteData = {
        quote_number: generateQuoteNumber(),
        customer_id: formData.customer_id,
        subject: formData.subject,
        valid_until: formData.valid_until,
        notes: formData.notes,
        discount: formData.discount,
        subtotal,
        tax_total: taxTotal,
        total,
        status: 'draft',
      };

      const { data: quote, error } = await supabase
        .from('quotes')
        .insert([quoteData])
        .select()
        .single();

      if (error) throw error;

      // Teklif kalemlerini ekle
      const quoteItems = items.map(item => ({
        quote_id: quote.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        tax_rate: item.tax_rate,
        total: item.quantity * item.unit_price * (1 - item.discount / 100),
      }));

      await supabase.from('quote_items').insert(quoteItems);

      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await supabase.from('quotes').update({ status }).eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu teklifi silmek istediğinize emin misiniz?')) return;
    try {
      await supabase.from('quote_items').delete().eq('quote_id', id);
      await supabase.from('quotes').delete().eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const viewQuote = async (quote: Quote) => {
    const { data: items } = await supabase
      .from('quote_items')
      .select('*, product:products(name)')
      .eq('quote_id', quote.id);
    
    setSelectedQuote({ ...quote, items: items || [] });
    setDetailModalOpen(true);
  };

  const printQuote = () => {
    window.print();
  };

  // Filtreleme
  const filteredQuotes = quotes.filter(q => {
    const matchSearch = q.quote_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       q.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !filterStatus || q.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // İstatistikler
  const totalQuotes = quotes.length;
  const approvedQuotes = quotes.filter(q => q.status === 'approved');
  const pendingValue = quotes.filter(q => q.status === 'sent').reduce((sum, q) => sum + q.total, 0);
  const approvedValue = approvedQuotes.reduce((sum, q) => sum + q.total, 0);

  const { subtotal, taxTotal, total } = calculateTotals();

  if (loading) {
    return (
      <div>
        <Header title="Teklif Yönetimi" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Teklif Yönetimi" />
      
      <div className="p-6">
        {/* İstatistik Kartları */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <FileText className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalQuotes}</p>
                <p className="text-xs text-slate-500">Toplam Teklif</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Send className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">₺{formatMoney(pendingValue)}</p>
                <p className="text-xs text-slate-500">Bekleyen</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{approvedQuotes.length}</p>
                <p className="text-xs text-slate-500">Onaylanan</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">₺{formatMoney(approvedValue)}</p>
                <p className="text-xs text-slate-500">Onaylanan Tutar</p>
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
                placeholder="Teklif ara..."
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
            <Button onClick={openModal}>
              <Plus className="h-4 w-4" /> Yeni Teklif
            </Button>
          </div>
        </div>

        {/* Teklif Tablosu */}
        {filteredQuotes.length > 0 ? (
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium">Teklif No</th>
                      <th className="px-4 py-3 text-left font-medium">Müşteri</th>
                      <th className="px-4 py-3 text-left font-medium">Konu</th>
                      <th className="px-4 py-3 text-right font-medium">Tutar</th>
                      <th className="px-4 py-3 text-center font-medium">Durum</th>
                      <th className="px-4 py-3 text-center font-medium">Geçerlilik</th>
                      <th className="px-4 py-3 text-right font-medium">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuotes.map((quote) => (
                      <tr key={quote.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                            {quote.quote_number}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">{quote.customer?.name}</td>
                        <td className="px-4 py-3 text-slate-600">{quote.subject || '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold">₺{formatMoney(quote.total)}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={statusConfig[quote.status]?.variant || 'default'}>
                            {statusConfig[quote.status]?.label || quote.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500 text-xs">
                          {formatDate(quote.valid_until)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => viewQuote(quote)} title="Görüntüle">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {quote.status === 'draft' && (
                              <Button variant="ghost" size="sm" onClick={() => updateStatus(quote.id, 'sent')} title="Gönder">
                                <Send className="h-4 w-4 text-blue-500" />
                              </Button>
                            )}
                            {quote.status === 'sent' && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => updateStatus(quote.id, 'approved')} title="Onayla">
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => updateStatus(quote.id, 'rejected')} title="Reddet">
                                  <XCircle className="h-4 w-4 text-red-500" />
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(quote.id)}>
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
            icon={<FileText className="h-16 w-16" />}
            title="Teklif bulunamadı"
            description="Müşterilerinize yeni teklifler oluşturun"
            action={<Button onClick={openModal}><Plus className="h-4 w-4" /> Teklif Oluştur</Button>}
          />
        )}
      </div>

      {/* Yeni Teklif Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Yeni Teklif Oluştur"
        
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Teklif Oluştur'}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Müşteri ve Genel Bilgiler */}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Müşteri *"
              value={formData.customer_id}
              onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
              options={[
                { value: '', label: 'Müşteri Seçin' },
                ...customers.map(c => ({ value: c.id, label: c.name }))
              ]}
            />
            <Input
              label="Geçerlilik Tarihi"
              type="date"
              value={formData.valid_until}
              onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
            />
          </div>

          <Input
            label="Teklif Konusu"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            placeholder="Örn: Yazılım Geliştirme Projesi"
          />

          {/* Ürün Kalemleri */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-medium text-slate-700">Ürün/Hizmet Kalemleri</label>
              <Button variant="secondary" size="sm" onClick={addItem}>
                <Plus className="h-3 w-3" /> Kalem Ekle
              </Button>
            </div>
            
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2 items-start p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1 grid grid-cols-5 gap-2">
                    <div className="col-span-2">
                      <select
                        value={item.product_id}
                        onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                        className="w-full px-3 py-2 rounded border border-slate-200 text-sm"
                      >
                        <option value="">Ürün Seç</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} - ₺{formatMoney(p.price)}</option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 rounded border border-slate-200 text-sm"
                      placeholder="Miktar"
                      min="1"
                    />
                    <input
                      type="number"
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded border border-slate-200 text-sm"
                      placeholder="Birim Fiyat"
                    />
                    <input
                      type="number"
                      value={item.discount}
                      onChange={(e) => updateItem(index, 'discount', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded border border-slate-200 text-sm"
                      placeholder="İsk %"
                      min="0"
                      max="100"
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeItem(index)} disabled={items.length === 1}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Toplamlar */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Ara Toplam:</span>
              <span className="font-medium">₺{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-slate-600">Genel İskonto (%):</span>
              <input
                type="number"
                value={formData.discount}
                onChange={(e) => setFormData({ ...formData, discount: parseFloat(e.target.value) || 0 })}
                className="w-20 px-2 py-1 rounded border border-slate-200 text-sm text-right"
                min="0"
                max="100"
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">KDV:</span>
              <span className="font-medium">₺{formatMoney(taxTotal)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Genel Toplam:</span>
              <span className="text-indigo-600">₺{formatMoney(total)}</span>
            </div>
          </div>

          <Textarea
            label="Notlar"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Teklif ile ilgili notlar..."
            rows={2}
          />
        </div>
      </Modal>

      {/* Teklif Detay Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={`Teklif: ${selectedQuote?.quote_number}`}
        
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailModalOpen(false)}>Kapat</Button>
            <Button variant="secondary" onClick={printQuote}>
              <Printer className="h-4 w-4" /> Yazdır
            </Button>
          </>
        }
      >
        {selectedQuote && (
          <div className="space-y-6 print:text-black" id="quote-print">
            {/* Header */}
            <div className="flex justify-between items-start border-b pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">TEKLİF</h2>
                <p className="text-sm text-slate-500">No: {selectedQuote.quote_number}</p>
                <p className="text-sm text-slate-500">Tarih: {formatDate(selectedQuote.created_at)}</p>
              </div>
              <Badge variant={statusConfig[selectedQuote.status]?.variant} className="text-base px-3 py-1">
                {statusConfig[selectedQuote.status]?.label}
              </Badge>
            </div>

            {/* Müşteri Bilgileri */}
            <div>
              <p className="text-sm text-slate-500">Müşteri</p>
              <p className="font-semibold text-lg">{selectedQuote.customer?.name}</p>
              {selectedQuote.subject && <p className="text-slate-600">{selectedQuote.subject}</p>}
            </div>

            {/* Kalemler */}
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="px-3 py-2 text-left">Ürün/Hizmet</th>
                    <th className="px-3 py-2 text-right">Miktar</th>
                    <th className="px-3 py-2 text-right">Birim Fiyat</th>
                    <th className="px-3 py-2 text-right">İsk.</th>
                    <th className="px-3 py-2 text-right">Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedQuote.items?.map((item, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-3 py-2">{item.product?.name || '-'}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">₺{formatMoney(item.unit_price)}</td>
                      <td className="px-3 py-2 text-right">%{item.discount}</td>
                      <td className="px-3 py-2 text-right font-medium">₺{formatMoney(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Toplamlar */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between">
                <span>Ara Toplam:</span>
                <span>₺{formatMoney(selectedQuote.subtotal)}</span>
              </div>
              {selectedQuote.discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>İskonto (%{selectedQuote.discount}):</span>
                  <span>-₺{formatMoney(selectedQuote.subtotal * selectedQuote.discount / 100)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>KDV:</span>
                <span>₺{formatMoney(selectedQuote.tax_total)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold border-t pt-2">
                <span>Genel Toplam:</span>
                <span className="text-indigo-600">₺{formatMoney(selectedQuote.total)}</span>
              </div>
            </div>

            {/* Notlar */}
            {selectedQuote.notes && (
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-sm text-slate-500">Notlar:</p>
                <p className="text-sm">{selectedQuote.notes}</p>
              </div>
            )}

            {/* Geçerlilik */}
            <p className="text-sm text-slate-500 text-center">
              Bu teklif {formatDate(selectedQuote.valid_until)} tarihine kadar geçerlidir.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
