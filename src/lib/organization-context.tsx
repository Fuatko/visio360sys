'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

// ============ TYPES ============
export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  domain?: string;
  settings: Record<string, any>;
  subscription_plan: 'basic' | 'pro' | 'enterprise';
  subscription_expires_at?: string;
  is_active: boolean;
  max_users: number;
  created_at: string;
}

export interface UserWithOrg {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'org_admin' | 'manager' | 'user';
  organization_id?: string;
  organization?: Organization;
  is_org_admin: boolean;
}

interface OrganizationContextType {
  currentOrg: Organization | null;
  organizations: Organization[]; // super_admin için tüm kurumlar
  userWithOrg: UserWithOrg | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
  switchOrganization: (orgId: string) => Promise<void>;
  refreshOrganization: () => Promise<void>;
}

// ============ CONTEXT ============
const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

// ============ PROVIDER ============
export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [userWithOrg, setUserWithOrg] = useState<UserWithOrg | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const supabase = createClient();

  const isSuperAdmin = userWithOrg?.role === 'super_admin';
  const isOrgAdmin = userWithOrg?.role === 'org_admin' || userWithOrg?.is_org_admin === true;

  // Kullanıcı ve organizasyon bilgilerini yükle
  const fetchUserAndOrg = async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      // Kullanıcı bilgilerini al
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          *,
          organization:organizations(*)
        `)
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('User fetch error:', userError);
        setIsLoading(false);
        return;
      }

      setUserWithOrg(userData as UserWithOrg);

      // Super admin ise tüm kurumları getir
      if (userData.role === 'super_admin') {
        const { data: orgsData } = await supabase
          .from('organizations')
          .select('*')
          .order('name');
        
        setOrganizations(orgsData || []);

        // Seçili kurum varsa onu kullan, yoksa localStorage'dan veya ilkini al
        const savedOrgId = localStorage.getItem('selectedOrgId');
        const targetOrgId = selectedOrgId || savedOrgId || userData.organization_id || orgsData?.[0]?.id;
        
        if (targetOrgId) {
          const selectedOrg = orgsData?.find(o => o.id === targetOrgId) || orgsData?.[0];
          setCurrentOrg(selectedOrg || null);
          if (selectedOrg) {
            localStorage.setItem('selectedOrgId', selectedOrg.id);
          }
        }
      } else {
        // Normal kullanıcı - sadece kendi kurumunu görsün
        setCurrentOrg(userData.organization || null);
        setOrganizations(userData.organization ? [userData.organization] : []);
      }
    } catch (err) {
      console.error('Org context error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserAndOrg();
  }, [user?.id]);

  // Kurum değiştir (sadece super_admin için)
  const switchOrganization = async (orgId: string) => {
    if (!isSuperAdmin) return;

    const org = organizations.find(o => o.id === orgId);
    if (org) {
      setCurrentOrg(org);
      setSelectedOrgId(orgId);
      localStorage.setItem('selectedOrgId', orgId);
    }
  };

  // Yenile
  const refreshOrganization = async () => {
    await fetchUserAndOrg();
  };

  return (
    <OrganizationContext.Provider
      value={{
        currentOrg,
        organizations,
        userWithOrg,
        isLoading,
        isSuperAdmin,
        isOrgAdmin,
        switchOrganization,
        refreshOrganization,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

// ============ HOOK ============
export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}

// ============ HELPER HOOKS ============

// Kurum ID'sini query'lere eklemek için
export function useOrgFilter() {
  const { currentOrg, isSuperAdmin } = useOrganization();
  
  return {
    // Select query'lerinde kullan
    orgId: currentOrg?.id,
    
    // Insert/Update'te organization_id ekle
    withOrgId: <T extends Record<string, any>>(data: T): T & { organization_id?: string } => {
      if (currentOrg?.id) {
        return { ...data, organization_id: currentOrg.id };
      }
      return data;
    },
    
    // Query filter
    addOrgFilter: (query: any) => {
      if (currentOrg?.id && !isSuperAdmin) {
        return query.eq('organization_id', currentOrg.id);
      }
      return query;
    }
  };
}
