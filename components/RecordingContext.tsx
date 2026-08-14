'use client';

import { useState } from 'react';

export type ContextValue = {
  title: string;
  speakers: string;
  description: string;
  vocabulary: string;
};

export const emptyContext: ContextValue = {
  title: '',
  speakers: '',
  description: '',
  vocabulary: '',
};

/**
 * Entirely optional and collapsed by default. Nobody should have to fill in a
 * form to process a recording — but names and jargon measurably improve both
 * transcription and analysis, so the door is one tap away.
 */
export function RecordingContext({
  value,
  onChange,
  disabled,
}: {
  value: ContextValue;
  onChange: (next: ContextValue) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const set = (key: keyof ContextValue) => (v: string) => onChange({ ...value, [key]: v });

  return (
    <section className="border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-ink-raised sm:px-5"
      >
        <span>
          <span className="label label-lit">RECORDING INFORMATION</span>
          <span className="mt-1 block text-sm text-gray">
            Optional. Names and terminology improve the transcript.
          </span>
        </span>
        <span className="label ml-4 shrink-0">{open ? 'HIDE' : 'ADD'}</span>
      </button>

      {open ? (
        <div className="grid gap-5 border-t border-line p-4 sm:p-5">
          <Field
            label="RECORDING TITLE"
            placeholder="Who's In Your Corner — UAD 3.6"
            value={value.title}
            onChange={set('title')}
            disabled={disabled}
          />
          <Field
            label="SPEAKERS"
            placeholder={'Bryan Sheppard — Host\nTony Pollard — Guest'}
            value={value.speakers}
            onChange={set('speakers')}
            disabled={disabled}
            multiline
            hint="One per line. You can rename speakers after transcription too."
          />
          <Field
            label="RECORDING CONTEXT"
            placeholder="Weekly podcast discussing changes to residential appraisals."
            value={value.description}
            onChange={set('description')}
            disabled={disabled}
            multiline
          />
          <Field
            label="VOCABULARY / NAMES"
            placeholder={'UAD 3.6\nFannie Mae\nCorelogic'}
            value={value.vocabulary}
            onChange={set('vocabulary')}
            disabled={disabled}
            multiline
            hint="Acronyms, brands, and proper nouns the transcriber should expect."
          />
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  disabled,
  multiline,
  hint,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  hint?: string;
}) {
  const shared =
    'mt-2 w-full border border-line px-3 py-3 text-sm text-paper transition-colors focus:border-line-lit focus:outline-none disabled:opacity-50';

  return (
    <label className="block">
      <span className="label label-lit">{label}</span>
      {multiline ? (
        <textarea
          rows={3}
          className={`${shared} resize-y leading-relaxed`}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type="text"
          className={shared}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint ? <span className="mt-2 block text-xs text-gray-dim">{hint}</span> : null}
    </label>
  );
}
