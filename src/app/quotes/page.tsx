'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, EmptyState, Textarea } from '@/components/ui';
import { formatMoney, formatDate, cleanPayload } from '@/lib/utils';
import { FileText, Plus, Edit2, Trash2, RefreshCw, Search, Eye, Send, CheckCircle, XCircle, Download, Printer, ShoppingCart, Target, ClipboardCheck, GitBranch, History, ShieldCheck, Link2, Copy, MessageCircle, Mail, Settings2, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { createOrderFromQuote } from '@/lib/sales-flow';
import { nextDocumentNumber } from '@/lib/doc-number';
import { useDealerPricing } from '@/lib/use-dealer-pricing';
import DealerTermBar from '@/components/DealerTermBar';
import { useAuth } from '@/lib/auth-context';
import { CURRENCIES, CUR_LABEL, money, getRates, convert, toTry, FxRates } from '@/lib/fx';
import { evaluateQuote, APPROVAL_STATUS, CUSTOMER_RESPONSE, QuotePolicy, DEFAULT_POLICY } from '@/lib/quote-approval';

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
  const [policy, setPolicy] = useState<QuotePolicy & { id?: string }>(DEFAULT_POLICY);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [approvalReady, setApprovalReady] = useState(false);   // teklif-onay.sql kurulu mu
  const [reviewItems, setReviewItems] = useState<any[]>([]);
  const [shareTarget, setShareTarget] = useState<any | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const [currency, setCurrency] = useState('TRY');
  const [exRate, setExRate] = useState<number>(1);
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [fx, setFx] = useState<FxRates | null>(null);
  const [fxReady, setFxReady] = useState(false);   // doviz.sql kurulu mu
  
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
    note?: string;
  }[]>([]);

  const supabase = createClient();
  const pricing = useDealerPricing(supabase);
  const [paymentTerm, setPaymentTerm] = useState<number>(30);

  // Ürün fiyatını teklif para birimine çevir (TCMB döviz satış kuru)
  const conv = (price: number, productId?: string) => {
    const p: any = products.find(x => x.id === productId);
    return convert(Number(price) || 0, p?.currency || 'TRY', currency, fx, exRate);
  };

  // Bayi ise kalemlere bayi fiyatı ve iskontosunu uygular
  const repriceItems = (list: typeof items, customerId: string, term: number, keepPrice = false) =>
    list.map(it => {
      if (!it.product_id) return it;
      const pr = pricing.priceFor(customerId, it.product_id, Number(it.quantity) || 1, term);
      if (!pr) return { ...it, note: undefined };
      return { ...it, unit_price: keepPrice ? it.unit_price : conv(pr.listPrice, it.product_id), discount: pr.discountPct, note: pr.explanation };
    });

  // Para birimi değişince mevcut kalemleri yeni kura çevir
  const changeCurrency = async (cur: string) => {
    const rates = fx || await getRates();
    if (!fx && rates) setFx(rates);
    const newRate = cur === 'TRY' ? 1 : toTry(rates, cur);
    if (cur !== 'TRY' && !newRate) { alert('TCMB kuru alınamadı; kuru elle girebilirsiniz.'); }
    const oldRate = exRate || 1, nr = newRate || 1;
    setItems(list => list.map(it => ({ ...it, unit_price: Math.round((Number(it.unit_price) || 0) * oldRate / nr * 100) / 100 })));
    setCurrency(cur); setExRate(nr); setRateDate(cur === 'TRY' ? null : rates?.date || null);
  };

  const changeCustomer = (customerId: string) => {
    setFormData(f => ({ ...f, customer_id: customerId }));
    const term = pricing.defaultTerm(customerId) ?? 30;
    setPaymentTerm(term);
    setItems(list => repriceItems(list, customerId, term));
  };

  const changeTerm = (term: number) => {
    setPaymentTerm(term);
    if (formData.customer_id) setItems(list => repriceItems(list, formData.customer_id, term));
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [quotesRes, customersRes, productsRes] = await Promise.all([
        supabase.from('quotes').select('*').order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('products').select('*').eq('status', 'active'),
      ]);
      const [probe, pol] = await Promise.all([
        supabase.from('quotes').select('approval_status').limit(1),
        supabase.from('quote_policies').select('*').maybeSingle(),
      ]);
      setApprovalReady(!probe.error);
      const fxProbe = await supabase.from('quotes').select('exchange_rate').limit(1);
      setFxReady(!fxProbe.error);
      if (pol.data) setPolicy(pol.data);
      
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
      setPaymentTerm(30);
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
    setPaymentTerm(30);
    setCurrency('TRY'); setExRate(1); setRateDate(null);
    if (!fx) getRates().then(r => r && setFx(r));
    setModalOpen(true);
  };

  // ---------- ISO 8.2.3: Gözden geçirme ----------
  const openReview = async (q: Quote) => {
    setReviewItems([]);
    const { data } = await supabase.from('quote_items').select('*').eq('quote_id', q.id);
    setReviewItems(data || []);
    setReviewTarget(q);
    setReviewChecks({});
    setReviewNotes('');
  };

  const isManagerRole = ['super_admin', 'admin', 'org_admin', 'manager'].includes((profile as any)?.role || '') || !!(profile as any)?.is_org_admin;

  const reviewEval = reviewTarget ? evaluateQuote(reviewItems, reviewTarget.discount, products as any[], reviewTarget.total, policy) : null;
  const needsApproval = !!(approvalReady && reviewEval && reviewEval.reasons.length > 0 && (reviewTarget as any)?.approval_status !== 'approved');

  const submitReview = async () => {
    if (!reviewTarget) return;
    const allChecked = REVIEW_CHECKLIST.every(c => reviewChecks[c.key]);
    if (!allChecked) { alert('Gözden geçirmeyi tamamlamak için tüm maddeler onaylanmalıdır.'); return; }
    if (!approvalReady && Number(reviewTarget.discount) > DISCOUNT_APPROVAL_LIMIT && !isManagerRole) {
      alert(`%${DISCOUNT_APPROVAL_LIMIT} üzeri iskonto yönetici onayı gerektirir. Gözden geçirmeyi bir yönetici yapmalıdır.`);
      return;
    }
    setSaving(true);
    try {
      const me = { id: (profile as any)?.id || null, name: (profile as any)?.name || (profile as any)?.email || null };
      const metrics: any = approvalReady && reviewEval ? {
        margin_pct: reviewEval.marginPct === null ? null : Math.round(reviewEval.marginPct * 100) / 100,
        effective_discount_pct: Math.round(reviewEval.effectiveDiscount * 100) / 100,
      } : {};
      let patch: any;
      if (needsApproval && !isManagerRole) {
        // Temsilci: yönetici onayına gönder (teklif taslakta kalır)
        patch = { ...metrics, approval_status: 'pending', approval_reasons: reviewEval!.reasons.join(' · '),
          approval_requested_by: me.id, approval_requested_at: new Date().toISOString(), approval_note: null,
          review_checklist: reviewChecks, review_notes: reviewNotes || null };
      } else {
        patch = { ...metrics, status: 'reviewed', reviewed_by: me.id, reviewed_by_name: me.name, reviewed_at: new Date().toISOString(),
          review_checklist: reviewChecks, review_notes: reviewNotes || null };
        if (needsApproval && isManagerRole) Object.assign(patch, { approval_status: 'approved', approval_reasons: reviewEval!.reasons.join(' · '),
          approved_by_name: me.name, approval_decided_at: new Date().toISOString() });
      }
      const { error } = await supabase.from('quotes').update(patch).eq('id', reviewTarget.id);
      if (error) throw error;
      if (patch.approval_status === 'pending') alert('Teklif yönetici onayına gönderildi. Onaylanınca müşteriye gönderebilirsiniz.');
      setReviewTarget(null);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------- Yönetici onayı ----------
  const decideApproval = async (q: any, ok: boolean) => {
    const note = ok ? (prompt('Onay notu (isteğe bağlı):') ?? '') : prompt('Ret nedeni (temsilci görecek):');
    if (!ok && !note) return;
    const me = (profile as any)?.name || (profile as any)?.email || null;
    const patch: any = ok
      ? { approval_status: 'approved', approved_by_name: me, approval_decided_at: new Date().toISOString(), approval_note: note || null,
          status: 'reviewed', reviewed_by: (profile as any)?.id || null, reviewed_by_name: me, reviewed_at: new Date().toISOString() }
      : { approval_status: 'rejected', approved_by_name: me, approval_decided_at: new Date().toISOString(), approval_note: note };
    const { error } = await supabase.from('quotes').update(patch).eq('id', q.id);
    if (error) alert(error.message); else fetchData();
  };

  // ---------- Online teklif ----------
  const shareQuote = async (q: any) => {
    let token = q.share_token;
    if (!token || q.status === 'reviewed') {
      token = token || crypto.randomUUID();
      const patch: any = { share_token: token, shared_at: new Date().toISOString() };
      if (q.status === 'reviewed') { patch.status = 'sent'; patch.sent_at = new Date().toISOString(); }
      const { error } = await supabase.from('quotes').update(patch).eq('id', q.id);
      if (error) { alert('Bağlantı oluşturulamadı: ' + error.message); return; }
      fetchData();
    }
    setShareTarget({ ...q, share_token: token, url: `${window.location.origin}/q/${token}` });
  };

  const savePolicy = async () => {
    const payload = { max_discount_pct: policy.max_discount_pct === null || (policy.max_discount_pct as any) === '' ? null : Number(policy.max_discount_pct),
      min_margin_pct: policy.min_margin_pct === null || (policy.min_margin_pct as any) === '' ? null : Number(policy.min_margin_pct),
      max_total_without_approval: policy.max_total_without_approval === null || (policy.max_total_without_approval as any) === '' ? null : Number(policy.max_total_without_approval),
      updated_at: new Date().toISOString() };
    const { data, error } = policy.id
      ? await supabase.from('quote_policies').update(payload).eq('id', policy.id).select().single()
      : await supabase.from('quote_policies').insert([payload]).select().single();
    if (error) { alert(error.message); return; }
    setPolicy(data); setPolicyOpen(false);
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
    setPaymentTerm((q as any).payment_term_days ?? pricing.defaultTerm(q.customer_id) ?? 30);
    setCurrency((q as any).currency || 'TRY'); setExRate(Number((q as any).exchange_rate) || 1); setRateDate((q as any).rate_date || null);
    if (!fx) getRates().then(r => r && setFx(r));
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
        newItems[index].unit_price = conv(product.price, product.id);
        newItems[index].tax_rate = product.tax_rate;
      }
    }
    
    if ((field === 'product_id' || field === 'quantity') && formData.customer_id) {
      const [repriced] = repriceItems([newItems[index]], formData.customer_id, paymentTerm, field === 'quantity');
      newItems[index] = repriced;
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
        payment_term_days: paymentTerm,
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
        ...(fxReady ? { currency, exchange_rate: currency === 'TRY' ? 1 : exRate, rate_date: currency === 'TRY' ? null : rateDate, rate_note: currency === 'TRY' ? null : 'TCMB döviz satış' } : {}),
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
    const matchPending = !onlyPending || (q as any).approval_status === 'pending';
    return matchSearch && matchStatus && matchPending;
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
          <div className="flex flex-wrap items-center gap-2">
            {approvalReady && (() => {
              const pend = quotes.filter((q: any) => q.approval_status === 'pending').length;
              return pend > 0 ? (
                <button onClick={() => setOnlyPending(!onlyPending)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${onlyPending ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800'}`}>
                  Onay bekleyen: {pend}
                </button>
              ) : null;
            })()}
            {approvalReady && isManagerRole && (
              <Button variant="secondary" onClick={() => setPolicyOpen(true)} title="Onay kuralları"><Settings2 className="h-4 w-4" /></Button>
            )}
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
                          {(quote as any).approval_status && (quote as any).approval_status !== 'not_required' && (
                            <div className="mt-1"><Badge variant={APPROVAL_STATUS[(quote as any).approval_status]?.variant || 'default'} className="text-[10px]" >{APPROVAL_STATUS[(quote as any).approval_status]?.label}</Badge>
                              {(quote as any).approval_status !== 'approved' && (quote as any).approval_reasons && <p className="mt-0.5 max-w-[220px] text-[10px] text-amber-700">{(quote as any).approval_reasons}</p>}
                              {(quote as any).approval_status === 'rejected' && (quote as any).approval_note && <p className="mt-0.5 max-w-[220px] text-[10px] text-red-600">Not: {(quote as any).approval_note}</p>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium">{customers.find(c => c.id === quote.customer_id)?.name || '-'}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {quote.subject || '-'}
                          {quote.opportunity_id && <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded" title="Bir fırsata bağlı"><Target className="h-3 w-3" />Fırsat</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{money(quote.total, (quote as any).currency)}{(quote as any).currency && (quote as any).currency !== 'TRY' && <div className="text-[10px] font-normal text-slate-400">≈ ₺{formatMoney(Number(quote.total) * Number((quote as any).exchange_rate || 1))}</div>}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={statusConfig[quote.status]?.variant || 'default'}>
                            {statusConfig[quote.status]?.label || quote.status}
                          </Badge>
                          {(quote as any).customer_response && (
                            <div className="mt-1"><Badge variant={CUSTOMER_RESPONSE[(quote as any).customer_response]?.variant} className="text-[10px]">{CUSTOMER_RESPONSE[(quote as any).customer_response]?.label}</Badge></div>
                          )}
                          {(quote as any).share_token && (
                            <div className="mt-1 text-[10px] text-slate-500" title={(quote as any).last_viewed_at ? `Son görüntüleme: ${new Date((quote as any).last_viewed_at).toLocaleString('tr-TR')}` : 'Henüz açılmadı'}>
                              <Eye className="inline h-3 w-3" /> {(quote as any).view_count ? `${(quote as any).view_count} kez görüntülendi` : 'Henüz açılmadı'}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500 text-xs">
                          {formatDate(quote.valid_until)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => viewQuote(quote)} title="Görüntüle">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {quote.status === 'draft' && (quote as any).approval_status === 'pending' && isManagerRole && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => decideApproval(quote, true)} title="Yönetici onayı ver"><CheckCircle className="h-4 w-4 text-green-600" /><span className="text-xs">Onayla</span></Button>
                                <Button variant="ghost" size="sm" onClick={() => decideApproval(quote, false)} title="Onayı reddet"><XCircle className="h-4 w-4 text-red-500" /></Button>
                              </>
                            )}
                            {quote.status === 'draft' && (quote as any).approval_status !== 'pending' && (
                              <Button variant="ghost" size="sm" onClick={() => openReview(quote)} title="Gözden geçir (ISO 9001 · 8.2.3)">
                                <ClipboardCheck className="h-4 w-4 text-amber-600" /><span className="text-xs">Gözden Geçir</span>
                              </Button>
                            )}
                            {approvalReady && ['reviewed', 'sent'].includes(quote.status) && (
                              <Button variant="ghost" size="sm" onClick={() => shareQuote(quote)} title="Müşteriye online teklif bağlantısı gönder">
                                <Link2 className="h-4 w-4 text-indigo-600" /><span className="text-xs">Online</span>
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
              onChange={(e) => changeCustomer(e.target.value)}
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

          <DealerTermBar
            termDays={paymentTerm}
            onTermChange={changeTerm}
            dealer={pricing.getDealer(formData.customer_id)}
            credit={formData.customer_id ? pricing.creditCheck(formData.customer_id, calculateTotals().total) : null}
            onReapply={() => setItems(list => repriceItems(list, formData.customer_id, paymentTerm))}
          />

          <Input
            label="Teklif Konusu"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            placeholder="Örn: Yazılım Geliştirme Projesi"
          />

          {fxReady && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Para birimi</label>
                <select value={currency} onChange={(e) => changeCurrency(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
                  {CURRENCIES.map(c => <option key={c} value={c}>{CUR_LABEL[c]}</option>)}
                </select>
              </div>
              {currency !== 'TRY' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Kur (1 {currency} = ₺)</label>
                    <input type="number" step="0.0001" value={exRate} onChange={(e) => setExRate(parseFloat(e.target.value) || 0)} className="h-9 w-28 rounded-lg border border-slate-200 px-2 text-right text-sm" />
                  </div>
                  <p className="pb-2 text-xs text-slate-500">TCMB döviz satış{rateDate ? ` · ${formatDate(rateDate)}` : ''}. Ürün fiyatları otomatik çevrilir; kur elle değiştirilebilir.</p>
                </>
              )}
            </div>
          )}

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
                          <option key={p.id} value={p.id}>{p.name} - {money(p.price, (p as any).currency)}</option>
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
                  {item.note && <p className="basis-full text-[11px] text-amber-700">Bayi fiyatı: {item.note}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Toplamlar */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Ara Toplam:</span>
              <span className="font-medium">{money(subtotal, currency)}</span>
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
                  <span className="font-medium text-red-600">-{money(discountAmount, currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">KDV Matrahı:</span>
                  <span className="font-medium">{money(netTotal, currency)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">KDV:</span>
              <span className="font-medium">{money(taxTotal, currency)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Genel Toplam:</span>
              <span className="text-indigo-600">{money(total, currency)}</span>
            </div>
            {currency !== 'TRY' && exRate > 0 && <p className="text-right text-xs text-slate-500">TL karşılığı ≈ ₺{formatMoney(total * exRate)}</p>}
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
            {(selectedQuote as any).customer_response && (
              <div className={`rounded-lg border p-3 text-sm ${(selectedQuote as any).customer_response === 'accepted' ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                <p className="font-semibold">{CUSTOMER_RESPONSE[(selectedQuote as any).customer_response]?.label}</p>
                <p>{(selectedQuote as any).customer_signer_name}{(selectedQuote as any).customer_signer_title ? ` — ${(selectedQuote as any).customer_signer_title}` : ''} · {new Date((selectedQuote as any).customer_response_at).toLocaleString('tr-TR')}</p>
                {(selectedQuote as any).customer_note && <p className="mt-1 text-slate-600">“{(selectedQuote as any).customer_note}”</p>}
                {(selectedQuote as any).customer_response_meta?.ip && <p className="mt-1 text-[11px] text-slate-500">Kayıt: IP {(selectedQuote as any).customer_response_meta.ip}</p>}
              </div>
            )}

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
                      <td className="px-3 py-2 text-right">{money(item.unit_price, (selectedQuote as any).currency)}</td>
                      <td className="px-3 py-2 text-right">%{item.discount}</td>
                      <td className="px-3 py-2 text-right font-medium">{money(item.total, (selectedQuote as any).currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Toplamlar */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between">
                <span>Ara Toplam:</span>
                <span>{money(selectedQuote.subtotal, (selectedQuote as any).currency)}</span>
              </div>
              {selectedQuote.discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>İskonto (%{selectedQuote.discount}):</span>
                  <span>-{money(selectedQuote.subtotal * selectedQuote.discount / 100, (selectedQuote as any).currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>KDV:</span>
                <span>{money(selectedQuote.tax_total, (selectedQuote as any).currency)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold border-t pt-2">
                <span>Genel Toplam:</span>
                <span className="text-indigo-600">{money(selectedQuote.total, (selectedQuote as any).currency)}</span>
              </div>
              {(selectedQuote as any).currency && (selectedQuote as any).currency !== 'TRY' && (
                <p className="text-right text-xs text-slate-500">Kur: 1 {(selectedQuote as any).currency} = ₺{Number((selectedQuote as any).exchange_rate).toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ({(selectedQuote as any).rate_note || 'TCMB'}{(selectedQuote as any).rate_date ? `, ${formatDate((selectedQuote as any).rate_date)}` : ''}) · TL karşılığı ₺{formatMoney(Number(selectedQuote.total) * Number((selectedQuote as any).exchange_rate))}</p>
              )}
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
              <ShieldCheck className="h-4 w-4" />{needsApproval && !isManagerRole ? 'Yönetici Onayına Gönder' : 'Gözden Geçirmeyi Onayla'}
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
            {!approvalReady && Number(reviewTarget.discount) > DISCOUNT_APPROVAL_LIMIT && (
              <div className={`rounded-lg border p-3 ${isManagerRole ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                İskonto %{DISCOUNT_APPROVAL_LIMIT}'nin üzerinde; yönetici onayı gerekir.
                {isManagerRole ? ' Yönetici olarak onaylıyorsunuz.' : ' Bu gözden geçirmeyi bir yönetici yapmalıdır.'}
              </div>
            )}
            {approvalReady && reviewEval && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2"><p className="text-[11px] text-slate-500">Liste toplamı</p><p className="font-semibold">₺{formatMoney(reviewEval.listTotal)}</p></div>
                  <div className="rounded-lg bg-slate-50 p-2"><p className="text-[11px] text-slate-500">Toplam iskonto</p><p className="font-semibold">%{reviewEval.effectiveDiscount.toFixed(1)}</p></div>
                  <div className="rounded-lg bg-slate-50 p-2"><p className="text-[11px] text-slate-500">Brüt marj</p>
                    <p className={`font-semibold ${reviewEval.marginPct !== null && policy.min_margin_pct !== null && reviewEval.marginPct < Number(policy.min_margin_pct) ? 'text-red-600' : 'text-green-700'}`}>{reviewEval.marginPct === null ? '—' : `%${reviewEval.marginPct.toFixed(1)}`}</p>
                    {reviewEval.missingCost > 0 && <p className="text-[10px] text-slate-400">{reviewEval.missingCost} kalemde maliyet yok</p>}</div>
                </div>
                {needsApproval ? (
                  <div className={`rounded-lg border p-3 ${isManagerRole ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                    <p className="font-medium">Yönetici onayı gerekiyor:</p>
                    <ul className="list-disc pl-5">{reviewEval.reasons.map(r => <li key={r}>{r}</li>)}</ul>
                    <p className="mt-1 text-xs">{isManagerRole ? 'Yönetici olarak onaylayıp gözden geçirmeyi tamamlıyorsunuz.' : 'Kaydettiğinizde teklif yönetici onayına gider.'}</p>
                  </div>
                ) : (reviewTarget as any).approval_status === 'approved' ? (
                  <p className="rounded-lg bg-green-50 p-2 text-xs text-green-800">Yönetici onayı alınmış ({(reviewTarget as any).approved_by_name}).</p>
                ) : <p className="rounded-lg bg-green-50 p-2 text-xs text-green-800">Teklif onay kuralları içinde.</p>}
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
      <Modal isOpen={!!shareTarget} onClose={() => setShareTarget(null)} title="Online teklif bağlantısı">
        {shareTarget && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">Müşteriniz bu bağlantıdan teklifi görüntüler, <b>online kabul eder</b>, revizyon ister veya reddeder. Ne zaman ve kaç kez açtığını görürsünüz.</p>
            <div className="flex gap-2">
              <input readOnly value={shareTarget.url} className="flex-1 rounded-lg border bg-slate-50 px-2 py-2 text-xs" onFocus={e => e.target.select()} />
              <Button size="sm" onClick={() => { navigator.clipboard?.writeText(shareTarget.url); alert('Bağlantı kopyalandı.'); }}><Copy className="h-3 w-3" />Kopyala</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-white"
                href={`https://wa.me/?text=${encodeURIComponent(`Merhaba, ${quoteNo(shareTarget)} numaralı teklifimizi aşağıdaki bağlantıdan inceleyip online onaylayabilirsiniz:\n${shareTarget.url}`)}`}><MessageCircle className="h-4 w-4" />WhatsApp</a>
              <a className="inline-flex items-center gap-1 rounded-lg border px-3 py-2"
                href={`mailto:?subject=${encodeURIComponent(`Teklifimiz: ${quoteNo(shareTarget)} ${shareTarget.subject || ''}`)}&body=${encodeURIComponent(`Merhaba,\n\n${quoteNo(shareTarget)} numaralı teklifimizi aşağıdaki bağlantıdan inceleyip online onaylayabilirsiniz:\n${shareTarget.url}\n\nSaygılarımızla`)}`}><Mail className="h-4 w-4" />E-posta</a>
              <a target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-lg border px-3 py-2" href={`${shareTarget.url}?preview=1`}><ExternalLink className="h-4 w-4" />Önizle</a>
            </div>
            <p className="text-[11px] text-slate-400">Önizleme görüntülenme sayısına eklenmez. Teklif değiştirilecekse revizyon oluşturun; eski bağlantı yeni sürüme yönlendirir.</p>
          </div>
        )}
      </Modal>

      <Modal isOpen={policyOpen} onClose={() => setPolicyOpen(false)} title="Teklif onay kuralları"
        footer={<><Button variant="secondary" onClick={() => setPolicyOpen(false)}>İptal</Button><Button onClick={savePolicy}>Kaydet</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Aşağıdaki sınırlardan biri aşılırsa temsilci teklifi gönderemez; teklif yönetici onayına düşer. Boş bırakılan kural uygulanmaz.</p>
          <Input label="Toplam iskonto üst sınırı (%)" type="number" value={(policy.max_discount_pct ?? '') as any} onChange={e => setPolicy({ ...policy, max_discount_pct: e.target.value as any })} />
          <Input label="Brüt marj alt sınırı (%) — ürün maliyeti girilmişse" type="number" value={(policy.min_margin_pct ?? '') as any} onChange={e => setPolicy({ ...policy, min_margin_pct: e.target.value as any })} />
          <Input label="Onaysız teklif tutar sınırı (₺, KDV dahil)" type="number" value={(policy.max_total_without_approval ?? '') as any} onChange={e => setPolicy({ ...policy, max_total_without_approval: e.target.value as any })} />
          <p className="text-xs text-slate-500">Ürün maliyetleri Ürün Kataloğu'nda "Birim maliyet" alanından girilir.</p>
        </div>
      </Modal>
    </div>
  );
}
