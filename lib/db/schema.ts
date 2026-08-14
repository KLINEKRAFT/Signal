import {
  pgTable,
  pgEnum,
  text,
  integer,
  bigint,
  timestamp,
  jsonb,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Six live states plus `failed`. `preparing_media` and `assembling_transcript`
 * from the original brief are gone: AssemblyAI accepts video directly and
 * returns one assembled transcript, so neither stage exists in reality.
 * The UI still renders five stage markers — two just resolve instantly.
 */
export const jobStatus = pgEnum('job_status', [
  'created',
  'uploading',
  'uploaded',
  'transcribing',
  'analyzing',
  'complete',
  'failed',
]);

export const retentionPolicy = pgEnum('retention_policy', [
  'delete_after_processing',
  'hours_24',
  'days_7',
  'days_30',
  'keep',
]);

export const outputType = pgEnum('output_type', [
  'professional_recap',
  'executive_brief',
  'training_notes',
  'meeting_recap',
  'podcast_recap',
]);

export const detailLevel = pgEnum('detail_level', ['short', 'standard', 'detailed']);

/**
 * Optional pre-processing context. `vocabulary` feeds AssemblyAI's word_boost;
 * `speakers` feeds speakers_expected and seeds display names after diarization.
 */
export type RecordingContext = {
  speakers?: { name: string; role?: string }[];
  description?: string;
  vocabulary?: string[];
};

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title'),
    originalFilename: text('original_filename').notNull(),
    mediaType: text('media_type').notNull(), // 'video' | 'audio'
    mimeType: text('mime_type').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    durationMs: integer('duration_ms'),

    status: jobStatus('status').notNull().default('created'),
    failedStage: text('failed_stage'),
    errorMessage: text('error_message'),

    // Blob
    storageUrl: text('storage_url'),
    storagePathname: text('storage_pathname'),
    retention: retentionPolicy('retention').notNull().default('delete_after_processing'),
    mediaDeletedAt: timestamp('media_deleted_at', { withTimezone: true }),

    // Transcription provider
    transcriptionProvider: text('transcription_provider'),
    transcriptionJobId: text('transcription_job_id'),
    language: text('language'),

    // Optional user-supplied context captured before processing
    context: jsonb('context').$type<RecordingContext>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    transcriptionStartedAt: timestamp('transcription_started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('jobs_created_at_idx').on(t.createdAt),
    index('jobs_status_idx').on(t.status),
    uniqueIndex('jobs_transcription_job_id_idx').on(t.transcriptionJobId),
  ],
);

export const transcripts = pgTable('transcripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  // Full text is reconstructable from segments; this is the lightly cleaned
  // version actually shown and sent to the analysis model.
  cleanedTranscript: text('cleaned_transcript'),
  language: text('language'),
  wordCount: integer('word_count'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const speakers = pgTable(
  'speakers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    // Provider identity (SPEAKER_01). Never overwritten by a rename.
    providerLabel: text('provider_label').notNull(),
    displayName: text('display_name'),
  },
  (t) => [uniqueIndex('speakers_job_label_idx').on(t.jobId, t.providerLabel)],
);

export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transcriptId: uuid('transcript_id')
      .notNull()
      .references(() => transcripts.id, { onDelete: 'cascade' }),
    speakerId: uuid('speaker_id').references(() => speakers.id, { onDelete: 'set null' }),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    text: text('text').notNull(),
    sequence: integer('sequence').notNull(),
  },
  (t) => [index('segments_transcript_sequence_idx').on(t.transcriptId, t.sequence)],
);

/**
 * Many analyses per job, not one. Changing output type or detail level writes a
 * new row and flips `isCurrent`, so regenerating never destroys the previous
 * recap and never re-transcribes.
 */
export const analyses = pgTable(
  'analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    outputType: outputType('output_type').notNull().default('professional_recap'),
    detail: detailLevel('detail').notNull().default('standard'),
    isCurrent: integer('is_current').notNull().default(1),

    model: text('model'),
    executiveSummary: jsonb('executive_summary').$type<string[]>(),
    keyTakeaways: jsonb('key_takeaways'),
    mostImportant: jsonb('most_important'),
    recommendedActions: jsonb('recommended_actions'),
    quotes: jsonb('quotes'),
    topics: jsonb('topics').$type<string[]>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('analyses_job_idx').on(t.jobId, t.isCurrent)],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type TranscriptSegment = typeof transcriptSegments.$inferSelect;
export type Speaker = typeof speakers.$inferSelect;
export type Analysis = typeof analyses.$inferSelect;
