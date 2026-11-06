'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function InvestorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  useEffect(() => {
    if (id) {
      router.replace(`/issuer/kyc-review/${id}`);
    }
  }, [id, router]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      <p className="text-sm text-slate-400">Loading investor details...</p>
    </div>
  );
}
