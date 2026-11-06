import type { Config } from 'tailwindcss';

/**
 * Palette is driven entirely by the CSS variables in src/app/globals.css, which
 * carry the assetro RWA reference design tokens (light default, `.dark` override).
 *
 * Two groups of names exist on purpose:
 *  - Semantic names (`surface`, `card`, `line`, `muted`, `accent`, `success`, …)
 *    are what new/migrated code should use.
 *  - The legacy `slate`/`blue`/`cyan`/`primary` scales are remapped onto the same
 *    variables so pages that still use raw Tailwind palettes keep theming
 *    correctly while they are migrated.
 */

const withAlpha = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const accentScale = {
  50: withAlpha('--accent-subtle'),
  100: withAlpha('--accent-subtle'),
  200: withAlpha('--accent-subtle'),
  300: withAlpha('--accent'),
  400: withAlpha('--accent'),
  500: withAlpha('--accent'),
  600: withAlpha('--accent'),
  700: withAlpha('--accent'),
  800: withAlpha('--accent'),
  900: withAlpha('--accent'),
  950: withAlpha('--accent'),
};

/** Status scales: low shades are the tint, mid/high shades the solid colour. */
const statusScale = (solid: string, subtle: string) => ({
  50: withAlpha(subtle),
  100: withAlpha(subtle),
  200: withAlpha(subtle),
  300: withAlpha(solid),
  400: withAlpha(solid),
  500: withAlpha(solid),
  600: withAlpha(solid),
  700: withAlpha(solid),
  800: withAlpha(solid),
  900: withAlpha(solid),
  950: withAlpha(solid),
  DEFAULT: withAlpha(solid),
});

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Semantic (preferred) ──────────────────────────────────────────
        surface: {
          DEFAULT: withAlpha('--background'),
          alt: withAlpha('--surface-alt'),
          header: withAlpha('--header-bg'),
        },
        card: withAlpha('--card'),
        line: withAlpha('--border-line'),
        muted: withAlpha('--text-muted'),
        ink: withAlpha('--text-main'),
        accent: {
          ...accentScale,
          DEFAULT: withAlpha('--accent'),
          soft: withAlpha('--accent-subtle'),
          alt: withAlpha('--accent2'),
        },
        btn: {
          DEFAULT: withAlpha('--button-bg'),
          text: withAlpha('--button-text'),
        },
        success: statusScale('--success', '--success-subtle'),
        warning: statusScale('--warning', '--warning-subtle'),
        danger: statusScale('--danger', '--danger-subtle'),

        // ── Legacy remaps, kept so un-migrated pages still theme ──────────
        slate: {
          50: withAlpha('--header-bg'),
          100: withAlpha('--header-bg'),
          200: withAlpha('--text-main'),
          300: withAlpha('--text-main'),
          400: withAlpha('--text-muted'),
          500: withAlpha('--text-muted'),
          600: withAlpha('--border-line'),
          700: withAlpha('--border-line'),
          800: withAlpha('--neutral-800'),
          900: withAlpha('--card'),
          950: withAlpha('--background'),
        },
        gray: {
          50: withAlpha('--header-bg'),
          100: withAlpha('--header-bg'),
          200: withAlpha('--text-main'),
          300: withAlpha('--text-main'),
          400: withAlpha('--text-muted'),
          500: withAlpha('--text-muted'),
          600: withAlpha('--border-line'),
          700: withAlpha('--border-line'),
          800: withAlpha('--neutral-800'),
          900: withAlpha('--card'),
          950: withAlpha('--background'),
        },
        zinc: {
          50: withAlpha('--header-bg'),
          100: withAlpha('--header-bg'),
          200: withAlpha('--text-main'),
          300: withAlpha('--text-main'),
          400: withAlpha('--text-muted'),
          500: withAlpha('--text-muted'),
          600: withAlpha('--border-line'),
          700: withAlpha('--border-line'),
          800: withAlpha('--neutral-800'),
          900: withAlpha('--card'),
          950: withAlpha('--background'),
        },
        blue: accentScale,
        indigo: accentScale,
        cyan: {
          50: withAlpha('--accent-subtle'),
          100: withAlpha('--accent-subtle'),
          200: withAlpha('--accent-subtle'),
          300: withAlpha('--accent2'),
          400: withAlpha('--accent2'),
          500: withAlpha('--accent2'),
          600: withAlpha('--accent2'),
          700: withAlpha('--accent2'),
          800: withAlpha('--accent2'),
          900: withAlpha('--accent2'),
          950: withAlpha('--accent2'),
        },
        primary: {
          50: withAlpha('--accent-subtle'),
          100: withAlpha('--accent-subtle'),
          200: withAlpha('--accent-subtle'),
          300: withAlpha('--button-bg'),
          400: withAlpha('--button-bg'),
          500: withAlpha('--button-bg'),
          600: withAlpha('--button-bg'),
          700: withAlpha('--button-bg'),
          800: withAlpha('--button-bg'),
          900: withAlpha('--button-bg'),
          950: withAlpha('--button-bg'),
        },
        // Status palettes used across the app — now theme-aware.
        green: statusScale('--success', '--success-subtle'),
        emerald: statusScale('--success', '--success-subtle'),
        red: statusScale('--danger', '--danger-subtle'),
        rose: statusScale('--danger', '--danger-subtle'),
        amber: statusScale('--warning', '--warning-subtle'),
        yellow: statusScale('--warning', '--warning-subtle'),
        orange: statusScale('--warning', '--warning-subtle'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        card: 'var(--radius-card)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      maxWidth: {
        // Reference `.w` container
        shell: '1120px',
      },
    },
  },
  plugins: [],
};

export default config;
