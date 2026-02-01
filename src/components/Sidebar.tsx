'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  Target,
  Wallet,
  TrendingUp,
  Award,
  BarChart3,
  Heart,
  Layers,
  Brain,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Shield,
  UserCog,
  Package,
  FileSignature,
  ShoppingCart,
  Calendar,
  UserPlus,
  ScrollText,
  Bell,
  Swords,
  Megaphone,
  Home,
  Briefcase,
  PieChart,
  Wrench,
  Eye,
  Trophy,
  Calculator,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

// Ana Menü
const mainItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/executive', label: 'Executive Panel', icon: Shield },
  { href: '/team', label: 'Satış Ekibi', icon: Users },
  { href: '/leads', label: 'Potansiyel Müşteriler', icon: UserPlus },
  { href: '/customers', label: 'Müşteriler', icon: Building2 },
  { href: '/customer-360', label: 'Müşteri 360°', icon: Eye },
  { href: '/crm', label: 'CRM Aktiviteleri', icon: Heart },
];

// Satış Döngüsü
const salesItems = [
  { href: '/products', label: 'Ürün Kataloğu', icon: Package },
  { href: '/opportunities', label: 'Fırsatlar', icon: Target },
  { href: '/quotes', label: 'Teklifler', icon: FileSignature },
  { href: '/orders', label: 'Siparişler', icon: ShoppingCart },
  { href: '/contracts', label: 'Sözleşmeler', icon: ScrollText },
  { href: '/collections', label: 'Tahsilat', icon: Wallet },
];

// Planlama & Analiz
const planItems = [
  { href: '/calendar', label: 'Takvim', icon: Calendar },
  { href: '/targets', label: 'Hedefler', icon: TrendingUp },
  { href: '/bonus', label: 'Primler', icon: Award },
  { href: '/simulation', label: 'Prim Simülasyonu', icon: Wrench },
  { href: '/performance', label: 'Performans', icon: BarChart3 },
  { href: '/leaderboard', label: 'Liderlik Tablosu', icon: Target },
  { href: '/campaigns', label: 'Kampanyalar', icon: Megaphone },
];

// Analitik (Yeni!)
const analyticsItems = [
  { href: '/analytics/commissions', label: 'Prim Analitik', icon: Award },
  { href: '/analytics/sales', label: 'Satış Analitik', icon: TrendingUp },
  { href: '/analytics/collections', label: 'Tahsilat Analitik', icon: Wallet },
  { href: '/analytics/customers', label: 'Müşteri Takip', icon: Building2 },
];

// Araçlar
const toolItems = [
  { href: '/finance', label: 'Finans Paneli', icon: PieChart },
  { href: '/views', label: 'Kayıtlı Görünümler', icon: Eye },
  { href: '/swot', label: 'SWOT Analizi', icon: Layers },
  { href: '/competitors', label: 'Rakip Analizi', icon: Swords },
  { href: '/notifications', label: 'Bildirimler', icon: Bell },
  { href: '/ai', label: 'AI Asistan', icon: Brain },
  { href: '/reports', label: 'Raporlar', icon: FileText },
  { href: '/settings', label: 'Ayarlar', icon: Settings },
];

const adminItems = [
  { href: '/admin/users', label: 'Kullanıcı Yönetimi', icon: UserCog },
];

// Süper Admin Menüsü
const superAdminItems = [
  { href: '/super-admin/organizations', label: 'Kurum Yönetimi', icon: Building2 },
  { href: '/super-admin/users', label: 'Tüm Kullanıcılar', icon: Users },
];

interface MenuSectionProps {
  title: string;
  icon: any;
  items: { href: string; label: string; icon: any }[];
  isOpen: boolean;
  onToggle: () => void;
  collapsed: boolean;
  pathname: string;
  color: string;
  activeColor: string;
}

function MenuSection({ title, icon: SectionIcon, items, isOpen, onToggle, collapsed, pathname, color, activeColor }: MenuSectionProps) {
  const hasActiveItem = items.some(item => pathname === item.href);
  
  return (
    <div className="mb-1">
      {/* Section Header */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          hasActiveItem ? `${activeColor} shadow-sm` : `text-slate-600 hover:bg-slate-200`
        }`}
        title={collapsed ? title : undefined}
      >
        <SectionIcon className={`h-4 w-4 flex-shrink-0 ${hasActiveItem ? '' : 'text-slate-500'}`} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{title}</span>
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>
      
      {/* Section Items */}
      {!collapsed && isOpen && (
        <div className="mt-1 ml-3 pl-3 border-l-2 border-slate-200 space-y-1">
          {items.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all duration-200 ${
                  isActive
                    ? `${color} font-medium`
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? '' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
      
      {/* Collapsed Mode - Show items on hover */}
      {collapsed && (
        <div className="mt-1 space-y-1">
          {items.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-center rounded-lg p-2 transition-all duration-200 ${
                  isActive
                    ? `${color}`
                    : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                }`}
                title={item.label}
              >
                <Icon className="h-4 w-4" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({
    main: true,
    sales: true,
    plan: false,
    analytics: false,
    tools: false,
    admin: false,
    superAdmin: false,
  });
  
  const supabase = createClient();
  const { user } = useAuth();

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        if (user?.id) {
          const { data, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();
          if (!error && data) {
            setUserRole(data.role);
          }
        }
      } catch (err) {
        console.log('Role fetch error:', err);
      }
    };
    fetchUserRole();
  }, [user?.id]);

  // Aktif sayfaya göre ilgili menüyü otomatik aç
  useEffect(() => {
    if (mainItems.some(item => item.href === pathname)) {
      setOpenSections(prev => ({ ...prev, main: true }));
    } else if (salesItems.some(item => item.href === pathname)) {
      setOpenSections(prev => ({ ...prev, sales: true }));
    } else if (planItems.some(item => item.href === pathname)) {
      setOpenSections(prev => ({ ...prev, plan: true }));
    } else if (analyticsItems.some(item => item.href === pathname)) {
      setOpenSections(prev => ({ ...prev, analytics: true }));
    } else if (toolItems.some(item => item.href === pathname)) {
      setOpenSections(prev => ({ ...prev, tools: true }));
    } else if (adminItems.some(item => item.href === pathname)) {
      setOpenSections(prev => ({ ...prev, admin: true }));
    } else if (superAdminItems.some(item => item.href === pathname)) {
      setOpenSections(prev => ({ ...prev, superAdmin: true }));
    }
  }, [pathname]);

  const isAdmin = userRole === 'admin' || userRole === 'super_admin' || userRole === 'org_admin';
  const isSuperAdmin = userRole === 'super_admin';

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen bg-slate-100 border-r border-slate-200 shadow-sm transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b border-slate-200 px-3 bg-white">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 shadow-md">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm text-slate-800">Satış Pro</span>
              <p className="text-[10px] text-slate-500">v3.0</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-2 overflow-y-auto scrollbar-thin" style={{ maxHeight: 'calc(100vh - 120px)' }}>
        {/* Ana Menü */}
        <MenuSection
          title="Ana Menü"
          icon={Home}
          items={mainItems}
          isOpen={openSections.main}
          onToggle={() => toggleSection('main')}
          collapsed={collapsed}
          pathname={pathname}
          color="text-blue-700 bg-blue-50"
          activeColor="bg-blue-100 text-blue-700"
        />

        {/* Satış */}
        <MenuSection
          title="Satış"
          icon={Briefcase}
          items={salesItems}
          isOpen={openSections.sales}
          onToggle={() => toggleSection('sales')}
          collapsed={collapsed}
          pathname={pathname}
          color="text-emerald-700 bg-emerald-50"
          activeColor="bg-emerald-100 text-emerald-700"
        />

        {/* Planlama */}
        <MenuSection
          title="Planlama"
          icon={PieChart}
          items={planItems}
          isOpen={openSections.plan}
          onToggle={() => toggleSection('plan')}
          collapsed={collapsed}
          pathname={pathname}
          color="text-violet-700 bg-violet-50"
          activeColor="bg-violet-100 text-violet-700"
        />

        {/* Analitik */}
        <MenuSection
          title="Analitik"
          icon={BarChart3}
          items={analyticsItems}
          isOpen={openSections.analytics}
          onToggle={() => toggleSection('analytics')}
          collapsed={collapsed}
          pathname={pathname}
          color="text-cyan-700 bg-cyan-50"
          activeColor="bg-cyan-100 text-cyan-700"
        />

        {/* Araçlar */}
        <MenuSection
          title="Araçlar"
          icon={Wrench}
          items={toolItems}
          isOpen={openSections.tools}
          onToggle={() => toggleSection('tools')}
          collapsed={collapsed}
          pathname={pathname}
          color="text-amber-700 bg-amber-50"
          activeColor="bg-amber-100 text-amber-700"
        />

        {/* Admin Menüsü */}
        {isAdmin && (
          <MenuSection
            title="Admin"
            icon={Shield}
            items={adminItems}
            isOpen={openSections.admin}
            onToggle={() => toggleSection('admin')}
            collapsed={collapsed}
            pathname={pathname}
            color="text-red-700 bg-red-50"
            activeColor="bg-red-100 text-red-700"
          />
        )}

        {/* Süper Admin Menüsü */}
        {isSuperAdmin && (
          <MenuSection
            title="Süper Admin"
            icon={Shield}
            items={superAdminItems}
            isOpen={openSections.superAdmin}
            onToggle={() => toggleSection('superAdmin')}
            collapsed={collapsed}
            pathname={pathname}
            color="text-rose-700 bg-rose-50"
            activeColor="bg-rose-100 text-rose-700"
          />
        )}
      </nav>

      {/* Footer with Logout */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-slate-100 border-t border-slate-200">
        <button
          onClick={handleLogout}
          className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? 'Çıkış Yap' : undefined}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Çıkış Yap</span>}
        </button>
      </div>
    </aside>
  );
}
