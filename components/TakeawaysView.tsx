'use client';

import type { JobPayload } from '@/lib/types';
import { TimestampButton } from './TimestampButton';
import { CopyButton } from './CopyButton';
import { EmptyState } from './EmptyState';

/**
 * Takeaways, expanded. Every one carries the timestamps it was drawn from —
 * the point of a timestamp here is verification, not navigation, so a reader
 * can always check an AI-generated claim against what was actually said.
 */
export function TakeawaysView({
  payload,
  onSeek,
}: {
  payload: JobPayload;
  onSeek: (ms: number) => void;
}) {
  const takeaways = payload.analysis?.keyTakeaways ?? [];

  if (!takeaways.length) {
    return (
      <EmptyState
        label="NO TAKEAWAYS"
        detail="No distinct takeaways were identified in this recording."
      />
    );
  }

  return (
    <div className="max-w-3xl">
      <ol className="border-t border-line">
        {takeaways.map((takeaway, i) => (
          <li key={i} className="border-b border-line py-7">
            <div className="flex gap-5">
              <span className="data w-8 shrink-0 text-2xl font-medium leading-none text-gray-faint">
                {String(i + 1).padStart(2, '0')}
              </span>

              <div className="min-w-0 flex-1">
                <h3 className="font-display text-base font-medium uppercase tracking-[0.06em] leading-snug">
                  {takeaway.title}
                </h3>

                <p className="mt-3 text-[15px] leading-relaxed text-paper/85">
                  {takeaway.explanation}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {takeaway.timestamps.length ? (
                    takeaway.timestamps.map((stamp, j) => (
                      <TimestampButton
                        key={j}
                        startMs={stamp.startMs}
                        endMs={stamp.endMs}
                        onSeek={onSeek}
                      />
                    ))
                  ) : (
                    <span className="label">NO SOURCE TIMESTAMP</span>
                  )}

                  <CopyButton
                    value={`${takeaway.title}\n\n${takeaway.explanation}`}
                    label="Copy"
                    compact
                    className="ml-auto"
                  />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
