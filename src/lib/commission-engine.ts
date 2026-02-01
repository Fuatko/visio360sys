// =============================================
// SALES & COLLECTIONS INCENTIVE ENGINE
// lib/commission-engine.ts
// =============================================

import { createClient } from '@/lib/supabase';

// ============ TYPES ============

export interface ScoreTier {
  min: number;
  max: number;
  score: number;
}

export interface CommissionConfig {
  id: string;
  team_id: string | null;
  region: string | null;
  effective_from: string;
  effective_to: string | null;
  sales_weight: number;
  collections_weight: number;
  sales_score_tiers: ScoreTier[];
  collections_score_tiers: ScoreTier[];
  sales_score_cap: number;
  collections_score_cap: number;
  collections_hard_stop_threshold: number;
  payment_delay_months: number;
  is_active: boolean;
}

export interface KPIInput {
  id?: string;
  sales_rep_id: string;
  period_month: string; // YYYY-MM-DD (first of month)
  sales_target: number;
  actual_sales: number;
  invoiced_amount: number;
  collected_amount: number;
  base_commission_amount: number;
  currency?: string;
  notes?: string;
}

export interface CommissionResult {
  id?: string;
  sales_rep_id: string;
  kpi_input_id: string;
  config_id: string;
  calculation_month: string;
  payment_month: string;
  input_snapshot: KPIInput;
  sales_attainment_ratio: number;
  collections_ratio: number;
  sales_score: number;
  collections_score: number;
  sales_weight_used: number;
  collections_weight_used: number;
  total_multiplier: number;
  earned_commission: number;
  hard_stop_triggered: boolean;
  hard_stop_reason: string | null;
  config_snapshot: CommissionConfig;
  status: 'calculated' | 'approved' | 'paid' | 'cancelled';
}

export interface CalculationError {
  code: string;
  message: string;
  details?: any;
}

export interface CalculationResponse {
  success: boolean;
  result?: CommissionResult;
  error?: CalculationError;
}

// ============ CONSTANTS ============

const DECIMAL_PRECISION_RATIO = 4;
const DECIMAL_PRECISION_MONEY = 2;

// Default score tiers (used if no config found)
const DEFAULT_SALES_TIERS: ScoreTier[] = [
  { min: 0, max: 0.6999, score: 0.00 },
  { min: 0.70, max: 0.8999, score: 0.60 },
  { min: 0.90, max: 0.9999, score: 0.85 },
  { min: 1.00, max: 1.0999, score: 1.00 },
  { min: 1.10, max: 1.1999, score: 1.20 },
  { min: 1.20, max: 999, score: 1.40 },
];

const DEFAULT_COLLECTIONS_TIERS: ScoreTier[] = [
  { min: 0, max: 0.6999, score: 0.00 },
  { min: 0.70, max: 0.8499, score: 0.50 },
  { min: 0.85, max: 0.9499, score: 0.80 },
  { min: 0.95, max: 0.9999, score: 1.00 },
  { min: 1.00, max: 999, score: 1.20 },
];

// ============ UTILITY FUNCTIONS ============

/**
 * Round to specified decimal places
 */
function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Parse month string to Date (first day of month)
 */
function parseMonth(monthStr: string): Date {
  // Accept YYYY-MM or YYYY-MM-DD
  const parts = monthStr.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
}

/**
 * Format Date to YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Add months to a date
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Lookup score from tiers based on ratio
 */
function lookupScore(ratio: number, tiers: ScoreTier[], cap: number): number {
  let score = 0;
  
  for (const tier of tiers) {
    if (ratio >= tier.min && ratio <= tier.max) {
      score = tier.score;
      break;
    }
  }
  
  // Apply cap
  return Math.min(score, cap);
}

// ============ VALIDATION ============

export function validateKPIInput(input: KPIInput): CalculationError | null {
  // Check for negative values
  if (input.sales_target < 0) {
    return { code: 'NEGATIVE_VALUE', message: 'sales_target cannot be negative' };
  }
  if (input.actual_sales < 0) {
    return { code: 'NEGATIVE_VALUE', message: 'actual_sales cannot be negative' };
  }
  if (input.invoiced_amount < 0) {
    return { code: 'NEGATIVE_VALUE', message: 'invoiced_amount cannot be negative' };
  }
  if (input.collected_amount < 0) {
    return { code: 'NEGATIVE_VALUE', message: 'collected_amount cannot be negative' };
  }
  if (input.base_commission_amount < 0) {
    return { code: 'NEGATIVE_VALUE', message: 'base_commission_amount cannot be negative' };
  }
  
  // Check for division by zero potential
  if (input.sales_target === 0) {
    return { code: 'ZERO_TARGET', message: 'sales_target cannot be zero' };
  }
  
  return null;
}

export function validateConfig(config: CommissionConfig): CalculationError | null {
  // Check weights sum to 1
  const weightSum = round(config.sales_weight + config.collections_weight, 4);
  if (weightSum !== 1.0) {
    return { 
      code: 'INVALID_WEIGHTS', 
      message: `Weights must sum to 1.0, got ${weightSum}`,
      details: { sales_weight: config.sales_weight, collections_weight: config.collections_weight }
    };
  }
  
  return null;
}

// ============ MAIN CALCULATION ENGINE ============

export class CommissionEngine {
  private supabase;
  
  constructor() {
    this.supabase = createClient();
  }
  
  /**
   * Get effective config for a sales rep and month
   */
  async getEffectiveConfig(salesRepId: string, month: string): Promise<CommissionConfig | null> {
    const monthDate = formatDate(parseMonth(month));
    
    // Get rep's team info
    const { data: rep } = await this.supabase
      .from('sales_team')
      .select('id, region')
      .eq('id', salesRepId)
      .single();
    
    // Query configs with priority: team > region > global
    const { data: configs } = await this.supabase
      .from('commission_configs')
      .select('*')
      .eq('is_active', true)
      .lte('effective_from', monthDate)
      .or(`effective_to.is.null,effective_to.gte.${monthDate}`)
      .order('effective_from', { ascending: false });
    
    if (!configs || configs.length === 0) return null;
    
    // Priority matching
    for (const config of configs) {
      // Team-specific match
      if (config.team_id === salesRepId) {
        return config as CommissionConfig;
      }
    }
    
    for (const config of configs) {
      // Region-specific match
      if (!config.team_id && config.region === rep?.region) {
        return config as CommissionConfig;
      }
    }
    
    // Global config (no team, no region)
    for (const config of configs) {
      if (!config.team_id && !config.region) {
        return config as CommissionConfig;
      }
    }
    
    return null;
  }
  
  /**
   * Calculate commission for a single rep/month
   */
  async calculateCommission(
    input: KPIInput,
    config: CommissionConfig,
    calculatedBy?: string
  ): Promise<CalculationResponse> {
    // Validate input
    const inputError = validateKPIInput(input);
    if (inputError) {
      return { success: false, error: inputError };
    }
    
    // Validate config
    const configError = validateConfig(config);
    if (configError) {
      return { success: false, error: configError };
    }
    
    // ===== STEP 1: Calculate Ratios =====
    const salesAttainmentRatio = round(
      input.actual_sales / input.sales_target,
      DECIMAL_PRECISION_RATIO
    );
    
    // Handle invoiced_amount = 0 case
    let collectionsRatio: number;
    if (input.invoiced_amount === 0) {
      // If no invoices, collections ratio is 0 (triggers hard stop)
      collectionsRatio = 0;
    } else {
      collectionsRatio = round(
        input.collected_amount / input.invoiced_amount,
        DECIMAL_PRECISION_RATIO
      );
    }
    
    // ===== STEP 2: Check HARD STOP =====
    let hardStopTriggered = false;
    let hardStopReason: string | null = null;
    
    if (collectionsRatio < config.collections_hard_stop_threshold) {
      hardStopTriggered = true;
      hardStopReason = `Collections ratio (${collectionsRatio}) below hard stop threshold (${config.collections_hard_stop_threshold})`;
    }
    
    // ===== STEP 3: Lookup Scores =====
    const salesScore = lookupScore(
      salesAttainmentRatio,
      config.sales_score_tiers,
      config.sales_score_cap
    );
    
    const collectionsScore = lookupScore(
      collectionsRatio,
      config.collections_score_tiers,
      config.collections_score_cap
    );
    
    // ===== STEP 4: Calculate Multiplier =====
    const totalMultiplier = round(
      (salesScore * config.sales_weight) + (collectionsScore * config.collections_weight),
      DECIMAL_PRECISION_RATIO
    );
    
    // ===== STEP 5: Calculate Final Commission =====
    let earnedCommission: number;
    if (hardStopTriggered) {
      earnedCommission = 0;
    } else {
      earnedCommission = round(
        input.base_commission_amount * totalMultiplier,
        DECIMAL_PRECISION_MONEY
      );
    }
    
    // ===== STEP 6: Determine Payment Month =====
    const calculationMonth = parseMonth(input.period_month);
    const paymentMonth = addMonths(calculationMonth, config.payment_delay_months);
    
    // ===== BUILD RESULT =====
    const result: CommissionResult = {
      sales_rep_id: input.sales_rep_id,
      kpi_input_id: input.id || '',
      config_id: config.id,
      calculation_month: formatDate(calculationMonth),
      payment_month: formatDate(paymentMonth),
      input_snapshot: input,
      sales_attainment_ratio: salesAttainmentRatio,
      collections_ratio: collectionsRatio,
      sales_score: salesScore,
      collections_score: collectionsScore,
      sales_weight_used: config.sales_weight,
      collections_weight_used: config.collections_weight,
      total_multiplier: totalMultiplier,
      earned_commission: earnedCommission,
      hard_stop_triggered: hardStopTriggered,
      hard_stop_reason: hardStopReason,
      config_snapshot: config,
      status: 'calculated'
    };
    
    return { success: true, result };
  }
  
  /**
   * Process and persist commission calculation
   */
  async processAndSave(
    salesRepId: string,
    month: string,
    calculatedBy?: string
  ): Promise<CalculationResponse> {
    const monthDate = formatDate(parseMonth(month));
    
    // 1. Get KPI input
    const { data: input, error: inputErr } = await this.supabase
      .from('commission_kpi_inputs')
      .select('*')
      .eq('sales_rep_id', salesRepId)
      .eq('period_month', monthDate)
      .single();
    
    if (inputErr || !input) {
      return {
        success: false,
        error: { code: 'INPUT_NOT_FOUND', message: `No KPI input found for rep ${salesRepId} in ${month}` }
      };
    }
    
    // 2. Get effective config
    const config = await this.getEffectiveConfig(salesRepId, month);
    if (!config) {
      return {
        success: false,
        error: { code: 'CONFIG_NOT_FOUND', message: `No active commission config found for ${month}` }
      };
    }
    
    // 3. Calculate
    const calcResponse = await this.calculateCommission(input, config, calculatedBy);
    if (!calcResponse.success || !calcResponse.result) {
      return calcResponse;
    }
    
    // 4. Upsert result (idempotent)
    const { data: savedResult, error: saveErr } = await this.supabase
      .from('commission_results')
      .upsert({
        ...calcResponse.result,
        kpi_input_id: input.id,
        calculated_by: calculatedBy,
        calculated_at: new Date().toISOString()
      }, {
        onConflict: 'sales_rep_id,calculation_month'
      })
      .select()
      .single();
    
    if (saveErr) {
      return {
        success: false,
        error: { code: 'SAVE_ERROR', message: saveErr.message }
      };
    }
    
    // 5. Log audit
    await this.supabase.from('commission_audit_log').insert({
      action: 'CALCULATE',
      period_month: monthDate,
      sales_rep_id: salesRepId,
      result_id: savedResult.id,
      details: {
        earned_commission: calcResponse.result.earned_commission,
        hard_stop: calcResponse.result.hard_stop_triggered
      },
      performed_by: calculatedBy
    });
    
    return { success: true, result: savedResult };
  }
  
  /**
   * Batch calculate for all reps in a month
   */
  async calculateForMonth(
    month: string,
    calculatedBy?: string
  ): Promise<{ successful: number; failed: number; errors: any[] }> {
    const monthDate = formatDate(parseMonth(month));
    
    // Get all inputs for the month
    const { data: inputs } = await this.supabase
      .from('commission_kpi_inputs')
      .select('sales_rep_id')
      .eq('period_month', monthDate);
    
    if (!inputs || inputs.length === 0) {
      return { successful: 0, failed: 0, errors: [] };
    }
    
    let successful = 0;
    let failed = 0;
    const errors: any[] = [];
    
    for (const input of inputs) {
      const result = await this.processAndSave(input.sales_rep_id, month, calculatedBy);
      if (result.success) {
        successful++;
      } else {
        failed++;
        errors.push({ sales_rep_id: input.sales_rep_id, error: result.error });
      }
    }
    
    return { successful, failed, errors };
  }
}

// ============ API HANDLERS ============

/**
 * POST /api/commission/configs
 * Create or update commission config
 */
export async function createOrUpdateConfig(config: Partial<CommissionConfig>) {
  const supabase = createClient();
  
  // Validate weights if provided
  if (config.sales_weight !== undefined && config.collections_weight !== undefined) {
    const sum = round(config.sales_weight + config.collections_weight, 4);
    if (sum !== 1.0) {
      throw new Error(`Weights must sum to 1.0, got ${sum}`);
    }
  }
  
  if (config.id) {
    // Update
    const { data, error } = await supabase
      .from('commission_configs')
      .update({ ...config, updated_at: new Date().toISOString() })
      .eq('id', config.id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } else {
    // Create
    const { data, error } = await supabase
      .from('commission_configs')
      .insert(config)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}

/**
 * POST /api/commission/kpi-inputs
 * Upsert monthly KPI inputs
 */
export async function upsertKPIInput(input: KPIInput) {
  const supabase = createClient();
  
  // Validate
  const error = validateKPIInput(input);
  if (error) throw new Error(error.message);
  
  // Normalize month to first of month
  const monthDate = formatDate(parseMonth(input.period_month));
  
  const { data, error: dbError } = await supabase
    .from('commission_kpi_inputs')
    .upsert({
      ...input,
      period_month: monthDate,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'sales_rep_id,period_month'
    })
    .select()
    .single();
  
  if (dbError) throw dbError;
  return data;
}

/**
 * GET /api/commission/results
 * Get commission results
 */
export async function getResults(filters: {
  month?: string;
  sales_rep_id?: string;
  status?: string;
}) {
  const supabase = createClient();
  
  let query = supabase
    .from('commission_results')
    .select('*, sales_rep:sales_team(name)')
    .order('calculation_month', { ascending: false });
  
  if (filters.month) {
    const monthDate = formatDate(parseMonth(filters.month));
    query = query.eq('calculation_month', monthDate);
  }
  
  if (filters.sales_rep_id) {
    query = query.eq('sales_rep_id', filters.sales_rep_id);
  }
  
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ============ EXPORT SINGLETON ============

export const commissionEngine = new CommissionEngine();
