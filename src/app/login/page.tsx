
'use client';

import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { logActivity, createUserProfile } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Loader } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { toast } = useToast();
  const { isAuth, userProfile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuth) {
      if (userProfile?.role === 'tenant') {
        router.push('/tenant/dashboard');
      } else if (userProfile?.role === 'landlord') {
        router.push('/landlord/dashboard');
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
        setError('Incorrect email or password. If you are an administrator and do not have an account, please use the Sign Up option.');
      } else if (error.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Failed to log in. Please try again later.');
      }
      setIsLoggingIn(false);
    }
  };
  
  const handleSignUp = async () => {
    setError(null);
    setIsLoggingIn(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const name = userCredential.user.email?.split('@')[0] || 'Admin';
      await createUserProfile(userCredential.user.uid, userCredential.user.email || email, 'admin', { name });
      toast({
        title: 'Sign Up Successful',
        description: 'You can now log in with the credentials you just created.',
      });
    } catch (error: any) {
       if (error.code === 'auth/email-already-in-use') {
        setError('This email is already in use. Try logging in instead.');
       } else if (error.code === 'auth/invalid-email') {
        setError('Please enter a valid email address to sign up.');
       } else if (error.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
       }
       else {
        setError('Failed to sign up. Please try again later.');
      }
    } finally {
        setIsLoggingIn(false);
    }
  };

  if (isLoading || isAuth) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader className="h-8 w-8 animate-spin" />
      </div>
    );
  }


  return (
    <div className="flex h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Eracov Properties</h1>
            <p className="text-gray-500 dark:text-gray-400">Welcome Back</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:ring-blue-200 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              required
              disabled={isLoggingIn}
            />
          </div>
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:ring-blue-200 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              required
              disabled={isLoggingIn}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex flex-col space-y-2">
            <button
              type="submit"
              className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? <Loader className="mx-auto h-5 w-5 animate-spin" /> : 'Login'}
            </button>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              No admin account?{' '}
              <button
                type="button"
                onClick={handleSignUp}
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Sign Up
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
