'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  Sparkles,
  Check,
  Copy,
  ArrowRight,
  Server,
  Layers,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
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

export default function AdminLoginPage() {
  const router = useRouter();
  const { isAuthenticated, login } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedDemo, setCopiedDemo] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

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
      login(
        { ...user, kycStatus: user.kycStatus || 'none' },
        tokens.accessToken,
        tokens.refreshToken,
      );
      router.push('/dashboard');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    setValue('email', 'admin@assetro.com', { shouldValidate: true });
    setValue('password', 'Admin@12345', { shouldValidate: true });
    setCopiedDemo(true);
    setTimeout(() => setCopiedDemo(false), 2000);
  };

  const demoCredentials = (
    <div className="panel p-4 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-bold text-accent">
          <Sparkles className="h-3.5 w-3.5" />
          Demo SuperAdmin Credentials
        </span>
        <button
          type="button"
          onClick={fillDemoCredentials}
          className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent transition-opacity hover:opacity-80"
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
      <div className="space-y-1 font-mono text-[11px] text-muted">
        <p>
          Email: <span className="text-ink">admin@assetro.com</span>
        </p>
        <p>
          Password: <span className="text-ink">Admin@12345</span>
        </p>
      </div>
    </div>
  );

  return (
    <AuthShell
      title="Super Admin Console"
      subtitle="Authenticate with root privileges to manage tenants, inspect audit trails, and oversee tokenization rails."
      aside={demoCredentials}
    >
      {error && <AuthError message={error} />}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="email" className={authLabelClass}>
            Administrator Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="admin@assetro.com"
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
              autoComplete="current-password"
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

        <AuthSubmitButton loading={loading}>
          Authenticate &amp; Access Console
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </AuthSubmitButton>
      </form>

      <div className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-line pt-4 text-xs sm:flex-row">
        <span className="flex items-center gap-1.5 text-muted">
          <Server className="h-3.5 w-3.5 text-accent" />
          Isolated Admin Session
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <Layers className="h-3 w-3 text-success" />
          Hardware-Token &amp; 256-Bit TLS
        </span>
      </div>
    </AuthShell>
  );
}
