'use client';

import { Bell, Search, User, LogOut, Building2, ChevronDown, Shield, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface UserInfo {
  name: string;
  email: string;
  role: string;
  organization_id?: string;
  organization?: Organization;
}

export default function Header({ title = 'Dashboard', subtitle }: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showOrgMenu, setShowOrgMenu] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  
  const supabase = createClient();
  const { user } = useAuth();

  const isSuperAdmin = userInfo?.role === 'super_admin';
  const isOrgAdmin = userInfo?.role === 'org_admin';

  // Kullanıcı bilgilerini yükle
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!user?.id) return;

      try {
        const { data: userData } = await supabase
          .from('users')
          .select(`
            name,
            email,
            role,
            organization_id,
            organization:organizations(id, name, slug)
          `)
          .eq('id', user.id)
          .single();

        if (userData) {
          console.log('🔍 Header - userData from DB:', userData);
          console.log('🔍 Header - role:', userData.role);
          // Organization relation bir array olarak geliyor, ilk elemanı al
          const userInfoData: UserInfo = {
            name: userData.name,
            email: userData.email,
            role: userData.role,
            organization_id: userData.organization_id,
            organization: Array.isArray(userData.organization) 
              ? userData.organization[0] 
              : userData.organization
          };
          setUserInfo(userInfoData);
          
          // Super admin ise tüm kurumları getir
          if (userData.role === 'super_admin') {
            const { data: orgsData } = await supabase
              .from('organizations')
              .select('id, name, slug')
              .eq('is_active', true)
              .order('name');
            
            setOrganizations(orgsData || []);
            
            // Kayıtlı kurum varsa onu seç
            const savedOrgId = localStorage.getItem('selectedOrgId');
            if (savedOrgId && orgsData) {
              const savedOrg = orgsData.find(o => o.id === savedOrgId);
              setCurrentOrg(savedOrg || orgsData[0] || null);
            } else if (orgsData?.[0]) {
              setCurrentOrg(orgsData[0]);
            }
          } else {
            // Normal kullanıcı - kendi kurumu
            const orgData = Array.isArray(userData.organization) 
              ? userData.organization[0] 
              : userData.organization;
            setCurrentOrg(orgData || null);
          }
        }
      } catch (err) {
        console.error('User info fetch error:', err);
      }
    };

    fetchUserInfo();
  }, [user?.id]);

  // Kurum değiştir
  const switchOrganization = (org: Organization) => {
    setCurrentOrg(org);
    localStorage.setItem('selectedOrgId', org.id);
    setShowOrgMenu(false);
    // Sayfayı yenile
    window.location.reload();
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/login');
    } catch (error) {
      console.error('Logout error:', error);
      window.location.replace('/login');
    }
  };

  const roleNames: Record<string, string> = {
    super_admin: 'SÜPER ADMİN',
    admin: 'ADMİN',
    org_admin: 'KURUM ADMİNİ',
    manager: 'YÖNETİCİ',
    user: 'KULLANICI',
  };

  const roleColors: Record<string, string> = {
    super_admin: 'bg-red-100 text-red-600',
    admin: 'bg-orange-100 text-orange-600',
    org_admin: 'bg-purple-100 text-purple-600',
    manager: 'bg-blue-100 text-blue-600',
    user: 'bg-slate-100 text-slate-600',
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      {/* Left: Title & Subtitle */}
      <div className="flex items-center gap-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        
        {/* Search - hidden on mobile */}
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Ara..."
            className="h-9 w-64 rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition-colors focus:border-blue-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Right: Org Selector + Actions */}
      <div className="flex items-center gap-3">
        {/* Organization Selector (Super Admin only) */}
        {isSuperAdmin && organizations.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowOrgMenu(!showOrgMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <Building2 className="h-4 w-4 text-indigo-600" />
              <span className="text-sm font-medium text-slate-700 max-w-[150px] truncate">
                {currentOrg?.name || 'Kurum Seç'}
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            {showOrgMenu && (
              <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-slate-200 bg-white py-1 shadow-lg max-h-80 overflow-auto z-50">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-xs font-medium text-slate-500 uppercase">Kurum Seçin</p>
                </div>
                {organizations.map(org => (
                  <button
                    key={org.id}
                    onClick={() => switchOrganization(org)}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-slate-50 ${
                      currentOrg?.id === org.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
                    }`}
                  >
                    <div className={`h-6 w-6 rounded flex items-center justify-center text-xs font-bold ${
                      currentOrg?.id === org.id ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {org.name.charAt(0)}
                    </div>
                    <span className="truncate">{org.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current Org Badge (Non-super admin) */}
        {!isSuperAdmin && currentOrg && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-medium text-indigo-700 max-w-[150px] truncate">
              {currentOrg.name}
            </span>
          </div>
        )}

        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </Link>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
          >
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
              isSuperAdmin ? 'bg-red-100' : isOrgAdmin ? 'bg-purple-100' : 'bg-blue-100'
            }`}>
              {isSuperAdmin ? (
                <Shield className="h-4 w-4 text-red-600" />
              ) : (
                <User className="h-4 w-4 text-blue-600" />
              )}
            </div>
            <div className="hidden text-left md:block">
              <p className="text-sm font-medium text-slate-900">
                {userInfo?.name || userInfo?.email?.split('@')[0] || 'Kullanıcı'}
              </p>
              <p className={`text-xs px-1.5 py-0.5 rounded ${roleColors[userInfo?.role || 'user']}`}>
                {roleNames[userInfo?.role || 'user']}
              </p>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg z-50">
              {/* User Info */}
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-900">{userInfo?.name || '-'}</p>
                <p className="text-xs text-slate-500">{userInfo?.email}</p>
              </div>

              {/* Super Admin Links */}
              {isSuperAdmin && (
                <>
                  <Link
                    href="/super-admin/organizations"
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Building2 className="h-4 w-4" />
                    <span>Kurum Yönetimi</span>
                  </Link>
                  <Link
                    href="/super-admin/users"
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <User className="h-4 w-4" />
                    <span>Tüm Kullanıcılar</span>
                  </Link>
                  <div className="border-t border-slate-100 my-1" />
                </>
              )}

              {/* Org Admin Link */}
              {(isSuperAdmin || isOrgAdmin) && (
                <Link
                  href="/admin/users"
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  onClick={() => setShowUserMenu(false)}
                >
                  <User className="h-4 w-4" />
                  <span>Kullanıcı Yönetimi</span>
                </Link>
              )}

              <Link
                href="/settings"
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => setShowUserMenu(false)}
              >
                <Settings className="h-4 w-4" />
                <span>Ayarlar</span>
              </Link>
              
              <div className="border-t border-slate-100 my-1" />
              
              <button 
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                <span>Çıkış Yap</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
