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
  payment_term_monthly_rate_pct?: number | null;   // 03-tedarikci-rfq.sql ile gelir
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
  { key: 'approval_matrix', title: 'Yetki matrisi', desc: 'Tutar bandı, kategori ve birime göre onay adımları' },
  { key: 'vendors', title: 'Tedarikçi havuzu', desc: 'CSV veya Paraşüt tedarikçi carilerinden içe aktarma' },
  { key: 'budget', title: 'Bütçe', desc: 'Masraf merkezi × kategori yıllık bütçe (CSV veya elle)' },
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

// =====================================================================
// FAZ 1a — Talep, onay, bütçe
// =====================================================================
export const PROCURE_SQL_1A = 'sql/procure/02-talep-onay-butce.sql';

export const tl = (v: any) => `₺${Math.round(Number(v) || 0).toLocaleString('tr-TR')}`;
export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('tr-TR') : '');
export const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '');

export type RequestStatus = 'draft' | 'submitted' | 'in_approval' | 'approved' | 'rejected' | 'cancelled' | 'sourcing' | 'ordered' | 'received' | 'closed';
export const REQUEST_STATUS: Record<RequestStatus, { label: string; cls: string }> = {
  draft: { label: 'Taslak', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  submitted: { label: 'Fiyatlandırılacak', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  in_approval: { label: 'Onayda', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Onaylandı', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Reddedildi', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: 'İptal', cls: 'bg-slate-100 text-slate-400 border-slate-200' },
  sourcing: { label: 'Teklif toplanıyor', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  ordered: { label: 'Sipariş verildi', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  received: { label: 'Teslim alındı', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  closed: { label: 'Kapandı', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};
export const APPROVAL_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Bekliyor', cls: 'text-amber-700' },
  approved: { label: 'Onayladı', cls: 'text-emerald-700' },
  rejected: { label: 'Reddetti', cls: 'text-rose-700' },
  skipped: { label: 'Atlandı', cls: 'text-slate-400' },
};

export const UNITS = ['Adet', 'Kutu', 'Paket', 'Koli', 'Kg', 'Lt', 'Metre', 'Takım', 'Top', 'Saat', 'Gün', 'Ay', 'Hizmet'];

export interface ApprovalRule {
  id: string; name: string; min_amount: number; max_amount: number | null; category_id: string | null; category_kind: string | null;
  cost_center_id: string | null; step_no: number; approver_kind: 'cost_center_manager' | 'role' | 'user'; approver_role: string | null;
  approver_user_id: string | null; approver_label: string | null; applies_to: string; is_active: boolean;
}
export const APPROVER_KINDS = [
  { key: 'cost_center_manager', label: 'Birim sorumlusu' },
  { key: 'role', label: 'Rol' },
  { key: 'user', label: 'Belirli kişi' },
] as const;

// Okul şablon matrisi (§4.2): ≤10.000 birim müdürü; 10.000–100.000 + mali işler; >100.000 + okul müdürü; demirbaş her tutarda + yönetim
export const SCHOOL_APPROVAL_RULES: Omit<ApprovalRule, 'id' | 'is_active' | 'applies_to' | 'approver_user_id' | 'category_id' | 'cost_center_id'>[] = [
  { name: '₺10.000\'e kadar', min_amount: 0, max_amount: 10000, category_kind: null, step_no: 1, approver_kind: 'cost_center_manager', approver_role: null, approver_label: 'Birim müdürü' },
  { name: '₺10.000–100.000', min_amount: 10000, max_amount: 100000, category_kind: null, step_no: 1, approver_kind: 'cost_center_manager', approver_role: null, approver_label: 'Birim müdürü' },
  { name: '₺10.000–100.000', min_amount: 10000, max_amount: 100000, category_kind: null, step_no: 2, approver_kind: 'role', approver_role: 'finance', approver_label: 'Mali İşler' },
  { name: '₺100.000 üzeri', min_amount: 100000, max_amount: null, category_kind: null, step_no: 1, approver_kind: 'cost_center_manager', approver_role: null, approver_label: 'Birim müdürü' },
  { name: '₺100.000 üzeri', min_amount: 100000, max_amount: null, category_kind: null, step_no: 2, approver_kind: 'role', approver_role: 'finance', approver_label: 'Mali İşler' },
  { name: '₺100.000 üzeri', min_amount: 100000, max_amount: null, category_kind: null, step_no: 3, approver_kind: 'role', approver_role: 'approver', approver_label: 'Okul müdürü / Genel müdür' },
  { name: 'Demirbaş (her tutar)', min_amount: 0, max_amount: null, category_kind: 'capex', step_no: 4, approver_kind: 'role', approver_role: 'approver', approver_label: 'Yönetim' },
];
export const THREE_QUOTE_SUGGESTION = 50000;

export interface BudgetCheck {
  status: 'ok' | 'insufficient' | 'no_budget'; mode: 'off' | 'warn' | 'block'; fiscal_year: string;
  amount?: number; pre_commitment?: number; commitment?: number; actual?: number; available?: number; after?: number;
  request_amount?: number | null; budget_line_id?: string;
}

// ---------- Dosyalar (procure-files/<kurum>/<klasör>/<ts>-<ad>) ----------
export const PROC_FILE_MAX_MB = 15;
const safeName = (s: string) => s.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-80);

export async function uploadProcFile(supabase: any, file: File, folder: string, owner: { type: string; id: string }) {
  if (file.size > PROC_FILE_MAX_MB * 1024 * 1024) throw new Error(`Dosya ${PROC_FILE_MAX_MB} MB'tan büyük olamaz`);
  const { data: org, error: e1 } = await supabase.rpc('current_org_id');
  if (e1 || !org) throw new Error('Kurum bilgisi alınamadı');
  const path = `${org}/${folder}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from('procure-files').upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(/bucket/i.test(error.message) ? `${PROCURE_SQL_1A} dosyası Supabase'de çalıştırılmamış.` : error.message);
  const ins = await supabase.from('proc_attachments').insert({ owner_type: owner.type, owner_id: owner.id, storage_path: path, file_name: file.name, mime: file.type || null, size: file.size }).select('id').single();
  if (ins.error) throw new Error(ins.error.message);
  return ins.data.id as string;
}

export async function openProcFile(supabase: any, path: string, name: string) {
  const { data, error } = await supabase.storage.from('procure-files').createSignedUrl(path, 120, { download: name });
  if (error || !data) throw new Error(error?.message || 'Dosya açılamadı');
  window.open(data.signedUrl, '_blank', 'noopener');
}

// Hata mesajını kullanıcıya göster (SQL kurulmamışsa hangi dosya)
export const procError = (e: any, file = PROCURE_SQL_1A) => (isMissingSchema(e) ? `Önce ${file} dosyasını Supabase'de çalıştırın.` : e?.message || String(e));

// RPC SETOF uuid sonucu (dizi veya nesne dizisi gelebilir)
export const idList = (data: any): string[] => (Array.isArray(data) ? data.map((x: any) => (typeof x === 'string' ? x : Object.values(x || {})[0] as string)) : []);

// =====================================================================
// FAZ 1b — Tedarikçi, RFQ, karşılaştırma, ödül
// =====================================================================
export const PROCURE_SQL_1B = 'sql/procure/03-tedarikci-rfq.sql';

// Kurum içi kişi adları (proc_org_people: id, ad soyad, e-posta). 03 kurulmamışsa users tablosuna düşer.
export async function loadPeople(supabase: any): Promise<{ id: string; name: string; email: string }[]> {
  const { data, error } = await supabase.rpc('proc_org_people');
  if (!error && Array.isArray(data)) return data;
  const u = await supabase.from('users').select('id, name, full_name, email');
  return (u.data || []).map((x: any) => ({ id: x.id, name: x.name || x.full_name || x.email, email: x.email }));
}
export const peopleMap = (rows: { id: string; name: string }[]) => Object.fromEntries(rows.map(r => [r.id, r.name])) as Record<string, string>;

export type VendorStatus = 'candidate' | 'approved' | 'conditional' | 'blocked';
export const VENDOR_STATUS: Record<VendorStatus, { label: string; cls: string }> = {
  candidate: { label: 'Aday', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  approved: { label: 'Onaylı', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  conditional: { label: 'Şartlı onaylı', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  blocked: { label: 'Bloke', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};
// Tedarikçi belge türleri (geçerlilik tarihi takip edilir)
export const VENDOR_DOC_TYPES = [
  'Vergi levhası', 'İmza sirküleri', 'Ticaret sicil gazetesi', 'Faaliyet belgesi', 'Sigorta poliçesi', 'ISO 9001 sertifikası',
  'Gıda işletme kayıt belgesi', 'Araç ruhsatı / muayene', 'Şoför belgesi / SRC', 'SGK borcu yoktur yazısı', 'Diğer',
];
export interface VendorDoc { type: string; label?: string; valid_until?: string | null; attachment_id?: string | null; file_name?: string | null }
export const docExpired = (d: VendorDoc) => !!d.valid_until && d.valid_until < new Date().toISOString().slice(0, 10);
export const docExpiringSoon = (d: VendorDoc, days = 30) => !!d.valid_until && !docExpired(d) && new Date(d.valid_until).getTime() - Date.now() < days * 864e5;

export type RfqStatus = 'draft' | 'sent' | 'closed' | 'pending_award' | 'awarded' | 'cancelled';
export const RFQ_STATUS: Record<RfqStatus, { label: string; cls: string }> = {
  draft: { label: 'Taslak', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  sent: { label: 'Teklif bekleniyor', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  closed: { label: 'Değerlendirmede', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  pending_award: { label: 'Ödül onayı bekliyor', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  awarded: { label: 'Sonuçlandı', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'İptal', cls: 'bg-slate-100 text-slate-400 border-slate-200' },
};

export const rfqLink = (token: string) => (typeof window === 'undefined' ? '' : `${window.location.origin}/rfq/${token}`);
// wa.me numarası: başında 0 olan yerel numara → 90...
export const waNumber = (phone?: string | null) => {
  const d = (phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('90')) return d;
  if (d.startsWith('0')) return '9' + d;
  return d.length === 10 ? '90' + d : d;
};
// İskonto sonrası birim fiyat
export const unitNet = (l: { unit_price: number | null; discount_pct?: number | null }) => (l.unit_price == null ? null : Number(l.unit_price) * (1 - (Number(l.discount_pct) || 0) / 100));
// Vade düzeltilmiş fiyat: aylık oranla bugünkü değere indirgenir (uzun vade avantajlı)
export const termAdjusted = (price: number, days: number | null | undefined, monthlyPct: number | null | undefined) =>
  !monthlyPct || !days ? price : price / Math.pow(1 + monthlyPct / 100, days / 30);

// =====================================================================
// FAZ 1c — Sipariş, tedarikçi onayı, mal kabul, uygunsuzluk
// =====================================================================
export const PROCURE_SQL_1C = 'sql/procure/04-siparis-kabul.sql';

export type OrderStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'acknowledged' | 'partially_received' | 'received' | 'invoiced' | 'closed' | 'cancelled';
export const ORDER_STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  draft: { label: 'Taslak', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending_approval: { label: 'Onay bekliyor', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Onaylandı · gönderilecek', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  sent: { label: 'Tedarikçiye gönderildi', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  acknowledged: { label: 'Tedarikçi onayladı', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  partially_received: { label: 'Kısmi teslim', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  received: { label: 'Teslim alındı', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  invoiced: { label: 'Faturalandı', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  closed: { label: 'Kapandı', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  cancelled: { label: 'İptal', cls: 'bg-slate-100 text-slate-400 border-slate-200' },
};
// Teslim alınabilir sipariş durumları
export const RECEIVABLE: OrderStatus[] = ['approved', 'sent', 'acknowledged', 'partially_received'];
export const orderLink = (token: string) => (typeof window === 'undefined' ? '' : `${window.location.origin}/po/${token}`);

export const ISSUE_SEVERITY: Record<string, { label: string; cls: string }> = {
  minor: { label: 'Küçük', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  major: { label: 'Büyük', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  critical: { label: 'Kritik', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};
export const ISSUE_STATUS: Record<string, string> = { open: 'Açık', action: 'Düzeltici faaliyette', verification: 'Etkinlik kontrolünde', closed: 'Kapandı' };

// =====================================================================
// FAZ 1d — Fatura eşleştirme, tedarikçi değerlendirme, KPI
// =====================================================================
export const PROCURE_SQL_1D = 'sql/procure/05-fatura-degerlendirme.sql';

export const MATCH_STATUS: Record<string, { label: string; cls: string }> = {
  matched: { label: 'Eşleşti', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  price_variance: { label: 'Fiyat farkı', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  qty_variance: { label: 'Miktar farkı', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  over_invoiced: { label: 'Fazla faturalama', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  approved_with_variance: { label: 'Farkla onaylandı', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  rejected: { label: 'Reddedildi', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  reversed: { label: 'Geri alındı', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

// Değerlendirme kriterleri (ağırlıklar politikadan; varsayılan §4.7)
export const EVAL_CRITERIA = [
  { key: 'quality', label: 'Kalite / uygunluk', hint: 'Red oranı ve uygunsuzluklar' },
  { key: 'on_time', label: 'Zamanında teslim', hint: 'Kabul tarihi ≤ bildirilen/istenen tarih' },
  { key: 'price', label: 'Fiyat rekabeti', hint: 'RFQ\'larda ortalama sıra (1 = en düşük)' },
  { key: 'communication', label: 'İletişim / hizmet', hint: 'Hizmet onayı yıldız ortalaması' },
  { key: 'compliance', label: 'Belge ve mevzuat uyumu', hint: 'Geçerlilik tarihi dolmuş belge' },
] as const;
export const DEFAULT_EVAL_WEIGHTS: Record<string, number> = { quality: 30, on_time: 25, price: 15, communication: 15, compliance: 15 };
export const gradeOf = (score: number) => (score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D');
export const GRADE_CLS: Record<string, string> = { A: 'bg-emerald-50 text-emerald-700 border-emerald-200', B: 'bg-sky-50 text-sky-700 border-sky-200', C: 'bg-amber-50 text-amber-700 border-amber-200', D: 'bg-rose-50 text-rose-700 border-rose-200' };
export const DECISION_LABEL: Record<string, string> = { approve: 'Onaylı', conditional: 'Şartlı onay', block: 'Bloke' };
