'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Select, Textarea } from '@/components/ui';
import { Answer, AuditItem, GRADE, auditScore, compressImage } from '@/lib/franchise';
import { uploadPortalBlob, signedPortalUrls } from '@/lib/portal';
import { Check, X, Minus, Camera, AlertTriangle, MapPin, Loader2, Trash2 } from 'lucide-react';

interface Props {
  supabase: any; open: boolean; onClose: () => void; onSaved: () => void;
  branches: any[]; templates: any[]; team: any[]; me: { id?: string; name?: string } | null;
  existing?: any | null; preset?: { branch_id?: string; visit_id?: string } | null;
}

export default function AuditRunner({ supabase, open, onClose, onSaved, branches, templates, team, me, existing, preset }: Props) {
  const [branchId, setBranchId] = useState('');
  const [tplId, setTplId] = useState('');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [summary, setSummary] = useState('');
  const [auditor, setAuditor] = useState('');
  const [share, setShare] = useState(true);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const readOnly = existing?.status === 'completed';

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setBranchId(existing.branch_id); setTplId(existing.template_id || ''); setAnswers(existing.answers || []);
      setSummary(existing.summary || ''); setAuditor(existing.auditor_id || ''); setShare(existing.share_with_branch !== false);
      setGeo(existing.geo_lat ? { lat: Number(existing.geo_lat), lng: Number(existing.geo_lng) } : null);
      const all = (existing.answers || []).flatMap((a: Answer) => a.photos || []);
      if (all.length) signedPortalUrls(supabase, all).then(setThumbs);
    } else {
      setBranchId(preset?.branch_id || ''); setSummary(''); setShare(true); setThumbs({});
      setAuditor(me?.id || '');
      const t = templates.find(x => x.is_active) || templates[0];
      setTplId(t?.id || ''); setAnswers(t ? fromTemplate(t.items) : []);
      setGeo(null);
      navigator.geolocation?.getCurrentPosition(p => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { enableHighAccuracy: true, timeout: 10000 });
    }
  }, [open, existing?.id]);

  const pickTemplate = (id: string) => {
    setTplId(id);
    const t = templates.find(x => x.id === id);
    if (t && (!answers.some(a => a.result) || confirm('Şablon değişirse girilen cevaplar silinir. Devam edilsin mi?'))) setAnswers(fromTemplate(t.items));
  };

  const set = (i: number, patch: Partial<Answer>) => setAnswers(list => list.map((a, k) => (k === i ? { ...a, ...patch } : a)));
  const live = useMemo(() => auditScore(answers), [answers]);
  const answered = answers.filter(a => a.result).length;
  const sections = useMemo(() => {
    const m: { name: string; idx: number[] }[] = [];
    answers.forEach((a, i) => { let s = m.find(x => x.name === a.section); if (!s) { s = { name: a.section || 'Genel', idx: [] }; m.push(s); } s.idx.push(i); });
    return m;
  }, [answers]);

  const addPhoto = async (i: number, file?: File | null) => {
    if (!file) return;
    if (!branchId) { alert('Önce şubeyi seçin.'); return; }
    setUploading(answers[i].item_id);
    try {
      const blob = await compressImage(file);
      const path = `${branchId}/audits/${Date.now()}_${answers[i].item_id}.jpg`;
      const ref = await uploadPortalBlob(supabase, path, blob);
      setThumbs(t => ({ ...t, [ref]: URL.createObjectURL(blob) }));
      set(i, { photos: [...(answers[i].photos || []), ref] });
    } catch (e: any) { alert(e.message); }
    finally { setUploading(null); }
  };

  const save = async (complete: boolean) => {
    if (!branchId) { alert('Şubeyi seçin.'); return; }
    if (complete) {
      const missing = answers.filter(a => !a.result);
      if (missing.length) { alert(`${missing.length} madde cevaplanmadı. Uygulanamayan maddeler için "Yok" seçin.`); return; }
      const noPhoto = answers.filter(a => a.photo && a.result === 'fail' && !(a.photos || []).length);
      if (noPhoto.length && !confirm(`${noPhoto.length} uygunsuz maddede fotoğraf zorunlu ama eklenmemiş. Yine de tamamlansın mı?`)) return;
    }
    setBusy(true);
    const tpl = templates.find(t => t.id === tplId);
    const payload: any = {
      template_id: tplId || null, template_name: tpl?.name || existing?.template_name || null, branch_id: branchId, visit_id: existing?.visit_id || preset?.visit_id || null,
      auditor_id: auditor || null, auditor_name: team.find(t => t.id === auditor)?.name || me?.name || null,
      geo_lat: geo?.lat ?? null, geo_lng: geo?.lng ?? null, answers, summary: summary || null, share_with_branch: share,
      status: complete ? 'completed' : 'draft',
    };
    const res = existing?.id
      ? await supabase.from('store_audits').update(payload).eq('id', existing.id).select('id').single()
      : await supabase.from('store_audits').insert([payload]).select('id').single();
    if (res.error) { setBusy(false); alert(res.error.message); return; }
    if (complete) {
      // Uygunsuz her madde için düzeltici faaliyet (kritik: 1 gün, diğer: 7 gün)
      const due = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
      const acts = answers.filter(a => a.result === 'fail').map(a => ({
        audit_id: res.data.id, branch_id: branchId, item_id: a.item_id, item_text: a.text, critical: !!a.critical,
        description: a.note ? `Bulgu: ${a.note}` : 'Uygunsuzluğu giderin ve kanıt (fotoğraf/açıklama) ekleyin.', due_date: due(a.critical ? 1 : 7), responsible: 'Şube yönetimi',
      }));
      if (acts.length) await supabase.from('store_audit_actions').insert(acts);
    }
    setBusy(false); onSaved(); onClose();
  };

  const branchName = branches.find(b => b.id === branchId)?.name;
  return (
    <Modal isOpen={open} onClose={onClose} size="xl" title={existing ? `Denetim · ${branchName || ''}` : 'Yeni şube denetimi'}
      footer={readOnly ? <Button variant="secondary" onClick={onClose}>Kapat</Button> : (
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">{answered}/{answers.length} madde</span><span className="flex-1" />
          <Button variant="secondary" disabled={busy} onClick={() => save(false)}>Taslak kaydet</Button>
          <Button variant="success" disabled={busy} onClick={() => save(true)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Denetimi tamamla</Button>
        </div>)}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Şube / franchise *" value={branchId} disabled={readOnly || !!existing} onChange={e => setBranchId(e.target.value)}
            options={[{ value: '', label: 'Seçin' }, ...branches.map(b => ({ value: b.id, label: b.name + (b.customer_type === 'dealer' ? ' (franchise)' : '') }))]} />
          <Select label="Şablon" value={tplId} disabled={readOnly} onChange={e => pickTemplate(e.target.value)}
            options={[{ value: '', label: '-' }, ...templates.filter(t => t.is_active || t.id === tplId).map(t => ({ value: t.id, label: t.name }))]} />
          <Select label="Denetçi" value={auditor} disabled={readOnly} onChange={e => setAuditor(e.target.value)}
            options={[{ value: '', label: me?.name || '-' }, ...team.map(t => ({ value: t.id, label: t.name }))]} />
        </div>

        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-white/95 p-3 backdrop-blur">
          <div><p className="text-xs text-slate-500">Anlık puan</p><p className="text-2xl font-bold">{live.score === null ? '–' : `%${live.score}`}</p></div>
          {live.grade && <span className={`rounded-lg px-3 py-1 text-sm font-semibold ${GRADE[live.grade].cls}`}>{GRADE[live.grade].label}</span>}
          {live.critical && <span className="flex items-center gap-1 text-sm font-medium text-red-600"><AlertTriangle className="h-4 w-4" />Kritik bulgu var — not D</span>}
          <span className="ml-auto flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{geo ? `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}` : 'Konum yok'}</span>
        </div>

        {answers.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Önce "Şablonlar" bölümünden bir denetim şablonu oluşturun veya hazır şablon ekleyin.</p>}

        {sections.map(sec => (
          <div key={sec.name} className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">{sec.name}</p>
            {sec.idx.map(i => {
              const a = answers[i];
              const btn = (r: Answer['result'], Icon: any, on: string, title: string) => (
                <button type="button" disabled={readOnly} title={title} onClick={() => set(i, { result: a.result === r ? '' : r })}
                  className={`flex h-10 w-12 items-center justify-center rounded-lg border ${a.result === r ? on : 'text-slate-400 hover:bg-slate-50'}`}><Icon className="h-5 w-5" /></button>
              );
              return (
                <div key={a.item_id} className={`rounded-lg border p-3 ${a.result === 'fail' ? 'border-red-200 bg-red-50/40' : ''}`}>
                  <div className="flex flex-wrap items-start gap-2">
                    <p className="min-w-[200px] flex-1 text-sm">{a.text}
                      {a.critical && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">KRİTİK</span>}
                      <span className="ml-1 text-[10px] text-slate-400">ağırlık {a.weight}{a.photo ? ' · fotoğraf' : ''}</span></p>
                    <div className="flex gap-1">
                      {btn('ok', Check, 'border-green-500 bg-green-500 text-white', 'Uygun')}
                      {btn('fail', X, 'border-red-500 bg-red-500 text-white', 'Uygunsuz')}
                      {btn('na', Minus, 'border-slate-400 bg-slate-400 text-white', 'Uygulanamaz')}
                    </div>
                  </div>
                  {(a.result === 'fail' || a.note || (a.photos || []).length > 0) && (
                    <div className="mt-2 space-y-2">
                      {!readOnly && <input value={a.note || ''} onChange={e => set(i, { note: e.target.value })} placeholder="Bulgu / açıklama"
                        className="w-full rounded-lg border px-3 py-2 text-sm" />}
                      {readOnly && a.note && <p className="text-sm text-slate-700">{a.note}</p>}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {(a.photos || []).map(p => (
                      <div key={p} className="relative">
                        {thumbs[p] ? <a href={thumbs[p]} target="_blank" rel="noreferrer"><img src={thumbs[p]} alt="" className="h-16 w-16 rounded object-cover" /></a>
                          : <div className="flex h-16 w-16 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">foto</div>}
                        {!readOnly && <button onClick={() => set(i, { photos: (a.photos || []).filter(x => x !== p) })} className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 shadow"><Trash2 className="h-3 w-3 text-red-500" /></button>}
                      </div>
                    ))}
                    {!readOnly && (
                      <label className={`flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded border border-dashed text-[10px] ${a.photo && a.result === 'fail' && !(a.photos || []).length ? 'border-red-400 text-red-500' : 'text-slate-400'}`}>
                        {uploading === a.item_id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}Fotoğraf
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { addPhoto(i, e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <Textarea label="Genel değerlendirme" rows={3} value={summary} disabled={readOnly} onChange={e => setSummary(e.target.value)} placeholder="Güçlü yönler, öncelikli iyileştirmeler…" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={share} disabled={readOnly} onChange={e => setShare(e.target.checked)} />Sonuç ve düzeltici faaliyetler şubenin portalında görünsün</label>
        {!readOnly && <p className="text-xs text-slate-500">Tamamlandığında her uygunsuz madde için düzeltici faaliyet açılır (kritik: 1 gün, diğer: 7 gün). Puan sunucuda hesaplanır, sonradan değiştirilemez.</p>}
      </div>
    </Modal>
  );
}

const fromTemplate = (items: AuditItem[]): Answer[] =>
  (items || []).map(x => ({ ...x, item_id: x.id, result: '', note: '', photos: [] }));
