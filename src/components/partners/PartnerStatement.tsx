'use client';

import { Modal, Button, Badge } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { PAYMENT_CHANNELS, ATTRIBUTION_MODES, COMMISSION_STATUS } from '@/lib/partners';
import { printHtml, escapeHtml } from '@/lib/print';

interface Props {
  partner: any;
  commissions: any[];
  opportunities: any[];
  invoices: any[];
  customers: any[];
  companyName: string;
  onClose: () => void;
}

const n = (v: any) => Number(v) || 0;
const tl = (v: number) => `₺${formatMoney(v)}`;
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const today = () => new Date().toISOString().split('T')[0];

export default function PartnerStatement({ partner, commissions, opportunities, invoices, customers, companyName, onClose }: Props) {
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '-';
  const invoiceNo = (id: string) => invoices.find(i => i.id === id)?.invoice_number || '-';
  const def = n(partner.default_commission_rate);

  const rows = commissions
    .filter(c => c.partner_id === partner.id && c.status !== 'cancelled')
    .filter(c => (c.accrued_at || '').slice(0, 10) >= from && (c.accrued_at || '').slice(0, 10) <= to)
    .sort((a, b) => (a.accrued_at || '').localeCompare(b.accrued_at || ''));

  const sum = (list: any[], k: string) => list.reduce((s, c) => s + n(c[k]), 0);
  const earnedGross = sum(rows, 'gross_amount');
  const deductions = sum(rows, 'withholding_amount') + sum(rows, 'stamp_tax_amount');
  const earnedNet = sum(rows, 'net_amount');
  const paidNet = sum(rows.filter(c => c.status === 'paid'), 'net_amount');
  const balance = earnedNet - paidNet;

  // Henüz tahsil edilmemiş faturalar (komisyon tahsil edilince doğacak)
  const openInvoices = invoices
    .filter(i => i.referral_partner_id === partner.id && ['issued', 'partially_paid'].includes(i.status))
    .map(i => {
      const remaining = n(i.total) - n(i.paid_amount);
      const netRemaining = n(i.total) > 0 ? remaining * (n(i.subtotal) - n(i.discount_amount)) / n(i.total) : 0;
      return { ...i, remaining, expected: netRemaining * n(i.referral_commission_rate ?? def) / 100 };
    });

  // Açık fırsatlar (kazanılırsa)
  const openOpps = opportunities
    .filter(o => (o.referral_partner_id === partner.id || customers.find(c => c.id === o.customer_id)?.referral_partner_id === partner.id)
      && !['Kazanıldı', 'won', 'Kaybedildi', 'lost'].includes(o.stage))
    .map(o => {
      const r = n(o.referral_commission_rate ?? customers.find(c => c.id === o.customer_id)?.referral_commission_rate ?? def);
      const exp = n(o.value) * r / 100;
      return { ...o, rate: r, expected: exp, weighted: exp * n(o.probability) / 100 };
    });

  const rule = partner.attribution_mode === 'months' ? `${partner.attribution_months} ay` : ATTRIBUTION_MODES[partner.attribution_mode];

  const print = () => {
    const tr = (cells: string[], cls = '') => `<tr class="${cls}">${cells.join('')}</tr>`;
    const td = (v: any, num = false) => `<td class="${num ? 'num' : ''}">${escapeHtml(v)}</td>`;
    printHtml(`Hesap Özeti - ${partner.name}`, `
      <h1>İş Ortağı Komisyon Hesap Özeti</h1>
      <div class="muted">${escapeHtml(companyName)} · Dönem: ${formatDate(from)} – ${formatDate(to)} · Düzenleme: ${new Date().toLocaleDateString('tr-TR')}</div>
      <div class="box">
        <div><span class="bold">İş Ortağı:</span> ${escapeHtml(partner.name)}${partner.partner_company_name ? ' — ' + escapeHtml(partner.partner_company_name) : ''}</div>
        ${partner.partner_tax_no ? `<div><span class="bold">VKN/TCKN:</span> ${escapeHtml(partner.partner_tax_no)} ${partner.partner_tax_office ? '· ' + escapeHtml(partner.partner_tax_office) : ''}</div>` : ''}
        <div><span class="bold">Anlaşma:</span> %${def} komisyon · ${escapeHtml(rule)} · ${escapeHtml(PAYMENT_CHANNELS[partner.payment_channel]?.label)}</div>
      </div>
      <h2>Hak Edilen Komisyonlar</h2>
      <table>
        ${tr(['<th>Tarih</th>', '<th>Müşteri</th>', '<th>Fatura</th>', '<th class="num">Tahsilat (KDV hariç)</th>', '<th class="num">Oran</th>', '<th class="num">Brüt</th>', '<th class="num">Kesinti</th>', '<th class="num">Net</th>', '<th>Durum</th>'])}
        ${rows.map(c => tr([td(formatDate(c.accrued_at)), td(customerName(c.customer_id)), td(invoiceNo(c.invoice_id)), td(tl(n(c.base_amount)), true), td('%' + n(c.commission_rate), true),
          td(tl(n(c.gross_amount)), true), td(tl(n(c.withholding_amount) + n(c.stamp_tax_amount)), true), td(tl(n(c.net_amount)), true),
          td((COMMISSION_STATUS[c.status]?.label || c.status) + (c.paid_at ? ` (${formatDate(c.paid_at)}${c.payment_reference ? ', ' + c.payment_reference : ''})` : ''))])).join('')}
        ${rows.length ? '' : tr(['<td colspan="9" class="muted">Bu dönemde hak edilen komisyon yok.</td>'])}
      </table>
      <table style="width:50%;margin-left:auto;margin-top:12px">
        ${tr([td('Hak edilen brüt'), td(tl(earnedGross), true)])}
        ${tr([td('Vergi kesintileri'), td('-' + tl(deductions), true)])}
        ${tr([td('Hak edilen net'), td(tl(earnedNet), true)])}
        ${tr([td('Ödenen'), td('-' + tl(paidNet), true)])}
        ${tr([td('KALAN BAKİYE (ortağa ödenecek)'), td(tl(balance), true)], 'total')}
      </table>
      ${openInvoices.length ? `<h2>Tahsilatı Bekleyen Faturalar (komisyon tahsilatta doğar)</h2><table>
        ${tr(['<th>Fatura</th>', '<th>Müşteri</th>', '<th>Vade</th>', '<th class="num">Kalan tahsilat</th>', '<th class="num">Beklenen brüt komisyon</th>'])}
        ${openInvoices.map(i => tr([td(i.invoice_number), td(customerName(i.customer_id)), td(i.due_date ? formatDate(i.due_date) : '-'), td(tl(i.remaining), true), td(tl(i.expected), true)])).join('')}
      </table>` : ''}
      ${openOpps.length ? `<h2>Açık Fırsatlar (kazanılırsa)</h2><table>
        ${tr(['<th>Fırsat</th>', '<th>Müşteri</th>', '<th>Aşama</th>', '<th class="num">Değer</th>', '<th class="num">Olası brüt komisyon</th>'])}
        ${openOpps.map(o => tr([td(o.title), td(customerName(o.customer_id)), td(o.stage), td(tl(n(o.value)), true), td(tl(o.expected), true)])).join('')}
      </table>` : ''}
      <p class="note">Komisyonlar müşteriden fiilen tahsil edilen tutarın KDV hariç kısmı üzerinden hesaplanmıştır. Bekleyen fatura ve fırsat tutarları tahmindir ve hak ediş oluşturmaz.
      Bu özet taraflarca kontrol edilip imzalandığında mutabakat yerine geçer.</p>
      <div class="sign"><div>Düzenleyen<br>${escapeHtml(companyName)}</div><div>İş Ortağı<br>Yukarıdaki hesap özetini kontrol ettim, mutabıkım.</div></div>
    `);
  };

  return (
    <Modal isOpen onClose={onClose} title={`Hesap Özeti — ${partner.name}`} size="xl"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Kapat</Button>
        <Button onClick={print}><Printer className="h-4 w-4" />Yazdır / Mutabakat</Button>
      </>}>
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="block text-xs text-slate-500">Başlangıç</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2" /></div>
          <div><label className="block text-xs text-slate-500">Bitiş</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2" /></div>
          <p className="ml-auto text-xs text-slate-500">%{def} · {rule} · {PAYMENT_CHANNELS[partner.payment_channel]?.label}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[['Hak edilen brüt', earnedGross, ''], ['Kesintiler', deductions, 'text-red-600'], ['Hak edilen net', earnedNet, ''], ['Ödenen', paidNet, 'text-green-700'], ['Kalan bakiye', balance, 'text-red-700']].map(([l, v, c]) => (
            <div key={l as string} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{l}</p><p className={`text-lg font-bold ${c}`}>{tl(v as number)}</p></div>
          ))}
        </div>

        <div>
          <h4 className="mb-1 font-medium">Hak Edilen Komisyonlar</h4>
          {rows.length === 0 ? <p className="text-slate-500">Bu dönemde hak edilen komisyon yok.</p> : (
            <table className="w-full text-xs">
              <thead><tr className="border-b text-left text-slate-500"><th className="py-1">Tarih</th><th>Müşteri / Fatura</th><th className="text-right">Matrah</th><th className="text-right">Brüt</th><th className="text-right">Net</th><th className="text-center">Durum</th></tr></thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-1">{formatDate(c.accrued_at)}</td>
                    <td>{customerName(c.customer_id)} <span className="font-mono text-slate-400">{invoiceNo(c.invoice_id)}</span></td>
                    <td className="text-right">{tl(n(c.base_amount))}</td>
                    <td className="text-right">{tl(n(c.gross_amount))}</td>
                    <td className="text-right font-medium">{tl(n(c.net_amount))}</td>
                    <td className="text-center"><Badge variant={COMMISSION_STATUS[c.status]?.variant}>{COMMISSION_STATUS[c.status]?.label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {openInvoices.length > 0 && (
          <div>
            <h4 className="mb-1 font-medium">Tahsilatı Bekleyen Faturalar <span className="text-xs font-normal text-slate-500">(komisyon tahsilatta doğar)</span></h4>
            <table className="w-full text-xs"><tbody>
              {openInvoices.map(i => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="py-1 font-mono">{i.invoice_number}</td><td>{customerName(i.customer_id)}</td>
                  <td>Vade {i.due_date ? formatDate(i.due_date) : '-'}</td>
                  <td className="text-right">Kalan {tl(i.remaining)}</td>
                  <td className="text-right font-medium text-amber-700">≈ {tl(i.expected)} brüt</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}

        {openOpps.length > 0 && (
          <div>
            <h4 className="mb-1 font-medium">Açık Fırsatlar <span className="text-xs font-normal text-slate-500">(kazanılırsa)</span></h4>
            <table className="w-full text-xs"><tbody>
              {openOpps.map(o => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="py-1">{o.title}</td><td>{customerName(o.customer_id)}</td><td>{o.stage}</td>
                  <td className="text-right">{tl(n(o.value))}</td>
                  <td className="text-right font-medium text-indigo-700">≈ {tl(o.expected)} brüt</td>
                  <td className="text-right text-slate-500">olasılıkla ≈ {tl(o.weighted)}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}
      </div>
    </Modal>
  );
}
