'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Input, Textarea, Modal } from '@/components/ui';
import { StatusBadge } from '@/components/portal/common';
import { formatMoney, formatDate } from '@/lib/utils';
import { DEAL_STATUS, n, todayStr, addDaysStr } from '@/lib/portal';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

interface Props { supabase: any; dealers: any[]; onChanged?: () => void }
const tl = (v: number) => `₺${formatMoney(v)}`;
const norm = (s: string) => (s || '').toLocaleLowerCase('tr').replace(/\b(a\.?ş\.?|ltd\.?|şti\.?|san\.?|tic\.?|limited|anonim|şirketi)\b/g, '').replace(/[^a-z0-9çğıöşü]/g, '');

export default function DealRegistrations({ supabase, dealers, onChanged }: Props) {
  const [deals, setDeals] = useState<any[]>([]);
  const [filter, setFilter] = useState('submitted');
  const [review, setReview] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => supabase.from('deal_registrations').select('*').order('created_at', { ascending: false }).then(({ data }: any) => setDeals(data || []));
  useEffect(() => { load(); }, []);

  const dname = (id: string) => dealers.find(d => d.id === id)?.name || '-';
  const isLive = (d: any) => d.status === 'submitted' || (d.status === 'approved' && (!d.protection_until || d.protection_until >= todayStr()));
  // Kanal çatışması: aynı son kullanıcı (vergi no veya isim) başka bayide canlı kayıtlı
  const conflicts = (d: any) => deals.filter(x => x.id !== d.id && x.dealer_id !== d.dealer_id && isLive(x) &&
    ((d.end_customer_tax_no && x.end_customer_tax_no === d.end_customer_tax_no) || (norm(x.end_customer_name) && norm(x.end_customer_name) === norm(d.end_customer_name))));

  const decide = async (status: 'approved' | 'rejected') => {
    setBusy(true);
    const patch: any = { status, review_note: review.review_note || null, reviewed_at: new Date().toISOString() };
    if (status === 'approved') {
      patch.approved_discount_pct = review.approved_discount_pct === '' ? null : n(review.approved_discount_pct);
      patch.protection_until = addDaysStr(todayStr(), n(review.days) || 90);
    }
    const { data: { user } } = await supabase.auth.getUser();
    patch.reviewed_by = user?.id || null;
    const { error } = await supabase.from('deal_registrations').update(patch).eq('id', review.deal.id);
    setBusy(false);
    if (error) { alert(error.message); return; }
    setReview(null); load(); onChanged?.();
  };

  const counts: Record<string, number> = {};
  deals.forEach(d => { counts[d.status] = (counts[d.status] || 0) + 1; });
  const list = deals.filter(d => !filter || d.status === filter);
  const pipeline = deals.filter(d => d.status === 'approved').reduce((s, d) => s + n(d.estimated_value), 0);
  const decided = deals.filter(d => ['won', 'lost'].includes(d.status));
  const winRate = decided.length ? deals.filter(d => d.status === 'won').length / decided.length * 100 : null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Fırsat Kayıtları (Deal Registration)</h3>
        <span className="text-xs text-slate-500">Korumadaki pipeline: <b>{tl(pipeline)}</b>{winRate !== null && <> · Kazanma oranı <b>%{Math.round(winRate)}</b></>}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {[['', 'Tümü'], ...Object.entries(DEAL_STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs ${filter === k ? 'bg-indigo-600 text-white' : 'border'}`}>{l}{k && counts[k] ? ` (${counts[k]})` : ''}</button>
        ))}
      </div>
      {list.length === 0 ? <p className="text-sm text-slate-500">Kayıt yok.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Proje / Son kullanıcı</th><th>Bayi</th><th className="text-right">Değer</th><th>Kapanış</th><th>Durum</th><th /></tr></thead>
            <tbody>
              {list.map(d => {
                const c = conflicts(d);
                return (
                  <tr key={d.id} className="border-b align-top">
                    <td className="py-2"><p className="font-medium">{d.project_name}</p><p className="text-xs text-slate-500">{d.end_customer_name}{d.end_customer_city ? ` · ${d.end_customer_city}` : ''}{d.end_customer_tax_no ? ` · VKN ${d.end_customer_tax_no}` : ''}</p>
                      {c.length > 0 && <p className="flex items-center gap-1 text-xs font-medium text-red-600"><AlertTriangle className="h-3 w-3" />Çakışma: {c.map(x => dname(x.dealer_id)).join(', ')}</p>}</td>
                    <td className="py-2">{dname(d.dealer_id)}</td>
                    <td className="py-2 text-right">{tl(n(d.estimated_value))}{d.requested_discount_pct != null && <p className="text-xs text-slate-500">talep %{n(d.requested_discount_pct)}</p>}</td>
                    <td className="py-2 text-xs">{d.expected_close_date ? formatDate(d.expected_close_date) : '-'}</td>
                    <td className="py-2"><StatusBadge map={DEAL_STATUS} value={d.status} />
                      {d.protection_until && d.status === 'approved' && <p className="flex items-center gap-0.5 text-[11px] text-green-700"><ShieldCheck className="h-3 w-3" />{formatDate(d.protection_until)}</p>}</td>
                    <td className="py-2 text-right">{d.status === 'submitted'
                      ? <Button size="sm" onClick={() => setReview({ deal: d, approved_discount_pct: d.requested_discount_pct ?? '', days: 90, review_note: '' })}>Değerlendir</Button>
                      : d.status === 'approved' ? <button className="text-xs text-slate-500 hover:underline" onClick={async () => { await supabase.from('deal_registrations').update({ status: 'expired' }).eq('id', d.id); load(); }}>Süreyi bitir</button> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Modal isOpen={!!review} onClose={() => setReview(null)} title={review ? `${review.deal.project_name} – ${dname(review.deal.dealer_id)}` : ''} size="lg"
        footer={<><Button variant="secondary" onClick={() => setReview(null)}>Vazgeç</Button><Button variant="danger" disabled={busy} onClick={() => decide('rejected')}>Reddet</Button><Button variant="success" disabled={busy} onClick={() => decide('approved')}>Onayla</Button></>}>
        {review && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 rounded bg-slate-50 p-3 text-xs">
              <span>Son kullanıcı: <b>{review.deal.end_customer_name}</b></span><span>Yetkili: {review.deal.contact_name || '-'} {review.deal.contact_phone || ''}</span>
              <span>Ürünler: {review.deal.products_of_interest || '-'}</span><span>Rakip: {review.deal.competitor || '-'}</span>
              <span className="col-span-2">{review.deal.description}</span>
            </div>
            {conflicts(review.deal).length > 0 && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                <b>Kanal çatışması:</b> {conflicts(review.deal).map(x => `${dname(x.dealer_id)} – ${x.project_name} (${DEAL_STATUS[x.status]?.label}, ${formatDate(x.created_at)})`).join('; ')}. İlk kaydeden bayiye öncelik vermek yaygın uygulamadır.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Projeye özel iskonto % (boş = standart)" type="number" value={review.approved_discount_pct} onChange={e => setReview({ ...review, approved_discount_pct: e.target.value })} />
              <Input label="Koruma süresi (gün)" type="number" value={review.days} onChange={e => setReview({ ...review, days: e.target.value })} />
            </div>
            <Textarea label="Bayiye not" value={review.review_note} onChange={e => setReview({ ...review, review_note: e.target.value })} />
          </div>
        )}
      </Modal>
    </Card>
  );
}
