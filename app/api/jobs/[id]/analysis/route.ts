import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { jobs } from '@/lib/db/schema';
import { loadJob } from '@/lib/db/queries';
import { runAnalysis } from '@/lib/pipeline';
import type { DetailLevel, OutputType } from '@/lib/analysis/prompts';

export const runtime = 'nodejs';
export const maxDuration = 300;

const OUTPUT_TYPES: OutputType[] = [
  'professional_recap',
  'executive_brief',
  'training_notes',
  'meeting_recap',
  'podcast_recap',
];

const DETAILS: DetailLevel[] = ['short', 'standard', 'detailed'];

/**
 * Regenerate the recap from the stored transcript.
 *
 * Never re-transcribes. Changing output type or detail level costs one model
 * call against text we already have, which is why those are separate stages.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 });

  let body: { outputType?: string; detail?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const outputType = OUTPUT_TYPES.includes(body.outputType as OutputType)
    ? (body.outputType as OutputType)
    : 'professional_recap';

  const detail = DETAILS.includes(body.detail as DetailLevel)
    ? (body.detail as DetailLevel)
    : 'standard';

  const hadRecap = Boolean(job.completedAt);

  await db
    .update(jobs)
    .set({ status: 'analyzing', failedStage: null, errorMessage: null, updatedAt: new Date() })
    .where(eq(jobs.id, id));

  await runAnalysis(id, { outputType, detail });

  let payload = await loadJob(id);
  if (!payload) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 });

  if (payload.job.status === 'failed') {
    const message = payload.job.errorMessage ?? 'The recap could not be generated.';

    // A regeneration that fails must not bury a recap the user already has.
    // The previous analysis row is untouched on failure, so the job goes back
    // to complete and the error is surfaced next to the output controls.
    if (hadRecap && payload.analysis) {
      await db
        .update(jobs)
        .set({ status: 'complete', failedStage: null, errorMessage: null, updatedAt: new Date() })
        .where(eq(jobs.id, id));

      payload = (await loadJob(id)) ?? payload;
    }

    return NextResponse.json({ error: message, ...payload }, { status: 502 });
  }

  return NextResponse.json(payload);
}
