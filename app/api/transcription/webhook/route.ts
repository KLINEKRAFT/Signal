import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { jobs } from '@/lib/db/schema';
import { ingestTranscript } from '@/lib/pipeline';

export const runtime = 'nodejs';
// Ingest plus the analysis pass. Comfortably inside the ceiling — the hour-long
// part happened on the provider's side, not in this function.
export const maxDuration = 300;

/**
 * Transcription provider callback.
 *
 * The provider posts `{ transcript_id, status }` — a notification, not the
 * transcript. We look the job up by the stored provider id and pull the
 * transcript ourselves, so a forged payload cannot inject transcript content.
 */
export async function POST(request: Request) {
  const expected = process.env.TRANSCRIPTION_WEBHOOK_SECRET;
  if (expected) {
    const presented = request.headers.get('x-signal-webhook-secret');
    if (presented !== expected) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
  }

  let body: { transcript_id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const providerJobId = body.transcript_id;
  if (!providerJobId) {
    return NextResponse.json({ error: 'Missing transcript reference.' }, { status: 400 });
  }

  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.transcriptionJobId, providerJobId))
    .limit(1);

  // An unknown id is not an error worth retrying — 200 stops the provider
  // redelivering something we will never recognise.
  if (!job) return NextResponse.json({ ok: true });

  if (body.status === 'error') {
    await db
      .update(jobs)
      .set({
        status: 'failed',
        failedStage: 'transcribing',
        errorMessage:
          'The transcription provider could not process this recording. The media is still stored, so you can retry.',
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id));

    return NextResponse.json({ ok: true });
  }

  await ingestTranscript(job.id);

  return NextResponse.json({ ok: true });
}
