import {
  Building2,
  Gem,
  Landmark,
  TrendingUp,
  Palette,
  Factory,
  Coins,
  type LucideIcon,
} from 'lucide-react';

/**
 * The asset classes an offering can belong to. The order is fixed: chart
 * colour slots are assigned by index, so reordering this list would repaint
 * every existing chart. Append new classes at the end.
 */
export const ASSET_CLASSES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'real_estate', label: 'Real Estate', icon: Building2 },
  { key: 'commodity', label: 'Commodities', icon: Gem },
  { key: 'bond', label: 'Bonds', icon: Landmark },
  { key: 'equity', label: 'Equities', icon: TrendingUp },
  { key: 'art', label: 'Art & Collectibles', icon: Palette },
  { key: 'infrastructure', label: 'Infrastructure', icon: Factory },
];

export const assetClassFor = (key?: string | null) =>
  ASSET_CLASSES.find((c) => c.key === key);

/**
 * A readable label for an asset class. Unknown keys are title-cased rather
 * than shown raw, so a backend value like `student_housing` reads as
 * "Student Housing" instead of leaking snake_case into the UI.
 */
export const assetClassLabel = (key?: string | null) => {
  if (!key) return null;
  const known = assetClassFor(key);
  if (known) return known.label;
  return key
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const assetClassIcon = (key?: string | null): LucideIcon =>
  assetClassFor(key)?.icon ?? Coins;
