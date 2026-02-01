'use client';

import Header from '@/components/Header';
import { Card } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, AlertTriangle, CheckCircle,
  Users, Target, Activity, ArrowUpRight, ArrowDownRight, Shield, Clock,
  PieChart, BarChart3, Zap, Eye, Calendar, Building2
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart as RechartsPie, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart
} from 'recharts';

// ============ TYPES ============
interface CompanyHealth {
  overallScore: number;
  salesHealth: number;
  collectionHealth: number;
  cashFlowHealth: number;
  teamHealth: number;
}

interface AgingData {
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120Plus: number;
  total: number;
}

interface RiskAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  value?: number;
  trend?: 'up' | 'down';
}

// ============ CONSTANTS ============
const HEALTH_COLORS = {
  excellent: '#10b981',
  good: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  critical: '#dc2626'
};

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// ============ HEALTH SCORE COMPONENT ============
function HealthGauge({ score, label, size = 'md' }: { score: number; label: string; size?: 'sm' | 'md' | 'lg' }) {
  const getColor = (s: number) => {
    if (s >= 80) return HEALTH_COLORS.excellent;
    if (s >= 60) return HEALTH_COLORS.good;
    if (s >= 40) return HEALTH_COLORS.warning;
    if (s >= 20) return HEALTH_COLORS.danger;
    return HEALTH_COLORS.critical;
  };

  const getLabel = (s: number) => {
    if (s >= 80) return 'Mükemmel';
    if (s >= 60) return 'İyi';
    if (s >= 40) return 'Dikkat';
    if (s >= 20) return 'Risk';
    return 'Kritik';
  };

  const sizeClasses = {
    sm: 'h-20 w-20',
    md: 'h-28 w-28',
    lg: 'h-36 w-36'
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl'
  };

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${sizeClasses[size]} rounded-full border-8 flex items-center justify-center`}
           style={{ borderColor: getColor(score) }}>
        <div className="text-center">
          <p className={`font-bold ${textSizes[size]}`} style={{ color: getColor(score) }}>{score}</p>
          <p className="text-xs text-slate-500">{getLabel(score)}</p>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-slate-700">{label}</p>
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function ExecutiveDashboard() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<CompanyHealth>({
    overallScore: 0,
    salesHealth: 0,
    collectionHealth: 0,
    cashFlowHealth: 0,
    teamHealth: 0
  });
  const [aging, setAging] = useState<AgingData>({
    current: 0, days30: 0, days60: 0, days90: 0, days120Plus: 0, total: 0
  });
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [kpis, setKpis] = useState({
    totalSales: 0,
    totalTarget: 0,
    totalCollection: 0,
    collectionTarget: 0,
    pipelineValue: 0,
    hardStopCount: 0,
    teamCount: 0,
    activeCustomers: 0
  });
  const [trendData, setTrendData] = useState<any[]>([]);
  const [cashFlowProjection, setCashFlowProjection] = useState<any[]>([]);
  
  const supabase = createClient();

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch all required data
      const [targetsRes, collectionsRes, opportunitiesRes, teamRes, customersRes, commissionRes] = await Promise.all([
        supabase.from('targets').select('*'),
        supabase.from('collections').select('*'),
        supabase.from('opportunities').select('*'),
        supabase.from('sales_team').select('*').eq('is_active', true),
        supabase.from('customers').select('*').eq('status', 'Aktif'),
        supabase.from('commission_results').select('*')
      ]);

      const targets = targetsRes.data || [];
      const collections = collectionsRes.data || [];
      const opportunities = opportunitiesRes.data || [];
      const team = teamRes.data || [];
      const customers = customersRes.data || [];
      const commissions = commissionRes.data || [];

      // Calculate KPIs
      const totalSales = targets.reduce((sum, t) => sum + (t.actual_sales || 0), 0);
      const totalTarget = targets.reduce((sum, t) => sum + (t.target_amount || 0), 0);
      const totalCollection = collections.filter(c => c.status === 'Ödendi').reduce((sum, c) => sum + (c.amount || 0), 0);
      const collectionTarget = collections.reduce((sum, c) => sum + (c.amount || 0), 0);
      const pipelineValue = opportunities.filter(o => o.stage !== 'Kaybedildi' && o.stage !== 'Kazanıldı')
        .reduce((sum, o) => sum + (o.value || 0), 0);
      const hardStopCount = commissions.filter(c => c.hard_stop).length;

      setKpis({
        totalSales,
        totalTarget,
        totalCollection,
        collectionTarget,
        pipelineValue,
        hardStopCount,
        teamCount: team.length,
        activeCustomers: customers.length
      });

      // Calculate Aging
      const now = new Date();
      let agingCalc = { current: 0, days30: 0, days60: 0, days90: 0, days120Plus: 0, total: 0 };
      
      collections.filter(c => c.status !== 'Ödendi').forEach(c => {
        const dueDate = new Date(c.due_date);
        const daysDiff = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const amount = c.amount || 0;
        
        agingCalc.total += amount;
        if (daysDiff <= 0) agingCalc.current += amount;
        else if (daysDiff <= 30) agingCalc.days30 += amount;
        else if (daysDiff <= 60) agingCalc.days60 += amount;
        else if (daysDiff <= 90) agingCalc.days90 += amount;
        else agingCalc.days120Plus += amount;
      });
      setAging(agingCalc);

      // Calculate Health Scores
      const salesRatio = totalTarget > 0 ? (totalSales / totalTarget) * 100 : 0;
      const collectionRatio = collectionTarget > 0 ? (totalCollection / collectionTarget) * 100 : 0;
      const hardStopRatio = team.length > 0 ? ((team.length - hardStopCount) / team.length) * 100 : 100;
      const agingRisk = agingCalc.total > 0 ? 
        ((agingCalc.current + agingCalc.days30) / agingCalc.total) * 100 : 100;

      const salesHealth = Math.min(100, salesRatio);
      const collectionHealth = Math.min(100, collectionRatio);
      const cashFlowHealth = agingRisk;
      const teamHealth = hardStopRatio;
      const overallScore = Math.round((salesHealth + collectionHealth + cashFlowHealth + teamHealth) / 4);

      setHealth({
        overallScore,
        salesHealth: Math.round(salesHealth),
        collectionHealth: Math.round(collectionHealth),
        cashFlowHealth: Math.round(cashFlowHealth),
        teamHealth: Math.round(teamHealth)
      });

      // Generate Alerts
      const newAlerts: RiskAlert[] = [];
      
      if (hardStopCount > 0) {
        newAlerts.push({
          id: '1',
          type: 'critical',
          title: 'HARD STOP Uyarısı',
          description: `${hardStopCount} temsilci HARD STOP durumunda`,
          value: hardStopCount
        });
      }
      
      if (agingCalc.days90 + agingCalc.days120Plus > 0) {
        newAlerts.push({
          id: '2',
          type: 'critical',
          title: 'Kritik Vadeli Alacaklar',
          description: `90+ gün vadeli: ₺${formatMoney(agingCalc.days90 + agingCalc.days120Plus)}`,
          value: agingCalc.days90 + agingCalc.days120Plus
        });
      }
      
      if (collectionRatio < 70) {
        newAlerts.push({
          id: '3',
          type: 'warning',
          title: 'Tahsilat Performansı Düşük',
          description: `Tahsilat oranı: %${collectionRatio.toFixed(0)}`,
          value: collectionRatio
        });
      }
      
      if (salesRatio < 80) {
        newAlerts.push({
          id: '4',
          type: 'warning',
          title: 'Satış Hedefinde Sapma',
          description: `Hedef gerçekleşme: %${salesRatio.toFixed(0)}`,
          value: salesRatio
        });
      }

      setAlerts(newAlerts);

      // Generate Trend Data (Last 6 months)
      const monthlyData = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const month = date.getMonth();
        const year = date.getFullYear();
        
        const monthTargets = targets.filter(t => {
          const tDate = new Date(t.created_at);
          return tDate.getMonth() === month && tDate.getFullYear() === year;
        });
        
        const monthCollections = collections.filter(c => {
          if (!c.payment_date) return false;
          const cDate = new Date(c.payment_date);
          return cDate.getMonth() === month && cDate.getFullYear() === year;
        });

        monthlyData.push({
          name: MONTHS[month],
          sales: monthTargets.reduce((sum, t) => sum + (t.actual_sales || 0), 0),
          target: monthTargets.reduce((sum, t) => sum + (t.target_amount || 0), 0),
          collection: monthCollections.reduce((sum, c) => sum + (c.amount || 0), 0)
        });
      }
      setTrendData(monthlyData);

      // Cash Flow Projection (Next 3 months)
      const projection = [];
      for (let i = 0; i < 3; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() + i);
        const month = date.getMonth();
        
        // Simple projection based on pending collections
        const pendingForMonth = collections.filter(c => {
          if (c.status === 'Ödendi') return false;
          const dueDate = new Date(c.due_date);
          return dueDate.getMonth() === month;
        }).reduce((sum, c) => sum + (c.amount || 0), 0);

        projection.push({
          name: MONTHS[month],
          expected: pendingForMonth,
          optimistic: pendingForMonth * 1.1,
          pessimistic: pendingForMonth * 0.7
        });
      }
      setCashFlowProjection(projection);

    } catch (error) {
      console.error('Data fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Header title="Executive Dashboard" subtitle="Şirket Sağlığı Özeti" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  const agingChartData = [
    { name: 'Vadesi Gelmemiş', value: aging.current, color: '#10b981' },
    { name: '0-30 Gün', value: aging.days30, color: '#f59e0b' },
    { name: '31-60 Gün', value: aging.days60, color: '#f97316' },
    { name: '61-90 Gün', value: aging.days90, color: '#ef4444' },
    { name: '90+ Gün', value: aging.days120Plus, color: '#dc2626' }
  ].filter(d => d.value > 0);

  return (
    <div>
      <Header title="Executive Dashboard" subtitle="Şirket Sağlığı & Stratejik Görünüm" />
      
      <div className="p-6 space-y-6">
        {/* Risk Alerts */}
        {alerts.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {alerts.map(alert => (
              <div key={alert.id} className={`p-4 rounded-xl border-l-4 ${
                alert.type === 'critical' ? 'bg-red-50 border-red-500' :
                alert.type === 'warning' ? 'bg-amber-50 border-amber-500' :
                'bg-blue-50 border-blue-500'
              }`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`h-5 w-5 mt-0.5 ${
                    alert.type === 'critical' ? 'text-red-500' :
                    alert.type === 'warning' ? 'text-amber-500' : 'text-blue-500'
                  }`} />
                  <div>
                    <p className="font-semibold text-slate-900">{alert.title}</p>
                    <p className="text-sm text-slate-600">{alert.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Company Health Score */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="h-6 w-6 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900">Şirket Sağlık Skoru</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 items-center justify-items-center">
            <HealthGauge score={health.overallScore} label="Genel Skor" size="lg" />
            <HealthGauge score={health.salesHealth} label="Satış" size="md" />
            <HealthGauge score={health.collectionHealth} label="Tahsilat" size="md" />
            <HealthGauge score={health.cashFlowHealth} label="Nakit Akışı" size="md" />
            <HealthGauge score={health.teamHealth} label="Ekip" size="md" />
          </div>
        </Card>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-5 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Toplam Satış</p>
                <p className="text-2xl font-bold mt-1">₺{formatMoney(kpis.totalSales)}</p>
                <p className="text-blue-200 text-xs mt-1">
                  Hedef: ₺{formatMoney(kpis.totalTarget)} ({kpis.totalTarget > 0 ? ((kpis.totalSales / kpis.totalTarget) * 100).toFixed(0) : 0}%)
                </p>
              </div>
              <DollarSign className="h-10 w-10 text-blue-200" />
            </div>
          </Card>

          <Card className="p-5 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm">Tahsilat</p>
                <p className="text-2xl font-bold mt-1">₺{formatMoney(kpis.totalCollection)}</p>
                <p className="text-emerald-200 text-xs mt-1">
                  Oran: %{kpis.collectionTarget > 0 ? ((kpis.totalCollection / kpis.collectionTarget) * 100).toFixed(0) : 0}
                </p>
              </div>
              <Wallet className="h-10 w-10 text-emerald-200" />
            </div>
          </Card>

          <Card className="p-5 bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Pipeline</p>
                <p className="text-2xl font-bold mt-1">₺{formatMoney(kpis.pipelineValue)}</p>
                <p className="text-purple-200 text-xs mt-1">Açık fırsatlar</p>
              </div>
              <Target className="h-10 w-10 text-purple-200" />
            </div>
          </Card>

          <Card className={`p-5 ${kpis.hardStopCount > 0 ? 'bg-gradient-to-br from-red-500 to-red-600' : 'bg-gradient-to-br from-slate-500 to-slate-600'} text-white`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`${kpis.hardStopCount > 0 ? 'text-red-100' : 'text-slate-100'} text-sm`}>HARD STOP</p>
                <p className="text-2xl font-bold mt-1">{kpis.hardStopCount}</p>
                <p className={`${kpis.hardStopCount > 0 ? 'text-red-200' : 'text-slate-200'} text-xs mt-1`}>
                  {kpis.hardStopCount > 0 ? 'Kritik durum!' : 'Risk yok'}
                </p>
              </div>
              <AlertTriangle className={`h-10 w-10 ${kpis.hardStopCount > 0 ? 'text-red-200' : 'text-slate-200'}`} />
            </div>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Sales vs Collection Trend */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-slate-900">Satış & Tahsilat Trendi</h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(value: number) => `₺${formatMoney(value)}`} />
                  <Legend />
                  <Bar dataKey="target" name="Hedef" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sales" name="Satış" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="collection" name="Tahsilat" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Aging Analysis */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold text-slate-900">Alacak Yaşlandırma (Aging)</h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={agingChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: %${(percent * 100).toFixed(0)}`}
                  >
                    {agingChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `₺${formatMoney(value)}`} />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2 text-center text-xs">
              <div className="p-2 bg-emerald-50 rounded">
                <p className="text-emerald-600 font-bold">₺{formatMoney(aging.current)}</p>
                <p className="text-slate-500">Vadesi Gelmemiş</p>
              </div>
              <div className="p-2 bg-amber-50 rounded">
                <p className="text-amber-600 font-bold">₺{formatMoney(aging.days30)}</p>
                <p className="text-slate-500">0-30 Gün</p>
              </div>
              <div className="p-2 bg-orange-50 rounded">
                <p className="text-orange-600 font-bold">₺{formatMoney(aging.days60)}</p>
                <p className="text-slate-500">31-60 Gün</p>
              </div>
              <div className="p-2 bg-red-50 rounded">
                <p className="text-red-600 font-bold">₺{formatMoney(aging.days90)}</p>
                <p className="text-slate-500">61-90 Gün</p>
              </div>
              <div className="p-2 bg-red-100 rounded">
                <p className="text-red-700 font-bold">₺{formatMoney(aging.days120Plus)}</p>
                <p className="text-slate-500">90+ Gün</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Cash Flow Projection */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <h3 className="font-semibold text-slate-900">Nakit Akışı Projeksiyonu (3 Aylık)</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlowProjection}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(value: number) => `₺${formatMoney(value)}`} />
                <Legend />
                <Area type="monotone" dataKey="optimistic" name="İyimser" stroke="#10b981" fill="#10b98133" />
                <Area type="monotone" dataKey="expected" name="Beklenen" stroke="#3b82f6" fill="#3b82f633" />
                <Area type="monotone" dataKey="pessimistic" name="Kötümser" stroke="#ef4444" fill="#ef444433" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4 text-center">
            <Users className="h-8 w-8 mx-auto text-blue-500 mb-2" />
            <p className="text-2xl font-bold text-slate-900">{kpis.teamCount}</p>
            <p className="text-sm text-slate-500">Aktif Ekip</p>
          </Card>
          <Card className="p-4 text-center">
            <Building2 className="h-8 w-8 mx-auto text-purple-500 mb-2" />
            <p className="text-2xl font-bold text-slate-900">{kpis.activeCustomers}</p>
            <p className="text-sm text-slate-500">Aktif Müşteri</p>
          </Card>
          <Card className="p-4 text-center">
            <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-2xl font-bold text-slate-900">
              %{kpis.totalTarget > 0 ? ((kpis.totalSales / kpis.totalTarget) * 100).toFixed(0) : 0}
            </p>
            <p className="text-sm text-slate-500">Hedef Gerçekleşme</p>
          </Card>
          <Card className="p-4 text-center">
            <Zap className="h-8 w-8 mx-auto text-amber-500 mb-2" />
            <p className="text-2xl font-bold text-slate-900">
              %{kpis.collectionTarget > 0 ? ((kpis.totalCollection / kpis.collectionTarget) * 100).toFixed(0) : 0}
            </p>
            <p className="text-sm text-slate-500">Tahsilat Oranı</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
