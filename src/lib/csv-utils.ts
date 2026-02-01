// =============================================
// CSV IMPORT/EXPORT UTILITIES
// src/lib/csv-utils.ts
// =============================================

import { z } from 'zod';

// ============ CSV PARSING ============

export interface CSVParseResult<T> {
  success: boolean;
  data: T[];
  errors: CSVParseError[];
  warnings: string[];
}

export interface CSVParseError {
  row: number;
  column: string;
  value: string;
  message: string;
}

// KPI Input CSV Schema
export const kpiInputCsvSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Geçersiz ay formatı (YYYY-MM)'),
  rep_id: z.string().min(1, 'Temsilci ID zorunlu'),
  rep_name: z.string().optional(),
  sales_target: z.string().transform((val, ctx) => {
    const cleaned = val.trim().replace(/\s/g, '');
    if (cleaned === '') return 0;
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
      ctx.addIssue({ code: 'custom', message: 'Geçersiz sayı' });
      return 0;
    }
    if (num < 0) {
      ctx.addIssue({ code: 'custom', message: 'Negatif değer olamaz' });
      return 0;
    }
    return Math.round(num * 100) / 100;
  }),
  actual_sales: z.string().transform((val, ctx) => {
    const cleaned = val.trim().replace(/\s/g, '');
    if (cleaned === '') return 0;
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
      ctx.addIssue({ code: 'custom', message: 'Geçersiz sayı' });
      return 0;
    }
    if (num < 0) {
      ctx.addIssue({ code: 'custom', message: 'Negatif değer olamaz' });
      return 0;
    }
    return Math.round(num * 100) / 100;
  }),
  invoiced_amount: z.string().transform((val, ctx) => {
    const cleaned = val.trim().replace(/\s/g, '');
    if (cleaned === '') return 0;
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
      ctx.addIssue({ code: 'custom', message: 'Geçersiz sayı' });
      return 0;
    }
    if (num < 0) {
      ctx.addIssue({ code: 'custom', message: 'Negatif değer olamaz' });
      return 0;
    }
    return Math.round(num * 100) / 100;
  }),
  collected_amount: z.string().transform((val, ctx) => {
    const cleaned = val.trim().replace(/\s/g, '');
    if (cleaned === '') return 0;
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
      ctx.addIssue({ code: 'custom', message: 'Geçersiz sayı' });
      return 0;
    }
    if (num < 0) {
      ctx.addIssue({ code: 'custom', message: 'Negatif değer olamaz' });
      return 0;
    }
    return Math.round(num * 100) / 100;
  }),
  base_commission_amount: z.string().transform((val, ctx) => {
    const cleaned = val.trim().replace(/\s/g, '');
    if (cleaned === '') return 0;
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
      ctx.addIssue({ code: 'custom', message: 'Geçersiz sayı' });
      return 0;
    }
    if (num < 0) {
      ctx.addIssue({ code: 'custom', message: 'Negatif değer olamaz' });
      return 0;
    }
    return Math.round(num * 100) / 100;
  }),
  notes: z.string().optional().default(''),
});

export type KPIInputCSVRow = z.infer<typeof kpiInputCsvSchema>;

/**
 * Parse CSV string into rows
 */
export function parseCSV(csvString: string): string[][] {
  const lines = csvString.trim().split(/\r?\n/);
  return lines.map(line => {
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((char === ',' || char === ';') && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    return row;
  });
}

/**
 * Parse KPI Input CSV file
 */
export function parseKPIInputCSV(csvString: string): CSVParseResult<KPIInputCSVRow> {
  const rows = parseCSV(csvString);
  
  if (rows.length < 2) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, column: '', value: '', message: 'CSV dosyası en az başlık ve bir veri satırı içermeli' }],
      warnings: [],
    };
  }
  
  const headers = rows[0].map(h => h.toLowerCase().trim());
  const expectedHeaders = ['month', 'rep_id', 'rep_name', 'sales_target', 'actual_sales', 'invoiced_amount', 'collected_amount', 'base_commission_amount', 'notes'];
  
  // Check required headers
  const requiredHeaders = ['month', 'rep_id', 'sales_target', 'actual_sales', 'invoiced_amount', 'collected_amount', 'base_commission_amount'];
  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
  
  if (missingHeaders.length > 0) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, column: '', value: '', message: `Eksik kolonlar: ${missingHeaders.join(', ')}` }],
      warnings: [],
    };
  }
  
  const data: KPIInputCSVRow[] = [];
  const errors: CSVParseError[] = [];
  const warnings: string[] = [];
  
  // Process data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    
    // Skip empty rows
    if (row.every(cell => cell === '')) continue;
    
    // Create object from row
    const rowObj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      rowObj[header] = row[idx] || '';
    });
    
    // Validate with Zod
    const result = kpiInputCsvSchema.safeParse(rowObj);
    
    if (result.success) {
      data.push(result.data);
      
      // Check for warnings (e.g., invoiced_amount = 0)
      if (result.data.invoiced_amount === 0 && result.data.collected_amount === 0) {
        warnings.push(`Satır ${i + 1}: Fatura ve tahsilat tutarı 0 - HARD STOP tetiklenecek`);
      }
    } else {
      result.error.issues.forEach(issue => {
        errors.push({
          row: i + 1,
          column: issue.path[0]?.toString() || '',
          value: rowObj[issue.path[0]?.toString() || ''] || '',
          message: issue.message,
        });
      });
    }
  }
  
  return {
    success: errors.length === 0,
    data,
    errors,
    warnings,
  };
}

/**
 * Generate CSV template for KPI inputs
 */
export function generateKPIInputTemplate(): string {
  const headers = 'month,rep_id,rep_name,sales_target,actual_sales,invoiced_amount,collected_amount,base_commission_amount,notes';
  const sampleRow = '2025-01,rep-001,Örnek Temsilci,100000.00,95000.00,80000.00,72000.00,5000.00,Açıklama';
  return `${headers}\n${sampleRow}`;
}

/**
 * Export data to CSV string
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  columns: { key: keyof T; header: string; format?: (val: any) => string }[]
): string {
  const headers = columns.map(c => c.header).join(';');
  
  const rows = data.map(row => {
    return columns.map(col => {
      const val = row[col.key];
      if (col.format) {
        return col.format(val);
      }
      if (typeof val === 'number') {
        return val.toFixed(2);
      }
      if (val === null || val === undefined) {
        return '';
      }
      // Escape quotes and wrap if contains separator
      const str = String(val);
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(';');
  });
  
  return [headers, ...rows].join('\n');
}

/**
 * Download string as file
 */
export function downloadFile(content: string, filename: string, type = 'text/csv;charset=utf-8') {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel
  const blob = new Blob([BOM + content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format money for export
 */
export function formatMoneyExport(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Format percent for export
 */
export function formatPercentExport(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Format date for export
 */
export function formatDateExport(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

// ============ RESULTS EXPORT ============

export interface ResultExportRow {
  period: string;
  rep_name: string;
  department: string;
  sales_target: number;
  actual_sales: number;
  sales_ratio: number;
  sales_score: number;
  invoiced_amount: number;
  collected_amount: number;
  collections_ratio: number;
  collections_score: number;
  multiplier: number;
  base_commission: number;
  earned_commission: number;
  hard_stop: boolean;
  payment_status: string;
  payment_month: string;
}

export const RESULTS_EXPORT_COLUMNS = [
  { key: 'period' as const, header: 'Dönem' },
  { key: 'rep_name' as const, header: 'Temsilci' },
  { key: 'department' as const, header: 'Departman' },
  { key: 'sales_target' as const, header: 'Satış Hedefi', format: formatMoneyExport },
  { key: 'actual_sales' as const, header: 'Gerçekleşen Satış', format: formatMoneyExport },
  { key: 'sales_ratio' as const, header: 'Satış Oranı', format: formatPercentExport },
  { key: 'sales_score' as const, header: 'Satış Skoru', format: (v: number) => v.toFixed(2) },
  { key: 'invoiced_amount' as const, header: 'Fatura Tutarı', format: formatMoneyExport },
  { key: 'collected_amount' as const, header: 'Tahsilat', format: formatMoneyExport },
  { key: 'collections_ratio' as const, header: 'Tahsilat Oranı', format: formatPercentExport },
  { key: 'collections_score' as const, header: 'Tahsilat Skoru', format: (v: number) => v.toFixed(2) },
  { key: 'multiplier' as const, header: 'Çarpan', format: (v: number) => v.toFixed(4) },
  { key: 'base_commission' as const, header: 'Baz Prim', format: formatMoneyExport },
  { key: 'earned_commission' as const, header: 'Kazanılan Prim', format: formatMoneyExport },
  { key: 'hard_stop' as const, header: 'Hard Stop', format: (v: boolean) => v ? 'EVET' : 'HAYIR' },
  { key: 'payment_status' as const, header: 'Ödeme Durumu' },
  { key: 'payment_month' as const, header: 'Ödeme Ayı' },
];

export function exportResultsToCSV(results: ResultExportRow[]): void {
  const csv = exportToCSV(results, RESULTS_EXPORT_COLUMNS);
  const period = results[0]?.period || 'export';
  downloadFile(csv, `prim-sonuclari-${period}.csv`);
}
