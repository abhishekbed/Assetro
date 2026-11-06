'use client';

import { useState } from 'react';
import { assetClassIcon } from '@/lib/asset-classes';
import { getMediaUrl } from '@/lib/media';

/**
 * The cover image for an offering.
 *
 * Issuers upload a single image per token, and in practice it is one of two
 * very different things: a photograph of the underlying asset (a building, a
 * warehouse) or a square/transparent brand mark. Cropping a logo to a 16:9
 * band looks broken, and letterboxing a photograph wastes the card's best
 * space — so the image reports its own dimensions on load and is fitted
 * accordingly:
 *
 *   - wide or tall photograph  → `object-cover`, fills the band edge to edge
 *   - roughly square / small   → `object-contain` on a tinted backdrop, with a
 *                                blurred copy behind it so the band still
 *                                reads as a filled surface rather than a gap
 *
 * A missing or broken image falls back to the asset-class icon.
 */
export function TokenMedia({
  src,
  alt,
  assetType,
  className = '',
}: {
  src?: string | null;
  alt: string;
  assetType?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = assetClassIcon(assetType);
  const mediaUrl = getMediaUrl(src);

  if (!mediaUrl || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-header ${className}`}
        aria-hidden="true"
      >
        <Icon className="h-9 w-9 text-muted opacity-60" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-surface-header ${className}`}>
      <img
        src={mediaUrl}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    </div>
  );
}
