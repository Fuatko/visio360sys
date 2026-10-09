'use client';

import { Card, Button, Input, Modal } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { Plus, Tags, Save, Wand2 } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Props {
  supabase: any;
  priceLists: any[];
  items: any[];
  products: any[];
  dealers: any[];
  onChanged: () => void;
}

const n = (v: any) => Number(v) || 0;

export default function PriceLists({ supabase, priceLists, items, products, dealers, onChanged }: Props) {
  const [selected, setSelected] = useState<string>(priceLists[0]?.id || '');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [bulkPct, setBulkPct] = useState<number>(10);
  const [search, setSearch] = useState('');

  useEffect(() => { if (!selected && priceLists[0]) setSelected(priceLists[0].id); }, [priceLists]);
  useEffect(() => {
    const d: Record<string, string> = {};
    items.filter(i => i.price_list_id === selected).forEach(i => { d[i.product_id] = String(i.price); });
    setDraft(d);
  }, [selected, items]);

  const list = priceLists.find(p => p.id === selected);
  const usedBy = dealers.filter(d => d.price_list_id === selected);
  const visibleProducts = products.filter(p => !search || (p.name || '').toLowerCase().includes(search.toLowerCase()) || (p.category || '').toLowerCase().includes(search.toLowerCase()));

  const createList = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.from('price_lists').insert([{ name: newName.trim() }]).select().single();
    setBusy(false);
    if (error) { alert('Hata: ' + error.message); return; }
    setNewOpen(false); setNewName(''); setSelected(data.id); onChanged();
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    const existing = items.filter(i => i.price_list_id === selected);
    const upserts = Object.entries(draft)
      .filter(([, v]) => v !== '' && !isNaN(Number(v)))
      .map(([product_id, v]) => ({ price_list_id: selected, product_id, price: Number(v) }));
    const removed = existing.filter(i => draft[i.product_id] === undefined || draft[i.product_id] === '').map(i => i.product_id);
    try {
      if (upserts.length) {
        const { error } = await supabase.from('price_list_items').upsert(upserts, { onConflict: 'price_list_id,product_id' });
        if (error) throw error;
      }
      if (removed.length) {
        const { error } = await supabase.from('price_list_items').delete().eq('price_list_id', selected).in('product_id', removed);
        if (error) throw error;
      }
      onChanged();
      alert('Fiyat listesi kaydedildi.');
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const bulkFill = () => {
    const d = { ...draft };
    visibleProducts.forEach(p => { if (n(p.price) > 0) d[p.id] = (Math.round(n(p.price) * (1 - bulkPct / 100) * 100) / 100).toString(); });
    setDraft(d);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Card className="p-4 lg:col-span-1">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1 text-sm font-semibold"><Tags className="h-4 w-4 text-indigo-600" />Fiyat Listeleri</h3>
          <Button size="sm" variant="secondary" onClick={() => setNewOpen(true)}><Plus className="h-3 w-3" /></Button>
        </div>
        {priceLists.length === 0 && <p className="text-xs text-slate-500">Henüz liste yok. Bayi gruplarınız için liste oluşturun (ör. "Bayi Liste A", "Distribütör").</p>}
        <div className="space-y-1">
          {priceLists.map(pl => (
            <button key={pl.id} onClick={() => setSelected(pl.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected === pl.id ? 'bg-indigo-50 font-medium text-indigo-700' : 'hover:bg-slate-50'}`}>
              {pl.name}
              <div className="text-[11px] font-normal text-slate-400">{dealers.filter(d => d.price_list_id === pl.id).length} bayi · {items.filter(i => i.price_list_id === pl.id).length} ürün</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4 lg:col-span-3">
        {!list ? <p className="text-sm text-slate-500">Bir fiyat listesi seçin veya oluşturun.</p> : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="mr-auto text-sm font-semibold">{list.name}
                <span className="ml-2 text-xs font-normal text-slate-500">{usedBy.length ? `Kullanan: ${usedBy.map(d => d.name).join(', ')}` : 'Henüz bayiye atanmadı'}</span>
              </h3>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ürün / kategori ara" className="h-8 w-44 rounded-lg border border-slate-200 px-2 text-sm" />
              <div className="flex items-center gap-1 text-xs">
                <span>Liste fiyatının</span>
                <input type="number" value={bulkPct} onChange={e => setBulkPct(parseFloat(e.target.value) || 0)} className="h-8 w-14 rounded border border-slate-200 px-1 text-right" />
                <span>% altı</span>
                <Button size="sm" variant="secondary" onClick={bulkFill} title="Görünen ürünlere toplu fiyat"><Wand2 className="h-3 w-3" />Uygula</Button>
              </div>
              <Button size="sm" onClick={save} disabled={busy}><Save className="h-3 w-3" />Kaydet</Button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b text-left text-xs">
                    <th className="px-3 py-2 font-medium">Ürün</th>
                    <th className="px-3 py-2 font-medium">Kategori</th>
                    <th className="px-3 py-2 text-right font-medium">Ürün Fiyatı</th>
                    <th className="px-3 py-2 text-right font-medium">Bu Listedeki Fiyat</th>
                    <th className="px-3 py-2 text-right font-medium">Fark</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map(p => {
                    const v = draft[p.id];
                    const diff = v !== undefined && v !== '' && n(p.price) > 0 ? (Number(v) / n(p.price) - 1) * 100 : null;
                    return (
                      <tr key={p.id} className="border-b">
                        <td className="px-3 py-1.5">{p.name}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-500">{p.category || '-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">₺{formatMoney(n(p.price))}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input type="number" step="0.01" value={v ?? ''} placeholder="ürün fiyatı"
                            onChange={e => setDraft({ ...draft, [p.id]: e.target.value })}
                            className="h-8 w-32 rounded border border-slate-200 px-2 text-right" />
                        </td>
                        <td className={`px-3 py-1.5 text-right text-xs ${diff === null ? 'text-slate-300' : diff < 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {diff === null ? '-' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Boş bırakılan üründe bayiye ürünün kendi fiyatı uygulanır. İskontolar fiyat listesinin üzerine ayrıca uygulanır.</p>
          </>
        )}
      </Card>

      <Modal isOpen={newOpen} onClose={() => setNewOpen(false)} title="Yeni Fiyat Listesi"
        footer={<><Button variant="secondary" onClick={() => setNewOpen(false)}>İptal</Button><Button onClick={createList} disabled={busy || !newName.trim()}>Oluştur</Button></>}>
        <Input label="Liste adı" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Bayi Liste A, Distribütör Listesi..." />
      </Modal>
    </div>
  );
}
