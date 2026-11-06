'use client';

import { useState } from 'react';
import {
  Save,
  Eye,
  EyeOff,
  ShieldCheck,
  Bell,
  Globe,
  Loader2,
  CheckCircle,
  Key,
  Sliders,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'platform' | 'security' | 'notifications'>('platform');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [platformSettings, setPlatformSettings] = useState({
    platformName: 'Assetro',
    supportEmail: 'support@assetro.io',
    defaultPlan: 'starter',
    maxTenantsPerPlan: '50',
    maintenanceMode: false,
  });

  const [securitySettings, setSecuritySettings] = useState({
    jwtExpiryHours: '24',
    require2fa: false,
    allowWalletLogin: true,
    maxLoginAttempts: '5',
  });

  const [notificationSettings, setNotificationSettings] = useState({
    kycAlerts: true,
    newTenantAlerts: true,
    paymentAlerts: false,
    systemAlerts: true,
    alertEmail: user?.email ?? '',
  });

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const tabs = [
    { id: 'platform', label: 'Platform', icon: Globe },
    { id: 'security', label: 'Security', icon: ShieldCheck },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ] as const;

  return (
    <div className="space-y-6">
      {/* ─── Top Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-ink">
              Platform Settings
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
              <Sliders className="h-3.5 w-3.5 text-cyan-400" />
              Global Config
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            System configuration, tenant defaults, security parameters, and notification policies
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-slate-950 shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
          ) : saved ? (
            <CheckCircle className="h-4 w-4 text-slate-950" />
          ) : (
            <Save className="h-4 w-4 text-slate-950" />
          )}
          <span>{saved ? 'Changes Saved!' : 'Save Changes'}</span>
        </button>
      </div>

      {/* ─── Admin Identity Card ─── */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-lg font-black text-slate-950 shadow-md">
              {user?.name?.charAt(0)?.toUpperCase() ?? 'A'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-base font-bold text-ink">{user?.name ?? 'Platform Administrator'}</p>
                <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                  Super Admin
                </span>
              </div>
              <p className="mt-0.5 font-mono text-xs text-slate-400">{user?.email ?? 'admin@assetro.com'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-mono text-slate-400">
              <span className="text-slate-600 block text-[10px] uppercase font-sans">Role</span>
              <span className="text-cyan-400 font-bold">Root Operator</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-mono text-slate-400">
              <span className="text-slate-600 block text-[10px] uppercase font-sans">Privileges</span>
              <span className="text-emerald-400 font-bold">Unrestricted</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Segmented Navigation Tabs ─── */}
      <div className="flex items-center gap-1.5 max-w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 p-1 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-all duration-200 ${
 isActive
 ? 'border border-cyan-500/30 bg-accent-soft text-cyan-300 shadow-sm' : 'border border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200' }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── Platform Settings Tab ─── */}
      {activeTab === 'platform' && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-lg font-bold text-ink tracking-tight">Platform Configuration</h3>
            <p className="text-xs text-slate-400">General settings for the Assetro multi-tenant network</p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">Platform Name</label>
              <input
                className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
                value={platformSettings.platformName}
                onChange={(e) => setPlatformSettings((s) => ({ ...s, platformName: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">Support Email</label>
              <input
                type="email"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
                value={platformSettings.supportEmail}
                onChange={(e) => setPlatformSettings((s) => ({ ...s, supportEmail: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">Default Plan for New Tenants</label>
              <select
                className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
                value={platformSettings.defaultPlan}
                onChange={(e) => setPlatformSettings((s) => ({ ...s, defaultPlan: e.target.value }))}
              >
                <option value="free" className="bg-slate-950 text-ink">Free</option>
                <option value="starter" className="bg-slate-950 text-ink">Starter</option>
                <option value="professional" className="bg-slate-950 text-ink">Professional</option>
                <option value="enterprise" className="bg-slate-950 text-ink">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">Max Tenants per Plan</label>
              <input
                type="number"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
                value={platformSettings.maxTenantsPerPlan}
                onChange={(e) => setPlatformSettings((s) => ({ ...s, maxTenantsPerPlan: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 p-4 transition-colors hover:border-slate-750">
            <div>
              <p className="text-sm font-bold text-ink">Maintenance Mode</p>
              <p className="text-xs text-slate-400">Temporarily disable platform access for all non-admin operators</p>
            </div>
            <button
              onClick={() => setPlatformSettings((s) => ({ ...s, maintenanceMode: !s.maintenanceMode }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
 platformSettings.maintenanceMode ? 'bg-red-500' : 'bg-slate-800 border border-slate-700' }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
 platformSettings.maintenanceMode ? 'translate-x-6' : 'translate-x-1' }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* ─── Security Settings Tab ─── */}
      {activeTab === 'security' && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-lg font-bold text-ink tracking-tight">Security &amp; Authentication</h3>
            <p className="text-xs text-slate-400">Authentication timeouts, Web3 wallet login, and policy parameters</p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">JWT Token Expiry (hours)</label>
              <input
                type="number"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
                value={securitySettings.jwtExpiryHours}
                onChange={(e) => setSecuritySettings((s) => ({ ...s, jwtExpiryHours: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">Max Login Attempts</label>
              <input
                type="number"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
                value={securitySettings.maxLoginAttempts}
                onChange={(e) => setSecuritySettings((s) => ({ ...s, maxLoginAttempts: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-3">
            {[
              { key: 'require2fa', label: 'Require 2FA for all admin users', desc: 'Forces TOTP authenticator setup on next login' },
              { key: 'allowWalletLogin', label: 'Allow Web3 wallet-based login', desc: 'Permits MetaMask / EIP-712 cryptographic signature login' },
            ].map(({ key, label, desc }) => {
              const isEnabled = Boolean(securitySettings[key as keyof typeof securitySettings]);
              return (
                <div key={key} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 p-4 transition-colors hover:border-slate-750">
                  <div>
                    <p className="text-sm font-bold text-ink">{label}</p>
                    <p className="text-xs text-slate-400">{desc}</p>
                  </div>
                  <button
                    onClick={() => setSecuritySettings((s) => ({ ...s, [key]: !s[key as keyof typeof s] }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
 isEnabled ? 'bg-accent shadow-sm' : 'bg-slate-800 border border-slate-700' }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full ${isEnabled ? 'bg-slate-950' : 'bg-white'} shadow transition-transform ${
 isEnabled ? 'translate-x-6' : 'translate-x-1' }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-cyan-400" />
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">JWT Secret Preview</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type={showSecret ? 'text' : 'password'}
                readOnly
                value="assetro-dev-secret-key-••••••••••••"
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 font-mono text-xs text-slate-300 focus:outline-none"
              />
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="rounded-xl border border-slate-700/80 bg-slate-800/60 p-2.5 text-slate-400 hover:border-slate-600 hover:bg-slate-800 hover:text-ink transition-colors"
                title={showSecret ? 'Hide secret' : 'Show secret'}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Configured securely via environment variable <span className="font-mono text-slate-400">JWT_SECRET</span></p>
          </div>
        </div>
      )}

      {/* ─── Notification Settings Tab ─── */}
      {activeTab === 'notifications' && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-lg font-bold text-ink tracking-tight">Notification Preferences</h3>
            <p className="text-xs text-slate-400">Configure alert routing and event triggers</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">Platform Alert Email Address</label>
            <input
              type="email"
              className="w-full max-w-md rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
              value={notificationSettings.alertEmail}
              onChange={(e) => setNotificationSettings((s) => ({ ...s, alertEmail: e.target.value }))}
              placeholder="admin@assetro.com"
            />
          </div>

          <div className="space-y-3">
            {[
              { key: 'kycAlerts', label: 'KYC Submission Alerts', desc: 'Notify immediately when an investor submits KYC qualification' },
              { key: 'newTenantAlerts', label: 'New Tenant Alerts', desc: 'Notify when a new tenant workspace is created or provisioned' },
              { key: 'paymentAlerts', label: 'Payment Alerts', desc: 'Notify on significant or failed on-chain fiat payment transactions' },
              { key: 'systemAlerts', label: 'System Health Alerts', desc: 'Critical infrastructure events and contract deployment anomalies' },
            ].map(({ key, label, desc }) => {
              const isEnabled = Boolean(notificationSettings[key as keyof typeof notificationSettings]);
              return (
                <div key={key} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 p-4 transition-colors hover:border-slate-750">
                  <div>
                    <p className="text-sm font-bold text-ink">{label}</p>
                    <p className="text-xs text-slate-400">{desc}</p>
                  </div>
                  <button
                    onClick={() => setNotificationSettings((s) => ({ ...s, [key]: !s[key as keyof typeof s] }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
 isEnabled ? 'bg-accent shadow-sm' : 'bg-slate-800 border border-slate-700' }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full ${isEnabled ? 'bg-slate-950' : 'bg-white'} shadow transition-transform ${
 isEnabled ? 'translate-x-6' : 'translate-x-1' }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
