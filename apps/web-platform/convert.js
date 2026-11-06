function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

const light = {
  background: '#f7f8fa',
  card: '#ffffff',
  'text-main': '#0b1220',
  'text-muted': '#5b6575',
  'border-line': '#e3e7ee',
  accent: '#1d4ed8',
  'accent-subtle': '#e8eefc',
  'button-bg': '#0b1220',
  'button-text': '#ffffff',
  'header-bg': '#f0f2f6',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#ef4444'
};

const dark = {
  background: '#0a0a0b',
  card: '#141417',
  'text-main': '#f4f4f5',
  'text-muted': '#a1a1aa',
  'border-line': '#27272c',
  accent: '#f5c542',
  'accent-subtle': '#2a2410',
  'button-bg': '#f5c542',
  'button-text': '#111111',
  'header-bg': '#1a1a1e',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#ef4444'
};

let css = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
`;
for (let [k, v] of Object.entries(light)) {
  css += `    --${k}: ${hexToRgb(v)};\n`;
}
css += `  }

  .dark {
`;
for (let [k, v] of Object.entries(dark)) {
  css += `    --${k}: ${hexToRgb(v)};\n`;
}
css += `  }
}

@layer base {
  * {
    border-color: rgb(var(--border-line));
  }
  html { scroll-behavior: smooth; }
  body {
    background-color: rgb(var(--background));
    color: rgb(var(--text-main));
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}

@layer components {
  .btn-primary {
    @apply inline-flex items-center justify-center rounded-xl bg-[rgb(var(--button-bg))] px-4 py-2 text-sm font-bold text-[rgb(var(--button-text))] shadow-sm transition-all hover:-translate-y-px active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50;
  }
  .btn-secondary {
    @apply inline-flex items-center justify-center rounded-xl border border-[rgb(var(--border-line))] bg-[rgb(var(--card))] px-4 py-2 text-sm font-semibold text-[rgb(var(--text-main))] transition-all hover:-translate-y-px active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50;
  }
  .btn-ghost {
    @apply inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-[rgb(var(--text-muted))] transition-colors hover:text-[rgb(var(--text-main))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50;
  }
  .card {
    @apply rounded-2xl border border-[rgb(var(--border-line))] bg-[rgb(var(--card))] shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-[rgb(var(--text-main))];
  }
  .input-field {
    @apply w-full rounded-xl border border-[rgb(var(--border-line))] bg-[rgb(var(--card))] px-3.5 py-2.5 text-sm text-[rgb(var(--text-main))] placeholder:text-[rgb(var(--text-muted))] focus:border-[rgb(var(--accent))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--accent))] transition-all;
  }
  .label {
    @apply text-xs font-bold uppercase tracking-widest text-[rgb(var(--accent))];
  }
}

@layer utilities {
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: rgb(var(--text-muted)) transparent;
  }
  .scrollbar-thin::-webkit-scrollbar { width: 6px; }
  .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: rgb(var(--text-muted));
    border-radius: 3px;
  }
}
`;

const fs = require('fs');
fs.writeFileSync('src/app/globals.css', css);
