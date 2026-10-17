'use client';

// Tedarikçi havuzu: statü, kategoriler, belge geçerliliği, puan; ekle / içe aktar
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Button, Modal } from '@/components/ui';
import ProcureGate, { SqlMissingCard } from '@/components/procure/ProcureGate';
import VendorImport from '@/components/procure/VendorImport';
import { VendorStatusBadge } from '@/components/procure/RequestBits';
import { createClient } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetch-all';
import { Category, PROCURE_SQL_1B, VENDOR_STATUS, VendorDoc, VendorStatus, docExpired, docExpiringSoon, fmtDate, procError } from '@/lib/procure';
import { AlertTriangle, Factory, Plus, Search } from 'lucide-react';

export default function VendorsPage() {
  return (
    <div>
      <Header title="Tedarikçiler" subtitle="Satınalma" />
      <ProcureGate>{p => (p.hasRole('buyer') || p.hasRole('finance') || p.isAdmin || p.hasRole('approver') || p.hasRole('receiver'))
        ? <VendorList canEdit={p.hasRole('buyer') || p.isAdmin} />
        : <div className="p-6"><Card className="p-6 text-center text-sm text-slate-600">Tedarikçi havuzu satınalma, mali işler ve onaycı rolleri içindir.</Card></div>}
      </ProcureGate>
    </div>
  );
}

function VendorList({ canEdit }: { canEdit: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<any[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [missing, setMissing] = useState(false);
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [cat, setCat] = useState('');
  const [add, setAdd] = useState<{ name: string; tax_number: string; email: string; phone: string; contact_name: string; status: VendorStatus; category_ids: string[] } | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const probe = await supabase.from('proc_vendor_profiles').select('customer_id').limit(1);
    if (probe.error) { setMissing(/relation|does not exist/i.test(probe.error.message)); setRows([]); return; }
    const [profs, c] = await Promise.all([
      fetchAll(() => supabase.from('proc_vendor_profiles').select('*, customer:customer_id(id, name, tax_number, email, phone)')),
      supabase.from('proc_categories').select('*').order('sort').order('name'),
    ]);
    setRows(profs.sort((a: any, b: any) => (a.customer?.name || '').localeCompare(b.customer?.name || '', 'tr'))); setCats(c.data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (rows || []).filter(r => (!st || r.status === st) && (!cat || (r.category_ids || []).includes(cat))
    && (!q || `${r.customer?.name || ''} ${r.customer?.tax_number || ''}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')))), [rows, st, cat, q]);
  const catName = (id: string) => cats.find(c => c.id === id)?.name || '';

  const save = async () => {
    if (!add) return; setErr('');
    const { data, error } = await supabase.rpc('proc_vendor_upsert', { p: { ...add, tax_number: add.tax_number || null } });
    if (error) { setErr(procError(error, PROCURE_SQL_1B)); return; }
    setAdd(null); window.location.href = `/procure/tedarikciler/${data}`;
  };

  if (missing) return <div className="p-6"><SqlMissingCard file={PROCURE_SQL_1B} /></div>;
  const inp = 'h-9 w-full rounded-lg border border-slate-200 px-2 text-sm';
  return (
    <div className="space-y-3 p-3 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Ad veya vergi no" className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-sm" /></div>
        <select value={st} onChange={e => setSt(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm"><option value="">Tüm statüler</option>{Object.entries(VENDOR_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={cat} onChange={e => setCat(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm"><option value="">Tüm kategoriler</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {canEdit && <Button size="sm" onClick={() => setAdd({ name: '', tax_number: '', email: '', phone: '', contact_name: '', status: 'candidate', category_ids: [] })}><Plus className="h-3.5 w-3.5" />Tedarikçi ekle</Button>}
      </div>
      {canEdit && <VendorImport categories={cats} onDone={load} />}

      <Card className="overflow-x-auto">
        {rows === null ? <p className="p-8 text-center text-sm text-slate-400">Yükleniyor…</p> : shown.length === 0 ? (
          <div className="flex flex-col items-center p-10 text-center text-sm text-slate-500"><Factory className="mb-2 h-8 w-8 text-slate-300" />Tedarikçi yok. Ekleyin, CSV ile veya Paraşüt carilerinden aktarın.</div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-3 py-2">Tedarikçi</th><th className="px-3 py-2">Statü</th><th className="px-3 py-2">Kategoriler</th><th className="px-3 py-2">Belgeler</th><th className="px-3 py-2">Puan</th><th className="px-3 py-2">Sonraki değerlendirme</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{shown.map(r => {
              const docs: VendorDoc[] = r.documents || [];
              const exp = docs.filter(docExpired).length, soon = docs.filter(d => docExpiringSoon(d)).length;
              const due = r.next_evaluation_due && r.next_evaluation_due < new Date().toISOString().slice(0, 10);
              return (
                <tr key={r.customer_id} className="hover:bg-slate-50">
                  <td className="px-3 py-2"><Link href={`/procure/tedarikciler/${r.customer_id}`} className="font-medium text-slate-800 hover:text-blue-700">{r.customer?.name}</Link><p className="text-[11px] text-slate-400">{r.customer?.tax_number || 'vergi no yok'}{r.contact_email || r.customer?.email ? ` · ${r.contact_email || r.customer?.email}` : ''}</p></td>
                  <td className="px-3 py-2"><VendorStatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-xs text-slate-600">{(r.category_ids || []).map(catName).filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-3 py-2 text-xs">{docs.length}{exp > 0 && <span className="ml-1 inline-flex items-center gap-0.5 text-rose-600"><AlertTriangle className="h-3 w-3" />{exp} süresi dolmuş</span>}{soon > 0 && <span className="ml-1 text-amber-600">{soon} yakında</span>}</td>
                  <td className="px-3 py-2 text-xs">{r.grade ? <b>{r.grade}</b> : '—'}{r.score != null && <span className="text-slate-500"> ({Number(r.score)})</span>}</td>
                  <td className={`px-3 py-2 text-xs ${due ? 'font-medium text-rose-600' : 'text-slate-600'}`}>{fmtDate(r.next_evaluation_due) || '—'}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </Card>

      <Modal isOpen={!!add} onClose={() => setAdd(null)} title="Tedarikçi ekle"
        footer={<><Button variant="secondary" onClick={() => setAdd(null)}>Vazgeç</Button><Button disabled={!add?.name.trim() && !add?.tax_number.trim()} onClick={save}>Kaydet</Button></>}>
        {add && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Vergi no girilirse mevcut cari kart bulunur ve tedarikçi olarak işaretlenir; yoksa yeni cari kart açılır.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-600 sm:col-span-2">Unvan *<input className={inp} value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} autoFocus /></label>
              <label className="text-xs text-slate-600">Vergi no / TCKN<input className={inp} inputMode="numeric" value={add.tax_number} onChange={e => setAdd({ ...add, tax_number: e.target.value })} /></label>
              <label className="text-xs text-slate-600">Statü<select className={inp} value={add.status} onChange={e => setAdd({ ...add, status: e.target.value as VendorStatus })}>{Object.entries(VENDOR_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
              <label className="text-xs text-slate-600">Yetkili<input className={inp} value={add.contact_name} onChange={e => setAdd({ ...add, contact_name: e.target.value })} /></label>
              <label className="text-xs text-slate-600">Telefon (WhatsApp)<input className={inp} value={add.phone} onChange={e => setAdd({ ...add, phone: e.target.value })} /></label>
              <label className="text-xs text-slate-600 sm:col-span-2">E-posta<input className={inp} value={add.email} onChange={e => setAdd({ ...add, email: e.target.value })} /></label>
            </div>
            <div><p className="text-xs text-slate-600">Kategoriler</p><div className="mt-1 flex flex-wrap gap-1">{cats.filter(c => c.is_active).map(c => {
              const on = add.category_ids.includes(c.id);
              return <button key={c.id} type="button" onClick={() => setAdd({ ...add, category_ids: on ? add.category_ids.filter(x => x !== c.id) : [...add.category_ids, c.id] })} className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-[#1B3A5C] bg-[#1B3A5C] text-white' : 'border-slate-200 text-slate-600'}`}>{c.name}</button>;
            })}</div></div>
            {err && <p className="text-sm text-rose-600">{err}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
