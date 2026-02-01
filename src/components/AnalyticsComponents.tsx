'use client';

import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import {
  Filter, Download, ChevronDown, ChevronRight, ChevronUp, Columns, Save, Eye, X,
  TrendingUp, TrendingDown, Minus, RefreshCw, Search, Settings, MoreVertical
} from 'lucide-react';
import {
  GlobalFilters, KPICard, SummaryTableColumn, SummaryRow, GroupByOption,
  SavedView, formatAnalyticsValue, generateCSV, downloadCSV
} from '@/lib/analytics-types';

// ============ GLOBAL FILTERS BAR ============
interface GlobalFiltersBarProps {
  filters: GlobalFilters;
  onFiltersChange: (filters: GlobalFilters) => void;
  teams?: { id: string; name: string }[];
  regions?: { id: string; name: string }[];
  reps?: { id: string; name: string }[];
  customers?: { id: string; name: string }[];
  showStatus?: boolean;
  statusOptions?: { value: string; label: string }[];
  onRefresh?: () => void;
  loading?: boolean;
}

export function GlobalFiltersBar({
  filters,
  onFiltersChange,
  teams = [],
  regions = [],
  reps = [],
  customers = [],
  showStatus = true,
  statusOptions = [
    { value: 'all', label: 'Tümü' },
    { value: 'paid', label: 'Ödendi' },
    { value: 'overdue', label: 'Vadesi Geçti' },
    { value: 'open', label: 'Açık' },
  ],
  onRefresh,
  loading = false,
}: GlobalFiltersBarProps) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const MONTHS = [
    { value: 1, label: 'Ocak' }, { value: 2, label: 'Şubat' }, { value: 3, label: 'Mart' },
    { value: 4, label: 'Nisan' }, { value: 5, label: 'Mayıs' }, { value: 6, label: 'Haziran' },
    { value: 7, label: 'Temmuz' }, { value: 8, label: 'Ağustos' }, { value: 9, label: 'Eylül' },
    { value: 10, label: 'Ekim' }, { value: 11, label: 'Kasım' }, { value: 12, label: 'Aralık' },
  ];

  const handleChange = (key: keyof GlobalFilters, value: any) => {
    onFiltersChange({ ...filters, [key]: value || undefined });
  };

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200 p-4 -mx-6 -mt-6 mb-6">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">Filtreler:</span>
        </div>

        {/* Month Selection */}
        <div className="flex items-center gap-1">
          <select
            value={filters.singleMonth?.split('-')[0] || currentYear}
            onChange={(e) => {
              const month = filters.singleMonth?.split('-')[1] || String(currentMonth).padStart(2, '0');
              handleChange('singleMonth', `${e.target.value}-${month}`);
            }}
            className="px-2 py-1.5 text-sm rounded border border-slate-200"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={parseInt(filters.singleMonth?.split('-')[1] || String(currentMonth))}
            onChange={(e) => {
              const year = filters.singleMonth?.split('-')[0] || String(currentYear);
              handleChange('singleMonth', `${year}-${String(e.target.value).padStart(2, '0')}`);
            }}
            className="px-2 py-1.5 text-sm rounded border border-slate-200"
          >
            {MONTHS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Team */}
        {teams.length > 0 && (
          <select
            value={filters.teamId || ''}
            onChange={(e) => handleChange('teamId', e.target.value)}
            className="px-2 py-1.5 text-sm rounded border border-slate-200"
          >
            <option value="">Tüm Takımlar</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

        {/* Region */}
        {regions.length > 0 && (
          <select
            value={filters.regionId || ''}
            onChange={(e) => handleChange('regionId', e.target.value)}
            className="px-2 py-1.5 text-sm rounded border border-slate-200"
          >
            <option value="">Tüm Bölgeler</option>
            {regions.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        )}

        {/* Rep */}
        {reps.length > 0 && (
          <select
            value={filters.repId || ''}
            onChange={(e) => handleChange('repId', e.target.value)}
            className="px-2 py-1.5 text-sm rounded border border-slate-200"
          >
            <option value="">Tüm Temsilciler</option>
            {reps.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        )}

        {/* Customer */}
        {customers.length > 0 && (
          <select
            value={filters.customerId || ''}
            onChange={(e) => handleChange('customerId', e.target.value)}
            className="px-2 py-1.5 text-sm rounded border border-slate-200"
          >
            <option value="">Tüm Müşteriler</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {/* Status */}
        {showStatus && (
          <select
            value={filters.status || 'all'}
            onChange={(e) => handleChange('status', e.target.value)}
            className="px-2 py-1.5 text-sm rounded border border-slate-200"
          >
            {statusOptions.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        )}

        <div className="flex-1" />

        {/* Refresh */}
        {onRefresh && (
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============ KPI CARDS ============
interface KPICardsProps {
  cards: KPICard[];
  loading?: boolean;
}

export function KPICards({ cards, loading = false }: KPICardsProps) {
  const colorClasses: Record<string, string> = {
    indigo: 'from-indigo-500 to-purple-600',
    emerald: 'from-emerald-500 to-teal-600',
    amber: 'from-amber-500 to-orange-600',
    red: 'from-red-500 to-rose-600',
    violet: 'from-violet-500 to-purple-600',
    blue: 'from-blue-500 to-cyan-600',
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 mb-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Card key={i} className="animate-pulse">
            <CardBody className="p-4">
              <div className="h-4 bg-slate-200 rounded w-20 mb-2" />
              <div className="h-8 bg-slate-200 rounded w-32" />
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">
      {cards.map((card, i) => (
        <Card 
          key={card.key} 
          className={`bg-gradient-to-br ${colorClasses[card.color || 'indigo']} text-white`}
        >
          <CardBody className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/80 text-xs mb-1">{card.label}</p>
                <p className="text-xl font-bold">
                  {formatAnalyticsValue(card.value, card.format)}
                </p>
              </div>
              {card.trend && (
                <div className={`p-1 rounded ${
                  card.trend === 'up' ? 'bg-emerald-400/30' :
                  card.trend === 'down' ? 'bg-red-400/30' : 'bg-white/20'
                }`}>
                  {card.trend === 'up' ? <TrendingUp className="h-4 w-4" /> :
                   card.trend === 'down' ? <TrendingDown className="h-4 w-4" /> :
                   <Minus className="h-4 w-4" />}
                </div>
              )}
            </div>
            {card.trendValue !== undefined && (
              <p className="text-xs text-white/70 mt-1">
                {card.trend === 'up' ? '+' : ''}{card.trendValue}% önceki döneme göre
              </p>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// ============ SUMMARY TABLE ============
interface SummaryTableProps {
  columns: SummaryTableColumn[];
  rows: SummaryRow[];
  loading?: boolean;
  groupBy: GroupByOption[];
  availableGroupBys: GroupByOption[];
  onGroupByChange: (groupBy: GroupByOption[]) => void;
  onRowClick?: (row: SummaryRow) => void;
  totals?: Record<string, number>;
  title?: string;
  onExport?: () => void;
}

export function SummaryTable({
  columns,
  rows,
  loading = false,
  groupBy,
  availableGroupBys,
  onGroupByChange,
  onRowClick,
  totals,
  title = 'Özet Tablo',
  onExport,
}: SummaryTableProps) {
  const [sortBy, setSortBy] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(columns.map(c => c.key));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const GROUP_LABELS: Record<GroupByOption, string> = {
    month: 'Ay',
    team: 'Takım',
    region: 'Bölge',
    rep: 'Temsilci',
    customer: 'Müşteri',
    product: 'Ürün',
    status: 'Durum',
    stage: 'Aşama',
  };

  const sortedRows = useMemo(() => {
    if (!sortBy) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a.data[sortBy.key];
      const bVal = b.data[sortBy.key];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortBy.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortBy.direction === 'asc' 
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [rows, sortBy]);

  const filteredColumns = columns.filter(c => visibleColumns.includes(c.key));

  const toggleGroup = (groupKey: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
  };

  const handleSort = (key: string) => {
    if (sortBy?.key === key) {
      setSortBy({ key, direction: sortBy.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortBy({ key, direction: 'desc' });
    }
  };

  const handleExport = () => {
    const csv = generateCSV(rows, filteredColumns.map(c => ({ key: c.key, label: c.label, format: c.format })));
    downloadCSV(csv, `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`);
    onExport?.();
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {/* Group By Selector */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500">Grupla:</span>
            {availableGroupBys.map(g => (
              <button
                key={g}
                onClick={() => {
                  const newGroupBy = groupBy.includes(g)
                    ? groupBy.filter(x => x !== g)
                    : [...groupBy, g];
                  onGroupByChange(newGroupBy);
                }}
                className={`px-2 py-1 rounded text-xs ${
                  groupBy.includes(g)
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {GROUP_LABELS[g]}
              </button>
            ))}
          </div>

          {/* Column Toggle */}
          <div className="relative">
            <Button variant="ghost" size="sm" onClick={() => setShowColumnMenu(!showColumnMenu)}>
              <Columns className="h-4 w-4" />
            </Button>
            {showColumnMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-20 w-48">
                {columns.map(col => (
                  <label key={col.key} className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-slate-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(col.key)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setVisibleColumns([...visibleColumns, col.key]);
                        } else {
                          setVisibleColumns(visibleColumns.filter(k => k !== col.key));
                        }
                      }}
                      className="rounded"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Export */}
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                {groupBy.length > 0 && <th className="w-8" />}
                {filteredColumns.map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left font-medium text-slate-600 ${col.sortable ? 'cursor-pointer hover:bg-slate-100' : ''}`}
                    style={{ width: col.width }}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortBy?.key === col.key && (
                        sortBy.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={filteredColumns.length + (groupBy.length > 0 ? 1 : 0)} className="px-4 py-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
                      Yükleniyor...
                    </div>
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={filteredColumns.length + (groupBy.length > 0 ? 1 : 0)} className="px-4 py-8 text-center text-slate-400">
                    Veri bulunamadı
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, i) => (
                  <tr
                    key={row.id || i}
                    className={`
                      ${row.isSubtotal ? 'bg-slate-50 font-medium' : ''}
                      ${row.isGrandTotal ? 'bg-indigo-50 font-bold' : ''}
                      ${onRowClick && !row.isSubtotal && !row.isGrandTotal ? 'hover:bg-blue-50 cursor-pointer' : ''}
                    `}
                    onClick={() => !row.isSubtotal && !row.isGrandTotal && onRowClick?.(row)}
                  >
                    {groupBy.length > 0 && (
                      <td className="px-2">
                        {row.children && row.children.length > 0 && (
                          <button onClick={(e) => { e.stopPropagation(); toggleGroup(row.groupKey); }}>
                            {expandedGroups.has(row.groupKey) 
                              ? <ChevronDown className="h-4 w-4 text-slate-400" />
                              : <ChevronRight className="h-4 w-4 text-slate-400" />
                            }
                          </button>
                        )}
                      </td>
                    )}
                    {filteredColumns.map(col => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`}
                        style={{ paddingLeft: row.groupLevel ? `${row.groupLevel * 20 + 16}px` : undefined }}
                      >
                        {formatAnalyticsValue(row.data[col.key], col.format)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
              
              {/* Grand Totals */}
              {totals && (
                <tr className="bg-indigo-50 font-bold border-t-2 border-indigo-200">
                  {groupBy.length > 0 && <td />}
                  {filteredColumns.map((col, i) => (
                    <td key={col.key} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : ''}`}>
                      {i === 0 ? 'TOPLAM' : col.aggregation ? formatAnalyticsValue(totals[col.key], col.format) : ''}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

// ============ DRILLDOWN DRAWER ============
interface DrilldownDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  columns: SummaryTableColumn[];
  rows: Record<string, any>[];
  loading?: boolean;
  onExport?: () => void;
}

export function DrilldownDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  columns,
  rows,
  loading = false,
  onExport,
}: DrilldownDrawerProps) {
  const handleExport = () => {
    const csv = generateCSV(rows, columns.map(c => ({ key: c.key, label: c.label, format: c.format })), false);
    downloadCSV(csv, `detay-${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`);
    onExport?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="font-semibold text-lg">{title}</h3>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-slate-400 py-12">
              Detay verisi bulunamadı
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {columns.map(col => (
                    <th key={col.key} className="px-4 py-3 text-left font-medium text-slate-600">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {columns.map(col => (
                      <td key={col.key} className="px-4 py-3">
                        {formatAnalyticsValue(row[col.key], col.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ SAVED VIEWS MENU ============
interface SavedViewsMenuProps {
  views: SavedView[];
  currentView?: SavedView;
  onSelectView: (view: SavedView) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (id: string) => void;
}

export function SavedViewsMenu({
  views,
  currentView,
  onSelectView,
  onSaveView,
  onDeleteView,
}: SavedViewsMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [viewName, setViewName] = useState('');

  const handleSave = () => {
    if (viewName.trim()) {
      onSaveView(viewName.trim());
      setViewName('');
      setShowSaveModal(false);
    }
  };

  return (
    <div className="relative">
      <Button variant="secondary" size="sm" onClick={() => setShowMenu(!showMenu)}>
        <Eye className="h-4 w-4" />
        {currentView ? currentView.name : 'Görünümler'}
        <ChevronDown className="h-3 w-3" />
      </Button>

      {showMenu && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 w-56">
          <div className="p-2 border-b border-slate-100">
            <button
              onClick={() => { setShowSaveModal(true); setShowMenu(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded"
            >
              <Save className="h-4 w-4" />
              Mevcut Görünümü Kaydet
            </button>
          </div>
          <div className="p-2 max-h-48 overflow-auto">
            {views.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">Kayıtlı görünüm yok</p>
            ) : (
              views.map(view => (
                <div key={view.id} className="flex items-center gap-1">
                  <button
                    onClick={() => { onSelectView(view); setShowMenu(false); }}
                    className={`flex-1 text-left px-3 py-2 text-sm rounded hover:bg-slate-50 ${
                      currentView?.id === view.id ? 'bg-indigo-50 text-indigo-700' : ''
                    }`}
                  >
                    {view.name}
                  </button>
                  <button
                    onClick={() => onDeleteView(view.id)}
                    className="p-1 text-slate-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Save Modal */}
      <Modal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="Görünümü Kaydet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowSaveModal(false)}>İptal</Button>
            <Button onClick={handleSave}><Save className="h-4 w-4" /> Kaydet</Button>
          </>
        }
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Görünüm Adı</label>
          <Input
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder="Örn: Aylık Takım Raporu"
          />
        </div>
      </Modal>
    </div>
  );
}

// ============ EXPORT MENU ============
interface ExportMenuProps {
  onExportSummary: () => void;
  onExportDetails: () => void;
}

export function ExportMenu({ onExportSummary, onExportDetails }: ExportMenuProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setShowMenu(!showMenu)}>
        <Download className="h-4 w-4" /> Dışa Aktar <ChevronDown className="h-3 w-3" />
      </Button>

      {showMenu && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 w-48">
          <button
            onClick={() => { onExportSummary(); setShowMenu(false); }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-slate-50"
          >
            <Download className="h-4 w-4 text-slate-400" />
            Özet CSV
          </button>
          <button
            onClick={() => { onExportDetails(); setShowMenu(false); }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-slate-50"
          >
            <Download className="h-4 w-4 text-slate-400" />
            Detay CSV
          </button>
        </div>
      )}
    </div>
  );
}

// ============ AGING TABLE ============
interface AgingTableProps {
  data: { bucket: string; range: string; invoice_count: number; amount_sum: number; percent_of_total: number }[];
  loading?: boolean;
}

export function AgingTable({ data, loading = false }: AgingTableProps) {
  const bucketColors: Record<string, string> = {
    '0-30': 'bg-emerald-100 text-emerald-700',
    '31-60': 'bg-amber-100 text-amber-700',
    '61-90': 'bg-orange-100 text-orange-700',
    '90+': 'bg-red-100 text-red-700',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Yaşlandırma Tablosu (Aging)</CardTitle>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-10 bg-slate-100 rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {data.map(item => (
              <div key={item.bucket} className="flex items-center gap-3">
                <span className={`px-2 py-1 rounded text-xs font-medium ${bucketColors[item.bucket] || 'bg-slate-100'}`}>
                  {item.range}
                </span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span>{item.invoice_count} fatura</span>
                    <span className="font-medium">{formatMoney(item.amount_sum)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        item.bucket === '0-30' ? 'bg-emerald-500' :
                        item.bucket === '31-60' ? 'bg-amber-500' :
                        item.bucket === '61-90' ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(item.percent_of_total * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm text-slate-500 w-12 text-right">
                  %{(item.percent_of_total * 100).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
