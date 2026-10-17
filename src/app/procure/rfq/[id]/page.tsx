'use client';

// RFQ detayı: şartlar, kalemler (gönderilince kilitli), tedarikçi davetleri (bağlantı / WhatsApp), elle teklif, gönder/kapat/iptal
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import { Card, Button, Modal } from '@/components/ui';
import MoneyInput from '@/components/MoneyInput';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { RfqStatusBadge, VendorStatusBadge } from '@/components/procure/RequestBits';
import { createClient } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetch-all';
import {
  PROCURE_SQL_1B, UNITS, fmtDateTime, loadPeople, openProcFile, peopleMap, procError, rfqLink, tl, useProcure, waNumber,
} from '@/lib/procure';
import { ArrowLeft, Ban, Copy, ExternalLink, Lock, MessageCircle, Paperclip, PencilLine, Plus, Printer, Save, Scale, Send, Square, Trash2 } from 'lucide-react';

export default function RfqDetailPage() {
  return (
    <div>
      <Header title="Teklif Toplama" subtitle="Satınalma" />
      <ProcureGate>{p => <RfqDetail p={p} />}</ProcureGate>
    </div>
  );
}

const toLocalInput = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function RfqDetail({ p }: { p: ReturnType<typeof useProcure> }) {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const canEdit = p.hasRole('buyer') || p.isAdmin;
  const [d, setD] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [terms, setTerms] = useState<any>(null);
  const [lines, setLines] = useState<any[] | null>(null);
  const [addV, setAddV] = useState<{ q: string } | null>(null);
  const [manual, setManual] = useState<any>(null);
  const [cancel, setCancel] = useState<string | null>(null);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    const r = await supabase.from('proc_rfqs').select('*').eq('id', id).maybeSingle();
    if (r.error) { setMissing(/relation|does not exist/i.test(r.error.message)); if (!missing) setMsg(r.error.message); return; }
    if (!r.data) { setD({ notFound: true }); return; }
    const [ls, vs, reqs, org, pol, people, vendors] = await Promise.all([
      supabase.from('proc_rfq_lines').select('*').eq('rfq_id', id).order('sort'),
      supabase.from('proc_rfq_vendors').select('*, customer:vendor_id(id, name, phone, email)').eq('rfq_id', id).order('created_at'),
      supabase.from('proc_requests').select('id, request_no, title, cost_center_id').in('id', r.data.request_ids || []),
      supabase.from('organizations').select('name').eq('id', r.data.organization_id).maybeSingle(),
      supabase.from('proc_policies').select('approved_vendor_list_required').maybeSingle(),
      loadPeople(supabase),
      fetchAll(() => supabase.from('proc_vendor_profiles').select('customer_id, status, category_ids, contact_name, contact_phone, contact_email, customer:customer_id(name, phone, email)')),
    ]);
    const rvIds = (vs.data || []).map((v: any) => v.id);
    const [qs, atts] = await Promise.all([
      rvIds.length ? supabase.from('proc_quotes').select('*').in('rfq_vendor_id', rvIds).eq('is_current', true) : Promise.resolve({ data: [] as any[] }),
      rvIds.length ? supabase.from('proc_attachments').select('*').eq('owner_type', 'quote').in('owner_id', rvIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    setD({ r: r.data, lines: ls.data || [], vendors: vs.data || [], reqs: reqs.data || [], org: org.data?.name || '', policy: pol.data, names: peopleMap(people),
      pool: vendors, quotes: qs.data || [], atts: atts.data || [] });
    setTerms({ title: r.data.title, deadline: toLocalInput(r.data.deadline), delivery_terms: r.data.delivery_terms || '', payment_terms: r.data.payment_terms || '', notes_to_vendors: r.data.notes_to_vendors || '' });
    setLines(null);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => PromiseLike<{ error: any }>, ok?: string) => {
    setBusy(true); setMsg('');
    const { error } = await fn();
    setBusy(false);
    if (error) { setMsg(procError(error, PROCURE_SQL_1B)); return false; }
    if (ok) setMsg(ok); await load(); return true;
  };

  const suggestions = useMemo(() => {
    if (!d) return [];
    const invited = new Set(d.vendors.map((v: any) => v.vendor_id));
    const onlyApproved = d.policy?.approved_vendor_list_required;
    return d.pool.filter((v: any) => !invited.has(v.customer_id) && v.status !== 'blocked' && (!onlyApproved || ['approved', 'conditional'].includes(v.status)))
      .map((v: any) => ({ ...v, match: d.r.category_id && (v.category_ids || []).includes(d.r.category_id) }))
      .sort((a: any, b: any) => Number(b.match) - Number(a.match) || Number(b.status === 'approved') - Number(a.status === 'approved') || (a.customer?.name || '').localeCompare(b.customer?.name || '', 'tr'));
  }, [d]);

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1B} /></div>;
  if (!d) return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;
  if (d.notFound) return <div className="p-6"><Card className="p-6 text-center text-sm text-slate-600">RFQ bulunamadı. <Link href="/procure/rfq" className="text-blue-700 underline">Listeye dön</Link></Card></div>;
  const r = d.r;
  const editable = canEdit && ['draft', 'sent'].includes(r.status);
  const quoteOf = (rvId: string) => d.quotes.find((q: any) => q.rfq_vendor_id === rvId);
  const validQuotes = d.vendors.filter((v: any) => !v.declined && Number(quoteOf(v.id)?.total_net) > 0).length;
  const inp = 'h-9 w-full rounded-lg border border-slate-200 px-2 text-sm disabled:bg-slate-50';

  const waText = (v: any) => {
    const who = v.contact_name || v.customer?.name || '';
    return `Merhaba ${who}, ${d.org} adına ${r.rfq_no} "${r.title}" için teklifinizi ${r.deadline ? fmtDateTime(r.deadline) + ' tarihine kadar ' : ''}aşağıdaki bağlantıdan iletebilirsiniz:\n${rfqLink(v.share_token)}`;
  };
  const copy = async (v: any) => { await navigator.clipboard.writeText(rfqLink(v.share_token)); setCopied(v.id); setTimeout(() => setCopied(''), 2000); };

  const saveTerms = () => run(() => supabase.from('proc_rfqs').update({ title: terms.title, deadline: terms.deadline ? new Date(terms.deadline).toISOString() : null,
    delivery_terms: terms.delivery_terms || null, payment_terms: terms.payment_terms || null, notes_to_vendors: terms.notes_to_vendors || null }).eq('id', r.id), 'Kaydedildi.');
  const saveLines = async () => {
    if (!lines) return;
    setBusy(true); setMsg('');
    try {
      const keep = new Set(lines.filter(l => l.id).map(l => l.id));
      const del = d.lines.filter((l: any) => !keep.has(l.id)).map((l: any) => l.id);
      if (del.length) { const x = await supabase.from('proc_rfq_lines').delete().in('id', del); if (x.error) throw x.error; }
      for (const [i, l] of lines.filter(l => l.description.trim() && l.quantity > 0).entries()) {
        const row = { description: l.description.trim(), quantity: l.quantity, unit: l.unit, spec_note: l.spec_note || null, sort: i };
        const x = l.id ? await supabase.from('proc_rfq_lines').update(row).eq('id', l.id) : await supabase.from('proc_rfq_lines').insert({ ...row, rfq_id: r.id });
        if (x.error) throw x.error;
      }
      await load();
    } catch (e: any) { setMsg(procError(e, PROCURE_SQL_1B)); } finally { setBusy(false); }
  };
  const invite = (v: any) => run(() => supabase.from('proc_rfq_vendors').insert({ rfq_id: r.id, vendor_id: v.customer_id, contact_name: v.contact_name || null,
    contact_phone: v.contact_phone || v.customer?.phone || null, contact_email: v.contact_email || v.customer?.email || null }));
  const openManual = (v: any) => {
    const q = quoteOf(v.id);
    setManual({ rv: v, valid_until: q?.valid_until || '', delivery_days: q?.delivery_days ?? '', payment_term_days: q?.payment_term_days ?? '', notes: q?.notes || '',
      lines: d.lines.map((l: any) => ({ rfq_line_id: l.id, label: `${l.description} · ${Number(l.quantity).toLocaleString('tr-TR')} ${l.unit}`, unit_price: null as number | null, discount_pct: 0, vat_rate: 20, brand_model: '', can_supply: true })) });
  };
  const saveManual = async () => {
    const m = manual;
    if (await run(() => supabase.rpc('proc_rfq_manual_quote', { p_rfq_vendor: m.rv.id, p: { valid_until: m.valid_until || null, delivery_days: m.delivery_days, payment_term_days: m.payment_term_days, notes: m.notes,
      lines: m.lines.map((l: any) => ({ rfq_line_id: l.rfq_line_id, unit_price: l.can_supply ? l.unit_price : null, discount_pct: l.discount_pct, vat_rate: l.vat_rate, brand_model: l.brand_model, can_supply: l.can_supply })) } }), 'Teklif kaydedildi.')) setManual(null);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 sm:p-6">
      <Link href="/procure/rfq" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><ArrowLeft className="h-3.5 w-3.5" />Teklif toplama</Link>
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">{r.rfq_no} · satınalma: {d.names[r.buyer_id] || '—'}</p>
            <h2 className="text-base font-semibold text-slate-900">{r.title}</h2>
            <p className="mt-1 text-xs text-slate-500">Talepler: {d.reqs.map((q: any) => <Link key={q.id} href={`/procure/talepler/${q.id}`} className="mr-2 text-blue-700 hover:underline">{q.request_no}</Link>)}
              · tahmini {tl(r.estimated_total)} · {validQuotes}/{r.min_quotes_required} asgari geçerli teklif</p>
          </div>
          <RfqStatusBadge status={r.status} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {canEdit && r.status === 'draft' && <Button size="sm" disabled={busy} onClick={() => run(() => supabase.rpc('proc_rfq_send', { p_id: r.id }), 'RFQ gönderildi. Bağlantıları tedarikçilere iletin.')}><Send className="h-3.5 w-3.5" />Gönder (bağlantıları aç)</Button>}
          {['sent', 'closed', 'pending_award', 'awarded'].includes(r.status) && <Link href={`/procure/rfq/${r.id}/karsilastir`} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B3A5C] px-3 py-1.5 text-xs font-medium text-white"><Scale className="h-3.5 w-3.5" />Karşılaştır ve ödül ver</Link>}
          {canEdit && r.status === 'sent' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => { if (confirm('Teklif alımı kapatılsın mı? Tedarikçiler artık teklif güncelleyemez.')) run(() => supabase.rpc('proc_rfq_close', { p_id: r.id }), 'Teklif alımı kapatıldı.'); }}><Square className="h-3.5 w-3.5" />Teklif alımını kapat</Button>}
          {['awarded', 'pending_award'].includes(r.status) && <a href={`/procure/rfq/${r.id}/print`} target="_blank" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700"><Printer className="h-3.5 w-3.5" />Karar tutanağı (PDF)</a>}
          {canEdit && !['awarded', 'cancelled'].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => setCancel('')}><Ban className="h-3.5 w-3.5" />İptal</Button>}
        </div>
        {msg && <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${/Kaydedildi|gönderildi|kapatıldı/.test(msg) ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{msg}</p>}
      </Card>

      {/* Şartlar */}
      <Card className="p-4">
        <p className="mb-2 text-sm font-semibold text-slate-800">Şartlar</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-slate-600 sm:col-span-2">Başlık<input disabled={!editable} className={inp} value={terms.title} onChange={e => setTerms({ ...terms, title: e.target.value })} /></label>
          <label className="text-xs text-slate-600">Son teklif tarihi<input disabled={!editable} type="datetime-local" className={inp} value={terms.deadline} onChange={e => setTerms({ ...terms, deadline: e.target.value })} /></label>
          <label className="text-xs text-slate-600">Ödeme şartı<input disabled={!editable} className={inp} value={terms.payment_terms} onChange={e => setTerms({ ...terms, payment_terms: e.target.value })} placeholder="Örn. 30 gün vade" /></label>
          <label className="text-xs text-slate-600 sm:col-span-2">Teslim şartı<input disabled={!editable} className={inp} value={terms.delivery_terms} onChange={e => setTerms({ ...terms, delivery_terms: e.target.value })} placeholder="Örn. okul adresine teslim, nakliye dahil" /></label>
          <label className="text-xs text-slate-600 sm:col-span-2">Tedarikçilere not<textarea disabled={!editable} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" rows={2} value={terms.notes_to_vendors} onChange={e => setTerms({ ...terms, notes_to_vendors: e.target.value })} /></label>
        </div>
        {editable && <Button size="sm" className="mt-2" disabled={busy} onClick={saveTerms}><Save className="h-3.5 w-3.5" />Şartları kaydet</Button>}
      </Card>

      {/* Kalemler */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">Kalemler{r.status !== 'draft' && <span className="inline-flex items-center gap-1 text-[11px] font-normal text-slate-500"><Lock className="h-3 w-3" />gönderildi, kilitli</span>}</p>
          {canEdit && r.status === 'draft' && !lines && <Button size="sm" variant="secondary" onClick={() => setLines(d.lines.map((l: any) => ({ ...l })))}><PencilLine className="h-3.5 w-3.5" />Düzenle</Button>}
        </div>
        {!lines ? (
          <ul className="divide-y divide-slate-100">{d.lines.map((l: any) => (
            <li key={l.id} className="flex gap-3 px-4 py-2 text-sm"><span className="flex-1 text-slate-800">{l.description}{l.spec_note && <span className="block text-xs text-slate-500">{l.spec_note}</span>}</span><span className="text-slate-600">{Number(l.quantity).toLocaleString('tr-TR')} {l.unit}</span></li>
          ))}</ul>
        ) : (
          <div className="space-y-2 p-3">
            {lines.map((l, i) => (
              <div key={l.id || i} className="grid grid-cols-[1fr_80px_100px_auto] gap-2">
                <input className={inp} value={l.description} onChange={e => setLines(ls => ls!.map((x, k) => k === i ? { ...x, description: e.target.value } : x))} />
                <input className={inp} type="number" min={0} value={l.quantity} onChange={e => setLines(ls => ls!.map((x, k) => k === i ? { ...x, quantity: Number(e.target.value) } : x))} />
                <select className={inp} value={l.unit} onChange={e => setLines(ls => ls!.map((x, k) => k === i ? { ...x, unit: e.target.value } : x))}>{[...new Set([l.unit, ...UNITS])].map(u => <option key={u}>{u}</option>)}</select>
                <button aria-label="Sil" className="text-slate-400 hover:text-rose-600" onClick={() => setLines(ls => ls!.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></button>
                <input className={`${inp} col-span-4`} value={l.spec_note || ''} onChange={e => setLines(ls => ls!.map((x, k) => k === i ? { ...x, spec_note: e.target.value } : x))} placeholder="Teknik şartname notu" />
              </div>
            ))}
            <button onClick={() => setLines(ls => [...ls!, { description: '', quantity: 1, unit: 'Adet', spec_note: '' }])} className="flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-sm text-slate-600"><Plus className="h-4 w-4" />Kalem ekle</button>
            <div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setLines(null)}>Vazgeç</Button><Button size="sm" disabled={busy} onClick={saveLines}>Kaydet</Button></div>
          </div>
        )}
      </Card>

      {/* Tedarikçiler */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Tedarikçiler ({d.vendors.length})</p>
          {editable && <Button size="sm" variant="secondary" onClick={() => setAddV({ q: '' })}><Plus className="h-3.5 w-3.5" />Tedarikçi davet et</Button>}
        </div>
        {d.vendors.length === 0 ? <p className="text-xs text-slate-400">Henüz tedarikçi yok. Kategoriye uygun onaylı tedarikçiler öneri olarak gelir.</p> : (
          <ul className="divide-y divide-slate-100">{d.vendors.map((v: any) => {
            const q = quoteOf(v.id);
            const files = d.atts.filter((a: any) => a.owner_id === v.id);
            const phone = waNumber(v.contact_phone || v.customer?.phone);
            return (
              <li key={v.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link href={`/procure/tedarikciler/${v.vendor_id}`} className="min-w-0 flex-1 truncate font-medium text-slate-800 hover:text-blue-700">{v.customer?.name}</Link>
                  <span className="text-xs text-slate-500">
                    {v.declined ? <span className="text-rose-600">Teklif vermeyecek{v.decline_reason ? `: ${v.decline_reason}` : ''}</span>
                      : q ? <span className="font-medium text-emerald-700">{tl(q.total_net)} · {q.version}. sürüm{q.is_manual ? ' · elle' : ''} · {fmtDateTime(q.submitted_at)}</span>
                      : v.view_count ? `${v.view_count} kez açtı, teklif yok` : r.status === 'draft' ? 'gönderilmedi' : 'henüz açmadı'}
                  </span>
                </div>
                {r.status !== 'draft' && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button onClick={() => copy(v)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"><Copy className="h-3 w-3" />{copied === v.id ? 'Kopyalandı' : 'Bağlantıyı kopyala'}</button>
                    <a href={`https://wa.me/${phone}?text=${encodeURIComponent(waText(v))}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"><MessageCircle className="h-3 w-3" />WhatsApp{!phone && ' (numara yok)'}</a>
                    <a href={`/rfq/${v.share_token}`} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"><ExternalLink className="h-3 w-3" />Tedarikçi sayfası</a>
                    {canEdit && ['sent', 'closed'].includes(r.status) && <button onClick={() => openManual(v)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"><PencilLine className="h-3 w-3" />Elle teklif gir</button>}
                    {files.map((a: any) => <button key={a.id} onClick={() => openProcFile(supabase, a.storage_path, a.file_name).catch(e => setMsg(e.message))} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-blue-700"><Paperclip className="h-3 w-3" />{a.file_name}</button>)}
                  </div>
                )}
                {editable && !q && <button className="mt-1 text-[11px] text-slate-400 hover:text-rose-600" onClick={() => run(() => supabase.from('proc_rfq_vendors').delete().eq('id', v.id))}>Davetten çıkar</button>}
              </li>
            );
          })}</ul>
        )}
      </Card>

      <Modal isOpen={!!addV} onClose={() => setAddV(null)} title="Tedarikçi davet et" size="lg">
        {addV && (
          <div className="space-y-2">
            <input autoFocus className={inp} value={addV.q} onChange={e => setAddV({ q: e.target.value })} placeholder="Tedarikçi ara" />
            {d.policy?.approved_vendor_list_required && <p className="text-[11px] text-amber-700">Kurum politikası: yalnızca onaylı / şartlı onaylı tedarikçiler listelenir.</p>}
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {suggestions.filter((v: any) => !addV.q || (v.customer?.name || '').toLocaleLowerCase('tr').includes(addV.q.toLocaleLowerCase('tr'))).slice(0, 50).map((v: any) => (
                <li key={v.customer_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{v.customer?.name}{v.match && <span className="ml-1 text-[11px] text-emerald-700">(kategoriye uygun)</span>}</span>
                  <VendorStatusBadge status={v.status} />
                  <Button size="sm" disabled={busy} onClick={() => invite(v)}>Davet et</Button>
                </li>
              ))}
              {suggestions.length === 0 && <li className="px-3 py-4 text-center text-xs text-slate-500">Uygun tedarikçi yok. <Link href="/procure/tedarikciler" className="text-blue-700">Tedarikçi ekleyin</Link>.</li>}
            </ul>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!manual} onClose={() => setManual(null)} title={manual ? `Elle teklif · ${manual.rv.customer?.name}` : ''} size="xl"
        footer={<><Button variant="secondary" onClick={() => setManual(null)}>Vazgeç</Button><Button disabled={busy} onClick={saveManual}>Teklifi kaydet</Button></>}>
        {manual && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Telefonla veya e-postayla gelen teklifi girin. Fiyatlar TL, KDV hariç birim fiyattır. Kaydedilen teklif yeni sürüm olarak saklanır.</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Kalem</th><th className="py-1">Birim fiyat ₺</th><th className="py-1">İsk. %</th><th className="py-1">KDV %</th><th className="py-1">Marka/model</th><th className="py-1">Verebilir</th></tr></thead>
              <tbody>{manual.lines.map((l: any, i: number) => {
                const set = (patch: any) => setManual((m: any) => ({ ...m, lines: m.lines.map((x: any, k: number) => k === i ? { ...x, ...patch } : x) }));
                return (
                  <tr key={l.rfq_line_id} className={l.can_supply ? '' : 'opacity-50'}>
                    <td className="py-1 pr-2 text-xs">{l.label}</td>
                    <td className="py-1 pr-2"><MoneyInput className="h-8 w-28 rounded border border-slate-200 px-2 text-sm" value={l.unit_price} onChange={v => set({ unit_price: v })} /></td>
                    <td className="py-1 pr-2"><input type="number" min={0} max={100} className="h-8 w-16 rounded border border-slate-200 px-2 text-sm" value={l.discount_pct} onChange={e => set({ discount_pct: Number(e.target.value) })} /></td>
                    <td className="py-1 pr-2"><select className="h-8 rounded border border-slate-200 px-1 text-sm" value={l.vat_rate} onChange={e => set({ vat_rate: Number(e.target.value) })}>{[0, 1, 10, 20].map(v => <option key={v} value={v}>{v}</option>)}</select></td>
                    <td className="py-1 pr-2"><input className="h-8 w-32 rounded border border-slate-200 px-2 text-sm" value={l.brand_model} onChange={e => set({ brand_model: e.target.value })} /></td>
                    <td className="py-1"><input type="checkbox" checked={l.can_supply} onChange={e => set({ can_supply: e.target.checked })} /></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-slate-600">Teslim süresi (gün)<input type="number" className={inp} value={manual.delivery_days} onChange={e => setManual({ ...manual, delivery_days: e.target.value })} /></label>
              <label className="text-xs text-slate-600">Vade (gün)<input type="number" className={inp} value={manual.payment_term_days} onChange={e => setManual({ ...manual, payment_term_days: e.target.value })} /></label>
              <label className="text-xs text-slate-600">Geçerlilik<input type="date" className={inp} value={manual.valid_until} onChange={e => setManual({ ...manual, valid_until: e.target.value })} /></label>
              <label className="text-xs text-slate-600 sm:col-span-3">Not<input className={inp} value={manual.notes} onChange={e => setManual({ ...manual, notes: e.target.value })} placeholder="Örn. telefonla alındı, 12.10 Ayşe Hanım" /></label>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={cancel !== null} onClose={() => setCancel(null)} title="RFQ iptal"
        footer={<><Button variant="secondary" onClick={() => setCancel(null)}>Vazgeç</Button><Button variant="danger" disabled={busy || !cancel?.trim()} onClick={async () => { if (await run(() => supabase.rpc('proc_rfq_cancel', { p_id: r.id, p_reason: cancel }), 'RFQ iptal edildi.')) setCancel(null); }}>İptal et</Button></>}>
        <p className="mb-2 text-xs text-slate-500">Bağlı talepler (başka açık RFQ'da değilse) yeniden “Onaylandı” durumuna döner.</p>
        <textarea autoFocus className="w-full rounded-lg border border-slate-200 p-2 text-sm" rows={3} value={cancel || ''} onChange={e => setCancel(e.target.value)} placeholder="İptal gerekçesi (zorunlu)" />
      </Modal>
    </div>
  );
}
