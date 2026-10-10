'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Eye, Monitor, Smartphone, Tablet, Printer, Bot } from 'lucide-react';
import { deviceOf, fmtDur, isBot, readSignal } from '@/lib/quote-engagement';

export default function QuoteViewHistory({ quote }: { quote: any }) {
  const supabase = createClient();
  const [rows, setRows] = useState<any[] | null>(null);
  const [rich, setRich] = useState(true);

  useEffect(() => {
    if (!quote?.id || !quote.share_token) return;
    (async () => {
      let r: any = await supabase.from('quote_views').select('id, viewed_at, user_agent, ip, duration_sec, max_scroll_pct, printed').eq('quote_id', quote.id).order('viewed_at', { ascending: false }).limit(100);
      if (r.error) { setRich(false); r = await supabase.from('quote_views').select('id, viewed_at, user_agent, ip').eq('quote_id', quote.id).order('viewed_at', { ascending: false }).limit(100); }
      setRows(r.error ? [] : r.data || []);
    })();
  }, [quote?.id]);

  if (!quote?.share_token) return null;
  const sig = readSignal(quote);
  const human = (rows || []).filter(v => !isBot(v.user_agent));
  const devices = new Set(human.map(v => `${deviceOf(v.user_agent).device}|${v.ip || ''}`));
  const toneCls: Record<string, string> = { success: 'border-green-200 bg-green-50 text-green-900', danger: 'border-red-200 bg-red-50 text-red-900', warning: 'border-amber-200 bg-amber-50 text-amber-900', info: 'border-indigo-200 bg-indigo-50 text-indigo-900', default: 'border-slate-200 bg-slate-50 text-slate-700' };

  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm print:hidden">
      <p className="flex items-center gap-1 font-medium"><Eye className="h-4 w-4 text-indigo-600" />Müşteri okuma takibi</p>
      {sig && <div className={`rounded-md border px-3 py-2 ${toneCls[sig.tone]}`}><p className="font-semibold">{sig.label}</p><p className="text-xs opacity-80">{sig.hint}</p></div>}
      {rows && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
          <div className="rounded bg-slate-50 p-2"><p className="text-lg font-bold">{human.length}</p>açılış</div>
          <div className="rounded bg-slate-50 p-2"><p className="text-lg font-bold">{fmtDur(quote.read_seconds || 0)}</p>toplam okuma</div>
          <div className="rounded bg-slate-50 p-2"><p className="text-lg font-bold">%{quote.max_scroll_pct || 0}</p>sayfa sonuna</div>
          <div className="rounded bg-slate-50 p-2"><p className="text-lg font-bold">{devices.size}</p>farklı cihaz/kişi</div>
        </div>
      )}
      {devices.size > 1 && <p className="text-xs text-slate-600">Teklif birden fazla cihazdan açıldı — büyük ihtimalle karar vericiyle paylaşıldı.</p>}
      {rows === null ? <p className="text-xs text-slate-400">Yükleniyor…</p> : rows.length === 0 ? <p className="text-xs text-slate-500">Henüz açılmadı.</p> : (
        <div className="max-h-56 overflow-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b text-left text-slate-500"><th className="py-1">Zaman</th><th>Cihaz</th>{rich && <><th className="text-right">Süre</th><th className="text-right">Kaydırma</th></>}<th className="text-right">IP</th></tr></thead>
            <tbody>
              {rows.map(v => {
                const d = deviceOf(v.user_agent), bot = isBot(v.user_agent);
                const Ic = d.device === 'Telefon' ? Smartphone : d.device === 'Tablet' ? Tablet : Monitor;
                return (
                  <tr key={v.id} className={`border-b ${bot ? 'text-slate-400' : ''}`} title={v.user_agent || ''}>
                    <td className="py-1">{new Date(v.viewed_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{bot ? <span className="inline-flex items-center gap-1"><Bot className="h-3 w-3" />Bağlantı önizleme</span> : <span className="inline-flex items-center gap-1"><Ic className="h-3 w-3" />{d.device}<span className="text-slate-400">{d.browser ? ` · ${d.browser}` : ''}</span>{v.printed && <Printer className="h-3 w-3 text-indigo-600" aria-label="Yazdırdı" />}</span>}</td>
                    {rich && <><td className="text-right">{v.duration_sec ? fmtDur(v.duration_sec) : '-'}</td><td className="text-right">{v.max_scroll_pct ? `%${v.max_scroll_pct}` : '-'}</td></>}
                    <td className="text-right font-mono text-[10px] text-slate-400">{(v.ip || '').split(',')[0]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-400">Süre yalnızca sayfa ekranda açıkken sayılır. Gri satırlar WhatsApp/e-posta bağlantı önizlemesidir, okuma sayılmaz.</p>
    </div>
  );
}
