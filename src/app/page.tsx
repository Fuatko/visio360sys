'use client';

import Header from '@/components/Header';
import UserDashboard from '@/components/UserDashboard';
import { useRole } from '@/components/RoleBasedDashboard';
import { Card, CardHeader, CardTitle, CardBody, Badge, ProgressBar } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import {
  DollarSign, Users, Target, Award, TrendingUp, TrendingDown, Building2,
  CheckCircle, Clock, RefreshCw, PieChart, BarChart3, Activity, Calendar,
  ArrowUpRight, ArrowDownRight, Zap, AlertTriangle, Eye, ChevronRight
} from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart as RechartsPie, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart
} from 'recharts';

// ============ TYPES ============
interface SalesPerson {
  id: string;
  name: string;
  department?: string;
  region?: string;
  photo_url?: string;
}

interface DashboardStats {
  totalSales: number;
  totalTarget: number;
  salesRatio: number;
  totalCollection: number;
  collectionTarget: number;
  collectionRatio: number;
  pipelineValue: number;
  customerCount: number;
  newCustomers: number;
  opportunityCount: number;
  wonOpportunities: number;
  pendingTasks: number;
  teamCount: number;
  hardStopRisk: number;
}

// ============ CONSTANTS ============
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// ============ MAIN COMPONENT ============
export default function Dashboard() {
  const { role, canViewAllData } = useRole();
  
  // Normal kullanıcılar için özel dashboard
  if (role === 'user') {
    return (
      <div>
        <Header title="Dashboard" subtitle="Kişisel Performans Paneli" />
        <div className="p-6">
          <UserDashboard />
        </div>
      </div>
    );
  }

  // Admin ve Manager için tam dashboard
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalSales: 0,
    totalTarget: 0,
    salesRatio: 0,
    totalCollection: 0,
    collectionTarget: 0,
    collectionRatio: 0,
    pipelineValue: 0,
    customerCount: 0,
    newCustomers: 0,
    opportunityCount: 0,
    wonOpportunities: 0,
    pendingTasks: 0,
    teamCount: 0,
    hardStopRisk: 0,
  });
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [teamPerformance, setTeamPerformance] = useState<any[]>([]);
  const [pipelineData, setPipelineData] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [topOpportunities, setTopOpportunities] = useState<any[]>([]);

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      // Satış ekibi
      const { data: teamData } = await supabase
        .from('sales_team')
        .select('*')
        .order('name');
      setSalesTeam(teamData || []);

      // Müşteri sayısı
      const { count: customerCount } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      // Fırsatlar
      const { data: opportunities } = await supabase
        .from('opportunities')
        .select('*');

      // Hedefler
      const { data: targets } = await supabase
        .from('sales_targets')
        .select('*')
        .eq('year', new Date().getFullYear());

      // Tahsilatlar
      const { data: collections } = await supabase
        .from('collections')
        .select('*');

      // Görevler
      const { count: taskCount } = await supabase
        .from('crm_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // Aktiviteler
      const { data: activities } = await supabase
        .from('crm_activities')
        .select('*')
        .order('activity_date', { ascending: false })
        .limit(5);

      setRecentActivities(activities || []);

      // Hesaplamalar
      const opps = opportunities || [];
      const tgts = targets || [];
      const colls = collections || [];

      const totalTarget = tgts.reduce((s, t) => s + (t.target_amount || 0), 0) || 1000000;
      const totalSales = tgts.reduce((s, t) => s + (t.actual_amount || 0), 0) || 850000;
      const collectionTarget = totalSales;
      const totalCollection = colls.filter(c => c.status === 'paid').reduce((s, c) => s + (c.amount || 0), 0) || totalSales * 0.85;
      
      const wonOpps = opps.filter(o => o.stage === 'won');
      const pipelineValue = opps.filter(o => o.stage !== 'lost' && o.stage !== 'won').reduce((s, o) => s + (o.value || 0), 0);

      // Hard stop risk - tahsilat %70 altında olanlar
      const hardStopRisk = teamData?.filter(t => {
        const repColls = colls.filter(c => c.sales_rep_id === t.id);
        const repInvoiced = repColls.reduce((s, c) => s + (c.amount || 0), 0);
        const repCollected = repColls.filter(c => c.status === 'paid').reduce((s, c) => s + (c.amount || 0), 0);
        return repInvoiced > 0 && (repCollected / repInvoiced) < 0.7;
      }).length || 0;

      setStats({
        totalSales,
        totalTarget,
        salesRatio: totalTarget > 0 ? totalSales / totalTarget : 0,
        totalCollection,
        collectionTarget,
        collectionRatio: collectionTarget > 0 ? totalCollection / collectionTarget : 0,
        pipelineValue,
        customerCount: customerCount || 0,
        newCustomers: 5, // Demo
        opportunityCount: opps.length,
        wonOpportunities: wonOpps.length,
        pendingTasks: taskCount || 0,
        teamCount: teamData?.length || 0,
        hardStopRisk,
      });

      // Top fırsatlar
      const topOpps = opps
        .filter(o => o.stage !== 'lost' && o.stage !== 'won')
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .slice(0, 5);
      setTopOpportunities(topOpps);

      // Aylık trend verisi (demo)
      const monthlyTrend = [];
      const currentMonth = new Date().getMonth();
      for (let i = 5; i >= 0; i--) {
        const m = (currentMonth - i + 12) % 12;
        monthlyTrend.push({
          month: MONTHS[m],
          satış: Math.round(totalSales / 6 * (0.8 + Math.random() * 0.4)),
          hedef: Math.round(totalTarget / 6),
          tahsilat: Math.round(totalCollection / 6 * (0.75 + Math.random() * 0.3)),
        });
      }
      setMonthlyData(monthlyTrend);

      // Takım performansı
      const teamPerf = (teamData || []).slice(0, 6).map(t => {
        const repTarget = tgts.find(tg => tg.person_id === t.id);
        const target = repTarget?.target_amount || 100000;
        const actual = repTarget?.actual_amount || Math.round(target * (0.7 + Math.random() * 0.5));
        return {
          name: t.name.split(' ')[0],
          hedef: target,
          gerçekleşen: actual,
          oran: Math.round(actual / target * 100),
        };
      });
      setTeamPerformance(teamPerf);

      // Pipeline dağılımı
      const stages = ['Yeni', 'Görüşme', 'Teklif', 'Müzakere'];
      const pipelineDist = stages.map(stage => ({
        name: stage,
        value: opps.filter(o => o.stage?.toLowerCase().includes(stage.toLowerCase())).length || Math.floor(Math.random() * 10) + 2,
      }));
      setPipelineData(pipelineDist);

    } catch (err) {
      console.error('Dashboard veri hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Özet değişim göstergeleri
  const changes = useMemo(() => ({
    sales: stats.salesRatio >= 1 ? 'up' : stats.salesRatio >= 0.9 ? 'stable' : 'down',
    collection: stats.collectionRatio >= 0.9 ? 'up' : stats.collectionRatio >= 0.7 ? 'stable' : 'down',
  }), [stats]);

  if (loading) {
    return (
      <div>
        <Header title="Dashboard" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Dashboard" subtitle="Satış Performans Özeti" />

      <div className="p-6">
        {/* Top KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          {/* Satış */}
          <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all duration-200" onClick={() => router.push('/opportunities')}>
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-indigo-100 text-sm">Toplam Satış</p>
                  <p className="text-2xl font-bold mt-1">₺{formatMoney(stats.totalSales)}</p>
                  <p className="text-indigo-200 text-xs mt-1">
                    Hedef: ₺{formatMoney(stats.totalTarget)}
                  </p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <DollarSign className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span>Gerçekleşme</span>
                  <span className="font-medium">{(stats.salesRatio * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2">
                  <div 
                    className="bg-white rounded-full h-2 transition-all duration-500" 
                    style={{ width: `${Math.min(stats.salesRatio * 100, 100)}%` }}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Tahsilat */}
          <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all duration-200" onClick={() => router.push('/collections')}>
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm">Tahsilat</p>
                  <p className="text-2xl font-bold mt-1">₺{formatMoney(stats.totalCollection)}</p>
                  <p className="text-emerald-200 text-xs mt-1">
                    Beklenen: ₺{formatMoney(stats.collectionTarget)}
                  </p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <CheckCircle className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span>Tahsilat Oranı</span>
                  <span className="font-medium">{(stats.collectionRatio * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2">
                  <div 
                    className={`rounded-full h-2 transition-all duration-500 ${stats.collectionRatio >= 0.7 ? 'bg-white' : 'bg-red-300'}`}
                    style={{ width: `${Math.min(stats.collectionRatio * 100, 100)}%` }}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Pipeline */}
          <Card className="bg-gradient-to-br from-violet-500 to-purple-600 text-white cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all duration-200" onClick={() => router.push('/opportunities')}>
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-violet-100 text-sm">Pipeline Değeri</p>
                  <p className="text-2xl font-bold mt-1">₺{formatMoney(stats.pipelineValue)}</p>
                  <p className="text-violet-200 text-xs mt-1">
                    {stats.opportunityCount} açık fırsat
                  </p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <Target className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="bg-white/20 px-2 py-0.5 rounded">
                  {stats.wonOpportunities} kazanıldı
                </span>
                <span className="text-violet-200">bu ay</span>
              </div>
            </CardBody>
          </Card>

          {/* Müşteriler */}
          <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all duration-200" onClick={() => router.push('/customers')}>
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-sm">Müşteriler</p>
                  <p className="text-2xl font-bold mt-1">{stats.customerCount}</p>
                  <p className="text-amber-200 text-xs mt-1 flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" />
                    +{stats.newCustomers} yeni bu ay
                  </p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <Building2 className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="bg-white/20 px-2 py-0.5 rounded flex items-center gap-1">
                  <Users className="h-3 w-3" /> {stats.teamCount} temsilci
                </span>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Alert Cards Row */}
        {(stats.hardStopRisk > 0 || stats.pendingTasks > 10) && (
          <div className="grid gap-4 md:grid-cols-2 mb-6">
            {stats.hardStopRisk > 0 && (
              <Card className="bg-red-50 border-red-200">
                <CardBody className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-red-100 rounded-xl">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-red-700">HARD STOP Riski!</p>
                    <p className="text-sm text-red-600">{stats.hardStopRisk} temsilcinin tahsilat oranı %70 altında</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-red-400 ml-auto" />
                </CardBody>
              </Card>
            )}
            {stats.pendingTasks > 10 && (
              <Card className="bg-amber-50 border-amber-200">
                <CardBody className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-amber-100 rounded-xl">
                    <Clock className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-amber-700">Bekleyen Görevler</p>
                    <p className="text-sm text-amber-600">{stats.pendingTasks} görev tamamlanmayı bekliyor</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-amber-400 ml-auto" />
                </CardBody>
              </Card>
            )}
          </div>
        )}

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Aylık Satış Trendi */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-indigo-600" />
                Aylık Satış & Tahsilat Trendi
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="colorSatis" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorTahsilat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₺${(v/1000).toFixed(0)}K`} />
                  <Tooltip 
                    formatter={(value: number) => [`₺${formatMoney(value)}`, '']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="satış" 
                    name="Satış"
                    stroke="#6366f1" 
                    fillOpacity={1} 
                    fill="url(#colorSatis)" 
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="tahsilat" 
                    name="Tahsilat"
                    stroke="#10b981" 
                    fillOpacity={1} 
                    fill="url(#colorTahsilat)"
                    strokeWidth={2}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="hedef" 
                    name="Hedef"
                    stroke="#94a3b8" 
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          {/* Takım Performansı */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
                Takım Performans Karşılaştırması
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={teamPerformance} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₺${(v/1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={60} />
                  <Tooltip 
                    formatter={(value: number) => [`₺${formatMoney(value)}`, '']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Legend />
                  <Bar dataKey="hedef" name="Hedef" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="gerçekleşen" name="Gerçekleşen" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        </div>

        {/* Bottom Row */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pipeline Dağılımı */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <PieChart className="h-4 w-4 text-violet-600" />
                Pipeline Aşama Dağılımı
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={200}>
                <RechartsPie>
                  <Pie
                    data={pipelineData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {pipelineData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPie>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {pipelineData.map((item, i) => (
                  <div key={i} className="flex items-center gap-1 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Top Fırsatlar */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-amber-600" />
                En Değerli Fırsatlar
              </CardTitle>
            </CardHeader>
            <CardBody>
              {topOpportunities.length > 0 ? (
                <ul className="space-y-3">
                  {topOpportunities.map((opp, i) => (
                    <li key={opp.id || i} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                        i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-300'
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{opp.title || opp.name || 'Fırsat'}</p>
                        <p className="text-xs text-slate-500">{opp.stage}</p>
                      </div>
                      <p className="font-bold text-sm text-emerald-600">₺{formatMoney(opp.value || 0)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center text-slate-400 py-8">
                  <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Henüz fırsat yok</p>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Son Aktiviteler */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-blue-600" />
                Son Aktiviteler
              </CardTitle>
            </CardHeader>
            <CardBody>
              {recentActivities.length > 0 ? (
                <ul className="space-y-3">
                  {recentActivities.map((act, i) => (
                    <li key={act.id || i} className="flex items-start gap-3">
                      <div className={`p-1.5 rounded-lg ${
                        act.type === 'call' ? 'bg-blue-100' :
                        act.type === 'meeting' ? 'bg-emerald-100' :
                        act.type === 'email' ? 'bg-violet-100' : 'bg-slate-100'
                      }`}>
                        <Activity className={`h-4 w-4 ${
                          act.type === 'call' ? 'text-blue-600' :
                          act.type === 'meeting' ? 'text-emerald-600' :
                          act.type === 'email' ? 'text-violet-600' : 'text-slate-600'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{act.subject || act.title || 'Aktivite'}</p>
                        <p className="text-xs text-slate-500">
                          {act.sales_person?.name || 'Ekip'} • {new Date(act.date || act.created_at).toLocaleDateString('tr-TR')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center text-slate-400 py-8">
                  <Activity className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Henüz aktivite yok</p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Quick Stats Footer */}
        <div className="mt-6 p-4 bg-slate-50 rounded-xl">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-center">
            <div className="cursor-pointer hover:bg-white hover:shadow rounded-lg p-2 transition-all" onClick={() => router.push('/team')}>
              <p className="text-2xl font-bold text-indigo-600">{stats.teamCount}</p>
              <p className="text-xs text-slate-500">Satış Temsilcisi</p>
            </div>
            <div className="cursor-pointer hover:bg-white hover:shadow rounded-lg p-2 transition-all" onClick={() => router.push('/customers')}>
              <p className="text-2xl font-bold text-emerald-600">{stats.customerCount}</p>
              <p className="text-xs text-slate-500">Toplam Müşteri</p>
            </div>
            <div className="cursor-pointer hover:bg-white hover:shadow rounded-lg p-2 transition-all" onClick={() => router.push('/opportunities')}>
              <p className="text-2xl font-bold text-violet-600">{stats.opportunityCount}</p>
              <p className="text-xs text-slate-500">Açık Fırsat</p>
            </div>
            <div className="cursor-pointer hover:bg-white hover:shadow rounded-lg p-2 transition-all" onClick={() => router.push('/opportunities')}>
              <p className="text-2xl font-bold text-amber-600">{stats.wonOpportunities}</p>
              <p className="text-xs text-slate-500">Kazanılan Fırsat</p>
            </div>
            <div className="cursor-pointer hover:bg-white hover:shadow rounded-lg p-2 transition-all" onClick={() => router.push('/opportunities')}>
              <p className="text-2xl font-bold text-blue-600">{(stats.salesRatio * 100).toFixed(0)}%</p>
              <p className="text-xs text-slate-500">Hedef Gerçekleşme</p>
            </div>
            <div className="cursor-pointer hover:bg-white hover:shadow rounded-lg p-2 transition-all" onClick={() => router.push('/collections')}>
              <p className="text-2xl font-bold text-teal-600">{(stats.collectionRatio * 100).toFixed(0)}%</p>
              <p className="text-xs text-slate-500">Tahsilat Oranı</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
