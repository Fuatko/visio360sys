'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge, Modal, Input, Textarea } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { AUDIT_PRESETS, AuditItem, GRADE, newItemId } from '@/lib/franchise';
import { signedPortalUrls } from '@/lib/portal';
import { printHtml, escapeHtml } from '@/lib/print';
import AuditRunner from './AuditRunner';
import { Plus, ClipboardCheck, Printer, Trash2, ArrowUp, ArrowDown, ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  supabase: any; audits: any[]; actions: any[]; templates: any[]; branches: any[]; team: any[]; me: any;
  onChanged: () => void; preset: { branch_id?: string; visit_id?: string } | null; clearPreset: () => void;
}
const DAY = 864e5;

export default function Audits({ supabase, audits, actions, templates, branches, team, me, onChanged, preset, clearPreset }: Props) {
  const [run, setRun] = useState<{ existing?: any; preset?: any } | null>(null);
  const [tpl, setTpl] = useState<any | null>(null);
  const [actFilter, setActFilter] = useState<'open' | 'done' | 'all'>('open');
  useEffect(() => { if (preset) { setRun({ preset }); clearPreset(); } }, [preset]);

  const today = new Date().toISOString().slice(0, 10);
  const done = audits.filter(a => a.status === 'completed');
  const last90 = done.filter(a => Date.now() - new Date(a.audited_at).getTime() < 90 * DAY);
  const avg = last90.length ? Math.round(last90.reduce((s, a) => s + Number(a.score || 0), 0) / last90.length) : null;
  const openActs = actions.filter(a => a.status === 'open');
  const overdueActs = openActs.filter(a => a.due_date && a.due_date < today);
  const bname = (id: string) => branches.find(b => b.id === id)?.name || '-';

  // Şube karnesi: son denetim, önceki ile fark, açık faaliyet
  const league = useMemo(() => {
    const ids = Array.from(new Set(done.map(a => a.branch_id)));
    return ids.map(id => {
      const list = done.filter(a => a.branch_id === id).sort((a, b) => b.audited_at.localeCompare(a.audited_at));
      const last = list[0], prev = list[1];
      return { id, last, delta: prev ? Number(last.score) - Number(prev.score) : null, count: list.length,
        days: Math.floor((Date.now() - new Date(last.audited_at).getTime()) / DAY),
        open: openActs.filter(x => x.branch_id === id).length };
    }).sort((a, b) => Number(b.last.score) - Number(a.last.score));
  }, [audits, actions]);
  const neverAudited = branches.filter(b => b.customer_type === 'dealer' && !done.some(a => a.branch_id === b.id));

  const verify = async (a: any, ok: boolean) => {
    const patch = ok ? { status: 'verified', verified_at: new Date().toISOString() } : { status: 'open', done_note: (a.done_note || '') + ' [Merkez: yeterli bulunmadı]' };
    const { error } = await supabase.from('store_audit_actions').update(patch).eq('id', a.id);
    if (error) alert(error.message); else onChanged();
  };

  const addPreset = async (i: number) => {
    const p = AUDIT_PRESETS[i];
    const { error } = await supabase.from('audit_templates').insert([{ name: p.name, description: p.description, items: p.items.map(x => ({ ...x, id: newItemId() })) }]);
    if (error) alert(error.message); else onChanged();
  };
  const saveTpl = async () => {
    if (!tpl.name.trim()) { alert('Şablon adı girin.'); return; }
    const items = tpl.items.filter((x: AuditItem) => x.text.trim());
    if (!items.length) { alert('En az bir madde ekleyin.'); return; }
    const payload = { name: tpl.name, description: tpl.description || null, items, is_active: tpl.is_active };
    const { error } = tpl.id ? await supabase.from('audit_templates').update(payload).eq('id', tpl.id) : await supabase.from('audit_templates').insert([payload]);
    if (error) { alert(error.message); return; }
    setTpl(null); onChanged();
  };
  const setItem = (i: number, patch: Partial<AuditItem>) => setTpl({ ...tpl, items: tpl.items.map((x: AuditItem, k: number) => (k === i ? { ...x, ...patch } : x)) });
  const moveItem = (i: number, d: number) => { const it = [...tpl.items]; const j = i + d; if (j < 0 || j >= it.length) return; [it[i], it[j]] = [it[j], it[i]]; setTpl({ ...tpl, items: it }); };

  const print = async (a: any) => {
    const photos = (a.answers || []).flatMap((x: any) => x.photos || []);
    const urls = photos.length ? await signedPortalUrls(supabase, photos) : {};
    const acts = actions.filter(x => x.audit_id === a.id);
    const rows = (a.answers || []).map((x: any) => `<tr><td>${escapeHtml(x.section || '')}</td><td>${escapeHtml(x.text)}${x.critical ? ' <b style="color:#b91c1c">[KRİTİK]</b>' : ''}</td>
      <td style="color:${x.result === 'ok' ? '#15803d' : x.result === 'fail' ? '#b91c1c' : '#64748b'}"><b>${x.result === 'ok' ? 'Uygun' : x.result === 'fail' ? 'Uygunsuz' : 'Yok'}</b></td>
      <td>${escapeHtml(x.note || '')}${(x.photos || []).map((p: string) => urls[p] ? `<br/><img src="${urls[p]}" style="height:90px;margin-top:4px;border-radius:4px"/>` : '').join('')}</td></tr>`).join('');
    printHtml(`Denetim ${bname(a.branch_id)}`, `<h1>Şube Denetim Raporu</h1>
      <p><b>${escapeHtml(bname(a.branch_id))}</b> · ${escapeHtml(a.template_name || '')}<br/>Tarih: ${escapeHtml(new Date(a.audited_at).toLocaleString('tr-TR'))} · Denetçi: ${escapeHtml(a.auditor_name || '-')}
      ${a.geo_lat ? ` · Konum: ${Number(a.geo_lat).toFixed(5)}, ${Number(a.geo_lng).toFixed(5)}` : ''}</p>
      <h2>Sonuç: %${a.score ?? '-'} · Not ${a.grade || '-'}${a.critical_fail ? ' · KRİTİK BULGU' : ''}</h2>
      ${a.summary ? `<p>${escapeHtml(a.summary)}</p>` : ''}
      <table><thead><tr><th>Bölüm</th><th>Madde</th><th>Sonuç</th><th>Bulgu / kanıt</th></tr></thead><tbody>${rows}</tbody></table>
      ${acts.length ? `<h2>Düzeltici faaliyetler (ISO 9001 · 10.2)</h2><table><thead><tr><th>Madde</th><th>Faaliyet</th><th>Termin</th><th>Durum</th></tr></thead><tbody>
      ${acts.map(x => `<tr><td>${escapeHtml(x.item_text || '')}</td><td>${escapeHtml(x.description || '')}${x.done_note ? '<br/><i>Şube: ' + escapeHtml(x.done_note) + '</i>' : ''}</td><td>${escapeHtml(formatDate(x.due_date))}</td><td>${x.status === 'open' ? 'Açık' : x.status === 'done' ? 'Şube kapattı' : 'Doğrulandı'}</td></tr>`).join('')}</tbody></table>` : ''}
      <p style="margin-top:32px">Denetçi imza: ____________________ &nbsp;&nbsp;&nbsp; Şube yetkilisi imza: ____________________</p>`);
  };

  const actList = actions.filter(a => actFilter === 'all' || (actFilter === 'open' ? a.status !== 'verified' : a.status === 'verified'))
    .sort((a, b) => (a.status === 'done' ? -1 : 0) - (b.status === 'done' ? -1 : 0) || (a.due_date || '').localeCompare(b.due_date || ''));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><p className="text-2xl font-bold">{last90.length}</p><p className="text-xs text-slate-500">Son 90 günde denetim</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold text-indigo-600">{avg === null ? '-' : `%${avg}`}</p><p className="text-xs text-slate-500">Ortalama puan (90 gün)</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold text-amber-600">{openActs.length}</p><p className="text-xs text-slate-500">Açık düzeltici faaliyet</p></Card>
        <Card className="p-4"><p className={`text-2xl font-bold ${overdueActs.length ? 'text-red-600' : ''}`}>{overdueActs.length}</p><p className="text-xs text-slate-500">Termini geçen faaliyet</p></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setRun({})} disabled={!templates.length}><ClipboardCheck className="h-4 w-4" />Denetim başlat</Button>
        <Button variant="secondary" onClick={() => setTpl({ name: '', description: '', is_active: true, items: [] })}><Plus className="h-4 w-4" />Şablon oluştur</Button>
        {AUDIT_PRESETS.map((p, i) => !templates.some(t => t.name === p.name) && <Button key={p.name} variant="ghost" onClick={() => addPreset(i)}>+ Hazır: {p.name}</Button>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Şube karnesi</p>
          {league.length === 0 ? <p className="text-sm text-slate-500">Tamamlanmış denetim yok.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-1">Şube</th><th>Son puan</th><th>Değişim</th><th>Son denetim</th><th>Açık</th></tr></thead>
              <tbody>{league.map(r => (
                <tr key={r.id} className="border-b">
                  <td className="py-1.5 font-medium">{bname(r.id)}</td>
                  <td><span className={`rounded px-1.5 text-xs font-semibold ${GRADE[r.last.grade]?.cls || ''}`}>{r.last.grade}</span> %{r.last.score}</td>
                  <td className="text-xs">{r.delta === null ? '-' : r.delta >= 0 ? <span className="flex items-center gap-0.5 text-green-600"><TrendingUp className="h-3 w-3" />+{r.delta.toFixed(1)}</span> : <span className="flex items-center gap-0.5 text-red-600"><TrendingDown className="h-3 w-3" />{r.delta.toFixed(1)}</span>}</td>
                  <td className={`text-xs ${r.days > 60 ? 'font-semibold text-red-600' : 'text-slate-500'}`}>{r.days} gün önce</td>
                  <td className="text-xs">{r.open || '-'}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {neverAudited.length > 0 && <p className="mt-2 text-xs text-amber-700">Hiç denetlenmemiş franchise: {neverAudited.slice(0, 8).map(b => b.name).join(', ')}{neverAudited.length > 8 ? '…' : ''}</p>}
        </Card>

        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Son denetimler</p>
          {audits.length === 0 ? <p className="text-sm text-slate-500">Henüz denetim yok.</p> : (
            <div className="max-h-80 space-y-1 overflow-auto">
              {audits.slice(0, 40).map(a => (
                <div key={a.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50" onClick={() => setRun({ existing: a })}>
                  <span className={`w-8 rounded text-center text-xs font-semibold ${a.grade ? GRADE[a.grade].cls : 'bg-slate-100 text-slate-500'}`}>{a.grade || '…'}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{bname(a.branch_id)}</p><p className="text-xs text-slate-500">{new Date(a.audited_at).toLocaleDateString('tr-TR')} · {a.auditor_name || '-'} · {a.template_name}</p></div>
                  {a.status === 'draft' ? <Badge variant="warning">Taslak</Badge> : <span className="text-sm font-semibold">%{a.score}</span>}
                  {a.critical_fail && <Badge variant="danger">Kritik</Badge>}
                  {a.status === 'completed' && <button onClick={e => { e.stopPropagation(); print(a); }}><Printer className="h-4 w-4 text-slate-400" /></button>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="mr-auto flex items-center gap-1 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-indigo-600" />Düzeltici faaliyetler (ISO 9001 · 10.2)</p>
          {(['open', 'done', 'all'] as const).map(k => <button key={k} onClick={() => setActFilter(k)} className={`rounded-full px-3 py-1 text-xs ${actFilter === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{k === 'open' ? 'Açık / doğrulama bekleyen' : k === 'done' ? 'Doğrulananlar' : 'Tümü'}</button>)}
        </div>
        {actList.length === 0 ? <p className="text-sm text-slate-500">Kayıt yok.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-1">Şube / madde</th><th>Faaliyet</th><th>Termin</th><th>Durum</th><th /></tr></thead>
            <tbody>{actList.map(a => (
              <tr key={a.id} className="border-b align-top">
                <td className="py-2"><p className="font-medium">{bname(a.branch_id)}</p><p className="text-xs text-slate-500">{a.item_text}{a.critical ? ' · kritik' : ''}</p></td>
                <td className="text-xs">{a.description}{a.done_note && <p className="mt-1 text-indigo-700">Şube: {a.done_note}</p>}</td>
                <td className={`text-xs ${a.status === 'open' && a.due_date < today ? 'font-semibold text-red-600' : ''}`}>{formatDate(a.due_date)}</td>
                <td>{a.status === 'open' ? <Badge variant="warning">Açık</Badge> : a.status === 'done' ? <Badge variant="info">Şube kapattı</Badge> : <Badge variant="success">Doğrulandı</Badge>}</td>
                <td className="whitespace-nowrap text-right">{a.status === 'done' && <><Button size="sm" variant="success" onClick={() => verify(a, true)}>Doğrula</Button> <Button size="sm" variant="ghost" onClick={() => verify(a, false)}>Yeniden aç</Button></>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      {templates.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Denetim şablonları</p>
          <div className="flex flex-wrap gap-2">{templates.map(t => (
            <button key={t.id} onClick={() => setTpl({ ...t, items: t.items || [] })} className="rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50">
              <p className="font-medium">{t.name} {!t.is_active && <Badge variant="default">Pasif</Badge>}</p><p className="text-xs text-slate-500">{(t.items || []).length} madde · {(t.items || []).filter((x: any) => x.critical).length} kritik</p>
            </button>
          ))}</div>
        </Card>
      )}

      <AuditRunner supabase={supabase} open={!!run} onClose={() => setRun(null)} onSaved={onChanged} branches={branches} templates={templates}
        team={team} me={me} existing={run?.existing || null} preset={run?.preset || null} />

      <Modal isOpen={!!tpl} onClose={() => setTpl(null)} title={tpl?.id ? 'Şablonu düzenle' : 'Yeni denetim şablonu'} size="xl"
        footer={<><Button variant="secondary" onClick={() => setTpl(null)}>İptal</Button><Button onClick={saveTpl}>Kaydet</Button></>}>
        {tpl && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Şablon adı *" value={tpl.name} onChange={e => setTpl({ ...tpl, name: e.target.value })} />
              <Input label="Açıklama" value={tpl.description || ''} onChange={e => setTpl({ ...tpl, description: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tpl.is_active} onChange={e => setTpl({ ...tpl, is_active: e.target.checked })} />Aktif</label>
            <div className="space-y-2">
              {tpl.items.map((x: AuditItem, i: number) => (
                <div key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                  <input value={x.section} onChange={e => setItem(i, { section: e.target.value })} placeholder="Bölüm" className="w-36 rounded border px-2 py-1 text-sm" />
                  <input value={x.text} onChange={e => setItem(i, { text: e.target.value })} placeholder="Kontrol maddesi" className="min-w-[200px] flex-1 rounded border px-2 py-1 text-sm" />
                  <select value={x.weight} onChange={e => setItem(i, { weight: Number(e.target.value) })} className="rounded border px-1 py-1 text-sm" title="Ağırlık">{[1, 2, 3, 4, 5].map(w => <option key={w} value={w}>×{w}</option>)}</select>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!x.critical} onChange={e => setItem(i, { critical: e.target.checked })} />Kritik</label>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!x.photo} onChange={e => setItem(i, { photo: e.target.checked })} />Foto</label>
                  <button onClick={() => moveItem(i, -1)}><ArrowUp className="h-4 w-4 text-slate-400" /></button>
                  <button onClick={() => moveItem(i, 1)}><ArrowDown className="h-4 w-4 text-slate-400" /></button>
                  <button onClick={() => setTpl({ ...tpl, items: tpl.items.filter((_: any, k: number) => k !== i) })}><Trash2 className="h-4 w-4 text-red-400" /></button>
                </div>
              ))}
              <Button size="sm" variant="secondary" onClick={() => setTpl({ ...tpl, items: [...tpl.items, { id: newItemId(), section: tpl.items[tpl.items.length - 1]?.section || 'Genel', text: '', weight: 1, critical: false, photo: false }] })}><Plus className="h-3 w-3" />Madde ekle</Button>
            </div>
            <p className="text-xs text-slate-500">Kritik madde uygunsuz çıkarsa puan ne olursa olsun not D olur (ör. soğuk zincir, son kullanma tarihi, yangın güvenliği). "Foto" işaretli maddelerde uygunsuzluk için fotoğraf kanıtı istenir.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
