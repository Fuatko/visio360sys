'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Card, Button, Badge, Modal, Input, Select, Textarea } from '@/components/ui';
import { CitySelect } from '@/components/TrSelects';
import { formatMoney, formatDate } from '@/lib/utils';
import { APP_STAGES, OPEN_STAGES, stageOf, TIMELINES, SOURCES, REJECT_REASONS, scoreTone } from '@/lib/franchise';
import { Plus, Link2, Copy, Download, Phone, MessageCircle, Mail, MapPin, Store, Settings2, Clock } from 'lucide-react';

interface Props { supabase: any; apps: any[]; form: any | null; team: any[]; onChanged: () => void; onOpenRoyalty: (dealerId: string) => void }

const EMPTY = { full_name: '', phone: '', email: '', city: '', district: '', company_name: '', occupation: '', investment_budget: '', has_location: false,
  location_address: '', location_sqm: '', experience: '', timeline: '', source: 'Diğer', message: '', stage: 'new', assigned_to: '', next_action_date: '',
  expected_open_date: '', franchise_fee: '', rejection_reason: '', notes: '' };
const DAY = 864e5;
const tl = (v: any) => (v === null || v === undefined || v === '' ? '-' : `₺${formatMoney(Number(v))}`);

export default function Applications({ supabase, apps, form, team, onChanged, onOpenRoyalty }: Props) {
  const [edit, setEdit] = useState<any | null>(null);
  const [cfg, setCfg] = useState<any | null>(null);
  const [view, setView] = useState<'board' | 'closed'>('board');
  const [qr, setQr] = useState('');
  const url = form?.public_token && typeof window !== 'undefined' ? `${window.location.origin}/f/${form.public_token}` : '';
  useEffect(() => { if (url) QRCode.toDataURL(url, { width: 480, margin: 1 }).then(setQr).catch(() => setQr('')); }, [url]);

  const now = Date.now();
  const open = apps.filter(a => OPEN_STAGES.includes(a.stage));
  const thisMonth = apps.filter(a => new Date(a.created_at).getMonth() === new Date().getMonth() && new Date(a.created_at).getFullYear() === new Date().getFullYear());
  const decided = apps.filter(a => ['opened', 'rejected', 'withdrawn'].includes(a.stage));
  const conv = decided.length ? Math.round((100 * apps.filter(a => a.stage === 'opened').length) / decided.length) : null;
  const pipelineFee = open.filter(a => ['feasibility', 'contract'].includes(a.stage)).reduce((s, a) => s + (Number(a.franchise_fee) || Number(form?.franchise_fee) || 0), 0);
  const stale = open.filter(a => now - new Date(a.stage_changed_at || a.created_at).getTime() > 14 * DAY).length;
  const tname = (id: string) => team.find(t => t.id === id)?.name;

  const bySource = useMemo(() => {
    const m: Record<string, { n: number; opened: number }> = {};
    apps.forEach(a => { const k = a.source || 'Belirtilmemiş'; m[k] = m[k] || { n: 0, opened: 0 }; m[k].n++; if (a.stage === 'opened') m[k].opened++; });
    return Object.entries(m).sort((a, b) => b[1].n - a[1].n);
  }, [apps]);

  const save = async () => {
    if (!edit.full_name.trim()) { alert('Ad soyad girin.'); return; }
    if (edit.stage === 'rejected' && !edit.rejection_reason) { alert('Olumsuz sonuç için neden seçin.'); return; }
    const { id, created_at, score, stage_changed_at, organization_id, meta, kvkk_accepted, marketing_consent, ...rest } = edit;
    const payload: any = {};
    Object.entries(rest).forEach(([k, v]) => { payload[k] = v === '' ? null : v; });
    payload.has_location = !!edit.has_location;
    const { error } = id ? await supabase.from('franchise_applications').update(payload).eq('id', id) : await supabase.from('franchise_applications').insert([payload]);
    if (error) { alert(error.message); return; }
    setEdit(null); onChanged();
  };

  const moveStage = async (a: any, stage: string) => {
    if (stage === 'rejected') { setEdit({ ...EMPTY, ...clean(a), stage }); return; }
    const { error } = await supabase.from('franchise_applications').update({ stage }).eq('id', a.id);
    if (error) alert(error.message); else onChanged();
  };

  // Açılan franchise için bayi/şube kartı oluştur
  const createDealer = async () => {
    const a = edit;
    const name = (a.company_name || a.full_name || '').trim();
    if (!confirm(`"${name}" için franchise (bayi) kartı oluşturulsun mu? Portal kullanıcısı, royalty anlaşması ve denetimler bu karta bağlanır.`)) return;
    const { data, error } = await supabase.from('customers').insert([{ name, customer_type: 'dealer', contact_person: a.full_name || null, phone: a.phone || null,
      email: a.email || null, region: a.city || null, address: [a.location_address, [a.district, a.city].filter(Boolean).join(' / ')].filter(Boolean).join(', ') || null, status: 'Aktif', notes: 'Franchise başvurusundan oluşturuldu' }]).select('id').single();
    if (error) { alert(error.message); return; }
    await supabase.from('franchise_applications').update({ dealer_id: data.id, stage: 'opened' }).eq('id', a.id);
    setEdit(null); onChanged();
    if (confirm('Kart oluşturuldu. Şimdi royalty anlaşmasını tanımlamak ister misiniz?')) onOpenRoyalty(data.id);
  };

  const saveCfg = async () => {
    const payload = { brand: cfg.brand || null, intro: cfg.intro || null, kvkk_text: cfg.kvkk_text || null, is_active: !!cfg.is_active,
      min_investment: cfg.min_investment === '' ? null : Number(cfg.min_investment), franchise_fee: cfg.franchise_fee === '' ? null : Number(cfg.franchise_fee) };
    const { error } = form?.id ? await supabase.from('franchise_forms').update(payload).eq('id', form.id) : await supabase.from('franchise_forms').insert([payload]);
    if (error) { alert(error.message); return; }
    setCfg(null); onChanged();
  };

  const Card1 = ({ a }: { a: any }) => {
    const days = Math.floor((now - new Date(a.stage_changed_at || a.created_at).getTime()) / DAY);
    return (
      <div onClick={() => setEdit({ ...EMPTY, ...clean(a) })} className="cursor-pointer rounded-lg border bg-white p-2.5 text-sm shadow-sm hover:border-indigo-300">
        <div className="flex items-start gap-2">
          <p className="flex-1 font-medium leading-tight">{a.full_name}</p>
          <span className={`rounded px-1.5 text-[11px] font-semibold ${scoreTone(a.score)}`} title="Başvuru puanı (bütçe, lokasyon, zamanlama, deneyim)">{a.score}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{[a.city, a.investment_budget ? tl(a.investment_budget) : null].filter(Boolean).join(' · ') || '—'}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
          {a.has_location && <span className="rounded bg-green-50 px-1 text-green-700">Yeri var</span>}
          {a.timeline && <span className="rounded bg-slate-100 px-1">{a.timeline}</span>}
          <span className={`ml-auto flex items-center gap-0.5 ${days > 14 ? 'font-semibold text-red-600' : ''}`}><Clock className="h-3 w-3" />{days} g</span>
        </div>
        {a.next_action_date && <p className={`mt-1 text-[10px] ${a.next_action_date < new Date().toISOString().slice(0, 10) ? 'text-red-600' : 'text-indigo-600'}`}>Sonraki adım: {formatDate(a.next_action_date)}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4"><p className="text-2xl font-bold text-indigo-600">{open.length}</p><p className="text-xs text-slate-500">Süreçteki aday</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold">{thisMonth.length}</p><p className="text-xs text-slate-500">Bu ay gelen başvuru</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold text-green-600">{conv === null ? '-' : `%${conv}`}</p><p className="text-xs text-slate-500">Başvurudan açılışa dönüşüm</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold">{tl(pipelineFee)}</p><p className="text-xs text-slate-500">Fizibilite + sözleşmedeki giriş bedeli</p></Card>
        <Card className="p-4"><p className={`text-2xl font-bold ${stale ? 'text-red-600' : ''}`}>{stale}</p><p className="text-xs text-slate-500">14 günden uzun bekleyen</p></Card>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Link2 className="h-5 w-5 text-indigo-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Online franchise başvuru formu {form && !form.is_active && <Badge variant="danger">Kapalı</Badge>}</p>
          {url ? <p className="truncate font-mono text-xs text-slate-500">{url}</p> : <p className="text-xs text-slate-500">Henüz oluşturulmadı. Web sitenize, sosyal medyaya ve fuar standına koyacağınız formu oluşturun.</p>}
        </div>
        {url && <>
          <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(url); }}><Copy className="h-3 w-3" />Kopyala</Button>
          {qr && <a href={qr} download="franchise-basvuru-qr.png"><Button size="sm" variant="secondary"><Download className="h-3 w-3" />QR kod</Button></a>}
          <a href={url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost">Önizle</Button></a>
        </>}
        <Button size="sm" onClick={() => setCfg({ brand: form?.brand || '', intro: form?.intro || '', kvkk_text: form?.kvkk_text || '', min_investment: form?.min_investment ?? '',
          franchise_fee: form?.franchise_fee ?? '', is_active: form ? form.is_active : true })}><Settings2 className="h-3 w-3" />{form ? 'Form ayarları' : 'Formu oluştur'}</Button>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-white p-0.5 text-sm">
          <button onClick={() => setView('board')} className={`rounded-md px-3 py-1 ${view === 'board' ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>Süreç panosu</button>
          <button onClick={() => setView('closed')} className={`rounded-md px-3 py-1 ${view === 'closed' ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>Sonuçlananlar ({decided.length})</button>
        </div>
        <Button size="sm" className="ml-auto" onClick={() => setEdit({ ...EMPTY })}><Plus className="h-3 w-3" />Başvuru ekle</Button>
      </div>

      {view === 'board' ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {OPEN_STAGES.map(k => {
            const list = open.filter(a => a.stage === k).sort((a, b) => b.score - a.score);
            return (
              <div key={k} className="w-64 shrink-0 rounded-xl bg-slate-100 p-2"
                onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('id'); const a = apps.find(x => x.id === id); if (a && a.stage !== k) moveStage(a, k); }}>
                <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-slate-600">{stageOf(k).label}<span className="rounded-full bg-white px-2">{list.length}</span></p>
                <div className="space-y-2">
                  {list.map(a => <div key={a.id} draggable onDragStart={e => e.dataTransfer.setData('id', a.id)}><Card1 a={a} /></div>)}
                  {list.length === 0 && <p className="px-1 py-4 text-center text-[11px] text-slate-400">Boş</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="p-4">
          {decided.length === 0 ? <p className="text-sm text-slate-500">Henüz sonuçlanan başvuru yok.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Aday</th><th>Şehir</th><th>Sonuç</th><th>Neden / şube</th><th>Başvuru</th></tr></thead>
              <tbody>{decided.sort((a, b) => (b.stage_changed_at || '').localeCompare(a.stage_changed_at || '')).map(a => (
                <tr key={a.id} className="cursor-pointer border-b hover:bg-slate-50" onClick={() => setEdit({ ...EMPTY, ...clean(a) })}>
                  <td className="py-2 font-medium">{a.full_name}</td><td>{a.city || '-'}</td>
                  <td><Badge variant={stageOf(a.stage).variant}>{stageOf(a.stage).label}</Badge></td>
                  <td className="text-xs text-slate-600">{a.stage === 'opened' ? (a.dealer_id ? 'Franchise kartı var' : 'Kart oluşturulmadı') : a.rejection_reason || '-'}</td>
                  <td className="text-xs text-slate-500">{formatDate(a.created_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      )}

      {bySource.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Başvuru kaynakları</p>
          <div className="flex flex-wrap gap-2 text-xs">{bySource.map(([k, v]) => <span key={k} className="rounded-full bg-slate-100 px-3 py-1">{k}: <b>{v.n}</b>{v.opened ? <span className="text-green-700"> · {v.opened} açılış</span> : null}</span>)}</div>
        </Card>
      )}

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.id ? edit.full_name : 'Yeni franchise başvurusu'} size="xl"
        footer={<div className="flex w-full flex-wrap gap-2">
          {edit?.id && ['contract', 'opened'].includes(edit.stage) && !edit.dealer_id && <Button variant="success" onClick={createDealer}><Store className="h-4 w-4" />Franchise kartı oluştur</Button>}
          {edit?.dealer_id && <Button variant="secondary" onClick={() => { const d = edit.dealer_id; setEdit(null); onOpenRoyalty(d); }}>Royalty anlaşması</Button>}
          <span className="flex-1" /><Button variant="secondary" onClick={() => setEdit(null)}>Kapat</Button><Button onClick={save}>Kaydet</Button></div>}>
        {edit && (
          <div className="space-y-4">
            {edit.id && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
                <span className={`rounded px-2 py-0.5 font-semibold ${scoreTone(edit.score)}`}>Puan {edit.score}/100</span>
                {edit.phone && <a href={`tel:${edit.phone}`} className="flex items-center gap-1 text-indigo-600"><Phone className="h-4 w-4" />{edit.phone}</a>}
                {edit.phone && <a href={`https://wa.me/${String(edit.phone).replace(/\D/g, '').replace(/^0/, '90')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-green-600"><MessageCircle className="h-4 w-4" />WhatsApp</a>}
                {edit.email && <a href={`mailto:${edit.email}`} className="flex items-center gap-1 text-indigo-600"><Mail className="h-4 w-4" />{edit.email}</a>}
                <span className="ml-auto text-xs text-slate-500">Başvuru: {formatDate(edit.created_at)}{edit.marketing_consent ? ' · ticari ileti izni var' : ''}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {APP_STAGES.map(s => (
                <button key={s.key} onClick={() => setEdit({ ...edit, stage: s.key })}
                  className={`rounded-full border px-3 py-1 text-xs ${edit.stage === s.key ? 'border-indigo-600 bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{s.label}</button>
              ))}
            </div>
            {edit.stage === 'rejected' && <Select label="Olumsuz nedeni *" value={edit.rejection_reason} onChange={e => setEdit({ ...edit, rejection_reason: e.target.value })}
              options={[{ value: '', label: 'Seçin' }, ...REJECT_REASONS.map(r => ({ value: r, label: r }))]} />}
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Ad soyad *" value={edit.full_name} onChange={e => setEdit({ ...edit, full_name: e.target.value })} />
              <Input label="Telefon" value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} />
              <Input label="E-posta" value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} />
              <CitySelect value={edit.city} onChange={v => setEdit({ ...edit, city: v })} />
              <Input label="İlçe / bölge" value={edit.district} onChange={e => setEdit({ ...edit, district: e.target.value })} />
              <Input label="Şirket (varsa)" value={edit.company_name} onChange={e => setEdit({ ...edit, company_name: e.target.value })} />
              <Input label="Yatırım bütçesi (₺)" type="number" value={edit.investment_budget} onChange={e => setEdit({ ...edit, investment_budget: e.target.value })} />
              <Select label="Ne zaman açmak istiyor" value={edit.timeline} onChange={e => setEdit({ ...edit, timeline: e.target.value })} options={[{ value: '', label: '-' }, ...TIMELINES.map(t => ({ value: t, label: t }))]} />
              <Select label="Kaynak" value={edit.source} onChange={e => setEdit({ ...edit, source: e.target.value })} options={SOURCES.map(t => ({ value: t, label: t }))} />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.has_location} onChange={e => setEdit({ ...edit, has_location: e.target.checked })} /><MapPin className="h-4 w-4 text-slate-400" />Hazır lokasyonu var</label>
            {edit.has_location && <div className="grid gap-3 sm:grid-cols-3"><div className="sm:col-span-2"><Input label="Lokasyon adresi" value={edit.location_address} onChange={e => setEdit({ ...edit, location_address: e.target.value })} /></div>
              <Input label="Alan (m²)" type="number" value={edit.location_sqm} onChange={e => setEdit({ ...edit, location_sqm: e.target.value })} /></div>}
            <Textarea label="Sektör deneyimi" rows={2} value={edit.experience} onChange={e => setEdit({ ...edit, experience: e.target.value })} />
            {edit.message && <div className="rounded-lg bg-indigo-50 p-3 text-sm"><p className="text-xs font-semibold text-indigo-700">Adayın mesajı</p>{edit.message}</div>}
            <div className="grid gap-3 border-t pt-3 sm:grid-cols-4">
              <Select label="Sorumlu" value={edit.assigned_to} onChange={e => setEdit({ ...edit, assigned_to: e.target.value })} options={[{ value: '', label: '-' }, ...team.map(t => ({ value: t.id, label: t.name }))]} />
              <Input label="Sonraki adım tarihi" type="date" value={edit.next_action_date} onChange={e => setEdit({ ...edit, next_action_date: e.target.value })} />
              <Input label="Tahmini açılış" type="date" value={edit.expected_open_date} onChange={e => setEdit({ ...edit, expected_open_date: e.target.value })} />
              <Input label="Giriş bedeli (₺)" type="number" value={edit.franchise_fee} onChange={e => setEdit({ ...edit, franchise_fee: e.target.value })} placeholder={form?.franchise_fee ? String(form.franchise_fee) : ''} />
            </div>
            <Textarea label="Görüşme notları" rows={3} value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} />
            {edit.assigned_to && <p className="text-xs text-slate-500">Sorumlu: {tname(edit.assigned_to)}</p>}
          </div>
        )}
      </Modal>

      <Modal isOpen={!!cfg} onClose={() => setCfg(null)} title="Franchise başvuru formu" size="lg"
        footer={<><Button variant="secondary" onClick={() => setCfg(null)}>İptal</Button><Button onClick={saveCfg}>Kaydet</Button></>}>
        {cfg && (
          <div className="space-y-3">
            <Input label="Marka adı (formda görünür)" value={cfg.brand} onChange={e => setCfg({ ...cfg, brand: e.target.value })} />
            <Textarea label="Tanıtım metni" rows={3} value={cfg.intro} onChange={e => setCfg({ ...cfg, intro: e.target.value })} placeholder="Markamızın franchise ailesine katılın. Kanıtlanmış iş modeli, eğitim ve açılış desteği…" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Asgari yatırım (₺) — puanlama için" type="number" value={cfg.min_investment} onChange={e => setCfg({ ...cfg, min_investment: e.target.value })} />
              <Input label="Franchise giriş bedeli (₺)" type="number" value={cfg.franchise_fee} onChange={e => setCfg({ ...cfg, franchise_fee: e.target.value })} />
            </div>
            <Textarea label="KVKK aydınlatma metni" rows={5} value={cfg.kvkk_text} onChange={e => setCfg({ ...cfg, kvkk_text: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.is_active} onChange={e => setCfg({ ...cfg, is_active: e.target.checked })} />Form başvuru kabul ediyor</label>
            <p className="text-xs text-slate-500">Başvurular 100 üzerinden otomatik puanlanır: bütçe (asgari yatırıma göre) 40, hazır lokasyon 25, açılış zamanı 20, sektör deneyimi 15.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

const clean = (a: any) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v ?? '']));
