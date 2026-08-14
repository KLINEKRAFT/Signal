'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatBytes, formatDate, formatDuration } from '@/lib/format';
import type { JobStatus } from '@/lib/types';

export type HistoryRow = {
  id: string;
  title: string | null;
  originalFilename: string;
  mediaType: string;
  fileSize: number;
  durationMs: number | null;
  status: JobStatus;
  createdAt: string;
};

const STATUS_LABEL: Record<JobStatus, string> = {
  created: 'AWAITING MEDIA',
  uploading: 'UPLOADING',
  uploaded: 'QUEUED',
  transcribing: 'TRANSCRIBING',
  analyzing: 'ANALYZING',
  complete: 'COMPLETE',
  failed: 'FAILED',
};

/**
 * A list, deliberately — not a dashboard. Each row is a link to the recording
 * with its actions kept out of the way until hovered or focused, so scanning
 * for the recording you want stays the primary job of this screen.
 */
export function HistoryList({ rows }: { rows: HistoryRow[] }) {
  const [items, setItems] = useState(rows);

  return (
    <ul className="border-t border-line">
      {items.map((row) => (
        <HistoryItem
          key={row.id}
          row={row}
          onRemoved={() => setItems((list) => list.filter((r) => r.id !== row.id))}
          onRenamed={(title) =>
            setItems((list) => list.map((r) => (r.id === row.id ? { ...r, title } : r)))
          }
        />
      ))}
    </ul>
  );
}

function HistoryItem({
  row,
  onRemoved,
  onRenamed,
}: {
  row: HistoryRow;
  onRemoved: () => void;
  onRenamed: (title: string | null) => void;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(row.title ?? '');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const rename = async () => {
    const title = draft.trim();
    setBusy(true);
    try {
      await fetch(`/api/jobs/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      onRenamed(title || null);
      setRenaming(false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${row.id}`, { method: 'DELETE' });
      if (res.ok) {
        onRemoved();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const rerun = async () => {
    setBusy(true);
    try {
      await fetch(`/api/jobs/${row.id}/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputType: 'professional_recap', detail: 'standard' }),
      });
      router.push(`/jobs/${row.id}`);
    } finally {
      setBusy(false);
    }
  };

  if (renaming) {
    return (
      <li className="border-b border-line px-1 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') rename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            placeholder={row.originalFilename}
            className="min-w-0 flex-1 border border-line-lit px-3 py-2 text-sm text-paper focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={rename}
            disabled={busy}
            className="label border border-line px-3 py-2.5 transition-colors hover:border-line-lit hover:text-paper disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="label px-2 py-2.5 transition-colors hover:text-paper"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  if (confirming) {
    return (
      <li className="border-b border-line px-1 py-4">
        <p className="text-sm text-paper">
          Delete <span className="font-medium">{row.title || row.originalFilename}</span>?
        </p>
        <p className="mt-1.5 text-xs text-gray">
          The media, transcript, and every recap are removed permanently.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="label border border-accent px-4 py-2.5 text-accent transition-colors hover:bg-accent hover:text-paper disabled:opacity-40"
          >
            {busy ? 'Deleting' : 'Delete permanently'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="label px-3 py-2.5 transition-colors hover:text-paper"
          >
            Keep
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="group border-b border-line">
      <div className="relative">
        <Link
          href={`/jobs/${row.id}`}
          className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-2 px-1 py-5 transition-colors hover:bg-ink-raised sm:grid-cols-[minmax(0,1fr)_120px_100px_140px]"
        >
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-medium text-paper">
              {row.title || row.originalFilename}
            </span>
            <span className="label mt-1.5 block truncate">{row.originalFilename}</span>
          </span>

          <span className="data hidden text-xs text-gray sm:block">
            {row.mediaType.toUpperCase()} · {formatBytes(row.fileSize)}
          </span>

          <span className="data hidden text-xs text-gray sm:block">
            {formatDuration(row.durationMs)}
          </span>

          <span className="text-right sm:text-left">
            <span
              className={`label ${
                row.status === 'complete'
                  ? 'text-paper'
                  : row.status === 'failed'
                    ? 'text-accent'
                    : 'label-lit'
              }`}
            >
              {STATUS_LABEL[row.status]}
            </span>
            <span className="label mt-1.5 block">{formatDate(row.createdAt)}</span>
          </span>
        </Link>

        <div className="flex gap-1 pb-3 pl-1 opacity-100 transition-opacity sm:absolute sm:right-1 sm:top-1/2 sm:-translate-y-1/2 sm:pb-0 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <button
            type="button"
            onClick={() => {
              setDraft(row.title ?? '');
              setRenaming(true);
            }}
            className="label border border-line bg-ink px-2.5 py-1.5 transition-colors hover:border-line-lit hover:text-paper"
          >
            Rename
          </button>
          {row.status === 'complete' ? (
            <button
              type="button"
              onClick={rerun}
              disabled={busy}
              className="label border border-line bg-ink px-2.5 py-1.5 transition-colors hover:border-line-lit hover:text-paper disabled:opacity-40"
            >
              Re-run
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="label border border-line bg-ink px-2.5 py-1.5 transition-colors hover:border-accent hover:text-accent"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
