'use client';

// Adım 5 — Yetki matrisi: tutar bandı + kategori + birim → onay adımları (talepler için)
import { useEffect, useMemo, useState } from 'react';
import { Edit2, GitBranch, Plus, Trash2, Wand2 } from 'lucide-react';
import { Badge, Button, Modal } from '@/components/ui';
import MoneyInput from '@/components/MoneyInput';
import { SqlMissingCard } from '@/components/procure/ProcureGate';
import { createClient } from '@/lib/supabase';
import { APPROVER_KINDS, ApprovalRule, CAT_KINDS, Category, CostCenter, PROCURE_SQL_1A, PROC_ROLES, SCHOOL_APPROVAL_RULES, procError, roleLabel, tl } from '@/lib/procure';
import type { OrgUser } from './CostCentersStep';

const inp = 'h-9 w-full rounded-lg border border-slate-200 px-2 text-sm';
const band = (r: { min_amount: number; max_amount: number | null }) =>
  r.max_amount == null ? (r.min_amount > 0 ? `${tl(r.min_amount)} üzeri` : 'Her tutar') : r.min_amount > 0 ? `${tl(r.min_amount)} – ${tl(r.max_amount)}` : `${tl(r.max_amount)}'e kadar`;

export default function ApprovalRulesStep({ users, costCenters, categories }: { users: OrgUser[]; costCenters: CostCenter[]; categories: Category[] }) {
  const supabase = createClient();
  const [rows, setRows] = useState<ApprovalRule[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [edit, setEdit] = useState<Partial<ApprovalRule> | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [applies, setApplies] = useState<'request' | 'order'>('request');

  const load = async () => {
    const { data, error } = await supabase.from('proc_approval_rules').select('*').eq('applies_to', applies).order('min_amount').order('step_no');
    if (error) { setMissing(/relation|does not exist/i.test(error.message)); setRows([]); return; }
    setRows((data || []).map((r: any) => ({ ...r, min_amount: +r.min_amount, max_amount: r.max_amount == null ? null : +r.max_amount })));
  };
  useEffect(() => { load(); }, [applies]);

  // Aynı band + kapsam kuralları bir grup = bir onay zinciri
  const groups = useMemo(() => {
    const m = new Map<string, ApprovalRule[]>();
    (rows || []).forEach(r => { const k = [r.min_amount, r.max_amount, r.category_id, r.category_kind, r.cost_center_id].join('|'); m.set(k, [...(m.get(k) || []), r]); });
    return [...m.values()].map(l => l.sort((a, b) => a.step_no - b.step_no));
  }, [rows]);

  const loadTemplate = async () => {
    if ((rows || []).length && !confirm('Mevcut kurallar korunur, şablon kuralları eklenir. Devam edilsin mi?')) return;
    setBusy(true); setMsg('');
    const { error } = await supabase.from('proc_approval_rules').insert(SCHOOL_APPROVAL_RULES.map(r => ({ ...r, applies_to: 'request' })));
    setBusy(false);
    setMsg(error ? procError(error) : 'Okul şablon matrisi yüklendi. "Mali İşler" ve "Onaycı" rollerini 4. adımda kişilere atamayı unutmayın.');
    load();
  };

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const row = {
      name: edit.name?.trim() || band({ min_amount: edit.min_amount || 0, max_amount: edit.max_amount ?? null }),
      min_amount: edit.min_amount || 0, max_amount: edit.max_amount ?? null, category_id: edit.category_id || null, category_kind: edit.category_kind || null,
      cost_center_id: edit.cost_center_id || null, step_no: edit.step_no || 1, approver_kind: edit.approver_kind || 'cost_center_manager',
      approver_role: edit.approver_kind === 'role' ? edit.approver_role || 'approver' : null,
      approver_user_id: edit.approver_kind === 'user' ? edit.approver_user_id || null : null,
      approver_label: edit.approver_label?.trim() || null, is_active: edit.is_active ?? true, applies_to: applies,
    };
    const { error } = edit.id ? await supabase.from('proc_approval_rules').update(row).eq('id', edit.id) : await supabase.from('proc_approval_rules').insert(row);
    setBusy(false);
    if (error) { alert(procError(error)); return; }
    setEdit(null); load();
  };

  if (missing) return <SqlMissingCard file={PROCURE_SQL_1A} />;
  const who = (r: ApprovalRule) => r.approver_label || (r.approver_kind === 'cost_center_manager' ? 'Birim sorumlusu' : r.approver_kind === 'role' ? roleLabel(r.approver_role || '') : users.find(u => u.id === r.approver_user_id)?.name || '—');
  const scope = (r: ApprovalRule) => [r.category_id ? categories.find(c => c.id === r.category_id)?.name : null, r.category_kind ? CAT_KINDS.find(k => k.key === r.category_kind)?.label : null,
    r.cost_center_id ? costCenters.find(c => c.id === r.cost_center_id)?.name : null].filter(Boolean).join(' · ') || 'Tüm kategori ve birimler';

  return (
    <div className="space-y-3">
      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
        {([['request', 'Talep onayı'], ['order', 'Sipariş onayı']] as const).map(([k, t]) => <button key={k} onClick={() => setApplies(k)} className={`flex-1 rounded-md px-3 py-1.5 ${applies === k ? 'bg-[#1B3A5C] text-white' : 'text-slate-600'}`}>{t}</button>)}
      </div>
      {applies === 'order' && <p className="text-xs text-slate-500">Sipariş onayı opsiyoneldir: kural yoksa RFQ ödülünden oluşan sipariş doğrudan onaylanır (talep onayı yeterli sayılır). Tutar siparişin KDV hariç toplamıdır; siparişi veren satınalma uzmanı kendi siparişini onaylayamaz.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setEdit({ min_amount: 0, max_amount: null, step_no: 1, approver_kind: 'cost_center_manager', is_active: true })}><Plus className="h-3.5 w-3.5" />Yeni kural</Button>
        {applies === 'request' && <Button size="sm" variant="secondary" disabled={busy} onClick={loadTemplate}><Wand2 className="h-3.5 w-3.5" />Okul şablonunu yükle</Button>}
        {msg && <span className="text-sm text-slate-700">{msg}</span>}
      </div>
      <p className="text-xs text-slate-500">Talep gönderildiğinde tutar (KDV hariç), kategori ve birime uyan kurallardan adımlar sırayla oluşur. Bir adım numarasına birden fazla kural uyarsa en özel olan (birim/kategori tanımlı) seçilir. Aynı kişi ardışık iki adımda çıkarsa ikinci adım atlanır. Kural yoksa talep birim sorumlusuna gider. Talep eden kendi talebini onaylamaz; birim sorumlusu kendisiyse bir üst birimin sorumlusuna gider. Tutar bandı: alt sınırın üstü, üst sınır dahil.</p>

      {rows === null ? null : groups.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-slate-200 py-10 text-center text-sm text-slate-500"><GitBranch className="mb-2 h-8 w-8 text-slate-300" />Henüz kural yok. Okul şablonunu yükleyin veya kural ekleyin.</div>
      ) : groups.map((g, i) => (
        <div key={i} className="rounded-lg border border-slate-200">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-800">{band(g[0])}</span>
            <span className="text-xs text-slate-500">{scope(g[0])}</span>
          </div>
          <ol className="divide-y divide-slate-100">
            {g.map(r => (
              <li key={r.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${r.is_active ? '' : 'opacity-50'}`}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1B3A5C] text-[11px] text-white">{r.step_no}</span>
                <span className="flex-1 text-slate-800">{who(r)}</span>
                <Badge variant="default">{APPROVER_KINDS.find(k => k.key === r.approver_kind)?.label}{r.approver_kind === 'role' ? `: ${roleLabel(r.approver_role || '')}` : ''}</Badge>
                <button title="Düzenle" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setEdit(r)}><Edit2 className="h-3.5 w-3.5" /></button>
                <button title="Sil" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={async () => { if (confirm('Kural silinsin mi?')) { await supabase.from('proc_approval_rules').delete().eq('id', r.id); load(); } }}><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ol>
        </div>
      ))}

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Kuralı düzenle' : 'Yeni onay kuralı'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Vazgeç</Button><Button disabled={busy || (edit?.approver_kind === 'user' && !edit?.approver_user_id)} onClick={save}>Kaydet</Button></>}>
        {edit && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-600">Alt sınır (bu tutarın üstü)<div className="flex items-center gap-1"><span className="text-sm text-slate-500">₺</span><MoneyInput className={inp} value={edit.min_amount ?? 0} onChange={v => setEdit({ ...edit, min_amount: v ?? 0 })} /></div></label>
            <label className="text-xs text-slate-600">Üst sınır (dahil; boş = sınırsız)<div className="flex items-center gap-1"><span className="text-sm text-slate-500">₺</span><MoneyInput className={inp} value={edit.max_amount ?? null} onChange={v => setEdit({ ...edit, max_amount: v })} /></div></label>
            <label className="text-xs text-slate-600">Kategori<select className={inp} value={edit.category_id || ''} onChange={e => setEdit({ ...edit, category_id: e.target.value || null })}><option value="">Tümü</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="text-xs text-slate-600">Kategori türü<select className={inp} value={edit.category_kind || ''} onChange={e => setEdit({ ...edit, category_kind: e.target.value || null })}><option value="">Tümü</option>{CAT_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
            <label className="text-xs text-slate-600">Birim (alt birimler dahil)<select className={inp} value={edit.cost_center_id || ''} onChange={e => setEdit({ ...edit, cost_center_id: e.target.value || null })}><option value="">Tümü</option>{costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="text-xs text-slate-600">Adım no<input type="number" min={1} max={20} className={inp} value={edit.step_no || 1} onChange={e => setEdit({ ...edit, step_no: Number(e.target.value) || 1 })} /></label>
            <label className="text-xs text-slate-600">Onaylayan<select className={inp} value={edit.approver_kind} onChange={e => setEdit({ ...edit, approver_kind: e.target.value as any })}>{APPROVER_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
            {edit.approver_kind === 'role' && <label className="text-xs text-slate-600">Rol<select className={inp} value={edit.approver_role || 'approver'} onChange={e => setEdit({ ...edit, approver_role: e.target.value })}>{PROC_ROLES.filter(r => r.key !== 'requester').map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label>}
            {edit.approver_kind === 'user' && <label className="text-xs text-slate-600">Kişi<select className={inp} value={edit.approver_user_id || ''} onChange={e => setEdit({ ...edit, approver_user_id: e.target.value || null })}><option value="">— seçin</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
            <label className="text-xs text-slate-600">Ekranda görünen ad<input className={inp} value={edit.approver_label || ''} onChange={e => setEdit({ ...edit, approver_label: e.target.value })} placeholder="Örn. Okul müdürü" /></label>
            <label className="text-xs text-slate-600">Kural adı<input className={inp} value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="Boşsa tutar bandı" /></label>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={edit.is_active ?? true} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} />Aktif</label>
          </div>
        )}
      </Modal>
    </div>
  );
}
