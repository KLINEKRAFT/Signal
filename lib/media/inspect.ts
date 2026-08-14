import { MAX_DURATION_MS, MAX_UPLOAD_BYTES } from '@/lib/constants';

/**
 * The media pipeline's only decision.
 *
 * AssemblyAI transcribes video directly, extracting audio on its own side, and
 * accepts 5 GB / 10 hours. Everything realistic fits Path A, so extraction and
 * chunking are not built. This function is the seam where they would go, and
 * it is deliberately the only place that knows that.
 */
export type MediaPlan =
  | { path: 'direct' }
  | { path: 'rejected'; reason: string };

export function planMedia(input: { fileSize: number; durationMs?: number | null }): MediaPlan {
  if (input.fileSize > MAX_UPLOAD_BYTES) {
    return {
      path: 'rejected',
      reason:
        'This file is over 5 GB, which is the transcription limit. Export a smaller version or an audio-only file and upload that.',
    };
  }
  if (input.durationMs && input.durationMs > MAX_DURATION_MS) {
    return {
      path: 'rejected',
      reason:
        'This recording is over 10 hours, which is the transcription limit. Split it into parts and process them separately.',
    };
  }
  return { path: 'direct' };
}
