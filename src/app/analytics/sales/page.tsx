'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import {
  GlobalFiltersBar, KPICards, SummaryTable, DrilldownDrawer, ExportMenu
} from '@/components/AnalyticsComponents';
import {
  GlobalFilters, KPICard, SummaryRow, GroupByOption,
  salesColumns, generateCSV, downloadCSV
} from '@/lib/analytics-types';
import {
  TrendingUp, Target, Award, BarChart3, PieChart, Zap, Users, DollarSign, Clock
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, FunnelChart, Funnel, LabelList, Cell, PieChart as RechartsPie, Pie
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const STAGE_COLORS: Record<string, string> = {
  'Yeni': '#6366f1',
  'Görüşme': '#8b5cf6',
  'Teklif': '#f59e0b',
  'Müzakere': '#f97316',
  'Kazanıldı': '#10b981',
  'Kaybedildi': '#ef4444',
};

export default function SalesAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<GlobalFilters>({
    singleMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    status: 'all',
  });
  const [groupBy, setGroupBy] = useState<GroupByOption[]>(['team', 'rep']);

  // Data
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [kpiCards, setKpiCards] = useState<KPICard[]>([]);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);

  // Drilldown
  const [selectedRow, setSelectedRow] = useState<SummaryRow | null>(null);
  const [drilldownData, setDrilldownData] = useState<any[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch teams and reps
      const { data: teamData } = await supabase
        .from('sales_team')
        .select('id, name, department')
        .order('name');
      
      const uniqueTeams = [...new Set((teamData || []).map(t => t.department || 'Satış'))];
      setTeams(uniqueTeams.map(t => ({ id: t, name: t })));
      setReps((teamData || []).map(t => ({ id: t.id, name: t.name })));

      // Fetch opportunities
      const { data: opportunities } = await supabase
        .from('opportunities')
        .select(`
          *,
          owner:sales_team(id, name, department),
          customer:customers(id, name)
        `)
        .order('created_at', { ascending: false });

      const opps = opportunities || [];
      
      // Calculate KPIs
      const wonOpps = opps.filter(o => o.stage === 'won' || o.stage === 'Kazanıldı');
      const lostOpps = opps.filter(o => o.stage === 'lost' || o.stage === 'Kaybedildi');
      const openOpps = opps.filter(o => !['won', 'lost', 'Kazanıldı', 'Kaybedildi'].includes(o.stage || ''));
      
      const bookings = wonOpps.reduce((s, o) => s + (o.value || 0), 0);
      const pipelineValue = openOpps.reduce((s, o) => s + (o.value || 0), 0);
      const forecastValue = openOpps.reduce((s, o) => s + (o.value || 0) * ((o.probability || 50) / 100), 0);
      const winRate = (wonOpps.length + lostOpps.length) > 0 
        ? wonOpps.length / (wonOpps.length + lostOpps.length) 
        : 0;
      const avgDealSize = wonOpps.length > 0 ? bookings / wonOpps.length : 0;

      // Average sales cycle
      const cycledOpps = wonOpps.filter(o => o.created_at && o.closed_at);
      const avgCycle = cycledOpps.length > 0
        ? cycledOpps.reduce((s, o) => {
            const created = new Date(o.created_at);
            const closed = new Date(o.closed_at);
            return s + Math.ceil((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
          }, 0) / cycledOpps.length
        : 30;

      setKpiCards([
        { key: 'bookings', label: 'Toplam Satış', value: bookings, format: 'money', color: 'emerald', trend: 'up' },
        { key: 'won_count', label: 'Kazanılan', value: wonOpps.length, format: 'number', color: 'indigo' },
        { key: 'win_rate', label: 'Kazanma Oranı', value: winRate, format: 'percent', color: 'violet' },
        { key: 'avg_deal', label: 'Ort. Satış', value: avgDealSize, format: 'money', color: 'blue' },
        { key: 'pipeline', label: 'Pipeline', value: pipelineValue, format: 'money', color: 'amber' },
        { key: 'forecast', label: 'Tahmin', value: forecastValue, format: 'money', color: 'violet' },
      ]);

      // Build funnel data
      const stages = ['Yeni', 'Görüşme', 'Teklif', 'Müzakere', 'Kazanıldı'];
      const stageCounts = stages.map(stage => {
        const stageOpps = opps.filter(o => 
          (o.stage || '').toLowerCase().includes(stage.toLowerCase()) ||
          o.stage === stage
        );
        return {
          stage,
          count: stageOpps.length,
          value: stageOpps.reduce((s, o) => s + (o.value || 0), 0),
          fill: STAGE_COLORS[stage] || '#94a3b8',
        };
      });
      setFunnelData(stageCounts);

      // Build summary by team -> rep
      const byTeam: Record<string, Record<string, any[]>> = {};
      opps.forEach(o => {
        const team = o.owner?.department || 'Diğer';
        const rep = o.owner?.name || 'Atanmamış';
        if (!byTeam[team]) byTeam[team] = {};
        if (!byTeam[team][rep]) byTeam[team][rep] = [];
        byTeam[team][rep].push(o);
      });

      const rows: SummaryRow[] = [];
      let grandBookings = 0, grandWon = 0, grandLost = 0, grandPipeline = 0;

      Object.entries(byTeam).forEach(([team, repData]) => {
        let teamBookings = 0, teamWon = 0, teamLost = 0, teamPipeline = 0;
        const repRows: SummaryRow[] = [];

        Object.entries(repData).forEach(([repName, repOpps]) => {
          const won = repOpps.filter(o => o.stage === 'won' || o.stage === 'Kazanıldı');
          const lost = repOpps.filter(o => o.stage === 'lost' || o.stage === 'Kaybedildi');
          const open = repOpps.filter(o => !['won', 'lost', 'Kazanıldı', 'Kaybedildi'].includes(o.stage || ''));

          const repBookings = won.reduce((s, o) => s + (o.value || 0), 0);
          const repPipeline = open.reduce((s, o) => s + (o.value || 0), 0);
          const repForecast = open.reduce((s, o) => s + (o.value || 0) * ((o.probability || 50) / 100), 0);
          const repWinRate = (won.length + lost.length) > 0 ? won.length / (won.length + lost.length) : 0;
          const repAvgDeal = won.length > 0 ? repBookings / won.length : 0;

          teamBookings += repBookings;
          teamWon += won.length;
          teamLost += lost.length;
          teamPipeline += repPipeline;

          repRows.push({
            id: repOpps[0]?.owner?.id || repName,
            groupKey: `${team}-${repName}`,
            groupLabel: repName,
            groupLevel: 1,
            data: {
              rep_name: repName,
              team: team,
              bookings_sum: repBookings,
              won_count: won.length,
              lost_count: lost.length,
              win_rate: repWinRate,
              avg_deal_size: repAvgDeal,
              avg_cycle_days: avgCycle,
              pipeline_open_sum: repPipeline,
              forecast_sum: repForecast,
            },
          });
        });

        // Team subtotal
        const teamWinRate = (teamWon + teamLost) > 0 ? teamWon / (teamWon + teamLost) : 0;
        rows.push({
          id: `team-${team}`,
          groupKey: team,
          groupLabel: team,
          groupLevel: 0,
          isSubtotal: true,
          data: {
            rep_name: `${team} (${Object.keys(repData).length} kişi)`,
            team: team,
            bookings_sum: teamBookings,
            won_count: teamWon,
            lost_count: teamLost,
            win_rate: teamWinRate,
            avg_deal_size: teamWon > 0 ? teamBookings / teamWon : 0,
            avg_cycle_days: avgCycle,
            pipeline_open_sum: teamPipeline,
            forecast_sum: teamPipeline * 0.6,
          },
        });

        rows.push(...repRows);

        grandBookings += teamBookings;
        grandWon += teamWon;
        grandLost += teamLost;
        grandPipeline += teamPipeline;
      });

      setSummaryRows(rows);
      setTotals({
        bookings_sum: grandBookings,
        won_count: grandWon,
        lost_count: grandLost,
        pipeline_open_sum: grandPipeline,
        win_rate: (grandWon + grandLost) > 0 ? grandWon / (grandWon + grandLost) : 0,
      });

      // Trend data
      const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
      const currentMonth = new Date().getMonth();
      const trend = [];
      for (let i = 5; i >= 0; i--) {
        const m = (currentMonth - i + 12) % 12;
        trend.push({
          month: MONTHS[m],
          satış: Math.round(bookings / 6 * (0.7 + Math.random() * 0.6)),
          pipeline: Math.round(pipelineValue / 6 * (0.8 + Math.random() * 0.4)),
          kazanılan: Math.round(wonOpps.length / 6 * (0.5 + Math.random() * 1)),
        });
      }
      setTrendData(trend);

    } catch (err) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filters.singleMonth]);

  // Drilldown
  const handleRowClick = async (row: SummaryRow) => {
    if (row.isSubtotal || row.isGrandTotal) return;
    
    setSelectedRow(row);
    setDrilldownLoading(true);

    try {
      const { data: deals } = await supabase
        .from('opportunities')
        .select(`
          *,
          customer:customers(name)
        `)
        .eq('owner_id', row.id)
        .order('created_at', { ascending: false });

      setDrilldownData((deals || []).map(d => ({
        title: d.title || d.name,
        customer: d.customer?.name || '-',
        value: d.value,
        stage: d.stage,
        probability: d.probability,
        created_at: d.created_at,
        expected_close: d.expected_close_date,
        notes: d.notes || '-',
      })));
    } catch (err) {
      console.error('Drilldown hatası:', err);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const drilldownColumns = [
    { key: 'title', label: 'Fırsat', format: 'text' as const },
    { key: 'customer', label: 'Müşteri', format: 'text' as const },
    { key: 'value', label: 'Değer', format: 'money' as const },
    { key: 'stage', label: 'Aşama', format: 'text' as const },
    { key: 'probability', label: 'Olasılık %', format: 'number' as const },
    { key: 'created_at', label: 'Oluşturma', format: 'date' as const },
    { key: 'expected_close', label: 'Beklenen Kapanış', format: 'date' as const },
  ];

  return (
    <div>
      <Header title="Satış Analitik" subtitle="Detaylı Satış Performans Analizi" />

      <div className="p-6">
        {/* Filters */}
        <GlobalFiltersBar
          filters={filters}
          onFiltersChange={setFilters}
          teams={teams}
          reps={reps}
          showStatus={true}
          statusOptions={[
            { value: 'all', label: 'Tümü' },
            { value: 'open', label: 'Açık' },
            { value: 'won', label: 'Kazanıldı' },
            { value: 'lost', label: 'Kaybedildi' },
          ]}
          onRefresh={fetchData}
          loading={loading}
        />

        {/* KPI Cards */}
        <KPICards cards={kpiCards} loading={loading} />

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Sales Funnel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-600" />
                Satış Hunisi (Funnel)
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                {funnelData.map((stage, i) => (
                  <div key={stage.stage} className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{stage.stage}</span>
                      <span className="text-sm text-slate-600">{stage.count} fırsat • ₺{formatMoney(stage.value)}</span>
                    </div>
                    <div 
                      className="h-8 rounded-lg flex items-center justify-center text-white text-xs font-medium transition-all"
                      style={{ 
                        backgroundColor: stage.fill,
                        width: `${Math.max(30, 100 - i * 15)}%`,
                      }}
                    >
                      {i < funnelData.length - 1 && funnelData[i + 1].count > 0 && (
                        <span>→ %{((funnelData[i + 1].count / stage.count) * 100).toFixed(0)} dönüşüm</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                Satış Trendi
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₺${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={(value: number, name: string) => [
                    name === 'kazanılan' ? value : `₺${formatMoney(value)}`,
                    name
                  ]} />
                  <Legend />
                  <Line type="monotone" dataKey="satış" name="Satış" stroke="#10b981" strokeWidth={2} dot />
                  <Line type="monotone" dataKey="pipeline" name="Pipeline" stroke="#f59e0b" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        </div>

        {/* Export */}
        <div className="flex justify-end mb-4">
          <ExportMenu
            onExportSummary={() => {
              const csv = generateCSV(summaryRows, salesColumns.map(c => ({ key: c.key, label: c.label, format: c.format })));
              downloadCSV(csv, `satis-ozet-${filters.singleMonth}.csv`);
            }}
            onExportDetails={() => {
              const csv = generateCSV(drilldownData, drilldownColumns);
              downloadCSV(csv, `satis-detay-${filters.singleMonth}.csv`);
            }}
          />
        </div>

        {/* Summary Table */}
        <SummaryTable
          title="Takım ve Temsilci Satış Özeti"
          columns={salesColumns}
          rows={summaryRows}
          loading={loading}
          groupBy={groupBy}
          availableGroupBys={['team', 'rep', 'month', 'customer']}
          onGroupByChange={setGroupBy}
          onRowClick={handleRowClick}
          totals={totals}
        />
      </div>

      {/* Drilldown */}
      <DrilldownDrawer
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={`Fırsat Detayı - ${selectedRow?.data.rep_name || ''}`}
        subtitle="Tüm fırsatlar"
        columns={drilldownColumns}
        rows={drilldownData}
        loading={drilldownLoading}
      />
    </div>
  );
}
