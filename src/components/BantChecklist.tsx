'use client';

// BANT: fırsat nitelendirme — Bütçe, Yetki, İhtiyaç, Zamanlama
export type BantAnswer = 'yes' | 'partial' | 'unknown';
export interface Bant {
  budget: BantAnswer;
  authority: BantAnswer;
  need: BantAnswer;
  timing: BantAnswer;
  notes?: string;
}

export const EMPTY_BANT: Bant = { budget: 'unknown', authority: 'unknown', need: 'unknown', timing: 'unknown', notes: '' };

export const BANT_ITEMS: { key: keyof Omit<Bant, 'notes'>; label: string; question: string }[] = [
  { key: 'budget', label: 'Bütçe', question: 'Bu iş için ayrılmış ya da ayrılabilecek bir bütçe var mı?' },
  { key: 'authority', label: 'Yetki', question: 'Karar vericiyle görüşüyor muyuz ya da ona ulaşabiliyor muyuz?' },
  { key: 'need', label: 'İhtiyaç', question: 'Çözmek istedikleri net bir sorun ya da ihtiyaç var mı?' },
  { key: 'timing', label: 'Zamanlama', question: 'Karar ve başlangıç için belli bir zaman çerçevesi var mı?' },
];

const ANSWERS: { v: BantAnswer; label: string; cls: string }[] = [
  { v: 'yes', label: 'Evet', cls: 'bg-emerald-600 text-white border-emerald-600' },
  { v: 'partial', label: 'Kısmen', cls: 'bg-amber-500 text-white border-amber-500' },
  { v: 'unknown', label: 'Bilinmiyor', cls: 'bg-slate-500 text-white border-slate-500' },
];

export function normalizeBant(v: any): Bant {
  return { ...EMPTY_BANT, ...(v && typeof v === 'object' ? v : {}) };
}

/** 0–4 arası nitelik puanı (Evet = 1, Kısmen = 0,5) */
export function bantScore(b: Bant | null | undefined): number {
  if (!b) return 0;
  return BANT_ITEMS.reduce((s, i) => s + (b[i.key] === 'yes' ? 1 : b[i.key] === 'partial' ? 0.5 : 0), 0);
}

/** Erken aşama fırsat için önerilen kazanma olasılığı (%) */
export function bantSuggestedProbability(b: Bant): number {
  const s = bantScore(b);
  return Math.round(10 + s * 12.5); // 0 → %10, 4 → %60
}

export function BantBadge({ value }: { value: any }) {
  if (!value) return null;
  const s = bantScore(normalizeBant(value));
  const cls = s >= 3 ? 'bg-emerald-100 text-emerald-700' : s >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`} title="BANT nitelik puanı">BANT {s}/4</span>;
}

export default function BantChecklist({ value, onChange }: { value: Bant; onChange: (b: Bant) => void }) {
  const score = bantScore(value);
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Nitelendirme (BANT)</p>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${score >= 3 ? 'bg-emerald-100 text-emerald-700' : score >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
          {score}/4 · önerilen olasılık %{bantSuggestedProbability(value)}
        </span>
      </div>
      {BANT_ITEMS.map(item => (
        <div key={item.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs">
            <span className="font-medium text-slate-700">{item.label}:</span> <span className="text-slate-500">{item.question}</span>
          </div>
          <div className="flex shrink-0 gap-1">
            {ANSWERS.map(a => (
              <button key={a.v} type="button" onClick={() => onChange({ ...value, [item.key]: a.v })}
                className={`rounded border px-2 py-0.5 text-xs ${value[item.key] === a.v ? a.cls : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <input value={value.notes || ''} onChange={(e) => onChange({ ...value, notes: e.target.value })}
        placeholder="Not (ör. bütçe Q1'de onaylanacak, karar verici Genel Müdür)"
        className="w-full rounded border border-slate-200 px-2 py-1 text-xs" />
    </div>
  );
}
