'use client';

// Adım 3 — Satınalma kategorileri: okul şablonu, Paraşüt gider kategorisi eşlemesi
import { useEffect, useState } from 'react';
import { Edit2, Plus, Tags, Trash2, Wand2 } from 'lucide-react';
import { Badge, Button, Modal } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetch-all';
import { CAT_KINDS, Category, CategoryKind, PROC_ROLES, SCHOOL_CATEGORIES } from '@/lib/procure';

const inp = 'h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500';
const kindLabel = (k: string) => CAT_KINDS.find(x => x.key === k)?.label || k;

export default function CategoriesStep({ rows, onChange }: { rows: Category[]; onChange: () => void }) {
  const [edit, setEdit] = useState<Partial<Category> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [parasutCats, setParasutCats] = useState<string[]>([]);
  const supabase = createClient();

  // Paraşüt'ten senkronlanan alış faturalarındaki gider kategorileri (eşleme önerisi)
  useEffect(() => {
    fetchAll(() => supabase.from('parasut_documents').select('category').eq('kind', 'purchase_bill').not('category', 'is', null))
      .then(list => setParasutCats([...new Set(list.map((r: any) => r.category as string).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'))));
  }, []);

  const loadTemplate = async () => {
    setBusy(true); setMsg('');
    const have = new Set(rows.map(r => (r.code || '').toLowerCase()));
    const add = SCHOOL_CATEGORIES.filter(c => !have.has(c.code.toLowerCase())).map((c, i) => ({ ...c, sort: (i + 1) * 10 }));
    const { error } = add.length ? await supabase.from('proc_categories').insert(add) : { error: null };
    setBusy(false);
    setMsg(error ? 'Yüklenemedi: ' + error.message : add.length ? `${add.length} kategori eklendi.` : 'Şablondaki tüm kategoriler zaten var.');
    onChange();
  };

  const save = async () => {
    if (!edit?.name?.trim()) return;
    setBusy(true);
    const payload = { code: edit.code?.trim() || null, name: edit.name.trim(), kind: edit.kind || 'goods', parent_id: edit.parent_id || null,
      parasut_category: edit.parasut_category?.trim() || null, default_receiver_role: edit.default_receiver_role || null,
      is_active: edit.is_active ?? true, sort: edit.sort ?? 0 };
    const { error } = edit.id ? await supabase.from('proc_categories').update(payload).eq('id', edit.id) : await supabase.from('proc_categories').insert(payload);
    setBusy(false);
    if (error) { alert(/duplicate|unique/i.test(error.message) ? 'Bu kod zaten kullanılıyor.' : error.message); return; }
    setEdit(null); onChange();
  };

  const remove = async (c: Category) => {
    if (!confirm(`"${c.name}" silinsin mi?`)) return;
    const { error } = await supabase.from('proc_categories').delete().eq('id', c.id);
    if (error) alert(/foreign key|violates/i.test(error.message) ? 'Bu kategorinin alt kategorileri var; önce onları silin.' : error.message);
    onChange();
  };

  const parentName = (id: string | null) => (id ? rows.find(r => r.id === id)?.name : null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setEdit({ kind: 'goods', is_active: true })}><Plus className="h-3.5 w-3.5" />Yeni kategori</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={loadTemplate}><Wand2 className="h-3.5 w-3.5" />Okul şablonunu yükle</Button>
        {msg && <span className={`text-sm ${msg.startsWith('Yüklenemedi') ? 'text-rose-600' : 'text-emerald-700'}`}>{msg}</span>}
      </div>
      <p className="text-xs text-slate-500">Paraşüt gider kategorisi eşlemesi, bütçe gerçekleşeninde Procure siparişi olmayan alış faturalarının doğru kategoriye düşmesini sağlar. Demirbaş (yatırım) kategorisindeki alımlar mal kabulde demirbaş kaydına aday olur.</p>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center text-sm text-slate-500"><Tags className="mb-2 h-8 w-8 text-slate-300" />Henüz kategori yok. Okul şablonunu yükleyin veya elle ekleyin.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs text-slate-600">
              <tr><th className="px-3 py-2">Kategori</th><th className="px-3 py-2">Tür</th><th className="px-3 py-2">Paraşüt kategorisi</th><th className="px-3 py-2">Teslim alan</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(c => (
                <tr key={c.id} className={c.is_active ? '' : 'opacity-50'}>
                  <td className="px-3 py-2"><span className="font-medium text-slate-800">{c.name}</span>{c.code && <span className="ml-2 text-xs text-slate-400">{c.code}</span>}{parentName(c.parent_id) && <span className="block text-[11px] text-slate-400">↳ {parentName(c.parent_id)}</span>}</td>
                  <td className="px-3 py-2"><Badge variant={c.kind === 'capex' ? 'warning' : c.kind === 'service' ? 'info' : 'default'}>{kindLabel(c.kind)}</Badge></td>
                  <td className="px-3 py-2 text-slate-600">{c.parasut_category || <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2 text-slate-600">{PROC_ROLES.find(r => r.key === c.default_receiver_role)?.label || <span className="text-slate-300">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button title="Düzenle" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEdit(c)}><Edit2 className="h-3.5 w-3.5" /></button>
                    <button title="Sil" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(c)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Kategoriyi düzenle' : 'Yeni kategori'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>İptal</Button><Button onClick={save} disabled={busy || !edit?.name?.trim()}>Kaydet</Button></>}>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-2 text-xs font-medium text-slate-600">Ad *<input className={inp} value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} autoFocus /></label>
              <label className="text-xs font-medium text-slate-600">Kod<input className={inp} value={edit.code || ''} onChange={e => setEdit({ ...edit, code: e.target.value })} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-slate-600">Tür
                <select className={inp} value={edit.kind || 'goods'} onChange={e => setEdit({ ...edit, kind: e.target.value as CategoryKind })}>{CAT_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
              </label>
              <label className="text-xs font-medium text-slate-600">Üst kategori
                <select className={inp} value={edit.parent_id || ''} onChange={e => setEdit({ ...edit, parent_id: e.target.value || null })}>
                  <option value="">—</option>
                  {rows.filter(r => r.id !== edit.id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs font-medium text-slate-600">Paraşüt gider kategorisi
              <input className={inp} list="parasut-cats" value={edit.parasut_category || ''} onChange={e => setEdit({ ...edit, parasut_category: e.target.value })} placeholder={parasutCats.length ? 'Listeden seçin veya yazın' : 'Paraşüt verisi yok; elle yazılabilir'} />
              <datalist id="parasut-cats">{parasutCats.map(c => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="block text-xs font-medium text-slate-600">Varsayılan teslim alan rolü
              <select className={inp} value={edit.default_receiver_role || ''} onChange={e => setEdit({ ...edit, default_receiver_role: e.target.value || null })}>
                <option value="">— (talep eden birim)</option>
                {PROC_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
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
