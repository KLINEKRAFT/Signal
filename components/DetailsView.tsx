'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JobPayload } from '@/lib/types';
import { formatBytes, formatDate, formatDuration, sourceLabel } from '@/lib/format';
import { OUTPUT_TYPES } from '@/lib/analysis/prompts';

const RETENTION_LABELS: Record<string, string> = {
  delete_after_processing: 'Delete after processing',
  hours_24: 'Keep 24 hours',
  days_7: 'Keep 7 days',
  days_30: 'Keep 30 days',
  keep: 'Keep indefinitely',
};

/** Technical metadata, plus the two destructive controls. */
export function DetailsView({ payload }: { payload: JobPayload }) {
  const { job, analysis } = payload;
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processingMs =
    job.completedAt ? new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime() : null;

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'The recording could not be deleted.');
      }
      router.push('/history');
      router.refresh();
    } catch (e) {
      setDeleting(false);
      setError(e instanceof Error ? e.message : 'The recording could not be deleted.');
    }
  };

  return (
    <div className="max-w-2xl">
      <dl className="border-t border-line">
        <Row label="SOURCE ID" value={sourceLabel(job.id)} />
        <Row label="FILENAME" value={job.originalFilename} />
        <Row label="MEDIA TYPE" value={`${job.mediaType.toUpperCase()} · ${job.mimeType}`} />
        <Row label="FILE SIZE" value={formatBytes(job.fileSize)} />
        <Row label="DURATION" value={formatDuration(job.durationMs)} />
        <Row label="UPLOADED" value={formatDate(job.createdAt)} />
        <Row label="PROCESSED" value={formatDate(job.completedAt)} />
        <Row
          label="PROCESSING TIME"
          value={processingMs && processingMs > 0 ? formatDuration(processingMs) : '--'}
        />
        <Row label="TRANSCRIPTION" value={(job.transcriptionProvider ?? '--').toUpperCase()} />
        <Row label="TRANSCRIPTION JOB" value={job.transcriptionJobId ?? '--'} />
        <Row label="LANGUAGE" value={(job.language ?? payload.transcript?.language ?? '--').toUpperCase()} />
        <Row
          label="WORD COUNT"
          value={payload.transcript?.wordCount?.toLocaleString('en-US') ?? '--'}
        />
        <Row label="SEGMENTS" value={payload.segments.length.toLocaleString('en-US')} />
        <Row label="SPEAKERS DETECTED" value={String(payload.speakers.length)} />
        <Row
          label="ANALYSIS"
          value={
            analysis
              ? `${OUTPUT_TYPES.find((o) => o.value === analysis.outputType)?.label ?? analysis.outputType} · ${analysis.detail.toUpperCase()}`
              : '--'
          }
        />
        <Row label="ANALYSIS MODEL" value={analysis?.model ?? '--'} />
        <Row label="SOURCE STORED" value={job.hasMedia ? 'YES' : 'DELETED'} />
      </dl>

      <RetentionControl jobId={job.id} current={job.retention} hasMedia={job.hasMedia} />

      <section className="mt-12 border border-line p-5">
        <p className="label text-accent">DELETE RECORDING</p>
        <p className="mt-3 text-sm leading-relaxed text-gray">
          Permanently removes the source media, the transcript, and every recap generated from it.
          This cannot be undone.
        </p>

        {confirming ? (
          <div className="mt-5">
            <label className="label label-lit block">
              Type DELETE to confirm
              <input
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="mt-2 w-full border border-line px-3 py-2.5 font-display text-sm normal-case tracking-normal text-paper focus:border-accent focus:outline-none"
              />
            </label>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={remove}
                disabled={confirmText !== 'DELETE' || deleting}
                className="label border border-accent px-4 py-2.5 text-accent transition-colors hover:bg-accent hover:text-paper disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-accent"
              >
                {deleting ? 'Deleting' : 'Delete permanently'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText('');
                }}
                className="label px-3 py-2.5 transition-colors hover:text-paper"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="label mt-5 border border-line px-4 py-2.5 transition-colors hover:border-accent hover:text-accent"
          >
            Delete recording
          </button>
        )}

        {error ? (
          <p className="mt-3 text-sm text-accent" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/**
 * How long the source media is kept. The transcript and recap are unaffected by
 * every option here — they live in Postgres and survive the media being gone.
 */
function RetentionControl({
  jobId,
  current,
  hasMedia,
}: {
  jobId: string;
  current: string;
  hasMedia: boolean;
}) {
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);

  const change = async (next: string) => {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retention: next }),
      });
      if (!res.ok) setValue(previous);
    } catch {
      setValue(previous);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-10 border border-line p-5">
      <p className="label label-lit">SOURCE MEDIA RETENTION</p>
      <p className="mt-2 text-sm leading-relaxed text-gray">
        {hasMedia
          ? 'How long the original recording is kept in storage. The transcript and recap are never deleted by this setting.'
          : 'The original recording has already been deleted. The transcript and recap remain available.'}
      </p>

      <div className="mt-4 space-y-1">
        {Object.entries(RETENTION_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => change(key)}
            disabled={saving || !hasMedia}
            className={`flex w-full items-center gap-2.5 px-2 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              value === key ? 'bg-ink-raised text-paper' : 'text-gray hover:text-paper'
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                value === key ? 'bg-accent' : 'border border-gray-faint'
              }`}
            />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-3">
      <dt className="label shrink-0">{label}</dt>
      <dd className="data min-w-0 truncate text-right text-xs text-paper" title={value}>
        {value}
      </dd>
    </div>
  );
}
