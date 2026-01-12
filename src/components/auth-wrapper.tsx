
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

    if (!isAuth) {
      if (!onLoginPage) {
        router.push('/login');
      }
      return;
    }

    // At this point, user is authenticated
    const role = userProfile?.role;
    const isTenantDashboard = pathname.startsWith('/tenant/dashboard');
    const isLandlordDashboard = pathname.startsWith('/landlord/dashboard');

    if (role === 'tenant') {
      if (!isTenantDashboard) {
        router.push('/tenant/dashboard');
      }
    } else if (role === 'landlord') {
      if (!isLandlordDashboard) {
        router.push('/landlord/dashboard');
      }
    } else { // Admin or other roles
      if (onLoginPage || isTenantDashboard || isLandlordDashboard) {
        router.push('/dashboard');
      }
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
