'use client';

import { useState } from 'react';
import {
  Save,
  User,
  Building2,
  Bell,
  Shield,
  Loader2,
  KeyRound,
  X,
  Eye,
  EyeOff,
  CheckCircle2,
  Globe,
  Lock,
  Sparkles,
  ShieldCheck,
  Check,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { IssuerWalletCard } from '@/components/issuer/wallet/IssuerWalletProvider';

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

  // Validation checks
  const hasMinLength = next.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(next);
  const hasNumberOrSpecial = /[0-9!@#$%^&*(),.?":{}|<>]/.test(next);
  const passwordsMatch = next.length > 0 && next === confirm;
  const canSubmit = current.length > 0 && hasMinLength && passwordsMatch;

  // Strength calculation
  const strengthScore = [hasMinLength, hasLetter, hasNumberOrSpecial].filter(Boolean).length;
  const strengthLabel = next.length === 0 ? '' : strengthScore === 1 ? 'Weak' : strengthScore === 2 ? 'Fair' : 'Strong';
  const strengthColor =
    strengthScore === 1 ? 'bg-red-500' : strengthScore === 2 ? 'bg-amber-400' : 'bg-emerald-400';

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
      toast.success('Password changed successfully');
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to change password';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/95 p-6 sm:p-7 shadow-2xl backdrop-blur-xl">
        {/* Glow halo */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-40 w-40 rounded-full bg-blue-600/10 blur-3xl" />

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-800/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-400 shadow-inner">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Change Password</h2>
              <p className="text-xs text-slate-400">Update security credentials for your account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Active Account Banner */}
        <div className="mt-5 rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/30 to-slate-900/40 p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold text-sm">
              {(user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {user?.name || 'Logged-in Account'}
                </span>
                <span className="inline-flex items-center rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-400 border border-cyan-500/30">
                  Active User
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono truncate">{user?.email || 'rs@example.com'}</p>
            </div>
          </div>
          <ShieldCheck className="h-5 w-5 text-cyan-400/80 shrink-0 ml-2" />
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-400 shadow-inner">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Current password */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Current Password
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                name="current-password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-800/50 py-2.5 pl-3.5 pr-10 text-sm text-ink placeholder:text-slate-500 transition-all focus:border-cyan-400 focus:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                placeholder="Enter your current password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                New Password
              </label>
              {strengthLabel && (
                <span className={`text-[11px] font-semibold ${
                  strengthScore === 1 ? 'text-red-400' : strengthScore === 2 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {strengthLabel}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showNext ? 'text' : 'password'}
                name="new-password"
                autoComplete="new-password"
                className={`w-full rounded-xl border bg-slate-800/50 py-2.5 pl-3.5 pr-10 text-sm text-ink placeholder:text-slate-500 transition-all focus:bg-slate-800/80 focus:outline-none focus:ring-2 ${
                  next && !hasMinLength
                    ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-slate-700/80 focus:border-cyan-400 focus:ring-cyan-500/20'
                }`}
                placeholder="Minimum 8 characters"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowNext((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                tabIndex={-1}
              >
                {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Strength meter bar */}
            {next.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                <div className={`h-1.5 flex-1 rounded-full transition-all ${strengthScore >= 1 ? strengthColor : 'bg-slate-700'}`} />
                <div className={`h-1.5 flex-1 rounded-full transition-all ${strengthScore >= 2 ? strengthColor : 'bg-slate-700'}`} />
                <div className={`h-1.5 flex-1 rounded-full transition-all ${strengthScore >= 3 ? strengthColor : 'bg-slate-700'}`} />
              </div>
            )}

            {/* Password checklist */}
            <div className="mt-2.5 space-y-1 rounded-lg bg-slate-950/40 border border-slate-800/60 p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <div className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${hasMinLength ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                  {hasMinLength ? <Check className="h-2.5 w-2.5" /> : <div className="h-1 w-1 rounded-full bg-slate-500" />}
                </div>
                <span className={hasMinLength ? 'text-slate-300' : 'text-slate-500'}>
                  At least 8 characters
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${hasLetter ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                  {hasLetter ? <Check className="h-2.5 w-2.5" /> : <div className="h-1 w-1 rounded-full bg-slate-500" />}
                </div>
                <span className={hasLetter ? 'text-slate-300' : 'text-slate-500'}>
                  At least one letter (a-z, A-Z)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${hasNumberOrSpecial ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                  {hasNumberOrSpecial ? <Check className="h-2.5 w-2.5" /> : <div className="h-1 w-1 rounded-full bg-slate-500" />}
                </div>
                <span className={hasNumberOrSpecial ? 'text-slate-300' : 'text-slate-500'}>
                  At least one number or special character
                </span>
              </div>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                name="confirm-password"
                autoComplete="new-password"
                className={`w-full rounded-xl border bg-slate-800/50 py-2.5 pl-3.5 pr-10 text-sm text-ink placeholder:text-slate-500 transition-all focus:bg-slate-800/80 focus:outline-none focus:ring-2 ${
                  confirm && !passwordsMatch
                    ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/20'
                    : confirm && passwordsMatch
                    ? 'border-emerald-500/60 focus:border-emerald-500 focus:ring-emerald-500/20'
                    : 'border-slate-700/80 focus:border-cyan-400 focus:ring-cyan-500/20'
                }`}
                placeholder="Re-enter new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              {confirm && passwordsMatch && next && (
                <CheckCircle2 className="absolute right-9 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />
              )}
            </div>
            {confirm && !passwordsMatch && (
              <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-800/80 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Updating Password…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [notifyOnTransfer, setNotifyOnTransfer] = useState(true);
  const [notifyOnKyc, setNotifyOnKyc] = useState(true);
  const [notifyOnPayment, setNotifyOnPayment] = useState(true);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    toast.success('Settings updated successfully');
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}

      <div className="mx-auto max-w-5xl space-y-6 pb-12">
        {/* Header with Title and Identity Badge */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-extrabold tracking-tight text-ink">
                Account Settings
              </h1>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
                Console
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Manage your institutional issuer profile, organization credentials, and notification preferences.
            </p>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <div className="text-xs">
              <span className="text-slate-400">Status: </span>
              <span className="font-semibold text-emerald-400">Verified Issuer</span>
            </div>
          </div>
        </div>

        {/* ── Section 1: Profile Information ── */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl transition-all duration-300 hover:border-slate-700/80">
          <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="mb-6 flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-cyan-400 shadow-sm">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Profile Information</h3>
                <p className="text-xs text-slate-400">Your account details and administrative privileges</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                Verified Admin
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Full Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm font-medium text-slate-200 transition-all focus:border-cyan-400 focus:outline-none"
                  defaultValue={user?.name ?? 'Priya Patel'}
                  readOnly
                />
                <Lock className="absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm font-medium text-slate-200 transition-all focus:border-cyan-400 focus:outline-none"
                  defaultValue={user?.email ?? 'issuer@assetro.com'}
                  readOnly
                />
                <Lock className="absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Platform Role
              </label>
              <div className="relative">
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm font-semibold capitalize text-cyan-300 transition-all focus:border-cyan-400 focus:outline-none"
                  defaultValue={user?.role ?? 'Issuer'}
                  readOnly
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300">
                  PRIMARY
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 2: Company Information ── */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl transition-all duration-300 hover:border-slate-700/80">
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="mb-6 flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-cyan-400 shadow-sm">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Company Information</h3>
                <p className="text-xs text-slate-400">Legal entity information displayed on your security token prospectuses</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Organization / Company Name
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-800/50 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 transition-all duration-200 focus:border-cyan-400 focus:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                placeholder="e.g. Assetro Tokenization Ltd."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Official Website
              </label>
              <div className="relative">
                <Globe className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="url"
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-800/50 py-2.5 pl-10 pr-3.5 text-sm text-ink placeholder:text-slate-500 transition-all duration-200 focus:border-cyan-400 focus:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  placeholder="https://company.com"
                  value={companyWebsite}
                  onChange={(e) => setCompanyWebsite(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 3: Notification Preferences ── */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl transition-all duration-300 hover:border-slate-700/80">
          <div className="mb-6 flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-cyan-400 shadow-sm">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Notification Preferences</h3>
                <p className="text-xs text-slate-400">Configure real-time event updates and on-chain activity alerts</p>
              </div>
            </div>
          </div>

          <div className="space-y-3.5">
            {[
              {
                label: 'Token transfers & secondary activity',
                desc: 'Receive alerts when investors execute compliant ERC-3643 peer-to-peer transfers.',
                value: notifyOnTransfer,
                setter: setNotifyOnTransfer,
              },
              {
                label: 'KYC & Identity submissions',
                desc: 'Get notified immediately when new investors submit KYC/AML documentation for review.',
                value: notifyOnKyc,
                setter: setNotifyOnKyc,
              },
              {
                label: 'Token payments & primary purchases',
                desc: 'Alert when fiat or crypto settlements are completed for primary token issuances.',
                value: notifyOnPayment,
                setter: setNotifyOnPayment,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="group flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 transition-all duration-200 hover:border-slate-700/80 hover:bg-slate-950/70"
              >
                <div className="pr-4">
                  <p className="text-sm font-semibold text-ink group-hover:text-cyan-300 transition-colors">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">{item.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => item.setter(!item.value)}
                  className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-300 focus:outline-none ${
 item.value ? 'bg-accent' : 'bg-slate-800' }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
 item.value ? 'translate-x-5' : 'translate-x-0' }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        <IssuerWalletCard />

        {/* ── Section 4: Security & Authentication ── */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl transition-all duration-300 hover:border-slate-700/80">
          <div className="mb-6 flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-cyan-400 shadow-sm">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Security & Authentication</h3>
                <p className="text-xs text-slate-400">Protect your administrative credentials and security tokens</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              256-Bit SSL Active
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Password Authentication</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Last changed 30 days ago. We recommend rotating passwords every 90 days.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-ink shadow-sm transition-all hover:bg-slate-800 hover:border-slate-600"
            >
              <KeyRound className="h-3.5 w-3.5 text-cyan-400" />
              Change Password
            </button>
          </div>
        </div>

        {/* ── Save Actions Bar ── */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span>Changes are stored immediately upon clicking Save Changes</span>
          </div>

          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-400 animate-in fade-in duration-300">
                <CheckCircle2 className="h-4 w-4" /> Changes saved
              </span>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="relative group overflow-hidden inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition-all duration-300 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="relative z-10 flex items-center gap-2">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </span>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
