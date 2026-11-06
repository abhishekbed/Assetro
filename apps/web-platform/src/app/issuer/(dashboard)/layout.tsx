'use client';

import { Sidebar } from '@/components/issuer/layout/Sidebar';
import { Header } from '@/components/issuer/layout/Header';
import { ApprovalGate } from '@/components/issuer/ApprovalGate';
import { RequireRole } from '@/components/auth/RequireRole';
import { useAuthStore } from '@/store/auth.store';
import { IssuerWalletProvider, IssuerWalletBanner } from '@/components/issuer/wallet/IssuerWalletProvider';

export default function IssuerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = useAuthStore((s) => s.user?.id);

  return (
    <RequireRole portal="issuer">
      <div className="fixed inset-0 flex overflow-hidden bg-surface">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <main className="min-w-0 flex-1 overflow-auto bg-surface p-4 sm:p-6 scrollbar-thin">
            <div className="w-full min-w-0">
              <ApprovalGate>
                {userId ? (
                  <IssuerWalletProvider userId={userId}>
                    <IssuerWalletBanner />
                    {children}
                  </IssuerWalletProvider>
                ) : (
                  children
                )}
              </ApprovalGate>
            </div>
          </main>
        </div>
      </div>
    </RequireRole>
  );
}
