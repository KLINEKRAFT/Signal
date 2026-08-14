'use client';

import { formatBytes, formatDuration } from '@/lib/format';

export type ProbedMedia = {
  file: File;
  durationMs: number | null;
  posterUrl: string | null;
};

export function MediaPreview({
  media,
  onClear,
  disabled,
}: {
  media: ProbedMedia;
  onClear: () => void;
  disabled?: boolean;
}) {
  const { file, durationMs, posterUrl } = media;
  const kind = file.type.startsWith('video/') ? 'VIDEO' : 'AUDIO';

  return (
    <div className="border border-line bg-ink-raised">
      <div className="flex items-start gap-4 p-4 sm:p-5">
        <div className="dot-field flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden border border-line bg-ink-sunk sm:h-20 sm:w-32">
          {posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={posterUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="label">{kind}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-medium sm:text-base" title={file.name}>
            {file.name}
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            <Meta label="TYPE" value={kind} />
            <Meta label="SIZE" value={formatBytes(file.size)} />
            <Meta label="DURATION" value={formatDuration(durationMs)} />
          </dl>
        </div>

        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="label shrink-0 border border-line px-3 py-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="data mt-1 text-xs text-paper">{value}</dd>
    </div>
  );
}
