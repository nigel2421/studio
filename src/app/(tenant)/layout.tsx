'use client';

import type { ReactNode } from 'react';
import AuthWrapper from '@/components/auth-wrapper';

export default function TenantLayout({ children }: { children: ReactNode }) {
  return (
    <AuthWrapper>
      <div className="min-h-screen w-full bg-background">
        <main>{children}</main>
      </div>
    </AuthWrapper>
  );
}
