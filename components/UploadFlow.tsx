'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadPresigned } from '@vercel/blob/client';
import { UploadDropzone } from './UploadDropzone';
import { MediaPreview, type ProbedMedia } from './MediaPreview';
import { RecordingContext, emptyContext, type ContextValue } from './RecordingContext';
import { UploadProgress } from './UploadProgress';
import { probeMedia } from '@/lib/probe';
import { mediaPathname, BLOB_ACCESS } from '@/lib/storage/blob';
import {
  ACCEPTED_MIME_PREFIXES,
  MAX_UPLOAD_BYTES,
  MULTIPART_THRESHOLD_BYTES,
} from '@/lib/constants';
import { formatBytes } from '@/lib/format';

type Phase = 'idle' | 'ready' | 'creating' | 'uploading' | 'handoff';

/**
 * Turn an upload failure into something worth reading.
 *
 * @vercel/blob discards the response body when URL issuance fails, so every
 * server-side refusal — an unreachable store, a duplicate upload, an unknown
 * job — reaches the browser as the same opaque "Failed to retrieve the
 * presigned URL". The route records the real reason on the job before it
 * returns, so ask the job rather than repeating the library's text.
 */
const OPAQUE_SDK_FAILURE =
  /retrieve the (presigned URL|client token)|missing presignedUrlPayload/i;

async function explainFailure(error: unknown, jobId: string | null): Promise<string> {
  const fallback =
    error instanceof Error && !OPAQUE_SDK_FAILURE.test(error.message)
      ? error.message
      : 'The upload did not finish. Check your connection and try again.';

  if (!jobId) return fallback;

  try {
    const res = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' });
    if (!res.ok) return fallback;
    const { job } = (await res.json()) as { job?: { errorMessage?: string | null } };
    return job?.errorMessage || fallback;
  } catch {
    // The reason lookup is a courtesy; never let it mask the original failure.
    return fallback;
  }
}

export function UploadFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [media, setMedia] = useState<ProbedMedia | null>(null);
  const [context, setContext] = useState<ContextValue>(emptyContext);
  const [progress, setProgress] = useState({ loaded: 0, total: 0, percentage: 0 });
  const [error, setError] = useState<string | null>(null);

  const busy = phase === 'creating' || phase === 'uploading' || phase === 'handoff';

  const handleFile = useCallback(async (file: File) => {
    setError(null);

    if (!ACCEPTED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
      setError('That file is not video or audio. Choose a recording instead.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `That file is ${formatBytes(file.size)}. The transcription limit is 5 GB — export a smaller version or audio only.`,
      );
      return;
    }

    setMedia({ file, durationMs: null, posterUrl: null });
    setPhase('ready');

    const probed = await probeMedia(file);
    setMedia({ file, ...probed });
  }, []);

  const clear = useCallback(() => {
    setMedia(null);
    setPhase('idle');
    setProgress({ loaded: 0, total: 0, percentage: 0 });
    setError(null);
  }, []);

  const process = useCallback(async () => {
    if (!media) return;
    setError(null);
    setPhase('creating');

    const lines = (v: string) =>
      v
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

    // Declared outside the try so a failure mid-upload can still ask the server
    // what went wrong. See explainFailure.
    let jobId: string | null = null;

    try {
      // 1. Create the job first, so the upload has something to attach to and
      //    a refresh mid-upload still finds a record.
      const createRes = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalFilename: media.file.name,
          mimeType: media.file.type,
          fileSize: media.file.size,
          durationMs: media.durationMs,
          title: context.title || null,
          context: {
            speakers: lines(context.speakers).map((line) => {
              const [name, role] = line.split(/\s+[—–-]\s+/);
              return { name: (name ?? line).trim(), role: role?.trim() };
            }),
            description: context.description || undefined,
            vocabulary: lines(context.vocabulary),
          },
        }),
      });

      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created?.error ?? 'Could not start the job.');
      jobId = created.job.id as string;

      // 2. Browser uploads straight to Blob. Nothing here touches a Function.
      setPhase('uploading');
      setProgress({ loaded: 0, total: media.file.size, percentage: 0 });

      // Presigned, not client-token: the store is connected over OIDC and the
      // client-token flow has no OIDC path. See app/api/upload/route.ts.
      const blob = await uploadPresigned(mediaPathname(jobId, media.file.name), media.file, {
        // Private keeps recordings off public URLs. If your installed
        // @vercel/blob rejects this, see the note in lib/storage/blob.ts.
        access: BLOB_ACCESS,
        handleUploadUrl: '/api/upload',
        clientPayload: jobId,
        contentType: media.file.type,
        multipart: media.file.size > MULTIPART_THRESHOLD_BYTES,
        onUploadProgress: ({ loaded, total, percentage }) =>
          setProgress({ loaded, total, percentage }),
      });

      // 3. Confirm the handoff. onUploadCompleted does not fire against
      //    localhost, so this is what makes local development work.
      setPhase('handoff');
      await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploaded: true,
          storageUrl: blob.url,
          storagePathname: blob.pathname,
          durationMs: media.durationMs ?? undefined,
        }),
      });

      router.push(`/jobs/${jobId}`);
    } catch (e) {
      setPhase('ready');
      setError(await explainFailure(e, jobId));
    }
  }, [media, context, router]);

  if (!media) {
    return <UploadDropzone onFile={handleFile} error={error} />;
  }

  return (
    <div className="space-y-5 pb-28 sm:pb-0">
      <MediaPreview media={media} onClear={clear} disabled={busy} />

      {phase === 'uploading' || phase === 'handoff' ? (
        <UploadProgress {...progress} />
      ) : (
        <RecordingContext value={context} onChange={setContext} disabled={busy} />
      )}

      {error ? (
        <p className="border border-accent px-4 py-3 text-sm text-accent" role="alert">
          {error}
        </p>
      ) : null}

      {/* Sticky on phones so the primary action is always in the thumb zone. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 p-4 backdrop-blur-sm sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <button
          type="button"
          onClick={process}
          disabled={busy}
          className="flex h-14 w-full items-center justify-center gap-3 bg-paper font-display text-sm font-medium tracking-[0.2em] text-ink transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-gray-faint disabled:text-gray-dim sm:h-16"
        >
          {busy ? (
            <>
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-ink" />
              {phase === 'creating' ? 'STARTING' : 'UPLOADING'}
            </>
          ) : (
            'PROCESS'
          )}
        </button>
      </div>
    </div>
  );
}
