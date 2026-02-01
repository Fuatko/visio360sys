'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import {
  GlobalFiltersBar, KPICards, SummaryTable, DrilldownDrawer, AgingTable, ExportMenu
} from '@/components/AnalyticsComponents';
import {
  GlobalFilters, KPICard, SummaryRow, GroupByOption,
  collectionsColumns, agingColumns, generateCSV, downloadCSV
} from '@/lib/analytics-types';
import {
  DollarSign, CreditCard, AlertTriangle, Clock, CheckCircle, TrendingUp, Calendar, BarChart3
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart as RechartsPie, Pie, Cell
} from 'recharts';

const COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444'];

export default function CollectionsAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<GlobalFilters>({
    singleMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    status: 'all',
  });
  const [groupBy, setGroupBy] = useState<GroupByOption[]>(['customer', 'status']);

  // Data
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [kpiCards, setKpiCards] = useState<KPICard[]>([]);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [agingData, setAgingData] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);

  // Drilldown
  const [selectedRow, setSelectedRow] = useState<SummaryRow | null>(null);
  const [drilldownData, setDrilldownData] = useState<any[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch reference data
      const { data: custData } = await supabase
        .from('customers')
        .select('id, name')
        .order('name');
      setCustomers(custData || []);

      const { data: repData } = await supabase
        .from('sales_team')
        .select('id, name')
        .order('name');
      setReps(repData || []);

      // Fetch collections
      const { data: collections } = await supabase
        .from('collections')
        .select(`
          *,
          customer:customers(id, name, segment),
          sales_rep:sales_team(id, name, department)
        `)
        .order('due_date', { ascending: false });

      const collData = collections || [];
      const today = new Date();

      // Calculate KPIs
      const totalInvoiced = collData.reduce((s, c) => s + (c.amount || 0), 0);
      const paidColls = collData.filter(c => c.status === 'paid');
      const totalCollected = paidColls.reduce((s, c) => s + (c.amount || 0), 0);
      const openColls = collData.filter(c => c.status !== 'paid');
      const openAmount = openColls.reduce((s, c) => s + (c.amount || 0), 0);
      
      const overdueColls = openColls.filter(c => new Date(c.due_date) < today);
      const overdueAmount = overdueColls.reduce((s, c) => s + (c.amount || 0), 0);

      // DSO calculation
      const avgDaysToPay = paidColls.length > 0
        ? paidColls.reduce((s, c) => {
            const issued = new Date(c.created_at);
            const paid = new Date(c.paid_date || c.updated_at);
            return s + Math.ceil((paid.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24));
          }, 0) / paidColls.length
        : 0;

      setKpiCards([
        { key: 'total_invoiced', label: 'Toplam Faturalanan', value: totalInvoiced, format: 'money', color: 'indigo' },
        { key: 'total_collected', label: 'Toplam Tahsil', value: totalCollected, format: 'money', color: 'emerald', trend: 'up' },
        { key: 'collection_ratio', label: 'Tahsilat Oranı', value: totalInvoiced > 0 ? totalCollected / totalInvoiced : 0, format: 'percent', color: 'blue' },
        { key: 'open_amount', label: 'Açık Tutar', value: openAmount, format: 'money', color: 'amber' },
        { key: 'overdue_amount', label: 'Vadesi Geçmiş', value: overdueAmount, format: 'money', color: 'red', trend: overdueAmount > 0 ? 'down' : 'stable' },
        { key: 'avg_days', label: 'Ort. Tahsilat Süresi', value: avgDaysToPay, format: 'days', color: 'violet' },
      ]);

      // Aging buckets
      const aging = [
        { bucket: '0-30', range: '0-30 gün', invoice_count: 0, amount_sum: 0, percent_of_total: 0 },
        { bucket: '31-60', range: '31-60 gün', invoice_count: 0, amount_sum: 0, percent_of_total: 0 },
        { bucket: '61-90', range: '61-90 gün', invoice_count: 0, amount_sum: 0, percent_of_total: 0 },
        { bucket: '90+', range: '90+ gün', invoice_count: 0, amount_sum: 0, percent_of_total: 0 },
      ];

      overdueColls.forEach(c => {
        const daysOverdue = Math.ceil((today.getTime() - new Date(c.due_date).getTime()) / (1000 * 60 * 60 * 24));
        let bucket = aging[0];
        if (daysOverdue > 90) bucket = aging[3];
        else if (daysOverdue > 60) bucket = aging[2];
        else if (daysOverdue > 30) bucket = aging[1];
        
        bucket.invoice_count++;
        bucket.amount_sum += c.amount || 0;
      });

      aging.forEach(a => {
        a.percent_of_total = overdueAmount > 0 ? a.amount_sum / overdueAmount : 0;
      });
      setAgingData(aging);

      // Build summary rows by customer
      const byCustomer: Record<string, any[]> = {};
      collData.forEach(c => {
        const custName = c.customer?.name || 'Bilinmeyen';
        if (!byCustomer[custName]) byCustomer[custName] = [];
        byCustomer[custName].push(c);
      });

      const rows: SummaryRow[] = [];
      let grandInvoiced = 0, grandCollected = 0, grandOpen = 0, grandOverdue = 0;

      Object.entries(byCustomer).forEach(([custName, colls]) => {
        const invoiced = colls.reduce((s, c) => s + (c.amount || 0), 0);
        const collected = colls.filter(c => c.status === 'paid').reduce((s, c) => s + (c.amount || 0), 0);
        const open = colls.filter(c => c.status !== 'paid').reduce((s, c) => s + (c.amount || 0), 0);
        const overdue = colls.filter(c => c.status !== 'paid' && new Date(c.due_date) < today).reduce((s, c) => s + (c.amount || 0), 0);
        const overdueCount = colls.filter(c => c.status !== 'paid' && new Date(c.due_date) < today).length;

        const avgOverdueDays = overdueCount > 0
          ? colls
              .filter(c => c.status !== 'paid' && new Date(c.due_date) < today)
              .reduce((s, c) => s + Math.ceil((today.getTime() - new Date(c.due_date).getTime()) / (1000 * 60 * 60 * 24)), 0) / overdueCount
          : 0;

        rows.push({
          id: custName,
          groupKey: custName,
          groupLabel: custName,
          groupLevel: 0,
          data: {
            customer_name: custName,
            status: overdue > 0 ? 'Vadesi Geçmiş' : open > 0 ? 'Açık' : 'Tamamlandı',
            invoiced_sum: invoiced,
            collected_sum: collected,
            open_amount: open,
            overdue_amount: overdue,
            invoice_count: colls.length,
            avg_days_overdue: avgOverdueDays,
            avg_days_to_pay: avgDaysToPay,
          },
        });

        grandInvoiced += invoiced;
        grandCollected += collected;
        grandOpen += open;
        grandOverdue += overdue;
      });

      setSummaryRows(rows);
      setTotals({
        invoiced_sum: grandInvoiced,
        collected_sum: grandCollected,
        open_amount: grandOpen,
        overdue_amount: grandOverdue,
        invoice_count: collData.length,
      });

      // Trend data (last 6 months mock)
      const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
      const currentMonth = new Date().getMonth();
      const trend = [];
      for (let i = 5; i >= 0; i--) {
        const m = (currentMonth - i + 12) % 12;
        trend.push({
          month: MONTHS[m],
          faturalanan: Math.round(totalInvoiced / 6 * (0.8 + Math.random() * 0.4)),
          tahsil: Math.round(totalCollected / 6 * (0.7 + Math.random() * 0.5)),
          vadesi_gecmis: Math.round(overdueAmount / 6 * (0.5 + Math.random() * 1)),
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
      const { data: invoices } = await supabase
        .from('collections')
        .select(`
          *,
          sales_rep:sales_team(name)
        `)
        .eq('customer_id', row.id)
        .order('due_date', { ascending: false });

      setDrilldownData((invoices || []).map(inv => ({
        invoice_no: inv.invoice_number || inv.id.slice(0, 8),
        amount: inv.amount,
        issue_date: inv.created_at,
        due_date: inv.due_date,
        status: inv.status === 'paid' ? 'Ödendi' : new Date(inv.due_date) < new Date() ? 'Vadesi Geçti' : 'Açık',
        paid_date: inv.paid_date,
        rep: inv.sales_rep?.name || '-',
        notes: inv.notes || '-',
      })));
    } catch (err) {
      console.error('Drilldown hatası:', err);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const drilldownColumns = [
    { key: 'invoice_no', label: 'Fatura No', format: 'text' as const },
    { key: 'amount', label: 'Tutar', format: 'money' as const },
    { key: 'issue_date', label: 'Düzenleme', format: 'date' as const },
    { key: 'due_date', label: 'Vade', format: 'date' as const },
    { key: 'status', label: 'Durum', format: 'text' as const },
    { key: 'paid_date', label: 'Ödeme Tarihi', format: 'date' as const },
    { key: 'rep', label: 'Temsilci', format: 'text' as const },
  ];

  return (
    <div>
      <Header title="Tahsilat Analitik" subtitle="Detaylı Tahsilat ve Yaşlandırma Analizi" />

      <div className="p-6">
        {/* Filters */}
        <GlobalFiltersBar
          filters={filters}
          onFiltersChange={setFilters}
          customers={customers}
          reps={reps}
          showStatus={true}
          statusOptions={[
            { value: 'all', label: 'Tümü' },
            { value: 'paid', label: 'Ödendi' },
            { value: 'open', label: 'Açık' },
            { value: 'overdue', label: 'Vadesi Geçti' },
          ]}
          onRefresh={fetchData}
          loading={loading}
        />

        {/* KPI Cards */}
        <KPICards cards={kpiCards} loading={loading} />

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                Tahsilat Trendi
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorTahsil" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₺${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={(value: number) => [`₺${formatMoney(value)}`, '']} />
                  <Legend />
                  <Area type="monotone" dataKey="tahsil" name="Tahsilat" stroke="#10b981" fill="url(#colorTahsil)" />
                  <Area type="monotone" dataKey="vadesi_gecmis" name="Vadesi Geçmiş" stroke="#ef4444" fill="#fee2e2" />
                </AreaChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          {/* Aging Table */}
          <AgingTable data={agingData} loading={loading} />
        </div>

        {/* Export */}
        <div className="flex justify-end mb-4">
          <ExportMenu
            onExportSummary={() => {
              const csv = generateCSV(summaryRows, collectionsColumns.map(c => ({ key: c.key, label: c.label, format: c.format })));
              downloadCSV(csv, `tahsilat-ozet-${filters.singleMonth}.csv`);
            }}
            onExportDetails={() => {
              const csv = generateCSV(drilldownData, drilldownColumns);
              downloadCSV(csv, `tahsilat-detay-${filters.singleMonth}.csv`);
            }}
          />
        </div>

        {/* Summary Table */}
        <SummaryTable
          title="Müşteri Bazlı Tahsilat Özeti"
          columns={collectionsColumns}
          rows={summaryRows}
          loading={loading}
          groupBy={groupBy}
          availableGroupBys={['customer', 'status', 'rep', 'month']}
          onGroupByChange={setGroupBy}
          onRowClick={handleRowClick}
          totals={totals}
        />

        {/* Overdue Alert */}
        {agingData.filter(a => a.bucket === '90+' && a.amount_sum > 0).length > 0 && (
          <Card className="mt-6 bg-red-50 border-red-200">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Kritik Gecikme Uyarısı
              </CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-red-700">
                90 günü aşan <strong>{agingData.find(a => a.bucket === '90+')?.invoice_count || 0}</strong> fatura, 
                toplam <strong>₺{formatMoney(agingData.find(a => a.bucket === '90+')?.amount_sum || 0)}</strong> tutarında gecikmiş alacak bulunmaktadır.
              </p>
            </CardBody>
          </Card>
        )}
      </div>

      {/* Drilldown */}
      <DrilldownDrawer
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={`Fatura Detayı - ${selectedRow?.data.customer_name || ''}`}
        subtitle="Tüm faturalar ve ödemeler"
        columns={drilldownColumns}
        rows={drilldownData}
        loading={drilldownLoading}
      />
    </div>
  );
}
