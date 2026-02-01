# Sales & Collections Incentive (Commission) Engine

## 1) Overview

A configurable commission calculation system that rewards both **sales performance** and **collections performance**. 

**Core Principle**: "Sale alone is not enough; cash collected is required."

### Key Features:
- Dual KPI scoring (Sales + Collections)
- Configurable thresholds and weights
- Hard stop rule for poor collections
- Full audit trail
- Idempotent calculations

---

## 2) Data Model (DDL)

```sql
-- =============================================
-- COMMISSION ENGINE SCHEMA
-- =============================================

-- 1. Commission Configuration (per organization/team)
CREATE TABLE commission_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  team_id UUID, -- NULL = global default
  region TEXT,
  
  -- Weights (must sum to 1.0)
  sales_weight DECIMAL(4,2) NOT NULL DEFAULT 0.60,
  collections_weight DECIMAL(4,2) NOT NULL DEFAULT 0.40,
  
  -- Hard stop threshold
  collections_hard_stop_threshold DECIMAL(4,2) NOT NULL DEFAULT 0.70,
  
  -- Payment delay (months)
  payment_delay_months INTEGER NOT NULL DEFAULT 0,
  
  -- Validity period
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE, -- NULL = no end date
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  
  CONSTRAINT chk_weights_sum CHECK (sales_weight + collections_weight = 1.00),
  CONSTRAINT chk_weights_positive CHECK (sales_weight >= 0 AND collections_weight >= 0),
  CONSTRAINT chk_hard_stop CHECK (collections_hard_stop_threshold >= 0 AND collections_hard_stop_threshold <= 1)
);

-- 2. Sales Score Thresholds
CREATE TABLE sales_score_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES commission_configs(id) ON DELETE CASCADE,
  min_ratio DECIMAL(5,2) NOT NULL, -- inclusive
  max_ratio DECIMAL(5,2), -- exclusive, NULL = infinity
  score DECIMAL(4,2) NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_ratio_range CHECK (min_ratio >= 0 AND (max_ratio IS NULL OR max_ratio > min_ratio)),
  CONSTRAINT chk_score_range CHECK (score >= 0 AND score <= 2.00)
);

-- 3. Collections Score Thresholds
CREATE TABLE collections_score_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES commission_configs(id) ON DELETE CASCADE,
  min_ratio DECIMAL(5,2) NOT NULL,
  max_ratio DECIMAL(5,2),
  score DECIMAL(4,2) NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_ratio_range CHECK (min_ratio >= 0 AND (max_ratio IS NULL OR max_ratio > min_ratio)),
  CONSTRAINT chk_score_range CHECK (score >= 0 AND score <= 2.00)
);

-- 4. Monthly KPI Inputs (per sales rep per month)
CREATE TABLE commission_kpi_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id UUID NOT NULL REFERENCES sales_team(id),
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  
  -- Sales KPIs
  sales_target DECIMAL(15,2) NOT NULL CHECK (sales_target >= 0),
  actual_sales DECIMAL(15,2) NOT NULL CHECK (actual_sales >= 0),
  
  -- Collections KPIs
  invoiced_amount DECIMAL(15,2) NOT NULL CHECK (invoiced_amount >= 0),
  collected_amount DECIMAL(15,2) NOT NULL CHECK (collected_amount >= 0),
  
  -- Base commission (the "potential" amount before multiplier)
  base_commission_amount DECIMAL(15,2) NOT NULL CHECK (base_commission_amount >= 0),
  
  -- Metadata
  config_id UUID REFERENCES commission_configs(id),
  input_source TEXT, -- 'manual', 'import', 'api'
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  
  CONSTRAINT uq_rep_period UNIQUE (sales_rep_id, period_year, period_month)
);

-- 5. Commission Calculation Results (audit trail)
CREATE TABLE commission_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_input_id UUID NOT NULL REFERENCES commission_kpi_inputs(id),
  sales_rep_id UUID NOT NULL REFERENCES sales_team(id),
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  
  -- Snapshot of inputs (for audit)
  sales_target DECIMAL(15,2) NOT NULL,
  actual_sales DECIMAL(15,2) NOT NULL,
  invoiced_amount DECIMAL(15,2) NOT NULL,
  collected_amount DECIMAL(15,2) NOT NULL,
  base_commission_amount DECIMAL(15,2) NOT NULL,
  
  -- Computed ratios (4 decimal precision)
  sales_attainment_ratio DECIMAL(6,4),
  collections_ratio DECIMAL(6,4),
  
  -- Scores from threshold lookup
  sales_score DECIMAL(4,2) NOT NULL,
  collections_score DECIMAL(4,2) NOT NULL,
  
  -- Weights used (snapshot)
  sales_weight DECIMAL(4,2) NOT NULL,
  collections_weight DECIMAL(4,2) NOT NULL,
  
  -- Final calculation
  total_multiplier DECIMAL(6,4) NOT NULL,
  earned_commission DECIMAL(15,2) NOT NULL,
  
  -- Rule flags
  hard_stop_triggered BOOLEAN DEFAULT false,
  hard_stop_reason TEXT,
  
  -- Payment info
  calculation_month DATE NOT NULL, -- YYYY-MM-01
  payment_month DATE NOT NULL, -- YYYY-MM-01 (after delay)
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'approved', 'paid', 'cancelled')),
  
  -- Config reference
  config_id UUID REFERENCES commission_configs(id),
  config_snapshot JSONB, -- Full config at calculation time
  
  -- Audit
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  calculated_by UUID,
  version INTEGER DEFAULT 1, -- Increment on recalculation
  
  CONSTRAINT uq_result_period UNIQUE (sales_rep_id, period_year, period_month, version)
);

-- Indexes
CREATE INDEX idx_kpi_inputs_rep_period ON commission_kpi_inputs(sales_rep_id, period_year, period_month);
CREATE INDEX idx_results_rep_period ON commission_results(sales_rep_id, period_year, period_month);
CREATE INDEX idx_results_payment_month ON commission_results(payment_month, payment_status);
CREATE INDEX idx_configs_effective ON commission_configs(effective_from, effective_to, is_active);

-- =============================================
-- DEFAULT DATA SEED
-- =============================================

-- Insert default global config
INSERT INTO commission_configs (name, sales_weight, collections_weight, collections_hard_stop_threshold, payment_delay_months)
VALUES ('Default Global Config', 0.60, 0.40, 0.70, 0);

-- Get the config ID for threshold seeding
DO $$
DECLARE
  default_config_id UUID;
BEGIN
  SELECT id INTO default_config_id FROM commission_configs WHERE name = 'Default Global Config' LIMIT 1;
  
  -- Sales Score Thresholds (default)
  INSERT INTO sales_score_thresholds (config_id, min_ratio, max_ratio, score) VALUES
    (default_config_id, 0.00, 0.70, 0.00),
    (default_config_id, 0.70, 0.90, 0.60),
    (default_config_id, 0.90, 1.00, 0.85),
    (default_config_id, 1.00, 1.10, 1.00),
    (default_config_id, 1.10, 1.20, 1.20),
    (default_config_id, 1.20, NULL, 1.40);
  
  -- Collections Score Thresholds (default)
  INSERT INTO collections_score_thresholds (config_id, min_ratio, max_ratio, score) VALUES
    (default_config_id, 0.00, 0.70, 0.00),
    (default_config_id, 0.70, 0.85, 0.50),
    (default_config_id, 0.85, 0.95, 0.80),
    (default_config_id, 0.95, 1.00, 1.00),
    (default_config_id, 1.00, NULL, 1.20);
END $$;
```

---

## 3) Config Structure (JSON)

```json
{
  "id": "uuid",
  "name": "Default Global Config",
  "team_id": null,
  "region": null,
  "sales_weight": 0.60,
  "collections_weight": 0.40,
  "collections_hard_stop_threshold": 0.70,
  "payment_delay_months": 0,
  "effective_from": "2025-01-01",
  "effective_to": null,
  "is_active": true,
  "sales_thresholds": [
    { "min_ratio": 0.00, "max_ratio": 0.70, "score": 0.00 },
    { "min_ratio": 0.70, "max_ratio": 0.90, "score": 0.60 },
    { "min_ratio": 0.90, "max_ratio": 1.00, "score": 0.85 },
    { "min_ratio": 1.00, "max_ratio": 1.10, "score": 1.00 },
    { "min_ratio": 1.10, "max_ratio": 1.20, "score": 1.20 },
    { "min_ratio": 1.20, "max_ratio": null, "score": 1.40 }
  ],
  "collections_thresholds": [
    { "min_ratio": 0.00, "max_ratio": 0.70, "score": 0.00 },
    { "min_ratio": 0.70, "max_ratio": 0.85, "score": 0.50 },
    { "min_ratio": 0.85, "max_ratio": 0.95, "score": 0.80 },
    { "min_ratio": 0.95, "max_ratio": 1.00, "score": 1.00 },
    { "min_ratio": 1.00, "max_ratio": null, "score": 1.20 }
  ]
}
```

---

## 4) API Design

### POST /api/commission/configs
Create or update commission configuration.

**Request:**
```json
{
  "name": "Q1 2025 Config",
  "team_id": "uuid-optional",
  "sales_weight": 0.60,
  "collections_weight": 0.40,
  "collections_hard_stop_threshold": 0.70,
  "payment_delay_months": 1,
  "effective_from": "2025-01-01",
  "sales_thresholds": [...],
  "collections_thresholds": [...]
}
```

**Response (201):**
```json
{
  "success": true,
  "data": { "id": "uuid", ...config }
}
```

**Error (400):**
```json
{
  "success": false,
  "error": "INVALID_WEIGHTS",
  "message": "sales_weight + collections_weight must equal 1.00"
}
```

---

### POST /api/commission/kpi-inputs
Upsert monthly KPI inputs for a sales rep.

**Request:**
```json
{
  "sales_rep_id": "uuid",
  "period_year": 2025,
  "period_month": 1,
  "sales_target": 100000.00,
  "actual_sales": 95000.00,
  "invoiced_amount": 80000.00,
  "collected_amount": 72000.00,
  "base_commission_amount": 5000.00,
  "notes": "January inputs"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "sales_rep_id": "uuid",
    "period": "2025-01",
    ...
  }
}
```

---

### POST /api/commission/calculate
Trigger commission calculation.

**Query Params:**
- `year` (required): 2025
- `month` (required): 1
- `sales_rep_id` (optional): Calculate for specific rep

**Response (200):**
```json
{
  "success": true,
  "data": {
    "calculated_count": 10,
    "results": [
      {
        "sales_rep_id": "uuid",
        "sales_rep_name": "Ahmet Yılmaz",
        "period": "2025-01",
        "sales_attainment_ratio": 0.9500,
        "collections_ratio": 0.9000,
        "sales_score": 0.85,
        "collections_score": 0.80,
        "total_multiplier": 0.8300,
        "base_commission": 5000.00,
        "earned_commission": 4150.00,
        "hard_stop_triggered": false,
        "payment_month": "2025-02"
      }
    ]
  }
}
```

---

### GET /api/commission/results
Retrieve calculation results.

**Query Params:**
- `year`, `month`
- `sales_rep_id` (optional)
- `payment_status` (optional)

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "2025-01",
    "total_earned": 42500.00,
    "results": [...]
  }
}
```

---

## 5) Calculation Logic (TypeScript)

```typescript
// types.ts
interface KPIInput {
  id: string;
  sales_rep_id: string;
  period_year: number;
  period_month: number;
  sales_target: number;
  actual_sales: number;
  invoiced_amount: number;
  collected_amount: number;
  base_commission_amount: number;
}

interface ScoreThreshold {
  min_ratio: number;
  max_ratio: number | null;
  score: number;
}

interface CommissionConfig {
  id: string;
  sales_weight: number;
  collections_weight: number;
  collections_hard_stop_threshold: number;
  payment_delay_months: number;
  sales_thresholds: ScoreThreshold[];
  collections_thresholds: ScoreThreshold[];
}

interface CalculationResult {
  kpi_input_id: string;
  sales_rep_id: string;
  period_year: number;
  period_month: number;
  
  // Inputs snapshot
  sales_target: number;
  actual_sales: number;
  invoiced_amount: number;
  collected_amount: number;
  base_commission_amount: number;
  
  // Computed
  sales_attainment_ratio: number | null;
  collections_ratio: number | null;
  sales_score: number;
  collections_score: number;
  sales_weight: number;
  collections_weight: number;
  total_multiplier: number;
  earned_commission: number;
  
  // Flags
  hard_stop_triggered: boolean;
  hard_stop_reason: string | null;
  
  // Payment
  calculation_month: Date;
  payment_month: Date;
  config_id: string;
  config_snapshot: CommissionConfig;
}

// calculator.ts
const DECIMAL_PRECISION = 4;
const MONEY_PRECISION = 2;

function round(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

function lookupScore(ratio: number, thresholds: ScoreThreshold[]): number {
  // Sort by min_ratio ascending
  const sorted = [...thresholds].sort((a, b) => a.min_ratio - b.min_ratio);
  
  for (const threshold of sorted) {
    const inRange = ratio >= threshold.min_ratio && 
      (threshold.max_ratio === null || ratio < threshold.max_ratio);
    if (inRange) {
      return threshold.score;
    }
  }
  
  // Fallback: return 0 if no match (shouldn't happen with proper config)
  return 0;
}

function validateInputs(input: KPIInput): { valid: boolean; error?: string } {
  if (input.sales_target < 0 || input.actual_sales < 0) {
    return { valid: false, error: 'NEGATIVE_SALES_VALUES' };
  }
  if (input.invoiced_amount < 0 || input.collected_amount < 0) {
    return { valid: false, error: 'NEGATIVE_COLLECTION_VALUES' };
  }
  if (input.base_commission_amount < 0) {
    return { valid: false, error: 'NEGATIVE_BASE_COMMISSION' };
  }
  return { valid: true };
}

function calculateCommission(
  input: KPIInput,
  config: CommissionConfig
): CalculationResult {
  // Validate
  const validation = validateInputs(input);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 1. Calculate Sales Attainment Ratio
  let sales_attainment_ratio: number | null = null;
  if (input.sales_target > 0) {
    sales_attainment_ratio = round(
      input.actual_sales / input.sales_target,
      DECIMAL_PRECISION
    );
  } else {
    // If target is 0 and actual_sales > 0, treat as infinite (cap at max score)
    // If both are 0, treat as 0%
    sales_attainment_ratio = input.actual_sales > 0 ? 999 : 0;
  }

  // 2. Calculate Collections Ratio
  let collections_ratio: number | null = null;
  let collections_edge_case = false;
  
  if (input.invoiced_amount > 0) {
    collections_ratio = round(
      input.collected_amount / input.invoiced_amount,
      DECIMAL_PRECISION
    );
  } else {
    // EDGE CASE: invoiced_amount = 0
    // If nothing was invoiced, collections performance is undefined
    // Business rule: Treat as 0% => triggers HARD STOP
    collections_ratio = 0;
    collections_edge_case = true;
  }

  // 3. Lookup Scores
  const sales_score = lookupScore(sales_attainment_ratio, config.sales_thresholds);
  const collections_score = lookupScore(collections_ratio, config.collections_thresholds);

  // 4. Check HARD STOP
  let hard_stop_triggered = false;
  let hard_stop_reason: string | null = null;

  if (collections_ratio < config.collections_hard_stop_threshold) {
    hard_stop_triggered = true;
    hard_stop_reason = collections_edge_case
      ? `Collections ratio undefined (invoiced=0), treated as 0% < ${config.collections_hard_stop_threshold * 100}%`
      : `Collections ratio ${(collections_ratio * 100).toFixed(2)}% < ${config.collections_hard_stop_threshold * 100}% threshold`;
  }

  // 5. Calculate Total Multiplier
  const total_multiplier = hard_stop_triggered
    ? 0
    : round(
        (sales_score * config.sales_weight) + (collections_score * config.collections_weight),
        DECIMAL_PRECISION
      );

  // 6. Calculate Earned Commission
  const earned_commission = hard_stop_triggered
    ? 0
    : round(input.base_commission_amount * total_multiplier, MONEY_PRECISION);

  // 7. Calculate Payment Month
  const calculation_month = new Date(input.period_year, input.period_month - 1, 1);
  const payment_month = new Date(calculation_month);
  payment_month.setMonth(payment_month.getMonth() + config.payment_delay_months);

  return {
    kpi_input_id: input.id,
    sales_rep_id: input.sales_rep_id,
    period_year: input.period_year,
    period_month: input.period_month,
    
    sales_target: input.sales_target,
    actual_sales: input.actual_sales,
    invoiced_amount: input.invoiced_amount,
    collected_amount: input.collected_amount,
    base_commission_amount: input.base_commission_amount,
    
    sales_attainment_ratio,
    collections_ratio,
    sales_score,
    collections_score,
    sales_weight: config.sales_weight,
    collections_weight: config.collections_weight,
    total_multiplier,
    earned_commission,
    
    hard_stop_triggered,
    hard_stop_reason,
    
    calculation_month,
    payment_month,
    config_id: config.id,
    config_snapshot: config,
  };
}

// Idempotent batch calculation
async function calculateMonthlyCommissions(
  year: number,
  month: number,
  repId?: string
): Promise<CalculationResult[]> {
  // 1. Load all KPI inputs for the period
  const inputs = await loadKPIInputs(year, month, repId);
  
  // 2. Load effective config for each rep (could vary by team)
  const results: CalculationResult[] = [];
  
  for (const input of inputs) {
    const config = await getEffectiveConfig(input.sales_rep_id, year, month);
    const result = calculateCommission(input, config);
    results.push(result);
  }
  
  // 3. Upsert results (increment version if exists)
  await upsertResults(results);
  
  return results;
}
```

---

## 6) Test Cases

| # | Scenario | sales_target | actual_sales | invoiced | collected | base_comm | Expected sales_score | Expected coll_score | Hard Stop? | Expected Commission |
|---|----------|--------------|--------------|----------|-----------|-----------|---------------------|--------------------|-----------|--------------------|
| 1 | Sales below 70% | 100,000 | 65,000 | 80,000 | 75,000 | 5,000 | 0.00 | 0.80 | No | 1,600.00 |
| 2 | Sales 100%, Collections 100% | 100,000 | 100,000 | 80,000 | 80,000 | 5,000 | 1.00 | 1.20 | No | 5,400.00 |
| 3 | High sales, Collections < 70% | 100,000 | 120,000 | 80,000 | 50,000 | 5,000 | 1.40 | 0.00 | **YES** | **0.00** |
| 4 | Boundary: Sales 69% | 100,000 | 69,000 | 80,000 | 80,000 | 5,000 | 0.00 | 1.20 | No | 2,400.00 |
| 5 | Boundary: Sales 70% | 100,000 | 70,000 | 80,000 | 80,000 | 5,000 | 0.60 | 1.20 | No | 4,200.00 |
| 6 | Boundary: Sales 89% | 100,000 | 89,000 | 80,000 | 80,000 | 5,000 | 0.60 | 1.20 | No | 4,200.00 |
| 7 | Boundary: Sales 90% | 100,000 | 90,000 | 80,000 | 80,000 | 5,000 | 0.85 | 1.20 | No | 4,950.00 |
| 8 | Boundary: Collections 69% | 100,000 | 100,000 | 100,000 | 69,000 | 5,000 | 1.00 | 0.00 | **YES** | **0.00** |
| 9 | Boundary: Collections 70% | 100,000 | 100,000 | 100,000 | 70,000 | 5,000 | 1.00 | 0.50 | No | 4,000.00 |
| 10 | Invoiced = 0 | 100,000 | 100,000 | 0 | 0 | 5,000 | 1.00 | 0.00 | **YES** | **0.00** |
| 11 | Sales 120%+ super performer | 100,000 | 130,000 | 80,000 | 80,000 | 5,000 | 1.40 | 1.20 | No | 6,600.00 |
| 12 | Invalid weights config | - | - | - | - | - | ERROR | ERROR | - | Config rejected |

### Calculation Examples:

**Test Case 2 (Sales 100%, Collections 100%):**
```
sales_attainment = 100,000 / 100,000 = 1.00 => score = 1.00
collections_ratio = 80,000 / 80,000 = 1.00 => score = 1.20
total_multiplier = (1.00 * 0.60) + (1.20 * 0.40) = 0.60 + 0.48 = 1.08
earned_commission = 5,000 * 1.08 = 5,400.00
```

**Test Case 3 (High sales but HARD STOP):**
```
sales_attainment = 120,000 / 100,000 = 1.20 => score = 1.40
collections_ratio = 50,000 / 80,000 = 0.625 < 0.70 => HARD STOP
earned_commission = 0.00
```

---

## 7) Extension Notes

### Multi-Currency
- Add `currency` field to `commission_kpi_inputs` and `commission_results`
- Store exchange_rate at calculation time
- Convert to base currency for aggregation

### Clawback
- Add `clawback_amount` to `commission_results`
- Create `commission_clawbacks` table linking to original result
- Implement clawback rules (e.g., if deal cancelled within 90 days)

### Margin-Based Penalties
- Add `gross_margin_percent` to KPI inputs
- Create margin penalty thresholds (e.g., <20% margin = 0.8x multiplier)
- Apply as additional multiplier before final calculation

### Team/Manager Override
- Add `override_multiplier` and `override_reason` to results
- Manager approval workflow before payment

### Accelerators
- Add `accelerator_config` for super-performers
- E.g., After 120% attainment, every additional 10% = 1.5x on marginal
