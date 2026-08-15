import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
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
 * Everything else that escapes this route is a fault on our side — a missing
 * store, a bad token, a database that will not answer — and its message is
 * written for an operator reading logs, not for whoever is holding the file.
 */
class UploadRejected extends Error {}

const GENERIC_FAILURE =
  'The upload could not be authorized. Storage is not reachable right now.';

/**
 * Recover the job id from whichever shape of request this is.
 *
 * Token requests carry it in clientPayload; the completion callback carries it
 * in tokenPayload. Without it a failure leaves a job stranded in `created`,
 * which the history screen renders as AWAITING MEDIA forever.
 */
function jobIdFromBody(body: HandleUploadBody): string | null {
  try {
    if (body.type === 'blob.generate-client-token') {
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
 * Token minting only. Media bytes never pass through this function — the browser
 * uploads straight to Blob, which is what makes multi-gigabyte files possible on
 * a platform with a 4.5 MB request body limit.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
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

        return {
          allowedContentTypes: ['video/*', 'audio/*'],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ jobId }),
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

    // handleUpload resolves BLOB_READ_WRITE_TOKEN before it reaches
    // onBeforeGenerateToken, so an unconfigured store throws here with the job
    // still sitting in `created`. Log it: a swallowed 400 leaves nothing in the
    // runtime logs, and the misconfiguration then looks like a silent no-op.
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
