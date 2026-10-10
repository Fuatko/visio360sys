'use client';

import Header from '@/components/Header';
import { Card, Button, Badge, Modal, Input, Select, Textarea } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, MapPin, Navigation, LogIn, LogOut, Plus, Route, CheckCircle2, Clock, Sparkles } from 'lucide-react';

type Tab = 'today' | 'plan' | 'team';
const PURPOSES = ['Tanışma', 'İhtiyaç analizi', 'Demo / sunum', 'Teklif görüşmesi', 'Sözleşme / kapanış', 'Tahsilat', 'Teknik servis', 'Bayi ziyareti / denetim', 'Rutin ilişki ziyareti'];
const OUTCOMES = ['Olumlu – ilerliyor', 'Takip gerekli', 'Olumsuz', 'Yetkili ulaşılamadı'];
const STATUS: Record<string, { label: string; variant: 'default' | 'info' | 'success' | 'danger' | 'warning' }> = {
  planned: { label: 'Planlandı', variant: 'info' }, checked_in: { label: 'Ziyarette', variant: 'warning' }, completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'default' }, missed: { label: 'Yapılmadı', variant: 'danger' },
};
const VERIFY_M = 300;

function distanceM(a: [number, number], b: [number, number]) {
  const R = 6371000, toR = (x: number) => x * Math.PI / 180;
  const dLat = toR(b[0] - a[0]), dLng = toR(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const getPos = () => new Promise<GeolocationPosition>((res, rej) => {
  if (!navigator.geolocation) { rej(new Error('Tarayıcı konum desteklemiyor')); return; }
  navigator.geolocation.getCurrentPosition(res, e => rej(new Error(e.code === 1 ? 'Konum izni verilmedi. Tarayıcı ayarlarından bu siteye konum izni verin.' : 'Konum alınamadı')), { enableHighAccuracy: true, timeout: 15000 });
});

export default function VisitsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('today');
  const [missing, setMissing] = useState(false);
  const [visits, setVisits] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [me, setMe] = useState<string>('');
  const [rep, setRep] = useState<string>('');
  const [form, setForm] = useState<any | null>(null);
  const [out, setOut] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const [v, c, t, u] = await Promise.all([
      supabase.from('field_visits').select('*').order('planned_date', { ascending: true }),
      supabase.from('customers').select('id, name, address, phone, geo_lat, geo_lng').order('name'),
      supabase.from('sales_team').select('id, name, email').order('name'),
      supabase.auth.getUser(),
    ]);
    setMissing(!!v.error);
    setVisits(v.data || []); setCustomers(c.data || []); setTeam(t.data || []);
    const mine = (t.data || []).find((x: any) => x.email && x.email.toLowerCase() === (u.data.user?.email || '').toLowerCase());
    if (mine) { setMe(mine.id); setRep(r => r || mine.id); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const cust = (id: string) => customers.find(c => c.id === id);
  const label = (v: any) => cust(v.customer_id)?.name || v.place_name || 'Ziyaret';
  const addr = (v: any) => v.address || cust(v.customer_id)?.address || '';
  const mapTarget = (v: any) => { const c = cust(v.customer_id); return c?.geo_lat ? `${c.geo_lat},${c.geo_lng}` : addr(v) || label(v); };
  const repVisits = visits.filter(v => !rep || v.sales_person_id === rep);
  const todays = repVisits.filter(v => v.planned_date === today && v.status !== 'cancelled');
  const overdue = repVisits.filter(v => v.planned_date < today && v.status === 'planned');
  const upcoming = repVisits.filter(v => v.planned_date > today && v.status === 'planned');

  const routeUrl = (list: any[]) => {
    const pts = list.filter(v => v.status !== 'completed').map(mapTarget).filter(Boolean);
    if (!pts.length) return null;
    const dest = pts[pts.length - 1], way = pts.slice(0, -1);
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}${way.length ? `&waypoints=${encodeURIComponent(way.join('|'))}` : ''}&travelmode=driving`;
  };

  const checkIn = async (v: any) => {
    setBusy(v.id);
    try {
      const pos = await getPos();
      const here: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      const c = cust(v.customer_id);
      let dist: number | null = null;
      if (c?.geo_lat && c?.geo_lng) dist = Math.round(distanceM(here, [Number(c.geo_lat), Number(c.geo_lng)]));
      else if (c && confirm(`${c.name} için kayıtlı konum yok. Bulunduğunuz konum müşterinin konumu olarak kaydedilsin mi?`)) {
        await supabase.from('customers').update({ geo_lat: here[0], geo_lng: here[1] }).eq('id', c.id); dist = 0;
      }
      const { error } = await supabase.from('field_visits').update({ status: 'checked_in', check_in_at: new Date().toISOString(), check_in_lat: here[0], check_in_lng: here[1],
        check_in_accuracy: Math.round(pos.coords.accuracy), distance_m: dist }).eq('id', v.id);
      if (error) throw error;
      if (dist !== null && dist > VERIFY_M) alert(`Giriş kaydedildi, ancak müşteri konumuna ${Math.round(dist)} m uzaktasınız.`);
      load();
    } catch (e: any) { alert(e.message); } finally { setBusy(null); }
  };

  const finish = async () => {
    const v = out.v;
    const { error } = await supabase.from('field_visits').update({ status: 'completed', check_out_at: new Date().toISOString(), outcome: out.outcome, notes: out.notes || null,
      next_step: out.next_step || null, next_step_date: out.next_step_date || null }).eq('id', v.id);
    if (error) { alert(error.message); return; }
    if (v.customer_id) {
      await supabase.from('crm_activities').insert([{ customer_id: v.customer_id, sales_person_id: v.sales_person_id || null, type: 'Ziyaret',
        title: `Ziyaret: ${v.purpose || ''} (${out.outcome})`, description: [out.notes, out.next_step && `Sonraki adım: ${out.next_step}`].filter(Boolean).join('\n'), activity_date: new Date().toISOString() }]);
      if (out.next_step && out.next_step_date) await supabase.from('crm_tasks').insert([{ customer_id: v.customer_id, sales_person_id: v.sales_person_id || null,
        title: out.next_step, description: `${label(v)} ziyareti sonrası`, due_date: out.next_step_date, priority: 'Orta', status: 'Bekliyor' }]);
    }
    setOut(null); load();
  };

  const saveVisit = async () => {
    if (!form.customer_id && !form.place_name) { alert('Müşteri seçin veya yer adı yazın.'); return; }
    const { id, ...rest } = form;
    const payload: any = {}; Object.entries(rest).forEach(([k, val]) => { payload[k] = val === '' ? null : val; });
    const { error } = id ? await supabase.from('field_visits').update(payload).eq('id', id) : await supabase.from('field_visits').insert([payload]);
    if (error) { alert(error.message); return; }
    setForm(null); load();
  };

  const VisitCard = ({ v }: { v: any }) => {
    const late = v.status === 'planned' && v.planned_date < today;
    return (
      <div className={`rounded-xl border bg-white p-3 ${v.status === 'checked_in' ? 'border-amber-400 ring-1 ring-amber-200' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{label(v)}</p>
            <p className="text-xs text-slate-500">{[v.planned_time, v.purpose].filter(Boolean).join(' · ')}{late && <span className="text-red-600"> · {formatDate(v.planned_date)} (gecikti)</span>}</p>
            {addr(v) && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3 w-3" />{addr(v)}</p>}
          </div>
          <Badge variant={STATUS[late ? 'missed' : v.status]?.variant}>{late ? 'Gecikti' : STATUS[v.status]?.label}</Badge>
        </div>
        {v.status === 'completed' && <p className="mt-1 text-xs text-slate-600">{v.outcome}{v.next_step ? ` → ${v.next_step}` : ''}</p>}
        {v.check_in_at && <p className="mt-1 text-[11px] text-slate-400">Giriş {new Date(v.check_in_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          {v.distance_m !== null && v.distance_m !== undefined ? (Number(v.distance_m) <= VERIFY_M ? ' · konum doğrulandı' : ` · müşteriye ${Math.round(v.distance_m)} m`) : ' · müşteri konumu yok'}</p>}
        <div className="mt-2 flex flex-wrap gap-1">
          {v.status !== 'completed' && <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapTarget(v))}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"><Navigation className="h-3 w-3" />Yol tarifi</a>}
          {v.customer_id && v.status === 'planned' && <a href={`/briefs?customer=${v.customer_id}`} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-indigo-700"><Sparkles className="h-3 w-3" />Hazırlan</a>}
          {v.status === 'planned' && <Button size="sm" onClick={() => checkIn(v)} disabled={busy === v.id}><LogIn className="h-3 w-3" />{busy === v.id ? 'Konum alınıyor…' : 'Giriş yap'}</Button>}
          {v.status === 'checked_in' && <Button size="sm" variant="success" onClick={() => setOut({ v, outcome: OUTCOMES[0], notes: '', next_step: '', next_step_date: '' })}><LogOut className="h-3 w-3" />Ziyareti bitir</Button>}
          {v.status === 'planned' && <button onClick={() => setForm({ ...Object.fromEntries(Object.entries(v).filter(([k]) => ['id', 'customer_id', 'place_name', 'address', 'planned_date', 'planned_time', 'purpose', 'sales_person_id', 'status'].includes(k)).map(([k, val]) => [k, val ?? ''])) })} className="text-xs text-slate-500 hover:underline">Düzenle</button>}
        </div>
      </div>
    );
  };

  // Ekip özeti: son 4 hafta
  const teamStats = useMemo(() => {
    const since = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
    return team.map(t => {
      const vs = visits.filter(v => v.sales_person_id === t.id && v.planned_date >= since && v.planned_date <= today);
      const done = vs.filter(v => v.status === 'completed');
      const verified = done.filter(v => v.distance_m !== null && v.distance_m !== undefined && Number(v.distance_m) <= VERIFY_M);
      const missed = vs.filter(v => v.status === 'missed' || (v.status === 'planned' && v.planned_date < today));
      return { t, planned: vs.length, done: done.length, verified: verified.length, missed: missed.length, positive: done.filter(v => (v.outcome || '').startsWith('Olumlu')).length };
    }).filter(x => x.planned);
  }, [visits, team]);

  const newVisit = (date = today) => setForm({ customer_id: '', place_name: '', address: '', planned_date: date, planned_time: '', purpose: PURPOSES[0], sales_person_id: rep || me || '', status: 'planned' });
  const route = routeUrl(todays);

  return (
    <div>
      <Header title="Saha Ziyaretleri" subtitle="Ziyaret planı, konumla giriş, rota ve ziyaret raporu" />
      <div className="space-y-4 p-4 sm:p-6">
        {missing && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /><b>izin-ve-ziyaret.sql</b> dosyasını Supabase'de çalıştırın.</Card>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-white p-1">
            {([['today', 'Bugün'], ['plan', 'Plan'], ['team', 'Ekip']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 text-sm ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>{l}</button>
            ))}
          </div>
          <select value={rep} onChange={e => setRep(e.target.value)} className="h-9 rounded-lg border px-2 text-sm"><option value="">Tüm temsilciler</option>{team.map(t => <option key={t.id} value={t.id}>{t.name}{t.id === me ? ' (ben)' : ''}</option>)}</select>
          <Button size="sm" className="ml-auto" onClick={() => newVisit()}><Plus className="h-3 w-3" />Ziyaret planla</Button>
        </div>

        {tab === 'today' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-auto text-sm text-slate-600">{todays.length} ziyaret · {todays.filter(v => v.status === 'completed').length} tamamlandı</p>
              {route && <a href={route} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white"><Route className="h-4 w-4" />Günün rotası</a>}
            </div>
            <div className="grid gap-3 md:grid-cols-2">{todays.map(v => <VisitCard key={v.id} v={v} />)}</div>
            {todays.length === 0 && <Card className="p-6 text-center text-sm text-slate-500">Bugün planlı ziyaret yok.</Card>}
            {overdue.length > 0 && (
              <>
                <p className="flex items-center gap-1 pt-2 text-sm font-semibold text-red-600"><Clock className="h-4 w-4" />Geciken ziyaretler</p>
                <div className="grid gap-3 md:grid-cols-2">{overdue.map(v => <VisitCard key={v.id} v={v} />)}</div>
              </>
            )}
          </>
        )}

        {tab === 'plan' && (
          <div className="space-y-4">
            {Array.from(new Set(upcoming.map(v => v.planned_date))).slice(0, 30).map(d => (
              <div key={d}>
                <p className="mb-2 text-sm font-semibold">{new Date(d + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <div className="grid gap-3 md:grid-cols-2">{upcoming.filter(v => v.planned_date === d).map(v => <VisitCard key={v.id} v={v} />)}</div>
              </div>
            ))}
            {upcoming.length === 0 && <Card className="p-6 text-center text-sm text-slate-500">İleri tarihli ziyaret yok.</Card>}
          </div>
        )}

        {tab === 'team' && (
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Son 4 hafta</h3>
            {teamStats.length === 0 ? <p className="text-sm text-slate-500">Ziyaret kaydı yok.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Temsilci</th><th className="text-right">Planlanan</th><th className="text-right">Tamamlanan</th><th className="text-right">Konumu doğrulanan</th><th className="text-right">Yapılmayan</th><th className="text-right">Olumlu sonuç</th></tr></thead>
                <tbody>{teamStats.map(x => (
                  <tr key={x.t.id} className="border-b"><td className="py-1.5 font-medium">{x.t.name}</td><td className="text-right">{x.planned}</td>
                    <td className="text-right">{x.done} <span className="text-xs text-slate-400">(%{x.planned ? Math.round(x.done / x.planned * 100) : 0})</span></td>
                    <td className="text-right"><span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" />{x.verified}</span></td>
                    <td className={`text-right ${x.missed ? 'text-red-600' : ''}`}>{x.missed}</td><td className="text-right">{x.positive}</td></tr>
                ))}</tbody>
              </table>
            )}
            <p className="mt-2 text-[11px] text-slate-400">Konum doğrulama: girişteki konum müşteri konumuna {VERIFY_M} m'den yakınsa. Müşteri konumu ilk ziyarette kaydedilir.</p>
          </Card>
        )}
      </div>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? 'Ziyareti düzenle' : 'Ziyaret planla'}
        footer={<>{form?.id && <Button variant="ghost" onClick={async () => { await supabase.from('field_visits').update({ status: 'cancelled' }).eq('id', form.id); setForm(null); load(); }}>İptal et</Button>}
          <Button variant="secondary" onClick={() => setForm(null)}>Vazgeç</Button><Button onClick={saveVisit}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-3">
            <Select label="Müşteri" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} options={[{ value: '', label: 'Kayıtlı müşteri değil' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
            {!form.customer_id && <div className="grid grid-cols-2 gap-3"><Input label="Yer / firma adı" value={form.place_name} onChange={e => setForm({ ...form, place_name: e.target.value })} /><Input label="Adres" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>}
            <div className="grid grid-cols-3 gap-3">
              <Input label="Tarih" type="date" value={form.planned_date} onChange={e => setForm({ ...form, planned_date: e.target.value })} />
              <Input label="Saat" type="time" value={form.planned_time} onChange={e => setForm({ ...form, planned_time: e.target.value })} />
              <Select label="Temsilci" value={form.sales_person_id} onChange={e => setForm({ ...form, sales_person_id: e.target.value })} options={[{ value: '', label: '-' }, ...team.map(t => ({ value: t.id, label: t.name }))]} />
            </div>
            <Select label="Amaç" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} options={PURPOSES.map(p => ({ value: p, label: p }))} />
          </div>
        )}
      </Modal>
      <Modal isOpen={!!out} onClose={() => setOut(null)} title={out ? `Ziyaret raporu: ${label(out.v)}` : ''}
        footer={<><Button variant="secondary" onClick={() => setOut(null)}>Vazgeç</Button><Button onClick={finish}>Ziyareti tamamla</Button></>}>
        {out && (
          <div className="space-y-3">
            <Select label="Sonuç" value={out.outcome} onChange={e => setOut({ ...out, outcome: e.target.value })} options={OUTCOMES.map(o => ({ value: o, label: o }))} />
            <Textarea label="Görüşme notları" value={out.notes} onChange={e => setOut({ ...out, notes: e.target.value })} />
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Input label="Sonraki adım" value={out.next_step} onChange={e => setOut({ ...out, next_step: e.target.value })} placeholder="ör. Teklif gönder" /></div>
              <Input label="Tarih" type="date" value={out.next_step_date} onChange={e => setOut({ ...out, next_step_date: e.target.value })} />
            </div>
            <p className="text-xs text-slate-500">Rapor müşterinin CRM aktivitelerine işlenir; sonraki adım tarihli ise görev açılır.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
