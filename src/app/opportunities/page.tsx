'use client';

import Header from '@/components/Header';
import SalesFilter from '@/components/SalesFilter';
import { Card, CardBody, Button, Badge, Modal, Input, Select, Textarea, EmptyState } from '@/components/ui';
import { formatMoney, cleanPayload } from '@/lib/utils';
import { TrendingUp, Plus, Edit2, Trash2, RefreshCw, Building2, Calendar, User, FileText, ShoppingCart, Trophy } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { createOrderFromOpportunity, WON_STAGES, LOST_STAGES } from '@/lib/sales-flow';
import BantChecklist, { BantBadge, EMPTY_BANT, normalizeBant, bantSuggestedProbability } from '@/components/BantChecklist';

const STAGES = ['Keşif', 'Teklif', 'Müzakere', 'Kapanış', 'Kazanıldı', 'Kaybedildi'];

interface Opportunity {
  id: string;
  title: string;
  customer_id: string | null;
  assigned_to: string | null;
  value: number;
  probability: number;
  stage: string;
  expected_close: string;
  notes: string;
  closed_at?: string | null;
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

export default function OpportunitiesPage() {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterStage, setFilterStage] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterPerson, setFilterPerson] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);
  const [formData, setFormData] = useState({
    title: '', customer_id: '', assigned_to: '', value: 0, probability: 50,
    stage: 'Keşif', expected_close: '', notes: '', qualification: EMPTY_BANT as any,
    referral_partner_id: '', referral_commission_rate: '' as any,
  });

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [oppRes, custRes, teamRes] = await Promise.all([
        supabase.from('opportunities').select('*').order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('sales_team').select('id, name, region, member_type, default_commission_rate').order('name'),
      ]);
      if (oppRes.error) alert('Fırsatlar yüklenemedi: ' + oppRes.error.message);
      const custs = custRes.data || [];
      const team = teamRes.data || [];
      setOpportunities((oppRes.data || []).map((o: any) => ({
        ...o,
        customer: custs.find((c: any) => c.id === o.customer_id) || null,
        sales_team: team.find((t: any) => t.id === o.assigned_to) || null,
      })));
      setCustomers(custs);
      setSalesTeam(team);
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

  const openModal = (opp?: Opportunity) => {
    if (opp) {
      setEditingOpp(opp);
      setFormData({
        title: opp.title, customer_id: opp.customer_id || '', assigned_to: opp.assigned_to || '',
        value: opp.value || 0, probability: opp.probability || 50, stage: opp.stage || 'Keşif',
        expected_close: opp.expected_close || '', notes: opp.notes || '',
        referral_partner_id: (opp as any).referral_partner_id || '', referral_commission_rate: (opp as any).referral_commission_rate ?? '',
        qualification: normalizeBant((opp as any).qualification),
      });
    } else {
      setEditingOpp(null);
      setFormData({ title: '', customer_id: '', assigned_to: '', value: 0, probability: 50, stage: 'Keşif', expected_close: '', notes: '', referral_partner_id: '', referral_commission_rate: '' as any, qualification: EMPTY_BANT as any });
    }
    setModalOpen(true);
  };

  const offerOrder = async (opp: any) => {
    if (!confirm(`"${opp.title}" kazanıldı 🎉\n\nBu fırsat için sipariş oluşturulsun mu?\n(Bağlı bir teklif varsa kalemleri tekliften aktarılır.)`)) return;
    try {
      const res = await createOrderFromOpportunity(supabase, opp);
      const msg = res.created
        ? `${res.order.order_number} numaralı sipariş oluşturuldu${res.fromQuote ? ' (tekliften aktarıldı)' : ''}.`
        : `Bu fırsat için zaten ${res.order.order_number} numaralı sipariş var.`;
      if (confirm(msg + '\n\nSiparişler sayfasına gitmek ister misiniz?')) router.push('/orders');
    } catch (err: any) {
      alert('Sipariş oluşturulamadı: ' + err.message);
    }
  };

  const handleSave = async () => {
    if (!formData.title) { alert('Başlık zorunludur'); return; }
    setSaving(true);
    try {
      const isWon = WON_STAGES.includes(formData.stage);
      const isLost = LOST_STAGES.includes(formData.stage);
      const wasClosed = editingOpp && [...WON_STAGES, ...LOST_STAGES].includes(editingOpp.stage);
      const dataToSave: any = {
        ...formData,
        customer_id: formData.customer_id || null,
        assigned_to: formData.assigned_to || null,
      };
      if (isWon) dataToSave.probability = 100;
      if (isLost) dataToSave.probability = 0;
      if ((isWon || isLost) && !wasClosed) dataToSave.closed_at = new Date().toISOString();
      if (!isWon && !isLost) dataToSave.closed_at = null;

      let saved: any;
      if (editingOpp) {
        const { data, error } = await supabase.from('opportunities').update(cleanPayload(dataToSave)).eq('id', editingOpp.id).select().single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase.from('opportunities').insert(cleanPayload([dataToSave])).select().single();
        if (error) throw error;
        saved = data;
      }
      setModalOpen(false);
      await fetchData();
      const justWon = isWon && !(editingOpp && WON_STAGES.includes(editingOpp.stage));
      if (justWon && saved) await offerOrder(saved);
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return;
    await supabase.from('opportunities').delete().eq('id', id);
    fetchData();
  };

  // Filtreleme
  const filtered = opportunities.filter(o => {
    const matchStage = !filterStage || o.stage === filterStage;
    const matchPerson = !filterPerson || o.assigned_to === filterPerson;
    const matchRegion = !filterRegion || (o.sales_team?.region === filterRegion);
    return matchStage && matchPerson && matchRegion;
  });

  const openOpps = filtered.filter(o => ![...WON_STAGES, ...LOST_STAGES].includes(o.stage));
  const wonOpps = filtered.filter(o => WON_STAGES.includes(o.stage));
  const totalValue = openOpps.reduce((s, o) => s + Number(o.value || 0), 0);
  const weightedValue = openOpps.reduce((s, o) => s + (Number(o.value || 0) * (o.probability || 0) / 100), 0);
  const wonValue = wonOpps.reduce((s, o) => s + Number(o.value || 0), 0);

  const stageColors: Record<string, string> = {
    'Keşif': 'bg-blue-100 text-blue-700',
    'Teklif': 'bg-yellow-100 text-yellow-700',
    'Müzakere': 'bg-orange-100 text-orange-700',
    'Kapanış': 'bg-purple-100 text-purple-700',
    'Kazanıldı': 'bg-green-100 text-green-700',
    'Kaybedildi': 'bg-red-100 text-red-700',
  };

  const getAssignedName = (id: string | null) => {
    if (!id) return '-';
    const person = salesTeam.find(s => s.id === id);
    return person?.name || '-';
  };

  if (loading) {
    return <div><Header title="Fırsatlar & Teklifler" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;
  }

  return (
    <div>
      <Header title="Fırsatlar & Teklifler" />
      <div className="p-6">
        {/* Bölge ve Kişi Filtresi */}
        <SalesFilter onFilterChange={handleFilterChange} />

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="">Tüm Aşamalar</option>
            {STAGES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
            <Button onClick={() => openModal()}><Plus className="h-4 w-4" />Yeni Fırsat</Button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4"><p className="text-2xl font-bold">{openOpps.length}</p><p className="text-xs text-slate-500">Açık Fırsat</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-blue-600">₺{formatMoney(totalValue)}</p><p className="text-xs text-slate-500">Açık Pipeline Değeri</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-indigo-600">₺{formatMoney(weightedValue)}</p><p className="text-xs text-slate-500">Ağırlıklı Değer</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-green-600">₺{formatMoney(wonValue)}</p><p className="text-xs text-slate-500">Kazanılan ({wonOpps.length})</p></Card>
        </div>

        {filtered.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((o) => (
              <Card key={o.id}>
                <CardBody>
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{o.title}</h3>
                      {o.customer && <p className="text-xs text-slate-500 flex items-center gap-1"><Building2 className="h-3 w-3" />{o.customer.name}</p>}
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1 ${stageColors[o.stage] || 'bg-gray-100 text-gray-700'}`}>{WON_STAGES.includes(o.stage) && <Trophy className="h-3 w-3" />}{o.stage}</span>
                    </div>
                    <div className="-mt-2 mb-2 flex justify-end"><BantBadge value={(o as any).qualification} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Değer:</span>
                      <span className="font-bold text-blue-600">₺{formatMoney(o.value || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Olasılık:</span>
                      <span className="font-medium">{o.probability}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${o.probability}%` }}></div>
                    </div>
                    {o.expected_close && (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Calendar className="h-3 w-3" />
                        {new Date(o.expected_close).toLocaleDateString('tr-TR')}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <User className="h-3 w-3" />
                      {getAssignedName(o.assigned_to)}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1 border-t pt-3">
                    {!WON_STAGES.includes(o.stage) && !LOST_STAGES.includes(o.stage) && (
                      <Button variant="ghost" size="sm" onClick={() => router.push(`/quotes?opportunity=${o.id}`)} title="Bu fırsat için teklif hazırla">
                        <FileText className="h-4 w-4 text-indigo-600" /><span className="text-xs">Teklif</span>
                      </Button>
                    )}
                    {WON_STAGES.includes(o.stage) && (
                      <Button variant="ghost" size="sm" onClick={() => offerOrder(o)} title="Sipariş oluştur / göster">
                        <ShoppingCart className="h-4 w-4 text-green-600" /><span className="text-xs">Sipariş</span>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openModal(o)}><Edit2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(o.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon={<TrendingUp className="h-16 w-16" />} title="Fırsat bulunamadı" description="Seçilen filtrelere uygun fırsat yok" action={<Button onClick={() => openModal()}><Plus className="h-4 w-4" />Ekle</Button>} />
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingOpp ? 'Düzenle' : 'Yeni Fırsat'}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button><Button onClick={handleSave} disabled={saving}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button></>}>
        <div className="space-y-4">
          <Input label="Başlık *" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Müşteri" value={formData.customer_id} onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
            <Select label="Sorumlu (temsilci veya iş ortağı)" value={formData.assigned_to} onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...salesTeam.map((s: any) => ({ value: s.id, label: s.member_type === 'partner' ? `${s.name} (İş Ortağı)` : s.name }))]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Değer (₺)" type="number" value={formData.value} onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })} />
            <Input label="Olasılık (%)" type="number" value={formData.probability} onChange={(e) => setFormData({ ...formData, probability: Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Aşama" value={formData.stage} onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
              options={STAGES.map(st => ({ value: st, label: st === 'Kazanıldı' ? 'Kazanıldı ✓' : st === 'Kaybedildi' ? 'Kaybedildi ✗' : st }))} />
            <Input label="Tahmini Kapanış" type="date" value={formData.expected_close} onChange={(e) => setFormData({ ...formData, expected_close: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
            <Select label="Kaynak İş Ortağı" value={formData.referral_partner_id}
              onChange={(e) => setFormData({ ...formData, referral_partner_id: e.target.value, assigned_to: formData.assigned_to || e.target.value })}
              options={[{ value: '', label: 'Yok (doğrudan)' }, ...salesTeam.filter((t: any) => t.member_type === 'partner').map((t: any) => ({ value: t.id, label: `${t.name} (%${Number(t.default_commission_rate || 0)})` }))]} />
            <Input label="Özel komisyon % (boşsa ortağın oranı)" type="number" value={formData.referral_commission_rate}
              disabled={!formData.referral_partner_id}
              onChange={(e) => setFormData({ ...formData, referral_commission_rate: e.target.value === '' ? '' : parseFloat(e.target.value) })} />
          </div>
          {formData.referral_partner_id && (() => {
            const pt: any = salesTeam.find((t: any) => t.id === formData.referral_partner_id);
            const r = formData.referral_commission_rate === '' || formData.referral_commission_rate == null ? Number(pt?.default_commission_rate || 0) : Number(formData.referral_commission_rate);
            const gross = Number(formData.value || 0) * r / 100;
            return (
              <p className="-mt-2 text-xs text-indigo-700">
                Kazanılır ve tamamı tahsil edilirse ortağa brüt ≈ ₺{formatMoney(gross)} (%{r}) komisyon doğar. Net ve maliyet için: Ortak Komisyonları → Simülasyon.
              </p>
            );
          })()}
          <BantChecklist value={normalizeBant(formData.qualification)} onChange={(b) => setFormData({ ...formData, qualification: b })} />
          {!WON_STAGES.includes(formData.stage) && !LOST_STAGES.includes(formData.stage) && Number(formData.probability) !== bantSuggestedProbability(normalizeBant(formData.qualification)) && (
            <button type="button" className="-mt-2 text-xs text-indigo-600 hover:underline"
              onClick={() => setFormData({ ...formData, probability: bantSuggestedProbability(normalizeBant(formData.qualification)) })}>
              Olasılığı BANT önerisine (%{bantSuggestedProbability(normalizeBant(formData.qualification))}) ayarla
            </button>
          )}
          <Textarea label="Notlar" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
