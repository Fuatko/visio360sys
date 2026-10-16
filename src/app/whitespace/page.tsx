'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Button, Modal } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { loadWhitespace, createCrossSellOpportunity, UNCATEGORIZED, type WSData } from '@/lib/whitespace';
import { MarkEditor, Legend, STATE, tl, short } from '@/components/whitespace/WhitespaceUI';
import { Grid3x3, Lightbulb, Settings2, AlertTriangle, Target, Layers, Users, Moon, Loader2 } from 'lucide-react';

export default function WhitespacePage() {
  const supabase = createClient();
  const [d, setD] = useState<WSData | null>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [rep, setRep] = useState<string>('');
  const [edit, setEdit] = useState<{ customer: any; offering: string } | null>(null);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [w, tm, u] = await Promise.all([loadWhitespace(supabase), supabase.from('sales_team').select('id, name, email').order('name'), supabase.auth.getUser()]);
    setD(w); setTeam(tm.data || []);
    const mine = (tm.data || []).find((x: any) => x.email && x.email.toLowerCase() === (u.data.user?.email || '').toLowerCase());
    setMe(mine?.id || null);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (d ? d.customers.filter(c => !rep || c.assigned_to === rep) : []), [d, rep]);
  const sugs = useMemo(() => (d ? d.suggestions.filter(s => !rep || s.assigned_to === rep) : []), [d, rep]);
  const kpi = useMemo(() => {
    if (!d) return null;
    const real = d.offerings.filter(o => o !== UNCATEGORIZED);
    const breadth = rows.length ? rows.reduce((a, c) => a + real.filter(o => (d.cells[c.id]?.[o]?.rev12 || 0) > 0).length, 0) / rows.length : 0;
    const lapsed = rows.reduce((a, c) => a + real.filter(o => d.stateOf(c.id, o) === 'lapsed').length, 0);
    return { potential: sugs.reduce((a, s) => a + s.est, 0), breadth, total: real.length, lapsed, gaps: sugs.length };
  }, [d, rows, sugs]);

  const quickOpp = async (s: any) => {
    setBusy(s.customer_id + s.offering);
    try { await createCrossSellOpportunity(supabase, s); await load(); }
    catch (e: any) { alert(e.message); } finally { setBusy(null); }
  };

  if (!d) return <div><Header title="Beyaz Alan & Çapraz Satış" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;

  return (
    <div>
      <Header title="Beyaz Alan & Çapraz Satış" />
      <div className="space-y-4 p-6">
        {!d.ready && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />Değerlendirme ve kategori ayarlarını kaydetmek için <b>capraz-satis-hatirlatma.sql</b> dosyasını Supabase'de çalıştırın. Analiz şimdiden çalışıyor.</Card>}

        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto max-w-3xl text-sm text-slate-600">Her müşterinin hangi kategoride sizden alım yaptığını, hangisinde boş alan kaldığını görün. Kategoriler Paraşüt fatura kategorilerinizden ve ürün kataloğundan gelir. Bir hücreye tıklayarak değerlendirme girebilir veya fırsat açabilirsiniz.</p>
          <select value={rep} onChange={e => setRep(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
            <option value="">Tüm temsilciler</option>
            {me && <option value={me}>Benim müşterilerim</option>}
            {team.filter(t => t.id !== me).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Button variant="secondary" size="sm" onClick={() => setSettings(true)}><Settings2 className="h-3.5 w-3.5" />Kategoriler</Button>
        </div>

        {kpi && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><Lightbulb className="h-3.5 w-3.5" />Çapraz satış potansiyeli</p><p className="mt-1 text-xl font-bold">{tl(kpi.potential)}</p><p className="text-[11px] text-slate-400">{kpi.gaps} boş alan için tahmini yıllık</p></Card>
            <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><Layers className="h-3.5 w-3.5" />Müşteri başına kategori</p><p className="mt-1 text-xl font-bold">{kpi.breadth.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} / {kpi.total}</p><p className="text-[11px] text-slate-400">Son 12 ayda alım yapılan ortalama kategori</p></Card>
            <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><Moon className="h-3.5 w-3.5" />Uyuyan alan</p><p className={`mt-1 text-xl font-bold ${kpi.lapsed ? 'text-amber-600' : ''}`}>{kpi.lapsed}</p><p className="text-[11px] text-slate-400">Eskiden alınıp son 12 ayda alınmayan</p></Card>
            <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><Users className="h-3.5 w-3.5" />Analizdeki müşteri</p><p className="mt-1 text-xl font-bold">{rows.length}</p><p className="text-[11px] text-slate-400">Satışı olan veya Aktif/VIP</p></Card>
          </div>
        )}

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Grid3x3 className="h-4 w-4 text-indigo-600" />Müşteri × kategori matrisi</p>
            <span className="flex-1" /><Legend />
          </div>
          {rows.length === 0 || d.offerings.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Henüz analiz edilecek satış yok. Paraşüt senkronizasyonu yapıldığında veya sipariş girildiğinde matris dolar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                    <th className="sticky left-0 z-10 min-w-[220px] bg-slate-50 px-4 py-2 font-medium">Müşteri</th>
                    {d.offerings.map(o => <th key={o} className="min-w-[130px] px-2 py-2 text-center font-medium">{o}<span className="block text-[10px] font-normal text-slate-400">{d.stats[o]?.buyers || 0} müşteri alıyor</span></th>)}
                    <th className="px-3 py-2 text-right font-medium">12 ay ciro</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(c => {
                    const total = d.offerings.reduce((a, o) => a + (d.cells[c.id]?.[o]?.rev12 || 0), 0);
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="sticky left-0 z-10 bg-white px-4 py-2"><Link href={`/customers/${c.id}`} className="font-medium text-slate-800 hover:text-indigo-700">{c.name}</Link>
                          <span className="block text-[11px] text-slate-400">{[c.sector, team.find(t => t.id === c.assigned_to)?.name].filter(Boolean).join(' · ') || '—'}</span></td>
                        {d.offerings.map(o => {
                          const st = d.stateOf(c.id, o); const x = d.cells[c.id]?.[o];
                          const sg = st !== 'buying' ? d.suggestions.find(s => s.customer_id === c.id && s.offering === o) : null;
                          const shown = sg && st === 'empty' ? 'suggested' : st;
                          return (
                            <td key={o} className="px-1.5 py-1.5">
                              <button onClick={() => setEdit({ customer: c, offering: o })} title={sg?.reason || STATE[shown].label}
                                className={`h-11 w-full rounded-md border px-1 text-center text-[11px] leading-tight transition hover:ring-2 hover:ring-indigo-200 ${STATE[shown].cls}`}>
                                {shown === 'buying' ? (x && x.rev12 > 0 ? <><b className="block text-xs">{short(x.rev12)}</b>{x.count} belge</> : <><b className="block">Alıyor</b>elle işaretli</>)
                                  : shown === 'lapsed' ? <><b className="block">Uyuyan</b>son {x?.last ? new Date(x.last).toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }) : '-'}</>
                                  : shown === 'empty' ? '—'
                                  : shown === 'remapped' ? <><b className="block">Taşındı</b>→ {d.marks[c.id]?.[o]?.remap_to}</>
                                  : <><b className="block">{STATE[shown].label}</b>{sg ? short(sg.est) : ''}</>}
                              </button>
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-3 py-2 text-right font-medium">{tl(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b px-4 py-3"><p className="flex items-center gap-1.5 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-indigo-600" />Öncelikli çapraz satış fırsatları</p>
            <p className="text-xs text-slate-500">Sıralama: tahmini yıllık değer × olasılık (uyuyan alanlar ve verilen teklifler öne çıkar).</p></div>
          {sugs.length === 0 ? <p className="p-4 text-sm text-slate-500">Şu an öneri yok. Kategori sayısı ve müşteri sayısı arttıkça öneriler belirginleşir; hücrelere kendi değerlendirmenizi de girebilirsiniz.</p> : (
            <div className="divide-y">{sugs.slice(0, 15).map(s => {
              const c = d.customers.find(x => x.id === s.customer_id); const m = d.marks[s.customer_id]?.[s.offering];
              return (
                <div key={s.customer_id + s.offering} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${STATE[s.state].cls}`}>{STATE[s.state].label}</span>
                  <div className="min-w-0 flex-1">
                    <p><Link href={`/customers/${s.customer_id}`} className="font-medium hover:text-indigo-700">{s.customer}</Link> <span className="text-slate-400">→</span> <b>{s.offering}</b></p>
                    <p className="text-xs text-slate-500">{s.reason}</p>
                  </div>
                  <p className="w-28 text-right font-semibold">{tl(s.est)}<span className="block text-[10px] font-normal text-slate-400">tahmini / yıl</span></p>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => setEdit({ customer: c, offering: s.offering })}>Değerlendir</Button>
                    {m?.opportunity_id ? <Link href="/opportunities"><Button size="sm" variant="ghost">Fırsata git</Button></Link>
                      : <Button size="sm" disabled={busy === s.customer_id + s.offering} onClick={() => quickOpp(s)}>{busy === s.customer_id + s.offering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}Fırsat aç</Button>}
                  </div>
                </div>
              );
            })}</div>
          )}
        </Card>
      </div>

      {edit && <MarkEditor supabase={supabase} data={d} customer={edit.customer} offering={edit.offering} onClose={() => setEdit(null)} onSaved={load} />}
      {settings && <OfferingSettings supabase={supabase} data={d} onClose={() => setSettings(false)} onSaved={load} />}
    </div>
  );
}

/** Kategorileri gizle / başka kategoriyle birleştir (ör. "Teknik Servis Parçaları" → "Teknik Servis") */
function OfferingSettings({ supabase, data, onClose, onSaved }: { supabase: any; data: WSData; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState(data.allOfferings.map(o => ({ ...o })));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const payload = rows.filter(r => r.hidden || r.merge_into).map(r => ({ name: r.name, hidden: r.hidden, merge_into: r.merge_into || null }));
    const del = await supabase.from('whitespace_offerings').delete().neq('name', '');
    const ins = payload.length ? await supabase.from('whitespace_offerings').insert(payload) : { error: null };
    setBusy(false);
    const e = del.error || ins.error; if (e) { alert(/relation|does not exist/i.test(e.message) ? 'Önce capraz-satis-hatirlatma.sql dosyasını çalıştırın.' : e.message); return; }
    onSaved(); onClose();
  };
  const targets = rows.filter(r => !r.merge_into).map(r => r.name);
  return (
    <Modal isOpen onClose={onClose} title="Analizdeki kategoriler" size="lg" footer={<div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Vazgeç</Button><Button size="sm" disabled={busy || !data.ready} onClick={save}>Kaydet</Button></div>}>
      <p className="mb-3 text-xs text-slate-500">Paraşüt kategorileriniz ve ürün kataloğu kategorileri burada listelenir. Satış kategorisi olmayanları gizleyin, aynı işi anlatan kategorileri tek kategoride birleştirin.</p>
      <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">{rows.map((r, i) => (
        <div key={r.name} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
          <div className="min-w-0 flex-1"><p className={`truncate font-medium ${r.hidden ? 'text-slate-400 line-through' : ''}`}>{r.name}</p><p className="text-[11px] text-slate-400">{r.buyers} müşteri · son 12 ay {tl(r.rev12)}</p></div>
          <select value={r.merge_into || ''} onChange={e => setRows(l => l.map((x, k) => k === i ? { ...x, merge_into: e.target.value || null } : x))} className="h-8 max-w-[180px] rounded border px-2 text-xs">
            <option value="">Ayrı kategori</option>
            {targets.filter(t => t !== r.name).map(t => <option key={t} value={t}>→ {t} ile birleştir</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={r.hidden} onChange={e => setRows(l => l.map((x, k) => k === i ? { ...x, hidden: e.target.checked } : x))} />Gizle</label>
        </div>))}</div>
    </Modal>
  );
}
