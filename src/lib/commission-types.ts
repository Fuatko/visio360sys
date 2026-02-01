// =============================================
// COMMISSION ENGINE - TYPES & SCHEMAS
// src/lib/commission-types.ts
// =============================================

import { z } from 'zod';

// ============ ENUMS ============

export type UserRole = 'admin' | 'sales_ops' | 'finance' | 'manager' | 'user';
export type PaymentStatus = 'pending' | 'approved' | 'paid' | 'cancelled';

// ============ BASE TYPES ============

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  team_id?: string;
  team_name?: string;
  is_active: boolean;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  region?: string;
  manager_id?: string;
  manager_name?: string;
  member_count: number;
}

export interface SalesRep {
  id: string;
  name: string;
  email?: string;
  department?: string;
  region?: string;
  team_id?: string;
  is_active: boolean;
}

// ============ CONFIG TYPES ============

export interface ScoreThreshold {
  id?: string;
  min_ratio: number;
  max_ratio: number | null;
  score: number;
}

export interface CommissionConfig {
  id: string;
  name: string;
  version: number;
  team_id?: string;
  team_name?: string;
  region?: string;
  
  // Weights
  sales_weight: number;
  collections_weight: number;
  
  // Score caps
  max_sales_score: number;
  max_collections_score: number;
  
  // Hard stop
  collections_hard_stop_threshold: number;
  
  // Payment
  payment_delay_months: number;
  
  // Thresholds
  sales_thresholds: ScoreThreshold[];
  collections_thresholds: ScoreThreshold[];
  
  // Status
  is_active: boolean;
  effective_from: string;
  effective_to?: string;
  
  // Audit
  created_at: string;
  created_by?: string;
  created_by_name?: string;
}

// ============ KPI INPUT TYPES ============

export interface KPIInputRow {
  id?: string;
  sales_rep_id: string;
  sales_rep_name?: string;
  period_year: number;
  period_month: number;
  
  // KPIs
  sales_target: number;
  actual_sales: number;
  invoiced_amount: number;
  collected_amount: number;
  base_commission_amount: number;
  
  // Optional
  notes?: string;
  currency?: string;
  
  // Computed (for display)
  sales_attainment_ratio?: number;
  collections_ratio?: number;
  
  // Validation flags
  has_zero_invoice?: boolean;
  has_validation_errors?: boolean;
  validation_errors?: string[];
  
  // Audit
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

export interface KPIInputBulkRequest {
  period_year: number;
  period_month: number;
  inputs: Omit<KPIInputRow, 'id' | 'period_year' | 'period_month' | 'created_at' | 'updated_at'>[];
}

// ============ CALCULATION TYPES ============

export interface CalculationRequest {
  period_year: number;
  period_month: number;
  team_id?: string;
  sales_rep_id?: string;
}

export interface CalculationRunResponse {
  success: boolean;
  period: string;
  total_processed: number;
  successful: number;
  failed: number;
  hard_stop_count: number;
  total_earned_commission: number;
  errors?: { sales_rep_id: string; error: string }[];
  results?: ResultRow[];
}

// ============ RESULT TYPES ============

export interface ResultRow {
  id: string;
  kpi_input_id: string;
  sales_rep_id: string;
  sales_rep_name?: string;
  team_name?: string;
  period_year: number;
  period_month: number;
  
  // Input snapshot
  sales_target: number;
  actual_sales: number;
  invoiced_amount: number;
  collected_amount: number;
  base_commission_amount: number;
  
  // Computed
  sales_attainment_ratio: number;
  collections_ratio: number;
  sales_score: number;
  collections_score: number;
  sales_weight: number;
  collections_weight: number;
  total_multiplier: number;
  earned_commission: number;
  
  // Flags
  hard_stop_triggered: boolean;
  hard_stop_reason?: string;
  
  // Payment
  calculation_month: string;
  payment_month: string;
  payment_status: PaymentStatus;
  
  // Config reference
  config_id: string;
  config_name?: string;
  
  // Audit
  calculated_at: string;
  calculated_by?: string;
  calculated_by_name?: string;
  approved_at?: string;
  approved_by?: string;
}

export interface ResultDetail extends ResultRow {
  // Full audit trail
  config_snapshot: CommissionConfig;
  input_snapshot: KPIInputRow;
  calculation_log: {
    step: string;
    value: number | string;
    timestamp: string;
  }[];
}

// ============ FILTER TYPES ============

export interface ResultFilters {
  period_year?: number;
  period_month?: number;
  team_id?: string;
  sales_rep_id?: string;
  payment_status?: PaymentStatus;
  hard_stop_only?: boolean;
  payment_month?: string;
}

// ============ ZOD SCHEMAS ============

// Month format validation
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format: YYYY-MM');

// Score threshold schema
export const scoreThresholdSchema = z.object({
  min_ratio: z.number().min(0).max(10),
  max_ratio: z.number().min(0).max(10).nullable(),
  score: z.number().min(0).max(2),
});

// Config form schema with weight validation
export const configFormSchema = z.object({
  name: z.string().min(1, 'Konfigürasyon adı zorunlu').max(100),
  team_id: z.string().optional(),
  region: z.string().optional(),
  
  sales_weight: z.number().min(0).max(1),
  collections_weight: z.number().min(0).max(1),
  
  max_sales_score: z.number().min(0.1).max(5).default(1.40),
  max_collections_score: z.number().min(0.1).max(5).default(1.20),
  
  collections_hard_stop_threshold: z.number().min(0).max(1).default(0.70),
  payment_delay_months: z.number().int().min(0).max(12).default(0),
  
  effective_from: z.string(),
  effective_to: z.string().optional(),
  
  sales_thresholds: z.array(scoreThresholdSchema).min(1),
  collections_thresholds: z.array(scoreThresholdSchema).min(1),
}).refine(
  (data) => Math.abs(data.sales_weight + data.collections_weight - 1) < 0.0001,
  { message: 'Satış ve Tahsilat ağırlıkları toplamı 1.00 olmalı', path: ['sales_weight'] }
);

// KPI input row schema (no negatives)
export const kpiInputRowSchema = z.object({
  sales_rep_id: z.string().uuid('Geçersiz temsilci ID'),
  sales_target: z.number().nonnegative('Negatif değer olamaz'),
  actual_sales: z.number().nonnegative('Negatif değer olamaz'),
  invoiced_amount: z.number().nonnegative('Negatif değer olamaz'),
  collected_amount: z.number().nonnegative('Negatif değer olamaz'),
  base_commission_amount: z.number().nonnegative('Negatif değer olamaz'),
  notes: z.string().max(500).optional(),
});

// CSV row parsing schema (strings -> numbers)
export const csvRowSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Geçersiz ay formatı'),
  rep_id: z.string().min(1, 'Temsilci ID zorunlu'),
  rep_name: z.string().optional(),
  sales_target: z.string().transform((val) => {
    const num = parseFloat(val.replace(/[,\s]/g, '').replace(',', '.'));
    if (isNaN(num) || num < 0) throw new Error('Geçersiz satış hedefi');
    return num;
  }),
  actual_sales: z.string().transform((val) => {
    const num = parseFloat(val.replace(/[,\s]/g, '').replace(',', '.'));
    if (isNaN(num) || num < 0) throw new Error('Geçersiz satış');
    return num;
  }),
  invoiced_amount: z.string().transform((val) => {
    const num = parseFloat(val.replace(/[,\s]/g, '').replace(',', '.'));
    if (isNaN(num) || num < 0) throw new Error('Geçersiz fatura tutarı');
    return num;
  }),
  collected_amount: z.string().transform((val) => {
    const num = parseFloat(val.replace(/[,\s]/g, '').replace(',', '.'));
    if (isNaN(num) || num < 0) throw new Error('Geçersiz tahsilat');
    return num;
  }),
  base_commission_amount: z.string().transform((val) => {
    const num = parseFloat(val.replace(/[,\s]/g, '').replace(',', '.'));
    if (isNaN(num) || num < 0) throw new Error('Geçersiz baz prim');
    return num;
  }),
  notes: z.string().optional().default(''),
});

// Filter schema
export const resultFiltersSchema = z.object({
  period_year: z.number().int().min(2020).max(2030).optional(),
  period_month: z.number().int().min(1).max(12).optional(),
  team_id: z.string().uuid().optional(),
  sales_rep_id: z.string().uuid().optional(),
  payment_status: z.enum(['pending', 'approved', 'paid', 'cancelled']).optional(),
  hard_stop_only: z.boolean().optional(),
  payment_month: monthSchema.optional(),
});

// ============ TYPE GUARDS ============

export function isAdmin(role: UserRole): boolean {
  return role === 'admin';
}

export function isSalesOps(role: UserRole): boolean {
  return role === 'admin' || role === 'sales_ops';
}

export function isFinance(role: UserRole): boolean {
  return role === 'admin' || role === 'finance';
}

export function canEditConfig(role: UserRole): boolean {
  return role === 'admin';
}

export function canManageInputs(role: UserRole): boolean {
  return role === 'admin' || role === 'sales_ops';
}

export function canRunCalculation(role: UserRole): boolean {
  return role === 'admin' || role === 'sales_ops';
}

export function canViewResults(role: UserRole): boolean {
  return true; // All roles can view (with scope restrictions)
}

export function canExportResults(role: UserRole): boolean {
  return role === 'admin' || role === 'sales_ops' || role === 'finance';
}

export function canApprovePayments(role: UserRole): boolean {
  return role === 'admin' || role === 'finance';
}

// ============ PERMISSION MATRIX ============

export const PERMISSION_MATRIX = {
  config: {
    view: ['admin', 'sales_ops', 'finance'],
    create: ['admin'],
    edit: ['admin'],
    archive: ['admin'],
  },
  kpi_inputs: {
    view: ['admin', 'sales_ops', 'finance', 'manager'],
    create: ['admin', 'sales_ops'],
    edit: ['admin', 'sales_ops'],
    delete: ['admin'],
    import: ['admin', 'sales_ops'],
  },
  calculation: {
    run: ['admin', 'sales_ops'],
    view_logs: ['admin', 'sales_ops', 'finance'],
  },
  results: {
    view: ['admin', 'sales_ops', 'finance', 'manager'],
    export: ['admin', 'sales_ops', 'finance'],
    approve: ['admin', 'finance'],
    cancel: ['admin'],
  },
  users: {
    view: ['admin', 'sales_ops'],
    manage: ['admin'],
  },
} as const;

// ============ HELPERS ============

export function formatPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parsePeriod(period: string): { year: number; month: number } {
  const [year, month] = period.split('-').map(Number);
  return { year, month };
}

export function formatMoney(amount: number, currency = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(ratio: number, decimals = 1): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

export function formatRatio(ratio: number, decimals = 4): string {
  return ratio.toFixed(decimals);
}
