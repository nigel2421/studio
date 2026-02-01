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

    // 1. Handle not logged in: If not authenticated and not on login page, redirect to login.
    if (!isAuth && !onLoginPage) {
      router.push('/login');
      return;
    }

    // 2. Handle logged in on login page: Redirect to the correct dashboard.
    if (isAuth && onLoginPage) {
      const role = userProfile?.role;
      if (role === 'landlord') {
        router.push('/landlord/dashboard');
      } else if (role === 'tenant') {
        router.push('/tenant/dashboard');
      } else if (role === 'homeowner') {
        router.push('/owner/dashboard');
      } else {
        router.push('/dashboard');
      }
      return;
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
