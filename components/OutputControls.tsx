'use client';

import { useState } from 'react';
import { DETAIL_LEVELS, OUTPUT_TYPES } from '@/lib/analysis/prompts';

/**
 * Output type and detail level.
 *
 * Regenerating runs the analysis pass again against the stored transcript — it
 * never re-transcribes, which is why changing your mind here costs seconds and
 * fractions of a cent rather than a reprocess.
 */
export function OutputControls({
  current,
  onRegenerate,
  busy,
  error,
}: {
  current: { outputType: string; detail: string };
  onRegenerate: (outputType: string, detail: string) => Promise<void>;
  busy: boolean;
  error: string | null;
}) {
  const [outputType, setOutputType] = useState(current.outputType);
  const [detail, setDetail] = useState(current.detail);

  const dirty = outputType !== current.outputType || detail !== current.detail;
  const active = OUTPUT_TYPES.find((o) => o.value === outputType);

  return (
    <div className="border border-line p-4">
      <p className="label label-lit">OUTPUT</p>

      <div className="mt-4 space-y-1">
        {OUTPUT_TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setOutputType(option.value)}
            className={`flex w-full items-center gap-2.5 px-2 py-2 text-left text-xs transition-colors ${
              outputType === option.value
                ? 'bg-ink-raised text-paper'
                : 'text-gray hover:text-paper'
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                outputType === option.value ? 'bg-accent' : 'border border-gray-faint'
              }`}
            />
            {option.label}
          </button>
        ))}
      </div>

      {active ? (
        <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-gray-dim">
          {active.description}
        </p>
      ) : null}

      <p className="label label-lit mt-6">DETAIL</p>
      <div className="mt-3 grid grid-cols-3 border border-line">
        {DETAIL_LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            onClick={() => setDetail(level.value)}
            className={`label py-2.5 transition-colors ${
              detail === level.value ? 'bg-paper text-ink' : 'hover:text-paper'
            }`}
          >
            {level.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onRegenerate(outputType, detail)}
        disabled={busy || !dirty}
        className="label mt-4 flex w-full items-center justify-center gap-2 border border-line py-3 transition-colors hover:border-line-lit hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <>
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
            Regenerating
          </>
        ) : (
          'Regenerate recap'
        )}
      </button>

      {!dirty && !busy ? (
        <p className="mt-2 text-center text-[11px] text-gray-dim">
          Change output or detail to regenerate.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 border border-accent px-3 py-2 text-xs leading-relaxed text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}
