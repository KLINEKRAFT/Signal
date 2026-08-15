import { NextResponse } from 'next/server';
import {
  handleUploadPresigned,
  type HandleUploadPresignedBody,
} from '@vercel/blob/client';
import { issueSignedToken } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { jobs } from '@/lib/db/schema';
import { MAX_UPLOAD_BYTES } from '@/lib/constants';
import { failJob, startTranscription } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * A refusal the uploader is allowed to read verbatim.
 *
 * Everything else that escapes this route is a fault on our side — an
 * unreachable store, a database that will not answer — and its message is
 * written for an operator reading logs, not for whoever is holding the file.
 */
class UploadRejected extends Error {}

const GENERIC_FAILURE =
  'The upload could not be authorized. Storage is not reachable right now.';

const ALLOWED_CONTENT_TYPES = ['video/*', 'audio/*'];

/**
 * How long a presigned upload URL stays valid.
 *
 * The SDK would default to an hour. That is not enough here: the ceiling is
 * 5 GB, and 5 GB over a 5 Mbps uplink is well past two hours. Four hours covers
 * the worst realistic case without leaving a write-capable URL alive overnight.
 */
const UPLOAD_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * Recover the job id from whichever shape of request this is.
 *
 * URL issuance carries it in clientPayload; the completion callback carries it
 * in tokenPayload. Without it a failure leaves a job stranded in `created`,
 * which the history screen renders as AWAITING MEDIA forever.
 */
function jobIdFromBody(body: HandleUploadPresignedBody): string | null {
  try {
    if (body.type === 'blob.generate-presigned-url') {
      return (body.payload.clientPayload ?? '').trim() || null;
    }
    if (body.type === 'blob.upload-completed') {
      const { jobId } = JSON.parse(body.payload.tokenPayload || '{}') as { jobId?: string };
      return jobId ?? null;
    }
  } catch {
    // A malformed payload is itself the failure; there is no id to recover.
  }
  return null;
}

/**
 * Presigned URL issuance only. Media bytes never pass through this function —
 * the browser uploads straight to Blob, which is what makes multi-gigabyte
 * files possible on a platform with a 4.5 MB request body limit.
 *
 * Presigned rather than client-token issuance because the Blob store is
 * connected over OIDC. handleUpload mints client tokens by signing with
 * BLOB_READ_WRITE_TOKEN and has no OIDC path at all, so it throws before it
 * reaches any callback when the store is connected the modern way. The
 * presigned flow signs with a short-lived delegation from issueSignedToken,
 * which authenticates with VERCEL_OIDC_TOKEN + BLOB_STORE_ID and needs no
 * long-lived secret.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadPresignedBody;

  try {
    const response = await handleUploadPresigned({
      body,
      request,

      getSignedToken: async (pathname, clientPayload) => {
        const jobId = (clientPayload ?? '').trim();
        if (!jobId) throw new UploadRejected('Missing job reference.');

        const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
        if (!job) throw new UploadRejected('Unknown job.');
        if (job.storageUrl) {
          throw new UploadRejected('This recording has already been uploaded.');
        }

        await db
          .update(jobs)
          .set({ status: 'uploading', updatedAt: new Date() })
          .where(eq(jobs.id, jobId));

        const validUntil = Date.now() + UPLOAD_WINDOW_MS;

        // The delegation and the URL are constrained identically on purpose:
        // the token bounds what the signature can ever authorize, the url
        // options bound this particular URL. Neither alone is the limit.
        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil,
        });

        return {
          token,
          urlOptions: {
            allowedContentTypes: ALLOWED_CONTENT_TYPES,
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
            addRandomSuffix: false,
            validUntil,
            tokenPayload: JSON.stringify({ jobId }),
          },
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Does not fire on localhost — the client PATCH covers local dev.
        const { jobId } = JSON.parse(tokenPayload || '{}') as { jobId?: string };
        if (!jobId) return;

        await db
          .update(jobs)
          .set({
            storageUrl: blob.url,
            storagePathname: blob.pathname,
            status: 'uploaded',
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, jobId));

        // Submitting is a couple of seconds — we hand the provider a signed URL
        // and store its job id. The long part happens on their side, not here.
        await startTranscription(jobId);
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    const rejected = error instanceof UploadRejected;

    // A swallowed 400 leaves nothing in the runtime logs, and a misconfigured
    // store then looks like a silent no-op rather than a failure.
    if (!rejected) console.error('[upload] could not authorize upload', error);

    const jobId = jobIdFromBody(body);
    if (jobId) {
      await failJob(jobId, 'upload', rejected ? error.message : GENERIC_FAILURE).catch(
        (dbError) => console.error('[upload] could not mark job failed', dbError),
      );
    }

    return NextResponse.json(
      { error: rejected ? error.message : GENERIC_FAILURE },
      { status: rejected ? 400 : 503 },
    );
  }
}
