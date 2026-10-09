'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, EmptyState, Textarea } from '@/components/ui';
import { formatDate, cleanPayload } from '@/lib/utils';
import { UserPlus, Plus, Edit2, Trash2, RefreshCw, Search, Phone, Mail, Building2, ArrowRight, Star, TrendingUp, Target } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import BantChecklist, { Bant, EMPTY_BANT, bantSuggestedProbability } from '@/components/BantChecklist';

interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  contact_title?: string;
  contact_email: string;
  contact_phone: string;
  source: string;
  status: string;
  score: number;
  estimated_value: number;
  notes: string;
  assigned_to?: string;
  sales_person?: { name: string };
  created_at: string;
  last_contact?: string;
}

interface SalesPerson {
  id: string;
  name: string;
}

const sources = [
  { value: 'website', label: 'Web Sitesi' },
  { value: 'referral', label: 'Referans' },
  { value: 'social', label: 'Sosyal Medya' },
  { value: 'advertisement', label: 'Reklam' },
  { value: 'cold_call', label: 'Soğuk Arama' },
  { value: 'event', label: 'Etkinlik/Fuar' },
  { value: 'email', label: 'E-posta Kampanyası' },
  { value: 'other', label: 'Diğer' },
];

const statusStages = [
  { value: 'new', label: 'Yeni', color: 'bg-slate-500' },
  { value: 'contacted', label: 'İletişime Geçildi', color: 'bg-blue-500' },
  { value: 'qualified', label: 'Nitelikli', color: 'bg-violet-500' },
  { value: 'proposal', label: 'Teklif Aşaması', color: 'bg-amber-500' },
  { value: 'negotiation', label: 'Müzakere', color: 'bg-orange-500' },
  { value: 'converted', label: 'Müşteriye Dönüştü', color: 'bg-teal-500' },
  { value: 'won', label: 'Kazanıldı', color: 'bg-emerald-500' },
  { value: 'lost', label: 'Kaybedildi', color: 'bg-red-500' },
];

const statusConfig: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  new: { label: 'Yeni', variant: 'default' },
  contacted: { label: 'İletişime Geçildi', variant: 'info' },
  qualified: { label: 'Nitelikli', variant: 'info' },
  proposal: { label: 'Teklif', variant: 'warning' },
  negotiation: { label: 'Müzakere', variant: 'warning' },
  won: { label: 'Kazanıldı', variant: 'success' },
  lost: { label: 'Kaybedildi', variant: 'danger' },
  converted: { label: 'Müşteriye Dönüştü', variant: 'success' },
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const router = useRouter();
  const [convertWithOpp, setConvertWithOpp] = useState(true);
  const [existingCustomer, setExistingCustomer] = useState<{ id: string; name: string } | null>(null);
  const [oppForm, setOppForm] = useState({ title: '', value: 0, probability: 25, stage: 'Keşif', expected_close: '' });
  const [converting, setConverting] = useState(false);
  const [bant, setBant] = useState<Bant>(EMPTY_BANT);

  const openConvert = async (lead: Lead, withOpp: boolean) => {
    setSelectedLead(lead);
    setConvertWithOpp(withOpp);
    setBant(EMPTY_BANT);
    setOppForm({
      title: `${lead.company_name} — ${lead.notes ? lead.notes.slice(0, 60) : 'Danışmanlık Hizmeti'}`,
      value: Number(lead.estimated_value) || 0,
      probability: Math.min(Math.max(Number(lead.score) || 25, 5), 90),
      stage: 'Keşif',
      expected_close: '',
    });
    // Aynı adla müşteri zaten varsa onu kullan (mükerrer kayıt oluşmasın)
    const linked = (lead as any).customer_id;
    const { data } = linked
      ? await supabase.from('customers').select('id, name').eq('id', linked).limit(1)
      : await supabase.from('customers').select('id, name').ilike('name', lead.company_name.trim()).limit(1);
    setExistingCustomer(data && data.length ? data[0] : null);
    setConvertModalOpen(true);
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    contact_title: '',
    contact_email: '',
    contact_phone: '',
    source: 'website',
    status: 'new',
    score: 50,
    estimated_value: 0,
    notes: '',
    assigned_to: '',
    referral_partner_id: '', referral_commission_rate: '' as any,
  });

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [leadsRes, teamRes] = await Promise.all([
        supabase.from('leads').select('*').order('created_at', { ascending: false }),
        supabase.from('sales_team').select('id, name, member_type, default_commission_rate').order('name'),
      ]);

      if (leadsRes.error) {
        console.error('Lead listesi hatası:', leadsRes.error);
        alert('Lead listesi yüklenemedi: ' + leadsRes.error.message);
      }
      const team = teamRes.data || [];
      // Sorumlu adını ekip listesinden eşle (join'e gerek kalmaz)
      setLeads((leadsRes.data || []).map((l: any) => ({
        ...l,
        sales_person: team.find((t: any) => t.id === l.assigned_to) || null,
      })));
      setSalesTeam(team);
    } catch (err: any) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openModal = (lead?: Lead) => {
    if (lead) {
      setEditingLead(lead);
      setFormData({
        company_name: lead.company_name || '',
        contact_name: lead.contact_name || '',
        contact_title: lead.contact_title || '',
        contact_email: lead.contact_email || '',
        contact_phone: lead.contact_phone || '',
        source: lead.source || 'website',
        status: lead.status || 'new',
        score: lead.score || 50,
        estimated_value: lead.estimated_value || 0,
        notes: lead.notes || '',
        assigned_to: lead.assigned_to || '',
        referral_partner_id: (lead as any).referral_partner_id || '',
        referral_commission_rate: (lead as any).referral_commission_rate ?? '',
      });
    } else {
      setEditingLead(null);
      setFormData({
        company_name: '',
        contact_name: '',
        contact_title: '',
        contact_email: '',
        contact_phone: '',
        source: 'website',
        status: 'new',
        score: 50,
        estimated_value: 0,
        notes: '',
        assigned_to: '',
        referral_partner_id: '', referral_commission_rate: '' as any,
      });
    }
    setSaveError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaveError(null);
    if (!formData.company_name) {
      setSaveError('Firma adı zorunludur');
      return;
    }

    setSaving(true);
    try {
      const payload = cleanPayload({
        ...formData,
        score: Number.isFinite(formData.score) ? formData.score : 50,
        estimated_value: Number.isFinite(formData.estimated_value) ? formData.estimated_value : 0,
      });
      console.log('Lead kaydediliyor:', payload);
      const { error } = editingLead
        ? await supabase.from('leads').update(payload).eq('id', editingLead.id)
        : await supabase.from('leads').insert([payload]);
      if (error) {
        console.error('Lead kayıt hatası:', error);
        setSaveError(`${error.message}${error.details ? ' — ' + error.details : ''}${error.hint ? ' (' + error.hint + ')' : ''}`);
        return;
      }
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Lead kayıt istisnası:', err);
      setSaveError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu lead\'i silmek istediğinize emin misiniz?')) return;
    try {
      await supabase.from('leads').delete().eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      { const { error: dbErr } = await supabase.from('leads').update(cleanPayload({ status, last_contact: new Date().toISOString() })).eq('id', id); if (dbErr) throw dbErr; }
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const convertToCustomer = async () => {
    if (!selectedLead) return;
    if (convertWithOpp && !oppForm.title.trim()) { alert('Fırsat başlığı zorunludur'); return; }
    setConverting(true);
    try {
      const lead: any = selectedLead;
      let customerId = existingCustomer?.id || null;

      // 1. Müşteri (yoksa oluştur)
      if (!customerId) {
        const { data: cust, error } = await supabase.from('customers').insert([cleanPayload({
          name: lead.company_name,
          contact_person: lead.contact_name,
          contact_title: lead.contact_title,
          email: lead.contact_email,
          phone: lead.contact_phone,
          assigned_to: lead.assigned_to || null,
          source: lead.source,
          status: 'Aktif',
          notes: lead.notes,
          referral_partner_id: lead.referral_partner_id || null,
          referral_commission_rate: lead.referral_commission_rate ?? null,
        })]).select('id').single();
        if (error) throw error;
        customerId = cust.id;
      }

      // 2. Fırsat (istenirse)
      if (convertWithOpp) {
        const { error } = await supabase.from('opportunities').insert([cleanPayload({
          title: oppForm.title.trim(),
          customer_id: customerId,
          assigned_to: lead.assigned_to || null,
          value: Number(oppForm.value) || 0,
          probability: Number(oppForm.probability) || 0,
          stage: oppForm.stage,
          expected_close: oppForm.expected_close || null,
          notes: lead.notes,
          referral_partner_id: lead.referral_partner_id || null,
          referral_commission_rate: lead.referral_commission_rate ?? null,
          lead_id: lead.id,
          qualification: bant,
        })]);
        if (error) throw error;
      }

      // 3. Lead'i kapat ve müşteriye bağla
      { const { error } = await supabase.from('leads').update({ status: 'converted', customer_id: customerId }).eq('id', lead.id); if (error) throw error; }

      setConvertModalOpen(false);
      setSelectedLead(null);
      fetchData();
      if (convertWithOpp) {
        if (confirm('Müşteri ve fırsat oluşturuldu.\n\nFırsatlar sayfasına gitmek ister misiniz?')) router.push('/opportunities');
      } else {
        alert(existingCustomer ? 'Lead mevcut müşteriye bağlandı.' : 'Lead müşteriye dönüştürüldü.');
      }
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setConverting(false);
    }
  };

  // Filtreleme
  const filteredLeads = leads.filter(l => {
    const q = searchTerm.trim().toLowerCase();
    const matchSearch = !q ||
      (l.company_name || '').toLowerCase().includes(q) ||
      (l.contact_name || '').toLowerCase().includes(q);
    const matchStatus = !filterStatus || l.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // İstatistikler
  const totalLeads = leads.length;
  const newLeads = leads.filter(l => l.status === 'new').length;
  const qualifiedLeads = leads.filter(l => ['qualified', 'proposal', 'negotiation'].includes(l.status)).length;
  const wonLeads = leads.filter(l => ['won', 'converted'].includes(l.status)).length;
  const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

  // Score rengi
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 bg-emerald-100';
    if (score >= 60) return 'text-amber-600 bg-amber-100';
    if (score >= 40) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  if (loading) {
    return (
      <div>
        <Header title="Potansiyel Müşteriler (Leads)" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Potansiyel Müşteriler (Leads)" />
      
      <div className="p-6">
        {/* İstatistik Kartları */}
        <div className="mb-6 grid gap-4 md:grid-cols-5">
          <Card className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <UserPlus className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalLeads}</p>
                <p className="text-xs text-slate-500">Toplam Lead</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-slate-50 to-gray-50 border-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-200 rounded-lg">
                <Star className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{newLeads}</p>
                <p className="text-xs text-slate-500">Yeni</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{qualifiedLeads}</p>
                <p className="text-xs text-slate-500">Nitelikli</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Building2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{wonLeads}</p>
                <p className="text-xs text-slate-500">Kazanılan</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">%{conversionRate}</p>
                <p className="text-xs text-slate-500">Dönüşüm</p>
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
                placeholder="Lead ara..."
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
              {statusStages.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => openModal()}>
              <Plus className="h-4 w-4" /> Yeni Lead
            </Button>
          </div>
        </div>

        {/* Lead Tablosu */}
        {filteredLeads.length > 0 ? (
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium">Firma</th>
                      <th className="px-4 py-3 text-left font-medium">İletişim</th>
                      <th className="px-4 py-3 text-center font-medium">Kaynak</th>
                      <th className="px-4 py-3 text-center font-medium">Puan</th>
                      <th className="px-4 py-3 text-center font-medium">Durum</th>
                      <th className="px-4 py-3 text-center font-medium">Atanan</th>
                      <th className="px-4 py-3 text-right font-medium">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{lead.company_name}</p>
                          <p className="text-xs text-slate-500">{formatDate(lead.created_at)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-900">{lead.contact_name || '-'}</p>
                          {lead.contact_title && <p className="text-xs text-slate-400">{lead.contact_title}</p>}
                          <div className="flex items-center gap-3 mt-1">
                            {lead.contact_email && (
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {lead.contact_email}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="default">
                            {sources.find(s => s.value === lead.source)?.label || lead.source}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(lead.score)}`}>
                            {lead.score}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={statusConfig[lead.status]?.variant || 'default'}>
                            {statusConfig[lead.status]?.label || lead.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">
                          {lead.sales_person?.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {!['won', 'lost', 'converted'].includes(lead.status) && (<>
                              <Button variant="ghost" size="sm" onClick={() => openConvert(lead, true)} title="Fırsata dönüştür (müşteri + fırsat)">
                                <Target className="h-4 w-4 text-indigo-600" /><span className="text-xs">Fırsat</span>
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openConvert(lead, false)} title="Sadece müşteriye dönüştür">
                                <ArrowRight className="h-4 w-4 text-emerald-500" />
                              </Button>
                            </>)}
                            <Button variant="ghost" size="sm" onClick={() => openModal(lead)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(lead.id)}>
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
            icon={<UserPlus className="h-16 w-16" />}
            title="Lead bulunamadı"
            description="Potansiyel müşterilerinizi takip edin"
            action={<Button onClick={() => openModal()}><Plus className="h-4 w-4" /> Lead Ekle</Button>}
          />
        )}
      </div>

      {/* Lead Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingLead ? 'Lead Düzenle' : 'Yeni Lead'}
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
          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <strong>Kaydedilemedi:</strong> {saveError}
            </div>
          )}
          <Input
            label="Firma Adı *"
            value={formData.company_name}
            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
            placeholder="ABC Teknoloji Ltd."
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="İletişim Kişisi"
              value={formData.contact_name}
              onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
              placeholder="Ahmet Yılmaz"
            />
            <Input
              label="Unvan / Görev Tanımı"
              value={formData.contact_title}
              onChange={(e) => setFormData({ ...formData, contact_title: e.target.value })}
              placeholder="Genel Müdür, Satın Alma Müdürü..."
            />
            <Input
              label="E-posta"
              type="email"
              value={formData.contact_email}
              onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
              placeholder="ahmet@abc.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Telefon"
              value={formData.contact_phone}
              onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
              placeholder="0532 111 2233"
            />
            <Select
              label="Kaynak"
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              options={sources}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Durum"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={statusStages.map(s => ({ value: s.value, label: s.label }))}
            />
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Lead Puanı (0-100)</label>
              <input
                type="range"
                min="0"
                max="100"
                value={formData.score}
                onChange={(e) => setFormData({ ...formData, score: parseInt(e.target.value) })}
                className="w-full"
              />
              <p className="text-center text-sm font-medium">{formData.score}</p>
            </div>
            <Input
              label="Tahmini Değer (₺)"
              type="number"
              value={formData.estimated_value}
              onChange={(e) => setFormData({ ...formData, estimated_value: parseFloat(e.target.value) || 0 })}
            />
          </div>

          <Select
            label="Sorumlu (temsilci veya iş ortağı)"
            value={formData.assigned_to}
            onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
            options={[
              { value: '', label: 'Seçiniz' },
              ...salesTeam.map((s: any) => ({ value: s.id, label: s.member_type === 'partner' ? `${s.name} (İş Ortağı)` : s.name }))
            ]}
          />

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
            <Select label="Kaynak İş Ortağı" value={formData.referral_partner_id}
              onChange={(e) => setFormData({ ...formData, referral_partner_id: e.target.value, assigned_to: formData.assigned_to || e.target.value })}
              options={[{ value: '', label: 'Yok (doğrudan)' }, ...salesTeam.filter((t: any) => t.member_type === 'partner').map((t: any) => ({ value: t.id, label: `${t.name} (%${Number(t.default_commission_rate || 0)})` }))]} />
            <Input label="Özel komisyon % (boşsa ortağın oranı)" type="number" value={formData.referral_commission_rate}
              disabled={!formData.referral_partner_id}
              onChange={(e) => setFormData({ ...formData, referral_commission_rate: e.target.value === '' ? '' : parseFloat(e.target.value) })} />
          </div>
          <Textarea
            label="Notlar"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
          />
        </div>
      </Modal>

      {/* Dönüştür Modal */}
      <Modal
        isOpen={convertModalOpen}
        onClose={() => setConvertModalOpen(false)}
        title={convertWithOpp ? 'Fırsata Dönüştür' : 'Müşteriye Dönüştür'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConvertModalOpen(false)}>İptal</Button>
            <Button onClick={convertToCustomer} disabled={converting}>{converting ? 'İşleniyor...' : convertWithOpp ? 'Müşteri ve Fırsat Oluştur' : 'Dönüştür'}</Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium">{selectedLead?.company_name}</p>
            <p className="text-slate-500">
              {selectedLead?.contact_name}{selectedLead?.contact_title ? ` · ${selectedLead.contact_title}` : ''}
              {selectedLead?.contact_email ? ` · ${selectedLead.contact_email}` : ''}{selectedLead?.contact_phone ? ` · ${selectedLead.contact_phone}` : ''}
            </p>
          </div>

          <div className={`rounded-lg border p-3 ${existingCustomer ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {existingCustomer
              ? <>Bu adla kayıtlı müşteri var: <strong>{existingCustomer.name}</strong>. Yeni müşteri açılmayacak, lead bu müşteriye bağlanacak.</>
              : <>Yeni müşteri kaydı oluşturulacak (iletişim kişisi, unvan, kaynak ve iş ortağı bilgileriyle).</>}
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={convertWithOpp} onChange={(e) => setConvertWithOpp(e.target.checked)} />
            <span className="font-medium">Fırsat da oluştur</span>
          </label>

          {convertWithOpp && (
            <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
              <Input label="Fırsat başlığı *" value={oppForm.title} onChange={(e) => setOppForm({ ...oppForm, title: e.target.value })} />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Input label="Değer (₺, KDV hariç)" type="number" value={oppForm.value} onChange={(e) => setOppForm({ ...oppForm, value: parseFloat(e.target.value) || 0 })} />
                <Input label="Olasılık (%)" type="number" value={oppForm.probability} onChange={(e) => setOppForm({ ...oppForm, probability: parseFloat(e.target.value) || 0 })} />
                <Select label="Aşama" value={oppForm.stage} onChange={(e) => setOppForm({ ...oppForm, stage: e.target.value })}
                  options={['Keşif', 'Teklif', 'Müzakere', 'Kapanış'].map(v => ({ value: v, label: v }))} />
                <Input label="Tahmini kapanış" type="date" value={oppForm.expected_close} onChange={(e) => setOppForm({ ...oppForm, expected_close: e.target.value })} />
              </div>
              <BantChecklist value={bant} onChange={(b) => { setBant(b); setOppForm(f => ({ ...f, probability: bantSuggestedProbability(b) })); }} />
            </div>
          )}

          <p className="text-xs text-slate-500">
            Lead "Müşteriye Dönüştü" olarak kapanır ve müşteriye bağlanır; sorumlu ve kaynak iş ortağı bilgileri aktarılır.
          </p>
        </div>
      </Modal>
    </div>
  );
}
