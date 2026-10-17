'use client';

// Adım 1 — Eğitim yılı ve satınalma politikası (proc_policies, kurum başına tek satır)
import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui';
import MoneyInput from '@/components/MoneyInput';
import { createClient } from '@/lib/supabase';
import { MONTHS_TR, ProcPolicy, fiscalYearOf } from '@/lib/procure';

const inp = 'h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 py-3 sm:grid-cols-[260px_1fr] sm:gap-4">
      <div><p className="text-sm font-medium text-slate-800">{label}</p>{hint && <p className="text-[11px] text-slate-500">{hint}</p>}</div>
      <div className="max-w-sm">{children}</div>
    </div>
  );
}

export default function PolicyStep({ policy, orgId, onSaved }: { policy: ProcPolicy; orgId?: string; onSaved: (p: ProcPolicy) => void }) {
  const [f, setF] = useState<ProcPolicy>(policy);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { setF(policy); }, [policy]);
  const set = (k: keyof ProcPolicy, v: any) => setF(p => ({ ...p, [k]: v }));
  const num = (v: string) => (v === '' ? null : Number(v));

  const save = async () => {
    setBusy(true); setMsg('');
    const { setup_progress, ...fields } = f;
    const { data, error } = await createClient().from('proc_policies')
      .upsert({ ...fields, organization_id: orgId, setup_progress: { ...setup_progress, policy: 'done' } }, { onConflict: 'organization_id' })
      .select().single();
    setBusy(false);
    if (error) { setMsg('Kaydedilemedi: ' + error.message); return; }
    setMsg('Politika kaydedildi.');
    onSaved(data as ProcPolicy);
  };

  return (
    <div>
      <Row label="Bütçe yılı başlangıcı" hint={`Okullar için Eylül. Bugünün bütçe yılı: ${fiscalYearOf(new Date(), f.fiscal_year_start_month)}`}>
        <select className={inp} value={f.fiscal_year_start_month} onChange={e => set('fiscal_year_start_month', Number(e.target.value))}>
          {MONTHS_TR.map((m, i) => <option key={m} value={i + 1}>{m}{i + 1 === 9 ? ' (eğitim yılı)' : i === 0 ? ' (takvim yılı)' : ''}</option>)}
        </select>
      </Row>
      <Row label="3 teklif eşiği (KDV hariç)" hint="Bu tutarın üstündeki alımlarda en az 3 teklif zorunlu. Boş bırakılırsa kural kapalı.">
        <div className="flex items-center gap-2"><span className="text-sm text-slate-500">₺</span>
          <MoneyInput className={inp} value={f.three_quote_threshold} onChange={v => set('three_quote_threshold', v)} placeholder="Örn. 50.000" /></div>
      </Row>
      <Row label="Tek kaynak gerekçesi" hint="Yetersiz teklifle ödülde yazılı gerekçe istenir">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.single_source_requires_justification} onChange={e => set('single_source_requires_justification', e.target.checked)} />Gerekçe zorunlu</label>
      </Row>
      <Row label="Bütçe kontrolü" hint="Onayda bütçe yetersizse ne olsun?">
        <select className={inp} value={f.budget_check} onChange={e => set('budget_check', e.target.value)}>
          <option value="off">Kapalı</option>
          <option value="warn">Uyar (önerilen)</option>
          <option value="block">Engelle (yalnızca mali işler / yönetici geçirebilir)</option>
        </select>
      </Row>
      <Row label="Fatura fiyat toleransı (%)" hint="3'lü eşleştirmede birim fiyat farkı bu oranı aşarsa mali işler onayı gerekir">
        <input type="number" min={0} step={0.5} className={inp} value={f.invoice_price_tolerance_pct} onChange={e => set('invoice_price_tolerance_pct', num(e.target.value) ?? 0)} />
      </Row>
      <Row label="Fatura miktar toleransı (%)">
        <input type="number" min={0} step={0.5} className={inp} value={f.invoice_qty_tolerance_pct} onChange={e => set('invoice_qty_tolerance_pct', num(e.target.value) ?? 0)} />
      </Row>
      <Row label="Varsayılan vade (gün)">
        <input type="number" min={0} className={inp} value={f.default_payment_term_days ?? ''} onChange={e => set('default_payment_term_days', num(e.target.value))} placeholder="Örn. 30" />
      </Row>
      <Row label="Mal kabulde fotoğraf" hint="Teslim alan kişi en az bir fotoğraf eklemek zorunda olsun">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.require_receipt_photo} onChange={e => set('require_receipt_photo', e.target.checked)} />Zorunlu</label>
      </Row>
      <Row label="Tedarikçi yeniden değerlendirme (ay)" hint="ISO 9001 md. 8.4">
        <input type="number" min={1} max={60} className={inp} value={f.vendor_reevaluation_months} onChange={e => set('vendor_reevaluation_months', num(e.target.value) ?? 12)} />
      </Row>
      <Row label="Onaylı tedarikçi listesi zorunlu" hint="Açıksa teklif ve sipariş yalnızca onaylı/şartlı tedarikçilere verilebilir">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.approved_vendor_list_required} onChange={e => set('approved_vendor_list_required', e.target.checked)} />Zorunlu</label>
      </Row>
      <div className="flex items-center gap-3 pt-4">
        <Button onClick={save} disabled={busy}><Save className="h-4 w-4" />{busy ? 'Kaydediliyor…' : 'Kaydet ve tamamla'}</Button>
        {msg && <span className={`text-sm ${msg.startsWith('Kaydedilemedi') ? 'text-rose-600' : 'text-emerald-700'}`}>{msg}</span>}
      </div>
    </div>
  );
}
