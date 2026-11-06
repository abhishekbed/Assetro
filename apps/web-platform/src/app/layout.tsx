import type { Metadata } from 'next';
import './globals.css';
import { WalletProvider } from '@/providers/WalletProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { Suspense } from 'react';
import { NavigationProgress } from '@/components/NavigationProgress';
import { Toaster } from 'sonner';

const inter = {
  className: 'font-sans',
  style: { fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
};

export const metadata: Metadata = {
  title: 'Assetro - Tokenization Platform',
  description: 'Invest in, issue and administer tokenized real-world assets',
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
          <WalletProvider>
            <AuthProvider>{children}</AuthProvider>
          </WalletProvider>
          <Toaster
            position="top-right"
            richColors
            closeButton
            duration={5000}
            toastOptions={{
              style: { fontFamily: inter.style.fontFamily },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
