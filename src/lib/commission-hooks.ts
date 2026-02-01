// =============================================
// COMMISSION ENGINE - REACT QUERY HOOKS
// src/lib/commission-hooks.ts
// =============================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import type {
  User,
  Team,
  SalesRep,
  CommissionConfig,
  KPIInputRow,
  KPIInputBulkRequest,
  CalculationRequest,
  CalculationRunResponse,
  ResultRow,
  ResultDetail,
  ResultFilters,
  ScoreThreshold,
} from './commission-types';

const supabase = createClient();

// ============ QUERY KEYS ============

export const queryKeys = {
  me: ['me'] as const,
  teams: ['teams'] as const,
  users: (filters?: { team_id?: string }) => ['users', filters] as const,
  salesReps: ['sales-reps'] as const,
  configs: (filters?: { active?: boolean; team_id?: string }) => ['configs', filters] as const,
  configDetail: (id: string) => ['config', id] as const,
  kpiInputs: (year: number, month: number, filters?: { team_id?: string; rep_id?: string }) => 
    ['kpi-inputs', year, month, filters] as const,
  results: (filters: ResultFilters) => ['results', filters] as const,
  resultDetail: (id: string) => ['result', id] as const,
};

// ============ USER HOOKS ============

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<User | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data } = await supabase
        .from('users')
        .select('*, team:sales_team(id, name)')
        .eq('id', user.id)
        .single();
      
      return data ? {
        id: data.id,
        email: data.email,
        name: data.name || data.email,
        role: data.role || 'user',
        team_id: data.team?.id,
        team_name: data.team?.name,
        is_active: true,
        created_at: data.created_at,
      } : null;
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

export function useTeams() {
  return useQuery({
    queryKey: queryKeys.teams,
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await supabase
        .from('sales_team')
        .select('id, name, department, region')
        .order('name');
      
      if (error) throw error;
      
      // Group by department as "teams"
      const departments = new Map<string, Team>();
      data?.forEach(rep => {
        const dept = rep.department || 'Genel';
        if (!departments.has(dept)) {
          departments.set(dept, {
            id: dept,
            name: dept,
            region: rep.region,
            member_count: 0,
          });
        }
        departments.get(dept)!.member_count++;
      });
      
      return Array.from(departments.values());
    },
  });
}

export function useSalesReps(teamId?: string) {
  return useQuery({
    queryKey: ['sales-reps', teamId],
    queryFn: async (): Promise<SalesRep[]> => {
      let query = supabase
        .from('sales_team')
        .select('*')
        .order('name');
      
      if (teamId) {
        query = query.eq('department', teamId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return data?.map(rep => ({
        id: rep.id,
        name: rep.name,
        email: rep.email,
        department: rep.department,
        region: rep.region,
        team_id: rep.department,
        is_active: true,
      })) || [];
    },
  });
}

// ============ CONFIG HOOKS ============

export function useActiveConfig(teamId?: string) {
  return useQuery({
    queryKey: queryKeys.configs({ active: true, team_id: teamId }),
    queryFn: async (): Promise<CommissionConfig | null> => {
      let query = supabase
        .from('commission_configs')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (teamId) {
        query = query.eq('team_id', teamId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      if (!data || data.length === 0) return null;
      
      const config = data[0];
      
      // Fetch thresholds
      const [salesTh, collTh] = await Promise.all([
        supabase.from('sales_score_thresholds').select('*').eq('config_id', config.id).order('min_ratio'),
        supabase.from('collections_score_thresholds').select('*').eq('config_id', config.id).order('min_ratio'),
      ]);
      
      return {
        ...config,
        sales_thresholds: salesTh.data || [],
        collections_thresholds: collTh.data || [],
      };
    },
  });
}

export function useConfigs(filters?: { active?: boolean; team_id?: string }) {
  return useQuery({
    queryKey: queryKeys.configs(filters),
    queryFn: async (): Promise<CommissionConfig[]> => {
      let query = supabase
        .from('commission_configs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (filters?.active !== undefined) {
        query = query.eq('is_active', filters.active);
      }
      if (filters?.team_id) {
        query = query.eq('team_id', filters.team_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return data || [];
    },
  });
}

export function useCreateConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (config: Partial<CommissionConfig> & { 
      sales_thresholds: ScoreThreshold[];
      collections_thresholds: ScoreThreshold[];
    }) => {
      // Insert config
      const { data: newConfig, error: configError } = await supabase
        .from('commission_configs')
        .insert({
          name: config.name,
          team_id: config.team_id,
          region: config.region,
          sales_weight: config.sales_weight,
          collections_weight: config.collections_weight,
          max_sales_score: config.max_sales_score,
          max_collections_score: config.max_collections_score,
          collections_hard_stop_threshold: config.collections_hard_stop_threshold,
          payment_delay_months: config.payment_delay_months,
          effective_from: config.effective_from,
          effective_to: config.effective_to,
          is_active: true,
        })
        .select()
        .single();
      
      if (configError) throw configError;
      
      // Insert thresholds
      if (config.sales_thresholds?.length) {
        await supabase.from('sales_score_thresholds').insert(
          config.sales_thresholds.map(t => ({ ...t, config_id: newConfig.id }))
        );
      }
      
      if (config.collections_thresholds?.length) {
        await supabase.from('collections_score_thresholds').insert(
          config.collections_thresholds.map(t => ({ ...t, config_id: newConfig.id }))
        );
      }
      
      return newConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] });
    },
  });
}

export function useArchiveConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (configId: string) => {
      const { error } = await supabase
        .from('commission_configs')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', configId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] });
    },
  });
}

// ============ KPI INPUT HOOKS ============

export function useKpiInputs(year: number, month: number, filters?: { team_id?: string; rep_id?: string }) {
  return useQuery({
    queryKey: queryKeys.kpiInputs(year, month, filters),
    queryFn: async (): Promise<KPIInputRow[]> => {
      let query = supabase
        .from('commission_kpi_inputs')
        .select('*, sales_rep:sales_team(id, name, department, region)')
        .eq('period_year', year)
        .eq('period_month', month)
        .order('sales_rep(name)');
      
      if (filters?.rep_id) {
        query = query.eq('sales_rep_id', filters.rep_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return data?.map(row => ({
        ...row,
        sales_rep_name: row.sales_rep?.name,
        sales_attainment_ratio: row.sales_target > 0 ? row.actual_sales / row.sales_target : 0,
        collections_ratio: row.invoiced_amount > 0 ? row.collected_amount / row.invoiced_amount : 0,
        has_zero_invoice: row.invoiced_amount === 0,
      })).filter(row => {
        if (filters?.team_id && row.sales_rep?.department !== filters.team_id) {
          return false;
        }
        return true;
      }) || [];
    },
  });
}

export function useUpsertKpiInput() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: KPIInputRow) => {
      const { data, error } = await supabase
        .from('commission_kpi_inputs')
        .upsert({
          sales_rep_id: input.sales_rep_id,
          period_year: input.period_year,
          period_month: input.period_month,
          sales_target: input.sales_target,
          actual_sales: input.actual_sales,
          invoiced_amount: input.invoiced_amount,
          collected_amount: input.collected_amount,
          base_commission_amount: input.base_commission_amount,
          notes: input.notes,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'sales_rep_id,period_year,period_month',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.kpiInputs(variables.period_year, variables.period_month) 
      });
    },
  });
}

export function useBulkUpsertKpiInputs() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (request: KPIInputBulkRequest) => {
      const rows = request.inputs.map(input => ({
        sales_rep_id: input.sales_rep_id,
        period_year: request.period_year,
        period_month: request.period_month,
        sales_target: input.sales_target,
        actual_sales: input.actual_sales,
        invoiced_amount: input.invoiced_amount,
        collected_amount: input.collected_amount,
        base_commission_amount: input.base_commission_amount,
        notes: input.notes,
        updated_at: new Date().toISOString(),
      }));
      
      const { error } = await supabase
        .from('commission_kpi_inputs')
        .upsert(rows, {
          onConflict: 'sales_rep_id,period_year,period_month',
        });
      
      if (error) throw error;
      
      return { success: true, count: rows.length };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.kpiInputs(variables.period_year, variables.period_month) 
      });
    },
  });
}

export function useDeleteKpiInput() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, year, month }: { id: string; year: number; month: number }) => {
      const { error } = await supabase
        .from('commission_kpi_inputs')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.kpiInputs(variables.year, variables.month) 
      });
    },
  });
}

// ============ CALCULATION HOOKS ============

export function useRunCalculation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (request: CalculationRequest): Promise<CalculationRunResponse> => {
      // Get config
      const { data: configs } = await supabase
        .from('commission_configs')
        .select('*')
        .eq('is_active', true)
        .limit(1);
      
      if (!configs || configs.length === 0) {
        throw new Error('Aktif konfigürasyon bulunamadı');
      }
      
      const config = configs[0];
      
      // Get thresholds
      const [salesTh, collTh] = await Promise.all([
        supabase.from('sales_score_thresholds').select('*').eq('config_id', config.id).order('min_ratio'),
        supabase.from('collections_score_thresholds').select('*').eq('config_id', config.id).order('min_ratio'),
      ]);
      
      // Get KPI inputs
      let inputQuery = supabase
        .from('commission_kpi_inputs')
        .select('*')
        .eq('period_year', request.period_year)
        .eq('period_month', request.period_month);
      
      if (request.sales_rep_id) {
        inputQuery = inputQuery.eq('sales_rep_id', request.sales_rep_id);
      }
      
      const { data: inputs, error: inputError } = await inputQuery;
      if (inputError) throw inputError;
      
      if (!inputs || inputs.length === 0) {
        return {
          success: false,
          period: `${request.period_year}-${String(request.period_month).padStart(2, '0')}`,
          total_processed: 0,
          successful: 0,
          failed: 0,
          hard_stop_count: 0,
          total_earned_commission: 0,
          errors: [{ sales_rep_id: '', error: 'Hesaplanacak KPI girişi bulunamadı' }],
        };
      }
      
      // Calculate for each input
      const calculationMonth = new Date(request.period_year, request.period_month - 1, 1);
      const paymentMonth = new Date(calculationMonth);
      paymentMonth.setMonth(paymentMonth.getMonth() + config.payment_delay_months);
      
      const results: any[] = [];
      const errors: { sales_rep_id: string; error: string }[] = [];
      let hardStopCount = 0;
      let totalEarned = 0;
      
      for (const input of inputs) {
        try {
          // Calculate ratios
          const salesRatio = input.sales_target > 0 ? input.actual_sales / input.sales_target : 0;
          const collectionsRatio = input.invoiced_amount > 0 ? input.collected_amount / input.invoiced_amount : 0;
          
          // Lookup scores
          const salesScore = lookupScore(salesRatio, salesTh.data || [], config.max_sales_score);
          const collectionsScore = lookupScore(collectionsRatio, collTh.data || [], config.max_collections_score);
          
          // Check hard stop
          const hardStopTriggered = collectionsRatio < config.collections_hard_stop_threshold;
          const hardStopReason = hardStopTriggered 
            ? `Tahsilat oranı (${(collectionsRatio * 100).toFixed(1)}%) < ${config.collections_hard_stop_threshold * 100}%`
            : null;
          
          if (hardStopTriggered) hardStopCount++;
          
          // Calculate multiplier and commission
          const totalMultiplier = hardStopTriggered ? 0 : (salesScore * config.sales_weight) + (collectionsScore * config.collections_weight);
          const earnedCommission = hardStopTriggered ? 0 : input.base_commission_amount * totalMultiplier;
          
          totalEarned += earnedCommission;
          
          results.push({
            kpi_input_id: input.id,
            sales_rep_id: input.sales_rep_id,
            period_year: request.period_year,
            period_month: request.period_month,
            sales_target: input.sales_target,
            actual_sales: input.actual_sales,
            invoiced_amount: input.invoiced_amount,
            collected_amount: input.collected_amount,
            base_commission_amount: input.base_commission_amount,
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
            calculation_month: calculationMonth.toISOString().split('T')[0],
            payment_month: paymentMonth.toISOString().split('T')[0],
            payment_status: 'pending',
            config_id: config.id,
            calculated_at: new Date().toISOString(),
          });
        } catch (err: any) {
          errors.push({ sales_rep_id: input.sales_rep_id, error: err.message });
        }
      }
      
      // Upsert results
      if (results.length > 0) {
        const { error: upsertError } = await supabase
          .from('commission_results')
          .upsert(results, {
            onConflict: 'sales_rep_id,period_year,period_month',
          });
        
        if (upsertError) throw upsertError;
      }
      
      return {
        success: errors.length === 0,
        period: `${request.period_year}-${String(request.period_month).padStart(2, '0')}`,
        total_processed: inputs.length,
        successful: results.length,
        failed: errors.length,
        hard_stop_count: hardStopCount,
        total_earned_commission: totalEarned,
        errors: errors.length > 0 ? errors : undefined,
      };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['results'] });
    },
  });
}

function lookupScore(ratio: number, thresholds: ScoreThreshold[], cap: number): number {
  const sorted = [...thresholds].sort((a, b) => a.min_ratio - b.min_ratio);
  for (const t of sorted) {
    if (ratio >= t.min_ratio && (t.max_ratio === null || ratio < t.max_ratio)) {
      return Math.min(t.score, cap);
    }
  }
  return 0;
}

// ============ RESULTS HOOKS ============

export function useResults(filters: ResultFilters) {
  return useQuery({
    queryKey: queryKeys.results(filters),
    queryFn: async (): Promise<ResultRow[]> => {
      let query = supabase
        .from('commission_results')
        .select('*, sales_rep:sales_team(id, name, department, region)')
        .order('earned_commission', { ascending: false });
      
      if (filters.period_year && filters.period_month) {
        query = query
          .eq('period_year', filters.period_year)
          .eq('period_month', filters.period_month);
      }
      
      if (filters.sales_rep_id) {
        query = query.eq('sales_rep_id', filters.sales_rep_id);
      }
      
      if (filters.payment_status) {
        query = query.eq('payment_status', filters.payment_status);
      }
      
      if (filters.hard_stop_only) {
        query = query.eq('hard_stop_triggered', true);
      }
      
      if (filters.payment_month) {
        query = query.eq('payment_month', filters.payment_month);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return data?.map(row => ({
        ...row,
        sales_rep_name: row.sales_rep?.name,
        team_name: row.sales_rep?.department,
      })).filter(row => {
        if (filters.team_id && row.sales_rep?.department !== filters.team_id) {
          return false;
        }
        return true;
      }) || [];
    },
    enabled: !!(filters.period_year && filters.period_month),
  });
}

export function useResultDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.resultDetail(id),
    queryFn: async (): Promise<ResultDetail | null> => {
      const { data, error } = await supabase
        .from('commission_results')
        .select('*, sales_rep:sales_team(*), config:commission_configs(*)')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      if (!data) return null;
      
      // Get thresholds for config snapshot
      const [salesTh, collTh] = await Promise.all([
        supabase.from('sales_score_thresholds').select('*').eq('config_id', data.config_id).order('min_ratio'),
        supabase.from('collections_score_thresholds').select('*').eq('config_id', data.config_id).order('min_ratio'),
      ]);
      
      return {
        ...data,
        sales_rep_name: data.sales_rep?.name,
        team_name: data.sales_rep?.department,
        config_name: data.config?.name,
        config_snapshot: {
          ...data.config,
          sales_thresholds: salesTh.data || [],
          collections_thresholds: collTh.data || [],
        },
        input_snapshot: {
          sales_rep_id: data.sales_rep_id,
          period_year: data.period_year,
          period_month: data.period_month,
          sales_target: data.sales_target,
          actual_sales: data.actual_sales,
          invoiced_amount: data.invoiced_amount,
          collected_amount: data.collected_amount,
          base_commission_amount: data.base_commission_amount,
        },
        calculation_log: [
          { step: 'Satış Oranı', value: data.sales_attainment_ratio, timestamp: data.calculated_at },
          { step: 'Tahsilat Oranı', value: data.collections_ratio, timestamp: data.calculated_at },
          { step: 'Satış Skoru', value: data.sales_score, timestamp: data.calculated_at },
          { step: 'Tahsilat Skoru', value: data.collections_score, timestamp: data.calculated_at },
          { step: 'Çarpan', value: data.total_multiplier, timestamp: data.calculated_at },
          { step: 'Kazanılan Prim', value: data.earned_commission, timestamp: data.calculated_at },
        ],
      };
    },
    enabled: !!id,
  });
}

export function useUpdatePaymentStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { payment_status: status };
      
      if (status === 'approved') {
        updates.approved_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('commission_results')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['results'] });
    },
  });
}

// ============ EXPORT HOOKS ============

export function useExportResults(filters: ResultFilters) {
  return useMutation({
    mutationFn: async () => {
      const results = await supabase
        .from('commission_results')
        .select('*, sales_rep:sales_team(name, department)')
        .eq('period_year', filters.period_year!)
        .eq('period_month', filters.period_month!)
        .order('sales_rep(name)');
      
      if (results.error) throw results.error;
      
      // Convert to CSV
      const headers = [
        'Dönem', 'Temsilci', 'Departman',
        'Satış Hedefi', 'Gerçekleşen', 'Satış %', 'Satış Skoru',
        'Fatura', 'Tahsilat', 'Tahsilat %', 'Tahsilat Skoru',
        'Baz Prim', 'Çarpan', 'Kazanılan Prim',
        'Hard Stop', 'Ödeme Durumu', 'Ödeme Ayı'
      ];
      
      const rows = results.data?.map(r => [
        `${r.period_year}-${String(r.period_month).padStart(2, '0')}`,
        r.sales_rep?.name || '',
        r.sales_rep?.department || '',
        r.sales_target,
        r.actual_sales,
        `${(r.sales_attainment_ratio * 100).toFixed(1)}%`,
        r.sales_score.toFixed(2),
        r.invoiced_amount,
        r.collected_amount,
        `${(r.collections_ratio * 100).toFixed(1)}%`,
        r.collections_score.toFixed(2),
        r.base_commission_amount,
        r.total_multiplier.toFixed(4),
        r.earned_commission,
        r.hard_stop_triggered ? 'EVET' : 'HAYIR',
        r.payment_status,
        r.payment_month,
      ]) || [];
      
      const csv = [headers, ...rows].map(row => row.join(';')).join('\n');
      
      // Download
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `prim-sonuclari-${filters.period_year}-${filters.period_month}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      
      return { success: true };
    },
  });
}
