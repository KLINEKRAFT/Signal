'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Detects a logo asset that failed to load.
 *
 * `onError` alone is not enough: the image is server-rendered, so a missing
 * file 404s before React hydrates and the event is lost — leaving a broken
 * image icon where the wordmark should be. Checking `complete && naturalWidth
 * === 0` after mount catches the load that already failed; the handler catches
 * any that fail afterwards.
 */
function useAssetPresent() {
  const ref = useRef<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);

  const check = useCallback((node: HTMLImageElement | null) => {
    ref.current = node;
    if (node?.complete && node.naturalWidth === 0) setFailed(true);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (node?.complete && node.naturalWidth === 0) setFailed(true);
  }, []);

  return { failed, setFailed, check };
}

/**
 * SIGNAL wordmark.
 *
 * If /public/signal-logo.svg exists it is rendered as supplied — never redrawn,
 * recoloured, or reconstructed. Until then this falls back to the wordmark set
 * in the display face, which is typography rather than an invented logo.
 */
export function BrandMark({ className = '' }: { className?: string }) {
  const { failed, setFailed, check } = useAssetPresent();

  if (failed) {
    return (
      <span
        className={`font-display text-[15px] font-bold tracking-[0.28em] text-paper ${className}`}
      >
        SIGNAL
      </span>
    );
  }

  return (
    // Plain img on purpose: the asset is an SVG of unknown intrinsic size and
    // must not be resampled or optimized.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={check}
      src="/signal-logo.svg"
      alt="SIGNAL"
      className={`h-[18px] w-auto ${className}`}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Maker's mark. Quiet, footer-only — SIGNAL owns the interface, KLINEKRAFT
 * signs it. The supplied logo is used as-is if present.
 */
export function MakerMark({ className = '' }: { className?: string }) {
  const { failed, setFailed, check } = useAssetPresent();

  if (failed) {
    return <span className={`label tracking-[0.22em] ${className}`}>KLINEKRAFT</span>;
  }

  return (
    // Intrinsic dimensions are declared so the footer reserves the right space
    // before the asset loads; `h-*`/`w-auto` then scales it from that ratio.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={check}
      src="/klinekraft-logo.png"
      alt="KLINEKRAFT"
      width={466}
      height={127}
      className={`h-4 w-auto opacity-45 transition-opacity hover:opacity-80 ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
