'use client';

import { useEffect, useState } from 'react';
import { usePortal, PortalTitle, Catalog } from '@/components/portal/PortalShell';
import { Tabs } from '@/components/portal/common';
import { Button, Input, Select, Modal, Textarea } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { n, todayStr } from '@/lib/portal';
import { periodLabel } from '@/lib/periods';
import { Plus, Trash2, Save, ClipboardPaste } from 'lucide-react';

type Tab = 'sellout' | 'stock' | 'forecast';
const tl = (v: number) => `₺${formatMoney(v)}`;

function nextPeriods() {
  const d = new Date();
  const out: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() + i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  const q = Math.ceil((d.getMonth() + 1) / 3);
  out.push(q === 4 ? `${d.getFullYear() + 1}-Q1` : `${d.getFullYear()}-Q${q + 1}`);
  return out;
}

export default function PortalSellout() {
  const { supabase, me, loadCatalog } = usePortal();
  const [tab, setTab] = useState<Tab>('sellout');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [sellout, setSellout] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);
  const [paste, setPaste] = useState<string | null>(null);
  const [stockDate, setStockDate] = useState(todayStr());
  const [stockDraft, setStockDraft] = useState<Record<string, string>>({});
  const periods = nextPeriods();
  const [fPeriod, setFPeriod] = useState(periods[0]);
  const [fDraft, setFDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [s, st, f] = await Promise.all([
      supabase.from('dealer_sellout').select('*').order('sale_date', { ascending: false }).limit(500),
      supabase.from('dealer_stock').select('*').order('snapshot_date', { ascending: false }),
      supabase.from('dealer_forecasts').select('*'),
    ]);
    setSellout(s.data || []); setStock(st.data || []); setForecasts(f.data || []);
  };
  useEffect(() => { loadCatalog().then(setCatalog); load(); }, []);

  const lastStockDate = stock[0]?.snapshot_date;
  useEffect(() => {
    const d: Record<string, string> = {};
    stock.filter(s => s.snapshot_date === (stock.some(x => x.snapshot_date === stockDate) ? stockDate : lastStockDate))
      .forEach(s => { d[s.product_id] = String(n(s.quantity)); });
    setStockDraft(d);
  }, [stock, stockDate]);
  useEffect(() => {
    const d: Record<string, string> = {};
    forecasts.filter(f => f.period === fPeriod).forEach(f => { d[f.product_id] = String(n(f.quantity)); });
    setFDraft(d);
  }, [forecasts, fPeriod]);

  const pname = (id: string) => catalog?.products.find(p => p.id === id)?.name || '-';
  const products = catalog?.products || [];

  const saveSellout = async () => {
    if (!form.product_id || !(n(form.quantity) > 0)) { alert('Ürün ve miktar girin.'); return; }
    setBusy(true);
    const { error } = await supabase.from('dealer_sellout').insert([{ dealer_id: me.dealer.id, sale_date: form.sale_date, product_id: form.product_id,
      quantity: n(form.quantity), unit_price: form.unit_price ? n(form.unit_price) : null, end_customer_name: form.end_customer_name || null,
      end_customer_city: form.end_customer_city || null, serial_numbers: form.serial_numbers || null }]);
    setBusy(false);
    if (error) { alert(error.message); return; }
    setForm(null); load();
  };

  // Excel'den yapıştır: ürün kodu/adı ; adet ; tarih ; müşteri ; şehir
  const importPaste = async () => {
    const rows: any[] = []; const bad: string[] = [];
    (paste || '').split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      const c = line.split(/\t|;/).map(x => x.trim());
      const p = products.find(x => (x.code && x.code.toLowerCase() === c[0]?.toLowerCase()) || x.name.toLowerCase() === c[0]?.toLowerCase());
      const q = n(c[1]?.replace(',', '.'));
      if (!p || !(q > 0)) { bad.push(line); return; }
      let date = todayStr();
      if (c[2]) { const m = c[2].match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/); date = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : c[2]; }
      rows.push({ dealer_id: me.dealer.id, product_id: p.id, quantity: q, sale_date: date, end_customer_name: c[3] || null, end_customer_city: c[4] || null });
    });
    if (!rows.length) { alert('Okunabilen satır yok.'); return; }
    setBusy(true);
    const { error } = await supabase.from('dealer_sellout').insert(rows);
    setBusy(false);
    if (error) { alert(error.message); return; }
    alert(`${rows.length} satır eklendi.${bad.length ? `\nOkunamayan ${bad.length} satır:\n${bad.slice(0, 5).join('\n')}` : ''}`);
    setPaste(null); load();
  };

  const saveGrid = async (table: 'dealer_stock' | 'dealer_forecasts', draft: Record<string, string>, extra: any, conflict: string) => {
    const rows = Object.entries(draft).filter(([, v]) => v !== '' && !isNaN(Number(v))).map(([product_id, v]) => ({ dealer_id: me.dealer.id, product_id, quantity: Number(v), ...extra }));
    if (!rows.length) { alert('Miktar girin.'); return; }
    setBusy(true);
    const { error } = await supabase.from(table).upsert(rows, { onConflict: conflict });
    setBusy(false);
    if (error) { alert(error.message); return; }
    alert('Kaydedildi.'); load();
  };

  // Son 90 gün satış hızı → stok kaç hafta yeter
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const weekly = (pid: string) => sellout.filter(s => s.product_id === pid && s.sale_date >= since).reduce((a, s) => a + n(s.quantity), 0) / 13;

  return (
    <div className="space-y-4">
      <PortalTitle title="Satış, Stok & Talep Tahmini" subtitle="Son kullanıcıya satışlarınızı ve stoğunuzu paylaşın; üretim ve sevkiyat planı buna göre yapılır." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ key: 'sellout', label: 'Satışlarım (sell-out)' }, { key: 'stock', label: 'Stok bildirimi' }, { key: 'forecast', label: 'Talep tahmini' }]} />

      {tab === 'sellout' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPaste('')}><ClipboardPaste className="h-3 w-3" />Excel'den yapıştır</Button>
            <Button size="sm" onClick={() => setForm({ sale_date: todayStr(), product_id: '', quantity: '', unit_price: '', end_customer_name: '', end_customer_city: '', serial_numbers: '' })}><Plus className="h-3 w-3" />Satış ekle</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Tarih</th><th>Ürün</th><th className="text-right">Adet</th><th className="text-right">Birim fiyat</th><th>Son kullanıcı</th><th>Seri no</th><th /></tr></thead>
              <tbody>
                {sellout.length === 0 && <tr><td colSpan={7} className="py-3 text-slate-500">Kayıt yok.</td></tr>}
                {sellout.map(s => (
                  <tr key={s.id} className="border-b">
                    <td className="py-1.5">{formatDate(s.sale_date)}</td><td>{pname(s.product_id)}</td><td className="text-right">{n(s.quantity)}</td>
                    <td className="text-right">{s.unit_price ? tl(n(s.unit_price)) : '-'}</td>
                    <td className="text-xs">{[s.end_customer_name, s.end_customer_city].filter(Boolean).join(' · ') || '-'}</td>
                    <td className="max-w-[160px] truncate text-xs">{s.serial_numbers || '-'}</td>
                    <td><button onClick={async () => { if (confirm('Silinsin mi?')) { await supabase.from('dealer_sellout').delete().eq('id', s.id); load(); } }}><Trash2 className="h-3 w-3 text-red-400" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'stock' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span>Sayım tarihi</span><input type="date" value={stockDate} onChange={e => setStockDate(e.target.value)} className="h-9 rounded-lg border px-2" />
            {lastStockDate && <span className="text-xs text-slate-500">Son bildirim: {formatDate(lastStockDate)}</span>}
            <Button size="sm" className="ml-auto" disabled={busy} onClick={() => saveGrid('dealer_stock', stockDraft, { snapshot_date: stockDate }, 'dealer_id,snapshot_date,product_id')}><Save className="h-3 w-3" />Kaydet</Button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Ürün</th><th className="text-right">Eldeki stok</th><th className="text-right">Haftalık satış (90 gün ort.)</th><th className="text-right">Kaç hafta yeter</th></tr></thead>
            <tbody>
              {products.map(p => {
                const w = weekly(p.id); const q = n(stockDraft[p.id]);
                return (
                  <tr key={p.id} className="border-b">
                    <td className="py-1.5">{p.name}</td>
                    <td className="text-right"><input type="number" value={stockDraft[p.id] ?? ''} onChange={e => setStockDraft({ ...stockDraft, [p.id]: e.target.value })} className="h-8 w-24 rounded border px-2 text-right" /></td>
                    <td className="text-right text-slate-500">{w ? w.toFixed(1) : '-'}</td>
                    <td className={`text-right ${w && q / w < 2 ? 'font-medium text-red-600' : ''}`}>{w ? (q / w).toFixed(1) : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'forecast' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span>Dönem</span>
            <select value={fPeriod} onChange={e => setFPeriod(e.target.value)} className="h-9 rounded-lg border px-2">{periods.map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}</select>
            <span className="text-xs text-slate-500">Bu dönemde bizden almayı planladığınız miktarlar</span>
            <Button size="sm" className="ml-auto" disabled={busy} onClick={() => saveGrid('dealer_forecasts', fDraft, { period: fPeriod }, 'dealer_id,period,product_id')}><Save className="h-3 w-3" />Kaydet</Button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Ürün</th><th className="text-right">Tahmini alım</th></tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-b">
                  <td className="py-1.5">{p.name}</td>
                  <td className="text-right"><input type="number" value={fDraft[p.id] ?? ''} onChange={e => setFDraft({ ...fDraft, [p.id]: e.target.value })} className="h-8 w-24 rounded border px-2 text-right" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Satış ekle"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={saveSellout} disabled={busy}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-3">
            <Select label="Ürün" value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })} options={[{ value: '', label: 'Seçin' }, ...products.map(p => ({ value: p.id, label: p.name }))]} />
            <div className="grid grid-cols-3 gap-3">
              <Input label="Tarih" type="date" value={form.sale_date} onChange={e => setForm({ ...form, sale_date: e.target.value })} />
              <Input label="Adet" type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
              <Input label="Satış fiyatı" type="number" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Son kullanıcı" value={form.end_customer_name} onChange={e => setForm({ ...form, end_customer_name: e.target.value })} />
              <Input label="Şehir" value={form.end_customer_city} onChange={e => setForm({ ...form, end_customer_city: e.target.value })} />
            </div>
            <Textarea label="Seri numaraları (garanti takibi için, virgülle)" value={form.serial_numbers} onChange={e => setForm({ ...form, serial_numbers: e.target.value })} />
          </div>
        )}
      </Modal>
      <Modal isOpen={paste !== null} onClose={() => setPaste(null)} title="Excel'den satış yapıştır" size="lg"
        footer={<><Button variant="secondary" onClick={() => setPaste(null)}>İptal</Button><Button onClick={importPaste} disabled={busy}>İçe aktar</Button></>}>
        <p className="mb-2 text-xs text-slate-500">Sütun sırası: <b>Ürün kodu veya adı · Adet · Tarih (GG.AA.YYYY) · Son kullanıcı · Şehir</b>. Excel'den kopyalayıp yapıştırın.</p>
        <textarea value={paste || ''} onChange={e => setPaste(e.target.value)} rows={10} className="w-full rounded-lg border p-2 font-mono text-xs" placeholder={'AKU-72\t10\t05.10.2026\tÖrnek Oto\tİzmir'} />
      </Modal>
    </div>
  );
}
