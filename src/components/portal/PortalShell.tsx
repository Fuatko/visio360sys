'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
  LayoutDashboard, ShoppingCart, Package, Wallet, Trophy, ShieldCheck, UserPlus, BarChart3,
  LifeBuoy, Megaphone, GraduationCap, Bell, UserCog, LogOut, Menu, X, Store, Receipt, ClipboardCheck,
} from 'lucide-react';

export interface PortalMe {
  user: { id: string; email: string; full_name: string | null; portal_role: string; title: string | null; phone: string | null };
  dealer: {
    id: string; name: string; dealer_code: string | null; dealer_level: string | null; region: string | null;
    payment_term_days: number | null; base_discount: number | null; credit_limit: number | null; price_list_id: string | null; dealer_since: string | null;
  };
  organization: string | null;
  open_balance: number;
  overdue: number;
  sales_rep: { name: string; email: string | null; phone: string | null } | null;
}

export interface Catalog {
  products: { id: string; code: string | null; name: string; category: string | null; unit: string | null; description: string | null; price: number; tax_rate: string | null }[];
  price_list_items: { price_list_id: string; product_id: string; price: number }[];
  rules: any[];
}

interface Ctx {
  supabase: any;
  me: PortalMe;
  reloadMe: () => Promise<void>;
  catalog: Catalog | null;
  loadCatalog: () => Promise<Catalog>;
  counts: Record<string, number>;
  refreshCounts: () => void;
}

const PortalContext = createContext<Ctx | null>(null);
export const usePortal = () => {
  const c = useContext(PortalContext);
  if (!c) throw new Error('usePortal portal içinde kullanılmalı');
  return c;
};

const MENU = [
  { href: '/portal', label: 'Ana Sayfa', icon: LayoutDashboard },
  { href: '/portal/siparis-ver', label: 'Sipariş Ver', icon: ShoppingCart },
  { href: '/portal/siparisler', label: 'Siparişlerim', icon: Package },
  { href: '/portal/finans', label: 'Finans & Cari Hesap', icon: Wallet },
  { href: '/portal/primler', label: 'Hedef & Ciro Primi', icon: Trophy },
  { href: '/portal/firsatlar', label: 'Fırsat Kaydı', icon: ShieldCheck },
  { href: '/portal/leadler', label: "Size Yönlendirilen Lead'ler", icon: UserPlus, count: 'leads' },
  { href: '/portal/satis-stok', label: 'Satış, Stok & Tahmin', icon: BarChart3 },
  { href: '/portal/talepler', label: 'Garanti, İade & Destek', icon: LifeBuoy, count: 'tickets' },
  { href: '/portal/pazarlama', label: 'Pazarlama Fonu', icon: Megaphone },
  { href: '/portal/ciro', label: 'Ciro Bildirimi & Royalty', icon: Receipt, show: 'royalty', count: 'royalty' },
  { href: '/portal/denetimler', label: 'Denetim & Standartlar', icon: ClipboardCheck, show: 'audits', count: 'actions' },
  { href: '/portal/egitim', label: 'Eğitim & Sertifika', icon: GraduationCap },
  { href: '/portal/duyurular', label: 'Duyurular & Dokümanlar', icon: Bell, count: 'announcements' },
  { href: '/portal/hesap', label: 'Hesabım & Ekibim', icon: UserCog },
];

export default function PortalShell({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);

  const reloadMe = useCallback(async () => {
    const { data, error } = await supabase.rpc('portal_me');
    if (error) { setError(error.message); return; }
    setMe(data);
  }, []);

  const refreshCounts = useCallback(async () => {
    const [ann, reads, leads, tickets, aud, roy] = await Promise.all([
      supabase.from('portal_announcements').select('id'),
      supabase.from('portal_announcement_reads').select('announcement_id'),
      supabase.from('dealer_lead_assignments').select('id', { count: 'exact', head: true }).eq('status', 'assigned'),
      supabase.from('dealer_tickets').select('id', { count: 'exact', head: true }).eq('status', 'waiting_dealer'),
      supabase.rpc('portal_audits'),
      supabase.rpc('portal_royalty'),
    ]);
    // Franchise menüleri yalnızca ilgili kayıt varsa görünür
    const audits = aud.error ? null : aud.data;
    const royalty = roy.error ? null : roy.data;
    const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; })();
    setFeatures({
      audits: !!audits && ((audits.audits || []).length > 0 || (audits.actions || []).length > 0),
      royalty: !!royalty?.agreement,
    });
    const readSet = new Set((reads.data || []).map((r: any) => r.announcement_id));
    setCounts({
      announcements: (ann.data || []).filter((a: any) => !readSet.has(a.id)).length,
      leads: leads.count || 0,
      tickets: tickets.count || 0,
      actions: (audits?.actions || []).filter((a: any) => a.status === 'open').length,
      royalty: royalty?.agreement && !(royalty.reports || []).some((r: any) => String(r.period).slice(0, 10) === lastMonth && r.status !== 'rejected') ? 1 : 0,
    });
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login?portal=1'); return; }
      await supabase.rpc('portal_claim');
      await reloadMe();
      refreshCounts();
    })();
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const loadCatalog = useCallback(async () => {
    if (catalog) return catalog;
    const { data, error } = await supabase.rpc('portal_catalog');
    if (error) throw error;
    setCatalog(data);
    return data as Catalog;
  }, [catalog]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login?portal=1');
  };

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="max-w-md rounded-xl bg-white p-6 text-center shadow">
          <Store className="mx-auto mb-3 h-10 w-10 text-slate-400" />
          <h1 className="mb-2 text-lg font-semibold">Bayi portalına erişim yok</h1>
          <p className="mb-4 text-sm text-slate-600">
            Bu hesap bir bayi portalı kullanıcısına bağlı değil veya erişiminiz durdurulmuş.
            Firmanızdaki bayi sorumlusundan sizi bu e-posta adresiyle davet etmesini isteyin.
          </p>
          <p className="mb-4 text-xs text-slate-400">{error}</p>
          <div className="flex justify-center gap-2">
            <Link href="/" className="rounded-lg border px-4 py-2 text-sm">Şirket paneline dön</Link>
            <button onClick={signOut} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">Çıkış yap</button>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">Şirket kullanıcısıysanız portalı görmek için bir bayi kullanıcısı ile giriş yapın (Bayi Yönetimi › Portal Kullanıcıları).</p>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
      {(MENU as { href: string; label: string; icon: any; count?: string; show?: string }[]).filter(m => !m.show || features[m.show]).map(m => {
        const active = m.href === '/portal' ? pathname === '/portal' : pathname.startsWith(m.href);
        const c = m.count ? counts[m.count] : 0;
        return (
          <Link key={m.href} href={m.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${active ? 'bg-white/15 font-medium text-white' : 'text-indigo-100 hover:bg-white/10'}`}>
            <m.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{m.label}</span>
            {c ? <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-900">{c}</span> : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <PortalContext.Provider value={{ supabase, me, reloadMe, catalog, loadCatalog, counts, refreshCounts }}>
      <div className="min-h-screen bg-slate-100">
        {/* Masaüstü menü */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-gradient-to-b from-indigo-800 to-indigo-950 lg:flex">
          <div className="border-b border-white/10 px-4 py-4">
            <p className="text-[11px] uppercase tracking-wider text-indigo-300">{me.organization || 'Bayi Portalı'}</p>
            <p className="truncate font-semibold text-white">{me.dealer.name}</p>
            <p className="text-xs text-indigo-200">{[me.dealer.dealer_level, me.dealer.dealer_code].filter(Boolean).join(' · ') || 'Bayi'}</p>
          </div>
          {nav}
          <div className="border-t border-white/10 p-3">
            <p className="truncate text-xs text-indigo-200">{me.user.full_name || me.user.email}</p>
            <button onClick={signOut} className="mt-1 flex items-center gap-1 text-xs text-indigo-300 hover:text-white"><LogOut className="h-3 w-3" />Çıkış</button>
          </div>
        </aside>

        {/* Mobil üst çubuk */}
        <header className="sticky top-0 z-20 flex items-center gap-3 bg-indigo-900 px-4 py-3 text-white lg:hidden">
          <button onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></button>
          <span className="flex-1 truncate font-medium">{me.dealer.name}</span>
          <Link href="/portal/siparis-ver"><ShoppingCart className="h-5 w-5" /></Link>
        </header>
        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-indigo-900">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
                <span className="font-semibold">{me.dealer.name}</span>
                <button onClick={() => setMenuOpen(false)}><X className="h-5 w-5" /></button>
              </div>
              {nav}
              <button onClick={signOut} className="m-3 flex items-center gap-1 text-sm text-indigo-200"><LogOut className="h-4 w-4" />Çıkış</button>
            </aside>
          </div>
        )}

        <main className="lg:ml-60">
          <div className="mx-auto max-w-6xl p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </PortalContext.Provider>
  );
}

export function PortalTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
