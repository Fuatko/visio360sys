'use client';

// Adım 2 — Masraf merkezleri: ağaç görünümü, okul şablonu, CSV içe aktarma
import { useMemo, useRef, useState } from 'react';
import { ChevronRight, Download, Edit2, FolderTree, Plus, Trash2, Upload, Wand2 } from 'lucide-react';
import { Badge, Button, Modal } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { CC_KINDS, CostCenter, CostCenterKind, SCHOOL_COST_CENTERS, downloadCsv, parseCsv } from '@/lib/procure';

export interface OrgUser { id: string; name: string; email: string; role: string; is_org_admin?: boolean }
const inp = 'h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500';
const kindLabel = (k: string) => CC_KINDS.find(x => x.key === k)?.label || k;

// CSV'deki tür yazımları (Türkçe/İngilizce, büyük-küçük harf)
const KIND_ALIASES: Record<string, CostCenterKind> = {
  kampus: 'campus', 'kampüs': 'campus', campus: 'campus',
  kademe: 'level', level: 'level',
  bolum: 'department', 'bölüm': 'department', department: 'department', departman: 'department',
  birim: 'unit', unit: 'unit', '': 'unit',
};

type ImportRow = { code: string; name: string; kind: CostCenterKind; parent?: string; manager_email?: string };

// Satırları üst-alt sırasına göre yazar; kodu olan mevcut kayıt güncellenir. Hatalar satır numarasıyla döner.
export async function importCostCenters(rows: (ImportRow & { line: number })[], existing: CostCenter[], users: OrgUser[]) {
  const supabase = createClient();
  const errors: string[] = [];
  const byCode = new Map(existing.filter(c => c.code).map(c => [c.code!.toLowerCase(), c.id]));
  const userByEmail = new Map(users.map(u => [u.email?.toLowerCase(), u.id]));
  let pending = rows.slice(); let added = 0; let updated = 0;
  while (pending.length) {
    const next: typeof pending = [];
    for (const r of pending) {
      const pc = r.parent?.toLowerCase();
      if (pc && !byCode.has(pc)) { next.push(r); continue; }
      const manager = r.manager_email ? userByEmail.get(r.manager_email.toLowerCase()) : undefined;
      if (r.manager_email && !manager) errors.push(`Satır ${r.line}: "${r.manager_email}" kurumda kullanıcı değil, sorumlu boş bırakıldı.`);
      const payload: any = { code: r.code || null, name: r.name, kind: r.kind, parent_id: pc ? byCode.get(pc) : null };
      if (manager) payload.manager_user_id = manager;
      const id = r.code ? byCode.get(r.code.toLowerCase()) : undefined;
      const res = id
        ? await supabase.from('proc_cost_centers').update(payload).eq('id', id).select('id').single()
        : await supabase.from('proc_cost_centers').insert(payload).select('id').single();
      if (res.error) { errors.push(`Satır ${r.line}: ${res.error.message}`); continue; }
      if (id) updated++; else added++;
      if (r.code) byCode.set(r.code.toLowerCase(), res.data.id);
    }
    if (next.length === pending.length) {
      next.forEach(r => errors.push(`Satır ${r.line}: üst kod "${r.parent}" bulunamadı.`));
      break;
    }
    pending = next;
  }
  return { added, updated, errors };
}

export default function CostCentersStep({ rows, users, onChange }: { rows: CostCenter[]; users: OrgUser[]; onChange: () => void }) {
  const [edit, setEdit] = useState<Partial<CostCenter> | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ title: string; lines: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const children = useMemo(() => {
    const m = new Map<string | null, CostCenter[]>();
    const ids = new Set(rows.map(r => r.id));
    rows.forEach(r => { const k = r.parent_id && ids.has(r.parent_id) ? r.parent_id : null; m.set(k, [...(m.get(k) || []), r]); });
    m.forEach(l => l.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'tr')));
    return m;
  }, [rows]);
  const userName = (id: string | null) => (id ? users.find(u => u.id === id)?.name || '—' : '');

  const loadTemplate = async () => {
    setBusy(true);
    const r = await importCostCenters(SCHOOL_COST_CENTERS.map((x, i) => ({ ...x, line: i + 1 })), rows, users);
    setBusy(false);
    setReport({ title: 'Okul şablonu', lines: [`${r.added} birim eklendi, ${r.updated} birim güncellendi.`, ...r.errors] });
    onChange();
  };

  const onFile = async (file: File) => {
    const { header, rows: data } = parseCsv(await file.text());
    const col = (...names: string[]) => header.findIndex(h => names.includes(h));
    const iCode = col('kod', 'code'), iName = col('ad', 'name', 'birim'), iKind = col('tur', 'tür', 'kind'), iParent = col('ust_kod', 'üst_kod', 'parent', 'parent_code'), iMgr = col('sorumlu_eposta', 'manager_email', 'sorumlu');
    if (iName < 0) { setReport({ title: 'CSV içe aktarma', lines: ['Başlık satırında "ad" sütunu bulunamadı. Şablonu indirip kullanın.'] }); return; }
    const errors: string[] = []; const ok: (ImportRow & { line: number })[] = [];
    data.forEach((r, i) => {
      const line = i + 2; const name = r[iName] || '';
      const kindRaw = (iKind >= 0 ? r[iKind] : '').toLocaleLowerCase('tr');
      const kind = KIND_ALIASES[kindRaw];
      if (!name) { errors.push(`Satır ${line}: ad boş.`); return; }
      if (!kind) { errors.push(`Satır ${line}: tür "${r[iKind]}" geçersiz (kampüs, kademe, bölüm, birim).`); return; }
      ok.push({ line, code: iCode >= 0 ? r[iCode] : '', name, kind, parent: iParent >= 0 ? r[iParent] || undefined : undefined, manager_email: iMgr >= 0 ? r[iMgr] || undefined : undefined });
    });
    setBusy(true);
    const res = await importCostCenters(ok, rows, users);
    setBusy(false);
    setReport({ title: 'CSV içe aktarma', lines: [`${res.added} eklendi, ${res.updated} güncellendi, ${errors.length + res.errors.length} uyarı/hata.`, ...errors, ...res.errors] });
    onChange();
  };

  const save = async () => {
    if (!edit?.name?.trim()) return;
    setBusy(true);
    const payload = { code: edit.code?.trim() || null, name: edit.name.trim(), kind: edit.kind || 'unit', parent_id: edit.parent_id || null,
      manager_user_id: edit.manager_user_id || null, is_active: edit.is_active ?? true, sort: edit.sort ?? 0 };
    const { error } = edit.id ? await supabase.from('proc_cost_centers').update(payload).eq('id', edit.id) : await supabase.from('proc_cost_centers').insert(payload);
    setBusy(false);
    if (error) { alert(/duplicate|unique/i.test(error.message) ? 'Bu kod zaten kullanılıyor.' : error.message); return; }
    setEdit(null); onChange();
  };

  const remove = async (c: CostCenter) => {
    if (!confirm(`"${c.name}" silinsin mi?`)) return;
    const { error } = await supabase.from('proc_cost_centers').delete().eq('id', c.id);
    if (error) alert(/foreign key|violates/i.test(error.message) ? 'Bu birimin alt birimleri var; önce onları silin veya taşıyın.' : error.message);
    onChange();
  };

  // Seçilen kaydın kendisi ve alt dalları üst birim olamaz
  const descendants = (id?: string): Set<string> => {
    const s = new Set<string>(); if (!id) return s;
    const walk = (x: string) => { s.add(x); (children.get(x) || []).forEach(c => walk(c.id)); };
    walk(id); return s;
  };

  const Node = ({ c, depth }: { c: CostCenter; depth: number }) => (
    <>
      <div className={`flex items-center gap-2 border-b border-slate-100 py-2 pr-2 text-sm ${c.is_active ? '' : 'opacity-50'}`} style={{ paddingLeft: 8 + depth * 20 }}>
        {depth > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
        <div className="min-w-0 flex-1">
          <span className="font-medium text-slate-800">{c.name}</span>
          {c.code && <span className="ml-2 text-xs text-slate-400">{c.code}</span>}
          {c.manager_user_id && <span className="ml-2 text-xs text-slate-500">· Sorumlu: {userName(c.manager_user_id)}</span>}
        </div>
        <Badge variant={c.kind === 'campus' ? 'primary' : c.kind === 'level' ? 'info' : 'default'}>{kindLabel(c.kind)}</Badge>
        <button title="Alt birim ekle" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEdit({ parent_id: c.id, kind: 'unit', is_active: true })}><Plus className="h-3.5 w-3.5" /></button>
        <button title="Düzenle" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEdit(c)}><Edit2 className="h-3.5 w-3.5" /></button>
        <button title="Sil" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(c)}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {(children.get(c.id) || []).map(ch => <Node key={ch.id} c={ch} depth={depth + 1} />)}
    </>
  );

  const blocked = descendants(edit?.id);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setEdit({ kind: 'campus', is_active: true })}><Plus className="h-3.5 w-3.5" />Yeni</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={loadTemplate}><Wand2 className="h-3.5 w-3.5" />Okul şablonunu yükle</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" />CSV içe aktar</Button>
        <Button size="sm" variant="ghost" onClick={() => downloadCsv('masraf-merkezleri-sablon.csv', [['kod', 'ad', 'tur', 'ust_kod', 'sorumlu_eposta'], ['K1', 'Merkez Kampüs', 'kampüs', '', ''], ['K1-FEN', 'Fen Zümresi', 'birim', 'K1', 'zumre.baskani@okul.k12.tr']])}><Download className="h-3.5 w-3.5" />CSV şablonu</Button>
        {rows.length > 0 && <Button size="sm" variant="ghost" onClick={() => downloadCsv('masraf-merkezleri.csv', [['kod', 'ad', 'tur', 'ust_kod', 'sorumlu_eposta'], ...rows.map(r => [r.code, r.name, kindLabel(r.kind).toLocaleLowerCase('tr'), rows.find(p => p.id === r.parent_id)?.code || '', users.find(u => u.id === r.manager_user_id)?.email || ''])])}><Download className="h-3.5 w-3.5" />Dışa aktar</Button>}
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
      </div>
      <p className="text-xs text-slate-500">Örnek yapı: Kampüs → Kademe (Anaokulu, İlkokul, Ortaokul, Lise) → Birim (Fen Zümresi, Bilişim, Yemekhane…). Bütçe en alt birimde tutulur, üst seviyede toplanır. Birimin sorumlusu, o birimin taleplerini görür ve ilk onay adımında yer alır.</p>

      {report && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="mb-1 flex items-center justify-between"><b>{report.title}</b><button className="text-slate-400 hover:text-slate-700" onClick={() => setReport(null)}>Kapat</button></div>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">{report.lines.map((l, i) => <li key={i} className={/^Satır|bulunamadı/.test(l) ? 'text-rose-700' : 'text-slate-700'}>{l}</li>)}</ul>
        </div>
      )}

      <div className="rounded-lg border border-slate-200">
        {rows.length === 0
          ? <div className="flex flex-col items-center py-10 text-center text-sm text-slate-500"><FolderTree className="mb-2 h-8 w-8 text-slate-300" />Henüz masraf merkezi yok. Okul şablonunu yükleyin, CSV ile aktarın veya elle ekleyin.</div>
          : (children.get(null) || []).map(c => <Node key={c.id} c={c} depth={0} />)}
      </div>

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Masraf merkezini düzenle' : 'Yeni masraf merkezi'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>İptal</Button><Button onClick={save} disabled={busy || !edit?.name?.trim()}>Kaydet</Button></>}>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-2 text-xs font-medium text-slate-600">Ad *<input className={inp} value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} autoFocus /></label>
              <label className="text-xs font-medium text-slate-600">Kod<input className={inp} value={edit.code || ''} onChange={e => setEdit({ ...edit, code: e.target.value })} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-slate-600">Tür
                <select className={inp} value={edit.kind || 'unit'} onChange={e => setEdit({ ...edit, kind: e.target.value as CostCenterKind })}>{CC_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
              </label>
              <label className="text-xs font-medium text-slate-600">Üst birim
                <select className={inp} value={edit.parent_id || ''} onChange={e => setEdit({ ...edit, parent_id: e.target.value || null })}>
                  <option value="">— (en üst)</option>
                  {rows.filter(r => !blocked.has(r.id)).map(r => <option key={r.id} value={r.id}>{r.name}{r.code ? ` (${r.code})` : ''}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs font-medium text-slate-600">Sorumlu (birim müdürü)
              <select className={inp} value={edit.manager_user_id || ''} onChange={e => setEdit({ ...edit, manager_user_id: e.target.value || null })}>
                <option value="">— seçilmedi</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.email ? ` · ${u.email}` : ''}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-slate-600">Sıra<input type="number" className={inp} value={edit.sort ?? 0} onChange={e => setEdit({ ...edit, sort: Number(e.target.value) || 0 })} /></label>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={edit.is_active ?? true} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} />Aktif</label>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
