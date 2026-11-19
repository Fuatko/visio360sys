'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, X, History, Star, Package } from 'lucide-react';

export interface PickerProduct { id: string; name: string; price: number; currency?: string; unit?: string; code?: string; category?: string; description?: string }

const UNCAT = 'Kategorisiz';
const norm = (s: any) => String(s || '').toLocaleLowerCase('tr')
  .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const money = (v: number, cur?: string) => `${({ USD: '$', EUR: '€', GBP: '£' } as any)[cur || ''] || '₺'}${(Number(v) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

// Kullanım istatistiği (sayfa açıkken bir kez yüklenir)
let usageCache: Promise<{ all: Record<string, number>; byCustomer: Record<string, Record<string, number>> }> | null = null;
const loadUsage = (supabase: any) => {
  if (!usageCache) usageCache = (async () => {
    const { data } = await supabase.from('quote_items').select('product_id, quote:quote_id(customer_id, created_at)').not('product_id', 'is', null).limit(3000);
    const all: Record<string, number> = {}; const byCustomer: Record<string, Record<string, number>> = {};
    (data || []).forEach((r: any) => {
      all[r.product_id] = (all[r.product_id] || 0) + 1;
      const c = r.quote?.customer_id; if (c) { byCustomer[c] = byCustomer[c] || {}; byCustomer[c][r.product_id] = (byCustomer[c][r.product_id] || 0) + 1; }
    });
    return { all, byCustomer };
  })().catch(() => ({ all: {}, byCustomer: {} }));
  return usageCache;
};

/** Teklif kalemi için ürün seçici: arama + kategori + bu müşterinin aldıkları + sık kullanılanlar, klavye ile */
export default function ProductPicker({ supabase, products, value, onChange, customerId }: {
  supabase: any; products: PickerProduct[]; value: string; onChange: (id: string) => void; customerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const [active, setActive] = useState(0);
  const [usage, setUsage] = useState<{ all: Record<string, number>; byCustomer: Record<string, Record<string, number>> }>({ all: {}, byCustomer: {} });
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const selected = products.find(p => p.id === value);

  useEffect(() => { if (open) { loadUsage(supabase).then(setUsage); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { const t = e.target as Node; if (!boxRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, [open]);
  // Açılır pencere modalın kaydırma alanında kesilmesin: sayfaya sabit konumlanır
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect(); if (!r) return;
      const width = Math.min(720, window.innerWidth - 16);
      const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
      const up = below < 320 && above > below;
      const maxH = Math.max(240, Math.min(520, up ? above : below));
      setPos({ top: up ? r.top - maxH - 4 : r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width, maxH });
    };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  const index = useMemo(() => products.map(p => ({ p, key: norm([p.name, p.code, p.category, p.description].join(' ')), cat: (p.category || '').trim() || UNCAT })), [products]);
  const cats = useMemo(() => {
    const m: Record<string, number> = {}; index.forEach(x => { m[x.cat] = (m[x.cat] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0] === UNCAT ? 1 : b[0] === UNCAT ? -1 : a[0].localeCompare(b[0], 'tr'));
  }, [index]);

  const tokens = norm(q).split(' ').filter(Boolean);
  const textHits = index.filter(x => tokens.every(t => x.key.includes(t)));
  const hitCount: Record<string, number> = {}; textHits.forEach(x => { hitCount[x.cat] = (hitCount[x.cat] || 0) + 1; });
  const matches = textHits.filter(x => !cat || x.cat === cat);
  const custUse = (customerId && usage.byCustomer[customerId]) || {};
  const score = (id: string) => (custUse[id] || 0) * 100 + (usage.all[id] || 0);

  // Gösterim: arama/kategori yokken önce "bu müşterinin aldıkları" ve "sık kullanılanlar", sonra kategoriler
  const sections: { title: string; icon?: 'cust' | 'freq'; items: PickerProduct[] }[] = [];
  if (!tokens.length && !cat) {
    const mine = index.filter(x => custUse[x.p.id]).sort((a, b) => custUse[b.p.id] - custUse[a.p.id]).slice(0, 6).map(x => x.p);
    const mineIds = new Set(mine.map(p => p.id));
    const freq = index.filter(x => usage.all[x.p.id] && !mineIds.has(x.p.id)).sort((a, b) => usage.all[b.p.id] - usage.all[a.p.id]).slice(0, 6).map(x => x.p);
    if (mine.length) sections.push({ title: 'Bu müşterinin daha önce aldıkları', icon: 'cust', items: mine });
    if (freq.length) sections.push({ title: 'Sık kullanılanlar', icon: 'freq', items: freq });
  }
  const grouped: Record<string, PickerProduct[]> = {};
  [...matches].sort((a, b) => (tokens.length ? score(b.p.id) - score(a.p.id) : 0) || a.p.name.localeCompare(b.p.name, 'tr')).forEach(x => { (grouped[x.cat] = grouped[x.cat] || []).push(x.p); });
  cats.forEach(([c]) => { if (grouped[c]) sections.push({ title: c, items: grouped[c] }); });
  const flat = sections.flatMap(s => s.items);

  useEffect(() => { setActive(0); }, [q, cat]);
  useEffect(() => { listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const pick = (id: string) => { onChange(id); setOpen(false); setQ(''); setCat(''); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[active]) pick(flat[active].id); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  let i = -1;
  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-slate-300">
        {selected ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-slate-800">{selected.name}</span>
            <span className="block truncate text-[11px] text-slate-500">{[selected.code, selected.category, money(selected.price, selected.currency)].filter(Boolean).join(' · ')}</span>
          </span>
        ) : <span className="flex-1 text-slate-400">Ürün / hizmet seçin ({products.length})</span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div ref={popRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, height: pos.maxH }} className="z-[100] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" onKeyDown={onKey}>
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Ad, kod, kategori ile arayın… (↑↓ seç, Enter ekle, Esc kapat)"
              className="h-8 flex-1 bg-transparent text-sm outline-none" />
            <select value={cat} onChange={e => setCat(e.target.value)} className="h-8 max-w-[40%] rounded border px-1 text-xs sm:hidden">
              <option value="">Tüm kategoriler</option>{cats.map(([c]) => <option key={c} value={c}>{c}</option>)}
            </select>
            {(q || cat) && <button type="button" onClick={() => { setQ(''); setCat(''); }} className="text-xs text-slate-500 hover:text-slate-700">Temizle</button>}
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex min-h-0 flex-1">
            {/* Kategoriler */}
            <div className="hidden w-48 shrink-0 overflow-y-auto border-r bg-slate-50/70 py-1 text-sm sm:block">
              <button type="button" onClick={() => setCat('')} className={`flex w-full items-center px-3 py-1.5 text-left ${!cat ? 'bg-white font-semibold text-indigo-700' : 'text-slate-600 hover:bg-white'}`}>
                <span className="flex-1">Tümü</span><span className="text-[11px] text-slate-400">{tokens.length ? textHits.length : products.length}</span></button>
              {cats.map(([c, nCount]) => { const shown = tokens.length ? (hitCount[c] || 0) : nCount; return (
                <button type="button" key={c} onClick={() => setCat(c)} className={`flex w-full items-center gap-1 px-3 py-1.5 text-left ${cat === c ? 'bg-white font-semibold text-indigo-700' : shown ? 'text-slate-600 hover:bg-white' : 'text-slate-300 hover:bg-white'}`}>
                  <span className="min-w-0 flex-1 truncate" title={c}>{c}</span><span className="text-[11px] text-slate-400">{shown}</span></button>); })}
            </div>
            {/* Sonuçlar */}
            <div ref={listRef} className="min-w-0 flex-1 overflow-y-auto py-1">
              {flat.length === 0 && <p className="p-6 text-center text-sm text-slate-500">"{q}" için ürün bulunamadı.</p>}
              {sections.map(sec => (
                <div key={sec.title}>
                  <p className="sticky top-0 z-10 flex items-center gap-1 bg-white/95 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {sec.icon === 'cust' ? <History className="h-3 w-3" /> : sec.icon === 'freq' ? <Star className="h-3 w-3" /> : <Package className="h-3 w-3" />}{sec.title}
                    {!sec.icon && <span className="font-normal normal-case">({sec.items.length})</span>}
                  </p>
                  {sec.items.map(p => { i++; const my = i; return (
                    <button type="button" key={sec.title + p.id} data-i={my} onMouseEnter={() => setActive(my)} onClick={() => pick(p.id)}
                      className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm ${active === my ? 'bg-indigo-50' : ''} ${p.id === value ? 'font-semibold' : ''}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-slate-800">{p.name}</span>
                        {(p.code || p.description) && <span className="block truncate text-[11px] text-slate-500">{[p.code, p.description].filter(Boolean).join(' · ')}</span>}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm text-slate-800">{money(p.price, p.currency)}</span>
                        {p.unit && <span className="block text-[10px] text-slate-400">/ {p.unit}</span>}
                      </span>
                    </button>); })}
                </div>
              ))}
            </div>
          </div>
          <p className="border-t bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">{matches.length} kalem{cat ? ` · ${cat}` : ''}{customerId && Object.keys(custUse).length ? ' · Bu müşterinin daha önce aldıkları üstte' : ''}</p>
        </div>, document.body)}
    </div>
  );
}
