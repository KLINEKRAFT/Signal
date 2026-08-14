import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { jobs, transcripts } from '@/lib/db/schema';
import { loadJob } from '@/lib/db/queries';
import { ingestTranscript, runAnalysis, startTranscription } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Retry the stage that failed, and only that stage.
 *
 * A failed analysis re-runs analysis against the stored transcript. A failed
 * transcription re-submits the stored media. Neither asks for another upload —
 * the media is still in storage, and re-transcribing a 50-minute recording to
 * fix a recap would be both slow and billable.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 });

  const [transcript] = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.jobId, id))
    .limit(1);

  if (transcript) {
    // The expensive half is done. Re-run analysis only.
    await db
      .update(jobs)
      .set({ status: 'analyzing', failedStage: null, errorMessage: null, updatedAt: new Date() })
      .where(eq(jobs.id, id));

    await runAnalysis(id, { outputType: 'professional_recap', detail: 'standard' });
  } else if (job.transcriptionJobId) {
    // Transcription was submitted; the transcript may already be waiting.
    await db
      .update(jobs)
      .set({ status: 'transcribing', failedStage: null, errorMessage: null, updatedAt: new Date() })
      .where(eq(jobs.id, id));

    await ingestTranscript(id);
  } else if (job.storageUrl) {
    await db
      .update(jobs)
      .set({ status: 'uploaded', failedStage: null, errorMessage: null, updatedAt: new Date() })
      .where(eq(jobs.id, id));

    await startTranscription(id);
  } else {
    return NextResponse.json(
      { error: 'The source media is no longer stored, so this recording cannot be reprocessed.' },
      { status: 409 },
    );
  }

  const payload = await loadJob(id);
  if (!payload) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 });

  return NextResponse.json(payload);
}
