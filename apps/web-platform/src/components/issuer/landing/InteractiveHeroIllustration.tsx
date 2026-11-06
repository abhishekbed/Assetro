'use client';

import React, { useRef, useState } from 'react';
import { ShieldCheck, Zap, TrendingUp } from 'lucide-react';

export function InteractiveHeroIllustration() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    // Subtle 3D tilt values
    setRotate({
      x: -y * 14,
      y: x * 14,
    });
  };

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotate({ x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative flex items-center justify-center p-4 lg:p-8"
      style={{ perspective: '1000px' }}
    >
      {/* Ambient background glow orbs */}
      <div className="pointer-events-none absolute h-80 w-80 rounded-full bg-blue-500/20 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute h-64 w-64 rounded-full bg-cyan-400/15 blur-2xl" />

      {/* Rotating orbital rings */}
      <div className="pointer-events-none absolute h-[380px] w-[380px] sm:h-[460px] sm:w-[460px] rounded-full border border-cyan-500/20 border-dashed [animation:orbitClockwise_36s_linear_infinite]" />
      <div className="pointer-events-none absolute h-[320px] w-[320px] sm:h-[400px] sm:w-[400px] rounded-full border border-blue-500/15 [animation:orbitCounter_48s_linear_infinite]">
        {/* Orbit satellite beacon */}
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 flex items-center justify-center">
          <span className="h-3 w-3 rounded-full bg-cyan-400" />
        </div>
      </div>

      {/* 3D tilt canvas wrapper */}
      <div
        className="relative z-10 transition-transform duration-200 ease-out will-change-transform"
        style={{
          transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg) scale3d(${isHovered ? 1.02 : 1}, ${isHovered ? 1.02 : 1}, 1)`,
        }}
      >
        {/* Floating Badge 1: Top-Left */}
        <div className="absolute -top-6 -left-4 sm:-left-8 z-30 flex items-center gap-2.5 rounded-xl border border-cyan-500/30 bg-slate-900/85 px-3.5 py-2 shadow-xl transition-all duration-300 hover:scale-105 hover:border-cyan-400 [animation:badgeFloat1_6s_ease-in-out_infinite]">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <p className="text-[11px] font-semibold text-ink leading-tight">Tokenized Real Estate</p>
            </div>
            <p className="text-[10px] text-emerald-400 font-mono mt-0.5">8.4% APY &middot; $42.5M</p>
          </div>
        </div>

        {/* Floating Badge 2: Top-Right */}
        <div className="absolute -top-2 -right-4 sm:-right-8 z-30 flex items-center gap-2.5 rounded-xl border border-blue-500/30 bg-slate-900/85 px-3.5 py-2 shadow-xl transition-all duration-300 hover:scale-105 hover:border-blue-400 [animation:badgeFloat2_7s_ease-in-out_infinite_1s]">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-cyan-400">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-ink leading-tight">ERC-3643 Standard</p>
            <p className="text-[10px] text-cyan-300/90 mt-0.5">Identity & Compliance Verified</p>
          </div>
        </div>

        {/* Floating Badge 3: Bottom-Right */}
        <div className="absolute -bottom-4 right-2 sm:right-6 z-30 flex items-center gap-2.5 rounded-xl border border-teal-500/30 bg-slate-900/85 px-3.5 py-2 shadow-xl transition-all duration-300 hover:scale-105 hover:border-teal-400 [animation:badgeFloat3_6.5s_ease-in-out_infinite_0.5s]">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/20 text-teal-300">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-ink leading-tight">Instant Settlement</p>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">T+0 Atomic Transfer</p>
          </div>
        </div>

        {/* Main Image with floating and laser scanner */}
        <div className="relative overflow-hidden rounded-2xl [animation:floatY_6s_ease-in-out_infinite]">
          {/* Laser Scanner Line */}
          <div className="pointer-events-none absolute inset-x-0 h-10 z-20 bg-gradient-to-b from-transparent via-cyan-400/20 to-transparent [animation:scanline_7s_ease-in-out_infinite]" />

          <img
            src="/images/hero-rwa-illustration.png"
            alt="Tokenized real-world assets across real estate, treasuries, commodities and private credit"
            className="relative w-full max-w-md filter transition-all duration-300 select-none pointer-events-none"
          />
        </div>
      </div>
    </div>
  );
}
