// Analytics Types and Utilities
import { z } from 'zod';

// ============ FILTER SCHEMAS ============
export const dateRangeSchema = z.object({
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  endMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

export const globalFiltersSchema = z.object({
  dateRange: dateRangeSchema.optional(),
  singleMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  teamId: z.string().optional(),
  regionId: z.string().optional(),
  repId: z.string().optional(),
  customerId: z.string().optional(),
  productId: z.string().optional(),
  status: z.enum(['all', 'paid', 'overdue', 'open', 'pending', 'approved']).optional(),
});

export type GlobalFilters = z.infer<typeof globalFiltersSchema>;

// ============ GROUPING ============
export type GroupByOption = 'month' | 'team' | 'region' | 'rep' | 'customer' | 'product' | 'status' | 'stage';

export interface GroupingConfig {
  groupBy: GroupByOption[];
  availableGroupBys: GroupByOption[];
}

// ============ KPI CARD TYPES ============
export interface KPICard {
  key: string;
  label: string;
  value: number | string;
  format: 'money' | 'number' | 'percent' | 'text' | 'days';
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  color?: 'indigo' | 'emerald' | 'amber' | 'red' | 'violet' | 'blue';
  icon?: string;
}

// ============ SUMMARY TABLE TYPES ============
export interface SummaryRow {
  id: string;
  groupKey: string;
  groupLabel: string;
  groupLevel: number;
  isSubtotal?: boolean;
  isGrandTotal?: boolean;
  data: Record<string, number | string>;
  children?: SummaryRow[];
}

export interface SummaryTableColumn {
  key: string;
  label: string;
  format: 'money' | 'number' | 'percent' | 'text' | 'date' | 'days';
  sortable?: boolean;
  hidden?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
}

export interface AnalyticsResponse<T = SummaryRow> {
  kpiCards: KPICard[];
  summaryRows: T[];
  groupingMeta: GroupingConfig;
  totals: Record<string, number>;
  filters: GlobalFilters;
  generatedAt: string;
}

// ============ COMMISSION ANALYTICS ============
export interface CommissionSummaryRow extends SummaryRow {
  data: {
    rep_name: string;
    team: string;
    base_commission_sum: number;
    earned_commission_sum: number;
    avg_sales_attainment: number;
    avg_collections_ratio: number;
    avg_multiplier: number;
    hard_stop_count: number;
    hard_stop_rate: number;
    last_calculated_at: string;
  };
}

export interface CommissionDrilldownRow {
  id: string;
  period_year: number;
  period_month: number;
  rep_name: string;
  sales_target: number;
  actual_sales: number;
  sales_attainment_ratio: number;
  invoiced_amount: number;
  collected_amount: number;
  collections_ratio: number;
  base_commission_amount: number;
  earned_commission: number;
  multiplier: number;
  hard_stop: boolean;
  payment_status: string;
  calculated_at: string;
  calculated_by: string;
}

// ============ CUSTOMER ANALYTICS ============
export interface CustomerSummaryRow extends SummaryRow {
  data: {
    customer_name: string;
    segment: string;
    region: string;
    total_sales: number;
    total_invoiced: number;
    total_collected: number;
    overdue_amount: number;
    overdue_invoice_count: number;
    avg_days_overdue: number;
    dso_estimate: number;
    last_contact_date: string;
    next_follow_up_date: string;
    risk_status: string;
  };
}

// ============ SALES ANALYTICS ============
export interface SalesSummaryRow extends SummaryRow {
  data: {
    rep_name: string;
    team: string;
    bookings_sum: number;
    won_count: number;
    lost_count: number;
    win_rate: number;
    avg_deal_size: number;
    avg_cycle_days: number;
    pipeline_open_sum: number;
    forecast_sum: number;
  };
}

export interface StageFunnelRow {
  stage: string;
  deal_count: number;
  total_amount: number;
  conversion_rate: number;
}

// ============ COLLECTIONS ANALYTICS ============
export interface CollectionsSummaryRow extends SummaryRow {
  data: {
    customer_name: string;
    status: string;
    invoiced_sum: number;
    collected_sum: number;
    open_amount: number;
    overdue_amount: number;
    invoice_count: number;
    avg_days_overdue: number;
    avg_days_to_pay: number;
  };
}

export interface AgingBucket {
  bucket: string;
  range: string;
  invoice_count: number;
  amount_sum: number;
  percent_of_total: number;
}

// ============ SAVED VIEWS ============
export interface SavedView {
  id: string;
  name: string;
  module: 'commissions' | 'customers' | 'sales' | 'collections';
  filters: GlobalFilters;
  groupBy: GroupByOption[];
  visibleColumns: string[];
  sortBy?: { key: string; direction: 'asc' | 'desc' };
  createdAt: string;
  createdBy: string;
}

// ============ EXPORT TYPES ============
export interface ExportConfig {
  filename: string;
  type: 'summary' | 'detail';
  filters: GlobalFilters;
  columns: string[];
  includeSubtotals: boolean;
}

// ============ UTILITY FUNCTIONS ============
export function formatAnalyticsValue(value: number | string | null | undefined, format: string): string {
  if (value === null || value === undefined) return '-';
  
  switch (format) {
    case 'money':
      return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(Number(value));
    case 'number':
      return new Intl.NumberFormat('tr-TR').format(Number(value));
    case 'percent':
      return `%${(Number(value) * 100).toFixed(1)}`;
    case 'days':
      return `${Number(value).toFixed(0)} gün`;
    case 'date':
      return value ? new Date(String(value)).toLocaleDateString('tr-TR') : '-';
    default:
      return String(value);
  }
}

export function buildQueryParams(filters: GlobalFilters, groupBy: GroupByOption[]): URLSearchParams {
  const params = new URLSearchParams();
  
  if (filters.singleMonth) params.set('month', filters.singleMonth);
  if (filters.dateRange) {
    params.set('startMonth', filters.dateRange.startMonth);
    params.set('endMonth', filters.dateRange.endMonth);
  }
  if (filters.teamId) params.set('teamId', filters.teamId);
  if (filters.regionId) params.set('regionId', filters.regionId);
  if (filters.repId) params.set('repId', filters.repId);
  if (filters.customerId) params.set('customerId', filters.customerId);
  if (filters.status) params.set('status', filters.status);
  if (groupBy.length > 0) params.set('groupBy', groupBy.join(','));
  
  return params;
}

export function generateCSV(
  rows: Record<string, any>[],
  columns: { key: string; label: string; format?: string }[],
  includeSubtotals: boolean = true
): string {
  // BOM for UTF-8
  let csv = '\uFEFF';
  
  // Header row
  csv += columns.map(c => `"${c.label}"`).join(';') + '\n';
  
  // Data rows
  rows.forEach(row => {
    if (!includeSubtotals && (row.isSubtotal || row.isGrandTotal)) return;
    
    const values = columns.map(col => {
      let value = row.data?.[col.key] ?? row[col.key] ?? '';
      
      // Format for CSV (raw numbers for money)
      if (col.format === 'money' && typeof value === 'number') {
        value = value.toFixed(2);
      } else if (col.format === 'percent' && typeof value === 'number') {
        value = (value * 100).toFixed(2);
      }
      
      // Escape quotes
      if (typeof value === 'string') {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      
      return value;
    });
    
    csv += values.join(';') + '\n';
  });
  
  return csv;
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ============ COLUMN DEFINITIONS ============
export const commissionColumns: SummaryTableColumn[] = [
  { key: 'rep_name', label: 'Temsilci', format: 'text', sortable: true },
  { key: 'team', label: 'Takım', format: 'text', sortable: true },
  { key: 'base_commission_sum', label: 'Baz Prim', format: 'money', sortable: true, aggregation: 'sum' },
  { key: 'earned_commission_sum', label: 'Kazanılan Prim', format: 'money', sortable: true, aggregation: 'sum' },
  { key: 'avg_sales_attainment', label: 'Ort. Satış %', format: 'percent', sortable: true, aggregation: 'avg' },
  { key: 'avg_collections_ratio', label: 'Ort. Tahsilat %', format: 'percent', sortable: true, aggregation: 'avg' },
  { key: 'avg_multiplier', label: 'Ort. Çarpan', format: 'number', sortable: true, aggregation: 'avg' },
  { key: 'hard_stop_count', label: 'Hard Stop', format: 'number', sortable: true, aggregation: 'sum' },
  { key: 'hard_stop_rate', label: 'Hard Stop %', format: 'percent', sortable: true, aggregation: 'avg' },
];

export const customerColumns: SummaryTableColumn[] = [
  { key: 'customer_name', label: 'Müşteri', format: 'text', sortable: true },
  { key: 'segment', label: 'Segment', format: 'text', sortable: true },
  { key: 'region', label: 'Bölge', format: 'text', sortable: true },
  { key: 'total_sales', label: 'Toplam Satış', format: 'money', sortable: true, aggregation: 'sum' },
  { key: 'total_invoiced', label: 'Faturalanan', format: 'money', sortable: true, aggregation: 'sum' },
  { key: 'total_collected', label: 'Tahsil Edilen', format: 'money', sortable: true, aggregation: 'sum' },
  { key: 'overdue_amount', label: 'Vadesi Geçmiş', format: 'money', sortable: true, aggregation: 'sum' },
  { key: 'overdue_invoice_count', label: 'Gecikmiş Fatura', format: 'number', sortable: true, aggregation: 'sum' },
  { key: 'avg_days_overdue', label: 'Ort. Gecikme', format: 'days', sortable: true, aggregation: 'avg' },
  { key: 'dso_estimate', label: 'DSO', format: 'days', sortable: true, aggregation: 'avg' },
  { key: 'risk_status', label: 'Risk Durumu', format: 'text', sortable: true },
];

export const salesColumns: SummaryTableColumn[] = [
  { key: 'rep_name', label: 'Temsilci', format: 'text', sortable: true },
  { key: 'team', label: 'Takım', format: 'text', sortable: true },
  { key: 'bookings_sum', label: 'Rezervasyon', format: 'money', sortable: true, aggregation: 'sum' },
  { key: 'won_count', label: 'Kazanılan', format: 'number', sortable: true, aggregation: 'sum' },
  { key: 'lost_count', label: 'Kaybedilen', format: 'number', sortable: true, aggregation: 'sum' },
  { key: 'win_rate', label: 'Kazanma %', format: 'percent', sortable: true, aggregation: 'avg' },
  { key: 'avg_deal_size', label: 'Ort. Satış', format: 'money', sortable: true, aggregation: 'avg' },
  { key: 'avg_cycle_days', label: 'Ort. Süre', format: 'days', sortable: true, aggregation: 'avg' },
  { key: 'pipeline_open_sum', label: 'Pipeline', format: 'money', sortable: true, aggregation: 'sum' },
  { key: 'forecast_sum', label: 'Tahmin', format: 'money', sortable: true, aggregation: 'sum' },
];

export const collectionsColumns: SummaryTableColumn[] = [
  { key: 'customer_name', label: 'Müşteri', format: 'text', sortable: true },
  { key: 'status', label: 'Durum', format: 'text', sortable: true },
  { key: 'invoiced_sum', label: 'Faturalanan', format: 'money', sortable: true, aggregation: 'sum' },
  { key: 'collected_sum', label: 'Tahsil Edilen', format: 'money', sortable: true, aggregation: 'sum' },
  { key: 'open_amount', label: 'Açık Tutar', format: 'money', sortable: true, aggregation: 'sum' },
  { key: 'overdue_amount', label: 'Vadesi Geçmiş', format: 'money', sortable: true, aggregation: 'sum' },
  { key: 'invoice_count', label: 'Fatura Adedi', format: 'number', sortable: true, aggregation: 'sum' },
  { key: 'avg_days_overdue', label: 'Ort. Gecikme', format: 'days', sortable: true, aggregation: 'avg' },
  { key: 'avg_days_to_pay', label: 'Ort. Ödeme Süresi', format: 'days', sortable: true, aggregation: 'avg' },
];

export const agingColumns: SummaryTableColumn[] = [
  { key: 'bucket', label: 'Vade Aralığı', format: 'text' },
  { key: 'invoice_count', label: 'Fatura Adedi', format: 'number', aggregation: 'sum' },
  { key: 'amount_sum', label: 'Tutar', format: 'money', aggregation: 'sum' },
  { key: 'percent_of_total', label: 'Oran %', format: 'percent' },
];
