'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TermsOfServiceRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/terms');
  }, [router]);

  return null;
}
