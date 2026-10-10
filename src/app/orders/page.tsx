'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, EmptyState, Textarea } from '@/components/ui';
import { formatMoney, formatDate, cleanPayload } from '@/lib/utils';
import { ShoppingCart, Plus, Edit2, Trash2, RefreshCw, Search, Eye, Truck, CheckCircle, XCircle, Package, Clock, Receipt, Factory } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { createInvoiceFromOrder } from '@/lib/invoicing';
import { nextDocumentNumber } from '@/lib/doc-number';
import { useDealerPricing } from '@/lib/use-dealer-pricing';
import DealerTermBar from '@/components/DealerTermBar';

interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  customer?: { name: string };
  quote_id?: string;
  status: string;
  subtotal: number;
  tax_total: number;
  discount: number;
  total: number;
  shipping_address: string;
  billing_address: string;
  notes: string;
  order_date: string;
  delivery_date?: string;
  created_at: string;
  items?: OrderItem[];
}

interface OrderItem {
  id: string;
  product_id: string;
  product?: { name: string };
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
  total: number;
}

interface Customer {
  id: string;
  name: string;
  address: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  tax_rate: number;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger'; icon: any }> = {
  pending: { label: 'Bekliyor', variant: 'warning', icon: Clock },
  confirmed: { label: 'Onaylandı', variant: 'info', icon: CheckCircle },
  processing: { label: 'Hazırlanıyor', variant: 'info', icon: Package },
  shipped: { label: 'Kargoda', variant: 'info', icon: Truck },
  delivered: { label: 'Teslim Edildi', variant: 'success', icon: CheckCircle },
  cancelled: { label: 'İptal', variant: 'danger', icon: XCircle },
};

export default function OrdersPage() {
  const router = useRouter();
  const [invoicedOrderIds, setInvoicedOrderIds] = useState<Set<string>>(new Set());

  const invoiceOrder = async (orderId: string) => {
    try {
      const res = await createInvoiceFromOrder(supabase, orderId);
      const msg = res.created
        ? 'Siparişten taslak fatura oluşturuldu.'
        : `Bu sipariş için zaten ${res.invoice.invoice_number || 'taslak'} fatura var.`;
      if (confirm(msg + '\n\nFaturalar sayfasına gidip kontrol edip kesmek ister misiniz?')) router.push('/invoices');
      else fetchData();
    } catch (err: any) {
      alert('Fatura oluşturulamadı: ' + err.message);
    }
  };
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  const [formData, setFormData] = useState({
    customer_id: '',
    shipping_address: '',
    billing_address: '',
    notes: '',
    discount: 0,
    delivery_date: '',
  });
  
  const [items, setItems] = useState<{
    product_id: string;
    quantity: number;
    unit_price: number;
    discount: number;
    tax_rate: number;
    note?: string;
  }[]>([]);

  const supabase = createClient();
  const pricing = useDealerPricing(supabase);
  const [paymentTerm, setPaymentTerm] = useState<number>(30);

  // Bayi ise kalemlere bayi fiyatı ve iskontosunu uygular
  const repriceItems = (list: typeof items, customerId: string, term: number, keepPrice = false) =>
    list.map(it => {
      if (!it.product_id) return it;
      const pr = pricing.priceFor(customerId, it.product_id, Number(it.quantity) || 1, term);
      if (!pr) return { ...it, note: undefined };
      return { ...it, unit_price: keepPrice ? it.unit_price : pr.listPrice, discount: pr.discountPct, note: pr.explanation };
    });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, customersRes, productsRes] = await Promise.all([
       supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name, address').order('name'),
        supabase.from('products').select('id, name, price, tax_rate').eq('status', 'active'),
      ]);
      
      const { data: invs } = await supabase.from('invoices').select('order_id').neq('status', 'cancelled');
      setInvoicedOrderIds(new Set((invs || []).map((i: any) => i.order_id).filter(Boolean)));
      const custList = customersRes.data || [];
      setOrders((ordersRes.data || []).map((o: any) => ({ ...o, customer: custList.find((c: any) => c.id === o.customer_id) || null })));
      setCustomers(customersRes.data || []);
      setProducts(productsRes.data || []);
    } catch (err: any) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openModal = () => {
    setFormData({
      customer_id: '',
      shipping_address: '',
      billing_address: '',
      notes: '',
      discount: 0,
      delivery_date: '',
    });
    setItems([{ product_id: '', quantity: 1, unit_price: 0, discount: 0, tax_rate: 20 }]);
    setPaymentTerm(30);
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
    
    if (field === 'product_id') {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].unit_price = product.price;
        newItems[index].tax_rate = product.tax_rate;
      }
    }
    
    // Bayi fiyatlandırması: ürün değişince fiyat+iskonto, miktar değişince iskonto yeniden hesaplanır
    if ((field === 'product_id' || field === 'quantity') && formData.customer_id) {
      const [repriced] = repriceItems([newItems[index]], formData.customer_id, paymentTerm, field === 'quantity');
      newItems[index] = repriced;
    }

    setItems(newItems);
  };

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    setFormData({
      ...formData,
      customer_id: customerId,
      shipping_address: customer?.address || '',
      billing_address: customer?.address || '',
    });
    const term = pricing.defaultTerm(customerId) ?? 30;
    setPaymentTerm(term);
    setItems(repriceItems(items, customerId, term));
  };

  const changeTerm = (term: number) => {
    setPaymentTerm(term);
    if (formData.customer_id) setItems(repriceItems(items, formData.customer_id, term));
  };

  const calculateTotals = () => {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const generalDiscount = Math.min(Math.max(Number(formData.discount) || 0, 0), 100) / 100;
    let subtotal = 0;
    let taxTotal = 0;

    items.forEach(item => {
      // Satır tutarı (satır iskontosu düşülmüş)
      const lineTotal = item.quantity * item.unit_price * (1 - (item.discount || 0) / 100);
      subtotal += lineTotal;
      // KDV, genel iskonto da düşüldükten sonraki matrah üzerinden hesaplanır
      taxTotal += lineTotal * (1 - generalDiscount) * ((item.tax_rate || 0) / 100);
    });

    const discountAmount = round2(subtotal * generalDiscount);
    subtotal = round2(subtotal);
    taxTotal = round2(taxTotal);
    const netTotal = round2(subtotal - discountAmount);
    const total = round2(netTotal + taxTotal);

    return { subtotal, taxTotal, discountAmount, netTotal, total };
  };

  const handleSave = async () => {
    if (!formData.customer_id || items.length === 0) {
      alert('Müşteri ve en az bir ürün seçmelisiniz');
      return;
    }

    {
      const { total: t } = calculateTotals();
      const cc = pricing.creditCheck(formData.customer_id, t);
      if (cc.exceeded && !confirm(`Bu sipariş müşterinin kredi limitini aşıyor.\n\nLimit: ₺${formatMoney(cc.limit || 0)}\nAçık alacak: ₺${formatMoney(cc.open)}\nBu siparişle: ₺${formatMoney(cc.after)}\n\nYine de kaydedilsin mi?`)) return;
    }

    setSaving(true);
    try {
      const { subtotal, taxTotal, total } = calculateTotals();
      
      const orderData = {
        payment_term_days: paymentTerm,
        order_number: await nextDocumentNumber(supabase, 'order'),
        customer_id: formData.customer_id,
        shipping_address: formData.shipping_address,
        billing_address: formData.billing_address,
        notes: formData.notes,
        discount: formData.discount,
        delivery_date: formData.delivery_date || null,
        subtotal,
        tax_total: taxTotal,
        total,
        status: 'pending',
        order_date: new Date().toISOString(),
      };

      const { data: order, error } = await supabase
        .from('orders')
        .insert([orderData])
        .select()
        .single();

      if (error) throw error;

      const orderItems = items.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        tax_rate: item.tax_rate,
        total: item.quantity * item.unit_price * (1 - item.discount / 100),
      }));

      { const { error: dbErr } = await supabase.from('order_items').insert(cleanPayload(orderItems)); if (dbErr) throw dbErr; }

      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Müşteri siparişindeki ana firma ürünleri için karşı satın alma siparişi
  const createPurchaseOrders = async (order: any) => {
    const { data: its, error } = await supabase.from('order_items').select('product_id, quantity').eq('order_id', order.id);
    if (error) { alert(error.message); return; }
    const ids = (its || []).map((i: any) => i.product_id).filter(Boolean);
    const { data: prods, error: pErr } = await supabase.from('products').select('id, name, price, cost_price, tax_rate, supplier_id').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    if (pErr) { alert('Ana firma altyapısı kurulu değil (ana-firmalar.sql).'); return; }
    const { data: existing } = await supabase.from('purchase_orders').select('id, po_number, supplier_id').eq('sales_order_id', order.id).neq('status', 'cancelled');
    const groups: Record<string, any[]> = {};
    (its || []).forEach((i: any) => { const p = (prods || []).find((x: any) => x.id === i.product_id); if (p?.supplier_id) (groups[p.supplier_id] = groups[p.supplier_id] || []).push({ ...i, p }); });
    const todo = Object.entries(groups).filter(([sid]) => !(existing || []).some((e: any) => e.supplier_id === sid));
    if (!Object.keys(groups).length) { alert('Bu siparişte ana firmaya bağlı ürün yok. (Ürün Kataloğu\'nda ürünlere "Ana firma" seçin.)'); return; }
    if (!todo.length) { alert(`Bu sipariş için satın alma zaten açılmış: ${(existing || []).map((e: any) => e.po_number).join(', ')}`); return; }
    if (!confirm(`${todo.length} ana firmaya satın alma siparişi açılsın mı? (Birim maliyetler ürün kartından gelir.)`)) return;
    for (const [sid, rows] of todo) {
      const { data: po, error: poErr } = await supabase.from('purchase_orders').insert([{ supplier_id: sid, sales_order_id: order.id, notes: `${order.order_number} müşteri siparişi için` }]).select().single();
      if (poErr) { alert(poErr.message); return; }
      const { error: iErr } = await supabase.from('purchase_order_items').insert(rows.map((r: any) => {
        const cost = Number(r.p.cost_price) || 0;
        return { po_id: po.id, product_id: r.product_id, description: r.p.name, quantity: Number(r.quantity) || 0, unit_cost: cost, discount: 0, tax_rate: Number(r.p.tax_rate ?? 20), total: Math.round((Number(r.quantity) || 0) * cost * 100) / 100 };
      }));
      if (iErr) { alert(iErr.message); return; }
    }
    if (confirm('Satın alma siparişleri oluşturuldu. Ana Firmalarım › Satın alma sayfasına gitmek ister misiniz?')) window.location.href = '/suppliers?tab=purchases';
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const updateData: any = { status };
      if (status === 'delivered') {
        updateData.delivery_date = new Date().toISOString();
      }
      { const { error: dbErr } = await supabase.from('orders').update(cleanPayload(updateData)).eq('id', id); if (dbErr) throw dbErr; }
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu siparişi silmek istediğinize emin misiniz?')) return;
    try {
      await supabase.from('order_items').delete().eq('order_id', id);
      await supabase.from('orders').delete().eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const viewOrder = async (order: Order) => {
    const { data: items } = await supabase
      .from('order_items')
      .select('*, product:product_id(name)')
      .eq('order_id', order.id);
    
    setSelectedOrder({ ...order, items: items || [] });
    setDetailModalOpen(true);
  };

  // Filtreleme
  const filteredOrders = orders.filter(o => {
    const matchSearch = o.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       o.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !filterStatus || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // İstatistikler
  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const deliveredOrders = orders.filter(o => o.status === 'delivered');
  const totalRevenue = deliveredOrders.reduce((sum, o) => sum + o.total, 0);

  const { subtotal, taxTotal, discountAmount, netTotal, total } = calculateTotals();

  if (loading) {
    return (
      <div>
        <Header title="Sipariş Yönetimi" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Sipariş Yönetimi" />
      
      <div className="p-6">
        {/* İstatistik Kartları */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalOrders}</p>
                <p className="text-xs text-slate-500">Toplam Sipariş</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{pendingOrders}</p>
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
                <p className="text-2xl font-bold text-slate-800">{deliveredOrders.length}</p>
                <p className="text-xs text-slate-500">Teslim Edilen</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg">
                <Package className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">₺{formatMoney(totalRevenue)}</p>
                <p className="text-xs text-slate-500">Toplam Ciro</p>
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
                placeholder="Sipariş ara..."
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
              <Plus className="h-4 w-4" /> Yeni Sipariş
            </Button>
          </div>
        </div>

        {/* Sipariş Tablosu */}
        {filteredOrders.length > 0 ? (
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium">Sipariş No</th>
                      <th className="px-4 py-3 text-left font-medium">Müşteri</th>
                      <th className="px-4 py-3 text-right font-medium">Tutar</th>
                      <th className="px-4 py-3 text-center font-medium">Durum</th>
                      <th className="px-4 py-3 text-center font-medium">Sipariş Tarihi</th>
                      <th className="px-4 py-3 text-right font-medium">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => {
                      const StatusIcon = statusConfig[order.status]?.icon || Package;
                      return (
                        <tr key={order.id} className="border-b hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                              {order.order_number}
                            </span>
                            {(order as any).source === 'portal' && <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700" title={(order as any).notes || ''}>Bayi portalı</span>}
                          </td>
                          <td className="px-4 py-3 font-medium">{customers.find(c => c.id === order.customer_id)?.name || '-'}</td>
                          <td className="px-4 py-3 text-right font-semibold">₺{formatMoney(order.total)}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={statusConfig[order.status]?.variant || 'default'}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusConfig[order.status]?.label || order.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-500 text-xs">
                            {formatDate(order.order_date)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => viewOrder(order)} title="Görüntüle">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {order.status === 'pending' && (
                                <Button variant="ghost" size="sm" onClick={() => updateStatus(order.id, 'confirmed')} title="Onayla">
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                </Button>
                              )}
                              {order.status === 'confirmed' && (
                                <Button variant="ghost" size="sm" onClick={() => updateStatus(order.id, 'processing')} title="Hazırla">
                                  <Package className="h-4 w-4 text-blue-500" />
                                </Button>
                              )}
                              {order.status === 'processing' && (
                                <Button variant="ghost" size="sm" onClick={() => updateStatus(order.id, 'shipped')} title="Kargola">
                                  <Truck className="h-4 w-4 text-blue-500" />
                                </Button>
                              )}
                              {order.status === 'shipped' && (
                                <Button variant="ghost" size="sm" onClick={() => updateStatus(order.id, 'delivered')} title="Teslim Et">
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                </Button>
                              )}
                              {order.status !== 'cancelled' && (
                                <Button variant="ghost" size="sm" onClick={() => invoiceOrder(order.id)}
                                  title={invoicedOrderIds.has(order.id) ? 'Faturalandı' : 'Faturala'}>
                                  <Receipt className={`h-4 w-4 ${invoicedOrderIds.has(order.id) ? 'text-slate-400' : 'text-indigo-600'}`} />
                                  {!invoicedOrderIds.has(order.id) && <span className="text-xs">Faturala</span>}
                                </Button>
                              )}
                              {order.status !== 'cancelled' && (
                                <Button variant="ghost" size="sm" onClick={() => createPurchaseOrders(order)} title="Ana firmaya satın alma siparişi aç">
                                  <Factory className="h-4 w-4 text-amber-600" />
                                </Button>
                              )}
                              {['pending', 'confirmed'].includes(order.status) && (
                                <Button variant="ghost" size="sm" onClick={() => updateStatus(order.id, 'cancelled')} title="İptal">
                                  <XCircle className="h-4 w-4 text-red-500" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(order.id)}>
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
            icon={<ShoppingCart className="h-16 w-16" />}
            title="Sipariş bulunamadı"
            description="Yeni sipariş oluşturun"
            action={<Button onClick={openModal}><Plus className="h-4 w-4" /> Sipariş Oluştur</Button>}
          />
        )}
      </div>

      {/* Yeni Sipariş Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Yeni Sipariş Oluştur"
        
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Sipariş Oluştur'}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Müşteri */}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Müşteri *"
              value={formData.customer_id}
              onChange={(e) => handleCustomerChange(e.target.value)}
              options={[
                { value: '', label: 'Müşteri Seçin' },
                ...customers.map(c => ({ value: c.id, label: c.name }))
              ]}
            />
            <Input
              label="Tahmini Teslimat Tarihi"
              type="date"
              value={formData.delivery_date}
              onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
            />
          </div>

          <DealerTermBar
            termDays={paymentTerm}
            onTermChange={changeTerm}
            dealer={pricing.getDealer(formData.customer_id)}
            credit={formData.customer_id ? pricing.creditCheck(formData.customer_id, calculateTotals().total) : null}
            onReapply={() => setItems(repriceItems(items, formData.customer_id, paymentTerm))}
          />

          <div className="grid grid-cols-2 gap-4">
            <Textarea
              label="Teslimat Adresi"
              value={formData.shipping_address}
              onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })}
              rows={2}
            />
            <Textarea
              label="Fatura Adresi"
              value={formData.billing_address}
              onChange={(e) => setFormData({ ...formData, billing_address: e.target.value })}
              rows={2}
            />
          </div>

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
                <div key={index} className="flex flex-wrap gap-2 items-start p-3 bg-slate-50 rounded-lg">
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
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeItem(index)} disabled={items.length === 1}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                  {item.note && <p className="basis-full text-[11px] text-amber-700">Bayi fiyatı: {item.note}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Toplamlar */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Ara Toplam:</span>
              <span className="font-medium">₺{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span>Genel İskonto (%):</span>
              <input
                type="number"
                value={formData.discount}
                onChange={(e) => setFormData({ ...formData, discount: parseFloat(e.target.value) || 0 })}
                className="w-20 px-2 py-1 rounded border border-slate-200 text-sm text-right"
              />
            </div>
            {discountAmount > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">İskonto Tutarı:</span>
                  <span className="font-medium text-red-600">-₺{formatMoney(discountAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">KDV Matrahı:</span>
                  <span className="font-medium">₺{formatMoney(netTotal)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm">
              <span>KDV:</span>
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
            rows={2}
          />
        </div>
      </Modal>

      {/* Sipariş Detay Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={`Sipariş: ${selectedOrder?.order_number}`}
        
        footer={<Button variant="secondary" onClick={() => setDetailModalOpen(false)}>Kapat</Button>}
      >
        {selectedOrder && (
          <div className="space-y-6">
            <div className="flex justify-between items-start border-b pb-4">
              <div>
                <h2 className="text-xl font-bold">SİPARİŞ</h2>
                <p className="text-sm text-slate-500">No: {selectedOrder.order_number}</p>
                <p className="text-sm text-slate-500">Tarih: {formatDate(selectedOrder.order_date)}</p>
              </div>
              <Badge variant={statusConfig[selectedOrder.status]?.variant} className="text-base px-3 py-1">
                {statusConfig[selectedOrder.status]?.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-500">Müşteri</p>
                <p className="font-semibold">{selectedOrder.customer?.name}</p>
              </div>
              {selectedOrder.delivery_date && (
                <div>
                  <p className="text-sm text-slate-500">Teslimat Tarihi</p>
                  <p className="font-semibold">{formatDate(selectedOrder.delivery_date)}</p>
                </div>
              )}
            </div>

            {selectedOrder.shipping_address && (
              <div>
                <p className="text-sm text-slate-500">Teslimat Adresi</p>
                <p>{selectedOrder.shipping_address}</p>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="px-3 py-2 text-left">Ürün/Hizmet</th>
                  <th className="px-3 py-2 text-right">Miktar</th>
                  <th className="px-3 py-2 text-right">Birim Fiyat</th>
                  <th className="px-3 py-2 text-right">Toplam</th>
                </tr>
              </thead>
              <tbody>
                {selectedOrder.items?.map((item, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-3 py-2">{item.product?.name || (item as any).description || '-'}</td>
                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-right">₺{formatMoney(item.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-medium">₺{formatMoney(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between">
                <span>Ara Toplam:</span>
                <span>₺{formatMoney(selectedOrder.subtotal)}</span>
              </div>
              {Number(selectedOrder.discount) > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>İskonto (%{selectedOrder.discount}):</span>
                  <span>-₺{formatMoney(selectedOrder.subtotal * selectedOrder.discount / 100)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>KDV:</span>
                <span>₺{formatMoney(selectedOrder.tax_total)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold border-t pt-2">
                <span>Genel Toplam:</span>
                <span className="text-indigo-600">₺{formatMoney(selectedOrder.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
