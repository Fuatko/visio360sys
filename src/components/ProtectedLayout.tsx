'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { AuthProvider } from '@/lib/auth-context';
import Sidebar from '@/components/Sidebar';
import { Menu } from 'lucide-react';

const publicRoutes = ['/login', '/register', '/portal/kayit'];
// Giriş gerektirmeyen dış sayfalar (müşteriye giden online teklif)
const isExternal = (p: string) => p.startsWith('/q/') || p.startsWith('/s/') || p.startsWith('/izin/') || p.startsWith('/f/') || p.startsWith('/rfq/');

// Bayi portalı kullanıcısı mı? (oturum başına bir kez sorulur)
let dealerCache: { uid: string; dealer: boolean } | null = null;
async function isDealerUser(supabase: any, uid: string): Promise<boolean> {
  if (dealerCache?.uid === uid) return dealerCache.dealer;
  const { data, error } = await supabase.rpc('is_dealer_user');
  const dealer = !error && data === true;
  dealerCache = { uid, dealer };
  return dealer;
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  // Telefonda (md altı) menü açılır-kapanır; masaüstü düzeni değişmez
  const [mobileMenu, setMobileMenu] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => { setMobileMenu(false); }, [pathname]);

  useEffect(() => {
    const checkAuth = async () => {
      if (isExternal(pathname)) { setLoading(false); return; }
      const { data: { session } } = await supabase.auth.getSession();
      
      const isPortal = pathname.startsWith('/portal');
      if (!session && !publicRoutes.includes(pathname)) {
        router.push(isPortal ? '/login?portal=1' : '/login');
      } else if (session && publicRoutes.includes(pathname) && pathname !== '/portal/kayit') {
        router.push((await isDealerUser(supabase, session.user.id)) ? '/portal' : '/');
      } else if (session && !isPortal && (await isDealerUser(supabase, session.user.id))) {
        // Bayi kullanıcıları şirket ekranlarına giremez
        router.replace('/portal');
      } else {
        setAuthenticated(!!session);
        setLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) dealerCache = null;
      if (isExternal(pathname)) return;
      if (!session && !publicRoutes.includes(pathname)) {
        router.push(pathname.startsWith('/portal') ? '/login?portal=1' : '/login');
      } else {
        setAuthenticated(!!session);
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (publicRoutes.includes(pathname) || pathname.startsWith('/portal') || isExternal(pathname)) {
    return <>{children}</>;
  }
  // Yazdırma / PDF sayfaları: oturum gerekli, menü ve üst bar yok
  if (pathname.endsWith('/print')) return <>{children}</>;

  return (
    <AuthProvider>
      <div className="flex bg-slate-100">
        <div className={mobileMenu ? 'block' : 'hidden md:block'}><Sidebar /></div>
        {mobileMenu && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMobileMenu(false)} />}
        <main className="flex-1 md:ml-56 min-h-screen min-w-0">
          <div className="sticky top-0 z-20 flex h-11 items-center gap-2 border-b border-slate-200 bg-white px-3 md:hidden">
            <button onClick={() => setMobileMenu(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Menü"><Menu className="h-5 w-5" /></button>
            <span className="text-sm font-semibold text-slate-800">Inspira360</span>
          </div>
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
