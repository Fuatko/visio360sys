'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { Card, Button, Badge, Input, Select } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { formatMoney } from '@/lib/utils';
import { normalizeName } from '@/lib/crm';
import { balances, daysSince } from '@/lib/parasut-recon';
import { Plug, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink, KeyRound, Link2, Unplug, ShieldCheck, Loader2 } from 'lucide-react';

const tl = (v: any) => `${Number(v) < 0 ? '-' : ''}₺${formatMoney(Math.abs(Math.round(Number(v) || 0)))}`;
const KIND: Record<string, string> = { sales_invoice: 'Satış faturası', purchase_bill: 'Alış faturası', salary: 'Maaş', tax: 'Vergi / SGK', bank_fee: 'Banka masrafı' };
const PAY: Record<string, { l: string; v: any }> = { paid: { l: 'Ödendi', v: 'success' }, unpaid: { l: 'Ödenmedi', v: 'warning' }, partially_paid: { l: 'Kısmi', v: 'info' }, overdue: { l: 'Gecikmiş', v: 'danger' } };

export default function IntegrationsPage() {
  const supabase = createClient();
  const [st, setSt] = useState<any>(undefined);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mode, setMode] = useState<'code' | 'password'>('code');
  const [code, setCode] = useState('');
  const [cred, setCred] = useState({ username: '', password: '' });
  const [companies, setCompanies] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tab, setTab] = useState<'sales' | 'costs' | 'unmatched' | 'balances'>('sales');

  const call = async (path: string, method = 'POST', body?: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    let orgId = ''; try { orgId = localStorage.getItem('selectedOrgId') || ''; } catch { /* yok */ }
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, ...(orgId ? { 'x-org-id': orgId } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Hata ${r.status}`);
    return j;
  };
  const [orgName, setOrgName] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await call('/api/parasut/status', 'GET');
      setReady(true); setLoadErr(null); setSt(r.status); setDocs(r.documents || []); setCustomers(r.customers || []); setOrgName(r.org_name);
      if (r.missing_env?.length) setLoadErr('Vercel\'de eksik ayar: ' + r.missing_env.join(', ') + ' — ekleyip Redeploy yapın.');
    } catch (e: any) {
      if (/parasut\.sql/.test(e.message)) setReady(false); else setLoadErr(e.message);
      setSt(st => st ?? { connected: false });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<any>, okText?: (r: any) => string) => {
    setBusy(key); setMsg(null);
    try { const r = await fn(); if (okText) setMsg({ ok: true, text: okText(r) }); await load(); return r; }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };
  const openAuthorize = () => run('auth', async () => { const r = await call('/api/parasut/connect', 'GET'); window.open(r.url, '_blank', 'noopener'); return r; });
  const connect = () => run('connect', async () => {
    const r = await call('/api/parasut/connect', 'POST', mode === 'code' ? { code } : cred);
    setCred({ username: '', password: '' }); setCode('');
    if (r.companies?.length > 1) setCompanies(r.companies);
    return r;
  }, r => r.companies?.length > 1 ? 'Bağlandı. Şimdi hangi Paraşüt firmasının eşitleneceğini seçin.' : 'Paraşüt bağlandı.');
  const loadCompanies = () => run('companies', async () => { const r = await call('/api/parasut/company', 'GET'); setCompanies(r.companies || []); return r; });
  const pickCompany = (id: string) => { const c = companies.find(x => x.id === id); run('pick', () => call('/api/parasut/company', 'POST', { company_id: id, company_name: c?.name }), () => 'Firma seçildi.'); };
  const test = () => run('test', () => call('/api/parasut/test'), r => `Bağlantı çalışıyor (${r.user}).${r.invoices_total !== undefined && r.invoices_total !== null ? ` Paraşüt'te ${r.invoices_total} satış faturası var.` : ''}${r.last_invoice ? ` Son fatura: ${r.last_invoice.issue_date}.` : ''}`);
  const sync = () => run('sync', () => call('/api/parasut/sync'), r => `Eşitlendi (${r.seconds} sn): ${Object.entries(r.counts || {}).map(([k, v]) => `${KIND[k]} ${v}`).join(', ')}${r.matched ? ` · ${r.matched} fatura müşteriyle eşleşti` : ''}${r.errors?.length ? ` · Uyarı: ${r.errors.join(' | ')}` : ''}`);
  const saveSettings = (patch: any) => run('settings', () => call('/api/parasut/settings', 'POST', patch), () => 'Ayar kaydedildi.');
  const disconnect = () => { if (!confirm('Paraşüt bağlantısı kaldırılsın mı? Eşitlenmiş faturalar raporlarda kalır.')) return; run('disc', () => call('/api/parasut/disconnect', 'POST', { purge: false }), () => 'Bağlantı kaldırıldı.'); };
  const matchMany = async (ids: string[], customerId: string) => {
    try { await call('/api/parasut/match', 'POST', { ids, customer_id: customerId || null }); setDocs(ds => ds.map(d => (ids.includes(d.id) ? { ...d, customer_id: customerId || null } : d))); }
    catch (e: any) { alert(e.message); }
  };

  const createCustomers = (list: any[]) => {
    if (!list.length) return;
    if (!confirm(list.length === 1 ? `"${list[0].name}" Paraşüt'teki cari bilgileriyle yeni müşteri kartı olarak eklensin mi?` : `${list.length} cari, Paraşüt'teki bilgileriyle (unvan, VKN, vergi dairesi, adres, iletişim) müşteri kartı olarak eklensin ve faturaları bağlansın mı?`)) return;
    run('create', () => call('/api/parasut/create-customers', 'POST', { groups: list.map(u => ({ contact_parasut_id: u.contact_parasut_id, name: u.name, tax: u.tax, ids: u.ids })) }),
      r => `${r.created} müşteri kartı oluşturuldu, ${r.linked} fatura bağlandı.${r.errors?.length ? ' Uyarı: ' + r.errors.join(' | ') : ''}`);
  };

  const sales = docs.filter(d => d.kind === 'sales_invoice');
  const costs = docs.filter(d => d.kind !== 'sales_invoice');
  const unmatched = sales.filter(d => !d.customer_id);
  const unmatchedContacts = useMemo(() => {
    const m = new Map<string, any>();
    unmatched.forEach(d => { const k = d.tax_number || normalizeName(d.contact_name); const x = m.get(k) || { key: k, name: d.contact_name, tax: d.tax_number, contact_parasut_id: d.contact_parasut_id, ids: [], total: 0 }; x.ids.push(d.id); x.total += Number(d.net_total_try) || 0; m.set(k, x); });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [docs]);
  const bal = useMemo(() => balances(docs), [docs]);
  const cname = (id?: string) => customers.find(c => c.id === id)?.name;
  const ytd = (k: string) => docs.filter(d => d.kind === k && String(d.issue_date).startsWith(String(new Date().getFullYear()))).reduce((a, d) => a + (Number(d.net_total_try) || 0), 0);

  if (st === undefined) return <div><Header title="Entegrasyonlar" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;

  return (
    <div>
      <Header title="Entegrasyonlar" subtitle="Muhasebe ve diğer sistemlerle bağlantılar" />
      <div className="space-y-4 p-6">
        {loadErr && <Card className="flex items-center gap-2 border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="h-4 w-4" />{loadErr}</Card>}
        {!ready && <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /><b>parasut.sql</b> dosyasını Supabase'de çalıştırın.</Card>}
        {msg && <Card className={`flex items-start gap-2 p-3 text-sm ${msg.ok ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-800'}`}>{msg.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}<span className="break-words">{msg.text}</span></Card>}

        <Card className="p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-lg font-bold text-orange-600">P</div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-lg font-semibold">Paraşüt {st?.connected ? <Badge variant="success">Bağlı</Badge> : <Badge variant="default">Bağlı değil</Badge>}</p>
              <p className="text-sm text-slate-600">Satış ve alış faturaları, maaş, vergi ve banka masrafları her gece otomatik eşitlenir. Satış faturaları vergi numarasıyla müşteri kartlarına bağlanır; Kârlılık ekranında fatura bazlı kâr/zarar görünür.</p>
              {orgName && <p className="mt-1 text-xs text-slate-500">Bu bağlantı <b>{orgName}</b> kurumu içindir.</p>}
              {st?.connected && <p className="mt-1 text-xs text-slate-500">Firma: <b>{st.company_name || st.company_id || 'seçilmedi'}</b> · Bağlantı: {new Date(st.connected_at).toLocaleDateString('tr-TR')}{st.last_sync_at ? ` · Son eşitleme: ${new Date(st.last_sync_at).toLocaleString('tr-TR')}` : ''}</p>}
            </div>
            {st?.connected && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={!!busy} onClick={test}>{busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}Bağlantıyı test et</Button>
                <Button disabled={!!busy || !st.company_id} onClick={sync}>{busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{busy === 'sync' ? 'Eşitleniyor…' : 'Şimdi eşitle'}</Button>
                <Button variant="ghost" disabled={!!busy} onClick={disconnect}><Unplug className="h-4 w-4" />Kaldır</Button>
              </div>
            )}
          </div>

          {!st?.connected && (
            <div className="mt-4 rounded-xl border bg-slate-50 p-4">
              <div className="mb-3 flex rounded-lg border bg-white p-0.5 text-sm w-fit">
                <button onClick={() => setMode('code')} className={`rounded-md px-3 py-1 ${mode === 'code' ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>Paraşüt yetki kodu ile</button>
                <button onClick={() => setMode('password')} className={`rounded-md px-3 py-1 ${mode === 'password' ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>Paraşüt giriş bilgileriyle</button>
              </div>
              {mode === 'code' ? (
                <div className="space-y-3 text-sm">
                  <p><b>1.</b> Paraşüt'te bu uygulamaya izin verin: <Button size="sm" variant="secondary" disabled={!!busy} onClick={openAuthorize}><ExternalLink className="h-3 w-3" />Paraşüt'te izin ver</Button></p>
                  <p><b>2.</b> Paraşüt'ün gösterdiği yetki kodunu kopyalayıp buraya yapıştırın:</p>
                  <div className="flex max-w-xl gap-2"><input value={code} onChange={e => setCode(e.target.value)} placeholder="Yetki kodu" className="h-9 flex-1 rounded-lg border px-3 font-mono text-sm" />
                    <Button disabled={!code.trim() || !!busy} onClick={connect}><Link2 className="h-4 w-4" />Bağla</Button></div>
                </div>
              ) : (
                <div className="max-w-xl space-y-3 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="Paraşüt e-posta" value={cred.username} autoComplete="off" onChange={e => setCred({ ...cred, username: e.target.value })} />
                    <Input label="Paraşüt şifre" type="password" value={cred.password} autoComplete="new-password" onChange={e => setCred({ ...cred, password: e.target.value })} />
                  </div>
                  <p className="flex items-start gap-1 text-xs text-slate-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />Şifreniz yalnızca bir kez Paraşüt'ten erişim anahtarı almak için kullanılır, hiçbir yerde saklanmaz. Mümkünse Paraşüt'te bu iş için ayrı bir kullanıcı açın.</p>
                  <Button disabled={!cred.username || !cred.password || !!busy} onClick={connect}><KeyRound className="h-4 w-4" />Bağla</Button>
                </div>
              )}
              <p className="mt-3 text-xs text-slate-500">Bağlantıyı yalnızca şirket yöneticisi kurabilir. Erişim anahtarları hiçbir kullanıcının göremediği, şifreli bağlantıyla korunan bir alanda tutulur.</p>
            </div>
          )}

          {st?.connected && (!st.company_id || companies.length > 0) && (
            <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              {companies.length === 0 ? <Button size="sm" onClick={loadCompanies}>Paraşüt firmalarını getir</Button> : (
                <div className="min-w-[260px]"><Select label="Eşitlenecek Paraşüt firması" value={st.company_id || ''} onChange={e => pickCompany(e.target.value)}
                  options={[{ value: '', label: 'Seçin' }, ...companies.map(c => ({ value: c.id, label: c.name }))]} /></div>
              )}
            </div>
          )}

          {st?.connected && (
            <div className="mt-4 flex flex-wrap items-end gap-4 border-t pt-4 text-sm">
              <div><Input label="Şu tarihten itibaren eşitle" type="date" defaultValue={st.sync_from} onBlur={e => e.target.value && e.target.value !== st.sync_from && saveSettings({ sync_from: e.target.value })} /></div>
              <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={!!st.auto_sync} onChange={e => saveSettings({ auto_sync: e.target.checked })} />Her gece otomatik eşitle</label>
              {st.last_sync?.errors?.length > 0 && <p className="pb-2 text-xs text-amber-700">Son eşitlemede uyarı: {st.last_sync.errors.join(' | ')}</p>}
            </div>
          )}
        </Card>

        {docs.length > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Card className="p-4"><p className="text-xs text-slate-500">Bu yıl satış (KDV hariç)</p><p className="text-xl font-bold text-green-700">{tl(ytd('sales_invoice'))}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Bu yıl alış faturaları</p><p className="text-xl font-bold">{tl(ytd('purchase_bill'))}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Bu yıl maaş + vergi + banka</p><p className="text-xl font-bold">{tl(ytd('salary') + ytd('tax') + ytd('bank_fee'))}</p></Card>
              <Card className={`p-4 ${unmatched.length ? 'border-amber-300' : ''}`}><p className="text-xs text-slate-500">Müşteriyle eşleşmeyen fatura</p><p className={`text-xl font-bold ${unmatched.length ? 'text-amber-600' : ''}`}>{unmatched.length}</p></Card>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border bg-white p-0.5 text-sm">
                {([['sales', `Satış faturaları (${sales.length})`], ['costs', `Alış ve giderler (${costs.length})`], ['balances', `Cari bakiyeler (${bal.length})`], ['unmatched', `Eşleştir (${unmatchedContacts.length})`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1 ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>{l}</button>))}
              </div>
              <Link href="/reconciliation" className="ml-auto text-sm text-indigo-600">Sipariş–fatura mutabakatı →</Link>
              <Link href="/profitability?tab=parasut" className="text-sm text-indigo-600">Fatura bazlı kâr/zarar →</Link>
            </div>
            <Card className="overflow-x-auto p-0">
              {tab === 'balances' ? (
                bal.length === 0 ? <p className="p-4 text-sm text-slate-500">Açık bakiye yok: tüm satış ve alış faturaları kapanmış.</p> : (<>
                  <div className="grid grid-cols-2 gap-3 border-b p-3 text-sm md:grid-cols-4">
                    <div><p className="text-xs text-slate-500">Toplam alacağımız</p><p className="font-bold text-emerald-700">{tl(bal.reduce((a, b) => a + b.receivable, 0))}</p></div>
                    <div><p className="text-xs text-slate-500">Vadesi geçmiş alacak</p><p className="font-bold text-red-600">{tl(bal.reduce((a, b) => a + b.receivableOverdue, 0))}</p></div>
                    <div><p className="text-xs text-slate-500">Toplam borcumuz</p><p className="font-bold text-amber-700">{tl(bal.reduce((a, b) => a + b.payable, 0))}</p></div>
                    <div><p className="text-xs text-slate-500">Vadesi geçmiş borç</p><p className="font-bold text-red-600">{tl(bal.reduce((a, b) => a + b.payableOverdue, 0))}</p></div>
                  </div>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Cari</th><th className="text-right">Alacağımız</th><th className="text-right">Vadesi geçmiş</th><th className="text-right">Borcumuz</th><th className="text-right">Vadesi geçmiş</th><th className="text-right">Net</th><th className="pl-4 pr-3">En eski gecikme</th></tr></thead>
                    <tbody>{bal.map(b => (
                      <tr key={b.key} className="border-b">
                        <td className="px-3 py-1.5">{b.customer_id ? <Link href={`/customers/${b.customer_id}`} className="text-indigo-700 hover:underline">{cname(b.customer_id) || b.name}</Link> : b.name}{b.tax && <span className="block font-mono text-[10px] text-slate-400">VKN {b.tax}</span>}</td>
                        <td className="text-right text-emerald-700">{b.receivable ? tl(b.receivable) : '-'}</td>
                        <td className="text-right text-xs text-red-600">{b.receivableOverdue ? tl(b.receivableOverdue) : '-'}</td>
                        <td className="text-right text-amber-700">{b.payable ? tl(b.payable) : '-'}</td>
                        <td className="text-right text-xs text-red-600">{b.payableOverdue ? tl(b.payableOverdue) : '-'}</td>
                        <td className={`text-right font-semibold ${b.net >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{tl(b.net)}<span className="block text-[10px] font-normal text-slate-400">{b.net >= 0 ? 'bize borçlu' : 'biz borçluyuz'}</span></td>
                        <td className="pl-4 pr-3 text-xs">{b.oldestOverdue ? <span className="text-red-600">{daysSince(b.oldestOverdue)} gün</span> : '-'}</td></tr>))}</tbody>
                  </table>
                  <p className="p-3 text-[11px] text-slate-500">Açık (ödenmemiş veya kısmi ödenmiş) satış ve alış faturalarının kalan tutarından hesaplanır; {st.sync_from ? new Date(st.sync_from).toLocaleDateString('tr-TR') : 'eşitleme başlangıcı'} öncesi faturalar dahil değildir. Daha eski açık faturalar için yukarıdaki tarihi geriye alıp yeniden eşitleyin.</p>
                </>)
              ) : tab === 'unmatched' ? (
                unmatchedContacts.length === 0 ? <p className="p-4 text-sm text-slate-500">Tüm satış faturaları müşterilerle eşleşmiş. 👍</p> : (
                  <><div className="flex flex-wrap items-center gap-3 border-b bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span>Bu cariler sistemde müşteri olarak kayıtlı değil. Var olan bir müşteriye bağlayın ya da Paraşüt bilgileriyle yeni kart açın.</span>
                    <Button size="sm" className="ml-auto" disabled={busy === 'create'} onClick={() => createCustomers(unmatchedContacts)}>{busy === 'create' ? 'Ekleniyor…' : `Tümünü müşteri olarak ekle (${unmatchedContacts.length})`}</Button></div>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Paraşüt'teki cari</th><th>VKN</th><th className="text-right">Fatura</th><th className="text-right">Tutar</th><th className="pl-4">Müşteri kartı</th><th></th></tr></thead>
                    <tbody>{unmatchedContacts.map(u => (
                      <tr key={u.key} className="border-b"><td className="px-3 py-2 font-medium">{u.name || '-'}</td><td className="font-mono text-xs">{u.tax || '-'}</td><td className="text-right">{u.ids.length}</td><td className="text-right">{tl(u.total)}</td>
                        <td className="pl-4"><select className="h-8 w-64 rounded border px-2 text-xs" defaultValue="" onChange={e => matchMany(u.ids, e.target.value)}>
                          <option value="">Var olan müşteriye bağla…</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                        <td className="px-3"><button className="whitespace-nowrap text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50" disabled={busy === 'create'} onClick={() => createCustomers([u])}>+ Yeni müşteri olarak ekle</button></td></tr>))}</tbody>
                  </table></>)
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Tarih</th><th>Tür</th><th>No</th><th>{tab === 'sales' ? 'Müşteri' : 'Tedarikçi / açıklama'}</th>{tab === 'costs' && <th>Kategori</th>}<th className="text-right">Net (₺)</th><th className="text-right">Kalan</th><th className="pl-4">Ödeme</th></tr></thead>
                  <tbody>{(tab === 'sales' ? sales : costs).slice(0, 300).map(d => (
                    <tr key={d.id} className="border-b">
                      <td className="px-3 py-1.5 text-xs">{d.issue_date ? new Date(d.issue_date).toLocaleDateString('tr-TR') : '-'}</td>
                      <td className="text-xs">{KIND[d.kind]}{Number(d.net_total) < 0 ? ' (iade)' : ''}</td><td className="font-mono text-xs">{d.doc_no || '-'}</td>
                      <td>{tab === 'sales' ? (d.customer_id ? <Link href={`/customers/${d.customer_id}`} className="text-indigo-700 hover:underline">{cname(d.customer_id) || d.contact_name}</Link> : <span>{d.contact_name} <span className="text-[10px] text-amber-600">eşleşmedi</span></span>) : (d.contact_name || d.description || '-')}</td>
                      {tab === 'costs' && <td className="text-xs text-slate-500">{d.category || '-'}</td>}
                      <td className="text-right">{tl(d.net_total_try)}{d.currency && d.currency !== 'TRY' ? <span className="block text-[10px] text-slate-400">{d.currency}</span> : null}</td>
                      <td className="text-right text-xs">{Number(d.remaining) ? tl(d.remaining) : '-'}</td>
                      <td className="pl-4">{d.payment_status && PAY[d.payment_status] ? <Badge variant={PAY[d.payment_status].v}>{PAY[d.payment_status].l}</Badge> : '-'}</td>
                    </tr>))}</tbody>
                </table>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
