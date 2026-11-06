'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, ArrowRight, CheckCircle2, Mail } from 'lucide-react';
import api from '@/lib/api';
import {
  AuthShell,
  AuthError,
  AuthSubmitButton,
  authInputClass,
  authLabelClass,
} from '@/components/auth/AuthShell';

const schema = z.object({ email: z.string().email('Invalid email address') });
type Form = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email }: Form) => {
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSentTo(email);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Could not send the reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your account email and we will send you a link to choose a new password."
    >
      {sentTo ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-[10px] border border-success bg-success-100 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-bold text-success">Check your email</p>
              <p className="mt-1 text-xs text-success">
                If an account exists for {sentTo}, a password reset link is on its way. It expires in 1 hour.
              </p>
            </div>
          </div>
          <Link href="/investor/login" className="btn-secondary w-full">
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
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

            <AuthSubmitButton loading={loading}>
              Send reset link
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </AuthSubmitButton>
          </form>
          <div className="mt-6 border-t border-line pt-4 text-xs text-muted">
            Remembered it?{' '}
            <Link href="/investor/login" className="font-semibold text-accent hover:underline">
              Investor sign in
            </Link>{' '}
            ·{' '}
            <Link href="/issuer/login" className="font-semibold text-accent hover:underline">
              Issuer sign in
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
