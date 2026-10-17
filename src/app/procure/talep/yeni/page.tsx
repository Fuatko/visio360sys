'use client';

// Yeni satınalma talebi — mobil öncelikli, tek sütun, 1 dakikada dolar
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Card } from '@/components/ui';
import MoneyInput from '@/components/MoneyInput';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { fetchAll } from '@/lib/fetch-all';
import { Category, CostCenter, PROCURE_SQL_1A, UNITS, procError, tl, uploadProcFile } from '@/lib/procure';
import { Camera, Paperclip, Plus, Send, Trash2, X } from 'lucide-react';

type Line = { description: string; quantity: number | null; unit: string; total: number | null; product_id: string | null };
const emptyLine = (): Line => ({ description: '', quantity: 1, unit: 'Adet', total: null, product_id: null });
const big = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#1B3A5C]';

export default function NewRequestPage() {
  return (
    <div>
      <Header title="Yeni Talep" subtitle="Satınalma" />
      <ProcureGate>{p => (p.hasRole('requester') || p.hasRole('buyer') || p.isAdmin)
        ? <RequestForm />
        : <div className="p-6"><Card className="p-6 text-center text-sm text-slate-600">Talep açmak için "Talep eden" rolü gerekir. Satınalma yöneticinizle görüşün.</Card></div>}
      </ProcureGate>
    </div>
  );
}

function RequestForm() {
  const supabase = createClient();
  const router = useRouter();
  const { user } = useAuth();
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [neededBy, setNeededBy] = useState('');
  const [why, setWhy] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [cc, setCc] = useState('');
  const [cat, setCat] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [ccs, setCcs] = useState<CostCenter[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; unit: string | null }[]>([]);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Birim ve kategori kullanıcıdan otomatik gelir (atandığı birim / yönettiği birim, son talebinin kategorisi)
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [c1, c2, me, mine, last] = await Promise.all([
        supabase.from('proc_cost_centers').select('*').eq('is_active', true).order('sort').order('name'),
        supabase.from('proc_categories').select('*').eq('is_active', true).order('sort').order('name'),
        supabase.from('proc_members').select('cost_center_ids').eq('user_id', user.id).maybeSingle(),
        supabase.rpc('proc_my_cost_centers'),
        supabase.from('proc_requests').select('cost_center_id, category_id').eq('requester_id', user.id).order('created_at', { ascending: false }).limit(1),
      ]);
      if (last.error && /relation|does not exist/i.test(last.error.message)) { setMissing(true); return; }
      setCcs(c1.data || []); setCats(c2.data || []);
      const assigned: string[] = me.data?.cost_center_ids || [];
      const managed: string[] = Array.isArray(mine.data) ? mine.data : [];
      setCc(last.data?.[0]?.cost_center_id || assigned[0] || managed[0] || '');
      setCat(last.data?.[0]?.category_id || '');
      const prods = await fetchAll(() => supabase.from('products').select('id, name, unit').order('name'));
      setProducts(prods);
    })();
  }, [user?.id]);

  const total = useMemo(() => lines.reduce((a, l) => a + (l.total || 0), 0), [lines]);
  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const pickProduct = (i: number, text: string) => {
    const p = products.find(x => x.name.toLocaleLowerCase('tr') === text.toLocaleLowerCase('tr'));
    setLine(i, { description: text, product_id: p?.id || null, ...(p?.unit ? { unit: p.unit } : {}) });
  };

  const save = async (submit: boolean) => {
    setErr('');
    const valid = lines.filter(l => l.description.trim());
    if (!valid.length) { setErr('Ne lazım olduğunu yazın.'); return; }
    if (valid.some(l => !l.quantity || l.quantity <= 0)) { setErr('Adet sıfırdan büyük olmalı.'); return; }
    if (submit && !cc) { setErr('Birim seçin.'); return; }
    setBusy(true);
    try {
      const first = valid[0];
      const title = `${first.quantity} ${first.unit.toLocaleLowerCase('tr')} ${first.description.trim()}${valid.length > 1 ? ` +${valid.length - 1} kalem` : ''}`.slice(0, 200);
      const { data: req, error } = await supabase.from('proc_requests').insert({
        title, justification: why.trim() || null, needed_by: neededBy || null, priority: urgent ? 'urgent' : 'normal',
        cost_center_id: cc || null, category_id: cat || null,
      }).select('id').single();
      if (error) throw error;
      const ins = await supabase.from('proc_request_lines').insert(valid.map((l, i) => ({
        request_id: req.id, description: l.description.trim(), quantity: l.quantity, unit: l.unit, product_id: l.product_id,
        est_unit_price: l.total != null && l.quantity ? Math.round((l.total / l.quantity) * 100) / 100 : null, sort: i,
      })));
      if (ins.error) throw ins.error;
      for (const f of files) await uploadProcFile(supabase, f, `request/${req.id}`, { type: 'request', id: req.id });
      if (submit) {
        const s = await supabase.rpc('proc_request_submit', { p_id: req.id });
        if (s.error) { router.push(`/procure/talepler/${req.id}?hata=${encodeURIComponent(s.error.message)}`); return; }
      }
      router.push(`/procure/talepler/${req.id}`);
    } catch (e: any) {
      setErr(procError(e)); setBusy(false);
    }
  };

  if (missing) return <div className="p-4"><SqlMissingCard file={PROCURE_SQL_1A} /></div>;
  return (
    <div className="mx-auto max-w-xl space-y-3 p-3 pb-28 sm:p-6">
      {lines.map((l, i) => (
        <Card key={i} className="space-y-2 p-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-800">{lines.length > 1 ? `${i + 1}. kalem — ne lazım?` : 'Ne lazım?'}</label>
            {lines.length > 1 && <button onClick={() => setLines(ls => ls.filter((_, k) => k !== i))} className="rounded p-1 text-slate-400 hover:text-rose-600" aria-label="Kalemi sil"><Trash2 className="h-4 w-4" /></button>}
          </div>
          <input className={big} list="proc-products" value={l.description} onChange={e => pickProduct(i, e.target.value)} placeholder="Örn. mikroskop lamı" autoFocus={i === 0} />
          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <input className={big} type="number" inputMode="decimal" min={0} value={l.quantity ?? ''} onChange={e => setLine(i, { quantity: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Adet" />
            <select className={big} value={l.unit} onChange={e => setLine(i, { unit: e.target.value })}>{[...new Set([l.unit, ...UNITS])].map(u => <option key={u}>{u}</option>)}</select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">₺</span>
            <MoneyInput className={big} value={l.total} onChange={v => setLine(i, { total: v })} placeholder="Tahmini tutar (bilmiyorsanız boş bırakın)" />
          </div>
        </Card>
      ))}
      <datalist id="proc-products">{products.slice(0, 500).map(p => <option key={p.id} value={p.name} />)}</datalist>
      <button onClick={() => setLines(ls => [...ls, emptyLine()])} className="flex h-11 w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:bg-white"><Plus className="h-4 w-4" />Kalem ekle</button>

      <Card className="space-y-3 p-3">
        <label className="block text-sm font-semibold text-slate-800">Ne zamana?
          <input type="date" className={`${big} mt-1`} value={neededBy} onChange={e => setNeededBy(e.target.value)} />
        </label>
        <label className="block text-sm font-semibold text-slate-800">Neden?
          <textarea className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[15px] outline-none focus:border-[#1B3A5C]" rows={2} value={why} onChange={e => setWhy(e.target.value)} placeholder="Örn. 9. sınıf biyoloji deneyi için" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4" checked={urgent} onChange={e => setUrgent(e.target.checked)} />Acil</label>
      </Card>

      <Card className="space-y-2 p-3">
        <p className="text-sm font-semibold text-slate-800">Fotoğraf / ek</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => camRef.current?.click()} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"><Camera className="h-4 w-4" />Fotoğraf çek</button>
          <button onClick={() => fileRef.current?.click()} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"><Paperclip className="h-4 w-4" />Dosya seç</button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setFiles(x => [...x, f]); }} />
        <input ref={fileRef} type="file" multiple className="hidden" onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; setFiles(x => [...x, ...fs]); }} />
        {files.map((f, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate">{f.name}</span>
            <button onClick={() => setFiles(x => x.filter((_, k) => k !== i))} aria-label="Kaldır"><X className="h-3.5 w-3.5 text-slate-400" /></button>
          </div>
        ))}
      </Card>

      <Card className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">Birim
          <select className={`${big} mt-1`} value={cc} onChange={e => setCc(e.target.value)}>
            <option value="">— seçin</option>
            {ccs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Kategori
          <select className={`${big} mt-1`} value={cat} onChange={e => setCat(e.target.value)}>
            <option value="">— bilmiyorum</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </Card>

      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:left-56">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <div className="min-w-0 flex-1 text-xs text-slate-500">{total > 0 ? <>Tahmini <b className="text-slate-800">{tl(total)}</b> (KDV hariç)</> : 'Tutar boşsa satınalma fiyatlandırır'}</div>
          <button disabled={busy} onClick={() => save(false)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 disabled:opacity-50">Taslak</button>
          <button disabled={busy} onClick={() => save(true)} className="flex h-11 items-center gap-1.5 rounded-xl bg-[#1B3A5C] px-5 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{busy ? 'Gönderiliyor…' : 'Gönder'}</button>
        </div>
      </div>
    </div>
  );
}
