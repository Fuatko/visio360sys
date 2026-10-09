'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Textarea, Modal } from '@/components/ui';
import { StatusBadge, FileLink } from '@/components/portal/common';
import { formatMoney, formatDate } from '@/lib/utils';
import { PAYMENT_NOTICE_STATUS, n } from '@/lib/portal';

interface Props { supabase: any; dealers: any[]; onChanged?: () => void }
const tl = (v: number) => `₺${formatMoney(v)}`;

export default function PaymentNotices({ supabase, dealers, onChanged }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState('submitted');
  const [act, setAct] = useState<any | null>(null);

  const load = () => supabase.from('dealer_payment_notices').select('*').order('created_at', { ascending: false }).then(({ data }: any) => setItems(data || []));
  useEffect(() => { load(); }, []);
  const dname = (id: string) => dealers.find(d => d.id === id)?.name || '-';

  const decide = async (status: string) => {
    const { error } = await supabase.from('dealer_payment_notices').update({ status, review_note: act.note || null, reviewed_at: new Date().toISOString() }).eq('id', act.x.id);
    if (error) { alert(error.message); return; }
    setAct(null); load(); onChanged?.();
    if (status === 'confirmed' && confirm('Ödeme onaylandı. Tahsilat sayfasında ilgili alacakları "Ödendi" olarak işaretlemek ister misiniz?')) router.push('/collections');
  };

  const list = items.filter(x => !filter || x.status === filter);
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Bayi Ödeme Bildirimleri</h3>
        {[['submitted', 'Bekleyen'], ['confirmed', 'Onaylanan'], ['rejected', 'Reddedilen'], ['', 'Tümü']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs ${filter === k ? 'bg-indigo-600 text-white' : 'border'}`}>{l}</button>
        ))}
      </div>
      {list.length === 0 ? <p className="text-sm text-slate-500">Bildirim yok.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Bayi</th><th>Tarih</th><th>Yöntem</th><th>Referans / Not</th><th className="text-right">Tutar</th><th>Durum</th><th /></tr></thead>
          <tbody>
            {list.map(x => (
              <tr key={x.id} className="border-b">
                <td className="py-2 font-medium">{dname(x.dealer_id)}</td>
                <td>{formatDate(x.payment_date)}</td>
                <td className="text-xs">{x.method}{x.bank ? ` · ${x.bank}` : ''}{x.due_date ? ` · vade ${formatDate(x.due_date)}` : ''}</td>
                <td className="text-xs">{x.reference || '-'} <FileLink supabase={supabase} value={x.attachment_url} />{x.note && <div className="text-slate-500">{x.note}</div>}</td>
                <td className="text-right font-semibold">{tl(n(x.amount))}</td>
                <td><StatusBadge map={PAYMENT_NOTICE_STATUS} value={x.status} /></td>
                <td className="text-right">{x.status === 'submitted' && <Button size="sm" onClick={() => setAct({ x, note: '' })}>Kontrol et</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal isOpen={!!act} onClose={() => setAct(null)} title="Ödeme bildirimi"
        footer={<><Button variant="secondary" onClick={() => setAct(null)}>Vazgeç</Button><Button variant="danger" onClick={() => decide('rejected')}>Reddet</Button><Button variant="success" onClick={() => decide('confirmed')}>Hesaba geçti, onayla</Button></>}>
        {act && (
          <div className="space-y-3 text-sm">
            <p><b>{dname(act.x.dealer_id)}</b> · {tl(n(act.x.amount))} · {act.x.method} · {formatDate(act.x.payment_date)}</p>
            <Textarea label="Not (bayi görür)" value={act.note} onChange={e => setAct({ ...act, note: e.target.value })} />
          </div>
        )}
      </Modal>
    </Card>
  );
}
