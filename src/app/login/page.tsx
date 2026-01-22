
'use client';

import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { logActivity } from '@/lib/data';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Lock, ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { isAuth, userProfile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuth) {
      if (userProfile?.role === 'tenant') {
        router.push('/tenant/dashboard');
      } else if (userProfile?.role === 'landlord') {
        router.push('/landlord/dashboard');
      } else if (userProfile?.role === 'homeowner') {
        router.push('/owner/dashboard');
      } else {
        router.push('/dashboard');
      }
    }
  }, [isAuth, isLoading, userProfile, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      await logActivity('User login');
      // Redirection is handled by the useEffect hook.
    } catch (error: any) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setError('Incorrect email or password. Please try again.');
      } else if (error.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('An error occurred during login. Please try again later.');
      }
      setIsLoggingIn(false);
    }
  };

  if (isLoading || isAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Left Side: Hero / Brand Area */}
      <div
        className="hidden lg:flex w-1/2 relative flex-col justify-between p-12 text-white bg-slate-900 border-r border-slate-800"
      >
        {/* Background Gradient/Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900 via-slate-900 to-black z-0" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 z-0 mix-blend-overlay"></div>

        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white">E</div>
            <span className="text-xl font-bold tracking-tight">Eracov Properties</span>
          </div>
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight mb-4">
            Property Management, <br />
            <span className="text-blue-400">Simplified & Centralized.</span>
          </h1>
          <p className="text-lg text-slate-300 max-w-md">
            The complete solution for property managers, landlords, and residents. Access your portfolio and manage operations seamlessly.
          </p>
        </div>

        <div className="relative z-10 text-sm text-slate-400">
          © {new Date().getFullYear()} Eracov Properties. All rights reserved.
        </div>
      </div>

      {/* Right Side: Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-12 relative">
        <div
          className="w-full max-w-md space-y-8"
        >
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Please enter your details to sign in to your account.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 h-11"
                    disabled={isLoggingIn}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {/* Optional: Add Forgot Password link here */}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 h-11"
                    disabled={isLoggingIn}
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              {error && (
                <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-md">
                  {error}
                </div>
              )}
            </div>

            <Button
              className="w-full h-11 text-base font-medium shadow-lg shadow-blue-500/20"
              type="submit"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="px-8 text-center text-sm text-muted-foreground">
            <a href="#" className="underline underline-offset-4 hover:text-primary">
              Contact Support
            </a>
            {" "} if you are having trouble access your account.
          </p>
        </div>
      </div>
    </div>
  );
}
