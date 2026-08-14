import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transcriptSegments, transcripts } from '@/lib/db/schema';

export const runtime = 'nodejs';

/**
 * Edit the text of one transcript segment.
 *
 * Timestamps and speaker assignment are not editable here — those come from the
 * provider and are what make quotes and takeaways verifiable. Correcting a
 * misheard word is a different thing from moving when it was said.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { segmentId?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (!body.segmentId || typeof body.text !== 'string') {
    return NextResponse.json({ error: 'Missing segment text.' }, { status: 400 });
  }

  const text = body.text.trim();
  if (!text) {
    return NextResponse.json({ error: 'A segment cannot be empty.' }, { status: 400 });
  }

  const [transcript] = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.jobId, id))
    .limit(1);

  if (!transcript) {
    return NextResponse.json({ error: 'This recording has no transcript.' }, { status: 404 });
  }

  const [segment] = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.id, body.segmentId))
    .limit(1);

  if (!segment || segment.transcriptId !== transcript.id) {
    return NextResponse.json({ error: 'Segment not found.' }, { status: 404 });
  }

  const [updated] = await db
    .update(transcriptSegments)
    .set({ text })
    .where(eq(transcriptSegments.id, body.segmentId))
    .returning();

  // The stored full text is what analysis reads and what quotes verify
  // against, so an edit has to reach it too or the two drift apart.
  const rows = await db
    .select({ text: transcriptSegments.text })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.transcriptId, transcript.id));

  const full = rows.map((r) => r.text).join(' ');

  await db
    .update(transcripts)
    .set({
      cleanedTranscript: full,
      wordCount: full.split(/\s+/).filter(Boolean).length,
      updatedAt: new Date(),
    })
    .where(eq(transcripts.id, transcript.id));

  return NextResponse.json({ segment: { id: updated.id, text: updated.text } });
}
