'use client';

import { useCallback, useRef, useState } from 'react';
import { SUPPORTED_SUMMARY, ACCEPTED_MIME_PREFIXES } from '@/lib/constants';

export function UploadDropzone({
  onFile,
  error,
}: {
  onFile: (file: File) => void;
  error?: string | null;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      onFile(file);
    },
    [onFile],
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop media, or browse for a file"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        className={`dot-field group relative flex min-h-[280px] cursor-pointer select-none flex-col items-center justify-center border px-6 py-14 text-center transition-colors sm:min-h-[360px] ${
          dragging
            ? 'dot-field-dense border-accent bg-ink-raised'
            : 'border-line hover:border-line-lit'
        }`}
      >
        {/* Corner ticks — the frame reads as a machined part, not a card. */}
        <Corner className="left-0 top-0 border-l border-t" lit={dragging} />
        <Corner className="right-0 top-0 border-r border-t" lit={dragging} />
        <Corner className="bottom-0 left-0 border-b border-l" lit={dragging} />
        <Corner className="bottom-0 right-0 border-b border-r" lit={dragging} />

        <p className="font-display text-2xl font-medium tracking-[0.14em] sm:text-3xl">
          DROP MEDIA
        </p>
        <p className="label label-lit mt-3">VIDEO / AUDIO</p>
        <p className="mt-8 text-sm text-gray">
          <span className="underline decoration-gray-dim underline-offset-4 group-hover:decoration-paper">
            Click to browse
          </span>
        </p>

        <div className="absolute inset-x-0 bottom-0 border-t border-line px-4 py-3">
          <p className="label truncate">{SUPPORTED_SUMMARY}</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME_PREFIXES.map((p) => `${p}*`).join(',')}
          className="sr-only"
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="label">LONG AND LARGE RECORDINGS SUPPORTED — UP TO 10 HOURS / 5 GB</p>
        {error ? (
          <p className="text-sm text-accent" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Corner({ className, lit }: { className: string; lit: boolean }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-3 w-3 transition-colors ${
        lit ? 'border-accent' : 'border-line-lit'
      } ${className}`}
    />
  );
}
