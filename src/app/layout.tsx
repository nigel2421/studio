
import type { Metadata } from 'next';
import { PT_Sans } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/hooks/useAuth';
import { PageLoader } from '@/components/page-loader';
import { LoadingProvider } from '@/hooks/useLoading';
import { cn } from '@/lib/utils';

const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-pt-sans',
});

export const metadata: Metadata = {
  title: 'Eracov Properties',
  description: 'Property Management Simplified',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn('font-body antialiased', ptSans.variable)}
        suppressHydrationWarning
      >
        <AuthProvider>
          <LoadingProvider>
            <PageLoader />
            {children}
          </LoadingProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
