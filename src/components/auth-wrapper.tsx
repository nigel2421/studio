
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuth, userProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Wait until the authentication status is fully loaded
    if (isLoading) {
      return;
    }

    const onLoginPage = pathname === '/login';

    // If user is not authenticated, redirect to login page (if not already there)
    if (!isAuth) {
      if (!onLoginPage) {
        router.push('/login');
      }
      return;
    }

    // If we are here, user IS authenticated
    const isTenant = userProfile?.role === 'tenant';
    const isTenantRoute = pathname.startsWith('/tenant');
    const isAdminRoute = !isTenantRoute && pathname !== '/login';

    if (onLoginPage) {
      // If on login page, redirect to the correct dashboard
      if (isTenant) {
        router.push('/tenant/dashboard');
      } else {
        router.push('/dashboard');
      }
    } else if (isTenant && isAdminRoute) {
      // If a tenant tries to access an admin route, redirect to their dashboard
      router.push('/tenant/dashboard');
    } else if (!isTenant && isTenantRoute) {
      // If an admin tries to access a tenant route, redirect to their dashboard
      router.push('/dashboard');
    }
    
  }, [isLoading, isAuth, userProfile, pathname, router]);

  // Show a loader while authentication is in progress OR if an unauthenticated user tries to access a protected route
  if (isLoading || (!isAuth && pathname !== '/login')) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If on login page and already authenticated, show nothing while redirecting
  if (isAuth && pathname === '/login') {
      return (
        <div className="flex h-screen items-center justify-center">
            <Loader className="h-8 w-8 animate-spin" />
        </div>
      );
  }

  return <>{children}</>;
}
