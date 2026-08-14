'use client';

import type { JobPayload } from '@/lib/types';
import { TimestampButton } from './TimestampButton';
import { EmptyState } from './EmptyState';
import { OutputControls } from './OutputControls';

/**
 * The recap is the product. The transcript is source material — this is the
 * thing someone actually reads instead of listening to the recording.
 */
export function RecapView({
  payload,
  onSeek,
  onRegenerate,
  regenerating,
  error,
}: {
  payload: JobPayload;
  onSeek: (ms: number) => void;
  onRegenerate: (outputType: string, detail: string) => Promise<void>;
  regenerating: boolean;
  error: string | null;
}) {
  const analysis = payload.analysis;

  if (!analysis) {
    return (
      <EmptyState
        label="RECAP PENDING"
        detail="The transcript is stored, but no recap has been generated from it yet."
      />
    );
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-16">
      <div className="max-w-2xl">
        {analysis.executiveSummary.length ? (
          <section>
            <SectionLabel>EXECUTIVE SUMMARY</SectionLabel>
            <div className="mt-5 space-y-4">
              {analysis.executiveSummary.map((paragraph, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-paper/90">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {analysis.mostImportant.length ? (
          <section className="mt-14">
            <SectionLabel>WHAT MATTERS MOST</SectionLabel>
            <ol className="mt-5 border-t border-line">
              {analysis.mostImportant.map((item, i) => (
                <li key={i} className="flex gap-5 border-b border-line py-5">
                  <span className="data text-2xl font-medium leading-none text-gray-faint">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-medium">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray">{item.explanation}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {analysis.keyTakeaways.length ? (
          <section className="mt-14">
            <SectionLabel>KEY TAKEAWAYS</SectionLabel>
            <ul className="mt-5 space-y-6">
              {analysis.keyTakeaways.map((takeaway, i) => (
                <li key={i}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                    <h3 className="font-display text-sm font-medium uppercase tracking-[0.06em]">
                      {takeaway.title}
                    </h3>
                    {takeaway.timestamps.slice(0, 1).map((stamp, j) => (
                      <TimestampButton
                        key={j}
                        startMs={stamp.startMs}
                        endMs={stamp.endMs}
                        onSeek={onSeek}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-gray">{takeaway.explanation}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {analysis.recommendedActions.length ? (
          <section className="mt-14">
            <SectionLabel>RECOMMENDED ACTIONS</SectionLabel>
            <ul className="mt-5 border-t border-line">
              {analysis.recommendedActions.map((action, i) => (
                <li
                  key={i}
                  className="flex items-start justify-between gap-4 border-b border-line py-3.5"
                >
                  <span className="flex min-w-0 gap-3">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 bg-accent" />
                    <span className="text-sm leading-relaxed text-paper/90">{action.action}</span>
                  </span>
                  {action.sourceTimestamp ? (
                    <TimestampButton
                      startMs={action.sourceTimestamp.startMs}
                      onSeek={onSeek}
                      className="shrink-0"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="mt-14">
            <SectionLabel>RECOMMENDED ACTIONS</SectionLabel>
            <p className="mt-4 text-sm leading-relaxed text-gray-dim">
              This recording did not contain clear action items, so none were invented.
            </p>
          </section>
        )}

        {analysis.topics.length ? (
          <section className="mt-14">
            <SectionLabel>TOPICS</SectionLabel>
            <ul className="mt-4 flex flex-wrap gap-2">
              {analysis.topics.map((topic) => (
                <li key={topic} className="label border border-line px-2.5 py-1.5">
                  {topic}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <OutputControls
          current={{ outputType: analysis.outputType, detail: analysis.detail }}
          onRegenerate={onRegenerate}
          busy={regenerating}
          error={error}
        />
      </aside>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="label label-lit">{children}</h2>
      <span aria-hidden className="dot-rule flex-1" />
    </div>
  );
}
