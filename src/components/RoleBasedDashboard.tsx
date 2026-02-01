'use client';

import { useAuth } from '@/lib/auth-context';

interface RoleBasedDashboardProps {
  adminContent: React.ReactNode;
  managerContent: React.ReactNode;
  userContent: React.ReactNode;
}

export default function RoleBasedDashboard({ 
  adminContent, 
  managerContent, 
  userContent 
}: RoleBasedDashboardProps) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  const role = profile?.role;

  // Super Admin veya Admin
  if (role === 'super_admin' || role === 'admin') {
    return <>{adminContent}</>;
  }

  // Manager
  if (role === 'manager') {
    return <>{managerContent}</>;
  }

  // Normal User
  return <>{userContent}</>;
}

// Rol kontrolü için yardımcı fonksiyonlar
export function useRole() {
  const { profile } = useAuth();
  
  return {
    role: profile?.role || 'user',
    isSuperAdmin: profile?.role === 'super_admin',
    isAdmin: profile?.role === 'admin' || profile?.role === 'super_admin',
    isManager: profile?.role === 'manager',
    isUser: profile?.role === 'user',
    canViewAllData: profile?.role === 'super_admin' || profile?.role === 'admin',
    canViewTeamData: profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'manager',
  };
}
