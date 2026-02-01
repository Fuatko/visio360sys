# Sales & Collections Incentive Engine - Admin Panel

## 1) UX FLOW OVERVIEW

### Key User Journeys

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ADMIN PANEL                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Dashboard]──→[Configs]──→[KPI Inputs]──→[Calculate]──→[Results]   │
│       │            │             │              │            │       │
│       ▼            ▼             ▼              ▼            ▼       │
│   Overview    Create/Edit   Manual Entry    Run Batch    View/Export │
│   Stats       Thresholds    CSV Import      Per Rep      Audit Trail │
│               Weights       Validation      Per Team     Filters     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Navigation Flow

1. **Admin** → Full access to all screens
2. **SalesOps** → Inputs + Calculate + Results (no config)
3. **Finance** → Results only (view + export)
4. **Manager** → Own team results only

### Primary User Journey (SalesOps - Monthly Cycle)

```
1. Select Month (YYYY-MM)
2. Import KPI CSV or enter manually
3. Validate all inputs (see warnings)
4. Run calculation for month
5. Review results + hard stops
6. Export for Finance approval
```

---

## 2) SCREEN SPECS (FIELD-LEVEL)

### A) Configurations Screen (`/admin/commission/configs`)

**Purpose**: Manage commission calculation rules

**Fields**:
| Field | Type | Validation | Default |
|-------|------|------------|---------|
| name | text | required, max 100 | - |
| team_id | select | optional (null=global) | null |
| sales_weight | number | 0-1, 2 decimals | 0.60 |
| collections_weight | number | 0-1, 2 decimals | 0.40 |
| max_sales_score | number | 0.01-5.00 | 1.40 |
| max_collections_score | number | 0.01-5.00 | 1.20 |
| hard_stop_threshold | number | 0-1 | 0.70 |
| payment_delay_months | number | 0-12 | 0 |
| effective_from | date | required | today |
| effective_to | date | optional, > effective_from | null |
| is_active | boolean | - | true |

**Threshold Tables** (nested):
- Sales: min_ratio, max_ratio, score
- Collections: min_ratio, max_ratio, score

**Actions**:
- Create new config
- Edit existing
- Archive (soft delete)
- Duplicate config
- View history

**States**:
- Empty: "No configurations found. Create your first config."
- Loading: Skeleton cards
- Error: Toast + retry button

**Permissions**:
| Role | View | Create | Edit | Archive |
|------|------|--------|------|---------|
| Admin | ✅ | ✅ | ✅ | ✅ |
| SalesOps | ✅ | ❌ | ❌ | ❌ |
| Finance | ✅ | ❌ | ❌ | ❌ |
| Manager | ❌ | ❌ | ❌ | ❌ |

---

### B) KPI Inputs Screen (`/admin/commission/inputs`)

**Purpose**: Enter/import monthly KPI data per sales rep

**Filters**:
| Field | Type | Default |
|-------|------|---------|
| month | YYYY-MM picker | current month |
| team | select | all |
| search | text | - |

**Grid Columns**:
| Column | Type | Editable | Validation |
|--------|------|----------|------------|
| rep_name | text | ❌ | - |
| department | text | ❌ | - |
| sales_target | currency | ✅ | >= 0, required |
| actual_sales | currency | ✅ | >= 0, required |
| invoiced_amount | currency | ✅ | >= 0, required |
| collected_amount | currency | ✅ | >= 0, required |
| base_commission | currency | ✅ | >= 0, required |
| notes | text | ✅ | max 500 |
| status | badge | ❌ | calculated |

**Calculated Preview Columns** (read-only):
- sales_ratio (actual/target)
- collections_ratio (collected/invoiced)
- estimated_commission (preview)

**Actions**:
- Save all changes
- Import CSV
- Download template
- Clear month data
- Bulk fill (set same value for column)

**States**:
- Empty: "No sales reps found. Add team members first."
- Loading: Table skeleton
- Validation errors: Inline cell highlighting + summary banner

**Permissions**:
| Role | View | Edit | Import | Delete |
|------|------|------|--------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ |
| SalesOps | ✅ | ✅ | ✅ | ✅ |
| Finance | ✅ | ❌ | ❌ | ❌ |
| Manager | Own team | ❌ | ❌ | ❌ |

---

### C) Calculation Runner Screen (`/admin/commission/calculate`)

**Purpose**: Execute commission calculations

**Controls**:
| Field | Type | Required |
|-------|------|----------|
| month | YYYY-MM | ✅ |
| scope | radio: All / Team / Single Rep | ✅ |
| team_id | select (if scope=Team) | conditional |
| rep_id | select (if scope=Single) | conditional |

**Pre-flight Checks** (displayed before run):
- Total reps to calculate
- Missing inputs warning
- Previous results will be overwritten warning
- Config to be used (name + version)

**Run Progress**:
- Progress bar (X of Y calculated)
- Live stats: success, hard_stops, errors
- Cancel button

**Results Summary**:
- Total calculated
- Total earned commission
- Hard stops count
- Errors count
- Link to results screen

**Permissions**:
| Role | View | Run |
|------|------|-----|
| Admin | ✅ | ✅ |
| SalesOps | ✅ | ✅ |
| Finance | ❌ | ❌ |
| Manager | ❌ | ❌ |

---

### D) Results Screen (`/admin/commission/results`)

**Purpose**: View calculation results with full audit

**Filters**:
| Field | Type | Options |
|-------|------|---------|
| calculation_month | YYYY-MM | - |
| payment_month | YYYY-MM | - |
| team | select | all teams |
| rep | search/select | - |
| status | multi-select | pending, approved, paid, cancelled |
| flags | checkbox | hard_stop_only |

**Table Columns**:
| Column | Sortable | Format |
|--------|----------|--------|
| rep_name | ✅ | text |
| department | ✅ | text |
| sales_target | ✅ | ₺ currency |
| actual_sales | ✅ | ₺ currency |
| sales_ratio | ✅ | % (color coded) |
| sales_score | ✅ | decimal |
| invoiced | ✅ | ₺ currency |
| collected | ✅ | ₺ currency |
| collections_ratio | ✅ | % (color coded) |
| collections_score | ✅ | decimal |
| multiplier | ✅ | decimal |
| base_commission | ✅ | ₺ currency |
| earned_commission | ✅ | ₺ currency (bold) |
| hard_stop | ❌ | badge (red if true) |
| payment_month | ✅ | YYYY-MM |
| status | ✅ | badge |

**Row Actions**:
- View detail (opens drawer)
- Approve (if pending)
- Cancel (with reason)

**Bulk Actions**:
- Approve selected
- Export selected

**Detail Drawer**:
- Full audit JSON
- Input snapshot
- Config snapshot
- Calculation breakdown
- Status history

**Actions**:
- Export CSV
- Export PDF (future)

**Permissions**:
| Role | View | Approve | Cancel | Export |
|------|------|---------|--------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ |
| SalesOps | ✅ | ❌ | ❌ | ✅ |
| Finance | ✅ | ✅ | ✅ | ✅ |
| Manager | Own team | ❌ | ❌ | Own team |

---

### E) Users/Teams Screen (`/admin/commission/teams`)

**Purpose**: Light user/team management

**Teams Table**:
| Column | Actions |
|--------|---------|
| Team Name | Edit |
| Region | - |
| Member Count | - |
| Active Config | Link |

**Users Table** (within team):
| Column | Actions |
|--------|---------|
| Name | - |
| Email | - |
| Role | Edit (Admin only) |
| Active | Toggle |

**Permissions**:
| Role | View Teams | Edit Teams | View Users | Edit Users |
|------|------------|------------|------------|------------|
| Admin | ✅ | ✅ | ✅ | ✅ |
| SalesOps | ✅ | ❌ | ✅ | ❌ |
| Finance | ✅ | ❌ | ❌ | ❌ |
| Manager | Own | ❌ | Own | ❌ |

---

## 3) API CONTRACT

### Authentication & User

```typescript
// GET /api/me
// Response:
{
  "user_id": "uuid",
  "email": "user@example.com",
  "name": "Ahmet Yılmaz",
  "role": "admin" | "sales_ops" | "finance" | "manager",
  "team_id": "uuid" | null,  // null for admin/finance
  "team_name": "İstanbul Satış",
  "permissions": {
    "configs": { "view": true, "edit": true },
    "inputs": { "view": true, "edit": true, "import": true },
    "calculate": { "run": true },
    "results": { "view": true, "approve": true, "export": true }
  }
}
```

### Teams & Users

```typescript
// GET /api/teams
// Response:
{
  "data": [
    {
      "id": "uuid",
      "name": "İstanbul Satış",
      "region": "Marmara",
      "member_count": 5,
      "active_config_id": "uuid"
    }
  ]
}

// GET /api/users?team_id=uuid
// Response:
{
  "data": [
    {
      "id": "uuid",
      "name": "Ahmet Yılmaz",
      "email": "ahmet@example.com",
      "role": "sales_rep",
      "team_id": "uuid",
      "is_active": true
    }
  ]
}
```

### Commission Configs

```typescript
// GET /api/commission/configs?active=true&team_id=uuid
// Response:
{
  "data": [
    {
      "id": "uuid",
      "name": "2025 Q1 Config",
      "team_id": null,
      "sales_weight": 0.60,
      "collections_weight": 0.40,
      "max_sales_score": 1.40,
      "max_collections_score": 1.20,
      "hard_stop_threshold": 0.70,
      "payment_delay_months": 0,
      "effective_from": "2025-01-01",
      "effective_to": null,
      "is_active": true,
      "sales_thresholds": [
        { "min_ratio": 0.00, "max_ratio": 0.70, "score": 0.00 },
        { "min_ratio": 0.70, "max_ratio": 0.90, "score": 0.60 },
        // ...
      ],
      "collections_thresholds": [
        { "min_ratio": 0.00, "max_ratio": 0.70, "score": 0.00 },
        // ...
      ],
      "created_at": "2025-01-01T00:00:00Z",
      "created_by": "uuid"
    }
  ]
}

// POST /api/commission/configs
// Request:
{
  "name": "2025 Q2 Config",
  "team_id": null,
  "sales_weight": 0.60,
  "collections_weight": 0.40,
  "max_sales_score": 1.40,
  "max_collections_score": 1.20,
  "hard_stop_threshold": 0.70,
  "payment_delay_months": 1,
  "effective_from": "2025-04-01",
  "sales_thresholds": [...],
  "collections_thresholds": [...]
}
// Response: { "data": { "id": "uuid", ... } }

// PATCH /api/commission/configs/:id/archive
// Response: { "success": true }
```

### KPI Inputs

```typescript
// GET /api/commission/kpi-inputs?month=2025-01&team_id=uuid
// Response:
{
  "data": [
    {
      "id": "uuid",
      "sales_rep_id": "uuid",
      "sales_rep_name": "Ahmet Yılmaz",
      "department": "Kurumsal",
      "period_year": 2025,
      "period_month": 1,
      "sales_target": 100000.00,
      "actual_sales": 95000.00,
      "invoiced_amount": 80000.00,
      "collected_amount": 72000.00,
      "base_commission_amount": 5000.00,
      "notes": "",
      "created_at": "2025-01-15T10:00:00Z",
      "updated_at": "2025-01-20T14:30:00Z"
    }
  ],
  "meta": {
    "total": 10,
    "with_inputs": 8,
    "missing_inputs": 2
  }
}

// POST /api/commission/kpi-inputs (upsert)
// Request:
{
  "inputs": [
    {
      "sales_rep_id": "uuid",
      "period_year": 2025,
      "period_month": 1,
      "sales_target": 100000.00,
      "actual_sales": 95000.00,
      "invoiced_amount": 80000.00,
      "collected_amount": 72000.00,
      "base_commission_amount": 5000.00,
      "notes": "Updated targets"
    }
  ]
}
// Response: { "success": true, "upserted": 1 }

// POST /api/commission/kpi-inputs/bulk (CSV import)
// Request: FormData with file
// Response:
{
  "success": true,
  "imported": 10,
  "errors": [
    { "row": 5, "field": "sales_target", "message": "Invalid number" }
  ]
}
```

### Calculation

```typescript
// POST /api/commission/calculate
// Request:
{
  "month": "2025-01",
  "scope": "all" | "team" | "single",
  "team_id": "uuid",  // if scope=team
  "rep_id": "uuid"    // if scope=single
}
// Response:
{
  "success": true,
  "run_id": "uuid",
  "stats": {
    "total": 10,
    "calculated": 10,
    "hard_stops": 2,
    "errors": 0,
    "total_earned": 42500.00
  }
}
```

### Results

```typescript
// GET /api/commission/results?month=2025-01&team_id=uuid&hard_stop=true
// Response:
{
  "data": [
    {
      "id": "uuid",
      "sales_rep_id": "uuid",
      "sales_rep_name": "Ahmet Yılmaz",
      "department": "Kurumsal",
      "period_year": 2025,
      "period_month": 1,
      "sales_target": 100000.00,
      "actual_sales": 95000.00,
      "sales_attainment_ratio": 0.9500,
      "sales_score": 0.85,
      "invoiced_amount": 80000.00,
      "collected_amount": 72000.00,
      "collections_ratio": 0.9000,
      "collections_score": 0.80,
      "sales_weight": 0.60,
      "collections_weight": 0.40,
      "total_multiplier": 0.8300,
      "base_commission_amount": 5000.00,
      "earned_commission": 4150.00,
      "hard_stop_triggered": false,
      "hard_stop_reason": null,
      "calculation_month": "2025-01-01",
      "payment_month": "2025-01-01",
      "payment_status": "pending",
      "calculated_at": "2025-01-31T10:00:00Z"
    }
  ],
  "summary": {
    "total_base": 50000.00,
    "total_earned": 42500.00,
    "hard_stop_count": 2,
    "avg_multiplier": 0.85
  }
}

// GET /api/commission/results/:id
// Response: Full detail including config_snapshot, input_snapshot, audit_log

// GET /api/commission/results/export?month=2025-01&format=csv
// Response: CSV file download
```

---

## 4) DATA TYPES (TypeScript)

See `src/types/commission.ts` for complete types.

---

## 5) ZOD SCHEMAS

See `src/lib/commission-schemas.ts` for complete schemas.

---

## 6) CSV TEMPLATES

### KPI Input Import Template

**Header Row**:
```csv
month,rep_id,rep_name,sales_target,actual_sales,invoiced_amount,collected_amount,base_commission_amount,notes
```

**Sample Data** (5 rows with edge cases):
```csv
month,rep_id,rep_name,sales_target,actual_sales,invoiced_amount,collected_amount,base_commission_amount,notes
2025-01,rep-001,Ahmet Yılmaz,100000.00,95000.00,80000.00,72000.00,5000.00,Normal case
2025-01,rep-002,Mehmet Demir,150000.00,180000.00,120000.00,120000.00,7500.00,High performer
2025-01,rep-003,Ayşe Kaya,80000.00,50000.00,60000.00,35000.00,4000.00,Below threshold - HARD STOP expected
2025-01,rep-004,Fatma Öz,200000.00,200000.00,0.00,0.00,10000.00,No invoices - edge case
2025-01,rep-005,Ali Veli,75000.50,82500.75,65000.00,61750.00,3750.25,Decimal values
```

**Parsing Rules**:
1. Decimal separator: `.` (dot)
2. Thousand separator: not allowed (no commas in numbers)
3. Empty values: treated as 0 for numbers, empty string for text
4. Trimming: all values trimmed
5. Month format: YYYY-MM (strict)
6. Negative values: rejected with error
7. Maximum decimal places: 2 for currency

---

## 7) TABLE COLUMN DEFINITIONS

See `src/components/commission/columns.tsx` for TanStack Table column definitions.

---

## 8) REACT QUERY HOOKS

See `src/hooks/useCommission.ts` for React Query hooks.

---

## 9) KEY UI COMPONENTS

See individual component files in `src/components/commission/`.

---

## 10) ACCEPTANCE CRITERIA CHECKLIST

### Configuration Management
- [ ] Admin can create new config with valid weights (sum = 1.0)
- [ ] System rejects config if weights don't sum to 1.0
- [ ] Admin can add/edit sales score thresholds
- [ ] Admin can add/edit collections score thresholds
- [ ] Admin can archive config (soft delete)
- [ ] Only one active global config at a time
- [ ] Team-specific configs override global
- [ ] SalesOps/Finance can view but not edit configs
- [ ] Manager cannot access config screen

### KPI Input Management
- [ ] Month picker defaults to current month
- [ ] Grid shows all sales reps in selected scope
- [ ] Inline editing works for all editable fields
- [ ] Red border shown on invalid cells
- [ ] Save disabled if any validation errors
- [ ] CSV import parses file correctly
- [ ] CSV import shows preview before commit
- [ ] CSV import shows row-level errors
- [ ] CSV import rejects negative values
- [ ] Template download provides correct format
- [ ] Warning shown when invoiced_amount = 0
- [ ] Finance cannot edit inputs
- [ ] Manager can only view own team

### Calculation Runner
- [ ] Pre-flight shows rep count and warnings
- [ ] Calculation runs for selected scope
- [ ] Progress indicator during calculation
- [ ] Results summary shown after completion
- [ ] Hard stops counted correctly
- [ ] Link to results screen works
- [ ] Finance/Manager cannot run calculations

### Results Viewing
- [ ] All filters work correctly
- [ ] Table sorts on all sortable columns
- [ ] Hard stop rows highlighted in red
- [ ] Detail drawer shows full audit
- [ ] CSV export includes all visible columns
- [ ] CSV export respects filters
- [ ] Manager sees only own team
- [ ] Pagination works correctly

### RBAC Enforcement
- [ ] Admin has full access
- [ ] SalesOps: inputs + calculate + results (no config edit)
- [ ] Finance: results only (view + approve + export)
- [ ] Manager: own team results only
- [ ] Unauthorized actions show error message
- [ ] Hidden menus for unauthorized screens

### Edge Cases
- [ ] Division by zero handled (target=0, invoiced=0)
- [ ] Large numbers display correctly
- [ ] Decimal precision maintained
- [ ] Timezone displays in Europe/Istanbul
- [ ] Empty state shown when no data
- [ ] Error toast on API failure
- [ ] Loading skeletons during fetch
