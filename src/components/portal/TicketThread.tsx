'use client';

import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/utils';
import { FileField, FileLink } from './common';
import { Send, Lock } from 'lucide-react';

// Talep yazışması (bayi ve şirket ekranlarında ortak)
export default function TicketThread({ supabase, ticket, mode, dealerId, onPosted }:
  { supabase: any; ticket: any; mode: 'dealer' | 'staff'; dealerId: string; onPosted?: () => void }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [body, setBody] = useState('');
  const [file, setFile] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => supabase.from('dealer_ticket_messages').select('*').eq('ticket_id', ticket.id).order('created_at')
    .then(({ data }: any) => setMsgs(data || []));
  useEffect(() => { load(); }, [ticket.id]);

  const send = async () => {
    const text = [body.trim(), file ? `[Ek] ${file}` : ''].filter(Boolean).join('\n');
    if (!text) return;
    setBusy(true);
    const { error } = await supabase.from('dealer_ticket_messages').insert([{ ticket_id: ticket.id, dealer_id: dealerId, body: text, is_internal: mode === 'staff' && internal }]);
    setBusy(false);
    if (error) { alert(error.message); return; }
    setBody(''); setFile(''); setInternal(false); load(); onPosted?.();
  };

  const render = (text: string) => text.split('\n').map((line, i) => {
    const m = line.match(/^\[Ek\] (.+)$/);
    return <div key={i}>{m ? <FileLink supabase={supabase} value={m[1]} /> : line}</div>;
  });

  return (
    <div className="space-y-2">
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-2">
        {msgs.length === 0 && <p className="text-xs text-slate-400">Henüz mesaj yok.</p>}
        {msgs.map(m => {
          const mine = mode === 'dealer' ? !!m.dealer_user_id || !m.staff_user_id : !!m.staff_user_id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.is_internal ? 'border border-amber-300 bg-amber-50' : mine ? 'bg-indigo-600 text-white' : 'border bg-white'}`}>
                {m.is_internal && <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-amber-700"><Lock className="h-3 w-3" />İç not (bayi görmez)</p>}
                {render(m.body)}
                <p className={`mt-1 text-[10px] ${mine && !m.is_internal ? 'text-indigo-200' : 'text-slate-400'}`}>{m.staff_user_id ? 'Firma' : 'Bayi'} · {formatDateTime(m.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
      {!['closed'].includes(ticket.status) && (
        <div className="space-y-2">
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} placeholder="Mesaj yazın…" className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
          <FileField supabase={supabase} dealerId={dealerId} value={file} onChange={setFile} label="Ek (isteğe bağlı)" />
          <div className="flex items-center justify-between">
            {mode === 'staff' ? <label className="flex items-center gap-1 text-xs text-amber-700"><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />İç not (bayi görmez)</label> : <span />}
            <button onClick={send} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"><Send className="h-3 w-3" />Gönder</button>
          </div>
        </div>
      )}
    </div>
  );
}
