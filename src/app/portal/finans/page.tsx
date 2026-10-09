'use client';

import { useEffect, useState } from 'react';
import { usePortal, PortalTitle } from '@/components/portal/PortalShell';
import { StatusBadge, Tabs, FileField, FileLink, Kpi } from '@/components/portal/common';
import { Modal, Button, Input, Select, Textarea } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { INVOICE_STATUS, PAYMENT_NOTICE_STATUS, PAYMENT_METHODS, n, todayStr } from '@/lib/portal';
import { printHtml, escapeHtml } from '@/lib/print';
import { Printer, Plus } from 'lucide-react';

const tl = (v: number) => `₺${formatMoney(v)}`;
type Tab = 'invoices' | 'statement' | 'payments';

export default function PortalFinance() {
  const { supabase, me, reloadMe } = usePortal();
  const [tab, setTab] = useState<Tab>('statement');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(todayStr());
  const [stmt, setStmt] = useState<{ opening: number; lines: any[] } | null>(null);
  const [form, setForm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const loadNotices = () => supabase.from('dealer_payment_notices').select('*').order('created_at', { ascending: false }).then(({ data }: any) => setNotices(data || []));
  useEffect(() => {
    supabase.rpc('portal_invoices').then(({ data }: any) => setInvoices(data || []));
    loadNotices();
  }, []);
  useEffect(() => {
    if (!from || !to) return;
    supabase.rpc('portal_statement', { p_from: from, p_to: to }).then(({ data, error }: any) => {
      if (error) alert(error.message); else setStmt(data);
    });
  }, [from, to]);

  let bal = n(stmt?.opening);
  const rows = (stmt?.lines || []).map((l: any) => { bal += n(l.debit) - n(l.credit); return { ...l, balance: bal }; });
  const totDebit = rows.reduce((s: number, r: any) => s + n(r.debit), 0);
  const totCredit = rows.reduce((s: number, r: any) => s + n(r.credit), 0);

  const print = () => {
    const body = `
      <h1>Cari Hesap Ekstresi</h1>
      <p><b>${escapeHtml(me.dealer.name)}</b>${me.dealer.dealer_code ? ' (' + escapeHtml(me.dealer.dealer_code) + ')' : ''}<br/>
      Dönem: ${escapeHtml(formatDate(from))} – ${escapeHtml(formatDate(to))} · Düzenleyen: ${escapeHtml(me.organization || '')}</p>
      <table><thead><tr><th>Tarih</th><th>İşlem</th><th>Belge</th><th>Açıklama</th><th class="r">Borç</th><th class="r">Alacak</th><th class="r">Bakiye</th></tr></thead><tbody>
      <tr><td colspan="6"><i>Devir bakiyesi</i></td><td class="r">${tl(n(stmt?.opening))}</td></tr>
      ${rows.map((r: any) => `<tr><td>${escapeHtml(formatDate(r.date))}</td><td>${escapeHtml(r.kind)}</td><td>${escapeHtml(r.doc || '')}</td><td>${escapeHtml(r.description)}</td>
        <td class="r">${n(r.debit) ? tl(n(r.debit)) : ''}</td><td class="r">${n(r.credit) ? tl(n(r.credit)) : ''}</td><td class="r">${tl(r.balance)}</td></tr>`).join('')}
      <tr><td colspan="4"><b>Toplam</b></td><td class="r"><b>${tl(totDebit)}</b></td><td class="r"><b>${tl(totCredit)}</b></td><td class="r"><b>${tl(bal)}</b></td></tr>
      </tbody></table>
      <p style="margin-top:24px;font-size:11px">Bakiye pozitif ise borç bakiyesidir. Mutabık değilseniz 15 gün içinde bildiriniz.</p>`;
    printHtml(`Ekstre ${me.dealer.name}`, body);
  };

  const saveNotice = async () => {
    if (!(n(form.amount) > 0)) { alert('Tutar girin.'); return; }
    setBusy(true);
    const { error } = await supabase.from('dealer_payment_notices').insert([{
      dealer_id: me.dealer.id, amount: n(form.amount), payment_date: form.payment_date, method: form.method,
      bank: form.bank || null, reference: form.reference || null, due_date: form.due_date || null, note: form.note || null,
      attachment_url: form.attachment_url || null,
    }]);
    setBusy(false);
    if (error) { alert('Hata: ' + error.message); return; }
    setForm(null); loadNotices();
  };

  return (
    <div className="space-y-4">
      <PortalTitle title="Finans & Cari Hesap" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Açık bakiye" value={tl(n(me.open_balance))} tone="amber" />
        <Kpi label="Vadesi geçen" value={tl(n(me.overdue))} tone={n(me.overdue) > 0 ? 'red' : 'green'} />
        <Kpi label="Kredi limiti" value={me.dealer.credit_limit ? tl(n(me.dealer.credit_limit)) : 'Limitsiz'} />
        <Kpi label="Bekleyen ödeme bildirimi" value={String(notices.filter(x => x.status === 'submitted').length)} tone="blue" />
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ key: 'statement', label: 'Cari Ekstre' }, { key: 'invoices', label: 'Faturalarım' }, { key: 'payments', label: 'Ödeme Bildirimleri' }]} />

      {tab === 'statement' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 rounded-lg border px-2" />
            <span>–</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 rounded-lg border px-2" />
            <Button size="sm" variant="secondary" onClick={print} className="ml-auto"><Printer className="h-3 w-3" />Yazdır / PDF</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Tarih</th><th>İşlem</th><th>Belge</th><th>Açıklama</th><th className="text-right">Borç</th><th className="text-right">Alacak</th><th className="text-right">Bakiye</th></tr></thead>
              <tbody>
                <tr className="border-b bg-slate-50"><td colSpan={6} className="py-1.5 italic text-slate-500">Devir bakiyesi</td><td className="text-right">{tl(n(stmt?.opening))}</td></tr>
                {rows.map((r: any, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="py-1.5">{formatDate(r.date)}</td><td>{r.kind}</td><td className="text-xs">{r.doc || '-'}</td><td className="text-xs text-slate-500">{r.description}</td>
                    <td className="text-right">{n(r.debit) ? tl(n(r.debit)) : ''}</td>
                    <td className="text-right text-green-700">{n(r.credit) ? tl(n(r.credit)) : ''}</td>
                    <td className="text-right font-medium">{tl(r.balance)}</td>
                  </tr>
                ))}
                <tr className="font-semibold"><td colSpan={4} className="py-2">Toplam</td><td className="text-right">{tl(totDebit)}</td><td className="text-right">{tl(totCredit)}</td><td className="text-right">{tl(bal)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'invoices' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50 text-left text-xs"><th className="px-4 py-2">Fatura No</th><th>Tarih</th><th>Vade</th><th>Durum</th><th className="text-right">Tutar</th><th className="px-4 text-right">Ödenen</th></tr></thead>
            <tbody>
              {invoices.length === 0 && <tr><td colSpan={6} className="p-4 text-slate-500">Fatura yok.</td></tr>}
              {invoices.map(f => {
                const overdue = f.status !== 'paid' && f.status !== 'cancelled' && f.due_date && f.due_date < todayStr();
                return (
                  <tr key={f.id} className="border-b">
                    <td className="px-4 py-2 font-medium">{f.invoice_number}</td>
                    <td>{formatDate(f.issue_date)}</td>
                    <td className={overdue ? 'font-medium text-red-600' : ''}>{f.due_date ? formatDate(f.due_date) : '-'}</td>
                    <td><StatusBadge map={INVOICE_STATUS} value={f.status} /></td>
                    <td className="text-right">{tl(n(f.total))}</td>
                    <td className="px-4 text-right">{tl(n(f.paid_amount))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payments' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-500">Yaptığınız ödemeyi bildirin; finans ekibi kontrol edip cari hesabınıza işler.</p>
            <Button size="sm" onClick={() => setForm({ amount: '', payment_date: todayStr(), method: 'Havale/EFT', bank: '', reference: '', due_date: '', note: '', attachment_url: '' })}><Plus className="h-3 w-3" />Ödeme bildir</Button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Tarih</th><th>Yöntem</th><th>Referans</th><th>Durum</th><th className="text-right">Tutar</th></tr></thead>
            <tbody>
              {notices.length === 0 && <tr><td colSpan={5} className="py-3 text-slate-500">Bildirim yok.</td></tr>}
              {notices.map(x => (
                <tr key={x.id} className="border-b">
                  <td className="py-2">{formatDate(x.payment_date)}</td>
                  <td>{x.method}{x.bank ? ` · ${x.bank}` : ''}{x.due_date ? ` · vade ${formatDate(x.due_date)}` : ''}</td>
                  <td className="text-xs">{x.reference || '-'} <FileLink supabase={supabase} value={x.attachment_url} />{x.review_note && <div className="text-slate-500">{x.review_note}</div>}</td>
                  <td><StatusBadge map={PAYMENT_NOTICE_STATUS} value={x.status} /></td>
                  <td className="text-right font-medium">{tl(n(x.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Ödeme Bildirimi"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={saveNotice} disabled={busy}>Gönder</Button></>}>
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tutar (₺)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              <Input label="Ödeme tarihi" type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} />
              <Select label="Yöntem" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))} />
              <Input label="Banka" value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} />
              <Input label="Dekont / çek no" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
              {(form.method === 'Çek' || form.method === 'Senet') && <Input label="Çek/senet vadesi" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />}
            </div>
            <FileField supabase={supabase} dealerId={me.dealer.id} value={form.attachment_url} onChange={v => setForm({ ...form, attachment_url: v })} label="Dekont" />
            <Textarea label="Not (hangi faturalar için)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
