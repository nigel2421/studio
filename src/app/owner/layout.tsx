'use client';

import type { ReactNode } from 'react';
import { OwnerSidebar } from '@/components/layout/owner-sidebar';
import { AppHeader } from '@/components/layout/header';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AuthWrapper from '@/components/auth-wrapper';

export default function OwnerAppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthWrapper>
      <SidebarProvider>
        <OwnerSidebar />
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
