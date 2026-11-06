import Image from 'next/image';

export function BrandMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/assetro-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
