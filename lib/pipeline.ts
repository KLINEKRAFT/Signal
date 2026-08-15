import { and, eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  analyses,
  jobs,
  speakers,
  transcriptSegments,
  transcripts,
  type Job,
} from '@/lib/db/schema';
import { getTranscriptionProvider } from '@/lib/transcription/provider';
import { cleanSegmentText, countWords } from '@/lib/transcription/clean';
import { getSignedMediaUrl } from '@/lib/storage/blob';
import { applyImmediateRetention } from '@/lib/storage/retention';
import { analyzeTranscript } from '@/lib/analysis/provider';
import type { DetailLevel, OutputType } from '@/lib/analysis/prompts';

/**
 * The job state machine.
 *
 * Every transition lives here rather than in route handlers, because the same
 * transitions are reached from three directions — the upload webhook, the
 * transcription webhook, and reconcile-on-read — and they must behave
 * identically from all three.
 *
 * The concurrency rule that makes that safe: a stage is entered by a
 * conditional UPDATE that only succeeds from the expected previous status.
 * Postgres decides who wins, so two callers racing to ingest the same
 * transcript cannot both proceed.
 */

function appUrl(): string | null {
  const url = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null);
  if (!url) return null;
  // A webhook to localhost never arrives; reconcile-on-read covers local dev.
  if (/localhost|127\.0\.0\.1/.test(url)) return null;
  return url.replace(/\/$/, '');
}

/** Claim a transition. Returns the updated job, or null if someone else won. */
async function claim(jobId: string, from: Job['status'], to: Job['status']): Promise<Job | null> {
  const [claimed] = await db
    .update(jobs)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, from)))
    .returning();
  return claimed ?? null;
}

/**
 * Mark a job failed with a message the UI will show.
 *
 * `message` is read by a human in the results screen, so callers pass text
 * written for that reader — never a raw provider or SDK error, which can carry
 * internal configuration detail. Log the underlying error separately.
 */
export async function failJob(jobId: string, stage: string, message: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'failed', failedStage: stage, errorMessage: message, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

function fail(jobId: string, stage: string, error: unknown): Promise<void> {
  return failJob(
    jobId,
    stage,
    error instanceof Error ? error.message : 'Something went wrong during processing.',
  );
}

/**
 * Hand the stored media to the transcription provider.
 *
 * Called from the upload webhook in production and the client's upload
 * confirmation locally. Safe to call twice — the conditional claim means the
 * second call finds nothing to do.
 */
export async function startTranscription(jobId: string): Promise<void> {
  const job = await claim(jobId, 'uploaded', 'transcribing');
  if (!job) return;

  try {
    if (!job.storagePathname && !job.storageUrl) {
      throw new Error('The uploaded media could not be found in storage.');
    }

    const provider = getTranscriptionProvider();

    // Media is private, so the provider gets a short-lived signed URL rather
    // than a public link. Bytes go storage → provider, never through here.
    const mediaUrl = job.storagePathname
      ? await getSignedMediaUrl(job.storagePathname)
      : job.storageUrl!;

    const base = appUrl();
    const secret = process.env.TRANSCRIPTION_WEBHOOK_SECRET;

    const { providerJobId } = await provider.submit({
      mediaUrl,
      webhookUrl: base ? `${base}/api/transcription/webhook` : undefined,
      webhookSecret: base && secret ? secret : undefined,
      vocabulary: job.context?.vocabulary,
      expectedSpeakers: job.context?.speakers?.length,
    });

    await db
      .update(jobs)
      .set({
        transcriptionProvider: provider.name,
        transcriptionJobId: providerJobId,
        transcriptionStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
  } catch (error) {
    await fail(jobId, 'transcribing', error);
  }
}

/**
 * Pull the finished transcript, store it, then analyse it.
 *
 * Claims `transcribing → analyzing` first, so the webhook and a reconciling
 * page load cannot both write the same segments.
 */
export async function ingestTranscript(jobId: string): Promise<void> {
  const job = await claim(jobId, 'transcribing', 'analyzing');
  if (!job) return;

  try {
    if (!job.transcriptionJobId) throw new Error('This recording has no transcription job.');

    const provider = getTranscriptionProvider(job.transcriptionProvider ?? undefined);
    const normalized = await provider.fetchTranscript(job.transcriptionJobId);

    if (!normalized.segments.length) {
      throw new Error(
        'No speech was found in this recording. It may be silent, or the audio track may be empty.',
      );
    }

    // Retry safety: a previous attempt may have written rows before failing.
    await db.delete(transcripts).where(eq(transcripts.jobId, jobId));
    await db.delete(speakers).where(eq(speakers.jobId, jobId));

    // Cleaning happens once, here, so the stored text is the only version —
    // what the user reads, what the model analyses, and what quotes are
    // verified against are then guaranteed to be the same string.
    const cleaned = normalized.segments.map((segment) => ({
      ...segment,
      text: cleanSegmentText(segment.text),
    }));

    const labels = [...new Set(cleaned.map((s) => s.speaker).filter(Boolean))] as string[];

    const speakerRows = labels.length
      ? await db
          .insert(speakers)
          .values(labels.map((providerLabel) => ({ jobId, providerLabel })))
          .returning()
      : [];

    const speakerIdByLabel = new Map(speakerRows.map((s) => [s.providerLabel, s.id]));

    const fullText = cleaned.map((s) => s.text).join(' ');

    const [transcript] = await db
      .insert(transcripts)
      .values({
        jobId,
        cleanedTranscript: fullText,
        language: normalized.language ?? null,
        wordCount: countWords(fullText),
      })
      .returning();

    // Batched because a multi-hour recording can produce thousands of rows and
    // a single statement with that many parameters is rejected.
    const rows = cleaned.map((segment, index) => ({
      transcriptId: transcript.id,
      speakerId: segment.speaker ? (speakerIdByLabel.get(segment.speaker) ?? null) : null,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
      sequence: index,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(transcriptSegments).values(rows.slice(i, i + 500));
    }

    await db
      .update(jobs)
      .set({
        language: normalized.language ?? job.language,
        durationMs: normalized.durationMs ?? job.durationMs,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await runAnalysis(jobId, {
      outputType: defaultOutputType(job),
      detail: 'standard',
      markComplete: true,
    });
  } catch (error) {
    await fail(jobId, 'transcribing', error);
  }
}

/**
 * A podcast recap for something the uploader described as a podcast is a better
 * first guess than a generic one, and the user can change it in one click.
 */
function defaultOutputType(job: Job): OutputType {
  const haystack = `${job.title ?? ''} ${job.context?.description ?? ''}`.toLowerCase();
  if (/\bpodcast|episode\b/.test(haystack)) return 'podcast_recap';
  if (/\bmeeting|standup|stand-up|sync\b/.test(haystack)) return 'meeting_recap';
  if (/\btraining|class|course|lesson|workshop\b/.test(haystack)) return 'training_notes';
  return 'professional_recap';
}

export type AnalysisOptions = {
  outputType: OutputType;
  detail: DetailLevel;
  /** Set when analysis is the last step of first processing rather than a rerun. */
  markComplete?: boolean;
};

/**
 * Generate a recap from the stored transcript.
 *
 * Never touches the media or the transcription provider — changing output type
 * or detail level re-runs only this. That separation is the whole reason
 * transcription and analysis are different stages.
 */
export async function runAnalysis(jobId: string, options: AnalysisOptions): Promise<void> {
  try {
    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.jobId, jobId))
      .limit(1);

    if (!transcript) throw new Error('There is no transcript to analyse yet.');

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) throw new Error('Recording not found.');

    const segmentRows = await db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.transcriptId, transcript.id))
      .orderBy(asc(transcriptSegments.sequence));

    const speakerRows = await db.select().from(speakers).where(eq(speakers.jobId, jobId));
    const byId = new Map(speakerRows.map((s) => [s.id, s]));

    const { result, model, grounding } = await analyzeTranscript({
      segments: segmentRows.map((s) => {
        const speaker = s.speakerId ? byId.get(s.speakerId) : undefined;
        return {
          startMs: s.startMs,
          endMs: s.endMs,
          text: s.text,
          speakerLabel: speaker?.providerLabel ?? null,
          displayName: speaker?.displayName ?? null,
        };
      }),
      outputType: options.outputType,
      detail: options.detail,
      title: job.title,
      durationMs: job.durationMs,
      context: job.context,
      speakers: speakerRows.map((s) => ({
        providerLabel: s.providerLabel,
        displayName: s.displayName,
      })),
    });

    if (grounding.quotesProposed !== grounding.quotesKept) {
      // Worth seeing in logs: a high drop rate means the model is paraphrasing
      // rather than quoting, which is a prompt problem, not a user problem.
      console.info(
        `[analysis] job=${jobId} quotes kept ${grounding.quotesKept}/${grounding.quotesProposed}, timestamps dropped ${grounding.timestampsDropped}`,
      );
    }

    // Previous recaps are kept, not overwritten — regenerating with a different
    // output type should never destroy the one the user already read.
    await db.update(analyses).set({ isCurrent: 0 }).where(eq(analyses.jobId, jobId));

    await db.insert(analyses).values({
      jobId,
      outputType: options.outputType,
      detail: options.detail,
      isCurrent: 1,
      model,
      executiveSummary: result.executiveSummary,
      keyTakeaways: result.keyTakeaways,
      mostImportant: result.mostImportant,
      recommendedActions: result.actions,
      quotes: result.quotes,
      topics: result.topics,
    });

    await db
      .update(jobs)
      .set({
        status: 'complete',
        failedStage: null,
        errorMessage: null,
        title: job.title || result.title,
        completedAt: options.markComplete ? new Date() : job.completedAt,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    // The recap exists now, so the source media has done its job. Under the
    // default policy it goes immediately — see lib/storage/retention.ts.
    if (options.markComplete) await applyImmediateRetention(jobId);
  } catch (error) {
    await fail(jobId, 'analyzing', error);
  }
}

/**
 * Self-healing for a webhook that never arrived.
 *
 * Called on read from the job route. Hobby cron runs once a day, so a scheduled
 * poll is not an option — and this costs one provider request only for jobs
 * that have actually been sitting too long.
 */
export async function reconcile(job: Job): Promise<void> {
  if (job.status !== 'transcribing' || !job.transcriptionJobId) return;

  const provider = getTranscriptionProvider(job.transcriptionProvider ?? undefined);
  const status = await provider.getStatus(job.transcriptionJobId);

  if (status.state === 'completed') {
    await ingestTranscript(job.id);
  } else if (status.state === 'error') {
    await fail(job.id, 'transcribing', new Error(status.errorMessage ?? 'Transcription failed.'));
  }
}
