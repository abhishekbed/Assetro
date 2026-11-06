'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Search, User, Settings, LogOut, ChevronDown, Check, CheckCircle, XCircle, Coins, Snowflake, Calendar, AlertCircle, Menu } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '@/store/auth.store';
import { disconnectWallet } from '@/lib/wallet-disconnect';
import { ConnectWallet } from '@/components/wallet/ConnectWallet';
import { useUiStore } from '@/store/ui.store';
import { ThemeToggle } from '@/components/ThemeToggle';
import api from '@/lib/api';

interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  channel: string;
  category?: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

function NotifIcon({ notification }: { notification: Notification }) {
  const cat = notification.category ?? '';
  const title = notification.title?.toLowerCase() ?? '';

  if (cat === 'payment' || title.includes('mint') || title.includes('token')) {
    return <Coins className="h-4 w-4 text-success" />;
  }
  if (title.includes('approved') || title.includes('verified')) {
    return <CheckCircle className="h-4 w-4 text-success" />;
  }
  if (title.includes('rejected') || title.includes('failed')) {
    return <XCircle className="h-4 w-4 text-danger" />;
  }
  if (title.includes('frozen')) {
    return <Snowflake className="h-4 w-4 text-accent" />;
  }
  if (title.includes('corporate') || title.includes('dividend') || title.includes('voting')) {
    return <Calendar className="h-4 w-4 text-accent" />;
  }
  return <AlertCircle className="h-4 w-4 text-muted" />;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function Header() {
  const openMobileNav = useUiStore((st) => st.openMobileNav);
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get('/notifications/unread-count', {
        headers: { 'x-user-id': user.id },
      });
      setNotificationCount(res.data.count);
    } catch {
      // silently fail
    }
  }, [user?.id]);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoadingNotifications(true);
    try {
      const res = await api.get('/notifications', {
        headers: { 'x-user-id': user.id },
        params: { limit: 10 },
      });
      setNotifications(res.data.data || []);
    } catch {
      // silently fail
    } finally {
      setLoadingNotifications(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleBellClick = () => {
    const next = !showNotifications;
    setShowNotifications(next);
    if (next) {
      fetchNotifications();
    }
  };

  const handleMarkAsRead = async (id: string) => {
    if (!user?.id) return;
    try {
      await api.patch(`/notifications/${id}/read`, null, {
        headers: { 'x-user-id': user.id },
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)),
      );
      setNotificationCount((c) => Math.max(0, c - 1));
    } catch {
      // silently fail
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.id) return;
    try {
      await api.patch('/notifications/read-all', null, {
        headers: { 'x-user-id': user.id },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
      setNotificationCount(0);
    } catch {
      // silently fail
    }
  };

  const handleLogout = async () => {
    await disconnectWallet();
    logout();
    router.push('/investor/login');
  };

  return (
    <header className="relative z-30 flex h-[60px] items-center justify-between border-b border-line bg-surface/[0.88] px-4 sm:px-6 backdrop-blur-[12px]">
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
            placeholder="Search tokens, transactions..."
            className="input-field w-56 py-2 pl-10 pr-4 lg:w-80"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <ThemeToggle />
        <ConnectWallet />

        <div className="relative" ref={notifRef}>
          <button
            onClick={handleBellClick}
            className="relative rounded-[10px] p-2 text-muted transition-colors hover:bg-surface-header hover:text-ink"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="card fixed inset-x-3 top-[68px] z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h3 className="text-sm font-bold text-ink">Notifications</h3>
                {notificationCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="flex items-center gap-1 text-xs font-semibold text-accent hover:opacity-80"
                  >
                    <Check className="h-3 w-3" />
                    Mark all as read
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {loadingNotifications ? (
                  <div className="px-4 py-8 text-center text-sm text-muted">Loading...</div>
                ) : notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted">No notifications yet</div>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => {
                        if (!notification.isRead) handleMarkAsRead(notification.id);
                      }}
                      className={clsx(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-header',
                        !notification.isRead && 'bg-accent-soft',
                      )}
                    >
                      <div className="mt-0.5 flex-shrink-0 relative">
                        <NotifIcon notification={notification} />
                        {!notification.isRead && (
                          <span className="absolute -right-0.5 -top-0.5 block h-2 w-2 rounded-full bg-accent" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={clsx(
                            'truncate text-sm',
                            notification.isRead ? 'text-muted' : 'font-semibold text-ink',
                          )}
                        >
                          {notification.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{notification.message}</p>
                        <p className="mt-1 text-xs text-muted">{timeAgo(notification.createdAt)}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 rounded-[10px] p-1.5 transition-colors hover:bg-surface-header"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-btn-text">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="hidden text-left md:block">
              <p className="text-sm font-semibold text-ink">
                {user?.name || 'User'}
              </p>
              <p className="text-xs text-muted">{user?.email || ''}</p>
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
