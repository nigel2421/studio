
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useEffect, useState } from 'react';
import { Loader } from 'lucide-react';
import { getUserProfile } from '@/lib/data';
import { UserProfile } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuth, userProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuth) {
      if (pathname !== '/login') {
        router.push('/login');
      }
      return;
    }

    // If we are here, user is authenticated (isAuth is true)
    const isTenant = userProfile?.role === 'tenant';
    const isTenantRoute = pathname.startsWith('/tenant');
    const isAdminRoute = !isTenantRoute;
    const onLoginPage = pathname === '/login';

    if (onLoginPage) {
      if (isTenant) {
        router.push('/tenant/dashboard');
      } else {
        router.push('/dashboard');
      }
    } else if (isTenant && isAdminRoute) {
      // Tenant trying to access admin pages
      router.push('/tenant/dashboard');
    } else if (!isTenant && isTenantRoute) {
      // Admin trying to access tenant pages
      router.push('/dashboard');
    }

  }, [isLoading, isAuth, userProfile, pathname, router]);

  if (isLoading || (!isAuth && pathname !== '/login')) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
