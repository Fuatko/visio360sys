'use client';

import Header from '@/components/Header';
import SalesFilter from '@/components/SalesFilter';
import { Card, CardBody, Button, Badge, Modal, Input, Select, EmptyState } from '@/components/ui';
import { formatMoney, cleanPayload } from '@/lib/utils';
import { Target, Plus, Edit2, Trash2, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { withParasutOrders, withParasutCollections } from '@/lib/parasut-facts';
import { orderNetAmount } from '@/lib/sales-flow';
import { CalendarRange } from 'lucide-react';

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
  // Gerçekleşenler otomatik: siparişler + Paraşüt faturaları (KDV hariç), tahsilatlar (KDV hariç karşılığı)
  const [actual, setActual] = useState<Map<string, { sales: number; coll: number }>>(new Map());
  const [yearOpen, setYearOpen] = useState(false);
  const [yr, setYr] = useState({ sales_person_id: '', year: String(new Date().getFullYear()), sales: 0, coll: 0, mode: 'equal' as 'equal' | 'season', months: [] as { p: string; s: number; c: number }[] });
  const [viewYear, setViewYear] = useState(String(new Date().getFullYear()));

  const fetchData = async () => {
    setLoading(true);
    try {
      const [targetRes, teamRes] = await Promise.all([
        supabase.from('sales_targets').select('id, sales_person_id, period, sales_target, collection_target, achieved_sales, achieved_collection').order('period', { ascending: false }),
        supabase.from('sales_team').select('id, name, region').order('name'),
      ]);
      if (targetRes.error) alert('Hedefler yüklenemedi: ' + targetRes.error.message);
      const team = teamRes.data || [];
      setTargets((targetRes.data || []).map((t: any) => ({ ...t, sales_team: team.find((m: any) => m.id === t.sales_person_id) || null })));
      setSalesTeam(team);
      try {
        const [o, c] = await Promise.all([supabase.from('orders').select('*'), supabase.from('collections').select('*')]);
        const ords = (await withParasutOrders(supabase, o.data || [])).filter((x: any) => !['cancelled', 'İptal', 'draft', 'Taslak'].includes(x.status));
        const cols = await withParasutCollections(supabase, c.data || []);
        const m = new Map<string, { sales: number; coll: number }>();
        const add = (k: string, f: 'sales' | 'coll', v: number) => { const x = m.get(k) || { sales: 0, coll: 0 }; x[f] += v; m.set(k, x); };
        ords.forEach((x: any) => { const per = String(x.order_date || x.created_at || '').slice(0, 7); if (!per) return; const v = orderNetAmount(x); add(`${x.sales_person_id || ''}|${per}`, 'sales', v); add(`*|${per}`, 'sales', v); });
        cols.filter((x: any) => ['Ödendi', 'paid'].includes(x.status)).forEach((x: any) => { const per = String(x.payment_date || x.due_date || '').slice(0, 7); if (!per) return; const v = x.amount_net != null ? Number(x.amount_net) : Number(x.amount || 0) / 1.2; add(`${x.sales_person_id || ''}|${per}`, 'coll', v); add(`*|${per}`, 'coll', v); });
        setActual(m);
      } catch { /* gerçekleşen hesaplanamadı: elle girilen değer kullanılır */ }
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
        { const { error: dbErr } = await supabase.from('sales_targets').update(cleanPayload(formData)).eq('id', editingTarget.id); if (dbErr) throw dbErr; }
      } else {
        {
          // Eski kurulumlarda zorunlu olan target_month / rep_id alanlarını dönemden doldur
          const legacy: any = { ...formData, target_month: `${formData.period}-01`, rep_id: formData.sales_person_id };
          let { error: dbErr } = await supabase.from('sales_targets').insert(cleanPayload([legacy]));
          if (dbErr && /column|schema cache|invalid input|type/i.test(dbErr.message)) ({ error: dbErr } = await supabase.from('sales_targets').insert(cleanPayload([formData])));
          if (dbErr) throw dbErr;
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
    await supabase.from('sales_targets').delete().eq('id', id);
    fetchData();
  };

  const achS = (t: TargetData) => actual.get(`${t.sales_person_id || ''}|${t.period}`)?.sales ?? t.achieved_sales ?? 0;
  const achC = (t: TargetData) => actual.get(`${t.sales_person_id || ''}|${t.period}`)?.coll ?? t.achieved_collection ?? 0;

  // Yıllık hedef → 12 aya dağıt (eşit veya geçen yılın aylık satış dağılımına göre)
  const distribute = (y = yr) => {
    const prev = String(Number(y.year) - 1);
    const w = Array.from({ length: 12 }, (_, i) => { const k = `${prev}-${String(i + 1).padStart(2, '0')}`; return Math.max(0, (actual.get(`${y.sales_person_id}|${k}`)?.sales ?? actual.get(`*|${k}`)?.sales) || 0); });
    const tot = w.reduce((a, b) => a + b, 0);
    const share = (i: number) => (y.mode === 'season' && tot > 0 ? w[i] / tot : 1 / 12);
    const r = (v: number) => Math.round(v / 100) * 100;
    const months = Array.from({ length: 12 }, (_, i) => ({ p: `${y.year}-${String(i + 1).padStart(2, '0')}`, s: r(y.sales * share(i)), c: r(y.coll * share(i)) }));
    // yuvarlama farkını Aralık'a ekle
    months[11].s += y.sales - months.reduce((a, m) => a + m.s, 0); months[11].c += y.coll - months.reduce((a, m) => a + m.c, 0);
    return months;
  };
  const openYear = () => { const y = { ...yr, sales_person_id: yr.sales_person_id || salesTeam[0]?.id || '' }; setYr({ ...y, months: distribute(y) }); setYearOpen(true); };
  const saveYear = async () => {
    if (!yr.sales_person_id) { alert('Satışçı seçin'); return; }
    setSaving(true);
    try {
      for (const m of yr.months) {
        const ex = targets.find(t => t.sales_person_id === yr.sales_person_id && t.period === m.p);
        if (ex) { const { error } = await supabase.from('sales_targets').update({ sales_target: m.s, collection_target: m.c }).eq('id', ex.id); if (error) throw error; }
        else {
          const row: any = { sales_person_id: yr.sales_person_id, period: m.p, sales_target: m.s, collection_target: m.c, achieved_sales: 0, achieved_collection: 0, target_month: `${m.p}-01`, rep_id: yr.sales_person_id };
          let { error } = await supabase.from('sales_targets').insert([row]);
          if (error && /column|schema cache|invalid input|type/i.test(error.message)) { delete row.target_month; delete row.rep_id; ({ error } = await supabase.from('sales_targets').insert([row])); }
          if (error) throw error;
        }
      }
      setYearOpen(false); fetchData();
    } catch (e: any) { alert('Hata: ' + e.message); } finally { setSaving(false); }
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
  const totalSalesAchieved = filtered.reduce((s, t) => s + achS(t), 0);
  const totalCollTarget = filtered.reduce((s, t) => s + (t.collection_target || 0), 0);
  const totalCollAchieved = filtered.reduce((s, t) => s + achC(t), 0);

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
            <Button variant="secondary" onClick={openYear}><CalendarRange className="h-4 w-4" />Yıllık hedef</Button>
            <Button onClick={() => openModal()}><Plus className="h-4 w-4" />Aylık hedef</Button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-slate-500 mb-1">Satış Hedefi</p>
            <p className="text-2xl font-bold">₺{formatMoney(totalSalesTarget)}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-sm text-green-600">₺{formatMoney(Math.round(totalSalesAchieved))}</span>
              <span className="text-xs text-slate-400">({calculatePercent(totalSalesAchieved, totalSalesTarget)}%)</span>
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 mb-1">Tahsilat Hedefi</p>
            <p className="text-2xl font-bold">₺{formatMoney(totalCollTarget)}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-sm text-green-600">₺{formatMoney(Math.round(totalCollAchieved))}</span>
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

        {(() => {
          const ys = Array.from(new Set(targets.map(t => String(t.period).slice(0, 4)))).sort().reverse();
          const yt = targets.filter(t => String(t.period).startsWith(viewYear) && (!filterPerson || t.sales_person_id === filterPerson));
          if (!yt.length) return null;
          const people = Array.from(new Set(yt.map(t => t.sales_person_id || '')));
          const nowP = new Date().toISOString().slice(0, 7);
          const row = (pid: string) => {
            const ts = yt.filter(t => (t.sales_person_id || '') === pid);
            const st = ts.reduce((a, t) => a + (t.sales_target || 0), 0), ct = ts.reduce((a, t) => a + (t.collection_target || 0), 0);
            const sa = ts.reduce((a, t) => a + achS(t), 0), ca = ts.reduce((a, t) => a + achC(t), 0);
            const ytdT = ts.filter(t => t.period <= nowP).reduce((a, t) => a + (t.sales_target || 0), 0);
            return { pid, st, ct, sa, ca, ytdT };
          };
          const rows = people.map(row);
          return (
            <Card className="mb-6 overflow-x-auto p-0">
              <div className="flex items-center gap-2 border-b px-4 py-2">
                <CalendarRange className="h-4 w-4 text-indigo-600" /><p className="text-sm font-semibold">Yıllık görünüm</p>
                <select value={viewYear} onChange={e => setViewYear(e.target.value)} className="ml-auto h-8 rounded border px-2 text-xs">{(ys.includes(viewYear) ? ys : [viewYear, ...ys]).map(y => <option key={y} value={y}>{y}</option>)}</select>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-slate-50 text-xs text-slate-500"><th className="px-4 py-2 text-left">Satışçı</th><th className="px-3 text-right">Yıllık satış hedefi</th><th className="px-3 text-right">Bugüne kadarki hedef</th><th className="px-3 text-right">Gerçekleşen</th><th className="px-3 text-center">Yıl %</th><th className="px-3 text-center">Bugüne %</th><th className="px-3 text-right">Yıllık tahsilat hedefi</th><th className="px-3 text-right">Tahsil edilen</th><th className="px-3 text-center">%</th></tr></thead>
                <tbody>{rows.map(r => (
                  <tr key={r.pid} className="border-b">
                    <td className="px-4 py-2 font-medium">{getAssignedName(r.pid)}</td>
                    <td className="px-3 text-right">₺{formatMoney(Math.round(r.st))}</td>
                    <td className="px-3 text-right text-slate-500">₺{formatMoney(Math.round(r.ytdT))}</td>
                    <td className="px-3 text-right text-green-700">₺{formatMoney(Math.round(r.sa))}</td>
                    <td className="px-3 text-center"><Badge variant={calculatePercent(r.sa, r.st) >= 100 ? 'success' : 'default'}>{calculatePercent(r.sa, r.st)}%</Badge></td>
                    <td className="px-3 text-center"><Badge variant={calculatePercent(r.sa, r.ytdT) >= 100 ? 'success' : calculatePercent(r.sa, r.ytdT) >= 80 ? 'warning' : 'danger'}>{calculatePercent(r.sa, r.ytdT)}%</Badge></td>
                    <td className="px-3 text-right">₺{formatMoney(Math.round(r.ct))}</td>
                    <td className="px-3 text-right text-green-700">₺{formatMoney(Math.round(r.ca))}</td>
                    <td className="px-3 text-center"><Badge variant={calculatePercent(r.ca, r.ct) >= 100 ? 'success' : 'default'}>{calculatePercent(r.ca, r.ct)}%</Badge></td>
                  </tr>))}</tbody>
              </table>
              <p className="px-4 py-2 text-[11px] text-slate-500">Gerçekleşenler otomatik hesaplanır: satış = sipariş ve Paraşüt faturaları (KDV hariç), tahsilat = tahsil edilen tutarın KDV hariç karşılığı. "Bugüne %" yılın geçen aylarının hedefine göredir.</p>
            </Card>);
        })()}

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
                  const salesPercent = calculatePercent(achS(t), t.sales_target);
                  const collPercent = calculatePercent(achC(t), t.collection_target);
                  return (
                    <tr key={t.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{t.period}</td>
                      <td className="px-4 py-3">{getAssignedName(t.sales_person_id)}</td>
                      <td className="px-4 py-3 text-right">₺{formatMoney(t.sales_target || 0)}</td>
                      <td className="px-4 py-3 text-right text-green-600">₺{formatMoney(Math.round(achS(t)))}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={salesPercent >= 100 ? 'success' : salesPercent >= 70 ? 'warning' : 'danger'}>
                          {salesPercent}%
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">₺{formatMoney(t.collection_target || 0)}</td>
                      <td className="px-4 py-3 text-right text-green-600">₺{formatMoney(Math.round(achC(t)))}</td>
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
          <p className="rounded bg-slate-50 p-2 text-xs text-slate-500">Hedefler <b>KDV hariç</b> girilir. Gerçekleşen satış ve tahsilat siparişlerden ve Paraşüt faturalarından otomatik hesaplanır; aşağıdaki alanlar yalnızca otomatik veri olmayan dönemler için kullanılır.</p>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Gerçekleşen Satış (₺)" type="number" value={formData.achieved_sales} onChange={(e) => setFormData({ ...formData, achieved_sales: Number(e.target.value) })} />
            <Input label="Gerçekleşen Tahsilat (₺)" type="number" value={formData.achieved_collection} onChange={(e) => setFormData({ ...formData, achieved_collection: Number(e.target.value) })} />
          </div>
        </div>
      </Modal>
      <Modal isOpen={yearOpen} onClose={() => setYearOpen(false)} title="Yıllık hedef"
        footer={<><Button variant="secondary" onClick={() => setYearOpen(false)}>İptal</Button><Button onClick={saveYear} disabled={saving}>{saving ? 'Kaydediliyor...' : '12 aylık hedefi kaydet'}</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Satışçı *" value={yr.sales_person_id} onChange={(e) => { const y = { ...yr, sales_person_id: e.target.value }; setYr({ ...y, months: distribute(y) }); }}
              options={[{ value: '', label: 'Seçiniz' }, ...salesTeam.map(s => ({ value: s.id, label: s.name }))]} />
            <Input label="Yıl *" value={yr.year} onChange={(e) => { const y = { ...yr, year: e.target.value }; setYr({ ...y, months: /^\d{4}$/.test(e.target.value) ? distribute(y) : yr.months }); }} placeholder="2027" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Yıllık satış hedefi (₺, KDV hariç)" type="number" value={yr.sales} onChange={(e) => { const y = { ...yr, sales: Number(e.target.value) }; setYr({ ...y, months: distribute(y) }); }} />
            <Input label="Yıllık tahsilat hedefi (₺, KDV hariç)" type="number" value={yr.coll} onChange={(e) => { const y = { ...yr, coll: Number(e.target.value) }; setYr({ ...y, months: distribute(y) }); }} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={yr.mode === 'equal'} onChange={() => { const y = { ...yr, mode: 'equal' as const }; setYr({ ...y, months: distribute(y) }); }} />Aylara eşit böl</label>
            <label className="flex items-center gap-2"><input type="radio" checked={yr.mode === 'season'} onChange={() => { const y = { ...yr, mode: 'season' as const }; setYr({ ...y, months: distribute(y) }); }} />Geçen yılın aylık satışlarına göre böl (mevsimsellik)</label>
          </div>
          <div className="max-h-72 overflow-y-auto rounded border">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 text-slate-500"><th className="px-2 py-1 text-left">Ay</th><th className="px-2 text-right">Satış hedefi</th><th className="px-2 text-right">Tahsilat hedefi</th></tr></thead>
              <tbody>{yr.months.map((m, i) => (
                <tr key={m.p} className="border-t">
                  <td className="px-2 py-1">{m.p}{targets.some(t => t.sales_person_id === yr.sales_person_id && t.period === m.p) ? <span className="ml-1 text-[10px] text-amber-600">(mevcut güncellenir)</span> : null}</td>
                  <td className="px-2 text-right"><input type="number" className="h-7 w-28 rounded border px-1 text-right" value={m.s} onChange={e => { const ms = [...yr.months]; ms[i] = { ...m, s: Number(e.target.value) }; setYr({ ...yr, months: ms }); }} /></td>
                  <td className="px-2 text-right"><input type="number" className="h-7 w-28 rounded border px-1 text-right" value={m.c} onChange={e => { const ms = [...yr.months]; ms[i] = { ...m, c: Number(e.target.value) }; setYr({ ...yr, months: ms }); }} /></td>
                </tr>))}
                <tr className="border-t font-semibold"><td className="px-2 py-1">Toplam</td><td className="px-2 text-right">₺{formatMoney(yr.months.reduce((a, m) => a + m.s, 0))}</td><td className="px-2 text-right">₺{formatMoney(yr.months.reduce((a, m) => a + m.c, 0))}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Aylık tutarları tek tek değiştirebilirsiniz. Kaydedince her ay ayrı hedef olarak oluşur; o ay için hedef zaten varsa güncellenir.</p>
        </div>
      </Modal>
    </div>
  );
}
