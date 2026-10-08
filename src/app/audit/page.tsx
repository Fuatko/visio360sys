'use client';

import Header from '@/components/Header';
import { Card, Button, Badge, EmptyState } from '@/components/ui';
import { History, RefreshCw, Download, ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';
import { useState, useEffect, Fragment } from 'react';
import { createClient } from '@/lib/supabase';
import { exportToCSV, downloadFile } from '@/lib/csv-utils';

interface LogRow {
  id: number;
  table_name: string;
  record_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  changed_fields: string[] | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  changed_by_name: string | null;
  changed_by_email: string | null;
  changed_at: string;
}

const TABLE_LABELS: Record<string, string> = {
  customers: 'Müşteri', leads: 'Potansiyel Müşteri', opportunities: 'Fırsat',
  quotes: 'Teklif', quote_items: 'Teklif Kalemi', orders: 'Sipariş', order_items: 'Sipariş Kalemi',
  invoices: 'Fatura', invoice_items: 'Fatura Kalemi', collections: 'Tahsilat',
  contracts: 'Sözleşme', products: 'Ürün', sales_targets: 'Hedef',
};

const ACTION_LABELS: Record<string, { label: string; variant: 'success' | 'info' | 'danger' }> = {
  INSERT: { label: 'Oluşturuldu', variant: 'success' },
  UPDATE: { label: 'Güncellendi', variant: 'info' },
  DELETE: { label: 'Silindi', variant: 'danger' },
};

const FIELD_LABELS: Record<string, string> = {
  status: 'Durum', total: 'Genel Toplam', subtotal: 'Ara Toplam', tax_total: 'KDV', discount: 'İskonto %',
  discount_amount: 'İskonto Tutarı', customer_id: 'Müşteri', stage: 'Aşama', value: 'Değer', probability: 'Olasılık',
  amount: 'Tutar', due_date: 'Vade', payment_date: 'Ödeme Tarihi', name: 'Ad', title: 'Başlık', subject: 'Konu',
  notes: 'Notlar', assigned_to: 'Sorumlu', sales_person_id: 'Satış Temsilcisi', quantity: 'Miktar',
  unit_price: 'Birim Fiyat', price: 'Fiyat', invoice_number: 'Fatura No', paid_amount: 'Ödenen',
  reviewed_at: 'Gözden Geçirme', review_checklist: 'Kontrol Listesi', revision: 'Revizyon', valid_until: 'Geçerlilik',
  sales_target: 'Satış Hedefi', collection_target: 'Tahsilat Hedefi', period: 'Dönem', cancel_reason: 'İptal Nedeni',
};

const IGNORED_FIELDS = ['updated_at', 'organization_id'];

const recordLabel = (r: LogRow) => {
  const d = r.new_data || r.old_data || {};
  const num = d.invoice_number || d.order_number || d.quote_number;
  if (num) return d.revision ? `${num} Rev.${d.revision}` : num;
  return d.title || d.name || d.company_name || d.subject || d.invoice_no || d.description || (r.record_id ? r.record_id.slice(0, 8) : '-');
};

const fmt = (v: any) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

export default function AuditPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filterTable, setFilterTable] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    let q = supabase.from('change_log_view').select('*')
      .gte('changed_at', `${fromDate}T00:00:00`)
      .lte('changed_at', `${toDate}T23:59:59`)
      .order('changed_at', { ascending: false })
      .limit(1000);
    if (filterTable) q = q.eq('table_name', filterTable);
    if (filterAction) q = q.eq('action', filterAction);
    const { data, error } = await q;
    if (error) setError(error.message);
    setRows((data as LogRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filterTable, filterAction, fromDate, toDate]);

  const visible = rows.filter(r => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return recordLabel(r).toLowerCase().includes(s) || (r.changed_by_name || r.changed_by_email || '').toLowerCase().includes(s);
  });

  const changedFieldsOf = (r: LogRow) => (r.changed_fields || []).filter(f => !IGNORED_FIELDS.includes(f));

  const exportCsv = () => {
    const data = visible.map(r => ({
      tarih: new Date(r.changed_at).toLocaleString('tr-TR'),
      kullanici: r.changed_by_name || r.changed_by_email || 'Sistem',
      kayit_turu: TABLE_LABELS[r.table_name] || r.table_name,
      kayit: recordLabel(r),
      islem: ACTION_LABELS[r.action]?.label || r.action,
      degisiklikler: r.action === 'UPDATE'
        ? changedFieldsOf(r).map(f => `${FIELD_LABELS[f] || f}: ${fmt(r.old_data?.[f])} → ${fmt(r.new_data?.[f])}`).join(' | ')
        : '',
    }));
    const csv = exportToCSV(data, [
      { key: 'tarih', header: 'Tarih' }, { key: 'kullanici', header: 'Kullanıcı' },
      { key: 'kayit_turu', header: 'Kayıt Türü' }, { key: 'kayit', header: 'Kayıt' },
      { key: 'islem', header: 'İşlem' }, { key: 'degisiklikler', header: 'Değişiklikler' },
    ]);
    downloadFile(csv, `degisiklik-gecmisi_${fromDate}_${toDate}.csv`);
  };

  return (
    <div>
      <Header title="Değişiklik Geçmişi" subtitle="Kim, ne zaman, neyi değiştirdi — ISO 9001 kayıt kontrolü (7.5.3)" />
      <div className="p-6">
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Bu kayıtlar veritabanı tarafından otomatik tutulur ve uygulamadan değiştirilemez veya silinemez. Denetimlerde CSV olarak dışa aktarabilirsiniz.</span>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-slate-500">Başlangıç</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Bitiş</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm" />
          </div>
          <select value={filterTable} onChange={e => setFilterTable(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="">Tüm Kayıt Türleri</option>
            {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="">Tüm İşlemler</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Kayıt veya kullanıcı ara..."
            className="h-9 w-56 rounded-lg border border-slate-200 px-3 text-sm" />
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!visible.length}><Download className="h-4 w-4" />CSV</Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Kayıtlar yüklenemedi: {error}. ISO uyum SQL kurulumu yapıldı mı?
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div>
        ) : visible.length === 0 ? (
          <EmptyState icon={<History className="h-16 w-16" />} title="Kayıt yok" description="Seçilen aralıkta değişiklik bulunamadı." />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="w-6 px-2 py-3" />
                    <th className="px-3 py-3 font-medium">Tarih</th>
                    <th className="px-3 py-3 font-medium">Kullanıcı</th>
                    <th className="px-3 py-3 font-medium">Kayıt</th>
                    <th className="px-3 py-3 font-medium">İşlem</th>
                    <th className="px-3 py-3 font-medium">Değişen Alanlar</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(r => {
                    const fields = changedFieldsOf(r);
                    const open = expanded === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr className="cursor-pointer border-b hover:bg-slate-50" onClick={() => setExpanded(open ? null : r.id)}>
                          <td className="px-2 py-2 text-slate-400">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">{new Date(r.changed_at).toLocaleString('tr-TR')}</td>
                          <td className="px-3 py-2">{r.changed_by_name || r.changed_by_email || <span className="text-slate-400">Sistem</span>}</td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-slate-500">{TABLE_LABELS[r.table_name] || r.table_name}</span>
                            <div className="font-medium">{recordLabel(r)}</div>
                          </td>
                          <td className="px-3 py-2"><Badge variant={ACTION_LABELS[r.action]?.variant}>{ACTION_LABELS[r.action]?.label}</Badge></td>
                          <td className="px-3 py-2 text-xs text-slate-600">{r.action === 'UPDATE' ? fields.map(f => FIELD_LABELS[f] || f).join(', ') : '—'}</td>
                        </tr>
                        {open && (
                          <tr className="border-b bg-slate-50">
                            <td />
                            <td colSpan={5} className="px-3 py-3">
                              {r.action === 'UPDATE' ? (
                                <table className="w-full text-xs">
                                  <thead><tr className="text-left text-slate-500"><th className="py-1">Alan</th><th className="py-1">Önceki</th><th className="py-1">Yeni</th></tr></thead>
                                  <tbody>
                                    {fields.map(f => (
                                      <tr key={f} className="border-t border-slate-200">
                                        <td className="py-1 pr-3 font-medium">{FIELD_LABELS[f] || f}</td>
                                        <td className="max-w-xs break-all py-1 pr-3 text-red-700">{fmt(r.old_data?.[f])}</td>
                                        <td className="max-w-xs break-all py-1 text-green-700">{fmt(r.new_data?.[f])}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-600">
                                  {JSON.stringify(r.new_data || r.old_data, null, 2)}
                                </pre>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {rows.length >= 1000 && <p className="mt-2 text-xs text-slate-500">İlk 1000 kayıt gösteriliyor; tarih aralığını daraltın.</p>}
      </div>
    </div>
  );
}
