
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
    // Wait until authentication status is fully resolved.
    if (isLoading) {
      return;
    }

    const onLoginPage = pathname === '/login';

    // If user is not authenticated, redirect to login page if they are not already there.
    if (!isAuth && !onLoginPage) {
        router.push('/login');
        return;
    }

    // If the user is authenticated and on the login page, redirect them based on role.
    if(isAuth && onLoginPage) {
        if(userProfile?.role === 'tenant') {
            router.push('/tenant/dashboard');
        } else if (userProfile?.role === 'landlord') {
            router.push('/landlord/dashboard');
        } else {
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
