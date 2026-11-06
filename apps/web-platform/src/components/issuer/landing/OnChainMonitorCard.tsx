'use client';

import { useState, useEffect } from 'react';
import { Shield, Copy, Check, Activity, Terminal } from 'lucide-react';

export function OnChainMonitorCard() {
  const [copied, setCopied] = useState(false);
  const [blockNumber, setBlockNumber] = useState(21849203);
  const contractAddress = '0x742d35Cc6634C0532925a3b844Bc454e44383b2f';

  // Increment simulated block number periodically
  useEffect(() => {
    const timer = setInterval(() => {
      setBlockNumber((prev) => prev + 1);
    }, 12000);
    return () => clearInterval(timer);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rows = [
    { label: 'Token Status', value: 'Active', color: 'text-emerald-400', badge: 'Validated' },
    { label: 'Contract', value: '0x742d...3b2f', color: 'text-blue-400', canCopy: true },
    { label: 'Total Supply', value: '10,000,000 REIT', color: 'text-ink' },
    { label: 'Holders', value: '1,247 KYC Verified', color: 'text-ink' },
    { label: 'Compliance', value: 'All rules active', color: 'text-emerald-400' },
    { label: 'Chain', value: 'Ethereum Mainnet', color: 'text-violet-400' },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-surface-alt p-6 sm:p-8 shadow-2xl transition-all duration-300 hover:border-slate-700/80">
      {/* Top ambient glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-blue-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />

      {/* Terminal Title Bar */}
      <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            ERC-3643 On-Chain Telemetry
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            Block #{blockNumber.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Data Rows */}
      <div className="space-y-3.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="group flex items-center justify-between rounded-lg border border-transparent p-2 transition-all duration-200 hover:border-slate-800/80 hover:bg-slate-800/40"
          >
            <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
              {row.label}
            </span>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-sm font-medium ${row.color}`}>
                {row.value}
              </span>
              {row.canCopy && (
                <button
                  type="button"
                  onClick={handleCopy}
                  title="Copy contract address"
                  className="rounded p-1 text-slate-500 hover:bg-slate-700/50 hover:text-slate-200 transition-colors"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Telemetry Pulse Wave */}
      <div className="mt-5 border-t border-slate-800/70 pt-4">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
            Transfer Rule Validator
          </span>
          <span className="font-mono text-emerald-400">0 ms latency</span>
        </div>

        {/* SVG Animated Heartbeat Graph */}
        <div className="relative h-8 w-full overflow-hidden rounded bg-slate-950/60 border border-slate-800/50 px-2 flex items-center">
          <svg
            className="h-full w-full"
            viewBox="0 0 300 30"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#6ee7b7" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.3" />
              </linearGradient>
            </defs>
            <path
              d="M0,15 L40,15 L50,8 L60,22 L70,12 L80,18 L90,15 L140,15 L150,5 L160,25 L170,10 L180,20 L190,15 L240,15 L250,7 L260,23 L270,15 L300,15"
              fill="none"
              stroke="url(#waveGradient)"
              strokeWidth="2"
              className="[animation:heartbeat_4s_linear_infinite]"
              strokeDasharray="600"
            />
          </svg>
        </div>
      </div>

      {/* Compliance Badge */}
      <div className="mt-5 flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 [animation:pulseSoft_2s_ease-in-out_infinite]" />
          <span className="font-medium">All compliance checks passing</span>
        </div>
        <span className="text-[11px] font-mono rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">
          SEC &middot; SEBI &middot; MiCA
        </span>
      </div>
    </div>
  );
}
