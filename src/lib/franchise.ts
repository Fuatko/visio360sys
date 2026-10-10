// Franchise & şube ağı: başvuru aşamaları, denetim şablonları, royalty yardımcıları

export type BV = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'secondary';

export const APP_STAGES: { key: string; label: string; variant: BV }[] = [
  { key: 'new', label: 'Yeni başvuru', variant: 'info' },
  { key: 'screening', label: 'Ön değerlendirme', variant: 'secondary' },
  { key: 'meeting', label: 'Tanışma görüşmesi', variant: 'primary' },
  { key: 'location', label: 'Lokasyon onayı', variant: 'primary' },
  { key: 'feasibility', label: 'Fizibilite', variant: 'warning' },
  { key: 'contract', label: 'Sözleşme', variant: 'warning' },
  { key: 'opened', label: 'Açıldı', variant: 'success' },
  { key: 'rejected', label: 'Olumsuz', variant: 'danger' },
  { key: 'withdrawn', label: 'Vazgeçti', variant: 'default' },
];
export const OPEN_STAGES = ['new', 'screening', 'meeting', 'location', 'feasibility', 'contract'];
export const stageOf = (k: string) => APP_STAGES.find(s => s.key === k) || APP_STAGES[0];

export const TIMELINES = ['0-3 ay', '3-6 ay', '6-12 ay', '12+ ay'];
export const SOURCES = ['Web sitesi', 'Sosyal medya', 'Franchise fuarı', 'Şubemizi ziyaret', 'Tavsiye', 'Basın / reklam', 'Diğer'];
export const REJECT_REASONS = ['Yetersiz bütçe', 'Lokasyon uygun değil', 'Bölgede şube var', 'Deneyim / profil uygun değil', 'Aday yanıt vermiyor', 'Finansman sağlanamadı', 'Diğer'];

export const scoreTone = (s: number) => (s >= 70 ? 'bg-green-100 text-green-800' : s >= 45 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600');

// ---------------------------------------------------------------------
// Denetim
// ---------------------------------------------------------------------
export type AuditItem = { id: string; section: string; text: string; weight: number; critical?: boolean; photo?: boolean };
export type Answer = AuditItem & { item_id: string; result: 'ok' | 'fail' | 'na' | ''; note?: string; photos?: string[] };

export const GRADE: Record<string, { label: string; cls: string }> = {
  A: { label: 'A · Mükemmel', cls: 'bg-green-100 text-green-800' },
  B: { label: 'B · İyi', cls: 'bg-lime-100 text-lime-800' },
  C: { label: 'C · Gelişmeli', cls: 'bg-amber-100 text-amber-800' },
  D: { label: 'D · Yetersiz', cls: 'bg-red-100 text-red-800' },
};

/** Sunucudaki tetikleyiciyle aynı hesap (canlı önizleme için) */
export function auditScore(answers: Pick<Answer, 'weight' | 'critical' | 'result'>[]) {
  let ok = 0, all = 0, critical = false;
  answers.forEach(a => {
    const w = Math.max(Number(a.weight) || 1, 0);
    if (a.result === 'ok') { ok += w; all += w; }
    if (a.result === 'fail') { all += w; if (a.critical) critical = true; }
  });
  const score = all > 0 ? Math.round((1000 * ok) / all) / 10 : null;
  const grade = score === null ? null : critical ? 'D' : score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';
  return { score, grade, critical };
}

let seq = 0;
const it = (section: string, text: string, weight = 1, critical = false, photo = false): AuditItem =>
  ({ id: `i${++seq}`, section, text, weight, critical, photo });

export const AUDIT_PRESETS: { name: string; description: string; items: AuditItem[] }[] = [
  {
    name: 'Kahve zinciri şube denetimi',
    description: 'Hijyen, ürün standardı, servis, marka ve stok kontrolü',
    items: [
      it('Hijyen & gıda güvenliği', 'Personel hijyeni (bone, önlük, el yıkama, takı yok)', 3, true),
      it('Hijyen & gıda güvenliği', 'Soğuk zincir: buzdolabı ısıları 0–4 °C ve kayıt tutuluyor', 3, true, true),
      it('Hijyen & gıda güvenliği', 'Son kullanma tarihi geçmiş ürün yok, etiketleme (açılış tarihi) tam', 3, true, true),
      it('Hijyen & gıda güvenliği', 'Bar, tezgâh ve ekipman temiz', 2, false, true),
      it('Hijyen & gıda güvenliği', 'Lavabo / tuvalet temiz ve kontrol çizelgesi güncel', 2),
      it('Ürün standardı', 'Espresso ayarı (doz, süre, ekstraksiyon) standarda uygun', 3),
      it('Ürün standardı', 'Reçete ve sunum standardı (bardak, süsleme, gramaj)', 2, false, true),
      it('Ürün standardı', 'Vitrin ürünleri dolu, taze ve düzenli', 2, false, true),
      it('Servis', 'Karşılama ve uğurlama standardı', 1),
      it('Servis', 'Sipariş–teslim süresi hedef içinde', 2),
      it('Servis', 'Personel üniforması ve isim kartı', 1),
      it('Marka & görsel', 'Menü panoları ve kampanya materyalleri güncel', 2, false, true),
      it('Marka & görsel', 'Aydınlatma, müzik ve ortam standardı', 1),
      it('Marka & görsel', 'Dış cephe ve tabela temiz, ışıkları çalışıyor', 1, false, true),
      it('Operasyon', 'Stok seviyeleri yeterli, FIFO uygulanıyor', 2),
      it('Operasyon', 'Kasa ve POS kayıtları düzenli', 2),
      it('Operasyon', 'Yangın tüpü, ilk yardım dolabı yerinde ve tarihi geçerli', 2, true),
    ],
  },
  {
    name: 'Restoran şube denetimi',
    description: 'Mutfak, servis salonu, gıda güvenliği ve operasyon',
    items: [
      it('Mutfak & gıda güvenliği', 'Çiğ / pişmiş ürün ayrımı ve renk kodlu kesme tahtaları', 3, true),
      it('Mutfak & gıda güvenliği', 'Soğuk oda / dondurucu ısıları ve kayıtları', 3, true, true),
      it('Mutfak & gıda güvenliği', 'Pişirme ve sıcak tutma ısıları (≥ 65 °C) ölçülüyor', 3, true),
      it('Mutfak & gıda güvenliği', 'Haşere kontrolü yapılıyor, raporu güncel', 3, true),
      it('Mutfak & gıda güvenliği', 'Mutfak zemin, davlumbaz ve ekipman temiz', 2, false, true),
      it('Mutfak & gıda güvenliği', 'Alerjen bilgisi menüde / personelde mevcut', 2),
      it('Ürün standardı', 'Reçete kartlarına uygun porsiyon ve sunum', 3, false, true),
      it('Ürün standardı', 'Tabak çıkış süresi hedef içinde', 2),
      it('Servis salonu', 'Masa düzeni, temizlik ve menü kondisyonu', 2, false, true),
      it('Servis salonu', 'Karşılama, sipariş alma ve hesap süreci standardı', 2),
      it('Servis salonu', 'Personel kıyafeti ve kişisel hijyen', 2, true),
      it('Marka & görsel', 'Kampanya ve menü materyalleri güncel', 1, false, true),
      it('Operasyon', 'Stok ve fire kayıtları düzenli', 2),
      it('Operasyon', 'Personel eğitim kayıtları ve hijyen belgeleri', 2),
      it('Operasyon', 'Yangın, acil çıkış ve ilk yardım donanımı', 2, true),
    ],
  },
];

export const newItemId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Telefon fotoğraflarını yüklemeden önce küçült (en fazla 1600 px, JPEG) */
export async function compressImage(file: File, max = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>(res => c.toBlob(b => res(b || file), 'image/jpeg', quality));
  } catch { return file; }
}

// ---------------------------------------------------------------------
// Royalty
// ---------------------------------------------------------------------
export const ROYALTY_STATUS: Record<string, { label: string; variant: BV }> = {
  submitted: { label: 'Onay bekliyor', variant: 'warning' },
  approved: { label: 'Onaylandı', variant: 'info' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  billed: { label: 'Tahsilata aktarıldı', variant: 'success' },
};

/** Sunucu tetikleyicisiyle aynı hesap (önizleme) */
export function royaltyPreview(gross: number, a: any) {
  const g = Number(gross) || 0;
  const roy = Math.round(g * (Number(a?.royalty_pct) || 0)) / 100;
  const minAdj = Math.max((Number(a?.min_royalty) || 0) - roy, 0);
  const mkt = Math.round(g * (Number(a?.marketing_pct) || 0)) / 100;
  const fixed = Number(a?.fixed_fee) || 0;
  return { royalty: roy + minAdj, minAdj, marketing: mkt, fixed, total: roy + minAdj + mkt + fixed };
}

export const monthLabel = (d: string) => new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

/** Son N tamamlanmış ay (YYYY-MM-01), yeniden eskiye */
export function lastMonths(n: number, from = new Date()) {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  }
  return out;
}
