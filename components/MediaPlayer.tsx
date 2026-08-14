'use client';

import { useState, type RefObject } from 'react';
import type { JobPayload } from '@/lib/types';

/**
 * Playback for verification. Clicking any timestamp in the product seeks this
 * element, so an AI-generated claim can be checked against the recording in
 * one tap rather than by scrubbing.
 *
 * The source is a redirect to a short-lived signed URL — bytes stream from
 * storage to the browser and never pass through a Function.
 */
export function MediaPlayer({
  payload,
  mediaRef,
}: {
  payload: JobPayload;
  mediaRef: RefObject<HTMLMediaElement | null>;
}) {
  const [failed, setFailed] = useState(false);
  const { job } = payload;

  if (!job.hasMedia) {
    return (
      <div className="border border-line px-4 py-3">
        <p className="label">SOURCE MEDIA DELETED</p>
        <p className="mt-2 text-xs leading-relaxed text-gray-dim">
          The recording was removed under its retention setting. The transcript and recap remain.
        </p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="border border-line px-4 py-3">
        <p className="label text-accent">PLAYBACK UNAVAILABLE</p>
        <p className="mt-2 text-xs leading-relaxed text-gray-dim">
          The source media could not be opened. Timestamps still work for reference.
        </p>
      </div>
    );
  }

  const src = `/api/jobs/${job.id}/media`;
  const isVideo = job.mediaType === 'video';

  return (
    <div className="border border-line bg-ink-raised p-3">
      <div className="flex items-center justify-between gap-3 pb-2">
        <p className="label label-lit">SOURCE MEDIA</p>
        <p className="label">{isVideo ? 'VIDEO' : 'AUDIO SIGNAL'}</p>
      </div>

      {isVideo ? (
        <video
          ref={mediaRef as RefObject<HTMLVideoElement>}
          src={src}
          controls
          preload="metadata"
          onError={() => setFailed(true)}
          className="w-full max-h-[340px] bg-ink-sunk"
        />
      ) : (
        <audio
          ref={mediaRef as RefObject<HTMLAudioElement>}
          src={src}
          controls
          preload="metadata"
          onError={() => setFailed(true)}
          className="w-full"
        />
      )}
    </div>
  );
}
