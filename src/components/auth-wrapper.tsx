'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// Define allowed routes for each role
const ADMIN_AGENT_ROUTES = [
    '/dashboard', '/accounts', '/tenants', '/properties', '/maintenance',
    '/documents', '/clients', '/landlords', '/airbnb', '/users', '/logs', '/communications',
    '/water-meter/add'
];
const INVESTMENT_CONSULTANT_ROUTES = ['/dashboard', '/properties', '/tenants', '/documents', '/clients', '/landlords'];
const TENANT_ROUTES = ['/tenant/dashboard', '/tenant/maintenance', '/tenant/documents'];
const LANDLORD_ROUTES = ['/landlord/dashboard'];
const HOMEOWNER_ROUTES = ['/owner/dashboard'];

// Helper function to check if a path is allowed for a given set of routes
const isPathAllowed = (pathname: string, allowedRoutes: string[]) => {
    return allowedRoutes.some(route => pathname.startsWith(route));
};


export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuth, userProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) {
      return; 
    }

    const onLoginPage = pathname === '/login';

    if (!isAuth && !onLoginPage) {
      router.push('/login');
      return;
    }

    if (isAuth) {
      const role = userProfile?.role;
      let targetDashboard = '/dashboard';
      let allowedRoutes: string[] = [];

      switch (role) {
          case 'admin':
          case 'agent':
          case 'water-meter-reader': // Assuming they share admin dashboard for simplicity
              allowedRoutes = ADMIN_AGENT_ROUTES;
              targetDashboard = '/dashboard';
              break;
          case 'investment-consultant':
              allowedRoutes = INVESTMENT_CONSULTANT_ROUTES;
              targetDashboard = '/dashboard';
              break;
          case 'tenant':
              allowedRoutes = TENANT_ROUTES;
              targetDashboard = '/tenant/dashboard';
              break;
          case 'landlord':
              allowedRoutes = LANDLORD_ROUTES;
              targetDashboard = '/landlord/dashboard';
              break;
          case 'homeowner':
              allowedRoutes = HOMEOWNER_ROUTES;
              targetDashboard = '/owner/dashboard';
              break;
          default:
              allowedRoutes = [];
              targetDashboard = '/login'; // Or some error page
              break;
      }
      
      // Redirect logged-in users away from the login page
      if (onLoginPage) {
          router.push(targetDashboard);
          return;
      }
      
      // If user is not on a route they are allowed to see, redirect them.
      if (pathname && allowedRoutes.length > 0 && !isPathAllowed(pathname, allowedRoutes)) {
          console.warn(`Redirecting user with role '${role}' from unallowed path '${pathname}' to '${targetDashboard}'`);
          router.push(targetDashboard);
          return;
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
