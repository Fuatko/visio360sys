'use client';

// Tedarikçi profili: statü, kategoriler, iletişim, IBAN, belgeler (geçerlilik), teklif geçmişi
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import { Card, Button, Modal } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import { RfqStatusBadge, VendorStatusBadge } from '@/components/procure/RequestBits';
import IssuePanel from '@/components/procure/IssuePanel';
import { createClient } from '@/lib/supabase';
import {
  Category, DECISION_LABEL, GRADE_CLS, PROCURE_SQL_1B, VENDOR_DOC_TYPES, VENDOR_STATUS, VendorDoc, VendorStatus, docExpired, docExpiringSoon, fmtDate, openProcFile, procError, tl, uploadProcFile,
} from '@/lib/procure';
import { AlertTriangle, ArrowLeft, ClipboardCheck, FileText, Paperclip, Plus, Save, Trash2 } from 'lucide-react';

export default function VendorDetailPage() {
  return (
    <div>
      <Header title="Tedarikçi" subtitle="Satınalma" />
      <ProcureGate>{p => <VendorDetail canEdit={p.hasRole('buyer') || p.isAdmin} canOpenIssue={p.hasRole('buyer') || p.isAdmin || p.hasRole('receiver')} />}</ProcureGate>
    </div>
  );
}

function VendorDetail({ canEdit, canOpenIssue }: { canEdit: boolean; canOpenIssue: boolean }) {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [v, setV] = useState<any>(undefined);
  const [f, setF] = useState<any>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [hist, setHist] = useState<any[]>([]);
  const [evals, setEvals] = useState<any[]>([]);
  const [missing, setMissing] = useState(false);
  const [msg, setMsg] = useState('');
  const [doc, setDoc] = useState<{ type: string; valid_until: string; file: File | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await supabase.from('proc_vendor_profiles').select('*, customer:customer_id(id, name, tax_number, tax_office, email, phone, address, city)').eq('customer_id', id).maybeSingle();
    if (r.error) { setMissing(/relation|does not exist/i.test(r.error.message)); return; }
    setV(r.data); setF(r.data ? { status: r.data.status, category_ids: r.data.category_ids || [], contact_name: r.data.contact_name || '', contact_email: r.data.contact_email || '', contact_phone: r.data.contact_phone || '', bank_iban: r.data.bank_iban || '', notes: r.data.notes || '', next_evaluation_due: r.data.next_evaluation_due || '' } : null);
    const [c, rv] = await Promise.all([
      supabase.from('proc_categories').select('*').order('sort').order('name'),
      supabase.from('proc_rfq_vendors').select('id, responded_at, declined, view_count, rfq:rfq_id(id, rfq_no, title, status, created_at)').eq('vendor_id', id).order('created_at', { ascending: false }),
    ]);
    setCats(c.data || []);
    const ev = await supabase.from('proc_vendor_evaluations').select('*').eq('vendor_id', id).order('created_at', { ascending: false });
    setEvals(ev.error ? [] : ev.data || []);
    const rvIds = (rv.data || []).map((x: any) => x.id);
    const [qs, aw] = await Promise.all([
      rvIds.length ? supabase.from('proc_quotes').select('rfq_vendor_id, total_net').eq('is_current', true).in('rfq_vendor_id', rvIds) : Promise.resolve({ data: [] as any[] }),
      rvIds.length ? supabase.from('proc_rfq_awards').select('rfq_vendor_id, line_total').in('rfq_vendor_id', rvIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    setHist((rv.data || []).map((x: any) => ({ ...x, quote: (qs.data || []).find((q: any) => q.rfq_vendor_id === x.id),
      awarded: (aw.data || []).filter((a: any) => a.rfq_vendor_id === x.id).reduce((s: number, a: any) => s + Number(a.line_total), 0) })));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true); setMsg('');
    const { error } = await supabase.from('proc_vendor_profiles').update({ ...f, next_evaluation_due: f.next_evaluation_due || null }).eq('customer_id', id);
    setBusy(false); setMsg(error ? procError(error, PROCURE_SQL_1B) : 'Kaydedildi.'); load();
  };

  const addDoc = async () => {
    if (!doc) return;
    setBusy(true); setMsg('');
    try {
      let attachment_id: string | null = null, file_name: string | null = null;
      if (doc.file) { attachment_id = await uploadProcFile(supabase, doc.file, `vendor/${id}`, { type: 'vendor', id }); file_name = doc.file.name; }
      const docs: VendorDoc[] = [...(v.documents || []), { type: doc.type, valid_until: doc.valid_until || null, attachment_id, file_name }];
      const { error } = await supabase.from('proc_vendor_profiles').update({ documents: docs }).eq('customer_id', id);
      if (error) throw error;
      setDoc(null); await load();
    } catch (e: any) { setMsg(procError(e, PROCURE_SQL_1B)); } finally { setBusy(false); }
  };
  const removeDoc = async (i: number) => {
    if (!confirm('Belge kaydı silinsin mi?')) return;
    const d: VendorDoc = v.documents[i];
    if (d.attachment_id) {
      const { data } = await supabase.from('proc_attachments').select('storage_path').eq('id', d.attachment_id).maybeSingle();
      if (data?.storage_path) await supabase.storage.from('procure-files').remove([data.storage_path]);
      await supabase.from('proc_attachments').delete().eq('id', d.attachment_id);
    }
    await supabase.from('proc_vendor_profiles').update({ documents: (v.documents || []).filter((_: any, k: number) => k !== i) }).eq('customer_id', id);
    load();
  };
  const openDoc = async (d: VendorDoc) => {
    const { data } = await supabase.from('proc_attachments').select('storage_path, file_name').eq('id', d.attachment_id).maybeSingle();
    if (data) openProcFile(supabase, data.storage_path, data.file_name).catch(e => setMsg(e.message));
  };

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1B} /></div>;
  if (v === undefined) return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-[#1B3A5C]" /></div>;
  if (!v) return <div className="p-6"><Card className="p-6 text-center text-sm text-slate-600">Tedarikçi profili bulunamadı. <Link href="/procure/tedarikciler" className="text-blue-700 underline">Tedarikçilere dön</Link></Card></div>;
  const inp = 'h-9 w-full rounded-lg border border-slate-200 px-2 text-sm disabled:bg-slate-50';
  const docs: VendorDoc[] = v.documents || [];

  return (
    <div className="mx-auto max-w-4xl space-y-3 p-3 sm:p-6">
      <Link href="/procure/tedarikciler" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><ArrowLeft className="h-3.5 w-3.5" />Tedarikçiler</Link>
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">{v.customer?.name}</h2>
            <p className="text-xs text-slate-500">{v.customer?.tax_number ? `VKN/TCKN ${v.customer.tax_number}` : 'Vergi no yok'}{v.customer?.tax_office ? ` · ${v.customer.tax_office}` : ''}{v.customer?.city ? ` · ${v.customer.city}` : ''} · <Link href={`/customers/${v.customer_id}`} className="text-blue-700">cari kart</Link></p>
          </div>
          <VendorStatusBadge status={v.status} />
          {v.grade && <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold">Not {v.grade}{v.score != null ? ` · ${Number(v.score)}` : ''}</span>}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-slate-600">Statü<select disabled={!canEdit} className={inp} value={f.status} onChange={e => setF({ ...f, status: e.target.value as VendorStatus })}>{Object.entries(VENDOR_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select></label>
          <label className="text-xs text-slate-600">Sonraki değerlendirme<input disabled={!canEdit} type="date" className={inp} value={f.next_evaluation_due} onChange={e => setF({ ...f, next_evaluation_due: e.target.value })} /></label>
          <label className="text-xs text-slate-600">Yetkili<input disabled={!canEdit} className={inp} value={f.contact_name} onChange={e => setF({ ...f, contact_name: e.target.value })} /></label>
          <label className="text-xs text-slate-600">Telefon (WhatsApp)<input disabled={!canEdit} className={inp} value={f.contact_phone} onChange={e => setF({ ...f, contact_phone: e.target.value })} placeholder={v.customer?.phone || ''} /></label>
          <label className="text-xs text-slate-600">E-posta<input disabled={!canEdit} className={inp} value={f.contact_email} onChange={e => setF({ ...f, contact_email: e.target.value })} placeholder={v.customer?.email || ''} /></label>
          <label className="text-xs text-slate-600">IBAN<input disabled={!canEdit} className={inp} value={f.bank_iban} onChange={e => setF({ ...f, bank_iban: e.target.value })} /></label>
          <div className="sm:col-span-2"><p className="text-xs text-slate-600">Kategoriler</p><div className="mt-1 flex flex-wrap gap-1">{cats.filter(c => c.is_active || f.category_ids.includes(c.id)).map(c => {
            const on = f.category_ids.includes(c.id);
            return <button key={c.id} type="button" disabled={!canEdit} onClick={() => setF({ ...f, category_ids: on ? f.category_ids.filter((x: string) => x !== c.id) : [...f.category_ids, c.id] })} className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-[#1B3A5C] bg-[#1B3A5C] text-white' : 'border-slate-200 text-slate-600'}`}>{c.name}</button>;
          })}</div></div>
          <label className="text-xs text-slate-600 sm:col-span-2">Not<textarea disabled={!canEdit} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
        </div>
        {v.approved_at && <p className="mt-2 text-[11px] text-slate-400">Onay tarihi {fmtDate(v.approved_at)}</p>}
        <div className="mt-3 flex items-center gap-2">
          {canEdit && <Button size="sm" disabled={busy} onClick={save}><Save className="h-3.5 w-3.5" />Kaydet</Button>}
          {msg && <span className={`text-sm ${msg === 'Kaydedildi.' ? 'text-emerald-700' : 'text-rose-600'}`}>{msg}</span>}
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Belgeler</p>
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setDoc({ type: VENDOR_DOC_TYPES[0], valid_until: '', file: null })}><Plus className="h-3.5 w-3.5" />Belge ekle</Button>}
        </div>
        {docs.length === 0 ? <p className="text-xs text-slate-400">Belge yok. Vergi levhası, imza sirküleri, sigorta poliçesi, gıda/servis belgeleri gibi belgeleri geçerlilik tarihleriyle ekleyin.</p> : (
          <ul className="divide-y divide-slate-100">{docs.map((d, i) => (
            <li key={i} className="flex items-center gap-2 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="flex-1">{d.type}{d.file_name && <button className="ml-2 text-xs text-blue-700 hover:underline" onClick={() => openDoc(d)}>{d.file_name}</button>}</span>
              <span className={`text-xs ${docExpired(d) ? 'font-semibold text-rose-600' : docExpiringSoon(d) ? 'text-amber-600' : 'text-slate-500'}`}>
                {docExpired(d) && <AlertTriangle className="mr-0.5 inline h-3 w-3" />}{d.valid_until ? `geçerlilik ${fmtDate(d.valid_until)}` : 'süresiz'}
              </span>
              {canEdit && <button aria-label="Sil" className="text-slate-300 hover:text-rose-600" onClick={() => removeDoc(i)}><Trash2 className="h-3.5 w-3.5" /></button>}
            </li>
          ))}</ul>
        )}
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-sm font-semibold text-slate-800">Teklif geçmişi</p>
        {hist.length === 0 ? <p className="text-xs text-slate-400">Henüz teklif istenmedi.</p> : (
          <ul className="divide-y divide-slate-100">{hist.map(h => (
            <li key={h.id} className="flex items-center gap-2 py-2 text-sm">
              <Link href={`/procure/rfq/${h.rfq?.id}`} className="min-w-0 flex-1 truncate text-slate-800 hover:text-blue-700">{h.rfq?.rfq_no} · {h.rfq?.title}</Link>
              <span className="text-xs text-slate-500">{h.declined ? 'teklif vermedi' : h.quote ? tl(h.quote.total_net) : h.view_count ? 'açtı, yanıt yok' : 'açmadı'}</span>
              {h.awarded > 0 && <span className="text-xs font-medium text-emerald-700">kazandı {tl(h.awarded)}</span>}
              <RfqStatusBadge status={h.rfq?.status} />
            </li>
          ))}</ul>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Değerlendirmeler (ISO 9001 · 8.4)</p>
          {canEdit && <Link href={`/procure/tedarikciler/${id}/degerlendir`} className="inline-flex items-center gap-1 rounded-lg bg-[#1B3A5C] px-3 py-1.5 text-xs font-medium text-white"><ClipboardCheck className="h-3.5 w-3.5" />Değerlendir</Link>}
        </div>
        {evals.length === 0 ? <p className="text-xs text-slate-400">Henüz değerlendirme yok. Form, teslim/red/hizmet/fiyat verilerinden öneri puanlarıyla dolu gelir.</p> : (
          <ul className="divide-y divide-slate-100">{evals.map(e => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${GRADE_CLS[e.grade]}`}>{e.grade}</span>
              <span className="font-medium">{Number(e.score)}</span>
              <span className="flex-1 text-xs text-slate-600">{fmtDate(e.period_start)}–{fmtDate(e.period_end)} · {DECISION_LABEL[e.decision]}{e.action_note ? ` · ${e.action_note}` : ''}</span>
              <span className="text-[11px] text-slate-400">{fmtDate(e.created_at)}</span>
            </li>
          ))}</ul>
        )}
      </Card>

      <IssuePanel vendorId={id} canManage={canEdit} canOpen={canOpenIssue} />

      <Modal isOpen={!!doc} onClose={() => setDoc(null)} title="Belge ekle"
        footer={<><Button variant="secondary" onClick={() => setDoc(null)}>Vazgeç</Button><Button disabled={busy} onClick={addDoc}>Ekle</Button></>}>
        {doc && (
          <div className="space-y-2">
            <label className="block text-xs text-slate-600">Tür<select className={inp} value={doc.type} onChange={e => setDoc({ ...doc, type: e.target.value })}>{VENDOR_DOC_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="block text-xs text-slate-600">Geçerlilik bitişi (varsa)<input type="date" className={inp} value={doc.valid_until} onChange={e => setDoc({ ...doc, valid_until: e.target.value })} /></label>
            <div className="flex items-center gap-2"><Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><Paperclip className="h-3.5 w-3.5" />Dosya seç</Button><span className="truncate text-xs text-slate-600">{doc.file?.name || 'dosya seçilmedi (opsiyonel)'}</span></div>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={e => { const fl = e.target.files?.[0] || null; e.target.value = ''; setDoc(d => d && { ...d, file: fl }); }} />
          </div>
        )}
      </Modal>
    </div>
  );
}
