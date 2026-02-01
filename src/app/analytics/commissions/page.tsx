'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import {
  GlobalFiltersBar, KPICards, SummaryTable, DrilldownDrawer, SavedViewsMenu, ExportMenu
} from '@/components/AnalyticsComponents';
import {
  GlobalFilters, KPICard, SummaryRow, GroupByOption, SavedView,
  commissionColumns, generateCSV, downloadCSV
} from '@/lib/analytics-types';
import {
  DollarSign, Award, Users, AlertTriangle, Calculator, TrendingUp, BarChart3, PieChart
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, LineChart, Line
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function CommissionAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<GlobalFilters>({
    singleMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    status: 'all',
  });
  const [groupBy, setGroupBy] = useState<GroupByOption[]>(['team', 'rep']);
  
  // Data states
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [kpiCards, setKpiCards] = useState<KPICard[]>([]);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [chartData, setChartData] = useState<any[]>([]);
  const [distributionData, setDistributionData] = useState<any[]>([]);
  
  // Drilldown
  const [selectedRow, setSelectedRow] = useState<SummaryRow | null>(null);
  const [drilldownData, setDrilldownData] = useState<any[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  
  // Saved views
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [currentView, setCurrentView] = useState<SavedView | undefined>();

  const supabase = createClient();

  // ============ FETCH DATA ============
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch teams and reps
      const { data: teamData } = await supabase
        .from('sales_team')
        .select('id, name, department, region')
        .order('name');
      
      const uniqueTeams = [...new Set((teamData || []).map(t => t.department || 'Satış'))];
      setTeams(uniqueTeams.map(t => ({ id: t, name: t })));
      setReps((teamData || []).map(t => ({ id: t.id, name: t.name })));

      // Parse period
      const [year, month] = (filters.singleMonth || '2025-01').split('-').map(Number);

      // Fetch commission results
      const { data: results } = await supabase
        .from('commission_results')
        .select(`
          *,
          sales_rep:sales_team(id, name, department, region)
        `)
        .eq('period_year', year)
        .eq('period_month', month);

      // Fetch KPI inputs
      const { data: inputs } = await supabase
        .from('commission_kpi_inputs')
        .select('*')
        .eq('period_year', year)
        .eq('period_month', month);

      // Calculate KPIs
      const resultData = results || [];
      const inputData = inputs || [];
      
      const totalEarned = resultData.reduce((s, r) => s + (r.earned_commission || 0), 0);
      const totalBase = inputData.reduce((s, i) => s + (i.base_commission_amount || 0), 0);
      const hardStopCount = resultData.filter(r => r.hard_stop).length;
      const avgMultiplier = resultData.length > 0 
        ? resultData.reduce((s, r) => s + (r.total_multiplier || 0), 0) / resultData.length 
        : 0;

      setKpiCards([
        { key: 'total_earned', label: 'Kazanılan Prim', value: totalEarned, format: 'money', color: 'indigo', trend: 'up' },
        { key: 'total_base', label: 'Baz Prim', value: totalBase, format: 'money', color: 'emerald' },
        { key: 'avg_multiplier', label: 'Ort. Çarpan', value: avgMultiplier.toFixed(2), format: 'text', color: 'violet' },
        { key: 'reps_count', label: 'Hesaplanan', value: resultData.length, format: 'number', color: 'blue' },
        { key: 'hard_stop', label: 'Hard Stop', value: hardStopCount, format: 'number', color: 'red', trend: hardStopCount > 0 ? 'down' : 'stable' },
        { key: 'efficiency', label: 'Verimlilik', value: totalBase > 0 ? totalEarned / totalBase : 0, format: 'percent', color: 'amber' },
      ]);

      // Build summary rows grouped by team -> rep
      const groupedData: Record<string, Record<string, any[]>> = {};
      
      resultData.forEach(r => {
        const team = r.sales_rep?.department || 'Diğer';
        const repName = r.sales_rep?.name || 'Bilinmeyen';
        
        if (!groupedData[team]) groupedData[team] = {};
        if (!groupedData[team][repName]) groupedData[team][repName] = [];
        groupedData[team][repName].push(r);
      });

      const rows: SummaryRow[] = [];
      let grandTotalBase = 0, grandTotalEarned = 0, grandHardStop = 0;

      Object.entries(groupedData).forEach(([team, repData]) => {
        // Team subtotal row
        let teamBase = 0, teamEarned = 0, teamHardStop = 0, teamCount = 0;
        const repRows: SummaryRow[] = [];

        Object.entries(repData).forEach(([repName, results]) => {
          const repResult = results[0];
          const input = inputData.find(i => i.sales_rep_id === repResult.sales_rep_id);
          
          const base = input?.base_commission_amount || 0;
          const earned = repResult.earned_commission || 0;
          const hardStop = repResult.hard_stop ? 1 : 0;

          teamBase += base;
          teamEarned += earned;
          teamHardStop += hardStop;
          teamCount++;

          repRows.push({
            id: repResult.id,
            groupKey: `${team}-${repName}`,
            groupLabel: repName,
            groupLevel: 1,
            data: {
              rep_name: repName,
              team: team,
              base_commission_sum: base,
              earned_commission_sum: earned,
              avg_sales_attainment: repResult.sales_attainment_ratio || 0,
              avg_collections_ratio: repResult.collections_ratio || 0,
              avg_multiplier: repResult.total_multiplier || 0,
              hard_stop_count: hardStop,
              hard_stop_rate: hardStop,
              last_calculated_at: repResult.calculated_at || '-',
            },
          });
        });

        // Add team subtotal
        rows.push({
          id: `team-${team}`,
          groupKey: team,
          groupLabel: team,
          groupLevel: 0,
          isSubtotal: true,
          data: {
            rep_name: `${team} (${teamCount} kişi)`,
            team: team,
            base_commission_sum: teamBase,
            earned_commission_sum: teamEarned,
            avg_sales_attainment: repRows.reduce((s, r) => s + (r.data.avg_sales_attainment as number), 0) / teamCount,
            avg_collections_ratio: repRows.reduce((s, r) => s + (r.data.avg_collections_ratio as number), 0) / teamCount,
            avg_multiplier: repRows.reduce((s, r) => s + (r.data.avg_multiplier as number), 0) / teamCount,
            hard_stop_count: teamHardStop,
            hard_stop_rate: teamHardStop / teamCount,
            last_calculated_at: '-',
          },
          children: repRows,
        });

        // Add rep rows
        rows.push(...repRows);

        grandTotalBase += teamBase;
        grandTotalEarned += teamEarned;
        grandHardStop += teamHardStop;
      });

      setSummaryRows(rows);
      setTotals({
        base_commission_sum: grandTotalBase,
        earned_commission_sum: grandTotalEarned,
        hard_stop_count: grandHardStop,
        avg_multiplier: avgMultiplier,
      });

      // Chart data - Team comparison
      const chartRows = Object.entries(groupedData).map(([team, repData]) => {
        const teamResults = Object.values(repData).flat();
        const teamInputs = inputData.filter(i => teamResults.some(r => r.sales_rep_id === i.sales_rep_id));
        return {
          team,
          baz: teamInputs.reduce((s, i) => s + (i.base_commission_amount || 0), 0),
          kazanilan: teamResults.reduce((s, r) => s + (r.earned_commission || 0), 0),
        };
      });
      setChartData(chartRows);

      // Distribution data for pie chart
      const dist = [
        { name: 'Normal Ödeme', value: resultData.filter(r => !r.hard_stop && r.total_multiplier >= 1).length },
        { name: 'Düşük Çarpan', value: resultData.filter(r => !r.hard_stop && r.total_multiplier < 1).length },
        { name: 'Hard Stop', value: hardStopCount },
      ];
      setDistributionData(dist);

    } catch (err) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filters.singleMonth]);

  // ============ DRILLDOWN ============
  const handleRowClick = async (row: SummaryRow) => {
    if (row.isSubtotal || row.isGrandTotal) return;
    
    setSelectedRow(row);
    setDrilldownLoading(true);

    try {
      const [year, month] = (filters.singleMonth || '2025-01').split('-').map(Number);
      
      // Get detailed results for this rep
      const { data: results } = await supabase
        .from('commission_results')
        .select('*')
        .eq('sales_rep_id', row.id.replace('team-', ''))
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .limit(12);

      const { data: inputs } = await supabase
        .from('commission_kpi_inputs')
        .select('*')
        .eq('sales_rep_id', row.id);

      const drilldown = (results || []).map(r => {
        const input = inputs?.find(i => i.period_year === r.period_year && i.period_month === r.period_month);
        return {
          period: `${r.period_year}-${String(r.period_month).padStart(2, '0')}`,
          sales_target: input?.sales_target || 0,
          actual_sales: input?.actual_sales || 0,
          sales_ratio: r.sales_attainment_ratio,
          invoiced: input?.invoiced_amount || 0,
          collected: input?.collected_amount || 0,
          collection_ratio: r.collections_ratio,
          base_commission: input?.base_commission_amount || 0,
          multiplier: r.total_multiplier,
          earned_commission: r.earned_commission,
          hard_stop: r.hard_stop ? 'Evet' : 'Hayır',
          status: r.payment_status,
        };
      });

      setDrilldownData(drilldown);
    } catch (err) {
      console.error('Drilldown hatası:', err);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const drilldownColumns = [
    { key: 'period', label: 'Dönem', format: 'text' as const },
    { key: 'sales_target', label: 'Satış Hedefi', format: 'money' as const },
    { key: 'actual_sales', label: 'Gerçekleşen', format: 'money' as const },
    { key: 'sales_ratio', label: 'Satış %', format: 'percent' as const },
    { key: 'collection_ratio', label: 'Tahsilat %', format: 'percent' as const },
    { key: 'base_commission', label: 'Baz Prim', format: 'money' as const },
    { key: 'multiplier', label: 'Çarpan', format: 'number' as const },
    { key: 'earned_commission', label: 'Kazanılan', format: 'money' as const },
    { key: 'hard_stop', label: 'Hard Stop', format: 'text' as const },
    { key: 'status', label: 'Durum', format: 'text' as const },
  ];

  // ============ EXPORTS ============
  const handleExportSummary = () => {
    const csv = generateCSV(
      summaryRows,
      commissionColumns.map(c => ({ key: c.key, label: c.label, format: c.format }))
    );
    downloadCSV(csv, `prim-ozet-${filters.singleMonth}.csv`);
  };

  const handleExportDetails = () => {
    const csv = generateCSV(drilldownData, drilldownColumns);
    downloadCSV(csv, `prim-detay-${selectedRow?.data.rep_name || 'tum'}-${filters.singleMonth}.csv`);
  };

  return (
    <div>
      <Header title="Prim Analitik" subtitle="Detaylı Komisyon Analiz Tabloları" />

      <div className="p-6">
        {/* Global Filters */}
        <GlobalFiltersBar
          filters={filters}
          onFiltersChange={setFilters}
          teams={teams}
          reps={reps}
          showStatus={true}
          statusOptions={[
            { value: 'all', label: 'Tümü' },
            { value: 'pending', label: 'Bekliyor' },
            { value: 'approved', label: 'Onaylı' },
          ]}
          onRefresh={fetchData}
          loading={loading}
        />

        {/* KPI Cards */}
        <KPICards cards={kpiCards} loading={loading} />

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Team Comparison Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-600" />
                Takım Bazlı Prim Karşılaştırması
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="team" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₺${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={(value: number) => [`₺${formatMoney(value)}`, '']} />
                  <Legend />
                  <Bar dataKey="baz" name="Baz Prim" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="kazanilan" name="Kazanılan" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          {/* Distribution Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <PieChart className="h-4 w-4 text-violet-600" />
                Prim Dağılımı
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={250}>
                <RechartsPie>
                  <Pie
                    data={distributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: %${(percent * 100).toFixed(0)}`}
                    labelLine={false}
                  >
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPie>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                {distributionData.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                    <span>{item.name}: {item.value}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Export Actions */}
        <div className="flex justify-end mb-4">
          <ExportMenu
            onExportSummary={handleExportSummary}
            onExportDetails={handleExportDetails}
          />
        </div>

        {/* Summary Table */}
        <SummaryTable
          title="Prim Özet Tablosu"
          columns={commissionColumns}
          rows={summaryRows}
          loading={loading}
          groupBy={groupBy}
          availableGroupBys={['team', 'rep', 'month']}
          onGroupByChange={setGroupBy}
          onRowClick={handleRowClick}
          totals={totals}
        />

        {/* Hard Stop Analysis Card */}
        {summaryRows.filter(r => !r.isSubtotal && Number(r.data.hard_stop_count) > 0).length > 0 && (
          <Card className="mt-6 bg-red-50 border-red-200">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Hard Stop Analizi
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {summaryRows
                  .filter(r => !r.isSubtotal && Number(r.data.hard_stop_count) > 0)
                  .map((row, i) => (
                    <div key={i} className="p-3 bg-white rounded-lg border border-red-200">
                      <p className="font-medium text-slate-800">{row.data.rep_name}</p>
                      <p className="text-sm text-red-600">
                        Tahsilat: %{((row.data.avg_collections_ratio as number) * 100).toFixed(0)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Kaybedilen: ₺{formatMoney((row.data.base_commission_sum as number) - (row.data.earned_commission_sum as number))}
                      </p>
                    </div>
                  ))}
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {/* Drilldown Drawer */}
      <DrilldownDrawer
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={`Prim Detayı - ${selectedRow?.data.rep_name || ''}`}
        subtitle="Son 12 aylık prim geçmişi"
        columns={drilldownColumns}
        rows={drilldownData}
        loading={drilldownLoading}
      />
    </div>
  );
}
