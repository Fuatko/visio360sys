'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, EmptyState, ProgressBar } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { 
  Award, Calculator, Settings, Users, TrendingUp, AlertTriangle, Play, DollarSign,
  Check, X, RefreshCw, Plus, Edit2, Trash2, Save, Upload, Download, FileSpreadsheet,
  Target, Percent, FileText, Calendar, ChevronRight, AlertCircle, CheckCircle2,
  Eye, Filter, ArrowUpDown, MoreHorizontal, Archive, Copy, History, XCircle
} from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { parseKPIInputCSV, generateKPIInputTemplate, downloadFile, exportToCSV, RESULTS_EXPORT_COLUMNS } from '@/lib/csv-utils';
import type { ResultExportRow } from '@/lib/csv-utils';

// ============ TYPES ============
interface SalesRep {
  id: string;
  name: string;
  department?: string;
  region?: string;
}

interface CommissionConfig {
  id: string;
  name: string;
  sales_weight: number;
  collections_weight: number;
  max_sales_score: number;
  max_collections_score: number;
  collections_hard_stop_threshold: number;
  payment_delay_months: number;
  is_active: boolean;
  effective_from: string;
  effective_to?: string;
  created_at: string;
}

interface ScoreThreshold {
  id?: string;
  config_id?: string;
  min_ratio: number;
  max_ratio: number | null;
  score: number;
}

interface KPIInput {
  id?: string;
  sales_rep_id: string;
  sales_rep?: SalesRep;
  period_year: number;
  period_month: number;
  sales_target: number;
  actual_sales: number;
  invoiced_amount: number;
  collected_amount: number;
  base_commission_amount: number;
  notes?: string;
  // Computed
  sales_ratio?: number;
  collections_ratio?: number;
  has_error?: boolean;
  error_message?: string;
}

interface CommissionResult {
  id: string;
  sales_rep_id: string;
  sales_rep?: SalesRep;
  period_year: number;
  period_month: number;
  sales_target: number;
  actual_sales: number;
  invoiced_amount: number;
  collected_amount: number;
  base_commission_amount: number;
  sales_attainment_ratio: number;
  collections_ratio: number;
  sales_score: number;
  collections_score: number;
  sales_weight: number;
  collections_weight: number;
  total_multiplier: number;
  earned_commission: number;
  hard_stop_triggered: boolean;
  hard_stop_reason?: string;
  payment_status: string;
  payment_month: string;
  calculated_at: string;
}

type UserRole = 'super_admin' | 'admin' | 'sales_ops' | 'finance' | 'manager' | 'user';

// ============ CONSTANTS ============
const DEFAULT_SALES_THRESHOLDS: ScoreThreshold[] = [
  { min_ratio: 0.00, max_ratio: 0.70, score: 0.00 },
  { min_ratio: 0.70, max_ratio: 0.90, score: 0.60 },
  { min_ratio: 0.90, max_ratio: 1.00, score: 0.85 },
  { min_ratio: 1.00, max_ratio: 1.10, score: 1.00 },
  { min_ratio: 1.10, max_ratio: 1.20, score: 1.20 },
  { min_ratio: 1.20, max_ratio: null, score: 1.40 },
];

const DEFAULT_COLLECTIONS_THRESHOLDS: ScoreThreshold[] = [
  { min_ratio: 0.00, max_ratio: 0.70, score: 0.00 },
  { min_ratio: 0.70, max_ratio: 0.85, score: 0.50 },
  { min_ratio: 0.85, max_ratio: 0.95, score: 0.80 },
  { min_ratio: 0.95, max_ratio: 1.00, score: 1.00 },
  { min_ratio: 1.00, max_ratio: null, score: 1.20 },
];

const MONTHS = [
  { value: 1, label: 'Ocak' }, { value: 2, label: 'Şubat' }, { value: 3, label: 'Mart' },
  { value: 4, label: 'Nisan' }, { value: 5, label: 'Mayıs' }, { value: 6, label: 'Haziran' },
  { value: 7, label: 'Temmuz' }, { value: 8, label: 'Ağustos' }, { value: 9, label: 'Eylül' },
  { value: 10, label: 'Ekim' }, { value: 11, label: 'Kasım' }, { value: 12, label: 'Aralık' },
];

const PAYMENT_STATUSES = [
  { value: 'pending', label: 'Beklemede', color: 'bg-amber-100 text-amber-700' },
  { value: 'approved', label: 'Onaylandı', color: 'bg-blue-100 text-blue-700' },
  { value: 'paid', label: 'Ödendi', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'cancelled', label: 'İptal', color: 'bg-red-100 text-red-700' },
];

// ============ PERMISSION HELPERS ============
function canEditConfig(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin';
}

function canManageInputs(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'sales_ops';
}

function canRunCalculation(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'sales_ops';
}

function canApprovePayments(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'finance';
}

function canExportResults(role: UserRole): boolean {
  return true; // All roles can export what they can see
}

// ============ CALCULATION HELPERS ============
function lookupScore(ratio: number, thresholds: ScoreThreshold[]): number {
  const sorted = [...thresholds].sort((a, b) => a.min_ratio - b.min_ratio);
  for (const t of sorted) {
    if (ratio >= t.min_ratio && (t.max_ratio === null || ratio < t.max_ratio)) {
      return t.score;
    }
  }
  return 0;
}

function calculateCommission(
  input: KPIInput,
  config: CommissionConfig,
  salesThresholds: ScoreThreshold[],
  collectionsThresholds: ScoreThreshold[]
): Partial<CommissionResult> {
  const salesRatio = input.sales_target > 0 ? input.actual_sales / input.sales_target : 0;
  const collectionsRatio = input.invoiced_amount > 0 ? input.collected_amount / input.invoiced_amount : 0;
  
  const salesScore = Math.min(lookupScore(salesRatio, salesThresholds), config.max_sales_score);
  const collectionsScore = Math.min(lookupScore(collectionsRatio, collectionsThresholds), config.max_collections_score);
  
  const hardStopTriggered = collectionsRatio < config.collections_hard_stop_threshold;
  const hardStopReason = hardStopTriggered 
    ? `Tahsilat oranı (${(collectionsRatio * 100).toFixed(1)}%) < ${config.collections_hard_stop_threshold * 100}%`
    : undefined;
  
  const totalMultiplier = hardStopTriggered ? 0 : (salesScore * config.sales_weight) + (collectionsScore * config.collections_weight);
  const earnedCommission = hardStopTriggered ? 0 : input.base_commission_amount * totalMultiplier;
  
  return {
    sales_attainment_ratio: Math.round(salesRatio * 10000) / 10000,
    collections_ratio: Math.round(collectionsRatio * 10000) / 10000,
    sales_score: salesScore,
    collections_score: collectionsScore,
    sales_weight: config.sales_weight,
    collections_weight: config.collections_weight,
    total_multiplier: Math.round(totalMultiplier * 10000) / 10000,
    earned_commission: Math.round(earnedCommission * 100) / 100,
    hard_stop_triggered: hardStopTriggered,
    hard_stop_reason: hardStopReason,
  };
}

// ============ MAIN COMPONENT ============
export default function CommissionAdminPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'configs' | 'inputs' | 'calculate' | 'results'>('overview');
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole>('user');
  
  // Data state
  const [salesTeam, setSalesTeam] = useState<SalesRep[]>([]);
  const [configs, setConfigs] = useState<CommissionConfig[]>([]);
  const [activeConfig, setActiveConfig] = useState<CommissionConfig | null>(null);
  const [salesThresholds, setSalesThresholds] = useState<ScoreThreshold[]>(DEFAULT_SALES_THRESHOLDS);
  const [collectionsThresholds, setCollectionsThresholds] = useState<ScoreThreshold[]>(DEFAULT_COLLECTIONS_THRESHOLDS);
  const [kpiInputs, setKpiInputs] = useState<KPIInput[]>([]);
  const [results, setResults] = useState<CommissionResult[]>([]);
  
  // Period selection
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  
  // Filters
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterHardStop, setFilterHardStop] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Partial<CommissionConfig> | null>(null);
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [editingInput, setEditingInput] = useState<KPIInput | null>(null);
  const [csvImportModalOpen, setCsvImportModalOpen] = useState(false);
  const [csvPreviewData, setCsvPreviewData] = useState<any[]>([]);
  const [csvErrors, setCsvErrors] = useState<any[]>([]);
  const [resultDetailModalOpen, setResultDetailModalOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<CommissionResult | null>(null);
  
  // Calculation state
  const [calculating, setCalculating] = useState(false);
  const [calcProgress, setCalcProgress] = useState(0);
  const [calcStats, setCalcStats] = useState<any>(null);
  
  const supabase = createClient();
  const { user } = useAuth();
  
  // ============ DATA FETCHING ============
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch user role
      if (user?.id) {
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
        if (userData?.role) {
          setUserRole(userData.role as UserRole);
        }
      }
      
      // Fetch sales team
      const { data: team } = await supabase
        .from('sales_team')
        .select('id, name, department, region')
        .order('name');
      setSalesTeam(team || []);
      
      // Fetch all configs
      const { data: allConfigs } = await supabase
        .from('commission_configs')
        .select('*')
        .order('created_at', { ascending: false });
      setConfigs(allConfigs || []);
      
      // Fetch active config
      const { data: activeConfigs } = await supabase
        .from('commission_configs')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (activeConfigs && activeConfigs.length > 0) {
        setActiveConfig(activeConfigs[0]);
        
        // Fetch thresholds
        const { data: salesTh } = await supabase
          .from('sales_score_thresholds')
          .select('*')
          .eq('config_id', activeConfigs[0].id)
          .order('min_ratio');
        
        const { data: collTh } = await supabase
          .from('collections_score_thresholds')
          .select('*')
          .eq('config_id', activeConfigs[0].id)
          .order('min_ratio');
        
        if (salesTh && salesTh.length > 0) setSalesThresholds(salesTh);
        if (collTh && collTh.length > 0) setCollectionsThresholds(collTh);
      }
      
      // Fetch KPI inputs for selected period
      const { data: inputs } = await supabase
        .from('commission_kpi_inputs')
        .select('*, sales_rep:sales_team(id, name, department, region)')
        .eq('period_year', selectedYear)
        .eq('period_month', selectedMonth);
      
      const processedInputs = (inputs || []).map(inp => ({
        ...inp,
        sales_ratio: inp.sales_target > 0 ? inp.actual_sales / inp.sales_target : 0,
        collections_ratio: inp.invoiced_amount > 0 ? inp.collected_amount / inp.invoiced_amount : 0,
      }));
      setKpiInputs(processedInputs);
      
      // Fetch results for selected period
      const { data: res } = await supabase
        .from('commission_results')
        .select('*, sales_rep:sales_team(id, name, department, region)')
        .eq('period_year', selectedYear)
        .eq('period_month', selectedMonth)
        .order('earned_commission', { ascending: false });
      setResults(res || []);
      
    } catch (err) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => { fetchData(); }, [selectedYear, selectedMonth, user?.id]);
  
  // ============ FILTERED DATA ============
  const filteredResults = useMemo(() => {
    let filtered = [...results];
    
    if (filterTeam) {
      filtered = filtered.filter(r => r.sales_rep?.department === filterTeam);
    }
    if (filterStatus) {
      filtered = filtered.filter(r => r.payment_status === filterStatus);
    }
    if (filterHardStop) {
      filtered = filtered.filter(r => r.hard_stop_triggered);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r => 
        r.sales_rep?.name?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [results, filterTeam, filterStatus, filterHardStop, searchTerm]);
  
  const teams = useMemo(() => {
    const depts = new Set(salesTeam.map(s => s.department).filter(Boolean));
    return Array.from(depts) as string[];
  }, [salesTeam]);
  
  // ============ STATS ============
  const stats = useMemo(() => ({
    totalInputs: kpiInputs.length,
    totalReps: salesTeam.length,
    inputCoverage: salesTeam.length > 0 ? (kpiInputs.length / salesTeam.length * 100).toFixed(0) : '0',
    totalResults: results.length,
    totalEarned: results.reduce((sum, r) => sum + r.earned_commission, 0),
    totalBase: results.reduce((sum, r) => sum + r.base_commission_amount, 0),
    hardStopCount: results.filter(r => r.hard_stop_triggered).length,
    pendingCount: results.filter(r => r.payment_status === 'pending').length,
    approvedCount: results.filter(r => r.payment_status === 'approved').length,
    avgMultiplier: results.length > 0 
      ? results.reduce((sum, r) => sum + r.total_multiplier, 0) / results.length 
      : 0,
  }), [kpiInputs, salesTeam, results]);
  
  // ============ CONFIG HANDLERS ============
  const openConfigModal = (config?: CommissionConfig) => {
    if (config) {
      setEditingConfig({ ...config });
    } else {
      setEditingConfig({
        name: '',
        sales_weight: 0.60,
        collections_weight: 0.40,
        max_sales_score: 1.40,
        max_collections_score: 1.20,
        collections_hard_stop_threshold: 0.70,
        payment_delay_months: 0,
        effective_from: new Date().toISOString().split('T')[0],
        is_active: true,
      });
    }
    setConfigModalOpen(true);
  };
  
  const saveConfig = async () => {
    if (!editingConfig) return;
    
    // Validate weights
    const weightSum = (editingConfig.sales_weight || 0) + (editingConfig.collections_weight || 0);
    if (Math.abs(weightSum - 1) > 0.001) {
      alert('Satış ve Tahsilat ağırlıkları toplamı 1.00 olmalıdır!');
      return;
    }
    
    try {
      if (editingConfig.id) {
        // Update existing
        await supabase.from('commission_configs').update({
          ...editingConfig,
          updated_at: new Date().toISOString()
        }).eq('id', editingConfig.id);
      } else {
        // Create new
        const { data: newConfig } = await supabase
          .from('commission_configs')
          .insert([{
            ...editingConfig,
            created_at: new Date().toISOString()
          }])
          .select()
          .single();
        
        // Also create default thresholds
        if (newConfig) {
          await supabase.from('sales_score_thresholds').insert(
            DEFAULT_SALES_THRESHOLDS.map(t => ({ ...t, config_id: newConfig.id }))
          );
          await supabase.from('collections_score_thresholds').insert(
            DEFAULT_COLLECTIONS_THRESHOLDS.map(t => ({ ...t, config_id: newConfig.id }))
          );
        }
      }
      
      setConfigModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };
  
  const archiveConfig = async (id: string) => {
    if (!confirm('Bu konfigürasyonu arşivlemek istediğinize emin misiniz?')) return;
    try {
      await supabase.from('commission_configs').update({ is_active: false }).eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };
  
  // ============ KPI INPUT HANDLERS ============
  const openInputModal = (input?: KPIInput) => {
    if (input) {
      setEditingInput({ ...input });
    } else {
      setEditingInput({
        sales_rep_id: '',
        period_year: selectedYear,
        period_month: selectedMonth,
        sales_target: 0,
        actual_sales: 0,
        invoiced_amount: 0,
        collected_amount: 0,
        base_commission_amount: 0,
        notes: '',
      });
    }
    setInputModalOpen(true);
  };
  
  const saveKPIInput = async () => {
    if (!editingInput || !editingInput.sales_rep_id) {
      alert('Satış temsilcisi seçiniz');
      return;
    }
    
    // Validate no negatives
    if (editingInput.sales_target < 0 || editingInput.actual_sales < 0 ||
        editingInput.invoiced_amount < 0 || editingInput.collected_amount < 0 ||
        editingInput.base_commission_amount < 0) {
      alert('Negatif değerler kabul edilmez!');
      return;
    }
    
    try {
      if (editingInput.id) {
        await supabase.from('commission_kpi_inputs').update({
          ...editingInput,
          updated_at: new Date().toISOString()
        }).eq('id', editingInput.id);
      } else {
        await supabase.from('commission_kpi_inputs').insert([{
          ...editingInput,
          created_at: new Date().toISOString()
        }]);
      }
      setInputModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };
  
  const deleteKPIInput = async (id: string) => {
    if (!confirm('Bu girişi silmek istediğinize emin misiniz?')) return;
    try {
      await supabase.from('commission_kpi_inputs').delete().eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };
  
  // ============ CSV IMPORT HANDLERS ============
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const result = parseKPIInputCSV(text);
      
      setCsvPreviewData(result.data);
      setCsvErrors(result.errors);
      setCsvImportModalOpen(true);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };
  
  const importCsvData = async () => {
    if (csvPreviewData.length === 0) return;
    
    try {
      // Map CSV data to KPI inputs
      const inputs = csvPreviewData.map(row => {
        // Find rep by ID or name
        const rep = salesTeam.find(s => 
          s.id === row.rep_id || s.name.toLowerCase() === row.rep_name?.toLowerCase()
        );
        
        if (!rep) return null;
        
        const [year, month] = row.month.split('-').map(Number);
        
        return {
          sales_rep_id: rep.id,
          period_year: year,
          period_month: month,
          sales_target: row.sales_target,
          actual_sales: row.actual_sales,
          invoiced_amount: row.invoiced_amount,
          collected_amount: row.collected_amount,
          base_commission_amount: row.base_commission_amount,
          notes: row.notes || '',
          updated_at: new Date().toISOString(),
        };
      }).filter(Boolean);
      
      if (inputs.length === 0) {
        alert('İçe aktarılacak geçerli veri bulunamadı!');
        return;
      }
      
      // Upsert all
      const { error } = await supabase
        .from('commission_kpi_inputs')
        .upsert(inputs as any[], { onConflict: 'sales_rep_id,period_year,period_month' });
      
      if (error) throw error;
      
      alert(`${inputs.length} kayıt başarıyla içe aktarıldı!`);
      setCsvImportModalOpen(false);
      setCsvPreviewData([]);
      setCsvErrors([]);
      fetchData();
    } catch (err: any) {
      alert('İçe aktarma hatası: ' + err.message);
    }
  };
  
  const downloadCsvTemplate = () => {
    const template = generateKPIInputTemplate();
    downloadFile(template, 'kpi-input-template.csv');
  };
  
  // ============ CALCULATION HANDLER ============
  const runCalculation = async () => {
    if (!activeConfig) {
      alert('Aktif konfigürasyon bulunamadı!');
      return;
    }
    
    if (kpiInputs.length === 0) {
      alert('Hesaplanacak KPI girişi bulunamadı!');
      return;
    }
    
    if (!confirm(`${kpiInputs.length} kişi için prim hesaplanacak. Devam etmek istiyor musunuz?`)) {
      return;
    }
    
    setCalculating(true);
    setCalcProgress(0);
    setCalcStats(null);
    
    try {
      const calculationMonth = new Date(selectedYear, selectedMonth - 1, 1);
      const paymentMonth = new Date(calculationMonth);
      paymentMonth.setMonth(paymentMonth.getMonth() + activeConfig.payment_delay_months);
      
      const newResults: any[] = [];
      let hardStopCount = 0;
      let totalEarned = 0;
      
      for (let i = 0; i < kpiInputs.length; i++) {
        const input = kpiInputs[i];
        const calc = calculateCommission(input, activeConfig, salesThresholds, collectionsThresholds);
        
        if (calc.hard_stop_triggered) hardStopCount++;
        totalEarned += calc.earned_commission || 0;
        
        newResults.push({
          kpi_input_id: input.id,
          sales_rep_id: input.sales_rep_id,
          period_year: selectedYear,
          period_month: selectedMonth,
          sales_target: input.sales_target,
          actual_sales: input.actual_sales,
          invoiced_amount: input.invoiced_amount,
          collected_amount: input.collected_amount,
          base_commission_amount: input.base_commission_amount,
          ...calc,
          calculation_month: calculationMonth.toISOString().split('T')[0],
          payment_month: paymentMonth.toISOString().split('T')[0],
          payment_status: 'pending',
          config_id: activeConfig.id,
          calculated_at: new Date().toISOString(),
        });
        
        setCalcProgress(Math.round((i + 1) / kpiInputs.length * 100));
      }
      
      // Upsert results
      for (const result of newResults) {
        await supabase
          .from('commission_results')
          .upsert(result, { onConflict: 'sales_rep_id,period_year,period_month' });
      }
      
      setCalcStats({
        total: newResults.length,
        hardStops: hardStopCount,
        totalEarned: totalEarned,
      });
      
      fetchData();
    } catch (err: any) {
      alert('Hesaplama hatası: ' + err.message);
    } finally {
      setCalculating(false);
    }
  };
  
  // ============ RESULT HANDLERS ============
  const viewResultDetail = (result: CommissionResult) => {
    setSelectedResult(result);
    setResultDetailModalOpen(true);
  };
  
  const updatePaymentStatus = async (id: string, status: string) => {
    try {
      const updates: any = { payment_status: status };
      if (status === 'approved') {
        updates.approved_at = new Date().toISOString();
      }
      
      await supabase.from('commission_results').update(updates).eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };
  
  const exportResults = () => {
    const exportData: ResultExportRow[] = filteredResults.map(r => ({
      period: `${r.period_year}-${String(r.period_month).padStart(2, '0')}`,
      rep_name: r.sales_rep?.name || '',
      department: r.sales_rep?.department || '',
      sales_target: r.sales_target,
      actual_sales: r.actual_sales,
      sales_ratio: r.sales_attainment_ratio,
      sales_score: r.sales_score,
      invoiced_amount: r.invoiced_amount,
      collected_amount: r.collected_amount,
      collections_ratio: r.collections_ratio,
      collections_score: r.collections_score,
      multiplier: r.total_multiplier,
      base_commission: r.base_commission_amount,
      earned_commission: r.earned_commission,
      hard_stop: r.hard_stop_triggered,
      payment_status: r.payment_status,
      payment_month: r.payment_month,
    }));
    
    const csv = exportToCSV(exportData, RESULTS_EXPORT_COLUMNS);
    downloadFile(csv, `prim-sonuclari-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.csv`);
  };
  
  // ============ RENDER ============
  if (loading) {
    return (
      <div>
        <Header title="Prim Yönetimi" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }
  
  return (
    <div>
      <Header title="Prim Yönetimi" subtitle="Satış & Tahsilat Teşvik Motoru Admin Paneli" />
      
      <div className="p-6">
        {/* Role Badge */}
        <div className="mb-4 flex items-center justify-between">
          <Badge variant={userRole === 'admin' || userRole === 'super_admin' ? 'primary' : 'secondary'}>
            Rol: {userRole.replace('_', ' ').toUpperCase()}
          </Badge>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Dönem:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
            >
              {[2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
            >
              {MONTHS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <Button variant="secondary" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="mb-6 flex gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {[
            { key: 'overview', label: 'Genel Bakış', icon: Target },
            { key: 'configs', label: 'Konfigürasyon', icon: Settings, disabled: !canEditConfig(userRole) && userRole !== 'sales_ops' && userRole !== 'finance' },
            { key: 'inputs', label: 'KPI Girişleri', icon: FileSpreadsheet },
            { key: 'calculate', label: 'Hesapla', icon: Calculator, disabled: !canRunCalculation(userRole) },
            { key: 'results', label: 'Sonuçlar', icon: Award },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => !tab.disabled && setActiveTab(tab.key as any)}
              disabled={tab.disabled}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.key 
                  ? 'bg-white text-indigo-700 shadow' 
                  : tab.disabled 
                    ? 'text-slate-400 cursor-not-allowed'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* ============ OVERVIEW TAB ============ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{stats.totalInputs}/{stats.totalReps}</p>
                    <p className="text-xs text-slate-500">KPI Girişi ({stats.inputCoverage}%)</p>
                  </div>
                </div>
              </Card>
              
              <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Award className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-800">₺{formatMoney(stats.totalEarned)}</p>
                    <p className="text-xs text-slate-500">Toplam Prim</p>
                  </div>
                </div>
              </Card>
              
              <Card className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-violet-100 rounded-lg">
                    <Percent className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{(stats.avgMultiplier * 100).toFixed(1)}%</p>
                    <p className="text-xs text-slate-500">Ort. Çarpan</p>
                  </div>
                </div>
              </Card>
              
              <Card className="p-4 bg-gradient-to-br from-red-50 to-rose-50 border-red-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{stats.hardStopCount}</p>
                    <p className="text-xs text-slate-500">Hard Stop</p>
                  </div>
                </div>
              </Card>
            </div>
            
            {/* Quick Actions & Status */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Active Config Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings className="h-4 w-4" />
                    Aktif Konfigürasyon
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  {activeConfig ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{activeConfig.name}</span>
                        <Badge variant="success">Aktif</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="p-2 bg-slate-50 rounded">
                          <span className="text-slate-500">Satış Ağırlığı:</span>
                          <span className="ml-2 font-medium">{(activeConfig.sales_weight * 100).toFixed(0)}%</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded">
                          <span className="text-slate-500">Tahsilat Ağırlığı:</span>
                          <span className="ml-2 font-medium">{(activeConfig.collections_weight * 100).toFixed(0)}%</span>
                        </div>
                        <div className="p-2 bg-red-50 rounded col-span-2">
                          <span className="text-red-600">Hard Stop Eşiği:</span>
                          <span className="ml-2 font-medium text-red-700">{(activeConfig.collections_hard_stop_threshold * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-slate-500">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                      <p>Aktif konfigürasyon bulunamadı</p>
                    </div>
                  )}
                </CardBody>
              </Card>
              
              {/* Payment Status Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DollarSign className="h-4 w-4" />
                    Ödeme Durumu
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-amber-50 rounded">
                      <span className="text-amber-700">Beklemede</span>
                      <span className="font-bold text-amber-700">{stats.pendingCount}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
                      <span className="text-blue-700">Onaylandı</span>
                      <span className="font-bold text-blue-700">{stats.approvedCount}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
                      <span className="text-slate-600">Toplam Sonuç</span>
                      <span className="font-bold">{stats.totalResults}</span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        )}
        
        {/* ============ CONFIGS TAB ============ */}
        {activeTab === 'configs' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-700">Konfigürasyonlar</h3>
              {canEditConfig(userRole) && (
                <Button onClick={() => openConfigModal()}>
                  <Plus className="h-4 w-4" /> Yeni Konfigürasyon
                </Button>
              )}
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {configs.map((cfg) => (
                <Card key={cfg.id} className={`p-4 ${cfg.is_active ? 'border-emerald-200 bg-emerald-50/30' : ''}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-medium">{cfg.name}</h4>
                      <p className="text-xs text-slate-500">
                        {cfg.effective_from} - {cfg.effective_to || 'Süresiz'}
                      </p>
                    </div>
                    <Badge variant={cfg.is_active ? 'success' : 'secondary'}>
                      {cfg.is_active ? 'Aktif' : 'Arşiv'}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div>Satış: <strong>{(cfg.sales_weight * 100).toFixed(0)}%</strong></div>
                    <div>Tahsilat: <strong>{(cfg.collections_weight * 100).toFixed(0)}%</strong></div>
                    <div>Max S.Skor: <strong>{cfg.max_sales_score}</strong></div>
                    <div>Max T.Skor: <strong>{cfg.max_collections_score}</strong></div>
                    <div className="col-span-2">
                      Hard Stop: <strong className="text-red-600">{(cfg.collections_hard_stop_threshold * 100).toFixed(0)}%</strong>
                    </div>
                  </div>
                  
                  {canEditConfig(userRole) && cfg.is_active && (
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openConfigModal(cfg)}>
                        <Edit2 className="h-3 w-3" /> Düzenle
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => archiveConfig(cfg.id)}>
                        <Archive className="h-3 w-3" /> Arşivle
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
              
              {configs.length === 0 && (
                <div className="col-span-full">
                  <EmptyState
                    icon={<Settings className="h-12 w-12" />}
                    title="Konfigürasyon bulunamadı"
                    description="İlk konfigürasyonunuzu oluşturun"
                    action={canEditConfig(userRole) ? (
                      <Button onClick={() => openConfigModal()}>
                        <Plus className="h-4 w-4" /> Yeni Konfigürasyon
                      </Button>
                    ) : undefined}
                  />
                </div>
              )}
            </div>
            
            {/* Score Tables */}
            {activeConfig && (
              <div className="grid gap-4 md:grid-cols-2 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Satış Skor Tablosu</CardTitle>
                  </CardHeader>
                  <CardBody className="p-0">
                    <table className="w-full text-sm">
                      <thead className="bg-emerald-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Oran Aralığı</th>
                          <th className="px-3 py-2 text-right">Skor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesThresholds.map((t, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-3 py-2">
                              {(t.min_ratio * 100).toFixed(0)}% - {t.max_ratio ? `${(t.max_ratio * 100).toFixed(0)}%` : '∞'}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">{t.score.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardBody>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Tahsilat Skor Tablosu</CardTitle>
                  </CardHeader>
                  <CardBody className="p-0">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Oran Aralığı</th>
                          <th className="px-3 py-2 text-right">Skor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collectionsThresholds.map((t, i) => (
                          <tr key={i} className={`border-b last:border-0 ${t.score === 0 ? 'bg-red-50' : ''}`}>
                            <td className="px-3 py-2">
                              {(t.min_ratio * 100).toFixed(0)}% - {t.max_ratio ? `${(t.max_ratio * 100).toFixed(0)}%` : '∞'}
                              {t.score === 0 && <span className="ml-2 text-red-600 text-xs">HARD STOP</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">{t.score.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardBody>
                </Card>
              </div>
            )}
          </div>
        )}
        
        {/* ============ KPI INPUTS TAB ============ */}
        {activeTab === 'inputs' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 justify-between items-center">
              <h3 className="font-semibold text-slate-700">
                KPI Girişleri - {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}
              </h3>
              
              <div className="flex gap-2">
                <Button variant="secondary" onClick={downloadCsvTemplate}>
                  <Download className="h-4 w-4" /> Şablon İndir
                </Button>
                {canManageInputs(userRole) && (
                  <>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleCsvUpload}
                      />
                      <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">
                        <Upload className="h-4 w-4" /> CSV İçe Aktar
                      </span>
                    </label>
                    <Button onClick={() => openInputModal()}>
                      <Plus className="h-4 w-4" /> Manuel Giriş
                    </Button>
                  </>
                )}
              </div>
            </div>
            
            {/* Coverage Indicator */}
            <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-4">
              <span className="text-sm text-slate-600">Giriş Durumu:</span>
              <ProgressBar 
                value={parseInt(stats.inputCoverage)} 
                className="flex-1 max-w-xs" 
              />
              <span className="text-sm font-medium">
                {stats.totalInputs}/{stats.totalReps} temsilci ({stats.inputCoverage}%)
              </span>
            </div>
            
            {/* Inputs Table */}
            {kpiInputs.length > 0 ? (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-3 text-left font-medium">Temsilci</th>
                      <th className="px-3 py-3 text-left font-medium">Departman</th>
                      <th className="px-3 py-3 text-right font-medium">Satış Hedefi</th>
                      <th className="px-3 py-3 text-right font-medium">Gerçekleşen</th>
                      <th className="px-3 py-3 text-center font-medium">Satış %</th>
                      <th className="px-3 py-3 text-right font-medium">Fatura</th>
                      <th className="px-3 py-3 text-right font-medium">Tahsilat</th>
                      <th className="px-3 py-3 text-center font-medium">Tahsilat %</th>
                      <th className="px-3 py-3 text-right font-medium">Baz Prim</th>
                      <th className="px-3 py-3 text-center font-medium">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiInputs.map((input) => {
                      const collectionsWarning = input.invoiced_amount === 0 || (input.collections_ratio || 0) < 0.7;
                      return (
                        <tr key={input.id} className={`border-b hover:bg-slate-50 ${collectionsWarning ? 'bg-red-50/50' : ''}`}>
                          <td className="px-3 py-2 font-medium">{input.sales_rep?.name}</td>
                          <td className="px-3 py-2 text-slate-500">{input.sales_rep?.department || '-'}</td>
                          <td className="px-3 py-2 text-right">₺{formatMoney(input.sales_target)}</td>
                          <td className="px-3 py-2 text-right">₺{formatMoney(input.actual_sales)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`font-medium ${(input.sales_ratio || 0) >= 1 ? 'text-emerald-600' : (input.sales_ratio || 0) >= 0.9 ? 'text-amber-600' : 'text-red-600'}`}>
                              {((input.sales_ratio || 0) * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">₺{formatMoney(input.invoiced_amount)}</td>
                          <td className="px-3 py-2 text-right">₺{formatMoney(input.collected_amount)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`font-medium ${(input.collections_ratio || 0) >= 1 ? 'text-emerald-600' : (input.collections_ratio || 0) >= 0.7 ? 'text-amber-600' : 'text-red-600'}`}>
                              {((input.collections_ratio || 0) * 100).toFixed(1)}%
                              {collectionsWarning && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">₺{formatMoney(input.base_commission_amount)}</td>
                          <td className="px-3 py-2">
                            {canManageInputs(userRole) && (
                              <div className="flex justify-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openInputModal(input)}>
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => deleteKPIInput(input.id!)}>
                                  <Trash2 className="h-3 w-3 text-red-500" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<FileSpreadsheet className="h-12 w-12" />}
                title="KPI girişi bulunamadı"
                description="Bu dönem için henüz veri girilmemiş"
                action={canManageInputs(userRole) ? (
                  <div className="flex gap-2">
                    <label className="cursor-pointer">
                      <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                      <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">
                        <Upload className="h-4 w-4" /> CSV İçe Aktar
                      </span>
                    </label>
                    <Button onClick={() => openInputModal()}>
                      <Plus className="h-4 w-4" /> Manuel Giriş
                    </Button>
                  </div>
                ) : undefined}
              />
            )}
          </div>
        )}
        
        {/* ============ CALCULATE TAB ============ */}
        {activeTab === 'calculate' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-indigo-600" />
                  Prim Hesaplama - {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}
                </CardTitle>
              </CardHeader>
              <CardBody>
                {/* Pre-flight Checks */}
                <div className="space-y-4 mb-6">
                  <h4 className="font-medium text-slate-700">Ön Kontroller</h4>
                  
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className={`p-3 rounded-lg flex items-center gap-3 ${activeConfig ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      {activeConfig ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-medium">Konfigürasyon</p>
                        <p className="text-sm text-slate-600">
                          {activeConfig ? activeConfig.name : 'Aktif konfigürasyon bulunamadı!'}
                        </p>
                      </div>
                    </div>
                    
                    <div className={`p-3 rounded-lg flex items-center gap-3 ${kpiInputs.length > 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                      {kpiInputs.length > 0 ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-amber-600" />
                      )}
                      <div>
                        <p className="font-medium">KPI Girişleri</p>
                        <p className="text-sm text-slate-600">
                          {kpiInputs.length} / {salesTeam.length} temsilci ({stats.inputCoverage}%)
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {results.length > 0 && (
                    <div className="p-3 bg-amber-50 rounded-lg flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="font-medium text-amber-700">Dikkat!</p>
                        <p className="text-sm text-amber-600">
                          Bu dönem için {results.length} sonuç zaten mevcut. Yeniden hesaplama yapılırsa üzerine yazılacak.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Calculation Progress */}
                {calculating && (
                  <div className="mb-6 p-4 bg-indigo-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-indigo-700">Hesaplanıyor...</span>
                      <span className="text-sm text-indigo-600">{calcProgress}%</span>
                    </div>
                    <ProgressBar value={calcProgress} />
                  </div>
                )}
                
                {/* Calculation Results */}
                {calcStats && !calculating && (
                  <div className="mb-6 p-4 bg-emerald-50 rounded-lg">
                    <h4 className="font-medium text-emerald-700 mb-3">Hesaplama Tamamlandı!</h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-slate-800">{calcStats.total}</p>
                        <p className="text-xs text-slate-500">Hesaplanan</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-red-600">{calcStats.hardStops}</p>
                        <p className="text-xs text-slate-500">Hard Stop</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-emerald-600">₺{formatMoney(calcStats.totalEarned)}</p>
                        <p className="text-xs text-slate-500">Toplam Prim</p>
                      </div>
                    </div>
                    <div className="mt-4 text-center">
                      <Button variant="secondary" onClick={() => setActiveTab('results')}>
                        <Eye className="h-4 w-4" /> Sonuçları Görüntüle
                      </Button>
                    </div>
                  </div>
                )}
                
                {/* Run Button */}
                <div className="flex justify-center">
                  <Button 
                    onClick={runCalculation} 
                    disabled={calculating || !activeConfig || kpiInputs.length === 0}
                    className="px-8"
                  >
                    {calculating ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Hesaplanıyor...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        {kpiInputs.length} Kişi için Hesapla
                      </>
                    )}
                  </Button>
                </div>
              </CardBody>
            </Card>
            
            {/* Formula Reference */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Hesaplama Formülü</CardTitle>
              </CardHeader>
              <CardBody className="text-sm space-y-2">
                <div className="p-2 bg-slate-50 rounded font-mono text-xs">
                  Satış_Oranı = Gerçekleşen_Satış / Satış_Hedefi
                </div>
                <div className="p-2 bg-slate-50 rounded font-mono text-xs">
                  Tahsilat_Oranı = Tahsil_Edilen / Faturalanan
                </div>
                <div className="p-2 bg-slate-50 rounded font-mono text-xs">
                  Çarpan = (Satış_Skoru × {activeConfig?.sales_weight || 0.6}) + (Tahsilat_Skoru × {activeConfig?.collections_weight || 0.4})
                </div>
                <div className="p-2 bg-indigo-50 rounded font-mono text-xs">
                  Prim = Baz_Prim × Çarpan
                </div>
                <div className="p-2 bg-red-50 rounded font-mono text-xs text-red-700">
                  ⚠️ Tahsilat_Oranı &lt; {activeConfig ? (activeConfig.collections_hard_stop_threshold * 100).toFixed(0) : 70}% → Prim = 0 (HARD STOP)
                </div>
              </CardBody>
            </Card>
          </div>
        )}
        
        {/* ============ RESULTS TAB ============ */}
        {activeTab === 'results' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={filterTeam}
                  onChange={(e) => setFilterTeam(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
                >
                  <option value="">Tüm Departmanlar</option>
                  {teams.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
                >
                  <option value="">Tüm Durumlar</option>
                  {PAYMENT_STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filterHardStop}
                    onChange={(e) => setFilterHardStop(e.target.checked)}
                    className="rounded"
                  />
                  Sadece Hard Stop
                </label>
                
                <Input
                  placeholder="Temsilci ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-40"
                />
              </div>
              
              <Button variant="secondary" onClick={exportResults}>
                <Download className="h-4 w-4" /> CSV İndir
              </Button>
            </div>
            
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4 text-center p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="text-xl font-bold">{filteredResults.length}</p>
                <p className="text-xs text-slate-500">Sonuç</p>
              </div>
              <div>
                <p className="text-xl font-bold text-emerald-600">
                  ₺{formatMoney(filteredResults.reduce((s, r) => s + r.earned_commission, 0))}
                </p>
                <p className="text-xs text-slate-500">Toplam Prim</p>
              </div>
              <div>
                <p className="text-xl font-bold text-red-600">
                  {filteredResults.filter(r => r.hard_stop_triggered).length}
                </p>
                <p className="text-xs text-slate-500">Hard Stop</p>
              </div>
              <div>
                <p className="text-xl font-bold">
                  {(filteredResults.length > 0 
                    ? filteredResults.reduce((s, r) => s + r.total_multiplier, 0) / filteredResults.length * 100
                    : 0
                  ).toFixed(1)}%
                </p>
                <p className="text-xs text-slate-500">Ort. Çarpan</p>
              </div>
            </div>
            
            {/* Results Table */}
            {filteredResults.length > 0 ? (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-3 text-left font-medium">Temsilci</th>
                      <th className="px-3 py-3 text-center font-medium">Satış %</th>
                      <th className="px-3 py-3 text-center font-medium">S.Skor</th>
                      <th className="px-3 py-3 text-center font-medium">Tahsilat %</th>
                      <th className="px-3 py-3 text-center font-medium">T.Skor</th>
                      <th className="px-3 py-3 text-center font-medium">Çarpan</th>
                      <th className="px-3 py-3 text-right font-medium">Baz Prim</th>
                      <th className="px-3 py-3 text-right font-medium">Kazanılan</th>
                      <th className="px-3 py-3 text-center font-medium">Durum</th>
                      <th className="px-3 py-3 text-center font-medium">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((r) => (
                      <tr key={r.id} className={`border-b ${r.hard_stop_triggered ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-3 py-2">
                          <div>
                            <p className="font-medium">{r.sales_rep?.name}</p>
                            <p className="text-xs text-slate-500">{r.sales_rep?.department}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`font-medium ${r.sales_attainment_ratio >= 1 ? 'text-emerald-600' : r.sales_attainment_ratio >= 0.9 ? 'text-amber-600' : 'text-red-600'}`}>
                            {(r.sales_attainment_ratio * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center font-medium">{r.sales_score.toFixed(2)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`font-medium ${r.collections_ratio >= 1 ? 'text-emerald-600' : r.collections_ratio >= 0.7 ? 'text-amber-600' : 'text-red-600'}`}>
                            {(r.collections_ratio * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center font-medium">{r.collections_score.toFixed(2)}</td>
                        <td className="px-3 py-2 text-center font-bold text-indigo-600">{r.total_multiplier.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">₺{formatMoney(r.base_commission_amount)}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`font-bold ${r.hard_stop_triggered ? 'text-red-600' : 'text-emerald-600'}`}>
                            ₺{formatMoney(r.earned_commission)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.hard_stop_triggered ? (
                            <Badge variant="danger" className="text-xs">
                              HARD STOP
                            </Badge>
                          ) : (
                            <Badge 
                              variant={r.payment_status === 'paid' ? 'success' : r.payment_status === 'approved' ? 'primary' : 'warning'}
                              className="text-xs"
                            >
                              {PAYMENT_STATUSES.find(s => s.value === r.payment_status)?.label}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => viewResultDetail(r)}>
                              <Eye className="h-3 w-3" />
                            </Button>
                            {canApprovePayments(userRole) && r.payment_status === 'pending' && !r.hard_stop_triggered && (
                              <Button variant="ghost" size="sm" onClick={() => updatePaymentStatus(r.id, 'approved')}>
                                <Check className="h-3 w-3 text-emerald-600" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-medium">
                    <tr>
                      <td colSpan={6} className="px-3 py-3 text-right">TOPLAM:</td>
                      <td className="px-3 py-3 text-right">₺{formatMoney(filteredResults.reduce((s, r) => s + r.base_commission_amount, 0))}</td>
                      <td className="px-3 py-3 text-right text-emerald-600">₺{formatMoney(filteredResults.reduce((s, r) => s + r.earned_commission, 0))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<Award className="h-12 w-12" />}
                title="Sonuç bulunamadı"
                description="Seçili dönem ve filtreler için sonuç yok"
              />
            )}
          </div>
        )}
      </div>
      
      {/* ============ MODALS ============ */}
      
      {/* Config Modal */}
      <Modal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        title={editingConfig?.id ? 'Konfigürasyon Düzenle' : 'Yeni Konfigürasyon'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfigModalOpen(false)}>İptal</Button>
            <Button onClick={saveConfig}><Save className="h-4 w-4" /> Kaydet</Button>
          </>
        }
      >
        {editingConfig && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Konfigürasyon Adı *</label>
              <Input
                value={editingConfig.name || ''}
                onChange={(e) => setEditingConfig({ ...editingConfig, name: e.target.value })}
                placeholder="örn: 2025 Q1 Config"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Satış Ağırlığı *</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={editingConfig.sales_weight || 0.6}
                  onChange={(e) => setEditingConfig({ 
                    ...editingConfig, 
                    sales_weight: parseFloat(e.target.value) || 0,
                    collections_weight: Math.round((1 - (parseFloat(e.target.value) || 0)) * 100) / 100
                  })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tahsilat Ağırlığı *</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={editingConfig.collections_weight || 0.4}
                  onChange={(e) => setEditingConfig({ 
                    ...editingConfig, 
                    collections_weight: parseFloat(e.target.value) || 0,
                    sales_weight: Math.round((1 - (parseFloat(e.target.value) || 0)) * 100) / 100
                  })}
                />
              </div>
            </div>
            
            <div className="p-2 bg-slate-50 rounded text-sm text-center">
              Toplam: <strong>{((editingConfig.sales_weight || 0) + (editingConfig.collections_weight || 0)).toFixed(2)}</strong>
              {Math.abs((editingConfig.sales_weight || 0) + (editingConfig.collections_weight || 0) - 1) > 0.001 && (
                <span className="text-red-600 ml-2">⚠️ Toplam 1.00 olmalı!</span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Maks Satış Skoru</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editingConfig.max_sales_score || 1.4}
                  onChange={(e) => setEditingConfig({ ...editingConfig, max_sales_score: parseFloat(e.target.value) || 1.4 })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Maks Tahsilat Skoru</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editingConfig.max_collections_score || 1.2}
                  onChange={(e) => setEditingConfig({ ...editingConfig, max_collections_score: parseFloat(e.target.value) || 1.2 })}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-red-700 mb-1">Hard Stop Eşiği (Tahsilat)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={editingConfig.collections_hard_stop_threshold || 0.7}
                onChange={(e) => setEditingConfig({ ...editingConfig, collections_hard_stop_threshold: parseFloat(e.target.value) || 0.7 })}
              />
              <p className="text-xs text-slate-500 mt-1">
                Tahsilat oranı bu değerin altında kalırsa prim = 0
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ödeme Gecikmesi (ay)</label>
              <Input
                type="number"
                min="0"
                max="12"
                value={editingConfig.payment_delay_months || 0}
                onChange={(e) => setEditingConfig({ ...editingConfig, payment_delay_months: parseInt(e.target.value) || 0 })}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Geçerlilik Başlangıcı</label>
              <Input
                type="date"
                value={editingConfig.effective_from || ''}
                onChange={(e) => setEditingConfig({ ...editingConfig, effective_from: e.target.value })}
              />
            </div>
          </div>
        )}
      </Modal>
      
      {/* KPI Input Modal */}
      <Modal
        isOpen={inputModalOpen}
        onClose={() => setInputModalOpen(false)}
        title={editingInput?.id ? 'KPI Girişi Düzenle' : 'Yeni KPI Girişi'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setInputModalOpen(false)}>İptal</Button>
            <Button onClick={saveKPIInput}><Save className="h-4 w-4" /> Kaydet</Button>
          </>
        }
      >
        {editingInput && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Satış Temsilcisi *</label>
              <select
                value={editingInput.sales_rep_id}
                onChange={(e) => setEditingInput({ ...editingInput, sales_rep_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200"
              >
                <option value="">Seçiniz...</option>
                {salesTeam.map(rep => (
                  <option key={rep.id} value={rep.id}>{rep.name} ({rep.department})</option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Satış Hedefi (₺) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editingInput.sales_target}
                  onChange={(e) => setEditingInput({ ...editingInput, sales_target: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Gerçekleşen Satış (₺) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editingInput.actual_sales}
                  onChange={(e) => setEditingInput({ ...editingInput, actual_sales: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Faturalanan (₺) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editingInput.invoiced_amount}
                  onChange={(e) => setEditingInput({ ...editingInput, invoiced_amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tahsil Edilen (₺) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editingInput.collected_amount}
                  onChange={(e) => setEditingInput({ ...editingInput, collected_amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Baz Prim Tutarı (₺) *</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editingInput.base_commission_amount}
                onChange={(e) => setEditingInput({ ...editingInput, base_commission_amount: parseFloat(e.target.value) || 0 })}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notlar</label>
              <textarea
                value={editingInput.notes || ''}
                onChange={(e) => setEditingInput({ ...editingInput, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                rows={2}
              />
            </div>
            
            {/* Preview */}
            {editingInput.sales_rep_id && activeConfig && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <h4 className="font-medium text-sm text-slate-700 mb-2">Ön İzleme</h4>
                {(() => {
                  const preview = calculateCommission(editingInput, activeConfig, salesThresholds, collectionsThresholds);
                  return (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>Satış Oranı: <strong>{((preview.sales_attainment_ratio || 0) * 100).toFixed(1)}%</strong></div>
                      <div>Satış Skoru: <strong>{preview.sales_score?.toFixed(2)}</strong></div>
                      <div>Tahsilat Oranı: <strong>{((preview.collections_ratio || 0) * 100).toFixed(1)}%</strong></div>
                      <div>Tahsilat Skoru: <strong>{preview.collections_score?.toFixed(2)}</strong></div>
                      <div>Çarpan: <strong className="text-indigo-600">{preview.total_multiplier?.toFixed(4)}</strong></div>
                      <div>Kazanılan: <strong className={preview.hard_stop_triggered ? 'text-red-600' : 'text-emerald-600'}>
                        ₺{formatMoney(preview.earned_commission || 0)}
                      </strong></div>
                      {preview.hard_stop_triggered && (
                        <div className="col-span-2 text-red-600 font-medium">
                          ⚠️ HARD STOP: {preview.hard_stop_reason}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </Modal>
      
      {/* CSV Import Modal */}
      <Modal
        isOpen={csvImportModalOpen}
        onClose={() => { setCsvImportModalOpen(false); setCsvPreviewData([]); setCsvErrors([]); }}
        title="CSV İçe Aktarma"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setCsvImportModalOpen(false); setCsvPreviewData([]); setCsvErrors([]); }}>İptal</Button>
            <Button onClick={importCsvData} disabled={csvErrors.length > 0 || csvPreviewData.length === 0}>
              <Upload className="h-4 w-4" /> {csvPreviewData.length} Kayıt İçe Aktar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {csvErrors.length > 0 && (
            <div className="p-3 bg-red-50 rounded-lg">
              <h4 className="font-medium text-red-700 mb-2">Hatalar ({csvErrors.length})</h4>
              <div className="max-h-32 overflow-y-auto text-sm">
                {csvErrors.slice(0, 10).map((err, i) => (
                  <p key={i} className="text-red-600">
                    Satır {err.row}: {err.column} - {err.message}
                  </p>
                ))}
                {csvErrors.length > 10 && <p className="text-red-500">...ve {csvErrors.length - 10} hata daha</p>}
              </div>
            </div>
          )}
          
          {csvPreviewData.length > 0 && (
            <div>
              <h4 className="font-medium text-slate-700 mb-2">Önizleme ({csvPreviewData.length} kayıt)</h4>
              <div className="max-h-64 overflow-auto border rounded">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">Ay</th>
                      <th className="px-2 py-1 text-left">Temsilci</th>
                      <th className="px-2 py-1 text-right">Hedef</th>
                      <th className="px-2 py-1 text-right">Satış</th>
                      <th className="px-2 py-1 text-right">Fatura</th>
                      <th className="px-2 py-1 text-right">Tahsilat</th>
                      <th className="px-2 py-1 text-right">Baz Prim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreviewData.slice(0, 20).map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">{row.month}</td>
                        <td className="px-2 py-1">{row.rep_name || row.rep_id}</td>
                        <td className="px-2 py-1 text-right">₺{formatMoney(row.sales_target)}</td>
                        <td className="px-2 py-1 text-right">₺{formatMoney(row.actual_sales)}</td>
                        <td className="px-2 py-1 text-right">₺{formatMoney(row.invoiced_amount)}</td>
                        <td className="px-2 py-1 text-right">₺{formatMoney(row.collected_amount)}</td>
                        <td className="px-2 py-1 text-right">₺{formatMoney(row.base_commission_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvPreviewData.length > 20 && (
                  <p className="text-center py-2 text-slate-500 text-xs">...ve {csvPreviewData.length - 20} kayıt daha</p>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>
      
      {/* Result Detail Modal */}
      <Modal
        isOpen={resultDetailModalOpen}
        onClose={() => { setResultDetailModalOpen(false); setSelectedResult(null); }}
        title="Hesaplama Detayı"
      >
        {selectedResult && (
          <div className="space-y-4">
            {/* Rep Info */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <h4 className="font-medium mb-2">{selectedResult.sales_rep?.name}</h4>
              <p className="text-sm text-slate-500">{selectedResult.sales_rep?.department}</p>
              <p className="text-sm text-slate-500">
                Dönem: {selectedResult.period_year}-{String(selectedResult.period_month).padStart(2, '0')}
              </p>
            </div>
            
            {/* Hard Stop Warning */}
            {selectedResult.hard_stop_triggered && (
              <div className="p-3 bg-red-50 rounded-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="font-medium text-red-700">HARD STOP</p>
                  <p className="text-sm text-red-600">{selectedResult.hard_stop_reason}</p>
                </div>
              </div>
            )}
            
            {/* Calculation Breakdown */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Hesaplama Detayı</h4>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 bg-emerald-50 rounded">
                  <span className="text-slate-500">Satış Hedefi:</span>
                  <span className="ml-2 font-medium">₺{formatMoney(selectedResult.sales_target)}</span>
                </div>
                <div className="p-2 bg-emerald-50 rounded">
                  <span className="text-slate-500">Gerçekleşen:</span>
                  <span className="ml-2 font-medium">₺{formatMoney(selectedResult.actual_sales)}</span>
                </div>
                <div className="p-2 bg-emerald-50 rounded">
                  <span className="text-slate-500">Satış Oranı:</span>
                  <span className="ml-2 font-medium">{(selectedResult.sales_attainment_ratio * 100).toFixed(2)}%</span>
                </div>
                <div className="p-2 bg-emerald-50 rounded">
                  <span className="text-slate-500">Satış Skoru:</span>
                  <span className="ml-2 font-bold">{selectedResult.sales_score.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 bg-blue-50 rounded">
                  <span className="text-slate-500">Fatura:</span>
                  <span className="ml-2 font-medium">₺{formatMoney(selectedResult.invoiced_amount)}</span>
                </div>
                <div className="p-2 bg-blue-50 rounded">
                  <span className="text-slate-500">Tahsilat:</span>
                  <span className="ml-2 font-medium">₺{formatMoney(selectedResult.collected_amount)}</span>
                </div>
                <div className="p-2 bg-blue-50 rounded">
                  <span className="text-slate-500">Tahsilat Oranı:</span>
                  <span className={`ml-2 font-medium ${selectedResult.collections_ratio < 0.7 ? 'text-red-600' : ''}`}>
                    {(selectedResult.collections_ratio * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="p-2 bg-blue-50 rounded">
                  <span className="text-slate-500">Tahsilat Skoru:</span>
                  <span className="ml-2 font-bold">{selectedResult.collections_score.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="p-3 bg-indigo-50 rounded text-sm">
                <div className="flex justify-between mb-1">
                  <span>Formül:</span>
                  <span className="font-mono text-xs">
                    ({selectedResult.sales_score.toFixed(2)} × {selectedResult.sales_weight}) + 
                    ({selectedResult.collections_score.toFixed(2)} × {selectedResult.collections_weight})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Çarpan:</span>
                  <span className="font-bold text-indigo-700">{selectedResult.total_multiplier.toFixed(4)}</span>
                </div>
              </div>
              
              <div className="p-3 bg-violet-50 rounded text-sm">
                <div className="flex justify-between mb-1">
                  <span>Baz Prim:</span>
                  <span className="font-medium">₺{formatMoney(selectedResult.base_commission_amount)}</span>
                </div>
                <div className="flex justify-between text-lg">
                  <span className="font-medium">Kazanılan Prim:</span>
                  <span className={`font-bold ${selectedResult.hard_stop_triggered ? 'text-red-600' : 'text-emerald-600'}`}>
                    ₺{formatMoney(selectedResult.earned_commission)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Payment Info */}
            <div className="p-3 bg-slate-50 rounded-lg text-sm">
              <div className="flex justify-between mb-1">
                <span>Hesaplama Tarihi:</span>
                <span>{new Date(selectedResult.calculated_at).toLocaleString('tr-TR')}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span>Ödeme Ayı:</span>
                <span>{selectedResult.payment_month}</span>
              </div>
              <div className="flex justify-between">
                <span>Ödeme Durumu:</span>
                <Badge 
                  variant={selectedResult.payment_status === 'paid' ? 'success' : selectedResult.payment_status === 'approved' ? 'primary' : 'warning'}
                >
                  {PAYMENT_STATUSES.find(s => s.value === selectedResult.payment_status)?.label}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
