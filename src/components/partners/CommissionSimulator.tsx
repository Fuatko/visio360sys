'use client';

import { Card, Button, Input, Select } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { Calculator, Printer, Info } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { PAYMENT_CHANNELS, ATTRIBUTION_MODES, calcCommission, pickPartnerSettings } from '@/lib/partners';
import { printHtml, escapeHtml } from '@/lib/print';

interface Props {
  partners: any[];
  opportunities: any[];
  invoices: any[];
  customers: any[];
  companyName: string;
}

const n = (v: any) => Number(v) || 0;
const tl = (v: number) => `₺${formatMoney(v)}`;

export default function CommissionSimulator({ partners, opportunities, invoices, customers, companyName }: Props) {
  const [partnerId, setPartnerId] = useState(partners[0]?.id || '');
  const [source, setSource] = useState<'manual' | 'opportunity' | 'invoice'>('manual');
  const [amount, setAmount] = useState<number>(100000);
  const [vatMode, setVatMode] = useState<'excl' | 'incl'>('excl');
  const [vatRate, setVatRate] = useState<number>(20);
  const [oppId, setOppId] = useState('');
  const [invId, setInvId] = useState('');
  const [collectPct, setCollectPct] = useState<number>(100);
  const [rateOverride, setRateOverride] = useState<string>('');
  const [channel, setChannel] = useState('');

  const partner = partners.find(p => p.id === partnerId);
  const settings = partner ? pickPartnerSettings(partner) : null;
  useEffect(() => { setChannel(settings?.payment_channel || 'company_invoice'); setRateOverride(''); setOppId(''); setInvId(''); }, [partnerId]);

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '-';
  const customerRate = (customerId: string) => customers.find(c => c.id === customerId)?.referral_commission_rate;

  const partnerOpps = opportunities.filter(o => o.referral_partner_id === partnerId || customers.find(c => c.id === o.customer_id)?.referral_partner_id === partnerId);
  const partnerInvs = invoices.filter(i => i.referral_partner_id === partnerId && !['draft', 'cancelled'].includes(i.status));

  // Kaynağa göre KDV hariç tutar ve önerilen oran
  const { netBase, suggestedRate, sourceLabel } = useMemo(() => {
    const def = n(settings?.default_commission_rate);
    if (source === 'opportunity') {
      const o = opportunities.find(x => x.id === oppId);
      if (!o) return { netBase: 0, suggestedRate: def, sourceLabel: '' };
      const r = o.referral_commission_rate ?? customerRate(o.customer_id) ?? def;
      return { netBase: n(o.value), suggestedRate: n(r), sourceLabel: `Fırsat: ${o.title} (${customerName(o.customer_id)})` };
    }
    if (source === 'invoice') {
      const i = invoices.find(x => x.id === invId);
      if (!i) return { netBase: 0, suggestedRate: def, sourceLabel: '' };
      const net = n(i.subtotal) - n(i.discount_amount);
      const remainingShare = n(i.total) > 0 ? (n(i.total) - n(i.paid_amount)) / n(i.total) : 1;
      return {
        netBase: net * remainingShare,
        suggestedRate: n(i.referral_commission_rate ?? def),
        sourceLabel: `Fatura: ${i.invoice_number} (${customerName(i.customer_id)}) — kalan tahsilat üzerinden`,
      };
    }
    const net = vatMode === 'incl' ? n(amount) / (1 + n(vatRate) / 100) : n(amount);
    return { netBase: net, suggestedRate: def, sourceLabel: `Elle girilen tutar (${vatMode === 'incl' ? 'KDV dahil' : 'KDV hariç'})` };
  }, [source, oppId, invId, amount, vatMode, vatRate, partnerId, opportunities, invoices, customers]);

  const rate = rateOverride === '' ? suggestedRate : n(rateOverride);
  const base = Math.round(netBase * n(collectPct) / 100 * 100) / 100;
  const gross = Math.round(base * rate / 100 * 100) / 100;
  const activeSettings = settings ? { ...settings, payment_channel: channel } : null;
  const result = activeSettings ? calcCommission(gross, activeSettings) : null;
  const comparison = settings ? Object.keys(PAYMENT_CHANNELS).map(ch => ({ ch, ...calcCommission(gross, { ...settings, payment_channel: ch }) })) : [];

  const ruleText = settings
    ? settings.attribution_mode === 'months'
      ? `Müşterinin ortağa bağlandığı tarihten itibaren ${settings.attribution_months} ay içindeki faturalar`
      : ATTRIBUTION_MODES[settings.attribution_mode]
    : '';

  const print = () => {
    if (!partner || !result) return;
    const ch = PAYMENT_CHANNELS[channel];
    const rows: [string, string][] = [
      ['Hesap dayanağı', sourceLabel],
      ['Tahsil edilecek tutar (KDV hariç)', tl(base) + (n(collectPct) !== 100 ? ` (%${collectPct} tahsilat varsayımı)` : '')],
      ['Komisyon oranı', `%${rate}`],
      ['Brüt komisyon', tl(gross)],
    ];
    if (result.withholding > 0) rows.push([channel === 'payroll' ? 'Çalışan kesintileri (SGK, işsizlik, GV, DV)' : `Gelir vergisi stopajı (%${settings!.withholding_rate})`, '-' + tl(result.withholding)]);
    if (result.stamp > 0) rows.push([`Damga vergisi (%${settings!.stamp_tax_rate})`, '-' + tl(result.stamp)]);
    rows.push(['ORTAĞA ÖDENECEK NET TUTAR', tl(result.net)]);
    printHtml(`Komisyon Ön Hesap - ${partner.name}`, `
      <h1>Komisyon Ön Hesap Bildirimi</h1>
      <div class="muted">${escapeHtml(companyName)} · ${new Date().toLocaleDateString('tr-TR')}</div>
      <div class="box">
        <div><span class="bold">İş Ortağı:</span> ${escapeHtml(partner.name)}${partner.partner_company_name ? ' — ' + escapeHtml(partner.partner_company_name) : ''}</div>
        <div><span class="bold">Ödeme şekli:</span> ${escapeHtml(ch?.label)}</div>
        <div><span class="bold">Komisyon kuralı:</span> ${escapeHtml(ruleText)}; komisyon, müşteriden tahsilat gerçekleştiğinde hak edilir.</div>
      </div>
      <table>${rows.map(([k, v], i) => `<tr class="${i === rows.length - 1 ? 'total' : ''}"><td>${escapeHtml(k)}</td><td class="num">${escapeHtml(v)}</td></tr>`).join('')}</table>
      <p class="note">Bu bildirim bilgi amaçlıdır ve tahsilatın belirtilen tutarda gerçekleşeceği varsayımıyla hazırlanmıştır.
      Gerçek komisyon, fiilen tahsil edilen tutarın KDV hariç kısmı üzerinden hesaplanır. Vergi kesintileri yürürlükteki mevzuata göre uygulanır.</p>
      <div class="sign"><div>Hazırlayan<br>${escapeHtml(companyName)}</div><div>İş Ortağı<br>Okudum, bilgilendim</div></div>
    `);
  };

  if (partners.length === 0) {
    return <Card className="p-6 text-sm text-slate-500">Simülasyon için önce bir iş ortağı tanımlayın.</Card>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Girdiler */}
      <Card className="space-y-4 p-5 lg:col-span-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Calculator className="h-4 w-4 text-indigo-600" />Simülasyon Girdileri</h3>
        <Select label="İş Ortağı" value={partnerId} onChange={e => setPartnerId(e.target.value)}
          options={partners.map(p => ({ value: p.id, label: `${p.name} (%${n(p.default_commission_rate)})` }))} />

        <div>
          <label className="text-xs font-medium text-slate-600">Hesap dayanağı</label>
          <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-xs">
            {([['manual', 'Tutar gir'], ['opportunity', 'Fırsat'], ['invoice', 'Fatura']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setSource(k)} className={`rounded-md py-1.5 ${source === k ? 'bg-white font-medium shadow-sm' : 'text-slate-500'}`}>{l}</button>
            ))}
          </div>
        </div>

        {source === 'manual' && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3"><Input label="Satış tutarı (₺)" type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} /></div>
            <Select label="Tutar" value={vatMode} onChange={e => setVatMode(e.target.value as any)}
              options={[{ value: 'excl', label: 'KDV hariç' }, { value: 'incl', label: 'KDV dahil' }]} />
            {vatMode === 'incl' && <Input label="KDV %" type="number" value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value) || 0)} />}
          </div>
        )}
        {source === 'opportunity' && (
          <Select label="Fırsat" value={oppId} onChange={e => { setOppId(e.target.value); setRateOverride(''); }}
            options={[{ value: '', label: partnerOpps.length ? 'Seçiniz' : 'Bu ortağa bağlı fırsat yok' },
              ...partnerOpps.map(o => ({ value: o.id, label: `${o.title} — ${tl(n(o.value))} (${o.stage})` }))]} />
        )}
        {source === 'invoice' && (
          <Select label="Fatura" value={invId} onChange={e => { setInvId(e.target.value); setRateOverride(''); }}
            options={[{ value: '', label: partnerInvs.length ? 'Seçiniz' : 'Bu ortağa bağlı kesilmiş fatura yok' },
              ...partnerInvs.map(i => ({ value: i.id, label: `${i.invoice_number} — ${customerName(i.customer_id)} — kalan ${tl(n(i.total) - n(i.paid_amount))}` }))]} />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Tahsil edilecek kısım (%)" type="number" value={collectPct} onChange={e => setCollectPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} />
          <Input label={`Komisyon % (önerilen %${suggestedRate})`} type="number" value={rateOverride} placeholder={String(suggestedRate)}
            onChange={e => setRateOverride(e.target.value)} />
        </div>
        <Select label="Ödeme yolu" value={channel} onChange={e => setChannel(e.target.value)}
          options={Object.entries(PAYMENT_CHANNELS).map(([value, c]) => ({ value, label: c.label + (value === settings?.payment_channel ? ' (ortağın tanımı)' : '') }))} />
        <p className="flex gap-1 text-[11px] text-slate-500"><Info className="mt-0.5 h-3 w-3 shrink-0" />Komisyon kuralı: {ruleText}.</p>
      </Card>

      {/* Sonuç */}
      <div className="space-y-4 lg:col-span-3">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Tahsilat Sonrası Tablo</h3>
            <Button variant="secondary" size="sm" onClick={print} disabled={!gross}><Printer className="h-3 w-3" />Ön Hesap Bildirimi Yazdır</Button>
          </div>
          {result && (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Tahsil edilecek tutar (KDV hariç)</span><span>{tl(base)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Komisyon oranı</span><span>%{rate}</span></div>
              <div className="flex justify-between font-medium"><span>Brüt komisyon</span><span>{tl(gross)}</span></div>
              {result.withholding > 0 && <div className="flex justify-between text-red-600"><span>{channel === 'payroll' ? 'Çalışan kesintileri' : 'Gelir vergisi stopajı'}</span><span>-{tl(result.withholding)}</span></div>}
              {result.stamp > 0 && <div className="flex justify-between text-red-600"><span>Damga vergisi</span><span>-{tl(result.stamp)}</span></div>}
              <div className="flex justify-between rounded-lg bg-green-50 px-3 py-2 text-base font-bold text-green-800"><span>Ortağın alacağı (net)</span><span>{tl(result.net)}</span></div>
              {result.extra > 0 && <div className="flex justify-between text-slate-600"><span>{channel === 'owner_payout' ? 'Huzur hakkı üzerindeki vergi' : 'SGK işveren payı'}</span><span>+{tl(result.extra)}</span></div>}
              <div className="flex justify-between rounded-lg bg-indigo-50 px-3 py-2 text-base font-bold text-indigo-800"><span>Size toplam maliyet</span><span>{tl(result.cost)}</span></div>
              {channel === 'owner_payout' && (
                <p className="text-xs text-amber-700">Ortağa {tl(result.net)} ödeyebilmek için şirketten brüt {tl(result.cost)} huzur hakkı çekmeniz gerekir.</p>
              )}
              {channel === 'company_invoice' && (
                <p className="text-xs text-slate-500">Ortak size {tl(gross)} + KDV fatura keser; KDV indirilebilir olduğu için maliyete eklenmez.</p>
              )}
              {base > 0 && <p className="pt-1 text-xs text-slate-500">Satıştan size kalan (komisyon sonrası, KDV hariç): <strong>{tl(base - result.cost)}</strong></p>}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-2 text-sm font-semibold">Ödeme Yollarının Karşılaştırması</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500">
              <th className="py-1.5">Ödeme yolu</th><th className="py-1.5 text-right">Kesinti</th><th className="py-1.5 text-right">Ortağın alacağı</th><th className="py-1.5 text-right">Size maliyet</th>
            </tr></thead>
            <tbody>
              {comparison.map(c => {
                const cheapest = Math.min(...comparison.map(x => x.cost));
                return (
                  <tr key={c.ch} className={`border-b last:border-0 ${c.ch === channel ? 'bg-indigo-50/60 font-medium' : ''}`}>
                    <td className="py-1.5">{PAYMENT_CHANNELS[c.ch].label}</td>
                    <td className="py-1.5 text-right text-red-600">{c.withholding + c.stamp > 0 ? `-${tl(c.withholding + c.stamp)}` : '-'}</td>
                    <td className="py-1.5 text-right text-green-700">{tl(c.net)}</td>
                    <td className="py-1.5 text-right text-indigo-700">{tl(c.cost)}{c.cost === cheapest && gross > 0 && <span className="ml-1 text-[10px] text-emerald-600">en düşük</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-400">Hesap, ortağın kartındaki vergi oranlarıyla yapılır. Oranlar yaklaşıktır; mali müşavirinizle teyit edin.</p>
        </Card>
      </div>
    </div>
  );
}
