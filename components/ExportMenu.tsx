'use client';

import { useEffect, useRef, useState } from 'react';
import type { JobPayload } from '@/lib/types';
import { CopyButton } from './CopyButton';
import { buildRecapDocument, buildTranscriptText } from '@/lib/exports/document';
import { toPlainText } from '@/lib/exports/markdown';

const FILE_FORMATS = [
  { format: 'txt', label: 'Plain text (.txt)' },
  { format: 'md', label: 'Markdown (.md)' },
  { format: 'pdf', label: 'PDF (.pdf)' },
  { format: 'docx', label: 'Word (.docx)' },
] as const;

/**
 * Copy and download, in one control.
 *
 * Copy runs client-side from data already loaded — instant, and the common
 * case. Downloads are links rather than fetches so the browser handles the
 * save dialog and a large PDF never lands in memory here.
 */
export function ExportMenu({ payload }: { payload: JobPayload }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const hasRecap = Boolean(payload.analysis);
  const hasTranscript = payload.segments.length > 0;

  return (
    <div ref={container} className="relative flex flex-wrap items-center gap-2">
      {hasRecap ? (
        <CopyButton value={() => toPlainText(buildRecapDocument(payload))} label="Copy recap" />
      ) : null}

      {hasTranscript ? (
        <CopyButton value={() => buildTranscriptText(payload)} label="Copy transcript" />
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`label border px-3 py-2 transition-colors ${
          open ? 'border-line-lit text-paper' : 'border-line hover:border-line-lit hover:text-paper'
        }`}
      >
        Download
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-60 border border-line-lit bg-ink shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
        >
          {hasRecap ? (
            <Group
              title="RECAP"
              jobId={payload.job.id}
              kind="recap"
              onPick={() => setOpen(false)}
            />
          ) : null}

          {hasTranscript ? (
            <Group
              title="TRANSCRIPT"
              jobId={payload.job.id}
              kind="transcript"
              onPick={() => setOpen(false)}
            />
          ) : null}

          {!hasRecap && !hasTranscript ? (
            <p className="px-3 py-4 text-xs text-gray-dim">Nothing to export yet.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Group({
  title,
  jobId,
  kind,
  onPick,
}: {
  title: string;
  jobId: string;
  kind: 'recap' | 'transcript';
  onPick: () => void;
}) {
  return (
    <div className="border-b border-line last:border-b-0">
      <p className="label px-3 pb-1.5 pt-3">{title}</p>
      {FILE_FORMATS.map((entry) => (
        <a
          key={entry.format}
          href={`/api/jobs/${jobId}/export?format=${entry.format}&kind=${kind}`}
          onClick={onPick}
          role="menuitem"
          className="block px-3 py-2 text-xs text-gray transition-colors hover:bg-ink-raised hover:text-paper"
        >
          {entry.label}
        </a>
      ))}
    </div>
  );
}
