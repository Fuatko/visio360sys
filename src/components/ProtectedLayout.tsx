'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { AuthProvider } from '@/lib/auth-context';
import Sidebar from '@/components/Sidebar';

const publicRoutes = ['/login', '/register', '/portal/kayit'];
// Giriş gerektirmeyen dış sayfalar (müşteriye giden online teklif)
const isExternal = (p: string) => p.startsWith('/q/') || p.startsWith('/s/') || p.startsWith('/izin/');

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
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

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

  return (
    <AuthProvider>
      <div className="flex bg-slate-100">
        <Sidebar />
        <main className="flex-1 ml-56 min-h-screen">{children}</main>
      </div>
    </AuthProvider>
  );
}
