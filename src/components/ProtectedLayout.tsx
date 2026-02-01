'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { AuthProvider } from '@/lib/auth-context';
import Sidebar from '@/components/Sidebar';

const publicRoutes = ['/login', '/register'];

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session && !publicRoutes.includes(pathname)) {
        router.push('/login');
      } else if (session && publicRoutes.includes(pathname)) {
        router.push('/');
      } else {
        setAuthenticated(!!session);
        setLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && !publicRoutes.includes(pathname)) {
        router.push('/login');
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

  // Public routes - no sidebar
  if (publicRoutes.includes(pathname)) {
    return <>{children}</>;
  }

  // Protected routes - with sidebar and AuthProvider
  return (
    <AuthProvider>
      <div className="flex bg-slate-100">
        <Sidebar />
        <main className="flex-1 ml-56 min-h-screen">{children}</main>
      </div>
    </AuthProvider>
  );
}
