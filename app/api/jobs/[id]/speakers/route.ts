import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { speakers } from '@/lib/db/schema';

export const runtime = 'nodejs';

/**
 * Rename a speaker.
 *
 * Only `displayName` is writable — `providerLabel` (SPEAKER_01) is the identity
 * every segment joins against, so renaming updates the whole transcript at once
 * without touching a single segment row.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { speakerId?: string; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (!body.speakerId) {
    return NextResponse.json({ error: 'Missing speaker reference.' }, { status: 400 });
  }

  const displayName = (body.displayName ?? '').trim().slice(0, 120);

  const [updated] = await db
    .update(speakers)
    .set({ displayName: displayName || null })
    .where(and(eq(speakers.id, body.speakerId), eq(speakers.jobId, id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Speaker not found.' }, { status: 404 });

  return NextResponse.json({
    speaker: {
      id: updated.id,
      providerLabel: updated.providerLabel,
      displayName: updated.displayName,
    },
  });
}
