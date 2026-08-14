import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { jobs } from '@/lib/db/schema';
import { MAX_UPLOAD_BYTES } from '@/lib/constants';
import { startTranscription } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
        if (!jobId) throw new Error('Missing job reference.');

        const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
        if (!job) throw new Error('Unknown job.');
        if (job.storageUrl) throw new Error('This recording has already been uploaded.');

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
    const message =
      error instanceof Error ? error.message : 'The upload could not be authorized.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
