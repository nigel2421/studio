
'use client';

import { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserProfile, createUserProfile } from '@/lib/data';
import { UserProfile, UserRole } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isAuth: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsLoading(true);
      setUser(user);
      if (user) {
        let profile = await getUserProfile(user.uid);
        if (!profile) {
          // User exists in Auth, but not in Firestore. Create a profile.
          // This is for users added manually via the Firebase console.
          try {
            // Default role for manually added users. Admins can then elevate them.
            const defaultRole: UserRole = 'viewer';
            await createUserProfile(user.uid, user.email!, defaultRole);
            // Re-fetch the newly created profile
            profile = await getUserProfile(user.uid);
          } catch (error) {
            console.error("Failed to create user profile on-the-fly:", error);
            profile = null;
          }
        }
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const isAuth = !!user;

  return (
    <AuthContext.Provider value={{ user, userProfile, isLoading, isAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
