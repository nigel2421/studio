
'use client';

import type { ReactNode } from 'react';
import { AppSidebar } from '@/components/layout/sidebar';
import { AppHeader } from '@/components/layout/header';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AuthWrapper from '@/components/auth-wrapper';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPropertyManagementPage = /^\/properties\/[^/]+$/.test(pathname || '') && !(pathname || '').endsWith('/add');
  const isEditPropertyPage = /^\/properties\/edit\/[^/]+$/.test(pathname || '');

  const showHeader = !isPropertyManagementPage && !isEditPropertyPage;

  return (
    <AuthWrapper>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {showHeader && <AppHeader />}
          <div className="min-h-[calc(100vh-4rem)] w-full">
            <main className={cn({ "p-4 sm:p-6 lg:p-8": !isPropertyManagementPage && !isEditPropertyPage })}>
              {children}
            </main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AuthWrapper>
  );
}
