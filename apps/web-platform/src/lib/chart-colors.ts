/**
 * Categorical series colours, shared by every chart in the platform.
 *
 * Light and dark variants are selected for the current card surfaces in
 * `globals.css` (`#ffffff` light and `#122a20` dark), rather than flipped
 * automatically. Keep direct labels or a table alongside charts whose series
 * colors do not meet the 3:1 non-text contrast target.
 *
 * Three light-mode slots sit under 3:1 against white, so any chart using them
 * owes the relief rule: visible direct labels or a table view beside the chart.
 *
 * Slots are assigned to an entity in a fixed order and never cycled — a filter
 * that drops a series must not repaint the ones that survive. Past the last
 * slot, fold the remainder into a single "Other" bucket.
 */
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];

/**
 * Neutral grey for the folded "Other" bucket — deliberately NOT a categorical
 * hue. It fails the validator's chroma floor on purpose: "Other" is an absence
 * of identity, so giving it a hue would read as a seventh real series. Keep it
 * grey; validate the six slots above without it.
 */
export const SERIES_OTHER_LIGHT = '#6b7280';
export const SERIES_OTHER_DARK = '#8b8b93';

export const seriesFor = (resolvedTheme?: string) =>
  resolvedTheme === 'dark' ? SERIES_DARK : SERIES_LIGHT;

export const otherFor = (resolvedTheme?: string) =>
  resolvedTheme === 'dark' ? SERIES_OTHER_DARK : SERIES_OTHER_LIGHT;

/** Shared Recharts tooltip surface, themed off the CSS custom properties. */
export const chartTooltipStyle = {
  backgroundColor: 'rgb(var(--card))',
  border: '1px solid rgb(var(--border-line))',
  borderRadius: '12px',
  color: 'rgb(var(--text-main))',
  fontSize: '12px',
  boxShadow: 'var(--shadow-card)',
};
