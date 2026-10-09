// Basit yazdırma: verilen HTML'i yeni pencerede açıp yazdırma penceresini başlatır.
export function printHtml(title: string, bodyHtml: string) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) {
    alert('Yazdırma penceresi açılamadı. Tarayıcınızın açılır pencere engelini kaldırın.');
    return;
  }
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0f172a; margin: 32px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; } h2 { font-size: 14px; margin: 20px 0 8px; }
  .muted { color: #64748b; } .right { text-align: right; } .bold { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 6px 4px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; font-size: 11px; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; margin-top: 10px; }
  .total td { font-weight: 700; border-top: 2px solid #0f172a; }
  .sign { display: flex; gap: 40px; margin-top: 48px; }
  .sign div { flex: 1; border-top: 1px solid #0f172a; padding-top: 6px; }
  .note { font-size: 10px; color: #64748b; margin-top: 16px; }
  @media print { body { margin: 12mm; } }
</style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export function escapeHtml(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
