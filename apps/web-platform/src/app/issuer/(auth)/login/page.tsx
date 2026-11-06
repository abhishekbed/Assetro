'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';
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
} from '@/components/issuer/auth/AuthShell';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function IssuerLoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    disconnectWallet();
  }, []);

  useEffect(() => {
    const clearInputs = () => {
      const emailEl = document.getElementById('email') as HTMLInputElement | null;
      const passEl = document.getElementById('password') as HTMLInputElement | null;
      if (emailEl) emailEl.value = '';
      if (passEl) passEl.value = '';
      setValue('email', '');
      setValue('password', '');
    };

    clearInputs();
    const t1 = setTimeout(clearInputs, 50);
    const t2 = setTimeout(clearInputs, 200);
    const t3 = setTimeout(clearInputs, 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [setValue]);

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', data);
      const { user, tokens } = response.data;

      const wrongPortal = rejectWrongPortal(user, 'issuer');
      if (wrongPortal) {
        setError(wrongPortal);
        return;
      }

      login(user, tokens.accessToken, tokens.refreshToken);
      router.push('/issuer/dashboard');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Sign in to your account"
      subtitle="Enter your credentials to manage your digital securities and compliance rules."
    >
      {error && <AuthError message={error} />}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" autoComplete="off">
        {/* Prevent browser auto-fill on page load */}
        <input type="text" name="fake_email_prevent_autofill" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
        <input type="password" name="fake_pwd_prevent_autofill" style={{ display: 'none' }} tabIndex={-1} autoComplete="new-password" />

        <div>
          <label htmlFor="email" className={authLabelClass}>
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="email"
              type="email"
              autoComplete="off"
              placeholder="name@company.com"
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
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••••••"
              className={`${authInputClass} pr-11`}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition-colors hover:bg-surface-header hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="mt-1 text-xs text-danger">{errors.password.message}</p>}
        </div>

        <div className="flex justify-end">
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
          <Link href="/issuer/register" className="font-semibold text-accent transition-colors hover:underline">
            Apply as an Issuer
          </Link>
        </span>
        <span className="text-[11px] text-muted">256-Bit SSL Encrypted</span>
      </div>
    </AuthShell>
  );
}
