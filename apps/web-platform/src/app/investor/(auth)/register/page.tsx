'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, User, Mail, Lock, ArrowRight, Fingerprint, ShieldCheck, Coins } from 'lucide-react';
import api from '@/lib/api';
import {
  AuthShell,
  AuthError,
  AuthSubmitButton,
  authInputClass,
  authLabelClass,
} from '@/components/auth/AuthShell';
import { OtpVerification } from '@/components/auth/OtpVerification';

/** Pull the API's message out of an axios error so it can be shown inline. */
function apiMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { data?: { message?: string | string[] } } };
    const msg = axiosErr.response?.data?.message;
    if (Array.isArray(msg)) return msg[0];
    if (typeof msg === 'string') return msg;
  }
  return fallback;
}

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .regex(/[@$!%*?&]/, 'Must contain at least one special character (@$!%*?&)'),
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((val) => val, 'You must accept the terms'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function InvestorRegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  /** 'details' collects the form; 'otp' waits for the emailed code. */
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [pendingEmail, setPendingEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    setError('');

    try {
      // Creates the account as pending and emails a code. No session yet —
      // the account stays inactive until the code is confirmed.
      await api.post('/auth/register', {
        name: data.name,
        email: data.email,
        password: data.password,
        role: 'investor',
      });
      setPendingEmail(data.email);
      setStep('otp');
    } catch (err: unknown) {
      setError(apiMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (code: string) => {
    try {
      await api.post('/auth/verify-otp', { email: pendingEmail, code });
      router.push('/investor/login?verified=true');
    } catch (err: unknown) {
      throw new Error(apiMessage(err, 'Verification failed. Please try again.'));
    }
  };

  const handleResend = async () => {
    try {
      await api.post('/auth/resend-otp', { email: pendingEmail });
    } catch (err: unknown) {
      throw new Error(apiMessage(err, 'Could not resend the code.'));
    }
  };


  const nextSteps = (
    <div className="panel bg-surface-header p-3.5">
      <p className="label mb-3">
        After you sign up
      </p>
      <ol className="space-y-2.5 text-xs text-ink">
        {[
          { icon: ShieldCheck, text: 'Complete KYC once with the issuer' },
          { icon: Fingerprint, text: 'Get your ONCHAINID identity' },
          { icon: Coins, text: 'Invest & hold tokens in your wallet' },
        ].map(({ icon: Icon, text }, i) => (
          <li key={text} className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[10px] font-bold text-accent">
              {i + 1}
            </span>
            <Icon className="h-3.5 w-3.5 text-accent" />
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  if (step === 'otp') {
    return (
      <AuthShell
        title="Verify your email"
        subtitle="One last step before your account is active."
        aside={nextSteps}
      >
        <OtpVerification
          email={pendingEmail}
          onVerify={handleVerify}
          onResend={handleResend}
          onChangeEmail={() => {
            setStep('details');
            setError('');
          }}
          submitLabel="Verify & Create Account"
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your investor account"
      subtitle="Join in minutes. Verification happens after sign-up from your dashboard."
      aside={nextSteps}
    >
      {error && <AuthError message={error} />}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="name" className={authLabelClass}>
            Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="John Doe"
              className={authInputClass}
              {...register('name')}
            />
          </div>
          {errors.name && <p className="mt-1 text-xs text-danger">{errors.name.message}</p>}
        </div>

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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="password" className={authLabelClass}>
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Strong password"
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

          <div>
            <label htmlFor="confirmPassword" className={authLabelClass}>
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat password"
                className={`${authInputClass} pr-11`}
                {...register('confirmPassword')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition-colors hover:bg-surface-header hover:text-ink"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-danger">{errors.confirmPassword.message}</p>
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted">
          Min. 8 characters with an uppercase letter, a number and a special character (@$!%*?&).
        </p>

        <div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-line bg-card text-accent focus:ring-accent/30"
              {...register('acceptTerms')}
            />
            <span className="text-xs text-muted">
              I agree to the{' '}
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-accent hover:underline"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-accent hover:underline"
              >
                Privacy Policy
              </Link>
            </span>
          </label>
          {errors.acceptTerms && <p className="mt-1 text-xs text-danger">{errors.acceptTerms.message}</p>}
        </div>

        <AuthSubmitButton loading={loading}>
          Create Account
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </AuthSubmitButton>
      </form>

      <div className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-line pt-4 text-xs sm:flex-row">
        <span className="text-muted">
          Already have an account?{' '}
          <Link
            href="/investor/login"
            className="font-semibold text-accent transition-colors hover:text-accent hover:underline"
          >
            Sign in
          </Link>
        </span>
        <span className="text-[11px] text-muted">256-Bit SSL Encrypted</span>
      </div>
    </AuthShell>
  );
}
