'use client';

import type { ReactNode } from 'react';
import { AppSidebar } from '@/components/layout/sidebar';
import { AppHeader } from '@/components/layout/header';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AuthWrapper from '@/components/auth-wrapper';
import { usePathname } from 'next/navigation';

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPropertyManagementPage = /^\/properties\/[^/]+$/.test(pathname || '') && !(pathname || '').endsWith('/add');
  const isEditPropertyPage = /^\/properties\/edit\/[^/]+$/.test(pathname || '');

  // Hide default header on the new property management page
  const showHeader = !isPropertyManagementPage && !isEditPropertyPage;

  return (
    <AuthWrapper>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {showHeader && <AppHeader />}
          <div className="min-h-[calc(100vh-4rem)] w-full">
            {/* Remove padding on the new property management page */}
            <main className={!isPropertyManagementPage && !isEditPropertyPage ? "p-4 sm:p-6 lg:p-8" : ""}>{children}</main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AuthWrapper>
  );
}
