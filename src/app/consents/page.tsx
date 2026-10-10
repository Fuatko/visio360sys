'use client';

import Header from '@/components/Header';
import { Card, Button, Badge, Modal, Input, Select, Textarea } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Plus, Download, Search, Copy, CheckCircle2, XCircle, ShieldCheck, Info } from 'lucide-react';

type Tab = 'consents' | 'requests' | 'form';
const CHANNELS: Record<string, string> = { EPOSTA: 'E-posta', MESAJ: 'SMS / mesaj', ARAMA: 'Telefonla arama' };
const SOURCES: Record<string, string> = {
  HS_WEB: 'Web sitesi / online form', HS_FIZIKSEL_ORTAM: 'Fiziksel ortam (mağaza, fuar)', HS_ISLAK_IMZA: 'Islak imzalı form',
  HS_CAGRI_MERKEZI: 'Çağrı merkezi / telefon', HS_EPOSTA: 'E-posta ile', HS_MESAJ: 'SMS ile', HS_SOSYAL_MEDYA: 'Sosyal medya', HS_ETKINLIK: 'Etkinlik', HS_EORTAM: 'Diğer elektronik ortam',
};
const REQ_TYPES: Record<string, string> = { bilgi: 'Bilgi talebi', erisim: 'Verilere erişim', duzeltme: 'Düzeltme', silme: 'Silme / yok etme', itiraz: 'İtiraz', diger: 'Diğer' };
const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s/g, '');

export default function ConsentsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('consents');
  const [missing, setMissing] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);
  const [settings, setSettings] = useState<any | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);
  const [reqForm, setReqForm] = useState<any | null>(null);
  const [q, setQ] = useState('');
  const [fCh, setFCh] = useState('');
  const [fSt, setFSt] = useState('');
  const [check, setCheck] = useState('');

  const load = useCallback(async () => {
    const [c, r, s, cu] = await Promise.all([
      supabase.from('contact_consents').select('*').order('consent_date', { ascending: false }),
      supabase.from('kvkk_requests').select('*').order('received_at', { ascending: false }),
      supabase.from('consent_settings').select('*').maybeSingle(),
      supabase.from('customers').select('id, name').order('name'),
    ]);
    setMissing(!!c.error);
    setRows(c.data || []); setReqs(r.data || []); setSettings(s.data || null); setCustomers(cu.data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.recipient.trim()) { alert('E-posta veya telefon girin.'); return; }
    const { id, created_at, organization_id, stop_deadline, ...rest } = form;
    const payload: any = {}; Object.entries(rest).forEach(([k, v]) => { payload[k] = v === '' ? null : v; });
    if (payload.channel !== 'EPOSTA') payload.recipient = String(payload.recipient).replace(/[^0-9+]/g, '');
    const { error } = id ? await supabase.from('contact_consents').update(payload).eq('id', id) : await supabase.from('contact_consents').insert([payload]);
    if (error) { alert(error.message.includes('duplicate') ? 'Bu kişi için bu kanalda kayıt zaten var; listeden açıp güncelleyin.' : error.message); return; }
    setForm(null); load();
  };
  const saveReq = async () => {
    if (!reqForm.requester_name) return;
    const { id, created_at, organization_id, ...rest } = reqForm;
    const payload: any = {}; Object.entries(rest).forEach(([k, v]) => { payload[k] = v === '' ? null : v; });
    const { error } = id ? await supabase.from('kvkk_requests').update(payload).eq('id', id) : await supabase.from('kvkk_requests').insert([payload]);
    if (error) { alert(error.message); return; }
    setReqForm(null); load();
  };
  const saveSettings = async () => {
    const payload = { brand_name: settings?.brand_name || null, kvkk_text: settings?.kvkk_text || null, consent_text: settings?.consent_text || null, is_active: settings?.is_active !== false, updated_at: new Date().toISOString() };
    const { data, error } = settings?.id ? await supabase.from('consent_settings').update(payload).eq('id', settings.id).select().single()
      : await supabase.from('consent_settings').insert([payload]).select().single();
    if (error) { alert(error.message); return; }
    setSettings(data); alert('Kaydedildi.');
  };

  // İYS toplu yükleme için CSV (aktarılmamış onay/ret kayıtları)
  const exportIys = async () => {
    const pending = rows.filter(r => !r.iys_synced_at);
    if (!pending.length) { alert('İYS\'ye aktarılmamış kayıt yok.'); return; }
    const head = ['type', 'source', 'recipient', 'status', 'consentDate', 'recipientType'];
    const lines = pending.map(r => [r.channel, r.source, r.recipient, r.status, new Date(r.status === 'RET' && r.rejected_at ? r.rejected_at : r.consent_date).toISOString().slice(0, 19).replace('T', ' '), r.recipient_type]);
    const csv = [head, ...lines].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `iys-izinler-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    if (confirm(`${pending.length} kayıt indirildi. İYS'ye yüklediyseniz "aktarıldı" olarak işaretlensin mi?`)) {
      await supabase.from('contact_consents').update({ iys_synced_at: new Date().toISOString() }).in('id', pending.map(p => p.id));
      load();
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const checkHits = check.trim() ? rows.filter(r => norm(r.recipient).includes(norm(check).replace(/[^0-9a-z@.+]/g, '')) || (r.contact_name || '').toLowerCase().includes(check.toLowerCase())) : [];
  const list = rows.filter(r => (!fCh || r.channel === fCh) && (!fSt || r.status === fSt) && (!q || `${r.recipient} ${r.contact_name || ''} ${r.company_name || ''}`.toLowerCase().includes(q.toLowerCase())));
  const pendingStop = rows.filter(r => r.status === 'RET' && r.stop_deadline && r.stop_deadline >= today);
  const notSynced = rows.filter(r => !r.iys_synced_at).length;
  const openReqs = reqs.filter(r => r.status === 'open');
  const formUrl = settings?.public_token && typeof window !== 'undefined' ? `${window.location.origin}/izin/${settings.public_token}` : '';

  return (
    <div>
      <Header title="İletişim İzinleri (KVKK / İYS)" subtitle="Ticari ileti onayları, retler, aydınlatma kayıtları ve KVKK başvuruları" />
      <div className="space-y-4 p-6">
        {missing && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /><b>izin-ve-ziyaret.sql</b> dosyasını Supabase'de çalıştırın.</Card>}
        <div className="grid gap-3 md:grid-cols-4">
          <Card className="p-4"><p className="text-2xl font-bold text-green-700">{rows.filter(r => r.status === 'ONAY').length}</p><p className="text-xs text-slate-500">Onaylı izin</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-red-600">{rows.filter(r => r.status === 'RET').length}</p><p className="text-xs text-slate-500">Ret{pendingStop.length ? <span className="text-red-600"> · {pendingStop.length} durdurma süresi devam ediyor</span> : ''}</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-amber-600">{notSynced}</p><p className="text-xs text-slate-500">İYS'ye aktarılmamış</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold">{openReqs.length}</p><p className="text-xs text-slate-500">Açık KVKK başvurusu{openReqs.some(r => r.due_date < today) ? <span className="text-red-600"> · süresi geçen var</span> : ''}</p></Card>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border bg-white p-1">
          {([['consents', 'İzinler'], ['requests', 'KVKK başvuruları'], ['form', 'Online izin formu']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-1.5 text-sm ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>
          ))}
        </div>

        {tab === 'consents' && (
          <>
            <Card className="p-4">
              <p className="mb-2 flex items-center gap-1 text-sm font-semibold"><Search className="h-4 w-4" />Bu kişiye ileti gönderebilir miyim?</p>
              <input value={check} onChange={e => setCheck(e.target.value)} placeholder="E-posta, telefon veya ad yazın" className="h-9 w-full max-w-md rounded-lg border px-3 text-sm" />
              {check.trim() && (
                <div className="mt-2 space-y-1 text-sm">
                  {checkHits.length === 0 ? <p className="text-amber-700">Kayıt yok: bireysel alıcıya önceden onay olmadan ticari ileti gönderilemez. Alıcı tacir/esnafsa onay aranmaz ancak ret hakkı vardır.</p>
                    : checkHits.map(r => (
                      <p key={r.id} className="flex items-center gap-1">{r.status === 'ONAY' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-500" />}
                        <b>{CHANNELS[r.channel]}</b> · {r.recipient} · {r.status === 'ONAY' ? 'gönderilebilir' : `GÖNDERİLEMEZ (ret ${formatDate(r.rejected_at)})`}{r.recipient_type === 'TACIR' ? ' · tacir' : ''}</p>
                    ))}
                </div>
              )}
            </Card>
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ara" className="mr-auto h-8 rounded-lg border px-2 text-sm" />
                <select value={fCh} onChange={e => setFCh(e.target.value)} className="h-8 rounded-lg border px-2 text-sm"><option value="">Tüm kanallar</option>{Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <select value={fSt} onChange={e => setFSt(e.target.value)} className="h-8 rounded-lg border px-2 text-sm"><option value="">Onay + ret</option><option value="ONAY">Onay</option><option value="RET">Ret</option></select>
                <Button size="sm" variant="secondary" onClick={exportIys}><Download className="h-3 w-3" />İYS için dışa aktar</Button>
                <Button size="sm" onClick={() => setForm({ customer_id: '', contact_name: '', company_name: '', recipient: '', channel: 'EPOSTA', recipient_type: 'BIREYSEL', status: 'ONAY', source: 'HS_FIZIKSEL_ORTAM', consent_text: settings?.consent_text || '', kvkk_informed: true, notes: '' })}><Plus className="h-3 w-3" />İzin kaydet</Button>
              </div>
              {list.length === 0 ? <p className="text-sm text-slate-500">Kayıt yok.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Alıcı</th><th>Kanal</th><th>Durum</th><th>Kaynak / tarih</th><th>KVKK</th><th>İYS</th></tr></thead>
                  <tbody>{list.map(r => (
                    <tr key={r.id} className="cursor-pointer border-b hover:bg-slate-50" onClick={() => setForm({ ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? ''])) })}>
                      <td className="py-2"><p className="font-medium">{r.recipient}</p><p className="text-xs text-slate-400">{[r.contact_name, r.company_name, r.recipient_type === 'TACIR' ? 'tacir' : ''].filter(Boolean).join(' · ')}</p></td>
                      <td className="text-xs">{CHANNELS[r.channel]}</td>
                      <td>{r.status === 'ONAY' ? <Badge variant="success">Onay</Badge> : <Badge variant="danger">Ret</Badge>}
                        {r.status === 'RET' && r.stop_deadline && r.stop_deadline >= today && <p className="text-[10px] text-red-600">Gönderimi {formatDate(r.stop_deadline)}'e kadar durdurun</p>}</td>
                      <td className="text-xs">{SOURCES[r.source] || r.source}<p className="text-slate-400">{formatDate(r.consent_date)}</p></td>
                      <td>{r.kvkk_informed ? <ShieldCheck className="h-4 w-4 text-green-600" /> : <span className="text-xs text-amber-700">yok</span>}</td>
                      <td className="text-xs">{r.iys_synced_at ? formatDate(r.iys_synced_at) : <span className="text-amber-700">bekliyor</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              <p className="mt-2 flex gap-1 text-[11px] text-slate-400"><Info className="h-3 w-3 shrink-0" />İYS'ye aktarılmayan onay geçersiz sayılır; ret bildirimi gelince gönderim 3 iş günü içinde durdurulmalıdır. Dışa aktarılan dosyanın sütunlarını İYS panelindeki toplu yükleme şablonuyla karşılaştırın.</p>
            </Card>
          </>
        )}

        {tab === 'requests' && (
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">KVKK ilgili kişi başvuruları (yasal yanıt süresi 30 gün)</h3>
              <Button size="sm" onClick={() => setReqForm({ requester_name: '', requester_contact: '', request_type: 'bilgi', received_at: today, status: 'open', response: '' })}><Plus className="h-3 w-3" />Başvuru kaydet</Button>
            </div>
            {reqs.length === 0 ? <p className="text-sm text-slate-500">Başvuru yok.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Başvuran</th><th>Tür</th><th>Alındı</th><th>Son gün</th><th>Durum</th></tr></thead>
                <tbody>{reqs.map(r => (
                  <tr key={r.id} className="cursor-pointer border-b hover:bg-slate-50" onClick={() => setReqForm({ ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? ''])) })}>
                    <td className="py-2">{r.requester_name}<p className="text-xs text-slate-400">{r.requester_contact}</p></td><td className="text-xs">{REQ_TYPES[r.request_type] || r.request_type}</td>
                    <td className="text-xs">{formatDate(r.received_at)}</td>
                    <td className={`text-xs ${r.status === 'open' && r.due_date < today ? 'font-semibold text-red-600' : ''}`}>{formatDate(r.due_date)}</td>
                    <td>{r.status === 'open' ? <Badge variant="warning">Açık</Badge> : r.status === 'answered' ? <Badge variant="success">Yanıtlandı</Badge> : <Badge>Reddedildi</Badge>}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Card>
        )}

        {tab === 'form' && (
          <Card className="space-y-3 p-4">
            <p className="text-sm text-slate-600">Web sitenize, e-posta imzanıza veya fuar standına (QR kod) koyabileceğiniz izin formu. Doldurulan izinler kanal, tarih, IP ve aydınlatma onayıyla birlikte buraya otomatik düşer.</p>
            {formUrl && (
              <div className="flex gap-2">
                <input readOnly value={formUrl} className="flex-1 rounded-lg border bg-slate-50 px-2 py-2 text-xs" />
                <Button size="sm" onClick={() => { navigator.clipboard?.writeText(formUrl); alert('Kopyalandı'); }}><Copy className="h-3 w-3" />Kopyala</Button>
                <a href={formUrl} target="_blank" rel="noopener" className="rounded-lg border px-3 py-2 text-xs">Aç</a>
              </div>
            )}
            <Input label="Formda görünecek firma adı" value={settings?.brand_name || ''} onChange={e => setSettings({ ...(settings || {}), brand_name: e.target.value })} />
            <Textarea label="KVKK aydınlatma metni" rows={6} value={settings?.kvkk_text || ''} onChange={e => setSettings({ ...(settings || {}), kvkk_text: e.target.value })} placeholder="Veri sorumlusu, işleme amaçları, aktarım, toplama yöntemi ve hukuki sebep, ilgili kişinin hakları…" />
            <Textarea label="Ticari elektronik ileti onay metni" rows={3} value={settings?.consent_text || ''} onChange={e => setSettings({ ...(settings || {}), consent_text: e.target.value })} placeholder="… tarafından kampanya, duyuru ve bilgilendirme amaçlı ticari elektronik ileti gönderilmesine onay veriyorum." />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings?.is_active !== false} onChange={e => setSettings({ ...(settings || {}), is_active: e.target.checked })} />Form yayında</label>
            <Button onClick={saveSettings}>Kaydet{!settings?.id ? ' ve bağlantı oluştur' : ''}</Button>
            <p className="text-[11px] text-slate-400">Metinleri hukuk danışmanınızla birlikte hazırlamanızı öneririz.</p>
          </Card>
        )}
      </div>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title="İletişim izni" size="lg"
        footer={<>{form?.id && <Button variant="ghost" onClick={async () => { if (confirm('Kayıt silinsin mi? (Ret kayıtlarını silmeyin; ispat için saklayın.)')) { await supabase.from('contact_consents').delete().eq('id', form.id); setForm(null); load(); } }}>Sil</Button>}
          <Button variant="secondary" onClick={() => setForm(null)}>İptal</Button><Button onClick={save}>Kaydet</Button></>}>
        {form && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="Kanal" value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} options={Object.entries(CHANNELS).map(([value, label]) => ({ value, label }))} />
              <div className="sm:col-span-2"><Input label={form.channel === 'EPOSTA' ? 'E-posta' : 'Telefon (+90…)'} value={form.recipient} onChange={e => setForm({ ...form, recipient: e.target.value })} /></div>
              <Input label="Kişi" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
              <Input label="Firma" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
              <Select label="Müşteri kaydı" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} options={[{ value: '', label: '-' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
              <Select label="Alıcı tipi" value={form.recipient_type} onChange={e => setForm({ ...form, recipient_type: e.target.value })} options={[{ value: 'BIREYSEL', label: 'Bireysel' }, { value: 'TACIR', label: 'Tacir / esnaf' }]} />
              <Select label="Durum" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={[{ value: 'ONAY', label: 'Onay' }, { value: 'RET', label: 'Ret (iptal / itiraz)' }]} />
              <Select label="İzin kaynağı" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} options={Object.entries(SOURCES).map(([value, label]) => ({ value, label }))} />
            </div>
            <Textarea label="Onay metni (ispat için)" value={form.consent_text} onChange={e => setForm({ ...form, consent_text: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.kvkk_informed} onChange={e => setForm({ ...form, kvkk_informed: e.target.checked })} />KVKK aydınlatma metni sunuldu</label>
            <Input label="Not" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        )}
      </Modal>
      <Modal isOpen={!!reqForm} onClose={() => setReqForm(null)} title="KVKK başvurusu"
        footer={<><Button variant="secondary" onClick={() => setReqForm(null)}>İptal</Button><Button onClick={saveReq}>Kaydet</Button></>}>
        {reqForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Başvuran" value={reqForm.requester_name} onChange={e => setReqForm({ ...reqForm, requester_name: e.target.value })} />
              <Input label="İletişim" value={reqForm.requester_contact} onChange={e => setReqForm({ ...reqForm, requester_contact: e.target.value })} />
              <Select label="Tür" value={reqForm.request_type} onChange={e => setReqForm({ ...reqForm, request_type: e.target.value })} options={Object.entries(REQ_TYPES).map(([value, label]) => ({ value, label }))} />
              <Input label="Alınma tarihi" type="date" value={reqForm.received_at} onChange={e => setReqForm({ ...reqForm, received_at: e.target.value })} />
              <Select label="Durum" value={reqForm.status} onChange={e => setReqForm({ ...reqForm, status: e.target.value })} options={[{ value: 'open', label: 'Açık' }, { value: 'answered', label: 'Yanıtlandı' }, { value: 'rejected', label: 'Reddedildi' }]} />
            </div>
            <Textarea label="Verilen yanıt" value={reqForm.response} onChange={e => setReqForm({ ...reqForm, response: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
