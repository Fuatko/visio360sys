'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Button, Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { normalizeName } from '@/lib/crm';
import { parasutCall } from '@/lib/parasut-client';
import { Layers, Factory, Link2, Unlink, Sparkles, Loader2, Info } from 'lucide-react';

const tl = (v: any) => `${Number(v) < 0 ? '-' : ''}₺${formatMoney(Math.abs(Math.round(Number(v) || 0)))}`;
const pct = (a: number, b: number) => (b ? `%${Math.round((a / b) * 100)}` : '-');
const dt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('tr-TR') : '-');
const n = (v: any) => Number(v) || 0;
const days = (a?: string | null, b?: string | null) => (a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) : 0);
type Tab = 'lines' | 'principals' | 'jobs';

export default function BusinessLinesPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('lines');
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [sup, setSup] = useState<string>('');

  const load = useCallback(async () => { try { setData(await parasutCall('/api/parasut/business-lines')); setErr(null); } catch (e: any) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  const post = async (body: any, ok: string) => {
    setBusy(true); setMsg(null);
    try { await parasutCall('/api/parasut/business-lines', 'POST', body); setMsg(ok); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const v = useMemo(() => {
    if (!data) return null;
    const inYear = (d: any) => year === 'all' || String(d.issue_date || '').startsWith(year);
    const all: any[] = data.documents || [];
    const sales = all.filter(d => d.kind === 'sales_invoice');
    const buys = all.filter(d => d.kind === 'purchase_bill');
    const salesCats = Array.from(new Set(sales.map(d => d.category || 'Kategorisiz')));
    const manual = new Map<string, string>((data.map || []).map((m: any) => [m.purchase_category, m.business_line]));
    // Alış kategorisini iş koluna bağla: elle eşleme > ad benzerliği (ör. "Teknik Servis Alışları" → "Teknik Servis")
    const auto = (cat: string) => {
      const c = normalizeName(cat);
      return salesCats.filter(s => s !== 'Kategorisiz').map(s => ({ s, k: normalizeName(s) })).filter(x => x.k && (c.includes(x.k) || x.k.includes(c))).sort((a, b) => b.k.length - a.k.length)[0]?.s || null;
    };
    const lineOfBuy = (d: any) => { const c = d.category || 'Kategorisiz'; return manual.has(c) ? manual.get(c)! : auto(c); };
    const lineOfSale = (d: any) => d.category || 'Kategorisiz';

    // İş kolu tablosu
    const L = new Map<string, { line: string; sales: number; buys: number; ns: number; nb: number }>();
    const get = (k: string) => L.get(k) || { line: k, sales: 0, buys: 0, ns: 0, nb: 0 };
    sales.filter(inYear).forEach(d => { const g = get(lineOfSale(d)); g.sales += n(d.net_total_try); g.ns++; L.set(g.line, g); });
    const general: any = {}; // iş koluna bağlanmamış alış kategorileri
    buys.filter(inYear).forEach(d => {
      const ln = lineOfBuy(d);
      if (ln) { const g = get(ln); g.buys += n(d.net_total_try); g.nb++; L.set(g.line, g); }
      else { const c = d.category || 'Kategorisiz'; general[c] = (general[c] || 0) + n(d.net_total_try); }
    });
    const lines = Array.from(L.values()).sort((a, b) => b.sales - a.sales);
    const buyCats = Array.from(new Set(buys.map(d => d.category || 'Kategorisiz'))).map(c => ({ cat: c, line: manual.get(c) || null, auto: manual.has(c) ? null : auto(c), total: buys.filter(inYear).filter(d => (d.category || 'Kategorisiz') === c).reduce((a, d) => a + n(d.net_total_try), 0) })).sort((a, b) => b.total - a.total);

    // Ana firmalar (alış yapılan cariler)
    const roleOf = (d: any) => {
      const t = String(d.tax_number || ''); const nm = normalizeName(d.contact_name || '');
      const c = (data.customers || []).find((x: any) => (t && String(x.tax_number || '').replace(/\D/g, '') === t) || normalizeName(x.name) === nm);
      return c ? { id: c.id, roles: c.relation_roles || [] } : null;
    };
    const links: any[] = data.links || [];
    const byBuy = new Map<string, any[]>(); links.forEach(l => byBuy.set(l.purchase_doc_id, [...(byBuy.get(l.purchase_doc_id) || []), l]));
    const linkedSales = new Set(links.map(l => l.sales_doc_id));
    const docById = new Map<string, any>(all.map(d => [d.id, d]));
    const supKey = (d: any) => String(d.tax_number || '') || normalizeName(d.contact_name || '');
    const P = new Map<string, any>();
    buys.filter(inYear).forEach(d => {
      const k = supKey(d); const p = P.get(k) || { key: k, name: d.contact_name || '-', role: roleOf(d), buys: 0, n: 0, linkedBuy: 0, linkedSale: 0, open: 0 };
      p.buys += n(d.net_total_try); p.n++; if (d.payment_status !== 'paid') p.open += Math.abs(n(d.remaining));
      const ls = byBuy.get(d.id) || [];
      if (ls.length) { p.linkedBuy += n(d.net_total_try); p.linkedSale += ls.reduce((a, l) => a + n(docById.get(l.sales_doc_id)?.net_total_try), 0); }
      P.set(k, p);
    });
    const principals = Array.from(P.values()).sort((a, b) => Number(b.role?.roles?.includes('principal')) - Number(a.role?.roles?.includes('principal')) || b.buys - a.buys);

    // Bayi işleri: alış → satış eşleşmesi önerisi
    const jobsBuys = buys.filter(inYear).filter(d => !sup || supKey(d) === sup);
    const used = new Set<string>(linkedSales);
    const suggestions = new Map<string, any>();
    [...jobsBuys].filter(d => !byBuy.has(d.id)).sort((a, b) => String(a.issue_date).localeCompare(String(b.issue_date))).forEach(p => {
      const ln = lineOfBuy(p); if (!ln) return;
      const c = sales.filter(s => !used.has(s.id) && lineOfSale(s) === ln && n(s.net_total_try) > n(p.net_total_try) && days(p.issue_date, s.issue_date) >= -15 && days(p.issue_date, s.issue_date) <= 60)
        .sort((a, b) => Math.abs(days(p.issue_date, a.issue_date)) - Math.abs(days(p.issue_date, b.issue_date)))[0];
      if (c) { used.add(c.id); suggestions.set(p.id, c); }
    });
    const candidates = (p: any) => { const ln = lineOfBuy(p); return sales.filter(s => !linkedSales.has(s.id) && (!ln || lineOfSale(s) === ln) && Math.abs(days(p.issue_date, s.issue_date)) <= 120).slice(0, 40); };

    const openBuys = buys.filter(d => d.payment_status !== 'paid' && Math.abs(n(d.remaining)) >= 0.5);
    return { payable: openBuys.reduce((a, d) => a + Math.abs(n(d.remaining)), 0), payableN: openBuys.length, lines, general, buyCats, salesCats, principals, jobsBuys, byBuy, docById, suggestions, candidates, lineOfBuy, supKey, totalSales: lines.reduce((a, x) => a + x.sales, 0), totalBuys: lines.reduce((a, x) => a + x.buys, 0) };
  }, [data, year, sup]);

  if (err && !data) return <div><Header title="İş Kolları & Bayi İşleri" /><div className="p-6"><Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</Card></div></div>;
  if (!data || !v) return <div><Header title="İş Kolları & Bayi İşleri" /><div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></div></div>;

  const years = Array.from(new Set((data.documents || []).map((d: any) => String(d.issue_date || '').slice(0, 4)).filter(Boolean))).sort().reverse() as string[];
  const gp = v.totalSales - v.totalBuys;

  return (
    <div>
      <Header title="İş Kolları & Bayi İşleri" subtitle="Paraşüt kategorilerine göre iş kolu kârlılığı, ana firmalardan alış ve bayi işi marjı" />
      <div className="space-y-4 p-4 md:p-6">
        {!data.ready && <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Kategori eşlemesi ve alış–satış bağlama için <b>parasut-matris.sql</b> dosyasını Supabase SQL Editor'de çalıştırın.</Card>}
        {err && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</Card>}
        {msg && <Card className="border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</Card>}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-white p-0.5 text-sm">
            {([['lines', 'İş kolu kârlılığı', Layers], ['principals', 'Ana firmalar', Factory], ['jobs', 'Bayi işleri (alış → satış)', Link2]] as const).map(([k, l, I]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><I className="h-3.5 w-3.5" />{l}</button>))}
          </div>
          <select className="ml-auto h-9 rounded-lg border bg-white px-2 text-sm" value={year} onChange={e => setYear(e.target.value)}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}<option value="all">Tüm dönem</option></select>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-4"><p className="text-xs text-slate-500">Satış (KDV hariç)</p><p className="text-xl font-bold text-emerald-700">{tl(v.totalSales)}</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500">İş koluna bağlı alışlar</p><p className="text-xl font-bold text-amber-700">{tl(v.totalBuys)}</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500">Brüt kâr (doğrudan alışlar düşülmüş)</p><p className={`text-xl font-bold ${gp >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>{tl(gp)}</p><p className="text-xs text-slate-400">marj {pct(gp, v.totalSales)} · genel gider sonrası {tl(gp - (Object.values(v.general) as number[]).reduce((a, x) => a + x, 0))}</p></Card>
          <Card className={`p-4 ${v.payable >= 0.5 ? 'border-red-200' : ''}`}><p className="text-xs text-slate-500">Ödeyeceğimiz (açık alış faturaları)</p><p className={`text-xl font-bold ${v.payable >= 0.5 ? 'text-red-600' : 'text-slate-700'}`}>{tl(v.payable)}</p><p className="text-xs text-slate-400">{v.payable >= 0.5 ? `${v.payableN} fatura · firma bazında: Ana firmalar sekmesi` : 'Paraşüt\'te ödenmemiş alış faturası yok'}</p></Card>
        </div>

        {tab === 'lines' && (<>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">İş kolu (Paraşüt satış kategorisi)</th><th className="text-right">Satış</th><th className="text-right">Doğrudan alış</th><th className="text-right">Brüt kâr</th><th className="text-right">Marj</th><th className="px-3 text-right">Pay</th></tr></thead>
              <tbody>{v.lines.map(x => { const g = x.sales - x.buys; return (
                <tr key={x.line} className="border-b">
                  <td className="px-3 py-2 font-medium">{x.line} <span className="text-xs font-normal text-slate-400">{x.ns} satış · {x.nb} alış</span></td>
                  <td className="text-right text-emerald-700">{tl(x.sales)}</td><td className="text-right text-amber-700">{x.buys ? tl(x.buys) : '-'}</td>
                  <td className={`text-right font-semibold ${g >= 0 ? '' : 'text-red-600'}`}>{tl(g)}</td>
                  <td className="text-right">{x.buys ? <Badge variant={x.sales && g / x.sales < 0.15 ? 'warning' : 'success'}>{pct(g, x.sales)}</Badge> : <span className="text-xs text-slate-400">hizmet</span>}</td>
                  <td className="px-3 text-right text-xs text-slate-500">{pct(x.sales, v.totalSales)}</td></tr>); })}</tbody>
            </table>
          </Card>
          <Card className="p-4">
            <p className="text-sm font-semibold">Alış kategorileri hangi iş koluna ait?</p>
            <p className="mb-3 text-xs text-slate-500">Paraşüt'teki gider kategorilerinizi satış kategorilerinize bağlayın; örneğin "Teknik Servis Alışları" → "Teknik Servis". Benzer adlı olanlar otomatik bağlanır. Bağlanmayanlar genel gider sayılır (kira, maaş vb.).</p>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Alış kategorisi</th><th className="text-right">{year === 'all' ? 'Toplam' : year}</th><th className="pl-4">İş kolu</th></tr></thead>
              <tbody>{v.buyCats.map(c => (
                <tr key={c.cat} className="border-t"><td className="py-1.5">{c.cat}</td><td className="text-right">{tl(c.total)}</td>
                  <td className="pl-4"><select className="h-8 w-64 rounded border px-2 text-xs" disabled={busy || !data.ready} value={c.line || ''} onChange={e => post({ action: 'map', purchase_category: c.cat, business_line: e.target.value || null }, 'Kategori eşlemesi kaydedildi.')}>
                    <option value="">{c.auto ? `Otomatik: ${c.auto}` : 'Genel gider (iş koluna bağlı değil)'}</option>
                    {v.salesCats.map(s => <option key={s} value={s}>{s}</option>)}</select></td></tr>))}</tbody>
            </table></div>
          </Card>
        </>)}

        {tab === 'principals' && (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Firma (bize fatura kesen)</th><th>Rol</th><th className="text-right">Alış</th><th className="text-right">Ödenecek</th><th className="text-right">Satışa bağlanan</th><th className="text-right">Bağlı satış</th><th className="text-right">Bayi marjı</th><th className="px-3"></th></tr></thead>
              <tbody>{v.principals.map(p => (
                <tr key={p.key} className="border-b">
                  <td className="px-3 py-2">{p.role ? <Link href={`/customers/${p.role.id}`} className="font-medium text-indigo-700 hover:underline">{p.name}</Link> : p.name}<span className="block text-[10px] text-slate-400">{p.n} fatura</span></td>
                  <td className="text-xs">{p.role?.roles?.length ? p.role.roles.map((r: string) => ({ customer: 'Müşteri', partner: 'İş ortağı', principal: 'Ana firma', supplier: 'Tedarikçi' } as any)[r]).join(', ') : <span className="text-slate-400">tanımsız</span>}</td>
                  <td className="text-right text-amber-700">{tl(p.buys)}</td>
                  <td className={`text-right ${p.open >= 0.5 ? 'font-medium text-red-600' : 'text-slate-400'}`}>{p.open >= 0.5 ? tl(p.open) : '-'}</td>
                  <td className="text-right text-xs">{pct(p.linkedBuy, p.buys)}</td>
                  <td className="text-right">{p.linkedSale ? tl(p.linkedSale) : '-'}</td>
                  <td className="text-right font-semibold">{p.linkedSale ? `${tl(p.linkedSale - p.linkedBuy)} · ${pct(p.linkedSale - p.linkedBuy, p.linkedSale)}` : '-'}</td>
                  <td className="px-3 text-right"><button className="text-xs text-indigo-600 hover:underline" onClick={() => { setSup(p.key); setTab('jobs'); }}>İşleri →</button></td></tr>))}</tbody>
            </table>
            <p className="flex items-start gap-1.5 p-3 text-[11px] text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Bir firmayı "Ana firma" olarak işaretlemek için müşteri kartındaki İlişki rolleri kutusunu kullanın. Bayi marjı, alış faturalarının bağlandığı satış faturalarından hesaplanır.</p>
          </Card>
        )}

        {tab === 'jobs' && (<>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-9 rounded-lg border bg-white px-2 text-sm" value={sup} onChange={e => setSup(e.target.value)}>
              <option value="">Tüm firmalar</option>{v.principals.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select>
            {v.suggestions.size > 0 && data.ready && (
              <Button size="sm" className="ml-auto" disabled={busy} onClick={() => post({ action: 'link', pairs: Array.from(v.suggestions.entries()).map(([p, s]) => ({ purchase_doc_id: p, sales_doc_id: s.id })) }, `${v.suggestions.size} alış satışa bağlandı.`)}>
                <Sparkles className="mr-1 h-3.5 w-3.5" />{v.suggestions.size} öneriyi onayla</Button>)}
          </div>
          <Card className="overflow-x-auto p-0">
            {v.jobsBuys.length === 0 ? <p className="p-4 text-sm text-slate-500">Bu dönemde alış faturası yok.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Alış (ana firmadan)</th><th className="text-right">Alış tutarı</th><th className="pl-4">Müşteriye kesilen satış</th><th className="text-right">Satış</th><th className="px-3 text-right">Marj</th></tr></thead>
              <tbody>{v.jobsBuys.map(p => {
                const ls = v.byBuy.get(p.id) || []; const ss = ls.map((l: any) => v.docById.get(l.sales_doc_id)).filter(Boolean);
                const sale = ss.reduce((a: number, s: any) => a + n(s.net_total_try), 0); const sg = v.suggestions.get(p.id);
                return (
                  <tr key={p.id} className="border-b align-top">
                    <td className="px-3 py-2"><span className="font-mono text-xs">{p.doc_no || '-'}</span> <span className="text-xs text-slate-400">{dt(p.issue_date)}</span><span className="block text-xs">{p.contact_name} · <span className="text-slate-500">{p.category || 'Kategorisiz'}{v.lineOfBuy(p) && v.lineOfBuy(p) !== p.category ? ` → ${v.lineOfBuy(p)}` : ''}</span></span></td>
                    <td className="py-2 text-right text-amber-700">{tl(p.net_total_try)}</td>
                    <td className="py-2 pl-4 text-xs">
                      {ss.length ? ss.map((s: any, i: number) => (
                        <p key={s.id} className="flex items-center gap-1"><span className="font-mono">{s.doc_no}</span> · {s.contact_name} <span className="text-slate-400">{dt(s.issue_date)}</span>
                          {data.ready && <button title="Bağlantıyı kaldır" className="text-slate-300 hover:text-red-600" disabled={busy} onClick={() => post({ action: 'unlink', link_ids: [ls[i].id] }, 'Bağlantı kaldırıldı.')}><Unlink className="h-3.5 w-3.5" /></button>}</p>))
                      : sg ? (
                        <p className="text-indigo-700"><Sparkles className="mr-1 inline h-3 w-3" />Öneri: <span className="font-mono">{sg.doc_no}</span> · {sg.contact_name} · {tl(sg.net_total_try)} <span className="text-slate-400">({days(p.issue_date, sg.issue_date) >= 0 ? '+' : ''}{days(p.issue_date, sg.issue_date)} gün)</span>
                          {data.ready && <button className="ml-2 font-medium underline" disabled={busy} onClick={() => post({ action: 'link', pairs: [{ purchase_doc_id: p.id, sales_doc_id: sg.id }] }, 'Bağlandı.')}>Bağla</button>}</p>
                      ) : data.ready ? (
                        <select className="h-8 w-72 rounded border px-2" defaultValue="" disabled={busy} onChange={e => e.target.value && post({ action: 'link', pairs: [{ purchase_doc_id: p.id, sales_doc_id: e.target.value }] }, 'Bağlandı.')}>
                          <option value="">Satış faturası seçin…</option>{v.candidates(p).map((s: any) => <option key={s.id} value={s.id}>{s.doc_no} · {s.contact_name} · {dt(s.issue_date)} · {tl(s.net_total_try)}</option>)}</select>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-2 text-right">{sale ? tl(sale) : '-'}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${sale && sale - n(p.net_total_try) < 0 ? 'text-red-600' : ''}`}>{sale ? `${tl(sale - n(p.net_total_try))} · ${pct(sale - n(p.net_total_try), sale)}` : '-'}</td></tr>);
              })}</tbody>
            </table>)}
          </Card>
          <p className="flex items-start gap-1.5 text-[11px] text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Öneri: aynı iş kolundan, alıştan 15 gün önce ile 60 gün sonrası arasında kesilmiş, tutarı alıştan yüksek ve henüz bağlanmamış satış faturası. Bir alışa birden fazla satış bağlanabilir.</p>
        </>)}
      </div>
    </div>
  );
}
