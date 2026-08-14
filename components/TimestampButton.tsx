'use client';

import { formatTimestamp } from '@/lib/format';

/**
 * A timestamp is the verification affordance of the whole product: every
 * AI-generated claim carries one, and clicking it takes you to the moment in
 * the transcript it came from. So it is always a control, never plain text.
 */
export function TimestampButton({
  startMs,
  endMs,
  onSeek,
  className = '',
}: {
  startMs: number;
  endMs?: number;
  onSeek?: (ms: number) => void;
  className?: string;
}) {
  const text = endMs
    ? `${formatTimestamp(startMs)}–${formatTimestamp(endMs)}`
    : formatTimestamp(startMs);

  if (!onSeek) {
    return <span className={`data text-[11px] text-gray-dim ${className}`}>{text}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onSeek(startMs)}
      title="Jump to this moment in the transcript"
      className={`data border border-line px-2 py-1 text-[11px] text-gray transition-colors hover:border-accent hover:text-accent ${className}`}
    >
      {text}
    </button>
  );
}
