'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Button, Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { parasutCall } from '@/lib/parasut-client';
import { ROLES } from '@/components/customer/RelationRoles';
import { Loader2, Download, CheckCircle2, Info, Search } from 'lucide-react';

const tl = (v: any) => `₺${formatMoney(Math.round(Number(v) || 0))}`;
const dt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('tr-TR') : '-');
type Pick = { on: boolean; roles: string[]; status: string };
type Filter = 'suggested' | 'active' | 'all' | 'expense';

export default function ParasutImportPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [filter, setFilter] = useState<Filter>('suggested');
  const [q, setQ] = useState('');

  const load = async () => {
    setErr(null);
    try {
      const r = await parasutCall('/api/parasut/import');
      setData(r);
      const p: Record<string, Pick> = {};
      r.rows.forEach((x: any) => { p[x.id] = { on: x.suggest.import, roles: x.suggest.roles, status: x.suggest.status }; });
      setPicks(p);
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.toLocaleLowerCase('tr');
    return data.rows.filter((r: any) => {
      if (s && !String(r.name).toLocaleLowerCase('tr').includes(s) && !String(r.tax_number || '').includes(s)) return false;
      if (filter === 'suggested') return r.suggest.import;
      if (filter === 'active') return r.activity.ns + r.activity.nb > 0;
      if (filter === 'expense') return !r.suggest.import && r.activity.nb > 0;
      return true;
    });
  }, [data, filter, q]);

  const set = (id: string, patch: Partial<Pick>) => setPicks(p => ({ ...p, [id]: { ...p[id], ...patch } }));
  const toggleRole = (id: string, k: string) => { const cur = picks[id]?.roles || []; set(id, { roles: cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k], on: true }); };
  const selected = data ? data.rows.filter((r: any) => picks[r.id]?.on) : [];

  const run = async () => {
    if (!selected.length) return;
    if (!confirm(`${selected.length} cari aktarılsın mı?\n\n• Yazılımda olmayanlar için müşteri kartı açılır\n• Var olan kartlarda yalnızca boş alanlar doldurulur, roller eklenir\n• "Ana firma" seçilenler Ana Firmalarım'a da eklenir\n• Satış faturaları kartlara bağlanır\n\nParaşüt'te hiçbir şey değişmez.`)) return;
    setBusy(true); setErr(null);
    try {
      const items = selected.map((r: any) => ({ contact: r, roles: picks[r.id].roles, status: picks[r.id].status, existing_id: r.existing?.id || null, supplier_id: r.supplier?.id || null }));
      let agg = { created: 0, updated: 0, principals: 0, linked: 0, errors: [] as string[] };
      for (let i = 0; i < items.length; i += 40) {
        const r = await parasutCall('/api/parasut/import', 'POST', { items: items.slice(i, i + 40), assigned_to: owner || null });
        agg = { created: agg.created + r.created, updated: agg.updated + r.updated, principals: agg.principals + r.principals, linked: agg.linked + r.linked, errors: [...agg.errors, ...(r.errors || [])] };
      }
      setDone(agg); await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (err && !data) return <div><Header title="Paraşüt'ten aktar" /><div className="p-6"><Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</Card></div></div>;
  if (!data) return <div><Header title="Paraşüt'ten aktar" /><div className="flex h-96 flex-col items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-8 w-8 animate-spin text-slate-300" />Paraşüt carileri okunuyor…</div></div>;

  const counts = {
    suggested: data.rows.filter((r: any) => r.suggest.import).length,
    active: data.rows.filter((r: any) => r.activity.ns + r.activity.nb > 0).length,
    expense: data.rows.filter((r: any) => !r.suggest.import && r.activity.nb > 0).length,
    all: data.rows.length,
  };
  const sel = { n: selected.length, newN: selected.filter((r: any) => !r.existing).length, prin: selected.filter((r: any) => picks[r.id].roles.includes('principal')).length };

  return (
    <div>
      <Header title="Paraşüt'ten aktar" subtitle="Aktif çalıştığınız firmaları tek seferde müşteri, iş ortağı ve ana firma olarak yazılıma alın" />
      <div className="space-y-4 p-4 md:p-6">
        {done && (
          <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Aktarım tamamlandı</p>
            <p className="mt-1">{done.created} yeni müşteri kartı · {done.updated} kart güncellendi · {done.principals} ana firma kaydı · {done.linked} fatura kartlara bağlandı</p>
            {done.errors.length > 0 && <p className="mt-1 text-xs text-red-700">Hatalar: {done.errors.join(' | ')}</p>}
            <p className="mt-2 flex flex-wrap gap-3 text-xs"><Link href="/customers" className="font-medium underline">Müşteriler</Link><Link href="/suppliers" className="font-medium underline">Ana Firmalarım</Link><Link href="/business-lines" className="font-medium underline">İş Kolları & Bayi İşleri</Link><Link href="/reconciliation" className="font-medium underline">Mutabakat</Link></p>
          </Card>)}
        {err && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</Card>}
        {!data.roles_ready && <Card className="border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Rollerin kaydedilmesi için önce <b>parasut-matris.sql</b> dosyasını Supabase'de çalıştırın. Çalıştırmadan aktarırsanız kartlar açılır ama roller boş kalır.</Card>}

        <Card className="p-4 text-sm">
          <p className="flex items-start gap-2 text-slate-600"><Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
            <span>Paraşüt'teki <b>{data.rows.length}</b> cariyi inceledim ve faturalarına göre rol önerdim: satış yaptıklarınız <b>Müşteri</b>, hem satış yapıp hem iş alışı yaptıklarınız <b>İş ortağı</b>, iş için alış yaptıklarınız (teknik servis, lisans vb.) <b>Ana firma</b>. Yalnızca gider faturası olan cariler (yemek, yakıt, kira…) önerilmez. Rolleri tek tıkla değiştirebilirsiniz; aynı firma yazılımda varsa yeni kart açılmaz, mevcut kart güncellenir.</span></p>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-white p-0.5 text-sm">
            {([['suggested', 'Önerilenler'], ['active', 'Hareketi olanlar'], ['expense', 'Gider carileri'], ['all', 'Tümü']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-3 py-1.5 ${filter === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{l} <span className={filter === k ? 'text-indigo-200' : 'text-slate-400'}>{counts[k]}</span></button>))}
          </div>
          <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Firma veya VKN ara" className="h-9 w-56 rounded-lg border pl-8 pr-2 text-sm" /></div>
          <select className="h-9 rounded-lg border bg-white px-2 text-sm" value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">Sorumlu atama (opsiyonel)</option>{(data.team || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <Button className="ml-auto" disabled={busy || !sel.n} onClick={run}>{busy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Aktarılıyor…</> : <><Download className="mr-1 h-4 w-4" />{sel.n} cariyi aktar</>}</Button>
        </div>
        <p className="text-xs text-slate-500">Seçili: {sel.n} cari · {sel.newN} yeni kart · {sel.n - sel.newN} mevcut kart güncellenecek · {sel.prin} ana firma</p>

        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-3 py-2"><input type="checkbox" checked={rows.length > 0 && rows.every((r: any) => picks[r.id]?.on)} onChange={e => rows.forEach((r: any) => set(r.id, { on: e.target.checked }))} /></th>
              <th>Paraşüt carisi</th><th className="pl-4 text-right">Satış</th><th className="pl-4 text-right">Alış</th><th className="pl-4">Son işlem</th><th className="pl-4">Yazılımda</th><th className="pl-3">Rol (birden fazla olabilir)</th><th>Durum</th></tr></thead>
            <tbody>{rows.map((r: any) => { const p = picks[r.id] || { on: false, roles: [], status: 'Aktif' }; return (
              <tr key={r.id} className={`border-b align-top ${p.on ? '' : 'opacity-60'}`}>
                <td className="px-3 py-2"><input type="checkbox" checked={p.on} onChange={e => set(r.id, { on: e.target.checked })} /></td>
                <td className="py-2 pr-2"><p className="font-medium">{r.name}</p>
                  <p className="text-[11px] text-slate-400">{r.tax_number ? `VKN ${r.tax_number}` : 'VKN yok'}{r.city ? ` · ${r.city}` : ''}{r.contact_type === 'person' ? ' · şahıs' : ''}</p>
                  <p className="text-[11px] text-slate-500">{r.suggest.reason}</p></td>
                <td className="whitespace-nowrap py-2 pl-4 text-right">{r.activity.ns ? <>{tl(r.activity.sales)}<span className="block text-[10px] text-slate-400">{r.activity.ns} fatura</span></> : '-'}</td>
                <td className="whitespace-nowrap py-2 pl-4 text-right">{r.activity.nb ? <>{tl(r.activity.buys)}<span className="block text-[10px] text-slate-400">{r.activity.nb} fatura</span></> : '-'}</td>
                <td className="whitespace-nowrap py-2 pl-4 text-xs">{dt(r.activity.last)}</td>
                <td className="py-2 pl-4 text-xs">{r.existing ? <Link href={`/customers/${r.existing.id}`} className="text-indigo-700 hover:underline">Var: {r.existing.name}</Link> : <Badge variant="info">Yeni kart</Badge>}{r.supplier && <span className="block text-[10px] text-slate-400">Ana firma kaydı var</span>}</td>
                <td className="py-2 pl-3"><div className="flex flex-wrap gap-1">{ROLES.map(x => (
                  <button key={x.key} title={x.hint} onClick={() => toggleRole(r.id, x.key)} className={`rounded-full border px-2 py-0.5 text-[11px] ${p.roles.includes(x.key) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-500 hover:border-indigo-300'}`}>{x.label}</button>))}</div></td>
                <td className="py-2 pr-3"><select className="h-7 rounded border px-1 text-xs" value={p.status} onChange={e => set(r.id, { status: e.target.value })}>
                  {['Aktif', 'Pasif', 'Potansiyel', 'VIP'].map(s => <option key={s} value={s}>{s}</option>)}</select></td>
              </tr>); })}</tbody>
          </table>
          {rows.length === 0 && <p className="p-4 text-sm text-slate-500">Bu filtrede cari yok.</p>}
        </Card>
        <p className="text-[11px] text-slate-500">Satış ve alış tutarları {data.sync_from ? new Date(data.sync_from).toLocaleDateString('tr-TR') : 'eşitleme başlangıcı'} sonrası eşitlenen faturalardan (KDV hariç). Son 12 ayda hareketi olanlar "Aktif", daha eski olanlar "Pasif" önerilir.</p>
      </div>
    </div>
  );
}
