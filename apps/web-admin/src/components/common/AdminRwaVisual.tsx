'use client';

import React from 'react';
import Image from 'next/image';

interface AdminRwaVisualProps {
  className?: string;
  priority?: boolean;
  alt?: string;
}

export function AdminRwaVisual({
  className = '',
  priority = false,
  alt = 'Assetro Institutional Platform Infrastructure',
}: AdminRwaVisualProps) {
  return (
    <div className={`relative group ${className}`}>
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-accent-soft blur-2xl opacity-70 transition-opacity duration-500 group-hover:opacity-100" />

      {/* Navy glass container */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3 shadow-2xl transition-all duration-300 hover:border-cyan-500/30">
        {/* Subtle grid pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'linear-gradient(rgba(34,211,238,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.2) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        <div className="relative aspect-[677/369] w-full overflow-hidden rounded-xl">
          <Image
            src="/images/Admin_RWA.png"
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            priority={priority}
            className="object-contain transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
      </div>
    </div>
  );
}

export default AdminRwaVisual;
