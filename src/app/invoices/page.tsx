'use client';

import Header from '@/components/Header';
import { Card, CardBody, Button, Badge, Modal, Input, Select, Textarea, EmptyState } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { Receipt, Plus, Trash2, RefreshCw, Search, Eye, Send, XCircle, Printer, Wallet, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
  INVOICE_STATUS, InvoiceLine, calcInvoiceTotals, createDraftInvoice, issueInvoice, cancelInvoice,
  addDays, DEFAULT_PAYMENT_TERM_DAYS,
} from '@/lib/invoicing';

interface Invoice {
  id: string;
  invoice_number: string | null;
  customer_id: string;
  sales_person_id: string | null;
  order_id: string | null;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  discount: number;
  discount_amount: number;
  tax_total: number;
  total: number;
  paid_amount: number;
  status: string;
  notes: string | null;
  cancel_reason: string | null;
  created_at: string;
  items?: any[];
}

interface Option { id: string; name: string }
interface Product { id: string; name: string; price: number; tax_rate: number }

const emptyLine = (): InvoiceLine => ({ product_id: null, description: '', quantity: 1, unit_price: 0, discount: 0, tax_rate: 20 });
const today = () => new Date().toISOString().split('T')[0];

export default function InvoicesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [salesTeam, setSalesTeam] = useState<Option[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<{ id: string; order_number: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [header, setHeader] = useState({
    customer_id: '', sales_person_id: '', issue_date: today(),
    due_date: addDays(today(), DEFAULT_PAYMENT_TERM_DAYS), discount: 0, notes: '',
  });
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);

  const [detail, setDetail] = useState<Invoice | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const fetchData = async () => {
    setLoading(true);
    const [invRes, custRes, teamRes, prodRes, ordRes] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, name').order('name'),
      supabase.from('sales_team').select('id, name').order('name'),
      supabase.from('products').select('id, name, price, tax_rate').order('name'),
      supabase.from('orders').select('id, order_number'),
    ]);
    if (invRes.error) alert('Faturalar yüklenemedi: ' + invRes.error.message + '\n\nFatura modülü SQL kurulumu yapıldı mı?');
    setInvoices(invRes.data || []);
    setCustomers(custRes.data || []);
    setSalesTeam(teamRes.data || []);
    setProducts(prodRes.data || []);
    setOrders(ordRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const customerName = (id: string | null) => customers.find(c => c.id === id)?.name || '-';
  const orderNumber = (id: string | null) => orders.find(o => o.id === id)?.order_number || null;
  const isOverdue = (inv: Invoice) =>
    ['issued', 'partially_paid'].includes(inv.status) && !!inv.due_date && new Date(inv.due_date) < new Date(today());

  // ---------- Form ----------
  const openForm = () => {
    setHeader({ customer_id: '', sales_person_id: '', issue_date: today(), due_date: addDays(today(), DEFAULT_PAYMENT_TERM_DAYS), discount: 0, notes: '' });
    setLines([emptyLine()]);
    setFormError(null);
    setFormOpen(true);
  };

  const updateLine = (i: number, field: keyof InvoiceLine, value: any) => {
    const next = [...lines];
    next[i] = { ...next[i], [field]: value };
    if (field === 'product_id') {
      const p = products.find(pr => pr.id === value);
      if (p) {
        next[i].unit_price = Number(p.price) || 0;
        next[i].tax_rate = p.tax_rate != null ? Number(p.tax_rate) : 20;
        if (!next[i].description) next[i].description = p.name;
      }
    }
    setLines(next);
  };

  const totals = calcInvoiceTotals(lines, header.discount);

  const saveDraft = async (issueNow: boolean) => {
    setFormError(null);
    if (!header.customer_id) { setFormError('Müşteri seçilmelidir.'); return; }
    const valid = lines.filter(l => (l.product_id || l.description.trim()) && Number(l.quantity) > 0);
    if (!valid.length) { setFormError('En az bir kalem girin (ürün seçin veya açıklama yazın).'); return; }
    setBusy(true);
    try {
      const inv = await createDraftInvoice(supabase, {
        customer_id: header.customer_id,
        sales_person_id: header.sales_person_id || null,
        issue_date: header.issue_date,
        due_date: header.due_date,
        discount: header.discount,
        notes: header.notes,
      }, valid);
      if (issueNow) await issueInvoice(supabase, inv);
      setFormOpen(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  // ---------- İşlemler ----------
  const handleIssue = async (inv: Invoice) => {
    if (!confirm('Fatura kesilsin mi?\n\nKesilen faturaya sıralı numara verilir, tutarı ve kalemleri artık değiştirilemez; vade tarihli alacak kaydı Tahsilat\'a eklenir.')) return;
    setBusy(true);
    try {
      const issued = await issueInvoice(supabase, inv);
      alert(`${issued.invoice_number} numaralı fatura kesildi.`);
      setDetail(null);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
      fetchData();
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await cancelInvoice(supabase, cancelTarget, cancelReason);
      setCancelTarget(null);
      setCancelReason('');
      setDetail(null);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const viewInvoice = async (inv: Invoice) => {
    const { data } = await supabase.from('invoice_items').select('*').eq('invoice_id', inv.id).order('sort_order');
    setDetail({ ...inv, items: data || [] });
  };

  // ---------- Liste ----------
  const filtered = invoices.filter(inv => {
    const q = searchTerm.trim().toLowerCase();
    const matchSearch = !q || (inv.invoice_number || '').toLowerCase().includes(q) || customerName(inv.customer_id).toLowerCase().includes(q);
    const matchStatus = !filterStatus || (filterStatus === 'overdue' ? isOverdue(inv) : inv.status === filterStatus);
    return matchSearch && matchStatus;
  });

  const active = invoices.filter(i => !['draft', 'cancelled'].includes(i.status));
  const issuedNet = active.reduce((s, i) => s + (Number(i.subtotal) - Number(i.discount_amount)), 0);
  const issuedGross = active.reduce((s, i) => s + Number(i.total), 0);
  const collected = active.reduce((s, i) => s + Number(i.paid_amount), 0);
  const overdue = active.filter(isOverdue).reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount)), 0);

  if (loading) {
    return <div><Header title="Faturalar" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;
  }

  return (
    <div>
      <Header title="Faturalar" subtitle="Satış faturaları ve alacak takibi" />
      <div className="p-6">
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4"><p className="text-2xl font-bold">₺{formatMoney(issuedNet)}</p><p className="text-xs text-slate-500">Faturalanan (KDV hariç)</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-blue-600">₺{formatMoney(issuedGross)}</p><p className="text-xs text-slate-500">Faturalanan (KDV dahil)</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-green-600">₺{formatMoney(collected)}</p><p className="text-xs text-slate-500">Tahsil Edilen</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-red-600">₺{formatMoney(overdue)}</p><p className="text-xs text-slate-500">Vadesi Geçen Alacak</p></Card>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Fatura no veya müşteri ara..."
                className="h-9 w-64 rounded-lg border border-slate-200 pl-9 pr-3 text-sm" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
              <option value="">Tüm Durumlar</option>
              {Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              <option value="overdue">Vadesi Geçen</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
            <Button onClick={openForm}><Plus className="h-4 w-4" />Yeni Fatura</Button>
          </div>
        </div>

        {filtered.length > 0 ? (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="px-4 py-3 font-medium">Fatura No</th>
                    <th className="px-4 py-3 font-medium">Müşteri</th>
                    <th className="px-4 py-3 font-medium">Tarih</th>
                    <th className="px-4 py-3 font-medium">Vade</th>
                    <th className="px-4 py-3 text-right font-medium">Tutar</th>
                    <th className="px-4 py-3 text-right font-medium">Kalan</th>
                    <th className="px-4 py-3 text-center font-medium">Durum</th>
                    <th className="px-4 py-3 text-right font-medium">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => {
                    const remaining = Number(inv.total) - Number(inv.paid_amount);
                    return (
                      <tr key={inv.id} className={`border-b hover:bg-slate-50 ${inv.status === 'cancelled' ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{inv.invoice_number || 'TASLAK'}</span>
                          {orderNumber(inv.order_id) && <div className="mt-1 text-[10px] text-slate-400">Sipariş: {orderNumber(inv.order_id)}</div>}
                        </td>
                        <td className="px-4 py-3 font-medium">{customerName(inv.customer_id)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(inv.issue_date)}</td>
                        <td className="px-4 py-3">
                          <span className={isOverdue(inv) ? 'text-red-600 font-medium flex items-center gap-1' : 'text-slate-600'}>
                            {isOverdue(inv) && <AlertTriangle className="h-3 w-3" />}{inv.due_date ? formatDate(inv.due_date) : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">₺{formatMoney(Number(inv.total))}</td>
                        <td className="px-4 py-3 text-right">{inv.status === 'cancelled' || inv.status === 'draft' ? '-' : `₺${formatMoney(remaining)}`}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={INVOICE_STATUS[inv.status]?.variant || 'default'}>{INVOICE_STATUS[inv.status]?.label || inv.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => viewInvoice(inv)} title="Görüntüle"><Eye className="h-4 w-4" /></Button>
                            {inv.status === 'draft' && (
                              <Button variant="ghost" size="sm" onClick={() => handleIssue(inv)} disabled={busy} title="Faturayı kes"><Send className="h-4 w-4 text-blue-600" /></Button>
                            )}
                            {['issued', 'partially_paid'].includes(inv.status) && (
                              <Button variant="ghost" size="sm" onClick={() => router.push('/collections')} title="Tahsilatı işle"><Wallet className="h-4 w-4 text-green-600" /></Button>
                            )}
                            {inv.status !== 'cancelled' && inv.status !== 'paid' && (
                              <Button variant="ghost" size="sm" onClick={() => { setCancelTarget(inv); setCancelReason(''); }} title={inv.status === 'draft' ? 'Taslağı sil' : 'İptal et'}>
                                {inv.status === 'draft' ? <Trash2 className="h-4 w-4 text-red-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <EmptyState icon={<Receipt className="h-16 w-16" />} title="Fatura bulunamadı"
            description="Siparişler sayfasından bir siparişi faturalayabilir veya yeni fatura oluşturabilirsiniz."
            action={<Button onClick={openForm}><Plus className="h-4 w-4" />Yeni Fatura</Button>} />
        )}
      </div>

      {/* ---------- Yeni Fatura ---------- */}
      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title="Yeni Fatura" size="xl"
        footer={<>
          <Button variant="secondary" onClick={() => setFormOpen(false)}>İptal</Button>
          <Button variant="secondary" onClick={() => saveDraft(false)} disabled={busy}>Taslak Kaydet</Button>
          <Button onClick={() => saveDraft(true)} disabled={busy}>{busy ? 'Kaydediliyor...' : 'Kaydet ve Kes'}</Button>
        </>}>
        <div className="space-y-5">
          {formError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong>Kaydedilemedi:</strong> {formError}</div>}
          <div className="grid gap-4 md:grid-cols-2">
            <Select label="Müşteri *" value={header.customer_id} onChange={e => setHeader({ ...header, customer_id: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
            <Select label="Satış Temsilcisi" value={header.sales_person_id} onChange={e => setHeader({ ...header, sales_person_id: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...salesTeam.map(s => ({ value: s.id, label: s.name }))]} />
            <Input label="Fatura Tarihi" type="date" value={header.issue_date}
              onChange={e => setHeader({ ...header, issue_date: e.target.value, due_date: addDays(e.target.value, DEFAULT_PAYMENT_TERM_DAYS) })} />
            <Input label={`Vade Tarihi (varsayılan ${DEFAULT_PAYMENT_TERM_DAYS} gün)`} type="date" value={header.due_date}
              onChange={e => setHeader({ ...header, due_date: e.target.value })} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium">Fatura Kalemleri</h4>
              <Button variant="secondary" size="sm" onClick={() => setLines([...lines, emptyLine()])}><Plus className="h-3 w-3" />Kalem Ekle</Button>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 pb-1 text-[11px] font-medium text-slate-500">
              <span className="col-span-3">Ürün / Hizmet</span><span className="col-span-3">Açıklama</span>
              <span className="col-span-1 text-right">Miktar</span><span className="col-span-2 text-right">Birim Fiyat</span>
              <span className="col-span-1 text-right">İsk.%</span><span className="col-span-1 text-right">KDV%</span><span className="col-span-1" />
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 rounded-lg bg-slate-50 p-2">
                  <select className="col-span-12 md:col-span-3 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={l.product_id || ''}
                    onChange={e => updateLine(i, 'product_id', e.target.value || null)}>
                    <option value="">Ürün seçin (opsiyonel)</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input className="col-span-12 md:col-span-3 h-9 rounded-lg border border-slate-200 px-2 text-sm" placeholder="Açıklama"
                    value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} />
                  <input type="number" min="0" step="0.01" className="col-span-3 md:col-span-1 h-9 rounded-lg border border-slate-200 px-2 text-sm text-right"
                    value={l.quantity} onChange={e => updateLine(i, 'quantity', parseFloat(e.target.value) || 0)} />
                  <input type="number" min="0" step="0.01" className="col-span-4 md:col-span-2 h-9 rounded-lg border border-slate-200 px-2 text-sm text-right"
                    value={l.unit_price} onChange={e => updateLine(i, 'unit_price', parseFloat(e.target.value) || 0)} />
                  <input type="number" min="0" max="100" className="col-span-2 md:col-span-1 h-9 rounded-lg border border-slate-200 px-2 text-sm text-right"
                    value={l.discount} onChange={e => updateLine(i, 'discount', parseFloat(e.target.value) || 0)} />
                  <select className="col-span-2 md:col-span-1 h-9 rounded-lg border border-slate-200 px-1 text-sm" value={l.tax_rate}
                    onChange={e => updateLine(i, 'tax_rate', Number(e.target.value))}>
                    {[0, 1, 10, 20].map(r => <option key={r} value={r}>%{r}</option>)}
                  </select>
                  <button className="col-span-1 flex items-center justify-center text-red-500 hover:text-red-700 disabled:opacity-30"
                    disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} title="Kalemi sil">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="ml-auto max-w-sm space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Ara Toplam:</span><span className="font-medium">₺{formatMoney(totals.subtotal)}</span></div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Genel İskonto (%):</span>
              <input type="number" min="0" max="100" value={header.discount}
                onChange={e => setHeader({ ...header, discount: parseFloat(e.target.value) || 0 })}
                className="w-20 rounded border border-slate-200 px-2 py-1 text-right" />
            </div>
            {totals.discountAmount > 0 && <>
              <div className="flex justify-between"><span className="text-slate-600">İskonto Tutarı:</span><span className="font-medium text-red-600">-₺{formatMoney(totals.discountAmount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">KDV Matrahı:</span><span className="font-medium">₺{formatMoney(totals.netTotal)}</span></div>
            </>}
            <div className="flex justify-between"><span className="text-slate-600">KDV:</span><span className="font-medium">₺{formatMoney(totals.taxTotal)}</span></div>
            <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Genel Toplam:</span><span className="text-indigo-600">₺{formatMoney(totals.total)}</span></div>
          </div>

          <Textarea label="Notlar" value={header.notes} onChange={e => setHeader({ ...header, notes: e.target.value })} rows={2} />
          <p className="text-xs text-slate-500">
            "Kaydet ve Kes" ile fatura sıralı numara alır, kilitlenir ve vade tarihli alacak kaydı Tahsilat'a eklenir.
            Bu kayıt şirket içi takip içindir; resmi e-Fatura/e-Arşiv düzenlemesi entegratörünüz üzerinden yapılmalıdır.
          </p>
        </div>
      </Modal>

      {/* ---------- Detay ---------- */}
      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail?.invoice_number ? `Fatura ${detail.invoice_number}` : 'Taslak Fatura'} size="lg"
        footer={detail && <>
          <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Yazdır</Button>
          {detail.status === 'draft' && <Button onClick={() => handleIssue(detail)} disabled={busy}><Send className="h-4 w-4" />Faturayı Kes</Button>}
        </>}>
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500">Müşteri</p>
                <p className="text-base font-semibold">{customerName(detail.customer_id)}</p>
                {orderNumber(detail.order_id) && <p className="text-xs text-slate-500">Sipariş: {orderNumber(detail.order_id)}</p>}
              </div>
              <div className="text-right">
                <Badge variant={INVOICE_STATUS[detail.status]?.variant || 'default'}>{INVOICE_STATUS[detail.status]?.label}</Badge>
                <p className="mt-1 text-xs text-slate-500">Tarih: {formatDate(detail.issue_date)}</p>
                <p className="text-xs text-slate-500">Vade: {detail.due_date ? formatDate(detail.due_date) : '-'}</p>
              </div>
            </div>
            <table className="w-full">
              <thead><tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2">Kalem</th><th className="py-2 text-right">Miktar</th><th className="py-2 text-right">Birim Fiyat</th>
                <th className="py-2 text-right">İsk.</th><th className="py-2 text-right">KDV</th><th className="py-2 text-right">Tutar</th>
              </tr></thead>
              <tbody>
                {(detail.items || []).map((it: any) => (
                  <tr key={it.id} className="border-b">
                    <td className="py-2">{it.description || products.find(p => p.id === it.product_id)?.name || '-'}</td>
                    <td className="py-2 text-right">{it.quantity}</td>
                    <td className="py-2 text-right">₺{formatMoney(Number(it.unit_price))}</td>
                    <td className="py-2 text-right">{Number(it.discount) > 0 ? `%${it.discount}` : '-'}</td>
                    <td className="py-2 text-right">%{it.tax_rate}</td>
                    <td className="py-2 text-right">₺{formatMoney(Number(it.line_total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ml-auto max-w-xs space-y-1">
              <div className="flex justify-between"><span>Ara Toplam:</span><span>₺{formatMoney(Number(detail.subtotal))}</span></div>
              {Number(detail.discount_amount) > 0 && <div className="flex justify-between text-red-600"><span>İskonto (%{detail.discount}):</span><span>-₺{formatMoney(Number(detail.discount_amount))}</span></div>}
              <div className="flex justify-between"><span>KDV:</span><span>₺{formatMoney(Number(detail.tax_total))}</span></div>
              <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Genel Toplam:</span><span className="text-indigo-600">₺{formatMoney(Number(detail.total))}</span></div>
              {!['draft', 'cancelled'].includes(detail.status) && <>
                <div className="flex justify-between text-green-700"><span>Tahsil Edilen:</span><span>₺{formatMoney(Number(detail.paid_amount))}</span></div>
                <div className="flex justify-between font-medium"><span>Kalan:</span><span>₺{formatMoney(Number(detail.total) - Number(detail.paid_amount))}</span></div>
              </>}
            </div>
            {detail.notes && <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">{detail.notes}</p>}
            {detail.cancel_reason && <p className="rounded bg-red-50 p-2 text-xs text-red-700">İptal nedeni: {detail.cancel_reason}</p>}
          </div>
        )}
      </Modal>

      {/* ---------- İptal ---------- */}
      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)}
        title={cancelTarget?.status === 'draft' ? 'Taslağı Sil' : 'Faturayı İptal Et'}
        footer={<>
          <Button variant="secondary" onClick={() => setCancelTarget(null)}>Vazgeç</Button>
          <Button variant="danger" onClick={handleCancel} disabled={busy || (cancelTarget?.status !== 'draft' && !cancelReason.trim())}>
            {cancelTarget?.status === 'draft' ? 'Sil' : 'İptal Et'}
          </Button>
        </>}>
        {cancelTarget?.status === 'draft' ? (
          <p className="text-sm text-slate-600">Bu taslak fatura silinecek. Taslaklara numara verilmediği için numara sırası etkilenmez.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              <strong>{cancelTarget?.invoice_number}</strong> numaralı fatura iptal edilecek. Fatura kaydı silinmez, "İptal" olarak saklanır;
              ödenmemiş alacak kaydı Tahsilat'tan kaldırılır.
            </p>
            <Textarea label="İptal nedeni *" value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2} />
          </div>
        )}
      </Modal>
    </div>
  );
}
