'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { XCircle, ArrowLeft } from 'lucide-react';

function PaymentCancelContent() {
  const searchParams = useSearchParams();
  const tokenId = searchParams.get('token_id');

  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-full max-w-md rounded-card bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-100">
          <XCircle className="h-9 w-9 text-danger" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-ink">Payment Cancelled</h1>
        <p className="mb-6 text-sm text-muted">
          Your payment was not completed. No charges were made.
        </p>
        <div className="space-y-3">
          {tokenId ? (
            <Link
              href={`/tokens/${tokenId}`}
              className="btn-primary flex w-full items-center justify-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Token
            </Link>
          ) : (
            <Link href="/tokens" className="btn-primary flex w-full items-center justify-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Browse Tokens
            </Link>
          )}
          <Link
            href="/dashboard"
            className="block w-full rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-header"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentCancelPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><XCircle className="h-8 w-8 text-danger" /></div>}>
      <PaymentCancelContent />
    </Suspense>
  );
}
