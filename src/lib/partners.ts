// İş ortağı komisyon kuralları — veritabanındaki calc_commission_amounts ile birebir aynı hesap

export const PAYMENT_CHANNELS: Record<string, { label: string; hint: string }> = {
  company_invoice: {
    label: 'Şirketli — fatura keser',
    hint: 'Ortak size fatura keser; kesinti yok. Faturadaki KDV indirilebilir olduğu için maliyete eklenmez.',
  },
  withholding: {
    label: 'Şahıs — şirketten stopajlı ödeme',
    hint: 'Gider pusulası / serbest meslek makbuzu ile ödenir; stopaj ve damga vergisi brütten kesilip şirketçe yatırılır.',
  },
  owner_payout: {
    label: 'Huzur hakkımdan öderim',
    hint: 'Ortağa anlaşılan tutar ödenir; bu parayı huzur hakkı olarak çekmenin vergisi şirket maliyetine eklenir.',
  },
  payroll: {
    label: 'Bordrolu — maaş gibi',
    hint: 'Uzun soluklu ortaklar için. Çalışan kesintileri (SGK, işsizlik, gelir ve damga vergisi) ve SGK işveren payı hesaplanır.',
  },
};

export const ATTRIBUTION_MODES: Record<string, string> = {
  one_time: 'Tek seferlik (sadece ilk fatura)',
  months: 'Belirli süre (ay)',
  lifetime: 'Süresiz (müşteri ömrü boyunca)',
};

export const COMMISSION_STATUS: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  accrued: { label: 'Hak Edildi', variant: 'warning' },
  approved: { label: 'Onaylandı', variant: 'info' },
  paid: { label: 'Ödendi', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'danger' },
};

export interface PartnerSettings {
  member_type: string;
  partner_company_name: string;
  partner_tax_no: string;
  partner_tax_office: string;
  partner_iban: string;
  default_commission_rate: number;
  attribution_mode: string;
  attribution_months: number;
  payment_channel: string;
  withholding_rate: number;
  stamp_tax_rate: number;
  owner_tax_rate: number;
  payroll_deduction_rate: number;
  employer_cost_rate: number;
  contract_start: string;
  contract_end: string;
  partner_notes: string;
}

// Varsayılan oranlar yaklaşıktır; mali müşavirinizle teyit edip ortak bazında güncelleyin.
export const PARTNER_DEFAULTS: PartnerSettings = {
  member_type: 'employee',
  partner_company_name: '',
  partner_tax_no: '',
  partner_tax_office: '',
  partner_iban: '',
  default_commission_rate: 10,
  attribution_mode: 'months',
  attribution_months: 12,
  payment_channel: 'company_invoice',
  withholding_rate: 20,
  stamp_tax_rate: 0.759,
  owner_tax_rate: 15.76,
  payroll_deduction_rate: 30.76,
  employer_cost_rate: 17.75,
  contract_start: '',
  contract_end: '',
  partner_notes: '',
};

export function pickPartnerSettings(p: any): PartnerSettings {
  const out: any = {};
  (Object.keys(PARTNER_DEFAULTS) as (keyof PartnerSettings)[]).forEach(k => {
    const v = p?.[k];
    out[k] = v === null || v === undefined ? PARTNER_DEFAULTS[k] : v;
  });
  return out as PartnerSettings;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Brüt komisyondan kesinti, net ve şirket maliyetini hesaplar. */
export function calcCommission(gross: number, s: Pick<PartnerSettings, 'payment_channel' | 'withholding_rate' | 'stamp_tax_rate' | 'owner_tax_rate' | 'payroll_deduction_rate' | 'employer_cost_rate'>) {
  const g = Number(gross) || 0;
  switch (s.payment_channel) {
    case 'withholding': {
      const withholding = r2(g * Number(s.withholding_rate) / 100);
      const stamp = r2(g * Number(s.stamp_tax_rate) / 100);
      return { withholding, stamp, extra: 0, net: r2(g - withholding - stamp), cost: g };
    }
    case 'owner_payout': {
      const cost = r2(g / (1 - Number(s.owner_tax_rate) / 100));
      return { withholding: 0, stamp: 0, extra: r2(cost - g), net: g, cost };
    }
    case 'payroll': {
      const withholding = r2(g * Number(s.payroll_deduction_rate) / 100);
      const extra = r2(g * Number(s.employer_cost_rate) / 100);
      return { withholding, stamp: 0, extra, net: r2(g - withholding), cost: r2(g + extra) };
    }
    default:
      return { withholding: 0, stamp: 0, extra: 0, net: g, cost: g };
  }
}
