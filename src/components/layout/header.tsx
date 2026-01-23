
'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { usePathname } from 'next/navigation';

const titleMap: { [key: string]: string } = {
  '/dashboard': 'Dashboard',
  '/tenants': 'Tenants',
  '/accounts': 'Accounts',
  '/maintenance': 'Maintenance Requests',
  '/properties': 'Properties',
  '/documents': 'Documents',
  '/clients': 'Client Properties',
  '/landlords': 'Landlords',
  '/airbnb': 'Airbnb',
  '/logs': 'Activity Logs',
  '/users': 'User Management',
  '/communications': 'Communications',
  '/tenant/dashboard': 'Dashboard',
  '/tenant/maintenance': 'Maintenance',
  '/tenant/documents': 'Documents',
};

export function AppHeader() {
  const pathname = usePathname() || '/';
  // Normalize path by removing trailing slash (except for base /)
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  const title = titleMap[normalizedPath] || 'Eracov Properties';

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      </div>
    </header>
  );
}
