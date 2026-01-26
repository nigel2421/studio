
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

    const onLoginPage = (pathname || '') === '/login';

    // 1. Handle not logged in
    if (!isAuth && !onLoginPage) {
      router.push('/login');
      return;
    }

    if (isAuth) {
      const role = userProfile?.role;
      const isAdminType = role && ['admin', 'agent', 'viewer', 'water-meter-reader', 'investment-consultant'].includes(role);
      
      // These are the *dashboards* for specific roles, not the admin management pages
      const isLandlordDashboard = (pathname || '').startsWith('/landlord/');
      const isTenantDashboard = (pathname || '').startsWith('/tenant/');
      const isOwnerDashboard = (pathname || '').startsWith('/owner/');
      const isRoleSpecificDashboard = isLandlordDashboard || isTenantDashboard || isOwnerDashboard;

      // 2. Handle logged in on login page
      if (onLoginPage) {
        if (role === 'landlord') router.push('/landlord/dashboard');
        else if (role === 'tenant') router.push('/tenant/dashboard');
        else if (role === 'homeowner') router.push('/owner/dashboard');
        else router.push('/dashboard');
        return;
      }
      
      // 3. Handle role-based routing
      if (isAdminType && isRoleSpecificDashboard) {
          router.push('/dashboard'); // Admins shouldn't be on role-specific dashboards
      } else if (role === 'landlord' && !isLandlordDashboard) {
          router.push('/landlord/dashboard'); // Landlords should ONLY be on their dashboard
      } else if (role === 'tenant' && !isTenantDashboard) {
          router.push('/tenant/dashboard'); // Tenants should ONLY be on their dashboard
      } else if (role === 'homeowner' && !isOwnerDashboard) {
          router.push('/owner/dashboard'); // Homeowners should ONLY be on their dashboard
      }
    }
  }, [isLoading, isAuth, userProfile, pathname, router]);

  // Show a loader while authentication is in progress or if a redirect is imminent.
  if (isLoading || (!isAuth && (pathname || '') !== '/login')) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Render the requested page if authentication is complete and no redirect is needed.
  return <>{children}</>;
}
