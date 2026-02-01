'use client';

import Header from '@/components/Header';
import SalesFilter from '@/components/SalesFilter';
import { Card, CardHeader, CardTitle, CardBody, Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { BarChart3, TrendingUp, TrendingDown, Target, Users, Award, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface SalesPerson {
  id: string;
  name: string;
  region: string;
  title: string;
}

interface TargetData {
  sales_person_id: string;
  sales_target: number;
  collection_target: number;
  achieved_sales: number;
  achieved_collection: number;
}

interface OpportunityData {
  assigned_to: string;
  value: number;
  probability: number;
  stage: string;
}

export default function PerformancePage() {
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([]);
  const [targets, setTargets] = useState<TargetData[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRegion, setFilterRegion] = useState('');
  const [filterPerson, setFilterPerson] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teamRes, targetRes, oppRes] = await Promise.all([
        supabase.from('sales_team').select('id, name, region, title').eq('status', 'active'),
        supabase.from('targets').select('sales_person_id, sales_target, collection_target, achieved_sales, achieved_collection').eq('period', selectedPeriod),
        supabase.from('opportunities').select('assigned_to, value, probability, stage'),
      ]);
      setSalesTeam(teamRes.data || []);
      setTargets(targetRes.data || []);
      setOpportunities(oppRes.data || []);
    } catch (err: any) {
      console.error('Hata:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedPeriod]);

  const handleFilterChange = (filters: { region: string; department: string; repId: string }) => {
    setFilterRegion(filters.region);
    setFilterPerson(filters.repId);
  };

  // Filtrelenmiş satış ekibi
  const filteredTeam = salesTeam.filter(p => {
    const matchPerson = !filterPerson || p.id === filterPerson;
    const matchRegion = !filterRegion || p.region === filterRegion;
    return matchPerson && matchRegion;
  });

  // Performans hesaplama
  const getPerformanceData = (personId: string) => {
    const target = targets.find(t => t.sales_person_id === personId);
    const personOpps = opportunities.filter(o => o.assigned_to === personId);
    
    const salesTarget = target?.sales_target || 0;
    const salesAchieved = target?.achieved_sales || 0;
    const collectionTarget = target?.collection_target || 0;
    const collectionAchieved = target?.achieved_collection || 0;
    
    const pipelineValue = personOpps.reduce((s, o) => s + (o.value || 0), 0);
    const weightedPipeline = personOpps.reduce((s, o) => s + ((o.value || 0) * (o.probability || 0) / 100), 0);
    const closingOpps = personOpps.filter(o => o.stage === 'Kapanış').length;

    const salesPercent = salesTarget ? Math.round((salesAchieved / salesTarget) * 100) : 0;
    const collectionPercent = collectionTarget ? Math.round((collectionAchieved / collectionTarget) * 100) : 0;

    return {
      salesTarget,
      salesAchieved,
      salesPercent,
      collectionTarget,
      collectionAchieved,
      collectionPercent,
      pipelineValue,
      weightedPipeline,
      closingOpps,
      totalOpps: personOpps.length,
    };
  };

  // Toplam değerler
  const totals = filteredTeam.reduce((acc, person) => {
    const data = getPerformanceData(person.id);
    return {
      salesTarget: acc.salesTarget + data.salesTarget,
      salesAchieved: acc.salesAchieved + data.salesAchieved,
      collectionTarget: acc.collectionTarget + data.collectionTarget,
      collectionAchieved: acc.collectionAchieved + data.collectionAchieved,
      pipelineValue: acc.pipelineValue + data.pipelineValue,
      weightedPipeline: acc.weightedPipeline + data.weightedPipeline,
    };
  }, { salesTarget: 0, salesAchieved: 0, collectionTarget: 0, collectionAchieved: 0, pipelineValue: 0, weightedPipeline: 0 });

  // Sıralama
  const rankedTeam = [...filteredTeam].sort((a, b) => {
    const aData = getPerformanceData(a.id);
    const bData = getPerformanceData(b.id);
    return bData.salesPercent - aData.salesPercent;
  });

  if (loading) {
    return <div><Header title="Performans" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;
  }

  return (
    <div>
      <Header title="Performans" />
      <div className="p-6">
        {/* Bölge ve Kişi Filtresi */}
        <SalesFilter onFilterChange={handleFilterChange} />

        {/* Dönem Seçimi */}
        <div className="mb-6 flex items-center gap-4">
          <label className="text-sm text-slate-600">Dönem:</label>
          <input 
            type="month" 
            value={selectedPeriod} 
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-200 text-sm"
          />
          <button onClick={fetchData} className="p-2 text-slate-500 hover:text-slate-700">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Özet Kartları */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Target className="h-5 w-5 text-blue-600" />
              <span className="text-xs text-slate-500">Satış Hedefi</span>
            </div>
            <p className="text-2xl font-bold">₺{formatMoney(totals.salesTarget)}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-green-600">₺{formatMoney(totals.salesAchieved)}</span>
              <Badge variant={totals.salesTarget && totals.salesAchieved / totals.salesTarget >= 1 ? 'success' : 'warning'}>
                {totals.salesTarget ? Math.round((totals.salesAchieved / totals.salesTarget) * 100) : 0}%
              </Badge>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Target className="h-5 w-5 text-green-600" />
              <span className="text-xs text-slate-500">Tahsilat Hedefi</span>
            </div>
            <p className="text-2xl font-bold">₺{formatMoney(totals.collectionTarget)}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-green-600">₺{formatMoney(totals.collectionAchieved)}</span>
              <Badge variant={totals.collectionTarget && totals.collectionAchieved / totals.collectionTarget >= 1 ? 'success' : 'warning'}>
                {totals.collectionTarget ? Math.round((totals.collectionAchieved / totals.collectionTarget) * 100) : 0}%
              </Badge>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="h-5 w-5 text-purple-600" />
              <span className="text-xs text-slate-500">Pipeline</span>
            </div>
            <p className="text-2xl font-bold">₺{formatMoney(totals.pipelineValue)}</p>
            <p className="text-xs text-slate-500 mt-1">Ağırlıklı: ₺{formatMoney(totals.weightedPipeline)}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Users className="h-5 w-5 text-amber-600" />
              <span className="text-xs text-slate-500">Ekip</span>
            </div>
            <p className="text-2xl font-bold">{filteredTeam.length}</p>
            <p className="text-xs text-slate-500 mt-1">Aktif satışçı</p>
          </Card>
        </div>

        {/* Performans Tablosu */}
        <Card>
          <CardHeader>
            <CardTitle><Award className="h-4 w-4" /> Bireysel Performans</CardTitle>
          </CardHeader>
          <CardBody>
            {rankedTeam.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium">#</th>
                      <th className="px-4 py-3 text-left font-medium">Satışçı</th>
                      <th className="px-4 py-3 text-left font-medium">Bölge</th>
                      <th className="px-4 py-3 text-right font-medium">Satış Hedefi</th>
                      <th className="px-4 py-3 text-right font-medium">Gerçekleşen</th>
                      <th className="px-4 py-3 text-center font-medium">Satış %</th>
                      <th className="px-4 py-3 text-center font-medium">Tahsilat %</th>
                      <th className="px-4 py-3 text-right font-medium">Pipeline</th>
                      <th className="px-4 py-3 text-center font-medium">Fırsat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedTeam.map((person, index) => {
                      const data = getPerformanceData(person.id);
                      return (
                        <tr key={person.id} className="border-b hover:bg-slate-50">
                          <td className="px-4 py-3">
                            {index === 0 && <span className="text-amber-500">🥇</span>}
                            {index === 1 && <span className="text-slate-400">🥈</span>}
                            {index === 2 && <span className="text-amber-700">🥉</span>}
                            {index > 2 && <span className="text-slate-400">{index + 1}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{person.name}</div>
                            <div className="text-xs text-slate-500">{person.title}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{person.region}</td>
                          <td className="px-4 py-3 text-right">₺{formatMoney(data.salesTarget)}</td>
                          <td className="px-4 py-3 text-right text-green-600">₺{formatMoney(data.salesAchieved)}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {data.salesPercent >= 100 ? (
                                <TrendingUp className="h-4 w-4 text-green-600" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-red-600" />
                              )}
                              <Badge variant={data.salesPercent >= 100 ? 'success' : data.salesPercent >= 70 ? 'warning' : 'danger'}>
                                {data.salesPercent}%
                              </Badge>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={data.collectionPercent >= 100 ? 'success' : data.collectionPercent >= 70 ? 'warning' : 'danger'}>
                              {data.collectionPercent}%
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-blue-600">₺{formatMoney(data.pipelineValue)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-medium">{data.totalOpps}</span>
                            {data.closingOpps > 0 && (
                              <span className="text-xs text-green-600 ml-1">({data.closingOpps} kapanış)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Seçilen filtrelere uygun veri bulunamadı</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
