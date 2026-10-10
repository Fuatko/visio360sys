'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge, Modal, Input, Select, Textarea } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { ROYALTY_STATUS, royaltyPreview, monthLabel, lastMonths } from '@/lib/franchise';
import { FileLink } from '@/components/portal/common';
import { Plus, CheckCircle2, XCircle, Pencil, AlertTriangle } from 'lucide-react';

interface Props { supabase: any; agreements: any[]; reports: any[]; dealers: any[]; onChanged: () => void; focusDealer: string | null; clearFocus: () => void }
const tl = (v: any) => `₺${formatMoney(Number(v) || 0)}`;
const EMPTY_AG = { dealer_id: '', royalty_pct: '6', marketing_pct: '2', min_royalty: '0', fixed_fee: '0', basis: 'net', due_day: '10', start_date: '', end_date: '', franchise_fee: '', is_active: true, notes: '' };

export default function Royalty({ supabase, agreements, reports, dealers, onChanged, focusDealer, clearFocus }: Props) {
  const months = useMemo(() => lastMonths(12), []);
  const [period, setPeriod] = useState(months[0]);
  const [ag, setAg] = useState<any | null>(null);
  const [entry, setEntry] = useState<any | null>(null);
  const [reject, setReject] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!focusDealer) return;
    const ex = agreements.find(a => a.dealer_id === focusDealer);
    setAg(ex ? clean(ex) : { ...EMPTY_AG, dealer_id: focusDealer });
    clearFocus();
  }, [focusDealer]);

  const dname = (id: string) => dealers.find(d => d.id === id)?.name || '-';
  const active = agreements.filter(a => a.is_active);
  const rowsFor = (p: string) => active.map(a => ({ a, r: reports.find(r => r.dealer_id === a.dealer_id && r.period?.slice(0, 10) === p) }));
  const rows = rowsFor(period);
  const sum = (k: string, list = rows) => list.reduce((s, x) => s + (x.r && x.r.status !== 'rejected' ? Number(x.r[k]) || 0 : 0), 0);
  const reported = rows.filter(x => x.r && x.r.status !== 'rejected').length;
  const pending = reports.filter(r => r.status === 'submitted');

  // Ağ cirosu trendi (son 6 ay)
  const trend = months.slice(0, 6).reverse().map(p => ({ p, v: rowsFor(p).reduce((s, x) => s + (x.r && x.r.status !== 'rejected' ? Number(x.r.gross_sales) || 0 : 0), 0) }));
  const maxT = Math.max(1, ...trend.map(t => t.v));

  const saveAg = async () => {
    if (!ag.dealer_id) { alert('Franchise seçin.'); return; }
    const num = (v: any) => (v === '' || v === null ? 0 : Number(v));
    const payload = { dealer_id: ag.dealer_id, royalty_pct: num(ag.royalty_pct), marketing_pct: num(ag.marketing_pct), min_royalty: num(ag.min_royalty), fixed_fee: num(ag.fixed_fee),
      basis: ag.basis, due_day: Math.min(28, Math.max(1, num(ag.due_day) || 10)), start_date: ag.start_date || null, end_date: ag.end_date || null,
      franchise_fee: ag.franchise_fee === '' ? null : Number(ag.franchise_fee), is_active: !!ag.is_active, notes: ag.notes || null };
    const { error } = ag.id ? await supabase.from('royalty_agreements').update(payload).eq('id', ag.id) : await supabase.from('royalty_agreements').insert([payload]);
    if (error) { alert(error.message.includes('duplicate') ? 'Bu franchise için zaten bir anlaşma var.' : error.message); return; }
    setAg(null); onChanged();
  };

  const saveEntry = async () => {
    if (entry.gross_sales === '' || Number(entry.gross_sales) < 0) { alert('Ciroyu girin.'); return; }
    const payload = { dealer_id: entry.dealer_id, period: entry.period, gross_sales: Number(entry.gross_sales), note: entry.note || null, reported_by: 'staff', status: 'submitted' };
    const { error } = entry.id ? await supabase.from('royalty_reports').update({ gross_sales: payload.gross_sales, note: payload.note, status: 'submitted', review_note: null }).eq('id', entry.id)
      : await supabase.from('royalty_reports').insert([payload]);
    if (error) { alert(error.message); return; }
    setEntry(null); onChanged();
  };

  const bill = async (r: any) => {
    if (!confirm(`${dname(r.dealer_id)} · ${monthLabel(r.period)}\nToplam ${tl(r.total_amount)} onaylanıp tahsilata (cari hesaba) aktarılsın mı?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('royalty_bill', { p_id: r.id });
    setBusy(false);
    if (error) alert(error.message); else onChanged();
  };
  const billAll = async () => {
    const list = rows.filter(x => x.r?.status === 'submitted' || x.r?.status === 'approved').map(x => x.r);
    if (!list.length || !confirm(`${list.length} bildirim onaylanıp tahsilata aktarılsın mı? Toplam ${tl(list.reduce((s, r) => s + Number(r.total_amount), 0))}`)) return;
    setBusy(true);
    for (const r of list) { const { error } = await supabase.rpc('royalty_bill', { p_id: r.id }); if (error) { alert(`${dname(r.dealer_id)}: ${error.message}`); break; } }
    setBusy(false); onChanged();
  };
  const doReject = async () => {
    if (!reject.note?.trim()) { alert('Ret nedenini yazın (franchise portalında görünür).'); return; }
    const { error } = await supabase.from('royalty_reports').update({ status: 'rejected', review_note: reject.note, reviewed_at: new Date().toISOString() }).eq('id', reject.id);
    if (error) alert(error.message); else { setReject(null); onChanged(); }
  };

  const preview = entry ? royaltyPreview(Number(entry.gross_sales) || 0, agreements.find(a => a.dealer_id === entry.dealer_id)) : null;

  return (
    <div className="space-y-4">
      {pending.length > 0 && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" />{pending.length} ciro bildirimi onay bekliyor.</Card>}

      <div className="flex flex-wrap items-center gap-2">
        <select value={period} onChange={e => setPeriod(e.target.value)} className="h-9 rounded-lg border px-3 text-sm">
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <span className="text-sm text-slate-500">dönemi</span>
        <span className="flex-1" />
        <Button variant="secondary" onClick={() => setAg({ ...EMPTY_AG })}><Plus className="h-4 w-4" />Royalty anlaşması</Button>
        <Button variant="success" disabled={busy} onClick={billAll}><CheckCircle2 className="h-4 w-4" />Dönemi onayla ve tahsilata aktar</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4"><p className="text-xl font-bold">{tl(sum('gross_sales'))}</p><p className="text-xs text-slate-500">Bildirilen ağ cirosu</p></Card>
        <Card className="p-4"><p className="text-xl font-bold text-indigo-600">{tl(sum('royalty_amount'))}</p><p className="text-xs text-slate-500">Royalty</p></Card>
        <Card className="p-4"><p className="text-xl font-bold text-purple-600">{tl(sum('marketing_amount'))}</p><p className="text-xs text-slate-500">Reklam fonu</p></Card>
        <Card className="p-4"><p className="text-xl font-bold text-green-600">{tl(sum('total_amount'))}</p><p className="text-xs text-slate-500">Toplam tahakkuk</p></Card>
        <Card className="p-4"><p className={`text-xl font-bold ${reported < active.length ? 'text-red-600' : ''}`}>{reported}/{active.length}</p><p className="text-xs text-slate-500">Bildirim yapan franchise</p></Card>
      </div>

      <Card className="p-4">
        <p className="mb-2 text-sm font-semibold">{monthLabel(period)} — franchise bazında</p>
        {active.length === 0 ? <p className="text-sm text-slate-500">Aktif royalty anlaşması yok. Franchise başvurusu "Açıldı" olduğunda kart oluşturup anlaşma tanımlayın.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Franchise</th><th className="text-right">Ciro</th><th className="text-right">Royalty</th><th className="text-right">Reklam fonu</th><th className="text-right">Sabit</th><th className="text-right">Toplam</th><th className="pl-4">Vade</th><th>Durum</th><th /></tr></thead>
              <tbody>{rows.map(({ a, r }) => (
                <tr key={a.id} className="border-b">
                  <td className="py-2"><p className="font-medium">{dname(a.dealer_id)}</p><p className="text-[11px] text-slate-400">%{Number(a.royalty_pct)} + %{Number(a.marketing_pct)} fon{Number(a.min_royalty) ? ` · asgari ${tl(a.min_royalty)}` : ''}</p></td>
                  {r ? <>
                    <td className="text-right">{tl(r.gross_sales)}{r.reported_by === 'dealer' && <p className="text-[10px] text-slate-400">franchise bildirdi</p>}</td>
                    <td className="text-right">{tl(r.royalty_amount)}{Number(r.min_adjustment) > 0 && <p className="text-[10px] text-amber-600">asgariye tamamlandı</p>}</td>
                    <td className="text-right">{tl(r.marketing_amount)}</td><td className="text-right">{tl(r.fixed_fee)}</td>
                    <td className="text-right font-semibold">{tl(r.total_amount)}</td>
                    <td className="pl-4 text-xs">{r.due_date ? new Date(r.due_date).toLocaleDateString('tr-TR') : '-'}</td>
                    <td><Badge variant={ROYALTY_STATUS[r.status]?.variant}>{ROYALTY_STATUS[r.status]?.label}</Badge>{r.attachment_url && <div><FileLink supabase={supabase} value={r.attachment_url} /></div>}{r.note && <p className="text-[10px] text-slate-500">“{r.note}”</p>}</td>
                    <td className="whitespace-nowrap text-right">
                      {['submitted', 'approved'].includes(r.status) && <>
                        <button title="Onayla ve tahsilata aktar" disabled={busy} onClick={() => bill(r)}><CheckCircle2 className="h-5 w-5 text-green-600" /></button>{' '}
                        <button title="Reddet" onClick={() => setReject({ id: r.id, note: '' })}><XCircle className="h-5 w-5 text-red-500" /></button>{' '}
                      </>}
                      {r.status !== 'billed' && <button title="Düzelt" onClick={() => setEntry({ id: r.id, dealer_id: a.dealer_id, period, gross_sales: String(r.gross_sales), note: r.note || '' })}><Pencil className="h-4 w-4 text-slate-400" /></button>}
                    </td>
                  </> : <>
                    <td colSpan={6} className="text-xs text-red-600">Bildirim yapılmadı</td>
                    <td><Badge variant="danger">Eksik</Badge></td>
                    <td className="text-right"><Button size="sm" variant="secondary" onClick={() => setEntry({ dealer_id: a.dealer_id, period, gross_sales: '', note: '' })}>Ciro gir</Button></td>
                  </>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold">Ağ cirosu (son 6 ay)</p>
          <div className="flex h-36 items-end gap-2">
            {trend.map(t => (
              <div key={t.p} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-slate-500">{t.v ? (t.v >= 1e6 ? `₺${(t.v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} mn` : `₺${formatMoney(t.v)}`) : ''}</span>
                <div className="w-full rounded-t bg-indigo-500" style={{ height: `${Math.max(2, (t.v / maxT) * 100)}px` }} />
                <span className="text-[10px] text-slate-500">{new Date(t.p + 'T00:00:00').toLocaleDateString('tr-TR', { month: 'short' })}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Royalty anlaşmaları</p>
          {agreements.length === 0 ? <p className="text-sm text-slate-500">Anlaşma yok.</p> : (
            <div className="max-h-48 space-y-1 overflow-auto">{agreements.map(a => (
              <button key={a.id} onClick={() => setAg(clean(a))} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-50">
                <span className="flex-1 font-medium">{dname(a.dealer_id)}</span>
                <span className="text-xs text-slate-500">%{Number(a.royalty_pct)} royalty · %{Number(a.marketing_pct)} fon · vade ayın {a.due_day}'i</span>
                {!a.is_active && <Badge variant="default">Pasif</Badge>}
              </button>
            ))}</div>
          )}
        </Card>
      </div>

      <Modal isOpen={!!ag} onClose={() => setAg(null)} title="Royalty anlaşması" size="lg"
        footer={<><Button variant="secondary" onClick={() => setAg(null)}>İptal</Button><Button onClick={saveAg}>Kaydet</Button></>}>
        {ag && (
          <div className="space-y-3">
            <Select label="Franchise *" value={ag.dealer_id} disabled={!!ag.id} onChange={e => setAg({ ...ag, dealer_id: e.target.value })}
              options={[{ value: '', label: 'Seçin' }, ...dealers.map(d => ({ value: d.id, label: d.name }))]} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Royalty (%)" type="number" step="0.1" value={ag.royalty_pct} onChange={e => setAg({ ...ag, royalty_pct: e.target.value })} />
              <Input label="Reklam fonu (%)" type="number" step="0.1" value={ag.marketing_pct} onChange={e => setAg({ ...ag, marketing_pct: e.target.value })} />
              <Select label="Ciro esası" value={ag.basis} onChange={e => setAg({ ...ag, basis: e.target.value })} options={[{ value: 'net', label: 'KDV hariç (net)' }, { value: 'gross', label: 'KDV dahil' }]} />
              <Input label="Aylık asgari royalty (₺)" type="number" value={ag.min_royalty} onChange={e => setAg({ ...ag, min_royalty: e.target.value })} />
              <Input label="Sabit aylık ücret (₺)" type="number" value={ag.fixed_fee} onChange={e => setAg({ ...ag, fixed_fee: e.target.value })} />
              <Input label="Ödeme günü (sonraki ay)" type="number" min={1} max={28} value={ag.due_day} onChange={e => setAg({ ...ag, due_day: e.target.value })} />
              <Input label="Başlangıç" type="date" value={ag.start_date} onChange={e => setAg({ ...ag, start_date: e.target.value })} />
              <Input label="Bitiş" type="date" value={ag.end_date} onChange={e => setAg({ ...ag, end_date: e.target.value })} />
              <Input label="Giriş bedeli (₺)" type="number" value={ag.franchise_fee} onChange={e => setAg({ ...ag, franchise_fee: e.target.value })} />
            </div>
            <Textarea label="Not" rows={2} value={ag.notes} onChange={e => setAg({ ...ag, notes: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ag.is_active} onChange={e => setAg({ ...ag, is_active: e.target.checked })} />Aktif</label>
            <p className="text-xs text-slate-500">Örnek: 1.000.000 ₺ ciroda {royaltyPreview(1000000, ag).total ? tl(royaltyPreview(1000000, ag).total) : '-'} tahakkuk eder. Franchise ciroyu portaldan bildirir, siz onaylayınca tutar cari hesabına "Alacak" olarak düşer.</p>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!entry} onClose={() => setEntry(null)} title={entry ? `${dname(entry.dealer_id)} · ${monthLabel(entry.period)}` : ''}
        footer={<><Button variant="secondary" onClick={() => setEntry(null)}>İptal</Button><Button onClick={saveEntry}>Kaydet</Button></>}>
        {entry && (
          <div className="space-y-3">
            <Input label="Aylık ciro (₺)" type="number" value={entry.gross_sales} onChange={e => setEntry({ ...entry, gross_sales: e.target.value })} />
            <Input label="Not" value={entry.note} onChange={e => setEntry({ ...entry, note: e.target.value })} />
            {preview && <div className="rounded-lg bg-slate-50 p-3 text-sm">Royalty {tl(preview.royalty)}{preview.minAdj > 0 ? ' (asgariye tamamlandı)' : ''} · Fon {tl(preview.marketing)} · Sabit {tl(preview.fixed)} · <b>Toplam {tl(preview.total)}</b></div>}
          </div>
        )}
      </Modal>

      <Modal isOpen={!!reject} onClose={() => setReject(null)} title="Ciro bildirimini reddet"
        footer={<><Button variant="secondary" onClick={() => setReject(null)}>İptal</Button><Button variant="danger" onClick={doReject}>Reddet</Button></>}>
        {reject && <Textarea label="Neden (franchise görür)" rows={3} value={reject.note} onChange={e => setReject({ ...reject, note: e.target.value })} placeholder="Z raporu / POS özeti ile tutmuyor, lütfen kontrol edip tekrar bildirin." />}
      </Modal>
    </div>
  );
}

const clean = (a: any) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : v]));
