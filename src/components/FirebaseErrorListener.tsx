'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';

export function FirebaseErrorListener() {
  useEffect(() => {
    const handlePermissionError = (error: any) => {
      // In development, Next.js will catch this unhandled exception and show the overlay.
      // This is crucial for providing contextual debugging info to the agent.
      throw error;
    };

    const unsubscribe = errorEmitter.on(handlePermissionError);

    return () => {
      unsubscribe();
    };
  }, []);

  return null;
}
