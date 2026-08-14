import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { jobs } from '@/lib/db/schema';
import { getSignedMediaUrl } from '@/lib/storage/blob';

export const runtime = 'nodejs';

/**
 * Playback for the results screen.
 *
 * Redirects to a short-lived signed URL instead of proxying the file, so a
 * multi-gigabyte recording never streams through a Function. The player follows
 * the redirect and range-requests the storage host directly.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 });

  if (!job.storagePathname || job.mediaDeletedAt) {
    return NextResponse.json(
      { error: 'The source media for this recording is no longer stored.' },
      { status: 410 },
    );
  }

  try {
    // Short expiry: this is a playback session, not a shareable link.
    const url = await getSignedMediaUrl(job.storagePathname, 60 * 60);
    return NextResponse.redirect(url, 307);
  } catch {
    return NextResponse.json({ error: 'Could not open the source media.' }, { status: 500 });
  }
}
