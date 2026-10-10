// Teklif okunma sinyalleri — müşteri teklifi açtı mı, ne kadar okudu, ilgisi ne düzeyde?

export const fmtDur = (sec: number) => {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60), r = s % 60;
  return m < 60 ? `${m} dk${r ? ` ${r} sn` : ''}` : `${Math.floor(m / 60)} sa ${m % 60} dk`;
};

export function deviceOf(ua?: string | null): { device: string; browser: string } {
  const u = ua || '';
  const device = /iPad|Tablet/i.test(u) ? 'Tablet' : /Mobi|iPhone|Android/i.test(u) ? 'Telefon' : u ? 'Bilgisayar' : '-';
  const os = /Windows/i.test(u) ? 'Windows' : /iPhone|iPad|iOS/i.test(u) ? 'iOS' : /Android/i.test(u) ? 'Android' : /Mac OS/i.test(u) ? 'macOS' : /Linux/i.test(u) ? 'Linux' : '';
  const br = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : '';
  return { device, browser: [br, os].filter(Boolean).join(' · ') };
}

// Önizleme bağlantısı botları (WhatsApp, Outlook, Gmail güvenlik taraması) gerçek okuma sayılmamalı
export const isBot = (ua?: string | null) => /bot|crawl|spider|preview|WhatsApp|facebookexternalhit|Slackbot|TelegramBot|SkypeUriPreview|Google-?Read-?Aloud|Microsoft Office|MSOffice|outlook|BingPreview|curl|python|HeadlessChrome/i.test(ua || '');

export type Signal = { label: string; tone: 'default' | 'info' | 'success' | 'warning' | 'danger'; hint: string };

const DAY = 86400000;

/** Listede gösterilecek tek satırlık okuma durumu */
export function readSignal(q: any, now = Date.now()): Signal | null {
  if (!q?.share_token) return null;
  const views = Number(q.view_count) || 0;
  const secs = Number(q.read_seconds) || 0;
  const scroll = Number(q.max_scroll_pct) || 0;
  const sent = q.sent_at ? new Date(q.sent_at).getTime() : null;
  if (!views) {
    const days = sent ? Math.floor((now - sent) / DAY) : 0;
    if (q.status === 'sent' && days >= 3) return { label: `${days} gündür açılmadı`, tone: 'danger', hint: 'Bağlantı ulaşmamış olabilir. Arayıp teyit edin ya da farklı kanaldan tekrar gönderin.' };
    return { label: 'Henüz açılmadı', tone: 'default', hint: 'Müşteri bağlantıyı henüz açmadı.' };
  }
  const parts = [`${views} açılış`];
  if (secs) parts.push(fmtDur(secs));
  if (scroll) parts.push(`%${scroll}`);
  const last = q.last_viewed_at ? new Date(q.last_viewed_at).getTime() : 0;
  const first = q.first_viewed_at ? new Date(q.first_viewed_at).getTime() : 0;
  const revisited = last - first > DAY;
  if (q.customer_response) return { label: parts.join(' · '), tone: 'info', hint: 'Müşteri yanıt verdi.' };
  if (views >= 3 || revisited || Number(q.print_count) > 0)
    return { label: '🔥 ' + parts.join(' · '), tone: 'success', hint: `Yüksek ilgi${Number(q.print_count) ? ', yazdırdı/PDF aldı' : ''}${revisited ? ', farklı günlerde tekrar baktı' : ''} — muhtemelen içeride paylaşılıyor/karşılaştırılıyor. Şimdi arayın.` };
  if (secs > 0 && secs < 20) return { label: 'Göz attı · ' + parts.join(' · '), tone: 'warning', hint: 'Çok kısa baktı; detayları okumamış olabilir. Kısa bir özet mesajı gönderin.' };
  return { label: 'Okundu · ' + parts.join(' · '), tone: 'info', hint: 'Teklif açıldı ve incelendi.' };
}
