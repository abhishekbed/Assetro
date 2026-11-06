'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';

export default function VestingNavItem({
  collapsed,
  isActive,
}: {
  collapsed: boolean;
  isActive: boolean;
}) {
  const { user } = useAuthStore();
  const [hasVesting, setHasVesting] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    api.get('/tokens/vesting/me', { headers: { 'x-user-id': user.id } })
      .then(r => setHasVesting((r.data?.data?.length ?? 0) > 0))
      .catch(() => {});
  }, [user?.id]);

  if (!hasVesting) return null;

  return (
    <Link
      href="/vesting"
      prefetch={true}
      className={clsx(
        'flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-[13px] font-semibold transition-colors',
        isActive
          ? 'border-transparent bg-accent-soft text-accent'
          : 'border-transparent text-muted hover:bg-surface-header hover:text-ink',
      )}
      title={collapsed ? 'Vesting' : undefined}
    >
      <Clock className={clsx('h-5 w-5 flex-shrink-0', isActive ? 'text-accent' : 'text-muted')} />
      {!collapsed && <span>Vesting</span>}
    </Link>
  );
}
