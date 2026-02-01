'use client';

import Header from '@/components/Header';
import { Card, Button, Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import {
  Calculator, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Play, RefreshCw, Save, Download, Sliders, Target, Wallet, Users
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

// ============ TYPES ============
interface SimulationScenario {
  id: string;
  name: string;
  salesTarget: number;
  actualSales: number;
  collectionRate: number;
  baseCommissionRate: number;
  acceleratorRate: number;
  hardStopThreshold: number;
}

interface SimulationResult {
  personId: string;
  personName: string;
  baseSales: number;
  simulatedSales: number;
  baseCollection: number;
  simulatedCollection: number;
  baseCommission: number;
  simulatedCommission: number;
  difference: number;
  percentChange: number;
  hardStop: boolean;
}

// ============ MAIN COMPONENT ============
export default function SimulationPage() {
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [salesTeam, setSalesTeam] = useState<any[]>([]);
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [scenario, setScenario] = useState<SimulationScenario>({
    id: 'custom',
    name: 'Özel Senaryo',
    salesTarget: 100,
    actualSales: 100,
    collectionRate: 100,
    baseCommissionRate: 5,
    acceleratorRate: 7,
    hardStopThreshold: 70
  });
  const [totals, setTotals] = useState({
    baseTotal: 0,
    simulatedTotal: 0,
    difference: 0
  });

  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teamRes, commissionsRes] = await Promise.all([
        supabase.from('sales_team').select('*').eq('is_active', true),
        supabase.from('commission_results').select('*')
      ]);

      setSalesTeam(teamRes.data || []);
      
      // Calculate initial results based on current data
      const commissions = commissionsRes.data || [];
      const initialResults: SimulationResult[] = (teamRes.data || []).map(person => {
        const personCommission = commissions.find(c => c.sales_person_id === person.id);
        return {
          personId: person.id,
          personName: person.name,
          baseSales: personCommission?.actual_sales || 0,
          simulatedSales: personCommission?.actual_sales || 0,
          baseCollection: personCommission?.collection_rate || 100,
          simulatedCollection: personCommission?.collection_rate || 100,
          baseCommission: personCommission?.final_commission || 0,
          simulatedCommission: personCommission?.final_commission || 0,
          difference: 0,
          percentChange: 0,
          hardStop: personCommission?.hard_stop || false
        };
      });

      setResults(initialResults);
      calculateTotals(initialResults);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = (results: SimulationResult[]) => {
    const baseTotal = results.reduce((sum, r) => sum + r.baseCommission, 0);
    const simulatedTotal = results.reduce((sum, r) => sum + r.simulatedCommission, 0);
    setTotals({
      baseTotal,
      simulatedTotal,
      difference: simulatedTotal - baseTotal
    });
  };

  const runSimulation = () => {
    setCalculating(true);
    
    setTimeout(() => {
      const newResults = results.map(r => {
        // Apply scenario changes
        const salesMultiplier = scenario.actualSales / 100;
        const collectionMultiplier = scenario.collectionRate / 100;
        
        const simulatedSales = r.baseSales * salesMultiplier;
        const simulatedCollection = Math.min(100, r.baseCollection * collectionMultiplier);
        
        // Check HARD STOP
        const hardStop = simulatedCollection < scenario.hardStopThreshold;
        
        // Calculate commission
        let simulatedCommission = 0;
        if (!hardStop) {
          const targetAchievement = (simulatedSales / (r.baseSales || 1)) * 100;
          
          if (targetAchievement >= 100) {
            // Accelerator rate for over-achievement
            const baseAmount = simulatedSales * (scenario.baseCommissionRate / 100);
            const bonusAmount = (simulatedSales - r.baseSales) * (scenario.acceleratorRate / 100);
            simulatedCommission = baseAmount + Math.max(0, bonusAmount);
          } else {
            simulatedCommission = simulatedSales * (scenario.baseCommissionRate / 100);
          }
          
          // Apply collection rate modifier
          if (simulatedCollection < 85) {
            simulatedCommission *= (simulatedCollection / 100);
          }
        }

        const difference = simulatedCommission - r.baseCommission;
        const percentChange = r.baseCommission > 0 
          ? ((difference / r.baseCommission) * 100) 
          : (simulatedCommission > 0 ? 100 : 0);

        return {
          ...r,
          simulatedSales,
          simulatedCollection,
          simulatedCommission,
          difference,
          percentChange,
          hardStop
        };
      });

      setResults(newResults);
      calculateTotals(newResults);
      setCalculating(false);
    }, 500);
  };

  const resetSimulation = () => {
    setScenario({
      id: 'custom',
      name: 'Özel Senaryo',
      salesTarget: 100,
      actualSales: 100,
      collectionRate: 100,
      baseCommissionRate: 5,
      acceleratorRate: 7,
      hardStopThreshold: 70
    });
    fetchData();
  };

  const applyPreset = (preset: string) => {
    switch (preset) {
      case 'optimistic':
        setScenario({
          ...scenario,
          name: 'İyimser Senaryo',
          actualSales: 120,
          collectionRate: 95
        });
        break;
      case 'pessimistic':
        setScenario({
          ...scenario,
          name: 'Kötümser Senaryo',
          actualSales: 80,
          collectionRate: 65
        });
        break;
      case 'hardstop':
        setScenario({
          ...scenario,
          name: 'HARD STOP Test',
          actualSales: 100,
          collectionRate: 60
        });
        break;
      case 'aggressive':
        setScenario({
          ...scenario,
          name: 'Agresif Hedef',
          actualSales: 150,
          collectionRate: 90
        });
        break;
    }
  };

  if (loading) {
    return (
      <div>
        <Header title="Prim Simülasyonu" subtitle="What-if Analizi" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  const chartData = results.map(r => ({
    name: r.personName.split(' ')[0],
    base: r.baseCommission,
    simulated: r.simulatedCommission,
    difference: r.difference
  }));

  return (
    <div>
      <Header title="Prim Simülasyonu" subtitle="Farklı senaryoları modelleyin" />
      
      <div className="p-6 space-y-6">
        {/* Scenario Controls */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-slate-900">Senaryo Parametreleri</h2>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={resetSimulation}>
                <RefreshCw className="h-4 w-4 mr-1" /> Sıfırla
              </Button>
              <Button size="sm" onClick={runSimulation} disabled={calculating}>
                <Play className="h-4 w-4 mr-1" /> {calculating ? 'Hesaplanıyor...' : 'Simüle Et'}
              </Button>
            </div>
          </div>

          {/* Preset Scenarios */}
          <div className="flex gap-2 mb-6">
            <span className="text-sm text-slate-500 mr-2">Hazır Senaryolar:</span>
            {[
              { key: 'optimistic', label: 'İyimser', color: 'bg-green-100 text-green-700' },
              { key: 'pessimistic', label: 'Kötümser', color: 'bg-red-100 text-red-700' },
              { key: 'hardstop', label: 'HARD STOP Test', color: 'bg-amber-100 text-amber-700' },
              { key: 'aggressive', label: 'Agresif', color: 'bg-purple-100 text-purple-700' }
            ].map(preset => (
              <button
                key={preset.key}
                onClick={() => applyPreset(preset.key)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${preset.color} hover:opacity-80`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Parameter Sliders */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Satış Gerçekleşme: %{scenario.actualSales}
              </label>
              <input
                type="range"
                min="50"
                max="200"
                value={scenario.actualSales}
                onChange={(e) => setScenario({ ...scenario, actualSales: Number(e.target.value) })}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>50%</span>
                <span>100%</span>
                <span>200%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Tahsilat Oranı: %{scenario.collectionRate}
              </label>
              <input
                type="range"
                min="40"
                max="100"
                value={scenario.collectionRate}
                onChange={(e) => setScenario({ ...scenario, collectionRate: Number(e.target.value) })}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>40%</span>
                <span className="text-red-500">70% (HARD STOP)</span>
                <span>100%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                HARD STOP Eşiği: %{scenario.hardStopThreshold}
              </label>
              <input
                type="range"
                min="50"
                max="80"
                value={scenario.hardStopThreshold}
                onChange={(e) => setScenario({ ...scenario, hardStopThreshold: Number(e.target.value) })}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>50%</span>
                <span>70%</span>
                <span>80%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Baz Komisyon Oranı: %{scenario.baseCommissionRate}
              </label>
              <input
                type="range"
                min="1"
                max="15"
                value={scenario.baseCommissionRate}
                onChange={(e) => setScenario({ ...scenario, baseCommissionRate: Number(e.target.value) })}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Hızlandırıcı Oran: %{scenario.acceleratorRate}
              </label>
              <input
                type="range"
                min="1"
                max="20"
                value={scenario.acceleratorRate}
                onChange={(e) => setScenario({ ...scenario, acceleratorRate: Number(e.target.value) })}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </Card>

        {/* Results Summary */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5 bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-slate-200 flex items-center justify-center">
                <Wallet className="h-6 w-6 text-slate-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Mevcut Toplam Prim</p>
                <p className="text-2xl font-bold text-slate-900">₺{formatMoney(totals.baseTotal)}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5 bg-indigo-50">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-indigo-200 flex items-center justify-center">
                <Calculator className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-indigo-600">Simüle Edilen Prim</p>
                <p className="text-2xl font-bold text-indigo-700">₺{formatMoney(totals.simulatedTotal)}</p>
              </div>
            </div>
          </Card>

          <Card className={`p-5 ${totals.difference >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center gap-3">
              <div className={`h-12 w-12 rounded-xl ${totals.difference >= 0 ? 'bg-green-200' : 'bg-red-200'} flex items-center justify-center`}>
                {totals.difference >= 0 
                  ? <TrendingUp className="h-6 w-6 text-green-600" />
                  : <TrendingDown className="h-6 w-6 text-red-600" />
                }
              </div>
              <div>
                <p className={`text-sm ${totals.difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>Fark</p>
                <p className={`text-2xl font-bold ${totals.difference >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {totals.difference >= 0 ? '+' : ''}₺{formatMoney(totals.difference)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Chart */}
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Prim Karşılaştırması</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(value: number) => `₺${formatMoney(value)}`} />
                <Bar dataKey="base" name="Mevcut" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="simulated" name="Simüle" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Results Table */}
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Detaylı Sonuçlar</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium">Satış Temsilcisi</th>
                  <th className="px-4 py-3 text-right font-medium">Mevcut Prim</th>
                  <th className="px-4 py-3 text-right font-medium">Simüle Prim</th>
                  <th className="px-4 py-3 text-right font-medium">Fark</th>
                  <th className="px-4 py-3 text-center font-medium">Değişim</th>
                  <th className="px-4 py-3 text-center font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.personId} className={`border-b hover:bg-slate-50 ${r.hardStop ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">{r.personName}</td>
                    <td className="px-4 py-3 text-right">₺{formatMoney(r.baseCommission)}</td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-600">
                      ₺{formatMoney(r.simulatedCommission)}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${r.difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.difference >= 0 ? '+' : ''}₺{formatMoney(r.difference)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        r.percentChange > 0 ? 'bg-green-100 text-green-700' :
                        r.percentChange < 0 ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {r.percentChange >= 0 ? '+' : ''}{r.percentChange.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.hardStop ? (
                        <Badge variant="danger">HARD STOP</Badge>
                      ) : (
                        <CheckCircle className="h-5 w-5 text-green-500 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
