'use client';

// Tedarikçi havuzu içe aktarma: CSV şablonu ve Paraşüt'te son 12 ayda alış faturası olan cariler
import { useRef, useState } from 'react';
import { Download, Plug, Upload } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import { Category, VENDOR_STATUS, VendorStatus, downloadCsv, parseCsv, procError, tl, fmtDate } from '@/lib/procure';

const STATUS_ALIASES: Record<string, VendorStatus> = {
  aday: 'candidate', candidate: 'candidate', onayli: 'approved', 'onaylı': 'approved', approved: 'approved',
  sartli: 'conditional', 'şartlı': 'conditional', conditional: 'conditional', bloke: 'blocked', blocked: 'blocked', '': 'candidate',
};

export default function VendorImport({ categories, onDone }: { categories: Category[]; onDone: () => void }) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[] | null>(null);
  const [cands, setCands] = useState<any[] | null>(null);
  const [pick, setPick] = useState<Set<number>>(new Set());

  // CSV: ad;vergi_no;kategori_kodlari;eposta;telefon;iban;statu (kategori kodları virgül veya | ile)
  const importCsv = async (file: File) => {
    const { header, rows } = parseCsv(await file.text());
    const col = (...n: string[]) => header.findIndex(h => n.includes(h));
    const iName = col('ad', 'unvan', 'name'), iTax = col('vergi_no', 'vkn', 'tax_number'), iCat = col('kategori_kodlari', 'kategori', 'categories'),
      iMail = col('eposta', 'e-posta', 'email'), iPhone = col('telefon', 'phone'), iIban = col('iban'), iSt = col('statu', 'statü', 'status'), iCont = col('yetkili', 'contact_name');
    if (iName < 0) { setReport(['Başlıkta "ad" sütunu yok. Şablonu indirip kullanın.']); return; }
    const byCode = new Map(categories.filter(c => c.code).map(c => [c.code!.toLowerCase(), c.id]));
    const out: string[] = []; let ok = 0;
    setBusy(true);
    for (const [i, r] of rows.entries()) {
      const line = i + 2;
      const name = r[iName]?.trim(); if (!name) { out.push(`Satır ${line}: ad boş.`); continue; }
      const st = STATUS_ALIASES[(iSt >= 0 ? r[iSt] : '').toLocaleLowerCase('tr').trim()];
      if (!st) { out.push(`Satır ${line}: statü "${r[iSt]}" geçersiz (aday, onaylı, şartlı, bloke).`); continue; }
      const codes = iCat >= 0 ? (r[iCat] || '').split(/[,|]/).map(x => x.trim().toLowerCase()).filter(Boolean) : [];
      const bad = codes.filter(c => !byCode.has(c));
      if (bad.length) out.push(`Satır ${line}: kategori kodu bulunamadı (${bad.join(', ')}), diğerleri işlendi.`);
      const { error } = await supabase.rpc('proc_vendor_upsert', { p: {
        name, tax_number: iTax >= 0 ? r[iTax] : null, email: iMail >= 0 ? r[iMail] : null, phone: iPhone >= 0 ? r[iPhone] : null,
        iban: iIban >= 0 ? r[iIban] : null, contact_name: iCont >= 0 ? r[iCont] : null, status: st,
        ...(codes.length ? { category_ids: codes.filter(c => byCode.has(c)).map(c => byCode.get(c)) } : {}),
      } });
      if (error) out.push(`Satır ${line}: ${procError(error)}`); else ok++;
    }
    setBusy(false);
    setReport([`${ok} tedarikçi eklendi/güncellendi, ${out.length} uyarı/hata.`, ...out]);
    onDone();
  };

  const openParasut = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('proc_parasut_supplier_candidates');
    setBusy(false);
    if (error) { setReport([procError(error)]); return; }
    const list = (data || []) as any[];
    setCands(list); setPick(new Set(list.map((c, i) => (c.is_vendor ? -1 : i)).filter(i => i >= 0)));
  };
  const importParasut = async () => {
    if (!cands) return;
    setBusy(true);
    const out: string[] = []; let ok = 0;
    for (const i of pick) {
      const c = cands[i];
      const { error } = await supabase.rpc('proc_vendor_upsert', { p: { customer_id: c.customer_id, name: c.name, tax_number: c.tax_number } });
      if (error) out.push(`${c.name}: ${procError(error)}`); else ok++;
    }
    setBusy(false); setCands(null);
    setReport([`Paraşüt carilerinden ${ok} tedarikçi aktarıldı (aday statüsünde).`, ...out]);
    onDone();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={openParasut}><Plug className="h-3.5 w-3.5" />Paraşüt'teki tedarikçilerden aktar</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" />CSV içe aktar</Button>
        <Button size="sm" variant="ghost" onClick={() => downloadCsv('tedarikci-sablon.csv', [['ad', 'vergi_no', 'kategori_kodlari', 'eposta', 'telefon', 'iban', 'statu', 'yetkili'], ['Örnek Laboratuvar Ltd.', '1234567890', 'LAB|KRT', 'satis@ornek.com', '0532 000 00 00', 'TR00 0000 0000 0000 0000 0000 00', 'onaylı', 'Ali Veli']])}><Download className="h-3.5 w-3.5" />CSV şablonu</Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importCsv(f); }} />
      </div>
      {report && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="mb-1 flex justify-between"><b>Sonuç</b><button className="text-slate-400" onClick={() => setReport(null)}>Kapat</button></div>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">{report.map((l, i) => <li key={i} className={i ? 'text-rose-700' : ''}>{l}</li>)}</ul>
        </div>
      )}
      <Modal isOpen={!!cands} onClose={() => setCands(null)} title="Paraşüt'teki tedarikçi carileri (son 12 ay alış faturası)" size="xl"
        footer={<><Button variant="secondary" onClick={() => setCands(null)}>Vazgeç</Button><Button disabled={busy || pick.size === 0} onClick={importParasut}>{pick.size} cariyi aktar</Button></>}>
        {cands && (cands.length === 0 ? <p className="text-sm text-slate-500">Son 12 ayda Paraşüt'ten senkronlanan alış faturası bulunamadı.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1" /><th className="py-1">Cari</th><th className="py-1">Vergi no</th><th className="py-1 text-right">Fatura</th><th className="py-1 text-right">Toplam (KDV hariç)</th><th className="py-1">Son</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{cands.map((c, i) => (
              <tr key={i} className={c.is_vendor ? 'text-slate-400' : ''}>
                <td className="py-1.5"><input type="checkbox" disabled={c.is_vendor} checked={pick.has(i)} onChange={() => setPick(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} /></td>
                <td className="py-1.5">{c.name || '—'}{c.is_vendor && <span className="ml-1 text-[11px]">(zaten tedarikçi)</span>}{!c.customer_id && <span className="ml-1 text-[11px] text-amber-600">(cari kart açılacak)</span>}</td>
                <td className="py-1.5">{c.tax_number || '—'}</td><td className="py-1.5 text-right">{c.bills}</td><td className="py-1.5 text-right">{tl(c.total)}</td><td className="py-1.5">{fmtDate(c.last_date)}</td>
              </tr>
            ))}</tbody>
          </table>
        ))}
      </Modal>
      <p className="text-[11px] text-slate-400">Aktarılan tedarikçiler cari kart üzerinden yönetilir (vergi no ile eşleşir); statüler: {Object.values(VENDOR_STATUS).map(s => s.label).join(', ')}.</p>
    </div>
  );
}
