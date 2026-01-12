
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
    // 1. Wait until authentication status is fully resolved.
    if (isLoading) {
      return;
    }

    const onLoginPage = pathname === '/login';

    // 2. If user is not authenticated, redirect to login page if they are not already there.
    if (!isAuth) {
      if (!onLoginPage) {
        router.push('/login');
      }
      return;
    }

    // 3. At this point, the user is authenticated. We need to check their role.
    // If userProfile is still loading for the authenticated user, wait.
    if (!userProfile) {
        return;
    }

    const role = userProfile.role;
    const isTenantDashboard = pathname.startsWith('/tenant/dashboard');
    const isLandlordDashboard = pathname.startsWith('/landlord/dashboard');

    // 4. Perform role-based redirects.
    if (role === 'tenant') {
      // Tenants must be on their dashboard.
      if (!isTenantDashboard) {
        router.push('/tenant/dashboard');
      }
    } else if (role === 'landlord') {
      // Landlords must be on their dashboard.
      if (!isLandlordDashboard) {
        router.push('/landlord/dashboard');
      }
    } else { 
      // Admin or other roles should be redirected from login and role-specific dashboards.
      if (onLoginPage || isTenantDashboard || isLandlordDashboard) {
        router.push('/dashboard');
      }
    }

  }, [isLoading, isAuth, userProfile, pathname, router]);

  // Display a loading spinner while authentication is in progress or if a redirect is imminent.
  if (isLoading || (!isAuth && pathname !== '/login')) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Render the requested page once all checks are passed.
  return <>{children}</>;
}
