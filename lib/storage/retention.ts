import { and, isNotNull, isNull, lt, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { jobs, type Job } from '@/lib/db/schema';
import { deleteMedia } from './blob';

/**
 * Source-media retention.
 *
 * Recordings are the expensive, sensitive part of this system; transcripts and
 * recaps are neither. So the default is to delete the media as soon as it has
 * been transcribed, and everything the user actually came for survives in
 * Postgres.
 *
 * Two enforcement points, because they answer different questions:
 * `delete_after_processing` runs inline the moment processing finishes, while
 * the timed policies need a sweep — a daily one is plenty when the shortest
 * window is 24 hours.
 */
export const RETENTION_WINDOWS_MS: Record<string, number | null> = {
  delete_after_processing: 0,
  hours_24: 24 * 60 * 60 * 1000,
  days_7: 7 * 24 * 60 * 60 * 1000,
  days_30: 30 * 24 * 60 * 60 * 1000,
  keep: null,
};

async function forget(job: Pick<Job, 'id' | 'storageUrl'>): Promise<void> {
  if (job.storageUrl) await deleteMedia(job.storageUrl);
  await db
    .update(jobs)
    .set({ mediaDeletedAt: new Date(), updatedAt: new Date() })
    .where(eq(jobs.id, job.id));
}

/** Called at the end of processing. Only acts on `delete_after_processing`. */
export async function applyImmediateRetention(jobId: string): Promise<void> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.retention !== 'delete_after_processing') return;
  if (!job.storageUrl || job.mediaDeletedAt) return;

  try {
    await forget(job);
  } catch (error) {
    // Retention failing must never fail the recap the user is waiting for —
    // the sweep will pick it up.
    console.error(`[retention] could not delete media for job=${jobId}`, error);
  }
}

/**
 * Sweep the timed policies. Returns what it removed so the cron route can
 * report it — a retention job that silently does nothing is indistinguishable
 * from one that is not running.
 */
export async function sweepRetention(): Promise<{ deleted: number; failed: number }> {
  const now = Date.now();
  let deleted = 0;
  let failed = 0;

  for (const [policy, window] of Object.entries(RETENTION_WINDOWS_MS)) {
    if (window == null || window === 0) continue;

    const cutoff = new Date(now - window);

    const due = await db
      .select({ id: jobs.id, storageUrl: jobs.storageUrl })
      .from(jobs)
      .where(
        and(
          eq(jobs.retention, policy as Job['retention']),
          isNull(jobs.mediaDeletedAt),
          isNotNull(jobs.storageUrl),
          lt(jobs.createdAt, cutoff),
        ),
      )
      .limit(200);

    for (const job of due) {
      try {
        await forget(job);
        deleted += 1;
      } catch (error) {
        failed += 1;
        console.error(`[retention] sweep failed for job=${job.id}`, error);
      }
    }
  }

  return { deleted, failed };
}
