'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePortal, PortalTitle, Catalog } from '@/components/portal/PortalShell';
import { formatMoney } from '@/lib/utils';
import { resolveDealerPrice, PAYMENT_TERMS, termLabel } from '@/lib/dealer-pricing';
import { n } from '@/lib/portal';
import { Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle, AlertTriangle, Info } from 'lucide-react';

const tl = (v: number) => `₺${formatMoney(v)}`;
const r2 = (v: number) => Math.round(v * 100) / 100;

export default function PortalOrderPage() {
  const { supabase, me, loadCatalog } = usePortal();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const maxTerm = me.dealer.payment_term_days;
  const [term, setTerm] = useState<number>(maxTerm ?? 30);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [deals, setDeals] = useState<any[]>([]);
  const [dealId, setDealId] = useState('');
  const [notes, setNotes] = useState('');
  const [address, setAddress] = useState('');
  const [delivery, setDelivery] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    loadCatalog().then(setCatalog).catch(e => setErr(e.message));
    try {
      const re = sessionStorage.getItem('portal_reorder');
      if (re) { setCart(JSON.parse(re)); sessionStorage.removeItem('portal_reorder'); }
    } catch { /* yok say */ }
    supabase.from('deal_registrations').select('id, project_name, end_customer_name, approved_discount_pct, protection_until')
      .eq('status', 'approved').then(({ data }: any) => setDeals(data || []));
  }, []);

  const terms = PAYMENT_TERMS.filter(t => maxTerm === null || maxTerm === undefined || t.days <= maxTerm);
  if (maxTerm !== null && maxTerm !== undefined && !terms.some(t => t.days === maxTerm)) terms.push({ days: maxTerm, label: `${maxTerm} gün` });

  const dealer = { id: me.dealer.id, dealer_level: me.dealer.dealer_level, price_list_id: me.dealer.price_list_id, base_discount: me.dealer.base_discount };
  const deal = deals.find(d => d.id === dealId);

  const priceOf = (productId: string, qty: number, t: number) => {
    const p = catalog!.products.find(x => x.id === productId)!;
    const res = resolveDealerPrice({ dealer, product: { ...p, price: n(p.price), tax_rate: n(p.tax_rate ?? 20) }, quantity: Math.max(qty, 1), termDays: t, priceListItems: catalog!.price_list_items, rules: catalog!.rules });
    const disc = deal && n(deal.approved_discount_pct) > res.discountPct ? n(deal.approved_discount_pct) : res.discountPct;
    return { list: res.listPrice, disc, net: r2(res.listPrice * (1 - disc / 100)), tax: n(p.tax_rate ?? 20) };
  };

  const categories = useMemo(() => Array.from(new Set((catalog?.products || []).map(p => p.category).filter(Boolean))) as string[], [catalog]);
  const visible = (catalog?.products || []).filter(p => (!cat || p.category === cat) &&
    (!search || `${p.name} ${p.code || ''} ${p.category || ''}`.toLowerCase().includes(search.toLowerCase())));

  const lines = catalog ? Object.entries(cart).filter(([id, q]) => q > 0 && catalog.products.some(p => p.id === id)).map(([id, q]) => {
    const p = catalog.products.find(x => x.id === id)!;
    const pr = priceOf(id, q, term);
    const line = r2(q * pr.list * (1 - pr.disc / 100));
    return { id, name: p.name, unit: p.unit, q, ...pr, line, taxAmt: r2(line * pr.tax / 100) };
  }) : [];
  const sub = r2(lines.reduce((s, l) => s + l.line, 0));
  const tax = r2(lines.reduce((s, l) => s + l.taxAmt, 0));
  const total = r2(sub + tax);
  // Peşin ödeme karşılaştırması
  const cashSub = catalog && term > 0 ? r2(lines.reduce((s, l) => s + (() => { const c = priceOf(l.id, l.q, 0); return r2(l.q * c.list * (1 - c.disc / 100)); })(), 0)) : sub;
  const available = me.dealer.credit_limit !== null && me.dealer.credit_limit !== undefined ? n(me.dealer.credit_limit) - n(me.open_balance) : null;

  const setQty = (id: string, q: number) => setCart(c => ({ ...c, [id]: Math.max(0, Math.round(q * 100) / 100) }));

  const submit = async () => {
    if (!lines.length) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('portal_place_order', {
      p_items: lines.map(l => ({ product_id: l.id, quantity: l.q })),
      p_term: term, p_notes: notes || null, p_shipping_address: address || null,
      p_delivery_date: delivery || null, p_deal_id: dealId || null,
    });
    setBusy(false);
    if (error) { alert('Sipariş verilemedi: ' + error.message); return; }
    setResult(data); setCart({}); setNotes(''); setDealId('');
  };

  if (err) return <p className="text-sm text-red-600">Katalog yüklenemedi: {err}</p>;
  if (!catalog) return <p className="text-sm text-slate-500">Katalog yükleniyor…</p>;

  if (result) {
    return (
      <div className="mx-auto max-w-lg rounded-xl bg-white p-6 text-center shadow-sm">
        <CheckCircle className="mx-auto mb-2 h-12 w-12 text-green-500" />
        <h1 className="text-lg font-semibold">Siparişiniz alındı</h1>
        <p className="text-sm text-slate-600">Sipariş no: <b>{result.order_number}</b> · Toplam {tl(n(result.total))}</p>
        {result.credit_exceeded && <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800">Kredi limitiniz aşıldığı için sipariş finans onayına düştü.</p>}
        <p className="mt-2 text-xs text-slate-500">Onaylandığında durumunu Siparişlerim sayfasından takip edebilirsiniz.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/portal/siparisler" className="rounded-lg bg-indigo-700 px-4 py-2 text-sm text-white">Siparişlerim</Link>
          <button onClick={() => setResult(null)} className="rounded-lg border px-4 py-2 text-sm">Yeni sipariş</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PortalTitle title="Sipariş Ver" subtitle="Fiyatlar size tanımlı liste, iskonto ve seçtiğiniz vadeye göre hesaplanır." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ürün, kod, kategori ara" className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-2 text-sm" />
            </div>
            <select value={cat} onChange={e => setCat(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
              <option value="">Tüm kategoriler</option>{categories.map(c => <option key={c}>{c}</option>)}
            </select>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-slate-500">Ödeme vadesi</span>
              <select value={term} onChange={e => setTerm(Number(e.target.value))} className="h-9 rounded-lg border border-indigo-300 bg-indigo-50 px-2 font-medium text-indigo-800">
                {terms.sort((a, b) => a.days - b.days).map(t => <option key={t.days} value={t.days}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {visible.map(p => {
              const q = cart[p.id] || 0;
              const pr = priceOf(p.id, q || 1, term);
              const cash = term > 0 ? priceOf(p.id, q || 1, 0) : null;
              return (
                <div key={p.id} className={`rounded-xl border bg-white p-3 ${q ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'}`}>
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="text-xs text-slate-400">{[p.code, p.category].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-indigo-700">{tl(pr.net)}</p>
                      {pr.disc > 0 && <p className="text-[11px] text-slate-400"><s>{tl(pr.list)}</s> %{pr.disc}</p>}
                    </div>
                  </div>
                  {cash && cash.net < pr.net && <p className="mt-1 text-[11px] text-green-700">Peşin: {tl(cash.net)} (%{cash.disc} iskonto)</p>}
                  <div className="mt-2 flex items-center gap-1">
                    <button onClick={() => setQty(p.id, q - 1)} className="rounded border p-1 hover:bg-slate-50"><Minus className="h-3 w-3" /></button>
                    <input type="number" value={q || ''} placeholder="0" onChange={e => setQty(p.id, parseFloat(e.target.value) || 0)} className="h-7 w-16 rounded border text-center text-sm" />
                    <button onClick={() => setQty(p.id, q + 1)} className="rounded border p-1 hover:bg-slate-50"><Plus className="h-3 w-3" /></button>
                    <span className="ml-1 text-xs text-slate-400">{p.unit || 'adet'} · KDV %{pr.tax}</span>
                  </div>
                </div>
              );
            })}
            {visible.length === 0 && <p className="text-sm text-slate-500">Ürün bulunamadı.</p>}
          </div>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 flex items-center gap-2 font-semibold"><ShoppingCart className="h-4 w-4" />Sepet</h2>
            {lines.length === 0 ? <p className="text-sm text-slate-500">Ürün ekleyin.</p> : (
              <div className="space-y-2">
                {lines.map(l => (
                  <div key={l.id} className="flex items-start justify-between gap-2 border-b pb-2 text-sm">
                    <div className="min-w-0"><p className="truncate">{l.name}</p><p className="text-xs text-slate-400">{l.q} × {tl(l.net)}{l.disc > 0 ? ` (%${l.disc})` : ''}</p></div>
                    <div className="flex items-center gap-1"><span>{tl(l.line)}</span><button onClick={() => setQty(l.id, 0)}><Trash2 className="h-3 w-3 text-red-400" /></button></div>
                  </div>
                ))}
                <div className="space-y-0.5 text-sm">
                  <div className="flex justify-between"><span>Ara toplam</span><span>{tl(sub)}</span></div>
                  <div className="flex justify-between text-slate-500"><span>KDV</span><span>{tl(tax)}</span></div>
                  <div className="flex justify-between text-base font-bold"><span>Toplam</span><span>{tl(total)}</span></div>
                  <p className="text-xs text-slate-500">Vade: {termLabel(term)}</p>
                </div>
                {term > 0 && cashSub < sub && (
                  <p className="flex gap-1 rounded bg-green-50 p-2 text-xs text-green-800"><Info className="h-3 w-3 shrink-0" />Peşin öderseniz KDV hariç {tl(sub - cashSub)} daha az ödersiniz.</p>
                )}
                {available !== null && total > available && (
                  <p className="flex gap-1 rounded bg-amber-50 p-2 text-xs text-amber-800"><AlertTriangle className="h-3 w-3 shrink-0" />Kullanılabilir krediniz ({tl(available)}) aşılıyor; sipariş finans onayına düşer.</p>
                )}
              </div>
            )}
            <div className="mt-3 space-y-2">
              {deals.length > 0 && (
                <select value={dealId} onChange={e => setDealId(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm">
                  <option value="">Onaylı fırsat kaydı ile ilişkilendir (isteğe bağlı)</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.project_name} – {d.end_customer_name} (%{n(d.approved_discount_pct)})</option>)}
                </select>
              )}
              <input type="date" value={delivery} onChange={e => setDelivery(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" title="İstenen teslim tarihi" />
              <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} placeholder="Teslimat adresi (boşsa kayıtlı adres)" className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Sipariş notu" className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              <button disabled={!lines.length || busy} onClick={submit} className="w-full rounded-lg bg-indigo-700 py-2.5 font-medium text-white hover:bg-indigo-800 disabled:opacity-50">
                {busy ? 'Gönderiliyor…' : 'Siparişi gönder'}
              </button>
              <p className="text-[11px] text-slate-400">Nihai fiyat sistem tarafından aynı kurallarla yeniden hesaplanır.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
