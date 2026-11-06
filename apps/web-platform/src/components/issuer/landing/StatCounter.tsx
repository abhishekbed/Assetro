'use client';

import { useEffect, useRef, useState } from 'react';

interface StatCounterProps {
  value: string;
  label: string;
}

export function StatCounter({ value, label }: StatCounterProps) {
  const [displayValue, setDisplayValue] = useState('0');
  const [hasAnimated, setHasAnimated] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Parse prefix, number, and suffix
  // Examples: "500+", "$10B+", "50+", "1M+"
  const match = value.match(/^([^0-9.]*)(\d+(?:\.\d+)?)(.*)$/);
  const prefix = match ? match[1] : '';
  const targetNumber = match ? parseFloat(match[2]) : 0;
  const suffix = match ? match[3] : '';

  useEffect(() => {
    const el = containerRef.current;
    if (!el || hasAnimated) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasAnimated(true);
          observer.disconnect();

          const duration = 1600; // ms
          const startTime = performance.now();

          const update = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out quart
            const easeProgress = 1 - Math.pow(1 - progress, 4);
            const current = Math.round(easeProgress * targetNumber);

            setDisplayValue(`${prefix}${current}${suffix}`);

            if (progress < 1) {
              requestAnimationFrame(update);
            } else {
              setDisplayValue(value);
            }
          };

          requestAnimationFrame(update);
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasAnimated, prefix, suffix, targetNumber, value]);

  return (
    <div
      ref={containerRef}
      className="group relative overflow-hidden rounded-xl p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:bg-slate-800/40"
    >
      <div className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-b from-blue-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <p className="text-3xl font-extrabold text-ink sm:text-4xl transition-all duration-300 group-hover:scale-105">
        {hasAnimated ? displayValue : value}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">
        {label}
      </p>
    </div>
  );
}
