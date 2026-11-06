'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, User, Mail, Lock, ArrowRight, KeyRound } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  AuthShell,
  AuthError,
  AuthSubmitButton,
  authInputClass,
  authLabelClass,
} from '@/components/issuer/auth/AuthShell';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[@$!%*?&]/, 'Must contain at least one special character (@$!%*?&)'),
});

type RegisterForm = z.infer<typeof registerSchema>;

function apiMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
    ?.message;
  if (Array.isArray(msg)) return msg[0];
  return typeof msg === 'string' ? msg : fallback;
}

export default function IssuerRegisterPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [otp, setOtp] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  /** Step 1: create the (unverified) account and email the code. */
  const sendOtp = async (data: RegisterForm) => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await api.post('/auth/register', {
        name: data.name,
        email: data.email,
        password: data.password,
        role: 'issuer',
      });
      setPendingEmail(data.email);
      setOtpSent(true);
      setNotice(`We sent a 6-digit code to ${data.email}.`);
    } catch (err) {
      setError(apiMessage(err, 'Could not send the code. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await api.post('/auth/resend-otp', { email: pendingEmail });
      setNotice(`We sent a new 6-digit code to ${pendingEmail}.`);
    } catch (err) {
      setError(apiMessage(err, 'Could not resend the code. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  /** Step 2: confirm the code, sign in, and continue to the application form. */
  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/verify-otp', { email: pendingEmail, code: otp });
      const { user, tokens } = res.data;
      login(user, tokens.accessToken, tokens.refreshToken);
      router.push('/issuer/contact');
    } catch (err) {
      setError(apiMessage(err, 'Verification failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Apply as an Issuer"
      subtitle="Create your issuer account first. You will complete your company application next."
    >
      {error && <AuthError message={error} />}
      {notice && !error && (
        <div className="mb-4 rounded-card border border-line bg-surface-alt p-3 text-xs text-ink">
          {notice}
        </div>
      )}

      <form onSubmit={handleSubmit(sendOtp)} className="space-y-4" autoComplete="off">
        <div>
          <label htmlFor="name" className={authLabelClass}>Full Name</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="name"
              disabled={otpSent}
              placeholder="Your full name"
              className={authInputClass}
              {...register('name')}
            />
          </div>
          {errors.name && <p className="mt-1 text-xs text-danger">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="email" className={authLabelClass}>Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="email"
              type="email"
              disabled={otpSent}
              placeholder="name@company.com"
              className={authInputClass}
              {...register('email')}
            />
          </div>
          {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className={authLabelClass}>Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              disabled={otpSent}
              placeholder="Create a strong password"
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

        {!otpSent && (
          <AuthSubmitButton loading={loading}>
            Send OTP
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </AuthSubmitButton>
        )}
      </form>

      {otpSent && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div>
            <label htmlFor="otp" className={authLabelClass}>Email OTP</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="otp"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code"
                className={authInputClass}
              />
            </div>
          </div>
          <button type="button" onClick={verifyOtp} disabled={loading} className="btn-primary group w-full">
            {loading ? 'Verifying…' : 'Verify & Continue'}
          </button>
          <div className="flex justify-between text-xs">
            <button
              type="button"
              onClick={resendOtp}
              disabled={loading}
              className="font-semibold text-accent hover:underline"
            >
              Resend code
            </button>
            <button
              type="button"
              onClick={() => {
                setOtpSent(false);
                setPendingEmail('');
                setOtp('');
                setNotice('');
                setError('');
              }}
              className="text-muted hover:text-ink"
            >
              Change details
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-line pt-4 text-xs text-muted">
        Already applied?{' '}
        <Link href="/issuer/login" className="font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </div>
    </AuthShell>
  );
}
