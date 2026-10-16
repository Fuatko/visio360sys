'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Modal, Button } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { MARK_LABEL, saveMark, createCrossSellOpportunity, type WSData, type WSState } from '@/lib/whitespace';
import { Target, Loader2 } from 'lucide-react';

export const tl = (v: any) => `₺${formatMoney(Math.round(Number(v) || 0))}`;
export const short = (v: number) => (v >= 1e6 ? `₺${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn` : v >= 1e3 ? `₺${Math.round(v / 1e3).toLocaleString('tr-TR')} B` : tl(v));

export const STATE: Record<WSState, { label: string; cls: string; dot: string }> = {
  remapped:    { label: 'Taşındı',         cls: 'bg-slate-50 text-slate-500 border-dashed border-slate-300', dot: 'bg-slate-300' },
  buying:      { label: 'Alıyor',          cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  lapsed:      { label: 'Uyuyan',          cls: 'bg-amber-50 text-amber-800 border-amber-200',       dot: 'bg-amber-500' },
  quoted:      { label: 'Teklif verildi',  cls: 'bg-sky-50 text-sky-800 border-sky-200',             dot: 'bg-sky-500' },
  opportunity: { label: 'Fırsat',          cls: 'bg-indigo-50 text-indigo-800 border-indigo-200',    dot: 'bg-indigo-500' },
  suggested:   { label: 'Öneri',           cls: 'bg-white text-indigo-700 border-dashed border-indigo-300', dot: 'bg-indigo-300' },
  competitor:  { label: 'Rakipten alıyor', cls: 'bg-rose-50 text-rose-800 border-rose-200',          dot: 'bg-rose-500' },
  no_need:     { label: 'İhtiyaç yok',     cls: 'bg-slate-50 text-slate-500 border-slate-200',       dot: 'bg-slate-300' },
  not_now:     { label: 'Şimdi değil',     cls: 'bg-slate-50 text-slate-500 border-slate-200',       dot: 'bg-slate-400' },
  empty:       { label: 'Boş alan',        cls: 'bg-white text-slate-300 border-slate-100',          dot: 'bg-slate-200' },
};

export function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
      {(['buying', 'lapsed', 'quoted', 'opportunity', 'suggested', 'competitor', 'no_need'] as WSState[]).map(k => (
        <span key={k} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-full ${STATE[k].dot}`} />{STATE[k].label}</span>
      ))}
    </div>
  );
}

/** Müşteri × kategori hücresi için değerlendirme penceresi */
export function MarkEditor({ supabase, data, customer, offering, onClose, onSaved }: {
  supabase: any; data: WSData; customer: any; offering: string; onClose: () => void; onSaved: () => void;
}) {
  const x = data.cells[customer.id]?.[offering];
  const m = data.marks[customer.id]?.[offering];
  const st = data.stateOf(customer.id, offering);
  const billed = !!x && x.rev12 > 0;   // faturadan gelen alım: değerlendirme gerekmez
  const sug = data.suggestions.find(s => s.customer_id === customer.id && s.offering === offering);
  const [status, setStatus] = useState<string>(m?.status || '');
  const [est, setEst] = useState<string>(m?.est_value != null ? String(m.est_value) : sug ? String(Math.round(sug.est)) : '');
  const [competitor, setCompetitor] = useState<string>(m?.competitor || '');
  const [note, setNote] = useState<string>(m?.note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [remapTo, setRemapTo] = useState<string>('');
  const [remapNew, setRemapNew] = useState<string>('');

  const remap = async (to: string | null) => {
    setBusy(true); setErr(null);
    try {
      await saveMark(supabase, customer.id, offering, to ? { status: 'remap', remap_to: to, note: `${offering} → ${to}` } : null);
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await saveMark(supabase, customer.id, offering, status ? { status, est_value: est ? Number(est) : null, competitor: status === 'competitor' ? competitor || null : null, note: note || null, opportunity_id: m?.opportunity_id || null } : null);
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const makeOpp = async () => {
    setBusy(true); setErr(null);
    try {
      const o = await createCrossSellOpportunity(supabase, { customer_id: customer.id, offering, est: Number(est) || sug?.est || 0, reason: [sug?.reason, note].filter(Boolean).join(' · '), assigned_to: customer.assigned_to });
      onSaved(); onClose();
      if (confirm(`"${o.title}" fırsatı açıldı. Fırsatlar sayfasına gitmek ister misiniz?`)) window.location.href = '/opportunities';
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title={`${customer.name} · ${offering}`} footer={
      <div className="flex w-full flex-wrap items-center gap-2">
        {!m?.opportunity_id && st !== 'buying' && <Button variant="secondary" size="sm" disabled={busy} onClick={makeOpp}><Target className="h-3.5 w-3.5" />Fırsat oluştur</Button>}
        <span className="flex-1" />
        <Button variant="secondary" size="sm" onClick={onClose}>Vazgeç</Button>
        <Button size="sm" disabled={busy || !data.ready} onClick={save}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Kaydet</Button>
      </div>}>
      <div className="space-y-3 text-sm">
        <div className={`rounded-lg border p-3 ${STATE[st].cls}`}>
          <p className="font-semibold">{STATE[st].label}</p>
          {x && x.revAll > 0 && <p className="text-xs">Son 12 ay {tl(x.rev12)} · toplam {tl(x.revAll)} · {x.count} belge · son alım {x.last ? new Date(x.last).toLocaleDateString('tr-TR') : '-'}</p>}
          {x?.quoted && <p className="text-xs">Açık teklif: <Link href="/quotes" className="underline">{x.quoted.no}</Link> ({new Date(x.quoted.date).toLocaleDateString('tr-TR')})</p>}
          {sug && <p className="text-xs">{sug.reason} · tahmini yıllık {tl(sug.est)}</p>}
          {x && x.products.length > 0 && <p className="mt-1 text-xs opacity-80">Alınanlar: {x.products.join(', ')}</p>}
          {m?.opportunity_id && <p className="mt-1 text-xs">Bu alan için fırsat açıldı · <Link href="/opportunities" className="underline">Fırsatlar</Link></p>}
        </div>
        {!data.ready && <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">Değerlendirmeleri kaydetmek için <b>capraz-satis-hatirlatma.sql</b> dosyasını Supabase'de çalıştırın. Fırsat oluşturma şimdi de çalışır.</p>}
        {st === 'remapped' && (
          <div className="rounded-lg border border-dashed p-3 text-xs text-slate-600">
            Bu müşterinin <b>{offering}</b> faturaları <b>{m?.remap_to}</b> kategorisinde sayılıyor.
            <Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={() => remap(null)}>Taşımayı geri al</Button>
          </div>
        )}
        {billed && (
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-slate-600">Bu müşteride bu faturalar aslında başka bir hizmet mi?</p>
            <p className="text-[11px] text-slate-400">Ör. Paraşüt'te "HİZMET" kesilen ama danışmanlık olan işler. Yalnızca bu müşteri için geçerlidir; Paraşüt'teki kayıt değişmez.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <select value={remapTo} onChange={e => setRemapTo(e.target.value)} className="h-8 rounded border px-2 text-xs">
                <option value="">Kategori seçin</option>
                {data.offerings.filter(o => o !== offering).map(o => <option key={o} value={o}>{o}</option>)}
                <option value="__new">+ Yeni kategori adı</option>
              </select>
              {remapTo === '__new' && <input value={remapNew} onChange={e => setRemapNew(e.target.value)} placeholder="Ör. Danışmanlık" className="h-8 rounded border px-2 text-xs" />}
              <Button size="sm" variant="secondary" disabled={busy || !data.ready || !remapTo || (remapTo === '__new' && !remapNew.trim())} onClick={() => remap(remapTo === '__new' ? remapNew.trim() : remapTo)}>Bu kategoride say</Button>
            </div>
          </div>
        )}
        {st === 'buying' && !billed && <p className="text-xs text-slate-500">Elle "Alıyor" olarak işaretlendi (son 12 ayda bu kategoride fatura görünmüyor).</p>}
        {!billed && st !== 'remapped' && (
          <>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Değerlendirmeniz <span className="font-normal text-slate-400">— faturası farklı kategoride kesilen veya Paraşüt dışı alımlar için "Alıyor" seçin</span></p>
              <div className="flex flex-wrap gap-1.5">
                {[['', 'Yok'], ...Object.entries(MARK_LABEL)].map(([k, l]) => (
                  <button key={k} onClick={() => setStatus(k)} className={`rounded-full border px-3 py-1 text-xs ${status === k ? 'border-indigo-600 bg-indigo-600 text-white' : 'hover:bg-slate-50'}`}>{l}</button>
                ))}
              </div>
            </div>
            {status === 'competitor' && <input value={competitor} onChange={e => setCompetitor(e.target.value)} placeholder="Hangi firmadan alıyor?" className="w-full rounded-lg border px-3 py-2 text-sm" />}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-600">Tahmini yıllık değer (₺, KDV hariç)
                <input type="number" value={est} onChange={e => setEst(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
              <label className="text-xs text-slate-600">Not
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ör. bütçe Ocak'ta açılıyor" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
            </div>
          </>
        )}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}
