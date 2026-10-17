'use client';

// Bütçe: masraf merkezi × kategori matrisi, ay ay grafik, CSV içe/dışa aktarma, revizyon izi, gelecek yıl taslağı
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Button, Modal } from '@/components/ui';
import MoneyInput from '@/components/MoneyInput';
import { SqlMissingCard } from '@/components/procure/ProcureGate';
import { createClient } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetch-all';
import { Category, CostCenter, MONTHS_TR, PROCURE_SQL_1A, downloadCsv, fiscalYearOf, fmtDateTime, parseCsv, procError, tl } from '@/lib/procure';
import { Download, Edit2, History, Lock, Plus, Table2, Trash2, Unlock, Upload, Wand2 } from 'lucide-react';

const S = { budget: '#2a78d6', pre: '#eb6834', actual: '#1baf7a' };  // doğrulanmış kategorik sıra (validate_palette.js)
const inp = 'h-9 w-full rounded-lg border border-slate-200 px-2 text-sm';
const shiftFy = (fy: string, n: number) => (fy.includes('-') ? `${+fy.slice(0, 4) + n}-${+fy.slice(0, 4) + n + 1}` : String(+fy + n));

type Line = { id: string; fiscal_year: string; cost_center_id: string | null; category_id: string | null; amount: number; monthly_split: number[] | null;
  locked: boolean; notes: string | null; pre_commitment: number; commitment: number; actual: number; available: number };

export default function BudgetBoard({ canEdit }: { canEdit: boolean }) {
  const supabase = createClient();
  const [startMonth, setStartMonth] = useState(9);
  const [fy, setFy] = useState('');
  const [lines, setLines] = useState<Line[] | null>(null);
  const [ccs, setCcs] = useState<CostCenter[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [parasut, setParasut] = useState<{ category_id: string; fiscal_month: number; amount: number }[]>([]);
  const [reqs, setReqs] = useState<{ budget_line_id: string; estimated_total: number; approved_at: string }[]>([]);
  const [missing, setMissing] = useState(false);
  const [edit, setEdit] = useState<{ id?: string; cost_center_id: string; category_id: string; amount: number | null; notes: string; locked: boolean; reason: string } | null>(null);
  const [revs, setRevs] = useState<{ line: Line; rows: any[] } | null>(null);
  const [draft, setDraft] = useState<{ pct: number } | null>(null);
  const [report, setReport] = useState<string[] | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('proc_policies').select('fiscal_year_start_month').maybeSingle().then(({ data }) => {
      const m = data?.fiscal_year_start_month || 9; setStartMonth(m); setFy(fiscalYearOf(new Date(), m));
    });
  }, []);

  const load = useCallback(async () => {
    if (!fy) return;
    const st = await supabase.from('proc_budget_status').select('*').eq('fiscal_year', fy);
    if (st.error) { if (/relation|does not exist/i.test(st.error.message)) setMissing(true); else setErr(st.error.message); setLines([]); return; }
    const [cc, ct, pa, rq] = await Promise.all([
      supabase.from('proc_cost_centers').select('*').order('sort').order('name'),
      supabase.from('proc_categories').select('*').order('sort').order('name'),
      supabase.rpc('proc_parasut_actuals', { p_fy: fy }),
      fetchAll(() => supabase.from('proc_requests').select('budget_line_id, estimated_total, approved_at').in('status', ['approved', 'sourcing']).not('budget_line_id', 'is', null)),
    ]);
    setLines((st.data || []).map((l: any) => ({ ...l, amount: +l.amount, pre_commitment: +l.pre_commitment, commitment: +l.commitment, actual: +l.actual, available: +l.available })));
    setCcs(cc.data || []); setCats(ct.data || []); setParasut((pa.data || []).map((x: any) => ({ ...x, amount: +x.amount }))); setReqs(rq);
  }, [fy]);
  useEffect(() => { load(); }, [load]);

  const ccName = (id: string | null) => (id ? ccs.find(c => c.id === id)?.name || '—' : 'Tüm kurum');
  const catName = (id: string | null) => (id ? cats.find(c => c.id === id)?.name || '—' : 'Tüm kategoriler');
  const sorted = useMemo(() => (lines || []).slice().sort((a, b) => ccName(a.cost_center_id).localeCompare(ccName(b.cost_center_id), 'tr') || catName(a.category_id).localeCompare(catName(b.category_id), 'tr')), [lines, ccs, cats]);
  const tot = useMemo(() => (lines || []).reduce((t, l) => ({ amount: t.amount + l.amount, pre: t.pre + l.pre_commitment, com: t.com + l.commitment, act: t.act + l.actual, av: t.av + l.available }), { amount: 0, pre: 0, com: 0, act: 0, av: 0 }), [lines]);

  // Tüm kurum satırı olmayan kategorilerin Paraşüt gerçekleşeni: masraf merkezi belli değil
  const unallocated = useMemo(() => {
    const covered = new Set((lines || []).filter(l => !l.cost_center_id).map(l => l.category_id || '*'));
    if (covered.has('*')) return [];
    const m = new Map<string, number>();
    parasut.filter(p => !covered.has(p.category_id)).forEach(p => m.set(p.category_id, (m.get(p.category_id) || 0) + p.amount));
    return [...m.entries()].map(([category_id, amount]) => ({ category_id, amount }));
  }, [parasut, lines]);

  // Aylık seri (bütçe ayı 1 = başlangıç ayı)
  const monthly = useMemo(() => {
    if (!lines) return [];
    const lineIds = new Set(lines.map(l => l.id));
    const fyStart = new Date(+fy.slice(0, 4), startMonth - 1, 1);
    return Array.from({ length: 12 }, (_, i) => {
      const budget = lines.reduce((a, l) => a + (Array.isArray(l.monthly_split) && l.monthly_split.length === 12 ? +l.monthly_split[i] || 0 : l.amount / 12), 0);
      const pre = reqs.filter(r => lineIds.has(r.budget_line_id) && r.approved_at && monthIndex(new Date(r.approved_at), fyStart) === i).reduce((a, r) => a + +r.estimated_total, 0);
      const actual = parasut.filter(p => p.fiscal_month === i + 1).reduce((a, p) => a + p.amount, 0);
      return { month: MONTHS_TR[(startMonth - 1 + i) % 12].slice(0, 3), budget: Math.round(budget), pre: Math.round(pre), actual: Math.round(actual) };
    });
  }, [lines, reqs, parasut, fy, startMonth]);

  const saveLine = async () => {
    if (!edit || edit.amount == null) return;
    setErr('');
    const row = { fiscal_year: fy, cost_center_id: edit.cost_center_id || null, category_id: edit.category_id || null, notes: edit.notes || null, locked: edit.locked };
    let error: any = null;
    if (edit.id) {
      const cur = lines?.find(l => l.id === edit.id);
      if (cur && cur.amount !== edit.amount) {
        if (cur.locked || edit.reason.trim()) error = (await supabase.rpc('proc_budget_revise', { p_budget: edit.id, p_amount: edit.amount, p_reason: edit.reason })).error;
        else error = (await supabase.from('proc_budgets').update({ amount: edit.amount }).eq('id', edit.id)).error;
      }
      if (!error) error = (await supabase.from('proc_budgets').update({ notes: row.notes, locked: row.locked }).eq('id', edit.id)).error;
    } else {
      error = (await supabase.from('proc_budgets').insert({ ...row, amount: edit.amount })).error;
    }
    if (error) { setErr(/duplicate|unique/i.test(error.message) ? 'Bu birim ve kategori için bu yılın bütçe satırı zaten var.' : procError(error)); return; }
    setEdit(null); load();
  };

  const showRevisions = async (l: Line) => {
    const { data } = await supabase.from('proc_budget_revisions').select('*').eq('budget_id', l.id).order('changed_at', { ascending: false });
    setRevs({ line: l, rows: data || [] });
  };

  // CSV: fiscal_year;masraf_merkezi_kodu;kategori_kodu;tutar (boş kod = tüm kurum / tüm kategoriler)
  const importCsv = async (file: File) => {
    const { header, rows } = parseCsv(await file.text());
    const col = (...n: string[]) => header.findIndex(h => n.includes(h));
    const iFy = col('fiscal_year', 'butce_yili', 'bütçe_yılı'), iCc = col('masraf_merkezi_kodu', 'cost_center_code'), iCat = col('kategori_kodu', 'category_code'), iAmt = col('tutar', 'amount');
    if (iAmt < 0) { setReport(['Başlıkta "tutar" sütunu yok. Şablonu indirip kullanın.']); return; }
    const ccBy = new Map(ccs.filter(c => c.code).map(c => [c.code!.toLowerCase(), c.id]));
    const catBy = new Map(cats.filter(c => c.code).map(c => [c.code!.toLowerCase(), c.id]));
    const out: string[] = []; let added = 0, updated = 0;
    const all = await fetchAll(() => supabase.from('proc_budgets').select('id, fiscal_year, cost_center_id, category_id, amount, locked'));
    for (const [i, r] of rows.entries()) {
      const line = i + 2;
      const f = (iFy >= 0 && r[iFy]) || fy;
      if (!/^\d{4}(-\d{4})?$/.test(f)) { out.push(`Satır ${line}: bütçe yılı "${f}" geçersiz (örn. 2026-2027).`); continue; }
      const ccCode = iCc >= 0 ? r[iCc] : ''; const catCode = iCat >= 0 ? r[iCat] : '';
      const cc = ccCode ? ccBy.get(ccCode.toLowerCase()) : null; const cat = catCode ? catBy.get(catCode.toLowerCase()) : null;
      if (ccCode && !cc) { out.push(`Satır ${line}: masraf merkezi kodu "${ccCode}" bulunamadı.`); continue; }
      if (catCode && !cat) { out.push(`Satır ${line}: kategori kodu "${catCode}" bulunamadı.`); continue; }
      const amount = Number(String(r[iAmt] || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
      if (!isFinite(amount) || amount < 0) { out.push(`Satır ${line}: tutar "${r[iAmt]}" geçersiz.`); continue; }
      const ex = all.find((b: any) => b.fiscal_year === f && b.cost_center_id === (cc || null) && b.category_id === (cat || null));
      if (ex?.locked) { out.push(`Satır ${line}: bütçe kilitli, gerekçeli revizyonla değiştirin.`); continue; }
      const res = ex ? await supabase.from('proc_budgets').update({ amount }).eq('id', ex.id) : await supabase.from('proc_budgets').insert({ fiscal_year: f, cost_center_id: cc || null, category_id: cat || null, amount });
      if (res.error) { out.push(`Satır ${line}: ${res.error.message}`); continue; }
      if (ex) updated++; else added++;
    }
    setReport([`${added} satır eklendi, ${updated} satır güncellendi, ${out.length} hata.`, ...out]);
    load();
  };

  // Gelecek yıl taslağı: bu yılın kullanılanı (ön taahhüt + taahhüt + gerçekleşen; yoksa bütçe) + %X
  const makeDraft = async () => {
    if (!draft || !lines) return;
    const next = shiftFy(fy, 1); const out: string[] = []; let added = 0;
    for (const l of lines) {
      const used = l.pre_commitment + l.commitment + l.actual;
      const base = used > 0 ? used : l.amount;
      const { error } = await supabase.from('proc_budgets').insert({ fiscal_year: next, cost_center_id: l.cost_center_id, category_id: l.category_id, amount: Math.round(base * (1 + draft.pct / 100)), notes: `${fy} ${used > 0 ? 'kullanılanı' : 'bütçesi'} + %${draft.pct} taslağı` });
      if (error) out.push(`${ccName(l.cost_center_id)} / ${catName(l.category_id)}: ${/duplicate|unique/i.test(error.message) ? `${next} için zaten var` : error.message}`); else added++;
    }
    setDraft(null); setReport([`${next} için ${added} taslak satır oluşturuldu.`, ...out]);
  };

  if (missing) return <SqlMissingCard file={PROCURE_SQL_1A} />;
  if (!fy || lines === null) return <div className="flex h-40 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;
  const pct = (l: { amount: number; available: number }) => (l.amount > 0 ? Math.round(((l.amount - l.available) / l.amount) * 100) : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={fy} onChange={e => setFy(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
          {[-1, 0, 1].map(n => { const v = shiftFy(fiscalYearOf(new Date(), startMonth), n); return <option key={v} value={v}>{v} bütçe yılı</option>; })}
        </select>
        {canEdit && <Button size="sm" onClick={() => setEdit({ cost_center_id: '', category_id: '', amount: null, notes: '', locked: false, reason: '' })}><Plus className="h-3.5 w-3.5" />Bütçe satırı</Button>}
        {canEdit && <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" />CSV içe aktar</Button>}
        <Button size="sm" variant="ghost" onClick={() => downloadCsv('butce-sablon.csv', [['fiscal_year', 'masraf_merkezi_kodu', 'kategori_kodu', 'tutar'], [fy, ccs[0]?.code || 'K1-FEN', cats[0]?.code || 'LAB', '150000']])}><Download className="h-3.5 w-3.5" />CSV şablonu</Button>
        {lines.length > 0 && <Button size="sm" variant="ghost" onClick={() => downloadCsv(`butce-${fy}.csv`, [['fiscal_year', 'masraf_merkezi_kodu', 'masraf_merkezi', 'kategori_kodu', 'kategori', 'butce', 'on_taahhut', 'taahhut', 'gerceklesen', 'kalan'], ...sorted.map(l => [fy, ccs.find(c => c.id === l.cost_center_id)?.code || '', ccName(l.cost_center_id), cats.find(c => c.id === l.category_id)?.code || '', catName(l.category_id), l.amount, l.pre_commitment, l.commitment, l.actual, l.available])])}><Download className="h-3.5 w-3.5" />Dışa aktar</Button>}
        {canEdit && lines.length > 0 && <Button size="sm" variant="ghost" onClick={() => setDraft({ pct: 10 })}><Wand2 className="h-3.5 w-3.5" />{shiftFy(fy, 1)} taslağı</Button>}
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importCsv(f); }} />
      </div>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
      {report && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="mb-1 flex justify-between"><b>Sonuç</b><button className="text-slate-400" onClick={() => setReport(null)}>Kapat</button></div>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">{report.map((l, i) => <li key={i} className={i ? 'text-rose-700' : ''}>{l}</li>)}</ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-5">
        {[['Bütçe', tot.amount], ['Ön taahhüt', tot.pre], ['Taahhüt', tot.com], ['Gerçekleşen', tot.act], ['Kalan', tot.av]].map(([k, v]) => (
          <Card key={k as string} className="p-3"><p className="text-xs text-slate-500">{k}</p><p className={`mt-0.5 text-lg font-bold ${k === 'Kalan' && (v as number) < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{tl(v)}</p></Card>
        ))}
      </div>

      <Card className="overflow-x-auto">
        {lines.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{fy} için bütçe tanımlı değil.{canEdit ? ' Satır ekleyin veya CSV ile aktarın.' : ''}</p> : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs text-slate-600">
              <tr><th className="px-3 py-2">Masraf merkezi</th><th className="px-3 py-2">Kategori</th><th className="px-3 py-2 text-right">Bütçe</th><th className="px-3 py-2 text-right">Ön taahhüt</th><th className="px-3 py-2 text-right">Taahhüt</th><th className="px-3 py-2 text-right">Gerçekleşen</th><th className="px-3 py-2 text-right">Kalan</th><th className="px-3 py-2">Kullanım</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map(l => {
                const p = pct(l);
                return (
                  <tr key={l.id}>
                    <td className="px-3 py-2 text-slate-800">{ccName(l.cost_center_id)}</td>
                    <td className="px-3 py-2 text-slate-600">{catName(l.category_id)}{l.locked && <Lock className="ml-1 inline h-3 w-3 text-slate-400" />}</td>
                    <td className="px-3 py-2 text-right">{tl(l.amount)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{tl(l.pre_commitment)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{tl(l.commitment)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{tl(l.actual)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${l.available < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{tl(l.available)}</td>
                    <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${p > 100 ? 'bg-rose-500' : p >= 80 ? 'bg-amber-500' : 'bg-[#10B981]'}`} style={{ width: `${Math.min(p, 100)}%` }} /></div><span className="text-xs text-slate-600">%{p}</span></div></td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <button title="Revizyon geçmişi" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => showRevisions(l)}><History className="h-3.5 w-3.5" /></button>
                      {canEdit && <button title="Düzenle" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setEdit({ id: l.id, cost_center_id: l.cost_center_id || '', category_id: l.category_id || '', amount: l.amount, notes: l.notes || '', locked: l.locked, reason: '' })}><Edit2 className="h-3.5 w-3.5" /></button>}
                      {canEdit && !l.locked && <button title="Sil" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={async () => { if (!confirm('Bütçe satırı silinsin mi?')) return; const x = await supabase.from('proc_budgets').delete().eq('id', l.id); if (x.error) setErr(procError(x.error)); load(); }}><Trash2 className="h-3.5 w-3.5" /></button>}
                    </td>
                  </tr>
                );
              })}
              {unallocated.map(u => (
                <tr key={u.category_id} className="bg-slate-50/60 text-slate-500">
                  <td className="px-3 py-2 italic">Dağıtılmamış (Paraşüt)</td><td className="px-3 py-2">{catName(u.category_id)}</td>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs">masraf merkezi belli değil</td><td className="px-3 py-2 text-right">{tl(u.amount)}</td><td colSpan={3} />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {lines.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Ay ay bütçe ve kullanım · {fy}</p>
            <Button size="sm" variant="ghost" onClick={() => setShowTable(!showTable)}><Table2 className="h-3.5 w-3.5" />{showTable ? 'Grafik' : 'Tablo'}</Button>
          </div>
          {!showTable ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef1f5" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={64} tickFormatter={v => (v >= 1e6 ? `₺${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn` : `₺${Math.round(v / 1000)} B`)} />
                  <Tooltip formatter={(v: any, n: any) => [tl(v), n]} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="pre" name="Ön taahhüt (onaylı talep)" stackId="u" fill={S.pre} stroke="#fff" strokeWidth={2} />
                  <Bar dataKey="actual" name="Gerçekleşen (Paraşüt)" stackId="u" fill={S.actual} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} />
                  <Line dataKey="budget" name="Aylık bütçe" stroke={S.budget} strokeWidth={2} dot={{ r: 4 }} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Ay</th><th className="py-1 text-right">Aylık bütçe</th><th className="py-1 text-right">Ön taahhüt</th><th className="py-1 text-right">Gerçekleşen (Paraşüt)</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{monthly.map(m => <tr key={m.month}><td className="py-1">{m.month}</td><td className="py-1 text-right">{tl(m.budget)}</td><td className="py-1 text-right">{tl(m.pre)}</td><td className="py-1 text-right">{tl(m.actual)}</td></tr>)}</tbody>
            </table>
          )}
          <p className="mt-2 text-[11px] text-slate-400">Gerçekleşen, Paraşüt gider kategorisi Procure kategorisine eşlenmiş alış faturalarından gelir. Taahhüt (sipariş) ve fatura eşleştirme sonraki fazlarda eklenecek.</p>
        </Card>
      )}

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Bütçe satırını düzenle' : `Yeni bütçe satırı · ${fy}`}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Vazgeç</Button><Button disabled={edit?.amount == null} onClick={saveLine}>Kaydet</Button></>}>
        {edit && (() => {
          const cur = lines.find(l => l.id === edit.id);
          const needReason = !!cur && cur.locked && cur.amount !== edit.amount;
          return (
            <div className="space-y-2">
              <label className="block text-xs text-slate-600">Masraf merkezi<select disabled={!!edit.id} className={inp} value={edit.cost_center_id} onChange={e => setEdit({ ...edit, cost_center_id: e.target.value })}><option value="">Tüm kurum</option>{ccs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="block text-xs text-slate-600">Kategori<select disabled={!!edit.id} className={inp} value={edit.category_id} onChange={e => setEdit({ ...edit, category_id: e.target.value })}><option value="">Tüm kategoriler</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="block text-xs text-slate-600">Yıllık tutar (KDV hariç)<div className="flex items-center gap-1"><span className="text-sm text-slate-500">₺</span><MoneyInput className={inp} value={edit.amount} onChange={v => setEdit({ ...edit, amount: v })} /></div></label>
              {edit.id && <label className="block text-xs text-slate-600">Revizyon gerekçesi {needReason ? '(kilitli bütçe: zorunlu)' : '(ek bütçe / aktarım için önerilir)'}<input className={inp} value={edit.reason} onChange={e => setEdit({ ...edit, reason: e.target.value })} /></label>}
              <label className="block text-xs text-slate-600">Not<input className={inp} value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></label>
              <label className="flex items-center gap-2 text-sm">{edit.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}<input type="checkbox" checked={edit.locked} onChange={e => setEdit({ ...edit, locked: e.target.checked })} />Kilitli (onaylanmış bütçe; tutar yalnızca gerekçeli revizyonla değişir)</label>
              {needReason && !edit.reason.trim() && <p className="text-xs text-rose-600">Kilitli bütçe için gerekçe girin.</p>}
            </div>
          );
        })()}
      </Modal>
      <Modal isOpen={!!revs} onClose={() => setRevs(null)} title={revs ? `Revizyonlar · ${ccName(revs.line.cost_center_id)} / ${catName(revs.line.category_id)}` : ''}>
        {revs && (revs.rows.length === 0 ? <p className="text-sm text-slate-500">Revizyon yok.</p> : (
          <ul className="space-y-1.5 text-sm">{revs.rows.map(r => <li key={r.id}><b>{tl(r.old_amount)} → {tl(r.new_amount)}</b> · {fmtDateTime(r.changed_at)}{r.reason && <span className="block text-xs text-slate-600">{r.reason}</span>}</li>)}</ul>
        ))}
      </Modal>
      <Modal isOpen={!!draft} onClose={() => setDraft(null)} title={`${shiftFy(fy, 1)} bütçe taslağı`}
        footer={<><Button variant="secondary" onClick={() => setDraft(null)}>Vazgeç</Button><Button onClick={makeDraft}>Taslak oluştur</Button></>}>
        {draft && <div className="space-y-2 text-sm"><p className="text-slate-600">{fy} yılındaki her bütçe satırı için kullanılan tutar (ön taahhüt + taahhüt + gerçekleşen; kullanım yoksa bütçe) artış oranıyla {shiftFy(fy, 1)} yılına kopyalanır. Var olan satırlara dokunulmaz.</p>
          <label className="flex items-center gap-2">Artış %<input type="number" className="h-9 w-24 rounded-lg border border-slate-200 px-2" value={draft.pct} onChange={e => setDraft({ pct: Number(e.target.value) || 0 })} /></label></div>}
      </Modal>
    </div>
  );
}

function monthIndex(d: Date, fyStart: Date) {
  return (d.getFullYear() - fyStart.getFullYear()) * 12 + d.getMonth() - fyStart.getMonth();
}
