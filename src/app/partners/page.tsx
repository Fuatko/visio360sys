'use client';

import Header from '@/components/Header';
import { Card, Button, Badge, Modal, Input, Textarea, EmptyState } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { Handshake, RefreshCw, Download, CheckCircle, Banknote, XCircle, Users, Info } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { PAYMENT_CHANNELS, ATTRIBUTION_MODES, COMMISSION_STATUS } from '@/lib/partners';
import { exportToCSV, downloadFile } from '@/lib/csv-utils';

interface Commission {
  id: string;
  partner_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  base_amount: number;
  commission_rate: number;
  gross_amount: number;
  payment_channel: string;
  withholding_amount: number;
  stamp_tax_amount: number;
  extra_tax_amount: number;
  net_amount: number;
  company_cost: number;
  status: string;
  accrued_at: string;
  approved_at: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  partner_invoice_no: string | null;
  cancel_reason: string | null;
}

const n = (v: any) => Number(v) || 0;
const today = () => new Date().toISOString().split('T')[0];

export default function PartnersPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [opps, setOpps] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [filterPartner, setFilterPartner] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMonth, setFilterMonth] = useState('');

  const [payTarget, setPayTarget] = useState<Commission[] | null>(null);
  const [payForm, setPayForm] = useState({ paid_at: today(), payment_reference: '', partner_invoice_no: '' });
  const [cancelTarget, setCancelTarget] = useState<Commission | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const [pRes, cRes, custRes, invRes, lRes, oRes] = await Promise.all([
      supabase.from('sales_team').select('*').eq('member_type', 'partner').order('name'),
      supabase.from('partner_commissions').select('*').order('accrued_at', { ascending: false }),
      supabase.from('customers').select('id, name, referral_partner_id'),
      supabase.from('invoices').select('id, invoice_number, customer_id, referral_partner_id, subtotal, discount_amount, total, paid_amount, status'),
      supabase.from('leads').select('id, status, referral_partner_id'),
      supabase.from('opportunities').select('id, stage, referral_partner_id'),
    ]);
    const firstErr = [pRes, cRes].find(r => r.error)?.error;
    if (firstErr) setError(firstErr.message);
    setPartners(pRes.data || []);
    setCommissions(cRes.data || []);
    setCustomers(custRes.data || []);
    setInvoices(invRes.data || []);
    setLeads(lRes.data || []);
    setOpps(oRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const partnerName = (id: string) => partners.find(p => p.id === id)?.name || '-';
  const customerName = (id: string | null) => customers.find(c => c.id === id)?.name || '-';
  const invoiceNo = (id: string | null) => invoices.find(i => i.id === id)?.invoice_number || '-';

  // ---------- Ortak performansı ----------
  const performance = useMemo(() => partners.map(p => {
    const pc = commissions.filter(c => c.partner_id === p.id && c.status !== 'cancelled');
    const pInv = invoices.filter(i => i.referral_partner_id === p.id && !['draft', 'cancelled'].includes(i.status));
    const pOpps = opps.filter(o => o.referral_partner_id === p.id);
    const won = pOpps.filter(o => ['Kazanıldı', 'won'].includes(o.stage)).length;
    const closed = pOpps.filter(o => ['Kazanıldı', 'won', 'Kaybedildi', 'lost'].includes(o.stage)).length;
    return {
      p,
      leads: leads.filter(l => l.referral_partner_id === p.id).length,
      customers: customers.filter(c => c.referral_partner_id === p.id).length,
      opps: pOpps.length,
      winRate: closed > 0 ? Math.round(won / closed * 100) : null,
      invoicedNet: pInv.reduce((s, i) => s + n(i.subtotal) - n(i.discount_amount), 0),
      collectedNet: pc.reduce((s, c) => s + n(c.base_amount), 0),
      earned: pc.reduce((s, c) => s + n(c.gross_amount), 0),
      paidNet: pc.filter(c => c.status === 'paid').reduce((s, c) => s + n(c.net_amount), 0),
      pendingNet: pc.filter(c => c.status !== 'paid').reduce((s, c) => s + n(c.net_amount), 0),
      pendingCost: pc.filter(c => c.status !== 'paid').reduce((s, c) => s + n(c.company_cost), 0),
      totalCost: pc.reduce((s, c) => s + n(c.company_cost), 0),
    };
  }), [partners, commissions, invoices, opps, leads, customers]);

  const totals = performance.reduce((t, r) => ({
    collectedNet: t.collectedNet + r.collectedNet, earned: t.earned + r.earned,
    paidNet: t.paidNet + r.paidNet, pendingNet: t.pendingNet + r.pendingNet, pendingCost: t.pendingCost + r.pendingCost,
  }), { collectedNet: 0, earned: 0, paidNet: 0, pendingNet: 0, pendingCost: 0 });

  // ---------- Komisyon defteri ----------
  const ledger = commissions.filter(c =>
    (!filterPartner || c.partner_id === filterPartner) &&
    (!filterStatus || c.status === filterStatus) &&
    (!filterMonth || (c.accrued_at || '').startsWith(filterMonth)));

  const updateCommissions = async (ids: string[], data: any) => {
    setBusy(true);
    const { error } = await supabase.from('partner_commissions').update(data).in('id', ids);
    setBusy(false);
    if (error) { alert('Hata: ' + error.message); return false; }
    fetchData();
    return true;
  };

  const approve = (c: Commission) => updateCommissions([c.id], { status: 'approved', approved_at: new Date().toISOString() });

  const openPay = (list: Commission[]) => {
    setPayTarget(list);
    setPayForm({ paid_at: today(), payment_reference: '', partner_invoice_no: '' });
  };

  const confirmPay = async () => {
    if (!payTarget) return;
    const ok = await updateCommissions(payTarget.map(c => c.id), {
      status: 'paid',
      paid_at: payForm.paid_at,
      payment_reference: payForm.payment_reference || null,
      partner_invoice_no: payForm.partner_invoice_no || null,
      approved_at: new Date().toISOString(),
    });
    if (ok) setPayTarget(null);
  };

  const confirmCancel = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    const ok = await updateCommissions([cancelTarget.id], { status: 'cancelled', cancel_reason: cancelReason.trim() });
    if (ok) setCancelTarget(null);
  };

  const exportCsv = () => {
    const rows = ledger.map(c => ({
      tarih: new Date(c.accrued_at).toLocaleDateString('tr-TR'),
      ortak: partnerName(c.partner_id),
      odeme_yolu: PAYMENT_CHANNELS[c.payment_channel]?.label || c.payment_channel,
      musteri: customerName(c.customer_id),
      fatura: invoiceNo(c.invoice_id),
      matrah: n(c.base_amount), oran: n(c.commission_rate), brut: n(c.gross_amount),
      stopaj_kesinti: n(c.withholding_amount), damga: n(c.stamp_tax_amount), ek_vergi_sgk: n(c.extra_tax_amount),
      net: n(c.net_amount), sirket_maliyeti: n(c.company_cost),
      durum: COMMISSION_STATUS[c.status]?.label || c.status,
      odeme_tarihi: c.paid_at || '', dekont: c.payment_reference || '', ortak_fatura_no: c.partner_invoice_no || '',
    }));
    const csv = exportToCSV(rows, [
      { key: 'tarih', header: 'Hak Ediş Tarihi' }, { key: 'ortak', header: 'İş Ortağı' }, { key: 'odeme_yolu', header: 'Ödeme Yolu' },
      { key: 'musteri', header: 'Müşteri' }, { key: 'fatura', header: 'Fatura' }, { key: 'matrah', header: 'Tahsilat (KDV hariç)' },
      { key: 'oran', header: 'Oran %' }, { key: 'brut', header: 'Brüt Komisyon' }, { key: 'stopaj_kesinti', header: 'Stopaj / Kesinti' },
      { key: 'damga', header: 'Damga V.' }, { key: 'ek_vergi_sgk', header: 'Huzur Hakkı V. / SGK İşveren' },
      { key: 'net', header: 'Net Ödenecek' }, { key: 'sirket_maliyeti', header: 'Şirket Maliyeti' }, { key: 'durum', header: 'Durum' },
      { key: 'odeme_tarihi', header: 'Ödeme Tarihi' }, { key: 'dekont', header: 'Dekont / Belge No' }, { key: 'ortak_fatura_no', header: 'Ortak Fatura No' },
    ]);
    downloadFile(csv, `is-ortagi-komisyonlari_${today()}.csv`);
  };

  if (loading) {
    return <div><Header title="İş Ortakları & Komisyonlar" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;
  }

  return (
    <div>
      <Header title="İş Ortakları & Komisyonlar" subtitle="Ortak kaynaklı satışlar, hak edilen ve ödenen komisyonlar" />
      <div className="space-y-6 p-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Veriler yüklenemedi: {error}. İş ortağı SQL kurulumu yapıldı mı?
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-5">
          <Card className="p-4"><p className="text-2xl font-bold">{partners.length}</p><p className="text-xs text-slate-500">İş Ortağı</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-blue-600">₺{formatMoney(totals.collectedNet)}</p><p className="text-xs text-slate-500">Ortak kaynaklı tahsilat (KDV hariç)</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-amber-600">₺{formatMoney(totals.earned)}</p><p className="text-xs text-slate-500">Hak edilen brüt komisyon</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-green-600">₺{formatMoney(totals.paidNet)}</p><p className="text-xs text-slate-500">Ödenen (net)</p></Card>
          <Card className="p-4">
            <p className="text-2xl font-bold text-red-600">₺{formatMoney(totals.pendingNet)}</p>
            <p className="text-xs text-slate-500">Bekleyen ödeme (net)</p>
            <p className="mt-1 text-[11px] text-slate-400">Şirket maliyeti: ₺{formatMoney(totals.pendingCost)}</p>
          </Card>
        </div>

        {/* Ortak performansı */}
        <Card>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-indigo-600" />Ortak Performansı</h3>
            <Button variant="secondary" size="sm" onClick={() => router.push('/team')}>Ortakları Yönet</Button>
          </div>
          {partners.length === 0 ? (
            <EmptyState icon={<Handshake className="h-14 w-14" />} title="Henüz iş ortağı yok"
              description="Ekip & İş Ortakları sayfasında yeni kişi eklerken türünü 'İş Ortağı' seçin."
              action={<Button onClick={() => router.push('/team')}>İş Ortağı Ekle</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs">
                    <th className="px-4 py-2 font-medium">Ortak</th>
                    <th className="px-3 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 text-right font-medium">Lead</th>
                    <th className="px-3 py-2 text-right font-medium">Müşteri</th>
                    <th className="px-3 py-2 text-right font-medium">Kazanma</th>
                    <th className="px-3 py-2 text-right font-medium">Faturalanan</th>
                    <th className="px-3 py-2 text-right font-medium">Tahsil Edilen</th>
                    <th className="px-3 py-2 text-right font-medium">Hak Edilen</th>
                    <th className="px-3 py-2 text-right font-medium">Ödenen (net)</th>
                    <th className="px-3 py-2 text-right font-medium">Bekleyen (net)</th>
                    <th className="px-3 py-2 text-right font-medium">Toplam Maliyet</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.map(r => (
                    <tr key={r.p.id} className="cursor-pointer border-b hover:bg-slate-50" onClick={() => setFilterPartner(filterPartner === r.p.id ? '' : r.p.id)}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{r.p.name}</div>
                        <div className="text-xs text-slate-500">{r.p.partner_company_name || 'Şahıs'}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        %{n(r.p.default_commission_rate)} · {r.p.attribution_mode === 'months' ? `${r.p.attribution_months} ay` : ATTRIBUTION_MODES[r.p.attribution_mode]?.split(' (')[0]}
                        <div className="text-slate-400">{PAYMENT_CHANNELS[r.p.payment_channel]?.label.split(' — ')[0]}</div>
                      </td>
                      <td className="px-3 py-2 text-right">{r.leads}</td>
                      <td className="px-3 py-2 text-right">{r.customers}</td>
                      <td className="px-3 py-2 text-right">{r.winRate === null ? '-' : `%${r.winRate}`}</td>
                      <td className="px-3 py-2 text-right">₺{formatMoney(r.invoicedNet)}</td>
                      <td className="px-3 py-2 text-right">₺{formatMoney(r.collectedNet)}</td>
                      <td className="px-3 py-2 text-right font-medium">₺{formatMoney(r.earned)}</td>
                      <td className="px-3 py-2 text-right text-green-700">₺{formatMoney(r.paidNet)}</td>
                      <td className="px-3 py-2 text-right text-red-600">₺{formatMoney(r.pendingNet)}</td>
                      <td className="px-3 py-2 text-right text-indigo-700">₺{formatMoney(r.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Komisyon defteri */}
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <h3 className="mr-auto flex items-center gap-2 text-sm font-semibold"><Banknote className="h-4 w-4 text-green-600" />Komisyon Defteri</h3>
            <select value={filterPartner} onChange={e => setFilterPartner(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-sm">
              <option value="">Tüm Ortaklar</option>
              {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-sm">
              <option value="">Tüm Durumlar</option>
              {Object.entries(COMMISSION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-sm" />
            {(() => {
              const payable = ledger.filter(c => ['accrued', 'approved'].includes(c.status));
              return payable.length > 1 && filterPartner ? (
                <Button size="sm" onClick={() => openPay(payable)}><Banknote className="h-3 w-3" />Tümünü Öde ({payable.length})</Button>
              ) : null;
            })()}
            <Button variant="secondary" size="sm" onClick={fetchData}><RefreshCw className="h-3 w-3" /></Button>
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!ledger.length}><Download className="h-3 w-3" />CSV</Button>
          </div>
          {ledger.length === 0 ? (
            <div className="flex items-start gap-2 p-6 text-sm text-slate-500">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Komisyon kaydı yok. Komisyon, iş ortağına bağlı bir müşterinin faturası kesilip tahsilatı <strong>Ödendi</strong> yapıldığında otomatik oluşur.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs">
                    <th className="px-4 py-2 font-medium">Tarih</th>
                    <th className="px-3 py-2 font-medium">Ortak</th>
                    <th className="px-3 py-2 font-medium">Müşteri / Fatura</th>
                    <th className="px-3 py-2 text-right font-medium">Matrah</th>
                    <th className="px-3 py-2 text-right font-medium">Brüt</th>
                    <th className="px-3 py-2 text-right font-medium">Kesinti</th>
                    <th className="px-3 py-2 text-right font-medium">Net</th>
                    <th className="px-3 py-2 text-right font-medium">Maliyet</th>
                    <th className="px-3 py-2 text-center font-medium">Durum</th>
                    <th className="px-3 py-2 text-right font-medium">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map(c => {
                    const deductions = n(c.withholding_amount) + n(c.stamp_tax_amount);
                    return (
                      <tr key={c.id} className={`border-b hover:bg-slate-50 ${c.status === 'cancelled' ? 'opacity-50' : ''}`}>
                        <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDate(c.accrued_at)}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{partnerName(c.partner_id)}</div>
                          <div className="text-[11px] text-slate-400">{PAYMENT_CHANNELS[c.payment_channel]?.label}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{customerName(c.customer_id)}</div>
                          <div className="font-mono text-[11px] text-slate-400">{invoiceNo(c.invoice_id)}</div>
                        </td>
                        <td className="px-3 py-2 text-right">₺{formatMoney(n(c.base_amount))}<div className="text-[11px] text-slate-400">%{n(c.commission_rate)}</div></td>
                        <td className="px-3 py-2 text-right font-medium">₺{formatMoney(n(c.gross_amount))}</td>
                        <td className="px-3 py-2 text-right text-red-600" title={`Stopaj/kesinti: ₺${formatMoney(n(c.withholding_amount))} · Damga: ₺${formatMoney(n(c.stamp_tax_amount))}`}>
                          {deductions > 0 ? `-₺${formatMoney(deductions)}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-green-700">₺{formatMoney(n(c.net_amount))}</td>
                        <td className="px-3 py-2 text-right text-indigo-700" title={n(c.extra_tax_amount) > 0 ? `Ek vergi / SGK işveren: ₺${formatMoney(n(c.extra_tax_amount))}` : ''}>
                          ₺{formatMoney(n(c.company_cost))}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant={COMMISSION_STATUS[c.status]?.variant}>{COMMISSION_STATUS[c.status]?.label}</Badge>
                          {c.paid_at && <div className="mt-0.5 text-[10px] text-slate-400">{formatDate(c.paid_at)}{c.payment_reference ? ` · ${c.payment_reference}` : ''}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            {c.status === 'accrued' && (
                              <Button variant="ghost" size="sm" onClick={() => approve(c)} disabled={busy} title="Onayla"><CheckCircle className="h-4 w-4 text-blue-600" /></Button>
                            )}
                            {['accrued', 'approved'].includes(c.status) && (<>
                              <Button variant="ghost" size="sm" onClick={() => openPay([c])} title="Ödendi olarak işaretle"><Banknote className="h-4 w-4 text-green-600" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => { setCancelTarget(c); setCancelReason(''); }} title="İptal"><XCircle className="h-4 w-4 text-red-500" /></Button>
                            </>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <p className="text-xs text-slate-400">
          Komisyon, tahsil edilen tutarın KDV hariç kısmı üzerinden hesaplanır. Stopaj, damga vergisi, huzur hakkı vergisi ve SGK oranları
          ortak kartında tanımlıdır ve yaklaşıktır; uygulamadan önce mali müşavirinizle teyit edin.
        </p>
      </div>

      {/* Ödeme */}
      <Modal isOpen={!!payTarget} onClose={() => setPayTarget(null)} title="Komisyon Ödemesi"
        footer={<>
          <Button variant="secondary" onClick={() => setPayTarget(null)}>Vazgeç</Button>
          <Button onClick={confirmPay} disabled={busy}><Banknote className="h-4 w-4" />Ödendi Olarak Kaydet</Button>
        </>}>
        {payTarget && (() => {
          const sum = (k: keyof Commission) => payTarget.reduce((s, c) => s + n(c[k]), 0);
          const channel = payTarget[0]?.payment_channel;
          return (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="flex justify-between"><span className="text-slate-500">Ortak</span><span className="font-medium">{partnerName(payTarget[0].partner_id)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Kayıt sayısı</span><span>{payTarget.length}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Brüt komisyon</span><span>₺{formatMoney(sum('gross_amount'))}</span></div>
                {sum('withholding_amount') > 0 && <div className="flex justify-between"><span className="text-slate-500">{channel === 'payroll' ? 'Çalışan kesintileri' : 'Stopaj'}</span><span className="text-red-600">-₺{formatMoney(sum('withholding_amount'))}</span></div>}
                {sum('stamp_tax_amount') > 0 && <div className="flex justify-between"><span className="text-slate-500">Damga vergisi</span><span className="text-red-600">-₺{formatMoney(sum('stamp_tax_amount'))}</span></div>}
                <div className="flex justify-between border-t pt-1 font-semibold"><span>Ortağa ödenecek (net)</span><span className="text-green-700">₺{formatMoney(sum('net_amount'))}</span></div>
                {sum('extra_tax_amount') > 0 && <div className="flex justify-between"><span className="text-slate-500">{channel === 'owner_payout' ? 'Huzur hakkı vergisi' : 'SGK işveren payı'}</span><span>₺{formatMoney(sum('extra_tax_amount'))}</span></div>}
                <div className="flex justify-between font-medium"><span>Şirkete toplam maliyet</span><span className="text-indigo-700">₺{formatMoney(sum('company_cost'))}</span></div>
              </div>
              {channel === 'owner_payout' && (
                <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">
                  Bu ödemeyi huzur hakkınızdan yapacaksınız: ortağa ₺{formatMoney(sum('net_amount'))} ödemek için şirketten brüt ₺{formatMoney(sum('company_cost'))} huzur hakkı çekmeniz gerekir.
                </p>
              )}
              <Input label="Ödeme tarihi" type="date" value={payForm.paid_at} onChange={e => setPayForm({ ...payForm, paid_at: e.target.value })} />
              <Input label={channel === 'payroll' ? 'Bordro dönemi / no' : 'Dekont / gider pusulası / SMM no'} value={payForm.payment_reference}
                onChange={e => setPayForm({ ...payForm, payment_reference: e.target.value })} />
              {channel === 'company_invoice' && (
                <Input label="Ortağın kestiği fatura no" value={payForm.partner_invoice_no} onChange={e => setPayForm({ ...payForm, partner_invoice_no: e.target.value })} />
              )}
            </div>
          );
        })()}
      </Modal>

      {/* İptal */}
      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Komisyonu İptal Et"
        footer={<>
          <Button variant="secondary" onClick={() => setCancelTarget(null)}>Vazgeç</Button>
          <Button variant="danger" onClick={confirmCancel} disabled={busy || !cancelReason.trim()}>İptal Et</Button>
        </>}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">Kayıt silinmez, nedeniyle birlikte "İptal" olarak saklanır.</p>
          <Textarea label="İptal nedeni *" value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2} />
        </div>
      </Modal>
    </div>
  );
}
