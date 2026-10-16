'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Button } from '@/components/ui';
import { loadWhitespace, UNCATEGORIZED, type WSData } from '@/lib/whitespace';
import { MarkEditor, Legend, STATE, tl } from '@/components/whitespace/WhitespaceUI';
import { Grid3x3, ExternalLink } from 'lucide-react';
import { parasutCall } from '@/lib/parasut-client';

/** Müşteri kartı: bu müşterinin kategori bazında alım durumu ve çapraz satış önerileri */
export default function CrossSell({ supabase, customer, liveDocs = [] }: { supabase: any; customer: any; liveDocs?: any[] }) {
  const [d, setD] = useState<WSData | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [mapping, setMapping] = useState<string | null>(null);
  const mapCat = async (cat: string, line: string) => {
    setMapping(cat);
    try { await parasutCall('/api/parasut/business-lines', 'POST', { action: 'map', purchase_category: cat, business_line: line || null }); await load(); }
    catch (e: any) { alert(e.message); } finally { setMapping(null); }
  };
  const load = useCallback(async () => { setD(await loadWhitespace(supabase, { customerId: customer.id, liveBuys: liveDocs })); }, [customer.id, liveDocs.length]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <Card className="p-6 text-sm text-slate-500">Yükleniyor…</Card>;
  const offs = d.offerings.filter(o => o !== UNCATEGORIZED || d.cells[customer.id]?.[o]);
  const order = ['buying', 'supplier', 'remapped', 'quoted', 'opportunity', 'lapsed', 'suggested', 'empty', 'competitor', 'not_now', 'no_need'];
  const rows = offs.map(o => {
    const st = d.stateOf(customer.id, o); const sg = d.suggestions.find(s => s.offering === o);
    return { o, st: st === 'empty' && sg ? 'suggested' as const : st, x: d.cells[customer.id]?.[o], sg, m: d.marks[customer.id]?.[o] };
  }).sort((a, b) => order.indexOf(a.st) - order.indexOf(b.st) || (b.x?.rev12 || 0) - (a.x?.rev12 || 0));
  const buying = rows.filter(r => r.st === 'buying');
  const potential = rows.reduce((a, r) => a + (r.sg?.est || 0), 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Grid3x3 className="h-4 w-4 text-indigo-600" />Beyaz alan / çapraz satış</p>
          <p className="text-xs text-slate-500">{offs.length} kategoriden {buying.length} tanesinde son 12 ayda alım var{potential > 0 ? ` · boş alanların tahmini yıllık potansiyeli ${tl(potential)}` : ''}</p>
        </div>
        <span className="flex-1" /><Legend />
        <Link href="/whitespace"><Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" />Tüm müşteriler</Button></Link>
      </div>
      {offs.length === 0 ? <p className="p-4 text-sm text-slate-500">Henüz kategori yok. Paraşüt fatura kategorileri veya ürün kataloğu kategorileri burada listelenir.</p> : (
        <div className="divide-y">{rows.map(r => (
          <button key={r.o} onClick={() => setEdit(r.o)} className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
            <span className={`w-32 shrink-0 rounded-full border px-2 py-0.5 text-center text-[11px] ${STATE[r.st].cls}`}>{STATE[r.st].label}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.o}</p>
              <p className="truncate text-xs text-slate-500">
                {r.st === 'buying' ? (r.x && r.x.rev12 > 0 ? `${r.x.count} belge · son alım ${r.x.last ? new Date(r.x.last).toLocaleDateString('tr-TR') : '-'}${r.x.products.length ? ' · ' + r.x.products.slice(0, 4).join(', ') : ''}` : `Elle işaretlendi${r.m?.note ? ' · ' + r.m.note : ''}`) + (r.x?.supply?.buyAll ? ` · ayrıca bu kategoride bu firmadan alış: ${tl(r.x.supply.buy12)} (son 12 ay)` : '')
                  : r.st === 'supplier' ? `Bu kategoride bu firmadan alıyorsunuz · ${r.x!.supply!.count} alış faturası${r.x!.supply!.resale12 > 0 ? ` · bu alımlarla ${tl(r.x!.supply!.resale12)} satış${r.x!.supply!.resaleTo.length ? ` (${r.x!.supply!.resaleTo.join(', ')})` : ''}` : ''}`
                  : r.st === 'remapped' ? `Bu müşteride ${r.m?.remap_to} olarak sayılıyor`
                  : r.sg ? r.sg.reason
                  : r.m ? [r.m.competitor, r.m.note].filter(Boolean).join(' · ') || STATE[r.st].label
                  : 'Bu kategoride alım yok. Değerlendirme girmek için tıklayın.'}
              </p>
            </div>
            <p className="w-32 text-right">{r.st === 'buying' ? (r.x && r.x.rev12 > 0 ? <><b>{tl(r.x.rev12)}</b><span className="block text-[10px] text-slate-400">son 12 ay</span></> : null)
              : r.st === 'supplier' ? <><b className="text-stone-700">{tl(r.x!.supply!.buy12)}</b><span className="block text-[10px] text-slate-400">alış · son 12 ay</span></>
              : r.sg ? <><b className="text-indigo-700">{tl(r.sg.est)}</b><span className="block text-[10px] text-slate-400">tahmini / yıl</span></> : null}</p>
          </button>
        ))}</div>
      )}
      {(d.supplyCats[customer.id] || []).length > 0 && (
        <div className="border-t">
          <div className="bg-stone-50 px-4 py-2.5">
            <p className="text-sm font-semibold text-stone-800">Bu firmadan alışlarınız (Paraşüt alış faturaları)</p>
            <p className="text-xs text-stone-600">Ana firma / tedarikçi tarafı. Her gider kategorisinin hangi iş kolunuza ait olduğunu seçin; o iş kolu bu firmada "Ana firma (alış)" olarak görünür, satış fırsatı olarak önerilmez. Seçim tüm firmalarda bu gider kategorisi için geçerlidir (İş Kolları ekranıyla ortak).</p>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="px-4 py-1.5 font-medium">Paraşüt gider kategorisi</th><th className="px-2 py-1.5 text-right font-medium">Fatura</th><th className="px-2 py-1.5 text-right font-medium">Son 12 ay</th><th className="px-2 py-1.5 text-right font-medium">Toplam</th><th className="px-4 py-1.5 font-medium">İş kolu</th></tr></thead>
            <tbody>{d.supplyCats[customer.id].sort((x, y) => y.buyAll - x.buyAll).map(sc => (
              <tr key={sc.cat} className="border-b last:border-0">
                <td className="px-4 py-2 font-medium">{sc.cat}</td>
                <td className="px-2 py-2 text-right">{sc.count}</td>
                <td className="px-2 py-2 text-right">{tl(sc.buy12)}</td>
                <td className="px-2 py-2 text-right text-slate-500">{tl(sc.buyAll)}</td>
                <td className="px-4 py-1.5">
                  {sc.raw ? (
                    <select value={sc.off || ''} disabled={mapping === sc.cat} onChange={e => mapCat(sc.raw, e.target.value)} className={`h-8 rounded border px-2 text-xs ${sc.off ? 'border-stone-300' : 'border-amber-400 bg-amber-50'}`}>
                      <option value="">{sc.off ? 'Eşlemeyi kaldır' : 'Seçin (eşleşmedi)'}</option>
                      {d.offerings.filter(o => o !== UNCATEGORIZED).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : <span className="text-xs text-amber-700">Paraşüt'te kategori verilmemiş{sc.docs.map(x => <span key={x.date + x.amount} className="block text-slate-600">{x.date ? new Date(x.date).toLocaleDateString('tr-TR') : '-'} · {tl(x.amount)} + KDV{x.no ? ` · No ${x.no}` : ''}{x.party ? ` · ${x.party}` : ''}{x.text ? ` · ${x.text}` : ''}</span>)}</span>}
                  {sc.off && !sc.mapped && <span className="ml-2 text-[11px] text-slate-400">ad benzerliğinden</span>}
                </td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {!(d.supplyCats[customer.id] || []).length && (customer.relation_roles || []).some((r: string) => r === 'principal' || r === 'supplier') && (
        <div className="border-t bg-slate-50 px-4 py-3 text-xs text-slate-600">
          Bu firma ana firma / tedarikçi olarak işaretli ama okunan {d.buyScanned} alış faturası içinde bu firmaya ait fatura bulunamadı.
          {d.buyScanned === 0 ? ' Paraşüt\'ten hiç alış faturası gelmemiş görünüyor: Entegrasyonlar → Paraşüt → Senkronize et.' : ' Faturalardaki firma adı veya vergi numarası bu kartla eşleşmiyor olabilir.'}
          <details className="mt-2">
            <summary className="cursor-pointer font-medium text-slate-700">Teşhis ayrıntısı (ekran görüntüsü için açın)</summary>
            <p className="mt-1">Kart: <b>{customer.name}</b> · VKN {customer.tax_number || 'yok'} · Cari durum kutusundaki canlı Paraşüt alış belgesi: <b>{d.liveBuyCount}</b>{liveDocs.length === 0 ? ' (Cari durum kutusu yüklenmemiş — önce Özet sekmesini açın)' : ''}</p>
            <p className="mt-1">Kayıtlı alış faturalarındaki firmalar:</p>
            <ul className="mt-0.5 grid gap-x-6 sm:grid-cols-2">{d.buyParties.map(p => (
              <li key={p.name}>{p.name} — {p.count} fatura{p.tax ? ' · VKN var' : ' · VKN yok'}{p.contact ? '' : ' · cari no yok'}{p.linked ? ' · karta bağlı' : ''}</li>))}</ul>
          </details>
        </div>
      )}
      {edit && <MarkEditor supabase={supabase} data={d} customer={customer} offering={edit} onClose={() => setEdit(null)} onSaved={load} />}
    </Card>
  );
}
