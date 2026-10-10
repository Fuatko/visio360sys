'use client';

import { useEffect, useState } from 'react';
import { usePortal, PortalTitle } from '@/components/portal/PortalShell';
import { StatusBadge } from '@/components/portal/common';
import { Modal, Button, Input, Textarea } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';
import { DEAL_STATUS, n, todayStr } from '@/lib/portal';
import { Plus, ShieldCheck, Info } from 'lucide-react';
import { CitySelect } from '@/components/TrSelects';

const tl = (v: number) => `₺${formatMoney(v)}`;
const EMPTY = { end_customer_name: '', end_customer_tax_no: '', end_customer_city: '', contact_name: '', contact_phone: '', contact_email: '',
  project_name: '', description: '', products_of_interest: '', estimated_value: '', expected_close_date: '', competitor: '', requested_discount_pct: '' };

export default function PortalDeals() {
  const { supabase, me } = usePortal();
  const [deals, setDeals] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => supabase.from('deal_registrations').select('*').order('created_at', { ascending: false }).then(({ data }: any) => setDeals(data || []));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.end_customer_name.trim() || !form.project_name.trim()) { alert('Son kullanıcı ve proje adı zorunlu.'); return; }
    setBusy(true);
    const payload: any = { dealer_id: me.dealer.id };
    Object.entries(form).forEach(([k, v]) => { payload[k] = v === '' ? null : v; });
    payload.estimated_value = n(form.estimated_value);
    const { error } = await supabase.from('deal_registrations').insert([payload]);
    setBusy(false);
    if (error) { alert('Hata: ' + error.message); return; }
    setForm(null); load();
  };

  const act = async (id: string, status: 'withdrawn' | 'lost') => {
    if (!confirm(status === 'withdrawn' ? 'Kayıt geri çekilsin mi?' : 'Fırsat kaybedildi olarak işaretlensin mi?')) return;
    const { error } = await supabase.rpc('portal_deal_update', { p_id: id, p_status: status });
    if (error) alert(error.message); else load();
  };

  const f = (k: string, l: string, type = 'text') => <Input label={l} type={type} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />;

  return (
    <div className="space-y-4">
      <PortalTitle title="Fırsat Kaydı" subtitle="Üzerinde çalıştığınız projeyi kaydedin; onaylanınca koruma süresi boyunca bu müşteri sizindir."
        action={<Button onClick={() => setForm({ ...EMPTY })}><Plus className="h-4 w-4" />Yeni fırsat kaydı</Button>} />
      <div className="flex gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Onaylanan kayıtlarda aynı son kullanıcı başka bayiye verilmez ve projeye özel ek iskonto tanımlanabilir. Siparişi verirken "Onaylı fırsat kaydı ile ilişkilendir" seçeneğini kullanın.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {deals.length === 0 && <p className="text-sm text-slate-500">Henüz fırsat kaydınız yok.</p>}
        {deals.map(d => {
          const expired = d.status === 'approved' && d.protection_until && d.protection_until < todayStr();
          return (
            <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{d.project_name}</p>
                  <p className="text-sm text-slate-600">{d.end_customer_name}{d.end_customer_city ? ` · ${d.end_customer_city}` : ''}</p>
                </div>
                <StatusBadge map={DEAL_STATUS} value={expired ? 'expired' : d.status} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-600">
                <span>Tahmini değer: <b>{tl(n(d.estimated_value))}</b></span>
                <span>Kapanış: {d.expected_close_date ? formatDate(d.expected_close_date) : '-'}</span>
                {d.requested_discount_pct != null && <span>Talep edilen iskonto: %{n(d.requested_discount_pct)}</span>}
                {d.approved_discount_pct != null && <span className="font-medium text-green-700">Onaylanan iskonto: %{n(d.approved_discount_pct)}</span>}
                {d.protection_until && <span className="col-span-2 flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-green-600" />Koruma: {formatDate(d.protection_until)} tarihine kadar</span>}
              </div>
              {d.review_note && <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">Değerlendirme: {d.review_note}</p>}
              <div className="mt-2 flex gap-2">
                {['submitted', 'approved'].includes(d.status) && <button onClick={() => act(d.id, 'withdrawn')} className="text-xs text-slate-500 hover:underline">Geri çek</button>}
                {d.status === 'approved' && <button onClick={() => act(d.id, 'lost')} className="text-xs text-red-500 hover:underline">Kaybedildi</button>}
              </div>
            </div>
          );
        })}
      </div>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title="Yeni Fırsat Kaydı" size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save} disabled={busy}>Onaya gönder</Button></>}>
        {form && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase text-slate-400">Son kullanıcı</p>
            <div className="grid gap-3 sm:grid-cols-3">{f('end_customer_name', 'Firma adı *')}{f('end_customer_tax_no', 'Vergi no')}<CitySelect value={form.end_customer_city} onChange={v => setForm({ ...form, end_customer_city: v })} /></div>
            <div className="grid gap-3 sm:grid-cols-3">{f('contact_name', 'Yetkili')}{f('contact_phone', 'Telefon')}{f('contact_email', 'E-posta', 'email')}</div>
            <p className="text-xs font-semibold uppercase text-slate-400">Proje</p>
            {f('project_name', 'Proje adı *')}
            <Textarea label="Açıklama / ihtiyaç" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">{f('products_of_interest', 'İlgilenilen ürünler / adetler')}{f('competitor', 'Rakip(ler)')}</div>
            <div className="grid gap-3 sm:grid-cols-3">{f('estimated_value', 'Tahmini değer (₺)', 'number')}{f('expected_close_date', 'Tahmini kapanış', 'date')}{f('requested_discount_pct', 'Talep edilen ek iskonto %', 'number')}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
