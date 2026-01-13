
'use client';

import type { ReactNode } from 'react';
import { AppSidebar } from '@/components/layout/sidebar';
import { AppHeader } from '@/components/layout/header';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AuthWrapper from '@/components/auth-wrapper';
import { usePathname } from 'next/navigation';

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPropertyDetailPage = /^\/properties\/[^/]+$/.test(pathname) && !pathname.includes('/edit');
  const isEditPropertyPage = /^\/properties\/edit\/[^/]+$/.test(pathname);
  
  // Define paths where the standard header should be shown
  const showHeader = !['/tenants', '/properties', '/water-meter/add', '/accounts', '/airbnb', '/dashboard'].includes(pathname) 
                     && !isPropertyDetailPage 
                     && !isEditPropertyPage;
  
  return (
    <AuthWrapper>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {showHeader && <AppHeader />}
          <div className="min-h-[calc(100vh-4rem)] w-full">
              <main className={!isEditPropertyPage ? "p-4 sm:p-6 lg:p-8" : ""}>{children}</main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AuthWrapper>
  );
}
