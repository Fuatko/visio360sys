'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, Upload, Download, Trash2, Eye, EyeOff, FileText, Loader2 } from 'lucide-react';
import { ACCEPT, uploadQuoteFile, attachToQuote, openQuoteFile, fmtSize } from '@/lib/quote-files';

const KIND: Record<string, string> = { offer: 'Teklif dosyası', appendix: 'Ek', technical: 'Teknik şartname', other: 'Diğer' };

/** Teklif detayında: Word / PDF dosyaları, müşteriyle paylaşım ve indirme takibi */
export default function QuoteAttachments({ supabase, quoteId }: { supabase: any; quoteId: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('offer');
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('quote_attachments').select('*').eq('quote_id', quoteId).order('created_at');
    if (error) { setErr(/relation|does not exist/i.test(error.message) ? 'Dosya ekleme için teklif-dosya.sql dosyasını Supabase\'de çalıştırın.' : error.message); setRows([]); return; }
    setErr(null); setRows(data || []);
  }, [supabase, quoteId]);
  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setErr(null);
    try {
      for (const f of Array.from(files)) { const up = await uploadQuoteFile(supabase, f, quoteId); await attachToQuote(supabase, quoteId, up, kind); }
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const toggle = async (r: any) => { await supabase.from('quote_attachments').update({ share_with_customer: !r.share_with_customer }).eq('id', r.id); load(); };
  const remove = async (r: any) => {
    if (!confirm(`"${r.file_name}" silinsin mi?`)) return;
    await supabase.storage.from('quote-files').remove([r.storage_path]);
    await supabase.from('quote_attachments').delete().eq('id', r.id); load();
  };

  return (
    <div className="rounded-lg border p-3 print:hidden">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1 text-sm font-semibold"><Paperclip className="h-4 w-4 text-indigo-600" />Teklif dosyaları</p>
        <select value={kind} onChange={e => setKind(e.target.value)} className="ml-auto h-8 rounded border px-2 text-xs">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button disabled={busy} onClick={() => input.current?.click()} className="flex h-8 items-center gap-1 rounded-lg border px-3 text-xs font-medium hover:bg-slate-50 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Word / PDF ekle</button>
        <input ref={input} type="file" accept={ACCEPT} multiple className="hidden" onChange={e => upload(e.target.files)} />
      </div>
      {err && <p className="mb-2 text-xs text-red-600">{err}</p>}
      {rows === null ? <p className="text-xs text-slate-400">Yükleniyor…</p> : rows.length === 0 ? (
        <p className="text-xs text-slate-500">Henüz dosya yok. Word veya PDF olarak hazırladığınız teklifi buraya ekleyebilirsiniz; müşteri online teklif bağlantısından indirebilir.</p>
      ) : (
        <div className="space-y-1.5">{rows.map(r => (
          <div key={r.id} className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1.5 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-slate-500" />
            <button onClick={() => openQuoteFile(supabase, r.storage_path, r.file_name).catch(e => alert(e.message))} className="min-w-0 truncate text-left text-indigo-700 hover:underline">{r.file_name}</button>
            <span className="shrink-0 text-[11px] text-slate-400">{KIND[r.kind] || r.kind} · {fmtSize(r.size_bytes)}</span>
            <span className={`ml-auto shrink-0 text-[11px] ${r.download_count ? 'text-emerald-700' : 'text-slate-400'}`}>{r.download_count ? `Müşteri ${r.download_count} kez indirdi${r.last_downloaded_at ? ' · son ' + new Date(r.last_downloaded_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : ''}` : r.share_with_customer ? 'Henüz indirilmedi' : 'Yalnızca iç kullanım'}</span>
            <button title={r.share_with_customer ? 'Müşteriden gizle' : 'Müşteriyle paylaş'} onClick={() => toggle(r)} className="shrink-0 text-slate-400 hover:text-slate-700">{r.share_with_customer ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
            <button title="İndir" onClick={() => openQuoteFile(supabase, r.storage_path, r.file_name).catch(e => alert(e.message))} className="shrink-0 text-slate-400 hover:text-slate-700"><Download className="h-4 w-4" /></button>
            <button title="Sil" onClick={() => remove(r)} className="shrink-0 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          </div>))}</div>
      )}
    </div>
  );
}
