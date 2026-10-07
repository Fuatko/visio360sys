'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'manager' | 'user';
  is_org_admin: boolean;
  organization_id?: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchProfile = async (userId: string) => {
    console.log('🔍 Auth - fetching profile for userId:', userId);
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, is_org_admin, organization_id')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Profile fetch error:', error);
      return null;
    }
    console.log('🔍 Auth - profile data:', data);
    return data;
  };

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const profileData = await fetchProfile(session.user.id);
        setProfile(profileData);
      }
      setLoading(false);
    };

    getSession();

    // ÖNEMLİ: Bu dinleyici içinde Supabase çağrısı BEKLENMEMELİ (await).
    // Oturum kilidi tutulurken yapılan sorgu kilitlenmeye yol açar ve sonraki
    // tüm istekler (kayıt, liste vb.) askıda kalır. Profil sorgusu kilit
    // bırakıldıktan sonra çalışsın diye setTimeout ile erteleniyor.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);

      if (!session?.user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      // Token yenilemelerinde profil değişmez; tekrar sorgulamaya gerek yok
      if (event === 'TOKEN_REFRESHED') {
        setLoading(false);
        return;
      }

      const userId = session.user.id;
      setTimeout(async () => {
        const profileData = await fetchProfile(userId);
        setProfile(profileData);
        setLoading(false);
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const isManager = profile?.role === 'manager' || isAdmin;

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      signIn, 
      signUp, 
      signOut, 
      isAdmin, 
      isManager,
      isSuperAdmin 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
