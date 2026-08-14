import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { derivatives } from '@/lib/db/schema';
import { loadJob } from '@/lib/db/queries';
import { deriveOutput, DERIVATIVE_KINDS, type DerivativeKind } from '@/lib/analysis/derive';

export const runtime = 'nodejs';
export const maxDuration = 300;

const KINDS = DERIVATIVE_KINDS.map((k) => k.value);

/**
 * Write an email, a social post, or a training handout from the finished recap.
 *
 * Deliberately not part of the processing pipeline: these are on-demand, cost a
 * model call each, and most recordings never need them. Generating one never
 * changes the job's status, so a failure here cannot disturb a completed
 * recording.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { kind?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const kind = body.kind as DerivativeKind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Unknown output type.' }, { status: 400 });
  }

  const payload = await loadJob(id);
  if (!payload) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 });

  if (!payload.analysis) {
    return NextResponse.json(
      { error: 'Generate a recap first — these are written from it.' },
      { status: 409 },
    );
  }

  try {
    const result = await deriveOutput(payload, kind);

    if (result.unverifiedQuotes.length) {
      // Worth seeing: the model reached for quotation marks around words that
      // are not in the transcript, and they were unquoted before storage.
      console.info(
        `[derive] job=${id} kind=${kind} unquoted ${result.unverifiedQuotes.length} unverifiable span(s)`,
      );
    }

    // One row per kind — regenerating replaces. Nobody wants a history of
    // draft emails the way they might want a previous recap.
    await db
      .delete(derivatives)
      .where(and(eq(derivatives.jobId, id), eq(derivatives.kind, kind)));

    await db.insert(derivatives).values({
      jobId: id,
      kind,
      title: result.title || null,
      body: result.body,
      model: result.model,
    });

    const fresh = await loadJob(id);
    return NextResponse.json({
      ...(fresh ?? payload),
      unverifiedQuotes: result.unverifiedQuotes.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'That output could not be generated.',
      },
      { status: 502 },
    );
  }
}
