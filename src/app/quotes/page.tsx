'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, EmptyState, Textarea } from '@/components/ui';
import { formatMoney, formatDate, cleanPayload } from '@/lib/utils';
import { FileText, Plus, Edit2, Trash2, RefreshCw, Search, Eye, Send, CheckCircle, XCircle, Download, Printer, ShoppingCart, Target, ClipboardCheck, GitBranch, History, ShieldCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { createOrderFromQuote } from '@/lib/sales-flow';
import { nextDocumentNumber } from '@/lib/doc-number';
import { useAuth } from '@/lib/auth-context';

// ISO 9001 madde 8.2.3: teklif müşteriye taahhüt edilmeden önce gözden geçirilir
const REVIEW_CHECKLIST = [
  { key: 'requirements', label: 'Müşteri gereksinimleri (kapsam, miktar, teslim şekli) açıkça tanımlandı' },
  { key: 'capability', label: 'Kapasite ve teslim süresi karşılanabilir' },
  { key: 'pricing', label: 'Fiyat ve iskonto yetki sınırları içinde, maliyet kontrol edildi' },
  { key: 'terms', label: 'Ödeme koşulları ve geçerlilik süresi belirlendi' },
  { key: 'legal', label: 'Yasal / mevzuat ve sözleşme şartları kontrol edildi' },
  { key: 'differences', label: 'Önceki talep veya tekliften farklılıklar çözüldü' },
];
const DISCOUNT_APPROVAL_LIMIT = 20; // % — üzerindeki iskonto yönetici onayı gerektirir
const quoteNo = (q: { quote_number: string; revision?: number | null } | null | undefined) =>
  q ? `${q.quote_number}${q.revision ? ` Rev.${q.revision}` : ''}` : '';

interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  opportunity_id?: string | null;
  sales_person_id?: string | null;
  revision?: number | null;
  root_quote_id?: string | null;
  superseded_by?: string | null;
  revision_reason?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  review_checklist?: Record<string, boolean> | null;
  review_notes?: string | null;
  sent_at?: string | null;
  decided_at?: string | null;
  history?: any[];
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
  reviewed: { label: 'Gözden Geçirildi', variant: 'warning' },
  sent: { label: 'Gönderildi', variant: 'info' },
  approved: { label: 'Onaylandı', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  expired: { label: 'Süresi Doldu', variant: 'warning' },
  revised: { label: 'Revize Edildi', variant: 'default' },
};

export default function QuotesPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [reviewTarget, setReviewTarget] = useState<Quote | null>(null);
  const [reviewChecks, setReviewChecks] = useState<Record<string, boolean>>({});
  const [reviewNotes, setReviewNotes] = useState('');
  const [revisionSource, setRevisionSource] = useState<Quote | null>(null);
  const [revisionReason, setRevisionReason] = useState('');
  const [opportunityLink, setOpportunityLink] = useState<{ id: string; title: string; assigned_to: string | null; stage: string } | null>(null);
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
        supabase.from('quotes').select('*').order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('products').select('id, name, price, tax_rate, unit').eq('status', 'active'),
      ]);
      
      const custs = customersRes.data || [];
      setQuotes((quotesRes.data || []).map((q: any) => ({ ...q, customer: custs.find((c: any) => c.id === q.customer_id) || null })));
      setCustomers(custs);
      setProducts(productsRes.data || []);
    } catch (err: any) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Fırsatlar sayfasından "Teklif" ile gelindiyse formu fırsat bilgileriyle aç
  useEffect(() => {
    const oppId = new URLSearchParams(window.location.search).get('opportunity');
    if (!oppId) return;
    (async () => {
      const { data: opp } = await supabase.from('opportunities').select('*').eq('id', oppId).single();
      if (!opp) return;
      setOpportunityLink({ id: opp.id, title: opp.title, assigned_to: opp.assigned_to, stage: opp.stage });
      setFormData({
        customer_id: opp.customer_id || '',
        subject: opp.title || '',
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: opp.notes || '',
        discount: 0,
      });
      setItems([{ product_id: '', quantity: 1, unit_price: Number(opp.value) || 0, discount: 0, tax_rate: 20 }]);
      setModalOpen(true);
      window.history.replaceState(null, '', '/quotes');
    })();
  }, []);

  const openModal = () => {
    setFormData({
      customer_id: '',
      subject: '',
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: '',
      discount: 0,
    });
    setItems([{ product_id: '', quantity: 1, unit_price: 0, discount: 0, tax_rate: 20 }]);
    setOpportunityLink(null);
    setRevisionSource(null);
    setRevisionReason('');
    setModalOpen(true);
  };

  // ---------- ISO 8.2.3: Gözden geçirme ----------
  const openReview = (q: Quote) => {
    setReviewTarget(q);
    setReviewChecks({});
    setReviewNotes('');
  };

  const isManagerRole = ['super_admin', 'admin', 'org_admin', 'manager'].includes((profile as any)?.role || '') || !!(profile as any)?.is_org_admin;

  const submitReview = async () => {
    if (!reviewTarget) return;
    const allChecked = REVIEW_CHECKLIST.every(c => reviewChecks[c.key]);
    if (!allChecked) { alert('Gözden geçirmeyi tamamlamak için tüm maddeler onaylanmalıdır.'); return; }
    if (Number(reviewTarget.discount) > DISCOUNT_APPROVAL_LIMIT && !isManagerRole) {
      alert(`%${DISCOUNT_APPROVAL_LIMIT} üzeri iskonto yönetici onayı gerektirir. Gözden geçirmeyi bir yönetici yapmalıdır.`);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('quotes').update({
        status: 'reviewed',
        reviewed_by: (profile as any)?.id || null,
        reviewed_by_name: (profile as any)?.name || (profile as any)?.email || null,
        reviewed_at: new Date().toISOString(),
        review_checklist: reviewChecks,
        review_notes: reviewNotes || null,
      }).eq('id', reviewTarget.id);
      if (error) throw error;
      setReviewTarget(null);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------- ISO 7.5.3: Revizyon ----------
  const startRevision = async (q: Quote) => {
    const { data: qItems } = await supabase.from('quote_items').select('*').eq('quote_id', q.id);
    setFormData({
      customer_id: q.customer_id || '',
      subject: q.subject || '',
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: q.notes || '',
      discount: Number(q.discount) || 0,
    });
    setItems((qItems || []).map((it: any) => ({
      product_id: it.product_id || '',
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price) || 0,
      discount: Number(it.discount) || 0,
      tax_rate: it.tax_rate != null ? Number(it.tax_rate) : 20,
    })));
    setOpportunityLink(null);
    setRevisionSource(q);
    setRevisionReason('');
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

    if (revisionSource && !revisionReason.trim()) {
      alert('Revizyon nedeni zorunludur (ISO 9001 doküman kontrolü).');
      return;
    }

    setSaving(true);
    try {
      const { subtotal, taxTotal, discountAmount, total } = calculateTotals();
      const rev = revisionSource;

      const quoteData = {
        quote_number: rev ? rev.quote_number : await nextDocumentNumber(supabase, 'quote'),
        revision: rev ? (Number(rev.revision) || 0) + 1 : 0,
        root_quote_id: rev ? (rev.root_quote_id || rev.id) : null,
        revision_reason: rev ? revisionReason.trim() : null,
        customer_id: formData.customer_id,
        subject: formData.subject,
        valid_until: formData.valid_until,
        notes: formData.notes,
        discount: formData.discount,
        subtotal,
        tax_total: taxTotal,
        discount_amount: discountAmount,
        total,
        status: 'draft',
        opportunity_id: rev ? (rev.opportunity_id || null) : (opportunityLink?.id || null),
        sales_person_id: rev ? (rev.sales_person_id || null) : (opportunityLink?.assigned_to || null),
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
        product_id: item.product_id || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        tax_rate: item.tax_rate,
        total: item.quantity * item.unit_price * (1 - item.discount / 100),
      }));

      { const { error: dbErr } = await supabase.from('quote_items').insert(cleanPayload(quoteItems)); if (dbErr) throw dbErr; }

      // Fırsat erken aşamadaysa "Teklif" aşamasına taşı
      if (opportunityLink && ['Keşif', ''].includes(opportunityLink.stage || '')) {
        await supabase.from('opportunities').update({ stage: 'Teklif' }).eq('id', opportunityLink.id);
      }

      // Önceki revizyonu "Revize Edildi" olarak kapat
      if (rev) {
        const { error: revErr } = await supabase.from('quotes')
          .update({ status: 'revised', superseded_by: quote.id }).eq('id', rev.id);
        if (revErr) throw revErr;
      }

      setOpportunityLink(null);
      setRevisionSource(null);
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const convertToOrder = async (quoteId: string) => {
    try {
      const res = await createOrderFromQuote(supabase, quoteId);
      const msg = res.created
        ? `${res.order.order_number} numaralı sipariş oluşturuldu.`
        : `Bu teklif için zaten ${res.order.order_number} numaralı sipariş var.`;
      if (confirm(msg + '\n\nSiparişler sayfasına gitmek ister misiniz?')) router.push('/orders');
    } catch (err: any) {
      alert('Sipariş oluşturulamadı: ' + err.message);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const stamp: any = { status };
      if (status === 'sent') stamp.sent_at = new Date().toISOString();
      if (status === 'approved' || status === 'rejected') stamp.decided_at = new Date().toISOString();
      { const { error: dbErr } = await supabase.from('quotes').update(cleanPayload(stamp)).eq('id', id); if (dbErr) throw dbErr; }
      if (status === 'approved') {
        const quote = quotes.find(q => q.id === id);
        if (quote?.opportunity_id) {
          await supabase.from('opportunities')
            .update({ stage: 'Kazanıldı', probability: 100, closed_at: new Date().toISOString() })
            .eq('id', quote.opportunity_id);
        }
        await fetchData();
        if (confirm('Teklif onaylandı' + (quote?.opportunity_id ? ' ve bağlı fırsat "Kazanıldı" yapıldı' : '') + '.\n\nBu tekliften sipariş oluşturulsun mu?')) {
          await convertToOrder(id);
        }
        return;
      }
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
      .select('*, product:product_id(name)')
      .eq('quote_id', quote.id);
    
    const rootId = quote.root_quote_id || quote.id;
    const { data: history } = await supabase.from('quotes')
      .select('id, quote_number, revision, status, total, created_at, revision_reason, reviewed_by_name, reviewed_at')
      .or(`id.eq.${rootId},root_quote_id.eq.${rootId}`)
      .order('revision', { ascending: true });
    setSelectedQuote({ ...quote, items: items || [], history: history || [] });
    setDetailModalOpen(true);
  };

  const printQuote = () => {
    window.print();
  };

  // Filtreleme
  const filteredQuotes = quotes.filter(q => {
    const matchSearch = quoteNo(q).toLowerCase().includes(searchTerm.toLowerCase()) ||
                       q.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !filterStatus || q.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // İstatistikler
  const totalQuotes = quotes.length;
  const approvedQuotes = quotes.filter(q => q.status === 'approved');
  const pendingValue = quotes.filter(q => q.status === 'sent').reduce((sum, q) => sum + q.total, 0);
  const approvedValue = approvedQuotes.reduce((sum, q) => sum + q.total, 0);

  const { subtotal, taxTotal, discountAmount, netTotal, total } = calculateTotals();

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
                            {quoteNo(quote)}
                          </span>
                          {quote.reviewed_at && (
                            <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600" title={`Gözden geçiren: ${quote.reviewed_by_name || '-'}`}>
                              <ShieldCheck className="h-3 w-3" />Gözden geçirildi
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium">{customers.find(c => c.id === quote.customer_id)?.name || '-'}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {quote.subject || '-'}
                          {quote.opportunity_id && <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded" title="Bir fırsata bağlı"><Target className="h-3 w-3" />Fırsat</span>}
                        </td>
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
                              <Button variant="ghost" size="sm" onClick={() => openReview(quote)} title="Gözden geçir (ISO 9001 · 8.2.3)">
                                <ClipboardCheck className="h-4 w-4 text-amber-600" /><span className="text-xs">Gözden Geçir</span>
                              </Button>
                            )}
                            {quote.status === 'reviewed' && (
                              <Button variant="ghost" size="sm" onClick={() => updateStatus(quote.id, 'sent')} title="Müşteriye gönderildi olarak işaretle">
                                <Send className="h-4 w-4 text-blue-500" /><span className="text-xs">Gönder</span>
                              </Button>
                            )}
                            {['sent', 'rejected', 'expired'].includes(quote.status) && (
                              <Button variant="ghost" size="sm" onClick={() => startRevision(quote)} title="Yeni revizyon oluştur">
                                <GitBranch className="h-4 w-4 text-indigo-600" />
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
                            {quote.status === 'approved' && (
                              <Button variant="ghost" size="sm" onClick={() => convertToOrder(quote.id)} title="Siparişe dönüştür">
                                <ShoppingCart className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            {['draft', 'reviewed'].includes(quote.status) && (
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(quote.id)} title="Sil">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
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
        title={revisionSource ? `Revizyon: ${quoteNo(revisionSource)} → Rev.${(Number(revisionSource.revision) || 0) + 1}` : 'Yeni Teklif Oluştur'}
        size="lg"
        
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Kaydediliyor...' : revisionSource ? 'Revizyonu Oluştur' : 'Teklif Oluştur'}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {revisionSource && (
            <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                <span><strong>{quoteNo(revisionSource)}</strong> teklifinin yeni revizyonu. Önceki sürüm değiştirilmeden "Revize Edildi" olarak saklanır.</span>
              </div>
              <input value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)}
                placeholder="Revizyon nedeni * (örn. müşteri kapsam değişikliği istedi)"
                className="w-full rounded border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-800" />
            </div>
          )}
          {opportunityLink && (
            <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
              <Target className="h-4 w-4" />
              <span>Bu teklif <strong>{opportunityLink.title}</strong> fırsatına bağlanacak.</span>
            </div>
          )}
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
        title={`Teklif: ${quoteNo(selectedQuote)}`}
        size="lg"
        
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
                <p className="text-sm text-slate-500">No: {quoteNo(selectedQuote)}</p>
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
                      <td className="px-3 py-2">{item.product?.name || (item as any).description || '-'}</td>
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

            {/* ISO kayıtları (yazdırmada gizli) */}
            <div className="space-y-3 border-t pt-4 print:hidden">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <p className="mb-1 flex items-center gap-1 font-medium text-emerald-800"><ShieldCheck className="h-4 w-4" />Gözden Geçirme Kaydı (ISO 9001 · 8.2.3)</p>
                {selectedQuote.reviewed_at ? (
                  <>
                    <p className="text-emerald-700">{selectedQuote.reviewed_by_name || '-'} · {new Date(selectedQuote.reviewed_at).toLocaleString('tr-TR')}</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-emerald-700">
                      {REVIEW_CHECKLIST.map(c => (
                        <li key={c.key}>{selectedQuote.review_checklist?.[c.key] ? '✓' : '✗'} {c.label}</li>
                      ))}
                    </ul>
                    {selectedQuote.review_notes && <p className="mt-1 text-xs italic text-emerald-700">Not: {selectedQuote.review_notes}</p>}
                  </>
                ) : (
                  <p className="text-amber-700">Bu teklif henüz gözden geçirilmedi.</p>
                )}
              </div>

              {(selectedQuote.history?.length || 0) > 1 && (
                <div className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="mb-2 flex items-center gap-1 font-medium text-slate-700"><History className="h-4 w-4" />Revizyon Geçmişi</p>
                  <table className="w-full text-xs">
                    <tbody>
                      {selectedQuote.history!.map((h: any) => (
                        <tr key={h.id} className={`border-b last:border-0 ${h.id === selectedQuote.id ? 'font-semibold' : ''}`}>
                          <td className="py-1">{quoteNo(h)}</td>
                          <td className="py-1">{new Date(h.created_at).toLocaleDateString('tr-TR')}</td>
                          <td className="py-1">{statusConfig[h.status]?.label || h.status}</td>
                          <td className="py-1 text-right">₺{formatMoney(Number(h.total))}</td>
                          <td className="py-1 pl-2 text-slate-500">{h.revision_reason || (h.revision ? '' : 'İlk sürüm')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ISO 9001 · 8.2.3 Gözden Geçirme */}
      <Modal
        isOpen={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        title={`Teklif Gözden Geçirme: ${quoteNo(reviewTarget)}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewTarget(null)}>Vazgeç</Button>
            <Button onClick={submitReview} disabled={saving || !REVIEW_CHECKLIST.every(c => reviewChecks[c.key])}>
              <ShieldCheck className="h-4 w-4" />Gözden Geçirmeyi Onayla
            </Button>
          </>
        }
      >
        {reviewTarget && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600">
              ISO 9001 madde 8.2.3 gereği, teklif müşteriye taahhüt edilmeden önce aşağıdaki maddeler kontrol edilmelidir.
              Onayınız kim/ne zaman bilgisiyle kayda geçer.
            </p>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="flex justify-between"><span className="text-slate-500">Müşteri</span><span className="font-medium">{reviewTarget.customer?.name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Konu</span><span className="font-medium">{reviewTarget.subject || '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Genel Toplam</span><span className="font-medium">₺{formatMoney(reviewTarget.total)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Genel İskonto</span><span className="font-medium">%{reviewTarget.discount || 0}</span></div>
            </div>
            {Number(reviewTarget.discount) > DISCOUNT_APPROVAL_LIMIT && (
              <div className={`rounded-lg border p-3 ${isManagerRole ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                İskonto %{DISCOUNT_APPROVAL_LIMIT}'nin üzerinde; yönetici onayı gerekir.
                {isManagerRole ? ' Yönetici olarak onaylıyorsunuz.' : ' Bu gözden geçirmeyi bir yönetici yapmalıdır.'}
              </div>
            )}
            <div className="space-y-2">
              {REVIEW_CHECKLIST.map(c => (
                <label key={c.key} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                  <input type="checkbox" className="mt-0.5" checked={!!reviewChecks[c.key]}
                    onChange={(e) => setReviewChecks({ ...reviewChecks, [c.key]: e.target.checked })} />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
            <Textarea label="Gözden geçirme notu (opsiyonel)" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={2} />
          </div>
        )}
      </Modal>
    </div>
  );
}
