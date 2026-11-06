'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Search, User, Settings, LogOut, ChevronDown, Menu } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { disconnectWallet } from '@/lib/wallet-disconnect';
import { ConnectWallet } from '@/components/issuer/wallet/ConnectWallet';
import { useUiStore } from '@/store/ui.store';
import { ThemeToggle } from '@/components/ThemeToggle';

export function Header() {
  const openMobileNav = useUiStore((st) => st.openMobileNav);
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await disconnectWallet();
    logout();
    router.push('/issuer/login');
  };

  return (
    <header className="relative z-30 flex h-[60px] items-center justify-between border-b border-line bg-surface/[0.88] px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <button
          onClick={openMobileNav}
          className="rounded-[10px] p-2 text-muted transition-colors hover:bg-surface-header hover:text-ink lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search tokens, investors..."
            className="input-field w-56 py-2 pl-10 pr-4 lg:w-80"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <ThemeToggle />
        <ConnectWallet />

        <button
          className="relative rounded-[10px] p-2 text-muted transition-colors hover:bg-surface-header hover:text-ink"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 rounded-[10px] p-1.5 transition-colors hover:bg-surface-header"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-btn-text">
              {user?.name?.charAt(0).toUpperCase() || 'I'}
            </div>
            <div className="hidden text-left md:block">
              <p className="text-sm font-semibold text-ink">{user?.name || 'Issuer'}</p>
              <p className="text-xs text-muted">{user?.email || ''}</p>
            </div>
            <ChevronDown className="h-3 w-3 text-muted" />
          </button>

          {showUserMenu && (
            <div className="card absolute right-0 top-full z-50 mt-2 w-48 py-1">
              <button
                onClick={() => {
                  router.push('/issuer/settings');
                  setShowUserMenu(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink transition-colors hover:bg-surface-header"
              >
                <User className="h-4 w-4" />
                Profile
              </button>
              <button
                onClick={() => {
                  router.push('/issuer/settings');
                  setShowUserMenu(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink transition-colors hover:bg-surface-header"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <hr className="my-1 border-line" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger-100"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
