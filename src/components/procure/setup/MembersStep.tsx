'use client';

// Adım 4 — Kullanıcılar ve satınalma rolleri (proc_members)
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Edit2, Users } from 'lucide-react';
import { Badge, Button, Modal } from '@/components/ui';
import MoneyInput from '@/components/MoneyInput';
import { createClient } from '@/lib/supabase';
import { formatMoney } from '@/lib/utils';
import { CostCenter, PROC_ROLES, ProcRole, roleLabel } from '@/lib/procure';
import type { OrgUser } from './CostCentersStep';

export interface Member { id: string; user_id: string; roles: ProcRole[]; cost_center_ids: string[]; approval_limit: number | null; is_active: boolean }
const isOrgAdmin = (u: OrgUser) => ['admin', 'org_admin', 'super_admin'].includes(u.role) || !!u.is_org_admin;

export default function MembersStep({ users, members, costCenters, orgId, onChange }: { users: OrgUser[]; members: Member[]; costCenters: CostCenter[]; orgId?: string; onChange: () => void }) {
  const [edit, setEdit] = useState<{ user: OrgUser; roles: ProcRole[]; cost_center_ids: string[]; approval_limit: number | null; is_active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const byUser = useMemo(() => new Map(members.map(m => [m.user_id, m])), [members]);
  const ccName = (id: string) => costCenters.find(c => c.id === id)?.name || '—';

  const open = (u: OrgUser) => {
    const m = byUser.get(u.id);
    setEdit({ user: u, roles: m?.roles || [], cost_center_ids: m?.cost_center_ids || [], approval_limit: m?.approval_limit ?? null, is_active: m?.is_active ?? true });
  };

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const { error } = await createClient().from('proc_members').upsert({
      organization_id: orgId, user_id: edit.user.id, roles: edit.roles, cost_center_ids: edit.cost_center_ids,
      approval_limit: edit.approval_limit, is_active: edit.is_active,
    }, { onConflict: 'organization_id,user_id' });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setEdit(null); onChange();
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const counts = PROC_ROLES.map(r => ({ ...r, n: members.filter(m => m.is_active && m.roles.includes(r.key)).length + (r.key === 'procure_admin' ? users.filter(u => isOrgAdmin(u) && !byUser.get(u.id)?.roles.includes('procure_admin')).length : 0) }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">{counts.map(r => <Badge key={r.key} variant={r.n ? 'primary' : 'default'}>{r.label}: {r.n}</Badge>)}</div>
      <p className="text-xs text-slate-500">Öğretmenler ve idari personel yalnızca <b>Talep eden</b> rolüyle talep açar. Yeni kullanıcıyı <Link href="/admin/users" className="text-blue-700 underline">Kullanıcı Yönetimi</Link>'nden ekleyin; orada da satınalma rolü seçilebilir. Admin kullanıcılar otomatik olarak satınalma yöneticisidir.</p>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        {users.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center text-sm text-slate-500"><Users className="mb-2 h-8 w-8 text-slate-300" />Kurumda kullanıcı bulunamadı.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs text-slate-600">
              <tr><th className="px-3 py-2">Kullanıcı</th><th className="px-3 py-2">Satınalma rolleri</th><th className="px-3 py-2">Birimler</th><th className="px-3 py-2 text-right">Onay limiti</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => {
                const m = byUser.get(u.id); const auto = isOrgAdmin(u);
                return (
                  <tr key={u.id} className={m && !m.is_active ? 'opacity-50' : ''}>
                    <td className="px-3 py-2"><p className="font-medium text-slate-800">{u.name}</p><p className="text-[11px] text-slate-400">{u.email}</p></td>
                    <td className="px-3 py-2"><div className="flex flex-wrap gap-1">
                      {(m?.roles || []).map(r => <Badge key={r} variant="default">{roleLabel(r)}</Badge>)}
                      {auto && !m?.roles.includes('procure_admin') && <Badge variant="primary">Satınalma yöneticisi (admin)</Badge>}
                      {!m?.roles.length && !auto && <span className="text-xs text-slate-300">—</span>}
                    </div></td>
                    <td className="px-3 py-2 text-xs text-slate-600">{(m?.cost_center_ids || []).map(ccName).join(', ') || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{m?.approval_limit != null ? `₺${formatMoney(m.approval_limit)}` : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-right"><button title="Düzenle" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => open(u)}><Edit2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit ? `Satınalma rolleri · ${edit.user.name}` : ''}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>İptal</Button><Button onClick={save} disabled={busy}>Kaydet</Button></>}>
        {edit && (
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Roller</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PROC_ROLES.map(r => (
                  <label key={r.key} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs hover:bg-slate-50">
                    <input type="checkbox" className="mt-0.5" checked={edit.roles.includes(r.key)} onChange={() => setEdit({ ...edit, roles: toggle(edit.roles, r.key) })} />
                    <span><span className="font-medium text-slate-800">{r.label}</span><span className="block text-slate-500">{r.desc}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Birimleri (talep açabileceği / sorumlu olduğu masraf merkezleri)</p>
              {costCenters.length === 0
                ? <p className="text-xs text-slate-400">Önce 2. adımda masraf merkezlerini tanımlayın.</p>
                : <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {costCenters.filter(c => c.is_active).map(c => (
                      <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.cost_center_ids.includes(c.id)} onChange={() => setEdit({ ...edit, cost_center_ids: toggle(edit.cost_center_ids, c.id) })} />{c.name}{c.code && <span className="text-xs text-slate-400">{c.code}</span>}</label>
                    ))}
                  </div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-slate-600">Kişisel onay limiti (opsiyonel, KDV hariç)
                <div className="flex items-center gap-1"><span className="text-sm text-slate-500">₺</span><MoneyInput className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" value={edit.approval_limit} onChange={v => setEdit({ ...edit, approval_limit: v })} /></div>
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={edit.is_active} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} />Aktif</label>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
