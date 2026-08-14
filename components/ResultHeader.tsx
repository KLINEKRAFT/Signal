'use client';

import { useState } from 'react';
import type { JobPayload } from '@/lib/types';
import { formatDate, formatDuration, sourceLabel } from '@/lib/format';

/**
 * Identity and vital signs for a finished recording. The title is editable in
 * place — a recap gets forwarded, and the filename the camera produced is
 * rarely what it should be called.
 */
export function ResultHeader({
  payload,
  onRename,
}: {
  payload: JobPayload;
  onRename: (title: string) => Promise<void>;
}) {
  const { job } = payload;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(job.title ?? '');
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    setSaving(true);
    try {
      await onRename(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const speakerCount = payload.speakers.length;
  const words = payload.transcript?.wordCount ?? 0;

  return (
    <header>
      <p className="label label-lit">{sourceLabel(job.id)}</p>

      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="min-w-0 flex-1 border border-line-lit px-3 py-2 font-display text-xl font-medium text-paper focus:border-accent focus:outline-none"
            placeholder={job.originalFilename}
          />
          <button
            type="button"
            onClick={commit}
            disabled={saving}
            className="label border border-line px-3 py-2.5 transition-colors hover:border-line-lit hover:text-paper disabled:opacity-40"
          >
            {saving ? 'Saving' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="label px-2 py-2.5 transition-colors hover:text-paper"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-3">
          <h1 className="font-display text-2xl font-medium leading-tight tracking-[-0.01em] sm:text-3xl">
            {job.title || job.originalFilename}
          </h1>
          <button
            type="button"
            onClick={() => {
              setDraft(job.title ?? '');
              setEditing(true);
            }}
            className="label mt-1.5 shrink-0 transition-colors hover:text-paper"
            aria-label="Rename recording"
          >
            Rename
          </button>
        </div>
      )}

      <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-y border-line py-4">
        <Stat label="FILE" value={job.originalFilename} truncate />
        <Stat label="DURATION" value={formatDuration(job.durationMs)} />
        <Stat label="PROCESSED" value={formatDate(job.completedAt ?? job.createdAt)} />
        <Stat label="WORDS" value={words ? words.toLocaleString('en-US') : '--'} />
        <Stat label="SPEAKERS" value={speakerCount ? String(speakerCount) : '--'} />
        <Stat
          label="STATUS"
          value={job.status === 'complete' ? 'COMPLETE' : job.status.toUpperCase()}
          accent={job.status === 'failed'}
        />
      </dl>
    </header>
  );
}

function Stat({
  label,
  value,
  truncate,
  accent,
}: {
  label: string;
  value: string;
  truncate?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={truncate ? 'min-w-0 max-w-[240px]' : ''}>
      <dt className="label">{label}</dt>
      <dd
        className={`data mt-1.5 text-xs ${accent ? 'text-accent' : 'text-paper'} ${
          truncate ? 'truncate' : ''
        }`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
