'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  User,
  Building2,
  Bell,
  Shield,
  ShieldCheck,
  KeyRound,
  Wallet,
  Lock,
  Globe,
  Mail,
  Phone,
  Clock,
  Sparkles,
  CheckCircle2,
  Check,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  ExternalLink,
  Copy,
  FileText,
  Sliders,
  QrCode,
  Loader2,
  ChevronRight,
  BadgeCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { IssuerWalletCard } from '@/components/issuer/wallet/IssuerWalletProvider';

interface IssuerSettingsData {
  name: string;
  phone: string;
  timezone: string;
  companyName: string;
  companyWebsite: string;
  jurisdiction: string;
  companyRegNumber: string;
  leiNumber: string;
  contactEmail: string;
  companyDescription: string;
  // Notifications
  notifyOnTransfer: boolean;
  notifyOnContractPause: boolean;
  notifyOnKyc: boolean;
  notifyOnAccreditationExpire: boolean;
  notifyOnPayment: boolean;
  notifyOnStablecoinOrder: boolean;
  notifyOnSecurityAlerts: boolean;
  notifyOnParameterChange: boolean;
}

const DEFAULT_SETTINGS: IssuerSettingsData = {
  name: '',
  phone: '+1 (555) 382-9012',
  timezone: 'UTC',
  companyName: 'Assetro Capital Partners AG',
  companyWebsite: 'https://assetro.com',
  jurisdiction: 'Switzerland (FINMA Compliant)',
  companyRegNumber: 'CHE-298.411.890',
  leiNumber: '5493006M3VHPF4D3G871',
  contactEmail: 'compliance@assetro.com',
  companyDescription:
    'Institutional digital asset issuer specializing in ERC-3643 compliant security tokens, real estate debt instruments, and private equity syndicate facilities.',
  notifyOnTransfer: true,
  notifyOnContractPause: true,
  notifyOnKyc: true,
  notifyOnAccreditationExpire: true,
  notifyOnPayment: true,
  notifyOnStablecoinOrder: true,
  notifyOnSecurityAlerts: true,
  notifyOnParameterChange: false,
};

const STORAGE_KEY = 'assetro_issuer_settings_v2';

function loadStoredSettings(userName: string): IssuerSettingsData {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS, name: userName || 'Priya Patel' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed, name: parsed.name || userName || 'Priya Patel' };
    }
  } catch {
    // fallback
  }
  return { ...DEFAULT_SETTINGS, name: userName || 'Priya Patel' };
}

/* ─────────────────────────────────────────────────────────────────────────────
   CHANGE PASSWORD MODAL
   ─────────────────────────────────────────────────────────────────────────── */
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Strength checks
  const hasMinLength = next.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(next);
  const hasNumber = /[0-9]/.test(next);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(next);
  const passwordsMatch = next.length > 0 && next === confirm;
  const canSubmit = current.length > 0 && hasMinLength && passwordsMatch;

  const strengthScore = [hasMinLength, hasLetter, hasNumber, hasSpecial].filter(Boolean).length;
  const strengthLabel =
    next.length === 0 ? '' : strengthScore <= 1 ? 'Weak' : strengthScore === 2 ? 'Fair' : strengthScore === 3 ? 'Strong' : 'Exceptional';
  const strengthColor =
    strengthScore <= 1 ? 'bg-danger text-danger' : strengthScore === 2 ? 'bg-warning text-warning' : strengthScore === 3 ? 'bg-success text-success' : 'bg-accent text-accent';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaving(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      toast.success('Password updated successfully');
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to change password. Please verify current credentials.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-line bg-card p-6 sm:p-7 shadow-card">
        {/* Glow Accent */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent border border-accent/20">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Change Password</h2>
              <p className="text-xs text-muted">Rotate your institutional console credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-header hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Active Account Banner */}
        <div className="mt-4 rounded-xl border border-line bg-surface-header p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft border border-accent/20 text-accent font-bold text-sm">
              {(user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink truncate">
                  {user?.name || 'Administrator'}
                </span>
                <span className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                  Active User
                </span>
              </div>
              <p className="text-xs text-muted font-mono truncate">{user?.email || 'issuer@assetro.com'}</p>
            </div>
          </div>
          <ShieldCheck className="h-5 w-5 text-accent shrink-0 ml-2" />
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-subtle/30 p-3.5 text-xs text-danger">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Password */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
              Current Password
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                name="current-password"
                autoComplete="current-password"
                className="input-field pr-10"
                placeholder="Enter your existing password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                New Password
              </label>
              {strengthLabel && (
                <span className={`text-[11px] font-semibold ${strengthColor.split(' ')[1]}`}>
                  {strengthLabel}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showNext ? 'text' : 'password'}
                name="new-password"
                autoComplete="new-password"
                className={`input-field pr-10 ${
                  next && !hasMinLength ? 'border-danger focus:border-danger' : ''
                }`}
                placeholder="At least 8 characters"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowNext((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                tabIndex={-1}
              >
                {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Strength Meter Bars */}
            {next.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                <div className={`h-1.5 flex-1 rounded-full transition-all ${strengthScore >= 1 ? strengthColor.split(' ')[0] : 'bg-surface-header'}`} />
                <div className={`h-1.5 flex-1 rounded-full transition-all ${strengthScore >= 2 ? strengthColor.split(' ')[0] : 'bg-surface-header'}`} />
                <div className={`h-1.5 flex-1 rounded-full transition-all ${strengthScore >= 3 ? strengthColor.split(' ')[0] : 'bg-surface-header'}`} />
                <div className={`h-1.5 flex-1 rounded-full transition-all ${strengthScore >= 4 ? strengthColor.split(' ')[0] : 'bg-surface-header'}`} />
              </div>
            )}

            {/* Checklist */}
            <div className="mt-2.5 space-y-1.5 rounded-xl border border-line bg-surface-header p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <div className={`flex h-4 w-4 items-center justify-center rounded-full ${hasMinLength ? 'bg-success text-white' : 'bg-surface-alt text-muted'}`}>
                  {hasMinLength ? <Check className="h-2.5 w-2.5" /> : <div className="h-1 w-1 rounded-full bg-muted" />}
                </div>
                <span className={hasMinLength ? 'text-ink font-medium' : 'text-muted'}>
                  At least 8 characters
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex h-4 w-4 items-center justify-center rounded-full ${hasLetter ? 'bg-success text-white' : 'bg-surface-alt text-muted'}`}>
                  {hasLetter ? <Check className="h-2.5 w-2.5" /> : <div className="h-1 w-1 rounded-full bg-muted" />}
                </div>
                <span className={hasLetter ? 'text-ink font-medium' : 'text-muted'}>
                  Includes letters (a-z, A-Z)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex h-4 w-4 items-center justify-center rounded-full ${hasNumber || hasSpecial ? 'bg-success text-white' : 'bg-surface-alt text-muted'}`}>
                  {hasNumber || hasSpecial ? <Check className="h-2.5 w-2.5" /> : <div className="h-1 w-1 rounded-full bg-muted" />}
                </div>
                <span className={hasNumber || hasSpecial ? 'text-ink font-medium' : 'text-muted'}>
                  Includes numbers or special symbols
                </span>
              </div>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                name="confirm-password"
                autoComplete="new-password"
                className={`input-field pr-10 ${
                  confirm && !passwordsMatch ? 'border-danger focus:border-danger' : confirm && passwordsMatch ? 'border-success' : ''
                }`}
                placeholder="Re-enter your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              {confirm && passwordsMatch && next && (
                <CheckCircle2 className="absolute right-9 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
              )}
            </div>
            {confirm && !passwordsMatch && (
              <p className="mt-1 text-xs text-danger font-medium">Passwords do not match</p>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost text-xs py-2 px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="btn-primary text-xs py-2 px-5"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? 'Updating Password…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   TWO-FACTOR AUTHENTICATION (2FA) MODAL
   ─────────────────────────────────────────────────────────────────────────── */
function TwoFactorModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [qrCodeUri, setQrCodeUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .post('/auth/2fa/enable')
      .then((res) => {
        if (!active) return;
        setQrCodeUri(res.data?.qrCodeUri ?? null);
        setSecret(res.data?.secret ?? null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to initialize 2FA setup. You may already have 2FA enabled.';
        setError(msg);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCopySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true);
    toast.success('2FA Secret copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.trim().length !== 6) {
      setError('Please enter a valid 6-digit verification code.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/2fa/verify', { totpCode: totpCode.trim() });
      toast.success('Two-factor authentication successfully enabled!');
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Invalid verification code. Please check your authenticator app.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-card p-6 sm:p-7 shadow-card">
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent border border-accent/20">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Two-Factor Authentication</h2>
              <p className="text-xs text-muted">Protect your console with TOTP verification</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-header hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="mt-3 text-xs text-muted">Generating cryptographic TOTP key…</p>
          </div>
        ) : error && !qrCodeUri ? (
          <div className="my-5 rounded-xl border border-danger/30 bg-danger-subtle/30 p-4 text-xs text-danger">
            <p className="font-semibold">Setup Notice</p>
            <p className="mt-1">{error}</p>
            <div className="mt-4 flex justify-end">
              <button onClick={onClose} className="btn-secondary text-xs py-1.5 px-3">
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="mt-5 space-y-4">
            <p className="text-xs text-muted leading-relaxed">
              Scan this QR code using Google Authenticator, Authy, or 1Password, or enter the secret key manually.
            </p>

            {qrCodeUri && (
              <div className="flex justify-center rounded-xl border border-line bg-surface-header p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCodeUri} alt="2FA QR Code" className="h-44 w-44 rounded-lg bg-white p-2 shadow-sm" />
              </div>
            )}

            {secret && (
              <div className="rounded-xl border border-line bg-surface-alt p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Manual Secret Key</span>
                  <p className="font-mono text-xs font-bold text-ink select-all break-all">{secret}</p>
                </div>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-ink transition-colors"
                  title="Copy secret"
                >
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-subtle/30 p-3 text-xs text-danger">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                6-Digit Security Code
              </label>
              <input
                type="text"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="123456"
                className="input-field text-center font-mono text-lg tracking-widest"
                required
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-line pt-4">
              <button type="button" onClick={onClose} className="btn-ghost text-xs py-2 px-4">
                Cancel
              </button>
              <button
                type="submit"
                disabled={totpCode.trim().length !== 6 || submitting}
                className="btn-primary text-xs py-2 px-5"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? 'Verifying…' : 'Activate 2FA'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN SETTINGS PAGE
   ─────────────────────────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'organization' | 'wallet' | 'notifications' | 'security' | 'all'>('profile');
  const [formData, setFormData] = useState<IssuerSettingsData>(() => loadStoredSettings(user?.name || ''));
  const [savedData, setSavedData] = useState<IssuerSettingsData>(() => loadStoredSettings(user?.name || ''));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [show2faModal, setShow2faModal] = useState(false);

  // Sync with auth user on mount
  useEffect(() => {
    if (user?.name && !formData.name) {
      setFormData((prev) => ({ ...prev, name: user.name }));
      setSavedData((prev) => ({ ...prev, name: user.name }));
    }
  }, [user?.name, formData.name]);

  // Check if dirty
  const isDirty = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(savedData);
  }, [formData, savedData]);

  const updateField = <K extends keyof IssuerSettingsData>(key: K, value: IssuerSettingsData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Simulate API latency & persist in localStorage
      await new Promise((r) => setTimeout(r, 450));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
      setSavedData(formData);

      // Update auth store user display name if changed
      if (user && formData.name.trim() && user.name !== formData.name.trim()) {
        setUser({ ...user, name: formData.name.trim() });
      }

      setJustSaved(true);
      toast.success('Issuer settings saved successfully');
      setTimeout(() => setJustSaved(false), 3000);
    } catch {
      toast.error('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setFormData(savedData);
    toast.info('Changes discarded');
  };

  const handleCopyInfo = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const tabs = [
    { id: 'profile', label: 'Admin Profile', icon: User },
    { id: 'organization', label: 'Organization', icon: Building2 },
    { id: 'wallet', label: 'On-Chain Authority', icon: Wallet },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security & 2FA', icon: Shield },
    { id: 'all', label: 'All Settings', icon: Sliders },
  ] as const;

  return (
    <>
      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
      {show2faModal && <TwoFactorModal onClose={() => setShow2faModal(false)} />}

      <div className="mx-auto max-w-5xl space-y-6 pb-24">
        {/* ── Page Header & Institutional Identity ── */}
        <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-5 sm:p-7 shadow-card">
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 -bottom-24 h-56 w-56 rounded-full bg-accent/5 blur-3xl" />

          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            {/* Left: Monogram and Title */}
            <div className="flex items-start sm:items-center gap-4">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/25 via-accent/15 to-accent/5 text-accent font-black text-xl border border-accent/30 shadow-inner">
                {formData.companyName
                  .split(' ')
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join('')
                  .toUpperCase() || 'AP'}
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-card border border-line">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                </span>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-ink">
                    {formData.companyName || 'Institutional Issuer'}
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Verified Issuer
                  </span>
                </div>
                <p className="mt-1 text-xs sm:text-sm text-muted">
                  Configure administrative identity, corporate entity credentials, and ERC-3643 smart contract authority.
                </p>
              </div>
            </div>

            {/* Right: Quick Action & Badges */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className="btn-secondary text-xs py-2 px-3.5"
              >
                <KeyRound className="h-3.5 w-3.5 text-accent" />
                Password
              </button>
              <button
                type="button"
                onClick={() => setShow2faModal(true)}
                className="btn-secondary text-xs py-2 px-3.5"
              >
                <QrCode className="h-3.5 w-3.5 text-accent" />
                Setup 2FA
              </button>
            </div>
          </div>

          {/* Quick ID Strip */}
          <div className="mt-5 grid grid-cols-1 gap-2.5 pt-4 border-t border-line/80 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-xl bg-surface-header px-3 py-2 text-xs">
              <span className="text-muted">Administrator</span>
              <span className="font-semibold text-ink truncate max-w-[140px]">
                {formData.name || user?.name || 'Priya Patel'}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-surface-header px-3 py-2 text-xs">
              <span className="text-muted">Account ID</span>
              <button
                type="button"
                onClick={() => handleCopyInfo(user?.id || 'usr_issuer_9182', 'Account ID')}
                className="inline-flex items-center gap-1 font-mono font-medium text-ink hover:text-accent transition-colors"
                title="Copy ID"
              >
                <span className="truncate max-w-[110px]">{user?.id?.slice(0, 10) || 'usr_iss…9182'}</span>
                <Copy className="h-3 w-3 text-muted" />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-surface-header px-3 py-2 text-xs">
              <span className="text-muted">Tenant Scope</span>
              <button
                type="button"
                onClick={() => handleCopyInfo(user?.tenantId || 'ten_assetro_ch', 'Tenant ID')}
                className="inline-flex items-center gap-1 font-mono font-medium text-accent hover:underline"
                title="Copy Tenant ID"
              >
                <span className="truncate max-w-[110px]">{user?.tenantId || 'ten_assetro_ch'}</span>
                <Copy className="h-3 w-3 text-muted" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Navigation Tabs ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-200 ${
                  isActive
                    ? 'bg-accent text-slate-950 shadow-sm shadow-accent/20'
                    : 'bg-card text-muted hover:bg-surface-header hover:text-ink border border-line'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-slate-950' : 'text-muted'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Section 1: Administrator Profile ── */}
        {(activeTab === 'profile' || activeTab === 'all') && (
          <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-5 sm:p-7 shadow-card transition-all duration-300 hover:border-accent/30">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent border border-accent/20">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-ink">Administrator Profile</h3>
                  <p className="text-xs text-muted">Primary console user credentials and institutional permissions</p>
                </div>
              </div>
              <span className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                <ShieldCheck className="h-3.5 w-3.5" />
                Primary Admin Authority
              </span>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Full Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Priya Patel"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Work Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    className="input-field pr-10 cursor-not-allowed opacity-80 bg-surface-header"
                    value={user?.email || 'issuer@assetro.com'}
                    readOnly
                  />
                  <Lock className="absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                </div>
                <p className="mt-1 text-[11px] text-muted">Managed by enterprise SSO / directory</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Desk / Direct Telephone
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type="tel"
                    className="input-field pl-10"
                    placeholder="+1 (555) 000-0000"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Operational Timezone
                </label>
                <div className="relative">
                  <Clock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <select
                    className="input-field pl-10"
                    value={formData.timezone}
                    onChange={(e) => updateField('timezone', e.target.value)}
                  >
                    <option value="UTC">UTC (Coordinated Universal Time)</option>
                    <option value="America/New_York">EST / New York (UTC-5)</option>
                    <option value="Europe/London">GMT / London (UTC+0)</option>
                    <option value="Europe/Zurich">CET / Zurich (UTC+1)</option>
                    <option value="Asia/Dubai">GST / Dubai (UTC+4)</option>
                    <option value="Asia/Singapore">SGT / Singapore (UTC+8)</option>
                    <option value="Asia/Kolkata">IST / Mumbai (UTC+5:30)</option>
                  </select>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Administrative Privileges
                </label>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {[
                    'ERC-3643 Token Factory',
                    'Compliant Mint & Burn',
                    'KYC Review & Whitelist',
                    'Emergency Partition Freeze',
                    'Corporate Dividends',
                  ].map((perm) => (
                    <span
                      key={perm}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-header px-2.5 py-1 text-xs font-medium text-ink"
                    >
                      <Check className="h-3 w-3 text-accent" />
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Section 2: Organization Profile ── */}
        {(activeTab === 'organization' || activeTab === 'all') && (
          <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-5 sm:p-7 shadow-card transition-all duration-300 hover:border-accent/30">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent border border-accent/20">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-ink">Organization & Legal Entity</h3>
                  <p className="text-xs text-muted">Legal identity displayed on token prospectuses and investor disclosure filings</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Legal Entity / Organization Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Assetro Capital Partners AG"
                  value={formData.companyName}
                  onChange={(e) => updateField('companyName', e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Jurisdiction of Incorporation
                </label>
                <select
                  className="input-field"
                  value={formData.jurisdiction}
                  onChange={(e) => updateField('jurisdiction', e.target.value)}
                >
                  <option value="Switzerland (FINMA Compliant)">Switzerland (FINMA DLT Act)</option>
                  <option value="Luxembourg (CSSF Regulated)">Luxembourg (CSSF Blockchain Act)</option>
                  <option value="United States (Delaware LLC / Reg D 506c)">United States (Delaware - Reg D / Reg S)</option>
                  <option value="United Kingdom (FCA Compliant)">United Kingdom (FCA Sandbox)</option>
                  <option value="Singapore (MAS Digital Assets)">Singapore (MAS SFA Regulated)</option>
                  <option value="United Arab Emirates (ADGM / DIFC)">United Arab Emirates (ADGM / DIFC)</option>
                  <option value="Cayman Islands (VASP Act)">Cayman Islands (VASP)</option>
                  <option value="Germany (BaFin eWpG)">Germany (BaFin eWpG)</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Company Registration Number (CRN / CIN)
                </label>
                <input
                  type="text"
                  className="input-field font-mono"
                  placeholder="e.g. CHE-298.411.890"
                  value={formData.companyRegNumber}
                  onChange={(e) => updateField('companyRegNumber', e.target.value)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted">
                    Legal Entity Identifier (LEI)
                  </label>
                  <span className="text-[10px] font-semibold text-accent">ISO 17442</span>
                </div>
                <input
                  type="text"
                  maxLength={20}
                  className="input-field font-mono uppercase"
                  placeholder="20-character LEI code"
                  value={formData.leiNumber}
                  onChange={(e) => updateField('leiNumber', e.target.value.toUpperCase())}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Official Corporate Website
                </label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type="url"
                    className="input-field pl-10 pr-10"
                    placeholder="https://assetro.com"
                    value={formData.companyWebsite}
                    onChange={(e) => updateField('companyWebsite', e.target.value)}
                  />
                  {formData.companyWebsite && (
                    <a
                      href={formData.companyWebsite}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-accent"
                      title="Open website"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Investor Relations & Compliance Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type="email"
                    className="input-field pl-10"
                    placeholder="compliance@assetro.com"
                    value={formData.contactEmail}
                    onChange={(e) => updateField('contactEmail', e.target.value)}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Organization Bio & Prospectus Disclosure
                </label>
                <textarea
                  rows={3}
                  className="input-field py-2.5 resize-none leading-relaxed"
                  placeholder="Provide an overview of your organization and asset issuance focus..."
                  value={formData.companyDescription}
                  onChange={(e) => updateField('companyDescription', e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted">
                  This summary is displayed on public security token prospectuses and investor data rooms.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Section 3: Issuer On-Chain Wallet Authority ── */}
        {(activeTab === 'wallet' || activeTab === 'all') && (
          <div className="space-y-4">
            <IssuerWalletCard />

            <div className="rounded-xl border border-line bg-surface-header p-4 text-xs text-muted flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-ink">Multi-Signature & Hardware Wallet Support: </span>
                Institutional issuers can register Safe Multisig (formerly Gnosis Safe) or hardware-backed signing addresses (Ledger / Trezor)
                via MetaMask or WalletConnect. All permissioned ERC-3643 actions require cryptographic signature verification.
              </div>
            </div>
          </div>
        )}

        {/* ── Section 4: Operational Notifications ── */}
        {(activeTab === 'notifications' || activeTab === 'all') && (
          <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-5 sm:p-7 shadow-card transition-all duration-300 hover:border-accent/30">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent border border-accent/20">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-ink">Operational Notifications</h3>
                  <p className="text-xs text-muted">Real-time alerts for on-chain events, KYC reviews, and settlement completions</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      notifyOnTransfer: true,
                      notifyOnContractPause: true,
                      notifyOnKyc: true,
                      notifyOnAccreditationExpire: true,
                      notifyOnPayment: true,
                      notifyOnStablecoinOrder: true,
                      notifyOnSecurityAlerts: true,
                      notifyOnParameterChange: true,
                    }));
                    toast.success('All notification rules enabled');
                  }}
                  className="btn-ghost text-xs py-1.5 px-3"
                >
                  Enable All
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {[
                {
                  id: 'notifyOnTransfer',
                  title: 'Secondary Transfers & DEX Settlement',
                  desc: 'Notify when investors execute peer-to-peer ERC-3643 transfers or trade on authorized liquidity pools.',
                  category: 'On-Chain',
                  value: formData.notifyOnTransfer,
                },
                {
                  id: 'notifyOnContractPause',
                  title: 'Emergency Token Pause & Freeze Events',
                  desc: 'Immediate high-priority alert whenever token partitions are frozen or contracts are placed on pause.',
                  category: 'On-Chain',
                  value: formData.notifyOnContractPause,
                },
                {
                  id: 'notifyOnKyc',
                  title: 'Investor KYC / AML Submissions',
                  desc: 'Receive immediate notifications when accredited investors submit identity documents for compliance verification.',
                  category: 'Compliance',
                  value: formData.notifyOnKyc,
                },
                {
                  id: 'notifyOnAccreditationExpire',
                  title: 'Accreditation Status Expiration Alerts',
                  desc: 'Advance warning 30 days before investor accreditation or KYC verification validity expires.',
                  category: 'Compliance',
                  value: formData.notifyOnAccreditationExpire,
                },
                {
                  id: 'notifyOnPayment',
                  title: 'Primary Market Fiat Wire Settlements',
                  desc: 'Instant alert when banking partners confirm receipt of primary security token offering subscription wires.',
                  category: 'Capital',
                  value: formData.notifyOnPayment,
                },
                {
                  id: 'notifyOnStablecoinOrder',
                  title: 'On-Chain Stablecoin (USDC/USDT) Subscriptions',
                  desc: 'Alert when smart contract deposits of digital dollar stablecoins are settled into issuer treasury vaults.',
                  category: 'Capital',
                  value: formData.notifyOnStablecoinOrder,
                },
                {
                  id: 'notifyOnSecurityAlerts',
                  title: 'Security & Unrecognized Login Warnings',
                  desc: 'Security notification whenever administrative access occurs from an unverified IP address or browser.',
                  category: 'Security',
                  value: formData.notifyOnSecurityAlerts,
                },
                {
                  id: 'notifyOnParameterChange',
                  title: 'Smart Contract Parameter Audits',
                  desc: 'Audit trail alert whenever compliance rules, claim topics, or transfer agents are updated.',
                  category: 'Security',
                  value: formData.notifyOnParameterChange,
                },
              ].map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-line bg-surface-header p-4 transition-all hover:border-accent/30"
                >
                  <div className="pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{item.title}</span>
                      <span className="inline-flex rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-bold text-muted">
                        {item.category}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted leading-relaxed">{item.desc}</p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.value}
                    onClick={() => updateField(item.id as keyof IssuerSettingsData, !item.value)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
                      item.value ? 'bg-accent' : 'bg-line'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        item.value ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Section 5: Security & Credentials ── */}
        {(activeTab === 'security' || activeTab === 'all') && (
          <div className="space-y-5">
            <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-5 sm:p-7 shadow-card transition-all duration-300 hover:border-accent/30">
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent border border-accent/20">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-ink">Security & Credentials</h3>
                    <p className="text-xs text-muted">Protect administrative access to institutional token contracts</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success-subtle/30 px-3 py-1 text-xs font-semibold text-success">
                  <Check className="h-3.5 w-3.5" />
                  256-Bit TLS 1.3 Active
                </div>
              </div>

              <div className="space-y-4">
                {/* Password Box */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-line bg-surface-header p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">Master Password</p>
                      <span className="inline-flex rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">
                        Active
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      Rotated recently. Institutional policy mandates rotation at least every 90 days.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(true)}
                    className="btn-secondary text-xs py-2 px-4 shrink-0"
                  >
                    <KeyRound className="h-3.5 w-3.5 text-accent" />
                    Change Password
                  </button>
                </div>

                {/* 2FA Box */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-line bg-surface-header p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">Two-Factor Authentication (TOTP)</p>
                      <span className="inline-flex rounded-full bg-warning-subtle px-2 py-0.5 text-[10px] font-bold text-warning">
                        Recommended
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      Require an authenticator app passcode in addition to your master password when signing into the issuer portal.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShow2faModal(true)}
                    className="btn-primary text-xs py-2 px-4 shrink-0"
                  >
                    <QrCode className="h-3.5 w-3.5" />
                    Configure 2FA
                  </button>
                </div>

                {/* Active Session Details */}
                <div className="rounded-xl border border-line bg-surface-alt p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted">Active Management Session</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      Current Session
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-muted">Client: </span>
                      <span className="font-semibold text-ink">Next.js Web Console (Windows)</span>
                    </div>
                    <div>
                      <span className="text-muted">Authentication: </span>
                      <span className="font-semibold text-ink">Signed JWT Bearer</span>
                    </div>
                    <div>
                      <span className="text-muted">Session Timeout: </span>
                      <span className="font-semibold text-ink">7 Days Sliding</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Bottom Save Action Bar ── */}
        <div className="sticky bottom-4 z-40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-line bg-card/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2.5 text-xs">
            {isDirty ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-subtle px-2.5 py-1 font-semibold text-warning">
                <span className="h-1.5 w-1.5 rounded-full bg-warning animate-ping" />
                You have unsaved changes
              </span>
            ) : justSaved ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-2.5 py-1 font-semibold text-success animate-in fade-in duration-300">
                <CheckCircle2 className="h-4 w-4" />
                All changes saved successfully
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted">
                <Sparkles className="h-4 w-4 text-accent" />
                Institutional settings are synchronized across console views
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5">
            {isDirty && (
              <button
                type="button"
                onClick={handleDiscard}
                disabled={saving}
                className="btn-ghost text-xs py-2 px-3.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Discard
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={`btn text-xs py-2 px-5 font-semibold transition-all ${
                isDirty
                  ? 'btn-primary shadow-lg shadow-accent/20 scale-[1.02]'
                  : 'btn-secondary opacity-60 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving Changes…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
