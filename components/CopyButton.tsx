'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copy control. Confirms by changing its own label for a moment rather than
 * raising a toast — the feedback belongs where the action happened.
 */
export function CopyButton({
  value,
  label = 'Copy',
  className = '',
  compact,
}: {
  value: string | (() => string);
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(async () => {
    const text = typeof value === 'function' ? value() : value;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
    } catch {
      // Clipboard access is denied in some embedded browsers; say so rather
      // than claiming success.
      setFailed(true);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      className={`label border border-line transition-colors hover:border-line-lit hover:text-paper ${
        compact ? 'px-2 py-1.5' : 'px-3 py-2'
      } ${copied ? 'border-line-lit text-paper' : ''} ${failed ? 'border-accent text-accent' : ''} ${className}`}
    >
      {failed ? 'Copy failed' : copied ? 'Copied' : label}
    </button>
  );
}
