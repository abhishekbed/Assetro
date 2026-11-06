'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, ArrowRight, Sparkles, Copy, Check } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { disconnectWallet } from '@/lib/wallet-disconnect';
import api from '@/lib/api';
import { rejectWrongPortal } from '@/lib/portal-login';
import {
  AuthShell,
  AuthError,
  AuthSubmitButton,
  authInputClass,
  authLabelClass,
} from '@/components/auth/AuthShell';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function InvestorLoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [copiedDemo, setCopiedDemo] = useState(false);

  useEffect(() => {
    disconnectWallet();
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', data);
      const { user, tokens } = response.data;

      const wrongPortal = rejectWrongPortal(user, 'investor');
      if (wrongPortal) {
        setError(wrongPortal);
        return;
      }

      login(
        { ...user, kycStatus: user.kycStatus || 'none' },
        tokens.accessToken,
        tokens.refreshToken,
      );
      router.push('/dashboard');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'Network error or invalid credentials (is the backend running?)');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    setValue('email', 'investor@assetro.com', { shouldValidate: true });
    setValue('password', 'Investor@123', { shouldValidate: true });
    setCopiedDemo(true);
    setTimeout(() => setCopiedDemo(false), 2000);
  };

  const demoBox = (
    <div className="panel bg-accent-soft p-3.5 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="kicker flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Demo Credentials
        </span>
        <button
          type="button"
          onClick={fillDemoCredentials}
          className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-surface-header"
        >
          {copiedDemo ? (
            <>
              <Check className="h-3 w-3 text-success" />
              <span>Filled!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>1-Click Fill</span>
            </>
          )}
        </button>
      </div>
      <div className="space-y-0.5 font-mono text-[11px] text-muted">
        <p>Email: <span className="text-ink">investor@assetro.com</span></p>
        <p>Password: <span className="text-ink">Investor@123</span></p>
      </div>
    </div>
  );

  return (
    <AuthShell
      title="Welcome back, investor"
      subtitle="Sign in to track your holdings, complete KYC and invest in tokenized assets."
      aside={demoBox}
    >
      {error && <AuthError message={error} />}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="email" className={authLabelClass}>
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={authInputClass}
              {...register('email')}
            />
          </div>
          {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className={authLabelClass}>
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••••••"
              className={`${authInputClass} pr-11`}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition-colors hover:bg-surface-header hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="mt-1 text-xs text-danger">{errors.password.message}</p>}
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="rounded border-line bg-card text-accent focus:ring-accent/30"
            />
            <span className="text-xs text-muted">Remember me</span>
          </label>
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-accent transition-colors hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <AuthSubmitButton loading={loading}>
          Sign In to Portal
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </AuthSubmitButton>
      </form>

      <div className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-line pt-4 text-xs sm:flex-row">
        <span className="text-muted">
          Don&apos;t have an account?{' '}
          <Link
            href="/investor/register"
            className="font-semibold text-accent transition-colors hover:underline"
          >
            Create account
          </Link>
        </span>
        <span className="text-[11px] text-muted">256-Bit SSL Encrypted</span>
      </div>
    </AuthShell>
  );
}
