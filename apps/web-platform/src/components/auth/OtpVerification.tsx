'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, MailCheck, RotateCw } from 'lucide-react';
import { AuthError, AuthSubmitButton } from './AuthShell';

const OTP_LENGTH = 6;
/** Matches RESEND_COOLDOWN_SECONDS in the API's OtpService. */
const RESEND_COOLDOWN_SECONDS = 60;

export interface OtpVerificationProps {
  /** Address the code was sent to; shown to the user so a typo is obvious. */
  email: string;
  /** Submit the code. Reject with an Error whose message is shown inline. */
  onVerify: (code: string) => Promise<void>;
  /** Request a fresh code. */
  onResend: () => Promise<void>;
  /** Back to the form, e.g. to correct the email address. */
  onChangeEmail?: () => void;
  submitLabel?: string;
}

/**
 * Six separate boxes rather than one text input: it makes the expected length
 * obvious, and lets a pasted code fill the whole row at once.
 */
export function OtpVerification({
  email,
  onVerify,
  onResend,
  onChangeEmail,
  submitLabel = 'Verify & Continue',
}: OtpVerificationProps) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const code = digits.join('');

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== OTP_LENGTH || loading) return;
      setLoading(true);
      setError('');
      setNotice('');
      try {
        await onVerify(value);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
        setDigits(Array(OTP_LENGTH).fill(''));
        inputsRef.current[0]?.focus();
      } finally {
        setLoading(false);
      }
    },
    [loading, onVerify],
  );

  const setDigitAt = (index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, '');
    if (!value) {
      setDigitAt(index, '');
      return;
    }

    // Typing or pasting several digits fills forward from this box.
    const chars = value.split('').slice(0, OTP_LENGTH - index);
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((char, offset) => {
        next[index + offset] = char;
      });
      const filled = next.join('');
      if (filled.length === OTP_LENGTH && !filled.includes('')) {
        // Auto-submit once the row is complete — saves a click.
        void submit(filled);
      }
      return next;
    });

    const nextIndex = Math.min(index + chars.length, OTP_LENGTH - 1);
    inputsRef.current[nextIndex]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      e.preventDefault();
      setDigitAt(index - 1, '');
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError('');
    setNotice('');
    try {
      await onResend();
      setNotice(`A new code is on its way to ${email}.`);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="panel bg-surface-header flex items-start gap-3 p-3.5">
        <MailCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
        <p className="text-xs leading-relaxed text-ink">
          We sent a {OTP_LENGTH}-digit code to{' '}
          <span className="font-semibold break-all">{email}</span>. Enter it below to confirm
          your email address.
        </p>
      </div>

      {error && <AuthError message={error} />}
      {notice && !error && (
        <p className="text-xs font-medium text-accent" role="status">
          {notice}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(code);
        }}
        className="space-y-5"
      >
        <div>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label className="label mb-1.5 block" htmlFor="otp-0">
            Verification Code
          </label>
          <div className="flex gap-2" role="group" aria-label="Verification code">
            {digits.map((digit, i) => (
              <input
                key={i}
                id={`otp-${i}`}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={OTP_LENGTH}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                aria-label={`Digit ${i + 1}`}
                className="h-12 w-full rounded-xl border border-line bg-card text-center text-lg font-semibold text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            The code expires in 10 minutes. Check your spam folder if it has not arrived.
          </p>
        </div>

        <AuthSubmitButton loading={loading} disabled={code.length !== OTP_LENGTH}>
          {submitLabel}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </AuthSubmitButton>
      </form>

      <div className="flex flex-col items-center justify-between gap-2 border-t border-line pt-4 text-xs sm:flex-row">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="inline-flex items-center gap-1.5 font-semibold text-accent transition-colors hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
        >
          <RotateCw className={`h-3.5 w-3.5 ${resending ? 'animate-spin' : ''}`} />
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
        {onChangeEmail && (
          <button
            type="button"
            onClick={onChangeEmail}
            className="text-muted transition-colors hover:text-ink hover:underline"
          >
            Use a different email
          </button>
        )}
      </div>
    </div>
  );
}
