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

let cssVars = `  :root {\n`;
for (let [k, v] of Object.entries(light)) {
  cssVars += `    --${k}: ${hexToRgb(v)};\n`;
}
cssVars += `  }\n\n  .dark {\n`;
for (let [k, v] of Object.entries(dark)) {
  cssVars += `    --${k}: ${hexToRgb(v)};\n`;
}
cssVars += `  }`;

const fs = require('fs');
let file = fs.readFileSync('src/app/globals.css', 'utf8');
file = file.replace(/:root\s*\{[\s\S]*?--warning:\s*#f59e0b;\n\}/, cssVars);
file = file.replace(/background-color: var\(--background\);/, 'background-color: rgb(var(--background));');
file = file.replace(/color: var\(--foreground\);/, 'color: rgb(var(--text-main));');
file = file.replace(/border-color: var\(--border\);/, 'border-color: rgb(var(--border-line));');

fs.writeFileSync('src/app/globals.css', file);
