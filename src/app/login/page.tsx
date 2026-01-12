
'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { createUserProfile, logActivity } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { isAuth } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // Log activity after successful sign-in
      await logActivity('User login');
      // On successful login, AuthWrapper will handle redirection.
      // A hard refresh can help ensure the correct context is loaded.
      window.location.href = '/'; 
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        setError('No user found with this email. You can sign up instead.');
      } else if (error.code === 'auth/wrong-password') {
        setError('Incorrect password. Please try again.');
      } else if (error.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Failed to log in. Please try again later.');
      }
      console.error(error);
    }
  };

  const handleSignUp = async () => {
    setError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const name = userCredential.user.email?.split('@')[0] || 'Admin';
      await createUserProfile(userCredential.user.uid, userCredential.user.email || email, 'admin', { name });
      await logActivity(`Admin user created: ${email}`);
      toast({
        title: 'Sign Up Successful',
        description: 'You can now log in with the credentials you just created.',
      });
      // Force reload and redirect after sign up
      window.location.href = '/dashboard';
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
      console.error(error);
    }
  };

  if (isAuth) {
      return null; // Don't render the form if the user is already authenticated and waiting for redirect.
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
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex flex-col space-y-2">
            <button
              type="submit"
              className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Login
            </button>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              No account?{' '}
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
