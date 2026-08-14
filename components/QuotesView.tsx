'use client';

import type { JobPayload } from '@/lib/types';
import { TimestampButton } from './TimestampButton';
import { CopyButton } from './CopyButton';

/**
 * Notable quotes.
 *
 * Every quote shown here was matched word-for-word against the stored
 * transcript before it was saved; anything the model paraphrased was discarded
 * rather than shown in quotation marks. That is why an empty state here says
 * "none were found" and never fills the space with something plausible.
 */
export function QuotesView({
  payload,
  onSeek,
}: {
  payload: JobPayload;
  onSeek: (ms: number) => void;
}) {
  const quotes = payload.analysis?.quotes ?? [];

  const nameFor = (label?: string) => {
    if (!label) return null;
    const speaker = payload.speakers.find((s) => s.providerLabel === label);
    return speaker ? speaker.displayName || speaker.providerLabel : label;
  };

  if (!quotes.length) {
    return (
      <div className="border border-line px-6 py-16 text-center">
        <p className="label label-lit">NO VERBATIM QUOTES</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray">
          No strong quotes were identified in this recording. Quotes are only kept when they match
          the transcript word for word, so nothing has been paraphrased to fill this space.
        </p>
      </div>
    );
  }

  return (
    <div className="grid max-w-4xl gap-px bg-line sm:grid-cols-2">
      {quotes.map((quote, i) => {
        const who = nameFor(quote.speakerId);
        return (
          <figure key={i} className="flex flex-col justify-between bg-ink p-6">
            <blockquote className="font-display text-lg leading-snug text-paper">
              <span aria-hidden className="mr-1 text-accent">
                “
              </span>
              {quote.quote}
              <span aria-hidden className="ml-0.5 text-accent">
                ”
              </span>
            </blockquote>

            <figcaption className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-3">
              <span className="min-w-0">
                <span className="label label-lit block truncate">{who ?? 'UNATTRIBUTED'}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <TimestampButton startMs={quote.startMs} onSeek={onSeek} />
                <CopyButton
                  value={who ? `“${quote.quote}” — ${who}` : `“${quote.quote}”`}
                  label="Copy"
                  compact
                />
              </span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
