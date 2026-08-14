import { del, issueSignedToken, presignUrl } from '@vercel/blob';

/**
 * Access mode for every media blob.
 *
 * 'private' is correct for this app: recordings contain internal company
 * material and a public blob URL is readable by anyone who has it. Private
 * blobs live at <store-id>.private.blob.vercel-storage.com and require auth.
 *
 * The one thing this costs us: AssemblyAI must be able to fetch the media, and
 * it has no credentials. That is what getSignedMediaUrl below is for — a
 * short-lived signed GET URL scoped to one pathname, handed to the provider and
 * expired before it can leak anywhere useful.
 *
 * Verified against @vercel/blob 2.8.0: client uploads accept 'private', and
 * issueSignedToken / presignUrl are exported for the provider handoff below.
 */
export const BLOB_ACCESS = 'private' as const;

/** Deterministic, sortable, collision-free pathname for a job's source media. */
export function mediaPathname(jobId: string, filename: string): string {
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
  return `sources/${jobId}/${safe}`;
}

/**
 * Mint a short-lived signed GET URL for the transcription provider.
 *
 * This is what lets media stay private. AssemblyAI has no credentials for the
 * Blob store, so it gets a URL scoped to one operation (`get`), one pathname,
 * and a two-hour expiry — far longer than it needs (a one-hour recording
 * typically transcribes in well under a minute) and short enough that a leaked
 * URL is worthless by the time anyone finds it.
 *
 * Runs server-side only. issueSignedToken authenticates with OIDC on Vercel or
 * BLOB_READ_WRITE_TOKEN locally; browser tokens are rejected by the API.
 */
export async function getSignedMediaUrl(
  pathname: string,
  validForSeconds = 60 * 60 * 2,
): Promise<string> {
  const validUntil = Date.now() + validForSeconds * 1000;

  const signedToken = await issueSignedToken({
    pathname,
    operations: ['get'],
    validUntil,
  });

  const { presignedUrl } = await presignUrl(signedToken, {
    operation: 'get',
    pathname,
    access: BLOB_ACCESS,
    validUntil,
  });

  return presignedUrl;
}

/** Retention and manual delete both land here. Safe to call twice. */
export async function deleteMedia(url: string): Promise<void> {
  try {
    await del(url);
  } catch (error) {
    // A blob that is already gone is the desired end state, not a failure.
    if (error instanceof Error && /not found/i.test(error.message)) return;
    throw error;
  }
}
