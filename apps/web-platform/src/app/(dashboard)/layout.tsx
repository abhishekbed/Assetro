'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { WalletLinkSync } from '@/components/wallet/WalletLinkSync';
import { RequireRole } from '@/components/auth/RequireRole';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole portal="investor">
      <div className="fixed inset-0 flex overflow-hidden bg-surface">
        <WalletLinkSync />
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <main className="min-w-0 flex-1 overflow-auto bg-surface p-4 sm:p-6 scrollbar-thin">
            <div className="w-full min-w-0">{children}</div>
          </main>
        </div>
      </div>
    </RequireRole>
  );
}
