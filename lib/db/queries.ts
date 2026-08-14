import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analyses, derivatives, jobs, speakers, transcriptSegments, transcripts } from './schema';
import type { JobPayload } from '@/lib/types';

/** The JSONB columns are untyped at the driver; this is their real shape. */
type Analysis = NonNullable<JobPayload['analysis']>;

/**
 * One place that assembles a complete job. The results page, the polling
 * endpoint, and every export read through this, so they can never disagree
 * about what a recording contains.
 */
export async function loadJob(id: string): Promise<JobPayload | null> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) return null;

  const [transcript] = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.jobId, id))
    .limit(1);

  const speakerRows = await db
    .select()
    .from(speakers)
    .where(eq(speakers.jobId, id))
    .orderBy(asc(speakers.providerLabel));

  const segmentRows = transcript
    ? await db
        .select()
        .from(transcriptSegments)
        .where(eq(transcriptSegments.transcriptId, transcript.id))
        .orderBy(asc(transcriptSegments.sequence))
    : [];

  const derivativeRows = await db
    .select()
    .from(derivatives)
    .where(eq(derivatives.jobId, id));

  const [analysis] = await db
    .select()
    .from(analyses)
    .where(eq(analyses.jobId, id))
    .orderBy(desc(analyses.createdAt))
    .limit(1);

  return {
    job: {
      id: job.id,
      title: job.title,
      originalFilename: job.originalFilename,
      mediaType: job.mediaType,
      mimeType: job.mimeType,
      fileSize: job.fileSize,
      durationMs: job.durationMs,
      status: job.status,
      failedStage: job.failedStage,
      errorMessage: job.errorMessage,
      hasMedia: Boolean(job.storageUrl) && !job.mediaDeletedAt,
      retention: job.retention,
      transcriptionProvider: job.transcriptionProvider,
      transcriptionJobId: job.transcriptionJobId,
      language: job.language,
      context: job.context ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    },
    transcript: transcript
      ? { wordCount: transcript.wordCount, language: transcript.language }
      : null,
    speakers: speakerRows.map((s) => ({
      id: s.id,
      providerLabel: s.providerLabel,
      displayName: s.displayName,
    })),
    segments: segmentRows.map((s) => ({
      id: s.id,
      speakerId: s.speakerId,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
      sequence: s.sequence,
    })),
    derivatives: derivativeRows.map((d) => ({
      kind: d.kind,
      title: d.title,
      body: d.body,
      model: d.model,
      createdAt: d.createdAt.toISOString(),
    })),
    analysis: analysis
      ? {
          id: analysis.id,
          outputType: analysis.outputType,
          detail: analysis.detail,
          model: analysis.model,
          executiveSummary: analysis.executiveSummary ?? [],
          keyTakeaways: (analysis.keyTakeaways ?? []) as Analysis['keyTakeaways'],
          mostImportant: (analysis.mostImportant ?? []) as Analysis['mostImportant'],
          recommendedActions: (analysis.recommendedActions ?? []) as Analysis['recommendedActions'],
          quotes: (analysis.quotes ?? []) as Analysis['quotes'],
          topics: analysis.topics ?? [],
          createdAt: analysis.createdAt.toISOString(),
        }
      : null,
  };
}
