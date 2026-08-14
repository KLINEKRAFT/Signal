'use client';

import { formatBytes } from '@/lib/format';
import { SignalBar } from './SignalBar';

/**
 * Real bytes only. Vercel Blob reports genuine multipart upload progress, so
 * this is the one place in the pipeline where a percentage is honest.
 */
export function UploadProgress({
  loaded,
  total,
  percentage,
}: {
  loaded: number;
  total: number;
  percentage: number;
}) {
  return (
    <div className="border border-line bg-ink-raised p-4 sm:p-5">
      <div className="flex items-baseline justify-between">
        <span className="label label-lit">UPLOADING</span>
        <span className="data text-2xl font-medium tabular-nums">
          {Math.min(99, Math.floor(percentage))}
          <span className="text-gray-dim">%</span>
        </span>
      </div>

      <div className="mt-4">
        <SignalBar active />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="label">
          {formatBytes(loaded)} / {formatBytes(total)}
        </span>
        <span className="label">DIRECT TO STORAGE</span>
      </div>
    </div>
  );
}
