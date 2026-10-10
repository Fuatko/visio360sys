'use client';

import Header from '@/components/Header';
import { Card, Button, Modal, Input, Select, Textarea } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { currentPeriods, periodRange, periodLabel } from '@/lib/periods';
import { computePnl, parseExpensePaste } from '@/lib/profitability';
import { EXPENSE_CATEGORIES, SUPPLIER_MODELS, n } from '@/lib/suppliers';
import { AlertTriangle, Plus, ClipboardPaste, Trash2, Settings2, Info } from 'lucide-react';

type Tab = 'pnl' | 'principals' | 'monthly' | 'expenses';
const tl = (v: number) => `${v < 0 ? '-' : ''}₺${formatMoney(Math.abs(Math.round(v)))}`;
const pct = (v: number) => `%${v.toFixed(1)}`;

export default function ProfitabilityPage() {
  const supabase = createClient();
  const cp = currentPeriods();
  const [tab, setTab] = useState<Tab>('pnl');
  const [period, setPeriod] = useState(cp.year);
  const [deliveredOnly, setDeliveredOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [raw, setRaw] = useState<any>({ orders: [], items: [], products: [], pos: [], receivables: [], expenses: [], partner: [], suppliers: [] });
  const [settings, setSettings] = useState<any>({ corporate_tax_rate: 25 });
  const [setOpen, setSetOpen] = useState(false);
  const [expForm, setExpForm] = useState<any | null>(null);
  const [paste, setPaste] = useState<{ text: string; category: string } | null>(null);
  const [expFilter, setExpFilter] = useState('');

  const load = useCallback(async () => {
    const [o, pr, po, rc, ex, pc, sp, fs] = await Promise.all([
      supabase.from('orders').select('id, order_number, customer_id, order_date, created_at, subtotal, discount, status').neq('status', 'cancelled'),
      supabase.from('products').select('id, name, cost_price, supplier_id'),
      supabase.from('purchase_orders').select('id, supplier_id, sales_order_id, order_date, subtotal, status').neq('status', 'cancelled'),
      supabase.from('supplier_receivables').select('*').neq('status', 'rejected'),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('partner_commissions').select('company_cost, accrued_at, status'),
      supabase.from('suppliers').select('id, name, model'),
      supabase.from('finance_settings').select('*').maybeSingle(),
    ]);
    setMissing(!!ex.error || !!sp.error);
    const ids = (o.data || []).map((x: any) => x.id);
    const items: any[] = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data } = await supabase.from('order_items').select('order_id, product_id, quantity, unit_price, discount, total').in('order_id', ids.slice(i, i + 150));
      items.push(...(data || []));
    }
    setRaw({ orders: o.data || [], items, products: pr.error ? [] : (pr.data || []), pos: po.data || [], receivables: rc.data || [], expenses: ex.data || [],
      partner: pc.error ? [] : (pc.data || []), suppliers: sp.data || [] });
    if (fs.data) setSettings(fs.data);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const inR = (d: any, r: [string, string] | null) => !!d && !!r && String(d).slice(0, 10) >= r[0] && String(d).slice(0, 10) <= r[1];
  const pnlFor = (r: [string, string] | null) => {
    const orders = raw.orders.filter((o: any) => inR(o.order_date || o.created_at, r) && (!deliveredOnly || o.status === 'delivered'));
    const oid = new Set(orders.map((o: any) => o.id));
    return computePnl({
      orders, items: raw.items.filter((i: any) => oid.has(i.order_id)), products: raw.products, pos: raw.pos.filter((p: any) => !p.sales_order_id || oid.has(p.sales_order_id)),
      receivables: raw.receivables.filter((x: any) => inR(x.income_date, r)), expenses: raw.expenses.filter((e: any) => inR(e.expense_date, r)),
      partnerCosts: raw.partner.filter((p: any) => p.status !== 'cancelled' && inR(p.accrued_at, r)).reduce((s: number, p: any) => s + n(p.company_cost), 0),
      taxRate: n(settings.corporate_tax_rate),
    });
  };
  const range = periodRange(period);
  const pnl = useMemo(() => pnlFor(range), [raw, period, deliveredOnly, settings]);
  const stockPurchases = raw.pos.filter((p: any) => !p.sales_order_id && inR(p.order_date, range)).reduce((s: number, p: any) => s + n(p.subtotal), 0);
  const sname = (k: string) => k === 'own' ? 'Kendi ürün ve hizmetlerimiz' : raw.suppliers.find((s: any) => s.id === k)?.name || 'Ana firma';

  const months = useMemo(() => {
    const y = Number(period.slice(0, 4));
    return Array.from({ length: 12 }, (_, i) => { const m = `${y}-${String(i + 1).padStart(2, '0')}`; return { m, p: pnlFor(periodRange(m)) }; });
  }, [raw, period, deliveredOnly, settings]);

  const saveSettings = async () => {
    const payload = { corporate_tax_rate: n(settings.corporate_tax_rate), updated_at: new Date().toISOString() };
    const { data, error } = settings.id ? await supabase.from('finance_settings').update(payload).eq('id', settings.id).select().single()
      : await supabase.from('finance_settings').insert([payload]).select().single();
    if (error) { alert(error.message); return; }
    setSettings(data); setSetOpen(false);
  };
  const saveExpense = async () => {
    if (!(n(expForm.amount) > 0)) { alert('Tutar girin.'); return; }
    const { id, created_at, organization_id, ...rest } = expForm;
    const payload: any = {}; Object.entries(rest).forEach(([k, v]) => { payload[k] = v === '' ? null : v; });
    payload.amount = n(expForm.amount); payload.source = payload.source || 'manual';
    const { error } = id ? await supabase.from('expenses').update(payload).eq('id', id) : await supabase.from('expenses').insert([payload]);
    if (error) { alert(error.message); return; }
    setExpForm(null); load();
  };
  const parsed = paste ? parseExpensePaste(paste.text, paste.category) : null;
  const doImport = async () => {
    if (!parsed?.rows.length) return;
    const { error } = await supabase.from('expenses').upsert(parsed.rows.map(r => ({ ...r, source: 'parasut_import' })), { onConflict: 'organization_id,external_ref', ignoreDuplicates: true });
    if (error) { alert(error.message); return; }
    alert(`${parsed.rows.length} satır işlendi (daha önce aktarılanlar tekrar eklenmez).`); setPaste(null); load();
  };

  const Line = ({ label, value, strong, sub, tone }: { label: string; value: number; strong?: boolean; sub?: string; tone?: string }) => (
    <div className={`flex items-baseline justify-between border-b py-2 ${strong ? 'font-semibold' : ''}`}>
      <span className={strong ? '' : 'pl-4 text-slate-600'}>{label}{sub && <span className="ml-2 text-xs font-normal text-slate-400">{sub}</span>}</span>
      <span className={tone || (strong ? (value < 0 ? 'text-red-600' : '') : 'text-slate-700')}>{tl(value)}</span>
    </div>
  );

  if (loading) return <div><Header title="Kârlılık" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;

  const periodOpts = [cp.month, cp.quarter, cp.year, String(Number(cp.year) - 1)];
  const maxAbs = Math.max(...months.map(x => Math.max(Math.abs(x.p.net), x.p.revenue)), 1);

  return (
    <div>
      <Header title="Kârlılık" subtitle="Satış → brüt kâr → giderler → vergi → net kâr (KDV hariç)" />
      <div className="space-y-4 p-6">
        {missing && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /><b>ana-firmalar.sql</b> dosyasını Supabase'de çalıştırın.</Card>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-white p-1">
            {([['pnl', 'Kâr / zarar'], ['principals', 'Marka / model bazında'], ['monthly', 'Aylık'], ['expenses', `Giderler (${raw.expenses.length})`]] as [Tab, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 text-sm ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>
            ))}
          </div>
          <select value={period} onChange={e => setPeriod(e.target.value)} className="ml-auto h-9 rounded-lg border px-2 text-sm">{periodOpts.map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}</select>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={deliveredOnly} onChange={e => setDeliveredOnly(e.target.checked)} />Sadece teslim edilen siparişler</label>
          <Button variant="secondary" size="sm" onClick={() => setSetOpen(true)} title="Vergi oranı"><Settings2 className="h-4 w-4" /></Button>
        </div>

        {tab === 'pnl' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h3 className="mb-2 font-semibold">Kâr / zarar — {periodLabel(period)}</h3>
              <Line label="Satış geliri" value={pnl.revenue} strong />
              <Line label="Satılan malın maliyeti" value={-pnl.cogs} sub={pnl.missingCostLines ? `${pnl.missingCostLines} kalemde maliyet yok` : undefined} />
              <Line label="Brüt kâr" value={pnl.gross} strong sub={pct(pnl.grossPct)} />
              <Line label="Ana firmalardan prim, komisyon, garanti gelirleri" value={pnl.otherIncome} tone="text-green-700" />
              <Line label="Faaliyet giderleri" value={-pnl.expenses} />
              <Line label="İş ortağı komisyonları (şirket maliyeti)" value={-pnl.partnerCosts} />
              <Line label="Vergi öncesi kâr" value={pnl.ebt} strong />
              <Line label={`Kurumlar vergisi (tahmini %${n(settings.corporate_tax_rate)})`} value={-pnl.tax} />
              <div className={`mt-2 flex items-baseline justify-between rounded-lg p-3 text-lg font-bold ${pnl.net >= 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                <span>Net kâr</span><span>{tl(pnl.net)} <span className="text-sm font-normal">({pct(pnl.netPct)})</span></span>
              </div>
            </Card>
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold">Giderler kategori bazında</h3>
                {pnl.expenseByCategory.length === 0 ? <p className="text-xs text-slate-500">Bu dönem gider yok. Giderler sekmesinden ekleyin veya Paraşüt'ten yapıştırın.</p>
                  : pnl.expenseByCategory.map(([k, v]) => <div key={k} className="flex justify-between border-b py-1 text-sm"><span className="text-slate-600">{k}</span><span>{tl(v)}</span></div>)}
              </Card>
              <Card className="space-y-1 p-4 text-xs text-slate-500">
                <p className="flex gap-1"><Info className="h-3 w-3 shrink-0" />Gelir, sipariş tarihine göre (KDV hariç, iskontolar düşülmüş) hesaplanır.</p>
                <p>Maliyet: siparişe bağlı satın alma varsa gerçek alış tutarı, yoksa ürün kartındaki birim maliyet.</p>
                {stockPurchases > 0 && <p>Bu dönem siparişe bağlı olmayan (stoğa) alım: {tl(stockPurchases)} — satılınca maliyete girer.</p>}
                <p>Vergi tutarı yönetim amaçlı tahmindir; kesin vergi için mali müşavirinizin hesabı esastır.</p>
              </Card>
            </div>
          </div>
        )}

        {tab === 'principals' && (
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Hangi marka / iş modeli ne kazandırıyor? — {periodLabel(period)}</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Kaynak</th><th className="text-right">Satış</th><th className="text-right">Maliyet</th><th className="text-right">Brüt kâr</th><th className="text-right">Marj</th><th className="text-right">Prim / komisyon</th><th className="text-right">Doğrudan gider</th><th className="text-right">Katkı</th></tr></thead>
              <tbody>
                {Object.values(pnl.buckets).sort((a, b) => (b.revenue - b.cogs + b.otherIncome - b.directExpenses) - (a.revenue - a.cogs + a.otherIncome - a.directExpenses)).map(bk => {
                  const gross = bk.revenue - bk.cogs, contrib = gross + bk.otherIncome - bk.directExpenses;
                  const model = raw.suppliers.find((s: any) => s.id === bk.key)?.model;
                  return (
                    <tr key={bk.key} className="border-b">
                      <td className="py-2"><p className="font-medium">{sname(bk.key)}</p>{model && <p className="text-xs text-slate-400">{SUPPLIER_MODELS[model]?.label}</p>}</td>
                      <td className="text-right">{tl(bk.revenue)}</td><td className="text-right text-slate-500">{tl(bk.cogs)}</td>
                      <td className="text-right">{tl(gross)}</td><td className="text-right">{bk.revenue ? pct(gross / bk.revenue * 100) : '-'}</td>
                      <td className="text-right text-green-700">{tl(bk.otherIncome)}</td><td className="text-right text-slate-500">{tl(bk.directExpenses)}</td>
                      <td className={`text-right font-semibold ${contrib < 0 ? 'text-red-600' : ''}`}>{tl(contrib)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-400">Katkı = brüt kâr + ana firmadan gelirler − o markaya ait doğrudan giderler. Genel giderler (kira, personel) dağıtılmaz.</p>
          </Card>
        )}

        {tab === 'monthly' && (
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">{period.slice(0, 4)} aylık</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Ay</th><th className="text-right">Satış</th><th className="text-right">Brüt kâr</th><th className="text-right">Diğer gelir</th><th className="text-right">Gider</th><th className="text-right">Net kâr</th><th className="w-1/4" /></tr></thead>
              <tbody>{months.map(({ m, p }) => (
                <tr key={m} className="border-b">
                  <td className="py-1.5">{periodLabel(m)}</td><td className="text-right">{tl(p.revenue)}</td><td className="text-right">{tl(p.gross)}</td>
                  <td className="text-right text-green-700">{tl(p.otherIncome)}</td><td className="text-right text-slate-500">{tl(p.opex)}</td>
                  <td className={`text-right font-semibold ${p.net < 0 ? 'text-red-600' : 'text-green-700'}`}>{tl(p.net)}</td>
                  <td className="pl-3"><div className="h-2 rounded bg-slate-100"><div className={`h-2 rounded ${p.net < 0 ? 'bg-red-400' : 'bg-green-500'}`} style={{ width: `${Math.abs(p.net) / maxAbs * 100}%` }} /></div></td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        )}

        {tab === 'expenses' && (
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="mr-auto text-sm font-semibold">Giderler (KDV hariç)</h3>
              <select value={expFilter} onChange={e => setExpFilter(e.target.value)} className="h-8 rounded-lg border px-2 text-sm"><option value="">Tüm kategoriler</option>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
              <Button size="sm" variant="secondary" onClick={() => setPaste({ text: '', category: 'Diğer' })}><ClipboardPaste className="h-3 w-3" />Paraşüt'ten yapıştır</Button>
              <Button size="sm" onClick={() => setExpForm({ expense_date: new Date().toISOString().slice(0, 10), category: EXPENSE_CATEGORIES[0], description: '', amount: '', supplier_id: '' })}><Plus className="h-3 w-3" />Gider ekle</Button>
            </div>
            {raw.expenses.length === 0 ? <p className="text-sm text-slate-500">Henüz gider yok. Paraşüt › Giderler listesini Excel'e aktarıp satırları kopyalayarak toplu ekleyebilirsiniz.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Tarih</th><th>Açıklama</th><th>Kategori</th><th>Marka</th><th className="text-right">Tutar</th><th /></tr></thead>
                <tbody>{raw.expenses.filter((e: any) => (!expFilter || e.category === expFilter) && (!range || (e.expense_date >= range[0] && e.expense_date <= range[1]))).map((e: any) => (
                  <tr key={e.id} className="cursor-pointer border-b hover:bg-slate-50" onClick={() => setExpForm({ ...Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v ?? ''])) })}>
                    <td className="py-1.5 text-xs">{formatDate(e.expense_date)}</td><td>{e.description || '-'}{e.source === 'parasut_import' && <span className="ml-1 text-[10px] text-slate-400">Paraşüt</span>}</td>
                    <td className="text-xs">{e.category}</td><td className="text-xs">{e.supplier_id ? sname(e.supplier_id) : '-'}</td><td className="text-right">{tl(n(e.amount))}</td>
                    <td className="text-right"><button onClick={async ev => { ev.stopPropagation(); if (confirm('Silinsin mi?')) { await supabase.from('expenses').delete().eq('id', e.id); load(); } }}><Trash2 className="h-3 w-3 text-red-400" /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <p className="mt-2 text-[11px] text-slate-400">Liste seçili döneme göre süzülür ({periodLabel(period)}).</p>
          </Card>
        )}
      </div>

      <Modal isOpen={setOpen} onClose={() => setSetOpen(false)} title="Kârlılık ayarları"
        footer={<><Button variant="secondary" onClick={() => setSetOpen(false)}>İptal</Button><Button onClick={saveSettings}>Kaydet</Button></>}>
        <Input label="Kurumlar vergisi oranı (%)" type="number" value={settings.corporate_tax_rate} onChange={e => setSettings({ ...settings, corporate_tax_rate: e.target.value })} />
        <p className="mt-2 text-xs text-slate-500">Limited ve anonim şirketlerde genel oran şu an %25'tir; istisnalar ve indirimler için mali müşavirinizin oranını girin.</p>
      </Modal>
      <Modal isOpen={!!expForm} onClose={() => setExpForm(null)} title="Gider"
        footer={<><Button variant="secondary" onClick={() => setExpForm(null)}>İptal</Button><Button onClick={saveExpense}>Kaydet</Button></>}>
        {expForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tarih" type="date" value={expForm.expense_date} onChange={e => setExpForm({ ...expForm, expense_date: e.target.value })} />
              <Input label="Tutar (₺, KDV hariç)" type="number" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} />
            </div>
            <Select label="Kategori" value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })} options={[...new Set([...EXPENSE_CATEGORIES, expForm.category])].map(c => ({ value: c, label: c }))} />
            <Input label="Açıklama" value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} />
            <Select label="Belirli bir markaya ait mi? (marka kârlılığına doğrudan yazılır)" value={expForm.supplier_id} onChange={e => setExpForm({ ...expForm, supplier_id: e.target.value })}
              options={[{ value: '', label: 'Hayır, genel gider' }, ...raw.suppliers.map((s: any) => ({ value: s.id, label: s.name }))]} />
          </div>
        )}
      </Modal>
      <Modal isOpen={!!paste} onClose={() => setPaste(null)} title="Paraşüt / Excel'den gider aktar" size="xl"
        footer={<><Button variant="secondary" onClick={() => setPaste(null)}>İptal</Button><Button onClick={doImport} disabled={!parsed?.rows.length}>{parsed?.rows.length || 0} satırı aktar</Button></>}>
        {paste && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">Paraşüt'te <b>Giderler</b> listesini Excel'e aktarın, başlık satırıyla birlikte satırları kopyalayıp buraya yapıştırın. "Tarih", "Açıklama/Tedarikçi", "Kategori" ve "Ara Toplam / KDV Hariç" sütunları otomatik bulunur. Aynı satır iki kez aktarılmaz.</p>
            <Textarea rows={8} value={paste.text} onChange={e => setPaste({ ...paste, text: e.target.value })} placeholder={'Fatura Tarihi\tTedarikçi\tKategori\tAra Toplam\tKDV\tToplam\n05.10.2026\tTürk Telekom\tİletişim\t1.250,50\t250,10\t1.500,60'} />
            <Select label="Kategori sütunu yoksa" value={paste.category} onChange={e => setPaste({ ...paste, category: e.target.value })} options={EXPENSE_CATEGORIES.map(c => ({ value: c, label: c }))} />
            {parsed && paste.text.trim() && (
              <div className="rounded-lg bg-slate-50 p-2 text-xs">
                <p>Algılanan sütunlar: {parsed.columns}</p>
                <p className="mt-1">Okunan: <b>{parsed.rows.length}</b> satır · toplam {tl(parsed.rows.reduce((s, r) => s + r.amount, 0))}{parsed.bad ? <span className="text-amber-700"> · okunamayan {parsed.bad} satır</span> : ''}</p>
                <div className="mt-1 max-h-40 overflow-auto">{parsed.rows.slice(0, 20).map((r, i) => <div key={i} className="flex justify-between border-b py-0.5"><span>{r.expense_date} · {r.description} · {r.category}</span><span>{tl(r.amount)}</span></div>)}</div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
