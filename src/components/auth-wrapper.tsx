
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
    if (isLoading) {
      return; // Do nothing while loading
    }

    const onLoginPage = pathname === '/login';
    const isTenantRoute = pathname.startsWith('/tenant/');
    const isLandlordDashboardRoute = pathname === '/landlord/dashboard';
    const isTenant = userProfile?.role === 'tenant';
    const isLandlord = userProfile?.role === 'landlord';

    if (isAuth) {
      if (onLoginPage) {
        // If authenticated and on login page, redirect to the correct dashboard
        let redirectTo = '/dashboard';
        if (isTenant) redirectTo = '/tenant/dashboard';
        if (isLandlord) redirectTo = '/landlord/dashboard';
        window.location.href = redirectTo;
      } else if (isTenant && !isTenantRoute) {
        // If tenant is on a non-tenant route, redirect
        router.push('/tenant/dashboard');
      } else if (isLandlord && !isLandlordDashboardRoute) {
        // If landlord is on a non-landlord route, redirect
        router.push('/landlord/dashboard');
      } else if (!isTenant && !isLandlord && (isTenantRoute || isLandlordDashboardRoute)) {
        // If admin/other is on a tenant or landlord route, redirect to admin dashboard
        router.push('/dashboard');
      }
    } else {
      // If not authenticated, redirect to login page (unless already there)
      if (!onLoginPage) {
        router.push('/login');
      }
    }
  }, [isLoading, isAuth, userProfile, pathname, router]);

  // Show loader while we are determining auth state or about to redirect
  if (isLoading || (!isAuth && pathname !== '/login')) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If authenticated and on login page, show loader during redirect
  if (isAuth && pathname === '/login') {
    return (
      <div className="flex h-screen items-center justify-center">
          <Loader className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
