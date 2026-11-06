'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Lock, Shield, Wallet, Bell, Save, Check, Loader2, Info, Link2, AlertTriangle, Unlink, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useAuthStore } from '@/store/auth.store';
import { ConnectWallet } from '@/components/wallet/ConnectWallet';
import { useWalletLink } from '@/hooks/useWalletLink';
import api from '@/lib/api';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

interface NotificationPrefs {
  emailNotifications: boolean;
  inAppNotifications: boolean;
  kycUpdates: boolean;
  transferAlerts: boolean;
  dividendAlerts: boolean;
}

const defaultNotificationPrefs: NotificationPrefs = {
  emailNotifications: true,
  inAppNotifications: true,
  kycUpdates: true,
  transferAlerts: true,
  dividendAlerts: false,
};

function loadNotificationPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return defaultNotificationPrefs;
  try {
    const stored = localStorage.getItem('assetro-notification-prefs');
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return defaultNotificationPrefs;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        checked ? 'bg-accent' : 'bg-surface-header'
      )}
    >
      <span
        className={clsx(
          'pointer-events-none absolute left-0 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200',
          checked ? 'translate-x-[21px]' : 'translate-x-[1px]'
        )}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const {
    address,
    isConnected,
    chain,
    disconnect,
  } = useWalletLink();
  const [activeTab, setActiveTab] = useState('profile');
  const [profileToast, setProfileToast] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(defaultNotificationPrefs);
  const [notifSaved, setNotifSaved] = useState(false);

  useEffect(() => {
    setNotifPrefs(loadNotificationPrefs());
  }, []);

  // Wallet → account linking happens globally (WalletLinkSync in the dashboard layout),
  // so connecting from the navbar or here behaves the same.

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      phone: '',
    },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  const onProfileSubmit = (data: ProfileForm) => {
    if (user) {
      setUser({ ...user, name: data.name });
    }
    setProfileToast(true);
    setTimeout(() => setProfileToast(false), 3000);
  };

  const onPasswordSubmit = async (data: PasswordForm) => {
    setPasswordLoading(true);
    setPasswordMsg(null);
    try {
      await api.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setPasswordMsg({ type: 'success', text: 'Password updated successfully.' });
      passwordForm.reset();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Password change is not available yet. Coming soon.';
      setPasswordMsg({ type: 'error', text: msg });
    } finally {
      setPasswordLoading(false);
    }
  };

  const updateNotifPref = (key: keyof NotificationPrefs, val: boolean) => {
    const updated = { ...notifPrefs, [key]: val };
    setNotifPrefs(updated);
    localStorage.setItem('assetro-notification-prefs', JSON.stringify(updated));
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2000);
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
        <p className="text-muted">Manage your account preferences</p>
      </div>

      {/* Toast */}
      {profileToast && (
        <div className="flex items-center gap-2 rounded-lg border border-success bg-success-100 p-3 text-sm text-success">
          <Check className="h-4 w-4" />
          Profile updated successfully.
        </div>
      )}

      <div className="flex gap-6">
        {/* Tab navigation */}
        <div className="w-48 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink hover:bg-surface-header'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1">
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="card p-6">
              <h3 className="mb-4 text-lg font-semibold text-ink">
                Profile Information
              </h3>

              {/* Read-only info */}
              <div className="mb-6 rounded-lg bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Email</span>
                  <span className="text-sm font-medium text-ink">{user?.email || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Role</span>
                  <span className="inline-flex rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent capitalize">
                    {user?.role || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">KYC Status</span>
                  <span
                    className={clsx(
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                      user?.kycStatus === 'approved' && 'bg-success-100 text-success',
                      user?.kycStatus === 'pending' && 'bg-warning-100 text-warning',
                      user?.kycStatus === 'rejected' && 'bg-danger-100 text-danger',
                      (!user?.kycStatus || user?.kycStatus === 'none') && 'bg-surface-header text-ink'
                    )}
                  >
                    {user?.kycStatus || 'none'}
                  </span>
                </div>
              </div>

              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                <div>
                  <label className="label mb-1 block">Full Name</label>
                  <input className="input-field" {...profileForm.register('name')} />
                  {profileForm.formState.errors.name && (
                    <p className="mt-1 text-xs text-danger">
                      {profileForm.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label mb-1 block">Phone (optional)</label>
                  <input type="tel" className="input-field" {...profileForm.register('phone')} />
                </div>
                <button type="submit" className="btn-primary gap-2">
                  <Save className="h-4 w-4" />
                  Save Changes
                </button>
              </form>
            </div>
          )}

          {/* SECURITY TAB */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="card p-6">
                <h3 className="mb-4 text-lg font-semibold text-ink">
                  Change Password
                </h3>
                {passwordMsg && (
                  <div
                    className={clsx(
                      'mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm',
                      passwordMsg.type === 'success'
                        ? 'border-success bg-success-100 text-success'
                        : 'border-danger bg-danger-100 text-danger'
                    )}
                  >
                    {passwordMsg.type === 'success' ? <Check className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                    {passwordMsg.text}
                  </div>
                )}
                <form
                  onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                  className="space-y-4"
                >
                  {/* Explicit username field so browsers associate password changes with this email */}
                  <input
                    type="text"
                    name="username"
                    value={user?.email || ''}
                    autoComplete="username"
                    readOnly
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <div>
                    <label className="label mb-1 block">Current Password</label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      className="input-field"
                      {...passwordForm.register('currentPassword')}
                    />
                    {passwordForm.formState.errors.currentPassword && (
                      <p className="mt-1 text-xs text-danger">
                        {passwordForm.formState.errors.currentPassword.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="label mb-1 block">New Password</label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className="input-field pr-10"
                        {...passwordForm.register('newPassword')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink transition-colors"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordForm.formState.errors.newPassword && (
                      <p className="mt-1 text-xs text-danger">
                        {passwordForm.formState.errors.newPassword.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="label mb-1 block">Confirm New Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className="input-field pr-10"
                        {...passwordForm.register('confirmPassword')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordForm.formState.errors.confirmPassword && (
                      <p className="mt-1 text-xs text-danger">
                        {passwordForm.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </div>
                  <button type="submit" className="btn-primary" disabled={passwordLoading}>
                    {passwordLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Updating...
                      </span>
                    ) : (
                      'Update Password'
                    )}
                  </button>
                </form>
              </div>

              <div className="card p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-muted" />
                    <div>
                      <h3 className="font-semibold text-ink">
                        Two-Factor Authentication
                      </h3>
                      <p className="text-sm text-muted">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted">Coming soon</span>
                    <div className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-not-allowed items-center rounded-full border border-transparent bg-surface-header opacity-50">
                      <span className="pointer-events-none absolute left-0 h-5 w-5 translate-x-[1px] rounded-full bg-white shadow-md" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WALLET TAB */}
          {activeTab === 'wallet' && (
            <div className="card p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-ink">Web3 Wallet</h3>
                  <p className="text-xs text-muted mt-0.5">
                    Your connected wallet receives tokens upon purchase.
                  </p>
                </div>
                {isConnected && (
                  <span className="badge-success flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                  </span>
                )}
              </div>

              {/* MetaMask connection status */}
              {isConnected && address ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-line bg-surface-header p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Active MetaMask Address
                      </p>
                      {chain && (
                        <span className="text-xs font-mono text-muted bg-surface px-2 py-0.5 rounded border border-line">
                          {chain.name}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-sm font-semibold text-ink break-all">
                      {address}
                    </p>
                  </div>

                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-xs text-emerald-400 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                      Dynamic Token Delivery Active
                    </p>
                    <p className="text-emerald-300/80 leading-relaxed">
                      Whenever you purchase tokens, they are delivered directly to whichever wallet is connected in MetaMask at the time of purchase. You do not need to register or lock an address — you can switch wallets in MetaMask anytime.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => disconnect()}
                      className="flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-header transition-colors"
                    >
                      <Unlink className="h-4 w-4" /> Disconnect MetaMask
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border-2 border-dashed border-line p-8 text-center space-y-2">
                    <Wallet className="mx-auto h-12 w-12 text-muted" />
                    <p className="font-medium text-ink text-sm">
                      No wallet connected
                    </p>
                    <p className="text-xs text-muted max-w-sm mx-auto">
                      Connect your MetaMask wallet when purchasing tokens. Tokens will be delivered directly to your connected wallet.
                    </p>
                  </div>
                  <ConnectWallet fullWidth />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
