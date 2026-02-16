
'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useLoading } from '@/hooks/useLoading';
import { Loader2 } from 'lucide-react';

export function PageLoader() {
  const pathname = usePathname();
  const { isLoading: isGlobalLoading, loadingText, stopLoading } = useLoading();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    // When pathname changes, it means navigation is happening or done
    if (pathname) {
      setIsVisible(true);
      setProgress(30);

      // Stop global loading because the page is now transitioning/loading via Next.js
      stopLoading();

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
  }, [pathname, stopLoading]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isVisible) {
      setProgress(100);
      timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => setProgress(0), 500);
      }, 500);
    }

    return () => {
      clearTimeout(timer);
    }
  }, [pathname, isVisible]);

  return (
    <>
      {/* Top Progress Bar */}
      <div className={cn(
        "fixed top-0 left-0 right-0 z-[60] transition-opacity duration-500",
        isVisible ? 'opacity-100' : 'opacity-0'
      )}>
        <Progress value={progress} className="h-1 rounded-none bg-transparent" />
      </div>

      {/* Immediate Loading Overlay */}
      {isGlobalLoading && (
        <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card shadow-2xl border animate-in zoom-in-95 duration-300">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
              <Loader2 className="h-12 w-12 animate-spin text-primary relative" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <h3 className="text-lg font-semibold tracking-tight">{loadingText}</h3>
              <p className="text-sm text-muted-foreground animate-pulse">Please wait a moment...</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
