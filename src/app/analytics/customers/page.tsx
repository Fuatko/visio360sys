'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, ProgressBar } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import {
  GlobalFiltersBar, KPICards, SummaryTable, DrilldownDrawer, ExportMenu
} from '@/components/AnalyticsComponents';
import {
  GlobalFilters, KPICard, SummaryRow, GroupByOption,
  customerColumns, generateCSV, downloadCSV
} from '@/lib/analytics-types';
import {
  Building2, Users, AlertTriangle, TrendingUp, DollarSign, Calendar, Phone, Mail,
  Activity, Clock, CheckCircle, XCircle, BarChart3
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, Treemap
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
const RISK_COLORS: Record<string, string> = {
  'Düşük': '#10b981',
  'Orta': '#f59e0b',
  'Yüksek': '#ef4444',
};

export default function CustomerAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<GlobalFilters>({
    singleMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    status: 'all',
  });
  const [groupBy, setGroupBy] = useState<GroupByOption[]>(['region']);

  // Data
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [kpiCards, setKpiCards] = useState<KPICard[]>([]);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [segmentData, setSegmentData] = useState<any[]>([]);
  const [riskData, setRiskData] = useState<any[]>([]);

  // Drilldown
  const [selectedRow, setSelectedRow] = useState<SummaryRow | null>(null);
  const [drilldownData, setDrilldownData] = useState<any[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [customerDetail, setCustomerDetail] = useState<any | null>(null);

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch customers with related data
      const { data: customers } = await supabase
        .from('customers')
        .select(`
          *,
          assigned_rep:sales_team(id, name, department)
        `)
        .order('name');

      // Fetch collections for customer analytics
      const { data: collections } = await supabase
        .from('collections')
        .select('*');

      // Fetch opportunities
      const { data: opportunities } = await supabase
        .from('opportunities')
        .select('*');

      // Fetch activities
      const { data: activities } = await supabase
        .from('crm_activities')
        .select('*');

      // Fetch reps
      const { data: repData } = await supabase
        .from('sales_team')
        .select('id, name, region')
        .order('name');
      setReps((repData || []).map(r => ({ id: r.id, name: r.name })));

      const custData = customers || [];
      const collData = collections || [];
      const oppData = opportunities || [];
      const actData = activities || [];
      const today = new Date();

      // Extract unique regions
      const uniqueRegions = [...new Set(custData.map(c => c.region || 'Diğer'))];
      setRegions(uniqueRegions.map(r => ({ id: r, name: r })));

      // Calculate customer-level metrics
      const customerMetrics = custData.map(cust => {
        const custColls = collData.filter(c => c.customer_id === cust.id);
        const custOpps = oppData.filter(o => o.customer_id === cust.id);
        const custActs = actData.filter(a => a.customer_id === cust.id);

        const invoiced = custColls.reduce((s, c) => s + (c.amount || 0), 0);
        const collected = custColls.filter(c => c.status === 'paid').reduce((s, c) => s + (c.amount || 0), 0);
        const overdue = custColls.filter(c => c.status !== 'paid' && new Date(c.due_date) < today);
        const overdueAmount = overdue.reduce((s, c) => s + (c.amount || 0), 0);
        const overdueCount = overdue.length;

        const avgDaysOverdue = overdueCount > 0
          ? overdue.reduce((s, c) => s + Math.ceil((today.getTime() - new Date(c.due_date).getTime()) / (1000 * 60 * 60 * 24)), 0) / overdueCount
          : 0;

        const wonOpps = custOpps.filter(o => o.stage === 'won' || o.stage === 'Kazanıldı');
        const totalSales = wonOpps.reduce((s, o) => s + (o.value || 0), 0);

        const lastActivity = custActs.sort((a, b) => new Date(b.date || b.created_at).getTime() - new Date(a.date || a.created_at).getTime())[0];
        const lastContactDate = lastActivity ? lastActivity.date || lastActivity.created_at : null;
        const daysSinceContact = lastContactDate 
          ? Math.ceil((today.getTime() - new Date(lastContactDate).getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        // Risk calculation
        let riskScore = 0;
        if (overdueAmount > 50000) riskScore += 30;
        else if (overdueAmount > 10000) riskScore += 15;
        if (avgDaysOverdue > 60) riskScore += 25;
        else if (avgDaysOverdue > 30) riskScore += 10;
        if (daysSinceContact > 60) riskScore += 25;
        else if (daysSinceContact > 30) riskScore += 10;
        if (totalSales === 0) riskScore += 20;

        const riskStatus = riskScore >= 50 ? 'Yüksek' : riskScore >= 25 ? 'Orta' : 'Düşük';

        return {
          ...cust,
          total_sales: totalSales,
          total_invoiced: invoiced,
          total_collected: collected,
          overdue_amount: overdueAmount,
          overdue_invoice_count: overdueCount,
          avg_days_overdue: avgDaysOverdue,
          dso_estimate: invoiced > 0 ? (invoiced - collected) / invoiced * 30 : 0,
          last_contact_date: lastContactDate,
          days_since_contact: daysSinceContact,
          risk_status: riskStatus,
          risk_score: riskScore,
        };
      });

      // KPIs
      const activeCustomers = customerMetrics.filter(c => c.status === 'active' || !c.status);
      const atRiskCustomers = customerMetrics.filter(c => c.risk_status === 'Yüksek');
      const overdueCustomers = customerMetrics.filter(c => c.overdue_invoice_count > 0);
      const totalOverdue = customerMetrics.reduce((s, c) => s + c.overdue_amount, 0);
      const totalInvoiced = customerMetrics.reduce((s, c) => s + c.total_invoiced, 0);

      setKpiCards([
        { key: 'active', label: 'Aktif Müşteri', value: activeCustomers.length, format: 'number', color: 'indigo' },
        { key: 'new', label: 'Yeni Müşteri', value: customerMetrics.filter(c => {
          const created = new Date(c.created_at);
          return created.getMonth() === today.getMonth() && created.getFullYear() === today.getFullYear();
        }).length, format: 'number', color: 'emerald', trend: 'up' },
        { key: 'at_risk', label: 'Riskli Müşteri', value: atRiskCustomers.length, format: 'number', color: 'red', trend: atRiskCustomers.length > 0 ? 'down' : 'stable' },
        { key: 'overdue', label: 'Gecikmeli Müşteri', value: overdueCustomers.length, format: 'number', color: 'amber' },
        { key: 'total_overdue', label: 'Toplam Gecikme', value: totalOverdue, format: 'money', color: 'red' },
        { key: 'total_invoiced', label: 'Toplam Ciro', value: totalInvoiced, format: 'money', color: 'blue' },
      ]);

      // Summary rows
      const rows: SummaryRow[] = customerMetrics.map(cust => ({
        id: cust.id,
        groupKey: cust.id,
        groupLabel: cust.name,
        groupLevel: 0,
        data: {
          customer_name: cust.name,
          segment: cust.segment || 'Standart',
          region: cust.region || 'Diğer',
          total_sales: cust.total_sales,
          total_invoiced: cust.total_invoiced,
          total_collected: cust.total_collected,
          overdue_amount: cust.overdue_amount,
          overdue_invoice_count: cust.overdue_invoice_count,
          avg_days_overdue: cust.avg_days_overdue,
          dso_estimate: cust.dso_estimate,
          last_contact_date: cust.last_contact_date,
          next_follow_up_date: null,
          risk_status: cust.risk_status,
        },
      }));

      setSummaryRows(rows);
      setTotals({
        total_sales: customerMetrics.reduce((s, c) => s + c.total_sales, 0),
        total_invoiced: totalInvoiced,
        total_collected: customerMetrics.reduce((s, c) => s + c.total_collected, 0),
        overdue_amount: totalOverdue,
        overdue_invoice_count: customerMetrics.reduce((s, c) => s + c.overdue_invoice_count, 0),
      });

      // Segment distribution
      const segments = [...new Set(customerMetrics.map(c => c.segment || 'Standart'))];
      const segDist = segments.map(seg => ({
        name: seg,
        value: customerMetrics.filter(c => (c.segment || 'Standart') === seg).length,
        sales: customerMetrics.filter(c => (c.segment || 'Standart') === seg).reduce((s, c) => s + c.total_sales, 0),
      }));
      setSegmentData(segDist);

      // Risk distribution
      const riskDist = [
        { name: 'Düşük Risk', value: customerMetrics.filter(c => c.risk_status === 'Düşük').length, color: '#10b981' },
        { name: 'Orta Risk', value: customerMetrics.filter(c => c.risk_status === 'Orta').length, color: '#f59e0b' },
        { name: 'Yüksek Risk', value: customerMetrics.filter(c => c.risk_status === 'Yüksek').length, color: '#ef4444' },
      ];
      setRiskData(riskDist);

    } catch (err) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filters.singleMonth]);

  // Drilldown
  const handleRowClick = async (row: SummaryRow) => {
    setSelectedRow(row);
    setDrilldownLoading(true);

    try {
      // Fetch customer details
      const { data: customer } = await supabase
        .from('customers')
        .select(`
          *,
          assigned_rep:sales_team(name)
        `)
        .eq('id', row.id)
        .single();

      setCustomerDetail(customer);

      // Fetch invoices
      const { data: invoices } = await supabase
        .from('collections')
        .select('*')
        .eq('customer_id', row.id)
        .order('due_date', { ascending: false });

      // Fetch recent activities
      const { data: activities } = await supabase
        .from('crm_activities')
        .select('*')
        .eq('customer_id', row.id)
        .order('date', { ascending: false })
        .limit(10);

      const drilldown = [
        ...(invoices || []).map(inv => ({
          type: 'Fatura',
          date: inv.due_date,
          description: `Fatura #${inv.invoice_number || inv.id.slice(0, 8)}`,
          amount: inv.amount,
          status: inv.status === 'paid' ? 'Ödendi' : new Date(inv.due_date) < new Date() ? 'Vadesi Geçti' : 'Açık',
        })),
        ...(activities || []).map(act => ({
          type: act.type === 'call' ? 'Arama' : act.type === 'meeting' ? 'Toplantı' : act.type === 'email' ? 'E-posta' : 'Aktivite',
          date: act.date || act.created_at,
          description: act.subject || act.notes || '-',
          amount: null,
          status: act.status || 'Tamamlandı',
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setDrilldownData(drilldown);
    } catch (err) {
      console.error('Drilldown hatası:', err);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const drilldownColumns = [
    { key: 'type', label: 'Tür', format: 'text' as const },
    { key: 'date', label: 'Tarih', format: 'date' as const },
    { key: 'description', label: 'Açıklama', format: 'text' as const },
    { key: 'amount', label: 'Tutar', format: 'money' as const },
    { key: 'status', label: 'Durum', format: 'text' as const },
  ];

  return (
    <div>
      <Header title="Müşteri Takip" subtitle="Detaylı Müşteri Analiz ve Risk Değerlendirmesi" />

      <div className="p-6">
        {/* Filters */}
        <GlobalFiltersBar
          filters={filters}
          onFiltersChange={setFilters}
          regions={regions}
          reps={reps}
          showStatus={true}
          statusOptions={[
            { value: 'all', label: 'Tümü' },
            { value: 'active', label: 'Aktif' },
            { value: 'at_risk', label: 'Riskli' },
            { value: 'inactive', label: 'Pasif' },
          ]}
          onRefresh={fetchData}
          loading={loading}
        />

        {/* KPI Cards */}
        <KPICards cards={kpiCards} loading={loading} />

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Segment Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-600" />
                Segment Dağılımı
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={segmentData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip formatter={(value: number, name: string) => [
                    name === 'sales' ? `₺${formatMoney(value)}` : value,
                    name === 'sales' ? 'Satış' : 'Müşteri Sayısı'
                  ]} />
                  <Legend />
                  <Bar dataKey="value" name="Müşteri" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          {/* Risk Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Risk Dağılımı
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={250}>
                <RechartsPie>
                  <Pie
                    data={riskData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: %${(percent * 100).toFixed(0)}`}
                    labelLine={false}
                  >
                    {riskData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPie>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                {riskData.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{item.name}: {item.value}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Export */}
        <div className="flex justify-end mb-4">
          <ExportMenu
            onExportSummary={() => {
              const csv = generateCSV(summaryRows, customerColumns.map(c => ({ key: c.key, label: c.label, format: c.format })));
              downloadCSV(csv, `musteri-ozet-${filters.singleMonth}.csv`);
            }}
            onExportDetails={() => {
              const csv = generateCSV(drilldownData, drilldownColumns);
              downloadCSV(csv, `musteri-detay-${selectedRow?.data.customer_name || 'tum'}.csv`);
            }}
          />
        </div>

        {/* Summary Table */}
        <SummaryTable
          title="Müşteri Detay Tablosu"
          columns={customerColumns}
          rows={summaryRows}
          loading={loading}
          groupBy={groupBy}
          availableGroupBys={['region', 'rep', 'status']}
          onGroupByChange={setGroupBy}
          onRowClick={handleRowClick}
          totals={totals}
        />

        {/* High Risk Customers Alert */}
        {summaryRows.filter(r => r.data.risk_status === 'Yüksek').length > 0 && (
          <Card className="mt-6 bg-red-50 border-red-200">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Yüksek Riskli Müşteriler
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {summaryRows
                  .filter(r => r.data.risk_status === 'Yüksek')
                  .slice(0, 6)
                  .map((row, i) => (
                    <div 
                      key={i} 
                      className="p-3 bg-white rounded-lg border border-red-200 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleRowClick(row)}
                    >
                      <p className="font-medium text-slate-800">{row.data.customer_name}</p>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                        <div>
                          <p className="text-slate-500">Gecikmiş</p>
                          <p className="font-medium text-red-600">₺{formatMoney(row.data.overdue_amount as number)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Ort. Gecikme</p>
                          <p className="font-medium">{(row.data.avg_days_overdue as number).toFixed(0)} gün</p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {/* Drilldown Drawer - Extended for Customer */}
      <DrilldownDrawer
        isOpen={!!selectedRow}
        onClose={() => { setSelectedRow(null); setCustomerDetail(null); }}
        title={`Müşteri Detayı - ${selectedRow?.data.customer_name || ''}`}
        subtitle={customerDetail ? `${customerDetail.segment || 'Standart'} • ${customerDetail.region || 'Bölge yok'}` : ''}
        columns={drilldownColumns}
        rows={drilldownData}
        loading={drilldownLoading}
      />
    </div>
  );
}
