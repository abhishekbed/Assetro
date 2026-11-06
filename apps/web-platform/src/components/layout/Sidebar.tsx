'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { useUiStore } from '@/store/ui.store';
import { BrandMark } from '@/components/BrandMark';
import {
  LayoutDashboard,
  PieChart,
  Coins,
  ShieldCheck,
  Fingerprint,
  ArrowLeftRight,
  Send,
  Clock,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Loaded client-only so wagmi hooks don't run during SSR
const VestingNavItem = dynamic(() => import('./VestingNavItem'), { ssr: false });

const navItems = [
  { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/portfolio',    label: 'Portfolio',    icon: PieChart },
  { href: '/tokens',       label: 'Tokens',       icon: Coins },
  { href: '/transfer',     label: 'Transfer',     icon: Send },
  // /vesting inserted here dynamically by VestingNavItem when investor has schedules
  { href: '/kyc',          label: 'KYC',          icon: ShieldCheck },
  { href: '/identity',     label: 'Identity',     icon: Fingerprint },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/documents',    label: 'Documents',    icon: FileText },
  { href: '/settings',     label: 'Settings',     icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const mobileNavOpen = useUiStore((st) => st.mobileNavOpen);
  const closeMobileNav = useUiStore((st) => st.closeMobileNav);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  return (
    <>
    {mobileNavOpen && (
      <div
        className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        onClick={closeMobileNav}
        aria-hidden="true"
      />
    )}
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-40 flex h-screen flex-col border-r border-line bg-surface transition-all duration-300',
        'lg:static lg:z-20 lg:translate-x-0',
        mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        collapsed ? 'w-64 lg:w-16' : 'w-64'
      )}
    >
      <div className="flex h-[60px] items-center justify-between border-b border-line px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2 text-[18px] font-extrabold text-ink">
            <BrandMark size={30} />
            <span className="leading-none">
              Assetro
              <small className="mt-[-3px] block text-[9px] font-semibold tracking-[0.1em] text-muted">
                INVESTOR
              </small>
            </span>
          </Link>
        )}
        <button
          onClick={closeMobileNav}
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-header hover:text-ink lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:block rounded-md p-1.5 text-muted transition-colors hover:bg-surface-header hover:text-ink"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={clsx(
                'flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-[13px] font-semibold transition-colors',
                isActive
                  ? 'border-transparent bg-accent-soft text-accent'
                  : 'border-transparent text-muted hover:bg-surface-header hover:text-ink',
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={clsx('h-5 w-5 flex-shrink-0', isActive ? 'text-accent' : 'text-muted')} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
        {/* Vesting — only shown when investor has active schedules */}
        <VestingNavItem collapsed={collapsed} isActive={pathname === '/vesting'} />
      </nav>

      <div className="border-t border-line p-3">
        {!collapsed && (
          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            ERC-3643 · {process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID === '5042002' ? 'ARC TESTNET' : 'SEPOLIA'}
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
