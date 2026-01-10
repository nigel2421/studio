
'use client';

import type { ReactNode } from 'react';
import { AppSidebar } from '@/components/layout/sidebar';
import { AppHeader } from '@/components/layout/header';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AuthWrapper from '@/components/auth-wrapper';
import { usePathname } from 'next/navigation';

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showHeader = !['/tenants', '/properties'].includes(pathname);
  
  return (
    <AuthWrapper>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {showHeader && <AppHeader />}
          <div className="min-h-[calc(100vh-4rem)] w-full">
              <main className="p-4 sm:p-6 lg:p-8">{children}</main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AuthWrapper>
  );
}
