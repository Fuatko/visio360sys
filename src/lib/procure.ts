'use client';

// Inspira360 Procure — ortak tipler, etiketler, şablonlar ve oturum kancası
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useModules } from '@/lib/modules';

export const PROCURE_SQL = 'sql/procure/01-altyapi.sql';

// Tablo/fonksiyon yoksa (SQL çalıştırılmamış) true
export const isMissingSchema = (e: any) =>
  !!e && /relation|does not exist|Could not find the function|schema cache/i.test(e.message || '');

// ---------- Roller ----------
export type ProcRole = 'requester' | 'approver' | 'buyer' | 'receiver' | 'finance' | 'procure_admin';
export const PROC_ROLES: { key: ProcRole; label: string; desc: string }[] = [
  { key: 'requester', label: 'Talep eden', desc: 'Kendi birimi için talep açar' },
  { key: 'approver', label: 'Onaycı', desc: 'Yetki matrisindeki onay adımları' },
  { key: 'buyer', label: 'Satınalma uzmanı', desc: 'Teklif toplar, sipariş verir, tedarikçi havuzu' },
  { key: 'receiver', label: 'Teslim alan', desc: 'Mal kabul / hizmet onayı' },
  { key: 'finance', label: 'Mali işler', desc: 'Bütçe, fatura eşleştirme, hakediş' },
  { key: 'procure_admin', label: 'Satınalma yöneticisi', desc: 'Politika, matris, bütçe, kullanıcılar' },
];
export const roleLabel = (r: string) => PROC_ROLES.find(x => x.key === r)?.label || r;

// ---------- Masraf merkezleri ----------
export type CostCenterKind = 'campus' | 'level' | 'department' | 'unit';
export const CC_KINDS: { key: CostCenterKind; label: string }[] = [
  { key: 'campus', label: 'Kampüs' },
  { key: 'level', label: 'Kademe' },
  { key: 'department', label: 'Bölüm' },
  { key: 'unit', label: 'Birim' },
];
export interface CostCenter {
  id: string; code: string | null; name: string; parent_id: string | null; kind: CostCenterKind;
  manager_user_id: string | null; is_active: boolean; sort: number;
}

// Okul şablonu: Kampüs → Kademe → Birim (parent = üst kaydın kodu)
export const SCHOOL_COST_CENTERS: { code: string; name: string; kind: CostCenterKind; parent?: string }[] = [
  { code: 'K1', name: 'Merkez Kampüs', kind: 'campus' },
  { code: 'K1-ANA', name: 'Anaokulu', kind: 'level', parent: 'K1' },
  { code: 'K1-ILK', name: 'İlkokul', kind: 'level', parent: 'K1' },
  { code: 'K1-ORT', name: 'Ortaokul', kind: 'level', parent: 'K1' },
  { code: 'K1-LIS', name: 'Lise', kind: 'level', parent: 'K1' },
  { code: 'K1-FEN', name: 'Fen Zümresi', kind: 'unit', parent: 'K1' },
  { code: 'K1-BIL', name: 'Bilişim', kind: 'unit', parent: 'K1' },
  { code: 'K1-YMK', name: 'Yemekhane', kind: 'unit', parent: 'K1' },
  { code: 'K1-BKM', name: 'Bakım-Onarım', kind: 'unit', parent: 'K1' },
  { code: 'K1-IDR', name: 'İdari İşler', kind: 'unit', parent: 'K1' },
];

// ---------- Kategoriler ----------
export type CategoryKind = 'goods' | 'service' | 'capex';
export const CAT_KINDS: { key: CategoryKind; label: string }[] = [
  { key: 'goods', label: 'Mal' },
  { key: 'service', label: 'Hizmet' },
  { key: 'capex', label: 'Demirbaş (yatırım)' },
];
export interface Category {
  id: string; code: string | null; name: string; parent_id: string | null; kind: CategoryKind;
  parasut_category: string | null; default_receiver_role: string | null; is_active: boolean; sort: number;
}
export const SCHOOL_CATEGORIES: { code: string; name: string; kind: CategoryKind }[] = [
  { code: 'KRT', name: 'Kırtasiye ve Eğitim Materyali', kind: 'goods' },
  { code: 'LAB', name: 'Laboratuvar Sarf', kind: 'goods' },
  { code: 'BLD', name: 'Bilişim Donanım', kind: 'goods' },
  { code: 'YZL', name: 'Yazılım/Lisans', kind: 'service' },
  { code: 'TMZ', name: 'Temizlik Malzemesi', kind: 'goods' },
  { code: 'GDA', name: 'Gıda (Yemekhane)', kind: 'goods' },
  { code: 'BKM', name: 'Bakım-Onarım', kind: 'service' },
  { code: 'MOB', name: 'Mobilya/Demirbaş', kind: 'capex' },
  { code: 'H-TMZ', name: 'Hizmet Alımı – Temizlik', kind: 'service' },
  { code: 'H-GVN', name: 'Hizmet Alımı – Güvenlik', kind: 'service' },
  { code: 'H-SRV', name: 'Hizmet Alımı – Servis/Ulaşım', kind: 'service' },
  { code: 'H-YMK', name: 'Hizmet Alımı – Yemek', kind: 'service' },
  { code: 'H-ETK', name: 'Hizmet Alımı – Etkinlik/Organizasyon', kind: 'service' },
];

// ---------- Politika ----------
export interface ProcPolicy {
  organization_id?: string;
  fiscal_year_start_month: number;
  three_quote_threshold: number | null;
  single_source_requires_justification: boolean;
  budget_check: 'off' | 'warn' | 'block';
  invoice_price_tolerance_pct: number;
  invoice_qty_tolerance_pct: number;
  default_payment_term_days: number | null;
  require_receipt_photo: boolean;
  vendor_reevaluation_months: number;
  approved_vendor_list_required: boolean;
  setup_progress: Record<string, 'done' | 'skipped'>;
}
export const DEFAULT_POLICY: ProcPolicy = {
  fiscal_year_start_month: 9,
  three_quote_threshold: null,
  single_source_requires_justification: true,
  budget_check: 'warn',
  invoice_price_tolerance_pct: 2,
  invoice_qty_tolerance_pct: 0,
  default_payment_term_days: null,
  require_receipt_photo: false,
  vendor_reevaluation_months: 12,
  approved_vendor_list_required: false,
  setup_progress: {},
};
export const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Tarihin bütçe yılı etiketi: başlangıç ayı 9 ise 2026-09-01 → "2026-2027"; başlangıç ayı 1 ise "2026"
export function fiscalYearOf(d: Date, startMonth: number): string {
  const y = d.getFullYear(); const m = d.getMonth() + 1;
  if (startMonth === 1) return String(y);
  const start = m >= startMonth ? y : y - 1;
  return `${start}-${start + 1}`;
}

// ---------- Kurulum sihirbazı adımları ----------
export const SETUP_STEPS = [
  { key: 'policy', title: 'Eğitim yılı ve politika', desc: 'Bütçe yılı, 3 teklif eşiği, bütçe kontrolü, fatura toleransları' },
  { key: 'cost_centers', title: 'Masraf merkezleri', desc: 'Kampüs → kademe → birim yapısı ve birim sorumluları' },
  { key: 'categories', title: 'Kategoriler', desc: 'Satınalma kategorileri ve Paraşüt gider kategorisi eşlemesi' },
  { key: 'members', title: 'Kullanıcılar ve roller', desc: 'Talep eden, onaycı, satınalma uzmanı, teslim alan, mali işler' },
  { key: 'approval_matrix', title: 'Yetki matrisi', desc: 'Tutar bandı, kategori ve birime göre onay adımları', phase: 'Faz 1a' },
  { key: 'vendors', title: 'Tedarikçi havuzu', desc: 'CSV veya Paraşüt tedarikçi carilerinden içe aktarma', phase: 'Faz 1b' },
  { key: 'budget', title: 'Bütçe', desc: 'Masraf merkezi × kategori yıllık bütçe (CSV veya elle)', phase: 'Faz 1a' },
] as const;

// ---------- CSV ----------
// Excel'den kaydedilen ; veya , ayraçlı CSV (tırnaklı alanlar desteklenir). İlk satır başlık.
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, '');
  const first = clean.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const out: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (q) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(x => x !== '')) out.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim()); if (row.some(x => x !== '')) out.push(row);
  const header = (out.shift() || []).map(h => h.toLowerCase());
  return { header, rows: out };
}

export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(['﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Oturum kancası ----------
export function useProcure() {
  const { user } = useAuth();
  const mods = useModules();
  const [roles, setRoles] = useState<ProcRole[]>([]);
  const [schemaReady, setSchemaReady] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || mods.loading) return;
    if (!mods.has('procure')) { setRoles([]); setRolesLoading(false); return; }
    let live = true;
    createClient().rpc('proc_my_roles').then(({ data, error }: any) => {
      if (!live) return;
      setSchemaReady(!isMissingSchema(error));
      setRoles(error ? [] : (data || []));
      setRolesLoading(false);
    });
    return () => { live = false; };
  }, [user?.id, mods.loading, mods.modules.join(',')]);

  return {
    loading: mods.loading || rolesLoading,
    licensed: mods.has('procure'),
    // Modül tablosu (enabled_modules) yoksa SQL hiç çalıştırılmamıştır
    schemaReady: mods.ready && schemaReady,
    roles,
    hasRole: (r: ProcRole) => roles.includes(r),
    isAdmin: roles.includes('procure_admin'),
  };
}
