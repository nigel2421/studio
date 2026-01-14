
'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export function PageLoader() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    // Don't run on initial load
    if (pathname) {
      // Start loading
      setIsVisible(true);
      setProgress(30);

      // Simulate loading progress
      timer = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) {
            clearInterval(timer);
            return prev;
          }
          return prev + 5;
        });
      }, 200);
    }
    
    return () => {
        clearInterval(timer);
    };
  }, [pathname]);

  useEffect(() => {
    // This effect runs after the component re-renders with the new page content
    // We can assume loading is complete here.
    let timer: NodeJS.Timeout;
    if (isVisible) {
      setProgress(100);
      timer = setTimeout(() => {
        setIsVisible(false);
        // Reset progress after fade out
        setTimeout(() => setProgress(0), 500);
      }, 500);
    }
    
    return () => {
        clearTimeout(timer);
    }
  }, [pathname]); // This might need adjustment based on how Next.js suspense works

  return (
    <div className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-opacity duration-500",
        isVisible ? 'opacity-100' : 'opacity-0'
      )}>
      <Progress value={progress} className="h-1 rounded-none" />
    </div>
  );
}
