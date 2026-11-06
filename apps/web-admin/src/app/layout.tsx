import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/providers/AuthProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { Suspense } from 'react';
import { NavigationProgress } from '@/components/NavigationProgress';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Assetro - Admin Console',
  description: 'Platform administration and tenant management',
  icons: {
    shortcut: '/favicon.ico',
    icon: [
      { url: '/brand/assetro-favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/brand/assetro-favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/assetro-mark.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: { url: '/brand/assetro-apple-180.png', sizes: '180x180', type: 'image/png' },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <AuthProvider>{children}</AuthProvider>
          <Toaster
            position="top-right"
            richColors
            closeButton
            duration={4000}
            toastOptions={{
              style: { fontFamily: inter.style.fontFamily },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
