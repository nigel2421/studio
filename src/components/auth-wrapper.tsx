
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
      return; 
    }

    const onLoginPage = pathname === '/login';
    const isLandlordDashboard = pathname.startsWith('/landlord/');
    const isTenantDashboard = pathname.startsWith('/tenant/');
    const isOwnerDashboard = pathname.startsWith('/owner/');

    if (!isAuth && !onLoginPage) {
      router.push('/login');
      return;
    }

    if (isAuth) {
      if (onLoginPage) {
        // If logged in and on login page, redirect to appropriate dashboard
        if (userProfile?.role === 'landlord') {
          router.push('/landlord/dashboard');
        } else if (userProfile?.role === 'tenant') {
          router.push('/tenant/dashboard');
        } else if (userProfile?.role === 'homeowner') {
          router.push('/owner/dashboard');
        } else {
          router.push('/dashboard');
        }
      } else {
        // If logged in but on the wrong dashboard, redirect
        if (userProfile?.role === 'landlord' && !isLandlordDashboard) {
          router.push('/landlord/dashboard');
        } else if (userProfile?.role === 'tenant' && !isTenantDashboard) {
          router.push('/tenant/dashboard');
        } else if (userProfile?.role === 'homeowner' && !isOwnerDashboard) {
          router.push('/owner/dashboard');
        } else if ((userProfile?.role === 'admin' || userProfile?.role === 'agent') && (isLandlordDashboard || isTenantDashboard || isOwnerDashboard)) {
          router.push('/dashboard');
        }
      }
    }
  }, [isLoading, isAuth, userProfile, pathname, router]);

  // Show a loader while authentication is in progress or if a redirect is imminent.
  if (isLoading || (!isAuth && pathname !== '/login')) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Render the requested page if authentication is complete and no redirect is needed.
  return <>{children}</>;
}
