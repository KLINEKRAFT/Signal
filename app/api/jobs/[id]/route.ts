import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { jobs } from '@/lib/db/schema';
import { loadJob } from '@/lib/db/queries';
import { deleteMedia } from '@/lib/storage/blob';
import { reconcile, startTranscription } from '@/lib/pipeline';
import { RECONCILE_AFTER_MS } from '@/lib/constants';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

async function loadRow(id: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return job ?? null;
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const row = await loadRow(id);
  if (!row) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 });

  // Reconcile-on-read: if a job has been transcribing longer than it should
  // have been, the webhook probably never arrived (it never does against
  // localhost). Ask the provider directly rather than leaving it stuck.
  const startedAt = row.transcriptionStartedAt?.getTime() ?? row.updatedAt.getTime();
  if (row.status === 'transcribing' && Date.now() - startedAt > RECONCILE_AFTER_MS) {
    try {
      await reconcile(row);
    } catch {
      // A failed reconcile is not worth failing the page load over — the next
      // poll tries again, and the webhook may still arrive.
    }
  }

  const payload = await loadJob(id);
  if (!payload) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 });

  return NextResponse.json(payload, { headers: { 'cache-control': 'no-store' } });
}

/**
 * Two callers: the client confirming an upload landed, and the results screen
 * renaming a recording. Kept narrow on purpose — status is not settable from
 * the browser beyond the upload handoff.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const job = await loadRow(id);
  if (!job) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 });

  let body: {
    title?: string;
    storageUrl?: string;
    storagePathname?: string;
    durationMs?: number;
    uploaded?: boolean;
    retention?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.title === 'string') patch.title = body.title.trim() || null;
  if (typeof body.durationMs === 'number') patch.durationMs = Math.round(body.durationMs);
  if (typeof body.retention === 'string') patch.retention = body.retention;

  let shouldStart = false;

  if (body.uploaded && body.storageUrl) {
    patch.storageUrl = body.storageUrl;
    if (body.storagePathname) patch.storagePathname = body.storagePathname;
    // onUploadCompleted does not fire against localhost, so the client confirms
    // the handoff too. Both paths are idempotent.
    if (job.status === 'created' || job.status === 'uploading') {
      patch.status = 'uploaded';
      shouldStart = true;
    }
  }

  try {
    const [updated] = await db.update(jobs).set(patch).where(eq(jobs.id, id)).returning();

    // Only one of the two handoff paths wins the conditional claim inside
    // startTranscription, so running both is harmless.
    if (shouldStart) await startTranscription(id);

    return NextResponse.json({ job: updated });
  } catch {
    return NextResponse.json({ error: 'Could not save that change.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const job = await loadRow(id);
  if (!job) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 });

  try {
    if (job.storageUrl && !job.mediaDeletedAt) await deleteMedia(job.storageUrl);
    // Cascades to transcript, segments, speakers, and analyses.
    await db.delete(jobs).where(eq(jobs.id, id));
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json(
      { error: 'Could not delete the recording. The stored media may still exist.' },
      { status: 500 },
    );
  }
}
