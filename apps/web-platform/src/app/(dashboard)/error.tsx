'use client';

import { useEffect } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard view error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-6 text-ink">
      <div className="card max-w-md w-full p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-100 text-danger">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold">Unable to load section</h2>
        <p className="text-sm text-muted">
          There was an error loading this section. Your session and other tabs are still active.
        </p>
        <button
          onClick={() => reset()}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Retry
        </button>
      </div>
    </div>
  );
}
