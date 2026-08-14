'use client';

import { useState } from 'react';
import type { JobPayload } from '@/lib/types';
import { DERIVATIVE_KINDS, type DerivativeKind } from '@/lib/analysis/kinds';
import { formatDate } from '@/lib/format';
import { CopyButton } from './CopyButton';
import { Markdown } from './Markdown';
import { EmptyState } from './EmptyState';

/**
 * Pieces written from the finished recap: an email to send, a post to publish,
 * a handout to teach from.
 *
 * Each is generated on demand rather than during processing — most recordings
 * never need any of them, and one model call per recording that does is
 * cheaper than three per recording that does not.
 */
export function GenerateView({
  payload,
  onGenerate,
  busyKind,
  error,
}: {
  payload: JobPayload;
  onGenerate: (kind: DerivativeKind) => Promise<void>;
  busyKind: DerivativeKind | null;
  error: string | null;
}) {
  const [open, setOpen] = useState<DerivativeKind>(
    (payload.derivatives[0]?.kind as DerivativeKind) ?? 'email',
  );

  if (!payload.analysis) {
    return (
      <EmptyState
        label="RECAP REQUIRED"
        detail="These are written from the recap, so the recap has to exist first."
      />
    );
  }

  const active = DERIVATIVE_KINDS.find((k) => k.value === open)!;
  const existing = payload.derivatives.find((d) => d.kind === open);
  const busy = busyKind === open;

  return (
    <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
      <nav className="lg:order-first">
        <p className="label label-lit">GENERATE</p>
        <ul className="mt-4 space-y-1">
          {DERIVATIVE_KINDS.map((kind) => {
            const made = payload.derivatives.some((d) => d.kind === kind.value);
            return (
              <li key={kind.value}>
                <button
                  type="button"
                  onClick={() => setOpen(kind.value)}
                  className={`flex w-full items-center gap-2.5 px-2 py-2.5 text-left text-xs transition-colors ${
                    open === kind.value ? 'bg-ink-raised text-paper' : 'text-gray hover:text-paper'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      busyKind === kind.value
                        ? 'pulse-dot bg-accent'
                        : made
                          ? 'bg-accent'
                          : 'border border-gray-faint'
                    }`}
                  />
                  {kind.label}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-gray-dim">
          {active.description}
        </p>
      </nav>

      <div className="min-w-0">
        {existing ? (
          <article>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
              <div className="min-w-0">
                <p className="label label-lit">{active.titleLabel}</p>
                <h2 className="mt-2 font-display text-lg font-medium leading-snug">
                  {existing.title || active.label}
                </h2>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <CopyButton
                  value={() =>
                    existing.title ? `${existing.title}\n\n${existing.body}` : existing.body
                  }
                  label="Copy"
                />
                <button
                  type="button"
                  onClick={() => onGenerate(open)}
                  disabled={busy}
                  className="label flex items-center gap-2 border border-line px-3 py-2 transition-colors hover:border-line-lit hover:text-paper disabled:opacity-40"
                >
                  {busy ? (
                    <>
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
                      Rewriting
                    </>
                  ) : (
                    'Rewrite'
                  )}
                </button>
              </div>
            </div>

            <div className="mt-6 max-w-2xl">
              <Markdown source={existing.body} />
            </div>

            <p className="label mt-8 border-t border-line pt-4">
              GENERATED {formatDate(existing.createdAt)}
              {existing.model ? ` · ${existing.model}` : ''}
            </p>
          </article>
        ) : (
          <div className="border border-line px-6 py-16 text-center">
            <p className="label label-lit">NOT GENERATED</p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-gray">
              {active.description} Written from the recap, so it takes a few seconds rather than a
              reprocess.
            </p>
            <button
              type="button"
              onClick={() => onGenerate(open)}
              disabled={busy}
              className="label mt-6 inline-flex items-center gap-2 border border-line px-5 py-3 transition-colors hover:border-line-lit hover:text-paper disabled:opacity-40"
            >
              {busy ? (
                <>
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
                  Writing
                </>
              ) : (
                `Generate ${active.label.toLowerCase()}`
              )}
            </button>
          </div>
        )}

        {error ? (
          <p className="mt-4 border border-accent px-4 py-3 text-sm text-accent" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
