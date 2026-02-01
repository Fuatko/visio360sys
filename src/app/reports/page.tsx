'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Input, Select } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { FileText, RefreshCw, Download, TrendingUp, Users, Target, Wallet } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

export default function ReportsPage() {
  const [targets, setTargets] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [salesTeam, setSalesTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [reportType, setReportType] = useState('sales');

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [targetRes, collRes, oppRes, custRes, teamRes] = await Promise.all([
        supabase.from('targets').select('*'),
        supabase.from('collections').select('*'),
        supabase.from('opportunities').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('sales_team').select('*').eq('status', 'active'),
      ]);
      setTargets(targetRes.data || []);
      setCollections(collRes.data || []);
      setOpportunities(oppRes.data || []);
      setCustomers(custRes.data || []);
      setSalesTeam(teamRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const getSalesPerson = (id: string) => salesTeam.find(s => s.id === id);
  const getCustomer = (id: string) => customers.find(c => c.id === id);

  // Dönem bazlı veriler
  const periodTargets = targets.filter(t => t.period === selectedPeriod);
  const periodCollections = collections.filter(c => c.date?.startsWith(selectedPeriod));

  // İstatistikler
  const totalSalesTarget = periodTargets.reduce((s, t) => s + (t.sales_target || 0), 0);
  const totalSalesAchieved = periodTargets.reduce((s, t) => s + (t.achieved_sales || 0), 0);
  const totalCollTarget = periodTargets.reduce((s, t) => s + (t.collection_target || 0), 0);
  const totalCollAchieved = periodTargets.reduce((s, t) => s + (t.achieved_collection || 0), 0);

  // Fırsat analizi
  const wonOpps = opportunities.filter(o => o.stage === 'Kapanış');
  const lostOpps = opportunities.filter(o => o.stage === 'Kaybedildi');
  const activeOpps = opportunities.filter(o => !['Kapanış', 'Kaybedildi'].includes(o.stage));

  // Müşteri analizi
  const vipCustomers = customers.filter(c => c.status === 'VIP');
  const activeCustomers = customers.filter(c => c.status === 'Aktif');

  // CSV Export
  const exportCSV = () => {
    let csv = '';
    let filename = '';

    if (reportType === 'sales') {
      csv = 'Kişi,Satış Hedefi,Satış Gerçekleşen,Oran,Tahsilat Hedefi,Tahsilat Gerçekleşen,Oran\n';
      periodTargets.forEach(t => {
        const person = getSalesPerson(t.sales_person_id);
        const salesRate = t.sales_target > 0 ? Math.round(t.achieved_sales / t.sales_target * 100) : 0;
        const collRate = t.collection_target > 0 ? Math.round(t.achieved_collection / t.collection_target * 100) : 0;
        csv += `${person?.name || 'Bilinmiyor'},${t.sales_target},${t.achieved_sales},${salesRate}%,${t.collection_target},${t.achieved_collection},${collRate}%\n`;
      });
      filename = `satis-raporu-${selectedPeriod}.csv`;
    } else if (reportType === 'collections') {
      csv = 'Tarih,Müşteri,Sorumlu,Yöntem,Tutar\n';
      periodCollections.forEach(c => {
        const customer = getCustomer(c.customer_id);
        const person = getSalesPerson(c.sales_person_id);
        csv += `${c.date},${customer?.name || '-'},${person?.name || '-'},${c.method},${c.amount}\n`;
      });
      filename = `tahsilat-raporu-${selectedPeriod}.csv`;
    } else if (reportType === 'opportunities') {
      csv = 'Fırsat,Müşteri,Sorumlu,Değer,Aşama,Olasılık\n';
      opportunities.forEach(o => {
        const customer = getCustomer(o.customer_id);
        const person = getSalesPerson(o.assigned_to);
        csv += `${o.title},${customer?.name || '-'},${person?.name || '-'},${o.value},${o.stage},${o.probability}%\n`;
      });
      filename = `firsatlar-raporu.csv`;
    }

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  if (loading) {
    return <div><Header title="Raporlar" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;
  }

  return (
    <div>
      <Header title="Raporlar" />
      <div className="p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Input type="month" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="w-40" />
            <Select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              options={[
                { value: 'sales', label: '📊 Satış Raporu' },
                { value: 'collections', label: '💰 Tahsilat Raporu' },
                { value: 'opportunities', label: '🎯 Fırsat Raporu' },
              ]}
              className="w-48"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
            <Button onClick={exportCSV}><Download className="h-4 w-4" />CSV İndir</Button>
          </div>
        </div>

        {/* Özet Kartlar */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><TrendingUp className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Satış Başarısı</p>
                <p className="text-xl font-bold">{totalSalesTarget > 0 ? Math.round(totalSalesAchieved / totalSalesTarget * 100) : 0}%</p>
                <p className="text-xs text-slate-400">₺{formatMoney(totalSalesAchieved)} / ₺{formatMoney(totalSalesTarget)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><Wallet className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Tahsilat Başarısı</p>
                <p className="text-xl font-bold">{totalCollTarget > 0 ? Math.round(totalCollAchieved / totalCollTarget * 100) : 0}%</p>
                <p className="text-xs text-slate-400">₺{formatMoney(totalCollAchieved)} / ₺{formatMoney(totalCollTarget)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg"><Target className="h-5 w-5 text-amber-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Fırsat Kazanma</p>
                <p className="text-xl font-bold">{wonOpps.length + lostOpps.length > 0 ? Math.round(wonOpps.length / (wonOpps.length + lostOpps.length) * 100) : 0}%</p>
                <p className="text-xs text-slate-400">{wonOpps.length} kazanıldı / {lostOpps.length} kaybedildi</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg"><Users className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Müşteri Durumu</p>
                <p className="text-xl font-bold">{customers.length}</p>
                <p className="text-xs text-slate-400">{vipCustomers.length} VIP, {activeCustomers.length} Aktif</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Rapor İçeriği */}
        {reportType === 'sales' && (
          <Card>
            <CardHeader>
              <CardTitle><FileText className="h-4 w-4" /> {selectedPeriod} Satış Raporu</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3">Kişi</th>
                    <th className="text-right p-3">Satış Hedefi</th>
                    <th className="text-right p-3">Satış Gerçekleşen</th>
                    <th className="text-right p-3">Oran</th>
                    <th className="text-right p-3">Tahsilat Hedefi</th>
                    <th className="text-right p-3">Tahsilat Gerçekleşen</th>
                    <th className="text-right p-3">Oran</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {periodTargets.map(t => {
                    const person = getSalesPerson(t.sales_person_id);
                    const salesRate = t.sales_target > 0 ? Math.round(t.achieved_sales / t.sales_target * 100) : 0;
                    const collRate = t.collection_target > 0 ? Math.round(t.achieved_collection / t.collection_target * 100) : 0;
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span>{person?.avatar}</span>
                            <span>{person?.name || 'Bilinmiyor'}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right">₺{formatMoney(t.sales_target)}</td>
                        <td className="p-3 text-right font-medium">₺{formatMoney(t.achieved_sales)}</td>
                        <td className="p-3 text-right">
                          <Badge variant={salesRate >= 100 ? 'success' : salesRate >= 80 ? 'warning' : 'danger'}>{salesRate}%</Badge>
                        </td>
                        <td className="p-3 text-right">₺{formatMoney(t.collection_target)}</td>
                        <td className="p-3 text-right font-medium">₺{formatMoney(t.achieved_collection)}</td>
                        <td className="p-3 text-right">
                          <Badge variant={collRate >= 100 ? 'success' : collRate >= 80 ? 'warning' : 'danger'}>{collRate}%</Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {periodTargets.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-500">Bu dönem için veri yok</td></tr>
                  )}
                </tbody>
                {periodTargets.length > 0 && (
                  <tfoot className="bg-slate-100 font-semibold">
                    <tr>
                      <td className="p-3">TOPLAM</td>
                      <td className="p-3 text-right">₺{formatMoney(totalSalesTarget)}</td>
                      <td className="p-3 text-right">₺{formatMoney(totalSalesAchieved)}</td>
                      <td className="p-3 text-right">{totalSalesTarget > 0 ? Math.round(totalSalesAchieved / totalSalesTarget * 100) : 0}%</td>
                      <td className="p-3 text-right">₺{formatMoney(totalCollTarget)}</td>
                      <td className="p-3 text-right">₺{formatMoney(totalCollAchieved)}</td>
                      <td className="p-3 text-right">{totalCollTarget > 0 ? Math.round(totalCollAchieved / totalCollTarget * 100) : 0}%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </CardBody>
          </Card>
        )}

        {reportType === 'collections' && (
          <Card>
            <CardHeader>
              <CardTitle><FileText className="h-4 w-4" /> {selectedPeriod} Tahsilat Raporu</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3">Tarih</th>
                    <th className="text-left p-3">Müşteri</th>
                    <th className="text-left p-3">Sorumlu</th>
                    <th className="text-left p-3">Yöntem</th>
                    <th className="text-right p-3">Tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {periodCollections.map(c => {
                    const customer = getCustomer(c.customer_id);
                    const person = getSalesPerson(c.sales_person_id);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="p-3">{c.date}</td>
                        <td className="p-3">{customer?.name || '-'}</td>
                        <td className="p-3">{person?.name || '-'}</td>
                        <td className="p-3"><Badge>{c.method}</Badge></td>
                        <td className="p-3 text-right font-bold text-green-600">₺{formatMoney(c.amount)}</td>
                      </tr>
                    );
                  })}
                  {periodCollections.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-500">Bu dönem için tahsilat yok</td></tr>
                  )}
                </tbody>
                {periodCollections.length > 0 && (
                  <tfoot className="bg-slate-100 font-semibold">
                    <tr>
                      <td colSpan={4} className="p-3">TOPLAM</td>
                      <td className="p-3 text-right text-green-600">₺{formatMoney(periodCollections.reduce((s, c) => s + (c.amount || 0), 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </CardBody>
          </Card>
        )}

        {reportType === 'opportunities' && (
          <Card>
            <CardHeader>
              <CardTitle><FileText className="h-4 w-4" /> Fırsat Raporu</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3">Fırsat</th>
                    <th className="text-left p-3">Müşteri</th>
                    <th className="text-left p-3">Sorumlu</th>
                    <th className="text-right p-3">Değer</th>
                    <th className="text-center p-3">Aşama</th>
                    <th className="text-right p-3">Olasılık</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {opportunities.map(o => {
                    const customer = getCustomer(o.customer_id);
                    const person = getSalesPerson(o.assigned_to);
                    return (
                      <tr key={o.id} className="hover:bg-slate-50">
                        <td className="p-3 font-medium">{o.title}</td>
                        <td className="p-3">{customer?.name || '-'}</td>
                        <td className="p-3">{person?.name || '-'}</td>
                        <td className="p-3 text-right font-bold text-blue-600">₺{formatMoney(o.value)}</td>
                        <td className="p-3 text-center">
                          <Badge variant={o.stage === 'Kapanış' ? 'success' : o.stage === 'Kaybedildi' ? 'danger' : 'warning'}>{o.stage}</Badge>
                        </td>
                        <td className="p-3 text-right">{o.probability}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                {opportunities.length > 0 && (
                  <tfoot className="bg-slate-100 font-semibold">
                    <tr>
                      <td colSpan={3} className="p-3">TOPLAM ({opportunities.length} fırsat)</td>
                      <td className="p-3 text-right text-blue-600">₺{formatMoney(opportunities.reduce((s, o) => s + (o.value || 0), 0))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
