'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User, Settings, ChevronDown, Menu } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
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

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="relative z-30 flex h-[60px] items-center justify-between border-b border-line bg-surface/[0.88] px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={openMobileNav}
          className="rounded-[10px] p-2 text-muted transition-colors hover:bg-surface-header hover:text-ink lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="badge-neutral hidden sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span>Platform Active</span>
          <span className="text-muted">·</span>
          <span className="font-mono text-accent">v2.4.0</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <ThemeToggle />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 rounded-[10px] p-1.5 transition-colors hover:bg-surface-header"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-btn-text">
              {user?.name?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold text-ink">{user?.name || 'Super Admin'}</p>
              <p className="text-xs text-muted">Platform Root</p>
            </div>
            <ChevronDown className="h-3 w-3 text-muted" />
          </button>

          {showUserMenu && (
            <div className="card absolute right-0 top-full z-50 mt-2 w-48 py-1">
              <button
                onClick={() => {
                  router.push('/settings');
                  setShowUserMenu(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink transition-colors hover:bg-surface-header"
              >
                <User className="h-4 w-4" />
                Profile
              </button>
              <button
                onClick={() => {
                  router.push('/settings');
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
