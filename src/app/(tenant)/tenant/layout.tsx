
'use client';

import type { ReactNode } from 'react';
import { TenantSidebar } from '@/components/layout/tenant-sidebar';
import { AppHeader } from '@/components/layout/header';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AuthWrapper from '@/components/auth-wrapper';
import { usePathname } from 'next/navigation';

export default function TenantAppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthWrapper>
      <SidebarProvider>
        <TenantSidebar />
        <SidebarInset>
          <AppHeader />
          <div className="min-h-[calc(100vh-4rem)] w-full">
            <main className={"p-4 sm:p-6 lg:p-8"}>{children}</main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AuthWrapper>
  );
}
