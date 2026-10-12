'use client';

import Header from '@/components/Header';
import SalesFilter from '@/components/SalesFilter';
import { Card, CardBody, Button, Badge, Modal, Input, Select, Textarea, EmptyState } from '@/components/ui';
import { formatMoney, cleanPayload } from '@/lib/utils';
import { Building2, Plus, Edit2, Trash2, Mail, Phone, User, RefreshCw, Search, Sparkles, Star, MapPin, Copy, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { CitySelect } from '@/components/TrSelects';
import { SEGMENTS, checkTaxNumber, findDuplicates, duplicateGroups, DupMatch } from '@/lib/crm';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { DEALER_LEVELS, PAYMENT_TERMS, termLabel } from '@/lib/dealer-pricing';
import { SectorSelect } from '@/components/TrSelects';

interface Customer {
  id: string;
  name: string;
  contact_person: string;
  contact_title?: string;
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
    name: '', contact_person: '', contact_title: '', email: '', phone: '', address: '',
    sector: '', size: '', status: 'Potansiyel', assigned_to: '', total_sales: 0, notes: '',
    legal_name: '', tax_office: '', tax_number: '', city: '', district: '', segment: '',
    referral_partner_id: '', referral_commission_rate: '' as any,
    customer_type: 'end_customer', dealer_code: '', dealer_level: '', region: '', credit_limit: '' as any, payment_term_days: '' as any, price_list_id: '', base_discount: 0, dealer_since: '',
  });
  const [priceLists, setPriceLists] = useState<{ id: string; name: string }[]>([]);
  const [filterType, setFilterType] = useState('');
  const [filterSegment, setFilterSegment] = useState('');
  const [filterAbc, setFilterAbc] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [crmReady, setCrmReady] = useState(false);
  const [dups, setDups] = useState<DupMatch[] | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [customersRes, teamRes] = await Promise.all([
        supabase.from('customers').select('*, sales_team:assigned_to(name, region)').order('created_at', { ascending: false }),
        supabase.from('sales_team').select('id, name, region, member_type, default_commission_rate').order('name'),
      ]);
      const { data: pls } = await supabase.from('price_lists').select('id, name').eq('is_active', true).order('name');
      setPriceLists(pls || []);
      setCustomers((customersRes.data || []).filter((c: any) => !c.merged_into));
      const probe = await supabase.from('customers').select('segment').limit(1);
      setCrmReady(!probe.error);
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
        name: customer.name, contact_person: customer.contact_person || '', contact_title: customer.contact_title || '',
        email: customer.email || '', phone: customer.phone || '',
        address: customer.address || '', sector: customer.sector || '',
        size: customer.size || '', status: customer.status || 'Potansiyel',
        assigned_to: customer.assigned_to || '', total_sales: customer.total_sales || 0,
        notes: customer.notes || '',
        referral_partner_id: (customer as any).referral_partner_id || '',
        referral_commission_rate: (customer as any).referral_commission_rate ?? '',
        customer_type: (customer as any).customer_type || 'end_customer',
        dealer_code: (customer as any).dealer_code || '',
        dealer_level: (customer as any).dealer_level || '',
        region: (customer as any).region || '',
        credit_limit: (customer as any).credit_limit ?? '',
        payment_term_days: (customer as any).payment_term_days ?? '',
        price_list_id: (customer as any).price_list_id || '',
        base_discount: Number((customer as any).base_discount) || 0,
        dealer_since: (customer as any).dealer_since || '',
        legal_name: (customer as any).legal_name || '', tax_office: (customer as any).tax_office || '', tax_number: (customer as any).tax_number || '',
        city: (customer as any).city || '', district: (customer as any).district || '', segment: (customer as any).segment || '',
      });
    } else {
      setEditingCustomer(null);
      setFormData({ name: '', contact_person: '', contact_title: '', email: '', phone: '', address: '',
        sector: '', size: '', status: 'Potansiyel', assigned_to: '', total_sales: 0, notes: '', referral_partner_id: '', referral_commission_rate: '' as any, dealer_code: '', dealer_level: '', region: '', credit_limit: '' as any, payment_term_days: '' as any, price_list_id: '', base_discount: 0, dealer_since: '', legal_name: '', tax_office: '', tax_number: '', city: '', district: '', segment: '', customer_type: filterType === 'dealer' ? 'dealer' : 'end_customer' } as any);
    }
    setDups(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) { alert('Firma adı zorunludur'); return; }
    const tx = checkTaxNumber(formData.tax_number);
    if (tx && !tx.ok && !confirm(`Vergi numarası hatalı görünüyor (${tx.msg}). Yine de kaydedilsin mi?`)) return;
    // Mükerrer kontrolü (yeni kayıtta ve ad/vergi no değiştiğinde): ilk tıkta uyar, ikinci tıkta kaydet
    if (!dups) {
      const m = findDuplicates({ id: editingCustomer?.id, name: formData.name, tax_number: formData.tax_number, phone: formData.phone, email: formData.email }, customers);
      if (m.length) { setDups(m); return; }
    }
    setSaving(true);
    try {
      const crmKeys = ['legal_name', 'tax_office', 'tax_number', 'city', 'district', 'segment'];
      const base: any = { ...formData, assigned_to: formData.assigned_to || null };
      if (!crmReady) crmKeys.forEach(k => delete base[k]);
      const dataToSave = base;
      if (editingCustomer) {
        { const { error: dbErr } = await supabase.from('customers').update(cleanPayload(dataToSave)).eq('id', editingCustomer.id); if (dbErr) throw dbErr; }
      } else {
        const { data: created, error: dbErr } = await supabase.from('customers').insert(cleanPayload([dataToSave])).select('id').single(); if (dbErr) throw dbErr;
        if (crmReady && created && formData.contact_person) {
          await supabase.from('customer_contacts').insert([{ customer_id: created.id, full_name: formData.contact_person, title: formData.contact_title || null, email: formData.email || null, phone: formData.phone || null, is_primary: true }]);
        }
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
    const q = searchTerm.toLocaleLowerCase('tr-TR');
    const matchSearch = !q || c.name.toLocaleLowerCase('tr-TR').includes(q) || String((c as any).legal_name || '').toLocaleLowerCase('tr-TR').includes(q)
      || String((c as any).tax_number || '').includes(q.replace(/\D/g, '') || '§') || ((c as any).tags || []).some((t: string) => t.toLocaleLowerCase('tr-TR').includes(q));
    if (filterSegment && (c as any).segment !== filterSegment) return false;
    if (filterAbc && (filterAbc === 'key' ? !(c as any).is_key_account : (c as any).abc_class !== filterAbc)) return false;
    if (filterCity && (c as any).city !== filterCity) return false;
    const matchStatus = !filterStatus || c.status === filterStatus;
    const matchType = !filterType || ((c as any).customer_type || 'end_customer') === filterType;
    const matchPerson = !filterPerson || c.assigned_to === filterPerson;
    const matchRegion = !filterRegion || (c.sales_team?.region === filterRegion);
    return matchSearch && matchStatus && matchType && matchPerson && matchRegion;
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

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-56 rounded-lg border border-slate-200 pl-10 pr-4 text-sm outline-none focus:border-blue-500" placeholder="Ad, unvan, VKN, etiket…" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
              <option value="">Tüm Durumlar</option>
              <option value="VIP">VIP</option>
              <option value="Aktif">Aktif</option>
              <option value="Potansiyel">Potansiyel</option>
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
              <option value="">Tüm Türler</option>
              <option value="end_customer">Son Kullanıcı</option>
              <option value="dealer">Bayi</option>
            </select>
            {crmReady && <>
              <select value={filterSegment} onChange={(e) => setFilterSegment(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
                <option value="">Tüm segmentler</option>{SEGMENTS.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <select value={filterAbc} onChange={(e) => setFilterAbc(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
                <option value="">ABC: hepsi</option><option value="key">★ Kilit müşteriler</option><option value="A">A sınıfı</option><option value="B">B sınıfı</option><option value="C">C sınıfı</option>
              </select>
              <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
                <option value="">Tüm iller</option>{Array.from(new Set(customers.map((c: any) => c.city).filter(Boolean))).sort().map((x: any) => <option key={x} value={x}>{x}</option>)}
              </select>
            </>}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
            {crmReady && <Button variant="secondary" onClick={() => setDupOpen(true)} title="Aynı firmanın birden fazla kaydını bul ve birleştir"><Copy className="h-4 w-4" />Mükerrer{duplicateGroups(customers).length ? <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{duplicateGroups(customers).length}</span> : null}</Button>}
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
                    <div>
                      <Link href={`/customers/${c.id}`} className="font-semibold hover:text-indigo-700 hover:underline">{(c as any).is_key_account && <Star className="mr-1 inline h-4 w-4 fill-amber-400 text-amber-400" />}{c.name}</Link>
                      <p className="text-xs text-slate-500">{[c.sector, (c as any).segment, (c as any).city].filter(Boolean).join(' · ')}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(c as any).abc_class && <span className="rounded bg-slate-800 px-1.5 text-[10px] font-semibold text-white">{(c as any).abc_class}</span>}
                        {(c as any).order_block && <span className="flex items-center gap-0.5 rounded bg-red-100 px-1.5 text-[10px] font-medium text-red-700"><ShieldAlert className="h-3 w-3" />Sipariş blokajı</span>}
                        {((c as any).tags || []).slice(0, 3).map((t: string) => <span key={t} className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-600">#{t}</span>)}
                      </div>
                      {(c as any).customer_type === 'dealer' && (
                        <span className="mt-1 inline-block rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                          Bayi{(c as any).dealer_level ? ` · ${(c as any).dealer_level}` : ''}{(c as any).payment_term_days != null ? ` · ${termLabel((c as any).payment_term_days)}` : ''}
                        </span>
                      )}
                    </div>
                    <Badge variant={c.status === 'VIP' ? 'warning' : c.status === 'Aktif' ? 'success' : 'info'}>{c.status}</Badge>
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    {c.contact_person && <div className="flex items-center gap-2"><User className="h-4 w-4 text-slate-400" />{c.contact_person}{c.contact_title && <span className="text-xs text-slate-400">· {c.contact_title}</span>}</div>}
                    {c.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" />{c.email}</div>}
                    {c.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" />{c.phone}</div>}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    Sorumlu: {getAssignedName(c.assigned_to)}
                  </div>
                  {(c as any).next_step && <p className={`mt-1 text-xs ${(c as any).next_step_date && (c as any).next_step_date < new Date().toISOString().slice(0, 10) ? 'text-red-600' : 'text-indigo-700'}`}>→ {(c as any).next_step}{(c as any).next_step_date ? ` · ${new Date((c as any).next_step_date).toLocaleDateString('tr-TR')}` : ''}</p>}
                  <div className="mt-3 flex items-center justify-between border-t pt-3">
                    <p className="text-lg font-bold text-blue-600">₺{formatMoney(c.total_sales || 0)}</p>
                    <div className="flex gap-1">
                      <a href={`/briefs?customer=${c.id}`} title="Görüşmeye hazırlan (yapay zekâ)" className="inline-flex h-8 items-center rounded-lg px-2 text-indigo-600 hover:bg-indigo-50"><Sparkles className="h-4 w-4" /></a><Button variant="ghost" size="sm" onClick={() => openModal(c)}><Edit2 className="h-4 w-4" /></Button>
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} size="lg" title={editingCustomer ? 'Düzenle' : formData.customer_type === 'dealer' ? 'Yeni Bayi' : 'Yeni Müşteri'}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button><Button onClick={handleSave} disabled={saving}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[['end_customer', 'Son Kullanıcı / Müşteri'], ['dealer', 'Bayi']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFormData({ ...formData, customer_type: k })}
                className={`rounded-lg border px-3 py-2 text-sm ${formData.customer_type === k ? 'border-indigo-500 bg-indigo-50 font-medium text-indigo-700' : 'border-slate-200 text-slate-600'}`}>{l}</button>
            ))}
          </div>
          <Input label="Firma Adı (kısa ad) *" value={formData.name} onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setDups(null); }} />
          {crmReady && (() => { const tx = checkTaxNumber(formData.tax_number); return (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <div className="md:col-span-3"><Input label="Ticari unvan" value={formData.legal_name} placeholder="Faturada yazan tam unvan" onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })} /></div>
              <div>
                <Input label="VKN / TCKN" value={formData.tax_number} inputMode="numeric" onChange={(e) => { setFormData({ ...formData, tax_number: e.target.value }); setDups(null); }} />
                {tx && <p className={`mt-1 flex items-center gap-1 text-[11px] ${tx.ok ? 'text-green-700' : 'text-red-600'}`}>{tx.ok ? <><CheckCircle2 className="h-3 w-3" />Geçerli {tx.kind}</> : <><AlertTriangle className="h-3 w-3" />{tx.msg}</>}</p>}
              </div>
              <Input label="Vergi dairesi" value={formData.tax_office} onChange={(e) => setFormData({ ...formData, tax_office: e.target.value })} />
              <Select label="Segment" value={formData.segment} onChange={(e) => setFormData({ ...formData, segment: e.target.value })} options={[{ value: '', label: '-' }, ...SEGMENTS.map(x => ({ value: x, label: x }))]} />
              <CitySelect label="İl" value={formData.city} onChange={(v) => setFormData({ ...formData, city: v })} />
              <Input label="İlçe" value={formData.district} onChange={(e) => setFormData({ ...formData, district: e.target.value })} />
            </div>); })()}
          {dups && dups.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1 font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" />Bu firma zaten kayıtlı olabilir</p>
              {dups.slice(0, 5).map(d => <p key={d.id} className="text-amber-900"><Link href={`/customers/${d.id}`} className="font-medium underline">{d.name}</Link> — {d.reason}{d.strength === 'kesin' ? ' (kesin)' : ''}</p>)}
              <p className="mt-1 text-xs text-amber-800">Farklı bir firma ise "Kaydet"e tekrar basın.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Yetkili Kişi" value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} />
            <Input label="Unvan / Görev Tanımı" value={formData.contact_title} placeholder="Genel Müdür, İK Direktörü..." onChange={(e) => setFormData({ ...formData, contact_title: e.target.value })} />
            <Select label="Durum" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={[{ value: 'Potansiyel', label: 'Potansiyel' }, { value: 'Aktif', label: 'Aktif' }, { value: 'VIP', label: 'VIP' }]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="E-posta" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            <Input label="Telefon" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SectorSelect value={formData.sector} onChange={(v) => setFormData({ ...formData, sector: v })} />
            <Select label="Sorumlu (temsilci veya iş ortağı)" value={formData.assigned_to} onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...salesTeam.map((s: any) => ({ value: s.id, label: s.member_type === 'partner' ? `${s.name} (İş Ortağı)` : s.name }))]} />
          </div>
          {formData.customer_type === 'dealer' && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <h4 className="text-sm font-semibold text-amber-800">Bayi Kartı</h4>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Input label="Bayi Kodu" value={formData.dealer_code} onChange={(e) => setFormData({ ...formData, dealer_code: e.target.value })} />
                <div>
                  <label className="text-xs font-medium text-slate-600">Bayi Seviyesi</label>
                  <input list="dealer-levels" value={formData.dealer_level} onChange={(e) => setFormData({ ...formData, dealer_level: e.target.value })}
                    placeholder="Altın, Gümüş..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <datalist id="dealer-levels">{DEALER_LEVELS.map(l => <option key={l} value={l} />)}</datalist>
                </div>
                <Input label="Bölge" value={formData.region} onChange={(e) => setFormData({ ...formData, region: e.target.value })} placeholder="Ege, İç Anadolu..." />
                <Select label="Fiyat Listesi" value={formData.price_list_id} onChange={(e) => setFormData({ ...formData, price_list_id: e.target.value })}
                  options={[{ value: '', label: 'Ürün liste fiyatı' }, ...priceLists.map(pl => ({ value: pl.id, label: pl.name }))]} />
                <Select label="Standart Vade" value={String(formData.payment_term_days)} onChange={(e) => setFormData({ ...formData, payment_term_days: e.target.value === '' ? '' : Number(e.target.value) })}
                  options={[{ value: '', label: 'Belirtilmedi' }, ...PAYMENT_TERMS.map(t => ({ value: String(t.days), label: t.label }))]} />
                <Input label="Temel İskonto (%)" type="number" value={formData.base_discount} onChange={(e) => setFormData({ ...formData, base_discount: parseFloat(e.target.value) || 0 })} />
                <Input label="Kredi Limiti (₺, boş = limitsiz)" type="number" value={formData.credit_limit} onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value === '' ? '' : parseFloat(e.target.value) })} />
                <Input label="Bayilik Başlangıcı" type="date" value={formData.dealer_since} onChange={(e) => setFormData({ ...formData, dealer_since: e.target.value })} />
              </div>
              <p className="text-[11px] text-slate-500">Vadeye, ürüne veya seviyeye göre değişen iskontolar Bayi Yönetimi → İskonto Kuralları'ndan tanımlanır; temel iskonto, hiçbir kural uymadığında uygulanır.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
            <Select label="Kaynak İş Ortağı" value={formData.referral_partner_id}
              onChange={(e) => setFormData({ ...formData, referral_partner_id: e.target.value, assigned_to: formData.assigned_to || e.target.value })}
              options={[{ value: '', label: 'Yok (doğrudan)' }, ...salesTeam.filter((t: any) => t.member_type === 'partner').map((t: any) => ({ value: t.id, label: `${t.name} (%${Number(t.default_commission_rate || 0)})` }))]} />
            <Input label="Özel komisyon % (boşsa ortağın oranı)" type="number" value={formData.referral_commission_rate}
              disabled={!formData.referral_partner_id}
              onChange={(e) => setFormData({ ...formData, referral_commission_rate: e.target.value === '' ? '' : parseFloat(e.target.value) })} />
          </div>
          <Input label="Toplam Satış (₺)" type="number" value={formData.total_sales} onChange={(e) => setFormData({ ...formData, total_sales: Number(e.target.value) })} />
          {crmReady && <p className="text-xs text-slate-500">Kişiler, adresler, ticari koşullar, hesap ekibi ve kurulu baz kayıttan sonra <b>müşteri kartında</b> doldurulur.</p>}
        </div>
      </Modal>

      <Modal isOpen={dupOpen} onClose={() => setDupOpen(false)} size="lg" title="Mükerrer kayıt kontrolü">
        {(() => { const groups = duplicateGroups(customers); return groups.length === 0 ? <p className="text-sm text-slate-600">Mükerrer kayıt bulunamadı. 👍</p> : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Korunacak kaydı seçin; diğer kayıttaki teklif, sipariş, fatura, aktivite, kişi ve tüm geçmiş korunan karta taşınır ve boş alanlar tamamlanır.</p>
            {groups.map(g => (
              <div key={g.key} className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">{g.reason}</p>
                {g.items.map((it: any) => (
                  <div key={it.id} className="flex items-center gap-2 border-b py-1.5 text-sm last:border-0">
                    <Link href={`/customers/${it.id}`} className="flex-1 font-medium hover:underline">{it.name}</Link>
                    <span className="text-xs text-slate-400">{it.tax_number || ''} {it.city || ''}</span>
                    <Button size="sm" variant="secondary" disabled={!!merging} onClick={async () => {
                      const others = g.items.filter((x: any) => x.id !== it.id);
                      if (!confirm(`"${it.name}" korunacak; ${others.map((o: any) => `"${o.name}"`).join(', ')} bu karta birleştirilecek. Bu işlem geri alınamaz. Devam edilsin mi?`)) return;
                      setMerging(it.id);
                      for (const o of others) { const { error } = await supabase.rpc('merge_customers', { p_keep: it.id, p_remove: o.id }); if (error) { alert(error.message); break; } }
                      setMerging(null); fetchData();
                    }}>{merging === it.id ? 'Birleştiriliyor…' : 'Bunu koru'}</Button>
                  </div>
                ))}
              </div>
            ))}
          </div>); })()}
      </Modal>
    </div>
  );
}
