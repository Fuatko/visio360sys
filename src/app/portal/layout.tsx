'use client';

import { usePathname } from 'next/navigation';
import PortalShell from '@/components/portal/PortalShell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/portal/kayit') return <>{children}</>;
  return <PortalShell>{children}</PortalShell>;
}
