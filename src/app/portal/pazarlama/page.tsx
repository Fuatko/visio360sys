'use client';

import { useEffect, useState } from 'react';
import { usePortal, PortalTitle } from '@/components/portal/PortalShell';
import { StatusBadge, FileField, FileLink, Bar } from '@/components/portal/common';
import { Modal, Button, Input, Select, Textarea } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { MDF_STATUS, MDF_ACTIVITIES, n, mdfUsed } from '@/lib/portal';
import { periodLabel } from '@/lib/periods';
import { Plus, Megaphone } from 'lucide-react';

const tl = (v: number) => `₺${formatMoney(v)}`;

export default function PortalMdf() {
  const { supabase, me } = usePortal();
  const [allocs, setAllocs] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);
  const [claim, setClaim] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [a, r] = await Promise.all([
      supabase.from('mdf_allocations').select('*').order('period', { ascending: false }),
      supabase.from('mdf_requests').select('*').order('created_at', { ascending: false }),
    ]);
    setAllocs(a.data || []); setReqs(r.data || []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title.trim() || !(n(form.requested_amount) > 0)) { alert('Başlık ve tutar girin.'); return; }
    setBusy(true);
    const { error } = await supabase.from('mdf_requests').insert([{ dealer_id: me.dealer.id, period: form.period || null, activity_type: form.activity_type,
      title: form.title, description: form.description || null, planned_date: form.planned_date || null, requested_amount: n(form.requested_amount) }]);
    setBusy(false);
    if (error) { alert(error.message); return; }
    setForm(null); load();
  };
  const sendClaim = async () => {
    if (!claim.proof_url) { alert('Harcama belgesi (fatura/fotoğraf) ekleyin.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('portal_mdf_claim', { p_id: claim.id, p_amount: n(claim.claim_amount), p_proof_url: claim.proof_url, p_note: claim.claim_note || null });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setClaim(null); load();
  };

  return (
    <div className="space-y-4">
      <PortalTitle title="Pazarlama Fonu (MDF)" subtitle="Size ayrılan pazarlama bütçesini kullanmak için faaliyet önerin; onay sonrası harcama belgenizle geri ödeme alın."
        action={<Button onClick={() => setForm({ period: allocs[0]?.period || '', activity_type: MDF_ACTIVITIES[0], title: '', description: '', planned_date: '', requested_amount: '' })}><Plus className="h-4 w-4" />Faaliyet öner</Button>} />
      <div className="grid gap-3 md:grid-cols-3">
        {allocs.length === 0 && <p className="text-sm text-slate-500 md:col-span-3">Size henüz pazarlama bütçesi ayrılmamış. Yine de faaliyet önerebilirsiniz.</p>}
        {allocs.map(a => {
          const used = mdfUsed(reqs, a.period);
          return (
            <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="flex items-center gap-1 text-xs text-slate-500"><Megaphone className="h-3 w-3" />{periodLabel(a.period)} bütçesi</p>
              <p className="text-xl font-bold">{tl(n(a.amount))}</p>
              <Bar pct={n(a.amount) ? used / n(a.amount) * 100 : 0} />
              <p className="mt-1 text-xs text-slate-500">Kullanılan {tl(used)} · Kalan <b className="text-green-700">{tl(n(a.amount) - used)}</b></p>
            </div>
          );
        })}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-slate-50 text-left text-xs"><th className="px-4 py-2">Faaliyet</th><th>Tarih</th><th className="text-right">Talep</th><th className="text-right">Onaylanan</th><th>Durum</th><th /></tr></thead>
          <tbody>
            {reqs.length === 0 && <tr><td colSpan={6} className="p-4 text-slate-500">Talep yok.</td></tr>}
            {reqs.map(r => (
              <tr key={r.id} className="border-b">
                <td className="px-4 py-2"><p className="font-medium">{r.title}</p><p className="text-xs text-slate-400">{r.activity_type}{r.period ? ` · ${periodLabel(r.period)}` : ''}</p>
                  {r.review_note && <p className="text-xs text-slate-500">Not: {r.review_note}</p>}</td>
                <td className="text-xs">{r.planned_date ? formatDate(r.planned_date) : '-'}</td>
                <td className="text-right">{tl(n(r.requested_amount))}</td>
                <td className="text-right">{r.approved_amount != null ? tl(n(r.approved_amount)) : '-'}</td>
                <td><StatusBadge map={MDF_STATUS} value={r.status} />{r.proof_url && <div><FileLink supabase={supabase} value={r.proof_url} /></div>}</td>
                <td className="pr-3 text-right">{r.status === 'approved' && <Button size="sm" variant="secondary" onClick={() => setClaim({ id: r.id, claim_amount: r.approved_amount, proof_url: '', claim_note: '' })}>Harcama bildir</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Pazarlama faaliyeti öner"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save} disabled={busy}>Onaya gönder</Button></>}>
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select label="Faaliyet türü" value={form.activity_type} onChange={e => setForm({ ...form, activity_type: e.target.value })} options={MDF_ACTIVITIES.map(a => ({ value: a, label: a }))} />
              <Select label="Bütçe dönemi" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} options={[{ value: '', label: '-' }, ...allocs.map(a => ({ value: a.period, label: periodLabel(a.period) }))]} />
            </div>
            <Input label="Başlık" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <Textarea label="Açıklama / beklenen sonuç" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Planlanan tarih" type="date" value={form.planned_date} onChange={e => setForm({ ...form, planned_date: e.target.value })} />
              <Input label="Talep edilen tutar (₺)" type="number" value={form.requested_amount} onChange={e => setForm({ ...form, requested_amount: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
      <Modal isOpen={!!claim} onClose={() => setClaim(null)} title="Harcama bildir"
        footer={<><Button variant="secondary" onClick={() => setClaim(null)}>İptal</Button><Button onClick={sendClaim} disabled={busy}>Gönder</Button></>}>
        {claim && (
          <div className="space-y-3">
            <Input label="Gerçekleşen harcama (₺)" type="number" value={claim.claim_amount ?? ''} onChange={e => setClaim({ ...claim, claim_amount: e.target.value })} />
            <FileField supabase={supabase} dealerId={me.dealer.id} value={claim.proof_url} onChange={v => setClaim({ ...claim, proof_url: v })} label="Fatura / fotoğraf (kanıt)" />
            <Textarea label="Not" value={claim.claim_note} onChange={e => setClaim({ ...claim, claim_note: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
