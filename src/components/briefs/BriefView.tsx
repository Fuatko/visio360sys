'use client';

import { Badge } from '@/components/ui';
import { escapeHtml } from '@/lib/print';
import { Target, HelpCircle, ShieldAlert, Lightbulb, Newspaper, Users, Swords, Flag, ArrowRight, ExternalLink } from 'lucide-react';

export interface Brief {
  company_overview?: string;
  key_facts?: { label: string; value: string }[];
  recent_news?: { title: string; date?: string; summary?: string; url?: string }[];
  swot?: { strengths?: string[]; weaknesses?: string[]; opportunities?: string[]; threats?: string[] };
  likely_pain_points?: { pain: string; evidence?: string }[];
  decision_makers?: { name: string; title?: string; note?: string }[];
  meeting_strategy?: { objective?: string; opening?: string; agenda?: string[]; tone?: string };
  discovery_questions?: { question: string; why?: string }[];
  objections?: { objection: string; response: string }[];
  our_fit?: { product: string; pitch: string }[];
  competitive_angle?: string;
  red_flags?: string[];
  next_steps?: string[];
  confidence_note?: string;
}

const arr = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);

function Section({ icon: Icon, title, children, tone = 'indigo' }: { icon: any; title: string; children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = { indigo: 'text-indigo-600', amber: 'text-amber-600', red: 'text-red-600', green: 'text-green-600' };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><Icon className={`h-4 w-4 ${tones[tone]}`} />{title}</h3>
      {children}
    </section>
  );
}

export default function BriefView({ brief, sources }: { brief: Brief; sources: { url: string; title: string }[] }) {
  const sw = brief.swot || {};
  const ms = brief.meeting_strategy || {};
  return (
    <div className="space-y-4">
      {brief.company_overview && (
        <Section icon={Lightbulb} title="Firma özeti">
          <p className="text-sm leading-relaxed text-slate-700">{brief.company_overview}</p>
          {arr(brief.key_facts).length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {arr(brief.key_facts).map((f, i) => <div key={i} className="rounded-lg bg-slate-50 p-2"><p className="text-[11px] text-slate-500">{f.label}</p><p className="text-sm font-medium">{f.value}</p></div>)}
            </div>
          )}
        </Section>
      )}

      {(ms.objective || ms.opening) && (
        <Section icon={Target} title="Görüşme stratejisi" tone="green">
          {ms.objective && <p className="text-sm"><b>Hedef:</b> {ms.objective}</p>}
          {ms.opening && <p className="mt-2 rounded-lg border-l-4 border-green-500 bg-green-50 p-3 text-sm italic">"{ms.opening}"</p>}
          {arr(ms.agenda).length > 0 && <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm">{arr(ms.agenda).map((a, i) => <li key={i}>{a}</li>)}</ol>}
          {ms.tone && <p className="mt-2 text-xs text-slate-500">Üslup: {ms.tone}</p>}
        </Section>
      )}

      <Section icon={Flag} title="Müşterinin SWOT analizi">
        <div className="grid gap-2 sm:grid-cols-2">
          {([['strengths', 'Güçlü yönler', 'bg-green-50 border-green-200'], ['weaknesses', 'Zayıf yönler', 'bg-red-50 border-red-200'],
             ['opportunities', 'Fırsatlar', 'bg-blue-50 border-blue-200'], ['threats', 'Tehditler', 'bg-amber-50 border-amber-200']] as const).map(([k, l, c]) => (
            <div key={k} className={`rounded-lg border p-3 ${c}`}>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-600">{l}</p>
              <ul className="list-disc space-y-0.5 pl-4 text-sm">{arr((sw as any)[k]).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
            </div>
          ))}
        </div>
      </Section>

      {arr(brief.likely_pain_points).length > 0 && (
        <Section icon={ShieldAlert} title="Muhtemel sorunları / ihtiyaçları" tone="amber">
          <ul className="space-y-1.5 text-sm">{arr(brief.likely_pain_points).map((p, i) => <li key={i}><b>{p.pain}</b>{p.evidence && <span className="text-slate-500"> — {p.evidence}</span>}</li>)}</ul>
        </Section>
      )}

      {arr(brief.discovery_questions).length > 0 && (
        <Section icon={HelpCircle} title="Sorulacak keşif soruları">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">{arr(brief.discovery_questions).map((q, i) => <li key={i}><span className="font-medium">{q.question}</span>{q.why && <span className="block text-xs text-slate-500">{q.why}</span>}</li>)}</ol>
        </Section>
      )}

      {arr(brief.objections).length > 0 && (
        <Section icon={ShieldAlert} title="Olası itirazlar ve cevaplarınız" tone="red">
          <div className="space-y-2">{arr(brief.objections).map((o, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-medium text-red-700">“{o.objection}”</p>
              <p className="mt-1 flex gap-1 text-slate-700"><ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />{o.response}</p>
            </div>
          ))}</div>
        </Section>
      )}

      {(arr(brief.our_fit).length > 0 || brief.competitive_angle) && (
        <Section icon={Swords} title="Bizim konumlandırmamız" tone="green">
          <div className="space-y-1.5 text-sm">{arr(brief.our_fit).map((f, i) => <p key={i}><Badge variant="primary">{f.product}</Badge> {f.pitch}</p>)}</div>
          {brief.competitive_angle && <p className="mt-2 text-sm"><b>Rakiplere karşı:</b> {brief.competitive_angle}</p>}
        </Section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {arr(brief.decision_makers).length > 0 && (
          <Section icon={Users} title="Karar vericiler">
            <ul className="space-y-1 text-sm">{arr(brief.decision_makers).map((d, i) => <li key={i}><b>{d.name}</b>{d.title && ` — ${d.title}`}{d.note && <span className="block text-xs text-slate-500">{d.note}</span>}</li>)}</ul>
          </Section>
        )}
        {arr(brief.recent_news).length > 0 && (
          <Section icon={Newspaper} title="Son gelişmeler">
            <ul className="space-y-1.5 text-sm">{arr(brief.recent_news).map((n, i) => (
              <li key={i}>{n.url ? <a href={n.url} target="_blank" rel="noopener" className="font-medium text-indigo-700 hover:underline">{n.title}</a> : <b>{n.title}</b>}
                {n.date && <span className="text-xs text-slate-400"> · {n.date}</span>}{n.summary && <span className="block text-xs text-slate-600">{n.summary}</span>}</li>
            ))}</ul>
          </Section>
        )}
        {arr(brief.red_flags).length > 0 && (
          <Section icon={ShieldAlert} title="Dikkat edilecekler" tone="red">
            <ul className="list-disc space-y-0.5 pl-4 text-sm">{arr(brief.red_flags).map((x, i) => <li key={i}>{x}</li>)}</ul>
          </Section>
        )}
        {arr(brief.next_steps).length > 0 && (
          <Section icon={ArrowRight} title="Görüşme sonrası adımlar" tone="green">
            <ul className="list-disc space-y-0.5 pl-4 text-sm">{arr(brief.next_steps).map((x, i) => <li key={i}>{x}</li>)}</ul>
          </Section>
        )}
      </div>

      {brief.confidence_note && <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600"><b>Güvenilirlik notu:</b> {brief.confidence_note}</p>}
      {sources.length > 0 && (
        <div className="text-xs text-slate-500">
          <p className="mb-1 font-semibold">Kaynaklar</p>
          <ul className="space-y-0.5">{sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-indigo-700"><ExternalLink className="h-3 w-3" />{s.title}</a></li>)}</ul>
        </div>
      )}
    </div>
  );
}

// Yazdırma için düz HTML
export function briefToHtml(company: string, brief: Brief, sources: { url: string; title: string }[], meta: string) {
  const e = escapeHtml;
  const li = (xs?: any[], f: (x: any) => string = x => e(x)) => `<ul>${arr(xs).map(x => `<li>${f(x)}</li>`).join('')}</ul>`;
  const sw = brief.swot || {}; const ms = brief.meeting_strategy || {};
  return `
  <h1>Görüşme Hazırlık Dosyası: ${e(company)}</h1><p style="color:#666">${e(meta)}</p>
  <h2>Firma özeti</h2><p>${e(brief.company_overview || '')}</p>
  ${arr(brief.key_facts).length ? `<table>${arr(brief.key_facts).map(f => `<tr><td><b>${e(f.label)}</b></td><td>${e(f.value)}</td></tr>`).join('')}</table>` : ''}
  <h2>Görüşme stratejisi</h2><p><b>Hedef:</b> ${e(ms.objective || '')}</p><p><i>"${e(ms.opening || '')}"</i></p>${li(ms.agenda)}
  <h2>SWOT</h2><table><tr><td><b>Güçlü</b>${li(sw.strengths)}</td><td><b>Zayıf</b>${li(sw.weaknesses)}</td></tr><tr><td><b>Fırsat</b>${li(sw.opportunities)}</td><td><b>Tehdit</b>${li(sw.threats)}</td></tr></table>
  <h2>Muhtemel sorunlar</h2>${li(brief.likely_pain_points, p => `<b>${e(p.pain)}</b> — ${e(p.evidence || '')}`)}
  <h2>Keşif soruları</h2><ol>${arr(brief.discovery_questions).map(q => `<li><b>${e(q.question)}</b><br/><small>${e(q.why || '')}</small></li>`).join('')}</ol>
  <h2>İtirazlar ve cevaplar</h2>${li(brief.objections, o => `<b>"${e(o.objection)}"</b><br/>→ ${e(o.response)}`)}
  <h2>Bizim konumlandırmamız</h2>${li(brief.our_fit, f => `<b>${e(f.product)}:</b> ${e(f.pitch)}`)}<p>${e(brief.competitive_angle || '')}</p>
  <h2>Karar vericiler</h2>${li(brief.decision_makers, d => `<b>${e(d.name)}</b> ${e(d.title || '')} — ${e(d.note || '')}`)}
  <h2>Dikkat edilecekler</h2>${li(brief.red_flags)}
  <h2>Sonraki adımlar</h2>${li(brief.next_steps)}
  <p style="font-size:11px;color:#666"><b>Güvenilirlik:</b> ${e(brief.confidence_note || '')}</p>
  <p style="font-size:10px;color:#888">Kaynaklar: ${sources.map(s => e(s.url)).join(' · ')}</p>`;
}
